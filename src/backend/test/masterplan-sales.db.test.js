import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Database integration of the Masterplan additions: status migration by an
 * administrator (bypass, no expiry, history, optimistic locking, import),
 * bulk move of nodes, the price grid. Needs a test database (never production!):
 *
 *   MASTERPLAN_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/masterplan-sales.db.test.js
 */

const enabled = process.env.MASTERPLAN_DB_TEST === '1';
const skip = enabled ? false : 'set MASTERPLAN_DB_TEST=1 and a test database to run';

let db = null;
const projects = [];

after(async () => {
  if (!db) return;
  for (const id of projects) await db.query(`DELETE FROM mp_projects WHERE id = $1`, [id]);
  await db.closePool();
});

test('database: migration, bulk move, price grid', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureMasterplanSchema } = await import('../modules/masterplan/schema.js');
  await ensureMasterplanSchema();
  const { updateAdminSettings } = await import('../services/settings.js');
  await updateAdminSettings({ modules: { masterplan: { enabled: true } } });
  const { rows: users } = await db.query(`SELECT id, username FROM users WHERE is_active IS NOT FALSE ORDER BY id LIMIT 3`);
  const [adminId, headId] = users.map((row) => row.id);
  const { mpSettings } = await import('../modules/masterplan/access.js');
  const { createProject, getProject } = await import('../modules/masterplan/projects.js');
  const { createNode, bulkCreate, bulkMove, nodeEvents, nodeCard } = await import('../modules/masterplan/nodes.js');
  const { changeStatus, runBookingTimers } = await import('../modules/masterplan/sales.js');
  const { migrateUnit, migrateUnits } = await import('../modules/masterplan/migration.js');
  const { importUnits } = await import('../modules/masterplan/units.js');
  const { createGrid, deleteGrid, listGrids } = await import('../modules/masterplan/pricing.js');
  const { dashboard } = await import('../modules/masterplan/dashboard.js');
  const settings = await mpSettings();
  const ctxOf = (userId, roles, assignments = []) => ({ userId, globalRoles: new Set(roles), isAdmin: roles.includes('admin'), assignments, settings: { ...settings, reserveLimit: 0, requireDeal: true }, request: null });
  const admin = ctxOf(adminId, ['admin']);
  const head = ctxOf(headId, ['sales_head']);
  const project = await createProject(admin, { name: `DBTEST-SALES ${Date.now()}`, currency: 'USD' });
  projects.push(project.id);
  const { rows: types } = await db.query(`SELECT id FROM mp_types WHERE key = 'cottage'`);
  const sectorA = await createNode(admin, { projectId: project.id, kind: 'level', levelKey: 'sector', code: 'A' });
  const sectorB = await createNode(admin, { projectId: project.id, kind: 'level', levelKey: 'sector', code: 'B' });
  const { ids } = await bulkCreate(admin, { projectId: project.id, parentId: sectorA.id, kind: 'object', typeId: types[0].id, prefix: 'H', from: 1, count: 20, pad: 0, unit: { price: 193440, areaTotal: 96.72, status: 'not_for_sale' } });
  const byCode = async (code) => (await db.query(`SELECT id FROM mp_nodes WHERE project_id = $1 AND code = $2`, [project.id, code])).rows[0].id;

  // ── Migration ──
  // The normal chain refuses "Бронь" without a deal; a head of sales cannot migrate.
  const h5 = await byCode('H5');
  await assert.rejects(changeStatus(admin, h5, { to: 'booking' }), { code: 'INVALID_TRANSITION' });
  await assert.rejects(migrateUnit(head, h5, { to: 'booking', reason: 'x' }), { code: 'FORBIDDEN' });
  await assert.rejects(migrateUnit(admin, h5, { to: 'booking' }), { code: 'REASON_REQUIRED' });
  // Optimistic locking as for every status change.
  await assert.rejects(migrateUnit(admin, h5, { to: 'booking', reason: 'x', version: 99 }), { code: 'VERSION_CONFLICT' });
  const reason = 'Перенос броней с генплана продаж от 06.10.2026';
  const migrated = await migrateUnits(admin, { ids: await Promise.all(['H5', 'H8', 'H13', 'H14', 'H15', 'H18', 'H19'].map(byCode)), to: 'booking', reason, date: '06.10.2026', clientName: 'Клиент WH', managerId: headId });
  assert.equal(migrated.affected, 7);
  const h17 = await byCode('H17');
  const soldNode = await migrateUnit(admin, h17, { to: 'sold', reason, date: '2026-10-06', clientName: 'Покупатель 17', contractNumber: 'WH-17' });
  assert.equal(soldNode.unit.status, 'sold');
  assert.equal(soldNode.unit.contract.date, '2026-10-06');
  assert.equal(soldNode.unit.paidAmount, 193440);
  const { rows: held } = await db.query(`SELECT n.code, u.status, u.booking_id, u.client_name, u.manager_id, u.status_changed_at FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id WHERE u.project_id = $1 AND u.status <> 'not_for_sale' ORDER BY n.code`, [project.id]);
  assert.equal(held.length, 8);
  assert.ok(held.filter((row) => row.status === 'booking').every((row) => row.booking_id === null && row.client_name === 'Клиент WH' && row.manager_id === headId));
  // No timer: the expiry job a year later leaves them booked.
  await runBookingTimers(new Date(Date.now() + 365 * 86400000));
  const { rows: still } = await db.query(`SELECT COUNT(*)::int AS n FROM mp_units WHERE project_id = $1 AND status = 'booking'`, [project.id]);
  assert.equal(still[0].n, 7);
  // The history says "migration" with who / what / the date.
  const { events } = await nodeEvents(admin, h17);
  const ev = events.find((item) => item.kind === 'migration');
  assert.equal(ev.data.to, 'sold');
  assert.equal(ev.data.from, 'not_for_sale');
  assert.equal(ev.data.date, '2026-10-06');
  assert.equal(ev.data.reason, reason);
  assert.equal(ev.author.id, adminId);
  // After the migration the normal chain goes on (booking → deposit by the administrator).
  await changeStatus(admin, h5, { to: 'deposit' });
  // With an end date the booking has a timer and expires.
  const h1 = await byCode('H1');
  await migrateUnit(admin, h1, { to: 'reserve', reason: 'x', endsAt: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) });
  await runBookingTimers(new Date(Date.now() + 5 * 86400000));
  assert.equal((await db.query(`SELECT status FROM mp_units WHERE node_id = $1`, [h1])).rows[0].status, 'free');
  // The card offers the migration to administrators only.
  assert.equal((await nodeCard(admin, h1)).actions.migrate, true);
  assert.equal((await nodeCard(head, h1)).actions.migrate, false);
  // The dashboard counts the migrated sale in October 2026.
  const dash = await dashboard(admin, project.id);
  assert.ok(dash.months.some((m) => m.month === '2026-10' && m.sold >= 1 && m.booking >= 7));

  // Import with status, client, manager, date, contract number.
  const users2 = (await db.query(`SELECT username FROM users WHERE id = $1`, [headId])).rows[0].username;
  const rows = [
    { code: 'H2', status: 'Бронь', client: 'Импорт-клиент', manager: users2, statusDate: '01.10.2026' },
    { code: 'H3', status: 'Договор', client: 'Импорт-2', contractNumber: 'D-3', contractDate: '2026-09-30' },
  ];
  const dry = await importUnits(admin, { projectId: project.id, rows, dryRun: true });
  assert.equal(dry.ok, false, 'a migration needs a reason');
  assert.ok(dry.errors.some((e) => e.code === 'REASON_REQUIRED'));
  const bad = await importUnits(admin, { projectId: project.id, rows: [{ code: 'H4', status: 'Бронь', manager: 'nobody-such' }], dryRun: true, reason: 'x' });
  assert.ok(bad.errors.some((e) => e.code === 'UNKNOWN_MANAGER'));
  const imported = await importUnits(admin, { projectId: project.id, rows, reason: 'Импорт продаж' });
  assert.equal(imported.ok, true);
  assert.equal(imported.migrated, 2);
  const { rows: after2 } = await db.query(`SELECT n.code, u.status, u.client_name, u.manager_id, u.contract_number FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id WHERE n.code IN ('H2', 'H3') AND u.project_id = $1 ORDER BY n.code`, [project.id]);
  assert.deepEqual(after2.map((row) => [row.status, row.client_name]), [['booking', 'Импорт-клиент'], ['contract', 'Импорт-2']]);
  assert.equal(after2[0].manager_id, headId);
  assert.equal(after2[1].contract_number, 'D-3');
  // Free / not for sale of a held unit through the import is still refused.
  const refused = await importUnits(admin, { projectId: project.id, rows: [{ code: 'H2', status: 'Свободно' }], dryRun: true });
  assert.ok(refused.errors.some((e) => e.code === 'UNIT_HELD'));

  // ── Bulk move ──
  const ten = await Promise.all(Array.from({ length: 10 }, (_, i) => byCode(`H${i + 1}`)));
  await assert.rejects(bulkMove(head, { ids: ten, parentId: sectorB.id }), { code: 'FORBIDDEN' });
  await assert.rejects(bulkMove(admin, { ids: [sectorA.id, ...ten], parentId: ten[0] }), { code: 'INVALID_PARENT' }, 'not into its own subtree');
  const before = (await db.query(`SELECT COUNT(*)::int AS n FROM mp_nodes WHERE parent_id = $1`, [sectorA.id])).rows[0].n;
  assert.equal(before, 20, 'a refused bulk move changed nothing');
  const moved = await bulkMove(admin, { ids: ten, parentId: sectorB.id });
  assert.equal(moved.moved, 10);
  const { rows: inB } = await db.query(`SELECT id, path, depth FROM mp_nodes WHERE parent_id = $1 ORDER BY sort`, [sectorB.id]);
  assert.deepEqual(inB.map((row) => row.id), ten, 'in the order chosen');
  assert.ok(inB.every((row) => row.path[0] === sectorB.id && row.depth === 2));
  const movedEv = (await nodeEvents(admin, ten[0])).events.find((item) => item.kind === 'moved');
  assert.equal(movedEv.data.to, sectorB.id);
  assert.equal(movedEv.data.bulk, 10);
  // Moving a sector with a house of it: the house travels with the sector.
  const both = await bulkMove(admin, { ids: [sectorB.id, ten[0]], parentId: sectorA.id });
  assert.deepEqual(both.ids, [sectorB.id]);
  assert.equal((await db.query(`SELECT depth FROM mp_nodes WHERE id = $1`, [ten[0]])).rows[0].depth, 3);

  // ── Price grid ──
  await assert.rejects(createGrid(head, project.id, { effectiveFrom: '2026-10-01', plans: [{ name: '100%', mode: 'base' }] }), { code: 'FORBIDDEN' });
  const grid = await createGrid(admin, project.id, {
    effectiveFrom: '2026-10-01',
    plannedPpm: 3000,
    plans: [
      { name: '100%', mode: 'base', firstPct: 100 },
      { name: 'Рассрочка 50%', mode: 'ppm', ppm: 2200, firstPct: 50, months: 12 },
      { name: 'Рассрочка 30%', mode: 'ppm', ppm: 2500, firstPct: 30, months: 24 },
    ],
  });
  assert.equal(grid.plans.length, 3);
  const future = await createGrid(admin, project.id, { effectiveFrom: '2099-01-01', plans: [{ name: '100%', mode: 'ppm', ppm: 2600 }] });
  const shape = await getProject(admin, project.id);
  assert.equal(shape.pricing.grids.length, 1);
  assert.equal(shape.pricing.grids[0].id, grid.id, 'the future version is not in force yet');
  assert.equal(shape.pricing.upcoming, 1);
  assert.equal((await getProject(ctxOf(headId, [], [{ projectId: project.id, nodeId: null, role: 'foreman' }]), project.id)).pricing, null, 'no prices for a foreman');
  assert.equal((await listGrids(admin, project.id)).grids.length, 2);
  await deleteGrid(admin, future.id);
  assert.equal((await listGrids(admin, project.id)).grids.length, 1);
  const trend = (await dashboard(admin, project.id)).prices;
  assert.ok(trend.points.length >= 1, 'units created today have only today’s point');
  assert.equal(trend.points[trend.points.length - 1].ppm, 2000);
  assert.equal(trend.planned.ppm, 3000);
  assert.deepEqual(trend.grids[0].plans.map((p) => p.ppm), [2200, 2500]);
});
