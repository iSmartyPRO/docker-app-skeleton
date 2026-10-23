import { readFileSync } from 'node:fs';
import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_CATALOG } from '../modules/catalog.js';
import { MODULE_MANIFEST, CATEGORIES, compareVersions, dependencyOrder, findRequiresCycle, validateManifests } from '../modules/manifest.js';
import { dependentsOf, missingFor, moduleStatus, planModuleChanges, requiredClosure } from '../modules/dependencies.js';
import { healthChecks, integrationStatus, scrub } from '../services/systemInfo.js';

const T = { en: 'x', ru: 'x' };
const entry = (extra = {}) => ({ name: T, version: '1.0.0', minCore: '1.0.0', category: 'work', requires: [], enhances: [], changelog: [{ version: '1.0.0', date: '2026-01-01', changes: { en: [], ru: [] } }], ...extra });
const catalogIds = MODULE_CATALOG.map((module) => module.id);
const coreIds = MODULE_CATALOG.filter((module) => module.core).map((module) => module.id);

// ── Manifest ────────────────────────────────────────────────────────────────

test('every module has a valid manifest and every manifest a module', () => {
  assert.deepEqual(validateManifests(MODULE_MANIFEST, { catalogIds, coreIds }), []);
  for (const [id, item] of Object.entries(MODULE_MANIFEST)) {
    assert.ok(CATEGORIES.includes(item.category), id);
    assert.equal(item.changelog[0].version, item.version, `${id}: newest changelog entry = version`);
  }
});

test('real dependencies: business documents need Approvals, links are optional', () => {
  // Masterplan, CRM and Contracts are packages: their manifests are module.json.
  const pkg = (id) => JSON.parse(readFileSync(new URL(`../modules/${id}/module.json`, import.meta.url), 'utf8'));
  for (const id of ['procurement', 'warehouse']) assert.ok(MODULE_MANIFEST[id].requires.some((link) => link.id === 'approvals'), id);
  assert.ok(pkg('contracts').requires.some((link) => link.id === 'approvals'), 'contracts');
  const enhances = (id) => (MODULE_MANIFEST[id] || pkg(id)).enhances.map((link) => link.id || link.integration);
  for (const id of ['companies', 'masterplan', 'crm', 'contracts']) assert.ok(enhances('procurement').includes(id), `procurement → ${id}`);
  assert.ok(enhances('warehouse').includes('procurement') && enhances('warehouse').includes('masterplan'));
  assert.ok(pkg('masterplan').enhances.some((link) => link.id === 'crm'));
  assert.ok(enhances('crm').includes('companies'));
  // Contracts reaches the CRM and Masterplan as optional links only (packages in any order).
  for (const id of ['crm', 'masterplan']) assert.ok(enhances('contracts').includes(id), `contracts → ${id}`);
  for (const id of ['crm', 'masterplan', 'contracts']) assert.ok(!pkg(id).requires.some((link) => ['crm', 'masterplan', 'contracts'].includes(link.id)), `${id} requires no other package`);
  assert.ok(enhances('drive').includes('activeDirectory'));
  assert.ok(enhances('dashboard').length >= 8);
  // Only core modules are required (nothing optional can block switching a module on today).
  for (const item of Object.values(MODULE_MANIFEST)) for (const link of item.requires) assert.ok(coreIds.includes(link.id) || link.integration);
});

test('validation reports unknown ids, self links, bad versions and categories', () => {
  const problems = validateManifests({
    a: entry({ requires: [{ id: 'ghost', reason: T }], enhances: [{ id: 'a', what: T }] }),
    b: entry({ version: '1.0', category: 'nope', enhances: [{ integration: 'fax', what: T }] }),
    c: entry({ requires: [{ id: 'a' }] }),
  }, { catalogIds: ['a', 'b', 'c', 'd'] });
  const text = problems.join('\n');
  assert.match(text, /a: requires names unknown module "ghost"/);
  assert.match(text, /a: enhances names itself/);
  assert.match(text, /b: version "1\.0" is not semver/);
  assert.match(text, /b: unknown category "nope"/);
  assert.match(text, /b: enhances names unknown integration "fax"/);
  assert.match(text, /c: requires → a needs reason/);
  assert.match(text, /d: no manifest entry/);
});

test('requirement cycles are found (enhances may go both ways)', () => {
  const cyclic = { a: entry({ requires: [{ id: 'b', reason: T }] }), b: entry({ requires: [{ id: 'c', reason: T }] }), c: entry({ requires: [{ id: 'a', reason: T }] }) };
  assert.deepEqual(findRequiresCycle(cyclic), ['a', 'b', 'c', 'a']);
  assert.match(validateManifests(cyclic).join('\n'), /requirement cycle: a → b → c → a/);
  const mutual = { a: entry({ enhances: [{ id: 'b', what: T }] }), b: entry({ enhances: [{ id: 'a', what: T }] }) };
  assert.equal(findRequiresCycle(mutual), null);
  assert.equal(findRequiresCycle(MODULE_MANIFEST), null);
});

test('a core module may not require an optional one; minCore is checked against the core', () => {
  const set = { core: entry({ requires: [{ id: 'opt', reason: T }] }), opt: entry({ minCore: '9.0.0' }) };
  const text = validateManifests(set, { coreIds: ['core'], coreVersion: '1.4.2' }).join('\n');
  assert.match(text, /core: a core module cannot require the optional module "opt"/);
  assert.match(text, /opt: needs core 9\.0\.0, running 1\.4\.2/);
});

test('versions compare numerically; dependency order puts requirements first', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.4.2', '1.4.2-beta'), 0);
  assert.equal(compareVersions('0.9.0', '1.0.0'), -1);
  const set = { a: entry({ requires: [{ id: 'c', reason: T }] }), b: entry(), c: entry({ requires: [{ id: 'b', reason: T }] }) };
  assert.deepEqual(dependencyOrder(['a', 'b', 'c'], set), ['b', 'c', 'a']);
  assert.deepEqual(requiredClosure('a', set), ['c', 'b']);
});

// ── Switching on and off ────────────────────────────────────────────────────

const SET = {
  base: entry(),
  docs: entry({ requires: [{ id: 'base', reason: { en: 'stores files', ru: 'хранит файлы' } }] }),
  deep: entry({ requires: [{ id: 'docs', reason: T }] }),
  dir: entry({ requires: [{ integration: 'activeDirectory', reason: T }] }),
  core: entry(),
};
const opts = (extra = {}) => ({ manifest: SET, core: ['core'], ...extra });
const refused = (fn, code) => {
  try {
    fn();
  } catch (err) {
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, code);
    return err.details;
  }
  throw new Error('expected a 409');
};

test('switching on a module whose requirement is off: 409 with the missing list', () => {
  const details = refused(() => planModuleChanges({ base: false, docs: false, deep: false, dir: false, core: true }, { docs: { enabled: true } }, opts()), 'MODULE_REQUIRES');
  assert.deepEqual(details, { module: 'docs', missing: [{ id: 'base', reason: { en: 'stores files', ru: 'хранит файлы' } }], canAlsoEnable: true });
});

test('alsoEnable switches the whole chain on', () => {
  const plan = planModuleChanges({ base: false, docs: false, deep: false, dir: false, core: true }, { deep: { enabled: true, alsoEnable: true } }, opts());
  assert.deepEqual(plan.autoEnabled, ['docs', 'base']);
  assert.equal(plan.enabled.deep && plan.enabled.docs && plan.enabled.base, true);
});

test('a missing integration cannot be switched on from here', () => {
  const details = refused(() => planModuleChanges({ base: true, docs: true, deep: true, dir: false, core: true }, { dir: { enabled: true, alsoEnable: true } }, opts()), 'MODULE_REQUIRES');
  assert.equal(details.canAlsoEnable, false);
  assert.deepEqual(details.missing.map((item) => item.integration), ['activeDirectory']);
  const ok = planModuleChanges({ base: true, docs: true, deep: true, dir: false, core: true }, { dir: { enabled: true } }, opts({ integrations: { activeDirectory: true } }));
  assert.equal(ok.enabled.dir, true);
});

test('switching off a module others need: 409 with the dependents; together it works', () => {
  const state = { base: true, docs: true, deep: false, dir: false, core: true };
  const details = refused(() => planModuleChanges(state, { base: { enabled: false } }, opts()), 'MODULE_REQUIRED_BY');
  assert.deepEqual(details.dependents.map((item) => item.id), ['docs']);
  const plan = planModuleChanges(state, { base: { enabled: false }, docs: { enabled: false } }, opts());
  assert.equal(plan.enabled.base, false);
});

test('unchanged modules, settings-only patches and core modules are never blocked', () => {
  // A legacy state where docs is on without base: saving docs' settings still works.
  const legacy = { base: false, docs: true, deep: false, dir: false, core: true };
  assert.doesNotThrow(() => planModuleChanges(legacy, { docs: { settings: { a: 1 } } }, opts()));
  assert.doesNotThrow(() => planModuleChanges(legacy, { docs: { enabled: true } }, opts()));
  assert.equal(planModuleChanges(legacy, { core: { enabled: false } }, opts()).enabled.core, true);
  assert.equal(moduleStatus('docs', legacy, { manifest: SET }).status, 'needs');
  assert.equal(moduleStatus('base', legacy, { manifest: SET }).status, 'off');
  assert.deepEqual(missingFor('docs', legacy, { manifest: SET }).map((item) => item.id), ['base']);
  assert.deepEqual(dependentsOf('base', { ...legacy, base: true }, SET).map((item) => item.id), ['docs']);
});

test('the real catalog: Approvals is always on, so business modules switch freely', () => {
  const state = Object.fromEntries(MODULE_CATALOG.map((module) => [module.id, false]));
  const plan = planModuleChanges(state, { procurement: { enabled: true }, warehouse: { enabled: true } }, { core: coreIds });
  assert.equal(plan.enabled.procurement && plan.enabled.warehouse && plan.enabled.approvals, true);
});

// ── System report (no secrets) ─────────────────────────────────────────────

test('integration status carries no values, only on / off / incomplete', () => {
  const secret = 'S3cr3t-Value-123456';
  const list = integrationStatus({
    email: { enabled: true, host: 'smtp.example.com', from: 'a@example.com', password: secret },
    telegram: { enabled: true, botToken: '' },
    activeDirectory: { enabled: false, bindPassword: secret },
    google: { enabled: true, clientId: 'id', clientSecret: secret },
  });
  assert.ok(!JSON.stringify(list).includes(secret));
  assert.ok(!JSON.stringify(list).includes('smtp.example.com'));
  const by = Object.fromEntries(list.map((item) => [item.id, item]));
  assert.equal(by.email.status, 'on');
  assert.equal(by.telegram.status, 'incomplete');
  assert.deepEqual(by.telegram.missing, ['botToken']);
  assert.equal(by.activeDirectory.status, 'off');
  assert.equal(list.length, 9);
});

test('health checks say whether values are set, never the values', async () => {
  const env = { PUBLIC_URL: 'https://portal.example.com', ENCRYPTION_KEY: 'k'.repeat(40), SETUP_TOKEN: 'tok-123', TZ: 'UTC' };
  const checks = await healthChecks({ env, parsed: { regional: { timeZone: 'UTC' } }, frontendUrl: 'https://portal.example.com', jwtSecret: 'j'.repeat(48) });
  const text = JSON.stringify(checks);
  for (const value of ['k'.repeat(40), 'j'.repeat(48), 'tok-123']) assert.ok(!text.includes(value));
  const by = Object.fromEntries(checks.map((item) => [item.id, item]));
  assert.equal(by.https.status, 'ok');
  assert.equal(by.jwtSecret.value, 'strong');
  assert.equal(by.encryptionKey.status, 'ok');
  assert.equal(by.setupLocked.status, 'warn');
  assert.equal(by.backup.status, 'unknown');
  const weak = Object.fromEntries((await healthChecks({ env: {}, parsed: {}, frontendUrl: 'http://portal.example.com', jwtSecret: 'short' })).map((item) => [item.id, item]));
  assert.equal(weak.https.status, 'fail');
  assert.equal(weak.jwtSecret.value, 'short');
  assert.equal(weak.timeZone.status, 'warn');
});

test('job errors are scrubbed of tokens and passwords', () => {
  const text = scrub('POST https://api.telegram.org/bot123456:AAHk-very-secret-token-value/sendMessage failed; password=hunter2 token: abc https://user:pw@host/x Bearer eyJ.abc');
  for (const leaked of ['AAHk-very-secret-token-value', 'hunter2', 'abc https', 'user:pw', 'eyJ.abc']) assert.ok(!text.includes(leaked), leaked);
});
