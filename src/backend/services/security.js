import { createHash } from 'crypto';
import { query } from '../config/database.js';
import { getSettings, parseSettings } from './settings.js';
import { registerJob } from './scheduler.js';
import { ensureSessionTables, purgeSessions } from './sessions.js';

export async function ensureSecurityTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS ip_rules (
      id SERIAL PRIMARY KEY,
      ip TEXT NOT NULL,
      list_type VARCHAR(16) NOT NULL,
      reason TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY,
      username TEXT,
      ip TEXT,
      success BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS security_events (
      id SERIAL PRIMARY KEY,
      kind VARCHAR(32) NOT NULL,
      severity VARCHAR(16) NOT NULL DEFAULT 'warning',
      username TEXT,
      ip TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Events written since the five-language release also carry a text code and
  // its parameters, so the activity log reads in the viewer's language
  // (frontend locales/<lang>/activity.js → detail.<code>); `detail` stays the
  // English text, shown for older rows and codes without a translation.
  await query(`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS detail_code VARCHAR(48), ADD COLUMN IF NOT EXISTS detail_params JSONB`);
  await query(`CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events (created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS security_events_kind_idx ON security_events (kind, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS login_attempts_username_idx ON login_attempts (username, created_at DESC)`);
  // Sessions ended by "Sign out": only that cookie stops working, other devices stay signed in.
  // Rows live until the token would have expired anyway.
  await query(`
    CREATE TABLE IF NOT EXISTS revoked_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  // Sign-in sessions with device details (services/sessions.js).
  await ensureSessionTables();
  registerJob({ name: 'sessions:purge', everyMs: 6 * 60 * 60 * 1000, run: purgeSessions });
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function normalizeIp(raw) {
  if (!raw) return '';
  const first = String(raw).split(',')[0].trim();
  if (first.startsWith('::ffff:')) return first.slice(7);
  if (first === '::1') return '127.0.0.1';
  return first;
}

const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6_RE = /^[0-9a-f:]+$/i;

export function isValidIpOrCidr(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 64) return false;
  if (raw.includes('/')) {
    const [base, bitsRaw] = raw.split('/');
    const bits = Number(bitsRaw);
    if (!IPV4_RE.test(base) || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    return ipv4ToInt(base) != null;
  }
  if (IPV4_RE.test(raw)) return true;
  return raw.includes(':') && IPV6_RE.test(raw) && raw.split(':').length >= 3;
}

export function ipMatchesRule(ruleIp, clientIp) {
  const rule = String(ruleIp).trim();
  const client = String(clientIp).trim();
  if (!rule || !client) return false;
  if (rule === client) return true;
  if (!rule.includes('/')) return false;

  const [base, bitsRaw] = rule.split('/');
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const baseInt = ipv4ToInt(base);
  const clientInt = ipv4ToInt(client);
  if (baseInt == null || clientInt == null) return false;
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (baseInt & mask) === (clientInt & mask);
}

export async function listIpRules(listType) {
  const result = listType
    ? await query(
        `SELECT * FROM ip_rules WHERE list_type = $1 ORDER BY id DESC`,
        [listType]
      )
    : await query(`SELECT * FROM ip_rules ORDER BY id DESC`);
  return result.rows;
}

// Same reasoning as the settings cache: rules are read on every request.
const RULES_TTL_MS = 5000;
let rulesCache = null;
let rulesCachedAt = 0;

function invalidateIpRules() {
  rulesCache = null;
  rulesCachedAt = 0;
}

async function cachedIpRules() {
  if (rulesCache && Date.now() - rulesCachedAt < RULES_TTL_MS) return rulesCache;
  rulesCache = await listIpRules();
  rulesCachedAt = Date.now();
  return rulesCache;
}

export async function addIpRule({ ip, listType, reason, createdBy }) {
  const value = String(ip || '').trim();
  if (!isValidIpOrCidr(value)) {
    const error = new Error('Enter a valid IPv4, IPv6 or IPv4 CIDR (0–32)');
    error.statusCode = 400;
    throw error;
  }
  if (listType !== 'whitelist' && listType !== 'blacklist') {
    const error = new Error('listType must be whitelist or blacklist');
    error.statusCode = 400;
    throw error;
  }
  const result = await query(
    `
    INSERT INTO ip_rules (ip, list_type, reason, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [value, listType, String(reason || '').slice(0, 200) || null, createdBy || null]
  );
  invalidateIpRules();
  return result.rows[0];
}

export async function removeIpRule(id) {
  const result = await query(`DELETE FROM ip_rules WHERE id = $1 RETURNING *`, [
    id,
  ]);
  if (!result.rows[0]) {
    const error = new Error('Rule not found');
    error.statusCode = 404;
    throw error;
  }
  invalidateIpRules();
  return result.rows[0];
}

/**
 * Which X-Forwarded-For hops to believe. The bundled nginx is one hop; put
 * another proxy (Traefik, NPM, Cloudflare) in front and set TRUST_PROXY_HOPS=2,
 * otherwise req.ip is the outer proxy and IP lockouts / allow-lists misfire.
 *
 * The nearest hop is trusted only when it is loopback (the nginx in this
 * container). Port 3001 is reachable from every container on the Docker
 * network, and a request sent there directly with `X-Forwarded-For: 127.0.0.1`
 * would otherwise pass as local and skip the address allow-list.
 */
export function trustProxy(hopsEnv) {
  const hops = Math.max(0, Number(hopsEnv ?? 1) || 0);
  if (hops === 0) return false;
  const loopback = (addr) => /^(127\.|::1$|::ffff:127\.)/.test(String(addr));
  // proxy-addr asks about each address from the socket outwards; `i` is its position.
  return (addr, i) => (i === 0 ? loopback(addr) : i < hops);
}

/** Pure verdict for an IP given security settings and rules (no I/O). */
export function decideIpAccess(clientIp, security = {}, rules = []) {
  const ip = normalizeIp(clientIp);
  if (ip === '127.0.0.1' || ip === 'localhost') return { allowed: true, reason: 'local' };

  const whitelist = rules.filter((r) => r.list_type === 'whitelist');
  const blacklist = rules.filter((r) => r.list_type === 'blacklist');

  if (security.blacklistEnabled !== false) {
    const hit = blacklist.find((r) => ipMatchesRule(r.ip, ip));
    if (hit) return { allowed: false, reason: 'blacklist', rule: hit };
  }

  if (security.whitelistEnabled) {
    const hit = whitelist.find((r) => ipMatchesRule(r.ip, ip));
    if (!hit) return { allowed: false, reason: 'whitelist' };
  }

  return { allowed: true, reason: 'ok' };
}

let lastWhitelistEnabled = false;

export async function evaluateIpAccess(clientIp) {
  const ip = normalizeIp(clientIp);
  const local = ip === '127.0.0.1' || ip === 'localhost';
  if (local) return { allowed: true, reason: 'local' };

  let parsed;
  try {
    parsed = parseSettings(await getSettings());
    lastWhitelistEnabled = Boolean(parsed.security?.whitelistEnabled);
  } catch {
    if (lastWhitelistEnabled) {
      return { allowed: false, reason: 'whitelist' };
    }
    return { allowed: true, reason: 'db-unavailable' };
  }
  const security = parsed.security || {};

  let rules = [];
  try {
    rules = await cachedIpRules();
  } catch {
    if (security.whitelistEnabled || lastWhitelistEnabled) {
      return { allowed: false, reason: 'whitelist' };
    }
    return { allowed: true, reason: 'db-unavailable' };
  }
  return decideIpAccess(ip, security, rules);
}

/**
 * The name a sign-in is counted under for per-account lockouts. Lookups are
 * case-insensitive and Active Directory accepts several spellings of one
 * person, so `Ivan`, ` ivan `, `CORP\ivan` and `ivan@corp.kz` must share one
 * failure counter — otherwise each variant gets a fresh set of guesses.
 * `directory` strips the domain parts (password sign-in only: for email codes
 * the domain is part of the identity).
 */
export function lockoutKey(value, { directory = false } = {}) {
  let key = String(value || '').trim().toLowerCase().replace(/^@+/, '');
  if (directory) {
    if (key.includes('\\')) key = key.slice(key.lastIndexOf('\\') + 1);
    if (key.includes('@')) key = key.slice(0, key.indexOf('@'));
  }
  // Phone numbers are typed in many shapes: keep the digits only.
  if (/^\+?[\d\s().-]{7,}$/.test(key)) key = key.replace(/\D/g, '');
  return key.trim().slice(0, 64);
}

export async function recordLoginAttempt({ username, ip, success }) {
  await query(
    `
    INSERT INTO login_attempts (username, ip, success)
    VALUES ($1, $2, $3)
    `,
    [lockoutKey(username) || null, ip || null, Boolean(success)]
  );
  await query(`DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '7 days'`).catch(() => {});
}

/** Account: the last `max` attempts all failed (the owner signing in resets it). */
async function accountLocked(username, minutes, max) {
  if (!username) return false;
  const result = await query(
    `
    SELECT success
    FROM login_attempts
    WHERE created_at > NOW() - ($1 || ' minutes')::interval
      AND username = $2
    ORDER BY id DESC
    LIMIT $3
    `,
    [String(minutes), username, max]
  );
  return result.rows.length >= max && result.rows.every((row) => row.success === false);
}

/**
 * Address: failures in the window are counted, not a streak — otherwise one
 * successful sign-in with an attacker's own account resets the counter
 * between guesses at other accounts.
 */
async function ipLocked(ip, minutes, max) {
  if (!ip) return false;
  const result = await query(
    `
    SELECT COUNT(*)::int AS failed
    FROM login_attempts
    WHERE created_at > NOW() - ($1 || ' minutes')::interval
      AND ip = $2 AND success = FALSE
    `,
    [String(minutes), ip]
  );
  return result.rows[0].failed >= max;
}

// An address is often shared (office NAT), so it gets more room than one account.
export const IP_FAILURE_FACTOR = 2;

export async function isLockedOut(username, ip) {
  const parsed = parseSettings(await getSettings());
  const max = Number(parsed.security?.maxLoginAttempts) || 8;
  const minutes = Number(parsed.security?.lockoutMinutes) || 15;
  const userLocked = await accountLocked(lockoutKey(username), minutes, max);
  return userLocked || (await ipLocked(ip || '', minutes, max * IP_FAILURE_FACTOR));
}

// ── Signed-out sessions ──────────────────────────────────────────────────────

export function sessionTokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Ends one session cookie (the JWT itself stays valid until `exp`, so it is listed). */
export async function revokeSession(token, expSeconds) {
  if (!token) return;
  const expires = Number(expSeconds) > 0 ? new Date(Number(expSeconds) * 1000) : new Date(Date.now() + 90 * 86400000);
  await query(
    `INSERT INTO revoked_sessions (token_hash, expires_at) VALUES ($1, $2) ON CONFLICT (token_hash) DO NOTHING`,
    [sessionTokenHash(token), expires]
  );
  await query(`DELETE FROM revoked_sessions WHERE expires_at < NOW()`).catch(() => {});
}

export async function isSessionRevoked(token) {
  if (!token) return false;
  const result = await query(`SELECT 1 FROM revoked_sessions WHERE token_hash = $1`, [sessionTokenHash(token)]);
  return result.rows.length > 0;
}

const EVENT_KINDS = new Set([
  'login_failed',
  'lockout',
  'account_disabled',
  'account_blocked',
  'ip_blocked',
  'ip_denied',
  'rate_limited',
  'code_unknown',
  'code_delivery_failed',
  // Recorded by the admin console (sign in as a user, links to the directory).
  'impersonation_start',
  'impersonation_end',
  'directory_linked',
  'directory_unlinked',
  'directory_password',
  'directory_password_removed',
  // A stored secret could not be decrypted (encryption key changed, see services/crypto.js).
  'secret_unreadable',
  // File server «Доступ» (modules/drive/access; formerly Folder access): AD group membership, group pairs, the acting admin's domain password.
  'folder_access_changed',
  'folder_group_changed',
  'folder_access_password',
  'folder_ntfs_changed',
  // Demo data filled or removed (services/demo.js).
  'demo_data',
  // Org structure: units moved or deleted (modules/org).
  'org_structure',
  // Employees: a portal account created, linked, unlinked or blocked from an employee card (modules/employees).
  'employee_account',
  // AD directory (modules/directory): account changes, password resets, the acting admin's domain password.
  'ad_changed',
  'ad_password_reset',
  'ad_credential',
]);

/** Kinds recordSecurityEvent accepts (anything else is dropped). */
export function isSecurityEventKind(kind) {
  return EVENT_KINDS.has(kind);
}

/**
 * Records a security / activity event. `detail` is the English text; `code`
 * (+ `params`) lets the activity log show it in the reader's language.
 */
export async function recordSecurityEvent({ kind, severity, username, ip, detail, code, params, debounceMinutes = 0 }) {
  if (!EVENT_KINDS.has(kind)) return null;
  const safeUser = String(username || '').slice(0, 64) || null;
  const safeDetail = String(detail || '').slice(0, 200) || null;
  const safeCode = typeof code === 'string' && /^[a-z][a-z0-9_.]{0,47}$/.test(code) ? code : null;
  const safeParams = safeCode && params && typeof params === 'object' ? JSON.stringify(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value === null || value === undefined ? '' : String(value).slice(0, 160)]))) : null;
  try {
    if (debounceMinutes > 0) {
      const recent = await query(
        `
        SELECT id FROM security_events
        WHERE kind = $1
          AND COALESCE(ip, '') = $2
          AND COALESCE(username, '') = $3
          AND created_at > NOW() - ($4 || ' minutes')::interval
        LIMIT 1
        `,
        [kind, ip || '', safeUser || '', String(debounceMinutes)]
      );
      if (recent.rows[0]) return recent.rows[0];
    }

    const result = await query(
      `
      INSERT INTO security_events (kind, severity, username, ip, detail, detail_code, detail_params)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [kind, severity || 'warning', safeUser, ip || null, safeDetail, safeCode, safeParams]
    );

    if ((severity || 'warning') === 'danger') {
      // Loaded lazily to keep this module free of network dependencies.
      import('./integrations.js')
        .then(({ notifyMattermost }) =>
          notifyMattermost(
            `:rotating_light: **${kind.replace(/_/g, ' ')}**` +
              `${safeUser ? ` · user \`${safeUser}\`` : ''}${ip ? ` · IP \`${ip}\`` : ''}` +
              `${safeDetail ? `\n${safeDetail}` : ''}`
          )
        )
        .catch(() => {});
    }

    await query(`DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '90 days'`);
    return result.rows[0];
  } catch (err) {
    console.warn('security event not recorded:', err.message);
    return null;
  }
}

export async function listSecurityEvents({ kind, limit = 100 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const result = kind
    ? await query(
        `
        SELECT id, kind, severity, username, ip, detail, detail_code, detail_params, created_at
        FROM security_events
        WHERE kind = $1
        ORDER BY id DESC
        LIMIT $2
        `,
        [kind, take]
      )
    : await query(
        `
        SELECT id, kind, severity, username, ip, detail, detail_code, detail_params, created_at
        FROM security_events
        ORDER BY id DESC
        LIMIT $1
        `,
        [take]
      );

  const summary = await query(
    `
    SELECT kind, COUNT(*)::int AS count
    FROM security_events
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY kind
    `
  );

  return {
    events: result.rows,
    summary: Object.fromEntries(summary.rows.map((row) => [row.kind, row.count])),
  };
}
