import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSigningKey, signFiles } from '../platform/packages/signature.js';
import { normalizeManifest } from '../platform/packages/manifestFile.js';
import { CORE_TABLES, MODULE_TABLES, mayOwnTable, tablePatternProblem } from '../platform/packages/tableOwnership.js';
import { checkInstall, checkSdk, checkUninstall, compatibilityProblem } from '../platform/packages/checks.js';
import { inlineMigrations, migrationConflicts, runMigrations } from '../platform/packages/migrations.js';
import { IntegrityError, verifyPackageDir } from '../platform/packages/integrity.js';
import { PACKAGE_LIMITS, writePackageFiles } from '../platform/packages/archive.js';
import { corePathAllowed, mapSpecifier } from '../platform/sdkLoader.mjs';
import { SDK_VERSION } from '../platform/sdk/version.js';
import { SDK_VERSION as SDK_FROM_SERVER } from '../platform/sdk/server.js';
import { clearBootMarker, readBootMarker, writeBootMarker } from '../platform/packages/disk.js';
import { cleanStaging } from '../platform/packages/staging.js';
import { requestRestart, resetRestart, restartPending, restartState, setRestartHandler } from '../platform/packages/restart.js';

/*
 * Hardening of the package platform after the second review
 * (docs/module-packages.md): table ownership, migration attribution and
 * conflicts, downgrade after removal, core / SDK compatibility, the files
 * re-checked at boot, boot markers, backup retention, staging cleanup, the
 * restart before the SIGTERM handler, refusals while a restart is pending and
 * the SDK resolver's refusals. No database (module-packages.db.test.js runs
 * the flows against one).
 */

const here = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(here, '..');
const temp = () => mkdtempSync(join(tmpdir(), 'portal-pkg-hard-'));
const base = { id: 'hello', name: { en: 'Hello', ru: 'Привет' }, version: '1.0.0', core: '1.0.0', category: 'work' };

// ── #5 tables: only the module's own ───────────────────────────────────────

test('tables: "<id>_" names and patterns only; never core tables or another module’s', () => {
  assert.equal(tablePatternProblem('hello', 'hello_%'), null);
  assert.equal(tablePatternProblem('hello', 'hello_items'), null);
  assert.equal(tablePatternProblem('masterplan', 'mp_%'), null, 'legacy prefix declared in the core');
  assert.equal(tablePatternProblem('employees', 'employees'), null, 'an exact legacy name');
  for (const [id, pattern, reason] of [
    ['hello', 'users', /must start with "hello_"/],
    ['hello', 'a%', /must start with "hello_"/],
    ['hello', 'mp_%', /must start with "hello_"/],
    ['app', 'app_%', /core table "app_(groups|roles|settings)"/],
    ['user', 'user_roles', /core table "user_roles"/],
    ['module', 'module_%', /core table "module_(migrations|tables)"/],
    ['cal', 'cal_%', /overlaps the tables of module "calendar"/],
    ['task', 'task_%', /overlaps the tables of module "tasks"/],
    ['mp', 'mp_units', /overlaps the tables of module "masterplan"/],
  ]) {
    assert.match(String(tablePatternProblem(id, pattern)), reason, `${id}: ${pattern}`);
  }
  const { problems } = normalizeManifest({ ...base, tables: ['users', 'hello_%', 'a%'] });
  assert.equal(problems.filter((item) => /table/.test(item)).length, 2);
  assert.deepEqual(normalizeManifest({ ...base, tables: ['hello_%'] }).problems, []);
});

test('tables: the run-time filter keeps a module off core and other modules’ tables', () => {
  assert.ok(mayOwnTable('hello', 'hello_messages'));
  assert.ok(mayOwnTable('masterplan', 'mp_units'));
  assert.ok(!mayOwnTable('hello', 'app_settings'));
  assert.ok(!mayOwnTable('hello', 'installed_modules'));
  assert.ok(!mayOwnTable('hello', 'crm_deals'));
  assert.ok(mayOwnTable('crm', 'crm_deals'));
});

/** CREATE TABLE names of the .js / .sql files under `dir`. */
function createdTables(dir, { skip = [] } = {}) {
  const out = new Set();
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (skip.includes(entry.name) || entry.name === 'node_modules') continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(js|sql|mjs)$/.test(entry.name)) for (const match of readFileSync(path, 'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)\s*\(/gi)) out.add(match[1].toLowerCase());
    }
  };
  walk(dir);
  return out;
}

test('tables: CORE_TABLES and MODULE_TABLES cover every CREATE TABLE of the source tree', () => {
  for (const folder of ['services', 'platform', 'api', 'modules/shared']) {
    for (const table of createdTables(join(BACKEND, folder))) assert.ok(CORE_TABLES.includes(table), `${folder}: ${table} is missing from CORE_TABLES`);
  }
  for (const entry of readdirSync(join(BACKEND, 'modules'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'shared') continue;
    const tables = createdTables(join(BACKEND, 'modules', entry.name));
    if (!tables.size) continue;
    const own = MODULE_TABLES[entry.name];
    assert.ok(own, `MODULE_TABLES has no entry for ${entry.name}`);
    for (const table of tables) assert.ok(own.some((item) => (item.endsWith('_') ? table.startsWith(item) : table === item)), `${entry.name}: ${table} is not covered by ${own.join(', ')}`);
  }
});

// ── #5 / #14 migrations ───────────────────────────────────────────────────

function fakeDb({ applied = {}, tables = ['users', 'hello_messages'] } = {}) {
  const state = { applied: new Map(Object.entries(applied).map(([module, list]) => [module, new Map(list)])), tables: new Set(tables), xact: new Set(), recorded: [] };
  const client = {
    async query(text, params = []) {
      if (/FROM module_migrations/.test(text)) return { rows: [...(state.applied.get(params[0]) || new Map())].map(([id, checksum]) => ({ migration_id: id, checksum })) };
      if (/FROM pg_tables/.test(text)) return { rows: [...state.tables].map((tablename) => ({ tablename })) };
      if (/FROM pg_class/.test(text)) return { rows: [...state.xact].map((relname) => ({ relname })) };
      if (/INSERT INTO module_tables/.test(text)) return state.recorded.push(params[1]), { rows: [] };
      if (/INSERT INTO module_migrations/.test(text)) return { rows: [] };
      const created = text.match(/CREATE TABLE (\w+)/);
      if (created) state.tables.add(created[1]) && state.xact.add(created[1]);
      const altered = text.match(/ALTER TABLE (\w+)/);
      if (altered) state.xact.add(altered[1]);
      const concurrent = text.match(/CONCURRENT (\w+)/);
      if (concurrent) state.tables.add(concurrent[1]);
      return { rows: [] };
    },
  };
  return { state, transaction: (fn) => fn(client) };
}

test('migrations: only tables this transaction created are the module’s (not one committed meanwhile, not an altered one)', async () => {
  const { state, transaction } = fakeDb();
  const migrations = inlineMigrations([
    { id: '001_init', sql: 'ALTER TABLE hello_messages ADD COLUMN x int; CREATE TABLE hello_more (id int)' },
    // While it runs, the live portal commits a table of its own (READ COMMITTED would show it in pg_tables).
    { id: '002_more', up: async (db) => db.query('CONCURRENT app_new_core_table; CREATE TABLE hello_js (id int)') },
  ]);
  const result = await runMigrations({ moduleId: 'hello', version: '1.0.0', migrations, transaction });
  assert.deepEqual(result.tables.sort(), ['hello_js', 'hello_more']);
  assert.deepEqual(state.recorded.sort(), ['hello_js', 'hello_more']);
});

test('migrations: a JS migration that cannot be loaded or has no up() is a failed migration (MIGRATION_FAILED)', async () => {
  const dir = temp();
  try {
    writeFileSync(join(dir, '001_bad.js'), 'export const nothing = 1;\n');
    writeFileSync(join(dir, '002_broken.js'), 'export async function up( {\n');
    const { transaction } = fakeDb();
    await assert.rejects(runMigrations({ moduleId: 'hello', version: '1.0.0', migrations: [{ id: '001_bad', file: join(dir, '001_bad.js'), checksum: 'x' }], transaction }), (err) => err.migration === '001_bad' && /does not export up/.test(err.message));
    await assert.rejects(runMigrations({ moduleId: 'hello', version: '1.0.0', migrations: [{ id: '002_broken', file: join(dir, '002_broken.js'), checksum: 'y' }], transaction }), (err) => err.migration === '002_broken');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrations: a version older than the database and an edited applied SQL migration are refused when strict', async () => {
  const v1 = inlineMigrations([{ id: '001_init', sql: 'CREATE TABLE hello_a (id int)' }]);
  const v2 = inlineMigrations([
    { id: '001_init', sql: 'CREATE TABLE hello_a (id int)' },
    { id: '002_b', sql: 'CREATE TABLE hello_b (id int)' },
  ]);
  const applied = new Map(v2.map((item) => [item.id, item.checksum]));
  assert.equal(migrationConflicts('hello', v2, applied), null);
  const newer = migrationConflicts('hello', v1, applied);
  assert.equal(newer.code, 'SCHEMA_NEWER');
  assert.deepEqual(newer.migrations, ['002_b']);
  const edited = inlineMigrations([{ id: '001_init', sql: 'CREATE TABLE hello_a (id bigint)' }, { id: '002_b', sql: 'CREATE TABLE hello_b (id int)' }]);
  assert.equal(migrationConflicts('hello', edited, applied).code, 'MIGRATION_CHANGED');
  // JS migrations are bundled by the build: their text may change without a change of meaning.
  const js = inlineMigrations([{ id: '001_init', up: async () => {} }, { id: '002_b', sql: 'CREATE TABLE hello_b (id int)' }]);
  assert.equal(migrationConflicts('hello', js, applied), null);
  const { transaction } = fakeDb({ applied: { hello: [...applied] } });
  await assert.rejects(runMigrations({ moduleId: 'hello', version: '1.0.0', migrations: v1, transaction, strict: true }), (err) => err.code === 'SCHEMA_NEWER');
  await assert.rejects(runMigrations({ moduleId: 'hello', version: '1.0.0', migrations: edited, transaction, strict: true }), (err) => err.code === 'MIGRATION_CHANGED' && err.migration === '001_init');
  // At boot (a rollback runs the previous code on purpose): reported, not refused.
  assert.deepEqual((await runMigrations({ moduleId: 'hello', version: '1.0.0', migrations: v1, transaction })).applied, []);
});

// ── #4 downgrade after removal, #6 core / SDK ─────────────────────────────

test('checks: a removed package (data kept) makes an older file a downgrade; same or newer installs', () => {
  const installed = new Map([['hello', { id: 'hello', version: '1.2.0', name: { en: 'Hello', ru: 'Привет' }, requires: [], source: 'package', removed: true }]]);
  const older = checkInstall({ ...base, version: '1.0.0', requires: [] }, { installed, coreVersion: '1.5.0' });
  assert.deepEqual(older.problems.map((item) => item.message.ru), ['Была установлена 1.2.0 (её данные сохранены), в файле 1.0.0 — понижение запрещено']);
  assert.equal(older.problems[0].code, 'DOWNGRADE');
  const same = checkInstall({ ...base, version: '1.2.0', requires: [] }, { installed, coreVersion: '1.5.0' });
  assert.deepEqual(same.problems, []);
  assert.equal(same.action, 'install');
  assert.equal(same.removed.version, '1.2.0');
  // Removed is not installed: not removable again, does not satisfy a requirement, is not a dependent.
  assert.equal(checkUninstall('hello', { installed })[0].code, 'NOT_INSTALLED');
  const dep = checkInstall({ ...base, id: 'dep', requires: [{ id: 'hello', version: '1.0.0' }] }, { installed, coreVersion: '1.5.0' });
  assert.equal(dep.problems[0].code, 'REQUIRES_MISSING');
});

test('checks: SDK of the package — same major, not newer than the core’s; with the core check at boot', () => {
  assert.equal(checkSdk(null, '1.0.0'), null);
  assert.equal(checkSdk('1.0.0', '1.2.0'), null);
  assert.equal(checkSdk('1.3.0', '1.2.0').code, 'SDK_TOO_OLD');
  assert.equal(checkSdk('1.0.0', '2.0.0').code, 'SDK_MAJOR');
  assert.match(checkSdk('1.0.0', '2.0.0').message.ru, /^Модуль собран для SDK 1\.x/);
  assert.equal(compatibilityProblem({ core: '1.6.0', sdk: '1.0.0' }, { coreVersion: '2.0.0', sdkVersion: '1.0.0' }).code, 'CORE_MAJOR');
  assert.equal(compatibilityProblem({ core: '1.6.0', sdk: '2.0.0' }, { coreVersion: '1.7.0', sdkVersion: '1.0.0' }).code, 'SDK_MAJOR');
  assert.equal(compatibilityProblem({ core: '1.6.0', sdk: '1.0.0' }, { coreVersion: '1.7.0', sdkVersion: '1.0.0' }), null);
  const check = checkInstall({ ...base, sdk: '2.0.0', requires: [] }, { installed: new Map(), coreVersion: '1.5.0', sdkVersion: '1.0.0' });
  assert.equal(check.problems[0].code, 'SDK_MAJOR');
});

test('SDK version: one number for the server and the browser SDK', () => {
  const browser = readFileSync(resolve(BACKEND, '../frontend/src/platform/sdk/version.js'), 'utf8').match(/SDK_VERSION = '([^']+)'/)[1];
  assert.equal(SDK_VERSION, browser);
  assert.equal(SDK_FROM_SERVER, SDK_VERSION);
});

test('make check-core-upgrade: lists the modules a new core cannot run', async () => {
  const dir = temp();
  try {
    for (const [id, core] of [['hello', '1.2.0'], ['other', '2.0.0']]) {
      mkdirSync(join(dir, id, '1.0.0'), { recursive: true });
      writeFileSync(join(dir, id, 'current'), '1.0.0\n');
      writeFileSync(join(dir, id, '1.0.0/manifest.json'), JSON.stringify({ ...base, id, core, sdk: '1.0.0' }));
    }
    const { checkCoreUpgrade } = await import(resolve(BACKEND, '../../scripts/check-core-upgrade.mjs'));
    const report = await checkCoreUpgrade({ coreVersion: '2.1.0', sdkVersion: '1.0.0', modulesDir: dir });
    assert.deepEqual(report.map((item) => [item.id, item.ok, item.problem?.code || null]), [['hello', false, 'CORE_MAJOR'], ['other', true, null]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── #9 files re-checked at boot ───────────────────────────────────────────

function signedFolder(dir, key, files = { 'manifest.json': JSON.stringify(base), 'server/index.js': 'export default { id: "hello" };\n' }) {
  const list = Object.entries(files).map(([name, text]) => ({ name, data: Buffer.from(text) }));
  writePackageFiles([...list, { name: 'SIGNATURE', data: signFiles(list, key.privateKey) }], dir);
  return dir;
}

test('integrity: the files on disk must verify against SIGNATURE and match the installed listing', () => {
  const root = temp();
  const key = generateSigningKey();
  const trustedKeys = [{ id: key.keyId, publicKey: key.publicKey }];
  try {
    const dir = signedFolder(join(root, 'hello/1.0.0'), key);
    const good = verifyPackageDir(dir, { trustedKeys });
    assert.equal(good.signed, true);
    assert.equal(good.keyId, key.keyId);
    assert.match(good.listingSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(verifyPackageDir(dir, { trustedKeys, expected: { listing_sha256: good.listingSha256, signed_by: key.keyId } }).listingSha256, good.listingSha256);
    // Another signed version copied over it (same key, other files): signature fine, listing differs.
    const other = signedFolder(join(root, 'hello/0.9.0'), key, { 'manifest.json': JSON.stringify({ ...base, version: '0.9.0' }), 'server/index.js': 'export default { id: "hello", old: true };\n' });
    assert.throws(() => verifyPackageDir(other, { trustedKeys, expected: { listing_sha256: good.listingSha256 } }), (err) => err instanceof IntegrityError && /differ from the package that was installed/.test(err.message));
    // A changed file, an added file, a link.
    writeFileSync(join(dir, 'server/index.js'), 'export default { id: "hello", evil: true };\n');
    assert.throws(() => verifyPackageDir(dir, { trustedKeys }), /do not match the package signature/);
    signedFolder(dir, key);
    writeFileSync(join(dir, 'server/extra.js'), 'x');
    assert.throws(() => verifyPackageDir(dir, { trustedKeys }), /do not match the package signature/);
    rmSync(join(dir, 'server/extra.js'));
    symlinkSync('/etc/passwd', join(dir, 'server/link.js'));
    assert.throws(() => verifyPackageDir(dir, { trustedKeys }), /symbolic link/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('integrity: unsigned packages load only in development mode, also ones installed in it', () => {
  const root = temp();
  try {
    const dir = join(root, 'hello/1.0.0');
    writePackageFiles([{ name: 'manifest.json', data: Buffer.from(JSON.stringify(base)) }], dir);
    assert.throws(() => verifyPackageDir(dir, { trustedKeys: [] }), /not signed and development mode/);
    assert.equal(verifyPackageDir(dir, { trustedKeys: [], devMode: true }).signed, false);
    assert.throws(() => verifyPackageDir(dir, { trustedKeys: [], devMode: false, expected: { signed_by: 'unsigned' } }), /not signed and development mode/);
    const key = generateSigningKey();
    const signed = signedFolder(join(root, 'hello/2.0.0'), key);
    assert.throws(() => verifyPackageDir(signed, { trustedKeys: [{ id: key.keyId, publicKey: key.publicKey }], expected: { signed_by: 'unsigned' } }), /installed unsigned in development mode/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── #1 boot markers ───────────────────────────────────────────────────────

test('boot marker: written next to `current`, read back, cleared', () => {
  const root = temp();
  process.env.MODULES_DIR = root;
  try {
    assert.equal(readBootMarker('hello'), null);
    writeBootMarker('hello', { version: '1.0.0', status: 'loading' }); // no folder: nothing written
    assert.equal(readBootMarker('hello'), null);
    mkdirSync(join(root, 'hello'));
    writeBootMarker('hello', { version: '1.0.0', status: 'loading', bootId: 'b1' });
    assert.equal(readBootMarker('hello').status, 'loading');
    writeFileSync(join(root, 'hello/.boot-attempt'), '{broken');
    assert.equal(readBootMarker('hello').status, 'loading', 'a damaged marker still counts');
    clearBootMarker('hello');
    assert.equal(readBootMarker('hello'), null);
  } finally {
    delete process.env.MODULES_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});

// ── #10 limits, #11 staging and backups ───────────────────────────────────

test('limits: a package is held in memory once, with modest caps', () => {
  assert.ok(PACKAGE_LIMITS.maxUploadBytes <= 50 * 1024 * 1024);
  assert.ok(PACKAGE_LIMITS.maxTotalBytes <= 128 * 1024 * 1024);
});

test('staging: expired uploads (folders and their descriptions) are removed', () => {
  const root = temp();
  process.env.MODULES_DIR = root;
  try {
    const staging = join(root, '.staging');
    mkdirSync(join(staging, 'a'.repeat(32)), { recursive: true });
    writeFileSync(join(staging, `${'a'.repeat(32)}.json`), '{}');
    mkdirSync(join(staging, 'b'.repeat(32)));
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(join(staging, 'a'.repeat(32)), old, old);
    utimesSync(join(staging, `${'a'.repeat(32)}.json`), old, old);
    assert.equal(cleanStaging(), 2);
    assert.deepEqual(readdirSync(staging), ['b'.repeat(32)]);
  } finally {
    delete process.env.MODULES_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});

test('backups: retention per module and in total; the newest and the referenced one stay', async () => {
  const root = temp();
  process.env.MODULE_BACKUP_DIR = join(root, 'backups');
  process.env.MODULE_BACKUP_KEEP = '3';
  process.env.MODULE_BACKUP_MAX_MB = '1';
  try {
    const { pruneBackups, listBackups } = await import('../platform/packages/backup.js');
    const make = (id, n, bytes) => {
      const dir = join(root, 'backups', id);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${id}-1.0.0-${n}.ndjson.gz`);
      writeFileSync(file, Buffer.alloc(bytes));
      writeFileSync(join(dir, `${id}-1.0.0-${n}.json`), JSON.stringify({ id, file, format: 'ndjson', bytes, createdAt: `2026-10-0${n}T00:00:00Z` }));
      return file;
    };
    const hello = [1, 2, 3, 4, 5].map((n) => make('hello', n, 100));
    const big = [1, 2].map((n) => make('big', n, 700 * 1024));
    const removed = await pruneBackups({ rowFiles: [hello[0]] });
    // hello: keep 3 newest + the one a row points at; big: 1.4 MB > 1 MB → the older goes, the newest stays.
    assert.deepEqual(listBackups('hello').map((meta) => meta.file).sort(), [hello[0], hello[2], hello[3], hello[4]].sort());
    assert.deepEqual(listBackups('big').map((meta) => meta.file), [big[1]]);
    assert.ok(removed.includes(hello[1]) && removed.includes(big[0]));
  } finally {
    delete process.env.MODULE_BACKUP_DIR;
    delete process.env.MODULE_BACKUP_KEEP;
    delete process.env.MODULE_BACKUP_MAX_MB;
    rmSync(root, { recursive: true, force: true });
  }
});

// ── #3 restart before the SIGTERM handler, #7 refusals while restarting ───

test('restart: asked for before server.js installed its SIGTERM handler, it waits (no SIGTERM to a bare process)', async () => {
  setRestartHandler(null);
  resetRestart();
  try {
    requestRestart('rollback during boot', { delayMs: 1 });
    await new Promise((done) => setTimeout(done, 30));
    const state = restartState();
    assert.equal(state.ready, false);
    assert.equal(state.deferred, true, 'deferred until restartReady()');
  } finally {
    resetRestart();
  }
});

test('install, remove and «delete data» are refused (409) while a restart is pending', async () => {
  setRestartHandler(null);
  resetRestart();
  const { installStaged, uninstallPackage, purgeModuleData } = await import('../platform/packages/installer.js');
  try {
    // Far in the future: the pending flag is what matters here.
    requestRestart('install hello 1.0.0', { delayMs: 2_000_000_000 });
    assert.ok(restartPending());
    for (const call of [() => installStaged('a'.repeat(32)), () => uninstallPackage('hello'), () => purgeModuleData('hello', { confirm: 'hello' })]) {
      await assert.rejects(call(), (err) => err.statusCode === 409 && err.code === 'RESTART_PENDING' && /перезапускается/.test(err.problems[0].message.ru));
    }
  } finally {
    resetRestart();
  }
});

// ── #8 SDK resolver ───────────────────────────────────────────────────────

test('sdk resolver: secrets, key handling and the package platform are refused; what Masterplan uses is allowed', () => {
  for (const path of ['config/app.js', 'services/crypto.js', 'platform/identity.js', 'platform/packages/installer.js', 'platform/packages/signature.js', 'platform/sdkLoader.mjs']) {
    assert.ok(!corePathAllowed(path), path);
    assert.throws(() => mapSpecifier(`@portal/sdk/core/${path}`, 'file:///data/modules/x/1.0.0/server/index.js'), (err) => err.code === 'ERR_PORTAL_SDK_PATH');
  }
  for (const path of ['config/database.js', 'config/paths.js', 'platform/registry.js', 'services/settings.js', 'services/notifications.js', 'services/i18n/index.js', 'modules/shared/acl.js', 'api/scopes.js', 'api/events.js']) {
    assert.ok(corePathAllowed(path), path);
  }
});
