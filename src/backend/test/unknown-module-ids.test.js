import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_IDS, keepUnknownModules, resolveModules, sanitizeModules } from '../modules/catalog.js';
import { keepUnknownPermissions, normalizePermissions } from '../services/permissions.js';
import { cleanScopes, keepUnknownScopes } from '../api/scopes.js';

/*
 * Stored data of modules this core does not know (a package not installed yet, removed, or that
 * failed to load) survives an edit: module settings, role permissions, API token / template scopes.
 * module-packages.db.test.js runs the same through updateAdminSettings, updateRole and the API.
 */

const GHOST = 'ghostmod';

test('the ghost id is not in the catalog of this test run', () => {
  assert.equal(MODULE_IDS.includes(GHOST), false);
});

test('module settings: a save keeps stored entries of unknown ids, unchanged', () => {
  const stored = {
    [GHOST]: { enabled: true, settings: { stageMap: { 12: 'deposit' }, currency: 'KGS' } },
    folderaccess: { enabled: true, settings: { orgCode: 'wh' } },
    tasks: { enabled: false },
  };
  const parsed = resolveModules(stored);
  assert.equal(parsed[GHOST], undefined, 'not handed out to the app');
  const next = keepUnknownModules(stored, sanitizeModules(parsed, { tasks: { enabled: true } }));
  assert.deepEqual(next[GHOST], stored[GHOST]);
  assert.deepEqual(next.folderaccess, stored.folderaccess, 'drive/access migration still finds the old block');
  assert.equal(next.tasks.enabled, true);
  // Known ids: the sanitized entry wins over the stored one.
  const again = keepUnknownModules({ tasks: { enabled: 'junk' } }, { tasks: { enabled: false, settings: {} } });
  assert.deepEqual(again.tasks, { enabled: false, settings: {} });
  // Nothing odd is carried.
  assert.deepEqual(keepUnknownModules(null, { tasks: { enabled: true } }), { tasks: { enabled: true } });
  assert.deepEqual(keepUnknownModules(['x'], { tasks: { enabled: true } }), { tasks: { enabled: true } });
  assert.equal(Object.hasOwn(keepUnknownModules(JSON.parse('{"__proto__":{"x":1}}'), {}), '__proto__'), false);
});

// Employees is built into this core (Procurement, the earlier example, is a package now).
test('role permissions: an edit keeps stored permissions of unknown modules', () => {
  const stored = [`${GHOST}.sales`, 'tasks.admin', 'employees.admin'];
  const edited = normalizePermissions(['tasks.admin']);
  assert.deepEqual(keepUnknownPermissions(stored, edited), [`${GHOST}.sales`, 'tasks.admin'].sort());
  // A known permission removed by the edit stays removed; "*" is never carried.
  assert.equal(keepUnknownPermissions(['*', 'employees.admin'], ['tasks.admin']).includes('*'), false);
  assert.deepEqual(keepUnknownPermissions(null, ['tasks.admin']), ['tasks.admin']);
});

test('API scopes: an edit keeps stored scopes of unknown areas; bad values are not carried', () => {
  const stored = { [GHOST]: 'read', employees: 'write', other: 'admin' };
  const next = keepUnknownScopes(stored, cleanScopes({ employees: 'read' }, { partial: true }));
  assert.deepEqual(next, { [GHOST]: 'read', employees: 'read' });
  assert.deepEqual(keepUnknownScopes(JSON.stringify(stored), { employees: 'none' }), { [GHOST]: 'read', employees: 'none' });
  assert.deepEqual(keepUnknownScopes('not json', { employees: 'none' }), { employees: 'none' });
  assert.deepEqual(keepUnknownScopes(undefined, { employees: 'none' }), { employees: 'none' });
});

test('dashboard: a saved layout (personal or default) keeps stored widgets of types not available now', async () => {
  const { mergeParked } = await import('../modules/dashboard/widgets.js');
  const stored = [
    { id: 'a', type: 'myTasks', w: 4, h: 4 },
    { id: 'g', type: `${GHOST}.board`, w: 6, h: 4, settings: { x: 1 } },
  ];
  const sent = [{ id: 'b', type: 'agenda', w: 4, h: 4 }, { id: 'h', type: `${GHOST}.sneaky`, w: 4, h: 4 }];
  const saved = mergeParked(sent, stored, ['myTasks', 'agenda']);
  assert.deepEqual(saved.map((widget) => widget.id), ['b', 'g'], 'myTasks removed by the edit; the ghost widget kept; an unavailable sent type dropped');
  assert.deepEqual(saved[1].settings, { x: 1 });
  assert.deepEqual(mergeParked(sent, null, ['agenda']).map((widget) => widget.id), ['b']);
});
