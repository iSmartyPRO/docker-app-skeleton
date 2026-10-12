import crypto from 'node:crypto';
import { query } from '../config/database.js';
import { isValidIpOrCidr, ipMatchesRule, normalizeIp } from '../services/security.js';
import { hasPermission, isSubset } from '../services/permissions.js';
import { getUserAccess } from '../services/rbac.js';
import { avatarUrl } from '../services/users.js';
import { apiConfig } from './config.js';
import { cleanLimits, cleanRules, cleanScopes, effectivePolicy, limitsByTable } from './scopes.js';

/*
 * API tokens.
 *
 * A token looks like `pat_k3Jd9xQe_<32 random chars>`. The part before the
 * second underscore is the public prefix (shown in lists and logs, used to find
 * the row); only a SHA-256 of the whole token is stored, so a lost token
 * cannot be recovered, only rotated.
 */

export function httpError(statusCode, message, code, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (Object.keys(extra).length) error.details = extra;
  return error;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomString(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const hashOf = (token) => crypto.createHash('sha256').update(token).digest('hex');

function newSecret() {
  const prefix = `pat_${randomString(8)}`;
  const token = `${prefix}_${randomString(32)}`;
  return { prefix, token, hash: hashOf(token) };
}

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

// ── Reading ─────────────────────────────────────────────────────────────────

const TOKEN_SELECT = `
  SELECT k.*, COALESCE(u.display_name, u.username) AS user_name, u.username, u.avatar_path,
         COALESCE(c.display_name, c.username) AS creator_name,
         t.key AS template_key, t.name AS template_name, t.color AS template_color, t.icon AS template_icon,
         t.scopes AS template_scopes, t.rules AS template_rules
  FROM api_tokens k
  JOIN users u ON u.id = k.user_id
  LEFT JOIN users c ON c.id = k.created_by
  LEFT JOIN api_templates t ON t.id = k.template_id`;

export function tokenState(row) {
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && new Date(row.expires_at) < new Date()) return 'expired';
  return 'active';
}

export function tokenShape(row) {
  const template = row.template_id ? { id: row.template_id, key: row.template_key, name: row.template_name, color: row.template_color, icon: row.template_icon, scopes: row.template_scopes, rules: row.template_rules } : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    kind: row.kind,
    prefix: row.prefix,
    state: tokenState(row),
    user: { id: row.user_id, name: row.user_name, username: row.username, avatarUrl: avatarUrl(row.avatar_path) },
    createdBy: row.created_by ? { id: row.created_by, name: row.creator_name } : null,
    template,
    scopes: row.scopes || {},
    rules: row.rules || [],
    limits: row.limits || {},
    effective: effectivePolicy(template, row),
    ipAllow: row.ip_allow || [],
    rateLimit: row.rate_limit,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    lastIp: row.last_ip,
    useCount: Number(row.use_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTokens({ userId = null, state, q } = {}) {
  const params = [];
  const where = [];
  if (userId) {
    params.push(userId);
    where.push(`k.user_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${String(q).toLowerCase()}%`);
    where.push(`(LOWER(k.name) LIKE $${params.length} OR LOWER(k.prefix) LIKE $${params.length} OR LOWER(COALESCE(u.display_name, u.username)) LIKE $${params.length})`);
  }
  const { rows } = await query(`${TOKEN_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC`, params);
  const list = rows.map(tokenShape);
  return state ? list.filter((token) => token.state === state) : list;
}

export async function getToken(id, { userId = null } = {}) {
  const { rows } = await query(`${TOKEN_SELECT} WHERE k.id = $1 ${userId ? 'AND k.user_id = $2' : ''}`, userId ? [Number(id), userId] : [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Token not found', 'NOT_FOUND');
  return tokenShape(rows[0]);
}

// ── Acting for another person ───────────────────────────────────────────────

/**
 * Whether someone holding `actorPermissions` may make a credential that acts
 * as a person holding `targetPermissions`: only when the target can do
 * nothing the actor cannot (no stepping up to a superadmin's token).
 */
export function mayActFor(actorPermissions, targetPermissions) {
  return isSubset(targetPermissions, actorPermissions);
}

/**
 * Throws 403 TARGET_TOO_POWERFUL unless `actor` may make a token / webhook
 * that runs as `userId`. Acting as oneself is always fine.
 */
export async function assertMayActFor(actor, userId) {
  if (Number(userId) === Number(actor.id)) return;
  const access = await getUserAccess(Number(userId));
  if (!mayActFor(actor.permissions, access.permissions)) {
    throw httpError(403, 'This person has rights you do not hold; you cannot act on their behalf', 'TARGET_TOO_POWERFUL');
  }
}

// ── Writing ─────────────────────────────────────────────────────────────────

async function cleanInput(input, current, { config }) {
  const out = {};
  if (input.name !== undefined || !current) {
    out.name = clean(input.name, 120);
    if (!out.name) throw httpError(400, 'Name the token', 'NAME_REQUIRED');
  }
  if (input.description !== undefined) out.description = clean(input.description, 1000) || null;
  if (input.templateId !== undefined) {
    if (input.templateId === null || input.templateId === '') out.template_id = null;
    else {
      const { rows } = await query(`SELECT id FROM api_templates WHERE id = $1`, [Number(input.templateId)]);
      if (!rows[0]) throw httpError(400, 'Unknown template', 'TEMPLATE_UNKNOWN');
      out.template_id = rows[0].id;
    }
  }
  if (input.scopes !== undefined) out.scopes = JSON.stringify(cleanScopes(input.scopes, { partial: true }));
  if (input.rules !== undefined) out.rules = JSON.stringify(cleanRules(input.rules));
  if (input.limits !== undefined) out.limits = JSON.stringify(cleanLimits(input.limits));
  if (input.ipAllow !== undefined) {
    const list = (Array.isArray(input.ipAllow) ? input.ipAllow : String(input.ipAllow).split(/[\s,;]+/)).map((ip) => String(ip).trim()).filter(Boolean);
    const bad = list.find((ip) => !isValidIpOrCidr(ip));
    if (bad) throw httpError(400, `Not an IP address or network: ${bad}`, 'IP_INVALID');
    out.ip_allow = [...new Set(list)].slice(0, 50);
  }
  if (input.rateLimit !== undefined) {
    const n = Math.round(Number(input.rateLimit));
    out.rate_limit = input.rateLimit === null || input.rateLimit === '' || !n ? null : Math.min(100000, Math.max(1, n));
  }
  if (input.expiresAt !== undefined) {
    if (!input.expiresAt) out.expires_at = null;
    else {
      const date = new Date(input.expiresAt);
      if (Number.isNaN(date.getTime())) throw httpError(400, 'Invalid expiry date', 'INVALID_DATE');
      out.expires_at = date;
    }
  }
  const max = Number(config.maxLifetimeDays) || 0;
  if (max && (!current || 'expires_at' in out)) {
    const expires = 'expires_at' in out ? out.expires_at : current?.expires_at;
    const limit = new Date(Date.now() + max * 86400000 + 60000);
    if (!expires || new Date(expires) > limit) throw httpError(400, `Tokens may live at most ${max} days`, 'LIFETIME_LIMIT', { maxDays: max });
  }
  return out;
}

/**
 * Creates a token. `actor` = { id, permissions }. People without `api.admin`
 * create tokens only for themselves. Returns { token (shape), secret }.
 */
export async function createToken(actor, input = {}) {
  const config = await apiConfig();
  const admin = hasPermission(actor.permissions, 'api.admin');
  const userId = admin && input.userId ? Number(input.userId) : actor.id;
  if (!admin && !config.personalTokens) throw httpError(403, 'Personal tokens are turned off', 'PERSONAL_TOKENS_OFF');
  const { rows: users } = await query(`SELECT id, is_active FROM users WHERE id = $1`, [userId]);
  if (!users[0]) throw httpError(400, 'Unknown user', 'USER_UNKNOWN');
  await assertMayActFor(actor, userId);
  const fields = await cleanInput(input, null, { config });
  if (fields.template_id === undefined && !input.scopes) {
    const { rows } = await query(`SELECT id FROM api_templates WHERE key = 'read_only'`);
    fields.template_id = rows[0]?.id || null;
  }
  const secret = newSecret();
  const kind = userId === actor.id ? 'personal' : 'service';
  const columns = ['user_id', 'created_by', 'prefix', 'secret_hash', 'kind', ...Object.keys(fields)];
  const values = [userId, actor.id, secret.prefix, secret.hash, kind, ...Object.values(fields)];
  const { rows } = await query(
    `INSERT INTO api_tokens (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    values
  );
  return { token: await getToken(rows[0].id), secret: secret.token };
}

async function ownedRow(actor, id) {
  const admin = hasPermission(actor.permissions, 'api.admin');
  const { rows } = await query(`SELECT * FROM api_tokens WHERE id = $1`, [Number(id)]);
  if (!rows[0] || (!admin && rows[0].user_id !== actor.id)) throw httpError(404, 'Token not found', 'NOT_FOUND');
  return rows[0];
}

export async function updateToken(actor, id, input = {}) {
  const row = await ownedRow(actor, id);
  if (row.revoked_at) throw httpError(400, 'The token is revoked', 'REVOKED');
  // A token's owner never changes (userId is not editable); widening the
  // scopes or address list of a stronger person's token is acting for them.
  await assertMayActFor(actor, row.user_id);
  const fields = await cleanInput(input, row, { config: await apiConfig() });
  const keys = Object.keys(fields);
  if (keys.length) {
    await query(
      `UPDATE api_tokens SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [row.id, ...Object.values(fields)]
    );
  }
  forget(row.prefix);
  return getToken(row.id);
}

export async function revokeToken(actor, id) {
  const row = await ownedRow(actor, id);
  await query(`UPDATE api_tokens SET revoked_at = COALESCE(revoked_at, NOW()), revoked_by = $2, updated_at = NOW() WHERE id = $1`, [row.id, actor.id]);
  forget(row.prefix);
  return getToken(row.id);
}

/** A new secret for the same token; the old one stops working at once. */
export async function rotateToken(actor, id) {
  const row = await ownedRow(actor, id);
  if (row.revoked_at) throw httpError(400, 'The token is revoked', 'REVOKED');
  // The new secret goes to the actor: as good as creating a token for the owner.
  await assertMayActFor(actor, row.user_id);
  const secret = newSecret();
  await query(`UPDATE api_tokens SET prefix = $2, secret_hash = $3, updated_at = NOW() WHERE id = $1`, [row.id, secret.prefix, secret.hash]);
  forget(row.prefix);
  return { token: await getToken(row.id), secret: secret.token };
}

export async function deleteToken(actor, id) {
  const row = await ownedRow(actor, id);
  if (!row.revoked_at) throw httpError(400, 'Revoke the token before deleting it', 'NOT_REVOKED');
  await query(`DELETE FROM api_tokens WHERE id = $1`, [row.id]);
  forget(row.prefix);
}

// ── Authenticating a request ────────────────────────────────────────────────

// Only existing tokens are cached (prefixes are attacker-chosen: a miss is
// never kept), at most CACHE_MAX of them, least recently used out first.
const cache = new Map(); // prefix → { at, row }
const CACHE_MS = 15_000;
const CACHE_MAX = 1000;
function forget(prefix) {
  cache.delete(prefix);
}

async function rowByPrefix(prefix) {
  const hit = cache.get(prefix);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    cache.delete(prefix);
    cache.set(prefix, hit);
    return hit.row;
  }
  if (hit) cache.delete(prefix);
  const { rows } = await query(
    `SELECT k.*, t.scopes AS template_scopes, t.rules AS template_rules
     FROM api_tokens k LEFT JOIN api_templates t ON t.id = k.template_id WHERE k.prefix = $1`,
    [prefix]
  );
  const row = rows[0] || null;
  if (row) {
    cache.set(prefix, { at: Date.now(), row });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  return row;
}

/** Token text from `Authorization: Bearer …` or `X-API-Key`. */
export function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  const bearer = header.match(/^Bearer\s+(\S+)$/i);
  const raw = bearer ? bearer[1] : req.headers['x-api-key'];
  return raw ? String(raw).trim() : null;
}

/**
 * Resolves the token of a request.
 * → { row, policy, limits } or throws 401/403.
 */
export async function authenticate(raw, ip) {
  const match = String(raw).match(/^(pat_[A-Za-z0-9]{8})_[A-Za-z0-9]{32}$/);
  if (!match) throw httpError(401, 'The API token is not valid', 'TOKEN_INVALID');
  const row = await rowByPrefix(match[1]);
  const expected = row ? Buffer.from(row.secret_hash, 'hex') : Buffer.alloc(32);
  const given = Buffer.from(hashOf(raw), 'hex');
  if (!row || !crypto.timingSafeEqual(expected, given)) throw httpError(401, 'The API token is not valid', 'TOKEN_INVALID');
  if (row.revoked_at) throw httpError(401, 'The API token was revoked', 'TOKEN_REVOKED');
  if (row.expires_at && new Date(row.expires_at) < new Date()) throw httpError(401, 'The API token has expired', 'TOKEN_EXPIRED');
  if (row.ip_allow?.length) {
    const client = normalizeIp(ip);
    if (!row.ip_allow.some((rule) => ipMatchesRule(rule, client))) throw httpError(403, 'Requests from this address are not allowed for the token', 'IP_NOT_ALLOWED');
  }
  const policy = effectivePolicy({ scopes: row.template_scopes, rules: row.template_rules }, row);
  return { row, policy, limits: limitsByTable(row.limits) };
}

const pending = new Map(); // token id → { count, ip }
let flushTimer = null;

async function flushUsage() {
  flushTimer = null;
  const batch = [...pending.entries()];
  pending.clear();
  for (const [id, { count, ip }] of batch) {
    await query(`UPDATE api_tokens SET last_used_at = NOW(), last_ip = $2, use_count = use_count + $3 WHERE id = $1`, [id, String(ip || '').slice(0, 64), count]).catch(() => {});
  }
}

/** Usage counters, written in batches every few seconds. */
export function touchToken(row, ip) {
  const entry = pending.get(row.id) || { count: 0, ip };
  entry.count += 1;
  entry.ip = ip;
  pending.set(row.id, entry);
  if (!flushTimer) {
    flushTimer = setTimeout(flushUsage, 5000);
    flushTimer.unref?.();
  }
}

// ── Rate limit (per token, per minute) ─────────────────────────────────────

const windows = new Map(); // token id → { start, count }
export function takeRate(tokenId, limit) {
  const now = Date.now();
  const minute = Math.floor(now / 60000) * 60000;
  let entry = windows.get(tokenId);
  if (!entry || entry.start !== minute) {
    entry = { start: minute, count: 0 };
    windows.set(tokenId, entry);
  }
  entry.count += 1;
  return { ok: entry.count <= limit, remaining: Math.max(0, limit - entry.count), reset: Math.ceil((minute + 60000 - now) / 1000) };
}

// ── Failed authentication (per address, sliding window) ─────────────────────

/*
 * Bad tokens are answered before any per-token limit exists, so each address
 * gets FAIL_MAX failures per FAIL_WINDOW_MS; past that, it is answered 429
 * without touching the database. Failures are logged at most once per address
 * per minute.
 */
const FAIL_MAX = 30;
const FAIL_WINDOW_MS = 5 * 60_000;
const FAIL_LOG_MS = 60_000;
const FAIL_TRACKED = 10_000;
const failures = new Map(); // ip → { hits: [timestamps], loggedAt }

function failureEntry(ip, now) {
  const key = String(ip || '');
  const entry = failures.get(key);
  if (!entry) return null;
  while (entry.hits.length && now - entry.hits[0] >= FAIL_WINDOW_MS) entry.hits.shift();
  if (!entry.hits.length && now - entry.loggedAt >= FAIL_LOG_MS) {
    failures.delete(key);
    return null;
  }
  return entry;
}

/** → { ok } or { ok: false, retryAfter } (seconds) while the address is locked out. */
export function failedAuthState(ip, now = Date.now()) {
  const entry = failureEntry(ip, now);
  if (!entry || entry.hits.length < FAIL_MAX) return { ok: true };
  return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.hits[0] + FAIL_WINDOW_MS - now) / 1000)) };
}

/** Counts a failure; → whether this one should be written to the request log. */
export function noteFailedAuth(ip, now = Date.now()) {
  const key = String(ip || '');
  let entry = failureEntry(key, now);
  if (!entry) {
    entry = { hits: [], loggedAt: 0 };
    failures.set(key, entry);
    while (failures.size > FAIL_TRACKED) failures.delete(failures.keys().next().value);
  }
  if (entry.hits.length < FAIL_MAX) entry.hits.push(now);
  const log = now - entry.loggedAt >= FAIL_LOG_MS;
  if (log) entry.loggedAt = now;
  return log;
}

export function resetFailedAuth() {
  failures.clear();
}
