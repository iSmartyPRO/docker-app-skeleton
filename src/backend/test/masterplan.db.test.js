import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

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
const extraProjects = [];

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
  for (const id of [projectId, ...extraProjects].filter(Boolean)) await db.query(`DELETE FROM mp_projects WHERE id = $1`, [id]);
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

test('database: expiry vs extension, reserve limit race, rights before the version check', { skip }, async () => {
  const [adminId, aId, bId] = await setup();
  const { mpSettings } = await import('../modules/masterplan/access.js');
  const { createProject } = await import('../modules/masterplan/projects.js');
  const { bulkCreate } = await import('../modules/masterplan/nodes.js');
  const { changeStatus, expireBooking, extendBooking } = await import('../modules/masterplan/sales.js');
  const settings = await mpSettings();
  const ctxOf = (userId, roles, extra = {}) => ({ userId, globalRoles: new Set(roles), isAdmin: roles.includes('admin'), assignments: [], settings: { ...settings, reserveLimit: 0, ...extra }, request: null });
  const admin = ctxOf(adminId, ['admin']);
  const project = await createProject(admin, { name: `DBTEST2 ${Date.now()}`, currency: 'USD' });
  extraProjects.push(project.id);
  const { rows: types } = await db.query(`SELECT id FROM mp_types WHERE key = 'cottage'`);
  const { ids } = await bulkCreate(admin, { projectId: project.id, kind: 'object', typeId: types[0].id, prefix: 'X-', from: 1, count: 5, unit: { price: 1000 } });

  // Finding 1: a timer extended after the job picked it is not released.
  const a = ctxOf(aId, ['sales']);
  await changeStatus(a, ids[0], { to: 'reserve' });
  const { rows: held } = await db.query(`SELECT booking_id FROM mp_units WHERE node_id = $1`, [ids[0]]);
  const bookingId = held[0].booking_id;
  await db.query(`UPDATE mp_bookings SET ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [bookingId]);
  // An extension holds the unit's lock while the job runs; the job waits, then sees the new end.
  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT 1 FROM mp_units WHERE node_id = $1 FOR UPDATE`, [ids[0]]);
    const expiring = expireBooking(bookingId, new Date());
    await new Promise((resolve) => setTimeout(resolve, 200));
    await client.query(`UPDATE mp_bookings SET ends_at = NOW() + INTERVAL '1 day' WHERE id = $1`, [bookingId]);
    await client.query('COMMIT');
    assert.equal(Boolean(await expiring), false, 'the extended timer is not expired');
  } finally {
    client.release();
  }
  const { rows: after } = await db.query(`SELECT u.status, b.status AS b_status FROM mp_units u JOIN mp_bookings b ON b.id = u.booking_id WHERE u.node_id = $1`, [ids[0]]);
  assert.deepEqual(after[0], { status: 'reserve', b_status: 'active' });
  // Expiry and an extension at the same moment: no deadlock, one of them wins.
  await db.query(`UPDATE mp_bookings SET ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [bookingId]);
  const head = ctxOf(adminId, ['sales_head']);
  const race = await Promise.allSettled([expireBooking(bookingId, new Date()), extendBooking(head, ids[0], {})]);
  for (const item of race) if (item.status === 'rejected') assert.notEqual(item.reason.code, '40P01', 'no deadlock');

  // Finding 14: two reserves by one manager at once with a limit of one — one passes.
  const limited = ctxOf(bId, ['sales'], { reserveLimit: 1 });
  const results = await Promise.allSettled([changeStatus(limited, ids[1], { to: 'reserve' }), changeStatus(limited, ids[2], { to: 'reserve' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'RESERVE_LIMIT');

  // Finding 2: someone without status rights learns nothing from a stale version.
  const foreman = ctxOf(aId, ['foreman']);
  await assert.rejects(changeStatus(foreman, ids[1], { to: 'reserve', version: 0 }), (err) => err.code === 'FORBIDDEN' && !err.details);
  await assert.rejects(extendBooking(foreman, ids[0], { version: 0 }), (err) => err.code === 'FORBIDDEN' && !err.details);

  // Finding 16: closing sales of a sold unit keeps its contract.
  await db.query(`UPDATE mp_units SET status = 'sold', contract_number = 'C-1', contract_amount = 900, paid_amount = 900 WHERE node_id = $1`, [ids[3]]);
  await changeStatus(admin, ids[3], { to: 'not_for_sale', reason: 'test' });
  const { rows: closed } = await db.query(`SELECT status, contract_number FROM mp_units WHERE node_id = $1`, [ids[3]]);
  assert.deepEqual(closed[0], { status: 'not_for_sale', contract_number: 'C-1' });
});

test('database: late reports do not lower progress, a report is reviewed once', { skip }, async () => {
  const [adminId] = await setup();
  const { mpSettings } = await import('../modules/masterplan/access.js');
  const { createProject } = await import('../modules/masterplan/projects.js');
  const { bulkCreate } = await import('../modules/masterplan/nodes.js');
  const { createReport, reviewReport } = await import('../modules/masterplan/construction.js');
  const settings = await mpSettings();
  const admin = { userId: adminId, globalRoles: new Set(['admin']), isAdmin: true, assignments: [], settings, request: null };
  const project = await createProject(admin, { name: `DBTEST3 ${Date.now()}`, currency: 'USD' });
  extraProjects.push(project.id);
  const { rows: types } = await db.query(`SELECT id FROM mp_types WHERE key = 'cottage'`);
  const { ids } = await bulkCreate(admin, { projectId: project.id, kind: 'object', typeId: types[0].id, prefix: 'R-', from: 1, count: 1 });
  const { rows: stages } = await db.query(`SELECT id FROM mp_stages WHERE set_key = 'lowrise' AND archived_at IS NULL ORDER BY sort, id LIMIT 1`);
  const stageId = stages[0].id;
  const percent = async () => Number((await db.query(`SELECT percent FROM mp_node_stages WHERE node_id = $1 AND stage_id = $2`, [ids[0], stageId])).rows[0]?.percent);

  // Finding 6: a backdated report does not move the stage back; a newer one does move it.
  await createReport(admin, { projectId: project.id, nodeIds: [ids[0]], stageId, percent: 60, factDate: '2026-10-10' });
  assert.equal(await percent(), 60);
  await createReport(admin, { projectId: project.id, nodeIds: [ids[0]], stageId, percent: 30, factDate: '2026-10-01' });
  assert.equal(await percent(), 60, 'an older fact does not lower progress');
  await createReport(admin, { projectId: project.id, nodeIds: [ids[0]], stageId, percent: 70, factDate: '2026-10-12' });
  assert.equal(await percent(), 70);

  // Finding 11: two moderators publish one draft at the same moment — it is published once.
  const draft = await createReport(admin, { projectId: project.id, nodeIds: [ids[0]], stageId, percent: 80, factDate: '2026-10-13', submit: false });
  assert.equal(draft.status, 'draft');
  const results = await Promise.allSettled([reviewReport(admin, draft.id, { action: 'publish' }), reviewReport(admin, draft.id, { action: 'publish' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'ALREADY_PUBLISHED');
  assert.equal(await percent(), 80);
});

test('package: migration 001 adopts an existing schema and changes nothing the second time', { skip }, async () => {
  db ||= await import('../config/database.js');
  const { createMasterplanSchema, ensureMasterplanSchema } = await import('../modules/masterplan/schema.js');
  await ensureMasterplanSchema();
  const snapshot = async () => ({
    tables: (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename LIKE 'mp\\_%' ORDER BY 1`)).rows.map((row) => row.tablename),
    columns: Number((await db.query(`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name LIKE 'mp\\_%'`)).rows[0].n),
    directories: (await db.query(`SELECT (SELECT COUNT(*) FROM mp_types)::int AS types, (SELECT COUNT(*) FROM mp_stages)::int AS stages`)).rows[0],
  });
  const before = await snapshot();
  // As the package installer runs it: inside one transaction, through the migration's db.
  await db.withTransaction((client) => createMasterplanSchema({ query: (text, params) => client.query(text, params) }));
  assert.deepEqual(await snapshot(), before);
  assert.ok(before.tables.includes('mp_units') && before.directories.types > 0);
});
