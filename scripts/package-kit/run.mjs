#!/usr/bin/env node
/*
 * Package conversion test kit (docs/package-testing.md) — the «definition of done» items 2–6
 * for one module, the same way for every conversion:
 *
 *   make package-check ID=<id> [MODE=fresh|upgrade|all] [SOURCE_REF=<git ref, default main>] [KIT_ENV=<test env>]
 *   node scripts/package-kit/run.mjs --id <id> [--mode all] [--source-ref main] [--env FILE] [--out DIR] [--keep] [--no-browser] [--front-dist DIR]
 *
 * package  build unsigned + signed with a throw-away key (trusted through MODULE_TRUSTED_KEYS_FILE),
 *          verify both, manifest facts, tampered / untrusted copies refused
 * fresh    new database → setup → install over HTTP (restart supervised, exit 75) → enable → demo
 *          data → every GET route as superadmin / user without the module's permissions / token
 *          without its scope / token with it → pages in Playwright → the module alone (linked modules
 *          off) → update with an extra migration → failing update changes nothing → uninstall keeps
 *          data → reinstall → «Удалить данные» after a backup drops only the module's tables
 * upgrade  SOURCE_REF (module built in) on a new database → demo data, a role, dashboards →
 *          snapshot → this core without the module (data untouched, listed as removed, links degrade)
 *          → install the package → identical snapshot, pages, links → restart → identical again
 *
 * Only the test PostgreSQL wh-test-pg (127.0.0.1:55432) is accepted; every database, folder,
 * process and worktree it creates is removed at the end (--keep leaves them for inspection).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  assertTestDatabase, dataSize, diffSnapshots, fillPath, formatReport, judgeStatus, kitBackendEnv, kitDatabaseName, overallStatus,
  pageList, parseArgs, parseEnvText, routeMatcher, routePathsFromSource, tablePatterns,
} from './lib/pure.mjs';
import { baseEnv, freePort, run, sleep, stopAll, stop, ownPids } from './lib/proc.mjs';
import { Client, expectOk, upgradeStatus } from './lib/http.mjs';
import { Backend } from './lib/backend.mjs';
import { Db, allTables, filesDigest, appliedMigrations, moduleTableNames, packageRow, snapshot } from './lib/db.mjs';
import { buildPackage, makeKeys, readPackage, tampered, untrusted, variant, verifyPackage } from './lib/package.mjs';
import { buildFrontend, startPreview } from './lib/frontend.mjs';
import { browse, playwrightModules } from './lib/browser.mjs';

const KIT = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(KIT, '../..');
const BACKEND = join(ROOT, 'src/backend');
const PROBE_LABEL = 'kit_probe';

const ADMIN = { username: 'kitadmin', password: `Kit-admin-${randomBytes(6).toString('hex')}` };
const USER = { username: 'kituser', password: `Kit-user-${randomBytes(6).toString('hex')}` };

// ── Report ──────────────────────────────────────────────────────────────────

class Abort extends Error {}

class Report {
  constructor(id, mode) {
    this.data = { id, mode, startedAt: new Date().toISOString(), steps: [], facts: {}, problems: [] };
  }
  get steps() {
    return this.data.steps;
  }
  add(phase, name, status, note = '', details = undefined, ms = undefined) {
    const step = { phase, name, status, note, ...(details !== undefined ? { details } : {}), ...(ms !== undefined ? { ms } : {}) };
    this.data.steps.push(step);
    const mark = { pass: 'PASS', fail: 'FAIL', skip: 'skip', warn: 'warn' }[status];
    console.log(`  ${mark} [${phase}] ${name}${note ? ` — ${note}` : ''}`);
    return step;
  }
  /**
   * Runs one step. fn returns a note (string), or { status, note, details, value }.
   * A failed critical step aborts its phase (the remaining steps are not run).
   */
  async step(phase, name, fn, { critical = true } = {}) {
    const started = Date.now();
    let out;
    try {
      out = await fn();
    } catch (err) {
      if (err instanceof Abort) throw err;
      this.add(phase, name, 'fail', String(err.message || err).slice(0, 600), err.details, Date.now() - started);
      if (critical) throw new Abort(name);
      return undefined;
    }
    const result = out && typeof out === 'object' && !Array.isArray(out) && ('status' in out || 'note' in out || 'value' in out || 'details' in out) ? out : { note: typeof out === 'string' ? out : '' };
    const status = result.status || 'pass';
    this.add(phase, name, status, result.note || '', result.details, Date.now() - started);
    if (status === 'fail' && critical) throw new Abort(name);
    return result.value;
  }
}

const fail = (note, details) => ({ status: 'fail', note, details });
const warn = (note, details) => ({ status: 'warn', note, details });
const histogram = (list) => Object.entries(list.reduce((acc, s) => ({ ...acc, [s]: (acc[s] || 0) + 1 }), {})).map(([k, v]) => `${k}×${v}`).join(' ');

// ── Context ─────────────────────────────────────────────────────────────────

function loadConfig(id) {
  const file = join(KIT, 'modules', `${id}.json`);
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return {
    enableAlso: [], packages: [], seed: null, apiParams: {}, needsOtherScopes: [], pageParams: {}, pages: [], links: [], openToUsers: [], skipApi: [], ignoreBrowser: [], waitMs: 4500,
    ...config,
    file: existsSync(file) ? file : null,
  };
}

function setupContext(args) {
  APPEND_ONLY = loadConfig(args.id).appendOnly || [];
  const envFile = resolve(args.env || process.env.PACKAGE_KIT_ENV || '');
  if (!args.env && !process.env.PACKAGE_KIT_ENV) throw new Error('Give the test database env file: KIT_ENV=<file> (make) / --env FILE / $PACKAGE_KIT_ENV — POSTGRES_* of wh-test-pg');
  if (!existsSync(envFile)) throw new Error(`Test env file ${envFile} not found`);
  const creds = assertTestDatabase(parseEnvText(readFileSync(envFile, 'utf8')));
  const out = resolve(args.out || process.env.PACKAGE_KIT_OUT || join(tmpdir(), 'portal-package-kit'));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  const runDir = join(out, 'runs', `${args.id}-${args.mode}-${stamp}`);
  for (const dir of ['logs', 'tmp', 'dist', 'keys']) mkdirSync(join(runDir, dir), { recursive: true });
  return {
    args, creds, envFile, out, runDir,
    cacheDir: join(out, 'cache'),
    logDir: join(runDir, 'logs'),
    tmp: join(runDir, 'tmp'),
    db: new Db(BACKEND, creds),
    config: loadConfig(args.id),
    report: new Report(args.id, args.mode),
    worktrees: [],
    logIndex: 0,
  };
}

const logFile = (ctx, name) => join(ctx.logDir, `${String((ctx.logIndex += 1)).padStart(2, '0')}-${name.replace(/[^a-z0-9.-]+/gi, '-')}.log`);

function backendEnv(ctx, { port, database, modulesDir, uploadDir, frontendUrl, envFile, jwtSecret = null }) {
  const { host, port: pgPort, user, password } = ctx.creds;
  // The same portal on a new core keeps its secret (an upgrade): what the old core sealed must open (stored passwords).
  const jwt = jwtSecret || randomBytes(32).toString('hex');
  const values = {
    NODE_ENV: 'production',
    PORT: String(port),
    POSTGRES_HOST: host,
    POSTGRES_PORT: String(pgPort),
    POSTGRES_DB: database,
    POSTGRES_USER: user,
    POSTGRES_PASSWORD: password,
    JWT_SECRET: jwt,
    SETUP_TOKEN: randomBytes(12).toString('hex'),
    FRONTEND_URL: frontendUrl,
    UPLOAD_DIR: uploadDir,
    TZ: 'Asia/Bishkek',
  };
  writeFileSync(envFile, `${Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { mode: 0o600 });
  return {
    ...baseEnv(),
    ...values,
    ENV_FILE_PATH: envFile,
    MODULES_DIR: modulesDir,
    MODULE_TRUSTED_KEYS_FILE: ctx.keys.trustedFile,
    MODULE_BOOT_SETTLE_MS: '3000',
    DISABLE_SCHEDULER: 'true',
    PORTAL_WATCHDOG_SECONDS: '0',
    // pg_dump / pg_restore of module backups through the test container (pgbin refuses other servers).
    PATH: `${join(KIT, 'pgbin')}:${process.env.PATH}`,
    NODE_OPTIONS: '--max-old-space-size=1024',
    // The kit file's fakes (File server: SMBGATE_PYTHON → fakes/python-smbgate, an in-memory SMB gateway).
    ...kitBackendEnv(ctx.config.backendEnv, KIT),
  };
}

/** A database, folders and a supervised backend of `dir` (this checkout's src/backend by default). */
async function newPortal(ctx, tag, { dir = BACKEND, database = null, frontendPort = null, uploadDir = null, modulesDir = null, jwtSecret = null } = {}) {
  const name = database || (await ctx.db.createDatabase(kitDatabaseName(ctx.args.id, tag)));
  const port = await freePort();
  const base = join(ctx.tmp, tag);
  for (const sub of ['modules', 'uploads']) mkdirSync(join(base, sub), { recursive: true });
  const fport = frontendPort || (await freePort());
  const uploads = uploadDir || join(base, 'uploads');
  const modules = modulesDir || join(base, 'modules');
  const env = backendEnv(ctx, { port, database: name, modulesDir: modules, uploadDir: uploads, frontendUrl: `http://127.0.0.1:${fport}`, envFile: join(base, 'portal.env'), jwtSecret });
  const backend = new Backend({ name: `backend-${tag}`, dir, env, port, logDir: ctx.logDir });
  return { tag, database: name, port, frontendPort: fport, env, backend, modulesDir: modules, uploadDir: uploads, dir: base };
}

// ── Portal operations over HTTP ─────────────────────────────────────────────

async function setupPortal(portal) {
  const anon = new Client(portal.backend.base);
  const headers = { 'x-setup-token': portal.env.SETUP_TOKEN };
  expectOk(await anon.request('POST', '/api/setup/complete', { json: { username: ADMIN.username, email: 'kitadmin@example.test', password: ADMIN.password, passwordConfirm: ADMIN.password, locale: 'ru' }, headers }), 'setup: superadministrator');
  expectOk(await anon.request('POST', '/api/setup/access', { json: { accessMode: 'closed' }, headers }), 'setup: access mode');
  const admin = new Client(portal.backend.base, { name: 'superadmin' });
  await admin.login(ADMIN.username, ADMIN.password);
  // The kit makes hundreds of requests from one address: lift the general API budget (not the sign-in limiters).
  expectOk(await admin.put('/api/admin/settings', { rateLimit: { max: 100000, userMax: 1000000 } }), 'raise the API rate limit');
  return admin;
}

async function createPlainUser(admin, baseUrl, { roleIds = [] } = {}) {
  const res = await admin.post('/api/admin/users', { username: USER.username, password: USER.password, displayName: 'Kit plain user', email: 'kituser@example.test', groupIds: [], roleIds });
  const body = expectOk(res, 'create the plain user');
  const user = new Client(baseUrl, { name: 'user' });
  await user.login(USER.username, USER.password);
  return { user, userId: body.user?.id };
}

async function permissionsOf(client) {
  const me = expectOk(await client.get('/api/auth/me'), 'GET /api/auth/me');
  const perms = me.user?.permissions || me.user?.access?.permissions || me.permissions || [];
  return Array.isArray(perms) ? perms : Object.keys(perms);
}

async function setModules(admin, patch, what) {
  const res = await admin.put('/api/admin/settings', { modules: patch });
  return expectOk(res, what);
}

async function packageState(admin, id) {
  const body = expectOk(await admin.get('/api/admin/modules/packages'), 'GET /api/admin/modules/packages');
  return { row: (body.packages || []).find((item) => item.id === id) || null, body };
}

async function upload(admin, file) {
  return admin.upload('/api/admin/modules/packages/upload', readFileSync(file), file.split('/').pop());
}

/** Upload + «Установить», then the supervised restart. Returns the install answer. */
async function installFile(ctx, portal, admin, file, { expectAction = null } = {}) {
  const staged = expectOk(await upload(admin, file), `upload ${file.split('/').pop()}`);
  if (staged.problems?.length) throw new Error(`upload refused: ${staged.problems.map((p) => `${p.code} ${p.message?.en || ''}`).join('; ')}`);
  if (expectAction && staged.preview?.action !== expectAction) throw new Error(`the card says «${staged.preview?.action}», expected «${expectAction}»`);
  const before = await portal.backend.bootId();
  const installed = expectOk(await admin.post('/api/admin/modules/packages/install', { token: staged.token }, { timeoutMs: 300_000 }), 'install');
  await portal.backend.waitRestart(before);
  return { staged, installed };
}

async function uninstall(portal, admin, id) {
  const before = await portal.backend.bootId();
  const body = expectOk(await admin.del(`/api/admin/modules/packages/${id}`), `remove ${id}`);
  await portal.backend.waitRestart(before);
  return body;
}

/*
 * Linked module packages (kit file `packages`): other packages the module's links need (Masterplan for the
 * CRM, the CRM for Contracts…), signed with the kit key. `files`: { id: zip }. Each is installed (or, when
 * the portal runs an older version of it, updated) and switched on. → a note.
 */
async function installLinkedPackages(ctx, portal, admin, files, { expect = {} } = {}) {
  const notes = [];
  for (const [other, file] of Object.entries(files)) {
    const { staged } = await installFile(ctx, portal, admin, file, expect[other] ? { expectAction: expect[other] } : {});
    notes.push(`${other} ${staged.preview?.version || ''} ${staged.preview?.action || ''}`.replace(/\s+/g, ' ').trim());
  }
  const ids = Object.keys(files);
  if (ids.length) await setModules(admin, Object.fromEntries(ids.map((other) => [other, { enabled: true }])), 'switch on the linked packages');
  for (const other of ids) {
    const { row } = await packageState(admin, other);
    if (!row?.loaded || row.state !== 'enabled') throw new Error(`${other}: state ${row?.state}, loaded ${row?.loaded}, error ${row?.error || '—'}`);
  }
  return notes.join('; ');
}

async function seedDemo(ctx, admin, phase) {
  const id = ctx.args.id;
  const overview = await admin.get('/api/admin/demo');
  const known = new Set((overview.body?.demo?.modules || []).map((item) => item.module));
  const order = ctx.config.seed || [id];
  const results = [];
  for (const module of order) {
    if (!known.has(module)) {
      results.push(`${module}: no demo`);
      continue;
    }
    const res = await admin.post(`/api/admin/demo/${module}/seed`, {}, { timeoutMs: 600_000 });
    const body = expectOk(res, `${phase}: demo data of ${module}`);
    results.push(`${module}: ${body.result?.already ? 'already' : Object.entries(body.result?.counts || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'seeded'}`);
  }
  // Records made through the module's own API (kit file `seedRequests`), for modules without demo data.
  const saved = {};
  const requests = ctx.config.seedRequests || [];
  for (const request of requests) {
    const body = fillRefs(request.body ?? {}, saved);
    const path = String(request.path).replace(/@([\w.]+)/g, (ref) => encodeURIComponent(String(fillRefs(ref, saved))));
    const method = String(request.method || 'POST').toUpperCase();
    const res = request.upload
      ? await admin.upload(path, Buffer.from(request.upload.base64, 'base64'), request.upload.name, request.upload.type)
      : await admin.request(method, path, { timeoutMs: 60_000, ...(['GET', 'DELETE'].includes(method) ? {} : { json: body }) });
    const what = `${phase}: seed ${request.upload ? 'upload to' : method} ${path}`;
    // `expectStatus`: a refusal the seed wants (the call is still made for its side effects, e.g. a journal entry).
    if (request.expectStatus != null) {
      if (res.status !== request.expectStatus) throw new Error(`${what}: HTTP ${res.status}, expected ${request.expectStatus} ${res.body?.code || ''}`);
    } else {
      const answer = expectOk(res, what);
      if (request.save) saved[request.save] = answer;
    }
  }
  if (requests.length) results.push(`${requests.length} records through the API`);
  if (!known.has(id) && !requests.length) return warn(`the module has no demo data (${results.join('; ')}) — data checks cover what the migrations create`);
  return results.join('; ');
}

/** "@name.path.to.value" strings in a seed body → that value of an earlier saved answer. */
function fillRefs(value, saved) {
  if (typeof value === 'string' && value.startsWith('@')) {
    const [name, ...path] = value.slice(1).split('.');
    const found = path.reduce((v, k) => v?.[k], saved[name]);
    if (found === undefined) throw new Error(`seed: ${value} has no value`);
    return found;
  }
  if (Array.isArray(value)) return value.map((item) => fillRefs(item, saved));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillRefs(v, saved)]));
  return value;
}

/** SQL-valued parameters of the module's kit file, read from the portal's database. */
async function resolveParams(ctx, database, spec) {
  const out = {};
  await ctx.db.with(database, async (client) => {
    for (const [name, value] of Object.entries(spec || {})) {
      if (typeof value === 'string' && /^\s*select\b/i.test(value)) {
        const row = (await client.query(value).catch(() => ({ rows: [] }))).rows[0];
        out[name] = row ? Object.values(row)[0] : null;
      } else out[name] = value;
    }
  });
  return out;
}

async function introspect(ctx, portal, version) {
  const dir = join(portal.modulesDir, ctx.args.id, version);
  const log = logFile(ctx, 'introspect');
  const outFile = `${log}.json`;
  await run('introspect', 'sh', ['-c', `"${process.execPath}" "${join(KIT, 'lib/introspect.mjs')}" "$0" "$1" > "${outFile}"`, portal.backend.dir, dir], { cwd: portal.backend.dir, env: portal.env, log, timeoutMs: 120_000 });
  return JSON.parse(readFileSync(outFile, 'utf8'));
}

/** GET every route as each caller; one step per caller. */
/** The API reference (/api/developer/reference) and openapi.json list every route the package mounts. */
async function referenceStep(ctx, phase, admin, routes, label = '') {
  await ctx.report.step(phase, `API reference + OpenAPI list the package routes${label}`, async () => {
    const ref = expectOk(await admin.get('/api/developer/reference'), 'reference');
    const spec = await admin.get('/api/developer/openapi.json');
    if (spec.status !== 200) return fail(`openapi.json ${spec.status}`);
    const trim = (path) => path.replace(/(.)\/$/, '$1');
    const listed = new Set((ref.endpoints || []).map((e) => `${e.method} ${trim(`/api${e.path}`)}`));
    const openapi = new Set(Object.entries(spec.body?.paths || {}).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} /api${path}`)));
    const asOpenApi = (route) => `${route.method} ${route.path.replace(/:(\w+)(\([^)]*\))?/g, '{$1}').replace(/(.)\/$/, '$1')}`;
    // The API reference documents what tokens may call: an area never open to tokens (kit file `sessionsOnly: true`,
    // api/scopes.js BLOCKED) is left out on purpose — and must not be listed.
    if (ctx.config.sessionsOnly === true) {
      const leaked = (routes.routes || []).filter((r) => listed.has(`${r.method} ${trim(r.path)}`));
      if (leaked.length) return fail(`${leaked.length} route(s) of an area closed to tokens are listed: ${leaked.slice(0, 4).map((r) => `${r.method} ${r.path}`).join(', ')}`);
      return `none listed (sessions only: ${(routes.routes || []).length} routes closed to API tokens)`;
    }
    const own = routes.routes || [];
    const missing = own.filter((r) => !listed.has(`${r.method} ${trim(r.path)}`)).map((r) => `${r.method} ${r.path}`);
    const missingSpec = own.filter((r) => !openapi.has(asOpenApi(r))).map((r) => `${r.method} ${r.path}`);
    const problems = [...missing.map((m) => `reference: ${m}`), ...missingSpec.map((m) => `openapi: ${m}`)];
    if (problems.length) return fail(`${problems.length} of ${own.length * 2} missing: ${problems.slice(0, 6).join(', ')}`, problems);
    const section = (ref.sections || []).find((item) => (item.prefix || []).includes(`/app/${ctx.args.id}`));
    return `${own.length} routes in both; section ${section ? section.key : '(none)'}`;
  }, { critical: false });
}

async function sweep(ctx, phase, portal, callers, routes, label = '') {
  const id = ctx.args.id;
  const params = await resolveParams(ctx, portal.database, ctx.config.apiParams);
  const open = routeMatcher(ctx.config.openToUsers);
  const skip = routeMatcher(ctx.config.skipApi);
  const otherScopes = routeMatcher(ctx.config.needsOtherScopes);
  const gets = routes.routes.filter((route) => route.method === 'GET');
  const list = gets.filter((route) => !skip('GET', route.path));
  const skipped = gets.length - list.length;
  // The superadministrator's answers first: what a filtered answer is compared with.
  const adminSizes = new Map();
  const ordered = [...callers].sort((a, b) => (a.who === 'superadmin' ? -1 : b.who === 'superadmin' ? 1 : 0));
  for (const { who, client } of ordered) {
    await ctx.report.step(phase, `API GET ×${list.length} as ${who}${label}`, async () => {
      const failures = [];
      const warnings = [];
      const statuses = [];
      for (const route of list) {
        const { url } = fillPath(route.path, params, '1');
        const res = await client.get(url, { timeoutMs: 25_000 });
        statuses.push(res.timeout ? 'timeout' : res.status);
        if (who === 'superadmin') adminSizes.set(route.path, res.status < 300 ? dataSize(res) : null);
        const verdict = judgeStatus(who, res.status, { open: open('GET', route.path), otherScopes: otherScopes('GET', route.path), timeout: res.timeout, code: res.body?.code || null, size: dataSize(res), adminSize: adminSizes.get(route.path) ?? null, sessionsOnly: ctx.config.sessionsOnly === true || (Array.isArray(ctx.config.sessionsOnly) && routeMatcher(ctx.config.sessionsOnly)('GET', route.path)) });
        const line = `${route.path} → ${verdict.note}${res.body?.code && !verdict.note.includes(res.body.code) ? ` (${res.body.code})` : ''}`;
        if (!verdict.ok) failures.push(line);
        else if (verdict.warn) warnings.push(line);
      }
      const note = `${histogram(statuses)}${skipped ? `; ${skipped} skipped by the kit file` : ''}`;
      if (failures.length) return fail(`${failures.length} of ${list.length}: ${failures.slice(0, 4).join('; ')}`, { failures, warnings });
      if (warnings.length) return warn(`${note}; ${warnings.length} to look at: ${warnings.slice(0, 3).join('; ')}`, { warnings });
      return note;
    }, { critical: false });
  }
  if (routes.public?.length) {
    const anon = new Client(portal.backend.base);
    await ctx.report.step(phase, `public GET ×${routes.public.filter((r) => r.method === 'GET').length} anonymous${label}`, async () => {
      const failures = [];
      const statuses = [];
      for (const route of routes.public.filter((r) => r.method === 'GET')) {
        const res = await anon.get(fillPath(route.path, params, '1').url, { timeoutMs: 25_000 });
        statuses.push(res.status);
        const verdict = judgeStatus('anonymous', res.status, { open: true, timeout: res.timeout });
        if (!verdict.ok) failures.push(`${route.path} → ${verdict.note}`);
      }
      return failures.length ? fail(failures.slice(0, 4).join('; '), failures) : histogram(statuses);
    }, { critical: false });
  }
  return id;
}

/** Pages the module's web entry registers (App routes, Settings) + the kit file's extra pages. */
function modulePages(ctx, manifest, params) {
  const id = ctx.args.id;
  const front = join(ROOT, 'src/frontend/src/modules', id);
  let routes = [];
  const entry = ['index.js', 'index.jsx'].map((name) => join(front, name)).find(existsSync);
  if (entry) {
    const m = /App\s*:\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/.exec(readFileSync(entry, 'utf8'));
    const app = m ? ['', '.jsx', '.js', '/index.jsx', '/index.js'].map((ext) => resolve(front, `${m[1]}${ext}`)).find((file) => existsSync(file) && !file.endsWith('/')) : null;
    if (app) routes = routePathsFromSource(readFileSync(app, 'utf8'));
  }
  const web = manifest.web || null;
  return pageList(id, { routes: ctx.config.pages?.length && ctx.config.replacePages ? [] : routes, hasPage: Boolean(web) && web.page !== false, hasSettings: Boolean(web?.settings), extra: ctx.config.pages, params });
}

async function browserStep(ctx, phase, name, ui, pages, { username = ADMIN.username, password = ADMIN.password } = {}) {
  if (!ctx.args.browser) {
    ctx.report.add(phase, name, 'skip', '--no-browser');
    return;
  }
  await ctx.report.step(phase, name, async () => {
    const jobDir = join(ctx.runDir, 'browser', `${String((ctx.logIndex += 1)).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`);
    const result = await browse({ jobDir, base: ui.base, username, password, pages, ignore: ctx.config.ignoreBrowser, waitMs: ctx.config.waitMs, pwModules: ctx.pwModules, log: logFile(ctx, 'playwright'), say: (text) => console.log(`    … ${text}`) });
    if (result.error) return fail(`browser: ${result.error}`, result);
    const bad = result.pages.filter((page) => page.errors.length);
    const details = result.pages.map((page) => ({ url: page.url, ...(page.name ? { name: page.name } : {}), ...(page.anonymous ? { anonymous: true } : {}), ...(page.held?.length ? { held: page.held } : {}), finalPath: page.finalPath, ...(page.visited?.length > 1 ? { visited: page.visited } : {}), errors: page.errors, notes: page.notes, shot: page.shot }));
    if (bad.length) return fail(`${bad.length} of ${result.pages.length} pages: ${bad.slice(0, 3).map((page) => `${page.url}: ${page.errors[0].split('\n')[0]}`).join('; ')}`, details);
    const notes = [...new Set(result.pages.flatMap((page) => page.notes))];
    if (notes.length) return warn(`${result.pages.length} pages render; API 4xx to look at: ${notes.slice(0, 4).join(', ')}`, details);
    return { status: 'pass', note: `${result.pages.length} pages render`, details };
  }, { critical: false });
}

/**
 * Cross-module link probes of the kit file: `present` (both modules on), `absent` (this module missing),
 * `oldCore` (the SOURCE_REF core with the module built in; falls back to `present`) or `alone` (the module
 * installed before the linked packages of the kit file `packages`; only probes that have it).
 */
async function linkProbes(ctx, phase, admin, which, label, database) {
  // `alone`: the module installed, the linked packages never were — only probes that say what to expect then.
  const probes = (ctx.config.links || []).filter((probe) => which !== 'alone' || probe.alone);
  if (which === 'alone' && !probes.length) return;
  const params = await resolveParams(ctx, database, ctx.config.apiParams);
  if (!probes.length) {
    ctx.report.add(phase, `links (${label})`, 'skip', 'no link probes in the kit file');
    return;
  }
  for (const probe of probes) {
    await ctx.report.step(phase, `link ${probe.name} (${label})`, async () => {
      const { url, missing } = fillPath(probe.path, params, null);
      if (missing.length) return { status: 'skip', note: `no value for :${missing.join(', :')}` };
      const expect = probe[which] || (which === 'oldCore' ? probe.present : null) || {};
      if (probe.websocket) {
        // A WebSocket upgrade (e.g. Remote's tunnels, served by the package's ctx.onHttpServer hook): only the status line.
        const status = await upgradeStatus(admin.base, url, { timeoutMs: 25_000 });
        if (status === -1) return fail(`${probe.path} upgrade → no answer within 25 s`);
        if (status >= 500) return fail(`${probe.path} upgrade → ${status}`);
        if (expect.status != null && status !== expect.status) return fail(`${probe.path} upgrade → ${status || 'connection closed'}, expected ${expect.status}`);
        if (expect.not != null && status === expect.not) return fail(`${probe.path} upgrade → ${status}, expected anything else`);
        return `upgrade → ${status || 'connection closed without an answer'}`;
      }
      // `anonymous: true`: called without a session (a public page of the package, the shell list a visitor gets).
      const res = await (probe.anonymous ? new Client(admin.base) : admin).get(url, { timeoutMs: 25_000 });
      if (res.status >= 500 || res.timeout) return fail(`${probe.path} → ${res.timeout ? 'timeout' : res.status}`);
      if (expect.status && res.status !== expect.status) return fail(`${probe.path} → ${res.status}, expected ${expect.status} ${res.body?.code || ''}`);
      if (expect.maxStatus && res.status > expect.maxStatus) return fail(`${probe.path} → ${res.status}, expected ≤ ${expect.maxStatus}`);
      // `has` / `lacks`: a value at that path of the answer is there (not null) / is not.
      const at = (path) => path.split('.').reduce((v, k) => v?.[k], res.body);
      if (expect.has && at(expect.has) == null) return fail(`${probe.path} → ${res.status} but ${expect.has} is missing`);
      if (expect.lacks && at(expect.lacks) != null) return fail(`${probe.path} → ${expect.lacks} is still there without the module`);
      if (expect.nonEmpty) {
        const value = expect.nonEmpty.split('.').reduce((v, k) => v?.[k], res.body);
        if (!Array.isArray(value) || !value.length) return fail(`${probe.path} → ${res.status} but ${expect.nonEmpty} is empty`);
        return `${res.status}, ${value.length} ${expect.nonEmpty}`;
      }
      if (expect.empty) {
        const value = expect.empty.split('.').reduce((v, k) => v?.[k], res.body);
        if (Array.isArray(value) && value.length) return fail(`${probe.path} → ${expect.empty} still lists ${value.length} items without the module`);
      }
      return `${res.status}${res.body?.code ? ` ${res.body.code}` : ''}`;
    }, { critical: false });
  }
}

// Kit file `appendOnly`: log tables the kit's own requests add rows to (set once the kit file is read).
let APPEND_ONLY = [];
function compare(before, after, { ignoreTables = [], appendOnly = APPEND_ONLY } = {}) {
  const diff = diffSnapshots(before, after, { ignoreTables, appendOnly });
  if (diff.length) return fail(`${diff.length} difference(s): ${diff.slice(0, 3).map((d) => `${d.path} ${d.before} → ${d.after}`).join('; ')}`, diff);
  const added = Object.keys(after.appSettings || {}).filter((key) => !(key in (before.appSettings || {})));
  return `identical: ${Object.keys(after.tables).length} tables, ${after.meta.rows} rows, ${after.files?.count ?? 0} files, settings, ${Object.keys(after.roles).length} role(s), ${Object.keys(after.layouts).length} layout(s)${added.length ? `; new app_settings keys: ${added.join(', ')}` : ''}`;
}

const snap = (ctx, portal, opts = {}) => ctx.db.with(portal.database, (client) => snapshot(client, BACKEND, ctx.args.id, { manifestTables: ctx.manifest.tables || [], uploadDir: portal.uploadDir, uploadFolders: ctx.config.uploadFolders || [ctx.args.id], ...opts }));

async function ensureUi(ctx, portal) {
  if (!ctx.args.browser) return null;
  ctx.front ||= await ctx.report.step('frontend', ctx.args.frontDist ? 'core frontend: the given build (--front-dist)' : 'core frontend build (cached per source state)', async () => {
    const given = ctx.args.frontDist ? resolve(ctx.args.frontDist) : null;
    if (given && !existsSync(join(given, 'index.html'))) return fail(`--front-dist ${given} has no index.html`);
    const built = given ? { dir: given, key: 'given', reused: true } : await buildFrontend({ root: ROOT, cacheDir: ctx.cacheDir, env: baseEnv(), log: logFile(ctx, 'vite-build'), say: (text) => console.log(`    … ${text}`) });
    ctx.pwModules = await playwrightModules({ cacheDir: ctx.cacheDir, env: baseEnv(), log: logFile(ctx, 'playwright-install') });
    return { value: built, note: given ? given : `${built.reused ? 'reused' : 'built'} ${built.key}` };
  });
  if (portal.ui) return portal.ui;
  portal.ui = await startPreview({ root: ROOT, dir: ctx.front.dir, port: portal.frontendPort, backendBase: portal.backend.base, env: baseEnv(), log: logFile(ctx, `preview-${portal.tag}`) });
  return portal.ui;
}

async function stopPortal(portal) {
  if (!portal) return;
  if (portal.ui) await stop(portal.ui.pid);
  portal.ui = null;
  await portal.backend.stop();
}

// ── Phase: package ──────────────────────────────────────────────────────────

async function phasePackage(ctx) {
  const P = 'package';
  const { id } = ctx.args;
  const env = baseEnv();
  ctx.keys = await ctx.report.step(P, 'throw-away Ed25519 key + trusted-keys override (MODULE_TRUSTED_KEYS_FILE)', async () => {
    const keys = await makeKeys(BACKEND, join(ctx.runDir, 'keys'));
    return { value: keys, note: `key ${keys.keyId}` };
  });
  const dist = join(ctx.runDir, 'dist');
  ctx.files = {};
  ctx.files.unsigned = await ctx.report.step(P, 'build unsigned (make module UNSIGNED=1)', async () => {
    const file = await buildPackage({ root: ROOT, id, outDir: join(dist, 'unsigned'), trustedFile: ctx.keys.trustedFile, env, log: logFile(ctx, 'build-unsigned') });
    return { value: file, note: file.split('/').pop() };
  });
  await ctx.report.step(P, 'verify unsigned (--allow-unsigned) and refused without it', async () => {
    const ok = await verifyPackage({ root: ROOT, file: ctx.files.unsigned, trustedFile: ctx.keys.trustedFile, allowUnsigned: true, env, log: logFile(ctx, 'verify-unsigned') });
    if (!ok.ok) return fail(ok.output);
    const strict = await verifyPackage({ root: ROOT, file: ctx.files.unsigned, trustedFile: ctx.keys.trustedFile, env, log: logFile(ctx, 'verify-unsigned-strict') });
    if (strict.ok) return fail('an unsigned package verified without --allow-unsigned');
    return ok.output;
  });
  ctx.files.signed = await ctx.report.step(P, 'build signed with the throw-away key', async () => {
    const file = await buildPackage({ root: ROOT, id, outDir: join(dist, 'signed'), keyFile: ctx.keys.keyFile, trustedFile: ctx.keys.trustedFile, env, log: logFile(ctx, 'build-signed') });
    return { value: file, note: file.split('/').pop() };
  });
  await ctx.report.step(P, 'verify signed', async () => {
    const ok = await verifyPackage({ root: ROOT, file: ctx.files.signed, trustedFile: ctx.keys.trustedFile, env, log: logFile(ctx, 'verify-signed') });
    if (!ok.ok) return fail(ok.output);
    if (!ok.output.includes(`signed by ${ctx.keys.keyId}`)) return fail(`not signed by the kit key: ${ok.output}`);
    return ok.output;
  });
  const { manifest, files } = await readPackage(BACKEND, ctx.files.signed);
  ctx.manifest = manifest;
  ctx.report.data.facts.manifest = { id: manifest.id, version: manifest.version, core: manifest.core, sdk: manifest.sdk, requires: manifest.requires, enhances: manifest.enhances, permissions: manifest.permissions, tables: manifest.tables, web: manifest.web, files: files.length };
  await ctx.report.step(P, 'manifest: version, core, requires/enhances, permissions, tables, legacy prefixes', async () => {
    const { MODULE_TABLES, ownsPermission, tablePatternProblem } = await import(pathToFileURL(join(BACKEND, 'platform/packages/tableOwnership.js')).href);
    const problems = [];
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) problems.push(`version ${manifest.version}`);
    if (!manifest.core) problems.push('no core version');
    if (!manifest.sdk) problems.push('no sdk version');
    // <id>.* — or a legacy prefix the core declares for the module (tableOwnership.js: directory → ad.*).
    for (const perm of manifest.permissions || []) if (!ownsPermission(id, perm)) problems.push(`permission ${perm} is not ${id}.*`);
    for (const pattern of manifest.tables || []) {
      const problem = tablePatternProblem(id, pattern);
      if (problem) problems.push(`tables ${pattern}: ${problem}`);
    }
    const legacy = (manifest.tables || []).filter((p) => !p.startsWith(`${id}_`));
    for (const pattern of legacy) if (!(MODULE_TABLES[id] || []).some((prefix) => pattern.startsWith(prefix))) problems.push(`${pattern} is not a prefix the core declares for ${id} (tableOwnership.js)`);
    const migrations = files.filter((f) => f.name.startsWith('migrations/')).map((f) => f.name.slice(11));
    // A migrations/001_* file, or an inline migration whose id starts with 001_ (`migrations: [{ id: '001_init', … }]`, also through a constant).
    const hasInit = migrations.some((name) => name.startsWith('001_')) || /\bid\s*:\s*["'`]001_/.test(files.find((f) => f.name === manifest.server?.entry)?.data.toString('utf8') || '');
    if (!hasInit) problems.push('no migration 001 (migrations/001_*.sql|js or an inline migrations list)');
    if (problems.length) return fail(problems.join('; '), problems);
    return `v${manifest.version}, core ${manifest.core}+, sdk ${manifest.sdk}, requires [${(manifest.requires || []).map((r) => r.id || r.integration).join(', ')}], enhances [${(manifest.enhances || []).map((e) => e.id || e.integration).join(', ')}], ${manifest.permissions.length} permissions, tables [${(manifest.tables || []).join(', ') || `${id}_*`}]${legacy.length ? ` (legacy ${legacy.join(', ')} declared)` : ''}, migrations [${migrations.join(', ') || 'inline'}]`;
  });
  await ctx.report.step(P, 'tampered copy and a copy signed by an untrusted key are refused', async () => {
    ctx.files.tampered = await tampered(BACKEND, ctx.files.signed, dist);
    ctx.files.untrusted = await untrusted(BACKEND, ctx.files.signed, ctx.keys.otherFile, dist);
    for (const [what, file] of [['tampered', ctx.files.tampered], ['untrusted', ctx.files.untrusted]]) {
      const res = await verifyPackage({ root: ROOT, file, trustedFile: ctx.keys.trustedFile, allowUnsigned: true, env, log: logFile(ctx, `verify-${what}`) });
      if (res.ok) return fail(`the ${what} copy verified`);
    }
    return 'both REJECTED';
  });
  // Linked module packages (kit file `packages`): this checkout's builds, signed with the kit key.
  ctx.files.linked = {};
  for (const other of ctx.config.packages || []) {
    ctx.files.linked[other] = await ctx.report.step(P, `linked package ${other}: build signed (this checkout)`, async () => {
      const file = await buildPackage({ root: ROOT, id: other, outDir: join(dist, 'linked'), keyFile: ctx.keys.keyFile, trustedFile: ctx.keys.trustedFile, env, log: logFile(ctx, `build-linked-${other}`) });
      return { value: file, note: file.split('/').pop() };
    });
  }
}

// ── Phase: fresh ────────────────────────────────────────────────────────────

async function phaseFresh(ctx) {
  const P = 'fresh';
  const { id } = ctx.args;
  const portal = await newPortal(ctx, 'fresh');
  ctx.portals.push(portal);
  let admin;
  await ctx.report.step(P, `new database ${portal.database}, backend of this checkout on :${portal.port} (MODULES_DEV off)`, async () => {
    await portal.backend.start();
    admin = await setupPortal(portal);
    return `boot ${portal.backend.bootIdNow}`;
  });
  const { user } = await ctx.report.step(P, 'plain user without any permission', async () => {
    const made = await createPlainUser(admin, portal.backend.base);
    const perms = await permissionsOf(made.user);
    if (perms.includes('*') || perms.some((p) => p.startsWith(`${id}.`))) return fail(`the user holds ${perms.join(', ')}`);
    return { value: made, note: `${USER.username}: ${perms.length ? perms.join(', ') : 'no permissions'}` };
  });
  await ctx.report.step(P, 'refused before install: unsigned (dev mode off), tampered, untrusted key', async () => {
    const out = [];
    for (const [what, file] of [['unsigned', ctx.files.unsigned], ['tampered', ctx.files.tampered], ['untrusted', ctx.files.untrusted]]) {
      const res = await upload(admin, file);
      const refused = res.status >= 400 || res.body?.success === false || res.body?.problems?.length;
      if (!refused) return fail(`${what} accepted: ${res.status} ${res.text.slice(0, 200)}`);
      if (res.status >= 500) return fail(`${what}: server error ${res.status}`);
      out.push(`${what} ${res.status} ${res.body?.code || res.body?.problems?.[0]?.code || ''}`.trim());
    }
    return out.join(', ');
  });
  await ctx.report.step(P, `install ${ctx.manifest.version} over HTTP (upload → card → install → restart)`, async () => {
    const { staged, installed } = await installFile(ctx, portal, admin, ctx.files.signed, { expectAction: 'install' });
    if (!staged.preview?.signed) return fail('the card does not say «signed»');
    return `applied [${(installed.applied || []).join(', ')}], restarted (${portal.backend.restarts} restart(s) so far)`;
  });
  await ctx.report.step(P, 'installed switched off; then enabled (and the linked modules of the kit file)', async () => {
    const { row } = await packageState(admin, id);
    if (!row) return fail('not listed on the Modules page');
    if (row.state !== 'disabled') return fail(`state ${row.state} right after install (expected installed, switched off)`);
    const patch = { [id]: { enabled: true }, ...Object.fromEntries(ctx.config.enableAlso.map((other) => [other, { enabled: true }])) };
    await setModules(admin, patch, 'enable');
    const after = (await packageState(admin, id)).row;
    if (after.state !== 'enabled' || !after.loaded) return fail(`state ${after.state}, loaded ${after.loaded}`);
    return `v${after.version} ${after.state}, signed by ${after.signedBy}${ctx.config.enableAlso.length ? `; on: ${ctx.config.enableAlso.join(', ')}` : ''}`;
  });
  const routes = await ctx.report.step(P, 'routes the package mounts (its router stack)', async () => {
    const found = await introspect(ctx, portal, ctx.manifest.version);
    ctx.report.data.facts.routes = found;
    const gets = found.routes.filter((r) => r.method === 'GET').length;
    return { value: found, note: `${found.routes.length} routes (${gets} GET), ${found.public.length} public${found.skipped.length ? `; unreadable: ${found.skipped.join(', ')}` : ''}`, status: found.routes.length ? 'pass' : 'warn' };
  });
  const linked = Object.keys(ctx.files.linked || {});
  if (linked.length) {
    // The module on a portal that never had the packages it links to (their tables do not exist): its own
    // demo data, every GET route as the superadministrator, the demo data removed again.
    await ctx.report.step(P, `before the linked packages (${linked.join(', ')}) are installed: own demo data`, async () => {
      const overview = await admin.get('/api/admin/demo');
      if (!(overview.body?.demo?.modules || []).some((item) => item.module === id)) return { status: 'skip', note: 'the module has no demo data' };
      const body = expectOk(await admin.post(`/api/admin/demo/${id}/seed`, {}, { timeoutMs: 600_000 }), 'demo data alone');
      ctx.aloneDemo = true;
      return Object.entries(body.result?.counts || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'seeded';
    }, { critical: false });
    await sweep(ctx, P, portal, [{ who: 'superadmin', client: admin }], routes, ` (linked packages not installed)`);
    await linkProbes(ctx, P, admin, 'alone', 'linked packages not installed', portal.database);
    if (ctx.aloneDemo) {
      await ctx.report.step(P, 'own demo data removed again', async () => {
        expectOk(await admin.post(`/api/admin/demo/${id}/purge`, {}, { timeoutMs: 600_000 }), 'demo purge');
        return 'removed';
      }, { critical: false });
    }
    await ctx.report.step(P, `linked packages installed and switched on: ${linked.join(', ')}`, async () => installLinkedPackages(ctx, portal, admin, ctx.files.linked));
  }
  await ctx.report.step(P, 'demo data (the module\'s own seeding)', () => seedDemo(ctx, admin, P), { critical: false });
  const tokens = await ctx.report.step(P, 'API tokens: one without the module\'s scope, one with read', async () => {
    const none = expectOk(await admin.post('/api/admin/api/tokens', { name: 'kit-no-scope', scopes: { account: 'read' } }), 'token without scope');
    const scoped = expectOk(await admin.post('/api/admin/api/tokens', { name: 'kit-scoped', scopes: { account: 'read', [id]: 'read' } }), 'token with scope');
    if (scoped.token?.scopes && scoped.token.scopes[id] !== 'read') return fail(`the scope ${id} was not kept: ${JSON.stringify(scoped.token.scopes)}`);
    return { value: { none: new Client(portal.backend.base, { token: none.secret, name: 'token' }), scoped: new Client(portal.backend.base, { token: scoped.secret, name: 'scoped-token' }) }, note: 'created' };
  });
  await referenceStep(ctx, P, admin, routes);
  await sweep(ctx, P, portal, [
    { who: 'superadmin', client: admin },
    { who: 'scoped-token', client: tokens.scoped },
    { who: 'user', client: user },
    { who: 'token', client: tokens.none },
  ], routes);
  await linkProbes(ctx, P, admin, 'present', 'both installed', portal.database);
  const ui = await ensureUi(ctx, portal);
  const params = await resolveParams(ctx, portal.database, ctx.config.pageParams);
  const { pages, skipped } = modulePages(ctx, ctx.manifest, params);
  ctx.report.data.facts.pages = { pages: pages.map((p) => p.url), skipped };
  if (skipped.length) ctx.report.add(P, 'pages without a parameter value', 'warn', skipped.map((s) => `${s.path} (${s.reason})`).join('; '));
  if (ui) {
    await browserStep(ctx, P, `pages as superadmin (${pages.length})`, ui, pages);
    await browserStep(ctx, P, 'module page as the plain user (no crash, no access)', ui, [{ url: `/app/${id}`, expectPrefix: '/' }], { username: USER.username, password: USER.password });
  }
  // The module alone: what it links to switched off (each enhances link degrades).
  const others = [...new Set([...(ctx.manifest.enhances || []).map((e) => e.id).filter(Boolean), ...ctx.config.enableAlso, ...linked])];
  if (others.length) {
    const wasOn = await ctx.db.with(portal.database, async (c) => {
      const row = (await c.query(`SELECT value FROM app_settings WHERE key = 'modules'`)).rows[0];
      const stored = row ? JSON.parse(row.value) : {};
      return others.filter((other) => stored[other]?.enabled === true || ctx.config.enableAlso.includes(other) || linked.includes(other));
    });
    const off = await ctx.report.step(P, `switch off what it links to: ${others.join(', ')}`, async () => {
      const res = await admin.put('/api/admin/settings', { modules: Object.fromEntries(others.map((other) => [other, { enabled: false }])) });
      if (res.status === 409) return { status: 'warn', note: `refused by requirements: ${res.body?.error || res.body?.code}`, value: false };
      expectOk(res, 'switch off');
      return { value: true, note: 'off' };
    }, { critical: false });
    if (off) {
      await sweep(ctx, P, portal, [{ who: 'superadmin', client: admin }], routes, ' (linked modules off)');
      if (ui) await browserStep(ctx, P, 'pages with the linked modules off', ui, pages);
      await ctx.report.step(P, 'switch them back on', async () => {
        if (wasOn.length) await setModules(admin, Object.fromEntries(wasOn.map((other) => [other, { enabled: true }])), 'switch on');
        return `on: ${wasOn.join(', ') || '—'}`;
      }, { critical: false });
    }
  }
  // Update with a trivial migration.
  await ctx.report.step(P, 'update variants of the signed build: +1 with a trivial migration, then +1 with a failing one (re-signed)', async () => {
    const taken = await ctx.db.with(portal.database, (c) => appliedMigrations(c, id));
    const dist = join(ctx.runDir, 'dist');
    const probeTable = `${id}_${PROBE_LABEL}`;
    ctx.probeTable = probeTable;
    ctx.files.update = await variant(BACKEND, ctx.files.signed, { by: 1, label: PROBE_LABEL, sql: `CREATE TABLE IF NOT EXISTS ${probeTable} (id integer PRIMARY KEY, note text NOT NULL);\nINSERT INTO ${probeTable} (id, note) VALUES (1, 'package kit') ON CONFLICT DO NOTHING;\n`, keyFile: ctx.keys.keyFile, outDir: dist, taken });
    // On top of the update (its migration included), or the refusal would be SCHEMA_NEWER, not the failing migration.
    ctx.files.bad = await variant(BACKEND, ctx.files.update.file, { by: 1, label: 'kit_broken', sql: `CREATE TABLE ${id}_kit_broken (id integer);\nINSERT INTO ${id}_kit_broken VALUES (1);\nSELECT 1 / 0;\n`, keyFile: ctx.keys.keyFile, outDir: dist, taken: [...taken, ctx.files.update.migration] });
    return `${ctx.files.update.version} (${ctx.files.update.migration}), ${ctx.files.bad.version} (${ctx.files.bad.migration}, divides by zero)`;
  });
  const before = await snap(ctx, portal);
  ctx.report.data.facts.freshSnapshot = before.meta;
  await ctx.report.step(P, `update ${ctx.manifest.version} → ${ctx.files.update.version} (extra migration ${ctx.files.update.migration})`, async () => {
    const { installed } = await installFile(ctx, portal, admin, ctx.files.update.file, { expectAction: 'update' });
    await sleep(4000); // past MODULE_BOOT_SETTLE_MS: the new version is confirmed
    const { row } = await packageState(admin, id);
    if (row.version !== ctx.files.update.version) return fail(`running ${row.version}`);
    if (row.lastRollback) return fail(`rolled back: ${JSON.stringify(row.lastRollback).slice(0, 200)}`);
    const applied = await ctx.db.with(portal.database, (c) => appliedMigrations(c, id));
    if (!applied.includes(ctx.files.update.migration)) return fail(`${ctx.files.update.migration} not in module_migrations (${applied.join(', ')})`);
    const probe = await ctx.db.with(portal.database, (c) => c.query(`SELECT count(*)::int AS n FROM ${ctx.probeTable}`));
    if (probe.rows[0].n !== 1) return fail(`probe table has ${probe.rows[0].n} rows`);
    return `applied [${(installed.applied || []).join(', ')}], backup ${installed.backup?.format || installed.backup?.file || (installed.backup ? 'yes' : 'none')}, previous ${row.previousVersion}`;
  });
  await ctx.report.step(P, 'data after the update = before (probe table aside)', async () => compare(before, await snap(ctx, portal, { ignoreTables: [ctx.probeTable] })));
  const beforeBad = await snap(ctx, portal);
  await ctx.report.step(P, `failing update ${ctx.files.bad.version} is refused, nothing changes`, async () => {
    const staged = expectOk(await upload(admin, ctx.files.bad.file), 'upload the failing update');
    const boot = await portal.backend.bootId();
    const res = await admin.post('/api/admin/modules/packages/install', { token: staged.token }, { timeoutMs: 300_000 });
    if (res.status < 300 && res.body?.success !== false) return fail(`installed: ${res.text.slice(0, 200)}`);
    if (res.status >= 500 && res.body?.code !== 'MIGRATION_FAILED') return fail(`server error ${res.status} ${res.text.slice(0, 200)}`);
    await sleep(1500);
    if ((await portal.backend.bootId()) !== boot) return fail('the portal restarted');
    const { row } = await packageState(admin, id);
    if (row.version !== ctx.files.update.version) return fail(`now ${row.version}`);
    const leftover = await ctx.db.with(portal.database, (c) => c.query(`SELECT to_regclass($1) AS t`, [`${id}_kit_broken`]));
    if (leftover.rows[0].t) return fail(`${id}_kit_broken was left behind`);
    const diff = compare(beforeBad, await snap(ctx, portal));
    if (diff.status === 'fail') return diff;
    return `${res.status} ${res.body?.code || res.body?.problems?.[0]?.code || ''}; still ${row.version}; ${diff}`;
  });
  await ctx.report.step(P, 'module still answers after the refused update', async () => {
    const first = routes.routes.find((r) => r.method === 'GET' && !r.path.includes(':'));
    if (!first) return { status: 'skip', note: 'no parameterless GET route' };
    const res = await admin.get(first.path);
    return res.status < 400 ? `${first.path} → ${res.status}` : fail(`${first.path} → ${res.status}`);
  });
  // Uninstall keeps the data.
  const beforeRemove = await snap(ctx, portal);
  await ctx.report.step(P, 'uninstall (code removed, restart) keeps data', async () => {
    await uninstall(portal, admin, id);
    const { row } = await packageState(admin, id);
    if (!row || row.state !== 'removed') return fail(`state ${row?.state}`);
    const first = routes.routes.find((r) => r.method === 'GET' && !r.path.includes(':'));
    if (first) {
      const res = await admin.get(first.path);
      if (res.status !== 404) return fail(`${first.path} answers ${res.status} after removal`);
    }
    const diff = compare(beforeRemove, await snap(ctx, portal));
    return diff.status === 'fail' ? diff : `listed as removed; routes 404; ${diff}`;
  });
  await linkProbes(ctx, P, admin, 'absent', 'module removed', portal.database);
  if (ui) await browserStep(ctx, P, 'core pages with the module removed', ui, [{ url: '/', expectPrefix: '/' }, { url: '/admin/settings/modules', expectPrefix: '/admin/settings/modules' }, { url: `/app/${id}`, expectPrefix: '/' }]);
  await ctx.report.step(P, `reinstall ${ctx.files.update.version}`, async () => {
    await installFile(ctx, portal, admin, ctx.files.update.file);
    const { row } = await packageState(admin, id);
    if (!row || !row.loaded) return fail(`state ${row?.state}, loaded ${row?.loaded}`);
    const diff = compare(beforeRemove, await snap(ctx, portal));
    return diff.status === 'fail' ? diff : `${row.state}; ${diff}`;
  });
  // Delete data after a backup.
  await ctx.report.step(P, 'remove again, then «Удалить данные»: a backup first, only the module\'s tables dropped', async () => {
    await uninstall(portal, admin, id);
    const own = await ctx.db.with(portal.database, (c) => moduleTableNames(c, BACKEND, id, ctx.manifest.tables || []));
    const tablesBefore = await ctx.db.with(portal.database, allTables);
    // uploads/<id> goes into the backup (<file>.uploads.tar.gz) and is removed; other kit upload folders are not the platform's.
    const ownFilesBefore = filesDigest(portal.uploadDir, [id]).count;
    const res = expectOk(await admin.post(`/api/admin/modules/packages/${id}/purge`, { confirm: id }, { timeoutMs: 300_000 }), 'purge');
    const tablesAfter = await ctx.db.with(portal.database, allTables);
    const dropped = tablesBefore.filter((t) => !tablesAfter.includes(t)).sort();
    const added = tablesAfter.filter((t) => !tablesBefore.includes(t));
    const problems = [];
    if (JSON.stringify(dropped) !== JSON.stringify([...own].sort())) problems.push(`dropped [${dropped.join(', ')}], the module's tables were [${own.join(', ')}]`);
    if (added.length) problems.push(`new tables ${added.join(', ')}`);
    const backupFile = res.backup?.file ? join(portal.modulesDir, '.backups', id, res.backup.file) : null;
    if (!backupFile || !existsSync(backupFile)) problems.push(`backup file ${res.backup?.file} not found`);
    if (ownFilesBefore) {
      const archive = res.backup?.uploads?.file ? join(portal.modulesDir, '.backups', id, res.backup.uploads.file) : null;
      if (!archive || !existsSync(archive)) problems.push(`uploads/${id} held ${ownFilesBefore} files, the backup has no archive of them`);
      else if (res.backup.uploads.files !== ownFilesBefore) problems.push(`the upload archive holds ${res.backup.uploads.files} files, uploads/${id} had ${ownFilesBefore}`);
    }
    const ownFilesAfter = filesDigest(portal.uploadDir, [id]).count;
    if (ownFilesAfter) problems.push(`${ownFilesAfter} files left in uploads/${id}`);
    const leftovers = await ctx.db.with(portal.database, async (c) => ({ row: await packageRow(c, id), migrations: await appliedMigrations(c, id), settings: (await snapshot(c, BACKEND, id, { manifestTables: ctx.manifest.tables || [] })).settings }));
    if (leftovers.row) problems.push(`installed_modules row left: ${leftovers.row.state}`);
    if (leftovers.migrations.length) problems.push(`module_migrations left: ${leftovers.migrations.join(', ')}`);
    if (leftovers.settings) problems.push('settings.modules block left');
    if (problems.length) return fail(problems.join('; '), problems);
    const rest = await snap(ctx, portal);
    const kept = Object.keys(rest.appSettings);
    const leftover = [kept.length ? `app_settings keys the module wrote itself: ${kept.join(', ')}` : null, rest.files.count ? `${rest.files.count} upload files (${(ctx.config.uploadFolders || [id]).map((f) => `uploads/${f}`).join(', ')})` : null].filter(Boolean);
    const filesNote = ownFilesBefore ? `, ${ownFilesBefore} files of uploads/${id} archived and removed` : '';
    if (leftover.length) return warn(`dropped ${dropped.length} tables (exactly the module's), backup ${res.backup.format}${filesNote}; left behind: ${leftover.join('; ')} (known limitation, docs/module-packages.md)`);
    return `dropped ${dropped.length} tables (exactly the module's)${filesNote}, backup ${res.backup.format} ${res.backup.file} (${res.backup.bytes} bytes)`;
  });
  await ctx.report.step(P, 'boot logs: no unexpected errors', async () => {
    const lines = portal.backend.grep(/(Unhandled|TypeError|ReferenceError|SyntaxError|uncaught)/i);
    return lines.length ? warn(`${lines.length} line(s): ${lines.slice(0, 2).join(' | ')}`, lines.slice(0, 50)) : `${portal.backend.boots.length} boots, ${portal.backend.restarts} restarts on exit 75`;
  }, { critical: false });
  await stopPortal(portal);
}

// ── Phase: upgrade ──────────────────────────────────────────────────────────

function addWorktree(ctx, ref) {
  const dir = join(ctx.tmp, `source-${ref.replace(/[^a-z0-9.-]+/gi, '_')}`);
  execFileSync('git', ['worktree', 'add', '--detach', dir, ref], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  ctx.worktrees.push(dir);
  // Dependencies shared with this checkout (never installed into the worktree).
  for (const sub of ['src/backend', 'src/frontend']) {
    const target = join(ROOT, sub, 'node_modules');
    if (existsSync(target) && existsSync(join(dir, sub)) && !existsSync(join(dir, sub, 'node_modules'))) symlinkSync(realpathSync(target), join(dir, sub, 'node_modules'));
  }
  return dir;
}

function removeWorktrees(ctx) {
  const errors = [];
  for (const dir of ctx.worktrees.splice(0)) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      errors.push(`${dir}: ${String(err.stderr || err.message).trim()}`);
      rmSync(dir, { recursive: true, force: true });
    }
  }
  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'ignore' });
  } catch {
    /* nothing to prune */
  }
  return errors;
}

async function phaseUpgrade(ctx) {
  const P = 'upgrade';
  const { id, sourceRef } = ctx.args;
  const old = await ctx.report.step(P, `checkout ${sourceRef} (temporary git worktree, node_modules shared)`, async () => {
    const dir = addWorktree(ctx, sourceRef);
    const index = join(dir, 'src/backend/modules/index.js');
    const text = existsSync(index) ? readFileSync(index, 'utf8') : '';
    if (!new RegExp(`from '\\./${id}/index\\.js'`).test(text)) return fail(`${sourceRef} does not have ${id} built in (src/backend/modules/index.js)`);
    const version = readFileSync(join(dir, 'VERSION'), 'utf8').trim();
    return { value: { dir, version }, note: `core ${version} at ${execFileSync('git', ['rev-parse', '--short', sourceRef], { cwd: ROOT, encoding: 'utf8' }).trim()}` };
  });
  // Linked packages (kit file `packages`): built into the old core, or packages there too — then built from
  // that ref (signed with the kit key) and installed on the old core, as a portal of that version runs them.
  const linked = ctx.config.packages || [];
  const oldIndex = readFileSync(join(old.dir, 'src/backend/modules/index.js'), 'utf8');
  const oldBuiltIn = Object.fromEntries(linked.map((other) => [other, new RegExp(`from '\\./${other}/index\\.js'`).test(oldIndex)]));
  const oldPackages = {};
  for (const other of linked.filter((item) => !oldBuiltIn[item])) {
    oldPackages[other] = await ctx.report.step(P, `linked package ${other} of ${sourceRef}: build signed there`, async () => {
      const file = await buildPackage({ root: old.dir, id: other, outDir: join(ctx.runDir, 'dist', 'linked-old'), keyFile: ctx.keys.keyFile, trustedFile: ctx.keys.trustedFile, env: baseEnv(), log: logFile(ctx, `build-old-${other}`) });
      return { value: file, note: file.split('/').pop() };
    });
  }
  const before = await newPortal(ctx, 'upgrade-old', { dir: join(old.dir, 'src/backend') });
  ctx.portals.push(before);
  let admin;
  await ctx.report.step(P, `old core ${old.version} on ${before.database} (${id} built in)`, async () => {
    await before.backend.start();
    admin = await setupPortal(before);
    return `boot ${before.backend.bootIdNow}`;
  });
  if (Object.keys(oldPackages).length) {
    await ctx.report.step(P, `linked packages on the old core: ${Object.keys(oldPackages).join(', ')}`, async () => installLinkedPackages(ctx, before, admin, oldPackages));
  }
  const switchOn = [...ctx.config.enableAlso, ...linked];
  await ctx.report.step(P, `enable ${id}${switchOn.length ? ` + ${switchOn.join(', ')}` : ''}, demo data`, async () => {
    await setModules(admin, { [id]: { enabled: true }, ...Object.fromEntries(switchOn.map((other) => [other, { enabled: true }])) }, 'enable on the old core');
    return seedDemo(ctx, admin, P);
  });
  await ctx.report.step(P, 'a role with the module\'s permissions, a user holding it, dashboards with every widget', async () => {
    const role = expectOk(await admin.post('/api/admin/roles', { name: `Kit ${id} role`, description: 'package kit', permissions: ctx.manifest.permissions }), 'create the role');
    const roleId = role.role?.id;
    if (!roleId) return fail(`no role id in ${JSON.stringify(role).slice(0, 200)}`);
    await createPlainUser(admin, before.backend.base, { roleIds: [roleId] });
    const dash = expectOk(await admin.get('/api/app/dashboard'), 'dashboard');
    // A layout keeps at most 40 widgets (dashboard/widgets.js).
    const widgets = (dash.available || []).slice(0, 40).map((type, i) => ({ id: `k${i + 1}`, type, w: 4, h: 4, settings: {} }));
    expectOk(await admin.put('/api/app/dashboard/layout', { widgets }), 'personal dashboard');
    expectOk(await admin.put('/api/app/dashboard/default', { widgets }), 'starting dashboard');
    ctx.widgetsBefore = dash.available || [];
    return `role ${role.role?.key || '?'} (${ctx.manifest.permissions.length} permissions) → ${USER.username}; dashboards with ${widgets.length} widget types`;
  });
  await linkProbes(ctx, P, admin, 'oldCore', `old core ${old.version}`, before.database);
  const snapA = await ctx.report.step(P, 'snapshot: tables (counts + checksums), settings block, roles, dashboards', async () => {
    const s = await snap(ctx, before);
    if (!Object.keys(s.tables).length) return fail('the module has no tables on the old core');
    ctx.report.data.facts.upgradeSnapshot = { ...s.meta, tables: Object.fromEntries(Object.entries(s.tables).map(([k, v]) => [k, v.rows])) };
    return { value: s, note: `${Object.keys(s.tables).length} tables, ${s.meta.rows} rows, settings ${s.settings ? 'stored' : 'none'}, ${Object.keys(s.roles).length} role(s), ${Object.keys(s.layouts).length} layout(s)` };
  });
  await ctx.report.step(P, 'stop the old core', async () => {
    await stopPortal(before);
    return `exit ${before.backend.lastExit?.code ?? before.backend.lastExit?.signal}`;
  });
  removeWorktrees(ctx);
  // This core, the module absent.
  // The same data: database, uploads folder (the module's files, e.g. uploads/masterplan) and MODULES_DIR (the
  // packages the old core ran — empty unless the kit file links to packages that were packages there already).
  const after = await newPortal(ctx, 'upgrade-new', { database: before.database, uploadDir: before.uploadDir, modulesDir: before.modulesDir, jwtSecret: before.env.JWT_SECRET });
  ctx.portals.push(after);
  await ctx.report.step(P, 'this core without the module on the same database', async () => {
    await after.backend.start();
    admin = new Client(after.backend.base, { name: 'superadmin' });
    await admin.login(ADMIN.username, ADMIN.password);
    return `boot ${after.backend.bootIdNow}`;
  });
  await ctx.report.step(P, 'data untouched with the module absent', async () => compare(snapA, await snap(ctx, after)));
  await ctx.report.step(P, 'listed as removed (data kept), routes gone', async () => {
    const { row } = await packageState(admin, id);
    if (!row) return fail('not listed');
    if (row.state !== 'removed') return fail(`state ${row.state}`);
    const res = await admin.get(`/api/app/${id}`);
    if (res.status !== 404) return fail(`/api/app/${id} → ${res.status}`);
    const dash = expectOk(await admin.get('/api/app/dashboard'), 'dashboard');
    ctx.moduleWidgets = ctx.widgetsBefore.filter((type) => !(dash.available || []).includes(type));
    return `removed, source ${row.source}; module widget types: ${ctx.moduleWidgets.join(', ') || 'none'}`;
  });
  await ctx.report.step(P, 'a save of other settings in the window keeps the module\'s data', async () => {
    const other = ctx.config.enableAlso[0] || 'tasks';
    await setModules(admin, { [other]: { enabled: true } }, 'save another module');
    const dash = expectOk(await admin.get('/api/app/dashboard'), 'dashboard');
    expectOk(await admin.put('/api/app/dashboard/layout', { widgets: dash.widgets || [] }), 'save the personal dashboard without the module');
    return compare(snapA, await snap(ctx, after));
  }, { critical: false });
  await linkProbes(ctx, P, admin, 'absent', 'module absent', after.database);
  let ui = await ensureUi(ctx, after);
  if (ui) await browserStep(ctx, P, 'core pages with the module absent', ui, [{ url: '/', expectPrefix: '/' }, { url: '/admin/settings/modules', expectPrefix: '/admin/settings/modules' }, { url: `/app/${id}`, expectPrefix: '/' }]);
  await ctx.report.step(P, `install the package ${ctx.manifest.version}`, async () => {
    const { staged, installed } = await installFile(ctx, after, admin, ctx.files.signed, { expectAction: 'install' });
    const { row } = await packageState(admin, id);
    if (!row?.loaded) return fail(`state ${row?.state}, error ${row?.error}`);
    const applied = await ctx.db.with(after.database, (c) => appliedMigrations(c, id));
    return `${row.state} v${row.version}; migrations recorded [${applied.join(', ')}] (applied now: ${(installed.applied || []).join(', ') || 'none'}); card ${staged.preview?.action}`;
  });
  await ctx.report.step(P, 'snapshot after install = before the upgrade', async () => compare(snapA, await snap(ctx, after)));
  if (linked.length) {
    // The rest of the upgrade: the linked packages of this checkout — installed where they were built in
    // (a «removed» row: data kept), updated where the old core ran them as packages.
    await ctx.report.step(P, `linked packages of this checkout: ${linked.map((other) => `${other} ${oldBuiltIn[other] ? 'install' : 'update'}`).join(', ')}`, async () =>
      installLinkedPackages(ctx, after, admin, ctx.files.linked, { expect: Object.fromEntries(linked.map((other) => [other, oldBuiltIn[other] ? 'install' : 'update'])) })
    );
    await ctx.report.step(P, 'snapshot after the linked packages = before the upgrade', async () => compare(snapA, await snap(ctx, after)));
  }
  await ctx.report.step(P, 'module widgets available again', async () => {
    const dash = expectOk(await admin.get('/api/app/dashboard'), 'dashboard');
    const missing = (ctx.moduleWidgets || []).filter((type) => !(dash.available || []).includes(type));
    return missing.length ? fail(`not available: ${missing.join(', ')}`) : `${(ctx.moduleWidgets || []).length} module widget type(s) back`;
  }, { critical: false });
  const routes = await ctx.report.step(P, 'routes of the package', async () => {
    const found = await introspect(ctx, after, ctx.manifest.version);
    return { value: found, note: `${found.routes.length} routes` };
  });
  const user = new Client(after.backend.base, { name: 'user' });
  await user.login(USER.username, USER.password);
  await referenceStep(ctx, P, admin, routes, ' after the upgrade');
  await sweep(ctx, P, after, [{ who: 'superadmin', client: admin }, { who: 'holder', client: user }], routes, ' after the upgrade');
  await linkProbes(ctx, P, admin, 'present', 'package installed', after.database);
  ui = ui || (await ensureUi(ctx, after));
  if (ui) {
    const params = await resolveParams(ctx, after.database, ctx.config.pageParams);
    const { pages } = modulePages(ctx, ctx.manifest, params);
    await browserStep(ctx, P, `pages after the upgrade (${pages.length})`, ui, pages);
  }
  await ctx.report.step(P, 'restart: data still identical', async () => {
    await after.backend.stop();
    await after.backend.start();
    return compare(snapA, await snap(ctx, after));
  });
  await stopPortal(after);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function cleanup(ctx) {
  const notes = [];
  for (const portal of ctx.portals || []) await stopPortal(portal).catch((err) => notes.push(err.message));
  await stopAll();
  notes.push(...removeWorktrees(ctx));
  if (!ctx.args.keep) {
    notes.push(...(await ctx.db.dropAll()));
    rmSync(ctx.tmp, { recursive: true, force: true });
    rmSync(join(ctx.runDir, 'keys'), { recursive: true, force: true }); // the throw-away private keys
  } else notes.push(`kept: databases ${[...ctx.db.created].join(', ') || '—'}, folders ${ctx.tmp}`);
  return notes;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 23).join('\n').replace(/^ \* ?/gm, ''));
    return 0;
  }
  const ctx = setupContext(args);
  ctx.portals = [];
  let interrupted = false;
  const onSignal = async (signal) => {
    if (interrupted) return;
    interrupted = true;
    console.error(`\n${signal}: cleaning up (own processes, databases, worktree)…`);
    await cleanup(ctx).catch(() => {});
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  console.log(`Package check ${args.id} — mode ${args.mode}${args.mode !== 'fresh' ? `, source ${args.sourceRef}` : ''}; run folder ${ctx.runDir}`);
  const server = await ctx.db.probe();
  console.log(`  test database ${ctx.creds.host}:${ctx.creds.port} (${server.v.split(' ').slice(0, 2).join(' ')}, user ${server.u})`);
  ctx.report.data.facts.kitFile = ctx.config.file;
  const phases = [['package', phasePackage]];
  if (args.mode === 'fresh' || args.mode === 'all') phases.push(['fresh', phaseFresh]);
  if (args.mode === 'upgrade' || args.mode === 'all') phases.push(['upgrade', phaseUpgrade]);
  for (const [name, fn] of phases) {
    try {
      await fn(ctx);
    } catch (err) {
      if (!(err instanceof Abort)) ctx.report.add(name, 'unexpected error', 'fail', String(err.stack || err).slice(0, 800));
      else ctx.report.add(name, 'phase stopped', 'fail', `after «${err.message}» failed; the rest of ${name} was not run`);
      for (const portal of ctx.portals) await stopPortal(portal).catch(() => {});
      if (name === 'package') break;
    }
  }
  const notes = await cleanup(ctx);
  if (notes.length) ctx.report.data.cleanup = notes;
  ctx.report.data.finishedAt = new Date().toISOString();
  ctx.report.data.status = overallStatus(ctx.report.steps);
  ctx.report.data.reportFile = join(ctx.runDir, 'report.json');
  ctx.report.data.logDir = ctx.logDir;
  writeFileSync(ctx.report.data.reportFile, `${JSON.stringify(ctx.report.data, null, 2)}\n`);
  writeFileSync(join(ctx.out, `last-${args.id}.json`), `${JSON.stringify(ctx.report.data, null, 2)}\n`);
  console.log(`\n${formatReport(ctx.report.data)}`);
  if (notes.length) console.log(`  cleanup: ${notes.join('; ')}`);
  const left = ownPids();
  if (left.length) console.log(`  still running: ${left.map((p) => `${p.name} ${p.pid}`).join(', ')}`);
  return ctx.report.data.status === 'pass' ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err.message);
  process.exit(2);
});
