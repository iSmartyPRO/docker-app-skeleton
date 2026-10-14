import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../config/app.js';
import { query } from '../../config/database.js';
import { httpError, intId } from '../shared/acl.js';
import { parseExpiry } from '../files/links.js';
import { addressMatch, addressOrder, checkSlug, claimSlug, clearHold, freshToken, releaseSlug, rethrowSlugConflict } from '../shared/linkSlug.js';
import { driveSettings } from './credentials.js';
import { cleanVisitor, effectivePerms, hasWrite, legacyPerms, linkOptions, normalizePerms, ungrantable } from './linkPerms.js';
import { cleanPath, joinPath, nameOf, parentOf } from './paths.js';
import { checkWrite, contextForUser, openTarget, statEntry } from './service.js';

/*
 * Public links to drive files and folders: /d/<token>, or /d/<slug> when the
 * author gave the link a custom address (shared/linkSlug.js; the token keeps
 * working, a changed or deleted slug stops at once and is held for its author).
 *
 * A link has no access of its own. Every visit acts with its author's
 * credentials (the account the drive picks for the author on that server:
 * their saved "Connect as…" account, else their AD sign-in, else the server's
 * service account), so it works only while the author
 *   - is an active, unblocked portal user,
 *   - can still see that drive folder and open the item on the file server
 *     (AD groups, NTFS rights — re-checked by the server on every request),
 *   - and has working credentials.
 * When an employee leaves, all their links stop at once, with a clear page.
 *
 * What visitors may do is the link's permission list (linkPerms.js). Uploads
 * and changes run with the same account as reading, so a link can never do
 * more than its author can: write permissions are checked against the
 * author's rights when they are granted, and the file server refuses anything
 * else at the moment it is tried.
 *
 * Visitors who change something hold a visitor session: a signed token bound
 * to the link and its version (a new password, turning the link off or on
 * ends every session), with a random session id ("my uploads") and the name
 * and e-mail the visitor gave.
 */

const secret = () => `${config.auth.jwtSecret || 'dev-secret'}:drive-link`;

function linkStatus(row) {
  if (row.revoked_at) return 'revoked';
  if (row.owner_active === false || row.owner_blocked === true) return 'owner_inactive';
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  return 'active';
}

const storedPerms = (row) => normalizePerms(Array.isArray(row.permissions) && row.permissions.length ? row.permissions : legacyPerms(row.allow_download), row.kind);

export function linkShape(row) {
  const permissions = storedPerms(row);
  return {
    id: row.id,
    token: row.token,
    slug: row.slug || null,
    shareId: row.share_id,
    shareTitle: row.share_title,
    path: row.path,
    kind: row.kind,
    name: row.name,
    title: row.title || null,
    note: row.note || null,
    audience: row.audience,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    permissions,
    allowDownload: permissions.includes('download'),
    maxFileMb: row.max_file_mb ?? null,
    allowedExts: row.allowed_exts || [],
    quotaMb: row.quota_mb ?? null,
    uploadedBytes: Number(row.uploaded_bytes || 0),
    requireName: Boolean(row.require_name),
    requireEmail: Boolean(row.require_email),
    notify: Boolean(row.notify),
    views: row.view_count,
    lastViewedAt: row.last_viewed_at,
    createdAt: row.created_at,
    status: linkStatus(row),
    owner: row.owner_name !== undefined ? { id: row.created_by, name: row.owner_name, username: row.owner_username } : undefined,
  };
}

const SELECT = `
  SELECT l.*, sh.title AS share_title, COALESCE(u.display_name, u.username) AS owner_name, u.username AS owner_username,
         u.is_active AS owner_active, u.is_blocked AS owner_blocked
  FROM drive_links l
  JOIN drive_shares sh ON sh.id = l.share_id
  JOIN users u ON u.id = l.created_by`;

export async function myLinks(ctx, { shareId, path } = {}) {
  const params = [ctx.userId];
  let filter = '';
  if (shareId) {
    params.push(intId(shareId), cleanPath(path));
    filter = ' AND l.share_id = $2 AND l.path = $3';
  }
  const { rows } = await query(`${SELECT} WHERE l.created_by = $1${filter} ORDER BY l.id DESC`, params);
  return rows.map(linkShape);
}

export async function allLinks() {
  const { rows } = await query(`${SELECT} ORDER BY l.id DESC LIMIT 1000`);
  return rows.map(linkShape);
}

async function audienceFor(input, settings) {
  if (settings.linkAudience === 'employees') return 'employees';
  return input === 'employees' ? 'employees' : 'anyone';
}

/** Permissions from the author's input (`permissions`, or the older `allowDownload`). */
function permsFromInput(input, kind) {
  if (Array.isArray(input.permissions)) return normalizePerms(input.permissions, kind);
  return normalizePerms(legacyPerms(input.allowDownload), kind);
}

/**
 * May these permissions be granted on this item? Administrators may switch
 * write links off or demand a password for them; and the author must hold the
 * rights on the file server (checked with the account the link will use).
 */
async function assertGrantable(target, row, perms, settings) {
  if (!hasWrite(perms)) return;
  if (settings.linkWrite === false) throw httpError(403, 'Links that allow changes are turned off', 'WRITE_LINKS_DISABLED');
  if (settings.requireWritePassword && !row.password_hash) {
    throw httpError(400, 'Links that allow changes need a password', 'WRITE_PASSWORD_REQUIRED');
  }
  const folder = row.kind === 'dir' ? row.path : parentOf(row.path);
  const access = await checkWrite(target, folder);
  const missing = ungrantable(perms, access);
  if (missing.length) {
    const error = httpError(403, 'You cannot give rights you do not have on the file server', 'GRANT_EXCEEDS');
    error.details = { missing };
    throw error;
  }
}

export async function createLink(ctx, shareId, rel, input = {}) {
  const settings = await driveSettings();
  if (!settings.publicLinks) throw httpError(403, 'Links are disabled', 'LINKS_DISABLED');
  const target = await openTarget(ctx, shareId, { settings });
  if (!target.share.allow_links) throw httpError(403, 'Links are disabled for this folder', 'LINKS_DISABLED');
  const path = cleanPath(rel);
  const { entry } = await statEntry(target, path);
  const kind = entry.dir ? 'dir' : 'file';
  const password = String(input.password || '');
  if (settings.requireLinkPassword && !password) throw httpError(400, 'A password is required', 'PASSWORD_REQUIRED');
  if (password && password.length < 4) throw httpError(400, 'The password is too short', 'PASSWORD_SHORT');
  const perms = permsFromInput(input, kind);
  await assertGrantable(target, { kind, path, password_hash: password ? 'set' : null }, perms, settings);
  const options = linkOptions(input);
  const expiresAt = parseExpiry(input.expiresAt, settings.maxLinkDays);
  const slug = await claimSlug('drive', input.slug, { authorId: ctx.userId });
  const { rows } = await query(
    `INSERT INTO drive_links (token, share_id, path, kind, name, created_by, audience, password_hash, expires_at, allow_download,
                              permissions, title, note, max_file_mb, allowed_exts, quota_mb, require_name, require_email, notify, slug)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING id`,
    [
      await freshToken('drive', 12),
      target.share.id,
      path,
      kind,
      path ? nameOf(path) : target.share.title,
      ctx.userId,
      await audienceFor(input.audience, settings),
      password ? await bcrypt.hash(password.slice(0, 200), 10) : null,
      expiresAt,
      perms.includes('download'),
      perms,
      options.title ?? null,
      options.note ?? null,
      options.max_file_mb ?? null,
      options.allowed_exts ?? null,
      options.quota_mb ?? null,
      options.require_name ?? false,
      options.require_email ?? false,
      options.notify ?? false,
      slug,
    ]
  ).catch((err) => rethrowSlugConflict('drive', err, slug));
  if (slug) await clearHold('drive', slug);
  return (await loadLink(rows[0].id)).shape;
}

async function loadLink(id) {
  const { rows } = await query(`${SELECT} WHERE l.id = $1`, [intId(id)]);
  if (!rows[0]) throw httpError(404, 'Link not found', 'NOT_FOUND');
  return { row: rows[0], shape: linkShape(rows[0]) };
}

async function ownedLink(ctx, id) {
  const link = await loadLink(id);
  if (link.row.created_by !== ctx.userId && !ctx.isAdmin) throw httpError(404, 'Link not found', 'NOT_FOUND');
  return link;
}

export async function updateLink(ctx, id, input = {}) {
  const { row } = await ownedLink(ctx, id);
  const settings = await driveSettings();
  const sets = [];
  const values = [];
  const set = (sql, value) => {
    values.push(value);
    sets.push(sql.replace('?', `$${values.length}`));
  };
  let bump = false;
  let passwordHash = row.password_hash;
  if (input.password !== undefined) {
    const password = String(input.password || '');
    if (!password && settings.requireLinkPassword) throw httpError(400, 'A password is required', 'PASSWORD_REQUIRED');
    if (password && password.length < 4) throw httpError(400, 'The password is too short', 'PASSWORD_SHORT');
    passwordHash = password ? await bcrypt.hash(password.slice(0, 200), 10) : null;
    set('password_hash = ?', passwordHash);
    bump = true;
  }
  if (input.expiresAt !== undefined) set('expires_at = ?', parseExpiry(input.expiresAt, settings.maxLinkDays));
  if (input.audience !== undefined) set('audience = ?', await audienceFor(input.audience, settings));

  // Permissions: new write rights are checked against the author's rights
  // (the author's, even when an administrator edits the link).
  let perms = storedPerms(row);
  if (Array.isArray(input.permissions)) perms = normalizePerms(input.permissions, row.kind);
  else if (typeof input.allowDownload === 'boolean') {
    perms = normalizePerms(input.allowDownload ? [...perms, 'download'] : perms.filter((perm) => perm !== 'download'), row.kind);
  }
  const permsChanged = perms.join(',') !== storedPerms(row).join(',');
  const passwordRemoved = input.password !== undefined && !passwordHash;
  if (hasWrite(perms) && (permsChanged || passwordRemoved)) {
    const added = perms.filter((perm) => !storedPerms(row).includes(perm));
    if (settings.requireWritePassword && !passwordHash) throw httpError(400, 'Links that allow changes need a password', 'WRITE_PASSWORD_REQUIRED');
    if (added.length) {
      const owner = await contextForUser(row.created_by);
      const target = await openTarget(owner, row.share_id, { settings });
      await assertGrantable(target, { ...row, password_hash: passwordHash }, added, settings);
    }
  }
  if (permsChanged) {
    set('permissions = ?', perms);
    set('allow_download = ?', perms.includes('download'));
  }
  const options = linkOptions(input);
  for (const [column, value] of Object.entries(options)) set(`${column} = ?`, value);

  if (typeof input.revoked === 'boolean') {
    set('revoked_at = ?', input.revoked ? new Date() : null);
    bump = true;
  }
  // A new address: the old one stops working at once (and is held for the author).
  let slug = row.slug || null;
  if (input.slug !== undefined) {
    slug = await claimSlug('drive', input.slug, { linkId: row.id, authorId: row.created_by });
    if (slug !== (row.slug || null)) set('slug = ?', slug);
  }
  if (bump) sets.push('version = version + 1');
  if (sets.length) {
    values.push(row.id);
    await query(`UPDATE drive_links SET ${sets.join(', ')} WHERE id = $${values.length}`, values).catch((err) => rethrowSlugConflict('drive', err, slug));
  }
  if (slug !== (row.slug || null)) {
    await releaseSlug('drive', row.slug, row.created_by);
    await clearHold('drive', slug);
  }
  return (await loadLink(row.id)).shape;
}

export async function deleteLink(ctx, id) {
  const { row } = await ownedLink(ctx, id);
  await query(`DELETE FROM drive_links WHERE id = $1`, [row.id]);
  await releaseSlug('drive', row.slug, row.created_by);
  return row;
}

/** Is this custom address free for the person (for their link `linkId` when editing)? */
export async function checkLinkSlug(ctx, input = {}) {
  let authorId = ctx.userId;
  let linkId = null;
  if (input.linkId) {
    const { row } = await ownedLink(ctx, input.linkId);
    linkId = row.id;
    authorId = row.created_by;
  }
  return checkSlug('drive', input.slug, { linkId, authorId });
}

// ── Visitors ────────────────────────────────────────────────────────────────

function fail(status, code, message, details) {
  const error = httpError(status, message, code);
  if (details) error.details = details;
  return error;
}

/** The visitor session in `token`, when it belongs to this link and its current version. */
export function readVisitor(row, token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(String(token), secret());
    if (payload.lid !== row.id || payload.v !== row.version) return null;
    return { sid: payload.sid || null, name: payload.n || null, email: payload.e || null };
  } catch {
    return null;
  }
}

/**
 * Opens a visitor session: checks the password (when the link has one) and
 * records the name and e-mail the visitor gave. A visitor who already holds a
 * session (`current`) keeps its id when they only add their name.
 */
export async function unlockLink(token, input = {}, current = '') {
  const { rows } = await query(`SELECT * FROM drive_links l WHERE ${addressMatch('l', 1)} AND revoked_at IS NULL ${addressOrder('l', 1)}`, [String(token || '').slice(0, 64)]);
  const link = rows[0];
  if (!link) throw fail(404, 'NOT_FOUND', 'This link does not exist');
  const existing = readVisitor(link, current);
  if (link.password_hash && !existing) {
    if (!(await bcrypt.compare(String(input.password || ''), link.password_hash))) throw fail(401, 'WRONG_PASSWORD', 'Wrong password');
  }
  const given = input.name !== undefined || input.email !== undefined;
  const visitor = given ? cleanVisitor(input, link) : { name: existing?.name || null, email: existing?.email || null };
  const sid = existing?.sid || randomBytes(12).toString('base64url');
  const payload = { lid: link.id, v: link.version, sid };
  if (visitor.name) payload.n = visitor.name;
  if (visitor.email) payload.e = visitor.email;
  return { token: jwt.sign(payload, secret(), { expiresIn: '12h' }), visitor: { name: visitor.name, email: visitor.email } };
}

/**
 * Everything a visit needs, or a coded error the public page explains:
 * NOT_FOUND, REVOKED, EXPIRED, OWNER_INACTIVE, LINKS_DISABLED, SIGN_IN_REQUIRED,
 * PASSWORD_REQUIRED, OWNER_NO_ACCESS, UNAVAILABLE, UPLOADS_DISABLED.
 */
export async function openLink(token, visitorToken, viewer) {
  const settings = await driveSettings();
  const { rows } = await query(`${SELECT} WHERE ${addressMatch('l', 1)} ${addressOrder('l', 1)}`, [String(token || '').slice(0, 64)]);
  const row = rows[0];
  if (!row) throw fail(404, 'NOT_FOUND', 'This link does not exist');
  const status = linkStatus(row);
  if (status === 'revoked') throw fail(410, 'REVOKED', 'This link was turned off by its author');
  if (status === 'owner_inactive') throw fail(410, 'OWNER_INACTIVE', 'The author of this link no longer works with the company');
  if (status === 'expired') throw fail(410, 'EXPIRED', 'This link has expired', { expiredAt: row.expires_at });
  if (!settings.publicLinks) throw fail(403, 'LINKS_DISABLED', 'Links are turned off');

  const { rows: shareRows } = await query(`SELECT allow_links FROM drive_shares WHERE id = $1`, [row.share_id]);
  if (!shareRows[0]?.allow_links) throw fail(403, 'LINKS_DISABLED', 'Links are turned off for this folder');

  const perms = effectivePerms(row, settings);
  if (!perms.length) throw fail(403, 'UPLOADS_DISABLED', 'Uploads through links are turned off', { name: row.title || row.name });

  const audience = settings.linkAudience === 'employees' ? 'employees' : row.audience;
  if (audience === 'employees' && !viewer) throw fail(401, 'SIGN_IN_REQUIRED', 'Sign in to open this link', { name: row.name });

  const visitor = readVisitor(row, visitorToken);
  if (row.password_hash && !visitor) {
    throw fail(401, 'PASSWORD_REQUIRED', 'This link is protected by a password', { name: row.title || row.name, kind: row.kind });
  }

  // Act as the author: visibility, credentials and server rights are theirs.
  const ownerCtx = await contextForUser(row.created_by);
  let target;
  try {
    target = await openTarget(ownerCtx, row.share_id, { settings });
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw fail(403, 'OWNER_NO_ACCESS', 'The author no longer has access to these files');
    throw fail(503, 'UNAVAILABLE', 'The files are temporarily unavailable', { reason: err.code === 'CREDENTIALS_FAILED' || err.code === 'CREDENTIALS_REQUIRED' ? 'credentials' : 'server' });
  }
  return { link: row, target, audience, perms, visitor, settings };
}

/** A path inside the link, relative to the link root. */
export function linkPath(link, sub) {
  const rel = cleanPath(sub);
  if (link.kind === 'file' && rel) throw fail(404, 'NOT_FOUND', 'Not found');
  return joinPath(link.path, rel);
}

/** Errors from the file server during a visit, in visitor terms. */
export function visitorError(err) {
  if (err.code === 'ACCESS_DENIED') return fail(403, 'OWNER_NO_ACCESS', 'The author no longer has access to these files');
  if (err.code === 'NOT_FOUND' || err.code === 'SHARE_NOT_FOUND') return fail(404, 'GONE', 'This file was moved or deleted');
  if (['CREDENTIALS_FAILED', 'CREDENTIALS_REQUIRED', 'SERVICE_AUTH_FAILED', 'SERVER_UNREACHABLE', 'GATEWAY_DOWN'].includes(err.code)) {
    return fail(503, 'UNAVAILABLE', 'The files are temporarily unavailable', { reason: err.code.startsWith('CREDENTIALS') || err.code === 'SERVICE_AUTH_FAILED' ? 'credentials' : 'server' });
  }
  return err;
}

/**
 * Errors of an upload or change: the page stays, the visitor gets a message.
 * ACCESS_DENIED here means the author's account may not change this item
 * (NTFS rights changed since the link was made, a read-only file…).
 */
export function visitorWriteError(err) {
  if (err.code === 'ACCESS_DENIED') return fail(403, 'WRITE_DENIED', 'The file server did not allow this change');
  if (err.code === 'NOT_FOUND') return fail(404, 'ITEM_GONE', 'This item was moved or deleted');
  return visitorError(err);
}

export async function countView(link) {
  await query(`UPDATE drive_links SET view_count = view_count + 1, last_viewed_at = NOW() WHERE id = $1`, [link.id]);
}

// ── Upload quota and "my uploads" ───────────────────────────────────────────

/**
 * Reserves `bytes` of the link's upload quota (atomically, so parallel uploads
 * cannot overshoot it). Returns false when they do not fit.
 */
export async function reserveQuota(link, bytes) {
  const { rows } = await query(
    `UPDATE drive_links SET uploaded_bytes = uploaded_bytes + $2
     WHERE id = $1 AND (quota_mb IS NULL OR quota_mb <= 0 OR uploaded_bytes + $2 <= quota_mb::bigint * 1048576)
     RETURNING uploaded_bytes`,
    [link.id, Math.max(0, Math.round(bytes))]
  );
  return rows.length > 0;
}

export async function releaseQuota(link, bytes) {
  await query(`UPDATE drive_links SET uploaded_bytes = GREATEST(0, uploaded_bytes - $2) WHERE id = $1`, [link.id, Math.max(0, Math.round(bytes))]);
}

export async function recordUpload(link, visitor, { path, name, size, ip }) {
  await query(
    `INSERT INTO drive_link_uploads (link_id, session_id, path, name, size, visitor_name, visitor_email, ip) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [link.id, visitor.sid, path, String(name).slice(0, 255), Math.max(0, Math.round(size || 0)), visitor.name, visitor.email, ip ? String(ip).slice(0, 64) : null]
  );
}

/** What this visitor session uploaded (paths relative to the link root). */
export async function myUploads(link, visitor) {
  if (!visitor?.sid) return [];
  const { rows } = await query(
    `SELECT path, name, size, at FROM drive_link_uploads WHERE link_id = $1 AND session_id = $2 ORDER BY at DESC LIMIT 500`,
    [link.id, visitor.sid]
  );
  return rows.map((row) => ({ name: row.name, path: link.path ? row.path.slice(link.path.length + 1) : row.path, size: Number(row.size), at: row.at }));
}
