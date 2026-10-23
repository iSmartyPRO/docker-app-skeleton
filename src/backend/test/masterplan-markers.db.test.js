import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

/*
 * Point markers against a test database (never production!):
 *
 *   MASTERPLAN_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/masterplan-markers.db.test.js
 *
 * Skipped without MASTERPLAN_DB_TEST, so `npm test` stays database-free.
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

test('database: point markers — admins only, one placement per object per plan, contour ↔ point', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureMasterplanSchema } = await import('../modules/masterplan/schema.js');
  await ensureMasterplanSchema();
  // Idempotent: a second run of the schema changes nothing.
  await ensureMasterplanSchema();
  const { updateAdminSettings } = await import('../services/settings.js');
  await updateAdminSettings({ modules: { masterplan: { enabled: true } } });
  const { rows: users } = await db.query(`SELECT id FROM users WHERE is_active IS NOT FALSE ORDER BY id LIMIT 3`);
  assert.ok(users.length >= 2, 'the test database needs two users');
  const [adminId, otherId] = users.map((row) => row.id);

  const { mpSettings } = await import('../modules/masterplan/access.js');
  const { createProject, createPlan, projectMap, saveContours } = await import('../modules/masterplan/projects.js');
  const { createNode, bulkCreate } = await import('../modules/masterplan/nodes.js');
  const { saveMarkers } = await import('../modules/masterplan/markers.js');
  const settings = await mpSettings();
  const ctxOf = (userId, roles, assignments = []) => ({ userId, globalRoles: new Set(roles), isAdmin: roles.includes('admin'), assignments, settings, request: null });
  const admin = ctxOf(adminId, ['admin']);

  const project = await createProject(admin, { name: `MKTEST ${Date.now()}`, currency: 'USD' });
  projects.push(project.id);
  const other = await createProject(admin, { name: `MKTEST other ${Date.now()}`, currency: 'USD' });
  projects.push(other.id);
  const { rows: types } = await db.query(`SELECT id FROM mp_types WHERE key = 'cottage'`);
  const sector = await createNode(admin, { projectId: project.id, kind: 'level', levelKey: 'sector', code: 'MK-S' });
  const { ids } = await bulkCreate(admin, { projectId: project.id, parentId: sector.id, kind: 'object', typeId: types[0].id, prefix: 'MK-', from: 1, count: 4, unit: { price: 1000 } });
  const foreign = await createNode(admin, { projectId: other.id, kind: 'object', typeId: types[0].id, code: 'MK-X' });
  const plan = await createPlan(admin, project.id, { width: 3350, height: 2000, name: 'points' });

  // Permission: only administrators of the project (global or assigned on the whole project).
  for (const ctx of [ctxOf(otherId, ['sales']), ctxOf(otherId, ['executive']), ctxOf(otherId, [], [{ projectId: project.id, nodeId: null, role: 'sales_head' }])]) {
    await assert.rejects(saveMarkers(ctx, plan.id, { markers: [{ nodeId: ids[0], x: 10, y: 10 }] }), (err) => err.status === 403 || err.statusCode === 403 || err.code === 'FORBIDDEN');
  }
  const assigned = ctxOf(otherId, [], [{ projectId: project.id, nodeId: null, role: 'admin' }]);
  assert.equal((await saveMarkers(assigned, plan.id, { markers: [{ nodeId: ids[0], x: 100, y: 100, r: 'M' }] })).changed, 1);

  // Validation: bounds, size, levels, nodes of another project, duplicates in one call; all or nothing.
  const bad = (markers, code) => assert.rejects(saveMarkers(admin, plan.id, { markers }), (err) => err.code === code, JSON.stringify(markers));
  await bad([{ nodeId: ids[1], x: 3351, y: 10 }], 'INVALID_MARKER');
  await bad([{ nodeId: ids[1], x: 10, y: -1 }], 'INVALID_MARKER');
  await bad([{ nodeId: ids[1], x: 10, y: 10, r: 1 }], 'INVALID_MARKER');
  await bad([{ nodeId: ids[1], x: 10, y: 10, r: 999 }], 'INVALID_MARKER');
  await bad([{ nodeId: sector.id, x: 10, y: 10 }], 'INVALID_MARKER');
  await bad([{ nodeId: foreign.id, x: 10, y: 10 }], 'INVALID_FIELD');
  await bad([{ nodeId: ids[1], x: 10, y: 10 }, { nodeId: ids[1], x: 20, y: 20 }], 'DUPLICATE');
  await bad([{ nodeId: ids[2], x: 10, y: 10 }, { nodeId: ids[3], x: 99999, y: 10 }], 'INVALID_MARKER');
  const { rows: none } = await db.query(`SELECT COUNT(*)::int AS n FROM mp_markers WHERE node_id = ANY($1::int[])`, [[ids[1], ids[2], ids[3]]]);
  assert.equal(none[0].n, 0, 'nothing saved from a refused batch');

  // One marker per object per plan: saving again moves it.
  await saveMarkers(admin, plan.id, { markers: [{ nodeId: ids[0], x: 200, y: 150, r: 30, label: '1а' }] });
  const { rows: one } = await db.query(`SELECT x, y, r, label FROM mp_markers WHERE plan_id = $1 AND node_id = $2`, [plan.id, ids[0]]);
  assert.deepEqual(one, [{ x: 200, y: 150, r: 30, label: '1а' }]);

  // Bulk placement: 3 at once.
  const bulk = await saveMarkers(admin, plan.id, { markers: [1, 2, 3].map((i) => ({ nodeId: ids[i], x: 300 + i * 40, y: 500 })) });
  assert.equal(bulk.changed, 3);
  assert.equal(bulk.markers.length, 3);

  // A contour replaces the point; a point replaces the contour.
  await saveContours(admin, plan.id, { contours: [{ nodeId: ids[1], points: [[300, 480], [380, 480], [380, 520], [300, 520]] }] });
  let map = await projectMap(admin, project.id);
  assert.ok(map.contours.some((item) => item.nodeId === ids[1]));
  assert.ok(!map.markers.some((item) => item.nodeId === ids[1]), 'the contour replaced the point');
  await saveMarkers(admin, plan.id, { markers: [{ nodeId: ids[1], x: 340, y: 500 }] });
  map = await projectMap(admin, project.id);
  assert.ok(!map.contours.some((item) => item.nodeId === ids[1]), 'the point replaced the contour');
  assert.deepEqual(map.markers.find((item) => item.nodeId === ids[1]), { planId: plan.id, nodeId: ids[1], x: 340, y: 500, r: 26.8, label: null });

  // Removal; readers see markers in the map (a manager has no configure right but sees the plan).
  await saveMarkers(admin, plan.id, { markers: [{ nodeId: ids[3], remove: true }] });
  const viewer = ctxOf(otherId, ['sales']);
  map = await projectMap(viewer, project.id);
  assert.deepEqual(map.markers.map((item) => item.nodeId).sort((a, b) => a - b), [ids[0], ids[1], ids[2]].sort((a, b) => a - b));

  // The history records the change; deleting the plan or the node removes its markers.
  const { rows: events } = await db.query(`SELECT data FROM mp_events WHERE project_id = $1 AND kind = 'contours' ORDER BY id`, [project.id]);
  assert.ok(events.some((row) => row.data.markers === 1 && row.data.removed === 1));
  await db.query(`DELETE FROM mp_nodes WHERE id = $1`, [ids[2]]);
  const { rows: left } = await db.query(`SELECT COUNT(*)::int AS n FROM mp_markers WHERE plan_id = $1`, [plan.id]);
  assert.equal(left[0].n, 2);
});
