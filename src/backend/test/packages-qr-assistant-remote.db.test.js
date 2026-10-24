import '../test-fixtures/test-env.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
 * QR codes, the robot assistant and Remote access as module packages, against a
 * database that already has their tables (a portal where they were built in):
 *
 *   - migration 001 (their former schema()) changes nothing there: same tables,
 *     columns, indexes, constraints, row counts and per-table checksums, recorded
 *     once, a no-op the second time;
 *   - the new core turns their «bundled» rows into «removed» (data kept) and keeps
 *     their stored settings through edits of other settings while they are absent;
 *   - the signed packages install over the existing data (001 creates nothing),
 *     load at the next boot, and bring the settings back as they were;
 *   - QR's anonymous routes are mounted for visitors (dynamic code → 302);
 *   - Remote's WebSocket tunnels attach to the HTTP server when the package
 *     registers, its sealed secrets open; its optional link to Directory is
 *     active only while Directory is on;
 *   - the robot is an overlay (not an app) and keeps its public settings.
 *
 * Needs a test database (never production!) — ideally a copy of one created by a
 * core with these modules built in:
 *
 *   PACKAGES2_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/packages-qr-assistant-remote.db.test.js
 */

const enabled = process.env.PACKAGES2_DB_TEST === '1';
const skip = enabled ? false : 'set PACKAGES2_DB_TEST=1 and a test database to run';
const here = dirname(fileURLToPath(import.meta.url));
const IDS = ['qr', 'assistant', 'remote'];
const ACTOR = 'pk2test';
const TAG = `PK2TEST-${process.pid}`;

let ctx = null;

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'portal-pk2-db-'));
  process.env.MODULES_DIR = join(root, 'modules');
  process.env.MODULE_BACKUP_PGDUMP = '0';
  process.env.MODULE_BOOT_SETTLE_MS = '0';
  delete process.env.MODULES_DEV;
  const signature = await import('../platform/packages/signature.js');
  const key = signature.generateSigningKey();
  writeFileSync(join(root, 'key.pem'), key.privateKey);
  writeFileSync(join(root, 'trusted.json'), JSON.stringify({ keys: [{ publicKey: key.publicKey }] }));
  process.env.MODULE_TRUSTED_KEYS_FILE = join(root, 'trusted.json');
  const restart = await import('../platform/packages/restart.js');
  restart.setRestartHandler(() => {});
  const db = await import('../config/database.js');
  const users = (await db.query(`SELECT id FROM users WHERE is_active IS NOT FALSE ORDER BY id LIMIT 2`)).rows.map((row) => row.id);
  assert.ok(users.length >= 1, 'the test database needs a user');
  return { root, key, db, users };
}

/** Tables of a module with their structure and data: names, columns, indexes, constraints, counts, checksums. */
async function snapshot(id) {
  const { query } = ctx.db;
  const like = `${id}\\_%`;
  const tables = (await query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename LIKE $1 ORDER BY 1`, [like])).rows.map((row) => row.tablename);
  const columns = (await query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name LIKE $1 ORDER BY table_name, ordinal_position`,
    [like]
  )).rows;
  const indexes = (await query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename LIKE $1 ORDER BY 1`, [like])).rows;
  const constraints = (await query(
    `SELECT c.conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname LIKE $1 ORDER BY 1`,
    [like]
  )).rows;
  const data = {};
  for (const table of tables) {
    data[table] = (await query(`SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(t::text, '|' ORDER BY t::text), '')) AS sum FROM ${table} t`)).rows[0];
  }
  return { tables, columns, indexes, constraints, data };
}

const raw = async () => {
  const row = (await ctx.db.query(`SELECT value FROM app_settings WHERE key = 'modules'`)).rows[0];
  return row ? JSON.parse(row.value) : {};
};

async function writeStored(modules) {
  await ctx.db.query(`INSERT INTO app_settings (key, value) VALUES ('modules', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(modules)]);
  (await import('../services/settings.js')).invalidateSettings();
}

/** What a new process does: catalog / manifest entries of the packages on disk, then load and register them. */
async function reboot() {
  const disk = await import('../platform/packages/disk.js');
  const loader = await import('../platform/packages/loader.js');
  const { BUILTIN_MODULE_IDS, MODULE_CATALOG } = await import('../modules/catalog.js');
  const { MODULE_MANIFEST } = await import('../modules/manifest.js');
  const { platformCatalogEntry, platformManifestEntry } = await import('../platform/packages/manifestFile.js');
  disk.resetDiskScan();
  loader.resetLoader();
  for (const pkg of disk.activePackages(BUILTIN_MODULE_IDS)) {
    const index = MODULE_CATALOG.findIndex((entry) => entry.id === pkg.id);
    if (index >= 0) MODULE_CATALOG.splice(index, 1);
    MODULE_CATALOG.push(platformCatalogEntry(pkg.manifest));
    MODULE_MANIFEST[pkg.id] = platformManifestEntry(pkg.manifest);
  }
  (await import('../services/settings.js')).invalidateSettings();
  const results = await loader.loadPackages({ builtinIds: BUILTIN_MODULE_IDS, manifestEntries: MODULE_MANIFEST });
  await loader.registerPackages();
  return results;
}

async function http(path, init) {
  const express = (await import('express')).default;
  const { packagesRouter } = await import('../platform/packages/loader.js');
  const app = express();
  app.use('/api', packagesRouter());
  const server = createServer(app);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { redirect: 'manual', ...init });
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  } finally {
    server.close();
  }
}

/** Rows a portal with these modules built in has: a code with scans, a person's robot, a computer with a sealed password. */
async function seed() {
  const { query } = ctx.db;
  const { seal } = await import('../services/crypto.js');
  const [owner] = ctx.users;
  const slug = `pk${String(process.pid).slice(-6)}`;
  const template = (await query(`SELECT id, design FROM qr_templates ORDER BY id LIMIT 1`)).rows[0];
  const code = (await query(
    `INSERT INTO qr_codes (owner_id, name, type, content, template_id, design, dynamic, slug, scans)
     VALUES ($1, $2, 'url', $3, $4, $5, TRUE, $6, 3) RETURNING id`,
    [owner, TAG, JSON.stringify({ url: 'https://www.example.com/pk2' }), template?.id || null, JSON.stringify(template?.design || {}), slug]
  )).rows[0].id;
  await query(`INSERT INTO qr_scan_days (code_id, day, count) VALUES ($1, CURRENT_DATE, 3)`, [code]);
  await query(
    `INSERT INTO assistant_prefs (user_id, prefs) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs`,
    [owner, JSON.stringify({ avatar: 'pingo', size: 'L', greeted: ['tasks'], colors: { pingo: '#0ea5e9' } })]
  );
  const host = (await query(
    `INSERT INTO remote_hosts (name, address, protocol, port, cred_username, cred_password) VALUES ($1, $2, 'rdp', 3389, 'admin', $3) RETURNING id`,
    [TAG, `pk2-${process.pid}.example.test`, seal('rdp-secret')]
  )).rows[0].id;
  return { code, slug, host, owner };
}

async function unseed() {
  const { query } = ctx.db;
  await query(`DELETE FROM qr_codes WHERE name = $1`, [TAG]).catch(() => {});
  await query(`DELETE FROM remote_hosts WHERE name = $1`, [TAG]).catch(() => {});
}

/** The state a core with them built in left: «bundled» rows, no package migrations recorded. */
async function asBuiltIn() {
  const { query } = ctx.db;
  const { ensurePackageTables } = await import('../platform/packages/store.js');
  await ensurePackageTables();
  await query(`DELETE FROM module_migrations WHERE module_id = ANY($1)`, [IDS]);
  await query(`DELETE FROM module_tables WHERE module_id = ANY($1)`, [IDS]);
  for (const [id, version] of [['qr', '1.0.0'], ['assistant', '1.0.0'], ['remote', '1.3.0']]) {
    await query(
      `INSERT INTO installed_modules (id, version, state, source) VALUES ($1, $2, 'installed', 'bundled')
       ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, state = 'installed', source = 'bundled', error = NULL, manifest = NULL, pending_check = FALSE`,
      [id, version]
    );
  }
}

before(async () => {
  if (!enabled) return;
  ctx = await setup();
  // The built-in schema (what their schema() created on the old core) — present already on a copy of such a database.
  for (const [id, fn] of [['qr', 'ensureQrSchema'], ['assistant', 'ensureAssistantSchema'], ['remote', 'ensureRemoteSchema']]) {
    await (await import(`../modules/${id}/schema.js`))[fn]();
  }
  ctx.saved = await raw();
  ctx.seeded = await seed();
  await asBuiltIn();
});

after(async () => {
  if (!ctx) return;
  await unseed();
  await writeStored(ctx.saved);
  await asBuiltIn().catch(() => {});
  await ctx.db.closePool();
  rmSync(ctx.root, { recursive: true, force: true });
});

test('migration 001 on existing tables changes nothing (structure, counts, checksums) and runs once', { skip, timeout: 120_000 }, async () => {
  const { inlineMigrations, runMigrations } = await import('../platform/packages/migrations.js');
  for (const id of IDS) {
    const module = (await import(`../modules/${id}/index.js`)).default;
    const before = await snapshot(id);
    assert.ok(before.tables.length >= 1 && Object.values(before.data).some((table) => table.n > 0), `${id}: existing data to compare`);
    // As the package installer and the boot run it: one transaction, strict, recorded in module_migrations.
    const first = await runMigrations({ moduleId: id, version: '0.0.0-test', migrations: inlineMigrations(module.migrations), transaction: ctx.db.withTransaction, strict: true });
    assert.deepEqual(first.applied, ['001_init'], id);
    assert.deepEqual(first.tables, [], `${id}: no table created`);
    assert.deepEqual(await snapshot(id), before, `${id}: nothing changed`);
    const second = await runMigrations({ moduleId: id, version: '0.0.0-test', migrations: inlineMigrations(module.migrations), transaction: ctx.db.withTransaction, strict: true });
    assert.deepEqual(second.applied, [], `${id}: 001 runs once`);
    assert.deepEqual(await snapshot(id), before);
  }
  await asBuiltIn();
});

test('upgrade: removed until installed (data and settings kept) → signed packages install over the data → settings back', { skip, timeout: 600_000 }, async () => {
  const { query } = ctx.db;
  const { updateAdminSettings, getSettingsView, invalidateSettings } = await import('../services/settings.js');
  // Settings an administrator had while they were built in.
  const stored = await raw();
  stored.qr = { enabled: true, settings: { ...(stored.qr?.settings || {}), maxCodes: 777, dynamic: true } };
  stored.remote = { enabled: true, settings: { ...(stored.remote?.settings || {}), guacdHost: 'guacd-pk2', guacdPort: 4823, policyAckAt: '2026-10-01T00:00:00.000Z' } };
  stored.assistant = { ...(stored.assistant || {}), settings: { ...(stored.assistant?.settings || {}), avatar: 'pro', choice: 'some', allowed: ['pro', 'pingo'] } };
  delete stored.assistant.enabled; // never switched: on by default, as while built in
  await writeStored(stored);
  const before = Object.fromEntries(await Promise.all(IDS.map(async (id) => [id, await snapshot(id)])));

  // The first boot of the new core: their «bundled» rows become «removed» (the code is gone, the data kept).
  await reboot();
  const rows = Object.fromEntries((await query(`SELECT id, state, source, version FROM installed_modules WHERE id = ANY($1)`, [IDS])).rows.map((row) => [row.id, row]));
  for (const id of IDS) assert.deepEqual([rows[id].state, rows[id].source], ['removed', 'package'], id);
  assert.equal(rows.remote.version, '1.3.0');
  // An edit of other settings meanwhile keeps theirs as they are.
  await updateAdminSettings({ modules: { tasks: { settings: {} } } });
  for (const id of IDS) assert.deepEqual((await raw())[id], stored[id], `${id} settings kept while absent`);

  // Build, sign (throw-away key) and install each package.
  const { buildModule } = await import(pathToFileURL(resolve(here, '../../../scripts/build-module.mjs')).href);
  const { stagePackage, installStaged } = await import('../platform/packages/installer.js');
  for (const id of IDS) {
    const result = await buildModule(id, { keep: true, key: join(ctx.root, 'key.pem'), out: join(ctx.root, 'dist'), 'no-web': process.env.MODULE_BUILD_WEB !== '1', 'no-write': true, trustedKeys: [{ id: ctx.key.keyId, publicKey: ctx.key.publicKey }] });
    const staged = await stagePackage(readFileSync(result.file), { actor: ACTOR });
    assert.deepEqual(staged.problems, [], id);
    assert.equal(staged.preview.signed, true);
    const installed = await installStaged(staged.token, { actor: ACTOR });
    assert.deepEqual(installed.applied, ['001_init'], `${id}: 001 recorded`);
    // Installed over a «removed» row with tables: a backup of them was taken first (migration 001 may touch them).
    if (before[id].tables.length) {
      assert.ok(installed.backup?.file, `${id}: backed up before the install over the removed row`);
      assert.match(installed.backup.file, /-reinstall\./, id);
    }
  }
  const results = await reboot();
  for (const id of IDS) assert.deepEqual(results.filter((item) => item.id === id).map((item) => item.ok), [true], id);
  for (const id of IDS) assert.deepEqual(await snapshot(id), before[id], `${id}: data untouched by the install`);
  for (const id of IDS) assert.deepEqual((await raw())[id], stored[id], `${id}: stored settings untouched`);

  invalidateSettings();
  const view = (await getSettingsView()).modules;
  assert.equal(view.qr.enabled, true);
  assert.equal(view.qr.settings.maxCodes, 777);
  assert.equal(view.remote.settings.guacdHost, 'guacd-pk2');
  assert.equal(view.remote.settings.policyAckAt, '2026-10-01T00:00:00.000Z');
  assert.equal(view.assistant.enabled, true, 'the robot stays on where nobody switched it');
  assert.equal(view.assistant.settings.avatar, 'pro');
  assert.deepEqual(view.assistant.settings.allowed, ['pro', 'pingo']);
  // Their package sanitizers are in place (not the generic one): the policy acknowledgement is a server timestamp.
  const { MODULE_CATALOG } = await import('../modules/catalog.js');
  const remote = MODULE_CATALOG.find((entry) => entry.id === 'remote');
  assert.equal(remote.sanitize(remote.defaults, { policyAckAt: '2000-01-01T00:00:00.000Z' }).policyAckAt, null);
  assert.equal(MODULE_CATALOG.find((entry) => entry.id === 'qr').sanitize({}, { maxCodes: 5 }).maxCodes, 10);
  // The robot: an overlay (not in the apps list), its rules public for every signed-in person.
  const assistant = MODULE_CATALOG.find((entry) => entry.id === 'assistant');
  // (built without the browser part, MODULE_BUILD_WEB unset, a package has no `web` and so no overlay flag)
  if (process.env.MODULE_BUILD_WEB === '1') assert.equal(assistant.overlay, true);
  assert.deepEqual(assistant.publicSettings, ['avatar', 'proactive', 'choice', 'allowed', 'allowColors']);
});

test('QR: anonymous routes of the package are mounted — a dynamic code redirects and counts, off → 404', { skip, timeout: 60_000 }, async () => {
  const { query } = ctx.db;
  const { slug, code } = ctx.seeded;
  const stored = await raw();
  await writeStored({ ...stored, qr: { ...(stored.qr || {}), enabled: true } });
  const scans = async () => (await query(`SELECT scans FROM qr_codes WHERE id = $1`, [code])).rows[0].scans;
  const before = await scans();
  const go = await http(`/api/qr/go/${slug}`, { headers: { 'user-agent': 'Mozilla/5.0 (pk2 test)' } });
  assert.equal(go.status, 302);
  assert.equal(go.location, 'https://www.example.com/pk2');
  assert.equal(await scans(), before + 1, 'the scan is counted');
  assert.equal((await http('/api/qr/go/zzzzzzzz')).status, 404);
  // A private route needs a session.
  assert.equal((await http('/api/app/qr/codes')).status, 401);
  await writeStored({ ...stored, qr: { ...(stored.qr || {}), enabled: false } });
  assert.equal((await http(`/api/qr/go/${slug}`)).status, 404, 'switched off: not there');
  await writeStored(stored);
});

test('Remote: the WebSocket tunnels attach when the package registers; sealed secrets open; the Directory link follows Directory', { skip, timeout: 60_000 }, async () => {
  const { runHttpServerHooks } = await import('../platform/registry.js');
  const { WebSocket } = await import('ws');
  const server = createServer((req, res) => res.writeHead(404).end());
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    // What startModuleServer(server) does once the packages registered (platform/packages/index.js).
    runHttpServerHooks(server);
    const port = server.address().port;
    const closed = await new Promise((done, fail) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/api/app/remote/pvnc?token=forged`);
      let opened = false;
      socket.on('open', () => { opened = true; });
      socket.on('close', (code) => done({ opened, code }));
      socket.on('error', (err) => (opened ? null : fail(err)));
      setTimeout(() => fail(new Error('no answer from the Portal VNC tunnel')), 10_000).unref();
    });
    assert.deepEqual(closed, { opened: true, code: 1008 }, 'the Portal VNC tunnel answers and refuses a forged token');
    const upgrade = (path) => new Promise((done) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
      socket.on('open', () => { done('upgraded'); socket.terminate(); });
      socket.on('unexpected-response', (req, res) => done(`http ${res.statusCode}`));
      socket.on('error', () => done('error'));
      setTimeout(() => done('timeout'), 10_000).unref();
    });
    // Both tunnels on one server (one upgrade listener, upgrade.js): the guacd tunnel is reached too,
    // a forged token is refused before guacamole-lite sees it, a token of the portal is upgraded.
    assert.equal(await upgrade('/api/app/remote/tunnel?token=forged'), 'http 401');
    const { buildToken } = await import('../modules/remote/tunnel.js');
    const token = buildToken({ type: 'rdp', settings: { hostname: '127.0.0.1', port: '1' } });
    assert.equal(await upgrade(`/api/app/remote/tunnel?token=${encodeURIComponent(token)}`), 'upgraded', 'the guacd tunnel handles the upgrade');
    const other = await new Promise((done) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/api/app/nothing-here`);
      socket.on('open', () => done('upgraded'));
      socket.on('unexpected-response', () => done('refused'));
      socket.on('error', () => done('refused'));
      setTimeout(() => done('timeout'), 5_000).unref();
    });
    assert.equal(other, 'refused');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
  // A password sealed while Remote was built in opens through the SDK the package uses.
  const { unseal } = await import('../platform/sdk/server.js');
  const sealed = (await ctx.db.query(`SELECT cred_password FROM remote_hosts WHERE id = $1`, [ctx.seeded.host])).rows[0].cred_password;
  assert.equal(unseal(sealed), 'rdp-secret');

  // enhances: directory — the link is active only while Directory is on (Settings → Modules).
  const { modulesPayload } = await import('../routes/platform.routes.js');
  const { getSettings, parseSettings } = await import('../services/settings.js');
  const stored = await raw();
  const link = async (on) => {
    await writeStored({ ...stored, directory: { ...(stored.directory || {}), enabled: on }, remote: { ...(stored.remote || {}), enabled: true } });
    const payload = modulesPayload(parseSettings(await getSettings()));
    const remote = payload.modules.find((module) => module.id === 'remote');
    const directory = payload.modules.find((module) => module.id === 'directory');
    return { active: remote.enhances.find((item) => item.id === 'directory').active, enhancedBy: directory.enhancedBy.map((item) => item.id) };
  };
  assert.deepEqual(await link(true), { active: true, enhancedBy: ['remote'] });
  assert.deepEqual(await link(false), { active: false, enhancedBy: ['remote'] });
  await writeStored(stored);
});
