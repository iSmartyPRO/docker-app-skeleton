import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
 * Procurement and Warehouse are module packages (docs/module-packages.md «Converting a module», batch 3):
 * the core no longer lists them anywhere, each builds into a package with the facts it had while built
 * in, their settings moved into the packages, and neither reads another package's tables directly any
 * more — Warehouse asks Procurement's public API for request lines, both pick Masterplan objects through
 * the core «objects» source (labels of issued stock only while Masterplan's tables exist), and no table
 * of theirs has a foreign key into another module's tables.
 * End to end: make package-check ID=procurement|warehouse (docs/package-testing.md).
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const FRONT = join(ROOT, 'src/frontend/src');
const IDS = ['procurement', 'warehouse'];
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const moduleJson = (id) => JSON.parse(read(`src/backend/modules/${id}/module.json`));

test('core without them: not in MODULES, the manifest, the catalog; listed as package modules', async () => {
  const { MODULES } = await import('../modules/index.js');
  const { MODULE_CATALOG, BUILTIN_MODULE_IDS } = await import('../modules/catalog.js');
  const { MODULE_MANIFEST, BUILTIN_MANIFEST_IDS, PACKAGE_MODULE_IDS, validateManifests } = await import('../modules/manifest.js');
  for (const id of IDS) {
    assert.ok(!MODULES.some((module) => module.id === id), `${id} in MODULES`);
    assert.ok(!MODULE_CATALOG.some((module) => module.id === id), `${id} in the catalog`);
    assert.ok(!BUILTIN_MODULE_IDS.includes(id) && !BUILTIN_MANIFEST_IDS.includes(id), `${id} built in`);
    assert.ok(!MODULE_MANIFEST[id], `${id} in the manifest`);
    assert.ok(PACKAGE_MODULE_IDS.includes(id), `${id} in PACKAGE_MODULE_IDS`);
  }
  // The dashboard keeps naming them in `enhances`.
  assert.deepEqual(validateManifests(MODULE_MANIFEST), []);
  assert.doesNotMatch(read('src/backend/modules/catalog.js'), /PROCUREMENT_DEFAULTS|sanitizeProcurement|WAREHOUSE_DEFAULTS|sanitizeWarehouse/);
});

test('core without them: the browser shell lists none of them; texts and tours in the modules; shared core files exposed', async () => {
  const registry = read('src/frontend/src/modules/registry.js');
  for (const id of IDS) {
    assert.doesNotMatch(registry, new RegExp(`id: '${id}'`), `${id} in modules/registry.js`);
    assert.match(registry, new RegExp(`'!\\./${id}/register\\.js'`), `${id}/register.js left out of the core glob`);
    assert.doesNotMatch(read('src/frontend/src/admin/navigation.js'), new RegExp(`id: '${id}',`), `${id} in admin/navigation.js`);
    assert.doesNotMatch(read('src/frontend/src/modules/manifest.js'), new RegExp(`^  ${id}: \\{`, 'm'), `${id} in MODULE_UI`);
    assert.match(readFileSync(join(FRONT, `modules/${id}/index.js`), 'utf8'), /import '\.\/register'/);
    assert.match(read(`src/frontend/src/modules/${id}/register.js`), /registerTour\(/);
  }
  for (const [id, ns] of [['procurement', 'procurement'], ['warehouse', 'wh'], ['warehouse', 'whm']]) {
    for (const lang of ['en', 'ru', 'ky', 'tr', 'zh']) {
      assert.ok(!existsSync(join(FRONT, `locales/${lang}/${ns}.js`)), `core locales/${lang}/${ns}.js`);
      assert.ok(existsSync(join(FRONT, `modules/${id}/locales/${lang}/${ns}.js`)), `modules/${id}/locales/${lang}/${ns}.js`);
    }
  }
  assert.match(read('src/frontend/src/modules/procurement/register.js'), /registerWidget\('procurement'/);
  for (const type of ['warehouseLow', 'warehouseIncoming', 'warehouseMyTools']) assert.match(read('src/frontend/src/modules/warehouse/register.js'), new RegExp(`registerWidget\\('${type}'`));
  // Core files their pages import are shared with packages (the barcode scanner, labels, Excel, legal entities).
  const { EXPOSED_CORE } = await import(pathToFileURL(join(FRONT, 'platform/sdk/exposed.js')).href);
  for (const path of ['components/ui/BarcodeScanner', 'components/ui/Labels', 'lib/scanBurst', 'lib/xlsx', 'components/legalEntities/LegalEntitiesEditor']) assert.ok(EXPOSED_CORE.includes(path), path);
});

test('core without them: sources stay out of the image; legacy table prefixes and «removed» rows are declared', async () => {
  const ignore = read('.dockerignore').split('\n');
  for (const id of IDS) {
    assert.ok(ignore.includes(`src/backend/modules/${id}`) && ignore.includes(`src/frontend/src/modules/${id}`), `${id} in .dockerignore`);
  }
  const { MODULE_TABLES, tablePatternProblem } = await import('../platform/packages/tableOwnership.js');
  const { CONVERTED_MODULES } = await import('../platform/packages/loader.js');
  const prefix = { procurement: 'proc_', warehouse: 'wh_' };
  for (const id of IDS) {
    const manifest = moduleJson(id);
    assert.deepEqual(MODULE_TABLES[id], [prefix[id]]);
    assert.deepEqual(manifest.tables, [`${prefix[id]}%`]);
    assert.equal(tablePatternProblem(id, manifest.tables[0]), null);
    assert.equal(CONVERTED_MODULES[id].version, '1.0.0');
    assert.equal(CONVERTED_MODULES[id].name.ru, manifest.name.ru);
    assert.equal(manifest.version, '1.1.1');
  }
});

test('module.json + settings.js: the facts the built-in modules had', async () => {
  const { sourcePackage } = await import('./helpers/modules.js');
  const { MODULE_CATALOG, resolveModules } = await import('../modules/catalog.js');
  for (const id of IDS) {
    const module = await sourcePackage(id);
    assert.equal(module.id, id);
    assert.deepEqual(module.migrations.map((migration) => migration.id), ['001_init'], `${id}: migration 001`);
    assert.equal(MODULE_CATALOG.find((entry) => entry.id === id).sanitize, module.sanitizeSettings);
    assert.equal(resolveModules({})[id].enabled, false, `${id} off by default`);
    // Both require Approvals (a core service) only; every other link is optional (packages in any order).
    assert.deepEqual(moduleJson(id).requires.map((link) => link.id), ['approvals'], id);
  }
  const catalog = (id) => MODULE_CATALOG.find((entry) => entry.id === id);
  assert.deepEqual(catalog('procurement').permissions, ['procurement.create', 'procurement.view_all', 'procurement.pay', 'procurement.admin']);
  assert.deepEqual(catalog('warehouse').permissions, ['warehouse.view', 'warehouse.request', 'warehouse.operate', 'warehouse.writeoff', 'warehouse.inventory', 'warehouse.cost', 'warehouse.backdate', 'warehouse.admin']);
  assert.deepEqual(moduleJson('procurement').enhances.map((link) => link.id), ['companies', 'masterplan', 'crm', 'contracts', 'files', 'chat']);
  assert.deepEqual(moduleJson('warehouse').enhances.map((link) => link.id), ['procurement', 'masterplan', 'companies']);
  assert.equal(resolveModules({}).procurement.settings.numberPrefix, 'ЗК');
  assert.equal(resolveModules({}).warehouse.settings.approvalThreshold, 500);
});

test('register(ctx): jobs, chat rooms, approval types and inbox items are registered there, not at import', () => {
  for (const id of IDS) {
    const index = read(`src/backend/modules/${id}/index.js`);
    assert.doesNotMatch(index.split('export default')[0], /^register\w+\(/m, `${id}: nothing registered at import`);
    const schema = read(`src/backend/modules/${id}/schema.js`);
    const migration = schema.slice(schema.indexOf('export async function create'), schema.indexOf('/** The schema outside a package install'));
    assert.doesNotMatch(migration, /registerJob|register\w+Chat|\.catch\(/, `${id}: migration 001 registers nothing and swallows no error`);
    assert.doesNotMatch(migration, /REFERENCES (?!users\(|proc_|wh_)/, `${id}: no foreign keys into other modules' tables`);
  }
  assert.match(read('src/backend/modules/procurement/index.js'), /register\(ctx\) \{[\s\S]*registerProcurementApproval\(\);[\s\S]*registerRequestChat\(\);[\s\S]*startProcurement\(\);/);
  assert.match(read('src/backend/modules/warehouse/index.js'), /register\(ctx\) \{[\s\S]*registerWarehouseApproval\(\);[\s\S]*registerInboxProvider\('warehouse\.receipts'[\s\S]*startWarehouse\(\);/);
});

test('no raw SQL on other packages: Procurement request lines through its API, Masterplan through the objects source or guarded', () => {
  const sources = (id) => ['access', 'approval', 'demo', 'documents', 'procurement', 'reports', 'stock', 'service', 'routes', 'money']
    .map((name) => `src/backend/modules/${id}/${name}.js`)
    .filter((path) => existsSync(join(ROOT, path)));
  for (const path of sources('warehouse')) assert.doesNotMatch(read(path), /\bproc_(items|requests|payments|deliveries|documents)\b/, `${path} reads Procurement's tables`);
  for (const path of sources('procurement')) assert.doesNotMatch(read(path), /\b(mp_\w+|ctr_contracts)\b(?!', '(masterplan|contracts)')/, `${path} reads Masterplan / Contracts tables`);
  assert.match(read('src/backend/modules/procurement/api.js'), /export async function requestLineQuantities/);
  assert.match(read('src/backend/modules/warehouse/procurement.js'), /requestLineQuantities/);
  // The demo purges of Contracts and Masterplan clear request links through Procurement's API, guarded.
  for (const id of ['contracts', 'masterplan']) assert.doesNotMatch(read(`src/backend/modules/${id}/demo.js`), /\bproc_requests\b/, `${id}/demo.js writes Procurement's table`);
  assert.match(read('src/backend/modules/contracts/demo.js'), /modules\.loaded\('procurement'\)\?\.api\?\.forgetContracts\?\.\(/);
  assert.match(read('src/backend/modules/masterplan/demo.js'), /modules\.loaded\('procurement'\)\?\.api\?\.forgetProjects\?\.\(/);
  // Masterplan names of issued stock: only behind the table check.
  for (const name of ['stock', 'reports']) {
    const text = read(`src/backend/modules/warehouse/${name}.js`);
    for (const match of text.matchAll(/FROM mp_/g)) {
      const before = text.slice(Math.max(0, match.index - 600), match.index);
      assert.match(before, /masterplanTables\(\)|masterplan\)/, `warehouse/${name}.js: mp_* read without the guard`);
    }
  }
});

test('build: each builds into a package (server part; web with MODULE_BUILD_WEB=1)', { timeout: 900_000 }, async () => {
  const { buildModule } = await import(pathToFileURL(join(ROOT, 'scripts/build-module.mjs')).href);
  const { openPackage } = await import('../platform/packages/archive.js');
  const web = process.env.MODULE_BUILD_WEB === '1';
  const out = mkdtempSync(join(tmpdir(), 'portal-pk2-build-'));
  try {
    for (const id of IDS) {
      const result = await buildModule(id, { keep: true, unsigned: true, out, 'no-web': !web, 'no-write': true });
      const opened = openPackage(readFileSync(result.file), { allowUnsigned: true });
      const m = opened.manifest;
      const file = (name) => opened.files.find((item) => item.name === name)?.data.toString();
      assert.equal(m.id, id);
      assert.equal(m.version, moduleJson(id).version);
      assert.match(file('server/index.js'), /001_init/);
      // Other modules are reached through the registry only: no other module's code in the bundle.
      assert.doesNotMatch(file('server/index.js'), /@portal\/sdk\/core\/modules\/(crm|contracts|masterplan|procurement|warehouse)\//);
      for (const ns of ['apps', 'settings', 'permissions', 'notifyPrefs', 'tour', 'dashboard']) assert.ok(m.locales.ru.includes(ns), `${id} ${ns}`);
      if (web) {
        assert.ok(m.web?.entry, `${id}: web entry`);
        assert.equal(m.web.settings, true, `${id}: settings screen`);
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
