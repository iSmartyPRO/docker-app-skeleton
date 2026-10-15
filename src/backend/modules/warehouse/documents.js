import { query, withTransaction } from '../../config/database.js';
import { emitEvent } from '../../api/events.js';
import { notify } from '../../services/notifications.js';
import { isoDay, startOfDay } from '../../services/datetime.js';
import { portalRegional, requestRegional } from '../../services/regional.js';
import { getProcess, startApproval } from '../approvals/api.js';
import { APPROVAL_TYPE, Params, canSeeDoc, costOn, docVisibleSql, intOrNull, isoDayOf, logEvent, text, usersByIds, whContext, warehouseSettings } from './access.js';
import {
  DOC_CHIPS,
  DOC_TYPES,
  EDITABLE,
  EPS,
  HOLDER_TYPES,
  STATUSES,
  USER_TYPES,
  WRITEOFF_REASONS,
  cents,
  day,
  docActions,
  docWarehouses,
  formatNumber,
  httpError,
  needsApproval,
  num,
  q4,
  rateOf,
  stripEventCost,
  unitFactor,
} from './logic.js';
import { applyDiscrepancy, applyDocument, applyStorno, linesOf, lockDoc } from './posting.js';
import { holderLabels, stockHints } from './stock.js';
import { filesOf, storeSignature } from './files.js';
import { warehouseMessage } from './messages.js';
import { warehouseKeepers } from './warehouses.js';

/*
 * Documents (spec §5): drafts with lines, the three-step forms, posting,
 * two-step transfers with the discrepancy act, requisitions, hand-overs of
 * tools with the recipient's confirmation, approval of write-offs above the
 * threshold, storno. Lists with chips and counters, the card with stock
 * hints per line, history, signatures and attachments.
 */

export const docUrl = (id) => `/app/warehouse/documents/${id}`;

// ── Numbering and loading ───────────────────────────────────────────────────

export async function nextNumber(client, type, settings) {
  const key = `doc:${type}`;
  const { rows } = await client.query(
    `INSERT INTO wh_counters (key, value) VALUES ($1, 1) ON CONFLICT (key) DO UPDATE SET value = wh_counters.value + 1 RETURNING value`,
    [key]
  );
  const seq = rows[0].value;
  return { seq, number: formatNumber(settings.numberPrefixes?.[type] || type.slice(0, 2).toUpperCase(), seq, settings.numberDigits || 5) };
}

const SELECT = `SELECT d.*, ap.status AS approval_status FROM wh_docs d
  LEFT JOIN approval_processes ap ON ap.type = '${APPROVAL_TYPE}' AND ap.doc_id = d.id::text`;

export async function loadDoc(id, client = { query }) {
  const n = intOrNull(id);
  if (!n) return null;
  const { rows } = await client.query(`${SELECT} WHERE d.id = $1`, [n]);
  return rows[0] || null;
}

export async function visibleDoc(req, id) {
  const ctx = await whContext(req);
  const row = await loadDoc(id);
  if (!row || !(await canSeeDoc(ctx, row))) throw httpError(404, 'Document not found', 'NOT_FOUND');
  return { ctx, row };
}

// ── Shapes ──────────────────────────────────────────────────────────────────

const holderOf = (type, id, label, labels) => (type ? { type, id, label: labels?.get(`${type}:${id}`) || label || (id ? `#${id}` : '') } : null);

async function warehouseNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, name, kind, bins_enabled, allow_negative FROM wh_warehouses WHERE id = ANY($1::int[])`, [list]);
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, kind: row.kind, binsEnabled: row.bins_enabled, allowNegative: row.allow_negative }]));
}

export function docShape(ctx, row, { people = new Map(), warehouses = new Map(), labels = new Map(), lineCount = null } = {}) {
  const cost = costOn(ctx, docWarehouses(row));
  return {
    id: row.id,
    type: row.type,
    number: row.number,
    status: row.status,
    date: row.doc_date,
    warehouse: row.warehouse_id ? warehouses.get(row.warehouse_id) || { id: row.warehouse_id, name: '' } : null,
    toWarehouse: row.to_warehouse_id ? warehouses.get(row.to_warehouse_id) || { id: row.to_warehouse_id, name: '' } : null,
    from: holderOf(row.from_holder_type, row.from_holder_id, row.from_holder_label, labels),
    to: holderOf(row.to_holder_type, row.to_holder_id, row.to_holder_label, labels),
    supplier: row.supplier_name || row.supplier_company_id ? { companyId: row.supplier_company_id, name: row.supplier_name || '' } : null,
    currency: cost ? row.currency || ctx.settings.currency : null,
    rate: cost && row.rate !== null ? Number(row.rate) : null,
    reason: row.reason || null,
    reasonText: row.reason_text || '',
    comment: row.comment || '',
    base: row.base_doc_id ? { id: row.base_doc_id } : null,
    procurement: row.proc_request_id ? { id: row.proc_request_id, label: row.proc_request_label || '' } : null,
    deal: row.deal_id || row.deal_label ? { id: row.deal_id, label: row.deal_label || '' } : null,
    contract: row.contract_id || row.contract_label ? { id: row.contract_id, label: row.contract_label || '' } : null,
    returnBy: isoDayOf(row.return_by),
    sum: cost && row.total !== null ? Number(row.total) : null,
    transferState: row.transfer_state || null,
    signedAt: row.signed_at,
    signedName: row.signed_name || '',
    author: row.author_id ? people.get(row.author_id) || { id: row.author_id, name: '' } : null,
    postedBy: row.posted_by ? people.get(row.posted_by) || { id: row.posted_by, name: '' } : null,
    createdAt: row.created_at,
    requestedAt: row.requested_at,
    shippedAt: row.shipped_at,
    receivedAt: row.received_at,
    postedAt: row.posted_at,
    reversedAt: row.reversed_at,
    approval: row.approval_status ? { status: row.approval_status } : null,
    lines: lineCount,
    url: docUrl(row.id),
  };
}

async function hydrateDocs(ctx, rows) {
  const people = await usersByIds(rows.flatMap((row) => [row.author_id, row.posted_by]));
  const warehouses = await warehouseNames(rows.flatMap((row) => [row.warehouse_id, row.to_warehouse_id]));
  const labels = await holderLabels(rows.flatMap((row) => [{ holder_type: row.from_holder_type, holder_id: row.from_holder_id }, { holder_type: row.to_holder_type, holder_id: row.to_holder_id }]).filter((h) => h.holder_type));
  const ids = rows.map((row) => row.id);
  const counts = new Map();
  if (ids.length) {
    const { rows: c } = await query(`SELECT doc_id, COUNT(*)::int AS n FROM wh_doc_lines WHERE doc_id = ANY($1::int[]) GROUP BY doc_id`, [ids]);
    for (const row of c) counts.set(row.doc_id, row.n);
  }
  return rows.map((row) => docShape(ctx, row, { people, warehouses, labels, lineCount: counts.get(row.id) || 0 }));
}

/** Where a document takes goods from (hints): a warehouse or a holder. */
function sourceOf(row) {
  const def = DOC_TYPES[row.type] || {};
  if (row.type === 'transfer' && row.status === 'shipped') return { warehouseId: row.to_warehouse_id, transit: true };
  if (def.from === 'holder' || (row.type === 'writeoff' && row.from_holder_type)) return { holderType: row.from_holder_type, holderId: row.from_holder_id };
  if (def.from === 'warehouse' || def.from === 'delta') return { warehouseId: row.warehouse_id };
  return null;
}

async function linesShape(ctx, row, lines) {
  const itemIds = [...new Set(lines.map((line) => line.item_id).filter(Boolean))];
  const [{ rows: items }, { rows: bins }, { rows: batches }, { rows: instances }] = await Promise.all([
    itemIds.length ? query(`SELECT id, name, sku, base_unit, units, tracking, track_expiry, receipt_unit, issue_unit, archived_at FROM wh_items WHERE id = ANY($1::int[])`, [itemIds]) : { rows: [] },
    query(`SELECT id, path FROM wh_bins WHERE id = ANY($1::int[])`, [[...new Set(lines.flatMap((l) => [l.bin_id, l.to_bin_id]).filter(Boolean))]]),
    query(`SELECT id, number, expires_on FROM wh_batches WHERE id = ANY($1::int[])`, [[...new Set(lines.map((l) => l.batch_id).filter(Boolean))]]),
    query(`SELECT id, inventory_no, serial_no FROM wh_instances WHERE id = ANY($1::int[])`, [[...new Set(lines.map((l) => l.instance_id).filter(Boolean))]]),
  ]);
  const itemOf = new Map(items.map((i) => [i.id, i]));
  const binOf = new Map(bins.map((b) => [b.id, b.path]));
  const batchOf = new Map(batches.map((b) => [b.id, b]));
  const instanceOf = new Map(instances.map((i) => [i.id, i]));
  const source = EDITABLE.includes(row.status) || row.status === 'approved' || row.status === 'pending' ? sourceOf(row) : null;
  let hints = new Map();
  if (source && itemIds.length) {
    hints = source.warehouseId ? await stockHints(ctx, { warehouseId: source.warehouseId, itemIds }) : await stockHints(ctx, { holderType: source.holderType, holderId: source.holderId, itemIds });
  }
  // A line is short when the lines of its item together need more than is available (reserves taken by the line count).
  const need = new Map();
  const reserveIds = [...new Set(lines.map((l) => l.reserve_id).filter(Boolean))];
  const reserves = new Map();
  if (reserveIds.length) {
    const { rows: res } = await query(`SELECT id, qty, status, target_label FROM wh_reserves WHERE id = ANY($1::int[])`, [reserveIds]);
    for (const r of res) reserves.set(r.id, r);
  }
  for (const line of lines) {
    if (!line.item_id) continue;
    const reserved = line.reserve_id && reserves.get(line.reserve_id)?.status === 'active' ? Number(reserves.get(line.reserve_id).qty) : 0;
    need.set(line.item_id, q4((need.get(line.item_id) || 0) + Math.max(0, Number(line.base_qty) - reserved)));
  }
  const outgoing = ['issue', 'transfer', 'writeoff', 'supplier_return', 'return', 'handover'].includes(row.type) && row.status !== 'shipped';
  const cost = costOn(ctx, docWarehouses(row));
  return lines.map((line) => {
    const item = itemOf.get(line.item_id);
    const hint = hints.get(line.item_id) || (source && line.item_id ? { qty: 0, reserved: 0, available: 0 } : null);
    const batch = batchOf.get(line.batch_id);
    const instance = instanceOf.get(line.instance_id);
    return {
      id: line.id,
      sort: line.sort,
      item: item ? { id: item.id, name: item.name, sku: item.sku || '', baseUnit: item.base_unit, units: item.units || [], tracking: item.tracking, trackExpiry: item.track_expiry, receiptUnit: item.receipt_unit || item.base_unit, issueUnit: item.issue_unit || item.base_unit, archived: Boolean(item.archived_at) } : null,
      nameHint: line.name_hint || '',
      qty: q4(line.qty),
      unit: line.unit || item?.base_unit || '',
      factor: Number(line.factor),
      baseQty: q4(line.base_qty),
      price: cost && line.price !== null ? Number(line.price) : null,
      // Whether a price is set — shown to people who may not see it («цена указана»).
      priced: line.price !== null && line.price !== undefined,
      amount: cost && line.amount !== null ? Number(line.amount) : null,
      bin: line.bin_id ? { id: line.bin_id, path: binOf.get(line.bin_id) || '' } : null,
      toBin: line.to_bin_id ? { id: line.to_bin_id, path: binOf.get(line.to_bin_id) || '' } : null,
      batch: batch ? { id: batch.id, number: batch.number, expiresOn: isoDayOf(batch.expires_on) } : null,
      batchNumber: line.batch_number || '',
      expiresOn: isoDayOf(line.expires_on),
      instance: instance ? { id: instance.id, inventoryNo: instance.inventory_no, serialNo: instance.serial_no || '' } : null,
      serials: line.serials || null,
      reserve: line.reserve_id ? { id: line.reserve_id, label: reserves.get(line.reserve_id)?.target_label || '', active: reserves.get(line.reserve_id)?.status === 'active' } : null,
      bookQty: line.book_qty === null ? null : q4(line.book_qty),
      countedQty: line.counted_qty === null ? null : q4(line.counted_qty),
      receivedQty: line.received_qty === null ? null : q4(line.received_qty),
      procItemId: line.proc_item_id,
      note: line.note || '',
      hint,
      short: Boolean(outgoing && hint && line.item_id && (need.get(line.item_id) || 0) > Math.max(0, hint.available) + EPS),
    };
  });
}

/** Rights of the person on a document: { src, dst, isAuthor, isRecipient, isHolder }. */
function rolesOn(ctx, row) {
  const me = ctx.userId;
  return {
    src: row.warehouse_id ? ctx.rights(row.warehouse_id) : new Set(),
    dst: row.to_warehouse_id ? ctx.rights(row.to_warehouse_id) : row.type === 'issue' ? new Set() : new Set(),
    isAuthor: Boolean(me && (row.author_id === me || row.created_by === me)),
    isRecipient: Boolean(me && row.to_holder_type === 'employee' && row.to_holder_id === me),
    isHolder: Boolean(me && row.from_holder_type === 'employee' && row.from_holder_id === me),
  };
}

/** GET /documents/:id: the card. */
export async function getDoc(req, id) {
  const { ctx, row } = await visibleDoc(req, id);
  const [shape] = await hydrateDocs(ctx, [row]);
  const lines = await linesShape(ctx, row, await linesOf({ query }, row.id));
  const files = await filesOf('doc', row.id);
  const roles = rolesOn(ctx, row);
  const actions = docActions(row, roles);
  if (row.type === 'issue' && row.status === 'requested') actions.request = false;
  const base = row.base_doc_id ? (await query(`SELECT id, number, type FROM wh_docs WHERE id = $1`, [row.base_doc_id])).rows[0] : null;
  const { rows: derived } = await query(`SELECT id, number, type, status FROM wh_docs WHERE base_doc_id = $1 ORDER BY id`, [row.id]);
  const process = row.approval_status ? await getProcess(APPROVAL_TYPE, String(row.id), req).catch(() => null) : null;
  const backdate = row.warehouse_id || row.to_warehouse_id ? ctx.can('backdate', row.warehouse_id || row.to_warehouse_id) : false;
  // The act of an inventory session links back to it.
  const session = row.type === 'inventory' ? (await query(`SELECT id, number FROM wh_inv_sessions WHERE doc_id = $1 LIMIT 1`, [row.id])).rows[0] || null : null;
  const cost = costOn(ctx, docWarehouses(row));
  return {
    document: { ...shape, base: base ? { id: base.id, number: base.number, type: base.type } : null, derived: derived.map((d) => ({ id: d.id, number: d.number, type: d.type, status: d.status })), inventorySession: session ? { id: session.id, number: session.number, url: `/app/warehouse/inventory/${session.id}` } : null },
    lines,
    files,
    // The process may carry the document's sum (older processes stored it): hidden without cost rights here.
    approval: process && !cost ? { ...process, amount: null, currency: null } : process,
    my: { ...actions, backdate, cost, shortages: lines.some((line) => line.short) },
  };
}

export async function history(req, id) {
  const { ctx, row } = await visibleDoc(req, id);
  const { rows } = await query(`SELECT e.*, COALESCE(u.display_name, u.username) AS actor_name FROM wh_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.entity_type = 'doc' AND e.entity_id = $1 ORDER BY e.id`, [row.id]);
  // Events keep the posted sum (`total`): shown only to those who see sums on the document's warehouses.
  const cost = costOn(ctx, docWarehouses(row));
  const items = rows.map((e) => ({ id: `w${e.id}`, action: e.action, data: cost ? e.data : stripEventCost(e.data || {}), actor: e.actor_id ? { id: e.actor_id, name: e.actor_name } : null, at: e.created_at }));
  const process = row.approval_status ? await getProcess(APPROVAL_TYPE, String(row.id), req).catch(() => null) : null;
  for (const h of process?.history || []) items.push({ id: `a${h.at}${h.action}`, action: `approval.${h.action}`, data: { comment: h.comment || '', stage: h.stageName || '' }, actor: h.actor || null, at: h.at });
  items.sort((a, b) => new Date(a.at) - new Date(b.at));
  return items;
}

// ── Lists ───────────────────────────────────────────────────────────────────

/** Warehouses where the person may do `right` (null = all). */
function idsWith(ctx, right) {
  if (ctx.global.has(right) || ctx.global.has('admin')) return null;
  return [...new Set([...ctx.assignments.keys(), ...ctx.molOf])].filter((id) => ctx.can(right, id));
}

async function chipSql(ctx, chip, p, req) {
  const me = () => p.add(ctx.userId || 0);
  const inIds = (column, ids) => (ids === null ? 'TRUE' : `${column} = ANY(${p.add(ids)}::int[])`);
  switch (chip) {
    case 'my_drafts': {
      const m = me();
      return `(d.status IN ('draft', 'requested') AND (d.author_id = ${m} OR d.created_by = ${m}))`;
    }
    case 'awaiting_receipt':
      return `(d.type = 'transfer' AND d.status = 'shipped' AND ${inIds('d.to_warehouse_id', idsWith(ctx, 'operate'))})`;
    case 'awaiting_approval':
      return `(d.status = 'pending' AND d.type <> 'handover')`;
    case 'requests':
      return `(d.type = 'issue' AND d.status = 'requested' AND ${inIds('d.warehouse_id', idsWith(ctx, 'operate'))})`;
    case 'today': {
      const regional = await requestRegional(req);
      const start = startOfDay(new Date(), regional.timeZone);
      return `(d.doc_date >= ${p.add(start)} AND d.doc_date < ${p.add(new Date(start.getTime() + 86400000))})`;
    }
    case 'handovers': {
      const m = me();
      return `(d.type = 'handover' AND d.status = 'pending' AND ((d.to_holder_type = 'employee' AND d.to_holder_id = ${m}) OR (d.from_holder_type = 'employee' AND d.from_holder_id = ${m})))`;
    }
    default:
      return null;
  }
}

async function filterSql(ctx, input, p) {
  const where = [];
  const visible = docVisibleSql(ctx, p);
  if (visible) where.push(visible);
  const list = (value, allowed) => String(value || '').split(',').filter((v) => allowed.includes(v));
  const types = list(input.type, Object.keys(DOC_TYPES));
  if (types.length) where.push(`d.type = ANY(${p.add(types)}::text[])`);
  const statuses = list(input.status, STATUSES);
  if (statuses.length) where.push(`d.status = ANY(${p.add(statuses)}::text[])`);
  const wh = intOrNull(input.warehouse);
  if (wh) where.push(`(d.warehouse_id = ${p.add(wh)} OR d.to_warehouse_id = ${p.add(wh)})`);
  if (HOLDER_TYPES.includes(input.holderType) && intOrNull(input.holderId)) {
    const t = p.add(input.holderType);
    const i = p.add(intOrNull(input.holderId));
    where.push(`((d.to_holder_type = ${t} AND d.to_holder_id = ${i}) OR (d.from_holder_type = ${t} AND d.from_holder_id = ${i}))`);
  }
  const proc = intOrNull(input.procurement);
  if (proc) where.push(`d.proc_request_id = ${p.add(proc)}`);
  const from = day(input.from);
  if (from) where.push(`d.doc_date >= ${p.add(from)}::date`);
  const to = day(input.to);
  if (to) where.push(`d.doc_date < (${p.add(to)}::date + 1)`);
  if (input.q) {
    const q = p.add(`%${String(input.q).trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(d.number ILIKE ${q} OR d.supplier_name ILIKE ${q} OR d.to_holder_label ILIKE ${q} OR d.from_holder_label ILIKE ${q} OR d.comment ILIKE ${q} OR d.proc_request_label ILIKE ${q}
      OR EXISTS (SELECT 1 FROM wh_doc_lines l JOIN wh_items i ON i.id = l.item_id WHERE l.doc_id = d.id AND (i.name ILIKE ${q} OR i.sku ILIKE ${q})))`);
  }
  return where;
}

export async function listDocs(req, input = {}) {
  const ctx = await whContext(req);
  const p = new Params();
  const where = await filterSql(ctx, input, p);
  if (DOC_CHIPS.includes(input.chip)) where.push(await chipSql(ctx, input.chip, p, req));
  const pageSize = Math.min(200, Math.max(1, Number(input.pageSize) || 50));
  const page = Math.max(1, Number(input.page) || 1);
  const sql = `FROM wh_docs d LEFT JOIN approval_processes ap ON ap.type = '${APPROVAL_TYPE}' AND ap.doc_id = d.id::text ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const [{ rows }, { rows: count }] = await Promise.all([
    query(`SELECT d.*, ap.status AS approval_status ${sql} ORDER BY d.doc_date DESC, d.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, p.values),
    query(`SELECT COUNT(*)::int AS n ${sql}`, p.values),
  ]);
  return { items: await hydrateDocs(ctx, rows), total: count[0].n, page, pageSize };
}

export async function docCounters(req, input = {}) {
  const ctx = await whContext(req);
  const out = {};
  for (const chip of ['all', ...DOC_CHIPS]) {
    const p = new Params();
    const where = await filterSql(ctx, { ...input, chip: undefined }, p);
    if (chip !== 'all') where.push(await chipSql(ctx, chip, p, req));
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM wh_docs d ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, p.values);
    out[chip] = rows[0].n;
  }
  return out;
}

// ── Header and lines ────────────────────────────────────────────────────────

async function assertWarehouse(id, field) {
  const n = intOrNull(id);
  if (!n) return null;
  const { rows } = await query(`SELECT id, archived_at FROM wh_warehouses WHERE id = $1`, [n]);
  if (!rows[0] || rows[0].archived_at) throw httpError(400, 'Unknown warehouse', 'BAD_WAREHOUSE', { field });
  return n;
}

/** The label of a holder, checked: a person, a Masterplan object or project. */
async function holderLabel(type, id) {
  if (!type) return null;
  if (!HOLDER_TYPES.includes(type) || !intOrNull(id)) throw httpError(400, 'Choose who receives the goods', 'BAD_HOLDER');
  const labels = await holderLabels([{ holder_type: type, holder_id: Number(id) }]);
  const label = labels.get(`${type}:${Number(id)}`);
  if (!label) throw httpError(400, 'Unknown recipient', 'BAD_HOLDER');
  return label;
}

/** Checks a document date: in the open period; earlier than today only with `backdate`. */
async function checkDate(ctx, req, value, warehouseId) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(400, 'Invalid date', 'BAD_DATE');
  if (date.getTime() > Date.now() + 5 * 60 * 1000) throw httpError(400, 'A document cannot be dated in the future', 'FUTURE_DATE');
  const regional = await requestRegional(req);
  const today = startOfDay(new Date(), regional.timeZone);
  if (date < today && !ctx.can('backdate', warehouseId)) throw httpError(403, 'Backdated documents need the «backdate» right', 'BACKDATE_FORBIDDEN');
  return date;
}

/** The closed period is a calendar day in the portal's time zone (not UTC: a document at 01:00 local stays in its day). */
async function assertOpenPeriod(settings, date) {
  if (!settings.closedUntil || !date) return;
  const d = isoDay(new Date(date), (await portalRegional()).timeZone);
  if (d <= settings.closedUntil) throw httpError(409, `The period up to ${settings.closedUntil} is closed`, 'PERIOD_CLOSED', { closedUntil: settings.closedUntil });
}

async function cleanHeader(ctx, req, type, input, current = {}) {
  const out = {};
  const has = (key) => input[key] !== undefined;
  const def = DOC_TYPES[type];
  if (has('warehouseId')) out.warehouse_id = await assertWarehouse(input.warehouseId, 'warehouseId');
  if (has('toWarehouseId')) out.to_warehouse_id = await assertWarehouse(input.toWarehouseId, 'toWarehouseId');
  for (const side of ['from', 'to']) {
    const typeKey = `${side}HolderType`;
    const idKey = `${side}HolderId`;
    if (!has(typeKey) && !has(idKey)) continue;
    const holderType = input[typeKey] ?? current[`${side}_holder_type`] ?? null;
    const holderId = input[idKey] ?? current[`${side}_holder_id`] ?? null;
    if (!holderType) {
      out[`${side}_holder_type`] = null;
      out[`${side}_holder_id`] = null;
      out[`${side}_holder_label`] = null;
      continue;
    }
    out[`${side}_holder_label`] = await holderLabel(holderType, holderId);
    out[`${side}_holder_type`] = holderType;
    out[`${side}_holder_id`] = Number(holderId);
  }
  if (has('supplierCompanyId')) out.supplier_company_id = intOrNull(input.supplierCompanyId);
  if (has('supplierName')) out.supplier_name = text(input.supplierName, 300);
  if (has('currency')) {
    const code = String(input.currency || '').toUpperCase();
    if (code && !(ctx.settings.currencies || []).includes(code)) throw httpError(400, 'Currency is not allowed', 'CURRENCY');
    out.currency = code || null;
  }
  if (has('rate')) {
    const n = num(input.rate);
    out.rate = n && n > 0 ? n : null;
  }
  if (has('reason')) {
    if (input.reason && !WRITEOFF_REASONS.includes(input.reason)) throw httpError(400, 'Unknown reason', 'BAD_REASON');
    out.reason = input.reason || null;
  }
  if (has('reasonText')) out.reason_text = text(input.reasonText, 1000);
  if (has('comment')) out.comment = text(input.comment, 2000);
  for (const [key, max] of [['dealLabel', 300], ['contractLabel', 300]]) if (has(key)) out[key === 'dealLabel' ? 'deal_label' : 'contract_label'] = text(input[key], max);
  if (has('dealId')) out.deal_id = intOrNull(input.dealId);
  if (has('contractId')) out.contract_id = intOrNull(input.contractId);
  if (has('returnBy')) {
    const value = input.returnBy ? day(input.returnBy) : null;
    if (input.returnBy && !value) throw httpError(400, 'Invalid date', 'BAD_DATE');
    out.return_by = value;
  }
  if (has('date')) {
    const wid = out.warehouse_id ?? current.warehouse_id ?? out.to_warehouse_id ?? current.to_warehouse_id;
    out.doc_date = input.date ? await checkDate(ctx, req, input.date, wid) : new Date();
    // A date chosen by the person stays; otherwise the document is dated when it is posted (postInClient).
    out.date_fixed = Boolean(input.date);
    await assertOpenPeriod(ctx.settings, out.doc_date);
  }
  // Shape rules per type.
  const merged = { ...current, ...out, type };
  if (def.from === 'warehouse' && has('warehouseId') && !merged.warehouse_id) throw httpError(400, 'Choose the warehouse', 'WAREHOUSE_REQUIRED');
  if (type === 'transfer' && merged.warehouse_id && merged.to_warehouse_id && merged.warehouse_id === merged.to_warehouse_id) throw httpError(400, 'Choose another destination warehouse', 'SAME_WAREHOUSE');
  return out;
}

/** May the person create (or edit) a document of this type on these warehouses? */
function assertCreate(ctx, type, doc) {
  const src = doc.warehouse_id;
  const dst = doc.to_warehouse_id;
  const me = ctx.userId;
  const ok = {
    receipt: dst && ctx.can('operate', dst),
    opening: dst && ctx.can('admin', dst),
    supplier_return: src && ctx.can('operate', src),
    transfer: src && ctx.can('operate', src),
    issue: src && (ctx.can('request', src) || ctx.can('operate', src)),
    return: (dst && ctx.can('operate', dst)) || (doc.from_holder_type === 'employee' && doc.from_holder_id === me),
    writeoff: src && ctx.can('writeoff', src),
    correction: src && ctx.can('admin', src),
    inventory: src && ctx.can('inventory', src),
    handover: doc.from_holder_type === 'employee' && doc.from_holder_id === me && doc.to_holder_type === 'employee',
  }[type];
  if (!ok) throw httpError(403, 'You cannot create this document on this warehouse', 'FORBIDDEN', { type });
}

async function itemRows(ids) {
  if (!ids.length) return new Map();
  const { rows } = await query(`SELECT * FROM wh_items WHERE id = ANY($1::int[])`, [ids]);
  return new Map(rows.map((row) => [row.id, row]));
}

/** One line from input, checked against the item and the document. */
async function cleanLine(raw, doc, item, { keep = null, ctx } = {}) {
  const type = doc.type;
  if (!item && !raw.nameHint) throw httpError(400, 'Choose the item', 'LINE_ITEM_REQUIRED');
  if (item?.archived_at && !keep) throw httpError(400, `«${item.name}» is archived`, 'ITEM_ARCHIVED', { itemId: item.id });
  if (item?.kind === 'service') throw httpError(400, `«${item.name}» is a service and has no stock`, 'ITEM_SERVICE', { itemId: item.id });
  const defaultUnit = item ? (['receipt', 'opening'].includes(type) ? item.receipt_unit : ['issue', 'transfer'].includes(type) ? item.issue_unit : null) || item.base_unit : raw.unit || '';
  const unit = String(raw.unit || defaultUnit).slice(0, 16);
  const factor = item ? unitFactor(item, unit) : 1;
  if (!factor) throw httpError(400, `Unknown unit «${unit}» for ${item.name}`, 'BAD_UNIT', { itemId: item.id });
  let qty = num(raw.qty);
  if (qty === null) qty = type === 'inventory' ? 0 : 1;
  if (type !== 'correction' && qty < 0) throw httpError(400, 'The quantity cannot be negative', 'BAD_QTY');
  if (Math.abs(qty) > 1e9) throw httpError(400, 'The quantity is too large', 'BAD_QTY');
  const baseQty = q4(qty * factor);
  if (item?.tracking === 'serial' && Math.abs(baseQty - Math.round(baseQty)) > EPS) throw httpError(400, `${item.name}: count serial items in whole pieces`, 'SERIAL_WHOLE', { itemId: item.id });
  let price = raw.price === undefined ? keep?.price ?? null : num(raw.price);
  // People without warehouse.cost never see prices: a price they type from the invoice is
  // accepted (write-only), and a line they send back without one keeps what is stored.
  if (!ctx.costAny && (raw.price === undefined || raw.price === null || raw.price === '')) price = keep ? keep.price : null;
  if (price !== null && (price < 0 || price > 1e12)) throw httpError(400, 'Invalid price', 'BAD_PRICE');
  const binIds = [intOrNull(raw.binId), intOrNull(raw.toBinId)];
  const binWarehouse = [doc.warehouse_id, ['receipt', 'opening', 'return', 'transfer'].includes(type) ? doc.to_warehouse_id : doc.warehouse_id];
  for (let i = 0; i < 2; i += 1) {
    if (!binIds[i]) continue;
    const { rows } = await query(`SELECT warehouse_id FROM wh_bins WHERE id = $1`, [binIds[i]]);
    const allowed = i === 0 ? [doc.warehouse_id, doc.to_warehouse_id] : [binWarehouse[1]];
    if (!rows[0] || !allowed.includes(rows[0].warehouse_id)) throw httpError(400, 'The bin belongs to another warehouse', 'BAD_BIN');
  }
  const batchId = intOrNull(raw.batchId);
  if (batchId) {
    const { rows } = await query(`SELECT item_id FROM wh_batches WHERE id = $1`, [batchId]);
    if (!rows[0] || rows[0].item_id !== item?.id) throw httpError(400, 'The batch belongs to another item', 'BAD_BATCH');
  }
  const instanceId = intOrNull(raw.instanceId);
  if (instanceId) {
    const { rows } = await query(`SELECT item_id, state FROM wh_instances WHERE id = $1`, [instanceId]);
    if (!rows[0] || rows[0].item_id !== item?.id) throw httpError(400, 'The instance belongs to another item', 'BAD_INSTANCE');
    if (Math.abs(baseQty) > 1 + EPS) throw httpError(400, 'One instance is one piece', 'SERIAL_WHOLE');
  }
  const reserveId = intOrNull(raw.reserveId);
  if (reserveId) {
    const { rows } = await query(`SELECT item_id, warehouse_id, status FROM wh_reserves WHERE id = $1`, [reserveId]);
    if (!rows[0] || rows[0].item_id !== item?.id || rows[0].warehouse_id !== doc.warehouse_id) throw httpError(400, 'The reserve does not fit this line', 'BAD_RESERVE');
  }
  let serials = null;
  if (Array.isArray(raw.serials)) {
    serials = raw.serials.slice(0, 500).map((s) => ({ inventoryNo: text(s?.inventoryNo, 60) || '', serialNo: text(s?.serialNo, 120) || '', warrantyUntil: day(s?.warrantyUntil), nextServiceOn: day(s?.nextServiceOn) }));
  } else if (keep?.serials) serials = keep.serials;
  const counted = raw.countedQty === undefined ? keep?.counted_qty ?? null : num(raw.countedQty);
  return {
    item_id: item?.id || null,
    name_hint: text(raw.nameHint, 300) || keep?.name_hint || null,
    qty: q4(qty),
    unit,
    factor,
    base_qty: baseQty,
    price,
    bin_id: binIds[0],
    to_bin_id: binIds[1],
    batch_id: batchId,
    batch_number: text(raw.batchNumber, 80),
    expires_on: day(raw.expiresOn),
    instance_id: instanceId,
    serials: serials ? JSON.stringify(serials) : null,
    reserve_id: reserveId,
    counted_qty: counted === null ? null : q4(counted),
    proc_item_id: intOrNull(raw.procItemId) || keep?.proc_item_id || null,
    note: text(raw.note, 500),
  };
}

const LINE_COLUMNS = ['item_id', 'name_hint', 'qty', 'unit', 'factor', 'base_qty', 'price', 'bin_id', 'to_bin_id', 'batch_id', 'batch_number', 'expires_on', 'instance_id', 'serials', 'reserve_id', 'counted_qty', 'proc_item_id', 'note'];

async function insertLine(client, docId, sort, values) {
  const { rows } = await client.query(
    `INSERT INTO wh_doc_lines (doc_id, sort, ${LINE_COLUMNS.join(', ')}) VALUES ($1, $2, ${LINE_COLUMNS.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING id`,
    [docId, sort, ...LINE_COLUMNS.map((key) => values[key] ?? null)]
  );
  return rows[0].id;
}

async function replaceLines(client, ctx, doc, list) {
  const existing = new Map((await linesOf(client, doc.id)).map((line) => [line.id, line]));
  const items = await itemRows([...new Set(list.map((raw) => intOrNull(raw?.itemId)).filter(Boolean))]);
  const clean = [];
  for (const raw of list.slice(0, 500)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = items.get(intOrNull(raw.itemId)) || null;
    if (raw.itemId && !item) throw httpError(400, 'Unknown item', 'BAD_ITEM');
    const keep = raw.id ? existing.get(Number(raw.id)) || null : null;
    clean.push(await cleanLine(raw, doc, item, { keep, ctx }));
  }
  await client.query(`DELETE FROM wh_doc_lines WHERE doc_id = $1`, [doc.id]);
  for (const [index, values] of clean.entries()) await insertLine(client, doc.id, index, values);
}

/** Lines of a hand-over created by the tools screen (the same checks as any line). */
export const insertHandoverLines = (client, ctx, doc, lines) => replaceLines(client, ctx, doc, lines);

// ── Create / update / delete ────────────────────────────────────────────────

/** POST /documents: a new draft { type, …header, lines? }. */
export async function createDoc(req, input = {}, { client: outer = null, system = false } = {}) {
  const ctx = await whContext(req);
  const type = input.type;
  if (!USER_TYPES.includes(type) && !(system && DOC_TYPES[type])) throw httpError(400, 'Unknown document type', 'BAD_TYPE');
  const header = await cleanHeader(ctx, req, type, { date: input.date || null, ...input }, {});
  if (!header.doc_date) header.doc_date = new Date();
  // Defaults: a handover is from me; a receipt is in the base currency.
  if (type === 'handover' && !header.from_holder_type) Object.assign(header, { from_holder_type: 'employee', from_holder_id: ctx.userId, from_holder_label: await holderLabel('employee', ctx.userId) });
  if (DOC_TYPES[type].priced && !header.currency) header.currency = ctx.settings.currency;
  if (header.currency && header.currency !== ctx.settings.currency && !header.rate) header.rate = rateOf(header.currency, ctx.settings);
  if (!system) assertCreate(ctx, type, header);
  const run = async (client) => {
    const { seq, number } = await nextNumber(client, type, ctx.settings);
    const columns = { ...header, type, seq, number, status: 'draft', author_id: ctx.userId, created_by: ctx.userId, transfer_state: type === 'transfer' ? 'draft' : null, base_doc_id: intOrNull(input.baseDocId), proc_request_id: intOrNull(input.procRequestId), proc_request_label: text(input.procRequestLabel, 300) };
    const keys = Object.keys(columns);
    const { rows } = await client.query(`INSERT INTO wh_docs (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, keys.map((key) => columns[key]));
    const doc = rows[0];
    if (Array.isArray(input.lines)) await replaceLines(client, ctx, doc, input.lines);
    await logEvent(client, 'doc', doc.id, ctx.userId, 'created', { number });
    return doc;
  };
  const doc = outer ? await run(outer) : await withTransaction(run);
  if (outer) return doc;
  return getDoc(req, doc.id);
}

async function editableDoc(req, id) {
  const { ctx, row } = await visibleDoc(req, id);
  if (!EDITABLE.includes(row.status)) throw httpError(409, 'Only drafts can be changed', 'LOCKED', { status: row.status });
  const roles = rolesOn(ctx, row);
  if (!docActions(row, roles).edit) throw httpError(403, 'You cannot change this document', 'FORBIDDEN');
  return { ctx, row };
}

/** PUT /documents/:id: header fields and, when given, the whole list of lines. */
export async function updateDoc(req, id, input = {}) {
  const { ctx, row } = await editableDoc(req, id);
  const header = await cleanHeader(ctx, req, row.type, input, row);
  const merged = { ...row, ...header };
  if (Object.keys(header).some((key) => ['warehouse_id', 'to_warehouse_id', 'from_holder_type', 'from_holder_id', 'to_holder_type'].includes(key))) assertCreate(ctx, row.type, merged);
  if (merged.currency && merged.currency !== ctx.settings.currency && !merged.rate) header.rate = rateOf(merged.currency, ctx.settings);
  await withTransaction(async (client) => {
    const current = await lockDoc(client, row.id);
    if (!EDITABLE.includes(current.status)) throw httpError(409, 'The document has changed, reload it', 'STALE');
    const keys = Object.keys(header);
    if (keys.length) await client.query(`UPDATE wh_docs SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [row.id, ...keys.map((key) => header[key])]);
    if (Array.isArray(input.lines)) await replaceLines(client, ctx, merged, input.lines);
  });
  return getDoc(req, row.id);
}

/**
 * POST /documents/:id/lines — one line, incrementally (the scanner and the
 * mobile mode): { code? | itemId, qty (default 1), unit?, batchId?,
 * instanceId?, binId?, toBinId?, … }. A scan of the same item (same unit,
 * batch, bin) adds to its line; an instance cannot be added twice.
 */
export async function addLine(req, id, input = {}) {
  const { ctx, row } = await editableDoc(req, id);
  let raw = { ...input };
  if (input.code && !input.itemId) {
    const { resolveCode } = await import('./items.js');
    const found = await resolveCode(req, input.code, { warehouse: row.warehouse_id || row.to_warehouse_id, checkAccess: false });
    if (!found.item) throw httpError(400, 'This code is not an item', 'NOT_AN_ITEM', { kind: found.kind });
    raw = { ...raw, itemId: found.item.id, unit: input.unit || found.unit, batchId: input.batchId || found.batch?.id, instanceId: input.instanceId || found.instance?.id };
    if (found.unit !== found.item.baseUnit && input.qty === undefined) raw.qty = 1;
  }
  const items = await itemRows([intOrNull(raw.itemId)].filter(Boolean));
  const item = items.get(intOrNull(raw.itemId));
  if (!item) throw httpError(400, 'Unknown item', 'BAD_ITEM');
  const values = await cleanLine(raw, row, item, { ctx });
  const lineId = await withTransaction(async (client) => {
    const current = await lockDoc(client, row.id);
    if (!EDITABLE.includes(current.status)) throw httpError(409, 'The document has changed, reload it', 'STALE');
    const lines = await linesOf(client, row.id);
    if (values.instance_id && lines.some((line) => line.instance_id === values.instance_id)) throw httpError(409, 'This instance is already in the document', 'DUPLICATE_INSTANCE');
    const same = !values.instance_id && !values.serials && lines.find((line) => line.item_id === values.item_id && line.unit === values.unit && (line.batch_id || null) === (values.batch_id || null) && (line.bin_id || null) === (values.bin_id || null) && (line.to_bin_id || null) === (values.to_bin_id || null) && !line.instance_id && (line.reserve_id || null) === (values.reserve_id || null));
    if (same && input.merge !== false) {
      const qty = q4(Number(same.qty) + values.qty);
      await client.query(`UPDATE wh_doc_lines SET qty = $2, base_qty = $3, price = COALESCE($4, price) WHERE id = $1`, [same.id, qty, q4(qty * Number(same.factor)), values.price]);
      return same.id;
    }
    return insertLine(client, row.id, lines.length, values);
  });
  return { lineId, ...(await getDoc(req, row.id)) };
}

export async function updateLine(req, id, lineId, input = {}) {
  const { ctx, row } = await editableDoc(req, id);
  const { rows } = await query(`SELECT * FROM wh_doc_lines WHERE id = $1 AND doc_id = $2`, [intOrNull(lineId) || 0, row.id]);
  const keep = rows[0];
  if (!keep) throw httpError(404, 'Line not found', 'NOT_FOUND');
  const itemId = intOrNull(input.itemId) || keep.item_id;
  const item = (await itemRows([itemId].filter(Boolean))).get(itemId) || null;
  const merged = {
    itemId,
    nameHint: keep.name_hint,
    qty: keep.qty,
    unit: keep.unit,
    binId: keep.bin_id,
    toBinId: keep.to_bin_id,
    batchId: keep.batch_id,
    batchNumber: keep.batch_number,
    expiresOn: isoDayOf(keep.expires_on),
    instanceId: keep.instance_id,
    reserveId: keep.reserve_id,
    note: keep.note,
    ...input,
  };
  const values = await cleanLine(merged, row, item, { keep, ctx });
  await query(`UPDATE wh_doc_lines SET ${LINE_COLUMNS.map((key, i) => `${key} = $${i + 2}`).join(', ')} WHERE id = $1`, [keep.id, ...LINE_COLUMNS.map((key) => values[key] ?? null)]);
  return getDoc(req, row.id);
}

export async function deleteLine(req, id, lineId) {
  const { row } = await editableDoc(req, id);
  await query(`DELETE FROM wh_doc_lines WHERE id = $1 AND doc_id = $2`, [intOrNull(lineId) || 0, row.id]);
  return getDoc(req, row.id);
}

export async function deleteDoc(req, id) {
  const { ctx, row } = await editableDoc(req, id);
  if (!docActions(row, rolesOn(ctx, row)).delete) throw httpError(403, 'You cannot delete this document', 'FORBIDDEN');
  const { rows: files } = await query(`SELECT storage_key FROM wh_files WHERE owner_type = 'doc' AND owner_id = $1`, [row.id]);
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM wh_files WHERE owner_type = 'doc' AND owner_id = $1`, [row.id]);
    await client.query(`DELETE FROM wh_docs WHERE id = $1 AND status = ANY($2::text[])`, [row.id, EDITABLE]);
  });
  const { removeBlob } = await import('../shared/storage.js');
  for (const file of files) await removeBlob(file.storage_key);
  webhook('warehouse.document.deleted', row, ctx.userId);
}

// ── Posting ─────────────────────────────────────────────────────────────────

function assertReady(row) {
  const def = DOC_TYPES[row.type];
  if (def.reasonRequired && !row.reason && !row.reason_text) throw httpError(400, 'Give the reason', 'REASON_REQUIRED');
  if (def.to === 'warehouse' && !row.to_warehouse_id) throw httpError(400, 'Choose the warehouse that receives', 'WAREHOUSE_REQUIRED');
  if ((def.from === 'warehouse' || def.from === 'delta') && !row.warehouse_id && !(row.type === 'writeoff' && row.from_holder_type)) throw httpError(400, 'Choose the warehouse', 'WAREHOUSE_REQUIRED');
  if (def.to === 'holder' && !row.to_holder_type) throw httpError(400, 'Choose who receives the goods', 'HOLDER_REQUIRED');
  if (def.from === 'holder' && !row.from_holder_type) throw httpError(400, 'Choose who returns the goods', 'HOLDER_REQUIRED');
}

/**
 * Posts a loaded, locked document in `client` (also used by the approval
 * callback). Writes the status and the event; side effects run after commit.
 */
export async function postInClient(client, row, { actorId, settings, mode = 'post' }) {
  await redateOnPost(client, row);
  await assertOpenPeriod(settings, row.doc_date);
  const result = await applyDocument(client, row, { mode, actorId, settings });
  await client.query(`UPDATE wh_docs SET status = 'posted', posted_at = NOW(), posted_by = $2, total = $3, updated_at = NOW() WHERE id = $1`, [row.id, actorId || null, result.total]);
  await logEvent(client, 'doc', row.id, actorId, 'posted', { total: result.total });
  return result;
}

/**
 * A draft whose date nobody chose is dated when it moves goods: an old draft
 * posted today must not put its movements into the day it was created.
 * Mutates `row` (the locked document) and the stored date.
 */
export async function redateOnPost(client, row) {
  if (row.date_fixed) return;
  const now = new Date();
  await client.query(`UPDATE wh_docs SET doc_date = $2 WHERE id = $1`, [row.id, now]);
  row.doc_date = now;
}

/** Estimates the value of a document by posting it and rolling back (exact, also checks the stock). */
async function estimate(client, row, settings, actorId) {
  await client.query('SAVEPOINT wh_estimate');
  try {
    const result = await applyDocument(client, row, { mode: 'post', actorId, settings });
    return ['inventory', 'correction'].includes(row.type) ? result.gross : result.total;
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT wh_estimate');
  }
}

/** POST /documents/:id/post — post, or send to approval when the sum is above the threshold. */
export async function postDoc(req, id, input = {}) {
  const { ctx, row } = await visibleDoc(req, id);
  if (row.type === 'transfer') throw httpError(409, 'A transfer is shipped, then received', 'USE_SHIP');
  if (row.type === 'handover') throw httpError(409, 'A hand-over is confirmed by the recipient', 'USE_CONFIRM');
  if (!['draft', 'requested', 'approved'].includes(row.status)) throw httpError(409, 'The document cannot be posted in this status', 'BAD_TRANSITION', { status: row.status });
  const roles = rolesOn(ctx, row);
  if (!docActions(row, roles).post) throw httpError(403, 'You cannot post this document', 'FORBIDDEN');
  assertReady(row);
  const settings = ctx.settings;
  const outcome = await withTransaction(async (client) => {
    const current = await lockDoc(client, row.id);
    if (current.status !== row.status) throw httpError(409, 'The document has changed, reload it', 'STALE');
    if (current.status !== 'approved' && (settings.approvalTypes || []).includes(current.type)) {
      const total = await estimate(client, current, settings, ctx.userId);
      if (needsApproval(current.type, total, settings)) {
        await client.query(`UPDATE wh_docs SET total = $2, updated_at = NOW() WHERE id = $1`, [current.id, total]);
        await logEvent(client, 'doc', current.id, ctx.userId, 'to_approval', { total });
        return { approval: true };
      }
    }
    await postInClient(client, current, { actorId: ctx.userId, settings });
    return { approval: false };
  });
  if (outcome.approval) {
    await startApproval(req, APPROVAL_TYPE, String(row.id), { comment: text(input.comment, 2000) || undefined, urgency: input.urgency });
  } else {
    afterPosted(row.id, ctx.userId).catch((err) => console.warn('[warehouse] after post:', err.message));
  }
  return getDoc(req, row.id);
}

/** POST /documents/:id/request — a requisition goes to the storekeepers (spec §9 warehouse.request). */
export async function requestDoc(req, id) {
  const { ctx, row } = await visibleDoc(req, id);
  if (row.type !== 'issue' || row.status !== 'draft') throw httpError(409, 'Only a draft requisition is sent', 'BAD_TRANSITION');
  if (!(row.author_id === ctx.userId || row.created_by === ctx.userId)) throw httpError(403, 'Only the author sends the requisition', 'FORBIDDEN');
  assertReady(row);
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM wh_doc_lines WHERE doc_id = $1`, [row.id]);
  if (!rows[0].n) throw httpError(400, 'Add at least one line', 'NO_LINES');
  await withTransaction(async (client) => {
    await client.query(`UPDATE wh_docs SET status = 'requested', requested_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'draft'`, [row.id]);
    await logEvent(client, 'doc', row.id, ctx.userId, 'requested');
  });
  const fresh = await loadDoc(row.id);
  const keepers = await warehouseKeepers(row.warehouse_id);
  const names = await warehouseNamesText([row.warehouse_id]);
  const actor = (await usersByIds([ctx.userId])).get(ctx.userId)?.name || '';
  notify({ userIds: keepers, kind: 'warehouse.requested', module: 'warehouse', link: docUrl(row.id), actorId: ctx.userId, render: warehouseMessage('requested', { doc: { number: fresh.number, lines: rows[0].n, recipient: fresh.to_holder_label }, warehouse: names.get(row.warehouse_id), actor }) }).catch(() => {});
  webhook('warehouse.document.requested', fresh, ctx.userId);
  return getDoc(req, row.id);
}

async function warehouseNamesText(ids) {
  const map = await warehouseNames(ids);
  return new Map([...map].map(([id, w]) => [id, w.name]));
}

/** POST /documents/:id/ship — a transfer leaves the source and is «в пути» (transit holder). */
export async function shipDoc(req, id) {
  const { ctx, row } = await visibleDoc(req, id);
  if (row.type !== 'transfer' || !EDITABLE.includes(row.status)) throw httpError(409, 'Only a draft transfer is shipped', 'BAD_TRANSITION');
  if (!docActions(row, rolesOn(ctx, row)).ship) throw httpError(403, 'Transfers are shipped by the storekeepers of the source warehouse', 'FORBIDDEN');
  if (!row.to_warehouse_id) throw httpError(400, 'Choose the destination warehouse', 'WAREHOUSE_REQUIRED');
  const settings = ctx.settings;
  await withTransaction(async (client) => {
    const current = await lockDoc(client, row.id);
    if (!EDITABLE.includes(current.status)) throw httpError(409, 'The document has changed, reload it', 'STALE');
    await redateOnPost(client, current);
    await assertOpenPeriod(settings, current.doc_date);
    const result = await applyDocument(client, current, { mode: 'ship', actorId: ctx.userId, settings });
    await client.query(`UPDATE wh_docs SET status = 'shipped', transfer_state = 'shipped', shipped_at = NOW(), shipped_by = $2, total = $3, updated_at = NOW() WHERE id = $1`, [row.id, ctx.userId, result.total]);
    await logEvent(client, 'doc', row.id, ctx.userId, 'shipped', { total: result.total });
  });
  const fresh = await loadDoc(row.id);
  const { rows: count } = await query(`SELECT COUNT(*)::int AS n FROM wh_doc_lines WHERE doc_id = $1`, [row.id]);
  const names = await warehouseNamesText([row.warehouse_id, row.to_warehouse_id]);
  const actor = (await usersByIds([ctx.userId])).get(ctx.userId)?.name || '';
  notify({ userIds: await warehouseKeepers(row.to_warehouse_id), kind: 'warehouse.transfer_incoming', module: 'warehouse', link: docUrl(row.id), actorId: ctx.userId, render: warehouseMessage('transferIncoming', { doc: { number: fresh.number, lines: count[0].n }, from: names.get(row.warehouse_id), to: names.get(row.to_warehouse_id), actor }) }).catch(() => {});
  webhook('warehouse.transfer.shipped', fresh, ctx.userId);
  lowStockCheck(row.id).catch(() => {});
  return getDoc(req, row.id);
}

/**
 * POST /documents/:id/receive { lines: [{ lineId, receivedQty, toBinId? }], comment? }
 * — the destination's MOL accepts with a quantity check. Differences become a
 * posted «акт расхождения» (type discrepancy) linked to the transfer.
 */
export async function receiveDoc(req, id, input = {}) {
  const { ctx, row } = await visibleDoc(req, id);
  if (row.type !== 'transfer' || row.status !== 'shipped') throw httpError(409, 'Only a shipped transfer is received', 'BAD_TRANSITION');
  if (!docActions(row, rolesOn(ctx, row)).receive) throw httpError(403, 'Transfers are accepted by the storekeepers of the destination', 'FORBIDDEN');
  const received = new Map();
  const bins = new Map();
  for (const raw of Array.isArray(input.lines) ? input.lines : []) {
    const lineId = intOrNull(raw?.lineId);
    if (!lineId) continue;
    // A line sent without `receivedQty` arrived as shipped; one sent with an empty value is a mistake, not «all».
    if (Object.prototype.hasOwnProperty.call(raw, 'receivedQty')) {
      const qty = num(raw.receivedQty);
      if (qty === null) throw httpError(400, 'Enter the received quantity of every line', 'QTY_REQUIRED', { lineId });
      if (qty < 0) throw httpError(400, 'The quantity cannot be negative', 'BAD_QTY');
      received.set(lineId, qty);
    }
    if (intOrNull(raw.toBinId)) bins.set(lineId, intOrNull(raw.toBinId));
  }
  const settings = ctx.settings;
  const result = await withTransaction(async (client) => {
    const current = await lockDoc(client, row.id);
    if (current.status !== 'shipped') throw httpError(409, 'The document has changed, reload it', 'STALE');
    for (const [lineId, binId] of bins) {
      const { rows } = await client.query(`SELECT 1 FROM wh_bins WHERE id = $1 AND warehouse_id = $2`, [binId, current.to_warehouse_id]);
      if (!rows.length) throw httpError(400, 'The bin belongs to another warehouse', 'BAD_BIN');
      await client.query(`UPDATE wh_doc_lines SET to_bin_id = $2 WHERE id = $1 AND doc_id = $3`, [lineId, binId, current.id]);
    }
    const now = new Date();
    const applied = await applyDocument(client, current, { mode: 'receive', actorId: ctx.userId, settings, received, movedAt: now });
    let act = null;
    if (applied.discrepancy.length) {
      act = await createDoc(req, { type: 'discrepancy', warehouseId: current.to_warehouse_id, comment: text(input.comment, 2000) || null, baseDocId: current.id }, { client, system: true });
      const { rows: lines } = await client.query(`SELECT * FROM wh_doc_lines WHERE doc_id = $1`, [current.id]);
      const lineOf = new Map(lines.map((line) => [line.id, line]));
      for (const [index, entry] of applied.discrepancy.entries()) {
        const line = lineOf.get(entry.lineId);
        entry.actLineId = await insertLine(client, act.id, index, { item_id: entry.itemId, qty: entry.diff, unit: (await itemRows([entry.itemId])).get(entry.itemId).base_unit, factor: 1, base_qty: entry.diff, batch_id: line.batch_id, instance_id: line.instance_id, note: `${current.number}` });
      }
      const total = await applyDiscrepancy(client, act, current, applied.discrepancy, { actorId: ctx.userId, movedAt: now });
      await client.query(`UPDATE wh_docs SET status = 'posted', posted_at = NOW(), posted_by = $2, total = $3, doc_date = $4 WHERE id = $1`, [act.id, ctx.userId, total, now]);
      await logEvent(client, 'doc', act.id, ctx.userId, 'posted', { total, transfer: current.number });
    }
    await client.query(`UPDATE wh_docs SET status = 'posted', transfer_state = 'received', received_at = $3, received_by = $2, posted_at = $3, posted_by = $2, updated_at = NOW() WHERE id = $1`, [current.id, ctx.userId, now]);
    await logEvent(client, 'doc', current.id, ctx.userId, 'received', { discrepancy: applied.discrepancy.map((d) => ({ itemId: d.itemId, diff: d.diff })), act: act?.number || null, comment: text(input.comment, 2000) });
    return { act, discrepancy: applied.discrepancy };
  });
  const fresh = await loadDoc(row.id);
  webhook('warehouse.transfer.received', fresh, ctx.userId, { discrepancy: result.discrepancy.map((d) => ({ itemId: d.itemId, diff: d.diff })), act: result.act ? { id: result.act.id, number: result.act.number } : null });
  webhook('warehouse.document.posted', fresh, ctx.userId);
  if (result.act) {
    const items = await itemRows(result.discrepancy.map((d) => d.itemId));
    const people = [...new Set([...(await warehouseKeepers(row.warehouse_id)), ...(await warehouseKeepers(row.to_warehouse_id)), row.shipped_by, row.author_id].filter(Boolean))];
    notify({ userIds: people, kind: 'warehouse.discrepancy', module: 'warehouse', link: docUrl(result.act.id), actorId: ctx.userId, render: warehouseMessage('discrepancy', { doc: { number: fresh.number }, act: result.act.number, rows: result.discrepancy.map((d) => ({ name: items.get(d.itemId)?.name, diff: d.diff, unit: items.get(d.itemId)?.base_unit })) }) }).catch(() => {});
    const act = await loadDoc(result.act.id);
    webhook('warehouse.discrepancy', act, ctx.userId, { transfer: { id: fresh.id, number: fresh.number } });
  }
  return getDoc(req, row.id);
}

/** POST /documents/:id/storno { reason } — the opposite document (spec §5.1: nothing posted is deleted). */
export async function stornoDoc(req, id, input = {}) {
  const { ctx, row } = await visibleDoc(req, id);
  if (!docActions(row, rolesOn(ctx, row)).storno) throw httpError(403, 'You cannot reverse this document', 'FORBIDDEN');
  const reason = text(input.reason, 1000);
  if (!reason) throw httpError(400, 'Give the reason', 'REASON_REQUIRED');
  const settings = ctx.settings;
  const storno = await withTransaction(async (client) => {
    const current = await lockDoc(client, row.id);
    if (!['posted', 'shipped'].includes(current.status)) throw httpError(409, 'The document has changed, reload it', 'STALE');
    const now = new Date();
    await assertOpenPeriod(settings, now);
    // A received transfer's discrepancy act goes back with it.
    const acts = current.type === 'transfer' ? (await client.query(`SELECT * FROM wh_docs WHERE base_doc_id = $1 AND type = 'discrepancy' AND status = 'posted' FOR UPDATE`, [current.id])).rows : [];
    // Reversing changes the closed period's figures too: a document (or its act) dated there stays.
    for (const base of [current, ...acts]) await assertOpenPeriod(settings, base.doc_date);
    const made = [];
    for (const base of [...acts, current]) {
      const doc = await createDoc(req, { type: 'storno', warehouseId: base.warehouse_id, toWarehouseId: base.to_warehouse_id, reasonText: reason, baseDocId: base.id }, { client, system: true });
      const total = await applyStorno(client, doc, base, { actorId: ctx.userId, movedAt: now });
      await client.query(`UPDATE wh_docs SET status = 'posted', posted_at = NOW(), posted_by = $2, total = $3 WHERE id = $1`, [doc.id, ctx.userId, total]);
      await client.query(`UPDATE wh_docs SET status = 'reversed', reversed_at = NOW(), reversed_by = $2, updated_at = NOW() WHERE id = $1`, [base.id, ctx.userId]);
      await logEvent(client, 'doc', base.id, ctx.userId, 'reversed', { storno: doc.number, reason });
      await logEvent(client, 'doc', doc.id, ctx.userId, 'posted', { base: base.number, reason });
      made.push(doc);
    }
    return made[made.length - 1];
  });
  const fresh = await loadDoc(row.id);
  webhook('warehouse.document.reversed', fresh, ctx.userId, { storno: { id: storno.id, number: storno.number }, reason });
  // A reversed receipt «from a purchase request» takes its delivery mark back (Procurement may be off: then nothing).
  if (fresh.type === 'receipt' && fresh.proc_request_id) {
    const { revertProcurementDelivery } = await import('./procurement.js');
    await revertProcurementDelivery(fresh, ctx.userId).catch((err) => console.warn('[warehouse] procurement delivery revert failed:', err.message));
  }
  return getDoc(req, storno.id);
}

/** POST /documents/:id/confirm — the recipient confirms a hand-over of tools (spec §4.2). */
export async function confirmHandover(req, id) {
  const { ctx, row } = await visibleDoc(req, id);
  if (row.type !== 'handover' || row.status !== 'pending') throw httpError(409, 'Nothing to confirm', 'BAD_TRANSITION');
  if (!(row.to_holder_type === 'employee' && row.to_holder_id === ctx.userId)) throw httpError(403, 'Only the recipient confirms', 'FORBIDDEN');
  await withTransaction(async (client) => {
    const current = await lockDoc(client, row.id);
    if (current.status !== 'pending') throw httpError(409, 'The document has changed, reload it', 'STALE');
    await postInClient(client, current, { actorId: ctx.userId, settings: ctx.settings });
    await logEvent(client, 'doc', row.id, ctx.userId, 'confirmed');
  });
  const fresh = await loadDoc(row.id);
  const actor = (await usersByIds([ctx.userId])).get(ctx.userId)?.name || '';
  notify({ userIds: [row.from_holder_id], kind: 'warehouse.handover', module: 'warehouse', link: docUrl(row.id), actorId: ctx.userId, render: warehouseMessage('handoverDone', { doc: { number: fresh.number }, actor, accepted: true }) }).catch(() => {});
  webhook('warehouse.document.posted', fresh, ctx.userId);
  webhook('warehouse.tool.handover', fresh, ctx.userId, { accepted: true });
  return getDoc(req, row.id);
}

export async function declineHandover(req, id, input = {}) {
  const { ctx, row } = await visibleDoc(req, id);
  if (row.type !== 'handover' || !['pending', 'draft'].includes(row.status)) throw httpError(409, 'Nothing to decline', 'BAD_TRANSITION');
  const recipient = row.to_holder_type === 'employee' && row.to_holder_id === ctx.userId;
  const holder = row.from_holder_type === 'employee' && row.from_holder_id === ctx.userId;
  if (!recipient && !holder) throw httpError(403, 'Only the people of the hand-over decline it', 'FORBIDDEN');
  await withTransaction(async (client) => {
    // The recipient may have confirmed meanwhile: only a hand-over still waiting is cancelled.
    const current = await lockDoc(client, row.id);
    if (!current || !['pending', 'draft'].includes(current.status)) throw httpError(409, 'The document has changed, reload it', 'STALE');
    const { rowCount } = await client.query(`UPDATE wh_docs SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status IN ('pending', 'draft')`, [row.id]);
    if (!rowCount) throw httpError(409, 'The document has changed, reload it', 'STALE');
    await logEvent(client, 'doc', row.id, ctx.userId, recipient ? 'declined' : 'withdrawn', { comment: text(input.comment, 1000) });
  });
  if (recipient) {
    const actor = (await usersByIds([ctx.userId])).get(ctx.userId)?.name || '';
    notify({ userIds: [row.from_holder_id], kind: 'warehouse.handover', module: 'warehouse', link: docUrl(row.id), actorId: ctx.userId, render: warehouseMessage('handoverDone', { doc: { number: row.number }, actor, accepted: false }) }).catch(() => {});
  }
  return getDoc(req, row.id);
}

/** POST /documents/:id/signature { image: 'data:image/png;base64,…', name } — the recipient signs on the screen. */
export async function signDoc(req, id, input = {}) {
  const { ctx, row } = await visibleDoc(req, id);
  if (!docActions(row, rolesOn(ctx, row)).sign) throw httpError(403, 'You cannot sign this document', 'FORBIDDEN');
  const file = await storeSignature(row.id, input.image, ctx.userId);
  const name = text(input.name, 200) || row.to_holder_label || null;
  await withTransaction(async (client) => {
    await client.query(`UPDATE wh_docs SET signed_at = NOW(), signed_name = $2, updated_at = NOW() WHERE id = $1`, [row.id, name]);
    await logEvent(client, 'doc', row.id, ctx.userId, 'signed', { name, fileId: file.id });
  });
  return getDoc(req, row.id);
}

// ── After posting ───────────────────────────────────────────────────────────

/** Webhook payloads carry no sums: one payload goes to every webhook, and not all run-as people see costs. */
export function docPayload(row) {
  return {
    id: row.id,
    type: row.type,
    number: row.number,
    status: row.status,
    date: row.doc_date,
    warehouseId: row.warehouse_id,
    toWarehouseId: row.to_warehouse_id,
    from: row.from_holder_type ? { type: row.from_holder_type, id: row.from_holder_id, label: row.from_holder_label } : null,
    to: row.to_holder_type ? { type: row.to_holder_type, id: row.to_holder_id, label: row.to_holder_label } : null,
    supplier: row.supplier_name || null,
    procurementRequestId: row.proc_request_id || null,
    baseDocId: row.base_doc_id || null,
    transferState: row.transfer_state || null,
    postedAt: row.posted_at,
    url: docUrl(row.id),
  };
}

export function webhook(type, row, actorId, extra = {}) {
  if (!row) return;
  (async () => {
    const lines = (await query(`SELECT l.item_id, i.name, i.sku, l.qty, l.unit, l.base_qty, i.base_unit FROM wh_doc_lines l LEFT JOIN wh_items i ON i.id = l.item_id WHERE l.doc_id = $1 ORDER BY l.sort, l.id`, [row.id])).rows;
    const settings = await warehouseSettings();
    await emitEvent(type, {
      actorId,
      data: { document: { ...docPayload(row), lines: lines.map((l) => ({ itemId: l.item_id, name: l.name, sku: l.sku, qty: Number(l.qty), unit: l.unit, baseQty: Number(l.base_qty), baseUnit: l.base_unit })) }, ...extra },
      visible: async (hookReq) => canSeeDoc(await whContext(hookReq, settings), row).catch(() => false),
    });
  })().catch(() => {});
}

/** Items of a document that are now below their minimum: the warehouse.stock.low webhook (the digest notifies people daily). */
export async function lowStockCheck(docId) {
  const { rows } = await query(
    `SELECT DISTINCT n.item_id, n.warehouse_id, n.min_qty, i.name, i.sku, i.base_unit,
            (SELECT COALESCE(SUM(s.qty), 0) FROM wh_stock s WHERE s.item_id = n.item_id AND s.warehouse_id = n.warehouse_id AND s.holder_type = 'warehouse') AS qty
     FROM wh_moves m JOIN wh_norms n ON n.item_id = m.item_id AND n.warehouse_id = m.warehouse_id JOIN wh_items i ON i.id = n.item_id
     WHERE m.doc_id = $1 AND m.qty < 0 AND m.holder_type = 'warehouse' AND n.min_qty > 0`,
    [docId]
  );
  const settings = await warehouseSettings();
  for (const row of rows) {
    if (Number(row.qty) >= Number(row.min_qty)) continue;
    emitEvent('warehouse.stock.low', {
      data: { stock: { itemId: row.item_id, name: row.name, sku: row.sku, warehouseId: row.warehouse_id, qty: Number(row.qty), minQty: Number(row.min_qty), unit: row.base_unit } },
      visible: async (hookReq) => (await whContext(hookReq, settings)).sees(row.warehouse_id),
    }).catch(() => {});
  }
}

/** After a document is posted (commit done): webhooks, notifications, the procurement delivery mark. */
export async function afterPosted(docId, actorId) {
  const row = await loadDoc(docId);
  if (!row || row.status !== 'posted') return;
  webhook('warehouse.document.posted', row, actorId);
  lowStockCheck(row.id).catch(() => {});
  if (row.type === 'issue') {
    const names = await warehouseNamesText([row.warehouse_id]);
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM wh_doc_lines WHERE doc_id = $1`, [row.id]);
    const recipients = [row.author_id, row.to_holder_type === 'employee' ? row.to_holder_id : null].filter(Boolean);
    const actor = (await usersByIds([actorId])).get(actorId)?.name || '';
    notify({ userIds: recipients, kind: 'warehouse.issued', module: 'warehouse', link: docUrl(row.id), actorId, render: warehouseMessage('issued', { doc: { number: row.number, lines: rows[0].n, recipient: row.to_holder_label }, warehouse: names.get(row.warehouse_id), actor }) }).catch(() => {});
  }
  if (row.type === 'receipt' && row.proc_request_id) {
    const { markProcurementDelivery } = await import('./procurement.js');
    await markProcurementDelivery(row, actorId).catch((err) => console.warn('[warehouse] procurement delivery mark failed:', err.message));
  }
}
