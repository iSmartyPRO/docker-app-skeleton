import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
 * The CRM and Contracts are module packages (docs/module-packages.md «Converting a module», batch 2):
 * the core no longer lists them anywhere, each builds into a package with the facts it had while built
 * in, their settings logic (CRM stock lists, localized section titles, the Contracts types upgrade)
 * moved into the packages, and Masterplan — a package that links to the CRM — no longer depends on the
 * CRM's tables (no foreign keys into crm_deals, deal titles only while the table is there).
 * End to end: make package-check ID=crm|contracts (docs/package-testing.md).
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const FRONT = join(ROOT, 'src/frontend/src');
const IDS = ['crm', 'contracts'];
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
  // Built-in modules keep naming them in `enhances` (Procurement, Warehouse, Counterparties, the dashboard).
  assert.deepEqual(validateManifests(MODULE_MANIFEST), []);
  // The core's settings code no longer knows the CRM's stock lists (they moved into the package's migration 001).
  for (const file of ['src/backend/services/settings.js', 'src/backend/services/setup.js', 'src/backend/modules/catalog.js']) {
    assert.doesNotMatch(read(file), /CRM_DEFAULTS|crmStockLists|CrmStockLists|CONTRACTS_DEFAULTS|sanitizeContracts/, file);
  }
});

test('core without them: the browser shell lists none of them (registry, settings navigation, MODULE_UI); texts and tours in the modules', () => {
  const registry = read('src/frontend/src/modules/registry.js');
  for (const id of IDS) {
    assert.doesNotMatch(registry, new RegExp(`id: '${id}'`), `${id} in modules/registry.js`);
    assert.match(registry, new RegExp(`'!\\./${id}/register\\.js'`), `${id}/register.js left out of the core glob`);
    assert.doesNotMatch(read('src/frontend/src/admin/navigation.js'), new RegExp(`id: '${id}',`), `${id} in admin/navigation.js`);
    assert.doesNotMatch(read('src/frontend/src/modules/manifest.js'), new RegExp(`^  ${id}: \\{`, 'm'), `${id} in MODULE_UI`);
    assert.match(readFileSync(join(FRONT, `modules/${id}/index.js`), 'utf8'), /import '\.\/register'/);
    assert.match(read(`src/frontend/src/modules/${id}/register.js`), /registerTour\(/);
  }
  for (const [id, ns] of [['crm', 'crm'], ['crm', 'crmSettings'], ['contracts', 'contracts']]) {
    for (const lang of ['en', 'ru', 'ky', 'tr', 'zh']) {
      assert.ok(!existsSync(join(FRONT, `locales/${lang}/${ns}.js`)), `core locales/${lang}/${ns}.js`);
      assert.ok(existsSync(join(FRONT, `modules/${id}/locales/${lang}/${ns}.js`)), `modules/${id}/locales/${lang}/${ns}.js`);
    }
  }
  // The dashboard widget of Contracts is registered by its own web entry.
  assert.match(read('src/frontend/src/modules/contracts/register.js'), /registerWidget\('contractsPayments'/);
});

test('core without them: sources stay out of the image; legacy table prefixes and «removed» rows are declared', async () => {
  const ignore = read('.dockerignore').split('\n');
  for (const id of IDS) {
    assert.ok(ignore.includes(`src/backend/modules/${id}`) && ignore.includes(`src/frontend/src/modules/${id}`), `${id} in .dockerignore`);
  }
  const { MODULE_TABLES, tablePatternProblem } = await import('../platform/packages/tableOwnership.js');
  const { CONVERTED_MODULES } = await import('../platform/packages/loader.js');
  const prefix = { crm: 'crm_', contracts: 'ctr_' };
  for (const id of IDS) {
    const manifest = moduleJson(id);
    assert.deepEqual(MODULE_TABLES[id], [prefix[id]]);
    assert.deepEqual(manifest.tables, [`${prefix[id]}%`]);
    assert.equal(tablePatternProblem(id, manifest.tables[0]), null);
    assert.equal(CONVERTED_MODULES[id].version, '1.0.0');
    assert.equal(CONVERTED_MODULES[id].name.ru, manifest.name.ru);
    assert.equal(manifest.version, '1.1.0');
  }
});

test('module.json + settings.js: the facts the built-in modules had; package hooks for localized defaults and the settings upgrade', async () => {
  const { sourcePackage } = await import('./helpers/modules.js');
  const { MODULE_CATALOG, resolveModules } = await import('../modules/catalog.js');
  for (const id of IDS) {
    const module = await sourcePackage(id);
    assert.equal(module.id, id);
    assert.deepEqual(module.migrations.map((migration) => migration.id), ['001_init'], `${id}: migration 001`);
    assert.equal(MODULE_CATALOG.find((entry) => entry.id === id).sanitize, module.sanitizeSettings);
  }
  const catalog = (id) => MODULE_CATALOG.find((entry) => entry.id === id);
  assert.deepEqual(catalog('crm').permissions, ['crm.admin', 'crm.all']);
  assert.equal(catalog('crm').defaultEnabled, true, 'the CRM keeps running where nobody switched it off');
  assert.deepEqual(catalog('contracts').permissions, ['contracts.create', 'contracts.view_all', 'contracts.legal', 'contracts.finance', 'contracts.admin']);
  assert.equal(catalog('contracts').defaultEnabled, false);
  // Contracts needs Approvals (a core service); CRM, Masterplan… are optional links (packages load in any order).
  assert.deepEqual(moduleJson('contracts').requires.map((link) => link.id), ['approvals']);
  assert.deepEqual(moduleJson('contracts').enhances.map((link) => link.id), ['companies', 'chat', 'crm', 'masterplan', 'procurement']);
  assert.deepEqual(moduleJson('crm').requires, []);
  assert.deepEqual(moduleJson('crm').enhances.map((link) => link.id), ['companies', 'chat']);
  // CRM: unsaved section titles follow the portal language (the loader puts `localizedSettings` in place).
  assert.equal(resolveModules({}, { locale: 'en' }).crm.settings.sections[0].title, 'About the deal');
  assert.equal(resolveModules({}).crm.settings.sections[0].title, 'О сделке');
  // Contracts: «Продажа объекта» reaches a types list saved before it existed (`upgradeSettings`).
  const old = resolveModules({ contracts: { settings: { types: [{ key: 'sale', label: '' }] } } }).contracts.settings;
  assert.deepEqual(old.types.map((type) => type.key), ['sale', 'property_sale']);
  const loader = read('src/backend/platform/packages/loader.js');
  assert.match(loader, /module\.localizedSettings/);
  assert.match(loader, /module\.upgradeSettings/);
});

test('register(ctx): jobs, chat rooms, approval type and inbox items are registered there, not at import', () => {
  const contracts = read('src/backend/modules/contracts/index.js');
  assert.doesNotMatch(contracts.split('export default')[0], /^registerContractApproval\(\);|^registerInboxProvider\(/m);
  assert.match(contracts, /register\(ctx\) \{[\s\S]*registerContractApproval\(\);[\s\S]*startContracts\(\);/);
  assert.match(read('src/backend/modules/crm/index.js'), /register\(ctx\) \{[\s\S]*startCrm\(\);/);
  for (const id of IDS) {
    const schema = read(`src/backend/modules/${id}/schema.js`);
    const migration = schema.slice(schema.indexOf('export async function create'), schema.indexOf('/** The schema outside a package install'));
    assert.doesNotMatch(migration, /registerJob|register\w+Chat/, `${id}: migration 001 registers nothing`);
  }
  // Contracts' demo asks Masterplan for its demo units at seed time (packages load in any order).
  assert.doesNotMatch(read('src/backend/modules/contracts/demo.js'), /^const DEMO_CONTRACT_UNITS = modules\.loaded/m);
});

test('Masterplan without the CRM: no foreign keys into crm_deals, deal titles only while the table is there', async () => {
  const schema = read('src/backend/modules/masterplan/schema.js');
  assert.doesNotMatch(schema, /REFERENCES crm_/);
  const { MASTERPLAN_MIGRATIONS, dropCrmForeignKeys } = await import('../modules/masterplan/schema.js');
  assert.deepEqual(MASTERPLAN_MIGRATIONS.map((m) => m.id), ['001_init', '002_crm_link_without_fk']);
  // 002 drops whatever keys a portal got from older versions.
  const statements = [];
  const db = {
    async query(text) {
      statements.push(text);
      return /FROM pg_constraint/.test(text) ? { rows: [{ conname: 'mp_units_deal_id_fkey', table_name: 'mp_units' }, { conname: 'mp_bookings_deal_id_fkey', table_name: 'mp_bookings' }] } : { rows: [] };
    },
  };
  assert.equal(await dropCrmForeignKeys(db), 2);
  assert.deepEqual(statements.slice(1), ['ALTER TABLE "mp_units" DROP CONSTRAINT IF EXISTS "mp_units_deal_id_fkey"', 'ALTER TABLE "mp_bookings" DROP CONSTRAINT IF EXISTS "mp_bookings_deal_id_fkey"']);
  // The SELECTs join crm_deals only while it exists.
  const { nodeSelect, withCrmJoin } = await import('../modules/masterplan/shapes.js');
  const answer = (ok) => ({ query: async () => ({ rows: [{ ok }] }) });
  assert.match(await nodeSelect(answer(true)), /LEFT JOIN crm_deals d ON d\.id = u\.deal_id/);
  const without = await nodeSelect(answer(false));
  assert.doesNotMatch(without, /crm_deals/);
  assert.match(without, /d\.title AS deal_title/);
  assert.doesNotMatch(await withCrmJoin('SELECT d.title FROM mp_bookings b LEFT JOIN crm_deals d ON d.id = b.deal_id', answer(false)), /crm_deals/);
  for (const file of ['sales.js', 'projects.js', 'units.js', 'nodes.js']) assert.doesNotMatch(read(`src/backend/modules/masterplan/${file}`), /\$\{NODE_SELECT\}|NODE_SELECT\.replace/, file);
  assert.equal(moduleJson('masterplan').version, '1.2.0');
});

test('Masterplan: a token without the CRM scope gets no deal titles while the CRM is not installed', async () => {
  const { crmScopeAllows } = await import('../modules/masterplan/access.js');
  const { AREA_KEYS } = await import('../api/scopes.js');
  assert.ok(!AREA_KEYS.includes('crm'), 'no crm area in this core without the package');
  const token = (crm) => ({ request: { apiToken: { policy: { scopes: { masterplan: 'read', ...(crm ? { crm } : {}) }, rules: [] } } } });
  assert.equal(crmScopeAllows(token(null), 'read'), false);
  assert.equal(crmScopeAllows(token('read'), 'read'), true);
  assert.equal(crmScopeAllows(token('read'), 'write'), false);
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
      assert.equal(m.version, '1.1.0');
      assert.match(file('server/index.js'), /001_init/);
      // Other modules are reached through the registry only: no other module's code in the bundle.
      assert.doesNotMatch(file('server/index.js'), /@portal\/sdk\/core\/modules\/(crm|contracts|masterplan)\//);
      for (const ns of ['apps', 'settings', 'permissions', 'notifyPrefs', 'tour']) assert.ok(m.locales.ru.includes(ns), `${id} ${ns}`);
      if (web) {
        assert.ok(m.web?.entry, `${id}: web entry`);
        assert.equal(m.web.settings, true, `${id}: settings screen`);
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
