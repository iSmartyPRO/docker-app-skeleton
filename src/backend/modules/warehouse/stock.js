import { query, withTransaction } from '../../config/database.js';
import { Params, intOrNull, isoDayOf, logEvent, text, todayFor, usersByIds, whContext } from './access.js';
import { EPS, RESERVE_TARGETS, STOCK_CHIPS, addDays, day, httpError, num, q4, stockFlags, unitFactor, toBaseQty } from './logic.js';

/*
 * Stock (spec §8.1): the register aggregated per item × warehouse with
 * reserves, norms and flags for the chips; grouping by warehouse, category,
 * bin or holder (warehouses, employees, objects); hints for document lines
 * («на складе 120 · в резерве 20 · доступно 100»); reserves.
 */

const like = (q) => `%${String(q || '').trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Labels of holders: employees, Masterplan objects / projects, transfers in transit. */
export async function holderLabels(rows) {
  const out = new Map();
  const ids = (type) => [...new Set(rows.filter((r) => (r.holder_type || r.holderType) === type).map((r) => Number(r.holder_id ?? r.holderId)))];
  const employees = ids('employee');
  const objects = ids('object');
  const projects = ids('project');
  const transits = ids('transit');
  if (employees.length) for (const [id, user] of await usersByIds(employees)) out.set(`employee:${id}`, user.name);
  if (objects.length) {
    const { rows: nodes } = await query(`SELECT n.id, n.code, n.name, p.name AS project FROM mp_nodes n LEFT JOIN mp_projects p ON p.id = n.project_id WHERE n.id = ANY($1::int[])`, [objects]).catch(() => ({ rows: [] }));
    for (const node of nodes) out.set(`object:${node.id}`, [node.project, [node.code, node.name].filter(Boolean).join(' · ')].filter(Boolean).join(' / '));
  }
  if (projects.length) {
    const { rows: list } = await query(`SELECT id, name FROM mp_projects WHERE id = ANY($1::int[])`, [projects]).catch(() => ({ rows: [] }));
    for (const project of list) out.set(`project:${project.id}`, project.name);
  }
  if (transits.length) {
    const { rows: docs } = await query(`SELECT id, number FROM wh_docs WHERE id = ANY($1::int[])`, [transits]);
    for (const doc of docs) out.set(`transit:${doc.id}`, doc.number);
  }
  return out;
}

async function subtreeIds(categoryId) {
  const { rows } = await query(`WITH RECURSIVE t AS (SELECT id FROM wh_categories WHERE id = $1 UNION ALL SELECT c.id FROM wh_categories c JOIN t ON c.parent_id = t.id) SELECT id FROM t`, [categoryId]);
  return rows.map((row) => row.id);
}

/** Warehouse ids from the `warehouse` parameter (one or a comma list), limited to what the person sees. */
function warehouseFilter(ctx, value) {
  const visible = ctx.visibleIds();
  const asked = String(value || '')
    .split(',')
    .map(intOrNull)
    .filter(Boolean);
  if (!asked.length) return visible;
  return visible === null ? asked : asked.filter((id) => visible.includes(id));
}

const ACTIVE_RESERVES = `SELECT item_id, warehouse_id, SUM(qty) AS reserved FROM wh_reserves
  WHERE status = 'active' AND (expires_on IS NULL OR expires_on >= CURRENT_DATE) GROUP BY item_id, warehouse_id`;

/** The base of the stock table: one row per item × warehouse (stock or a norm). */
async function stockBase(ctx, input, p, today) {
  const settings = ctx.settings;
  const ids = warehouseFilter(ctx, input.warehouse);
  const whSql = ids === null ? '' : ` AND s.warehouse_id = ANY(${p.add(ids)}::int[])`;
  const normSql = ids === null ? '' : ` WHERE n.warehouse_id = ANY(${p.add(ids)}::int[])`;
  const where = ['i.archived_at IS NULL OR COALESCE(b.qty, 0) <> 0'];
  if (input.q) {
    const q = p.add(like(input.q));
    where.push(`(i.name ILIKE ${q} OR i.sku ILIKE ${q} OR EXISTS (SELECT 1 FROM wh_barcodes bc WHERE bc.item_id = i.id AND bc.code = ${p.add(String(input.q).trim())}))`);
  }
  const category = intOrNull(input.category);
  if (category) where.push(`i.category_id = ANY(${p.add(await subtreeIds(category))}::int[])`);
  const item = intOrNull(input.item);
  if (item) where.push(`i.id = ${p.add(item)}`);
  const todayParam = p.add(today);
  const expiryParam = p.add(addDays(today, settings.expiryWarnDays ?? 30));
  const staleParam = p.add(addDays(today, -(settings.staleDays ?? 90)));
  const sql = `
    WITH b AS (
      SELECT s.item_id, s.warehouse_id, SUM(s.qty) AS qty, SUM(s.amount) AS amount, MAX(s.last_move_at) AS last_move_at,
             MIN(bt.expires_on) FILTER (WHERE s.qty > 0) AS next_expiry
      FROM wh_stock s LEFT JOIN wh_batches bt ON bt.id = s.batch_id
      WHERE s.holder_type = 'warehouse'${whSql}
      GROUP BY s.item_id, s.warehouse_id
    ), k AS (
      SELECT item_id, warehouse_id FROM b UNION SELECT n.item_id, n.warehouse_id FROM wh_norms n${normSql}
      UNION SELECT s.item_id, s.warehouse_id FROM wh_stock s WHERE s.holder_type = 'transit' AND s.qty <> 0${whSql}
    ), rows AS (
      SELECT k.item_id, k.warehouse_id, COALESCE(b.qty, 0) AS qty, COALESCE(b.amount, 0) AS amount, b.last_move_at, b.next_expiry,
             n.min_qty, n.reorder_qty, COALESCE(r.reserved, 0) AS reserved,
             (SELECT COALESCE(SUM(t.qty), 0) FROM wh_stock t WHERE t.item_id = k.item_id AND t.warehouse_id = k.warehouse_id AND t.holder_type = 'transit') AS in_transit,
             i.name, i.sku, i.base_unit, i.units, i.category_id, i.tracking, i.archived_at, w.name AS warehouse_name, w.kind AS warehouse_kind, w.sort AS warehouse_sort
      FROM k JOIN wh_items i ON i.id = k.item_id JOIN wh_warehouses w ON w.id = k.warehouse_id AND w.archived_at IS NULL
      LEFT JOIN b ON b.item_id = k.item_id AND b.warehouse_id = k.warehouse_id
      LEFT JOIN wh_norms n ON n.item_id = k.item_id AND n.warehouse_id = k.warehouse_id
      LEFT JOIN (${ACTIVE_RESERVES}) r ON r.item_id = k.item_id AND r.warehouse_id = k.warehouse_id
      WHERE ${where.map((w) => `(${w})`).join(' AND ')}
    ), flagged AS (
      SELECT rows.*,
        (min_qty > 0 AND qty < min_qty) AS f_below_min,
        (qty <= 0) AS f_out,
        (qty > 0 AND next_expiry IS NOT NULL AND next_expiry <= ${expiryParam}::date) AS f_expiring,
        (reserved > 0) AS f_reserved,
        (qty > 0 AND last_move_at < ${staleParam}::date) AS f_stale,
        (warehouse_id = ANY(${p.add([...new Set([...ctx.molOf, ...ctx.assignments.keys()])])}::int[])) AS f_mine,
        ${todayParam}::date AS today
      FROM rows
    )`;
  return sql;
}

const CHIP_SQL = { below_min: 'f_below_min', out: 'f_out', expiring: 'f_expiring', reserved: 'f_reserved', stale: 'f_stale', mine: 'f_mine' };

function stockRow(ctx, row, today, categories = new Map()) {
  const flags = stockFlags({ ...row, next_expiry: isoDayOf(row.next_expiry) }, { today, staleDays: ctx.settings.staleDays, expiryWarnDays: ctx.settings.expiryWarnDays });
  const qty = q4(row.qty);
  const reserved = q4(row.reserved);
  return {
    key: `${row.item_id}:${row.warehouse_id}`,
    item: { id: row.item_id, name: row.name, sku: row.sku || '', baseUnit: row.base_unit, units: row.units || [], tracking: row.tracking, category: row.category_id ? categories.get(row.category_id) || { id: row.category_id } : null, archived: Boolean(row.archived_at) },
    warehouse: { id: row.warehouse_id, name: row.warehouse_name, kind: row.warehouse_kind },
    qty,
    reserved,
    available: q4(qty - reserved),
    inTransit: q4(row.in_transit),
    minQty: row.min_qty === null ? null : Number(row.min_qty),
    reorderQty: row.reorder_qty === null ? null : Number(row.reorder_qty),
    amount: ctx.can('cost', row.warehouse_id) ? Number(row.amount) : null,
    lastMoveAt: row.last_move_at,
    nextExpiry: isoDayOf(row.next_expiry),
    flags,
  };
}

/** GET /stock: the main screen. group = warehouse (default) | category | bin | holder. */
export async function listStock(req, input = {}) {
  const ctx = await whContext(req);
  const today = await todayFor(req);
  if (input.group === 'holder') return listByHolder(ctx, input);
  if (input.group === 'bin') return listByBin(ctx, input);
  const p = new Params();
  const base = await stockBase(ctx, input, p, today);
  const chip = STOCK_CHIPS.includes(input.chip) ? input.chip : null;
  // By default rows with nothing on them and no norm are not shown; «Нет в наличии» shows them.
  const filter = [chip ? CHIP_SQL[chip] : `(qty <> 0 OR min_qty > 0 OR reserved > 0 OR in_transit <> 0)`];
  const pageSize = Math.min(500, Math.max(1, Number(input.pageSize) || 100));
  const page = Math.max(1, Number(input.page) || 1);
  const order = input.group === 'category' ? 'category_id NULLS LAST, LOWER(name), warehouse_sort, warehouse_name' : input.sort === 'qty' ? 'qty DESC' : 'warehouse_sort, LOWER(warehouse_name), LOWER(name)';
  const [{ rows }, { rows: count }] = await Promise.all([
    query(`${base} SELECT * FROM flagged WHERE ${filter.join(' AND ')} ORDER BY ${order}, item_id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, p.values),
    query(
      `${base} SELECT COUNT(*) FILTER (WHERE ${filter.join(' AND ')})::int AS total,
         COUNT(*) FILTER (WHERE qty <> 0 OR min_qty > 0 OR reserved > 0 OR in_transit <> 0)::int AS all,
         ${Object.entries(CHIP_SQL).map(([key, col]) => `COUNT(*) FILTER (WHERE ${col})::int AS ${key}`).join(', ')},
         SUM(amount) FILTER (WHERE ${filter.join(' AND ')}) AS amount
       FROM flagged`,
      p.values
    ),
  ]);
  const { categoriesMap } = await import('./items.js');
  const categories = await categoriesMap();
  const ids = warehouseFilter(ctx, input.warehouse);
  const counters = count[0];
  return {
    items: rows.map((row) => stockRow(ctx, row, today, categories)),
    total: counters.total,
    page,
    pageSize,
    counters: { all: counters.all, ...Object.fromEntries(STOCK_CHIPS.map((key) => [key, counters[key]])) },
    totals: (await import('./access.js')).costOn(ctx, ids) ? { amount: Number(counters.amount || 0), currency: ctx.settings.currency } : null,
  };
}

/** Stock per item × bin of one warehouse (addressed storage). */
async function listByBin(ctx, input) {
  const warehouseId = intOrNull(input.warehouse);
  if (!warehouseId || !ctx.sees(warehouseId)) throw httpError(400, 'Choose a warehouse', 'WAREHOUSE_REQUIRED');
  const p = new Params();
  const where = [`s.warehouse_id = ${p.add(warehouseId)}`, `s.holder_type = 'warehouse'`, 's.qty <> 0'];
  if (input.q) {
    const q = p.add(like(input.q));
    where.push(`(i.name ILIKE ${q} OR i.sku ILIKE ${q} OR bn.path ILIKE ${q})`);
  }
  const bin = intOrNull(input.bin);
  if (bin) where.push(`s.bin_id = ${p.add(bin)}`);
  const { rows } = await query(
    `SELECT s.item_id, s.bin_id, bn.path, i.name, i.sku, i.base_unit, i.tracking, SUM(s.qty) AS qty, SUM(s.amount) AS amount, MAX(s.last_move_at) AS last_move_at
     FROM wh_stock s JOIN wh_items i ON i.id = s.item_id LEFT JOIN wh_bins bn ON bn.id = s.bin_id
     WHERE ${where.join(' AND ')} GROUP BY s.item_id, s.bin_id, bn.path, i.name, i.sku, i.base_unit, i.tracking ORDER BY bn.path NULLS FIRST, LOWER(i.name) LIMIT 2000`,
    p.values
  );
  const cost = ctx.can('cost', warehouseId);
  return {
    items: rows.map((row) => ({ key: `${row.item_id}:${row.bin_id || 0}`, item: { id: row.item_id, name: row.name, sku: row.sku || '', baseUnit: row.base_unit, tracking: row.tracking }, bin: row.bin_id ? { id: row.bin_id, path: row.path } : null, qty: q4(row.qty), amount: cost ? Number(row.amount) : null, lastMoveAt: row.last_move_at })),
    total: rows.length,
  };
}

/** Stock per holder: warehouses, employees, objects, projects (spec §8.1 «по держателям»). */
async function listByHolder(ctx, input) {
  const p = new Params();
  const visible = ctx.visibleIds();
  const where = ['s.qty <> 0'];
  if (visible !== null) where.push(`(s.warehouse_id = ANY(${p.add(visible)}::int[]) OR (s.holder_type = 'employee' AND s.holder_id = ${p.add(ctx.userId || 0)}))`);
  if (['warehouse', 'employee', 'object', 'project', 'transit'].includes(input.holderType)) where.push(`s.holder_type = ${p.add(input.holderType)}`);
  const holderId = intOrNull(input.holderId);
  if (holderId) where.push(input.holderType === 'warehouse' ? `s.warehouse_id = ${p.add(holderId)}` : `s.holder_id = ${p.add(holderId)}`);
  if (input.q) {
    const q = p.add(like(input.q));
    where.push(`(i.name ILIKE ${q} OR i.sku ILIKE ${q})`);
  }
  const { rows } = await query(
    `SELECT s.holder_type, CASE WHEN s.holder_type = 'warehouse' THEN s.warehouse_id ELSE s.holder_id END AS hid, s.item_id, i.name, i.sku, i.base_unit, i.tracking,
            SUM(s.qty) AS qty, SUM(s.amount) AS amount, array_agg(DISTINCT s.warehouse_id) AS warehouses, MAX(s.last_move_at) AS last_move_at
     FROM wh_stock s JOIN wh_items i ON i.id = s.item_id
     WHERE ${where.join(' AND ')}
     GROUP BY s.holder_type, hid, s.item_id, i.name, i.sku, i.base_unit, i.tracking
     ORDER BY s.holder_type, hid, LOWER(i.name) LIMIT 3000`,
    p.values
  );
  const labels = await holderLabels(rows.map((row) => ({ holder_type: row.holder_type, holder_id: row.hid })));
  const { rows: whs } = await query(`SELECT id, name FROM wh_warehouses`);
  const whName = new Map(whs.map((w) => [w.id, w.name]));
  return {
    items: rows.map((row) => ({
      key: `${row.holder_type}:${row.hid}:${row.item_id}`,
      holder: { type: row.holder_type, id: row.hid, label: row.holder_type === 'warehouse' ? whName.get(row.hid) || `#${row.hid}` : labels.get(`${row.holder_type}:${row.hid}`) || `#${row.hid}` },
      item: { id: row.item_id, name: row.name, sku: row.sku || '', baseUnit: row.base_unit, tracking: row.tracking },
      qty: q4(row.qty),
      amount: row.warehouses.every((id) => ctx.can('cost', id)) ? Number(row.amount) : null,
      lastMoveAt: row.last_move_at,
    })),
    total: rows.length,
  };
}

/**
 * Hints for document lines: per item at a warehouse { qty, reserved, available,
 * inTransit }, or at a holder { qty } (returns, hand-overs).
 */
export async function stockHints(ctx, { warehouseId = null, holderType = null, holderId = null, itemIds = [], warehouseIds = null }) {
  const out = new Map();
  if (!itemIds.length) return out;
  if (holderType && holderType !== 'warehouse') {
    // warehouseIds: only what came from these warehouses (null = all).
    const { rows } = await query(
      `SELECT item_id, SUM(qty) AS qty FROM wh_stock WHERE holder_type = $1 AND holder_id = $2 AND item_id = ANY($3::int[]) AND ($4::int[] IS NULL OR warehouse_id = ANY($4::int[])) GROUP BY item_id`,
      [holderType, holderId, itemIds, warehouseIds]
    );
    for (const row of rows) out.set(row.item_id, { qty: q4(row.qty), reserved: 0, available: q4(row.qty) });
    return out;
  }
  if (!warehouseId) return out;
  const { rows } = await query(
    `SELECT i.id AS item_id,
            (SELECT COALESCE(SUM(qty), 0) FROM wh_stock s WHERE s.item_id = i.id AND s.warehouse_id = $1 AND s.holder_type = 'warehouse') AS qty,
            (SELECT COALESCE(SUM(qty), 0) FROM wh_reserves r WHERE r.item_id = i.id AND r.warehouse_id = $1 AND r.status = 'active' AND (r.expires_on IS NULL OR r.expires_on >= CURRENT_DATE)) AS reserved,
            (SELECT COALESCE(SUM(qty), 0) FROM wh_stock t WHERE t.item_id = i.id AND t.warehouse_id = $1 AND t.holder_type = 'transit') AS in_transit
     FROM wh_items i WHERE i.id = ANY($2::int[])`,
    [warehouseId, itemIds]
  );
  for (const row of rows) out.set(row.item_id, { qty: q4(row.qty), reserved: q4(row.reserved), available: q4(Number(row.qty) - Number(row.reserved)), inTransit: q4(row.in_transit) });
  return out;
}

export async function hintsFor(req, input = {}) {
  const ctx = await whContext(req);
  const warehouseId = intOrNull(input.warehouse);
  if (warehouseId && !ctx.sees(warehouseId)) throw httpError(404, 'Warehouse not found', 'NOT_FOUND');
  const holderType = ['employee', 'object', 'project'].includes(input.holderType) ? input.holderType : null;
  const holderId = intOrNull(input.holderId);
  if (holderType === 'employee' && holderId !== ctx.userId && !ctx.canAny('operate')) throw httpError(403, 'Not your holdings', 'FORBIDDEN');
  if (!warehouseId && !holderType) return {};
  // Someone else's holdings (a person, an object, a project): only what came from the warehouses I see.
  const mine = holderType === 'employee' && holderId === ctx.userId;
  if (holderType && !mine && !ctx.canAny('view')) throw httpError(403, 'You have no access to the warehouse', 'FORBIDDEN');
  const itemIds = String(input.items || '').split(',').map(intOrNull).filter(Boolean).slice(0, 500);
  const hints = await stockHints(ctx, { warehouseId, holderType, holderId, itemIds, warehouseIds: holderType && !mine ? ctx.visibleIds() : null });
  return Object.fromEntries(hints);
}

// ── Reserves ────────────────────────────────────────────────────────────────

function reserveShape(row) {
  return {
    id: row.id,
    item: { id: row.item_id, name: row.item_name, baseUnit: row.base_unit },
    warehouse: { id: row.warehouse_id, name: row.warehouse_name },
    qty: Number(row.qty),
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label || '',
    expiresOn: isoDayOf(row.expires_on),
    note: row.note || '',
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listReserves(req, input = {}) {
  const ctx = await whContext(req);
  const p = new Params();
  const where = [`r.status = ${p.add(['active', 'consumed', 'released', 'expired'].includes(input.status) ? input.status : 'active')}`];
  const ids = warehouseFilter(ctx, input.warehouse);
  if (ids !== null) where.push(`r.warehouse_id = ANY(${p.add(ids)}::int[])`);
  const item = intOrNull(input.item);
  if (item) where.push(`r.item_id = ${p.add(item)}`);
  if (RESERVE_TARGETS.includes(input.targetType)) where.push(`r.target_type = ${p.add(input.targetType)}`);
  const target = intOrNull(input.targetId);
  if (target) where.push(`r.target_id = ${p.add(target)}`);
  const { rows } = await query(
    `SELECT r.*, i.name AS item_name, i.base_unit, w.name AS warehouse_name FROM wh_reserves r JOIN wh_items i ON i.id = r.item_id JOIN wh_warehouses w ON w.id = r.warehouse_id
     WHERE ${where.join(' AND ')} ORDER BY r.expires_on NULLS LAST, r.id DESC LIMIT 500`,
    p.values
  );
  return rows.map(reserveShape);
}

/** POST /reserves: { itemId, warehouseId, qty, unit, targetType, targetId, targetLabel, expiresOn, note } — only from the free stock. */
export async function createReserve(req, input = {}) {
  const ctx = await whContext(req);
  const warehouseId = intOrNull(input.warehouseId);
  const itemId = intOrNull(input.itemId);
  if (!warehouseId || !itemId) throw httpError(400, 'Choose the item and the warehouse', 'BAD_INPUT');
  if (!ctx.can('operate', warehouseId)) throw httpError(403, 'Reserves are made by the storekeepers of the warehouse', 'FORBIDDEN');
  const { rows: items } = await query(`SELECT * FROM wh_items WHERE id = $1`, [itemId]);
  const item = items[0];
  if (!item) throw httpError(404, 'Item not found', 'NOT_FOUND');
  const factor = unitFactor(item, input.unit || item.base_unit);
  if (!factor) throw httpError(400, 'Unknown unit', 'BAD_UNIT');
  const qty = toBaseQty(num(input.qty), factor);
  if (!(qty > 0)) throw httpError(400, 'Enter the quantity', 'QTY_REQUIRED');
  const expiresOn = input.expiresOn ? day(input.expiresOn) : null;
  if (input.expiresOn && !expiresOn) throw httpError(400, 'Invalid date', 'BAD_DATE');
  const targetType = RESERVE_TARGETS.includes(input.targetType) ? input.targetType : 'other';
  const id = await withTransaction(async (client) => {
    // The same row locks as posting: a reserve and an issue never both take the last units.
    const { rows: stock } = await client.query(`SELECT qty FROM wh_stock WHERE item_id = $1 AND warehouse_id = $2 AND holder_type = 'warehouse' ORDER BY id FOR UPDATE`, [itemId, warehouseId]);
    const onHand = stock.reduce((sum, row) => sum + Number(row.qty), 0);
    const { rows: res } = await client.query(`SELECT COALESCE(SUM(qty), 0) AS q FROM wh_reserves WHERE item_id = $1 AND warehouse_id = $2 AND status = 'active' AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)`, [itemId, warehouseId]);
    const free = q4(onHand - Number(res[0].q));
    if (qty > free + EPS) throw httpError(409, `Only ${free} ${item.base_unit} are free`, 'INSUFFICIENT', { shortages: [{ itemId, warehouseId, name: item.name, need: qty, available: Math.max(0, free), short: q4(qty - Math.max(0, free)), unit: item.base_unit }] });
    const { rows } = await client.query(
      `INSERT INTO wh_reserves (item_id, warehouse_id, qty, target_type, target_id, target_label, expires_on, note, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [itemId, warehouseId, qty, targetType, intOrNull(input.targetId), text(input.targetLabel, 300), expiresOn, text(input.note, 500), ctx.userId]
    );
    await logEvent(client, 'item', itemId, ctx.userId, 'reserved', { reserveId: rows[0].id, warehouseId, qty, targetType, targetLabel: text(input.targetLabel, 300) });
    return rows[0].id;
  });
  return (await listReserves(req, { item: itemId })).find((r) => r.id === id) || { id };
}

export async function releaseReserve(req, id) {
  const ctx = await whContext(req);
  const { rows } = await query(`SELECT * FROM wh_reserves WHERE id = $1`, [intOrNull(id) || 0]);
  const row = rows[0];
  if (!row || !ctx.sees(row.warehouse_id)) throw httpError(404, 'Reserve not found', 'NOT_FOUND');
  if (!ctx.can('operate', row.warehouse_id) && row.created_by !== ctx.userId) throw httpError(403, 'You cannot release this reserve', 'FORBIDDEN');
  await withTransaction(async (client) => {
    await client.query(`UPDATE wh_reserves SET status = 'released', closed_at = NOW() WHERE id = $1 AND status = 'active'`, [row.id]);
    await logEvent(client, 'item', row.item_id, ctx.userId, 'reserve_released', { reserveId: row.id });
  });
  return { id: row.id, status: 'released' };
}
