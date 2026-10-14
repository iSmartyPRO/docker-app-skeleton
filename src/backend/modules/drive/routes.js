import express, { Router } from 'express';
import { requestRegional } from '../../services/regional.js';
import rateLimit from 'express-rate-limit';
import { optionalAuth } from '../../middleware/auth.js';
import { httpError, intId, listSubjects, wrap } from '../shared/acl.js';
import { connectionStatus, driveSettings, forgetCredential, saveCredential } from './credentials.js';
import {
  allLinks,
  countView,
  createLink,
  deleteLink,
  linkPath,
  myLinks,
  myUploads,
  openLink,
  recordUpload,
  releaseQuota,
  reserveQuota,
  unlockLink,
  updateLink,
  visitorError,
  visitorWriteError,
} from './links.js';
import { extAllowed, fileLimitBytes, quotaBytes, requirePerm, visitorName } from './linkPerms.js';
import { noteLinkChange } from './linkNotify.js';
import { cleanName, cleanPath, joinPath, nameOf, parentOf } from './paths.js';
import { activityPeople, audited, clientLeft, exportActivity, listActivity, logActivity } from './activity.js';
import {
  adminOverview,
  deleteServer,
  deleteShare,
  loadServer,
  loadServers,
  reorderShares,
  saveServer,
  saveShare,
  testServer,
} from './servers.js';
import {
  conversionEnabled,
  createFolder,
  deleteEntries,
  driveContext,
  ensureFolders,
  forgetProbes,
  home,
  listFolder,
  listShortcuts,
  moveEntries,
  openTarget,
  removeShortcut,
  renameEntry,
  saveText,
  searchShare,
  sendCad,
  sendEntry,
  sendPreview,
  sendThumb,
  sendZip,
  statEntry,
  touchShortcut,
  uploadInto,
} from './service.js';

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `drive-cred:${req.user?.id || req.ip}`,
  handler: (req, res) => res.status(429).json({ success: false, error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }),
});

const list = (value) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

function requireAdmin(req) {
  if (!req.drive.isAdmin) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
}

function requireAudit(req) {
  if (!req.drive.canAudit) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
}

// What the activity log records about a request (see activity.js).
const shareOf = (req) => (Number.isInteger(Number(req.params.id)) ? Number(req.params.id) : null);
const at = (req, path) => ({ shareId: shareOf(req), path: cleanPath(path) });

/** /api/app/drive — signed-in users. */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.drive = driveContext(req);
    next();
  });

  const target = (req) => openTarget(req.drive, req.params.id);

  router.get('/', wrap(async (req, res) => res.json({ success: true, ...(await home(req.drive)) })));

  // Browsing
  router.get('/shares/:id/list', audited('list', (req) => ({ ...at(req, req.query.path), isDir: true }), async (req, res) => {
    res.json({ success: true, ...(await listFolder(await target(req), req.query.path, { hidden: req.query.hidden === '1' })) });
  }));
  router.get('/shares/:id/stat', wrap(async (req, res) => {
    res.json({ success: true, ...(await statEntry(await target(req), req.query.path, { access: true })) });
  }));
  router.get('/shares/:id/search', audited('search', (req) => ({ ...at(req, req.query.path), isDir: true, details: { q: String(req.query.q || '').slice(0, 200) } }), async (req, res) => {
    res.json({ success: true, ...(await searchShare(await target(req), req.query.path, req.query.q, { hidden: req.query.hidden === '1' })) });
  }));

  // Changes
  const created = (req, entry) => ({ ...at(req, entry?.path || joinPath(cleanPath(req.body?.path), String(req.body?.name || ''))), isDir: true });
  router.post('/shares/:id/folders', audited('mkdir', created, async (req, res) => {
    const entry = await createFolder(await target(req), req.body?.path, req.body?.name);
    res.json({ success: true, entry });
    return entry;
  }));
  // Folder uploads: the whole folder tree in one go (existing folders are reused); files then go up one by one.
  const madeTree = (req, result) => {
    if (result) return result.created.slice(0, 500).map((path) => ({ shareId: shareOf(req), path, isDir: true, details: { folderUpload: true } }));
    let path = '';
    try {
      path = cleanPath(req.body?.path);
    } catch {
      /* an invalid path is the error itself */
    }
    return { shareId: shareOf(req), path, isDir: true, details: { folderUpload: true } };
  };
  router.post('/shares/:id/folders/tree', audited('mkdir', madeTree, async (req, res) => {
    const result = await ensureFolders(await target(req), req.body?.path, req.body?.paths);
    res.json({ success: true, folders: result.folders });
    return result;
  }));
  const renamed = (req, entry) => {
    const path = cleanPath(req.body?.path);
    return { ...at(req, path), toPath: entry?.path || joinPath(parentOf(path), String(req.body?.name || '')), isDir: entry?.dir };
  };
  router.put('/shares/:id/rename', audited('rename', renamed, async (req, res) => {
    const entry = await renameEntry(await target(req), req.body?.path, req.body?.name);
    res.json({ success: true, entry });
    return entry;
  }));
  router.post('/shares/:id/delete', audited('delete', (req) => list(req.body?.paths).slice(0, 500).map((path) => at(req, path)), async (req, res) => {
    res.json({ success: true, ...(await deleteEntries(await target(req), list(req.body?.paths))) });
  }));
  const moved = (req) => {
    const toShareId = req.body?.toShareId ? Number(req.body.toShareId) : shareOf(req);
    const toDir = cleanPath(req.body?.toPath);
    return list(req.body?.paths)
      .slice(0, 500)
      .map((path) => ({ ...at(req, path), action: req.body?.copy ? 'copy' : 'move', toShareId, toPath: joinPath(toDir, nameOf(cleanPath(path))) }));
  };
  router.post('/shares/:id/move', audited('move', moved, async (req, res) => {
    const source = await target(req);
    const destination = req.body?.toShareId && intId(req.body.toShareId) !== source.share.id ? await openTarget(req.drive, req.body.toShareId) : source;
    res.json({ success: true, ...(await moveEntries(source, destination, list(req.body?.paths), req.body?.toPath, { copy: Boolean(req.body?.copy) })) });
  }));
  const uploaded = (req, result) => ({
    ...at(req, result?.entry?.path || joinPath(cleanPath(req.query.path), String(req.query.name || ''))),
    size: result?.entry?.size ?? (Number(req.get('content-length')) || undefined),
    details: result?.replaced ? { replaced: true } : undefined,
  });
  router.put('/shares/:id/upload', audited('upload', uploaded, async (req, res) => {
    const settings = await driveSettings();
    const result = await uploadInto(await target(req), req.query.path, req.query.name, req, {
      conflict: req.query.conflict,
      maxBytes: settings.maxUploadMb * 1024 * 1024,
    });
    res.json({ success: true, ...result });
    return result;
  }));
  const edited = (req, entry) => ({ ...at(req, req.query.path), size: entry?.size });
  router.put('/shares/:id/text', express.text({ type: () => true, limit: '6mb' }), audited('edit', edited, async (req, res) => {
    const entry = await saveText(await target(req), req.query.path, req.body, req.query.mtime);
    res.json({ success: true, entry });
    return entry;
  }));

  // Content
  // Opening a file (whole or in ranges, its PDF preview or drawing) is one "view"; ?download=1 is a download.
  const opened = (req) => ({ ...at(req, req.query.path), action: req.query.download === '1' ? 'download' : 'view' });
  router.get('/shares/:id/file', audited('view', opened, async (req, res) => {
    await sendEntry(req, res, await target(req), req.query.path, { download: req.query.download === '1' });
  }));
  router.get('/shares/:id/thumb', wrap(async (req, res) => sendThumb(res, await target(req), req.query.path, req.query.size)));
  router.get('/shares/:id/preview.pdf', audited('view', opened, async (req, res) => sendPreview(res, await target(req), req.query.path)));
  router.get('/shares/:id/cad', audited('view', opened, async (req, res) => sendCad(req, res, await target(req), req.query.path)));
  const zipped = (req) => {
    const paths = list(req.query.p).map(cleanPath);
    const items = paths.length ? paths : [cleanPath(req.query.path)];
    return { ...at(req, items.length === 1 ? items[0] : parentOf(items[0])), isDir: items.length > 1 || undefined, count: items.length, details: items.length > 1 ? { items: items.slice(0, 50) } : undefined };
  };
  router.get('/shares/:id/zip', audited('download_zip', zipped, async (req, res) => {
    const paths = list(req.query.p);
    await sendZip(req, res, await target(req), paths.length ? paths : [req.query.path || '']);
  }));

  // Shortcuts
  for (const kind of ['recent', 'favorites']) {
    router.get(`/${kind}`, wrap(async (req, res) => res.json({ success: true, items: await listShortcuts(kind, req.drive) })));
    router.post(`/${kind}`, wrap(async (req, res) => {
      await touchShortcut(kind, req.drive, await openTarget(req.drive, req.body?.shareId), req.body?.path, { dir: Boolean(req.body?.dir), size: req.body?.size });
      res.json({ success: true });
    }));
    router.delete(`/${kind}`, wrap(async (req, res) => {
      await removeShortcut(kind, req.drive, req.query.shareId, req.query.path);
      res.json({ success: true });
    }));
  }

  // The person's own connections to servers
  router.get('/connections', wrap(async (req, res) => {
    res.json({ success: true, connections: await connectionStatus(req.drive.userId, await loadServers()) });
  }));
  const connection = (req) => ({ details: { serverId: Number(req.params.serverId) || null, account: req.body?.username ? String(req.body.username).slice(0, 120) : undefined } });
  router.put('/connections/:serverId', credentialLimiter, audited('connect', connection, async (req, res) => {
    const server = await loadServer(req.params.serverId);
    await saveCredential(req.drive.userId, server, req.body || {});
    forgetProbes(req.drive.userId);
    res.json({ success: true, connections: await connectionStatus(req.drive.userId, await loadServers()) });
  }));
  router.delete('/connections/:serverId', audited('disconnect', connection, async (req, res) => {
    await forgetCredential(req.drive.userId, intId(req.params.serverId));
    forgetProbes(req.drive.userId);
    res.json({ success: true, connections: await connectionStatus(req.drive.userId, await loadServers()) });
  }));

  // Links
  router.get('/links', wrap(async (req, res) => {
    res.json({ success: true, links: await myLinks(req.drive, { shareId: req.query.shareId, path: req.query.path }) });
  }));
  const linkEvent = (req, link) => ({
    shareId: link?.shareId ?? link?.share_id ?? shareOf(req),
    path: link?.path ?? cleanPath(req.body?.path),
    linkId: link?.id ?? (Number(req.params.id) || undefined),
    details: {
      audience: req.body?.audience,
      password: req.body?.password !== undefined ? Boolean(req.body.password) : undefined,
      expiresAt: req.body?.expiresAt,
      allowDownload: req.body?.allowDownload,
      permissions: Array.isArray(req.body?.permissions) ? req.body.permissions.slice(0, 10) : undefined,
      revoked: req.body?.revoked,
    },
  });
  router.post('/shares/:id/links', audited('link_create', linkEvent, async (req, res) => {
    const link = await createLink(req.drive, req.params.id, req.body?.path, req.body || {});
    res.json({ success: true, link });
    return link;
  }));
  router.put('/links/:id', audited('link_update', (req, link) => ({ ...linkEvent(req, link), shareId: link?.shareId ?? null }), async (req, res) => {
    const link = await updateLink(req.drive, req.params.id, req.body || {});
    res.json({ success: true, link });
    return link;
  }));
  router.delete('/links/:id', audited('link_delete', (req, row) => ({ shareId: row?.share_id ?? null, path: row?.path ?? '', linkId: Number(req.params.id) || undefined }), async (req, res) => {
    const row = await deleteLink(req.drive, req.params.id);
    res.json({ success: true });
    return row;
  }));

  // Administration (drive.admin)
  router.get('/admin', wrap(async (req, res) => {
    requireAdmin(req);
    const subjects = await listSubjects();
    res.json({ success: true, ...(await adminOverview()), groups: subjects.groups });
  }));
  router.get('/admin/links', wrap(async (req, res) => {
    requireAdmin(req);
    res.json({ success: true, links: await allLinks() });
  }));
  router.post('/admin/test', wrap(async (req, res) => {
    requireAdmin(req);
    res.json({ success: true, ...(await testServer(req.drive.userId, req.body || {})) });
  }));
  const serverEvent = (req, server) => ({ details: { serverId: server?.id ?? (Number(req.params.id) || undefined), name: server?.name ?? req.body?.name, host: server?.host ?? req.body?.host } });
  router.post('/admin/servers', audited('server_save', serverEvent, async (req, res) => {
    requireAdmin(req);
    const server = await saveServer(req.body || {});
    res.json({ success: true, server });
    return server;
  }));
  router.put('/admin/servers/:id', audited('server_save', serverEvent, async (req, res) => {
    requireAdmin(req);
    const server = await saveServer(req.body || {}, req.params.id);
    res.json({ success: true, server });
    return server;
  }));
  router.delete('/admin/servers/:id', audited('server_delete', serverEvent, async (req, res) => {
    requireAdmin(req);
    const server = await loadServer(req.params.id).catch(() => null);
    await deleteServer(req.params.id);
    res.json({ success: true });
    return server;
  }));
  const shareEvent = (req, share) => ({
    shareId: share?.id ?? (Number(req.params.id) || null),
    details: { title: share?.title ?? req.body?.title, share: share?.share ?? req.body?.share, rootPath: share?.rootPath ?? req.body?.rootPath, groups: req.body?.groupIds },
  });
  router.post('/admin/servers/:id/shares', audited('share_save', (req, share) => ({ ...shareEvent(req, share), shareId: share?.id ?? null }), async (req, res) => {
    requireAdmin(req);
    const share = await saveShare(req.params.id, req.body || {});
    res.json({ success: true, share });
    return share;
  }));
  router.put('/admin/servers/:serverId/shares/:id', audited('share_save', shareEvent, async (req, res) => {
    requireAdmin(req);
    const share = await saveShare(req.params.serverId, req.body || {}, req.params.id);
    res.json({ success: true, share });
    return share;
  }));
  router.delete('/admin/shares/:id', audited('share_delete', shareEvent, async (req, res) => {
    requireAdmin(req);
    await deleteShare(req.params.id);
    res.json({ success: true });
  }));

  // Activity log (drive.audit)
  router.get('/admin/activity', wrap(async (req, res) => {
    requireAudit(req);
    res.json({ success: true, ...(await listActivity(req.query)) });
  }));
  router.get('/admin/activity/people', wrap(async (req, res) => {
    requireAudit(req);
    res.json({ success: true, people: await activityPeople(req.query.q) });
  }));
  router.get('/admin/activity/export.csv', wrap(async (req, res) => {
    requireAudit(req);
    await exportActivity(res, req.query, (await requestRegional(req)).timeZone);
  }));
  router.put('/admin/order', wrap(async (req, res) => {
    requireAdmin(req);
    await reorderShares(req.body?.ids || []);
    res.json({ success: true });
  }));

  return router;
}

// ── Public links: /api/d/<token> ────────────────────────────────────────────

const limitAnswer = (req, res) => res.status(429).json({ success: false, error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' });

// Only wrong passwords count: opening a visitor session (or adding one's name) is routine.
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${req.params.token}`,
  handler: limitAnswer,
});

// Writes through links: per visitor address and link, and per link from everywhere.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `drive-up:${req.ip}:${req.params.token}`,
  handler: limitAnswer,
});
const changeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `drive-change:${req.ip}:${req.params.token}`,
  handler: limitAnswer,
});
const linkWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3000,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => `drive-link:${req.params.token}`,
  handler: limitAnswer,
});

const visitorToken = (req) => req.get('x-link-token') || req.query.t || '';

// Steps of the normal flow, not worth a row: the page then asks for the password or a sign-in.
const LINK_FLOW = new Set(['PASSWORD_REQUIRED', 'SIGN_IN_REQUIRED', 'SESSION_REQUIRED', 'VISITOR_REQUIRED']);
const SMB_CODES = ['ACCESS_DENIED', 'NOT_FOUND', 'SHARE_NOT_FOUND', 'CREDENTIALS_FAILED', 'CREDENTIALS_REQUIRED', 'SERVICE_AUTH_FAILED', 'SERVER_UNREACHABLE', 'GATEWAY_DOWN'];

/** Who did it, for the activity log: the visitor's name and the link. */
const visitorDetails = (opened) =>
  opened
    ? {
        visitor: opened.visitor?.name || undefined,
        visitorEmail: opened.visitor?.email || undefined,
        link: opened.link.title || opened.link.name,
      }
    : {};

/**
 * Runs a visitor request; any refusal is answered with its code (and details)
 * for the public page. `audit(req, opened, result)` describes the event for
 * the activity log (`opened` is null when the link itself was refused,
 * `result` is what the handler returned). Write requests (`write: true`)
 * report file-server refusals as messages, not as a closed link.
 */
function visit(handler, audit, { write = false } = {}) {
  return async (req, res, next) => {
    let opened = null;
    const log = (result, extra) => {
      let events;
      try {
        events = audit?.(req, opened, result);
      } catch {
        return; // a malformed path: the refusal itself is answered below
      }
      for (const event of [].concat(events || [])) {
        logActivity(req, {
          via: 'link',
          linkId: opened?.link?.id,
          shareId: opened?.link?.share_id,
          ...event,
          ...extra,
          details: {
            ...visitorDetails(opened),
            ...(event.details || {}),
            ...(opened ? {} : { token: String(req.params.token).slice(0, 8) }),
            ...(extra?.details || {}),
          },
        });
      }
    };
    try {
      opened = await openLink(req.params.token, visitorToken(req), req.user || null);
      const result = await handler(req, res, opened);
      log(result);
    } catch (raw) {
      if (clientLeft(req, res, raw)) log(null);
      else if (!LINK_FLOW.has(raw?.code)) log(null, { ok: false, code: raw?.code || 'ERROR', details: { error: String(raw?.message || '').slice(0, 300) } });
      const smb = raw.smb || SMB_CODES.includes(raw.code);
      const err = smb ? (write ? visitorWriteError(raw) : visitorError(raw)) : raw;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = err.statusCode || 500;
      if (status >= 500 && status !== 503) return next(err);
      res.status(status).json({ success: false, code: err.code, error: err.message, info: err.details });
    }
  };
}

/**
 * The visitor session a change needs. It must come in the X-Link-Token header
 * (never the address), which a page on another site cannot set: with the
 * Origin check in server.js this keeps forged cross-site requests out.
 */
function writer(req, { link, visitor }) {
  if (!req.get('x-link-token') || !visitor?.sid) throw httpError(401, 'Open the link again to continue', 'SESSION_REQUIRED');
  if ((link.require_name && !visitor.name) || (link.require_email && !visitor.email)) {
    throw httpError(401, 'Please introduce yourself first', 'VISITOR_REQUIRED');
  }
  return visitor;
}

/** A sub-path a visitor writes to: no hidden or temporary names on the way. */
function writablePath(link, sub) {
  const rel = cleanPath(sub);
  for (const part of rel ? rel.split('/') : []) visitorName(part);
  return linkPath(link, rel);
}

/** An existing, visible item inside the link (not its root) that a visitor changes. */
async function visibleItem(target, link, sub, { allowRoot = false } = {}) {
  const rel = cleanPath(sub);
  if (!rel && !(allowRoot && link.kind === 'file')) throw httpError(400, 'The shared item itself cannot be changed here', 'INVALID_PATH');
  const full = linkPath(link, rel);
  const { entry } = await statEntry(target, full);
  if (entry.hidden || nameOf(full).startsWith('~$')) throw httpError(404, 'This item was moved or deleted', 'ITEM_GONE');
  return { rel, full, entry };
}

const strip = (link, path) => (link.path ? path.slice(link.path.length + 1) : path);

/** Streams one file into the file server for a visitor, inside the link's limits. */
async function visitorUpload(req, opened, folder, name, { conflict, renameFrom, extCheck = true }) {
  const { link, target, settings } = opened;
  const visitor = writer(req, opened);
  const fileName = visitorName(cleanName(name));
  if (extCheck && !extAllowed(fileName, link.allowed_exts)) {
    const error = httpError(415, 'This file type is not accepted here', 'EXT_NOT_ALLOWED');
    error.details = { allowed: link.allowed_exts };
    throw error;
  }
  const length = Number(req.headers['content-length']);
  if (!Number.isFinite(length) || length < 0) throw httpError(411, 'Content-Length is required', 'LENGTH_REQUIRED');
  const maxBytes = fileLimitBytes(link, settings);
  if (length > maxBytes) {
    const error = httpError(413, 'The file is too large', 'FILE_TOO_LARGE');
    error.details = { maxMb: Math.round(maxBytes / 1048576) };
    throw error;
  }
  // Every upload counts towards the link's total (reserved first, so parallel uploads cannot overshoot a quota).
  if (!(await reserveQuota(link, length))) {
    const error = httpError(413, 'The upload limit of this link is reached', 'LINK_QUOTA_EXCEEDED');
    error.details = { quotaMb: link.quota_mb };
    throw error;
  }
  let result;
  try {
    result = await uploadInto(target, folder, fileName, req, { conflict, renameFrom, maxBytes });
  } catch (err) {
    await releaseQuota(link, length).catch(() => {});
    throw err;
  }
  await recordUpload(link, visitor, { path: result.entry.path, name: result.entry.name, size: result.entry.size, ip: req.ip }).catch((err) => console.warn('[drive] upload record failed:', err.message));
  noteLinkChange(link, visitor, { action: result.replaced ? 'replace' : 'upload', name: result.entry.name });
  return result;
}

const uploadEvent = (req, opened, result) => ({
  action: 'upload',
  path: result?.entry?.path || (opened ? joinPath(linkPath(opened.link, req.query.path), String(req.query.name || '')) : ''),
  size: result?.entry?.size ?? (Number(req.get('content-length')) || undefined),
  details: result?.replaced ? { replaced: true } : undefined,
});

export function publicRoutes() {
  const router = Router();
  router.use(optionalAuth);

  // Visitor session: { password?, name?, email? } → { token, visitor }.
  router.post('/:token/unlock', unlockLimiter, wrap(async (req, res) => {
    try {
      res.json({ success: true, ...(await unlockLink(req.params.token, req.body || {}, req.get('x-link-token') || '')) });
    } catch (err) {
      if (err?.code === 'WRONG_PASSWORD') logActivity(req, { action: 'link_password_failed', via: 'link', ok: false, code: err.code, details: { token: String(req.params.token).slice(0, 8) } });
      throw err;
    }
  }));

  router.get('/:token', visit(async (req, res, { link, target, audience, perms, visitor, settings }) => {
    const canView = perms.includes('view');
    const sub = canView ? cleanPath(req.query.path) : '';
    if (!sub) await countView(link);
    const quota = quotaBytes(link);
    const base = {
      link: {
        kind: link.kind,
        name: link.name,
        title: link.title || null,
        note: link.note || null,
        permissions: perms,
        allowDownload: perms.includes('download'),
        expiresAt: link.expires_at,
        audience,
        owner: link.owner_name,
        hasPassword: Boolean(link.password_hash),
        requireName: Boolean(link.require_name || link.require_email),
        requireEmail: Boolean(link.require_email),
        limits: {
          maxFileMb: Math.round(fileLimitBytes(link, settings) / 1048576),
          allowedExts: link.allowed_exts || [],
          quotaLeft: quota === null ? null : Math.max(0, quota - Number(link.uploaded_bytes || 0)),
        },
      },
      visitor: visitor ? { name: visitor.name, email: visitor.email } : null,
      conversion: await conversionEnabled(),
    };
    if (!canView) {
      // A file request: the folder's contents stay private.
      res.json({ success: true, ...base, uploadOnly: true, path: '', crumbs: [], name: link.title || link.name, entries: [] });
      return;
    }
    if (link.kind === 'file') {
      const { entry } = await statEntry(target, link.path);
      res.json({ success: true, ...base, entry: { ...entry, path: '' } });
      return;
    }
    const folder = await listFolder(target, linkPath(link, sub));
    res.json({
      success: true,
      ...base,
      path: sub,
      crumbs: sub ? sub.split('/').map((name, index, parts) => ({ name, path: parts.slice(0, index + 1).join('/') })) : [],
      name: sub ? nameOf(sub) : link.name,
      entries: folder.entries.map((entry) => ({ ...entry, path: strip(link, entry.path) })),
    });
  }, (req, opened) => {
    const sub = opened?.perms?.includes('view') ? cleanPath(req.query.path) : '';
    // The link itself counts as "opened"; folders inside it as listings.
    if (!opened) return { action: 'link_open' };
    return { action: sub ? 'list' : 'link_open', path: linkPath(opened.link, sub), isDir: opened.link.kind !== 'file' || undefined };
  }));

  // What this visitor uploaded in this browser session (file requests show only this).
  router.get('/:token/mine', visit(async (req, res, opened) => {
    res.json({ success: true, uploads: await myUploads(opened.link, opened.visitor) });
  }));

  const contentEvent = (req, opened) => ({
    action: req.query.download === '1' ? 'download' : 'view',
    path: opened ? linkPath(opened.link, req.query.path) : '',
  });
  const content = (send, audit) =>
    visit(async (req, res, { link, target, perms }) => {
      const download = req.query.download === '1';
      requirePerm(perms, 'view');
      if (download && !perms.includes('download')) throw httpError(403, 'Downloads are disabled for this link', 'NO_DOWNLOAD');
      await send(req, res, target, linkPath(link, req.query.path), link, download);
    }, audit);

  router.get('/:token/file', content((req, res, target, path, link, download) => sendEntry(req, res, target, path, { download }), contentEvent));
  router.get('/:token/thumb', content((req, res, target, path) => sendThumb(res, target, path, req.query.size)));
  router.get('/:token/preview.pdf', content((req, res, target, path) => sendPreview(res, target, path), contentEvent));
  router.get('/:token/cad', content((req, res, target, path) => sendCad(req, res, target, path), contentEvent));
  router.get('/:token/zip', visit(async (req, res, { link, target, perms }) => {
    if (!perms.includes('download')) throw httpError(403, 'Downloads are disabled for this link', 'NO_DOWNLOAD');
    await sendZip(req, res, target, [linkPath(link, req.query.path)], link.kind === 'dir' && !cleanPath(req.query.path) ? link.name : null);
  }, (req, opened) => ({ action: 'download_zip', path: opened ? linkPath(opened.link, req.query.path) : '', isDir: true })));

  // ── Changes through a link (with the author's file-server account) ──

  // New file into a folder of the link. Visitors who cannot see the folder
  // never overwrite and never learn what is there: a clash becomes "name (1)".
  router.put('/:token/upload', uploadLimiter, linkWriteLimiter, visit(async (req, res, opened) => {
    const { link, perms } = opened;
    requirePerm(perms, 'upload');
    const folder = writablePath(link, perms.includes('view') ? req.query.path : '');
    let conflict = 'rename';
    if (perms.includes('view')) {
      const asked = String(req.query.conflict || 'fail');
      if (asked === 'replace') {
        requirePerm(perms, 'replace');
        conflict = 'replace';
      } else conflict = asked === 'rename' ? 'rename' : 'fail';
    }
    const result = await visitorUpload(req, opened, folder, req.query.name, { conflict, renameFrom: 1 });
    res.json({ success: true, replaced: Boolean(result.replaced), entry: { ...result.entry, path: strip(link, result.entry.path) } });
    return result;
  }, uploadEvent, { write: true }));

  // A new version of an existing file (the shared file itself for a file link).
  router.put('/:token/replace', uploadLimiter, linkWriteLimiter, visit(async (req, res, opened) => {
    const { link, target, perms } = opened;
    requirePerm(perms, 'replace');
    const { full, entry } = await visibleItem(target, link, req.query.path, { allowRoot: true });
    if (entry.dir) throw httpError(400, 'A folder cannot be replaced', 'IS_A_FOLDER');
    const result = await visitorUpload(req, opened, parentOf(full), nameOf(full), { conflict: 'replace', extCheck: false });
    res.json({ success: true, replaced: true, entry: { ...result.entry, path: link.kind === 'file' ? '' : strip(link, result.entry.path) } });
    return result;
  }, (req, opened, result) => ({
    action: 'upload',
    path: result?.entry?.path || (opened ? linkPath(opened.link, req.query.path) : ''),
    size: result?.entry?.size ?? (Number(req.get('content-length')) || undefined),
    details: { replaced: true },
  }), { write: true }));

  router.post('/:token/folders', changeLimiter, linkWriteLimiter, visit(async (req, res, opened) => {
    const { link, target, perms } = opened;
    requirePerm(perms, 'mkdir');
    const visitor = writer(req, opened);
    const parent = writablePath(link, perms.includes('view') ? req.body?.path : '');
    const entry = await createFolder(target, parent, visitorName(cleanName(req.body?.name)));
    noteLinkChange(link, visitor, { action: 'mkdir', name: entry.name });
    res.json({ success: true, entry: { ...entry, path: strip(link, entry.path) } });
    return entry;
  }, (req, opened, entry) => ({ action: 'mkdir', isDir: true, path: entry?.path || '' }), { write: true }));

  // Folder uploads: the folders first (existing ones are reused), then each file.
  router.post('/:token/folders/tree', changeLimiter, linkWriteLimiter, visit(async (req, res, opened) => {
    const { link, target, perms } = opened;
    requirePerm(perms, 'mkdir');
    requirePerm(perms, 'upload');
    const visitor = writer(req, opened);
    const base = writablePath(link, perms.includes('view') ? req.body?.path : '');
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
    for (const path of paths) for (const part of String(path).split(/[\\/]/).filter(Boolean)) visitorName(part);
    const result = await ensureFolders(target, base, paths);
    for (const path of result.created.slice(0, 50)) noteLinkChange(link, visitor, { action: 'mkdir', name: nameOf(path) });
    res.json({ success: true, folders: result.folders.map((item) => ({ ...item, path: strip(link, item.path) })) });
    return result;
  }, (req, opened, result) => (result ? result.created.slice(0, 500).map((path) => ({ action: 'mkdir', path, isDir: true, details: { folderUpload: true } })) : { action: 'mkdir', isDir: true, details: { folderUpload: true } }), { write: true }));

  router.put('/:token/rename', changeLimiter, linkWriteLimiter, visit(async (req, res, opened) => {
    const { link, target, perms } = opened;
    requirePerm(perms, 'rename');
    const visitor = writer(req, opened);
    const { full } = await visibleItem(target, link, req.body?.path);
    const entry = await renameEntry(target, full, visitorName(cleanName(req.body?.name)));
    noteLinkChange(link, visitor, { action: 'rename', name: entry.name });
    res.json({ success: true, entry: { ...entry, path: strip(link, entry.path) } });
    return { from: full, entry };
  }, (req, opened, result) => ({ action: 'rename', path: result?.from || '', toPath: result?.entry?.path, isDir: result?.entry?.dir }), { write: true }));

  // Deleting cannot be undone (file servers have no recycle bin): the link must allow it explicitly.
  router.post('/:token/delete', changeLimiter, linkWriteLimiter, visit(async (req, res, opened) => {
    const { link, target, perms } = opened;
    requirePerm(perms, 'delete');
    const visitor = writer(req, opened);
    const list = Array.isArray(req.body?.paths) ? req.body.paths : [req.body?.paths];
    if (!list.length || list.length > 100) throw httpError(400, 'Choose up to 100 items', 'INVALID_PATH');
    const items = [];
    for (const sub of list) items.push(await visibleItem(target, link, sub));
    const result = await deleteEntries(target, items.map((item) => item.full));
    for (const item of items) noteLinkChange(link, visitor, { action: 'delete', name: item.entry.name });
    res.json({ success: true, ...result });
    return items;
  }, (req, opened, items) => (items ? items.map((item) => ({ action: 'delete', path: item.full, isDir: item.entry.dir, size: item.entry.dir ? undefined : item.entry.size })) : { action: 'delete', path: '' }), { write: true }));

  return router;
}
