import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

/*
 * The API reference and openapi.json list the routes of installed module
 * packages (loader.js packageMounts), not only the built-in modules
 * (modules/index.js MOUNTED): a package with a section in reference.js (QR)
 * lands there, one without gets a section named after its manifest.
 */

const { MODULE_CATALOG } = await import('../modules/catalog.js');
const { platformCatalogEntry } = await import('../platform/packages/manifestFile.js');
// What catalog.js does at boot for a package found on disk (scopes.js reads the ids once).
if (!MODULE_CATALOG.some((entry) => entry.id === 'hellopkg')) {
  MODULE_CATALOG.push(platformCatalogEntry({ id: 'hellopkg', permissions: [], settings: { defaultEnabled: false, defaults: {}, public: [] } }));
}
const { setLoadedForTests, resetLoader } = await import('../platform/packages/loader.js');
const { endpoints, referenceSections } = await import('../api/introspect.js');
const { openApi } = await import('../api/openapi.js');
const { moduleRouter } = await import('../modules/index.js');

after(() => resetLoader());

function router(paths) {
  const r = express.Router();
  const nested = express.Router();
  nested.get('/:id', (req, res) => res.json({}));
  for (const [method, path] of paths) r[method](path, (req, res) => res.json({}));
  r.use('/nested', nested);
  return r;
}

test('package routes appear in the reference once the package is loaded', () => {
  moduleRouter();
  const before = endpoints();
  assert.ok(!before.some((endpoint) => endpoint.path.startsWith('/app/hellopkg')), 'nothing before the package loads');
  assert.ok(!referenceSections().some((section) => section.key === 'hellopkg'));

  setLoadedForTests({ id: 'hellopkg', version: '1.0.0', manifest: { name: { en: 'Hello', ru: 'Привет' } }, router: router([['get', '/items'], ['post', '/items'], ['get', '/items/:id']]) });
  setLoadedForTests({ id: 'qr', version: '1.0.0', manifest: { name: { en: 'QR codes' } }, router: router([['get', '/codes']]) });
  const list = endpoints();
  assert.notEqual(list, before, 'the cache follows the loaded packages');
  const byKey = new Map(list.map((endpoint) => [`${endpoint.method} ${endpoint.path}`, endpoint]));
  for (const key of ['GET /app/hellopkg/items', 'POST /app/hellopkg/items', 'GET /app/hellopkg/items/:id', 'GET /app/hellopkg/nested/:id', 'GET /app/qr/codes']) assert.ok(byKey.has(key), key);
  const items = byKey.get('GET /app/hellopkg/items');
  assert.equal(items.section, 'hellopkg');
  assert.equal(items.area, 'hellopkg');
  assert.equal(items.level, 'read');
  assert.equal(byKey.get('POST /app/hellopkg/items').level, 'write');
  assert.equal(byKey.get('GET /app/qr/codes').section, 'qr', 'the hand-written QR section is used');
  // Built-in routes are still there.
  assert.ok(byKey.has('GET /app/files/spaces/:id/files'));

  const sections = referenceSections();
  const own = sections.find((section) => section.key === 'hellopkg');
  assert.deepEqual(own.title, { en: 'Hello', ru: 'Привет' });
  assert.equal(sections.filter((section) => section.key === 'qr').length, 1, 'no second QR section');
  assert.ok(sections.findIndex((section) => section.key === 'hellopkg') < sections.findIndex((section) => section.key === 'admin.users'), 'before the administration sections');

  const spec = openApi({ origin: 'http://portal.test', lang: 'ru' });
  assert.ok(spec.paths['/app/hellopkg/items'].get && spec.paths['/app/hellopkg/items'].post);
  assert.ok(spec.paths['/app/hellopkg/items/{id}'].get);
  assert.deepEqual(spec.paths['/app/hellopkg/items'].get.tags, ['Привет']);
  assert.equal(spec.paths['/app/hellopkg/items'].get['x-scope'], 'hellopkg:read');
  assert.ok(spec.tags.some((tag) => tag.name === 'Привет'));
  assert.ok(spec.paths['/app/qr/codes'].get);

  resetLoader();
  assert.ok(!endpoints().some((endpoint) => endpoint.path.startsWith('/app/hellopkg')), 'gone with the package');
});
