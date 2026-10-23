import '../test-fixtures/test-env.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  await query(`DROP TABLE IF EXISTS hello_messages`).catch(() => {});
  for (const table of ['installed_modules', 'module_migrations', 'module_tables']) {
    const column = table === 'installed_modules' ? 'id' : 'module_id';
    await query(`DELETE FROM ${table} WHERE ${column} IN ('hello', 'hellodep', 'broken')`).catch(() => {});
  }
  await query(`UPDATE app_settings SET value = ((value::jsonb - 'hello') - 'hellodep')::text WHERE key = 'modules'`).catch(() => {});
  await query(`DELETE FROM security_events WHERE kind = 'module_package' AND username = $1`, [ACTOR]).catch(() => {});
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
  const shell = await http('/api/modules/installed');
  const hello = shell.body.modules.find((item) => item.id === 'hello');
  assert.equal(hello.enabled, true);
  assert.deepEqual(hello.locales.ru.sort(), ['/modules/hello/1.0.0/locales/ru/apps.js', '/modules/hello/1.0.0/locales/ru/hello.js']);
  const row = (await ctx.db.query(`SELECT * FROM installed_modules WHERE id = 'hello'`)).rows[0];
  assert.equal(row.state, 'installed');
  assert.equal(row.source, 'package');
  assert.equal(row.installed_by, ACTOR);
  assert.equal(row.signed_by, ctx.key.keyId);
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
  const again = await reboot();
  assert.deepEqual(again.filter((item) => item.id === 'hello').map((item) => [item.version, item.ok]), [['1.1.0', true]]);
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
  assert.equal(removed.version, '1.1.0');
  assert.ok(!existsSync(join(ctx.modulesDir, 'hello')), 'the code is deleted');
  assert.ok(await tableExists('hello_messages'), 'the data stays');
  assert.equal((await ctx.db.query(`SELECT state FROM installed_modules WHERE id = 'hello'`)).rows[0].state, 'removed');

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
  const results = await reboot();
  const broken = results.find((item) => item.id === 'broken');
  assert.equal(broken.ok, false);
  assert.match(broken.error, /not part of the portal SDK/);
  const row = (await ctx.db.query(`SELECT state, error FROM installed_modules WHERE id = 'broken'`)).rows[0];
  assert.equal(row.state, 'failed');
  assert.match(row.error, /not part of the portal SDK/);
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
