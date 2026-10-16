import { existsSync, readFileSync, statSync } from 'fs';
import { readdir, stat, statfs } from 'fs/promises';
import { join, resolve } from 'path';
import os from 'os';
import { query, tryConnectDB } from '../config/database.js';
import config from '../config/app.js';
import { uploadRoot } from '../config/paths.js';
import { APP_VERSION } from '../config/version.js';
import { getSettings, parseSettings } from './settings.js';
import { listJobs } from './scheduler.js';
import { demoState } from './demo.js';
import { MODULE_CATALOG } from '../modules/catalog.js';
import { MODULE_MANIFEST, compareVersions } from '../modules/manifest.js';

/*
 * The System page (spec §9): versions, modules, resources, background jobs,
 * integrations, queues and health checks, in one report an administrator can
 * export for support. Never a secret: integrations say only whether they are
 * on and complete, environment checks say only whether a value is set, error
 * texts are scrubbed of tokens. Everything is read in parallel and kept for
 * 30 s; walking the upload folders (sizes) is kept for 10 minutes.
 */

const startedAt = Date.now();
const REPORT_TTL = 30_000;
const SIZE_TTL = 10 * 60_000;
// Walking more entries than this is stopped (the size is then marked approximate).
const WALK_LIMIT = 200_000;

let cachedReport = null;
let cachedAt = 0;
let pending = null;

/** Hides tokens, passwords and keys inside free text (job errors, hosts with credentials). */
export function scrub(text) {
  return String(text ?? '')
    .replace(/bot\d+:[\w-]{20,}/gi, 'bot***')
    .replace(/\b(password|passwd|pwd|token|secret|apikey|api_key|key|authorization)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&,;]+)/gi, '$1$2***')
    .replace(/(\w+:\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1***@')
    .replace(/\bBearer\s+[\w.-]+/gi, 'Bearer ***')
    .slice(0, 500);
}

async function safe(fn, fallback = null) {
  try {
    return await fn();
  } catch (err) {
    return fallback ?? { error: scrub(err.message) };
  }
}

// ── Sizes of folders ───────────────────────────────────────────────────────

const sizeCache = new Map();

async function folderSize(path) {
  const hit = sizeCache.get(path);
  if (hit && Date.now() - hit.at < SIZE_TTL) return hit.value;
  let bytes = 0;
  let files = 0;
  let seen = 0;
  let partial = false;
  const stack = [path];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (seen > WALK_LIMIT) {
        partial = true;
        break;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        try {
          bytes += (await stat(full)).size;
          files += 1;
        } catch {
          /* gone meanwhile */
        }
      }
    }
    if (partial) break;
  }
  const value = { bytes, files, partial, measuredAt: new Date().toISOString() };
  sizeCache.set(path, { at: Date.now(), value });
  return value;
}

async function disk(path) {
  const info = await statfs(path);
  const total = info.blocks * info.bsize;
  const free = info.bavail * info.bsize;
  return { totalBytes: total, freeBytes: free, usedPercent: total ? Math.round(((total - free) / total) * 1000) / 10 : null };
}

// ── Sections ───────────────────────────────────────────────────────────────

/** The frontend build next to the server (dist/version.json): id and date. */
function buildInfo() {
  const candidates = [process.env.FRONTEND_DIST, '/app/frontend/dist', resolve(process.cwd(), '../frontend/dist')].filter(Boolean);
  for (const dir of candidates) {
    const file = join(dir, 'version.json');
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      return { id: String(data.build || ''), version: String(data.version || ''), date: statSync(file).mtime.toISOString() };
    } catch {
      /* unreadable: next */
    }
  }
  return { id: process.env.BUILD_ID || null, version: APP_VERSION, date: null };
}

async function database() {
  const db = await tryConnectDB();
  if (!db.ok) return { connected: false };
  const [info, tables] = await Promise.all([
    query(`SELECT current_setting('server_version') AS version, pg_database_size(current_database())::bigint AS size, current_setting('TimeZone') AS tz`),
    query(
      `SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS size, GREATEST(c.reltuples, 0)::bigint AS rows
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'r' AND n.nspname = 'public'
       ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 10`
    ),
  ]);
  return {
    connected: true,
    version: info.rows[0].version,
    sizeBytes: Number(info.rows[0].size),
    timeZone: info.rows[0].tz,
    topTables: tables.rows.map((row) => ({ name: row.name, sizeBytes: Number(row.size), rows: Number(row.rows) })),
  };
}

async function counts() {
  const one = async (sql) => Number((await query(sql)).rows[0]?.n || 0);
  const [users, activeUsers, blocked, sessions, files, fileBytes] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM users`),
    safe(() => one(`SELECT COUNT(*) AS n FROM users WHERE is_active AND NOT COALESCE(is_blocked, FALSE)`), null),
    safe(() => one(`SELECT COUNT(*) AS n FROM users WHERE is_blocked`), null),
    safe(() => one(`SELECT COUNT(*) AS n FROM user_sessions WHERE revoked_at IS NULL AND expires_at > NOW()`), null),
    safe(() => one(`SELECT COUNT(*) AS n FROM fs_nodes WHERE kind = 'file' AND deleted_at IS NULL`), null),
    safe(() => one(`SELECT COALESCE(SUM(size), 0) AS n FROM fs_nodes WHERE kind = 'file' AND deleted_at IS NULL`), null),
  ]);
  return { users, activeUsers, blockedUsers: blocked, activeSessions: sessions, files, filesBytes: fileBytes };
}

async function resources() {
  const previewDirs = [join(uploadRoot, '.previews'), join(uploadRoot, 'kb', '.previews')];
  const [diskInfo, uploads, ...previews] = await Promise.all([
    safe(() => disk(existsSync(uploadRoot) ? uploadRoot : process.cwd())),
    safe(() => folderSize(uploadRoot)),
    ...previewDirs.map((dir) => safe(() => folderSize(dir))),
  ]);
  const memory = process.memoryUsage();
  return {
    disk: { path: 'uploads', ...diskInfo },
    uploads,
    previews: {
      bytes: previews.reduce((sum, item) => sum + (item?.bytes || 0), 0),
      files: previews.reduce((sum, item) => sum + (item?.files || 0), 0),
      partial: previews.some((item) => item?.partial),
    },
    process: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      startedAt: new Date(startedAt).toISOString(),
      pid: process.pid,
    },
    host: {
      loadAverage: os.loadavg().map((n) => Math.round(n * 100) / 100),
      cpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
      platform: `${os.platform()} ${os.arch()}`,
    },
  };
}

/** One line per integration: off / on / incomplete (a required field is empty). No values. */
export function integrationStatus(integrations = {}) {
  const need = {
    email: ['host', 'from'],
    telegram: ['botToken'],
    whatsapp: ['serverUrl', 'apiKey'],
    wazzup: ['apiKey'],
    mattermost: ['serverUrl', 'botToken'],
    google: ['clientId', 'clientSecret'],
    documents: ['serverUrl'],
    activeDirectory: ['host', 'baseDn'],
  };
  return Object.entries(need).map(([key, fields]) => {
    const value = integrations[key] || {};
    const missing = fields.filter((field) => !String(value[field] ?? '').trim());
    const status = !value.enabled ? 'off' : missing.length ? 'incomplete' : 'on';
    const extra = {};
    if (key === 'documents') extra.editing = Boolean(value.editing?.enabled);
    if (key === 'activeDirectory') extra.tls = Boolean(value.useTls);
    if (key === 'email') extra.secure = Boolean(value.secure);
    return { id: key, status, missing: status === 'incomplete' ? missing : [], ...extra };
  });
}

async function queues() {
  const [webhooks, deferred, notifications] = await Promise.all([
    safe(
      async () => {
        const { rows } = await query(
          `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                  COUNT(*) FILTER (WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours')::int AS failed24h,
                  COUNT(*) FILTER (WHERE status = 'ok' AND created_at > NOW() - INTERVAL '24 hours')::int AS delivered24h,
                  MIN(created_at) FILTER (WHERE status = 'pending') AS oldest
           FROM api_deliveries`
        );
        return { pending: rows[0].pending, failed24h: rows[0].failed24h, delivered24h: rows[0].delivered24h, oldestPendingAt: rows[0].oldest };
      },
      null
    ),
    safe(async () => {
      const { rows } = await query(`SELECT COUNT(*)::int AS n, MIN(release_at) AS next FROM notification_deferred`);
      return { deferred: rows[0].n, nextReleaseAt: rows[0].next };
    }, null),
    safe(async () => {
      const { rows } = await query(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread FROM notifications WHERE created_at > NOW() - INTERVAL '24 hours'`);
      return { last24h: rows[0].n, unread24h: rows[0].unread };
    }, null),
  ]);
  return { webhooks, notifications: { ...(notifications || {}), ...(deferred || {}) } };
}

function newestBackup(dir) {
  return safe(async () => {
    const entries = await readdir(dir, { withFileTypes: true });
    let newest = null;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const info = await stat(join(dir, entry.name));
      if (!newest || info.mtimeMs > newest.mtimeMs) newest = { name: entry.name, mtimeMs: info.mtimeMs, size: info.size };
    }
    return newest ? { at: new Date(newest.mtimeMs).toISOString(), sizeBytes: newest.size } : { at: null };
  }, { error: 'unreadable' });
}

/**
 * Health checks: { id, status: ok | warn | fail | unknown, value? }.
 * `env` and `now` are parameters for tests.
 */
export async function healthChecks({ env = process.env, parsed, frontendUrl = config.frontend.url, jwtSecret = config.auth.jwtSecret, now = Date.now(), dbTimeZone } = {}) {
  const checks = [];
  const add = (id, status, value) => checks.push({ id, status, ...(value !== undefined ? { value } : {}) });
  const isLocal = (url) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url);
  const front = String(frontendUrl || '');
  add('https', front.startsWith('https://') ? 'ok' : isLocal(front) ? 'warn' : 'fail', front.startsWith('https://') ? 'https' : 'http');
  add('frontendUrl', front && !isLocal(front) ? 'ok' : 'warn', front ? (isLocal(front) ? 'local' : 'set') : 'missing');
  const publicUrl = String(env.PUBLIC_URL || '');
  add('publicUrl', publicUrl ? (publicUrl.startsWith('https://') ? 'ok' : 'warn') : 'warn', publicUrl ? 'set' : 'missing');
  add('jwtSecret', String(jwtSecret || '').length >= 32 ? 'ok' : jwtSecret ? 'warn' : 'fail', jwtSecret ? (String(jwtSecret).length >= 32 ? 'strong' : 'short') : 'missing');
  add('encryptionKey', env.ENCRYPTION_KEY ? 'ok' : 'warn', env.ENCRYPTION_KEY ? 'set' : 'derived');
  add('setupLocked', env.SETUP_LOCKED === 'true' || !env.SETUP_TOKEN ? 'ok' : 'warn', env.SETUP_LOCKED === 'true' ? 'locked' : env.SETUP_TOKEN ? 'token' : 'open');
  add('cookies', front.startsWith('https://') || env.COOKIE_SECURE === 'true' ? 'ok' : 'warn', front.startsWith('https://') || env.COOKIE_SECURE === 'true' ? 'secure' : 'plain');
  const processZone = env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const portalZone = parsed?.regional?.timeZone || null;
  add('timeZone', portalZone ? 'ok' : 'warn', [processZone, portalZone, dbTimeZone].filter(Boolean).join(' · '));
  if (env.BACKUP_DIR) {
    const backup = await newestBackup(env.BACKUP_DIR);
    if (!backup?.at) add('backup', 'fail', backup?.error ? 'unreadable' : 'none');
    else {
      const hours = (now - Date.parse(backup.at)) / 3_600_000;
      add('backup', hours <= 26 ? 'ok' : hours <= 7 * 24 ? 'warn' : 'fail', backup.at);
    }
  } else add('backup', 'unknown', 'BACKUP_DIR');
  return checks;
}

function modulesTable(parsed) {
  return MODULE_CATALOG.map((module) => {
    const manifest = MODULE_MANIFEST[module.id] || {};
    const head = manifest.changelog?.[0] || null;
    return {
      id: module.id,
      version: manifest.version || null,
      minCore: manifest.minCore || null,
      compatible: manifest.minCore ? compareVersions(APP_VERSION, manifest.minCore) >= 0 : true,
      core: Boolean(module.core),
      enabled: Boolean(parsed.modules[module.id]?.enabled),
      category: manifest.category || null,
      changedAt: head?.date || null,
      changelog: head ? { version: head.version, date: head.date, changes: head.changes } : null,
    };
  });
}

async function buildReport() {
  const parsed = parseSettings(await getSettings());
  const [db, resourceInfo, countInfo, queueInfo, demo] = await Promise.all([
    safe(database, { connected: false }),
    resources(),
    safe(counts),
    queues(),
    safe(demoState, {}),
  ]);
  const checks = await healthChecks({ parsed, dbTimeZone: db.timeZone });
  return {
    generatedAt: new Date().toISOString(),
    versions: {
      core: APP_VERSION,
      build: buildInfo(),
      node: process.version,
      postgres: db.version || null,
      environment: config.server.nodeEnv,
      timeZone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    modules: modulesTable(parsed),
    resources: { ...resourceInfo, database: { connected: db.connected, sizeBytes: db.sizeBytes ?? null, topTables: db.topTables || [] } },
    counts: countInfo,
    jobs: listJobs().map((job) => ({ ...job, lastError: job.lastError ? scrub(job.lastError) : null })),
    integrations: integrationStatus(parsed.integrations),
    queues: queueInfo,
    checks,
    demo: { active: Boolean(demo?.active), modules: demo?.modules || [] },
  };
}

/** The report, cached for 30 s (`fresh` rebuilds it); one build at a time. */
export async function systemReport({ fresh = false } = {}) {
  if (!fresh && cachedReport && Date.now() - cachedAt < REPORT_TTL) return cachedReport;
  if (!pending) {
    pending = buildReport()
      .then((report) => {
        cachedReport = report;
        cachedAt = Date.now();
        return report;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
