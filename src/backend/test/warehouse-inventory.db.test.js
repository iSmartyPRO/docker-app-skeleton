import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/*
 * Database integration of inventory sessions (docs/warehouse.md#inventory-sessions):
 * the lifecycle, the freeze blocking movements (and «record» letting them
 * through), two counters in parallel summed with the conflict shown, the
 * offline sync being idempotent by client ids, the one act with the right
 * differences, the approval threshold, recounts, blind mode, permissions and
 * cost hiding, scheduled reminders. Needs a test database (never production!):
 *
 *   WAREHOUSE_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/warehouse-inventory.db.test.js
 */

const enabled = process.env.WAREHOUSE_DB_TEST === '1';
const skip = enabled ? false : 'set WAREHOUSE_DB_TEST=1 and a test database to run';

const tag = `whi${Date.now().toString(36)}`;
let db = null;
const created = { users: [], roles: [], warehouses: [], items: [], categories: [] };
let restore = null;

async function makeUser(name) {
  const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', $2) RETURNING id`, [`${tag}.${name}`, `${name} ${tag}`]);
  created.users.push(rows[0].id);
  return rows[0].id;
}

after(async () => {
  if (!db) return;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (restore) await restore().catch(() => {});
  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL wh.purge = 'on'`);
    await client.query(`DELETE FROM wh_inv_sessions WHERE warehouse_id = ANY($1::int[])`, [created.warehouses]);
    await client.query(`DELETE FROM wh_inv_schedules WHERE warehouse_id = ANY($1::int[])`, [created.warehouses]);
    const docs = (await client.query(`SELECT id FROM wh_docs WHERE warehouse_id = ANY($1::int[]) OR to_warehouse_id = ANY($1::int[]) OR author_id = ANY($2::int[])`, [created.warehouses, created.users])).rows.map((r) => r.id);
    await client.query(`DELETE FROM approval_processes WHERE type = 'warehouse.document' AND doc_id = ANY($1::text[])`, [docs.map(String)]);
    await client.query(`DELETE FROM wh_moves WHERE doc_id = ANY($1::int[])`, [docs]);
    await client.query(`UPDATE wh_docs SET base_doc_id = NULL WHERE id = ANY($1::int[])`, [docs]);
    await client.query(`DELETE FROM wh_docs WHERE id = ANY($1::int[])`, [docs]);
    await client.query(`DELETE FROM wh_stock WHERE item_id = ANY($1::int[])`, [created.items]);
    await client.query(`DELETE FROM wh_items WHERE id = ANY($1::int[])`, [created.items]);
    await client.query(`DELETE FROM wh_categories WHERE id = ANY($1::int[])`, [created.categories]);
    await client.query(`DELETE FROM wh_warehouses WHERE id = ANY($1::int[])`, [created.warehouses]);
    await client.query(`DELETE FROM wh_notices WHERE key LIKE 'invdue:%'`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.warn('cleanup failed:', err.message);
  } finally {
    client.release();
  }
  if (created.users.length) {
    await db.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [created.users]).catch(() => {});
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  }
  if (created.roles.length) await db.query(`DELETE FROM app_roles WHERE id = ANY($1)`, [created.roles]);
  await db.closePool();
});

test('database: inventory sessions end to end', { skip, timeout: 180000 }, async (t) => {
  db = await import('../config/database.js');
  const { ensureLegalEntitiesTable } = await import('../services/legalEntities.js');
  await ensureLegalEntitiesTable();
  await (await import('../modules/approvals/schema.js')).ensureApprovalsSchema();
  await (await import('../modules/procurement/schema.js')).ensureProcurementSchema();
  // node --test runs the warehouse DB files in parallel: both create the schema (CREATE OR REPLACE FUNCTION may collide).
  const { ensureWarehouseSchema } = await import('../modules/warehouse/schema.js');
  for (let attempt = 0; ; attempt += 1) {
    try {
      await ensureWarehouseSchema();
      break;
    } catch (err) {
      if (attempt >= 5 || !/concurrently|deadlock|already exists/i.test(err.message)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400 + attempt * 300));
    }
  }
  await import('../modules/warehouse/index.js');
  const settingsService = await import('../services/settings.js');
  const { requestAs } = await import('../api/events.js');
  const docs = await import('../modules/warehouse/documents.js');
  const items = await import('../modules/warehouse/items.js');
  const warehouses = await import('../modules/warehouse/warehouses.js');
  const inv = await import('../modules/warehouse/inventory.js');
  const approvals = await import('../modules/approvals/api.js');
  const { stripCost } = await import('../modules/warehouse/logic.js');

  const before = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules;
  await settingsService.updateAdminSettings({
    modules: { warehouse: { enabled: true, settings: { currency: 'USD', approvalThreshold: 500, approvalThresholdCurrency: 'USD', approvalTypes: ['writeoff', 'correction', 'inventory'], everyoneCanView: true, closedUntil: null } } },
  });
  const savedRoute = (await db.query(`SELECT 1 FROM approval_routes WHERE type = 'warehouse.document'`)).rows[0];
  restore = async () => {
    await settingsService.updateAdminSettings({ modules: { warehouse: { enabled: before.warehouse.enabled, settings: before.warehouse.settings } } });
    if (!savedRoute) await db.query(`DELETE FROM approval_routes WHERE type = 'warehouse.document'`);
  };

  const role = async (perms) => {
    const { rows } = await db.query(`INSERT INTO app_roles (key, name, permissions) VALUES ($1, $2, $3) RETURNING id`, [`${tag}_${created.roles.length}`, `R ${tag} ${created.roles.length}`, perms]);
    created.roles.push(rows[0].id);
    return rows[0].id;
  };
  const grant = (userId, roleId) => db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);
  const boss = await makeUser('boss'); // admin + cost
  const keeper = await makeUser('keeper'); // MOL: inventory right there, no cost
  const counterA = await makeUser('counterA'); // no warehouse rights: counts only when taking part
  const counterB = await makeUser('counterB');
  const outsider = await makeUser('outsider');
  await grant(boss, await role(['warehouse.admin']));
  const as = (id) => requestAs(id);

  const wh = await warehouses.createWarehouse(await as(boss), { name: `Инв ${tag}`, code: `I${tag}`, kind: 'main', molId: keeper, binsEnabled: true });
  created.warehouses.push(wh.id);
  await warehouses.createBins(await as(boss), wh.id, { kind: 'zone', codes: ['Z'] });
  const zone = (await db.query(`SELECT id FROM wh_bins WHERE warehouse_id = $1 AND path = 'Z'`, [wh.id])).rows[0].id;
  await warehouses.createBins(await as(boss), wh.id, { kind: 'rack', parentId: zone, codes: ['01', '02'] });
  const bin = Object.fromEntries((await db.query(`SELECT id, path FROM wh_bins WHERE warehouse_id = $1`, [wh.id])).rows.map((r) => [r.path, r.id]));

  await items.saveCategory(await as(boss), null, { name: `Электрика ${tag}` });
  await items.saveCategory(await as(boss), null, { name: `Крепёж ${tag}` });
  const cat = Object.fromEntries((await db.query(`SELECT id, name FROM wh_categories WHERE name LIKE $1`, [`%${tag}`])).rows.map((r) => [r.name.split(' ')[0], r.id]));
  created.categories.push(...Object.values(cat));
  const makeItem = async (input) => {
    const card = await items.createItem(await as(boss), input);
    created.items.push(card.item.id);
    return card.item;
  };
  const cable = await makeItem({ name: `Кабель ${tag}`, sku: `CB-${tag}`, baseUnit: 'м', units: [{ code: 'бухта', factor: 100 }], categoryId: cat['Электрика'] });
  const screws = await makeItem({ name: `Саморез ${tag}`, sku: `SC-${tag}`, units: [{ code: 'уп', factor: 200 }], categoryId: cat['Крепёж'] });
  const lamp = await makeItem({ name: `Лампа ${tag}`, sku: `LP-${tag}`, categoryId: cat['Электрика'] });
  const drill = await makeItem({ name: `Дрель ${tag}`, sku: `DR-${tag}`, tracking: 'serial' });

  const pool = async (itemId, binId) => (await db.query(`SELECT COALESCE(SUM(qty),0)::float AS q FROM wh_stock WHERE item_id = $1 AND warehouse_id = $2 AND holder_type = 'warehouse' AND ($3::int IS NULL OR bin_id = $3)`, [itemId, wh.id, binId ?? null])).rows[0].q;
  // Opening: cable 300 м in Z-01 + 50 м without a bin; screws 1000 in Z-02; lamps 10 in Z-01; two drills in Z-02.
  const opening = await docs.createDoc(await as(boss), {
    type: 'opening',
    toWarehouseId: wh.id,
    lines: [
      { itemId: cable.id, qty: 3, unit: 'бухта', price: 100, toBinId: bin['Z-01'] },
      { itemId: cable.id, qty: 50, price: 50 },
      { itemId: screws.id, qty: 1000, price: 20, toBinId: bin['Z-02'] },
      { itemId: lamp.id, qty: 10, price: 30, toBinId: bin['Z-01'] },
      { itemId: drill.id, qty: 2, price: 400, toBinId: bin['Z-02'], serials: [{ inventoryNo: `D1-${tag}` }, { inventoryNo: `D2-${tag}` }] },
    ],
  });
  await docs.postDoc(await as(boss), opening.document.id);
  const d1 = (await db.query(`SELECT id FROM wh_instances WHERE inventory_no = $1`, [`D1-${tag}`])).rows[0].id;
  const d2 = (await db.query(`SELECT id FROM wh_instances WHERE inventory_no = $1`, [`D2-${tag}`])).rows[0].id;
  const op = (kind, extra = {}) => ({ clientId: `${kind}-${randomUUID()}`, kind, ...extra });

  let session = null;
  await t.test('permissions: only the inventory right creates; outsiders do not see sessions', async () => {
    await assert.rejects(inv.createSession(await as(outsider), { warehouseId: wh.id }), (err) => err.statusCode === 403);
    const card = await inv.createSession(await as(keeper), { warehouseId: wh.id, title: 'Полная', counters: [counterA] });
    session = card.session;
    assert.equal(session.status, 'counting');
    assert.equal(session.freezes, true);
    // Areas: the leaves Z-01, Z-02 and «без ячейки» (the zone itself holds nothing).
    assert.deepEqual(card.areas.map((a) => a.path).sort(), [null, 'Z-01', 'Z-02'].sort());
    await assert.rejects(inv.getSession(await as(outsider), session.id), (err) => err.statusCode === 404);
    // A second session over the same goods is refused.
    await assert.rejects(inv.createSession(await as(keeper), { warehouseId: wh.id }), (err) => err.code === 'SESSION_ACTIVE');
    // The counter sees the card but may not review or finish.
    const asCounter = await inv.getSession(await as(counterA), session.id);
    assert.equal(asCounter.my.count, true);
    assert.equal(asCounter.my.finish, false);
    await assert.rejects(inv.reconcileSession(await as(counterA), session.id), (err) => err.statusCode === 403);
    await assert.rejects(inv.finishSession(await as(counterA), session.id), (err) => err.statusCode === 403);
    await assert.rejects(inv.syncOps(await as(outsider), session.id, { ops: [op('add', { binId: bin['Z-01'], itemId: lamp.id, qty: 1 })] }), (err) => err.statusCode === 404);
  });

  await t.test('freeze: movements of the scope are blocked with a clear error; active list shows it', async () => {
    const out = await docs.createDoc(await as(keeper), { type: 'writeoff', warehouseId: wh.id, reason: 'damage', lines: [{ itemId: lamp.id, qty: 1, binId: bin['Z-01'] }] });
    await assert.rejects(docs.postDoc(await as(keeper), out.document.id), (err) => err.code === 'FROZEN' && err.info.session.number === session.number);
    const rec = await docs.createDoc(await as(keeper), { type: 'receipt', toWarehouseId: wh.id, lines: [{ itemId: screws.id, qty: 5 }] });
    await assert.rejects(docs.postDoc(await as(keeper), rec.document.id), (err) => err.code === 'FROZEN');
    assert.equal(await pool(lamp.id), 10);
    await docs.deleteDoc(await as(keeper), out.document.id);
    await docs.deleteDoc(await as(keeper), rec.document.id);
    const active = await inv.activeSessions(await as(outsider), { warehouse: wh.id });
    assert.equal(active.sessions.length, 1);
    assert.equal(active.sessions[0].freezes, true);
    assert.equal(active.sessions[0].canOpen, false);
  });

  await t.test('parallel counts: two counters in one bin are summed, the conflict is shown', async () => {
    await inv.assignAreas(await as(keeper), session.id, { binIds: [bin['Z-01']], userId: counterA });
    await inv.assignAreas(await as(keeper), session.id, { binIds: [bin['Z-02'], 0], userId: counterB });
    const card = await inv.getSession(await as(keeper), session.id);
    assert.equal(card.areas.find((a) => a.path === 'Z-01').assignee.id, counterA);
    assert.equal(card.areas.find((a) => !a.binId).assignee.id, counterB);
    // A counts Z-01: 2 бухты + 60 м of cable, 10 lamps; B also counts cable in Z-01: 38 м.
    const [ra, rb] = await Promise.all([
      inv.syncOps(await as(counterA), session.id, { ops: [op('add', { binId: bin['Z-01'], itemId: cable.id, qty: 2, unit: 'бухта' }), op('add', { binId: bin['Z-01'], itemId: cable.id, qty: 60 }), op('set', { binId: bin['Z-01'], itemId: lamp.id, qty: 10 })] }),
      inv.syncOps(await as(counterB), session.id, { ops: [op('add', { binId: bin['Z-01'], itemId: cable.id, qty: 38 })] }),
    ]);
    assert.ok([...ra.results, ...rb.results].every((r) => r.status === 'applied'), JSON.stringify([...ra.results, ...rb.results]));
    const view = await inv.areaView(await as(counterA), session.id, { bin: bin['Z-01'] });
    assert.equal(view.mine.find((m) => m.item.id === cable.id).qty, 260);
    assert.equal(view.others, 1);
    assert.ok(view.expected.find((e) => e.item.id === cable.id).book === 300);
    const rec = await inv.reconcileSession(await as(keeper), session.id);
    const row = rec.rows.find((r) => r.itemId === cable.id && r.binId === bin['Z-01']);
    assert.equal(row.counted, 298);
    assert.equal(row.conflict, true);
    assert.equal(row.counters.length, 2);
    assert.equal(row.status, 'pending'); // Z-01 not marked done yet
  });

  await t.test('offline sync is idempotent by client ids', async () => {
    const batch = [op('add', { binId: bin['Z-02'], itemId: screws.id, qty: 4, unit: 'уп' }), op('add', { binId: bin['Z-02'], itemId: screws.id, qty: 190 }), op('add', { binId: bin['Z-02'], itemId: drill.id, instanceId: d1, qty: 1 }), op('done', { binId: bin['Z-02'] })];
    const first = await inv.syncOps(await as(counterB), session.id, { ops: batch });
    assert.deepEqual(first.results.map((r) => r.status), ['applied', 'applied', 'applied', 'applied']);
    // The phone lost the answer and sends the queue again — twice, at the same time.
    const [again, third] = await Promise.all([inv.syncOps(await as(counterB), session.id, { ops: batch }), inv.syncOps(await as(counterB), session.id, { ops: batch })]);
    assert.ok([...again.results, ...third.results].every((r) => r.status === 'duplicate'));
    const view = await inv.areaView(await as(counterB), session.id, { bin: bin['Z-02'] });
    assert.equal(view.mine.find((m) => m.item.id === screws.id).qty, 990);
    assert.equal(view.area.status, 'done');
    // Bad ops and bins outside the session are rejected, not applied.
    const bad = await inv.syncOps(await as(counterB), session.id, { ops: [{ clientId: 'x', kind: 'add' }, op('add', { binId: zone, itemId: screws.id, qty: 1 })] });
    assert.deepEqual(bad.results.map((r) => r.code), ['BAD_OP', 'NOT_IN_SCOPE']);
  });

  await t.test('finish: bins not counted are refused unless forced; the manager decides a conflict', async () => {
    await assert.rejects(inv.finishSession(await as(keeper), session.id), (err) => err.code === 'AREAS_NOT_DONE');
    await inv.syncOps(await as(counterA), session.id, { ops: [op('done', { binId: bin['Z-01'] })] });
    await inv.syncOps(await as(counterB), session.id, { ops: [op('set', { binId: null, itemId: cable.id, qty: 50 }), op('done', { binId: null })] });
    const decided = await inv.setFinal(await as(keeper), session.id, { binId: bin['Z-01'], itemId: cable.id, qty: 299 });
    const row = decided.rows.find((r) => r.itemId === cable.id && r.binId === bin['Z-01']);
    assert.equal(row.conflict, false);
    assert.equal(row.diff, -1);
    // Without warehouse.cost there are no sums (the route strips money keys as well).
    assert.equal(row.sum, null);
    assert.equal(decided.summary.grossSum, null);
    assert.equal(decided.cost, false);
    const withCost = await inv.reconcileSession(await as(boss), session.id, { onlyDiff: '1' });
    assert.ok(withCost.cost);
    // Only differences: cable Z-01 (−1), screws (−10), drill D2 missing (−1).
    assert.deepEqual(withCost.rows.map((r) => `${r.item.id}:${r.instance?.id || 0}:${r.diff}`).sort(), [`${cable.id}:0:-1`, `${screws.id}:0:-10`, `${drill.id}:${d2}:-1`].sort());
    assert.equal(withCost.rows.find((r) => r.itemId === screws.id).sum, -200);
    assert.ok(stripCost(withCost).rows.every((r) => !('sum' in r)));
  });

  let actId = null;
  await t.test('finish: one act; above the threshold it goes to approval and the freeze holds until posted', async () => {
    const done = await inv.finishSession(await as(keeper), session.id);
    assert.equal(done.postError, null);
    assert.equal(done.session.status, 'finished');
    actId = done.session.doc.id;
    const act = await docs.getDoc(await as(boss), actId);
    assert.equal(act.document.type, 'inventory');
    // −1 м cable (avg 8), −10 screws (200), −1 drill (400) = 608 gross > $500.
    assert.equal(act.document.status, 'pending');
    const { rows: acts } = await db.query(`SELECT COUNT(*)::int AS n FROM wh_docs WHERE type = 'inventory' AND warehouse_id = $1`, [wh.id]);
    assert.equal(acts[0].n, 1);
    assert.equal((await inv.getSession(await as(keeper), session.id)).session.freezes, true);
    const out = await docs.createDoc(await as(keeper), { type: 'writeoff', warehouseId: wh.id, reason: 'damage', lines: [{ itemId: screws.id, qty: 1 }] });
    await assert.rejects(docs.postDoc(await as(keeper), out.document.id), (err) => err.code === 'FROZEN');
    await docs.deleteDoc(await as(keeper), out.document.id);
    const process = await approvals.getProcess('warehouse.document', String(actId));
    await approvals.decide(await as(boss), { type: 'warehouse.document', docId: String(actId) }, { action: 'approve', round: process.round, stage: process.currentStage });
    assert.equal((await docs.getDoc(await as(boss), actId)).document.status, 'posted');
    // The book equals the count, bin by bin.
    assert.equal(await pool(cable.id, bin['Z-01']), 299);
    assert.equal((await db.query(`SELECT COALESCE(SUM(qty),0)::float AS q FROM wh_stock WHERE item_id = $1 AND warehouse_id = $2 AND bin_id IS NULL AND holder_type = 'warehouse'`, [cable.id, wh.id])).rows[0].q, 50);
    assert.equal(await pool(screws.id), 990);
    assert.equal(await pool(lamp.id), 10);
    assert.equal((await db.query(`SELECT COALESCE(SUM(qty),0)::float AS q FROM wh_stock WHERE instance_id = $1 AND holder_type = 'warehouse'`, [d2])).rows[0].q, 0);
    assert.equal((await db.query(`SELECT COALESCE(SUM(qty),0)::float AS q FROM wh_stock WHERE instance_id = $1 AND holder_type = 'warehouse'`, [d1])).rows[0].q, 1);
    const lines = (await db.query(`SELECT item_id, bin_id, book_qty::float, counted_qty::float FROM wh_doc_lines WHERE doc_id = $1`, [actId])).rows;
    const cableLine = lines.find((l) => l.item_id === cable.id && l.bin_id === bin['Z-01']);
    assert.equal(cableLine.book_qty, 300);
    assert.equal(cableLine.counted_qty, 299);
    // Posted: the freeze is over.
    const card = await inv.getSession(await as(keeper), session.id);
    assert.equal(card.session.freezes, false);
    assert.equal(card.session.doc.status, 'posted');
    const free = await docs.createDoc(await as(keeper), { type: 'writeoff', warehouseId: wh.id, reason: 'damage', lines: [{ itemId: lamp.id, qty: 1, binId: bin['Z-01'] }] });
    assert.equal((await docs.postDoc(await as(keeper), free.document.id)).document.status, 'posted');
  });

  await t.test('partial by category with «record»: other goods move; movements are listed; below the threshold it posts', async () => {
    const card = await inv.createSession(await as(keeper), { warehouseId: wh.id, categoryIds: [cat['Электрика']], freezePolicy: 'record', blind: true, counters: [counterA] });
    const s = card.session;
    assert.equal(s.freezes, false);
    assert.equal(s.scope.partial, true);
    // Screws (another category) and lamps (in scope, but «record») both move.
    const w1 = await docs.createDoc(await as(keeper), { type: 'writeoff', warehouseId: wh.id, reason: 'damage', lines: [{ itemId: lamp.id, qty: 1, binId: bin['Z-01'] }] });
    assert.equal((await docs.postDoc(await as(keeper), w1.document.id)).document.status, 'posted');
    // Blind: the counter does not see the book.
    const view = await inv.areaView(await as(counterA), s.id, { bin: bin['Z-01'] });
    assert.equal(view.expected, null);
    // A screw is not in this inventory.
    const res = await inv.syncOps(await as(counterA), s.id, { ops: [op('add', { binId: bin['Z-01'], itemId: screws.id, qty: 1 }), op('set', { binId: bin['Z-01'], itemId: lamp.id, qty: 7 }), op('set', { binId: bin['Z-01'], itemId: cable.id, qty: 299 }), op('done', { binId: bin['Z-01'] })] });
    assert.deepEqual(res.results.map((r) => r.status), ['rejected', 'applied', 'applied', 'applied']);
    assert.equal(res.results[0].code, 'NOT_IN_SCOPE');
    const rec = await inv.reconcileSession(await as(keeper), s.id);
    assert.ok(rec.moves.some((m) => m.doc.id === w1.document.id && m.qty === -1));
    // Recount the lamps: the count is cleared and the bin goes back to the counter.
    await inv.requestRecount(await as(keeper), s.id, { binId: bin['Z-01'], itemId: lamp.id });
    const after = await inv.getSession(await as(keeper), s.id);
    assert.equal(after.areas.find((a) => a.binId === bin['Z-01']).status, 'recount');
    assert.equal(after.recounts.length, 1);
    await inv.closeCounting(await as(keeper), s.id);
    // Under review only the recount is accepted.
    const again = await inv.syncOps(await as(counterA), s.id, { ops: [op('set', { binId: bin['Z-01'], itemId: lamp.id, qty: 8 }), op('done', { binId: bin['Z-01'] })] });
    assert.deepEqual(again.results.map((r) => r.status), ['applied', 'applied']);
    const closed = await inv.syncOps(await as(counterA), s.id, { ops: [op('add', { binId: bin['Z-01'], itemId: cable.id, qty: 1 })] });
    assert.equal(closed.results[0].code, 'SESSION_CLOSED');
    const done = await inv.finishSession(await as(keeper), s.id, { force: true });
    assert.equal(done.session.doc.status, 'posted'); // no difference: below the threshold
    assert.equal(await pool(lamp.id), 8);
    assert.equal(await pool(cable.id, bin['Z-01']), 299);
    assert.equal(await pool(screws.id), 990);
  });

  await t.test('blind mode: a counter with the inventory right does not see the book while counting', async () => {
    const card = await inv.createSession(await as(boss), { warehouseId: wh.id, binIds: [bin['Z-02']], blind: true, counters: [keeper] });
    await assert.rejects(inv.reconcileSession(await as(keeper), card.session.id), (err) => err.code === 'BLIND');
    await inv.closeCounting(await as(boss), card.session.id);
    const rec = await inv.reconcileSession(await as(keeper), card.session.id);
    assert.ok(rec.rows.length > 0);
    await inv.cancelSession(await as(boss), card.session.id);
    assert.equal((await inv.getSession(await as(boss), card.session.id)).session.freezes, false);
  });

  await t.test('schedules: a due partial count reminds once; finishing it moves the date', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const list = await inv.saveSchedule(await as(keeper), null, { warehouseId: wh.id, title: 'Электрика ежемесячно', categoryIds: [cat['Электрика']], everyDays: 30, nextOn: today });
    const schedule = list.schedules.find((s) => s.warehouse.id === wh.id);
    assert.ok(schedule);
    const count = async () => (await db.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE kind = 'warehouse.inventory_due' AND user_id = $1`, [keeper])).rows[0].n;
    const n0 = await count();
    await inv.runInventoryReminders({ today, force: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await count(), n0 + 1);
    await inv.runInventoryReminders({ today, force: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await count(), n0 + 1);
    const card = await inv.createSession(await as(keeper), { scheduleId: schedule.id, counters: [counterA] });
    assert.deepEqual(card.session.scope.categories.map((c) => c.id), [cat['Электрика']]);
    await inv.syncOps(await as(counterA), card.session.id, { ops: [op('set', { binId: bin['Z-01'], itemId: lamp.id, qty: 8 }), op('set', { binId: bin['Z-01'], itemId: cable.id, qty: 299 }), op('done', { binId: bin['Z-01'] })] });
    await inv.finishSession(await as(keeper), card.session.id, { force: true });
    const next = (await inv.listSchedules(await as(keeper), { warehouse: wh.id })).schedules.find((s) => s.id === schedule.id);
    assert.ok(next.nextOn > today);
    await assert.rejects(inv.saveSchedule(await as(outsider), null, { warehouseId: wh.id, everyDays: 7, nextOn: today }), (err) => err.statusCode === 403);
  });
});
