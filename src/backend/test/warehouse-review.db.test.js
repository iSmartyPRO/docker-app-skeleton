import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

/*
 * Database checks of the Warehouse review fixes (docs/warehouse.md): sums in
 * history and approvals only with cost rights, one instance counted once, serial
 * items counted per instance, an instance found in another bin moved by the act,
 * the client's recount flag ignored, the finish computed under the session lock,
 * a deleted act reopening its session, the hand-over decline racing the
 * confirmation, storno in a closed period, storno value adjustments, a reversed
 * receipt taking its procurement delivery back, batches and lost instances in
 * counts, the write-off from a holder limited to its warehouse, old drafts dated
 * at posting, empty received quantities, tools / hints / reports visibility,
 * reserves given back by a storno. Needs a test database (never production!):
 *
 *   WAREHOUSE_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test --test-concurrency=1 test/warehouse*.db.test.js
 *
 * Some steps switch «everyone views» off for a moment: run the warehouse DB files one after another.
 */

const enabled = process.env.WAREHOUSE_DB_TEST === '1';
const skip = enabled ? false : 'set WAREHOUSE_DB_TEST=1 and a test database to run';

const tag = `whr${Date.now().toString(36)}`;
let db = null;
const created = { users: [], roles: [], warehouses: [], items: [], proc: [] };
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
    const docs = (await client.query(`SELECT id FROM wh_docs WHERE warehouse_id = ANY($1::int[]) OR to_warehouse_id = ANY($1::int[]) OR author_id = ANY($2::int[])`, [created.warehouses, created.users])).rows.map((r) => r.id);
    await client.query(`DELETE FROM approval_processes WHERE type = 'warehouse.document' AND doc_id = ANY($1::text[])`, [docs.map(String)]);
    await client.query(`DELETE FROM wh_moves WHERE doc_id = ANY($1::int[])`, [docs]);
    await client.query(`UPDATE wh_docs SET base_doc_id = NULL WHERE id = ANY($1::int[])`, [docs]);
    await client.query(`DELETE FROM wh_docs WHERE id = ANY($1::int[])`, [docs]);
    await client.query(`DELETE FROM wh_reserves WHERE item_id = ANY($1::int[])`, [created.items]);
    await client.query(`DELETE FROM wh_stock WHERE item_id = ANY($1::int[])`, [created.items]);
    await client.query(`DELETE FROM wh_items WHERE id = ANY($1::int[])`, [created.items]);
    await client.query(`DELETE FROM wh_warehouses WHERE id = ANY($1::int[])`, [created.warehouses]);
    if (created.proc.length) await client.query(`DELETE FROM proc_requests WHERE id = ANY($1::int[])`, [created.proc]);
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

test('database: warehouse review fixes', { skip, timeout: 180000 }, async (t) => {
  db = await import('../config/database.js');
  const { ensureLegalEntitiesTable } = await import('../services/legalEntities.js');
  await ensureLegalEntitiesTable();
  await (await import('../modules/approvals/schema.js')).ensureApprovalsSchema();
  await (await import('../modules/procurement/schema.js')).ensureProcurementSchema();
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
  await import('../modules/procurement/index.js');
  await import('../modules/warehouse/index.js');
  const settingsService = await import('../services/settings.js');
  const { requestAs } = await import('../api/events.js');
  const docs = await import('../modules/warehouse/documents.js');
  const items = await import('../modules/warehouse/items.js');
  const warehouses = await import('../modules/warehouse/warehouses.js');
  const stock = await import('../modules/warehouse/stock.js');
  const tools = await import('../modules/warehouse/tools.js');
  const reports = await import('../modules/warehouse/reports.js');
  const inv = await import('../modules/warehouse/inventory.js');
  const link = await import('../modules/warehouse/procurement.js');
  const approvals = await import('../modules/approvals/api.js');
  const { isoDay } = await import('../services/datetime.js');
  const { portalRegional } = await import('../services/regional.js');

  const before = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules;
  await settingsService.updateAdminSettings({
    modules: {
      warehouse: { enabled: true, settings: { currency: 'USD', approvalThreshold: 500, approvalThresholdCurrency: 'USD', approvalTypes: ['writeoff', 'correction', 'inventory'], everyoneCanView: true, closedUntil: null } },
      procurement: { enabled: true, settings: { anyoneCanCreate: true } },
    },
  });
  const savedRoute = (await db.query(`SELECT 1 FROM approval_routes WHERE type = 'warehouse.document'`)).rows[0];
  restore = async () => {
    await settingsService.updateAdminSettings({ modules: { warehouse: { enabled: before.warehouse.enabled, settings: before.warehouse.settings }, procurement: { enabled: before.procurement.enabled, settings: before.procurement.settings } } });
    if (!savedRoute) await db.query(`DELETE FROM approval_routes WHERE type = 'warehouse.document'`);
  };
  const setWh = (settings) => settingsService.updateAdminSettings({ modules: { warehouse: { settings } } });

  const role = async (perms) => {
    const { rows } = await db.query(`INSERT INTO app_roles (key, name, permissions) VALUES ($1, $2, $3) RETURNING id`, [`${tag}_${created.roles.length}`, `R ${tag} ${created.roles.length}`, perms]);
    created.roles.push(rows[0].id);
    return rows[0].id;
  };
  const grant = (userId, roleId) => db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);
  const boss = await makeUser('boss'); // admin + cost
  const keeperA = await makeUser('keeperA'); // MOL of A, no cost
  const keeperB = await makeUser('keeperB'); // MOL of B
  const foreman = await makeUser('foreman'); // no rights of their own
  const accountant = await makeUser('accountant'); // warehouse.cost
  const counterA = await makeUser('counterA');
  const counterB = await makeUser('counterB');
  const stranger = await makeUser('stranger');
  await grant(boss, await role(['warehouse.admin']));
  await grant(accountant, await role(['warehouse.cost']));
  const as = (id) => requestAs(id);

  const whA = await warehouses.createWarehouse(await as(boss), { name: `A ${tag}`, code: `RA${tag}`, kind: 'main', molId: keeperA });
  const whB = await warehouses.createWarehouse(await as(boss), { name: `B ${tag}`, code: `RB${tag}`, kind: 'site', molId: keeperB });
  const whC = await warehouses.createWarehouse(await as(boss), { name: `C ${tag}`, code: `RC${tag}`, kind: 'main', molId: keeperA, binsEnabled: true });
  created.warehouses.push(whA.id, whB.id, whC.id);
  await warehouses.createBins(await as(boss), whC.id, { kind: 'zone', codes: ['Z'] });
  const zone = (await db.query(`SELECT id FROM wh_bins WHERE warehouse_id = $1 AND path = 'Z'`, [whC.id])).rows[0].id;
  await warehouses.createBins(await as(boss), whC.id, { kind: 'rack', parentId: zone, codes: ['01', '02'] });
  const bin = Object.fromEntries((await db.query(`SELECT id, path FROM wh_bins WHERE warehouse_id = $1`, [whC.id])).rows.map((r) => [r.path, r.id]));

  const makeItem = async (input) => {
    const card = await items.createItem(await as(boss), input);
    created.items.push(card.item.id);
    return card.item;
  };
  const nails = await makeItem({ name: `Гвоздь ${tag}`, sku: `NL-${tag}` });
  const bolts = await makeItem({ name: `Болт ${tag}`, sku: `BL-${tag}` });
  const drill = await makeItem({ name: `Дрель ${tag}`, sku: `DR-${tag}`, tracking: 'serial' });
  const paint = await makeItem({ name: `Краска ${tag}`, sku: `PT-${tag}`, tracking: 'batch' });

  const pool = async (itemId, warehouseId, binId = null) =>
    (await db.query(`SELECT COALESCE(SUM(qty),0)::float AS q, COALESCE(SUM(amount),0)::float AS a FROM wh_stock WHERE item_id = $1 AND warehouse_id = $2 AND holder_type = 'warehouse' AND ($3::int IS NULL OR bin_id = $3)`, [itemId, warehouseId, binId])).rows[0];
  const post = async (who, input) => {
    const draft = await docs.createDoc(await as(who), input);
    return docs.postDoc(await as(who), draft.document.id);
  };
  const receipt = (who, warehouseId, lines, extra = {}) => post(who, { type: 'receipt', toWarehouseId: warehouseId, supplierName: 'Поставщик', lines, ...extra });
  const instanceOf = async (no) => (await db.query(`SELECT * FROM wh_instances WHERE inventory_no = $1`, [no])).rows[0];
  const op = (kind, extra = {}) => ({ clientId: `${kind}-${randomUUID()}`, kind, ...extra });

  await t.test('W1 / W14: posted sums leave history and approvals for people without cost rights', async () => {
    await receipt(boss, whA.id, [{ itemId: nails.id, qty: 1000, price: 1 }]);
    const big = await docs.createDoc(await as(keeperA), { type: 'writeoff', warehouseId: whA.id, reason: 'damage', reasonText: 'Ржавые', lines: [{ itemId: nails.id, qty: 600 }] });
    const sent = await docs.postDoc(await as(keeperA), big.document.id);
    assert.equal(sent.document.status, 'pending');
    const mine = await docs.history(await as(keeperA), big.document.id);
    const toApproval = mine.find((e) => e.action === 'to_approval');
    assert.ok(toApproval);
    assert.equal(toApproval.data.total, undefined);
    const bossView = await docs.history(await as(boss), big.document.id);
    assert.equal(bossView.find((e) => e.action === 'to_approval').data.total, 600);
    // The process publishes no sum; the routing still sees it as a field.
    const process = await approvals.getProcess('warehouse.document', String(big.document.id));
    assert.equal(process.amount, null);
    const card = await docs.getDoc(await as(keeperA), big.document.id);
    assert.equal(card.approval.amount, null);
    assert.equal(card.document.sum, null);
    assert.equal((await docs.getDoc(await as(boss), big.document.id)).document.sum, 600);
    // Older processes stored the sum: still hidden on the card.
    await db.query(`UPDATE approval_processes SET amount = 600 WHERE type = 'warehouse.document' AND doc_id = $1`, [String(big.document.id)]);
    assert.equal((await docs.getDoc(await as(keeperA), big.document.id)).approval.amount, null);
    await approvals.decide(await as(boss), { type: 'warehouse.document', docId: String(big.document.id) }, { action: 'approve', round: process.round, stage: process.currentStage });
    const posted = await docs.history(await as(keeperA), big.document.id);
    assert.ok(posted.some((e) => e.action === 'posted'));
    assert.ok(posted.every((e) => e.data?.total === undefined));
  });

  await t.test('W5: a decline racing the confirmation never cancels a posted hand-over', async () => {
    await receipt(keeperA, whA.id, [{ itemId: drill.id, qty: 1, price: 300, serials: [{ inventoryNo: `H1-${tag}` }] }]);
    const tool = await instanceOf(`H1-${tag}`);
    await post(keeperA, { type: 'issue', warehouseId: whA.id, toHolderType: 'employee', toHolderId: foreman, lines: [{ itemId: drill.id, qty: 1, instanceId: tool.id }] });
    const sent = await tools.handover(await as(foreman), { toUserId: accountant, instanceIds: [tool.id] });
    assert.equal(sent.document.status, 'pending');
    const [confirm, decline] = await Promise.allSettled([docs.confirmHandover(await as(accountant), sent.document.id), docs.declineHandover(await as(foreman), sent.document.id, {})]);
    const status = (await db.query(`SELECT status FROM wh_docs WHERE id = $1`, [sent.document.id])).rows[0].status;
    const moves = (await db.query(`SELECT COUNT(*)::int AS n FROM wh_moves WHERE doc_id = $1`, [sent.document.id])).rows[0].n;
    assert.ok(!(confirm.status === 'fulfilled' && decline.status === 'fulfilled'));
    if (status === 'posted') assert.ok(moves > 0);
    else assert.equal(moves, 0);
    if (decline.status === 'rejected') assert.ok(['STALE', 'BAD_TRANSITION'].includes(decline.reason.code));
    // After the confirmation a decline is refused.
    if (status === 'posted') await assert.rejects(docs.declineHandover(await as(foreman), sent.document.id, {}), (err) => err.statusCode === 409);
  });

  await t.test('W6: a document of a closed period is not reversed', async () => {
    const old = await post(boss, { type: 'receipt', toWarehouseId: whB.id, date: '2020-01-15T10:00:00Z', lines: [{ itemId: bolts.id, qty: 5, price: 2 }] });
    assert.equal(old.document.status, 'posted');
    await setWh({ closedUntil: '2020-01-31' });
    try {
      await assert.rejects(docs.stornoDoc(await as(boss), old.document.id, { reason: 'Ошибка' }), (err) => err.code === 'PERIOD_CLOSED');
    } finally {
      await setWh({ closedUntil: null });
    }
    assert.equal((await pool(bolts.id, whB.id)).q, 5);
  });

  await t.test('W7: a storno never leaves value on an empty pool', async () => {
    await receipt(boss, whB.id, [{ itemId: bolts.id, qty: 10, price: 10 }]);
    const second = await receipt(boss, whB.id, [{ itemId: bolts.id, qty: 10, price: 20 }]);
    const p0 = await pool(bolts.id, whB.id);
    // Everything but the second receipt's 10 pcs leaves at the average.
    await post(keeperB, { type: 'writeoff', warehouseId: whB.id, reason: 'used', lines: [{ itemId: bolts.id, qty: p0.q - 10 }] });
    const storno = await docs.stornoDoc(await as(boss), second.document.id, { reason: 'Не тот счёт' });
    const p = await pool(bolts.id, whB.id);
    assert.equal(p.q, 0);
    assert.equal(p.a, 0);
    const adj = (await db.query(`SELECT qty::float, amount::float FROM wh_moves WHERE doc_id = $1 AND qty = 0`, [storno.document.id])).rows;
    assert.equal(adj.length, 1);
    assert.ok(Math.abs(adj[0].amount) > 0);
  });

  await t.test('W8 / W21: a reversed receipt takes its procurement delivery back', async () => {
    const { rows } = await db.query(
      `INSERT INTO proc_requests (seq, number, title, has_items, amount, currency, author_id, created_by, responsible_id, status, supplier_name)
       VALUES (999998, $1, 'Болты', TRUE, 0, 'USD', $2, $2, $2, 'paid', 'ОсОО Болты') RETURNING id`,
      [`ЗКR-${tag}`, keeperA]
    );
    const requestId = rows[0].id;
    created.proc.push(requestId);
    await db.query(`INSERT INTO proc_items (request_id, sort, name, qty, unit, price, amount) VALUES ($1, 0, $2, 4, 'шт', 0, 0)`, [requestId, `Болт ${tag}`]);
    const draft = await link.receiptFromRequest(await as(keeperA), { requestId, warehouseId: whA.id });
    await docs.postDoc(await as(keeperA), draft.document.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const state = async () => (await db.query(`SELECT status, delivery_state FROM proc_requests WHERE id = $1`, [requestId])).rows[0];
    assert.deepEqual(await state(), { status: 'delivered', delivery_state: 'full' });
    const delivery = (await db.query(`SELECT delivered_on, reference, source FROM proc_deliveries WHERE request_id = $1`, [requestId])).rows[0];
    assert.equal(delivery.reference, draft.document.number);
    assert.equal(delivery.source, 'warehouse');
    // The delivery day is the portal's today, not UTC's.
    const today = isoDay(new Date(), (await portalRegional()).timeZone);
    const day = delivery.delivered_on instanceof Date ? `${delivery.delivered_on.getFullYear()}-${String(delivery.delivered_on.getMonth() + 1).padStart(2, '0')}-${String(delivery.delivered_on.getDate()).padStart(2, '0')}` : String(delivery.delivered_on).slice(0, 10);
    assert.equal(day, today);
    await docs.stornoDoc(await as(keeperA), draft.document.id, { reason: 'Вернули поставщику' });
    assert.deepEqual(await state(), { status: 'paid', delivery_state: 'none' });
    // The next receipt is marked again (a «delivered» request used to ignore it).
    const again = await link.receiptFromRequest(await as(keeperA), { requestId, warehouseId: whA.id });
    assert.equal(again.lines[0].qty, 4);
    await docs.postDoc(await as(keeperA), again.document.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.deepEqual(await state(), { status: 'delivered', delivery_state: 'full' });
    // Procurement off: the storno still works, nothing is touched there.
    await settingsService.updateAdminSettings({ modules: { procurement: { enabled: false } } });
    try {
      await docs.stornoDoc(await as(keeperA), again.document.id, { reason: 'Тест' });
      assert.equal((await state()).status, 'delivered');
    } finally {
      await settingsService.updateAdminSettings({ modules: { procurement: { enabled: true } } });
    }
  });

  await t.test('W9: counts of serial and batch items keep instances and batches whole', async () => {
    await receipt(boss, whA.id, [{ itemId: drill.id, qty: 2, price: 100, serials: [{ inventoryNo: `S1-${tag}` }, { inventoryNo: `S2-${tag}` }] }]);
    await receipt(boss, whA.id, [{ itemId: paint.id, qty: 4, price: 5, batchNumber: `P1-${tag}` }]);
    const s1 = await instanceOf(`S1-${tag}`);
    const book = (await pool(drill.id, whA.id)).q;
    // A serial surplus «by quantity» is a piece nobody can find: refused with a clear code.
    const surplus = await docs.createDoc(await as(boss), { type: 'inventory', warehouseId: whA.id, lines: [{ itemId: drill.id, countedQty: book + 1 }] });
    await assert.rejects(docs.postDoc(await as(boss), surplus.document.id), (err) => err.code === 'SERIAL_INSTANCE_REQUIRED');
    await docs.deleteDoc(await as(boss), surplus.document.id);
    // A batch surplus goes into an existing batch (no stock row without a batch).
    const paintBook = (await pool(paint.id, whA.id)).q;
    await post(boss, { type: 'inventory', warehouseId: whA.id, lines: [{ itemId: paint.id, countedQty: paintBook + 2 }] });
    const noBatch = (await db.query(`SELECT COUNT(*)::int AS n FROM wh_stock WHERE item_id = $1 AND batch_id IS NULL AND qty <> 0`, [paint.id])).rows[0].n;
    assert.equal(noBatch, 0);
    assert.equal((await pool(paint.id, whA.id)).q, paintBook + 2);
    // A missing instance is «lost»; the storno of the act brings it back.
    const act = await post(boss, { type: 'inventory', warehouseId: whA.id, lines: [{ itemId: drill.id, instanceId: s1.id, countedQty: 0 }] });
    assert.equal((await instanceOf(`S1-${tag}`)).state, 'lost');
    await docs.stornoDoc(await as(boss), act.document.id, { reason: 'Нашёлся' });
    assert.equal((await instanceOf(`S1-${tag}`)).state, 'ok');
    // One instance is one piece.
    const two = await docs.createDoc(await as(boss), { type: 'inventory', warehouseId: whA.id, lines: [{ itemId: drill.id, instanceId: s1.id, countedQty: 1 }] });
    await db.query(`UPDATE wh_doc_lines SET counted_qty = 2 WHERE doc_id = $1`, [two.document.id]);
    await assert.rejects(docs.postDoc(await as(boss), two.document.id), (err) => err.code === 'INSTANCE_QTY');
    await docs.deleteDoc(await as(boss), two.document.id);
  });

  // Inventory sessions run on warehouse C (their freeze must not stop the other steps).
  await receipt(boss, whC.id, [
    { itemId: drill.id, qty: 2, price: 200, toBinId: bin['Z-01'], serials: [{ inventoryNo: `C1-${tag}` }, { inventoryNo: `C2-${tag}` }] },
    { itemId: nails.id, qty: 5, price: 1, toBinId: bin['Z-02'] },
  ]);
  const c1 = await instanceOf(`C1-${tag}`);
  const c2 = await instanceOf(`C2-${tag}`);
  let session = null;

  await t.test('W4 / W2 / W11: serial counts per instance, counted once, recount flags of phones ignored', async () => {
    const card = await inv.createSession(await as(boss), { warehouseId: whC.id, title: 'Ревизия', counters: [counterA, counterB], freezePolicy: 'record' });
    session = card.session;
    // A serial item without its instance is refused; a quantity on an instance too.
    const r = await inv.syncOps(await as(counterA), session.id, {
      ops: [op('add', { binId: bin['Z-01'], itemId: drill.id, qty: 1 }), op('set', { binId: bin['Z-01'], itemId: drill.id, instanceId: c1.id, qty: 3 })],
    });
    assert.deepEqual(r.results.map((x) => x.code), ['SERIAL_SCAN_INSTANCE', 'INSTANCE_QTY']);
    // Both counters scan C1 in Z-01: one piece, no conflict.
    await inv.syncOps(await as(counterA), session.id, { ops: [op('add', { binId: bin['Z-01'], itemId: drill.id, instanceId: c1.id, qty: 1 })] });
    await inv.syncOps(await as(counterB), session.id, { ops: [op('add', { binId: bin['Z-01'], itemId: drill.id, instanceId: c1.id, qty: 1 })] });
    let rec = await inv.reconcileSession(await as(boss), session.id);
    let row = rec.rows.find((x) => x.instanceId === c1.id && x.binId === bin['Z-01']);
    assert.equal(row.counted, 1);
    assert.equal(row.conflict, false);
    // Taking one instance back (set 0 with the instance) removes just it.
    await inv.syncOps(await as(counterB), session.id, { ops: [op('set', { binId: bin['Z-01'], itemId: drill.id, instanceId: c1.id, qty: 0 })] });
    rec = await inv.reconcileSession(await as(boss), session.id);
    row = rec.rows.find((x) => x.instanceId === c1.id && x.binId === bin['Z-01']);
    assert.equal(row.counters.length, 1);
    // Nails in Z-02: A counts 2; B sends 3 with recount: true although no recount was asked — A's count stays.
    await inv.syncOps(await as(counterA), session.id, { ops: [op('add', { binId: bin['Z-02'], itemId: nails.id, qty: 2 })] });
    await inv.syncOps(await as(counterB), session.id, { ops: [op('add', { binId: bin['Z-02'], itemId: nails.id, qty: 3, recount: true })] });
    rec = await inv.reconcileSession(await as(boss), session.id);
    row = rec.rows.find((x) => x.itemId === nails.id && x.binId === bin['Z-02']);
    assert.equal(row.counters.length, 2);
    assert.equal(row.counted, 5);
  });

  await t.test('W10 / W17: forced finish moves an instance found in another bin; the act sees every op committed before it', async () => {
    // C2 is booked in Z-01 (not counted) and found in Z-02 (counted).
    await inv.syncOps(await as(counterA), session.id, { ops: [op('add', { binId: bin['Z-02'], itemId: drill.id, instanceId: c2.id, qty: 1 }), op('done', { binId: bin['Z-02'] })] });
    // A last op races the finish: applied → in the act, else refused as closed.
    const [sync, fin] = await Promise.all([
      inv.syncOps(await as(counterB), session.id, { ops: [op('add', { binId: bin['Z-02'], itemId: nails.id, qty: 1 })] }),
      inv.finishSession(await as(boss), session.id, { force: true }),
    ]);
    assert.equal(fin.postError, null);
    const actId = fin.session.doc.id;
    const lines = (await db.query(`SELECT item_id, bin_id, instance_id, counted_qty::float AS counted FROM wh_doc_lines WHERE doc_id = $1`, [actId])).rows;
    const nailLine = lines.find((l) => l.item_id === nails.id);
    assert.equal(nailLine.counted, sync.results[0].status === 'applied' ? 6 : 5);
    if (sync.results[0].status !== 'applied') assert.equal(sync.results[0].code, 'SESSION_CLOSED');
    assert.ok(lines.some((l) => l.instance_id === c2.id && l.bin_id === bin['Z-01'] && l.counted === 0));
    const places = (await db.query(`SELECT bin_id, qty::float FROM wh_stock WHERE instance_id = $1 AND qty <> 0`, [c2.id])).rows;
    assert.deepEqual(places, [{ bin_id: bin['Z-02'], qty: 1 }]);
    assert.equal((await instanceOf(`C2-${tag}`)).state, 'ok');
  });

  await t.test('W2: an instance counted in two bins stops the finish', async () => {
    const card = await inv.createSession(await as(boss), { warehouseId: whC.id, counters: [counterA, counterB], freezePolicy: 'record' });
    await inv.syncOps(await as(counterA), card.session.id, { ops: [op('add', { binId: bin['Z-01'], itemId: drill.id, instanceId: c1.id, qty: 1 }), op('done', { binId: bin['Z-01'] })] });
    await inv.syncOps(await as(counterB), card.session.id, { ops: [op('add', { binId: bin['Z-02'], itemId: drill.id, instanceId: c1.id, qty: 1 }), op('done', { binId: bin['Z-02'] })] });
    await assert.rejects(inv.finishSession(await as(boss), card.session.id, { force: true }), (err) => err.code === 'INSTANCE_TWICE' && err.info.inventoryNos.includes(`C1-${tag}`));
    // The manager decides: not in Z-02.
    await inv.setFinal(await as(boss), card.session.id, { binId: bin['Z-02'], itemId: drill.id, instanceId: c1.id, qty: 0 });
    const done = await inv.finishSession(await as(boss), card.session.id, { force: true });
    assert.equal(done.postError, null);
    assert.equal((await db.query(`SELECT COALESCE(SUM(qty),0)::float AS q FROM wh_stock WHERE instance_id = $1`, [c1.id])).rows[0].q, 1);
  });

  await t.test('W18: deleting a failed act reopens its session', async () => {
    // A big difference sends the act to approval; the approver returns it → a draft the manager deletes.
    await receipt(boss, whC.id, [{ itemId: bolts.id, qty: 100, price: 10, toBinId: bin['Z-02'] }]);
    const card = await inv.createSession(await as(boss), { warehouseId: whC.id, counters: [counterA], freezePolicy: 'record' });
    await inv.syncOps(await as(counterA), card.session.id, { ops: [op('set', { binId: bin['Z-02'], itemId: bolts.id, qty: 1 }), op('done', { binId: bin['Z-02'] })] });
    const fin = await inv.finishSession(await as(boss), card.session.id, { force: true });
    const actId = fin.session.doc.id;
    assert.equal(fin.session.doc.status, 'pending');
    const process = await approvals.getProcess('warehouse.document', String(actId));
    await approvals.decide(await as(boss), { type: 'warehouse.document', docId: String(actId) }, { action: 'return', round: process.round, stage: process.currentStage, comment: 'Пересчитайте' });
    assert.equal((await db.query(`SELECT status FROM wh_docs WHERE id = $1`, [actId])).rows[0].status, 'draft');
    await docs.deleteDoc(await as(boss), actId);
    const stuck = await inv.getSession(await as(boss), card.session.id);
    assert.equal(stuck.session.status, 'finished');
    assert.equal(stuck.my.reopen, true);
    const reopened = await inv.reopenSession(await as(boss), card.session.id);
    assert.equal(reopened.session.status, 'review');
    await inv.cancelSession(await as(boss), card.session.id);
  });

  await t.test('W23: the session list loads in bulk and stays right', async () => {
    const list = await inv.listSessions(await as(boss), { warehouse: String(whC.id) });
    assert.ok(list.items.length >= 3);
    for (const item of list.items) {
      assert.ok(item.warehouse.name.startsWith('C '));
      assert.ok(item.progress.total >= 1);
    }
    const active = await inv.activeSessions(await as(boss), { warehouse: whC.id });
    assert.ok(Array.isArray(active.sessions));
  });

  await t.test('W12: a write-off from a holder takes only what came from its warehouse', async () => {
    await receipt(keeperB, whB.id, [{ itemId: nails.id, qty: 3, price: 1 }]);
    await post(keeperA, { type: 'issue', warehouseId: whA.id, toHolderType: 'employee', toHolderId: foreman, lines: [{ itemId: nails.id, qty: 10 }] });
    await post(keeperB, { type: 'issue', warehouseId: whB.id, toHolderType: 'employee', toHolderId: foreman, lines: [{ itemId: nails.id, qty: 3 }] });
    const off = await docs.createDoc(await as(keeperB), { type: 'writeoff', warehouseId: whB.id, fromHolderType: 'employee', fromHolderId: foreman, reason: 'used', lines: [{ itemId: nails.id, qty: 5 }] });
    await assert.rejects(docs.postDoc(await as(keeperB), off.document.id), (err) => err.code === 'INSUFFICIENT');
    await docs.updateDoc(await as(keeperB), off.document.id, { lines: [{ itemId: nails.id, qty: 3 }] });
    await docs.postDoc(await as(keeperB), off.document.id);
    const left = (await db.query(`SELECT warehouse_id, SUM(qty)::float AS q FROM wh_stock WHERE item_id = $1 AND holder_type = 'employee' AND holder_id = $2 GROUP BY warehouse_id`, [nails.id, foreman])).rows;
    assert.equal(left.find((r) => r.warehouse_id === whA.id).q, 10);
    assert.equal(left.find((r) => r.warehouse_id === whB.id)?.q || 0, 0);
  });

  await t.test('W13: an old draft is dated when posted; a chosen date stays', async () => {
    const start = new Date(Date.now() - 1000);
    const draft = await docs.createDoc(await as(keeperA), { type: 'issue', warehouseId: whA.id, toHolderType: 'employee', toHolderId: foreman, lines: [{ itemId: nails.id, qty: 1 }] });
    await db.query(`UPDATE wh_docs SET doc_date = NOW() - INTERVAL '3 days', created_at = NOW() - INTERVAL '3 days' WHERE id = $1`, [draft.document.id]);
    await docs.postDoc(await as(keeperA), draft.document.id);
    const row = (await db.query(`SELECT doc_date FROM wh_docs WHERE id = $1`, [draft.document.id])).rows[0];
    assert.ok(new Date(row.doc_date) >= start);
    const moved = (await db.query(`SELECT MIN(moved_at) AS at FROM wh_moves WHERE doc_id = $1`, [draft.document.id])).rows[0].at;
    assert.ok(new Date(moved) >= start);
    const chosen = new Date(Date.now() - 2 * 86400000).toISOString();
    const back = await docs.createDoc(await as(boss), { type: 'issue', warehouseId: whA.id, toHolderType: 'employee', toHolderId: foreman, date: chosen, lines: [{ itemId: nails.id, qty: 1 }] });
    await docs.postDoc(await as(boss), back.document.id);
    const kept = (await db.query(`SELECT doc_date FROM wh_docs WHERE id = $1`, [back.document.id])).rows[0];
    assert.equal(new Date(kept.doc_date).toISOString(), chosen);
    // A storekeeper without «backdate» cannot choose a past date.
    await assert.rejects(docs.createDoc(await as(keeperA), { type: 'issue', warehouseId: whA.id, toHolderType: 'employee', toHolderId: foreman, date: chosen }), (err) => err.code === 'BACKDATE_FORBIDDEN');
  });

  await t.test('W16: an empty received quantity is refused, not taken as «all arrived»', async () => {
    const transfer = await docs.createDoc(await as(keeperA), { type: 'transfer', warehouseId: whA.id, toWarehouseId: whB.id, lines: [{ itemId: nails.id, qty: 4 }] });
    const shipped = await docs.shipDoc(await as(keeperA), transfer.document.id);
    const lineId = shipped.lines[0].id;
    await assert.rejects(docs.receiveDoc(await as(keeperB), transfer.document.id, { lines: [{ lineId, receivedQty: '' }] }), (err) => err.code === 'QTY_REQUIRED');
    await assert.rejects(docs.receiveDoc(await as(keeperB), transfer.document.id, { lines: [{ lineId, receivedQty: null }] }), (err) => err.code === 'QTY_REQUIRED');
    const received = await docs.receiveDoc(await as(keeperB), transfer.document.id, { lines: [{ lineId, receivedQty: 0 }] });
    assert.ok(received.document.derived.some((d) => d.type === 'discrepancy'));
  });

  await t.test('W19 / W20: tools, codes, hints and reports show only what the person may see', async () => {
    await receipt(keeperB, whB.id, [{ itemId: drill.id, qty: 1, price: 50, serials: [{ inventoryNo: `BT-${tag}` }] }]);
    const bt = await instanceOf(`BT-${tag}`);
    await setWh({ everyoneCanView: false });
    try {
      // keeperA sees A and C only: the tool on B is neither in the item card nor placed by its code.
      const card = await items.getItem(await as(keeperA), drill.id);
      assert.ok(card.instances.length > 0);
      assert.ok(!card.instances.some((i) => i.id === bt.id));
      const scanned = await items.resolveCode(await as(keeperA), `BT-${tag}`);
      assert.equal(scanned.instance.where, null);
      assert.ok((await items.resolveCode(await as(keeperB), `BT-${tag}`)).instance.where);
      // Without any warehouse right nor holdings nor a running count: no scanning.
      await assert.rejects(items.resolveCode(await as(stranger), `BT-${tag}`), (err) => err.statusCode === 403);
      // The foreman holds goods: may scan (their own tools), sees nothing of B.
      const own = await items.resolveCode(await as(foreman), `H1-${tag}`).catch((err) => err);
      assert.ok(!(own instanceof Error) || own.statusCode !== 403);
      // Hints and the report of someone else's holdings: only from the warehouses I see.
      const hints = await stock.hintsFor(await as(keeperA), { holderType: 'employee', holderId: String(foreman), items: String(nails.id) });
      const fromA = (await db.query(`SELECT COALESCE(SUM(qty),0)::float AS q FROM wh_stock WHERE item_id = $1 AND holder_type = 'employee' AND holder_id = $2 AND warehouse_id = ANY($3::int[])`, [nails.id, foreman, [whA.id, whC.id]])).rows[0].q;
      assert.equal(hints[nails.id]?.qty ?? 0, fromA);
      const report = await reports.byObject(await as(keeperB), { holderType: 'employee', holderId: String(foreman) });
      const nailRow = report.rows.find((r) => r.item.id === nails.id);
      assert.equal(nailRow?.issuedQty ?? 0, 3);
      // My own holdings in full.
      const mine = await reports.byObject(await as(foreman), { holderType: 'employee', holderId: String(foreman) }).catch((err) => err);
      if (!(mine instanceof Error)) assert.ok(mine.rows.find((r) => r.item.id === nails.id).issuedQty >= 13);
    } finally {
      await setWh({ everyoneCanView: true });
    }
  });

  await t.test('W22: a reversed issue gives its reserve back', async () => {
    await receipt(keeperA, whA.id, [{ itemId: bolts.id, qty: 20, price: 3 }]);
    const reserve = await stock.createReserve(await as(keeperA), { warehouseId: whA.id, itemId: bolts.id, qty: 5, targetType: 'other', targetLabel: 'Объект' });
    const issued = await post(keeperA, { type: 'issue', warehouseId: whA.id, toHolderType: 'employee', toHolderId: foreman, lines: [{ itemId: bolts.id, qty: 5, reserveId: reserve.id }] });
    let row = (await db.query(`SELECT qty::float, status FROM wh_reserves WHERE id = $1`, [reserve.id])).rows[0];
    assert.deepEqual(row, { qty: 0, status: 'consumed' });
    await docs.stornoDoc(await as(keeperA), issued.document.id, { reason: 'Не выдали' });
    row = (await db.query(`SELECT qty::float, status FROM wh_reserves WHERE id = $1`, [reserve.id])).rows[0];
    assert.deepEqual(row, { qty: 5, status: 'active' });
  });
});
