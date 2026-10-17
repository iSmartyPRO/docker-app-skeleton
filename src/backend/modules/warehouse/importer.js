import { query, withTransaction } from '../../config/database.js';
import { intOrNull, logEvent, whContext } from './access.js';
import { TRACKING, barcodeKind, cleanUnits, day, httpError, num, q4 } from './logic.js';
import { createDoc, getDoc, postDoc } from './documents.js';

/*
 * Import from Excel / CSV (spec §11): the browser reads the file (exceljs,
 * like the Masterplan import) and posts rows; the server validates every row
 * and answers a report { ok, created, updated, errors: [{ row, field, code, message }] }.
 * `dryRun` checks without writing. Rows are numbered as in the sheet (header = 1).
 *
 *   items    nomenclature: name, SKU, category path («Материалы / Цемент»),
 *            base unit, extra units («уп=24; мешок=25»), barcodes («a; b»),
 *            tracking, brand, supplier, minimum per warehouse
 *   opening  opening balances of one warehouse: item (SKU, barcode or name),
 *            quantity, unit, price, batch, expiry, bin, inventory / serial numbers
 */

const MAX_ROWS = 5000;
// Accepted spellings in every portal language (also the interface labels); keys go through importWord().
const importWord = (value) => String(value ?? '').trim().toLowerCase().replace(/\u0307/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ');
const TRACKING_WORDS = Object.fromEntries(Object.entries({
  quantity: 'quantity', количественный: 'quantity', количество: 'quantity', сандык: 'quantity', miktar: 'quantity', 按数量: 'quantity', 数量: 'quantity',
  batch: 'batch', batches: 'batch', партионный: 'batch', партия: 'batch', партиялык: 'batch', parti: 'batch', partiler: 'batch', 按批次: 'batch', 批次: 'batch',
  serial: 'serial', серийный: 'serial', серия: 'serial', сериялык: 'serial', 'seri numaralı': 'serial', seri: 'serial', 按序列号: 'serial', 序列号: 'serial',
}).map(([word, value]) => [importWord(word), value]));

const s = (value, max = 300) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function parseUnits(textValue) {
  return String(textValue || '')
    .split(/[;,\n]/)
    .map((part) => /^\s*([^=:]+?)\s*[=:]\s*([\d.,]+)\s*$/.exec(part))
    .filter(Boolean)
    .map((m) => ({ code: m[1].trim(), factor: num(m[2]) }));
}

async function categoryByPath(client, path, cache) {
  const parts = String(path || '').split(/\s*[/>]\s*/).map((p) => s(p, 120)).filter(Boolean);
  let parent = null;
  for (const name of parts) {
    const key = `${parent || 0}|${name.toLowerCase()}`;
    if (!cache.has(key)) {
      const { rows } = await client.query(`SELECT id FROM wh_categories WHERE LOWER(name) = LOWER($1) AND parent_id IS NOT DISTINCT FROM $2 LIMIT 1`, [name, parent]);
      cache.set(key, rows[0]?.id || (await client.query(`INSERT INTO wh_categories (name, parent_id) VALUES ($1, $2) RETURNING id`, [name, parent])).rows[0].id);
    }
    parent = cache.get(key);
  }
  return parent;
}

/** POST /import/items { rows, dryRun } */
export async function importItems(req, input = {}) {
  const ctx = await whContext(req);
  if (!ctx.canAny('admin')) throw httpError(403, 'Warehouse administrators import the nomenclature', 'FORBIDDEN');
  const rows = Array.isArray(input.rows) ? input.rows.slice(0, MAX_ROWS) : [];
  if (!rows.length) throw httpError(400, 'The file has no rows', 'NO_ROWS');
  const errors = [];
  const plan = [];
  const seenSku = new Set();
  const seenCodes = new Set();
  const { rows: warehouses } = await query(`SELECT id, name, code FROM wh_warehouses WHERE archived_at IS NULL`);
  const whByName = (value) => warehouses.find((w) => w.name.toLowerCase() === s(value).toLowerCase() || (w.code && w.code.toLowerCase() === s(value).toLowerCase()));
  for (const [index, raw] of rows.entries()) {
    const row = index + 2;
    const err = (field, code, message) => errors.push({ row, field, code, message });
    const name = s(raw.name);
    if (!name) {
      err('name', 'NAME_REQUIRED', 'Name is required');
      continue;
    }
    const sku = s(raw.sku, 60) || null;
    if (sku && seenSku.has(sku.toLowerCase())) err('sku', 'DUPLICATE', `SKU ${sku} repeats in the file`);
    if (sku) seenSku.add(sku.toLowerCase());
    const trackingWord = importWord(s(raw.tracking));
    const tracking = trackingWord ? TRACKING_WORDS[trackingWord] : 'quantity';
    if (!tracking || !TRACKING.includes(tracking)) err('tracking', 'BAD_TRACKING', `Unknown tracking «${raw.tracking}»`);
    const baseUnit = s(raw.unit, 16) || 'шт';
    const unitsRaw = parseUnits(raw.units);
    const units = cleanUnits(unitsRaw, baseUnit);
    if (unitsRaw.length !== units.length) err('units', 'BAD_UNITS', 'Units are written as «уп=24; мешок=25»');
    const codes = String(raw.barcodes || '').split(/[;,\s]+/).map((c) => c.trim()).filter(Boolean);
    for (const code of codes) {
      if (seenCodes.has(code)) err('barcodes', 'DUPLICATE', `Barcode ${code} repeats in the file`);
      seenCodes.add(code);
    }
    const minQty = raw.minQty === undefined || raw.minQty === '' ? null : num(raw.minQty);
    if (raw.minQty !== undefined && raw.minQty !== '' && (minQty === null || minQty < 0)) err('minQty', 'BAD_NUMBER', 'Minimum must be a number');
    const warehouse = raw.warehouse ? whByName(raw.warehouse) : null;
    if (raw.warehouse && !warehouse) err('warehouse', 'BAD_WAREHOUSE', `Unknown warehouse «${raw.warehouse}»`);
    if (minQty && !warehouse && warehouses.length !== 1) err('warehouse', 'WAREHOUSE_REQUIRED', 'A minimum needs the warehouse');
    const price = raw.price === undefined || raw.price === '' ? null : num(raw.price);
    if (raw.price !== undefined && raw.price !== '' && (price === null || price < 0)) err('price', 'BAD_NUMBER', 'Price must be a number');
    plan.push({ row, name, sku, tracking, baseUnit, units, codes, category: s(raw.category), brand: s(raw.brand, 120) || null, supplier: s(raw.supplier) || null, minQty, warehouseId: warehouse?.id || (warehouses.length === 1 ? warehouses[0].id : null), price, description: s(raw.description, 5000) || null });
  }
  // Barcodes that belong to other items already.
  const allCodes = plan.flatMap((p) => p.codes);
  if (allCodes.length) {
    const { rows: taken } = await query(`SELECT b.code, b.item_id, i.sku, i.name FROM wh_barcodes b JOIN wh_items i ON i.id = b.item_id WHERE b.code = ANY($1::text[])`, [allCodes]);
    for (const t of taken) {
      const owner = plan.find((p) => p.codes.includes(t.code));
      if (owner && !((owner.sku && t.sku && owner.sku.toLowerCase() === t.sku.toLowerCase()) || owner.name.toLowerCase() === t.name.toLowerCase())) errors.push({ row: owner.row, field: 'barcodes', code: 'BARCODE_TAKEN', message: `Barcode ${t.code} belongs to «${t.name}»` });
    }
  }
  if (errors.length || input.dryRun) return { ok: !errors.length, dryRun: Boolean(input.dryRun), rows: plan.length, created: 0, updated: 0, errors };
  let created = 0;
  let updated = 0;
  await withTransaction(async (client) => {
    const cache = new Map();
    for (const p of plan) {
      const categoryId = p.category ? await categoryByPath(client, p.category, cache) : null;
      const { rows: found } = await client.query(`SELECT id, tracking FROM wh_items WHERE ${p.sku ? 'LOWER(sku) = LOWER($1)' : 'LOWER(name) = LOWER($1) AND (sku IS NULL OR sku = \'\')'} LIMIT 1`, [p.sku || p.name]);
      let id = found[0]?.id;
      if (id) {
        await client.query(
          `UPDATE wh_items SET name = $2, category_id = COALESCE($3, category_id), brand = COALESCE($4, brand), units = $5, supplier_name = COALESCE($6, supplier_name), last_price = COALESCE($7, last_price), description = COALESCE($8, description), updated_at = NOW() WHERE id = $1`,
          [id, p.name, categoryId, p.brand, JSON.stringify(p.units), p.supplier, p.price, p.description]
        );
        updated += 1;
      } else {
        const { rows: ins } = await client.query(
          `INSERT INTO wh_items (sku, name, category_id, brand, tracking, base_unit, units, supplier_name, last_price, description, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [p.sku, p.name, categoryId, p.brand, p.tracking, p.baseUnit, JSON.stringify(p.units), p.supplier, p.price, p.description, ctx.userId]
        );
        id = ins[0].id;
        created += 1;
      }
      for (const code of p.codes) await client.query(`INSERT INTO wh_barcodes (item_id, code, kind) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`, [id, code.slice(0, 120), barcodeKind(code)]);
      if (p.minQty && p.warehouseId) {
        await client.query(`INSERT INTO wh_norms (item_id, warehouse_id, min_qty) VALUES ($1, $2, $3) ON CONFLICT (item_id, warehouse_id) DO UPDATE SET min_qty = EXCLUDED.min_qty, updated_at = NOW()`, [id, p.warehouseId, q4(p.minQty)]);
      }
    }
    await logEvent(client, 'item', 0, ctx.userId, 'imported', { created, updated });
  });
  return { ok: true, dryRun: false, rows: plan.length, created, updated, errors: [] };
}

/** POST /import/opening { warehouseId, rows, dryRun, post } → a «Ввод остатков» document (draft, or posted with post: true). */
export async function importOpening(req, input = {}) {
  const ctx = await whContext(req);
  const warehouseId = intOrNull(input.warehouseId);
  if (!warehouseId || !ctx.can('admin', warehouseId)) throw httpError(403, 'Opening balances are entered by the warehouse administrator', 'FORBIDDEN');
  const rows = Array.isArray(input.rows) ? input.rows.slice(0, MAX_ROWS) : [];
  if (!rows.length) throw httpError(400, 'The file has no rows', 'NO_ROWS');
  const errors = [];
  const lines = [];
  const { rows: bins } = await query(`SELECT id, path, code FROM wh_bins WHERE warehouse_id = $1`, [warehouseId]);
  const seenInv = new Set();
  for (const [index, raw] of rows.entries()) {
    const row = index + 2;
    const err = (field, code, message) => errors.push({ row, field, code, message });
    const key = s(raw.sku || raw.barcode || raw.name);
    if (!key) {
      err('item', 'ITEM_REQUIRED', 'SKU, barcode or name is required');
      continue;
    }
    const { rows: found } = await query(
      `SELECT i.* FROM wh_items i WHERE i.archived_at IS NULL AND (LOWER(i.sku) = LOWER($1) OR EXISTS (SELECT 1 FROM wh_barcodes b WHERE b.item_id = i.id AND b.code = $2) OR LOWER(i.name) = LOWER($3))
       ORDER BY (LOWER(i.sku) = LOWER($1)) DESC NULLS LAST LIMIT 2`,
      [s(raw.sku) || '\u0000', s(raw.barcode) || '\u0000', s(raw.name) || '\u0000']
    );
    const item = found[0];
    if (!item) {
      err('item', 'UNKNOWN_ITEM', `Unknown item «${key}»`);
      continue;
    }
    const qty = num(raw.qty);
    if (qty === null || qty <= 0) err('qty', 'BAD_NUMBER', 'Quantity must be above zero');
    const unit = s(raw.unit, 16) || item.base_unit;
    if (unit !== item.base_unit && !(item.units || []).some((u) => u.code === unit)) err('unit', 'BAD_UNIT', `Unknown unit «${unit}» for ${item.name}`);
    const price = raw.price === undefined || raw.price === '' ? null : num(raw.price);
    if (raw.price !== undefined && raw.price !== '' && (price === null || price < 0)) err('price', 'BAD_NUMBER', 'Price must be a number');
    const bin = raw.bin ? bins.find((b) => b.path.toLowerCase() === s(raw.bin).toLowerCase() || b.code.toLowerCase() === s(raw.bin).toLowerCase()) : null;
    if (raw.bin && !bin) err('bin', 'BAD_BIN', `Unknown bin «${raw.bin}»`);
    const expiresOn = raw.expiresOn ? day(String(raw.expiresOn).replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, '$3-$2-$1')) : null;
    if (raw.expiresOn && !expiresOn) err('expiresOn', 'BAD_DATE', 'Dates are YYYY-MM-DD or DD.MM.YYYY');
    let serials;
    if (item.tracking === 'serial') {
      const invs = String(raw.inventoryNo || '').split(/[;,]+/).map((v) => v.trim()).filter(Boolean);
      const sers = String(raw.serialNo || '').split(/[;,]+/).map((v) => v.trim());
      if (qty && Math.round(qty) !== qty) err('qty', 'SERIAL_WHOLE', 'Serial items are counted in whole pieces');
      for (const inv of invs) {
        if (seenInv.has(inv.toLowerCase())) err('inventoryNo', 'DUPLICATE', `Inventory number ${inv} repeats`);
        seenInv.add(inv.toLowerCase());
      }
      if (invs.length) {
        const { rows: taken } = await query(`SELECT inventory_no FROM wh_instances WHERE LOWER(inventory_no) = ANY($1::text[])`, [invs.map((v) => v.toLowerCase())]);
        for (const t of taken) err('inventoryNo', 'INVENTORY_NO_TAKEN', `Inventory number ${t.inventory_no} is taken`);
      }
      serials = Array.from({ length: Math.max(0, Math.round(qty || 0)) }, (_, i) => ({ inventoryNo: invs[i] || '', serialNo: sers[i] || '' }));
    }
    lines.push({ itemId: item.id, qty, unit, price: price ?? undefined, toBinId: bin?.id, batchNumber: item.tracking === 'batch' ? s(raw.batch, 80) || undefined : undefined, expiresOn: expiresOn || undefined, serials });
  }
  if (errors.length || input.dryRun) return { ok: !errors.length, dryRun: Boolean(input.dryRun), rows: lines.length, errors };
  const draft = await createDoc(req, { type: 'opening', toWarehouseId: warehouseId, comment: 'Импорт начальных остатков', lines });
  if (input.post) {
    const posted = await postDoc(req, draft.document.id);
    return { ok: true, rows: lines.length, errors: [], document: posted.document };
  }
  return { ok: true, rows: lines.length, errors: [], document: (await getDoc(req, draft.document.id)).document };
}
