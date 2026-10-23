import '../test-fixtures/test-env.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPublicKey, verify } from 'node:crypto';

/*
 * Module packages end to end against a database (docs/module-packages.md):
 * the hello fixture (one route, one table, two migrations, translations) is
 * built and signed with a throw-away key, installed, loaded as after a
 * restart, switched on, updated (backup first), a failing update leaves the
 * old version, a downgrade and an unsigned file are refused, a version that
 * does not start after an update is rolled back, removal is refused while
 * another module depends on it, data is deleted only after a backup, a broken
 * package is skipped at boot, and the portal identity signs the inventory.
 * Needs a test database (never production!):
 *
 *   MODULES_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/module-packages.db.test.js
 *
 * Without MODULES_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.MODULES_DB_TEST === '1';
const skip = enabled ? false : 'set MODULES_DB_TEST=1 and a test database to run';
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '../test-fixtures/module-hello');
const ACTOR = 'pkgtest';

let ctx = null;

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'portal-pkg-db-'));
  const modulesDir = join(root, 'modules');
  process.env.MODULES_DIR = modulesDir;
  process.env.MODULE_BACKUP_PGDUMP = '0';
  // The first boot after an update is confirmed at once (the settle window has its own test).
  process.env.MODULE_BOOT_SETTLE_MS = '0';
  delete process.env.MODULES_DEV;
  const signature = await import('../platform/packages/signature.js');
  const key = signature.generateSigningKey();
  writeFileSync(join(root, 'key.pem'), key.privateKey);
  writeFileSync(join(root, 'trusted.json'), JSON.stringify({ keys: [{ publicKey: key.publicKey }] }));
  process.env.MODULE_TRUSTED_KEYS_FILE = join(root, 'trusted.json');
  const restart = await import('../platform/packages/restart.js');
  const restarts = [];
  restart.setRestartHandler((pending) => restarts.push(pending.reason));
  const db = await import('../config/database.js');
  const { buildModule } = await import(pathToFileURL(resolve(here, '../../../scripts/build-module.mjs')).href);
  const trustedKeys = [{ id: key.keyId, publicKey: key.publicKey }];

  /** Builds a variant of the hello fixture: edit(dir) changes the copied sources. */
  async function build(version, edit = () => {}, { unsigned = false, id = 'hello' } = {}) {
    const src = join(root, `src-${id}-${version}-${Math.random().toString(36).slice(2, 6)}`);
    cpSync(FIXTURE, src, { recursive: true });
    const config = JSON.parse(readFileSync(join(src, 'module.json'), 'utf8'));
    writeFileSync(join(src, 'module.json'), JSON.stringify({ ...config, id, version, changelog: [] }));
    edit(src);
    const result = await buildModule(undefined, { source: src, keep: true, key: join(root, 'key.pem'), out: join(root, 'dist'), 'no-web': process.env.MODULE_BUILD_WEB !== '1', 'no-write': true, unsigned, trustedKeys });
    return readFileSync(result.file);
  }
  return { root, modulesDir, key, restarts, db, build };
}

async function reboot() {
  const disk = await import('../platform/packages/disk.js');
  const loader = await import('../platform/packages/loader.js');
  const { BUILTIN_MODULE_IDS, MODULE_CATALOG } = await import('../modules/catalog.js');
  const { MODULE_MANIFEST } = await import('../modules/manifest.js');
  const { platformCatalogEntry, platformManifestEntry } = await import('../platform/packages/manifestFile.js');
  const { invalidateSettings } = await import('../services/settings.js');
  disk.resetDiskScan();
  loader.resetLoader();
  // What catalog.js / manifest.js do at the start of a new process.
  for (const pkg of disk.activePackages(BUILTIN_MODULE_IDS)) {
    const index = MODULE_CATALOG.findIndex((entry) => entry.id === pkg.id);
    if (index >= 0) MODULE_CATALOG.splice(index, 1);
    MODULE_CATALOG.push(platformCatalogEntry(pkg.manifest));
    MODULE_MANIFEST[pkg.id] = platformManifestEntry(pkg.manifest);
  }
  invalidateSettings();
  const results = await loader.loadPackages({ builtinIds: BUILTIN_MODULE_IDS, manifestEntries: MODULE_MANIFEST });
  await loader.registerPackages();
  return results;
}

async function setEnabled(id, on) {
  const { query } = ctx.db;
  const row = (await query(`SELECT value FROM app_settings WHERE key = 'modules'`)).rows[0];
  const modules = row ? JSON.parse(row.value) : {};
  modules[id] = { ...(modules[id] || {}), enabled: on };
  await query(`INSERT INTO app_settings (key, value) VALUES ('modules', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(modules)]);
  (await import('../services/settings.js')).invalidateSettings();
}

async function http(path, init) {
  const express = (await import('express')).default;
  const { packagesRouter } = await import('../platform/packages/loader.js');
  const { packageRoutes } = await import('../platform/packages/routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api', packageRoutes());
  app.use('/api', packagesRouter());
  const server = createServer(app);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const tableExists = async (name) => Boolean((await ctx.db.query(`SELECT to_regclass($1) AS t`, [name])).rows[0].t);
const columnExists = async (table, column) => (await ctx.db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [table, column])).rows.length > 0;

async function cleanup() {
  if (!ctx) return;
  const { query } = ctx.db;
  await query(`DROP TABLE IF EXISTS fkprobe_refs, hello_extra, hello_messages`).catch(() => {});
  for (const table of ['installed_modules', 'module_migrations', 'module_tables']) {
    const column = table === 'installed_modules' ? 'id' : 'module_id';
    await query(`DELETE FROM ${table} WHERE ${column} IN ('hello', 'hellodep', 'broken')`).catch(() => {});
  }
  await query(`UPDATE app_settings SET value = ((value::jsonb - 'hello') - 'hellodep')::text WHERE key = 'modules'`).catch(() => {});
  await query(`DELETE FROM security_events WHERE kind = 'module_package' AND (username = $1 OR (username = 'system' AND detail LIKE ANY (ARRAY['hello %', 'broken %'])))`, [ACTOR]).catch(() => {});
}

before(async () => {
  if (!enabled) return;
  ctx = await setup();
  await cleanup();
  const { ensurePackageTables } = await import('../platform/packages/store.js');
  await ensurePackageTables();
});

after(async () => {
  if (!ctx) return;
  await cleanup();
  await ctx.db.closePool();
  rmSync(ctx.root, { recursive: true, force: true });
});

const problemsOf = (err) => err?.problems || err?.problem ? (err.problems || [err.problem]) : [];

test('install → restart → switched off → on → route answers; translations and web for the shell', { skip, timeout: 240_000 }, async () => {
  const { stagePackage, installStaged } = await import('../platform/packages/installer.js');
  const zip = await ctx.build('1.0.0');
  const staged = await stagePackage(zip, { actor: ACTOR });
  assert.deepEqual(staged.problems, []);
  assert.equal(staged.preview.action, 'install');
  assert.equal(staged.preview.signed, true);
  assert.deepEqual(staged.preview.permissions, ['hello.admin']);
  const installed = await installStaged(staged.token, { actor: ACTOR });
  assert.deepEqual(installed.applied, ['001_init', '002_seed']);
  assert.ok(ctx.restarts.length >= 1, 'a restart was requested');
  assert.equal(readFileSync(join(ctx.modulesDir, 'hello/current'), 'utf8').trim(), '1.0.0');
  assert.ok(await tableExists('hello_messages'));
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM hello_messages`)).rows[0].n, 1);
  const tables = (await ctx.db.query(`SELECT table_name FROM module_tables WHERE module_id = 'hello'`)).rows.map((row) => row.table_name);
  assert.deepEqual(tables, ['hello_messages']);

  const results = await reboot();
  assert.deepEqual(results.filter((item) => item.id === 'hello').map((item) => item.ok), [true]);
  const loader = await import('../platform/packages/loader.js');
  assert.equal(loader.loadedModule('hello').module.api.registered(), 1, 'register(ctx) ran once');
  // Installed switched off (spec §6 stage 4: «Установлен, выключен»).
  assert.equal((await http('/api/hello-public/ping')).status, 404);
  await setEnabled('hello', true);
  const ping = await http('/api/hello-public/ping');
  assert.equal(ping.status, 200);
  assert.deepEqual(ping.body, { success: true, pong: 'Hello, guest!', messages: 1 });
  // Anonymous visitors do not learn which modules run (only the boot id for the restart screen).
  const anonymous = await http('/api/modules/installed');
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.body.signedIn, false);
  assert.deepEqual(anonymous.body.modules, []);
  assert.ok(anonymous.body.bootId);
  const shell = await loader.shellPackages({ signedIn: true });
  const hello = shell.modules.find((item) => item.id === 'hello');
  assert.equal(hello.enabled, true);
  // The URLs carry the version and a digest of the files (a reinstall with other bytes gets new URLs).
  const digest = loader.loadedModule('hello').listingSha256.slice(0, 12);
  assert.equal(hello.base, `/modules/hello/1.0.0-${digest}/`);
  assert.deepEqual(hello.locales.ru.sort(), [`/modules/hello/1.0.0-${digest}/locales/ru/apps.js`, `/modules/hello/1.0.0-${digest}/locales/ru/hello.js`]);
  const row = (await ctx.db.query(`SELECT * FROM installed_modules WHERE id = 'hello'`)).rows[0];
  assert.equal(row.state, 'installed');
  assert.equal(row.source, 'package');
  assert.equal(row.installed_by, ACTOR);
  assert.equal(row.signed_by, ctx.key.keyId);
  assert.match(row.listing_sha256, /^[a-f0-9]{64}$/);
  assert.match(row.signature, /ed25519/);
});

test('update: backup first, new migration, then the next boot confirms it', { skip, timeout: 240_000 }, async () => {
  const { stagePackage, installStaged } = await import('../platform/packages/installer.js');
  const zip = await ctx.build('1.1.0', (src) => writeFileSync(join(src, 'migrations/003_lang.sql'), `ALTER TABLE hello_messages ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';`));
  const staged = await stagePackage(zip, { actor: ACTOR });
  assert.deepEqual(staged.problems, []);
  assert.equal(staged.preview.action, 'update');
  assert.equal(staged.preview.currentVersion, '1.0.0');
  const result = await installStaged(staged.token, { actor: ACTOR });
  assert.deepEqual(result.applied, ['003_lang']);
  assert.ok(result.backup && existsSync(result.backup.file), 'backup made before the update');
  assert.ok(await columnExists('hello_messages', 'lang'));
  assert.equal(readFileSync(join(ctx.modulesDir, 'hello/current'), 'utf8').trim(), '1.1.0');
  assert.equal(readFileSync(join(ctx.modulesDir, 'hello/previous'), 'utf8').trim(), '1.0.0');
  assert.equal((await ctx.db.query(`SELECT pending_check FROM installed_modules WHERE id = 'hello'`)).rows[0].pending_check, true);
  const results = await reboot();
  assert.deepEqual(results.filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.1.0', true]]);
  const row = (await ctx.db.query(`SELECT * FROM installed_modules WHERE id = 'hello'`)).rows[0];
  assert.equal(row.pending_check, false);
  assert.equal(row.previous_version, '1.0.0');
  // The backup restores into tables of the same structure.
  const { listBackups } = await import('../platform/packages/backup.js');
  const meta = listBackups('hello')[0];
  assert.deepEqual(meta.tables, ['hello_messages']);
  assert.equal(meta.format, 'ndjson');
});

test('failing update: nothing changes, the old version stays', { skip, timeout: 240_000 }, async () => {
  const { stagePackage, installStaged } = await import('../platform/packages/installer.js');
  const zip = await ctx.build('1.2.0', (src) => {
    writeFileSync(join(src, 'migrations/003_lang.sql'), `ALTER TABLE hello_messages ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';`);
    writeFileSync(join(src, 'migrations/004_bad.sql'), `ALTER TABLE hello_messages ADD COLUMN bad INT; SELECT * FROM no_such_table_for_hello;`);
  });
  const staged = await stagePackage(zip, { actor: ACTOR });
  assert.deepEqual(staged.problems, []);
  await assert.rejects(installStaged(staged.token, { actor: ACTOR }), (err) => {
    assert.equal(err.problems[0].code, 'MIGRATION_FAILED');
    assert.match(err.problems[0].message.ru, /^Миграция 004_bad не выполнилась, изменения отменены, оставлена версия 1\.1\.0/);
    return true;
  });
  assert.equal(readFileSync(join(ctx.modulesDir, 'hello/current'), 'utf8').trim(), '1.1.0');
  assert.ok(!existsSync(join(ctx.modulesDir, 'hello/1.2.0')));
  assert.ok(!(await columnExists('hello_messages', 'bad')), 'the transaction was rolled back');
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM module_migrations WHERE module_id = 'hello' AND migration_id = '004_bad'`)).rows[0].n, 0);
});

test('refused: downgrade (spec §5 message), unsigned file, foreign signature', { skip, timeout: 240_000 }, async () => {
  const { stagePackage } = await import('../platform/packages/installer.js');
  const old = await stagePackage(await ctx.build('1.0.0'), { actor: ACTOR });
  assert.deepEqual(old.problems.map((item) => item.message.ru), ['Установлена 1.1.0, в файле 1.0.0 — понижение запрещено']);
  const unsigned = await ctx.build('1.5.0', () => {}, { unsigned: true });
  await assert.rejects(stagePackage(unsigned, { actor: ACTOR }), (err) => problemsOf(err)[0].message.ru === 'Файл повреждён или выпущен не нами');
  process.env.MODULES_DEV = '1';
  try {
    const dev = await stagePackage(unsigned, { actor: ACTOR });
    assert.equal(dev.unsigned, true);
  } finally {
    delete process.env.MODULES_DEV;
  }
});

test('a version that does not start after an update is rolled back at boot', { skip, timeout: 240_000 }, async () => {
  const { stagePackage, installStaged } = await import('../platform/packages/installer.js');
  const zip = await ctx.build('1.3.0', (src) => {
    writeFileSync(join(src, 'migrations/003_lang.sql'), `ALTER TABLE hello_messages ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';`);
    const file = join(src, 'server/index.js');
    writeFileSync(file, `if (process.env.HELLO_FAIL_BOOT === '1') throw new Error('hello 1.3.0 cannot start');\n${readFileSync(file, 'utf8')}`);
  });
  const staged = await stagePackage(zip, { actor: ACTOR });
  await installStaged(staged.token, { actor: ACTOR });
  ctx.restarts.length = 0;
  process.env.HELLO_FAIL_BOOT = '1';
  try {
    const results = await reboot();
    assert.deepEqual(results.filter((item) => item.id === 'hello').map((item) => item.ok), [false]);
  } finally {
    delete process.env.HELLO_FAIL_BOOT;
  }
  assert.equal(readFileSync(join(ctx.modulesDir, 'hello/current'), 'utf8').trim(), '1.1.0');
  const row = (await ctx.db.query(`SELECT * FROM installed_modules WHERE id = 'hello'`)).rows[0];
  assert.equal(row.version, '1.1.0');
  assert.equal(row.state, 'failed');
  assert.match(row.error, /did not start .*rolled back to 1\.1\.0/);
  assert.ok(ctx.restarts.some((reason) => /rollback of hello/.test(reason)));
  assert.equal(row.last_rollback.from, '1.3.0');
  assert.equal(row.last_rollback.to, '1.1.0');
  assert.match(row.last_rollback.tables, /data-only backup/);
  assert.equal(row.last_rollback.ok, false);
  const again = await reboot();
  assert.deepEqual(again.filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.1.0', true]]);
  // A good boot clears the error, not the outcome of the rollback (Settings → Modules shows it).
  const after = (await ctx.db.query(`SELECT * FROM installed_modules WHERE id = 'hello'`)).rows[0];
  assert.equal(after.error, null);
  assert.equal(after.state, 'installed');
  assert.equal(after.last_rollback.from, '1.3.0');
  const { packageStates } = await import('../platform/packages/loader.js');
  assert.equal((await packageStates()).find((item) => item.id === 'hello').lastRollback.to, '1.1.0');
  const journal = (await ctx.db.query(`SELECT detail_code FROM security_events WHERE kind = 'module_package' AND username = 'system' AND detail LIKE 'hello 1.3.0%' ORDER BY id`)).rows.map((item) => item.detail_code);
  assert.ok(journal.includes('module_rolled_back'));
});

/** A build of hello that keeps migration 003_lang (applied since 1.1.0: a version without it is older than the database). */
const withLang = (edit = () => {}) => (src) => {
  writeFileSync(join(src, 'migrations/003_lang.sql'), `ALTER TABLE hello_messages ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';`);
  edit(src);
};
const prependServer = (code) => (src) => {
  const file = join(src, 'server/index.js');
  writeFileSync(file, `${code}\n${readFileSync(file, 'utf8')}`);
};
const currentOf = () => readFileSync(join(ctx.modulesDir, 'hello/current'), 'utf8').trim();
const helloRow = async () => (await ctx.db.query(`SELECT * FROM installed_modules WHERE id = 'hello'`)).rows[0];

async function installVersion(version, edit) {
  const { stagePackage, installStaged } = await import('../platform/packages/installer.js');
  const staged = await stagePackage(await ctx.build(version, withLang(edit)), { actor: ACTOR });
  assert.deepEqual(staged.problems, []);
  return installStaged(staged.token, { actor: ACTOR });
}

test('boot crash: the next start finds the marker and rolls the update back before importing it', { skip, timeout: 240_000 }, async () => {
  await installVersion('1.4.0', prependServer(`globalThis.__hello140Imported = true;`));
  assert.equal((await helloRow()).pending_check, true);
  // The process died while loading 1.4.0 (an uncaught exception from a timer, say): its marker is left behind.
  writeFileSync(join(ctx.modulesDir, 'hello/.boot-attempt'), JSON.stringify({ version: '1.4.0', status: 'loading', bootId: 'crashed' }));
  ctx.restarts.length = 0;
  const results = await reboot();
  const hello = results.find((item) => item.id === 'hello');
  assert.equal(hello.ok, false);
  assert.match(hello.error, /previous start stopped while loading it/);
  assert.equal(globalThis.__hello140Imported, undefined, 'the crashing version was not imported again');
  assert.equal(currentOf(), '1.1.0');
  assert.ok(!existsSync(join(ctx.modulesDir, 'hello/.boot-attempt')));
  assert.equal((await helloRow()).last_rollback.from, '1.4.0');
  assert.ok(ctx.restarts.some((reason) => /rollback of hello/.test(reason)));
  assert.deepEqual((await reboot()).filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.1.0', true]]);
});

test('settle window: an update stays on probation for a while; a crash in it rolls back, a graceful shutdown confirms', { skip, timeout: 240_000 }, async () => {
  process.env.MODULE_BOOT_SETTLE_MS = '600000';
  try {
    await installVersion('1.5.0');
    assert.deepEqual((await reboot()).filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.5.0', true]]);
    assert.equal((await helloRow()).pending_check, true, 'still on probation');
    assert.ok(existsSync(join(ctx.modulesDir, 'hello/.boot-attempt')));
    // Crash (no shutdown hooks) and start again: rolled back.
    await reboot();
    assert.equal(currentOf(), '1.1.0');
    assert.equal((await helloRow()).last_rollback.from, '1.5.0');
    await reboot();
    await installVersion('1.5.1');
    await reboot();
    assert.equal((await helloRow()).pending_check, true);
    // A graceful shutdown (a restart for another module, a deploy) confirms it.
    const { runShutdownHooks } = await import('../platform/registry.js');
    await runShutdownHooks();
    assert.equal((await helloRow()).pending_check, false);
    assert.ok(!existsSync(join(ctx.modulesDir, 'hello/.boot-attempt')));
  } finally {
    process.env.MODULE_BOOT_SETTLE_MS = '0';
  }
  assert.deepEqual((await reboot()).filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.5.1', true]]);
});

test('a running package that crashed the boot is skipped («blocked») until a new version is installed', { skip, timeout: 240_000 }, async () => {
  writeFileSync(join(ctx.modulesDir, 'hello/.boot-attempt'), JSON.stringify({ version: '1.5.1', status: 'loading', bootId: 'crashed' }));
  for (let i = 0; i < 2; i += 1) {
    const hello = (await reboot()).find((item) => item.id === 'hello');
    assert.equal(hello.ok, false);
    const row = await helloRow();
    assert.equal(row.state, 'failed');
    assert.match(row.error, /not loaded until a new version is installed/);
  }
  const { packageStates } = await import('../platform/packages/loader.js');
  assert.equal((await packageStates()).find((item) => item.id === 'hello').blocked, 'blocked');
  assert.equal(currentOf(), '1.5.1', 'not rolled back: it was not an update');
  await installVersion('1.5.2');
  assert.ok(!existsSync(join(ctx.modulesDir, 'hello/.boot-attempt')), 'the new version starts afresh');
  assert.deepEqual((await reboot()).filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.5.2', true]]);
});

test('a package that hangs at boot times out; an update is rolled back at the next start', { skip, timeout: 240_000 }, async () => {
  await installVersion('1.6.0', prependServer(`if (process.env.HELLO_HANG === '1') await new Promise(() => {});`));
  process.env.HELLO_HANG = '1';
  process.env.MODULE_BOOT_TIMEOUT_MS = '1500';
  ctx.restarts.length = 0;
  try {
    const hello = (await reboot()).find((item) => item.id === 'hello');
    assert.equal(hello.ok, false);
    assert.match(hello.error, /did not finish within 2 s/);
    assert.equal(JSON.parse(readFileSync(join(ctx.modulesDir, 'hello/.boot-attempt'), 'utf8')).status, 'timeout');
    assert.ok(ctx.restarts.some((reason) => /loading timed out/.test(reason)));
    // The next start rolls back without importing 1.6.0 again.
    await reboot();
    assert.equal(currentOf(), '1.5.2');
    assert.match((await helloRow()).last_rollback.reason, /did not finish within/);
  } finally {
    delete process.env.HELLO_HANG;
    delete process.env.MODULE_BOOT_TIMEOUT_MS;
  }
  assert.deepEqual((await reboot()).filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.5.2', true]]);
});

test('files changed on disk after the install are not run', { skip, timeout: 120_000 }, async () => {
  const file = join(ctx.modulesDir, 'hello/1.5.2/server/index.js');
  const original = readFileSync(file, 'utf8');
  writeFileSync(file, `${original}\nglobalThis.__helloTampered = true;\n`);
  try {
    const hello = (await reboot()).find((item) => item.id === 'hello');
    assert.equal(hello.ok, false);
    assert.match(hello.error, /do not match the package signature/);
    assert.equal(globalThis.__helloTampered, undefined);
  } finally {
    writeFileSync(file, original);
  }
  assert.deepEqual((await reboot()).filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.5.2', true]]);
});

test('update refused: foreign keys from other tables into the module’s; older than the database; an edited applied migration', { skip, timeout: 240_000 }, async () => {
  const { stagePackage, installStaged } = await import('../platform/packages/installer.js');
  await ctx.db.query(`CREATE TABLE fkprobe_refs (id SERIAL PRIMARY KEY, message_id INT REFERENCES hello_messages(id))`);
  try {
    const staged = await stagePackage(await ctx.build('1.7.0', withLang()), { actor: ACTOR });
    await assert.rejects(installStaged(staged.token, { actor: ACTOR }), (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.problems[0].code, 'FOREIGN_KEYS');
      assert.match(err.problems[0].message.ru, /fkprobe_refs → hello_messages/);
      return true;
    });
  } finally {
    await ctx.db.query(`DROP TABLE IF EXISTS fkprobe_refs`);
  }
  // 1.8.0 lacks 003_lang, which the database has: older than the schema (even with a higher number).
  const older = await stagePackage(await ctx.build('1.8.0'), { actor: ACTOR });
  await assert.rejects(installStaged(older.token, { actor: ACTOR }), (err) => err.problems[0].code === 'SCHEMA_NEWER' && /003_lang/.test(err.message));
  const edited = await stagePackage(await ctx.build('1.8.1', withLang((src) => writeFileSync(join(src, 'migrations/001_init.sql'), `CREATE TABLE IF NOT EXISTS hello_messages (id BIGSERIAL PRIMARY KEY, text TEXT);`))), { actor: ACTOR });
  await assert.rejects(installStaged(edited.token, { actor: ACTOR }), (err) => err.problems[0].code === 'MIGRATION_CHANGED' && err.problems[0].params.migration === '001_init');
  assert.equal(currentOf(), '1.5.2');
});

test('the check process of an install is killed at shutdown; nothing changes', { skip, timeout: 240_000 }, async () => {
  const { stagePackage, installStaged, stopPrepare } = await import('../platform/packages/installer.js');
  // The import hangs with a live timer (a bare never-settling await would just end the process).
  const staged = await stagePackage(await ctx.build('1.9.0', withLang(prependServer(`if (process.env.HELLO_HANG === '1') await new Promise(() => setInterval(() => {}, 1000));`))), { actor: ACTOR });
  process.env.HELLO_HANG = '1';
  try {
    const install = installStaged(staged.token, { actor: ACTOR });
    await new Promise((done) => setTimeout(done, 2500));
    stopPrepare();
    await assert.rejects(install, (err) => err.problems[0].code === 'MODULE_DOES_NOT_START' && /SIGKILL/.test(err.message));
  } finally {
    delete process.env.HELLO_HANG;
  }
  assert.equal(currentOf(), '1.5.2');
  assert.ok(!existsSync(join(ctx.modulesDir, 'hello/1.9.0')));
});

test('backups: private files; pg_dump that cannot dump falls back to NDJSON', { skip, timeout: 120_000 }, async () => {
  const { backupNow } = await import('../platform/packages/installer.js');
  const backup = await import('../platform/packages/backup.js');
  const made = await backupNow('hello', { actor: ACTOR });
  assert.equal(statSync(made.file).mode & 0o777, 0o600);
  assert.equal(statSync(made.file.replace(/\.ndjson\.gz$/, '.json')).mode & 0o777, 0o600);
  // A pg_dump that connects (the probe passes) but fails to dump, then one that cannot connect at all.
  const bin = join(ctx.root, 'fake-bin');
  mkdirSync(bin, { recursive: true });
  const savedPath = process.env.PATH;
  delete process.env.MODULE_BACKUP_PGDUMP;
  try {
    for (const script of ['case "$*" in *"/dev/null"*) exit 0;; esac; echo "pg_dump: error: aborting because of server version mismatch" >&2; exit 1', 'echo "pg_dump: error: connection refused" >&2; exit 1']) {
      writeFileSync(join(bin, 'pg_dump'), `#!/bin/sh
${script}
`, { mode: 0o755 });
      process.env.PATH = `${bin}:${savedPath}`;
      backup.resetPgDumpProbe();
      const result = await backupNow('hello', { actor: ACTOR });
      assert.equal(result.format, 'ndjson');
      assert.ok(existsSync(result.file));
    }
  } finally {
    process.env.PATH = savedPath;
    process.env.MODULE_BACKUP_PGDUMP = '0';
    backup.resetPgDumpProbe();
  }
});

// With pg_dump / pg_restore that reach the test database (MODULES_PGDUMP_TEST=1, e.g. the docker exec wrappers on PATH).
const pgSkip = skip || (process.env.MODULES_PGDUMP_TEST === '1' ? false : 'set MODULES_PGDUMP_TEST=1 with pg_dump/pg_restore for the test database on PATH');
test('rollback with a pg_dump backup: tables of the failed version are dropped first, the old ones restored', { skip: pgSkip, timeout: 300_000 }, async () => {
  const backup = await import('../platform/packages/backup.js');
  delete process.env.MODULE_BACKUP_PGDUMP;
  backup.resetPgDumpProbe();
  try {
    assert.ok(backup.pgDumpAvailable(), 'pg_dump reaches the test database');
    const before = (await ctx.db.query(`SELECT count(*)::int AS n FROM hello_messages`)).rows[0].n;
    await installVersion('1.10.0', (src) => {
      // The new table references the restored one: pg_restore --clean could not drop hello_messages while it exists.
      writeFileSync(join(src, 'migrations/004_extra.sql'), `CREATE TABLE hello_extra (id SERIAL PRIMARY KEY, message_id INT REFERENCES hello_messages(id)); INSERT INTO hello_messages (text) VALUES ('written by 1.10.0');`);
      prependServer(`if (process.env.HELLO_FAIL_110 === '1') throw new Error('hello 1.10.0 cannot start');`)(src);
    });
    assert.ok(await tableExists('hello_extra'));
    process.env.HELLO_FAIL_110 = '1';
    try {
      await reboot();
    } finally {
      delete process.env.HELLO_FAIL_110;
    }
    const row = await helloRow();
    assert.equal(row.last_rollback.tables, 'restored');
    assert.equal(row.last_rollback.ok, true);
    assert.ok(!(await tableExists('hello_extra')), 'the failed version’s table is gone');
    assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM hello_messages`)).rows[0].n, before, 'rows as before the update');
    assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM module_migrations WHERE module_id = 'hello' AND migration_id = '004_extra'`)).rows[0].n, 0);
    assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM module_tables WHERE module_id = 'hello' AND table_name = 'hello_extra'`)).rows[0].n, 0);
    assert.deepEqual((await reboot()).filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.5.2', true]]);
  } finally {
    process.env.MODULE_BACKUP_PGDUMP = '0';
    backup.resetPgDumpProbe();
  }
});

test('removal is refused while another module requires it; data is deleted only after a backup', { skip, timeout: 240_000 }, async () => {
  const { stagePackage, installStaged, uninstallPackage, purgeModuleData } = await import('../platform/packages/installer.js');
  const dep = await ctx.build(
    '1.0.0',
    (src) => {
      const config = JSON.parse(readFileSync(join(src, 'module.json'), 'utf8'));
      writeFileSync(join(src, 'module.json'), JSON.stringify({ ...config, name: { en: 'Hello dependent', ru: 'Зависимый' }, permissions: [], tables: [], requires: [{ id: 'hello', version: '1.0.0' }] }));
      rmSync(join(src, 'migrations'), { recursive: true });
      writeFileSync(join(src, 'server/index.js'), `export default { id: 'hellodep', register(ctx) { this.helloApi = ctx.modules.get('hello')?.api || null; } };\n`);
    },
    { id: 'hellodep' }
  );
  const staged = await stagePackage(dep, { actor: ACTOR });
  assert.deepEqual(staged.problems, []);
  await installStaged(staged.token, { actor: ACTOR });
  await assert.rejects(uninstallPackage('hello', { actor: ACTOR }), (err) => {
    assert.deepEqual(err.problems.map((item) => item.message.ru), ['Сначала удалите „Зависимый“ — он использует „Привет“']);
    return true;
  });
  await uninstallPackage('hellodep', { actor: ACTOR });
  const removed = await uninstallPackage('hello', { actor: ACTOR });
  assert.equal(removed.version, '1.5.2');
  assert.ok(!existsSync(join(ctx.modulesDir, 'hello')), 'the code is deleted');
  assert.ok(await tableExists('hello_messages'), 'the data stays');
  assert.equal((await ctx.db.query(`SELECT state FROM installed_modules WHERE id = 'hello'`)).rows[0].state, 'removed');

  // Removed, data kept: an older file would run on the newer schema.
  const { stagePackage: stageAgain } = await import('../platform/packages/installer.js');
  const downgrade = await stageAgain(await ctx.build('1.0.0'), { actor: ACTOR });
  assert.deepEqual(downgrade.problems.map((item) => item.message.ru), ['Была установлена 1.5.2 (её данные сохранены), в файле 1.0.0 — понижение запрещено']);
  await assert.rejects(uninstallPackage('hello', { actor: ACTOR }), (err) => err.problems[0].code === 'NOT_INSTALLED');
  await assert.rejects(purgeModuleData('hello', { actor: ACTOR }), (err) => err.problems[0].code === 'CONFIRM_REQUIRED');
  const purged = await purgeModuleData('hello', { actor: ACTOR, confirm: 'hello' });
  assert.deepEqual(purged.tables, ['hello_messages']);
  assert.ok(existsSync(purged.backup.file) && purged.backup.bytes > 0, 'a fresh backup was made first');
  assert.ok(!(await tableExists('hello_messages')));
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM installed_modules WHERE id = 'hello'`)).rows[0].n, 0);
  assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM module_migrations WHERE module_id = 'hello'`)).rows[0].n, 0);
  const journal = (await ctx.db.query(`SELECT detail_code FROM security_events WHERE kind = 'module_package' AND username = $1 ORDER BY id`, [ACTOR])).rows.map((row) => row.detail_code);
  for (const code of ['module_installed', 'module_updated', 'module_failed', 'module_rejected', 'module_removed', 'module_data_removed']) assert.ok(journal.includes(code), code);
});

test('a broken package is skipped at boot and marked failed; the rest loads', { skip, timeout: 120_000 }, async () => {
  const { writePointer } = await import('../platform/packages/disk.js');
  const dir = join(ctx.modulesDir, 'broken', '1.0.0');
  mkdirSync(join(dir, 'server'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id: 'broken', name: { en: 'Broken', ru: 'Сломанный' }, version: '1.0.0', core: '1.0.0', category: 'work', server: { entry: 'server/index.js' } }));
  writeFileSync(join(dir, 'server/index.js'), `import '@portal/sdk/core/modules/crm/service.js';\nexport default { id: 'broken' };\n`);
  writePointer('broken', 'current', '1.0.0');
  // Unsigned files dropped into the folder by hand: refused before anything is imported.
  const refused = (await reboot()).find((item) => item.id === 'broken');
  assert.equal(refused.ok, false);
  assert.match(refused.error, /not signed and development mode/);
  // In development mode they are imported, and the SDK refuses the module internals.
  process.env.MODULES_DEV = '1';
  try {
    const results = await reboot();
    const broken = results.find((item) => item.id === 'broken');
    assert.equal(broken.ok, false);
    assert.match(broken.error, /not part of the portal SDK/);
    const row = (await ctx.db.query(`SELECT state, error FROM installed_modules WHERE id = 'broken'`)).rows[0];
    assert.equal(row.state, 'failed');
    assert.match(row.error, /not part of the portal SDK/);
  } finally {
    delete process.env.MODULES_DEV;
  }
  rmSync(join(ctx.modulesDir, 'broken'), { recursive: true, force: true });
});

test('portal identity: one UUID and key; the inventory is signed and holds no private key', { skip }, async () => {
  const { inventory, INVENTORY_FORMAT, canonicalJson } = await import('../platform/packages/inventory.js');
  const { ensureIdentityTable, resetIdentityCache } = await import('../platform/identity.js');
  await ensureIdentityTable();
  // The test runs with its own JWT secret: an identity it creates is removed again (the test portal keeps its own).
  const existed = (await ctx.db.query(`SELECT count(*)::int AS n FROM portal_identity`)).rows[0].n > 0;
  if (existed) {
    const first = await inventory();
    assert.equal(first.format, INVENTORY_FORMAT);
    return;
  }
  resetIdentityCache();
  try {
    await runIdentityChecks(inventory, INVENTORY_FORMAT, canonicalJson);
  } finally {
    await ctx.db.query(`DELETE FROM portal_identity`);
    resetIdentityCache();
  }
});

async function runIdentityChecks(inventory, INVENTORY_FORMAT, canonicalJson) {
  const first = await inventory();
  const second = await inventory();
  assert.equal(first.format, INVENTORY_FORMAT);
  assert.equal(first.portal.id, second.portal.id);
  assert.match(first.portal.id, /^[0-9a-f-]{36}$/);
  assert.ok(first.modules.some((item) => item.source === 'bundled'));
  assert.ok(!JSON.stringify(first).includes('PRIVATE KEY'));
  const { digest, signature, ...body } = first;
  assert.equal(digest, (await import('node:crypto')).createHash('sha256').update(canonicalJson(body)).digest('hex'));
  assert.ok(verify(null, Buffer.from(digest), createPublicKey(first.portal.publicKey), Buffer.from(signature, 'base64')));
}
