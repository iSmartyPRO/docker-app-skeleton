import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../config/app.js';
import { query } from '../../config/database.js';
import { requestAs } from '../../api/events.js';
import { LEVEL, avatarOf, contextFromRequest, httpError } from '../shared/acl.js';
import { chainOf, nodeAccess, requireNode } from './access.js';
import { filesSettings } from './service.js';

/*
 * Public links: /l/<token> opens a file or a folder (and everything inside it)
 * to anyone with the link. Optional password and expiry.
 *
 * Each link carries a set of permissions (the same keys as the shared picker
 * components/ui/LinkPermissions.jsx):
 *   view, download                         — reading
 *   upload, mkdir, rename, replace, delete — writing (folder links; a file
 *                                            link can only be replaced)
 * A folder link with `upload` but no `view` is an upload-only drop box: the
 * visitor sees only what they uploaded in their own session.
 *
 * What a link may do is decided on every request, not only when it is made:
 *   link permissions ∩ what its author may still grant on the node
 *   (view rights → view/download; edit rights → also the writes)
 *   ∩ the module settings (write links on/off, password required for writes).
 *
 * Visitor tokens are JWTs bound to the link id and its version. Changing the
 * password or revoking bumps the version, so every token already issued (and
 * with it every visitor session) stops working.
 */

const DAY = 24 * 60 * 60 * 1000;
const secret = () => `${config.auth.jwtSecret || 'dev-secret'}:files-link`;

export const PERMISSION_KEYS = ['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete'];
export const WRITE_KEYS = ['upload', 'mkdir', 'rename', 'replace', 'delete'];
const FOLDER_ONLY = new Set(['upload', 'mkdir', 'rename', 'delete']);
const NEEDS_VIEW = ['download', 'mkdir', 'rename', 'replace', 'delete'];

/** Known keys only; folder-only keys dropped for files; all but upload need view; never empty. */
export function normalizePermissions(perms, isFolder = true) {
  const set = new Set((Array.isArray(perms) ? perms : []).filter((key) => PERMISSION_KEYS.includes(key)));
  if (!isFolder) FOLDER_ONLY.forEach((key) => set.delete(key));
  if (!set.has('view')) NEEDS_VIEW.forEach((key) => set.delete(key));
  if (!set.size) set.add('view');
  return PERMISSION_KEYS.filter((key) => set.has(key));
}

export const hasWrites = (perms) => perms.some((key) => WRITE_KEYS.includes(key));

/** What someone with `level` on a node may put on a link to it. */
export function grantable(level, settings, isFolder = true) {
  if (level < LEVEL.view) return [];
  const keys = ['view', 'download'];
  if (level >= LEVEL.edit && settings.writeLinks !== false) keys.push(...WRITE_KEYS);
  return keys.filter((key) => isFolder || !FOLDER_ONLY.has(key));
}

/**
 * What a link may do right now: its permissions, narrowed by what the author
 * may still grant and by the module settings. Upload-only stays upload-only
 * (it never turns into a read link); it is empty when uploads are off.
 */
export function effectivePermissions(link, authorLevel, settings) {
  const isFolder = link.kind === 'folder';
  const allowed = new Set(grantable(authorLevel, settings, isFolder));
  if (settings.requireWriteLinkPassword && !link.password_hash) WRITE_KEYS.forEach((key) => allowed.delete(key));
  const own = normalizePermissions(link.permissions, isFolder);
  const result = own.filter((key) => allowed.has(key));
  if (!result.includes('view')) return result.filter((key) => key === 'upload');
  return result;
}

/** ".pdf, JPG; docx" → ['pdf', 'jpg', 'docx'] (at most 50, letters and digits only). */
export function parseExtensions(value) {
  const list = (Array.isArray(value) ? value.join(',') : String(value || ''))
    .split(/[\s,;]+/)
    .map((item) => item.trim().replace(/^\*?\./, '').toLowerCase())
    .filter((item) => /^[a-z0-9]{1,12}$/.test(item));
  return [...new Set(list)].slice(0, 50);
}

const extensionsOf = (link) => (link.extensions ? link.extensions.split(',').filter(Boolean) : []);

function mbOrNull(value, max) {
  if (value === null || value === undefined || value === '' || value === 0) return null;
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 1) return null;
  return Math.min(number, max);
}

function linkShape(row, viewerId = null) {
  const now = Date.now();
  const permissions = normalizePermissions(row.permissions, row.kind !== 'file');
  return {
    id: row.id,
    token: row.token,
    title: row.title || '',
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    permissions,
    allowDownload: permissions.includes('download'),
    maxFileMb: row.max_file_mb || null,
    extensions: extensionsOf(row).map((ext) => `.${ext}`).join(', '),
    quotaMb: row.quota_mb || null,
    requireName: row.require_name,
    requireEmail: row.require_email,
    notify: row.notify,
    views: row.view_count,
    uploads: row.upload_count !== undefined ? Number(row.upload_count) : undefined,
    uploadedBytes: row.uploaded_bytes !== undefined ? Number(row.uploaded_bytes) : undefined,
    revoked: Boolean(row.revoked_at),
    expired: Boolean(row.expires_at && new Date(row.expires_at).getTime() < now),
    createdAt: row.created_at,
    createdBy: row.created_by ? { id: row.created_by, name: row.author_name || '' } : null,
    mine: viewerId !== null && row.created_by === viewerId,
  };
}

/**
 * Who may publish links on a node: owners and space managers always; with
 * `linkSharing: 'members'` anyone who can open it, within their own rights.
 * Returns the access record, whether they manage every link of the node
 * (owners) and the permissions they may grant.
 */
async function guard(ctx, nodeId) {
  const access = await requireNode(ctx, nodeId, LEVEL.view);
  const settings = await filesSettings();
  if (!access.owner && settings.linkSharing !== 'members') throw httpError(403, 'Only the owner can publish links', 'FORBIDDEN');
  if (access.trashed) throw httpError(400, 'The file is in the trash', 'TRASHED');
  const isFolder = access.node.kind === 'folder';
  return { access, settings, isFolder, manager: access.owner, grantable: grantable(access.level, settings, isFolder) };
}

export function parseExpiry(value, maxDays) {
  if (value === null || value === '' || value === undefined) {
    if (maxDays) return new Date(Date.now() + maxDays * DAY);
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(400, 'Invalid expiry date', 'INVALID_DATE');
  if (date.getTime() <= Date.now()) throw httpError(400, 'Expiry must be in the future', 'INVALID_DATE');
  if (maxDays && date.getTime() > Date.now() + maxDays * DAY + 60_000) {
    throw httpError(400, `Links can live at most ${maxDays} days`, 'EXPIRY_LIMIT');
  }
  return date;
}

/** Permissions from a create/update payload (older clients send only allowDownload). */
export function permissionsFromInput(input, isFolder) {
  if (Array.isArray(input.permissions)) return normalizePermissions(input.permissions, isFolder);
  if (input.allowDownload === false) return ['view'];
  return ['view', 'download'];
}

/** Throws unless every permission may be granted here. */
function checkGrant(perms, { settings, grantable: allowed }, hasPassword) {
  if (hasWrites(perms) && settings.writeLinks === false) throw httpError(403, 'Links that allow changes are turned off', 'WRITE_LINKS_DISABLED');
  const over = perms.filter((key) => !allowed.includes(key));
  if (over.length) {
    const error = httpError(403, 'You cannot grant more than you can do yourself', 'GRANT_EXCEEDED');
    error.details = { keys: over };
    throw error;
  }
  if (hasWrites(perms) && settings.requireWriteLinkPassword && !hasPassword) {
    throw httpError(400, 'Links that allow changes need a password', 'PASSWORD_REQUIRED');
  }
}

/** The per-link options shared by create and update; only keys present in input. */
function optionsFrom(input, settings) {
  const out = {};
  if (input.title !== undefined) out.title = String(input.title || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
  if (input.maxFileMb !== undefined) out.max_file_mb = mbOrNull(input.maxFileMb, settings.maxUploadMb);
  if (input.extensions !== undefined) out.extensions = parseExtensions(input.extensions).join(',') || null;
  if (input.quotaMb !== undefined) out.quota_mb = mbOrNull(input.quotaMb, 10_000_000);
  if (input.requireName !== undefined) out.require_name = Boolean(input.requireName);
  if (input.requireEmail !== undefined) out.require_email = Boolean(input.requireEmail);
  if (input.notify !== undefined) out.notify = Boolean(input.notify);
  if (out.require_email && out.require_name === false) out.require_email = false;
  return out;
}

const LIST_SELECT = `
  SELECT l.*, n.kind, COALESCE(u.display_name, u.username) AS author_name,
         (SELECT COUNT(*) FROM fs_link_events e WHERE e.link_id = l.id AND e.action = 'upload')::int AS upload_count,
         (SELECT COALESCE(SUM(e.bytes), 0) FROM fs_link_events e WHERE e.link_id = l.id)::bigint AS uploaded_bytes
  FROM fs_links l JOIN fs_nodes n ON n.id = l.node_id LEFT JOIN users u ON u.id = l.created_by`;

export async function listLinks(ctx, nodeId) {
  const scope = await guard(ctx, nodeId);
  const { rows } = await query(
    `${LIST_SELECT} WHERE l.node_id = $1 AND ($2::boolean OR l.created_by = $3) ORDER BY l.id DESC`,
    [scope.access.node.id, scope.manager, ctx.userId]
  );
  return {
    links: rows.map((row) => linkShape(row, ctx.userId)),
    grantable: scope.grantable,
    isFolder: scope.isFolder,
  };
}

async function linkById(id, viewerId) {
  const { rows } = await query(`${LIST_SELECT} WHERE l.id = $1`, [id]);
  return linkShape(rows[0], viewerId);
}

export async function createLink(ctx, nodeId, input = {}) {
  const scope = await guard(ctx, nodeId);
  const { settings } = scope;
  if (!settings.publicLinks) throw httpError(403, 'Public links are disabled', 'LINKS_DISABLED');
  const password = String(input.password || '');
  if (settings.requireLinkPassword && !password) throw httpError(400, 'A password is required', 'PASSWORD_REQUIRED');
  if (password && password.length < 4) throw httpError(400, 'The password is too short', 'PASSWORD_SHORT');
  const permissions = permissionsFromInput(input, scope.isFolder);
  checkGrant(permissions, scope, Boolean(password));
  const options = optionsFrom(input, settings);
  const { rows } = await query(
    `INSERT INTO fs_links (node_id, token, password_hash, expires_at, allow_download, permissions, title, max_file_mb, extensions, quota_mb,
                           require_name, require_email, notify, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      scope.access.node.id,
      randomBytes(9).toString('base64url'),
      password ? await bcrypt.hash(password.slice(0, 200), 10) : null,
      parseExpiry(input.expiresAt, settings.maxLinkDays),
      permissions.includes('download'),
      permissions,
      options.title ?? null,
      options.max_file_mb ?? null,
      options.extensions ?? null,
      options.quota_mb ?? null,
      options.require_name ?? false,
      options.require_email ?? false,
      options.notify ?? false,
      ctx.userId,
    ]
  );
  return linkById(rows[0].id, ctx.userId);
}

/** A link the person may manage: the node's owners manage all, others their own. */
async function ownLink(ctx, id) {
  const { rows } = await query(`SELECT l.*, n.kind FROM fs_links l JOIN fs_nodes n ON n.id = l.node_id WHERE l.id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  const scope = await guard(ctx, rows[0].node_id);
  if (!scope.manager && rows[0].created_by !== ctx.userId) throw httpError(404, 'Not found', 'NOT_FOUND');
  return { link: rows[0], scope };
}

export async function updateLink(ctx, id, input = {}) {
  const { link, scope } = await ownLink(ctx, id);
  const { settings } = scope;
  const sets = [];
  const values = [link.id];
  const set = (sql, value) => {
    values.push(value);
    sets.push(sql.replace('?', `$${values.length}`));
  };
  let bump = false;
  let hasPassword = Boolean(link.password_hash);
  if (input.password !== undefined) {
    const password = String(input.password || '');
    if (!password && settings.requireLinkPassword) throw httpError(400, 'A password is required', 'PASSWORD_REQUIRED');
    if (password && password.length < 4) throw httpError(400, 'The password is too short', 'PASSWORD_SHORT');
    set('password_hash = ?', password ? await bcrypt.hash(password.slice(0, 200), 10) : null);
    hasPassword = Boolean(password);
    bump = true;
  }
  if (input.expiresAt !== undefined) set('expires_at = ?', parseExpiry(input.expiresAt, settings.maxLinkDays));
  const touchesPermissions = Array.isArray(input.permissions) || typeof input.allowDownload === 'boolean';
  if (touchesPermissions) {
    const permissions = Array.isArray(input.permissions)
      ? normalizePermissions(input.permissions, scope.isFolder)
      : normalizePermissions(input.allowDownload ? [...link.permissions, 'download'] : link.permissions.filter((key) => key !== 'download'), scope.isFolder);
    checkGrant(permissions, scope, hasPassword);
    set('permissions = ?', permissions);
    set('allow_download = ?', permissions.includes('download'));
  } else if (input.password !== undefined && !hasPassword && hasWrites(link.permissions) && settings.requireWriteLinkPassword) {
    throw httpError(400, 'Links that allow changes need a password', 'PASSWORD_REQUIRED');
  }
  for (const [column, value] of Object.entries(optionsFrom(input, settings))) set(`${column} = ?`, value);
  if (typeof input.revoked === 'boolean') {
    set('revoked_at = ?', input.revoked ? new Date() : null);
    bump = true;
  }
  if (bump) sets.push('version = version + 1');
  if (sets.length) await query(`UPDATE fs_links SET ${sets.join(', ')} WHERE id = $1`, values);
  return linkById(link.id, ctx.userId);
}

export async function deleteLink(ctx, id) {
  const { link } = await ownLink(ctx, id);
  await query(`DELETE FROM fs_links WHERE id = $1`, [link.id]);
}

/** What visitors did through a link, newest first (owners and the link's author). */
export async function linkActivity(ctx, id) {
  const { link } = await ownLink(ctx, id);
  const { rows } = await query(
    `SELECT e.id, e.action, e.name, e.bytes, e.visitor_name, e.visitor_email, e.node_id, e.created_at,
            (n.id IS NOT NULL AND n.deleted_at IS NULL) AS present
     FROM fs_link_events e LEFT JOIN fs_nodes n ON n.id = e.node_id
     WHERE e.link_id = $1 ORDER BY e.id DESC LIMIT 200`,
    [link.id]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    action: row.action,
    name: row.name,
    bytes: Number(row.bytes) || 0,
    visitor: row.visitor_name ? { name: row.visitor_name, email: row.visitor_email || null } : null,
    nodeId: row.present ? row.node_id : null,
    at: row.created_at,
  }));
}

// ── Visitors ────────────────────────────────────────────────────────────────

/**
 * A visitor token: { lid, v, sid, pw, n, e }. `sid` names the visitor's
 * session (their own uploads, one notice per session), `pw` that it was
 * issued after the password, `n`/`e` the name and e-mail they gave.
 */
export function issueVisitor(link, { sid, pw = false, name = null, email = null } = {}) {
  return jwt.sign(
    { lid: link.id, v: link.version, sid: sid || randomBytes(12).toString('base64url'), pw: Boolean(pw), ...(name ? { n: name } : {}), ...(email ? { e: email } : {}) },
    secret(),
    { expiresIn: '12h' }
  );
}

/** The payload of a visitor token for this link and its current version, or null. */
export function readVisitor(link, visitorToken) {
  if (!visitorToken) return null;
  try {
    const payload = jwt.verify(String(visitorToken), secret());
    if (payload.lid !== link.id || payload.v !== link.version) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * The live link for a token, checking revocation, expiry, the author (still
 * active and still allowed to publish the node), password and the trash.
 * Adds `perms` (effective permissions), `visitor` (token payload or null),
 * `authorCtx` (the author's access context, used for writes) and `owner`.
 */
export async function resolveLink(token, visitorToken) {
  const settings = await filesSettings();
  const { rows } = await query(
    `SELECT l.*, n.kind, n.name, u.is_active AS author_active, u.is_blocked AS author_blocked,
            COALESCE(u.display_name, u.username) AS author_name, u.avatar_path AS author_avatar
     FROM fs_links l JOIN fs_nodes n ON n.id = l.node_id LEFT JOIN users u ON u.id = l.created_by
     WHERE l.token = $1`,
    [String(token || '')]
  );
  const link = rows[0];
  if (!link || link.revoked_at || !settings.publicLinks) throw httpError(404, 'This link does not exist', 'NOT_FOUND');
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) throw httpError(410, 'This link has expired', 'EXPIRED');
  // Deleted (created_by NULL), deactivated or blocked authors take their links with them.
  if (!link.created_by || link.author_active === false || link.author_blocked === true) {
    throw httpError(410, 'The author of this link no longer works with the company', 'OWNER_INACTIVE');
  }
  const author = await requestAs(link.created_by);
  if (!author) throw httpError(410, 'The author of this link no longer works with the company', 'OWNER_INACTIVE');
  const authorCtx = contextFromRequest(author, 'files.admin');
  const authorAccess = await nodeAccess(authorCtx, link.node_id);
  if (!(authorAccess.owner || (settings.linkSharing === 'members' && authorAccess.level >= LEVEL.view))) {
    throw httpError(403, 'The author no longer has access to this file', 'OWNER_NO_ACCESS');
  }
  const chain = await chainOf(link.node_id);
  if (chain.some((row) => row.deleted_at)) throw httpError(404, 'This link does not exist', 'NOT_FOUND');
  const visitor = readVisitor(link, visitorToken);
  if (link.password_hash && !visitor?.pw) {
    const error = httpError(401, 'This link is protected by a password', 'PASSWORD_REQUIRED');
    error.details = { name: link.kind === 'folder' ? link.name : null };
    throw error;
  }
  link.perms = effectivePermissions(link, authorAccess.level, settings);
  if (!link.perms.length) throw httpError(403, 'This link no longer allows anything', 'LINK_DISABLED');
  link.visitor = visitor;
  link.authorCtx = authorCtx;
  link.owner = { name: link.author_name || '', avatarUrl: avatarOf(link.author_avatar) };
  return link;
}

export async function unlockLink(token, password) {
  const { rows } = await query(`SELECT * FROM fs_links WHERE token = $1 AND revoked_at IS NULL`, [String(token || '')]);
  const link = rows[0];
  if (!link || !link.created_by) throw httpError(404, 'This link does not exist', 'NOT_FOUND');
  if (!link.password_hash) return { token: null };
  if (!(await bcrypt.compare(String(password || ''), link.password_hash))) throw httpError(401, 'Wrong password', 'WRONG_PASSWORD');
  return { token: issueVisitor(link, { pw: true }) };
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/**
 * Starts (or names) a visitor session on a resolved link. Keeps the session
 * id and the password mark of the current token. Name and e-mail are
 * required when the link asks for them.
 */
export function startSession(link, input = {}) {
  const name = String(input.name || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const email = String(input.email || '').trim().slice(0, 160);
  if (link.require_name && !name) throw httpError(400, 'Enter your name', 'VISITOR_NAME');
  if (email && !EMAIL.test(email)) throw httpError(400, 'Enter a valid e-mail', 'VISITOR_EMAIL');
  if (link.require_name && link.require_email && !email) throw httpError(400, 'Enter your e-mail', 'VISITOR_EMAIL');
  const current = link.visitor;
  return {
    token: issueVisitor(link, { sid: current?.sid, pw: current?.pw, name: name || current?.n || null, email: email || current?.e || null }),
    visitor: { name: name || current?.n || null, email: email || current?.e || null },
  };
}

export async function countView(link) {
  await query(`UPDATE fs_links SET view_count = view_count + 1 WHERE id = $1`, [link.id]);
}

/** A node inside the shared subtree (not in the trash), or 404. */
export async function nodeInLink(link, nodeId) {
  const id = Number(nodeId || link.node_id);
  if (!Number.isInteger(id) || id < 1) throw httpError(404, 'Not found', 'NOT_FOUND');
  const chain = await chainOf(id);
  const index = chain.findIndex((row) => row.id === link.node_id);
  if (index === -1 || chain.slice(index).some((row) => row.deleted_at)) throw httpError(404, 'Not found', 'NOT_FOUND');
  return { node: chain[chain.length - 1], crumbs: chain.slice(index, -1).map((row) => ({ id: row.id, name: row.name })) };
}

/** Public shape of a link for its visitors. */
export function visitorLinkShape(link) {
  return {
    title: link.title || '',
    allowDownload: link.perms.includes('download'),
    permissions: link.perms,
    expiresAt: link.expires_at,
    rootId: link.node_id,
    kind: link.kind,
    owner: link.owner,
    maxFileMb: link.max_file_mb || null,
    extensions: extensionsOf(link),
    quotaMb: link.quota_mb || null,
    requireName: link.require_name,
    requireEmail: link.require_email,
    visitor: link.visitor ? { name: link.visitor.n || null, email: link.visitor.e || null, session: true } : null,
  };
}
