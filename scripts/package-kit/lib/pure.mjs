/*
 * Package conversion test kit — the pure parts (no I/O, no database, no processes).
 * Unit-tested by src/backend/test/package-kit.test.js. See docs/package-testing.md.
 */
import { createHash } from 'node:crypto';

export const MODES = ['fresh', 'upgrade', 'all'];
export const TEST_DB_HOST = '127.0.0.1';
export const TEST_DB_PORT = '55432';
export const KIT_DB_PREFIX = 'pkgkit_';

// ── Arguments ───────────────────────────────────────────────────────────────

/** `--id x --mode fresh --keep` (also `--id=x`) → { id, mode, sourceRef, keep, … }. */
export function parseArgs(argv) {
  const out = { mode: 'all', sourceRef: 'main', keep: false, browser: true, _: [] };
  const valued = new Set(['id', 'mode', 'source-ref', 'env', 'out', 'front-dist']);
  for (let i = 0; i < argv.length; i += 1) {
    let arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    arg = arg.slice(2);
    let value = null;
    const eq = arg.indexOf('=');
    if (eq >= 0) {
      value = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    if (valued.has(arg)) {
      if (value === null) {
        value = argv[i + 1];
        i += 1;
      }
      if (value === undefined || value === '') throw new Error(`--${arg} needs a value`);
      const key = arg.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = value;
    } else if (arg === 'keep') out.keep = true;
    else if (arg === 'no-browser') out.browser = false;
    else if (arg === 'help') out.help = true;
    else throw new Error(`Unknown option --${arg}`);
  }
  if (!out.id && out._[0]) out.id = out._[0];
  if (!out.help) {
    if (!out.id || !/^[a-z][a-z0-9_]{1,31}$/.test(out.id)) throw new Error('Give the module id: --id <id> (make package-check ID=<id>)');
    if (!MODES.includes(out.mode)) throw new Error(`--mode must be one of ${MODES.join(', ')}`);
    if (!/^[\w./@^~-]{1,200}$/.test(out.sourceRef)) throw new Error(`--source-ref ${out.sourceRef} is not a git ref`);
  }
  return out;
}

// ── Safety ──────────────────────────────────────────────────────────────────

/** Parses KEY=VALUE lines (# comments, optional quotes). */
export function parseEnvText(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/**
 * The database the kit may use: only the throw-away test server wh-test-pg on 127.0.0.1:55432.
 * Anything else (production postgres-18 on :5432, a DATABASE_URL, another host) is refused.
 */
export function assertTestDatabase(env) {
  const host = String(env.POSTGRES_HOST || '').trim();
  const port = String(env.POSTGRES_PORT || '').trim();
  if (env.DATABASE_URL) throw new Error('Refusing to run: the test env sets DATABASE_URL (only POSTGRES_HOST/PORT of wh-test-pg are accepted)');
  if (host !== TEST_DB_HOST || port !== TEST_DB_PORT) {
    throw new Error(`Refusing to run: the database must be wh-test-pg at ${TEST_DB_HOST}:${TEST_DB_PORT}, the env says ${host || '?'}:${port || '?'}`);
  }
  for (const key of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB']) {
    if (!env[key]) throw new Error(`Refusing to run: ${key} is missing in the test env`);
  }
  return { host, port: Number(port), user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB };
}

/** A database name the kit creates (and so may drop): pkgkit_<id>_<tag>_<random>. */
export function kitDatabaseName(id, tag, random = Math.random().toString(36).slice(2, 8)) {
  return `${KIT_DB_PREFIX}${id}_${tag}_${random}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 63);
}
export const isKitDatabaseName = (name) => typeof name === 'string' && name.startsWith(KIT_DB_PREFIX) && /^[a-z0-9_]{1,63}$/.test(name);

// ── Versions, migrations ────────────────────────────────────────────────────

export function bumpPatch(version, by = 1) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!m) throw new Error(`Not a version: ${version}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + by}`;
}

/** The next free NNN_<label>.sql after the package's migration files. */
export function nextMigrationName(names, label) {
  const numbers = names.map((name) => /^(?:migrations\/)?(\d{3})_/.exec(name)).filter(Boolean).map((m) => Number(m[1]));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  if (next > 999) throw new Error('No free migration number');
  return `${String(next).padStart(3, '0')}_${label}.sql`;
}

// ── Tables ──────────────────────────────────────────────────────────────────

/**
 * The module's table patterns as the platform reads them (backup.js moduleTables): its own prefix
 * `<id>_`, legacy prefixes the core declares (`masterplan` → `mp_`), and the manifest `tables`.
 * `prefixes` are plain prefixes, `exact` exact names.
 */
export function tablePatterns(id, manifestTables = [], legacy = []) {
  const prefixes = new Set([`${id}_`]);
  const exact = new Set();
  for (const entry of legacy) if (entry.endsWith('_')) prefixes.add(entry);
  for (const entry of manifestTables || []) {
    if (/[%*]$/.test(entry)) prefixes.add(entry.slice(0, -1));
    else exact.add(entry);
  }
  return { prefixes: [...prefixes].sort(), exact: [...exact].sort() };
}

export function matchesPatterns(table, { prefixes, exact }) {
  return exact.includes(table) || prefixes.some((prefix) => table.startsWith(prefix));
}

export const quoteIdent = (name) => {
  if (!/^[a-z_][a-z0-9_$]{0,62}$/i.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
};

/** SQL for row count + an order-independent checksum of a table's rows. */
export function checksumSql(table) {
  const t = quoteIdent(table);
  return `SELECT count(*)::int AS rows, coalesce(md5(string_agg(h, '' ORDER BY h)), '') AS sum FROM (SELECT md5(x::text) AS h FROM ${t} x) s`;
}

/**
 * Differences between two snapshots { tables: { name: { rows, sum } }, settings, roles, layouts, … }.
 * `ignoreTables`: names left out of the comparison. Returns [{ path, before, after }].
 */
export function diffSnapshots(before, after, { ignoreTables = [] } = {}) {
  const out = [];
  const ignore = new Set(ignoreTables);
  const tableNames = new Set([...Object.keys(before?.tables || {}), ...Object.keys(after?.tables || {})]);
  for (const name of [...tableNames].sort()) {
    if (ignore.has(name)) continue;
    const a = before?.tables?.[name];
    const b = after?.tables?.[name];
    if (!a || !b) out.push({ path: `tables.${name}`, before: a ? `${a.rows} rows` : 'missing', after: b ? `${b.rows} rows` : 'missing' });
    else if (a.rows !== b.rows || a.sum !== b.sum) out.push({ path: `tables.${name}`, before: `${a.rows} rows ${a.sum.slice(0, 8)}`, after: `${b.rows} rows ${b.sum.slice(0, 8)}` });
  }
  // Flags a module writes itself (app_settings "<id>_…"): a key may appear later (Masterplan's
  // contract catch-up records its run ~20 s after the first start); one that changes or goes is a difference.
  const keysA = before?.appSettings || {};
  const keysB = after?.appSettings || {};
  for (const key of Object.keys(keysA).sort()) {
    if (!(key in keysB)) out.push({ path: `appSettings.${key}`, before: String(keysA[key]).slice(0, 300), after: 'missing' });
    else if (String(keysA[key]) !== String(keysB[key])) out.push({ path: `appSettings.${key}`, before: String(keysA[key]).slice(0, 300), after: String(keysB[key]).slice(0, 300) });
  }
  for (const key of Object.keys({ ...(before || {}), ...(after || {}) }).sort()) {
    if (key === 'tables' || key === 'meta' || key === 'appSettings') continue;
    const a = stableJson(before?.[key] ?? null);
    const b = stableJson(after?.[key] ?? null);
    if (a !== b) out.push({ path: key, before: a.slice(0, 300), after: b.slice(0, 300) });
  }
  return out;
}

/** JSON with sorted object keys (stable comparisons and digests). */
export function stableJson(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    return v;
  };
  return JSON.stringify(sort(value));
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// ── Routes (server) ─────────────────────────────────────────────────────────

/**
 * The path a nested Express 4 router is mounted at, from its layer regexp
 * (same reading as src/backend/api/introspect.js mountPathOf). null when unreadable.
 */
export function mountPathOf(layer) {
  if (layer.regexp?.fast_slash) return '';
  let source = String(layer.regexp?.source || '');
  if (!source.startsWith('^') || !source.endsWith('\\/?(?=\\/|$)')) return null;
  source = source.slice(1, -'\\/?(?=\\/|$)'.length);
  const keys = [...(layer.keys || [])];
  source = source.replace(/\(\?:\\\/\(\[\^\/\]\+\?\)\)/g, () => `/:${keys.shift()?.name ?? 'param'}`);
  const path = source.replace(/\\\//g, '/').replace(/\\([.-])/g, '$1');
  return /^(\/[\w:.-]+)+$/.test(path) ? path : null;
}

/** [{ method, path }] of an Express router (nested routers followed); `skipped` collects unreadable ones. */
export function routesOf(router, prefix = '', skipped = []) {
  const out = [];
  for (const layer of router?.stack || []) {
    if (!layer.route) {
      if (Array.isArray(layer.handle?.stack)) {
        const mount = mountPathOf(layer);
        if (mount === null) skipped.push(`${prefix} (nested router with an unreadable mount path)`);
        else out.push(...routesOf(layer.handle, `${prefix}${mount}`, skipped));
      }
      continue;
    }
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const path of paths) {
      if (typeof path !== 'string') {
        skipped.push(`${prefix} ${String(path)} (regular-expression path)`);
        continue;
      }
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        out.push({ method: method.toUpperCase(), path: `${prefix}${path === '/' && prefix ? '' : path}` || '/' });
      }
    }
  }
  const seen = new Set();
  return out.filter((route) => {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fills `:name` parameters (also `:name?` and `:name(a|b)`) of an Express path.
 * values: { name: value }; `fallback` for the rest (null → reported as missing).
 */
export function fillPath(path, values = {}, fallback = '1') {
  const missing = [];
  const url = String(path).replace(/:(\w+)(\([^)]*\))?(\?)?/g, (_, name, choices, optional) => {
    if (values[name] != null && values[name] !== '') return encodeURIComponent(String(values[name]));
    if (choices) return choices.slice(1, -1).split('|')[0];
    if (optional) return '';
    if (fallback == null) {
      missing.push(name);
      return `:${name}`;
    }
    return encodeURIComponent(String(fallback));
  }).replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  return { url, missing };
}

/** "GET /export/*" style patterns (* one segment, ** the rest) → test(method, path). */
export function routeMatcher(patterns = []) {
  const compiled = patterns.map((pattern) => {
    const [method, path] = String(pattern).includes(' ') ? String(pattern).split(/\s+/, 2) : ['*', String(pattern)];
    const re = new RegExp(`^${path.split('/').map((seg) => (seg === '**' ? '.*' : seg === '*' ? '[^/]+' : seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))).join('/')}$`);
    return { method: method.toUpperCase(), re };
  });
  return (method, path) => compiled.some((c) => (c.method === '*' || c.method === method.toUpperCase()) && c.re.test(path));
}

/**
 * How much data an answer carries: the longest array in a JSON body (top level or one level down),
 * or the data lines of a CSV/text answer. null when there is nothing to count.
 */
export function dataSize(res) {
  if (res?.body && typeof res.body === 'object') {
    let max = null;
    const look = (value, depth) => {
      if (Array.isArray(value)) max = Math.max(max ?? 0, value.length);
      else if (value && typeof value === 'object' && depth < 2) for (const [key, inner] of Object.entries(value)) if (key !== 'success') look(inner, depth + 1);
    };
    look(res.body, 0);
    return max;
  }
  if (typeof res?.text === 'string' && /csv|text\/plain/.test(res.type || '')) return Math.max(0, res.text.split(/\r?\n/).filter((line) => line.trim()).length - 1);
  return null;
}

/**
 * Verdict for one GET of a module route → { ok, warn?, note }.
 *   who: 'superadmin' | 'scoped-token' (a token with the module's read scope) |
 *        'holder' (holds the module's permissions) | 'user' (signed in, none of the module's permissions) |
 *        'token' (an API token without the module's scope) | 'anonymous'
 *   open: the route is declared readable by everyone signed in (kit file openToUsers)
 *   otherScopes: the route also needs another area's token scope (kit file needsOtherScopes)
 *   code: the answer's error code; size / adminSize: dataSize() of this answer and of the superadmin's
 *
 * A module may answer a user without its permissions with 2xx when it filters the data (Masterplan:
 * rights per project) — then the answer must carry less than the superadmin's (0 of N passes,
 * the same N fails). With nothing to compare (the superadmin sees no data either) it is a warning.
 */
export function judgeStatus(who, status, { open = false, timeout = false, code = null, size = null, adminSize = null, otherScopes = false } = {}) {
  if (timeout) return { ok: false, note: 'no answer in time' };
  if (status === 0) return { ok: false, note: 'no answer (connection failed)' };
  if (status >= 500) return { ok: false, note: `server error ${status}` };
  switch (who) {
    case 'superadmin':
      if (status === 401) return { ok: false, note: 'refused the signed-in superadministrator (401)' };
      if (status === 403) return { ok: false, note: 'forbidden for the superadministrator (403)' };
      return { ok: true, note: status >= 400 ? `${status} (parameter placeholder)` : String(status) };
    case 'scoped-token':
      if (status === 401) return { ok: false, note: 'a valid token was refused (401)' };
      if (status === 403 && code === 'SCOPE_DENIED') return otherScopes ? { ok: true, note: '403 SCOPE_DENIED (declared: needs another area\'s scope too)' } : { ok: true, warn: true, note: '403 SCOPE_DENIED: the route needs another area\'s scope too (declare it in needsOtherScopes)' };
      if (status === 403) return { ok: false, note: `forbidden for a token with the module's scope (403 ${code || ''})`.trim() };
      return { ok: true, note: String(status) };
    case 'holder':
      // A person holding the module's permissions (not necessarily every one a route asks for).
      if (status === 401) return { ok: false, note: 'refused a signed-in user (401)' };
      return { ok: true, note: String(status) };
    case 'user':
      if (status === 403 || status === 404) return { ok: true, note: String(status) };
      if (status === 401) return { ok: false, note: '401 for a signed-in user (expected 403/404)' };
      if (status >= 300) return { ok: true, note: String(status) };
      if (open) return { ok: true, note: `${status} (declared open to everyone signed in)` };
      if (adminSize == null || size == null) return { ok: false, note: `${status}: answered a user without any of the module's permissions (nothing to compare; declare it in openToUsers if intended)` };
      if (adminSize === 0) return { ok: true, warn: true, note: `${status}: inconclusive — the superadmin sees no data here either` };
      if (size < adminSize) return { ok: true, note: `${status} filtered (${size} of ${adminSize})` };
      return { ok: false, note: `${status}: the same data as the superadmin (${size} items) for a user without the module's permissions` };
    case 'token':
      if (status === 403 || status === 404) return { ok: true, note: String(status) };
      return { ok: false, note: `${status}: a token without the module's scope got through` };
    case 'anonymous':
      if (status === 401 || status === 403 || status === 404) return { ok: true, note: String(status) };
      // A public route may answer with a redirect (a dynamic QR code → its target, a share link).
      if (status < 400 && open) return { ok: true, note: `${status} (public)` };
      return { ok: false, note: `${status} for an anonymous visitor` };
    default:
      throw new Error(`unknown caller ${who}`);
  }
}

// ── Routes (browser) ────────────────────────────────────────────────────────

/**
 * Relative <Route path="…"> of a module's App source (react-router), without the catch-all.
 * Absolute paths ("/app/x/y") are kept as they are.
 */
export function routePathsFromSource(text) {
  const out = new Set();
  const re = /<Route\b[^>]*?\bpath\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*['"`]([^'"`]*)['"`]\s*\})/g;
  let m;
  while ((m = re.exec(String(text)))) {
    const path = m[1] ?? m[2] ?? m[3];
    if (path == null || path === '*' || path.includes('*')) continue;
    out.add(path);
  }
  return [...out];
}

/**
 * Pages to open: /app/<id> (when the package has a page), every route of its App under it,
 * /admin/settings/<id> (when it has Settings) and the extra pages of the module's kit file.
 * Parameters come from `params` ({ name: value }); a page whose parameter has no value is skipped.
 */
export function pageList(id, { routes = [], hasPage = true, hasSettings = false, extra = [], params = {} } = {}) {
  const pages = [];
  const skipped = [];
  const add = (path, expectPrefix) => {
    const { url, missing } = fillPath(path, params, null);
    if (missing.length) skipped.push({ path, reason: `no value for :${missing.join(', :')}` });
    else if (!pages.some((page) => page.url === url)) pages.push({ path, url, expectPrefix: expectPrefix || url });
  };
  if (hasPage) {
    add(`/app/${id}`);
    for (const route of routes) add(route.startsWith('/') ? route : `/app/${id}/${route}`.replace(/\/$/, ''));
  }
  if (hasSettings) add(`/admin/settings/${id}`);
  for (const page of extra) {
    if (typeof page === 'string') add(page);
    else if (page?.path) add(page.path, page.expectPrefix);
  }
  return { pages, skipped };
}

/** Browser problems that are noise, not failures (the portal logo is not uploaded on a fresh database). */
export const DEFAULT_IGNORED = [/\/uploads\/logos?\//, /\/api\/settings\/logo/, /favicon/];

export function isIgnoredProblem(text, extra = []) {
  return [...DEFAULT_IGNORED, ...extra.map((p) => (p instanceof RegExp ? p : new RegExp(p)))].some((re) => re.test(String(text)));
}

// ── Report ──────────────────────────────────────────────────────────────────

/** One-line-per-step text of a report { id, mode, steps: [{ phase, name, status, note, ms }] }. */
export function formatReport(report) {
  const mark = { pass: 'PASS', fail: 'FAIL', skip: 'skip', warn: 'warn' };
  const lines = [];
  const failed = report.steps.filter((step) => step.status === 'fail');
  lines.push(`Package check ${report.id} (${report.mode}) — ${failed.length ? 'FAIL' : 'PASS'}: ${report.steps.filter((s) => s.status === 'pass').length} passed, ${failed.length} failed, ${report.steps.filter((s) => s.status === 'warn').length} warnings, ${report.steps.filter((s) => s.status === 'skip').length} skipped`);
  let phase = null;
  for (const step of report.steps) {
    if (step.phase !== phase) {
      phase = step.phase;
      lines.push(`  [${phase}]`);
    }
    const time = step.ms != null ? ` (${(step.ms / 1000).toFixed(1)} s)` : '';
    lines.push(`    ${mark[step.status] || step.status} ${step.name}${step.note ? ` — ${step.note}` : ''}${time}`);
  }
  if (report.reportFile) lines.push(`  JSON report: ${report.reportFile}`);
  if (report.logDir) lines.push(`  Logs: ${report.logDir}`);
  return lines.join('\n');
}

export const overallStatus = (steps) => (steps.some((step) => step.status === 'fail') ? 'fail' : 'pass');
