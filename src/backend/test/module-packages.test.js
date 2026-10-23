import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { DEFAULT_LIMITS, ZipError, checkEntryName, readZip, writeZip } from '../platform/packages/zip.js';
import { canonicalListing, generateSigningKey, keyIdOf, signFiles, verifyFiles } from '../platform/packages/signature.js';
import { normalizeManifest, genericSanitizer, platformCatalogEntry, platformManifestEntry } from '../platform/packages/manifestFile.js';
import { BAD_PACKAGE, checkCore, checkInstall, checkUninstall } from '../platform/packages/checks.js';
import { PackageError, openPackage, unpackPackage } from '../platform/packages/archive.js';
import { compare, satisfies, short, bump } from '../platform/packages/version.js';
import { inlineMigrations, mergeMigrations, packageMigrations, runMigrations } from '../platform/packages/migrations.js';
import { activePackages, readPointer, resetDiskScan, scanDisk, writePointer } from '../platform/packages/disk.js';
import { corePathAllowed, installSdkResolver, mapSpecifier } from '../platform/sdkLoader.mjs';
import { canonicalJson, validateUpdatesAnswer } from '../platform/packages/inventory.js';
import { moduleAssets } from '../platform/packages/index.js';
import { importServerEntry, requirementOrder } from '../platform/packages/loader.js';

/*
 * Module packages (docs/module-packages.md): zip reader/writer and hostile
 * archives, signatures, manifest.json, the install checks with the exact
 * messages of spec §5, the migrations runner, the @portal/sdk resolver, the
 * disk scan and static serving. No database (module-packages.db.test.js has
 * the install / update / rollback / remove flows).
 */

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '../test-fixtures/module-hello');
const temp = () => mkdtempSync(join(tmpdir(), 'portal-pkg-test-'));
const file = (name, text) => ({ name, data: Buffer.from(text) });

// ── zip ─────────────────────────────────────────────────────────────────────

test('zip: round trip of stored and deflated entries, UTF-8 names, empty files', () => {
  const big = 'portal '.repeat(5000);
  const entries = [file('a.txt', 'hello'), file('dir/b.json', big), file('пакет/файл.md', 'привет'), file('empty', '')];
  const zip = writeZip(entries);
  const back = readZip(zip);
  assert.deepEqual(back.map((item) => item.name), entries.map((item) => item.name));
  for (let i = 0; i < entries.length; i += 1) assert.equal(back[i].data.toString(), entries[i].data.toString());
  assert.ok(zip.length < big.length, 'large text is deflated');
  // Stored only, and the same input gives the same bytes (reproducible packages).
  const stored = writeZip(entries, { deflate: false });
  assert.equal(readZip(stored)[1].data.toString(), big);
  assert.deepEqual(writeZip(entries), zip);
});

/** Replaces every occurrence of `from` by `to` (same length) in a buffer. */
function patch(buffer, from, to) {
  assert.equal(Buffer.byteLength(from), Buffer.byteLength(to));
  const out = Buffer.from(buffer);
  const needle = Buffer.from(from);
  let at = out.indexOf(needle);
  assert.ok(at >= 0, `${from} not found`);
  while (at >= 0) {
    Buffer.from(to).copy(out, at);
    at = out.indexOf(needle, at + 1);
  }
  return out;
}

const centralOffset = (zip) => zip.readUInt32LE(zip.length - 22 + 16);

test('zip: path traversal and unsafe names are refused (zip-slip)', () => {
  for (const name of ['../evil.js', '/etc/passwd', 'a/../../b', 'C:/x', 'a\\b', 'a//b', './a', 'a\u0000b']) {
    assert.throws(() => checkEntryName(name), ZipError, name);
  }
  const base = writeZip([file('xx/evil.js', 'boom')]);
  assert.throws(() => readZip(patch(base, 'xx/evil.js', '../evil.js')), /unsafe entry name/);
  assert.throws(() => readZip(patch(base, 'xx/evil.js', '/x/evil.js')), /absolute entry name/);
});

test('zip: symbolic links and special files are refused', () => {
  const zip = writeZip([file('link', '/etc/passwd')]);
  const cd = centralOffset(zip);
  const link = Buffer.from(zip);
  link.writeUInt32LE((0o120777 << 16) >>> 0, cd + 38);
  assert.throws(() => readZip(link), (err) => err.code === 'ZIP_SYMLINK');
  const fifo = Buffer.from(zip);
  fifo.writeUInt32LE((0o010644 << 16) >>> 0, cd + 38);
  assert.throws(() => readZip(fifo), (err) => err.code === 'ZIP_SYMLINK');
});

test('zip: duplicate entries are refused (also by letter case and file/folder clashes)', () => {
  const zip = writeZip([file('a.txt', '1'), file('b.txt', '2')]);
  assert.throws(() => readZip(patch(zip, 'b.txt', 'a.txt')), (err) => err.code === 'ZIP_DUPLICATE');
  assert.throws(() => readZip(patch(zip, 'b.txt', 'A.txt')), (err) => err.code === 'ZIP_DUPLICATE');
  const nested = writeZip([file('a', '1'), file('b/c', '2')]);
  assert.throws(() => readZip(patch(nested, 'b/c', 'a/c')), (err) => err.code === 'ZIP_DUPLICATE');
  assert.throws(() => writeZip([file('x', '1'), file('X', '2')]), (err) => err.code === 'ZIP_DUPLICATE');
});

test('zip: too many files, too large, bombs and CRC errors are refused', () => {
  const many = writeZip(Array.from({ length: 12 }, (_, i) => file(`f${i}`, 'x')));
  assert.throws(() => readZip(many, { maxFiles: 10 }), (err) => err.code === 'ZIP_TOO_MANY');
  assert.equal(readZip(many, { maxFiles: 12 }).length, 12);
  const big = writeZip([file('big', 'z'.repeat(100000))]);
  assert.throws(() => readZip(big, { maxEntryBytes: 1000 }), (err) => err.code === 'ZIP_TOO_LARGE');
  assert.throws(() => readZip(big, { maxTotalBytes: 1000 }), (err) => err.code === 'ZIP_TOO_LARGE');
  // A bomb: the directory says 10 bytes, the data inflates to 100 000.
  const cd = centralOffset(big);
  const bomb = Buffer.from(big);
  bomb.writeUInt32LE(10, cd + 24);
  bomb.writeUInt32LE(10, 22);
  assert.throws(() => readZip(bomb), /larger than declared|size mismatch/);
  const crc = Buffer.from(writeZip([file('a', 'hello')], { deflate: false }));
  crc[30 + 1] ^= 0xff; // first byte of the data ("hello")
  assert.throws(() => readZip(crc), /CRC mismatch/);
  const encrypted = Buffer.from(writeZip([file('a', 'hello')]));
  encrypted.writeUInt16LE(0x0801, centralOffset(encrypted) + 8);
  assert.throws(() => readZip(encrypted), /encrypted/);
  assert.throws(() => readZip(Buffer.from('not a zip at all, sorry')), /not a zip/);
  assert.ok(DEFAULT_LIMITS.maxFiles > 0);
});

test('zip: ZIP64 archives and entries are refused', () => {
  const zip = writeZip([file('a', 'hello')]);
  const eocd = zip.length - 22;
  const offsets = Buffer.from(zip);
  offsets.writeUInt32LE(0xffffffff, eocd + 16);
  assert.throws(() => readZip(offsets), (err) => err.code === 'ZIP64');
  // An EOCD64 locator in front of the end record.
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  const withLocator = Buffer.concat([zip.subarray(0, eocd), locator, zip.subarray(eocd)]);
  assert.throws(() => readZip(withLocator), (err) => err.code === 'ZIP64');
  // A ZIP64 extra field on an entry.
  const cd = centralOffset(zip);
  const entry = Buffer.from(zip);
  entry.writeUInt32LE(0xffffffff, cd + 20);
  assert.throws(() => readZip(entry), (err) => err.code === 'ZIP64');
});

// ── signatures ──────────────────────────────────────────────────────────────

test('signature: sign, verify, tamper, unknown key, unsigned only in development mode', () => {
  const key = generateSigningKey();
  const other = generateSigningKey();
  assert.match(key.keyId, /^[a-f0-9]{16}$/);
  assert.equal(keyIdOf(key.publicKey), key.keyId);
  const trustedKeys = [{ id: key.keyId, publicKey: key.publicKey }];
  const files = [file('manifest.json', '{}'), file('server/index.js', 'export default {}')];
  const signed = [...files, { name: 'SIGNATURE', data: signFiles(files, key.privateKey) }];
  assert.deepEqual(verifyFiles(signed, { trustedKeys }), { ok: true, signed: true, keyId: key.keyId });
  // Order of files does not matter; the listing is canonical.
  assert.equal(canonicalListing([...files].reverse()), canonicalListing(files));
  assert.match(canonicalListing(files), /^[a-f0-9]{64} {2}manifest\.json\n[a-f0-9]{64} {2}server\/index\.js\n$/);
  const tampered = signed.map((item) => (item.name === 'server/index.js' ? file(item.name, 'export default { evil: true }') : item));
  assert.equal(verifyFiles(tampered, { trustedKeys }).ok, false);
  const added = [...signed, file('web/extra.js', 'x')];
  assert.equal(verifyFiles(added, { trustedKeys }).ok, false);
  assert.equal(verifyFiles(signed, { trustedKeys: [{ id: other.keyId, publicKey: other.publicKey }] }).ok, false);
  assert.deepEqual(verifyFiles(files, { trustedKeys }), { ok: false, reason: 'unsigned' });
  assert.deepEqual(verifyFiles(files, { trustedKeys, allowUnsigned: true }), { ok: true, signed: false });
  // A wrong SIGNATURE is refused even when unsigned packages are allowed.
  assert.equal(verifyFiles(tampered, { trustedKeys, allowUnsigned: true }).ok, false);
  assert.equal(verifyFiles([...files, file('SIGNATURE', 'garbage')], { trustedKeys, allowUnsigned: true }).ok, false);
});

// ── manifest.json ───────────────────────────────────────────────────────────

const MANIFEST = {
  id: 'masterplan',
  name: { ru: 'Мастерплан', en: 'Masterplan' },
  version: '1.2.0',
  core: '1.6.0',
  requires: [{ id: 'crm', version: '1.1.0' }],
  enhances: ['contracts', 'procurement', 'warehouse'],
  category: 'construction',
  permissions: ['masterplan.admin', 'masterplan.sales'],
};

test('manifest.json: the spec example is valid and gets defaults', () => {
  const { manifest, problems } = normalizeManifest(MANIFEST, { categories: ['construction'] });
  assert.deepEqual(problems, []);
  assert.equal(manifest.requires[0].reason.ru, 'Обязательный модуль');
  assert.deepEqual(manifest.enhances.map((link) => link.id), ['contracts', 'procurement', 'warehouse']);
  assert.equal(manifest.changelog[0].version, '1.2.0');
  assert.equal(manifest.settings.defaultEnabled, false);
  const entry = platformManifestEntry(manifest);
  assert.equal(entry.minCore, '1.6.0');
  assert.equal(platformCatalogEntry(manifest).permissions.length, 2);
});

test('manifest.json: bad fields are reported', () => {
  const { problems } = normalizeManifest({ ...MANIFEST, id: 'Bad-Id', version: '1.2', core: 'x', category: 'nope', permissions: ['crm.admin'], requires: [{ id: 'crm', version: 'one' }], tables: ['bad table'], web: { entry: '../x.js' } }, { categories: ['construction'] });
  for (const part of ['id "Bad-Id"', 'version "1.2"', 'core "x"', 'unknown category', 'must start with', 'requires crm: version', 'table "bad table"', 'web.entry']) {
    assert.ok(problems.some((text) => text.includes(part)), `${part}: ${problems.join(' | ')}`);
  }
  assert.deepEqual(normalizeManifest(null).problems, ['manifest.json must be an object']);
});

test('generic settings sanitizer keeps known keys of the same type', () => {
  const sanitize = genericSanitizer({ greeting: 'Hi', limit: 5, list: [], flags: { a: true } });
  assert.deepEqual(sanitize({ greeting: 'Hi', limit: 5 }, { greeting: 'Hello', limit: '7', list: [1], flags: [], extra: 1 }), { greeting: 'Hello', limit: 5, list: [1] });
});

// ── checks (spec §5): exact messages ────────────────────────────────────────

const installedOf = (...entries) => new Map(entries.map((entry) => [entry.id, { source: 'package', requires: [], ...entry }]));

test('spec §5: «Файл повреждён или выпущен не нами»', () => {
  assert.equal(BAD_PACKAGE.message.ru, 'Файл повреждён или выпущен не нами');
  assert.throws(() => openPackage(Buffer.from('garbage')), (err) => err instanceof PackageError && err.problem.message.ru === 'Файл повреждён или выпущен не нами' && err.problem.message.en === 'The file is damaged or was not issued by us');
});

test('spec §5: core version — «Нужно ядро 1.6.0 или новее, у вас 1.5.1»', () => {
  assert.equal(checkCore('1.6.0', '1.5.1').message.ru, 'Нужно ядро 1.6.0 или новее, у вас 1.5.1');
  assert.equal(checkCore('1.6.0', '1.5.1').message.en, 'Core 1.6.0 or newer is required, you have 1.5.1');
  assert.equal(checkCore('1.6.0', '1.6.0'), null);
  assert.equal(checkCore('1.6.0', '1.9.3'), null);
  // A new first number is incompatible.
  assert.equal(checkCore('1.6.0', '2.0.0').code, 'CORE_MAJOR');
  const { problems } = checkInstall({ ...MANIFEST, requires: [] }, { installed: installedOf(), coreVersion: '1.5.1' });
  assert.deepEqual(problems.map((item) => item.message.ru), ['Нужно ядро 1.6.0 или новее, у вас 1.5.1']);
});

test('spec §5: required module missing — «Нужен модуль „CRM“ версии 1.1.0 или новее — он не установлен»', () => {
  const manifest = normalizeManifest({ ...MANIFEST, requires: [{ id: 'crm', version: '1.1.0', name: { ru: 'CRM', en: 'CRM' } }] }).manifest;
  const { problems } = checkInstall(manifest, { installed: installedOf(), coreVersion: '1.6.0' });
  assert.deepEqual(problems.map((item) => item.message.ru), ['Нужен модуль „CRM“ версии 1.1.0 или новее — он не установлен']);
  assert.equal(problems[0].message.en, 'Module “CRM” version 1.1.0 or newer is required — it is not installed');
});

test('spec §5: required module too old — «Нужен модуль „CRM“ 1.1.0 или новее, у вас 1.0.0»', () => {
  const crm = { id: 'crm', version: '1.0.0', name: { ru: 'CRM', en: 'CRM' }, source: 'bundled' };
  const { problems } = checkInstall(MANIFEST, { installed: installedOf(crm), coreVersion: '1.6.0' });
  assert.deepEqual(problems.map((item) => item.message.ru), ['Нужен модуль „CRM“ 1.1.0 или новее, у вас 1.0.0']);
  assert.equal(checkInstall(MANIFEST, { installed: installedOf({ ...crm, version: '1.4.2' }), coreVersion: '1.6.0' }).problems.length, 0);
  assert.equal(checkInstall(MANIFEST, { installed: installedOf({ ...crm, version: '2.0.0' }), coreVersion: '1.6.0' }).problems[0].code, 'REQUIRES_MAJOR');
});

test('spec §5: no downgrade — «Установлена 1.3.0, в файле 1.2.0 — понижение запрещено»', () => {
  const crm = { id: 'crm', version: '1.1.0', name: { ru: 'CRM', en: 'CRM' }, source: 'bundled' };
  const current = { id: 'masterplan', version: '1.3.0', name: MANIFEST.name };
  const result = checkInstall(MANIFEST, { installed: installedOf(crm, current), coreVersion: '1.6.0' });
  assert.equal(result.action, 'update');
  assert.deepEqual(result.problems.map((item) => item.message.ru), ['Установлена 1.3.0, в файле 1.2.0 — понижение запрещено']);
  assert.equal(checkInstall(MANIFEST, { installed: installedOf(crm, { ...current, version: '1.2.0' }), coreVersion: '1.6.0' }).problems[0].code, 'SAME_VERSION');
  assert.equal(checkInstall(MANIFEST, { installed: installedOf(crm, { ...current, version: '1.1.9' }), coreVersion: '1.6.0' }).problems.length, 0);
});

test('spec §5: an update does not break dependents — «„Склад“ 1.4 работает с „Закупками“ 1.x, а в файле 2.0 — сначала обновите „Склад“»', () => {
  const procurement = normalizeManifest({ id: 'procurement', name: { ru: 'Закупки', en: 'Procurement' }, version: '2.0.0', core: '1.6.0', category: 'supply', permissions: [] }).manifest;
  const installed = installedOf({ id: 'procurement', version: '1.5.0', name: procurement.name }, { id: 'warehouse', version: '1.4.0', name: { ru: 'Склад', en: 'Warehouse' }, requires: [{ id: 'procurement', version: '1.2.0' }] });
  const { problems } = checkInstall(procurement, { installed, coreVersion: '1.6.0' });
  assert.deepEqual(problems.map((item) => item.message.ru), ['„Склад“ 1.4 работает с „Закупками“ 1.x, а в файле 2.0 — сначала обновите „Склад“']);
  assert.equal(problems[0].message.en, '“Warehouse” 1.4 works with “Procurement” 1.x, but the file has 2.0 — update “Warehouse” first');
  // A minor update keeps the dependent working.
  assert.deepEqual(checkInstall({ ...procurement, version: '1.6.0' }, { installed, coreVersion: '1.6.0' }).problems, []);
});

test('spec §5: removal while others depend — «Сначала удалите „Склад“ — он использует „Закупки“»', () => {
  const installed = installedOf({ id: 'procurement', version: '1.5.0', name: { ru: 'Закупки', en: 'Procurement' } }, { id: 'warehouse', version: '1.4.0', name: { ru: 'Склад', en: 'Warehouse' }, requires: [{ id: 'procurement', version: '1.2.0' }] });
  const problems = checkUninstall('procurement', { installed });
  assert.deepEqual(problems.map((item) => item.message.ru), ['Сначала удалите „Склад“ — он использует „Закупки“']);
  assert.equal(problems[0].message.en, 'Remove “Warehouse” first — it uses “Procurement”');
  assert.deepEqual(checkUninstall('warehouse', { installed }), []);
  assert.equal(checkUninstall('crm', { installed })[0].code, 'NOT_INSTALLED');
  const two = new Map([...installed, ['contracts', { id: 'contracts', version: '1.0.0', source: 'package', name: { ru: 'Договоры', en: 'Contracts' }, requires: [{ id: 'procurement' }] }]]);
  assert.match(checkUninstall('procurement', { installed: two })[0].message.ru, /^Сначала удалите „Склад“, „Договоры“ — они используют „Закупки“$/);
  assert.equal(checkUninstall('crm', { installed: installedOf({ id: 'crm', version: '1.0.0', source: 'bundled' }) })[0].code, 'BUILTIN_REMOVE');
});

test('a module built into the core cannot be installed from a file', () => {
  const { problems } = checkInstall({ ...MANIFEST, requires: [] }, { installed: installedOf({ id: 'masterplan', version: '1.0.0', source: 'bundled', name: MANIFEST.name }), coreVersion: '1.6.0' });
  assert.equal(problems[0].code, 'BUILTIN');
});

test('versions: «X or newer, same first number»', () => {
  assert.equal(compare('1.10.0', '1.9.9'), 1);
  assert.ok(satisfies('1.4.0', '1.2.0'));
  assert.ok(!satisfies('2.0.0', '1.2.0'));
  assert.ok(!satisfies('1.1.0', '1.2.0'));
  assert.equal(short('1.4.2'), '1.4');
  assert.equal(bump('1.4.2', 'minor'), '1.5.0');
});

// ── package layout ──────────────────────────────────────────────────────────

function helloFiles(overrides = {}) {
  const manifest = JSON.parse(readFileSync(join(FIXTURE, 'module.json'), 'utf8'));
  const files = [
    file('manifest.json', JSON.stringify({ ...manifest, server: { entry: 'server/index.js' }, web: undefined, ...overrides })),
    file('server/index.js', "export default { id: 'hello', routes() { return (req, res, next) => next(); } };"),
    file('migrations/001_init.sql', 'SELECT 1;'),
  ];
  return files;
}

test('package: layout of spec §4 is enforced', () => {
  const ok = openPackage(writeZip(helloFiles()), { allowUnsigned: true });
  assert.equal(ok.manifest.id, 'hello');
  assert.equal(ok.signed, false);
  assert.throws(() => openPackage(writeZip(helloFiles()), { allowUnsigned: false, trustedKeys: [] }), /damaged/);
  for (const extra of [file('evil.sh', 'rm -rf /'), file('migrations/1_bad.sql', 'x'), file('migrations/sub/001_x.sql', 'x'), file('node_modules/x/index.js', 'x')]) {
    assert.throws(() => openPackage(writeZip([...helloFiles(), extra]), { allowUnsigned: true }), (err) => err.problem?.code === 'BAD_PACKAGE', extra.name);
  }
  assert.throws(() => openPackage(writeZip(helloFiles().filter((item) => item.name !== 'server/index.js')), { allowUnsigned: true }), /damaged/);
  assert.throws(() => openPackage(writeZip([...helloFiles(), file('migrations/001_other.sql', 'x')]), { allowUnsigned: true }), (err) => /two migrations/.test(err.problem.params.reason));
  assert.throws(() => openPackage(writeZip([file('manifest.json', '{ broken')]), { allowUnsigned: true }), (err) => /not valid JSON/.test(err.problem.params.reason));
});

test('package: unpacking writes into MODULES_DIR/<id>/<version> only', () => {
  const dir = temp();
  process.env.MODULES_DIR = dir;
  try {
    const opened = openPackage(writeZip(helloFiles()), { allowUnsigned: true });
    const target = unpackPackage(opened);
    assert.equal(target, join(dir, 'hello', '1.0.0'));
    assert.equal(readFileSync(join(target, 'migrations/001_init.sql'), 'utf8'), 'SELECT 1;');
  } finally {
    delete process.env.MODULES_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── migrations ──────────────────────────────────────────────────────────────

/** A fake transaction: records queries, keeps module_migrations and a list of tables. */
function fakeDb() {
  const state = { applied: new Map(), tables: new Set(['users']), recorded: [], queries: [], commits: 0, rollbacks: 0 };
  const client = {
    async query(text, params = []) {
      state.queries.push(text);
      if (/FROM module_migrations/.test(text)) return { rows: [...(state.applied.get(params[0]) || [])].map((id) => ({ migration_id: id })) };
      if (/FROM pg_tables/.test(text)) return { rows: [...state.tables].map((tablename) => ({ tablename })) };
      if (/INSERT INTO module_migrations/.test(text)) {
        state.pendingApplied.push([params[0], params[1]]);
        return { rows: [] };
      }
      if (/INSERT INTO module_tables/.test(text)) {
        state.recorded.push(params[1]);
        return { rows: [] };
      }
      const created = text.match(/CREATE TABLE (\w+)/);
      if (created) state.tables.add(created[1]);
      if (/FAIL/.test(text)) throw new Error('syntax error');
      return { rows: [] };
    },
  };
  const transaction = async (fn) => {
    state.pendingApplied = [];
    const before = new Set(state.tables);
    try {
      const result = await fn(client);
      for (const [module, id] of state.pendingApplied) state.applied.set(module, new Set([...(state.applied.get(module) || []), id]));
      state.commits += 1;
      return result;
    } catch (err) {
      state.tables = before;
      state.rollbacks += 1;
      throw err;
    }
  };
  return { state, transaction };
}

test('migrations: NNN files in order, each once, tables recorded, one transaction', async () => {
  const dir = temp();
  try {
    mkdirSync(join(dir, 'migrations'));
    writeFileSync(join(dir, 'migrations/002_more.sql'), 'CREATE TABLE hello_more (id int);');
    writeFileSync(join(dir, 'migrations/001_init.sql'), 'CREATE TABLE hello_messages (id int);');
    writeFileSync(join(dir, 'migrations/003_js.js'), 'export async function up(db) { await db.query("CREATE TABLE hello_js (id int)"); }');
    writeFileSync(join(dir, 'migrations/readme.txt'), 'ignored');
    const list = packageMigrations(dir);
    assert.deepEqual(list.map((item) => item.id), ['001_init', '002_more', '003_js']);
    const { state, transaction } = fakeDb();
    const first = await runMigrations({ moduleId: 'hello', version: '1.0.0', migrations: list, transaction });
    assert.deepEqual(first.applied, ['001_init', '002_more', '003_js']);
    assert.deepEqual(first.tables.sort(), ['hello_js', 'hello_messages', 'hello_more']);
    assert.deepEqual(state.recorded.sort(), ['hello_js', 'hello_messages', 'hello_more']);
    const again = await runMigrations({ moduleId: 'hello', version: '1.0.0', migrations: list, transaction });
    assert.deepEqual(again.applied, []);
    assert.equal(state.commits, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrations: a failure rolls back the whole batch and names the migration', async () => {
  const { state, transaction } = fakeDb();
  const migrations = inlineMigrations([
    { id: '001_init', sql: 'CREATE TABLE t1 (id int)' },
    { id: '002_bad', up: (db) => db.query('FAIL here') },
  ]);
  await assert.rejects(runMigrations({ moduleId: 'x', version: '1.0.0', migrations, transaction }), (err) => err.migration === '002_bad' && /x\/002_bad failed/.test(err.message));
  assert.equal(state.rollbacks, 1);
  assert.equal(state.applied.size, 0);
  assert.ok(!state.tables.has('t1'));
});

test('migrations: ids are checked and merged', () => {
  assert.throws(() => inlineMigrations([{ id: 'init', up() {} }]), /001_name/);
  assert.throws(() => inlineMigrations([{ id: '001_x' }]), /needs up/);
  assert.throws(() => mergeMigrations([{ id: '001_a' }], [{ id: '001_a' }]), /defined twice/);
  assert.throws(() => mergeMigrations([{ id: '001_a' }], [{ id: '001_b' }]), /share the number/);
  assert.deepEqual(mergeMigrations([{ id: '002_b' }], [{ id: '001_a' }]).map((item) => item.id), ['001_a', '002_b']);
});

// ── @portal/sdk resolver ────────────────────────────────────────────────────

test('sdk resolver: @portal/sdk, core paths, module internals refused, bare names from packages', () => {
  assert.match(mapSpecifier('@portal/sdk', 'file:///tmp/x.js').url, /platform\/sdk\/server\.js$/);
  assert.match(mapSpecifier('@portal/sdk/core/config/database.js', 'file:///tmp/x.js').url, /src\/backend\/config\/database\.js$/);
  assert.ok(corePathAllowed('services/settings.js'));
  assert.ok(corePathAllowed('modules/crm/api.js'));
  assert.ok(corePathAllowed('modules/shared/acl.js'));
  assert.ok(corePathAllowed('modules/catalog.js'));
  assert.ok(!corePathAllowed('modules/crm/service.js'));
  assert.ok(!corePathAllowed('../etc/passwd.js'));
  assert.ok(!corePathAllowed('test/x.test.js'));
  assert.throws(() => mapSpecifier('@portal/sdk/core/modules/crm/service.js', 'file:///tmp/x.js'), (err) => err.code === 'ERR_PORTAL_SDK_PATH');
  assert.throws(() => mapSpecifier('@portal/sdk/other', 'file:///tmp/x.js'), (err) => err.code === 'ERR_PORTAL_SDK_PATH');
  assert.match(mapSpecifier('express', 'file:///data/modules/hello/1.0.0/server/index.js').parentURL, /src\/backend\/package\.json$/);
  assert.equal(mapSpecifier('express', pathToFileURL(join(here, '../server.js')).href), null);
  assert.equal(mapSpecifier('./x.js', 'file:///tmp/a.js'), null);
  assert.equal(mapSpecifier('node:fs', 'file:///tmp/a.js'), null);
});

test('sdk resolver: package code outside the tree loads @portal/sdk and the core’s dependencies', async () => {
  const dir = temp();
  try {
    installSdkResolver();
    writeFileSync(join(dir, 'index.js'), "import { Router } from 'express';\nimport { httpError, query } from '@portal/sdk';\nexport default { id: 'probe', ok: typeof Router === 'function' && typeof query === 'function', err: httpError(409, 'x', 'X').statusCode };\n");
    const mod = await import(pathToFileURL(join(dir, 'index.js')).href);
    assert.deepEqual({ ok: mod.default.ok, err: mod.default.err }, { ok: true, err: 409 });
    writeFileSync(join(dir, 'bad.js'), "import '@portal/sdk/core/modules/crm/service.js';\nexport default {};\n");
    await assert.rejects(import(pathToFileURL(join(dir, 'bad.js')).href), /not part of the portal SDK/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── disk scan and the loader's contract checks ─────────────────────────────

function writeVersion(root, id, version, manifest, serverCode) {
  const dir = join(root, id, version);
  mkdirSync(join(dir, 'server'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ name: { en: id, ru: id }, core: '1.0.0', category: 'work', permissions: [], ...manifest, id, version, server: { entry: 'server/index.js' } }));
  if (serverCode) writeFileSync(join(dir, 'server/index.js'), serverCode);
  return dir;
}

test('disk scan: active packages by pointer; broken and clashing ones are skipped with a reason', () => {
  const root = temp();
  process.env.MODULES_DIR = root;
  resetDiskScan();
  try {
    writeVersion(root, 'hello', '1.0.0', {}, 'export default { id: "hello" };');
    writePointer('hello', 'current', '1.0.0');
    assert.equal(readPointer('hello'), '1.0.0');
    mkdirSync(join(root, 'broken', '1.0.0'), { recursive: true });
    writeFileSync(join(root, 'broken', '1.0.0', 'manifest.json'), '{ not json');
    writePointer('broken', 'current', '1.0.0');
    writeVersion(root, 'liar', '2.0.0', { version: '2.0.0' });
    writeFileSync(join(root, 'liar', '2.0.0', 'manifest.json'), JSON.stringify({ id: 'other', name: { en: 'x', ru: 'x' }, version: '2.0.0', core: '1.0.0', category: 'work' }));
    writePointer('liar', 'current', '2.0.0');
    writeVersion(root, 'crm', '9.0.0', {});
    writePointer('crm', 'current', '9.0.0');
    mkdirSync(join(root, 'nopointer', '1.0.0'), { recursive: true });
    mkdirSync(join(root, '.staging'), { recursive: true });
    const { packages, problems } = scanDisk();
    assert.deepEqual(packages.map((pkg) => pkg.id).sort(), ['crm', 'hello']);
    assert.ok(problems.get('broken'));
    assert.match(problems.get('liar'), /names "other"/);
    assert.deepEqual(activePackages(['crm']).map((pkg) => pkg.id), ['hello']);
    assert.match(scanDisk().problems.get('crm'), /built into this core/);
  } finally {
    delete process.env.MODULES_DIR;
    resetDiskScan();
    rmSync(root, { recursive: true, force: true });
  }
});

test('loader: a package whose code does not load is refused with the reason; requirement order', async () => {
  const root = temp();
  try {
    const good = writeVersion(root, 'okmod', '1.0.0', {}, "import { query } from '@portal/sdk';\nexport default { id: 'okmod', api: { q: typeof query } };\n");
    const manifest = JSON.parse(readFileSync(join(good, 'manifest.json'), 'utf8'));
    const { manifest: normalized } = normalizeManifest(manifest);
    const mod = await importServerEntry(good, normalized);
    assert.equal(mod.api.q, 'function');
    const broken = writeVersion(root, 'boom', '1.0.0', {}, "throw new Error('broken at import');\n");
    await assert.rejects(importServerEntry(broken, normalizeManifest(JSON.parse(readFileSync(join(broken, 'manifest.json'), 'utf8'))).manifest), /broken at import/);
    const wrongId = writeVersion(root, 'wrong', '1.0.0', {}, "export default { id: 'other' };\n");
    await assert.rejects(importServerEntry(wrongId, normalizeManifest(JSON.parse(readFileSync(join(wrongId, 'manifest.json'), 'utf8'))).manifest), /exports id "other"/);
    const order = requirementOrder([
      { id: 'warehouse', manifest: { requires: [{ id: 'procurement' }] } },
      { id: 'procurement', manifest: { requires: [] } },
      { id: 'masterplan', manifest: { requires: [{ id: 'warehouse' }] } },
    ]);
    assert.deepEqual(order.map((pkg) => pkg.id), ['procurement', 'warehouse', 'masterplan']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── static serving ──────────────────────────────────────────────────────────

test('static: /modules/<id>/<version>/web/* with immutable caching, JS MIME, nothing else', async () => {
  const root = temp();
  process.env.MODULES_DIR = root;
  const app = express();
  app.use('/modules', moduleAssets());
  const server = createServer(app);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    mkdirSync(join(root, 'hello/1.0.0/web/chunks'), { recursive: true });
    writeFileSync(join(root, 'hello/1.0.0/web/index.js'), 'export default {};');
    writeFileSync(join(root, 'hello/1.0.0/web/chunks/a.mjs'), 'export {};');
    writeFileSync(join(root, 'hello/1.0.0/manifest.json'), '{}');
    mkdirSync(join(root, '.backups/hello'), { recursive: true });
    writeFileSync(join(root, '.backups/hello/x.json'), '{"secret":1}');
    const ok = await fetch(`${base}/modules/hello/1.0.0/web/index.js`);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /^text\/javascript/);
    assert.match(ok.headers.get('cache-control'), /immutable/);
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
    assert.match((await fetch(`${base}/modules/hello/1.0.0/web/chunks/a.mjs`)).headers.get('content-type'), /^text\/javascript/);
    for (const path of ['/modules/hello/1.0.0/manifest.json', '/modules/.backups/hello/x.json', '/modules/hello/1.0.0/web/../manifest.json', '/modules/hello/1.0.0/web/%2e%2e/manifest.json', '/modules/hello/1.0.0/web/missing.js', '/modules/hello/latest/web/index.js']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
  } finally {
    server.close();
    delete process.env.MODULES_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});

// ── store preparation ───────────────────────────────────────────────────────

test('inventory: canonical JSON and the «updates available» answer format', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: null }] }), '{"a":[{"c":null,"d":2}],"b":1}');
  assert.deepEqual(validateUpdatesAnswer({ format: 'portal-updates/1', updates: [{ id: 'masterplan', latest: '1.3.0', download: { url: 'https://store.example/m.zip', sha256: 'a'.repeat(64) } }] }), []);
  assert.ok(validateUpdatesAnswer({ format: 'x', updates: [{ id: 'm', latest: '1', download: { url: 'http://insecure' } }] }).length >= 2);
});

// ── build script (server part; the browser part needs vite: MODULE_BUILD_WEB=1) ──

test('build-module: the hello fixture builds into a valid signed package', { timeout: 180_000 }, async () => {
  const out = temp();
  const keyDir = temp();
  try {
    const key = generateSigningKey();
    writeFileSync(join(keyDir, 'key.pem'), key.privateKey);
    const { buildModule } = await import(pathToFileURL(resolve(here, '../../../scripts/build-module.mjs')).href);
    const trustedKeys = [{ id: key.keyId, publicKey: key.publicKey }];
    const result = await buildModule(undefined, { source: FIXTURE, keep: true, key: join(keyDir, 'key.pem'), out, 'no-web': process.env.MODULE_BUILD_WEB !== '1', 'no-write': true, trustedKeys });
    assert.equal(result.version, '1.0.0');
    assert.equal(result.keyId, key.keyId);
    const opened = openPackage(readFileSync(result.file), { trustedKeys });
    assert.equal(opened.signed, true);
    const names = opened.files.map((item) => item.name);
    for (const name of ['manifest.json', 'SIGNATURE', 'server/index.js', 'migrations/001_init.sql', 'migrations/002_seed.js', 'locales/en/apps.js', 'locales/ru/hello.js', 'docs/hello.md']) assert.ok(names.includes(name), name);
    if (process.env.MODULE_BUILD_WEB === '1') {
      assert.ok(names.includes('web/index.js'));
      const chunk = opened.files.find((item) => item.name.startsWith('web/chunks/')).data.toString();
      assert.match(chunk, /from "\/sdk\/antd\.js"/);
      assert.match(chunk, /from "\/sdk\/portal-sdk\.js"/);
    }
    const server = opened.files.find((item) => item.name === 'server/index.js').data.toString();
    assert.match(server, /from "@portal\/sdk"/);
    assert.match(server, /from "express"/);
    assert.match(server, /Hello, \$\{name\}!/, 'local files are bundled');
    assert.deepEqual(opened.manifest.locales.en.sort(), ['apps', 'hello']);
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(keyDir, { recursive: true, force: true });
  }
});

test('build-module: Masterplan (a converted module of the tree) builds into a package', { timeout: 300_000 }, async () => {
  const out = temp();
  try {
    const { buildModule } = await import(pathToFileURL(resolve(here, '../../../scripts/build-module.mjs')).href);
    const result = await buildModule('masterplan', { keep: true, unsigned: true, out, 'no-web': process.env.MODULE_BUILD_WEB !== '1', 'no-write': true });
    const opened = openPackage(readFileSync(result.file), { allowUnsigned: true });
    const m = opened.manifest;
    assert.equal(m.id, 'masterplan');
    assert.equal(m.category, 'construction');
    assert.deepEqual(m.tables, ['mp_%']);
    assert.ok(m.permissions.includes('masterplan.sales_head') && m.permissions.length === 9);
    assert.ok(m.enhances.some((link) => link.id === 'crm'));
    // Settings defaults come from modules/masterplan/settings.js; the module starts switched off.
    assert.equal(m.settings.defaultEnabled, false);
    assert.equal(m.settings.defaults.reserveHours, 48);
    // Its own namespaces (modules/masterplan/locales) and its keys in shared core namespaces.
    for (const ns of ['mp', 'mpSettings', 'apps', 'settings', 'permissions', 'notifyPrefs', 'tour']) assert.ok(m.locales.ru.includes(ns), ns);
    const permissions = opened.files.find((item) => item.name === 'locales/en/permissions.js').data.toString();
    assert.match(permissions, /masterplan_sales_head/);
    assert.doesNotMatch(permissions, /crm_admin/, 'only the module\'s keys');
    const server = opened.files.find((item) => item.name === 'server/index.js').data.toString();
    assert.match(server, /@portal\/sdk\/core\/config\/database\.js/);
    assert.match(server, /001_init/);
    if (process.env.MODULE_BUILD_WEB === '1') {
      assert.equal(m.web.settings, true);
      assert.ok(m.web.css.length > 0, 'the stylesheet under web/assets is listed');
      for (const file of opened.files.filter((item) => item.name.startsWith('web/') && item.name.endsWith('.js'))) {
        assert.doesNotMatch(file.data.toString(), /from\s*"(\.\.\/)+sdk\//, `${file.name}: /sdk imports stay absolute`);
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
