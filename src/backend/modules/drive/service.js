import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { query } from '../../config/database.js';
import { getUserAccess } from '../../services/rbac.js';
import { hasPermission } from '../../services/permissions.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { httpError, intId } from '../shared/acl.js';
import { CONVERTIBLE, INLINE, extOf, mimeOf, officePreview, previewDir } from '../shared/storage.js';
import { connectionStatus, credentialFor, driveSettings, isAuthFailure, parkCredential, serverParams } from './credentials.js';
import { gateCall, gateReadAll, gateRequest } from './gate.js';
import { cleanName, cleanPath, joinPath, nameOf, parentOf, relativeTo } from './paths.js';

/*
 * Everything a signed-in person does on the drive. A "target" is one folder
 * entry on one server opened with one credential:
 *   { share, server, resolved: { cred, row, source } }
 * Paths handed to the client are relative to the entry's root (share.root_path).
 */

// ── Context ─────────────────────────────────────────────────────────────────

export function driveContext(req) {
  const access = req.access || {};
  return {
    userId: req.user?.id || null,
    groupIds: new Set(access.groupIds || []),
    isAdmin: hasPermission(access.permissions || [], 'drive.admin'),
    canAudit: hasPermission(access.permissions || [], 'drive.audit'),
  };
}

export async function contextForUser(userId) {
  const access = await getUserAccess(userId);
  return { userId, groupIds: new Set(access.groupIds || []), isAdmin: hasPermission(access.permissions || [], 'drive.admin') };
}

export async function conversionEnabled() {
  const documents = parseSettings(await getSettings()).integrations.documents;
  return Boolean(documents?.enabled && documents?.serverUrl);
}

function canSee(ctx, share) {
  const groups = share.group_ids || [];
  return ctx.isAdmin || !groups.length || groups.some((id) => ctx.groupIds.has(id));
}

async function sharesWithServers() {
  const { rows } = await query(
    `SELECT sh.*, s.id AS s_id, s.name AS s_name, s.host AS s_host, s.port AS s_port, s.domain AS s_domain, s.auth AS s_auth,
            s.use_login AS s_use_login, s.service_user AS s_service_user, s.service_secret AS s_service_secret,
            s.encrypt AS s_encrypt, s.sort AS s_sort
     FROM drive_shares sh JOIN drive_servers s ON s.id = sh.server_id
     ORDER BY sh.sort, sh.id`
  );
  return rows.map((row) => ({
    share: row,
    server: {
      id: row.s_id,
      name: row.s_name,
      host: row.s_host,
      port: row.s_port,
      domain: row.s_domain,
      auth: row.s_auth,
      use_login: row.s_use_login,
      service_user: row.s_service_user,
      service_secret: row.s_service_secret,
      encrypt: row.s_encrypt,
    },
  }));
}

export function uncOf(share, server, rel = '') {
  const tail = rel ? `\\${rel.replace(/\//g, '\\')}` : '';
  if (share.unc_display) return `${share.unc_display.replace(/[\\/]+$/, '')}${tail}`;
  const root = share.root_path ? `\\${share.root_path.replace(/\//g, '\\')}` : '';
  return `\\\\${server.host}\\${share.share}${root}${tail}`;
}

export function publicShare(share, server) {
  return {
    id: share.id,
    title: share.title,
    description: share.description || '',
    color: share.color,
    serverId: server.id,
    serverName: server.name,
    unc: uncOf(share, server),
    allowLinks: share.allow_links,
  };
}

// ── Authentication gate ─────────────────────────────────────────────────────
// The first request with a credential authenticates once; parallel requests
// (thumbnails…) wait for it, so a wrong password costs one failed logon, not
// twenty (which would lock the AD account).

const verified = new Map();
const authing = new Map();

function credKey(server, cred) {
  return `${server.id}:${createHash('sha256').update(`${server.host}\0${cred.domain}\0${cred.username}\0${cred.password}`).digest('hex')}`;
}

async function failure(target, err) {
  if (isAuthFailure(err.code)) {
    verified.delete(credKey(target.server, target.resolved.cred));
    await parkCredential(target.resolved, err.code);
    if (target.resolved.source === 'service') {
      return httpError(502, 'The file server rejected its service account', 'SERVICE_AUTH_FAILED');
    }
    const error = httpError(403, 'The file server rejected the saved credentials', 'CREDENTIALS_FAILED');
    error.details = { serverId: target.server.id, serverName: target.server.name, reason: err.code };
    return error;
  }
  return err;
}

async function authenticate(target) {
  const key = credKey(target.server, target.resolved.cred);
  if ((verified.get(key) || 0) > Date.now()) return;
  if (!authing.has(key)) {
    const job = (async () => {
      try {
        await gateCall('auth', { server: serverParams(target.server), cred: target.resolved.cred });
      } catch (err) {
        throw await failure(target, err);
      }
      if (verified.size > 5000) verified.clear();
      verified.set(key, Date.now() + 10 * 60 * 1000);
    })().finally(() => authing.delete(key));
    authing.set(key, job);
  }
  await authing.get(key);
}

/** Opens a drive folder for a person (visibility + credentials + one authentication). */
export async function openTarget(ctx, shareId, { settings } = {}) {
  const id = intId(shareId);
  const entry = (await sharesWithServers()).find((item) => item.share.id === id);
  if (!entry || !canSee(ctx, entry.share)) throw httpError(404, 'Folder not found', 'NOT_FOUND');
  const resolved = await credentialFor(ctx.userId, entry.server, { settings });
  const target = { ...entry, resolved };
  await authenticate(target);
  return target;
}

export function fullPath(target, rel) {
  return joinPath(target.share.root_path, cleanPath(rel));
}

function params(target, extra = {}) {
  return { server: serverParams(target.server), cred: target.resolved.cred, share: target.share.share, ...extra };
}

async function call(target, op, extra) {
  try {
    return await gateCall(op, params(target, extra));
  } catch (err) {
    throw await failure(target, err);
  }
}

async function stream(target, op, extra, options) {
  try {
    return await gateRequest(op, params(target, extra), options);
  } catch (err) {
    throw await failure(target, err);
  }
}

// ── Shapes ──────────────────────────────────────────────────────────────────

function iso(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function entryShape(entry, parentRel) {
  return {
    name: entry.name,
    path: joinPath(parentRel, entry.name),
    dir: entry.dir,
    size: entry.size || 0,
    mtime: iso(entry.mtime),
    ext: entry.dir ? '' : extOf(entry.name),
    hidden: Boolean(entry.hidden),
    readonly: Boolean(entry.readonly),
  };
}

const collator = new Intl.Collator(['en', 'ru'], { numeric: true, sensitivity: 'base' });
const byName = (a, b) => (a.dir === b.dir ? collator.compare(a.name, b.name) : a.dir ? -1 : 1);

function crumbsOf(rel) {
  const parts = rel ? rel.split('/') : [];
  return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }));
}

// ── Home ────────────────────────────────────────────────────────────────────

const probes = new Map();

async function probeShare(ctx, item, resolved) {
  const key = `${ctx.userId}:${item.share.id}:${credKey(item.server, resolved.cred)}`;
  const cached = probes.get(key);
  if (cached && cached.at > Date.now() - 60_000) return cached.value;
  let value;
  try {
    const target = { ...item, resolved };
    const result = await call(target, 'probe', { path: item.share.root_path, volume: true });
    value = { state: result.access.read ? 'ok' : 'denied', access: result.access, volume: result.volume };
  } catch (err) {
    value = {
      state: ['ACCESS_DENIED'].includes(err.code)
        ? 'denied'
        : ['NOT_FOUND', 'SHARE_NOT_FOUND'].includes(err.code)
          ? 'missing'
          : err.code === 'CREDENTIALS_FAILED'
            ? 'auth'
            : 'offline',
      error: err.code || 'SMB_ERROR',
    };
  }
  if (probes.size > 5000) probes.clear();
  probes.set(key, { at: Date.now(), value });
  return value;
}

export function forgetProbes(userId) {
  for (const key of probes.keys()) if (key.startsWith(`${userId}:`)) probes.delete(key);
}

export async function home(ctx) {
  const settings = await driveSettings();
  const items = (await sharesWithServers()).filter((item) => canSee(ctx, item.share));
  const servers = new Map();
  for (const item of items) servers.set(item.server.id, item.server);

  // One authentication per server first, then all folders of that server in parallel.
  const byServer = await Promise.all(
    [...servers.values()].map(async (server) => {
      let resolved = null;
      let problem = null;
      try {
        resolved = await credentialFor(ctx.userId, server, { settings });
        await authenticate({ server, resolved, share: null });
      } catch (err) {
        problem = err;
      }
      const shares = items.filter((item) => item.server.id === server.id);
      return Promise.all(
        shares.map(async (item) => {
          let status;
          if (problem) {
            status = {
              state: ['CREDENTIALS_REQUIRED', 'CREDENTIALS_FAILED'].includes(problem.code) ? 'auth' : problem.code === 'SERVICE_AUTH_FAILED' ? 'offline' : 'offline',
              error: problem.code,
            };
          } else {
            status = await probeShare(ctx, item, resolved);
          }
          return { ...publicShare(item.share, item.server), ...status };
        })
      );
    })
  );
  const order = new Map(items.map((item, index) => [item.share.id, index]));
  const shares = byServer
    .flat()
    .filter((share) => !(settings.hideDenied && !ctx.isAdmin && (share.state === 'denied' || share.state === 'missing')))
    .sort((a, b) => order.get(a.id) - order.get(b.id));
  return {
    drive: { title: settings.title, tagline: settings.tagline },
    shares,
    connections: await connectionStatus(ctx.userId, [...servers.values()]),
    config: {
      maxUploadMb: settings.maxUploadMb,
      publicLinks: settings.publicLinks,
      linkAudience: settings.linkAudience,
      requireLinkPassword: settings.requireLinkPassword,
      maxLinkDays: settings.maxLinkDays,
      openMode: settings.openMode === 'modal' ? 'modal' : 'page',
      conversion: await conversionEnabled(),
      isAdmin: ctx.isAdmin,
      canAudit: Boolean(ctx.canAudit),
    },
  };
}

// ── Browsing ────────────────────────────────────────────────────────────────

export async function listFolder(target, rel, { hidden = false } = {}) {
  const path = cleanPath(rel);
  const result = await call(target, 'list', { path: fullPath(target, path) });
  const entries = result.entries
    .filter((entry) => hidden || !entry.hidden)
    .map((entry) => entryShape(entry, path))
    .sort(byName);
  return {
    share: publicShare(target.share, target.server),
    path,
    name: path ? nameOf(path) : target.share.title,
    crumbs: crumbsOf(path),
    entries,
    access: result.access,
    unc: uncOf(target.share, target.server, path),
  };
}

export async function statEntry(target, rel, { access = false } = {}) {
  const path = cleanPath(rel);
  const result = await call(target, 'stat', { path: fullPath(target, path), access });
  const entry = entryShape({ ...result.entry, name: path ? nameOf(path) : target.share.title }, parentOf(path));
  return { entry, access: result.access, unc: uncOf(target.share, target.server, path) };
}

export async function searchShare(target, rel, q, { hidden = false } = {}) {
  const path = cleanPath(rel);
  const text = String(q || '').trim().slice(0, 100);
  if (text.length < 2) return { entries: [], truncated: false };
  const result = await call(target, 'search', { path: fullPath(target, path), q: text, hidden, limit: 200 });
  return {
    truncated: result.truncated,
    entries: result.entries
      .map((entry) => entryShape(entry, relativeTo(target.share.root_path, entry.path)))
      .sort(byName),
  };
}

// ── Changes ─────────────────────────────────────────────────────────────────

export async function createFolder(target, rel, name) {
  const path = cleanPath(rel);
  const result = await call(target, 'mkdir', { path: fullPath(target, path), name: cleanName(name), unique: true });
  return entryShape(result.entry, path);
}

export async function renameEntry(target, rel, name) {
  const path = cleanPath(rel);
  if (!path) throw httpError(400, 'The root cannot be renamed', 'INVALID_PATH');
  const result = await call(target, 'rename', { path: fullPath(target, path), name: cleanName(name) });
  return entryShape(result.entry, parentOf(path));
}

export async function deleteEntries(target, paths) {
  const list = (Array.isArray(paths) ? paths : [paths]).map(cleanPath);
  if (!list.length || list.some((path) => !path)) throw httpError(400, 'Nothing to delete', 'INVALID_PATH');
  return call(target, 'delete', { items: list.map((path) => fullPath(target, path)) });
}

/** Move or copy into a folder of the same entry, or of another entry on the same server. */
export async function moveEntries(target, destination, paths, destRel, { copy = false } = {}) {
  if (destination.server.id !== target.server.id) {
    throw httpError(400, 'Items can only be moved between folders of the same server', 'CROSS_SERVER');
  }
  if (destination.share.share.toLowerCase() !== target.share.share.toLowerCase() || copy) {
    // Copy across shares runs with the source credential; make sure it is the same person.
    if (credKey(destination.server, destination.resolved.cred) !== credKey(target.server, target.resolved.cred)) {
      throw httpError(400, 'These folders are opened with different accounts', 'CROSS_ACCOUNT');
    }
  }
  const items = (Array.isArray(paths) ? paths : [paths]).map(cleanPath);
  if (!items.length || items.some((path) => !path)) throw httpError(400, 'Nothing to move', 'INVALID_PATH');
  return call(target, 'move', {
    items: items.map((path) => fullPath(target, path)),
    toShare: destination.share.share,
    toPath: fullPath(destination, destRel),
    copy,
  });
}

/** Saves edited text (Markdown, notes) — refuses if the file changed meanwhile. */
export async function saveText(target, rel, text, expectedMtime) {
  const path = cleanPath(rel);
  if (!path) throw httpError(400, 'Invalid path', 'INVALID_PATH');
  const body = Buffer.from(String(text ?? ''), 'utf8');
  if (body.length > 5 * 1024 * 1024) throw httpError(413, 'The text is too large', 'TOO_LARGE');
  const current = await statEntry(target, path);
  if (expectedMtime && current.entry.mtime && Math.abs(new Date(current.entry.mtime).getTime() - new Date(expectedMtime).getTime()) > 1500) {
    const error = httpError(409, 'Someone changed this file while you were editing', 'CHANGED');
    error.details = { mtime: current.entry.mtime };
    throw error;
  }
  const res = await stream(target, 'write', { path: fullPath(target, parentOf(path)), name: nameOf(path), conflict: 'replace' }, { body, length: body.length });
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return entryShape(result.entry, parentOf(path));
}

/** Streams an upload (raw request body) into a folder. */
export async function uploadInto(target, rel, name, req, { conflict = 'rename', maxBytes }) {
  const path = cleanPath(rel);
  const fileName = cleanName(name);
  // Body parsers (JSON, forms) would already have consumed the stream.
  if (req._body || req.readableEnded) throw httpError(415, 'Send the file as the raw request body', 'RAW_BODY_REQUIRED');
  const length = Number(req.headers['content-length']);
  if (!Number.isFinite(length) || length < 0) throw httpError(411, 'Content-Length is required', 'LENGTH_REQUIRED');
  if (maxBytes && length > maxBytes) throw httpError(413, 'The file is too large', 'FILE_TOO_LARGE');
  const mode = ['rename', 'replace', 'fail'].includes(conflict) ? conflict : 'rename';
  const res = await stream(target, 'write', { path: fullPath(target, path), name: fileName, conflict: mode }, { body: req, length });
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return { entry: entryShape(result.entry, path), replaced: result.replaced };
}

// ── Content ─────────────────────────────────────────────────────────────────

function contentHeaders(res, name, ext, download) {
  const inline = !download && INLINE.has(ext);
  res.setHeader('Content-Type', mimeOf(ext));
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-cache');
}

/** File content with HTTP range support (video seeking, large PDFs). */
export async function sendEntry(req, res, target, rel, { download = false } = {}) {
  const path = cleanPath(rel);
  if (!path) throw httpError(400, 'Not a file', 'IS_A_FOLDER');
  const name = nameOf(path);
  const ext = extOf(name);
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  const extra = { path: fullPath(target, path) };
  let partial = false;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      extra.start = Number(range[1]);
      if (range[2]) extra.end = Number(range[2]);
      partial = true;
    } else {
      // Suffix ranges ("last N bytes") need the size first.
      const info = await statEntry(target, path);
      extra.start = Math.max(0, info.entry.size - Number(range[2]));
      partial = true;
    }
  }
  let upstream;
  try {
    upstream = await stream(target, 'read', extra);
  } catch (err) {
    if (err.code === 'RANGE') {
      res.status(416).end();
      return;
    }
    throw err;
  }
  const size = Number(upstream.headers['x-size'] || 0);
  const length = Number(upstream.headers['content-length'] || 0);
  contentHeaders(res, name, ext, download);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(length));
  if (upstream.headers['x-mtime']) res.setHeader('Last-Modified', new Date(Number(upstream.headers['x-mtime']) * 1000).toUTCString());
  if (partial) {
    const start = extra.start || 0;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${start + length - 1}/${size}`);
  }
  req.on('close', () => upstream.destroy());
  upstream.pipe(res);
}

function cacheKey(target, path, entry) {
  const id = createHash('sha256')
    .update(`${target.server.host}\0${target.share.share}\0${fullPath(target, path).toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
  return { id: `drv-${id}`, version: `${new Date(entry.mtime || 0).getTime()}-${entry.size}` };
}

async function cached(dir, file, produce) {
  const full = join(previewDir(), dir, file);
  if (await stat(full).catch(() => null)) return full;
  await mkdir(join(previewDir(), dir), { recursive: true });
  const data = await produce();
  const temp = `${full}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temp, data);
  await rename(temp, full);
  return full;
}

/** Image thumbnail (JPEG), cached by path + version; the stat checks access every time. */
export async function sendThumb(res, target, rel, size = 320) {
  const path = cleanPath(rel);
  const { entry } = await statEntry(target, path);
  const key = cacheKey(target, path, entry);
  const dim = [160, 320, 640].includes(Number(size)) ? Number(size) : 320;
  const file = await cached('thumbs', `${key.id}-${key.version}-${dim}.jpg`, async () => {
    const upstream = await stream(target, 'thumb', { path: fullPath(target, path), size: dim });
    const chunks = [];
    for await (const chunk of upstream) chunks.push(chunk);
    return Buffer.concat(chunks);
  });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(file);
}

/** Office document → PDF via the document conversion integration. */
export async function sendPreview(res, target, rel) {
  const path = cleanPath(rel);
  const { entry } = await statEntry(target, path);
  if (!CONVERTIBLE.has(entry.ext)) throw httpError(400, 'No preview for this file type', 'NO_PREVIEW');
  const key = cacheKey(target, path, entry);
  const pdf = await officePreview({
    cacheKey: `${key.id}-${key.version}`,
    version: entry.mtime || 0,
    load: () => gateReadAll(params(target, { path: fullPath(target, path) })),
    name: entry.name,
    ext: entry.ext,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(`${entry.name.replace(/\.[^.]+$/, '')}.pdf`)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(pdf);
}

const DWG2DXF = process.env.DWG2DXF || 'dwg2dxf';

function convertDwg(input, output) {
  return new Promise((resolve, reject) => {
    const proc = spawn(DWG2DXF, ['-y', '-o', output, input], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errText = '';
    proc.stderr.on('data', (chunk) => {
      if (errText.length < 4000) errText += chunk;
    });
    const timer = setTimeout(() => proc.kill('SIGKILL'), 90_000);
    proc.on('error', () => {
      clearTimeout(timer);
      reject(httpError(409, 'DWG conversion is not available on this server', 'NO_CAD_CONVERTER'));
    });
    proc.on('close', async () => {
      clearTimeout(timer);
      // dwg2dxf returns non-zero on recoverable warnings; the output decides.
      const info = await stat(output).catch(() => null);
      if (info?.size > 0) resolve();
      else reject(httpError(422, 'This drawing could not be read', 'CAD_UNREADABLE'));
    });
  });
}

/** Drawings for the CAD viewer: DXF as is, DWG converted to DXF (cached). */
export async function sendCad(req, res, target, rel) {
  const path = cleanPath(rel);
  const { entry } = await statEntry(target, path);
  if (entry.ext === 'dxf') {
    await sendEntry(req, res, target, path);
    return;
  }
  if (entry.ext !== 'dwg') throw httpError(400, 'Not a drawing', 'NO_PREVIEW');
  if (entry.size > 150 * 1024 * 1024) throw httpError(413, 'The drawing is too large to preview', 'TOO_LARGE');
  const key = cacheKey(target, path, entry);
  const file = await cached('cad', `${key.id}-${key.version}.dxf`, async () => {
    const work = join(previewDir(), 'cad', `job-${randomBytes(6).toString('hex')}`);
    await writeFile(`${work}.dwg`, await gateReadAll(params(target, { path: fullPath(target, path) }), 150 * 1024 * 1024));
    try {
      await convertDwg(`${work}.dwg`, `${work}.dxf`);
      return await readFile(`${work}.dxf`);
    } finally {
      await unlink(`${work}.dwg`).catch(() => {});
      await unlink(`${work}.dxf`).catch(() => {});
    }
  });
  res.setHeader('Content-Type', 'application/dxf');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(file);
}

/** Folder or selection as a ZIP stream. */
export async function sendZip(req, res, target, paths, label) {
  const list = (Array.isArray(paths) ? paths : [paths]).map(cleanPath);
  const upstream = await stream(target, 'zip', {
    items: list.map((path) => fullPath(target, path)),
    label: target.share.title,
  });
  const name = `${(label || (list.length === 1 && list[0] ? nameOf(list[0]) : target.share.title)).replace(/[\\/:*?"<>|]/g, '_')}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  req.on('close', () => upstream.destroy());
  upstream.pipe(res);
}

// ── Recent and favourites ───────────────────────────────────────────────────

const SHORTCUTS = { recent: 'drive_recent', favorites: 'drive_favorites' };

export async function touchShortcut(kind, ctx, target, rel, { dir = false, size = 0 } = {}) {
  const path = cleanPath(rel);
  const table = SHORTCUTS[kind];
  await query(
    `INSERT INTO ${table} (user_id, share_id, path, name, is_dir, size, at) VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, share_id, path) DO UPDATE SET name = EXCLUDED.name, is_dir = EXCLUDED.is_dir, size = EXCLUDED.size, at = NOW()`,
    [ctx.userId, target.share.id, path, path ? nameOf(path) : target.share.title, dir, Math.max(0, Number(size) || 0)]
  );
  if (kind === 'recent') {
    await query(
      `DELETE FROM drive_recent WHERE user_id = $1 AND (share_id, path) NOT IN
         (SELECT share_id, path FROM drive_recent WHERE user_id = $1 ORDER BY at DESC LIMIT 60)`,
      [ctx.userId]
    );
  }
}

export async function removeShortcut(kind, ctx, shareId, rel) {
  await query(`DELETE FROM ${SHORTCUTS[kind]} WHERE user_id = $1 AND share_id = $2 AND path = $3`, [ctx.userId, intId(shareId), cleanPath(rel)]);
}

export async function listShortcuts(kind, ctx) {
  const visible = (await sharesWithServers()).filter((item) => canSee(ctx, item.share));
  const byId = new Map(visible.map((item) => [item.share.id, item]));
  const { rows } = await query(`SELECT * FROM ${SHORTCUTS[kind]} WHERE user_id = $1 ORDER BY at DESC LIMIT 60`, [ctx.userId]);
  return rows
    .filter((row) => byId.has(row.share_id))
    .map((row) => {
      const item = byId.get(row.share_id);
      return {
        shareId: row.share_id,
        shareTitle: item.share.title,
        color: item.share.color,
        path: row.path,
        name: row.name,
        dir: row.is_dir,
        size: Number(row.size),
        ext: row.is_dir ? '' : extOf(row.name),
        at: row.at,
      };
    });
}
