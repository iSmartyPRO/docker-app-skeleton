import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

/*
 * Database integration of the Warehouse module (docs/warehouse.md): posting
 * and the no-negative rule, two storekeepers issuing the last 5 pcs at once,
 * the two-step transfer with a discrepancy act, unit conversion, the moving
 * average, reserves, storno, the write-off approval threshold, the tool
 * hand-over with the recipient's confirmation, cost hiding, rights per
 * warehouse, the receipt from a purchase request marking its delivery.
 * Needs a test database (never production!):
 *
 *   WAREHOUSE_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/warehouse.db.test.js
 *
 * Without WAREHOUSE_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.WAREHOUSE_DB_TEST === '1';
const skip = enabled ? false : 'set WAREHOUSE_DB_TEST=1 and a test database to run';

const tag = `wht${Date.now().toString(36)}`;
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
    const docs = (await client.query(`SELECT id FROM wh_docs WHERE warehouse_id = ANY($1::int[]) OR to_warehouse_id = ANY($1::int[]) OR author_id = ANY($2::int[])`, [created.warehouses, created.users])).rows.map((r) => r.id);
    await client.query(`DELETE FROM approval_processes WHERE type = 'warehouse.document' AND doc_id = ANY($1::text[])`, [docs.map(String)]);
    await client.query(`DELETE FROM wh_moves WHERE doc_id = ANY($1::int[])`, [docs]);
    await client.query(`UPDATE wh_docs SET base_doc_id = NULL WHERE id = ANY($1::int[])`, [docs]);
    await client.query(`DELETE FROM wh_docs WHERE id = ANY($1::int[])`, [docs]);
    await client.query(`DELETE FROM wh_stock WHERE item_id = ANY($1::int[])`, [created.items]);
    await client.query(`DELETE FROM wh_items WHERE id = ANY($1::int[])`, [created.items]);
    await client.query(`DELETE FROM wh_warehouses WHERE id = ANY($1::int[])`, [created.warehouses]);
    if (created.proc.length) await client.query(`DELETE FROM proc_requests WHERE id = ANY($1::int[])`, [created.proc]);
    await client.query(`DELETE FROM proc_requests WHERE author_id = ANY($1::int[])`, [created.users]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.warn('cleanup failed:', err.message);
  } finally {
    client.release();
  }
  if (created.users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  if (created.roles.length) await db.query(`DELETE FROM app_roles WHERE id = ANY($1)`, [created.roles]);
  await db.closePool();
});

test('database: warehouse end to end', { skip, timeout: 120000 }, async (t) => {
  db = await import('../config/database.js');
  const { ensureLegalEntitiesTable } = await import('../services/legalEntities.js');
  await ensureLegalEntitiesTable();
  await (await import('../modules/approvals/schema.js')).ensureApprovalsSchema();
  await (await import('../modules/procurement/schema.js')).ensureProcurementSchema();
  await (await import('../modules/warehouse/schema.js')).ensureWarehouseSchema();
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
  const link = await import('../modules/warehouse/procurement.js');
  const { stripCost, COST_KEYS } = await import('../modules/warehouse/logic.js');
  const approvals = await import('../modules/approvals/api.js');
  const { inboxFor } = await import('../services/inbox.js');

  const before = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules;
  await settingsService.updateAdminSettings({
    modules: {
      warehouse: { enabled: true, settings: { currency: 'USD', currencies: ['USD', 'KGS'], rates: { KGS: 87.5 }, approvalThreshold: 500, approvalThresholdCurrency: 'USD', approvalTypes: ['writeoff', 'correction', 'inventory'], everyoneCanView: true, closedUntil: null } },
      procurement: { enabled: true, settings: { anyoneCanCreate: true } },
    },
  });
  const savedRoute = (await db.query(`SELECT 1 FROM approval_routes WHERE type = 'warehouse.document'`)).rows[0];
  restore = async () => {
    await settingsService.updateAdminSettings({ modules: { warehouse: { enabled: before.warehouse.enabled, settings: before.warehouse.settings }, procurement: { enabled: before.procurement.enabled, settings: before.procurement.settings } } });
    if (!savedRoute) await db.query(`DELETE FROM approval_routes WHERE type = 'warehouse.document'`);
  };

  const role = async (perms) => {
    const { rows } = await db.query(`INSERT INTO app_roles (key, name, permissions) VALUES ($1, $2, $3) RETURNING id`, [`${tag}_${created.roles.length}`, `R ${tag} ${created.roles.length}`, perms]);
    created.roles.push(rows[0].id);
    return rows[0].id;
  };
  const grant = (userId, roleId) => db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);

  const boss = await makeUser('boss'); // warehouse.admin + cost
  const keeperA = await makeUser('keeperA'); // MOL of A, no cost
  const keeperB = await makeUser('keeperB'); // MOL of B, no cost
  const foreman = await makeUser('foreman'); // nothing: everyoneCanView → view + request
  const accountant = await makeUser('accountant'); // warehouse.cost
  await grant(boss, await role(['warehouse.admin']));
  await grant(accountant, await role(['warehouse.cost']));
  const as = (id) => requestAs(id);

  const whA = await warehouses.createWarehouse(await as(boss), { name: `A ${tag}`, code: `A${tag}`, kind: 'main', molId: keeperA });
  const whB = await warehouses.createWarehouse(await as(boss), { name: `B ${tag}`, code: `B${tag}`, kind: 'site', molId: keeperB });
  created.warehouses.push(whA.id, whB.id);

  const makeItem = async (input) => {
    const card = await items.createItem(await as(boss), input);
    created.items.push(card.item.id);
    return card.item;
  };
  const cement = await makeItem({ name: `Цемент ${tag}`, sku: `CEM-${tag}`, baseUnit: 'кг', units: [{ code: 'мешок', factor: 50 }], receiptUnit: 'мешок', barcodes: [{ code: `46${Date.now()}`.slice(0, 13), unit: 'мешок' }] });
  const bits = await makeItem({ name: `Бита ${tag}`, sku: `BIT-${tag}` });
  const pipes = await makeItem({ name: `Труба ${tag}`, sku: `PIPE-${tag}`, baseUnit: 'м' });
  const drill = await makeItem({ name: `Перфоратор ${tag}`, sku: `DRL-${tag}`, tracking: 'serial' });

  const pool = async (itemId, warehouseId) => (await db.query(`SELECT COALESCE(SUM(qty),0)::float AS q, COALESCE(SUM(amount),0)::float AS a FROM wh_stock WHERE item_id = $1 AND warehouse_id = $2 AND holder_type = 'warehouse'`, [itemId, warehouseId])).rows[0];
  const receipt = async (who, warehouseId, lines, extra = {}) => {
    const draft = await docs.createDoc(await as(who), { type: 'receipt', toWarehouseId: warehouseId, supplierName: 'ОсОО Поставщик', lines, ...extra });
    return docs.postDoc(await as(who), draft.document.id);
  };
  const issue = async (who, warehouseId, lines, extra = {}) => docs.createDoc(await as(who), { type: 'issue', warehouseId, toHolderType: 'employee', toHolderId: foreman, lines, ...extra });

  await t.test('unit conversion and moving average', async () => {
    // 2 мешка × 10 USD = 100 кг worth 20 USD.
    const first = await receipt(keeperA, whA.id, [{ itemId: cement.id, qty: 2, unit: 'мешок', price: 10 }]);
    assert.equal(first.document.status, 'posted');
    assert.equal(first.lines[0].baseQty, 100);
    let p = await pool(cement.id, whA.id);
    assert.equal(p.q, 100);
    assert.equal(p.a, 20);
    // + 100 кг at 0.3 = 30 → 200 кг worth 50, average 0.25.
    await receipt(boss, whA.id, [{ itemId: cement.id, qty: 100, unit: 'кг', price: 0.3 }]);
    p = await pool(cement.id, whA.id);
    assert.equal(p.q, 200);
    assert.equal(p.a, 50);
    // Issue 40 кг: 40 × 0.25 = 10.
    const out = await issue(keeperA, whA.id, [{ itemId: cement.id, qty: 40, unit: 'кг' }]);
    await docs.postDoc(await as(keeperA), out.document.id);
    p = await pool(cement.id, whA.id);
    assert.equal(p.q, 160);
    assert.equal(p.a, 40);
    const line = (await db.query(`SELECT amount::float FROM wh_doc_lines WHERE doc_id = $1`, [out.document.id])).rows[0];
    assert.equal(line.amount, 10);
    // A receipt in another currency converts by the rate: 875 KGS = 10 USD.
    await receipt(boss, whA.id, [{ itemId: cement.id, qty: 40, unit: 'кг', price: 21.875 }], { currency: 'KGS' });
    p = await pool(cement.id, whA.id);
    assert.equal(p.a, 50);
    // Scanning the pack barcode resolves to the item with the pack unit.
    const scanned = await items.resolveCode(await as(keeperA), cement.barcodes[0].code);
    assert.equal(scanned.item.id, cement.id);
    assert.equal(scanned.unit, 'мешок');
    assert.equal(scanned.factor, 50);
  });

  await t.test('no negative stock: shortage is reported, nothing is written', async () => {
    const draft = await issue(keeperA, whA.id, [{ itemId: cement.id, qty: 1000 }]);
    const card = await docs.getDoc(await as(keeperA), draft.document.id);
    assert.equal(card.lines[0].short, true);
    assert.equal(card.lines[0].hint.available, 200);
    await assert.rejects(docs.postDoc(await as(keeperA), draft.document.id), (err) => err.code === 'INSUFFICIENT' && err.info.shortages[0].itemId === cement.id && err.info.shortages[0].available === 200);
    assert.equal((await pool(cement.id, whA.id)).q, 200);
    assert.equal((await docs.getDoc(await as(keeperA), draft.document.id)).document.status, 'draft');
  });

  await t.test('two storekeepers issue the last 5 pcs at once: one wins', async () => {
    await receipt(keeperA, whA.id, [{ itemId: bits.id, qty: 5, price: 2 }]);
    const one = await issue(keeperA, whA.id, [{ itemId: bits.id, qty: 5 }]);
    const two = await issue(boss, whA.id, [{ itemId: bits.id, qty: 5 }]);
    const results = await Promise.allSettled([docs.postDoc(await as(keeperA), one.document.id), docs.postDoc(await as(boss), two.document.id)]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].reason.code, 'INSUFFICIENT');
    assert.equal((await pool(bits.id, whA.id)).q, 0);
  });

  await t.test('reserves: available = stock − reserved; an issue by the reserve consumes it', async () => {
    await receipt(keeperA, whA.id, [{ itemId: pipes.id, qty: 10, price: 5 }]);
    const reserve = await stock.createReserve(await as(keeperA), { itemId: pipes.id, warehouseId: whA.id, qty: 6, targetType: 'other', targetLabel: 'Объект 23' });
    await assert.rejects(stock.createReserve(await as(keeperA), { itemId: pipes.id, warehouseId: whA.id, qty: 5 }), (err) => err.code === 'INSUFFICIENT');
    const hints = await stock.stockHints(await (await import('../modules/warehouse/access.js')).whContext(await as(keeperA)), { warehouseId: whA.id, itemIds: [pipes.id] });
    assert.deepEqual(hints.get(pipes.id), { qty: 10, reserved: 6, available: 4, inTransit: 0 });
    const tooMuch = await issue(keeperA, whA.id, [{ itemId: pipes.id, qty: 5 }]);
    await assert.rejects(docs.postDoc(await as(keeperA), tooMuch.document.id), (err) => err.code === 'INSUFFICIENT' && err.info.shortages[0].available === 4);
    await docs.deleteDoc(await as(keeperA), tooMuch.document.id);
    const free = await issue(keeperA, whA.id, [{ itemId: pipes.id, qty: 4 }]);
    await docs.postDoc(await as(keeperA), free.document.id);
    const byReserve = await issue(keeperA, whA.id, [{ itemId: pipes.id, qty: 6, reserveId: reserve.reserve?.id || reserve.id }]);
    await docs.postDoc(await as(keeperA), byReserve.document.id);
    const left = (await db.query(`SELECT status, qty::float FROM wh_reserves WHERE id = $1`, [reserve.id])).rows[0];
    assert.equal(left.status, 'consumed');
    assert.equal((await pool(pipes.id, whA.id)).q, 0);
  });

  let transferId = null;
  await t.test('transfer in two steps; acceptance with a discrepancy makes an act', async () => {
    const draft = await docs.createDoc(await as(keeperA), { type: 'transfer', warehouseId: whA.id, toWarehouseId: whB.id, lines: [{ itemId: cement.id, qty: 10, unit: 'кг' }] });
    transferId = draft.document.id;
    // keeperB is not a storekeeper of A: cannot ship it.
    await assert.rejects(docs.shipDoc(await as(keeperB), transferId), (err) => err.statusCode === 403);
    const shipped = await docs.shipDoc(await as(keeperA), transferId);
    assert.equal(shipped.document.status, 'shipped');
    assert.equal((await pool(cement.id, whA.id)).q, 190);
    const transit = (await db.query(`SELECT SUM(qty)::float AS q FROM wh_stock WHERE item_id = $1 AND holder_type = 'transit' AND holder_id = $2`, [cement.id, transferId])).rows[0];
    assert.equal(transit.q, 10);
    // «Ждут приёмки» for the MOL of B.
    const inbox = await inboxFor({ user: { id: keeperB }, req: await as(keeperB), access: (await as(keeperB)).access });
    assert.ok(inbox.items.some((item) => item.module === 'warehouse' && item.id === transferId && item.kind === 'receipt'));
    await assert.rejects(docs.receiveDoc(await as(keeperA), transferId, {}), (err) => err.statusCode === 403);
    const lineId = shipped.lines[0].id;
    const received = await docs.receiveDoc(await as(keeperB), transferId, { lines: [{ lineId, receivedQty: 9 }] });
    assert.equal(received.document.status, 'posted');
    assert.equal(received.document.derived.length, 1);
    assert.equal(received.document.derived[0].type, 'discrepancy');
    assert.equal((await pool(cement.id, whB.id)).q, 9);
    const after = (await db.query(`SELECT COALESCE(SUM(qty),0)::float AS q FROM wh_stock WHERE holder_type = 'transit' AND holder_id = $1`, [transferId])).rows[0];
    assert.equal(after.q, 0);
    const act = (await db.query(`SELECT l.qty::float, l.amount::float FROM wh_doc_lines l WHERE l.doc_id = $1`, [received.document.derived[0].id])).rows[0];
    assert.equal(act.qty, -1);
    assert.equal(act.amount, -0.25);
  });

  await t.test('storno restores the stock; what was used cannot be reversed', async () => {
    const out = await issue(keeperA, whA.id, [{ itemId: cement.id, qty: 30, unit: 'кг' }]);
    const posted = await docs.postDoc(await as(keeperA), out.document.id);
    assert.equal((await pool(cement.id, whA.id)).q, 160);
    await assert.rejects(docs.stornoDoc(await as(keeperA), posted.document.id, {}), (err) => err.code === 'REASON_REQUIRED');
    const storno = await docs.stornoDoc(await as(keeperA), posted.document.id, { reason: 'ошибка' });
    assert.equal(storno.document.type, 'storno');
    assert.equal((await pool(cement.id, whA.id)).q, 190);
    assert.equal((await docs.getDoc(await as(keeperA), posted.document.id)).document.status, 'reversed');
    // A receipt of bits whose pieces were issued since cannot be reversed.
    const rec = await receipt(keeperA, whA.id, [{ itemId: bits.id, qty: 3, price: 2 }]);
    const used = await issue(keeperA, whA.id, [{ itemId: bits.id, qty: 3 }]);
    await docs.postDoc(await as(keeperA), used.document.id);
    await assert.rejects(docs.stornoDoc(await as(keeperA), rec.document.id, { reason: 'x' }), (err) => err.code === 'INSUFFICIENT');
    // The journal is append-only.
    await assert.rejects(db.query(`UPDATE wh_moves SET qty = 0 WHERE doc_id = $1`, [rec.document.id]), /append-only/);
  });

  await t.test('write-off: below the threshold posts, above it goes to approval', async () => {
    const small = await docs.createDoc(await as(keeperA), { type: 'writeoff', warehouseId: whA.id, reason: 'damage', lines: [{ itemId: cement.id, qty: 4, unit: 'кг' }] });
    await assert.rejects(docs.postDoc(await as(foreman), small.document.id), (err) => err.statusCode === 403 || err.statusCode === 404);
    const posted = await docs.postDoc(await as(keeperA), small.document.id);
    assert.equal(posted.document.status, 'posted');
    // 3 000 кг at ~0.26 > $500.
    await receipt(boss, whA.id, [{ itemId: cement.id, qty: 60, unit: 'мешок', price: 13 }]);
    const big = await docs.createDoc(await as(keeperA), { type: 'writeoff', warehouseId: whA.id, reason: 'expired', reasonText: 'Слежался', lines: [{ itemId: cement.id, qty: 2500, unit: 'кг' }] });
    const before = (await pool(cement.id, whA.id)).q;
    const sent = await docs.postDoc(await as(keeperA), big.document.id);
    assert.equal(sent.document.status, 'pending');
    assert.equal((await pool(cement.id, whA.id)).q, before);
    const process = await approvals.getProcess('warehouse.document', String(big.document.id));
    assert.equal(process.status, 'pending');
    // The approvals service shows its amount to everyone in the process: warehouse sums stay on the document (cost rights).
    assert.equal(process.amount, null);
    assert.ok((await docs.getDoc(await as(boss), big.document.id)).document.sum > 500);
    assert.equal((await docs.getDoc(await as(keeperA), big.document.id)).document.sum, null);
    await approvals.decide(await as(boss), { type: 'warehouse.document', docId: String(big.document.id) }, { action: 'approve', round: process.round, stage: process.currentStage });
    assert.equal((await docs.getDoc(await as(keeperA), big.document.id)).document.status, 'posted');
    assert.equal((await pool(cement.id, whA.id)).q, before - 2500);
  });

  await t.test('serial tools: issue, «my tools», hand-over confirmed by the recipient', async () => {
    const rec = await receipt(keeperA, whA.id, [{ itemId: drill.id, qty: 2, price: 300, serials: [{ inventoryNo: `T1-${tag}`, serialNo: 'SN-1' }, { inventoryNo: `T2-${tag}`, serialNo: 'SN-2' }] }]);
    assert.equal(rec.document.status, 'posted');
    const inst = (await db.query(`SELECT id, inventory_no FROM wh_instances WHERE item_id = $1 ORDER BY inventory_no`, [drill.id])).rows;
    assert.equal(inst.length, 2);
    const scanned = await items.resolveCode(await as(keeperA), `T1-${tag}`);
    assert.equal(scanned.kind, 'instance');
    assert.equal(scanned.instance.where.type, 'warehouse');
    const out = await issue(keeperA, whA.id, [], { returnBy: '2099-01-01' });
    await docs.addLine(await as(keeperA), out.document.id, { code: `T1-${tag}` });
    await assert.rejects(docs.addLine(await as(keeperA), out.document.id, { code: `T1-${tag}` }), (err) => err.code === 'DUPLICATE_INSTANCE');
    await docs.postDoc(await as(keeperA), out.document.id);
    // Tool registry for every kind of viewer and chip (an unused bind parameter once broke the admin list).
    for (const who of [boss, keeperA, foreman]) {
      for (const chip of [undefined, 'mine', 'issued', 'in_stock', 'repair', 'service_soon']) {
        const list = await tools.listTools(await as(who), chip ? { chip } : {});
        assert.ok(Array.isArray(list.items));
      }
    }
    let mine = await tools.myTools(await as(foreman));
    assert.equal(mine.tools.length, 1);
    assert.equal(mine.tools[0].inventoryNo, `T1-${tag}`);
    // Hand it over to the accountant: waits for the confirmation, the tool stays on the foreman.
    await assert.rejects(tools.handover(await as(keeperA), { toUserId: accountant, instanceIds: [inst[0].id] }), (err) => err.code === 'NOT_HELD');
    const sent = await tools.handover(await as(foreman), { toUserId: accountant, instanceIds: [inst[0].id] });
    assert.equal(sent.document.status, 'pending');
    assert.equal((await tools.myTools(await as(foreman))).tools.length, 1);
    await assert.rejects(docs.confirmHandover(await as(foreman), sent.document.id), (err) => err.statusCode === 403);
    const inbox = await inboxFor({ user: { id: accountant }, req: await as(accountant), access: (await as(accountant)).access });
    assert.ok(inbox.items.some((item) => item.kind === 'handover' && item.id === sent.document.id));
    await docs.confirmHandover(await as(accountant), sent.document.id);
    mine = await tools.myTools(await as(foreman));
    assert.equal(mine.tools.length, 0);
    const theirs = await tools.myTools(await as(accountant));
    assert.equal(theirs.tools[0].inventoryNo, `T1-${tag}`);
    const card = await tools.getTool(await as(boss), inst[0].id);
    assert.ok(card.history.length >= 3);
  });

  await t.test('cost hiding: without warehouse.cost no sums anywhere', async () => {
    const hasMoney = (value) => {
      if (Array.isArray(value)) return value.some(hasMoney);
      if (value && typeof value === 'object') return Object.entries(value).some(([key, inner]) => (COST_KEYS.has(key) && inner !== null && inner !== undefined) || hasMoney(inner));
      return false;
    };
    const keeper = await as(keeperA);
    const listed = await stock.listStock(keeper, {});
    assert.ok(listed.items.length > 0);
    assert.ok(listed.items.every((row) => row.amount === null));
    assert.equal(listed.totals, null);
    const doc = (await docs.listDocs(keeper, { type: 'receipt' })).items[0];
    const card = await docs.getDoc(await as(keeperA), doc.id);
    assert.equal(card.lines[0].price, null);
    assert.equal(card.document.sum, null);
    const turn = await reports.turnover(await as(keeperA), { from: '2000-01-01' });
    assert.ok(turn.rows.every((row) => row.openingSum === null && row.sumIn === null));
    const csv = await reports.reportCsv(await as(keeperA), 'turnover', { from: '2000-01-01' });
    assert.ok(!csv.csv.includes('Сумма'));
    // The routes strip whatever is left from the whole payload.
    assert.equal(hasMoney(stripCost({ card, listed, turn, item: await items.getItem(await as(keeperA), cement.id) })), false);
    // The accountant sees them.
    const seen = await stock.listStock(await as(accountant), { warehouse: String(whA.id) });
    assert.ok(seen.items.some((row) => row.amount > 0));
    assert.ok(seen.totals.amount > 0);
  });

  await t.test('rights per warehouse: zones of responsibility', async () => {
    // keeperA is the MOL of A: no documents on B.
    await assert.rejects(docs.createDoc(await as(keeperA), { type: 'transfer', warehouseId: whB.id, toWarehouseId: whA.id }), (err) => err.statusCode === 403);
    await assert.rejects(docs.createDoc(await as(keeperA), { type: 'receipt', toWarehouseId: whB.id }), (err) => err.statusCode === 403);
    // An assignment grants `operate` on B for a day.
    await db.query(`INSERT INTO wh_assignments (warehouse_id, subject_type, subject_id, rights) VALUES ($1, 'user', $2, '{operate}')`, [whB.id, keeperA]);
    const draft = await docs.createDoc(await as(keeperA), { type: 'receipt', toWarehouseId: whB.id });
    assert.equal(draft.document.type, 'receipt');
    await db.query(`DELETE FROM wh_assignments WHERE warehouse_id = $1 AND subject_id = $2`, [whB.id, keeperA]);
    // Without «everyone views», a MOL sees only their warehouse.
    await settingsService.updateAdminSettings({ modules: { warehouse: { settings: { everyoneCanView: false } } } });
    const ctxA = await (await import('../modules/warehouse/access.js')).whContext(await as(keeperA));
    assert.deepEqual(ctxA.visibleIds(), [whA.id]);
    const listed = await stock.listStock(await as(keeperA), {});
    assert.ok(listed.items.every((row) => row.warehouse.id === whA.id));
    const foremanReq = await as(foreman);
    await assert.rejects(docs.getDoc(foremanReq, transferId), (err) => err.statusCode === 404);
    // The author still sees their own receipt on B.
    assert.equal((await docs.getDoc(await as(keeperA), draft.document.id)).document.id, draft.document.id);
    await settingsService.updateAdminSettings({ modules: { warehouse: { settings: { everyoneCanView: true } } } });
  });

  await t.test('receipt from a purchase request marks its delivery; shortage → purchase draft', async () => {
    const { rows } = await db.query(
      `INSERT INTO proc_requests (seq, number, title, has_items, amount, currency, author_id, created_by, responsible_id, status, supplier_name)
       VALUES (999999, $1, 'Трубы на объект', TRUE, 100, 'USD', $2, $2, $2, 'to_pay', 'ОсОО Трубы') RETURNING id`,
      [`ЗК-${tag}`, keeperA]
    );
    const requestId = rows[0].id;
    created.proc.push(requestId);
    await db.query(`INSERT INTO proc_items (request_id, sort, name, qty, unit, price, amount) VALUES ($1, 0, $2, 20, 'м', 5, 100)`, [requestId, `Труба ${tag}`]);
    const draft = await link.receiptFromRequest(await as(keeperA), { requestId, warehouseId: whA.id });
    assert.equal(draft.document.procurement.id, requestId);
    assert.equal(draft.lines[0].item.id, pipes.id);
    assert.equal(draft.lines[0].qty, 20);
    assert.equal(draft.document.supplier.name, 'ОсОО Трубы');
    // Receive 12 of 20 now: a partial delivery.
    await docs.updateLine(await as(keeperA), draft.document.id, draft.lines[0].id, { qty: 12 });
    await docs.postDoc(await as(keeperA), draft.document.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    let deliveries = (await db.query(`SELECT partial FROM proc_deliveries WHERE request_id = $1 ORDER BY id`, [requestId])).rows;
    assert.deepEqual(deliveries.map((d) => d.partial), [true]);
    // The rest: the request is fully delivered.
    const rest = await link.receiptFromRequest(await as(keeperA), { requestId, warehouseId: whA.id });
    assert.equal(rest.lines[0].qty, 8);
    await docs.postDoc(await as(keeperA), rest.document.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    deliveries = (await db.query(`SELECT partial FROM proc_deliveries WHERE request_id = $1 ORDER BY id`, [requestId])).rows;
    assert.deepEqual(deliveries.map((d) => d.partial), [true, false]);
    assert.equal((await db.query(`SELECT delivery_state FROM proc_requests WHERE id = $1`, [requestId])).rows[0].delivery_state, 'full');
    // «Заказать недостающее»: an issue of 50 m with 20 on hand → a draft request for 30 m.
    const short = await issue(keeperA, whA.id, [{ itemId: pipes.id, qty: 50 }]);
    const ordered = await link.orderShortage(await as(keeperA), short.document.id);
    const req = (await db.query(`SELECT r.status, i.qty::float FROM proc_requests r JOIN proc_items i ON i.request_id = r.id WHERE r.id = $1`, [ordered.request.id])).rows[0];
    created.proc.push(ordered.request.id);
    assert.equal(req.status, 'draft');
    assert.equal(req.qty, 30);
    // Procurement off: the link answers MODULE_DISABLED, the warehouse keeps working.
    await settingsService.updateAdminSettings({ modules: { procurement: { enabled: false } } });
    await assert.rejects(link.receiptFromRequest(await as(keeperA), { requestId, warehouseId: whA.id }), (err) => err.code === 'MODULE_DISABLED');
    await settingsService.updateAdminSettings({ modules: { procurement: { enabled: true } } });
  });

  await t.test('batches leave first-expired-first-out, at their own cost', async () => {
    const paint = await makeItem({ name: `Краска ${tag}`, sku: `PNT-${tag}`, tracking: 'batch', trackExpiry: true });
    await receipt(boss, whA.id, [
      { itemId: paint.id, qty: 5, price: 10, batchNumber: `LATE-${tag}`, expiresOn: '2027-05-01' },
      { itemId: paint.id, qty: 5, price: 20, batchNumber: `EARLY-${tag}`, expiresOn: '2026-12-01' },
    ]);
    const out = await issue(keeperA, whA.id, [{ itemId: paint.id, qty: 2 }]);
    await docs.postDoc(await as(keeperA), out.document.id);
    const line = (await db.query(`SELECT amount::float FROM wh_doc_lines WHERE doc_id = $1`, [out.document.id])).rows[0];
    assert.equal(line.amount, 40);
    const left = (await db.query(`SELECT b.number, s.qty::float FROM wh_stock s JOIN wh_batches b ON b.id = s.batch_id WHERE s.item_id = $1 AND s.holder_type = 'warehouse' ORDER BY b.expires_on`, [paint.id])).rows;
    assert.deepEqual(left.map((r) => r.qty), [3, 5]);
  });

  await t.test('inventory act: the book becomes the counted fact (approval above the threshold)', async () => {
    const before = (await pool(bits.id, whA.id)).q;
    const act = await docs.createDoc(await as(boss), { type: 'inventory', warehouseId: whA.id, lines: [{ itemId: bits.id, countedQty: before + 2 }, { itemId: pipes.id, countedQty: 0 }] });
    const posted = await docs.postDoc(await as(boss), act.document.id);
    assert.equal(posted.document.status, 'posted');
    assert.equal((await pool(bits.id, whA.id)).q, before + 2);
    assert.equal((await pool(pipes.id, whA.id)).q, 0);
    const lines = (await db.query(`SELECT book_qty::float, counted_qty::float FROM wh_doc_lines WHERE doc_id = $1 ORDER BY sort`, [act.document.id])).rows;
    assert.equal(lines[0].book_qty, before);
  });

  await t.test('daily job: below-minimum digest and service reminders go out once', async () => {
    const { runDaily } = await import('../modules/warehouse/jobs.js');
    await items.saveNorms(await as(boss), pipes.id, [{ warehouseId: whA.id, minQty: 100 }]);
    const instance = (await db.query(`SELECT id FROM wh_instances WHERE inventory_no = $1`, [`T1-${tag}`])).rows[0].id;
    await db.query(`UPDATE wh_instances SET next_service_on = CURRENT_DATE + 2 WHERE id = $1`, [instance]);
    const settings = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules.warehouse.settings;
    const today = new Date().toISOString().slice(0, 10);
    const count = async (kind, userId) => (await db.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE kind = $1 AND user_id = $2`, [kind, userId])).rows[0].n;
    await db.query(`DELETE FROM wh_notices WHERE key LIKE $1 OR key LIKE $2`, [`low:${today}:${whA.id}`, `svc:${instance}:%`]);
    await runDaily({ today, settings });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const low = await count('warehouse.stock_low', keeperA);
    const svc = await count('warehouse.service', accountant);
    assert.equal(low, 1);
    assert.equal(svc, 1);
    await runDaily({ today, settings });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await count('warehouse.stock_low', keeperA), 1);
    assert.equal(await count('warehouse.service', accountant), 1);
  });

  await t.test('reports: turnover and materials by holder agree with the register', async () => {
    const turn = await reports.turnover(await as(boss), { from: '2000-01-01', warehouse: String(whA.id) });
    const row = turn.rows.find((r) => r.item.id === cement.id);
    const p = await pool(cement.id, whA.id);
    assert.equal(row.closingQty, p.q);
    assert.equal(row.closingSum, p.a);
    const held = await reports.byObject(await as(boss), { holderType: 'employee', holderId: foreman });
    const cem = held.rows.find((r) => r.item.id === cement.id);
    assert.equal(cem.issuedQty, 70);
    assert.equal(cem.returnedQty, 30);
    assert.equal(cem.onHandQty, 40);
  });
});
