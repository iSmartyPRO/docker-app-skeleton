import { DOC_TYPES, EPS, cents, httpError, q4, takeCost, toBaseMoney, averageAfter } from './logic.js';
import { assertNotFrozen } from './freeze.js';

/*
 * The posting engine (spec §5.1). Every function here runs inside the
 * caller's transaction (`client`): the HTTP route's, or the approvals
 * decision's when an approved write-off is posted.
 *
 *   1. The register rows of every item the document touches are locked
 *      (SELECT … ORDER BY id FOR UPDATE — always in id order, so two
 *      postings never deadlock); two storekeepers issuing the last 5 pcs
 *      queue on the same rows and the second one sees 0.
 *   2. The movements are computed in memory (Register): what leaves which
 *      row at what cost (moving average per item × warehouse for quantity
 *      items, the batch's / instance's own cost otherwise), what arrives where.
 *   3. Shortages are collected for all lines at once → 409 INSUFFICIENT with
 *      the list; nothing is written.
 *   4. Deltas are written to wh_stock (upserts for new keys), every change is
 *      appended to wh_moves, wh_costs keeps the last average.
 */

/** A DATE from node-pg (local midnight) or a string → YYYY-MM-DD, so expiry dates sort right (FEFO). */
const dayOf = (value) => {
  if (!value) return null;
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return String(value).slice(0, 10);
};

const keyOf = (r) => `${r.item_id}|${r.warehouse_id}|${r.bin_id || 0}|${r.batch_id || 0}|${r.instance_id || 0}|${r.holder_type}|${r.holder_id || 0}`;

export class Register {
  constructor(client, { rows = [], warehouses = new Map(), items = new Map(), reserved = new Map(), costs = new Map(), movedAt, docId, actorId }) {
    this.client = client;
    this.rows = new Map();
    for (const row of rows) this.rows.set(keyOf(row), { ...row, qty: Number(row.qty), amount: Number(row.amount), dq: 0, da: 0, expires: dayOf(row.expires_on) });
    this.warehouses = warehouses;
    this.items = items;
    this.reserved = reserved; // `${item}|${wh}` → active reserved qty
    this.reserveUse = new Map(); // `${item}|${wh}` → qty taken out of reserves by this document
    this.freeUse = new Map(); // `${item}|${wh}` → qty taken out of the free stock
    this.costs = costs; // `${item}|${wh}` → last average
    this.moves = [];
    this.shortages = [];
    this.movedAt = movedAt;
    this.docId = docId;
    this.actorId = actorId;
  }

  row(key) {
    const k = keyOf(key);
    if (!this.rows.has(k)) this.rows.set(k, { id: null, ...key, bin_id: key.bin_id || null, batch_id: key.batch_id || null, instance_id: key.instance_id || null, holder_id: key.holder_id || 0, qty: 0, amount: 0, dq: 0, da: 0, expires: null });
    return this.rows.get(k);
  }

  pool(itemId, warehouseId) {
    let qty = 0;
    let amount = 0;
    for (const r of this.rows.values()) {
      if (r.item_id === itemId && r.warehouse_id === warehouseId && r.holder_type === 'warehouse') {
        qty += r.qty;
        amount += r.amount;
      }
    }
    return { qty: q4(qty), amount: cents(amount) };
  }

  change(r, dq, da, lineId) {
    r.qty = q4(r.qty + dq);
    r.amount = cents(r.amount + da);
    r.dq = q4(r.dq + dq);
    r.da = cents(r.da + da);
    this.moves.push({ line_id: lineId || null, item_id: r.item_id, warehouse_id: r.warehouse_id, bin_id: r.bin_id || null, batch_id: r.batch_id || null, instance_id: r.instance_id || null, holder_type: r.holder_type, holder_id: r.holder_id || 0, qty: q4(dq), amount: cents(da) });
  }

  /** Adds qty worth amount at a key. */
  put(key, qty, amount, lineId) {
    const r = this.row(key);
    if (key.expires) r.expires = dayOf(key.expires);
    this.change(r, qty, amount, lineId);
    return r;
  }

  /**
   * Takes `qty` (base units) of an item out of a source: a warehouse
   * ({ warehouse_id }, holder 'warehouse') or a holder ({ holder_type, holder_id },
   * any warehouse, `prefer` first). Optional bin / batch / instance narrow it.
   * `reserveQty` of it may come out of reserves. Returns the portions taken
   * [{ key, qty, amount }]; a shortage is recorded (not thrown).
   */
  take(source, qty, { lineId, reserveQty = 0, prefer = null } = {}) {
    const item = this.items.get(source.item_id);
    const holderType = source.holder_type || 'warehouse';
    const atWarehouse = holderType === 'warehouse';
    const holderId = source.holder_id || 0;
    const wh = atWarehouse ? this.warehouses.get(source.warehouse_id) : null;
    const quantityPool = atWarehouse && item?.tracking === 'quantity';
    const candidates = [...this.rows.values()].filter(
      (r) =>
        r.item_id === source.item_id &&
        r.holder_type === holderType &&
        (atWarehouse ? r.warehouse_id === source.warehouse_id : r.holder_id === holderId && (!source.warehouse_id || r.warehouse_id === source.warehouse_id)) &&
        (source.exactBin ? (r.bin_id || null) === (source.bin_id || null) : !source.bin_id || r.bin_id === source.bin_id) &&
        (!source.batch_id || r.batch_id === source.batch_id) &&
        (!source.instance_id || r.instance_id === source.instance_id) &&
        r.qty > EPS
    );
    // FEFO for batches; a preferred warehouse first for holders; then the oldest row.
    candidates.sort((a, b) => {
      if (prefer && (a.warehouse_id === prefer) !== (b.warehouse_id === prefer)) return a.warehouse_id === prefer ? -1 : 1;
      const ea = a.expires ? String(a.expires) : '9999';
      const eb = b.expires ? String(b.expires) : '9999';
      if (ea !== eb) return ea < eb ? -1 : 1;
      return (a.id || Infinity) - (b.id || Infinity);
    });
    let remaining = q4(qty);
    const portions = [];

    // Free stock check at the warehouse: what is reserved for others stays.
    if (atWarehouse) {
      const poolKey = `${source.item_id}|${source.warehouse_id}`;
      const pool = this.pool(source.item_id, source.warehouse_id);
      const reservedHere = (this.reserved.get(poolKey) || 0) - (this.reserveUse.get(poolKey) || 0);
      const fromReserve = Math.min(reserveQty, Math.max(0, reservedHere));
      const free = pool.qty - Math.max(0, reservedHere);
      const fromFree = q4(remaining - fromReserve);
      if (fromFree > free + EPS && !wh?.allow_negative) {
        this.shortages.push({ itemId: source.item_id, warehouseId: source.warehouse_id, need: q4(qty), available: q4(Math.max(0, free + fromReserve)), short: q4(fromFree - Math.max(0, free)) });
        return portions;
      }
      this.reserveUse.set(poolKey, q4((this.reserveUse.get(poolKey) || 0) + fromReserve));
      this.freeUse.set(poolKey, q4((this.freeUse.get(poolKey) || 0) + fromFree));
    }

    for (const r of candidates) {
      if (remaining <= EPS) break;
      const t = q4(Math.min(r.qty, remaining));
      let amount;
      if (quantityPool) {
        const pool = this.pool(r.item_id, r.warehouse_id);
        amount = takeCost(t, pool.qty, pool.amount, this.costs.get(`${r.item_id}|${r.warehouse_id}`) ?? Number(item?.last_price) ?? 0);
      } else {
        amount = takeCost(t, r.qty, r.amount, 0);
      }
      const key = { item_id: r.item_id, warehouse_id: r.warehouse_id, bin_id: r.bin_id, batch_id: r.batch_id, instance_id: r.instance_id, holder_type: r.holder_type, holder_id: r.holder_id, expires: r.expires };
      this.change(r, -t, -amount, lineId);
      portions.push({ key, qty: t, amount });
      remaining = q4(remaining - t);
    }
    if (remaining > EPS) {
      if (atWarehouse && wh?.allow_negative && !source.instance_id) {
        // «Минус» allowed on this warehouse: the rest goes below zero at the last known average.
        const avg = this.costs.get(`${source.item_id}|${source.warehouse_id}`) ?? Number(item?.last_price) ?? 0;
        const key = { item_id: source.item_id, warehouse_id: source.warehouse_id, bin_id: source.bin_id || null, batch_id: source.batch_id || null, instance_id: null, holder_type: 'warehouse', holder_id: 0 };
        const amount = cents(remaining * avg);
        this.change(this.row(key), -remaining, -amount, lineId);
        portions.push({ key, qty: remaining, amount });
      } else {
        const have = q4(qty - remaining);
        this.shortages.push({ itemId: source.item_id, warehouseId: source.warehouse_id || null, holderType: atWarehouse ? null : holderType, holderId: atWarehouse ? null : holderId, need: q4(qty), available: have, short: remaining });
      }
    }
    return portions;
  }

  /** Writes the deltas, the journal and the averages. */
  async flush() {
    const client = this.client;
    // An inventory in progress may freeze its scope (spec §6.1): nothing moves there but its own act.
    await assertNotFrozen(client, this.docId, [...this.rows.values()].filter((r) => Math.abs(r.dq) >= EPS), this.items);
    const touched = [];
    for (const r of this.rows.values()) {
      if (Math.abs(r.dq) < EPS && Math.abs(r.da) < 0.005) continue;
      if (r.id) {
        await client.query(`UPDATE wh_stock SET qty = qty + $2, amount = amount + $3, last_move_at = $4 WHERE id = $1`, [r.id, r.dq, r.da, this.movedAt]);
      } else {
        const { rows } = await client.query(
          `INSERT INTO wh_stock (item_id, warehouse_id, bin_id, batch_id, instance_id, holder_type, holder_id, qty, amount, last_move_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (item_id, warehouse_id, COALESCE(bin_id, 0), COALESCE(batch_id, 0), COALESCE(instance_id, 0), holder_type, holder_id)
           DO UPDATE SET qty = wh_stock.qty + EXCLUDED.qty, amount = wh_stock.amount + EXCLUDED.amount, last_move_at = EXCLUDED.last_move_at
           RETURNING id`,
          [r.item_id, r.warehouse_id, r.bin_id || null, r.batch_id || null, r.instance_id || null, r.holder_type, r.holder_id || 0, r.dq, r.da, this.movedAt]
        );
        r.id = rows[0].id;
      }
      touched.push(r.id);
    }
    // Safety net: nothing below zero, except warehouse rows of a warehouse that allows it.
    if (touched.length) {
      const { rows } = await client.query(
        `SELECT s.item_id, s.warehouse_id, s.holder_type, s.qty FROM wh_stock s JOIN wh_warehouses w ON w.id = s.warehouse_id
         WHERE s.id = ANY($1::bigint[]) AND s.qty < -0.00005 AND NOT (s.holder_type = 'warehouse' AND w.allow_negative)`,
        [touched]
      );
      if (rows.length) throw httpError(409, 'Not enough stock', 'INSUFFICIENT', { shortages: rows.map((row) => ({ itemId: row.item_id, warehouseId: row.warehouse_id, short: q4(-Number(row.qty)) })) });
    }
    for (const move of this.moves) {
      if (Math.abs(move.qty) < EPS && Math.abs(move.amount) < 0.005) continue;
      await client.query(
        `INSERT INTO wh_moves (doc_id, line_id, item_id, warehouse_id, bin_id, batch_id, instance_id, holder_type, holder_id, qty, amount, moved_at, actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [this.docId, move.line_id, move.item_id, move.warehouse_id, move.bin_id, move.batch_id, move.instance_id, move.holder_type, move.holder_id, move.qty, move.amount, this.movedAt, this.actorId || null]
      );
    }
    // The last moving average per item × warehouse (used when the pool is empty or negative).
    const pools = new Set([...this.rows.values()].filter((r) => r.holder_type === 'warehouse' && (r.dq || r.da)).map((r) => `${r.item_id}|${r.warehouse_id}`));
    for (const key of pools) {
      const [itemId, warehouseId] = key.split('|').map(Number);
      const pool = this.pool(itemId, warehouseId);
      if (pool.qty <= EPS) continue;
      const avg = averageAfter(pool.qty, pool.amount, 0, 0, 0);
      await client.query(
        `INSERT INTO wh_costs (item_id, warehouse_id, avg_cost, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (item_id, warehouse_id) DO UPDATE SET avg_cost = EXCLUDED.avg_cost, updated_at = NOW()`,
        [itemId, warehouseId, avg]
      );
    }
  }
}

// ── Loading ─────────────────────────────────────────────────────────────────

export async function lockDoc(client, id) {
  const { rows } = await client.query(`SELECT * FROM wh_docs WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] || null;
}

export async function linesOf(client, docId) {
  const { rows } = await client.query(`SELECT * FROM wh_doc_lines WHERE doc_id = $1 ORDER BY sort, id`, [docId]);
  return rows;
}

async function itemsMap(client, ids) {
  if (!ids.length) return new Map();
  const { rows } = await client.query(`SELECT * FROM wh_items WHERE id = ANY($1::int[])`, [ids]);
  return new Map(rows.map((row) => [row.id, row]));
}

async function warehousesMap(client, ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const { rows } = await client.query(`SELECT * FROM wh_warehouses WHERE id = ANY($1::int[])`, [list]);
  return new Map(rows.map((row) => [row.id, row]));
}

/** Locks and loads the register rows of the items in the given warehouses (and of one holder). */
async function openRegister(client, { itemIds, warehouseIds, holder = null, docId, actorId, movedAt }) {
  const items = await itemsMap(client, itemIds);
  const params = [itemIds, warehouseIds];
  let holderSql = '';
  if (holder) {
    params.push(holder.type, holder.id);
    holderSql = ` OR (s.holder_type = $3 AND s.holder_id = $4)`;
  }
  const { rows } = await client.query(
    `SELECT s.*, b.expires_on FROM wh_stock s LEFT JOIN wh_batches b ON b.id = s.batch_id
     WHERE s.item_id = ANY($1::int[]) AND (s.warehouse_id = ANY($2::int[])${holderSql})
     ORDER BY s.id FOR UPDATE OF s`,
    params
  );
  const warehouses = await warehousesMap(client, [...warehouseIds, ...rows.map((row) => row.warehouse_id)]);
  const reserved = new Map();
  const { rows: res } = await client.query(
    `SELECT item_id, warehouse_id, SUM(qty) AS qty FROM wh_reserves
     WHERE status = 'active' AND item_id = ANY($1::int[]) AND warehouse_id = ANY($2::int[]) AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
     GROUP BY item_id, warehouse_id`,
    [itemIds, warehouseIds]
  );
  for (const row of res) reserved.set(`${row.item_id}|${row.warehouse_id}`, Number(row.qty));
  const costs = new Map();
  const { rows: avg } = await client.query(`SELECT item_id, warehouse_id, avg_cost FROM wh_costs WHERE item_id = ANY($1::int[])`, [itemIds]);
  for (const row of avg) costs.set(`${row.item_id}|${row.warehouse_id}`, Number(row.avg_cost));
  return new Register(client, { rows, warehouses, items, reserved, costs, movedAt, docId, actorId });
}

function throwShortages(reg, lines) {
  if (!reg.shortages.length) return;
  const named = reg.shortages.map((s) => {
    const item = reg.items.get(s.itemId);
    return { ...s, name: item?.name || `#${s.itemId}`, sku: item?.sku || null, unit: item?.base_unit || '' };
  });
  const first = named[0];
  throw httpError(409, `Not enough stock: ${first.name} — need ${first.need}, available ${first.available}`, 'INSUFFICIENT', { shortages: named, lines: lines?.length });
}

// ── Receipts: batches and instances ─────────────────────────────────────────

async function batchFor(client, item, line, doc, unitCost) {
  if (item.tracking !== 'batch') return null;
  if (line.batch_id) return { id: line.batch_id, expires: line.expires_on };
  const number = String(line.batch_number || '').trim() || `${doc.number}`;
  const { rows } = await client.query(
    `INSERT INTO wh_batches (item_id, number, expires_on, supplier_company_id, supplier_name, unit_cost, doc_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (item_id, LOWER(number)) DO UPDATE SET expires_on = COALESCE(wh_batches.expires_on, EXCLUDED.expires_on)
     RETURNING id, expires_on`,
    [item.id, number.slice(0, 80), line.expires_on || null, doc.supplier_company_id || null, doc.supplier_name || null, unitCost, doc.id]
  );
  await client.query(`UPDATE wh_doc_lines SET batch_id = $2 WHERE id = $1`, [line.id, rows[0].id]);
  return { id: rows[0].id, expires: rows[0].expires_on };
}

async function createInstances(client, item, line, doc, unitCost) {
  const count = Math.round(Number(line.base_qty));
  if (Math.abs(count - Number(line.base_qty)) > EPS) throw httpError(400, `${item.name}: serial items are counted in whole pieces`, 'SERIAL_WHOLE', { lineId: line.id });
  const serials = Array.isArray(line.serials) ? line.serials : [];
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const s = serials[i] || {};
    const inventoryNo = String(s.inventoryNo || '').trim() || `${doc.number}-${line.id}-${i + 1}`;
    const exists = await client.query(`SELECT 1 FROM wh_instances WHERE LOWER(inventory_no) = LOWER($1)`, [inventoryNo]);
    if (exists.rows.length) throw httpError(409, `Inventory number ${inventoryNo} is already taken`, 'INVENTORY_NO_TAKEN', { inventoryNo, lineId: line.id });
    const { rows } = await client.query(
      `INSERT INTO wh_instances (item_id, inventory_no, serial_no, purchased_on, cost, warranty_until, next_service_on, service_interval_days, doc_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [item.id, inventoryNo.slice(0, 60), s.serialNo ? String(s.serialNo).slice(0, 120) : null, new Date(doc.doc_date).toISOString().slice(0, 10), unitCost, s.warrantyUntil || null, s.nextServiceOn || null, item.service_interval_days || null, doc.id]
    );
    ids.push(rows[0].id);
  }
  return ids;
}

// ── Posting per type ────────────────────────────────────────────────────────

/** Line amount in the base currency for priced documents (receipt, opening, positive corrections). */
function lineBaseAmount(line, doc, settings) {
  if (line.price === null || line.price === undefined) return null;
  return toBaseMoney(Number(line.qty) * Number(line.price), doc.currency || settings.currency, settings, doc.rate);
}

/**
 * Posts a document in `client`'s transaction. mode: 'post' (one step),
 * 'ship' (transfer, step 1), 'receive' (transfer, step 2: `received` =
 * Map lineId → received quantity in the line's unit). Returns
 * { total, discrepancy: [{ lineId, itemId, diff, amount }] }.
 */
export async function applyDocument(client, doc, { mode = 'post', actorId, settings, received = null, movedAt = null } = {}) {
  const def = DOC_TYPES[doc.type];
  if (!def) throw httpError(400, 'Unknown document type', 'BAD_TYPE');
  const lines = await linesOf(client, doc.id);
  if (!lines.length) throw httpError(400, 'Add at least one line', 'NO_LINES');
  for (const line of lines) {
    if (!line.item_id) throw httpError(400, `Pick the item for «${line.name_hint || '—'}»`, 'LINE_ITEM_REQUIRED', { lineId: line.id });
    if (!(Math.abs(Number(line.base_qty)) > EPS) && line.counted_qty === null && !['inventory', 'correction'].includes(doc.type)) throw httpError(400, 'Every line needs a quantity', 'LINE_QTY_REQUIRED', { lineId: line.id });
  }
  const itemIds = [...new Set(lines.map((line) => line.item_id))].sort((a, b) => a - b);
  const warehouseIds = [doc.warehouse_id, doc.to_warehouse_id].filter(Boolean);
  const holder =
    def.from === 'holder' && doc.from_holder_type ? { type: doc.from_holder_type, id: doc.from_holder_id } : doc.type === 'writeoff' && doc.from_holder_type ? { type: doc.from_holder_type, id: doc.from_holder_id } : mode === 'receive' ? { type: 'transit', id: doc.id } : null;
  const when = movedAt || doc.doc_date;
  const reg = await openRegister(client, { itemIds, warehouseIds, holder, docId: doc.id, actorId, movedAt: when });
  for (const line of lines) if (!reg.items.get(line.item_id)) throw httpError(400, 'Unknown item', 'BAD_ITEM', { lineId: line.id });
  let total = 0;
  const discrepancy = [];
  const lineAmounts = new Map();
  const addLine = (lineId, amount) => lineAmounts.set(lineId, cents((lineAmounts.get(lineId) || 0) + amount));

  // Reserves consumed by issue lines (locked, in id order).
  const reserveIds = [...new Set(lines.map((line) => line.reserve_id).filter(Boolean))].sort((a, b) => a - b);
  const reserves = new Map();
  if (reserveIds.length) {
    const { rows } = await client.query(`SELECT * FROM wh_reserves WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [reserveIds]);
    for (const row of rows) reserves.set(row.id, { ...row, left: Number(row.qty) });
  }

  // The act of an inventory session counts per area: a line without a bin is the stock without a bin only.
  const exactBin = doc.type === 'inventory' && (await client.query(`SELECT 1 FROM wh_inv_sessions WHERE doc_id = $1 LIMIT 1`, [doc.id]).catch(() => ({ rows: [] }))).rows.length > 0;

  for (const line of lines) {
    const item = reg.items.get(line.item_id);
    const qty = Number(line.base_qty);
    const narrow = { bin_id: line.bin_id || null, batch_id: line.batch_id || null, instance_id: line.instance_id || null };
    switch (doc.type) {
      case 'receipt':
      case 'opening': {
        const amount = lineBaseAmount(line, doc, settings) ?? 0;
        const unitCost = qty > EPS ? Math.round((amount / qty) * 1e4) / 1e4 : 0;
        const dest = { item_id: item.id, warehouse_id: doc.to_warehouse_id, bin_id: line.to_bin_id || line.bin_id || null, holder_type: 'warehouse', holder_id: 0 };
        if (item.tracking === 'serial') {
          const ids = await createInstances(client, item, line, doc, unitCost);
          let left = amount;
          ids.forEach((id, index) => {
            const share = index === ids.length - 1 ? cents(left) : cents(unitCost);
            left = cents(left - share);
            reg.put({ ...dest, instance_id: id }, 1, share, line.id);
          });
        } else {
          const batch = await batchFor(client, item, line, doc, unitCost);
          reg.put({ ...dest, batch_id: batch?.id || null, expires: batch?.expires || null }, qty, amount, line.id);
        }
        addLine(line.id, amount);
        total += amount;
        if (qty > EPS && amount > 0) await client.query(`UPDATE wh_items SET last_price = $2 WHERE id = $1`, [item.id, unitCost]);
        break;
      }
      case 'supplier_return': {
        const portions = reg.take({ item_id: item.id, warehouse_id: doc.warehouse_id, ...narrow }, qty, { lineId: line.id });
        const amount = portions.reduce((sum, p) => sum + p.amount, 0);
        addLine(line.id, amount);
        total += amount;
        break;
      }
      case 'transfer': {
        if (mode === 'ship') {
          const portions = reg.take({ item_id: item.id, warehouse_id: doc.warehouse_id, ...narrow }, qty, { lineId: line.id });
          for (const p of portions) reg.put({ ...p.key, warehouse_id: doc.to_warehouse_id, bin_id: null, holder_type: 'transit', holder_id: doc.id }, p.qty, p.amount, line.id);
          const amount = portions.reduce((sum, p) => sum + p.amount, 0);
          addLine(line.id, amount);
          total += amount;
        } else {
          const got = received?.has(line.id) ? Number(received.get(line.id)) * Number(line.factor || 1) : qty;
          const receivedBase = q4(Math.max(0, got));
          const take = Math.min(receivedBase, qty);
          const source = { item_id: item.id, warehouse_id: doc.to_warehouse_id, holder_type: 'transit', holder_id: doc.id, batch_id: line.batch_id || null, instance_id: line.instance_id || null };
          const portions = reg.take(source, take, { lineId: line.id });
          for (const p of portions) reg.put({ ...p.key, warehouse_id: doc.to_warehouse_id, bin_id: line.to_bin_id || null, holder_type: 'warehouse', holder_id: 0 }, p.qty, p.amount, line.id);
          const moved = portions.reduce((sum, p) => sum + p.amount, 0);
          const shipped = Number(line.amount) || 0;
          if (receivedBase < qty - EPS) {
            // Shortage: what did not arrive stays in transit; the discrepancy act takes it out as a loss.
            discrepancy.push({ lineId: line.id, itemId: item.id, diff: -q4(qty - receivedBase), source });
          } else if (receivedBase > qty + EPS) {
            // Surplus: the extra arrives at the line's cost.
            const extra = q4(receivedBase - qty);
            const unit = qty > EPS ? shipped / qty : Number(item.last_price) || 0;
            discrepancy.push({ lineId: line.id, itemId: item.id, diff: extra, amount: cents(extra * unit), put: { item_id: item.id, warehouse_id: doc.to_warehouse_id, bin_id: line.to_bin_id || null, batch_id: line.batch_id || null, instance_id: line.instance_id || null, holder_type: 'warehouse', holder_id: 0 } });
          }
          await client.query(`UPDATE wh_doc_lines SET received_qty = $2 WHERE id = $1`, [line.id, received?.has(line.id) ? Number(received.get(line.id)) : Number(line.qty)]);
          total += moved;
        }
        break;
      }
      case 'issue': {
        let reserveQty = 0;
        const reserve = line.reserve_id ? reserves.get(line.reserve_id) : null;
        if (reserve && reserve.status === 'active' && reserve.item_id === item.id && reserve.warehouse_id === doc.warehouse_id) {
          reserveQty = Math.min(qty, reserve.left);
          reserve.left = q4(reserve.left - reserveQty);
        }
        const portions = reg.take({ item_id: item.id, warehouse_id: doc.warehouse_id, ...narrow }, qty, { lineId: line.id, reserveQty });
        for (const p of portions) reg.put({ ...p.key, bin_id: null, holder_type: doc.to_holder_type, holder_id: doc.to_holder_id }, p.qty, p.amount, line.id);
        const amount = portions.reduce((sum, p) => sum + p.amount, 0);
        addLine(line.id, amount);
        total += amount;
        break;
      }
      case 'return': {
        const portions = reg.take({ item_id: item.id, holder_type: doc.from_holder_type, holder_id: doc.from_holder_id, batch_id: narrow.batch_id, instance_id: narrow.instance_id }, qty, { lineId: line.id, prefer: doc.to_warehouse_id });
        for (const p of portions) reg.put({ ...p.key, warehouse_id: doc.to_warehouse_id, bin_id: line.to_bin_id || null, holder_type: 'warehouse', holder_id: 0 }, p.qty, p.amount, line.id);
        const amount = portions.reduce((sum, p) => sum + p.amount, 0);
        addLine(line.id, amount);
        total += amount;
        break;
      }
      case 'handover': {
        const portions = reg.take({ item_id: item.id, holder_type: doc.from_holder_type, holder_id: doc.from_holder_id, batch_id: narrow.batch_id, instance_id: narrow.instance_id }, qty, { lineId: line.id });
        for (const p of portions) reg.put({ ...p.key, holder_type: doc.to_holder_type, holder_id: doc.to_holder_id }, p.qty, p.amount, line.id);
        const amount = portions.reduce((sum, p) => sum + p.amount, 0);
        addLine(line.id, amount);
        total += amount;
        break;
      }
      case 'writeoff': {
        const source = doc.from_holder_type
          ? { item_id: item.id, holder_type: doc.from_holder_type, holder_id: doc.from_holder_id, batch_id: narrow.batch_id, instance_id: narrow.instance_id }
          : { item_id: item.id, warehouse_id: doc.warehouse_id, ...narrow };
        const portions = reg.take(source, qty, { lineId: line.id });
        const amount = portions.reduce((sum, p) => sum + p.amount, 0);
        addLine(line.id, amount);
        total += amount;
        if (item.tracking === 'serial') for (const p of portions) if (p.key.instance_id) await client.query(`UPDATE wh_instances SET state = 'written_off', written_off_doc_id = $2, updated_at = NOW() WHERE id = $1`, [p.key.instance_id, doc.id]);
        break;
      }
      case 'correction':
      case 'inventory': {
        const key = { item_id: item.id, warehouse_id: doc.warehouse_id, bin_id: line.bin_id || null, batch_id: line.batch_id || null, instance_id: line.instance_id || null, holder_type: 'warehouse', holder_id: 0 };
        let delta = qty;
        if (line.counted_qty !== null && line.counted_qty !== undefined) {
          // Counted: the book becomes the fact (spec §6.4), whatever moved since the count started.
          const counted = q4(Number(line.counted_qty) * Number(line.factor || 1));
          let book = 0;
          for (const r of reg.rows.values()) {
            if (r.item_id === item.id && r.warehouse_id === doc.warehouse_id && r.holder_type === 'warehouse' && (exactBin ? (r.bin_id || null) === (line.bin_id || null) : !line.bin_id || r.bin_id === line.bin_id) && (!line.batch_id || r.batch_id === line.batch_id) && (!line.instance_id || r.instance_id === line.instance_id)) book += r.qty;
          }
          delta = q4(counted - book);
          await client.query(`UPDATE wh_doc_lines SET book_qty = $2 WHERE id = $1`, [line.id, q4(book)]);
        }
        if (delta < -EPS) {
          const portions = reg.take({ item_id: item.id, warehouse_id: doc.warehouse_id, ...narrow, exactBin }, -delta, { lineId: line.id, reserveQty: Infinity });
          const amount = portions.reduce((sum, p) => sum + p.amount, 0);
          addLine(line.id, -amount);
          total -= amount;
        } else if (delta > EPS) {
          const given = lineBaseAmount(line, doc, settings);
          const avg = reg.costs.get(`${item.id}|${doc.warehouse_id}`) ?? Number(item.last_price) ?? 0;
          const pool = reg.pool(item.id, doc.warehouse_id);
          const unit = pool.qty > EPS ? pool.amount / pool.qty : avg;
          const amount = given !== null && line.counted_qty === null ? Math.abs(given) : cents(delta * unit);
          reg.put(key, delta, amount, line.id);
          addLine(line.id, amount);
          total += amount;
        }
        break;
      }
      default:
        throw httpError(400, 'This document cannot be posted', 'BAD_TYPE');
    }
  }
  throwShortages(reg, lines);

  // Reserves: what issue lines took out of them.
  for (const reserve of reserves.values()) {
    if (reserve.left === Number(reserve.qty)) continue;
    await client.query(`UPDATE wh_reserves SET qty = $2, status = CASE WHEN $2 <= 0.00005 THEN 'consumed' ELSE status END, closed_at = CASE WHEN $2 <= 0.00005 THEN NOW() ELSE closed_at END WHERE id = $1`, [reserve.id, Math.max(0, reserve.left)]);
  }
  await reg.flush();
  for (const [lineId, amount] of lineAmounts) {
    if (doc.type === 'transfer' && mode === 'receive') continue;
    await client.query(`UPDATE wh_doc_lines SET amount = $2 WHERE id = $1`, [lineId, amount]);
  }
  // Gross value: what moved either way (an inventory surplus does not hide a shortage from the approval threshold).
  const gross = cents([...lineAmounts.values()].reduce((sum, amount) => sum + Math.abs(amount), 0));
  return { total: cents(total), gross, discrepancy, register: reg };
}

/**
 * The discrepancy of a received transfer as its own posted act (spec §5:
 * «расхождение оформляется актом»): shortages leave the transit, surpluses
 * arrive at the destination.
 */
export async function applyDiscrepancy(client, act, transfer, items, { actorId, movedAt }) {
  const itemIds = [...new Set(items.map((entry) => entry.itemId))];
  const reg = await openRegister(client, { itemIds, warehouseIds: [transfer.to_warehouse_id], holder: { type: 'transit', id: transfer.id }, docId: act.id, actorId, movedAt });
  let total = 0;
  for (const entry of items) {
    if (entry.diff < 0) {
      const lost = reg.take(entry.source, -entry.diff, { lineId: entry.actLineId });
      entry.amount = -cents(lost.reduce((sum, p) => sum + p.amount, 0));
    } else {
      reg.put(entry.put, entry.diff, entry.amount, entry.actLineId);
    }
    total += entry.amount;
    await client.query(`UPDATE wh_doc_lines SET amount = $2 WHERE id = $1`, [entry.actLineId, entry.amount]);
  }
  throwShortages(reg);
  await reg.flush();
  return cents(total);
}

/** Storno (spec §5.1): the exact opposite of every movement of the document, at the same places. */
export async function applyStorno(client, storno, base, { actorId, movedAt }) {
  const { rows: moves } = await client.query(`SELECT * FROM wh_moves WHERE doc_id = $1 ORDER BY id`, [base.id]);
  if (!moves.length) throw httpError(409, 'The document has no movements to reverse', 'NOTHING_TO_REVERSE');
  const itemIds = [...new Set(moves.map((m) => m.item_id))].sort((a, b) => a - b);
  const warehouseIds = [...new Set(moves.map((m) => m.warehouse_id))];
  const reg = await openRegister(client, { itemIds, warehouseIds, docId: storno.id, actorId, movedAt });
  const touched = new Set();
  for (const m of [...moves].reverse()) {
    const key = { item_id: m.item_id, warehouse_id: m.warehouse_id, bin_id: m.bin_id, batch_id: m.batch_id, instance_id: m.instance_id, holder_type: m.holder_type, holder_id: m.holder_id };
    const r = reg.row(key);
    reg.change(r, -Number(m.qty), -Number(m.amount), m.line_id);
    touched.add(r);
  }
  // What was issued, moved on or used since cannot be reversed: the final state of each place decides.
  for (const r of touched) {
    if (r.qty < -EPS && !(r.holder_type === 'warehouse' && reg.warehouses.get(r.warehouse_id)?.allow_negative)) {
      reg.shortages.push({ itemId: r.item_id, warehouseId: r.warehouse_id, holderType: r.holder_type === 'warehouse' ? null : r.holder_type, holderId: r.holder_type === 'warehouse' ? null : r.holder_id, need: q4(r.qty - r.dq < 0 ? 0 : -r.dq), available: q4(r.qty - r.dq), short: q4(-r.qty) });
    }
  }
  throwShortages(reg);
  await reg.flush();
  // Instances follow: a reversed write-off brings the tool back; a reversed receipt retires what it created.
  await client.query(`UPDATE wh_instances SET state = 'ok', written_off_doc_id = NULL, updated_at = NOW() WHERE written_off_doc_id = $1`, [base.id]);
  if (['receipt', 'opening'].includes(base.type)) await client.query(`UPDATE wh_instances SET state = 'written_off', written_off_doc_id = $2, updated_at = NOW() WHERE doc_id = $1`, [base.id, storno.id]);
  return cents(moves.reduce((sum, m) => sum + Math.max(0, -Number(m.amount)), 0));
}
