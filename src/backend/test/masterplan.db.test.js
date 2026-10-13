import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Database integration of the Masterplan module: optimistic locking under a
 * real race, zones of responsibility on the journal, the expiry job.
 * Needs a test database (never production!):
 *
 *   MASTERPLAN_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/masterplan.db.test.js
 *
 * Without MASTERPLAN_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.MASTERPLAN_DB_TEST === '1';
const skip = enabled ? false : 'set MASTERPLAN_DB_TEST=1 and a test database to run';

let db = null;
let projectId = null;

async function setup() {
  db = await import('../config/database.js');
  const { ensureMasterplanSchema } = await import('../modules/masterplan/schema.js');
  await ensureMasterplanSchema();
  const { updateAdminSettings } = await import('../services/settings.js');
  await updateAdminSettings({ modules: { masterplan: { enabled: true } } });
  const { rows } = await db.query(`SELECT id FROM users WHERE is_active IS NOT FALSE ORDER BY id LIMIT 4`);
  assert.ok(rows.length >= 3, 'the test database needs three users');
  return rows.map((row) => row.id);
}

after(async () => {
  if (!db) return;
  if (projectId) await db.query(`DELETE FROM mp_projects WHERE id = $1`, [projectId]);
  await db.closePool();
});

test('database: double booking, zones, expiry job', { skip }, async () => {
  const [adminId, aId, bId] = await setup();
  const { mpSettings } = await import('../modules/masterplan/access.js');
  const { createProject } = await import('../modules/masterplan/projects.js');
  const { createNode, bulkCreate } = await import('../modules/masterplan/nodes.js');
  const { changeStatus, runBookingTimers } = await import('../modules/masterplan/sales.js');
  const { createReport } = await import('../modules/masterplan/construction.js');
  const settings = await mpSettings();
  const ctxOf = (userId, roles, assignments = []) => ({ userId, globalRoles: new Set(roles), isAdmin: roles.includes('admin'), assignments, settings: { ...settings, reserveLimit: 0 }, request: null });
  const admin = ctxOf(adminId, ['admin']);
  const project = await createProject(admin, { name: `DBTEST ${Date.now()}`, currency: 'USD' });
  projectId = project.id;
  const { rows: types } = await db.query(`SELECT id, key FROM mp_types WHERE key IN ('cottage')`);
  const sector = await createNode(admin, { projectId, kind: 'level', levelKey: 'sector', code: 'S-A' });
  const sectorB = await createNode(admin, { projectId, kind: 'level', levelKey: 'sector', code: 'S-B' });
  const { ids } = await bulkCreate(admin, { projectId, parentId: sector.id, kind: 'object', typeId: types[0].id, prefix: 'T-', from: 1, count: 3, unit: { price: 1000 } });
  const { ids: idsB } = await bulkCreate(admin, { projectId, parentId: sectorB.id, kind: 'object', typeId: types[0].id, prefix: 'TB-', from: 1, count: 1 });

  // Two managers, the same version, at the same moment: one reserve.
  const a = ctxOf(aId, ['sales']);
  const b = ctxOf(bId, ['sales']);
  const results = await Promise.allSettled([changeStatus(a, ids[0], { to: 'reserve', version: 1 }), changeStatus(b, ids[0], { to: 'reserve', version: 1 })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected').reason;
  assert.equal(rejected.code, 'VERSION_CONFLICT');
  assert.match(rejected.message, /^Объект только что забронирован менеджером /);
  assert.ok(rejected.details.holder.manager.id === aId || rejected.details.holder.manager.id === bId);
  const { rows: bookings } = await db.query(`SELECT COUNT(*)::int AS n FROM mp_bookings WHERE unit_id = $1 AND status = 'active'`, [ids[0]]);
  assert.equal(bookings[0].n, 1, 'one timer');

  // A foreman of sector A: reports in A, refused in B.
  const foreman = ctxOf(aId, [], [{ projectId, nodeId: sector.id, role: 'foreman' }]);
  const report = await createReport(foreman, { projectId, nodeIds: [ids[1]], percent: 50 });
  assert.equal(report.status, 'published');
  await assert.rejects(createReport(foreman, { projectId, nodeIds: [idsB[0]], percent: 50 }), (err) => err.code === 'OUT_OF_ZONE');

  // The expiry job frees a reserve whose time is over.
  await changeStatus(b, ids[2], { to: 'reserve' });
  await db.query(`UPDATE mp_bookings SET ends_at = NOW() - INTERVAL '1 minute' WHERE unit_id = $1 AND status = 'active'`, [ids[2]]);
  const done = await runBookingTimers(new Date());
  assert.ok(done.expired >= 1);
  const { rows: unit } = await db.query(`SELECT status, manager_id, booking_id FROM mp_units WHERE node_id = $1`, [ids[2]]);
  assert.deepEqual(unit[0], { status: 'free', manager_id: null, booking_id: null });
  const { rows: events } = await db.query(`SELECT kind FROM mp_events WHERE node_id = $1 ORDER BY id DESC LIMIT 1`, [ids[2]]);
  assert.equal(events[0].kind, 'expired');
});
