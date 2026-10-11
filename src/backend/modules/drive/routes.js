import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { optionalAuth } from '../../middleware/auth.js';
import { httpError, intId, listSubjects, wrap } from '../shared/acl.js';
import { connectionStatus, driveSettings, forgetCredential, saveCredential } from './credentials.js';
import { allLinks, countView, createLink, deleteLink, linkPath, myLinks, openLink, unlockLink, updateLink, visitorError } from './links.js';
import { cleanPath, joinPath, nameOf, parentOf } from './paths.js';
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
    await exportActivity(res, req.query);
  }));
  router.put('/admin/order', wrap(async (req, res) => {
    requireAdmin(req);
    await reorderShares(req.body?.ids || []);
    res.json({ success: true });
  }));

  return router;
}

// ── Public links: /api/d/<token> ────────────────────────────────────────────

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.params.token}`,
  handler: (req, res) => res.status(429).json({ success: false, error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }),
});

const visitorToken = (req) => req.get('x-link-token') || req.query.t || '';

// Steps of the normal flow, not worth a row: the page then asks for the password or a sign-in.
const LINK_FLOW = new Set(['PASSWORD_REQUIRED', 'SIGN_IN_REQUIRED']);

/**
 * Runs a visitor request; any refusal is answered with its code (and details)
 * for the public page. `audit(req, opened)` describes the event for the
 * activity log (`opened` is null when the link itself was refused).
 */
function visit(handler, audit) {
  return async (req, res, next) => {
    let opened = null;
    const log = (extra) => {
      const event = audit?.(req, opened);
      if (!event) return;
      logActivity(req, {
        via: 'link',
        linkId: opened?.link?.id,
        shareId: opened?.link?.share_id,
        ...event,
        ...extra,
        details: { ...(event.details || {}), ...(opened ? {} : { token: String(req.params.token).slice(0, 8) }), ...(extra?.details || {}) },
      });
    };
    try {
      opened = await openLink(req.params.token, visitorToken(req), req.user || null);
      await handler(req, res, opened);
      log();
    } catch (raw) {
      if (clientLeft(req, res, raw)) log();
      else if (!LINK_FLOW.has(raw?.code)) log({ ok: false, code: raw?.code || 'ERROR', details: { error: String(raw?.message || '').slice(0, 300) } });
      const err = raw.smb || ['ACCESS_DENIED', 'NOT_FOUND', 'SHARE_NOT_FOUND', 'CREDENTIALS_FAILED', 'SERVER_UNREACHABLE'].includes(raw.code) ? visitorError(raw) : raw;
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

export function publicRoutes() {
  const router = Router();
  router.use(optionalAuth);

  router.post('/:token/unlock', unlockLimiter, wrap(async (req, res) => {
    try {
      res.json({ success: true, ...(await unlockLink(req.params.token, req.body?.password)) });
    } catch (err) {
      if (err?.code === 'WRONG_PASSWORD') logActivity(req, { action: 'link_password_failed', via: 'link', ok: false, code: err.code, details: { token: String(req.params.token).slice(0, 8) } });
      throw err;
    }
  }));

  router.get('/:token', visit(async (req, res, { link, target, audience }) => {
    const sub = cleanPath(req.query.path);
    if (!sub) await countView(link);
    const base = {
      link: {
        kind: link.kind,
        name: link.name,
        allowDownload: link.allow_download,
        expiresAt: link.expires_at,
        audience,
        owner: link.owner_name,
      },
      conversion: await conversionEnabled(),
    };
    if (link.kind === 'file') {
      const { entry } = await statEntry(target, link.path);
      res.json({ success: true, ...base, entry: { ...entry, path: '' } });
      return;
    }
    const folder = await listFolder(target, linkPath(link, sub));
    const strip = (path) => (link.path ? path.slice(link.path.length + 1) : path);
    res.json({
      success: true,
      ...base,
      path: sub,
      crumbs: sub ? sub.split('/').map((name, index, parts) => ({ name, path: parts.slice(0, index + 1).join('/') })) : [],
      name: sub ? nameOf(sub) : link.name,
      entries: folder.entries.map((entry) => ({ ...entry, path: strip(entry.path) })),
    });
  }, (req, opened) => {
    const sub = cleanPath(req.query.path);
    // The link itself counts as "opened"; folders inside it as listings.
    if (!opened) return { action: 'link_open' };
    return { action: sub ? 'list' : 'link_open', path: linkPath(opened.link, sub), isDir: opened.link.kind !== 'file' || undefined };
  }));

  const contentEvent = (req, opened) => ({
    action: req.query.download === '1' ? 'download' : 'view',
    path: opened ? linkPath(opened.link, req.query.path) : '',
  });
  const content = (send, audit) =>
    visit(async (req, res, { link, target }) => {
      const download = req.query.download === '1';
      if (download && !link.allow_download) throw httpError(403, 'Downloads are disabled for this link', 'NO_DOWNLOAD');
      await send(req, res, target, linkPath(link, req.query.path), link, download);
    }, audit);

  router.get('/:token/file', content((req, res, target, path, link, download) => sendEntry(req, res, target, path, { download }), contentEvent));
  router.get('/:token/thumb', content((req, res, target, path) => sendThumb(res, target, path, req.query.size)));
  router.get('/:token/preview.pdf', content((req, res, target, path) => sendPreview(res, target, path), contentEvent));
  router.get('/:token/cad', content((req, res, target, path) => sendCad(req, res, target, path), contentEvent));
  router.get('/:token/zip', visit(async (req, res, { link, target }) => {
    if (!link.allow_download) throw httpError(403, 'Downloads are disabled for this link', 'NO_DOWNLOAD');
    await sendZip(req, res, target, [linkPath(link, req.query.path)], link.kind === 'dir' && !cleanPath(req.query.path) ? link.name : null);
  }, (req, opened) => ({ action: 'download_zip', path: opened ? linkPath(opened.link, req.query.path) : '', isDir: true })));

  return router;
}
