import { query, withTransaction } from '../../config/database.js';
import { Params, intOrNull, isoDayOf, logEvent, text, whContext } from './access.js';
import { TRACKING, barcodeKind, cleanUnits, httpError, num, ownCode, parseOwnCode, q4 } from './logic.js';

/*
 * Nomenclature (spec §4): items with units and factors, several barcodes,
 * tracking type, per-warehouse norms, default supplier, photos, custom
 * attributes by category; the category tree; and resolving a scanned code
 * into an item / batch / instance / bin / warehouse / document.
 */

const like = (q) => `%${String(q || '').trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function canEditItems(ctx) {
  return ctx.canAny('admin') || ctx.canAny('operate');
}

function assertEditor(ctx) {
  if (!canEditItems(ctx)) throw httpError(403, 'Only storekeepers and warehouse administrators edit the nomenclature', 'FORBIDDEN');
}

function cleanAttrs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [key, value] of Object.entries(input).slice(0, 40)) {
    const k = String(key).trim().slice(0, 40);
    if (!k || value === null || value === undefined || value === '') continue;
    out[k] = typeof value === 'number' && Number.isFinite(value) ? value : String(value).replace(/[\u0000-\u001f]/g, ' ').slice(0, 300);
  }
  return out;
}

function cleanAttrDefs(list) {
  const out = [];
  const seen = new Set();
  for (const raw of (Array.isArray(list) ? list : []).slice(0, 30)) {
    const label = text(raw?.label, 60);
    if (!label) continue;
    let key = String(raw?.key || label).trim().toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '_').slice(0, 40);
    if (!key || seen.has(key)) key = `a${out.length + 1}`;
    seen.add(key);
    const type = ['text', 'number', 'select'].includes(raw?.type) ? raw.type : 'text';
    const options = type === 'select' ? [...new Set((Array.isArray(raw?.options) ? raw.options : []).map((o) => text(o, 60)).filter(Boolean))].slice(0, 40) : undefined;
    out.push({ key, label, type, ...(options ? { options } : {}) });
  }
  return out;
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export function itemShape(row, { barcodes = [], categories = new Map(), photo = null } = {}) {
  return {
    id: row.id,
    sku: row.sku || '',
    name: row.name,
    category: row.category_id ? categories.get(row.category_id) || { id: row.category_id, name: '' } : null,
    brand: row.brand || '',
    kind: row.kind,
    tracking: row.tracking,
    trackExpiry: row.track_expiry,
    baseUnit: row.base_unit,
    units: row.units || [],
    receiptUnit: row.receipt_unit || row.base_unit,
    issueUnit: row.issue_unit || row.base_unit,
    purchaseMultiple: row.purchase_multiple === null ? null : Number(row.purchase_multiple),
    supplier: row.supplier_name || row.supplier_company_id ? { companyId: row.supplier_company_id, name: row.supplier_name || '' } : null,
    lastPrice: row.last_price === null ? null : Number(row.last_price),
    planPrice: row.plan_price === null ? null : Number(row.plan_price),
    attrs: row.attrs || {},
    description: row.description || '',
    serviceIntervalDays: row.service_interval_days,
    archived: Boolean(row.archived_at),
    barcodes: barcodes.map((b) => ({ id: b.id, code: b.code, kind: b.kind, unit: b.unit || null })),
    labelCode: barcodes[0]?.code || ownCode('item', row.id),
    photoUrl: photo ? `/api/app/warehouse/files/${photo}/file` : null,
    updatedAt: row.updated_at,
  };
}

export async function categoriesMap() {
  const { rows } = await query(`SELECT id, parent_id, name, attrs, archived_at, sort FROM wh_categories ORDER BY sort, LOWER(name)`);
  return new Map(rows.map((row) => [row.id, { id: row.id, parentId: row.parent_id, name: row.name, attrs: row.attrs || [], archived: Boolean(row.archived_at), sort: row.sort }]));
}

export async function hydrateItems(rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [{ rows: codes }, categories, { rows: photos }] = await Promise.all([
    query(`SELECT * FROM wh_barcodes WHERE item_id = ANY($1::int[]) ORDER BY id`, [ids]),
    categoriesMap(),
    query(`SELECT DISTINCT ON (owner_id) owner_id, id FROM wh_files WHERE owner_type = 'item' AND owner_id = ANY($1::int[]) AND kind = 'photo' ORDER BY owner_id, id`, [ids]),
  ]);
  const byItem = new Map();
  for (const code of codes) byItem.set(code.item_id, [...(byItem.get(code.item_id) || []), code]);
  const photoOf = new Map(photos.map((row) => [row.owner_id, row.id]));
  return rows.map((row) => itemShape(row, { barcodes: byItem.get(row.id) || [], categories, photo: photoOf.get(row.id) }));
}

export async function loadItem(id, client = { query }) {
  const n = intOrNull(id);
  if (!n) return null;
  const { rows } = await client.query(`SELECT * FROM wh_items WHERE id = $1`, [n]);
  return rows[0] || null;
}

// ── Lists ───────────────────────────────────────────────────────────────────

/** Category ids of a category and everything under it. */
async function subtree(categoryId) {
  const { rows } = await query(
    `WITH RECURSIVE t AS (SELECT id FROM wh_categories WHERE id = $1 UNION ALL SELECT c.id FROM wh_categories c JOIN t ON c.parent_id = t.id) SELECT id FROM t`,
    [categoryId]
  );
  return rows.map((row) => row.id);
}

export async function listItems(req, input = {}) {
  const ctx = await whContext(req);
  if (!ctx.canAny('view')) throw httpError(403, 'You have no access to the warehouse', 'FORBIDDEN');
  const p = new Params();
  const where = [];
  if (input.archived === '1') where.push('i.archived_at IS NOT NULL');
  else if (input.archived !== 'all') where.push('i.archived_at IS NULL');
  if (input.q) {
    const q = p.add(like(input.q));
    where.push(`(i.name ILIKE ${q} OR i.sku ILIKE ${q} OR i.brand ILIKE ${q} OR EXISTS (SELECT 1 FROM wh_barcodes b WHERE b.item_id = i.id AND b.code ILIKE ${q}))`);
  }
  const category = intOrNull(input.category);
  if (category) where.push(`i.category_id = ANY(${p.add(await subtree(category))}::int[])`);
  if (TRACKING.includes(input.tracking)) where.push(`i.tracking = ${p.add(input.tracking)}`);
  const visible = ctx.visibleIds();
  const whFilter = visible === null ? '' : ` AND s.warehouse_id = ANY(${p.add(visible)}::int[])`;
  const pageSize = Math.min(200, Math.max(1, Number(input.pageSize) || 50));
  const page = Math.max(1, Number(input.page) || 1);
  const sql = `FROM wh_items i ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const total = (await query(`SELECT COUNT(*)::int AS n ${sql}`, p.values)).rows[0].n;
  const { rows } = await query(
    `SELECT i.*, (SELECT COALESCE(SUM(s.qty), 0) FROM wh_stock s WHERE s.item_id = i.id AND s.holder_type = 'warehouse'${whFilter}) AS stock_qty
     ${sql} ORDER BY LOWER(i.name), i.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    p.values
  );
  const items = await hydrateItems(rows);
  return { items: items.map((item, index) => ({ ...item, stock: q4(rows[index].stock_qty) })), total, page, pageSize };
}

/** GET /items/:id: the item card — stock by warehouse, bins, batches, instances, norms, photos, last movements. */
export async function getItem(req, id) {
  const ctx = await whContext(req);
  if (!ctx.canAny('view')) throw httpError(403, 'You have no access to the warehouse', 'FORBIDDEN');
  const row = await loadItem(id);
  if (!row) throw httpError(404, 'Item not found', 'NOT_FOUND');
  const [item] = await hydrateItems([row]);
  const visible = ctx.visibleIds();
  const [{ rows: stock }, { rows: norms }, { rows: batches }, { rows: instances }, { rows: files }, { rows: moves }, { rows: reserves }] = await Promise.all([
    query(
      `SELECT s.warehouse_id, w.name AS warehouse_name, s.bin_id, bn.path AS bin_path, s.batch_id, b.number AS batch_number, b.expires_on, s.instance_id, ins.inventory_no,
              s.holder_type, s.holder_id, s.qty, s.amount, s.last_move_at
       FROM wh_stock s JOIN wh_warehouses w ON w.id = s.warehouse_id
       LEFT JOIN wh_bins bn ON bn.id = s.bin_id LEFT JOIN wh_batches b ON b.id = s.batch_id LEFT JOIN wh_instances ins ON ins.id = s.instance_id
       WHERE s.item_id = $1 AND s.qty <> 0 AND ($2::int[] IS NULL OR s.warehouse_id = ANY($2::int[]))
       ORDER BY (s.holder_type = 'warehouse') DESC, w.sort, w.name, bn.path NULLS FIRST, b.expires_on NULLS LAST`,
      [row.id, visible]
    ),
    query(`SELECT n.*, w.name AS warehouse_name FROM wh_norms n JOIN wh_warehouses w ON w.id = n.warehouse_id WHERE n.item_id = $1 ORDER BY w.sort, w.name`, [row.id]),
    query(`SELECT * FROM wh_batches WHERE item_id = $1 ORDER BY expires_on NULLS LAST, id DESC LIMIT 100`, [row.id]),
    row.tracking === 'serial' ? query(`SELECT id FROM wh_instances WHERE item_id = $1 ORDER BY inventory_no LIMIT 500`, [row.id]) : { rows: [] },
    query(`SELECT id, kind, name FROM wh_files WHERE owner_type = 'item' AND owner_id = $1 ORDER BY id`, [row.id]),
    query(
      `SELECT m.*, d.number, d.type, w.name AS warehouse_name FROM wh_moves m JOIN wh_docs d ON d.id = m.doc_id JOIN wh_warehouses w ON w.id = m.warehouse_id
       WHERE m.item_id = $1 AND m.holder_type IN ('warehouse') AND ($2::int[] IS NULL OR m.warehouse_id = ANY($2::int[])) ORDER BY m.moved_at DESC, m.id DESC LIMIT 30`,
      [row.id, visible]
    ),
    query(`SELECT r.*, w.name AS warehouse_name FROM wh_reserves r JOIN wh_warehouses w ON w.id = r.warehouse_id WHERE r.item_id = $1 AND r.status = 'active' ORDER BY r.id`, [row.id]),
  ]);
  const { holderLabels } = await import('./stock.js');
  const labels = await holderLabels(stock.filter((s) => s.holder_type !== 'warehouse'));
  const cost = (warehouseId) => ctx.can('cost', warehouseId);
  const { toolsByIds } = await import('./tools.js');
  return {
    item: { ...item, ...(ctx.costAny ? {} : { lastPrice: null, planPrice: null }) },
    stock: stock.map((s) => ({
      warehouse: { id: s.warehouse_id, name: s.warehouse_name },
      bin: s.bin_id ? { id: s.bin_id, path: s.bin_path } : null,
      batch: s.batch_id ? { id: s.batch_id, number: s.batch_number, expiresOn: isoDayOf(s.expires_on) } : null,
      instance: s.instance_id ? { id: s.instance_id, inventoryNo: s.inventory_no } : null,
      holder: s.holder_type === 'warehouse' ? null : { type: s.holder_type, id: s.holder_id, label: labels.get(`${s.holder_type}:${s.holder_id}`) || `#${s.holder_id}` },
      qty: q4(s.qty),
      amount: cost(s.warehouse_id) ? Number(s.amount) : null,
      lastMoveAt: s.last_move_at,
    })),
    norms: norms.map((n) => ({ warehouseId: n.warehouse_id, warehouseName: n.warehouse_name, minQty: n.min_qty === null ? null : Number(n.min_qty), reorderQty: n.reorder_qty === null ? null : Number(n.reorder_qty) })),
    batches: batches.map((b) => ({ id: b.id, number: b.number, expiresOn: isoDayOf(b.expires_on), producedOn: isoDayOf(b.produced_on), supplier: b.supplier_name || '', unitCost: ctx.costAny && b.unit_cost !== null ? Number(b.unit_cost) : null })),
    instances: instances.length ? await toolsByIds(ctx, instances.map((i) => i.id)) : [],
    reserves: reserves.filter((r) => ctx.sees(r.warehouse_id)).map((r) => ({ id: r.id, warehouse: { id: r.warehouse_id, name: r.warehouse_name }, qty: Number(r.qty), targetType: r.target_type, targetLabel: r.target_label || '', expiresOn: isoDayOf(r.expires_on) })),
    files: files.map((f) => ({ id: f.id, kind: f.kind, name: f.name, url: `/api/app/warehouse/files/${f.id}/file` })),
    moves: moves.map((m) => ({ id: m.id, docId: m.doc_id, number: m.number, type: m.type, warehouse: { id: m.warehouse_id, name: m.warehouse_name }, qty: q4(m.qty), amount: cost(m.warehouse_id) ? Number(m.amount) : null, movedAt: m.moved_at })),
    my: { canEdit: canEditItems(ctx), canAdmin: ctx.canAny('admin'), canNorms: ctx.canAny('admin') },
  };
}

// ── Writing ─────────────────────────────────────────────────────────────────

async function cleanItem(input, current = {}) {
  const out = {};
  const has = (key) => input[key] !== undefined;
  if (has('name')) {
    out.name = text(input.name, 300);
    if (!out.name) throw httpError(400, 'Enter the name', 'NAME_REQUIRED');
  }
  if (has('sku')) out.sku = text(input.sku, 60);
  if (has('brand')) out.brand = text(input.brand, 120);
  if (has('categoryId')) {
    const id = intOrNull(input.categoryId);
    if (id && !(await query(`SELECT 1 FROM wh_categories WHERE id = $1`, [id])).rows.length) throw httpError(400, 'Unknown category', 'BAD_CATEGORY');
    out.category_id = id;
  }
  if (has('kind')) out.kind = input.kind === 'service' ? 'service' : 'goods';
  if (has('tracking')) {
    if (!TRACKING.includes(input.tracking)) throw httpError(400, 'Unknown tracking type', 'BAD_TRACKING');
    out.tracking = input.tracking;
  }
  if (has('trackExpiry')) out.track_expiry = Boolean(input.trackExpiry);
  if (has('baseUnit')) out.base_unit = text(input.baseUnit, 16) || 'шт';
  const baseUnit = out.base_unit || current.base_unit || 'шт';
  if (has('units')) out.units = JSON.stringify(cleanUnits(input.units, baseUnit));
  const units = has('units') ? JSON.parse(out.units) : current.units || [];
  const unitOk = (unit) => !unit || unit === baseUnit || units.some((entry) => entry.code === unit);
  for (const [key, column] of [['receiptUnit', 'receipt_unit'], ['issueUnit', 'issue_unit']]) {
    if (!has(key)) continue;
    const unit = text(input[key], 16);
    if (!unitOk(unit)) throw httpError(400, 'Unknown unit', 'BAD_UNIT', { field: key });
    out[column] = unit;
  }
  if (has('purchaseMultiple')) {
    const n = num(input.purchaseMultiple);
    out.purchase_multiple = n && n > 0 ? q4(n) : null;
  }
  if (has('supplierCompanyId')) out.supplier_company_id = intOrNull(input.supplierCompanyId);
  if (has('supplierName')) out.supplier_name = text(input.supplierName, 300);
  for (const [key, column] of [['lastPrice', 'last_price'], ['planPrice', 'plan_price']]) {
    if (!has(key)) continue;
    const n = num(input[key]);
    out[column] = n !== null && n >= 0 && n < 1e12 ? n : null;
  }
  if (has('attrs')) out.attrs = JSON.stringify(cleanAttrs(input.attrs));
  if (has('description')) out.description = text(input.description, 5000);
  if (has('serviceIntervalDays')) {
    const n = Math.round(Number(input.serviceIntervalDays));
    out.service_interval_days = Number.isFinite(n) && n > 0 && n <= 3650 ? n : null;
  }
  return out;
}

async function writeBarcodes(client, itemId, list) {
  for (const raw of (Array.isArray(list) ? list : []).slice(0, 20)) {
    const code = String(raw?.code ?? raw ?? '').trim().slice(0, 120);
    if (!code) continue;
    const taken = await client.query(`SELECT item_id FROM wh_barcodes WHERE code = $1`, [code]);
    if (taken.rows.length && taken.rows[0].item_id !== itemId) throw httpError(409, `Barcode ${code} belongs to another item`, 'BARCODE_TAKEN', { code, itemId: taken.rows[0].item_id });
    if (taken.rows.length) continue;
    await client.query(`INSERT INTO wh_barcodes (item_id, code, kind, unit) VALUES ($1, $2, $3, $4)`, [itemId, code, barcodeKind(code, raw?.kind), text(raw?.unit, 16)]);
  }
}

function skuConflict(err) {
  if (err?.code === '23505' && String(err.constraint || '').includes('sku')) throw httpError(409, 'This SKU is already used', 'SKU_TAKEN');
  throw err;
}

export async function createItem(req, input = {}, { client: outer = null } = {}) {
  const ctx = await whContext(req);
  assertEditor(ctx);
  const values = await cleanItem({ tracking: 'quantity', baseUnit: 'шт', ...input });
  if (!values.name) throw httpError(400, 'Enter the name', 'NAME_REQUIRED');
  const run = async (client) => {
    const keys = Object.keys(values);
    const { rows } = await client.query(
      `INSERT INTO wh_items (${[...keys, 'created_by'].join(', ')}) VALUES (${[...keys, 'created_by'].map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      [...keys.map((key) => values[key]), ctx.userId]
    ).catch(skuConflict);
    await writeBarcodes(client, rows[0].id, input.barcodes);
    await logEvent(client, 'item', rows[0].id, ctx.userId, 'created', { name: rows[0].name });
    return rows[0];
  };
  const row = outer ? await run(outer) : await withTransaction(run);
  if (outer) return row;
  if (Array.isArray(input.norms)) await saveNorms(req, row.id, input.norms);
  return getItem(req, row.id);
}

export async function updateItem(req, id, input = {}) {
  const ctx = await whContext(req);
  assertEditor(ctx);
  const current = await loadItem(id);
  if (!current) throw httpError(404, 'Item not found', 'NOT_FOUND');
  const values = await cleanItem(input, current);
  // The tracking type cannot change once the item has movements (batches / instances depend on it).
  if (values.tracking && values.tracking !== current.tracking) {
    const used = await query(`SELECT 1 FROM wh_moves WHERE item_id = $1 LIMIT 1`, [current.id]);
    if (used.rows.length) throw httpError(409, 'The tracking type cannot change after movements', 'TRACKING_LOCKED');
  }
  if (values.base_unit && values.base_unit !== current.base_unit) {
    const used = await query(`SELECT 1 FROM wh_moves WHERE item_id = $1 LIMIT 1`, [current.id]);
    if (used.rows.length) throw httpError(409, 'The base unit cannot change after movements', 'UNIT_LOCKED');
  }
  await withTransaction(async (client) => {
    const keys = Object.keys(values);
    if (keys.length) {
      await client.query(`UPDATE wh_items SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [current.id, ...keys.map((key) => values[key])]).catch(skuConflict);
    }
    if (Array.isArray(input.barcodes)) {
      const keep = input.barcodes.map((b) => String(b?.code ?? b ?? '').trim()).filter(Boolean);
      await client.query(`DELETE FROM wh_barcodes WHERE item_id = $1 AND NOT (code = ANY($2::text[]))`, [current.id, keep]);
      await writeBarcodes(client, current.id, input.barcodes);
    }
    const changed = keys.filter((key) => String(values[key] ?? '') !== String(current[key] ?? ''));
    if (changed.length || Array.isArray(input.barcodes)) await logEvent(client, 'item', current.id, ctx.userId, 'updated', { fields: changed });
  });
  if (Array.isArray(input.norms)) await saveNorms(req, current.id, input.norms);
  return getItem(req, current.id);
}

export async function archiveItem(req, id, archived = true) {
  const ctx = await whContext(req);
  if (!ctx.canAny('admin')) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  const current = await loadItem(id);
  if (!current) throw httpError(404, 'Item not found', 'NOT_FOUND');
  await withTransaction(async (client) => {
    await client.query(`UPDATE wh_items SET archived_at = ${archived ? 'NOW()' : 'NULL'}, updated_at = NOW() WHERE id = $1`, [current.id]);
    await logEvent(client, 'item', current.id, ctx.userId, archived ? 'archived' : 'restored');
  });
  return getItem(req, current.id);
}

export async function addBarcode(req, id, input = {}) {
  const ctx = await whContext(req);
  assertEditor(ctx);
  const current = await loadItem(id);
  if (!current) throw httpError(404, 'Item not found', 'NOT_FOUND');
  const unit = text(input.unit, 16);
  if (unit && unit !== current.base_unit && !(current.units || []).some((u) => u.code === unit)) throw httpError(400, 'Unknown unit', 'BAD_UNIT');
  await withTransaction(async (client) => {
    await writeBarcodes(client, current.id, [{ code: input.code, kind: input.kind, unit }]);
    await logEvent(client, 'item', current.id, ctx.userId, 'barcode_added', { code: String(input.code || '').slice(0, 120) });
  });
  return getItem(req, current.id);
}

export async function removeBarcode(req, barcodeId) {
  const ctx = await whContext(req);
  assertEditor(ctx);
  const { rows } = await query(`DELETE FROM wh_barcodes WHERE id = $1 RETURNING item_id, code`, [intOrNull(barcodeId) || 0]);
  if (!rows[0]) throw httpError(404, 'Barcode not found', 'NOT_FOUND');
  await logEvent({ query }, 'item', rows[0].item_id, ctx.userId, 'barcode_removed', { code: rows[0].code });
  return getItem(req, rows[0].item_id);
}

/** PUT norms: [{ warehouseId, minQty, reorderQty }] — warehouse administrators of each warehouse. */
export async function saveNorms(req, itemId, list) {
  const ctx = await whContext(req);
  const item = await loadItem(itemId);
  if (!item) throw httpError(404, 'Item not found', 'NOT_FOUND');
  await withTransaction(async (client) => {
    for (const raw of (Array.isArray(list) ? list : []).slice(0, 200)) {
      const warehouseId = intOrNull(raw?.warehouseId);
      if (!warehouseId) continue;
      if (!ctx.can('admin', warehouseId)) throw httpError(403, 'Norms are set by the warehouse administrator', 'FORBIDDEN', { warehouseId });
      const min = num(raw.minQty);
      const reorder = num(raw.reorderQty);
      if ((min === null || min <= 0) && (reorder === null || reorder <= 0)) {
        await client.query(`DELETE FROM wh_norms WHERE item_id = $1 AND warehouse_id = $2`, [item.id, warehouseId]);
      } else {
        await client.query(
          `INSERT INTO wh_norms (item_id, warehouse_id, min_qty, reorder_qty, updated_at) VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (item_id, warehouse_id) DO UPDATE SET min_qty = EXCLUDED.min_qty, reorder_qty = EXCLUDED.reorder_qty, updated_at = NOW()`,
          [item.id, warehouseId, min !== null && min > 0 ? q4(min) : null, reorder !== null && reorder > 0 ? q4(reorder) : null]
        );
      }
      await logEvent(client, 'item', item.id, ctx.userId, 'norm', { warehouseId, minQty: min, reorderQty: reorder });
    }
  });
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function listCategories() {
  return [...(await categoriesMap()).values()];
}

export async function saveCategory(req, id, input = {}) {
  const ctx = await whContext(req);
  if (!ctx.canAny('admin')) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  const name = text(input.name, 120);
  if (!name) throw httpError(400, 'Enter the name', 'NAME_REQUIRED');
  const parentId = intOrNull(input.parentId);
  if (id && parentId) {
    const below = await subtree(Number(id));
    if (below.includes(parentId)) throw httpError(400, 'A category cannot be inside itself', 'BAD_PARENT');
  }
  const attrs = JSON.stringify(cleanAttrDefs(input.attrs));
  const sort = Number.isFinite(Number(input.sort)) ? Math.round(Number(input.sort)) : 0;
  if (id) {
    const { rows } = await query(`UPDATE wh_categories SET name = $2, parent_id = $3, attrs = $4, sort = $5, archived_at = ${input.archived ? 'COALESCE(archived_at, NOW())' : 'NULL'} WHERE id = $1 RETURNING id`, [intOrNull(id) || 0, name, parentId, attrs, sort]);
    if (!rows[0]) throw httpError(404, 'Category not found', 'NOT_FOUND');
  } else {
    await query(`INSERT INTO wh_categories (name, parent_id, attrs, sort) VALUES ($1, $2, $3, $4)`, [name, parentId, attrs, sort]);
  }
  return listCategories();
}

export async function deleteCategory(req, id) {
  const ctx = await whContext(req);
  if (!ctx.canAny('admin')) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  const used = await query(`SELECT 1 FROM wh_items WHERE category_id = $1 LIMIT 1`, [intOrNull(id) || 0]);
  if (used.rows.length) await query(`UPDATE wh_categories SET archived_at = NOW() WHERE id = $1`, [intOrNull(id) || 0]);
  else await query(`DELETE FROM wh_categories WHERE id = $1`, [intOrNull(id) || 0]);
  return listCategories();
}

// ── Scanning ────────────────────────────────────────────────────────────────

/**
 * GET /resolve?code=…&warehouse= — what a scanned code is (spec §2 «сканер
 * везде»). Order: the module's own label codes (WI-/WB-/WT-/WW-), item
 * barcodes (a pack barcode brings its unit and factor), instance inventory
 * or serial numbers, batch numbers, SKUs, bin paths of the given warehouse,
 * warehouse codes, document numbers. → { kind, item?, unit?, factor?, batch?,
 * instance?, bin?, warehouse?, document?, matches? } or 404 UNKNOWN_CODE.
 */
export async function resolveCode(req, rawCode, input = {}) {
  const ctx = await whContext(req);
  const code = String(rawCode || '').trim().slice(0, 200);
  if (!code) throw httpError(400, 'Scan or type a code', 'CODE_REQUIRED');
  const warehouseId = intOrNull(input.warehouse);
  const itemOut = async (row, extra = {}) => {
    const [item] = await hydrateItems([row]);
    return { kind: 'item', item: { ...item, lastPrice: ctx.costAny ? item.lastPrice : null, planPrice: ctx.costAny ? item.planPrice : null }, unit: item.baseUnit, factor: 1, ...extra };
  };
  const own = parseOwnCode(code);
  if (own?.kind === 'item') {
    const row = await loadItem(own.id);
    if (row) return itemOut(row);
  }
  if (own?.kind === 'instance' || own === null) {
    const { rows } = own?.kind === 'instance'
      ? await query(`SELECT * FROM wh_instances WHERE id = $1`, [own.id])
      : await query(`SELECT * FROM wh_instances WHERE LOWER(inventory_no) = LOWER($1) OR LOWER(serial_no) = LOWER($1) ORDER BY (LOWER(inventory_no) = LOWER($1)) DESC LIMIT 2`, [code]);
    if (rows.length === 1 || (rows.length && own)) {
      const { toolsByIds } = await import('./tools.js');
      const [tool] = await toolsByIds(ctx, [rows[0].id]);
      const out = await itemOut(await loadItem(rows[0].item_id));
      return { ...out, kind: 'instance', instance: tool };
    }
  }
  if (own?.kind === 'bin') {
    const { rows } = await query(`SELECT b.*, w.name AS warehouse_name FROM wh_bins b JOIN wh_warehouses w ON w.id = b.warehouse_id WHERE b.id = $1`, [own.id]);
    if (rows[0] && ctx.sees(rows[0].warehouse_id)) return { kind: 'bin', bin: { id: rows[0].id, path: rows[0].path, kind: rows[0].kind, warehouseId: rows[0].warehouse_id }, warehouse: { id: rows[0].warehouse_id, name: rows[0].warehouse_name } };
  }
  if (own?.kind === 'warehouse') {
    const { rows } = await query(`SELECT id, name, code FROM wh_warehouses WHERE id = $1`, [own.id]);
    if (rows[0] && ctx.sees(rows[0].id)) return { kind: 'warehouse', warehouse: { id: rows[0].id, name: rows[0].name, code: rows[0].code } };
  }
  if (!own) {
    const barcode = await query(`SELECT b.unit, i.* FROM wh_barcodes b JOIN wh_items i ON i.id = b.item_id WHERE b.code = $1`, [code]);
    if (barcode.rows[0]) {
      const row = barcode.rows[0];
      const unit = row.unit && row.unit !== row.base_unit ? (row.units || []).find((u) => u.code === row.unit) : null;
      return itemOut(row, unit ? { unit: unit.code, factor: Number(unit.factor) } : {});
    }
    const batches = await query(
      `SELECT b.*, i.name AS item_name FROM wh_batches b JOIN wh_items i ON i.id = b.item_id WHERE LOWER(b.number) = LOWER($1) ORDER BY b.expires_on NULLS LAST LIMIT 10`,
      [code]
    );
    if (batches.rows.length === 1) {
      const b = batches.rows[0];
      const out = await itemOut(await loadItem(b.item_id));
      return { ...out, kind: 'batch', batch: { id: b.id, number: b.number, expiresOn: isoDayOf(b.expires_on) } };
    }
    if (batches.rows.length > 1) {
      return { kind: 'ambiguous', matches: batches.rows.map((b) => ({ kind: 'batch', itemId: b.item_id, itemName: b.item_name, batch: { id: b.id, number: b.number, expiresOn: isoDayOf(b.expires_on) } })) };
    }
    const sku = await query(`SELECT * FROM wh_items WHERE LOWER(sku) = LOWER($1) LIMIT 1`, [code]);
    if (sku.rows[0]) return itemOut(sku.rows[0]);
    if (warehouseId) {
      const bin = await query(`SELECT * FROM wh_bins WHERE warehouse_id = $1 AND (LOWER(path) = LOWER($2) OR LOWER(code) = LOWER($2)) ORDER BY (LOWER(path) = LOWER($2)) DESC LIMIT 1`, [warehouseId, code]);
      if (bin.rows[0] && ctx.sees(warehouseId)) return { kind: 'bin', bin: { id: bin.rows[0].id, path: bin.rows[0].path, kind: bin.rows[0].kind, warehouseId } };
    }
    const wh = await query(`SELECT id, name, code FROM wh_warehouses WHERE LOWER(code) = LOWER($1) LIMIT 1`, [code]);
    if (wh.rows[0] && ctx.sees(wh.rows[0].id)) return { kind: 'warehouse', warehouse: { id: wh.rows[0].id, name: wh.rows[0].name, code: wh.rows[0].code } };
    const doc = await query(`SELECT id, number, type, status FROM wh_docs WHERE number = $1 LIMIT 1`, [code]);
    if (doc.rows[0]) {
      const { canSeeDoc } = await import('./access.js');
      const full = (await query(`SELECT * FROM wh_docs WHERE id = $1`, [doc.rows[0].id])).rows[0];
      if (await canSeeDoc(ctx, full)) return { kind: 'document', document: { id: full.id, number: full.number, type: full.type, status: full.status } };
    }
  }
  throw httpError(404, 'Nothing is known under this code', 'UNKNOWN_CODE', { code });
}
