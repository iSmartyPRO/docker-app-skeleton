import { randomBytes } from 'crypto';
import { createReadStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream';
import { query } from '../../config/database.js';
import { hasPermission } from '../../services/permissions.js';
import { bodyToFile, checkOfficeFile } from '../../services/office/content.js';
import { locksOf } from '../../services/office/locks.js';
import { editorSession } from '../../services/office/session.js';
import { registerProvider } from '../../services/office/wopi.js';
import { httpError, intId } from '../shared/acl.js';
import { extOf } from '../shared/storage.js';
import { logActivity } from './activity.js';
import { driveSettings } from './credentials.js';
import { cleanPath, joinPath, nameOf, parentOf } from './paths.js';
import { fullPath, listFolder, openTarget, overwriteFile, readFileStream, readSmallFile, statEntry } from './service.js';

/*
 * Drive ↔ online editor (WOPI provider "drive").
 *
 * The WOPI file id is "drive-<random id>"; drive_office_files maps it to a
 * folder entry and a path inside it. Collabora never sees a path and the
 * portal never takes one from it. Every call opens the entry for the person
 * the token belongs to with *their* file-server credentials (the same rules
 * as any Drive action: entry visibility, saved credentials or directory
 * sign-in, the server's own ACLs), so a WOPI call can do exactly what that
 * person could do in Drive and nothing more.
 *
 * Saving spools the content to a temporary local file, then streams it to
 * the gateway, which writes a temporary file on the share and atomically
 * replaces the original. SMB has no versions: the save overwrites the file
 * (the editor page says so). Changes made on the share meanwhile (another
 * program, another person) are detected by the modification time Collabora
 * sends back (409, COOLStatusCode 1010). Locks live in the portal database
 * only; Office/LibreOffice lock files on the share are reported to the
 * person who opens the editor ("open read-only?").
 */

export function lockKeyOf(target, rel) {
  return `drive:${target.server.id}:${String(target.share.share).toLowerCase()}:${fullPath(target, rel).toLowerCase()}`;
}

function ctxOf(who) {
  const access = who.access || {};
  return { userId: who.row.id, groupIds: new Set(access.groupIds || []), isAdmin: hasPermission(access.permissions || [], 'drive.admin') };
}

/** The opaque id for (entry, path), made on first use. */
export async function fileIdFor(shareId, rel) {
  const path = cleanPath(rel);
  const id = randomBytes(15).toString('base64url');
  const { rows } = await query(
    `INSERT INTO drive_office_files (id, share_id, path, path_key) VALUES ($1, $2, $3, LOWER($3))
     ON CONFLICT (share_id, path_key) DO UPDATE SET path = EXCLUDED.path, used_at = NOW()
     RETURNING id`,
    [id, shareId, path]
  );
  return rows[0].id;
}

const softStatuses = new Set([401, 403, 404]);

async function resolve(localId, who) {
  const { rows } = await query(`SELECT * FROM drive_office_files WHERE id = $1`, [String(localId)]);
  const mapping = rows[0];
  if (!mapping) throw httpError(404, 'Not found', 'NOT_FOUND');
  // The token was issued for this entry.
  if (who.claims.e && Number(who.claims.e) !== Number(mapping.share_id)) return { canRead: false };
  let target;
  let info;
  try {
    target = await openTarget(ctxOf(who), mapping.share_id);
    info = await statEntry(target, mapping.path, { access: true });
  } catch (err) {
    if (err.code === 'NOT_FOUND' && target) throw httpError(404, 'Not found', 'NOT_FOUND');
    if (softStatuses.has(err.statusCode) || err.code === 'ACCESS_DENIED') return { canRead: false };
    throw err;
  }
  const { entry, access } = info;
  if (entry.dir) return { canRead: false };
  const mtime = entry.mtime ? new Date(entry.mtime) : new Date(0);
  return {
    lockKey: lockKeyOf(target, mapping.path),
    canRead: true,
    canWrite: access?.write !== false && !entry.readonly,
    name: entry.name,
    size: entry.size,
    version: `${mtime.getTime()}-${entry.size}`,
    lastModified: mtime,
    ownerId: `drive-${target.share.id}`,
    breadcrumb: nameOf(parentOf(mapping.path)) || target.share.title,
    target,
    path: mapping.path,
  };
}

async function read(handle, req, res) {
  const upstream = await readFileStream(handle.target, handle.path);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(upstream.headers['content-length'] || upstream.headers['x-size'] || 0));
  req.on('close', () => upstream.destroy());
  pipeline(upstream, res, () => {});
}

/** The activity row of a save: as if the person had changed the file through Drive. */
function activityRequest(req, who) {
  return {
    user: who.user,
    ip: req.ip,
    get: (name) => (String(name).toLowerCase() === 'user-agent' ? 'Online editor (Collabora)' : undefined),
  };
}

async function write(handle, req, info, who) {
  if (req._body || req.readableEnded) throw httpError(415, 'Send the file as the raw request body', 'RAW_BODY_REQUIRED');
  const settings = await driveSettings();
  const dir = await mkdtemp(join(tmpdir(), 'wopi-'));
  const file = join(dir, 'body');
  let entry;
  try {
    const size = await bodyToFile(req, file, settings.maxUploadMb * 1024 * 1024);
    await checkOfficeFile(file, extOf(handle.name));
    entry = await overwriteFile(handle.target, handle.path, createReadStream(file), size);
  } catch (err) {
    if (info.firstSave || info.exitSave) logActivity(activityRequest(req, who), { action: 'edit', shareId: handle.target.share.id, path: handle.path, ok: false, code: err.code, details: { editor: true } });
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  // One row per editing session (its first save) plus the closing save; autosaves in between are not logged.
  if (info.firstSave || info.exitSave) {
    logActivity(activityRequest(req, who), { action: 'edit', shareId: handle.target.share.id, path: handle.path, size: entry.size, details: { editor: true, ...(info.exitSave ? { closed: true } : {}) } });
  }
  const mtime = entry.mtime ? new Date(entry.mtime) : new Date();
  return { lastModified: mtime, size: entry.size, version: `${mtime.getTime()}-${entry.size}` };
}

registerProvider({ prefix: 'drive', module: 'drive', resolve, read, write });

// ── Lock files of desktop programs ──────────────────────────────────────────

/**
 * Who has a file open in Microsoft Office or LibreOffice on the share:
 * Office leaves "~$<name>" (first characters replaced for long names) next
 * to the file, LibreOffice ".~lock.<name>#". → { app, by } or null.
 */
export function ownerFileCandidates(name) {
  return [`~$${name}`, `~$${name.slice(1)}`, `~$${name.slice(2)}`, `.~lock.${name}#`];
}

/** The person named in an owner/lock file, best effort. */
export function ownerName(buffer, kind) {
  if (!buffer?.length) return null;
  if (kind === 'libreoffice') {
    const first = buffer.toString('utf8').split(',')[0]?.trim();
    return first || null;
  }
  // Office: [len][ANSI name, padded to 54 bytes][len uint16 LE? ][UTF-16LE name]
  const tryUtf16 = (offset) => {
    if (buffer.length < offset + 2) return null;
    const len = buffer.readUInt16LE(offset);
    if (!len || len > 64 || buffer.length < offset + 2 + len * 2) return null;
    const text = buffer.subarray(offset + 2, offset + 2 + len * 2).toString('utf16le').trim();
    return /^[\p{L}\p{N} ._'-]+$/u.test(text) ? text : null;
  };
  const utf16 = tryUtf16(54) || tryUtf16(55);
  if (utf16) return utf16;
  const len = buffer[0];
  if (len > 0 && len < 54 && buffer.length > len) {
    const text = buffer.subarray(1, 1 + len).toString('latin1').trim();
    if (/^[\x20-\x7e]+$/.test(text)) return text;
  }
  return null;
}

async function desktopLock(target, rel) {
  const name = nameOf(rel);
  const parent = parentOf(rel);
  let entries;
  try {
    entries = (await listFolder(target, parent, { hidden: true })).entries;
  } catch {
    return null;
  }
  const names = new Map(entries.filter((entry) => !entry.dir).map((entry) => [entry.name.toLowerCase(), entry]));
  for (const candidate of ownerFileCandidates(name)) {
    const found = names.get(candidate.toLowerCase());
    if (!found || candidate.length < 4) continue;
    const kind = candidate.startsWith('.~lock.') ? 'libreoffice' : 'office';
    const content = await readSmallFile(target, joinPath(parent, found.name), 4096);
    return { app: kind, by: ownerName(content, kind), since: found.mtime };
  }
  return null;
}

/** POST /api/app/drive/shares/:id/editor { path, mode, force } — the editor frame for a file. */
export async function openEditor(req, ctx, shareId, body = {}) {
  const target = await openTarget(ctx, intId(shareId));
  const rel = cleanPath(body.path);
  if (!rel) throw httpError(400, 'Not a file', 'IS_A_FOLDER');
  const { entry, access } = await statEntry(target, rel, { access: true });
  if (entry.dir) throw httpError(400, 'Not a file', 'IS_A_FOLDER');
  const canWrite = access?.write !== false && !entry.readonly;
  let want = body.mode === 'view' ? 'view' : 'edit';
  const external = want === 'edit' && canWrite ? await desktopLock(target, rel) : null;
  // Open in a desktop program: read-only unless the person chose to edit anyway.
  if (external && !body.force) want = 'view';
  const fileId = `drive-${await fileIdFor(target.share.id, rel)}`;
  const session = await editorSession(req, {
    fileId,
    ext: entry.ext,
    canWrite,
    want,
    lockKey: lockKeyOf(target, rel),
    entryId: target.share.id,
    lang: body.lang,
    dark: Boolean(body.dark),
  });
  return {
    ...session,
    externalLock: external,
    file: { shareId: target.share.id, shareTitle: target.share.title, color: target.share.color, path: rel, name: entry.name, ext: entry.ext, size: entry.size, mtime: entry.mtime },
  };
}

/** Folder listing → { path: name } of files open in the online editor right now. */
export async function editorsIn(target, entries) {
  const files = (entries || []).filter((entry) => !entry.dir && entry.path);
  if (!files.length) return {};
  try {
    const keys = new Map(files.map((entry) => [lockKeyOf(target, entry.path), entry.path]));
    const locks = await locksOf([...keys.keys()]);
    const out = {};
    for (const [key, lock] of locks) out[keys.get(key)] = lock.userName || '—';
    return out;
  } catch {
    return {};
  }
}
