import { createHash, randomBytes } from 'crypto';
import { query } from '../config/database.js';
import { parseUserAgent } from './userAgent.js';

/*
 * Sign-in sessions. The cookie stays a signed JWT; its `sid` claim names a row
 * here, so every device is listed with its details and can be ended on its own.
 * Tokens issued before sessions existed carry no `sid`: they get a row on their
 * next request (method 'legacy', id derived from the token) and keep working.
 */

export const TOUCH_INTERVAL_MS = 60_000;
export const PURGE_AFTER_DAYS = 30;
const CLIENTS = new Set(['pwa', 'browser']);

export async function ensureSessionTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(40) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      ip TEXT,
      first_ip TEXT,
      user_agent TEXT,
      platform_version VARCHAR(32),
      client VARCHAR(16),
      clients TEXT[] NOT NULL DEFAULT '{}',
      method VARCHAR(32),
      impersonated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      token_version INTEGER NOT NULL DEFAULT 0
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id, revoked_at, expires_at)`);
}

export function newSessionId() {
  return randomBytes(16).toString('hex');
}

/** Stable id for a token issued before sessions existed (32 chars, never a valid random id prefix clash in practice). */
export function legacySessionId(token) {
  return `l${createHash('sha256').update(String(token)).digest('hex').slice(0, 31)}`;
}

/** 'pwa' | 'browser' | null from the X-Client-Mode header the portal sends. */
export function clientMode(req) {
  const value = String(req?.headers?.['x-client-mode'] || '').trim().toLowerCase();
  return CLIENTS.has(value) ? value : null;
}

function platformVersion(req) {
  const value = String(req?.headers?.['x-client-platform-version'] || '').trim();
  return /^[\d.]{1,20}$/.test(value) ? value : null;
}

/** What the request tells about the device. */
export function requestDetails(req) {
  return {
    ip: String(req?.clientIp || req?.ip || '').replace(/^::ffff:/, '') || null,
    userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 512) || null,
    client: clientMode(req),
    platformVersion: platformVersion(req),
  };
}

/** 'missing' | 'revoked' | 'expired' | 'active' */
export function sessionState(row, now = new Date()) {
  if (!row) return 'missing';
  if (row.revoked_at) return 'revoked';
  if (new Date(row.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export async function createSession({ id = newSessionId(), userId, expiresAt, createdAt, method, impersonatedBy = null, tokenVersion = 0, ip, userAgent, client, platformVersion: hint }) {
  const result = await query(
    `INSERT INTO user_sessions (id, user_id, created_at, last_seen_at, expires_at, ip, first_ip, user_agent, platform_version, client, clients, method, impersonated_by, token_version)
     VALUES ($1, $2, COALESCE($3, NOW()), NOW(), $4, $5, $5, $6, $7, $8, $9, $10, (SELECT id FROM users WHERE id = $11::int), $12)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [id, userId, createdAt || null, expiresAt, ip || null, userAgent || null, hint || null, client || null, client ? [client] : [], method || null, impersonatedBy || null, Number(tokenVersion || 0)]
  );
  return result.rows[0] || (await getSession(id));
}

export async function getSession(id) {
  if (!id) return null;
  const result = await query(`SELECT * FROM user_sessions WHERE id = $1`, [String(id)]);
  return result.rows[0] || null;
}

// ── Last activity, written at most once a minute per session ──────────────────

const touched = new Map();

/** True when the session's activity should be written now (and remembers it). */
export function shouldTouch(id, client, now = Date.now(), memory = touched) {
  const last = memory.get(id);
  if (last && now - last.at < TOUCH_INTERVAL_MS && (!client || last.client === client)) return false;
  if (memory.size > 5000) {
    for (const [key, value] of memory) if (now - value.at > TOUCH_INTERVAL_MS) memory.delete(key);
  }
  memory.set(id, { at: now, client: client || last?.client || null });
  return true;
}

export async function touchSession(id, details) {
  if (!shouldTouch(id, details.client)) return;
  await query(
    `UPDATE user_sessions
        SET last_seen_at = NOW(),
            ip = COALESCE($2, ip),
            client = COALESCE($3, client),
            clients = CASE WHEN $3::text IS NULL OR $3 = ANY(clients) THEN clients ELSE array_append(clients, $3::text) END,
            platform_version = COALESCE($4, platform_version),
            user_agent = COALESCE($5, user_agent)
      WHERE id = $1`,
    [id, details.ip || null, details.client || null, details.platformVersion || null, details.userAgent || null]
  );
}

// ── Ending sessions ───────────────────────────────────────────────────────────

/** Ends one session; with `userId`, only when it belongs to that user. Returns true when one was ended. */
export async function revokeSessionById(id, userId) {
  if (!id) return false;
  const params = [String(id)];
  let where = 'id = $1 AND revoked_at IS NULL';
  if (userId !== undefined) {
    params.push(Number(userId));
    where += ' AND user_id = $2';
  }
  const result = await query(`UPDATE user_sessions SET revoked_at = NOW() WHERE ${where}`, params);
  touched.delete(String(id));
  return result.rowCount > 0;
}

/**
 * Ends every session of the user, except `exceptId` when given — including the
 * "sign in as" sessions the user started as an administrator.
 */
export async function revokeUserSessions(userId, { exceptId = null } = {}) {
  const result = await query(
    `UPDATE user_sessions SET revoked_at = NOW()
      WHERE (user_id = $1 OR impersonated_by = $1) AND revoked_at IS NULL AND ($2::text IS NULL OR id <> $2)`,
    [Number(userId), exceptId]
  );
  return result.rowCount;
}

/** Ends the "sign in as" sessions an administrator started (signed out, blocked, disabled). */
export async function revokeImpersonationsBy(adminId, client = { query }) {
  const result = await client.query(
    `UPDATE user_sessions SET revoked_at = NOW() WHERE impersonated_by = $1 AND revoked_at IS NULL`,
    [Number(adminId)]
  );
  return result.rowCount;
}

/** The current session got a new cookie (new token_version / lifetime). */
export async function renewSession(id, { tokenVersion, expiresAt }) {
  await query(`UPDATE user_sessions SET token_version = $2, expires_at = $3 WHERE id = $1`, [id, Number(tokenVersion || 0), expiresAt]);
}

/**
 * True while a session cookie may still be used (for restoring the
 * administrator's own cookie after "sign in as").
 */
export async function isTokenSessionActive(payload) {
  if (!payload?.sid) return true;
  const row = await getSession(payload.sid);
  return sessionState(row) === 'active' && Number(row.user_id) === Number(payload.sub);
}

// ── Listing ───────────────────────────────────────────────────────────────────

/** API shape of one session row. */
export function presentSession(row, currentId = null) {
  const clients = (row.clients || []).filter((value) => CLIENTS.has(value));
  return {
    id: row.id,
    current: Boolean(currentId) && row.id === currentId,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    ip: row.ip || null,
    firstIp: row.first_ip || null,
    client: CLIENTS.has(row.client) ? row.client : 'browser',
    clients,
    device: parseUserAgent(row.user_agent, { platformVersion: row.platform_version }),
    method: row.method || null,
    impersonatedBy: row.impersonated_by
      ? { id: row.impersonated_by, name: row.impersonator_name || row.impersonator_username || `#${row.impersonated_by}` }
      : null,
  };
}

/**
 * Active sessions of the user, latest activity first. Sessions whose cookies
 * were cut off by a token_version bump (password change, roles changed) are
 * no longer usable and are left out.
 */
export async function listUserSessions(userId, { currentId = null } = {}) {
  const result = await query(
    `SELECT s.*, a.display_name AS impersonator_name, a.username AS impersonator_username
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN users a ON a.id = s.impersonated_by
      WHERE s.user_id = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
        AND s.token_version = u.token_version
      ORDER BY (s.id = $2) DESC, s.last_seen_at DESC
      LIMIT 200`,
    [Number(userId), currentId || '']
  );
  return result.rows.map((row) => presentSession(row, currentId));
}

/**
 * Housekeeping: rows ended or expired more than PURGE_AFTER_DAYS ago. A
 * revoked row of a token from before sessions (id 'l…', no `sid` claim) is the
 * only thing keeping that token out — without it the next request would make a
 * fresh active row — so it stays until the token itself has expired.
 */
export async function purgeSessions() {
  await query(
    `DELETE FROM user_sessions
      WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - make_interval(days => $1)
             AND (id NOT LIKE 'l%' OR expires_at < NOW()))
         OR expires_at < NOW() - make_interval(days => $1)`,
    [PURGE_AFTER_DAYS]
  );
}
