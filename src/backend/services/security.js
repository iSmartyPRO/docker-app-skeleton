import { query } from '../config/database.js';
import { getSettings, parseSettings } from './settings.js';

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
  await query(`CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events (created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS security_events_kind_idx ON security_events (kind, created_at DESC)`);
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

export async function recordLoginAttempt({ username, ip, success }) {
  await query(
    `
    INSERT INTO login_attempts (username, ip, success)
    VALUES ($1, $2, $3)
    `,
    [String(username || '').slice(0, 64) || null, ip || null, Boolean(success)]
  );
  await query(`DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '7 days'`).catch(() => {});
}

async function failedStreak(column, value, minutes, max) {
  if (!value) return false;
  const field = column === 'ip' ? 'ip' : 'username';
  const result = await query(
    `
    SELECT success
    FROM login_attempts
    WHERE created_at > NOW() - ($1 || ' minutes')::interval
      AND ${field} = $2
    ORDER BY id DESC
    LIMIT $3
    `,
    [String(minutes), value, max]
  );
  return result.rows.length >= max && result.rows.every((row) => row.success === false);
}

export async function isLockedOut(username, ip) {
  const parsed = parseSettings(await getSettings());
  const max = Number(parsed.security?.maxLoginAttempts) || 8;
  const minutes = Number(parsed.security?.lockoutMinutes) || 15;
  const userLocked = await failedStreak('username', username || '', minutes, max);
  const ipLocked = await failedStreak('ip', ip || '', minutes, max);
  return userLocked || ipLocked;
}

const EVENT_KINDS = new Set([
  'login_failed',
  'lockout',
  'account_disabled',
  'account_blocked',
  'ip_blocked',
  'ip_denied',
  'rate_limited',
]);

export async function recordSecurityEvent({ kind, severity, username, ip, detail, debounceMinutes = 0 }) {
  if (!EVENT_KINDS.has(kind)) return null;
  const safeUser = String(username || '').slice(0, 64) || null;
  const safeDetail = String(detail || '').slice(0, 200) || null;
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
      INSERT INTO security_events (kind, severity, username, ip, detail)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [kind, severity || 'warning', safeUser, ip || null, safeDetail]
    );

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
        SELECT id, kind, severity, username, ip, detail, created_at
        FROM security_events
        WHERE kind = $1
        ORDER BY id DESC
        LIMIT $2
        `,
        [kind, take]
      )
    : await query(
        `
        SELECT id, kind, severity, username, ip, detail, created_at
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
