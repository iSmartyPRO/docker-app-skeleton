import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../config/app.js';
import { query } from '../../config/database.js';
import { requestAs } from '../../api/events.js';
import { LEVEL, contextFromRequest, httpError } from '../shared/acl.js';
import { chainOf, nodeAccess, requireNode } from './access.js';
import { filesSettings } from './service.js';

/*
 * Public links: /l/<token> opens a file or a folder (and everything inside it)
 * to anyone with the link. Optional password and expiry, downloads can be
 * switched off. Changing the password or revoking bumps `version`, which
 * invalidates visitor tokens already issued.
 */

const DAY = 24 * 60 * 60 * 1000;
const secret = () => `${config.auth.jwtSecret || 'dev-secret'}:files-link`;

function linkShape(row) {
  const now = Date.now();
  return {
    id: row.id,
    token: row.token,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    allowDownload: row.allow_download,
    views: row.view_count,
    revoked: Boolean(row.revoked_at),
    expired: Boolean(row.expires_at && new Date(row.expires_at).getTime() < now),
    createdAt: row.created_at,
  };
}

async function guard(ctx, nodeId) {
  const access = await requireNode(ctx, nodeId, LEVEL.view);
  if (!access.owner) throw httpError(403, 'Only the owner can publish links', 'FORBIDDEN');
  if (access.trashed) throw httpError(400, 'The file is in the trash', 'TRASHED');
  return access;
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

export async function listLinks(ctx, nodeId) {
  const access = await guard(ctx, nodeId);
  const { rows } = await query(`SELECT * FROM fs_links WHERE node_id = $1 ORDER BY id DESC`, [access.node.id]);
  return rows.map(linkShape);
}

export async function createLink(ctx, nodeId, input = {}) {
  const access = await guard(ctx, nodeId);
  const settings = await filesSettings();
  if (!settings.publicLinks) throw httpError(403, 'Public links are disabled', 'LINKS_DISABLED');
  const password = String(input.password || '');
  if (settings.requireLinkPassword && !password) throw httpError(400, 'A password is required', 'PASSWORD_REQUIRED');
  if (password && password.length < 4) throw httpError(400, 'The password is too short', 'PASSWORD_SHORT');
  const { rows } = await query(
    `INSERT INTO fs_links (node_id, token, password_hash, expires_at, allow_download, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      access.node.id,
      randomBytes(9).toString('base64url'),
      password ? await bcrypt.hash(password.slice(0, 200), 10) : null,
      parseExpiry(input.expiresAt, settings.maxLinkDays),
      input.allowDownload !== false,
      ctx.userId,
    ]
  );
  return linkShape(rows[0]);
}

async function ownLink(ctx, id) {
  const { rows } = await query(`SELECT * FROM fs_links WHERE id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  await guard(ctx, rows[0].node_id);
  return rows[0];
}

export async function updateLink(ctx, id, input = {}) {
  const link = await ownLink(ctx, id);
  const settings = await filesSettings();
  const sets = [];
  const values = [link.id];
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
  if (typeof input.revoked === 'boolean') {
    set('revoked_at = ?', input.revoked ? new Date() : null);
    bump = true;
  }
  if (bump) sets.push('version = version + 1');
  if (sets.length) await query(`UPDATE fs_links SET ${sets.join(', ')} WHERE id = $1`, values);
  const { rows } = await query(`SELECT * FROM fs_links WHERE id = $1`, [link.id]);
  return linkShape(rows[0]);
}

export async function deleteLink(ctx, id) {
  const link = await ownLink(ctx, id);
  await query(`DELETE FROM fs_links WHERE id = $1`, [link.id]);
}

// ── Visitors ────────────────────────────────────────────────────────────────

function issue(link) {
  return jwt.sign({ lid: link.id, v: link.version }, secret(), { expiresIn: '12h' });
}

/**
 * The live link for a token, checking revocation, expiry, the author (still
 * active and still allowed to publish the node), password and the trash.
 */
export async function resolveLink(token, visitorToken) {
  const settings = await filesSettings();
  const { rows } = await query(
    `SELECT l.*, n.kind, n.name, u.is_active AS author_active, u.is_blocked AS author_blocked
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
  if (!(await nodeAccess(contextFromRequest(author, 'files.admin'), link.node_id)).owner) {
    throw httpError(403, 'The author no longer has access to this file', 'OWNER_NO_ACCESS');
  }
  const chain = await chainOf(link.node_id);
  if (chain.some((row) => row.deleted_at)) throw httpError(404, 'This link does not exist', 'NOT_FOUND');
  if (link.password_hash) {
    let ok = false;
    try {
      const payload = jwt.verify(String(visitorToken || ''), secret());
      ok = payload.lid === link.id && payload.v === link.version;
    } catch {
      ok = false;
    }
    if (!ok) {
      const error = httpError(401, 'This link is protected by a password', 'PASSWORD_REQUIRED');
      error.details = { name: link.kind === 'folder' ? link.name : null };
      throw error;
    }
  }
  return link;
}

export async function unlockLink(token, password) {
  const { rows } = await query(`SELECT * FROM fs_links WHERE token = $1 AND revoked_at IS NULL`, [String(token || '')]);
  const link = rows[0];
  if (!link || !link.created_by) throw httpError(404, 'This link does not exist', 'NOT_FOUND');
  if (!link.password_hash) return { token: null };
  if (!(await bcrypt.compare(String(password || ''), link.password_hash))) throw httpError(401, 'Wrong password', 'WRONG_PASSWORD');
  return { token: issue(link) };
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
