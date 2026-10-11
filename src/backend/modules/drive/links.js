import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../config/app.js';
import { query } from '../../config/database.js';
import { httpError, intId } from '../shared/acl.js';
import { parseExpiry } from '../files/links.js';
import { driveSettings } from './credentials.js';
import { cleanPath, joinPath, nameOf } from './paths.js';
import { contextForUser, openTarget, statEntry } from './service.js';

/*
 * Public links to drive files and folders: /d/<token>.
 *
 * A link has no access of its own. Every visit acts with its author's
 * credentials, so it works only while the author
 *   - is an active, unblocked portal user,
 *   - can still see that drive folder and open the item on the file server
 *     (AD groups, NTFS rights — re-checked by the server on every request),
 *   - and has working credentials.
 * When an employee leaves, all their links stop at once, with a clear page.
 */

const secret = () => `${config.auth.jwtSecret || 'dev-secret'}:drive-link`;

function linkStatus(row) {
  if (row.revoked_at) return 'revoked';
  if (row.owner_active === false || row.owner_blocked === true) return 'owner_inactive';
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  return 'active';
}

export function linkShape(row) {
  return {
    id: row.id,
    token: row.token,
    shareId: row.share_id,
    shareTitle: row.share_title,
    path: row.path,
    kind: row.kind,
    name: row.name,
    audience: row.audience,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    allowDownload: row.allow_download,
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

export async function createLink(ctx, shareId, rel, input = {}) {
  const settings = await driveSettings();
  if (!settings.publicLinks) throw httpError(403, 'Links are disabled', 'LINKS_DISABLED');
  const target = await openTarget(ctx, shareId, { settings });
  if (!target.share.allow_links) throw httpError(403, 'Links are disabled for this folder', 'LINKS_DISABLED');
  const path = cleanPath(rel);
  const { entry } = await statEntry(target, path);
  const password = String(input.password || '');
  if (settings.requireLinkPassword && !password) throw httpError(400, 'A password is required', 'PASSWORD_REQUIRED');
  if (password && password.length < 4) throw httpError(400, 'The password is too short', 'PASSWORD_SHORT');
  const { rows } = await query(
    `INSERT INTO drive_links (token, share_id, path, kind, name, created_by, audience, password_hash, expires_at, allow_download)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      randomBytes(12).toString('base64url'),
      target.share.id,
      path,
      entry.dir ? 'dir' : 'file',
      path ? nameOf(path) : target.share.title,
      ctx.userId,
      await audienceFor(input.audience, settings),
      password ? await bcrypt.hash(password.slice(0, 200), 10) : null,
      parseExpiry(input.expiresAt, settings.maxLinkDays),
      input.allowDownload !== false,
    ]
  );
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
  if (input.password !== undefined) {
    const password = String(input.password || '');
    if (!password && settings.requireLinkPassword) throw httpError(400, 'A password is required', 'PASSWORD_REQUIRED');
    if (password && password.length < 4) throw httpError(400, 'The password is too short', 'PASSWORD_SHORT');
    set('password_hash = ?', password ? await bcrypt.hash(password.slice(0, 200), 10) : null);
    bump = true;
  }
  if (input.expiresAt !== undefined) set('expires_at = ?', parseExpiry(input.expiresAt, settings.maxLinkDays));
  if (typeof input.allowDownload === 'boolean') set('allow_download = ?', input.allowDownload);
  if (input.audience !== undefined) set('audience = ?', await audienceFor(input.audience, settings));
  if (typeof input.revoked === 'boolean') {
    set('revoked_at = ?', input.revoked ? new Date() : null);
    bump = true;
  }
  if (bump) sets.push('version = version + 1');
  if (sets.length) {
    values.push(row.id);
    await query(`UPDATE drive_links SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  }
  return (await loadLink(row.id)).shape;
}

export async function deleteLink(ctx, id) {
  const { row } = await ownedLink(ctx, id);
  await query(`DELETE FROM drive_links WHERE id = $1`, [row.id]);
  return row;
}

// ── Visitors ────────────────────────────────────────────────────────────────

function fail(status, code, message, details) {
  const error = httpError(status, message, code);
  if (details) error.details = details;
  return error;
}

export async function unlockLink(token, password) {
  const { rows } = await query(`SELECT * FROM drive_links WHERE token = $1 AND revoked_at IS NULL`, [String(token || '')]);
  const link = rows[0];
  if (!link) throw fail(404, 'NOT_FOUND', 'This link does not exist');
  if (!link.password_hash) return { token: null };
  if (!(await bcrypt.compare(String(password || ''), link.password_hash))) throw fail(401, 'WRONG_PASSWORD', 'Wrong password');
  return { token: jwt.sign({ lid: link.id, v: link.version }, secret(), { expiresIn: '12h' }) };
}

/**
 * Everything a visit needs, or a coded error the public page explains:
 * NOT_FOUND, REVOKED, EXPIRED, OWNER_INACTIVE, LINKS_DISABLED, SIGN_IN_REQUIRED,
 * PASSWORD_REQUIRED, OWNER_NO_ACCESS, UNAVAILABLE.
 */
export async function openLink(token, visitorToken, viewer) {
  const settings = await driveSettings();
  const { rows } = await query(`${SELECT} WHERE l.token = $1`, [String(token || '').slice(0, 40)]);
  const row = rows[0];
  if (!row) throw fail(404, 'NOT_FOUND', 'This link does not exist');
  const status = linkStatus(row);
  if (status === 'revoked') throw fail(410, 'REVOKED', 'This link was turned off by its author');
  if (status === 'owner_inactive') throw fail(410, 'OWNER_INACTIVE', 'The author of this link no longer works with the company');
  if (status === 'expired') throw fail(410, 'EXPIRED', 'This link has expired', { expiredAt: row.expires_at });
  if (!settings.publicLinks) throw fail(403, 'LINKS_DISABLED', 'Links are turned off');

  const { rows: shareRows } = await query(`SELECT allow_links FROM drive_shares WHERE id = $1`, [row.share_id]);
  if (!shareRows[0]?.allow_links) throw fail(403, 'LINKS_DISABLED', 'Links are turned off for this folder');

  const audience = settings.linkAudience === 'employees' ? 'employees' : row.audience;
  if (audience === 'employees' && !viewer) throw fail(401, 'SIGN_IN_REQUIRED', 'Sign in to open this link', { name: row.name });

  if (row.password_hash) {
    let ok = false;
    try {
      const payload = jwt.verify(String(visitorToken || ''), secret());
      ok = payload.lid === row.id && payload.v === row.version;
    } catch {
      ok = false;
    }
    if (!ok) throw fail(401, 'PASSWORD_REQUIRED', 'This link is protected by a password', { name: row.name, kind: row.kind });
  }

  // Act as the author: visibility, credentials and server rights are theirs.
  const ownerCtx = await contextForUser(row.created_by);
  let target;
  try {
    target = await openTarget(ownerCtx, row.share_id, { settings });
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw fail(403, 'OWNER_NO_ACCESS', 'The author no longer has access to these files');
    throw fail(503, 'UNAVAILABLE', 'The files are temporarily unavailable');
  }
  return { link: row, target, audience };
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
    return fail(503, 'UNAVAILABLE', 'The files are temporarily unavailable');
  }
  return err;
}

export async function countView(link) {
  await query(`UPDATE drive_links SET view_count = view_count + 1, last_viewed_at = NOW() WHERE id = $1`, [link.id]);
}

