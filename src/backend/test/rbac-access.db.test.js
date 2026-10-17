import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * getUserAccess reads roles, groups and the person's memberships in one
 * round trip (it runs on every signed-in request). It must give exactly what
 * the multi-query path (getAccessMap) gives, for every user, on the pool and
 * on a transaction client. Needs a test database (never production!):
 *
 *   CORE_SECURITY_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/rbac-access.db.test.js
 *
 * It only reads, so it also runs whenever any other database flag (NAME_DB_TEST) is 1: every database run
 * of any module checks it (CONTRIBUTING.md).
 */

const enabled = Object.entries(process.env).some(([name, value]) => /_DB_TEST$/.test(name) && value === '1');
const skip = enabled ? false : 'set CORE_SECURITY_DB_TEST=1 (or any other database flag) and a test database to run';

let db = null;
after(async () => {
  if (db) await db.closePool();
});

test('database: single-query getUserAccess equals the multi-query access map', { skip }, async () => {
  db = await import('../config/database.js');
  const rbac = await import('../services/rbac.js');
  const { rows } = await db.query(`SELECT id FROM users ORDER BY id`);
  assert.ok(rows.length > 0, 'the test database has users');
  const ids = rows.map((row) => row.id);
  const reference = await rbac.getAccessMap(ids);
  let withRoles = 0;
  for (const id of ids) {
    const access = await rbac.getUserAccess(id);
    assert.deepEqual(access, reference.get(id), `user ${id}`);
    if (access.roles.length) withRoles += 1;
  }
  assert.ok(withRoles > 0, 'some users hold roles');
  // On a transaction client too (user edits read access inside their transaction).
  await db.withTransaction(async (client) => {
    assert.deepEqual(await rbac.getUserAccess(ids[0], client), reference.get(ids[0]));
  });
  // Someone with no roles or groups at all.
  assert.deepEqual(await rbac.getUserAccess(-1), { roleIds: [], groupIds: [], roles: [], groups: [], permissions: [] });
});

test('database: the parsed settings view is shared, frozen and follows invalidation', { skip }, async () => {
  db = await import('../config/database.js');
  const settings = await import('../services/settings.js');
  const first = await settings.getSettingsView();
  assert.equal(await settings.getSettingsView(), first, 'parsed once while the raw cache lives');
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.modules) && Object.isFrozen(first.rateLimit));
  assert.throws(() => {
    first.modules.kb = null;
  }, TypeError);
  // Same contents as a fresh parse; editors still get their own mutable copy.
  const copy = settings.parseSettings(await settings.getSettings());
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(copy)));
  copy.modules.kb = null;
  assert.notEqual((await settings.getSettingsView()).modules.kb, null);
  settings.invalidateSettings();
  assert.notEqual(await settings.getSettingsView(), first, 'a saved setting is seen at once');
});
