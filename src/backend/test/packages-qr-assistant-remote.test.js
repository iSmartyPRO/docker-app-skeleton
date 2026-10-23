import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
 * QR codes, the robot assistant and Remote access are module packages
 * (docs/module-packages.md «Converting a module»): the core no longer lists
 * them anywhere, each builds into a package with the facts it had while built
 * in, and the core keeps what they need from it (legacy table prefixes, the
 * «removed» rows of upgraded portals, Remote's sealing of stored secrets, its
 * WebSocket tunnels attached when the package registers).
 * Database flows: packages-qr-assistant-remote.db.test.js.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const FRONT = join(ROOT, 'src/frontend/src');
const IDS = ['qr', 'assistant', 'remote'];
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const moduleJson = (id) => JSON.parse(read(`src/backend/modules/${id}/module.json`));

test('core without them: not in MODULES, the manifest, the catalog; listed as package modules', async () => {
  const { MODULES } = await import('../modules/index.js');
  const { MODULE_CATALOG, BUILTIN_MODULE_IDS } = await import('../modules/catalog.js');
  const { MODULE_MANIFEST, BUILTIN_MANIFEST_IDS, PACKAGE_MODULE_IDS } = await import('../modules/manifest.js');
  for (const id of IDS) {
    assert.ok(!MODULES.some((module) => module.id === id), `${id} in MODULES`);
    assert.ok(!MODULE_CATALOG.some((module) => module.id === id), `${id} in the catalog`);
    assert.ok(!BUILTIN_MODULE_IDS.includes(id) && !BUILTIN_MANIFEST_IDS.includes(id), `${id} built in`);
    assert.ok(!MODULE_MANIFEST[id], `${id} in the manifest`);
    assert.ok(PACKAGE_MODULE_IDS.includes(id), `${id} in PACKAGE_MODULE_IDS`);
  }
});

test('core without them: the browser shell lists none of them (registry, settings navigation, tours, MODULE_UI)', () => {
  const registry = read('src/frontend/src/modules/registry.js');
  for (const id of IDS) {
    assert.doesNotMatch(registry, new RegExp(`id: '${id}'`), `${id} in modules/registry.js`);
    assert.match(registry, new RegExp(`'!\\./${id}/register\\.js'`), `${id}/register.js left out of the core glob`);
    assert.doesNotMatch(read('src/frontend/src/admin/navigation.js'), new RegExp(`id: '${id}',`), `${id} in admin/navigation.js`);
    assert.doesNotMatch(read('src/frontend/src/modules/manifest.js'), new RegExp(`^  ${id}: \\{`, 'm'), `${id} in MODULE_UI`);
    // The web entry imports register.js (contributions, tours) when the package loads.
    assert.match(readFileSync(join(FRONT, `modules/${id}/index.js`), 'utf8'), /import '\.\/register'/);
  }
  const tours = read('src/frontend/src/tour/content/index.js');
  assert.doesNotMatch(tours, /qr|remote/);
  for (const id of ['qr', 'remote']) assert.match(read(`src/frontend/src/modules/${id}/register.js`), /registerTour\(/);
  // Their own namespaces moved into the module folders (the package ships them).
  for (const [id, ns] of [['qr', 'qr'], ['qr', 'qrSettings'], ['assistant', 'assistant'], ['assistant', 'assistantSettings'], ['remote', 'remote'], ['remote', 'remoteSettings']]) {
    assert.ok(!existsSync(join(FRONT, `locales/en/${ns}.js`)), `core locales/en/${ns}.js`);
    assert.ok(existsSync(join(FRONT, `modules/${id}/locales/en/${ns}.js`)), `modules/${id}/locales/en/${ns}.js`);
  }
});

test('core without them: sources stay out of the image; legacy table prefixes and «removed» rows are declared', async () => {
  const ignore = read('.dockerignore').split('\n');
  for (const id of IDS) {
    assert.ok(ignore.includes(`src/backend/modules/${id}`) && ignore.includes(`src/frontend/src/modules/${id}`), `${id} in .dockerignore`);
  }
  const { MODULE_TABLES, tablePatternProblem } = await import('../platform/packages/tableOwnership.js');
  const { CONVERTED_MODULES } = await import('../platform/packages/loader.js');
  const lastBuiltIn = { qr: '1.0.0', assistant: '1.0.0', remote: '1.3.0' };
  for (const id of IDS) {
    const manifest = moduleJson(id);
    assert.deepEqual(MODULE_TABLES[id], [`${id}_`]);
    assert.deepEqual(manifest.tables, [`${id}_%`]);
    assert.equal(tablePatternProblem(id, manifest.tables[0]), null);
    assert.equal(CONVERTED_MODULES[id].version, lastBuiltIn[id]);
    assert.equal(CONVERTED_MODULES[id].name.ru, manifest.name.ru);
    // The first package version is a minor bump of the last built-in one.
    const [major, minor] = lastBuiltIn[id].split('.').map(Number);
    assert.equal(manifest.version, `${major}.${minor + 1}.0`);
  }
});

test('module.json + settings.js: valid manifests with the facts the built-in modules had', async () => {
  const { sourcePackage } = await import('./helpers/modules.js');
  const { MODULE_CATALOG } = await import('../modules/catalog.js');
  for (const id of IDS) {
    const module = await sourcePackage(id);
    assert.equal(module.id, id);
    assert.ok(module.migrations.some((migration) => migration.id === '001_init'), `${id}: migration 001`);
    assert.equal(typeof module.sanitizeSettings, 'function');
    assert.equal(MODULE_CATALOG.find((entry) => entry.id === id).sanitize, module.sanitizeSettings);
  }
  const catalog = (id) => MODULE_CATALOG.find((entry) => entry.id === id);
  assert.deepEqual(catalog('qr').permissions, ['qr.admin']);
  assert.equal(catalog('qr').defaultEnabled, false);
  assert.equal(catalog('qr').defaults.maxCodes, 500);
  // The robot stays on where nobody switched it (as while built in) and its rules stay public.
  assert.equal(catalog('assistant').defaultEnabled, true);
  assert.deepEqual(catalog('assistant').publicSettings, ['avatar', 'proactive', 'choice', 'allowed', 'allowColors']);
  assert.deepEqual(catalog('remote').permissions, ['remote.view', 'remote.connect', 'remote.monitor', 'remote.admin']);
  assert.equal(catalog('remote').defaultEnabled, false);
  assert.equal(catalog('remote').defaults.policyAckAt, null);
  assert.deepEqual(moduleJson('remote').enhances.map((link) => link.id), ['directory']);
  // Built-in modules may still name them in `enhances`; the manifests validate.
  const { validateManifests, MODULE_MANIFEST } = await import('../modules/manifest.js');
  assert.deepEqual(validateManifests(MODULE_MANIFEST), []);
});

test('a package without a page of its own is an overlay in the catalog (the robot is not an app)', async () => {
  const { normalizeManifest, platformCatalogEntry } = await import('../platform/packages/manifestFile.js');
  const { CATEGORIES, INTEGRATIONS } = await import('../modules/manifest.js');
  const base = { id: 'robotx', name: { en: 'R', ru: 'Р' }, version: '1.0.0', core: '1.20.0', category: 'work', settings: {} };
  const overlay = normalizeManifest({ ...base, web: { entry: 'web/index.js', page: false } }, { categories: CATEGORIES, integrations: INTEGRATIONS });
  assert.deepEqual(overlay.problems, []);
  assert.equal(platformCatalogEntry(overlay.manifest).overlay, true);
  const page = normalizeManifest({ ...base, web: { entry: 'web/index.js' } }, { categories: CATEGORIES, integrations: INTEGRATIONS });
  assert.equal(platformCatalogEntry(page.manifest).overlay, undefined);
});

test('Remote: stored secrets are sealed through the SDK the same way as while built in (no key material)', async () => {
  const sdk = await import('../platform/sdk/server.js');
  const crypto = await import('../services/crypto.js');
  const sealedBefore = crypto.seal('rdp-password');
  assert.equal(sdk.unseal(sealedBefore), 'rdp-password');
  assert.equal('decryptionKeys' in sdk, false);
  for (const file of ['credentials.js', 'passbolt.js', 'pvnc.js', 'service.js']) {
    assert.doesNotMatch(read(`src/backend/modules/remote/${file}`), /services\/crypto\.js/, file);
  }
});

test('ctx.onHttpServer: a hook registered after the server hooks ran is attached at once (a package that loads late)', async () => {
  const registry = await import('../platform/registry.js');
  const seen = [];
  const server = { id: 'http-server' };
  registry.onHttpServer((s) => seen.push(['early', s.id]));
  registry.runHttpServerHooks(server);
  registry.onHttpServer((s) => seen.push(['late', s.id]), { module: 'remote' });
  assert.deepEqual(seen, [['early', 'http-server'], ['late', 'http-server']]);
});

test('build: each builds into a package (server part; web with MODULE_BUILD_WEB=1)', { timeout: 900_000 }, async () => {
  const { buildModule } = await import(pathToFileURL(join(ROOT, 'scripts/build-module.mjs')).href);
  const { openPackage } = await import('../platform/packages/archive.js');
  const { SDK_VERSION } = await import('../platform/sdk/version.js');
  const web = process.env.MODULE_BUILD_WEB === '1';
  const out = mkdtempSync(join(tmpdir(), 'portal-pk2-build-'));
  try {
    const opened = {};
    for (const id of IDS) {
      const result = await buildModule(id, { keep: true, unsigned: true, out, 'no-web': !web, 'no-write': true });
      opened[id] = openPackage(readFileSync(result.file), { allowUnsigned: true });
      const m = opened[id].manifest;
      const file = (name) => opened[id].files.find((item) => item.name === name)?.data.toString();
      assert.equal(m.id, id);
      assert.equal(m.version, moduleJson(id).version);
      assert.equal(m.sdk, SDK_VERSION);
      assert.deepEqual(m.tables, [`${id}_%`]);
      assert.match(file('server/index.js'), /001_init/);
      assert.ok(m.locales.ru.includes('apps'), `${id}: apps texts`);
      assert.match(file('locales/en/apps.js'), new RegExp(`${id}`));
      if (web) {
        assert.ok(m.web?.entry, `${id}: web entry`);
        assert.equal(m.web.settings, true, `${id}: settings screen`);
        for (const item of opened[id].files.filter((entry) => entry.name.startsWith('web/') && entry.name.endsWith('.js'))) {
          assert.doesNotMatch(item.data.toString(), /from\s*"(\.\.\/)+sdk\//, `${item.name}: /sdk imports stay absolute`);
        }
      }
    }
    // QR: its own namespaces and its keys in shared core namespaces; anonymous routes are in the bundle.
    for (const ns of ['qr', 'qrSettings', 'settings', 'permissions', 'tour']) assert.ok(opened.qr.manifest.locales.ru.includes(ns), `qr ${ns}`);
    assert.deepEqual(opened.qr.manifest.permissions, ['qr.admin']);
    assert.match(opened.qr.files.find((item) => item.name === 'server/index.js').data.toString(), /publicPrefix: "\/qr"/);
    // Assistant: no page of its own.
    assert.equal(opened.assistant.manifest.settings.defaultEnabled, true);
    if (web) assert.equal(opened.assistant.manifest.web.page, false);
    // Remote: ws / guacamole-lite / openpgp are the core's copies; secrets through services/secrets.js.
    const remote = opened.remote.files.find((item) => item.name === 'server/index.js').data.toString();
    for (const name of ['ws', 'guacamole-lite', 'openpgp']) assert.match(remote, new RegExp(`from "${name}"`), name);
    assert.match(remote, /@portal\/sdk\/core\/services\/secrets\.js/);
    assert.doesNotMatch(remote, /services\/crypto\.js/);
    assert.ok(opened.remote.files.some((item) => item.name === 'docs/remote-access.ru.md'), 'remote docs');
    for (const ns of ['remote', 'remoteSettings', 'notifyPrefs', 'permissions', 'tour']) assert.ok(opened.remote.manifest.locales.ru.includes(ns), `remote ${ns}`);
    if (web) {
      assert.deepEqual(opened.remote.manifest.web.permission, ['remote.view', 'remote.connect', 'remote.monitor', 'remote.admin']);
      // noVNC and guacamole-common-js are bundled into the package, in chunks loaded when a session opens.
      const chunks = opened.remote.files.filter((item) => item.name.startsWith('web/chunks/'));
      const novnc = chunks.filter((item) => /RFB|noVNC/i.test(item.data.toString()) && /PvncViewer/.test(item.name));
      assert.equal(novnc.length, 1, 'noVNC in the PvncViewer chunk');
      assert.doesNotMatch(opened.remote.files.find((item) => item.name === 'web/index.js').data.toString(), /novnc/i);
      assert.ok(!chunks.some((item) => /RemoteApp/.test(item.name) && /@novnc|Websock/.test(item.data.toString())), 'the page chunk has no viewer');
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('Settings → <package>: the settings item of a package belongs to the Modules section (the screen renders)', async () => {
  // Browser sources import without extensions (vite): resolve them as .js for this import.
  const { registerHooks } = await import('node:module');
  registerHooks({
    resolve(specifier, context, next) {
      try {
        return next(specifier, context);
      } catch (err) {
        if (specifier.startsWith('.') && context.parentURL?.includes('/frontend/src/')) return next(`${specifier}.js`, context);
        throw err;
      }
    },
  });
  const navigation = await import('../../frontend/src/admin/navigation.js');
  const item = navigation.addPackageSettingsItem({ id: 'remote', icon: 'remote' });
  assert.equal(item.section, 'modules');
  assert.equal(navigation.sectionForPath('/admin/settings/remote'), 'modules');
  assert.equal(navigation.SECTIONS[navigation.sectionForPath('/admin/settings/remote')].path, '/admin/modules');
});
