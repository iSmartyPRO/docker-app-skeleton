import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../config/app.js';
import { query } from '../../config/database.js';
import { requestAs } from '../../api/events.js';
import { LEVEL, contextFromRequest, httpError, loadAccess, requireLevel } from './access.js';
import { kbSettings } from './files.js';
import { slugify } from '../shared/slug.js';

/*
 * Public links: /s/<slug> opens a folder (and everything that inherits from it)
 * for anyone with the link. Optional password and expiry. Changing the password
 * or revoking bumps `version`, which invalidates issued visitor tokens.
 */

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;
const RESERVED = new Set([
  'api', 'app', 'apps', 'admin', 'account', 'login', 'logout', 'setup', 'auth', 'assets', 'uploads',
  'health', 'ready', 's', 'share', 'shares', 'static', 'public', 'new', 'edit', 'settings', 'help',
]);



export { slugify };

export function slugProblem(slug) {
  if (!SLUG.test(slug)) return 'FORMAT';
  if (RESERVED.has(slug)) return 'RESERVED';
  if (slug.includes('--')) return 'FORMAT';
  return null;
}

/** Availability with a free alternative ("onboarding" → "onboarding-2"). */
export async function checkSlug(raw, excludeId = null) {
  const slug = String(raw || '').trim().toLowerCase();
  const problem = slugProblem(slug);
  const taken = async (candidate) =>
    (await query(`SELECT 1 FROM kb_shares WHERE slug = $1 AND id IS DISTINCT FROM $2`, [candidate, excludeId])).rows
      .length > 0;
  if (problem) return { slug, available: false, reason: problem };
  if (!(await taken(slug))) return { slug, available: true };
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${slug.slice(0, 60)}-${n}`;
    if (!(await taken(candidate))) return { slug, available: false, reason: 'TAKEN', suggestion: candidate };
  }
  return { slug, available: false, reason: 'TAKEN' };
}

function shareShape(row) {
  return {
    id: row.id,
    folderId: row.folder_id,
    slug: row.slug,
    title: row.title || '',
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    allowDownload: row.allow_download,
    viewCount: row.view_count,
    lastViewedAt: row.last_viewed_at,
    revoked: Boolean(row.revoked_at),
    expired: Boolean(row.expires_at && new Date(row.expires_at) < new Date()),
    createdAt: row.created_at,
    createdBy: row.created_by_name || null,
  };
}

async function assertSharing(ctx, folderId) {
  const { module } = await kbSettings();
  if (!module.publicLinks) throw httpError(403, 'Public links are turned off', 'SHARING_DISABLED');
  const access = await loadAccess(ctx);
  requireLevel(access.folderLevel(folderId), LEVEL.manage, 'sharing of this folder');
  return module;
}

function expiryFrom(input, module) {
  let expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw httpError(400, 'Invalid expiry date');
  if (expiresAt && expiresAt < new Date()) throw httpError(400, 'Expiry must be in the future');
  if (module.maxShareDays > 0) {
    const limit = new Date(Date.now() + module.maxShareDays * 86400000);
    if (!expiresAt || expiresAt > limit) {
      throw httpError(400, `Links can live at most ${module.maxShareDays} days`, 'EXPIRY_LIMIT');
    }
  }
  return expiresAt;
}

export async function listShares(ctx, folderId) {
  await assertSharing(ctx, folderId);
  const result = await query(
    `SELECT s.*, COALESCE(u.display_name, u.username) AS created_by_name
     FROM kb_shares s LEFT JOIN users u ON u.id = s.created_by
     WHERE s.folder_id = $1 ORDER BY s.revoked_at NULLS FIRST, s.created_at DESC`,
    [folderId]
  );
  return result.rows.map(shareShape);
}

export async function createShare(ctx, folderId, input) {
  const module = await assertSharing(ctx, folderId);
  const check = await checkSlug(input.slug);
  if (!check.available) {
    throw httpError(409, check.reason === 'TAKEN' ? 'This link name is taken' : 'Invalid link name', `SLUG_${check.reason}`);
  }
  const password = String(input.password || '');
  if (module.requireSharePassword && !password) throw httpError(400, 'A password is required for public links', 'PASSWORD_REQUIRED');
  if (password && password.length < 4) throw httpError(400, 'Password must be at least 4 characters');
  const result = await query(
    `INSERT INTO kb_shares (folder_id, slug, title, password_hash, expires_at, allow_download, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      folderId,
      check.slug,
      String(input.title || '').trim().slice(0, 120) || null,
      password ? await bcrypt.hash(password, 10) : null,
      expiryFrom(input, module),
      input.allowDownload !== false,
      ctx.userId,
    ]
  );
  return shareShape(result.rows[0]);
}

export async function updateShare(ctx, id, input) {
  const current = (await query(`SELECT * FROM kb_shares WHERE id = $1`, [id])).rows[0];
  if (!current) throw httpError(404, 'Not found', 'NOT_FOUND');
  const module = await assertSharing(ctx, current.folder_id);

  let slug = current.slug;
  if (input.slug !== undefined && input.slug !== current.slug) {
    const check = await checkSlug(input.slug, id);
    if (!check.available) {
      throw httpError(409, check.reason === 'TAKEN' ? 'This link name is taken' : 'Invalid link name', `SLUG_${check.reason}`);
    }
    slug = check.slug;
  }
  let passwordHash = current.password_hash;
  let bump = false;
  if (input.removePassword) {
    if (module.requireSharePassword) throw httpError(400, 'A password is required for public links', 'PASSWORD_REQUIRED');
    passwordHash = null;
    bump = true;
  } else if (input.password) {
    if (String(input.password).length < 4) throw httpError(400, 'Password must be at least 4 characters');
    passwordHash = await bcrypt.hash(String(input.password), 10);
    bump = true;
  }
  const expiresAt = input.expiresAt !== undefined ? expiryFrom(input, module) : current.expires_at;
  const revoke = input.revoked === true && !current.revoked_at;
  const restore = input.revoked === false && current.revoked_at;
  const result = await query(
    `UPDATE kb_shares SET slug = $2, title = $3, password_hash = $4, expires_at = $5, allow_download = $6,
       revoked_at = CASE WHEN $7 THEN NOW() WHEN $8 THEN NULL ELSE revoked_at END,
       version = version + $9, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      id,
      slug,
      input.title !== undefined ? String(input.title).trim().slice(0, 120) || null : current.title,
      passwordHash,
      expiresAt,
      typeof input.allowDownload === 'boolean' ? input.allowDownload : current.allow_download,
      revoke,
      Boolean(restore),
      bump || revoke ? 1 : 0,
    ]
  );
  return shareShape(result.rows[0]);
}

export async function deleteShare(ctx, id) {
  const current = (await query(`SELECT folder_id FROM kb_shares WHERE id = $1`, [id])).rows[0];
  if (!current) throw httpError(404, 'Not found', 'NOT_FOUND');
  await assertSharing(ctx, current.folder_id);
  await query(`DELETE FROM kb_shares WHERE id = $1`, [id]);
}

// ── Public side ─────────────────────────────────────────────────────────────

function shareSecret() {
  return `${config.auth.jwtSecret || 'dev'}:kb-share`;
}

export function issueShareToken(share) {
  return jwt.sign({ sid: share.id, v: share.version }, shareSecret(), { expiresIn: '12h' });
}

/**
 * A link lives only while its author does (as for Files links): a deleted,
 * deactivated or blocked author, or one who no longer manages the folder,
 * takes the link down. Links of active managers are unaffected.
 */
async function assertAuthor(row) {
  const gone = () => httpError(410, 'The author of this link no longer works with the company', 'OWNER_INACTIVE');
  if (!row.created_by) throw gone();
  const author = await requestAs(row.created_by);
  if (!author) throw gone();
  const access = await loadAccess(contextFromRequest(author));
  if (access.folderLevel(row.folder_id) < LEVEL.manage) {
    throw httpError(403, 'The author no longer has access to this folder', 'OWNER_NO_ACCESS');
  }
}

/**
 * Resolves /s/<slug> for a visitor. Errors carry codes the public page shows
 * nicely: NOT_FOUND, EXPIRED, PASSWORD_REQUIRED.
 */
export async function resolveShare(slug, token) {
  const { module } = await kbSettings();
  const row = (await query(`SELECT * FROM kb_shares WHERE slug = $1`, [String(slug || '').toLowerCase()])).rows[0];
  if (!row || row.revoked_at || !module.publicLinks) throw httpError(404, 'This link does not exist', 'NOT_FOUND');
  if (row.expires_at && new Date(row.expires_at) < new Date()) throw httpError(410, 'This link has expired', 'EXPIRED');
  await assertAuthor(row);
  if (row.password_hash) {
    let ok = false;
    try {
      const payload = jwt.verify(String(token || ''), shareSecret());
      ok = payload.sid === row.id && payload.v === row.version;
    } catch {
      ok = false;
    }
    if (!ok) {
      const error = httpError(401, 'This link is protected by a password', 'PASSWORD_REQUIRED');
      error.share = { title: row.title, slug: row.slug };
      throw error;
    }
  }
  return row;
}

export async function unlockShare(slug, password) {
  const row = (await query(`SELECT * FROM kb_shares WHERE slug = $1`, [String(slug || '').toLowerCase()])).rows[0];
  if (!row || row.revoked_at) throw httpError(404, 'This link does not exist', 'NOT_FOUND');
  if (row.expires_at && new Date(row.expires_at) < new Date()) throw httpError(410, 'This link has expired', 'EXPIRED');
  if (!row.password_hash) return { token: null };
  const ok = await bcrypt.compare(String(password || ''), row.password_hash);
  if (!ok) throw httpError(401, 'Wrong password', 'WRONG_PASSWORD');
  return { token: issueShareToken(row) };
}

export async function countView(share) {
  await query(`UPDATE kb_shares SET view_count = view_count + 1, last_viewed_at = NOW() WHERE id = $1`, [share.id]);
}

export { shareShape };
