import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { sourcePackage } from './helpers/modules.js';

// The File server is a module package: its catalog entry first — api/scopes.js reads the module ids once, at
// import, and the module's own files import it (as catalog.js does at boot for a package found on disk).
const { MODULE_CATALOG } = await import('../modules/catalog.js');
const { platformCatalogEntry } = await import('../platform/packages/manifestFile.js');
if (!MODULE_CATALOG.some((entry) => entry.id === 'drive')) {
  MODULE_CATALOG.push(platformCatalogEntry({ id: 'drive', permissions: ['drive.admin', 'drive.audit', 'drive.access'], settings: { defaultEnabled: false, defaults: {}, public: [] } }));
}
const drive = await sourcePackage('drive');
const { moduleRouter } = await import('../modules/index.js');
const { endpoints, mountPathOf } = await import('../api/introspect.js');
const { resetLoader, setLoadedForTests } = await import('../platform/packages/loader.js');

after(() => resetLoader());

/* The API reference reads nested routers too: the File server's «Доступ» lives in router.use('/access', …). */

test('mount paths of nested routers are read back from Express layers', () => {
  const outer = express.Router();
  const inner = express.Router();
  outer.use('/access', inner);
  outer.use('/a.b/:id/x-y', inner);
  outer.use(inner);
  outer.use(/^\/re(gex)?/, inner);
  assert.deepEqual(outer.stack.map(mountPathOf), ['/access', '/a.b/:id/x-y', '', null]);
});

test('the API reference lists the File server access routes', async () => {
  moduleRouter();
  // Its routes are listed once it is loaded (loader.js packageMounts).
  setLoadedForTests({ id: 'drive', version: drive.version, manifest: { name: { en: 'File server', ru: 'Файловый сервер' } }, router: drive.routes() });
  const list = endpoints();
  const keys = new Set(list.map((endpoint) => `${endpoint.method} ${endpoint.path}`));
  for (const key of ['GET /app/drive/access/at', 'GET /app/drive/access/folders/:key', 'POST /app/drive/access/members', 'POST /app/drive/access/journal/:id/undo', 'GET /app/drive/access/ntfs/acl', 'POST /app/drive/access/ntfs/apply']) {
    assert.ok(keys.has(key), key);
  }
  const at = list.find((endpoint) => endpoint.path === '/app/drive/access/at');
  assert.equal(at.section, 'drive');
  assert.equal(at.level, 'read');
  assert.equal(list.find((endpoint) => endpoint.path === '/app/drive/access/members').level, 'write');
  // The File server's own routes are still there, once.
  assert.equal(list.filter((endpoint) => endpoint.method === 'GET' && endpoint.path === '/app/drive/shares/:id/list').length, 1);
});

test('folders without access stay listed for access managers only', async () => {
  const { shownShares } = await import('../modules/drive/service.js');
  const shares = [{ id: 1, state: 'ok' }, { id: 2, state: 'denied' }, { id: 3, state: 'missing' }, { id: 4, state: 'auth' }];
  assert.deepEqual(shownShares(shares, { hideDenied: true, isAdmin: false }).map((share) => share.id), [1, 4]);
  assert.deepEqual(shownShares(shares, { hideDenied: true, isAdmin: false, keepDenied: true }).map((share) => share.id), [1, 2, 3, 4]);
  assert.deepEqual(shownShares(shares, { hideDenied: true, isAdmin: true }).map((share) => share.id), [1, 2, 3, 4]);
  assert.deepEqual(shownShares(shares, { hideDenied: false, isAdmin: false }).map((share) => share.id), [1, 2, 3, 4]);
});
