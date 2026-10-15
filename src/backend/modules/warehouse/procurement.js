import { query } from '../../config/database.js';
import { decide } from '../../api/scopes.js';
import { intOrNull, logEvent, modulesState, whContext } from './access.js';
import { EPS, httpError, q4 } from './logic.js';
import { createDoc, getDoc, visibleDoc } from './documents.js';

/*
 * The link with Procurement (spec §7; not a dependency — every call answers
 * 404 MODULE_DISABLED while Procurement is off):
 *   - a receipt «from a purchase request»: lines, supplier, prices and
 *     currency come from the request; items are matched by SKU or name;
 *   - posting such a receipt marks the delivery in the request (partial
 *     while something is still to come) through procurement's service API;
 *   - «Заказать недостающее» / «ниже минимума → заявка»: a draft purchase
 *     request with the missing quantities, created as the person (their
 *     procurement rights apply).
 */

async function assertProcurement(req) {
  if (!(await modulesState()).procurement) throw httpError(404, 'Procurement is switched off', 'MODULE_DISABLED');
  const policy = req?.apiToken?.policy;
  if (policy && !decide(policy, 'GET', '/app/procurement/requests').ok) throw httpError(403, 'The token has no procurement access', 'SCOPE_DENIED');
}

/** Quantities already received per request line (posted receipts, reversed ones excluded). */
async function receivedByProcItem(requestId) {
  const { rows } = await query(
    `SELECT l.proc_item_id, SUM(l.qty) AS qty FROM wh_doc_lines l JOIN wh_docs d ON d.id = l.doc_id
     WHERE d.proc_request_id = $1 AND d.type = 'receipt' AND d.status = 'posted' AND l.proc_item_id IS NOT NULL GROUP BY l.proc_item_id`,
    [requestId]
  );
  return new Map(rows.map((row) => [row.proc_item_id, Number(row.qty)]));
}

/** Approved requests waiting for goods (picker of the receipt form). */
export async function deliverableRequests(req, input = {}) {
  await assertProcurement(req);
  const { listRequests } = await import('../procurement/service.js');
  const result = await listRequests(req, { status: 'to_pay,partially_paid,paid', q: input.q || undefined, pageSize: 30 });
  return result.items.filter((item) => item.deliveryState !== 'full').map((item) => ({ id: item.id, label: `${item.number} · ${item.title}`, supplier: item.supplier?.name || '', deliveryState: item.deliveryState }));
}

/** POST /documents/from-procurement { requestId, warehouseId } → a receipt draft. */
export async function receiptFromRequest(req, input = {}) {
  await assertProcurement(req);
  const requestId = intOrNull(input.requestId);
  if (!requestId) throw httpError(400, 'Choose the purchase request', 'REQUEST_REQUIRED');
  const { getRequest } = await import('../procurement/service.js');
  const { request } = await getRequest(req, requestId);
  if (!['to_pay', 'partially_paid', 'paid', 'delivered'].includes(request.status)) throw httpError(409, 'The request is not approved yet', 'REQUEST_NOT_APPROVED', { status: request.status });
  const ctx = await whContext(req);
  const received = await receivedByProcItem(request.id);
  const lines = [];
  for (const item of request.items || []) {
    const left = q4(Number(item.qty) - (received.get(item.id) || 0));
    if (left <= EPS) continue;
    const { rows } = await query(
      `SELECT id, base_unit, units FROM wh_items WHERE archived_at IS NULL AND (LOWER(sku) = LOWER($1) OR LOWER(name) = LOWER($1)) ORDER BY (LOWER(sku) = LOWER($1)) DESC NULLS LAST, id LIMIT 1`,
      [String(item.name).trim()]
    );
    const match = rows[0];
    const unitKnown = match && (item.unit === match.base_unit || (match.units || []).some((u) => u.code === item.unit));
    lines.push({ itemId: match?.id || null, nameHint: item.name, qty: left, unit: unitKnown ? item.unit : match?.base_unit, price: ctx.costAny ? item.price : undefined, procItemId: item.id });
  }
  const currency = (ctx.settings.currencies || []).includes(request.currency) ? request.currency : ctx.settings.currency;
  // createDoc refuses lines without an item: unmatched lines keep their name and wait for the person to pick one.
  const draft = await createDoc(req, {
    type: 'receipt',
    toWarehouseId: input.warehouseId,
    supplierCompanyId: request.supplier?.companyId || null,
    supplierName: request.supplier?.name || null,
    currency,
    comment: request.description ? String(request.description).slice(0, 500) : null,
    procRequestId: request.id,
    procRequestLabel: `${request.number} · ${request.title}`,
    contractId: request.contract?.id || null,
    contractLabel: request.contract?.label || null,
    lines,
  });
  return draft;
}

/** After a receipt with a request is posted: the delivery mark in Procurement (partial while lines are open). */
export async function markProcurementDelivery(row, actorId) {
  if (!(await modulesState()).procurement) return { skipped: 'MODULE_DISABLED' };
  const { rows: items } = await query(`SELECT id, qty FROM proc_items WHERE request_id = $1`, [row.proc_request_id]);
  const received = await receivedByProcItem(row.proc_request_id);
  const partial = items.length ? items.some((item) => (received.get(item.id) || 0) < Number(item.qty) - EPS) : false;
  const { recordExternalDelivery } = await import('../procurement/money.js');
  const result = await recordExternalDelivery({ requestId: row.proc_request_id, actorId, partial, note: `Склад: ${row.number}`, source: 'warehouse', reference: row.number });
  await logEvent({ query }, 'doc', row.id, actorId, result.skipped ? 'procurement_skipped' : 'procurement_delivered', { requestId: row.proc_request_id, partial, ...(result.skipped ? { reason: result.skipped } : { status: result.status }) });
  return result;
}

/** After a receipt with a request is reversed: its delivery mark goes back (what is still to come is recomputed). */
export async function revertProcurementDelivery(row, actorId) {
  if (!(await modulesState()).procurement) return { skipped: 'MODULE_DISABLED' };
  const { rows: items } = await query(`SELECT id, qty FROM proc_items WHERE request_id = $1`, [row.proc_request_id]);
  const received = await receivedByProcItem(row.proc_request_id);
  const partial = items.length ? items.some((item) => (received.get(item.id) || 0) < Number(item.qty) - EPS) : null;
  const { revertExternalDelivery } = await import('../procurement/money.js');
  const result = await revertExternalDelivery({ requestId: row.proc_request_id, actorId, reference: row.number, source: 'warehouse', partial });
  await logEvent({ query }, 'doc', row.id, actorId, result.skipped ? 'procurement_revert_skipped' : 'procurement_reverted', { requestId: row.proc_request_id, ...(result.skipped ? { reason: result.skipped } : { status: result.status }) });
  return result;
}

async function createPurchaseDraft(req, { title, lines, description }) {
  await assertProcurement(req);
  const ctx = await whContext(req);
  const { createRequest } = await import('../procurement/service.js');
  const items = [];
  for (const line of lines) {
    const { rows } = await query(`SELECT id, name, sku, base_unit, last_price, purchase_multiple FROM wh_items WHERE id = $1`, [line.itemId]);
    const item = rows[0];
    if (!item) continue;
    let qty = q4(line.qty);
    const multiple = Number(item.purchase_multiple);
    if (multiple > 0) qty = q4(Math.ceil(qty / multiple - EPS) * multiple);
    if (qty <= EPS) continue;
    items.push({ name: item.sku ? `${item.name} (${item.sku})` : item.name, qty, unit: item.base_unit, price: ctx.costAny && item.last_price !== null ? Number(item.last_price) : 0 });
  }
  if (!items.length) throw httpError(400, 'Nothing is missing', 'NOTHING_TO_ORDER');
  const result = await createRequest(req, { title: title.slice(0, 300), description, hasItems: true, items });
  return { request: { id: result.request.id, number: result.request.number, url: result.request.url } };
}

/** POST /documents/:id/order-shortage — a draft purchase request for what a document lacks. */
export async function orderShortage(req, id) {
  const card = await getDoc(req, id);
  const missing = new Map();
  for (const line of card.lines) {
    if (!line.short || !line.item) continue;
    const need = card.lines.filter((l) => l.item?.id === line.item.id).reduce((sum, l) => sum + l.baseQty, 0);
    missing.set(line.item.id, Math.max(missing.get(line.item.id) || 0, q4(need - Math.max(0, line.hint?.available || 0))));
  }
  const { row } = await visibleDoc(req, id);
  const title = `Недостающее для ${row.number}${row.to_holder_label ? ` (${row.to_holder_label})` : ''}`;
  const out = await createPurchaseDraft(req, { title, description: `Склад: документ ${row.number}`, lines: [...missing].map(([itemId, qty]) => ({ itemId, qty })) });
  await logEvent({ query }, 'doc', row.id, req.user?.id, 'shortage_ordered', { requestId: out.request.id, number: out.request.number });
  return out;
}

/** POST /procurement/order { warehouseId, items: [{ itemId, qty }] | belowMin: true } — «ниже минимума → заявка». */
export async function orderForWarehouse(req, input = {}) {
  const ctx = await whContext(req);
  const warehouseId = intOrNull(input.warehouseId);
  if (!warehouseId || !ctx.sees(warehouseId)) throw httpError(404, 'Warehouse not found', 'NOT_FOUND');
  let lines = (Array.isArray(input.items) ? input.items : []).map((raw) => ({ itemId: intOrNull(raw?.itemId), qty: Number(raw?.qty) })).filter((l) => l.itemId && l.qty > 0);
  if (input.belowMin) {
    // Up to the reorder point (or the minimum), what is below it now.
    const { rows } = await query(
      `SELECT n.item_id, COALESCE(n.reorder_qty, n.min_qty) AS target, n.min_qty,
              (SELECT COALESCE(SUM(s.qty), 0) FROM wh_stock s WHERE s.item_id = n.item_id AND s.warehouse_id = n.warehouse_id AND s.holder_type IN ('warehouse', 'transit')) AS qty
       FROM wh_norms n JOIN wh_items i ON i.id = n.item_id AND i.archived_at IS NULL WHERE n.warehouse_id = $1 AND n.min_qty > 0`,
      [warehouseId]
    );
    lines = rows.filter((row) => Number(row.qty) < Number(row.min_qty)).map((row) => ({ itemId: row.item_id, qty: q4(Math.max(Number(row.target), Number(row.min_qty)) - Number(row.qty)) }));
  }
  const { rows: wh } = await query(`SELECT name FROM wh_warehouses WHERE id = $1`, [warehouseId]);
  return createPurchaseDraft(req, { title: `Пополнение склада «${wh[0]?.name || warehouseId}»`, description: 'Создано из модуля «Склад»: позиции ниже минимального остатка.', lines });
}
