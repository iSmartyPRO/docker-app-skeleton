import '../test-fixtures/test-env.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'fs/promises';
import { resolve } from 'path';

/*
 * Demo data of the business modules (CRM, Masterplan, Contracts,
 * Procurement, Warehouse) against a real database: each seeds once (a
 * second seed is a no-op), the modules link to each other's demo records,
 * the approvals they start wait for the administrator, a failed seed takes
 * back everything (also the append-only warehouse journal), and the purge
 * leaves nothing — rows, approval routes and processes, files on disk.
 * Needs a test database (never production!) with a superadministrator:
 *
 *   DEMO_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/business-demo.db.test.js
 *
 * Without DEMO_DB_TEST it is skipped, so `npm test` stays database-free.
 * Only these modules' demo data is touched (other modules' demo stays).
 */

const enabled = process.env.DEMO_DB_TEST === '1';
const skip = enabled ? false : 'set DEMO_DB_TEST=1 and a test database to run';

const MODULES = ['companies', 'crm', 'masterplan', 'contracts', 'procurement', 'warehouse'];

let db = null;
let demo = null;
let req = null;
let uploadRoot = null;

async function setup() {
  if (db) return;
  db = await import('../config/database.js');
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  // Masterplan is a module package: from its source in the tree, as if installed (schema = its migration 001).
  const { sourcePackage } = await import('./helpers/modules.js');
  const masterplan = await sourcePackage('masterplan');
  await (await import('../modules/masterplan/schema.js')).ensureMasterplanSchema();
  await (await import('../platform/registry.js')).activateModules([masterplan]);
  demo = await import('../services/demo.js');
  ({ uploadRoot } = await import('../config/paths.js'));
  const { requestAs } = await import('../api/events.js');
  const { rows } = await db.query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN app_roles r ON r.id = ur.role_id WHERE r.key = 'superadmin' AND u.is_active ORDER BY u.id LIMIT 1`);
  assert.ok(rows[0], 'the test database needs a superadministrator');
  req = { ...(await requestAs(rows[0].id)), locale: 'ru' };
  const { updateAdminSettings } = await import('../services/settings.js');
  await updateAdminSettings({ modules: Object.fromEntries(MODULES.map((id) => [id, { enabled: true }])) });
  // Start clean: earlier runs or a person in the browser may have left these modules' demo data.
  for (const module of [...MODULES].reverse()) await demo.purgeModule(module, req);
}

const tracked = async (module, table) => (await db.query(`SELECT record_key FROM demo_records WHERE module = $1 AND table_name = $2`, [module, table])).rows.map((row) => Number(row.record_key));
const count = async (sql, params) => Number((await db.query(sql, params)).rows[0].n);
const exists = (path) => access(path).then(() => true, () => false);

after(async () => {
  if (!db) return;
  for (const module of [...MODULES].reverse()) await demo.purgeModule(module, req).catch(() => {});
  await new Promise((done) => setTimeout(done, 800));
  await db.closePool();
});

test('business demo: seeds once, links the modules, purges everything', { skip }, async () => {
  await setup();
  const order = demo.seedOrder(MODULES);
  assert.ok(order.indexOf('crm') < order.indexOf('masterplan') && order.indexOf('masterplan') < order.indexOf('contracts'), 'dependencies first');
  assert.ok(order.indexOf('contracts') < order.indexOf('procurement') && order.indexOf('procurement') < order.indexOf('warehouse'));
  for (const module of order) {
    const result = await demo.seedModule(module, req);
    assert.equal(result.already, false, `${module} seeds`);
  }
  for (const module of order) assert.equal((await demo.seedModule(module, req)).already, true, `${module}: the second seed adds nothing`);

  // CRM: two pipelines, 20 deals, overdue and today's activities.
  const deals = await tracked('crm', 'crm_deals');
  assert.equal(deals.length, 20);
  assert.equal((await tracked('crm', 'crm_pipelines')).length, 2);
  assert.ok(await count(`SELECT COUNT(*)::int AS n FROM crm_activities WHERE deal_id = ANY($1) AND done_at IS NULL AND due_at < NOW()`, [deals]) >= 3, 'overdue activities');
  assert.ok(await count(`SELECT COUNT(*)::int AS n FROM crm_deals WHERE id = ANY($1) AND company_id IS NOT NULL`, [deals]) >= 5, 'deals of the Counterparties demo');

  // Masterplan: 20 cottages + 24 flats, every status, running timers, a plan with contours, reports with photos.
  const [projectId] = await tracked('masterplan', 'mp_projects');
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM mp_units WHERE project_id = $1`, [projectId]), 44);
  const { rows: statuses } = await db.query(`SELECT DISTINCT status FROM mp_units WHERE project_id = $1`, [projectId]);
  for (const status of ['free', 'reserve', 'booking', 'deposit', 'contract', 'sold', 'not_for_sale']) assert.ok(statuses.some((row) => row.status === status), status);
  assert.ok(await count(`SELECT COUNT(*)::int AS n FROM mp_bookings WHERE project_id = $1 AND status = 'active' AND ends_at > NOW()`, [projectId]) >= 4);
  assert.ok(await count(`SELECT COUNT(*)::int AS n FROM mp_contours c JOIN mp_plans p ON p.id = c.plan_id WHERE p.project_id = $1`, [projectId]) >= 21);
  assert.ok(await count(`SELECT COUNT(*)::int AS n FROM mp_units WHERE project_id = $1 AND deal_id = ANY($2)`, [projectId, deals]) >= 5, 'units linked to CRM deals');
  const { rows: media } = await db.query(`SELECT storage_key FROM mp_media WHERE project_id = $1`, [projectId]);
  assert.ok(media.length >= 5);
  const mediaFiles = media.map((row) => resolve(uploadRoot, 'masterplan', row.storage_key));
  for (const file of mediaFiles) assert.ok(await exists(file), file);
  assert.ok(await count(`SELECT COUNT(*)::int AS n FROM mp_node_stages s JOIN mp_nodes n ON n.id = s.node_id WHERE n.project_id = $1 AND s.percent > 0`, [projectId]) >= 10, 'reports moved the stages');

  // Contracts: sales took the units («Договор»), schedules with an overdue row, one waits for the director.
  const contracts = await tracked('contracts', 'ctr_contracts');
  assert.equal(contracts.length, 8);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM ctr_contracts c JOIN mp_units u ON u.node_id = c.mp_node_id WHERE c.id = ANY($1) AND u.status = 'contract' AND u.contract_number = c.number`, [contracts]), 2);
  assert.ok(await count(`SELECT COUNT(*)::int AS n FROM ctr_schedule WHERE contract_id = ANY($1) AND paid < amount AND due_on < CURRENT_DATE`, [contracts]) >= 1, 'an overdue instalment');
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM ctr_contracts WHERE id = ANY($1) AND status = 'expiring'`, [contracts]), 1);
  const { rows: versions } = await db.query(`SELECT storage_key FROM ctr_versions WHERE contract_id = ANY($1)`, [contracts]);
  const contractFiles = versions.map((row) => resolve(uploadRoot, row.storage_key));
  for (const file of contractFiles) assert.ok(await exists(file), file);

  // Procurement: every status; the director's stage waits for the administrator.
  const requests = await tracked('procurement', 'proc_requests');
  assert.equal(requests.length, 11);
  const { rows: procStatuses } = await db.query(`SELECT status FROM proc_requests WHERE id = ANY($1)`, [requests]);
  for (const status of ['draft', 'pending', 'returned', 'to_pay', 'partially_paid', 'paid', 'delivered', 'closed', 'rejected', 'cancelled']) assert.ok(procStatuses.some((row) => row.status === status), status);
  const { rows: docs } = await db.query(`SELECT storage_key FROM proc_documents WHERE request_id = ANY($1)`, [requests]);
  const procFiles = docs.map((row) => resolve(uploadRoot, row.storage_key));
  for (const file of procFiles) assert.ok(await exists(file), file);
  const { inboxItems } = await import('../modules/approvals/engine.js');
  const inbox = await inboxItems(req);
  const items = Array.isArray(inbox) ? inbox : inbox.items || [];
  for (const type of ['procurement.request', 'contracts.contract', 'warehouse.document']) {
    assert.ok(items.some((item) => JSON.stringify(item).includes(type)), `«Ждёт меня» has a ${type}`);
  }

  // Warehouse: 2 warehouses, 30 items, a transfer in transit, stock below minimum, an inventory count.
  const warehouses = await tracked('warehouse', 'wh_warehouses');
  assert.equal(warehouses.length, 2);
  assert.equal((await tracked('warehouse', 'wh_items')).length, 30);
  const whDocs = await tracked('warehouse', 'wh_docs');
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM wh_docs WHERE id = ANY($1) AND transfer_state = 'shipped'`, [whDocs]), 1);
  assert.ok(await count(`SELECT COUNT(*)::int AS n FROM wh_norms n WHERE n.warehouse_id = ANY($1) AND n.min_qty > COALESCE((SELECT SUM(qty) FROM wh_stock s WHERE s.item_id = n.item_id AND s.warehouse_id = n.warehouse_id AND s.holder_type = 'warehouse'), 0)`, [warehouses]) >= 2, 'below minimum');
  assert.ok(await count(`SELECT COUNT(*)::int AS n FROM wh_moves WHERE doc_id = ANY($1)`, [whDocs]) > 30, 'posted through the journal');

  // Purge: dependents first; nothing of theirs is left.
  for (const module of [...order].reverse()) await demo.purgeModule(module, req);
  for (const module of MODULES) assert.equal(await count(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = $1`, [module]), 0, `${module} untracked`);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM crm_deals WHERE id = ANY($1)`, [deals]), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM mp_projects WHERE id = $1`, [projectId]), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM ctr_contracts WHERE id = ANY($1)`, [contracts]), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM proc_requests WHERE id = ANY($1)`, [requests]), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM wh_docs WHERE id = ANY($1)`, [whDocs]), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM wh_moves WHERE doc_id = ANY($1)`, [whDocs]), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM wh_warehouses WHERE id = ANY($1)`, [warehouses]), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM approval_processes WHERE (type = 'procurement.request' AND doc_id = ANY($1::text[])) OR (type = 'contracts.contract' AND doc_id = ANY($2::text[]))`, [requests.map(String), contracts.map(String)]), 0);
  for (const file of [...mediaFiles, ...contractFiles, ...procFiles]) assert.equal(await exists(file), false, `${file} removed`);
  for (const module of MODULES) assert.equal((await demo.purgeModule(module, req)).removed, 0, `${module}: purging twice is a no-op`);
});

test('business demo: a failed warehouse seed takes everything back', { skip }, async () => {
  await setup();
  const registry = demo.demoRegistry();
  const original = registry.get('warehouse');
  registry.set('warehouse', { ...original, seed: async (ctx) => { await original.seed(ctx); throw new Error('boom'); } });
  try {
    await assert.rejects(demo.seedModule('warehouse', req), /boom/);
  } finally {
    registry.set('warehouse', original);
  }
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = 'warehouse'`), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM wh_items WHERE sku LIKE 'DEMO-%'`), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM wh_warehouses WHERE LOWER(code) IN ('demo-c', 'demo-s')`), 0);
  // And it seeds normally afterwards.
  assert.equal((await demo.seedModule('warehouse', req)).already, false);
  await demo.purgeModule('warehouse', req);
});

test('business demo: with a real approval route in force the demo documents stay out of approval', { skip }, async () => {
  await setup();
  // A real colleague approves on the saved routes (made here when the database has none).
  const { rows: made } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', 'Real approver') RETURNING id`, [`realappr${Date.now().toString(36)}`]);
  const realUser = made[0].id;
  const ours = [];
  for (const type of ['procurement.request', 'contracts.contract']) {
    const { rows } = await db.query(
      `INSERT INTO approval_routes (type, name, stages, restart_from, escalate_to, created_at, updated_at)
       VALUES ($1, 'Real route', $2, 'first', '[]'::jsonb, NOW() - INTERVAL '1 day', NOW()) ON CONFLICT (type) DO NOTHING RETURNING id`,
      [type, JSON.stringify([{ id: 'real', name: 'Real', mode: 'any', approvers: [{ kind: 'user', id: realUser }], conditions: [] }])]
    );
    if (rows[0]) ours.push(rows[0].id);
  }
  try {
    for (const module of ['contracts', 'procurement']) assert.equal((await demo.seedModule(module, req)).already, false);
    const contracts = await tracked('contracts', 'ctr_contracts');
    const requests = await tracked('procurement', 'proc_requests');
    assert.equal(contracts.length, 8);
    assert.equal(requests.length, 11);
    assert.equal(
      await count(`SELECT COUNT(*)::int AS n FROM approval_processes WHERE (type = 'procurement.request' AND doc_id = ANY($1::text[])) OR (type = 'contracts.contract' AND doc_id = ANY($2::text[]))`, [requests.map(String), contracts.map(String)]),
      0,
      'nothing went to the real route'
    );
    const { rows: procStatuses } = await db.query(`SELECT DISTINCT status FROM proc_requests WHERE id = ANY($1)`, [requests]);
    assert.deepEqual(procStatuses.map((row) => row.status).sort(), ['cancelled', 'draft']);
    assert.equal(await count(`SELECT COUNT(*)::int AS n FROM ctr_contracts WHERE id = ANY($1) AND status <> 'draft'`, [contracts]), 0);
    assert.equal(await count(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1`, [realUser]), 0, 'the real approver heard nothing');
    assert.equal(await count(`SELECT COUNT(*)::int AS n FROM approval_seats WHERE ref_id = $1 OR decided_by = $1`, [realUser]), 0);
  } finally {
    for (const module of ['procurement', 'contracts']) await demo.purgeModule(module, req);
    if (ours.length) await db.query(`DELETE FROM approval_routes WHERE id = ANY($1)`, [ours]);
    await db.query(`DELETE FROM users WHERE id = $1`, [realUser]);
  }
});
