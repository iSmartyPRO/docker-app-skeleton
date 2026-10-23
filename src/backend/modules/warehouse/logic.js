/*
 * Pure rules of the Warehouse module (no database): document types and
 * statuses, rights per warehouse, unit conversion, moving-average costing,
 * currencies, the approval threshold, numbering, cost hiding, scan codes.
 * Unit-tested in test/warehouse.test.js.
 */

export { csvCell, toCsv } from '../shared/csv.js';

export function httpError(statusCode, message, code, info) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (info) {
    error.info = info;
    // The error handler sends `details` to the client as `info`.
    error.details = info;
  }
  return error;
}

/** Quantities keep 4 decimals, money 2 — without float noise. */
export const q4 = (value) => Math.round(Number(value || 0) * 1e4) / 1e4;
export const cents = (value) => Math.round(Number(value || 0) * 100) / 100;
export const EPS = 1e-6;

/** A finite number from user input ("1 234,5" too) or null. */
export function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** A calendar day (YYYY-MM-DD) or null. */
export function day(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

export function addDays(dayText, n) {
  const [y, m, d] = String(dayText).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ── Documents ───────────────────────────────────────────────────────────────

export const STATUSES = ['draft', 'requested', 'pending', 'approved', 'shipped', 'posted', 'reversed', 'rejected', 'cancelled'];

/**
 * Document types (spec §5). `from` / `to` say where goods leave and arrive:
 *   warehouse  a warehouse (bins optional)      holder  an employee / object / project
 *   external   a supplier or the expense side   delta   +/- in place (corrections, inventory)
 */
export const DOC_TYPES = {
  receipt: { from: 'external', to: 'warehouse', priced: true },
  supplier_return: { from: 'warehouse', to: 'external' },
  transfer: { from: 'warehouse', to: 'warehouse', twoStep: true },
  issue: { from: 'warehouse', to: 'holder', requestable: true },
  return: { from: 'holder', to: 'warehouse' },
  writeoff: { from: 'warehouse', to: 'external', reasonRequired: true },
  opening: { from: 'external', to: 'warehouse', priced: true, admin: true },
  correction: { from: 'delta', to: 'delta', reasonRequired: true, admin: true },
  inventory: { from: 'delta', to: 'delta' },
  discrepancy: { from: 'delta', to: 'delta', system: true },
  handover: { from: 'holder', to: 'holder', confirm: true },
  storno: { from: 'delta', to: 'delta', system: true },
};
export const USER_TYPES = Object.keys(DOC_TYPES).filter((type) => !DOC_TYPES[type].system);
export const HOLDER_TYPES = ['employee', 'object', 'project'];
export const WRITEOFF_REASONS = ['used', 'defect', 'damage', 'shortage', 'expired', 'lost', 'other'];
export const WAREHOUSE_KINDS = ['main', 'site', 'transit', 'mobile'];
export const TRACKING = ['quantity', 'batch', 'serial'];
/** `lost`: an inventory count did not find the piece (its act took it off the books); found again → `ok`. */
export const INSTANCE_STATES = ['ok', 'repair', 'written_off', 'lost'];
export const BIN_KINDS = ['zone', 'rack', 'shelf'];
export const FILE_KINDS = ['photo', 'waybill', 'act', 'signature', 'invoice', 'other'];
export const RESERVE_TARGETS = ['object', 'project', 'deal', 'request', 'employee', 'other'];

/** Where a document takes goods from: the warehouse whose rights apply. */
export function sourceWarehouse(doc) {
  const def = DOC_TYPES[doc.type] || {};
  if (def.from === 'warehouse' || def.from === 'delta') return doc.warehouse_id ?? doc.warehouseId ?? null;
  return null;
}

/** The warehouse a document mainly belongs to (rights, cost visibility, numbering). */
export function mainWarehouse(doc) {
  return doc.warehouse_id ?? doc.warehouseId ?? doc.to_warehouse_id ?? doc.toWarehouseId ?? null;
}

/** Every warehouse a document touches. */
export function docWarehouses(doc) {
  return [...new Set([doc.warehouse_id ?? doc.warehouseId, doc.to_warehouse_id ?? doc.toWarehouseId].filter((id) => id !== null && id !== undefined).map(Number))];
}

/** Does posting a document of this type and value need approval? `total` is in the base currency. */
export function needsApproval(type, totalBase, settings) {
  if (!(settings.approvalTypes || []).includes(type)) return false;
  const threshold = Number(settings.approvalThreshold);
  if (!Number.isFinite(threshold)) return false;
  return convertFromBase(Math.abs(Number(totalBase) || 0), settings.approvalThresholdCurrency || settings.currency, settings) > threshold + 0.004;
}

// ── Rights per warehouse (spec §9) ──────────────────────────────────────────

export const RIGHTS = ['view', 'request', 'operate', 'writeoff', 'inventory', 'cost', 'backdate', 'admin'];
/** The MOL of a warehouse may do the daily work there (not see sums or backdate). */
export const MOL_RIGHTS = ['view', 'request', 'operate', 'writeoff', 'inventory'];

/** Global rights from portal permissions (`warehouse.<right>`, `*`) and the module settings. */
export function globalRights(permissions = [], settings = {}) {
  const all = permissions.includes('*') || permissions.includes('warehouse.admin');
  const set = new Set(all ? RIGHTS : RIGHTS.filter((right) => permissions.includes(`warehouse.${right}`)));
  if (settings.everyoneCanView) {
    set.add('view');
    set.add('request');
  }
  // Rights to act include seeing.
  if (set.size) set.add('view');
  return set;
}

/**
 * Rights on one warehouse: global rights, plus assignments on that warehouse
 * (each lists rights), plus the MOL's rights. `admin` on a warehouse implies every right there.
 */
export function rightsOn({ global, assignments = new Map(), molOf = new Set() }, warehouseId) {
  const out = new Set(global);
  const id = Number(warehouseId);
  for (const right of assignments.get(id) || []) out.add(right);
  if (molOf.has(id)) for (const right of MOL_RIGHTS) out.add(right);
  if (out.has('admin')) for (const right of RIGHTS) out.add(right);
  if (out.size) out.add('view');
  return out;
}

// ── Units ───────────────────────────────────────────────────────────────────

/** Extra units of an item, cleaned: [{ code, factor }] (factor = base units in one). */
export function cleanUnits(list, baseUnit) {
  const out = [];
  const seen = new Set([String(baseUnit || '').toLowerCase()]);
  for (const raw of (Array.isArray(list) ? list : []).slice(0, 12)) {
    const code = String(raw?.code ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
    const factor = num(raw?.factor);
    if (!code || seen.has(code.toLowerCase()) || !(factor > 0) || factor > 1e7) continue;
    seen.add(code.toLowerCase());
    out.push({ code, factor: Math.round(factor * 1e6) / 1e6 });
  }
  return out;
}

/** Base units in one `unit` of the item (1 for the base unit); null when the unit is unknown. */
export function unitFactor(item, unit) {
  const base = item.base_unit ?? item.baseUnit;
  if (!unit || unit === base) return 1;
  const found = (item.units || []).find((entry) => entry.code === unit);
  return found ? Number(found.factor) : null;
}

/** «2 уп = 48 шт» parts. */
export function toBaseQty(qty, factor) {
  return q4(Number(qty) * Number(factor || 1));
}

/** A quantity in base units shown in the biggest whole unit: { qty, unit } (e.g. 48 шт → 2 уп). */
export function inBestUnit(item, baseQty) {
  const units = [...(item.units || [])].sort((a, b) => b.factor - a.factor);
  for (const unit of units) {
    const n = baseQty / unit.factor;
    if (n >= 1 && Math.abs(n - Math.round(n)) < EPS) return { qty: Math.round(n), unit: unit.code };
  }
  return { qty: q4(baseQty), unit: item.base_unit ?? item.baseUnit };
}

// ── Money ───────────────────────────────────────────────────────────────────

/** Units of `currency` per one base unit (1 for the base currency); null when unknown. */
export function rateOf(currency, settings) {
  if (!currency || currency === settings.currency) return 1;
  const rate = Number(settings.rates?.[currency]);
  return rate > 0 ? rate : null;
}

/** An amount in `currency` → base currency, with an explicit rate when the document has one. */
export function toBaseMoney(amount, currency, settings, rate = null) {
  const r = Number(rate) > 0 ? Number(rate) : rateOf(currency, settings);
  if (!r) throw httpError(400, `No exchange rate for ${currency}`, 'NO_RATE', { currency });
  return cents(Number(amount) / r);
}

export function convertFromBase(amountBase, currency, settings) {
  const r = rateOf(currency, settings) || 1;
  return cents(Number(amountBase) * r);
}

/**
 * Moving average (spec §5.2): the cost of `qty` taken out of a pool holding
 * `poolQty` worth `poolAmount`. Taking the whole pool takes its whole amount
 * (no rounding residue is left behind); an empty or negative pool uses the
 * last known average `fallback`.
 */
export function takeCost(qty, poolQty, poolAmount, fallback = 0) {
  const q = Number(qty);
  if (poolQty > EPS && q >= poolQty - EPS) return cents(poolAmount);
  if (poolQty > EPS) return cents((q * poolAmount) / poolQty);
  return cents(q * (Number(fallback) || 0));
}

/** Average cost after adding qty worth amount to a pool (for wh_costs). */
export function averageAfter(poolQty, poolAmount, addQty, addAmount, previous = 0) {
  const qty = poolQty + addQty;
  if (qty > EPS) return Math.round(((poolAmount + addAmount) / qty) * 1e6) / 1e6;
  return previous;
}

// ── Numbering ───────────────────────────────────────────────────────────────

export function formatNumber(prefix, seq, digits = 5) {
  const body = String(seq).padStart(Math.max(1, digits), '0');
  return prefix ? `${prefix}-${body}` : body;
}

// ── Scan codes ──────────────────────────────────────────────────────────────

/** Codes printed by the module on its own labels: WI-<item>, WB-<bin>, WT-<instance>, WW-<warehouse>. */
export function parseOwnCode(code) {
  const match = /^W([IBTW])-(\d{1,9})$/i.exec(String(code || '').trim());
  if (!match) return null;
  return { kind: { I: 'item', B: 'bin', T: 'instance', W: 'warehouse' }[match[1].toUpperCase()], id: Number(match[2]) };
}

export const ownCode = (kind, id) => `${{ item: 'WI', bin: 'WB', instance: 'WT', warehouse: 'WW' }[kind]}-${id}`;

/** EAN-13 check digit is right. */
export function validEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/** The kind of a barcode by its content. */
export function barcodeKind(code, hint) {
  if (['ean13', 'code128', 'qr', 'other'].includes(hint)) return hint;
  if (validEan13(code)) return 'ean13';
  return /^[\x20-\x7e]{1,48}$/.test(code) ? 'code128' : 'qr';
}

// ── Cost hiding (spec §5.2, §9: «суммы скрываются на сервере») ───────────────

/** Keys that carry money anywhere in the module's responses. */
export const COST_KEYS = new Set(['price', 'amount', 'sum', 'cost', 'unitCost', 'avgCost', 'lastPrice', 'planPrice', 'sumIn', 'sumOut', 'openingSum', 'closingSum', 'amountIn', 'amountOut', 'issuedSum', 'returnedSum', 'writtenOffSum', 'shortageSum', 'estimatedTotal', 'balanceSum', 'surplusSum', 'grossSum', 'netSum', 'currency', 'rate', 'totals']);

/**
 * Money inside history events (`data.total` of posted / shipped / sent to
 * approval). `total` is not in COST_KEYS because lists use it for the number
 * of rows (pagination); history strips it explicitly.
 */
export const EVENT_COST_KEYS = new Set(['total']);

/** Event data without sums: COST_KEYS and EVENT_COST_KEYS removed. */
export function stripEventCost(data) {
  const out = stripCost(data);
  if (out && typeof out === 'object' && !Array.isArray(out)) for (const key of EVENT_COST_KEYS) delete out[key];
  return out;
}

/** A deep copy without money keys (for people without warehouse.cost). */
export function stripCost(value) {
  if (Array.isArray(value)) return value.map(stripCost);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (COST_KEYS.has(key)) continue;
      out[key] = stripCost(inner);
    }
    return out;
  }
  return value;
}

// ── Lists ───────────────────────────────────────────────────────────────────

export const STOCK_CHIPS = ['below_min', 'out', 'expiring', 'reserved', 'stale', 'mine'];
export const DOC_CHIPS = ['my_drafts', 'awaiting_receipt', 'awaiting_approval', 'requests', 'today', 'handovers'];

/** Flags of one stock row (item × warehouse) for chips and colours. */
export function stockFlags(row, { today, staleDays = 90, expiryWarnDays = 30 } = {}) {
  const qty = Number(row.qty) || 0;
  const min = row.min_qty === null || row.min_qty === undefined ? null : Number(row.min_qty);
  const reserved = Number(row.reserved) || 0;
  const lastMove = row.last_move_at ? new Date(row.last_move_at) : null;
  const staleBefore = today ? new Date(`${addDays(today, -staleDays)}T00:00:00Z`) : null;
  const expires = row.next_expiry ? String(row.next_expiry).slice(0, 10) : null;
  return {
    belowMin: min !== null && min > 0 && qty < min - EPS,
    out: qty <= EPS,
    reserved: reserved > EPS,
    stale: Boolean(qty > EPS && lastMove && staleBefore && lastMove < staleBefore),
    expiring: Boolean(qty > EPS && expires && today && expires <= addDays(today, expiryWarnDays)),
    expired: Boolean(qty > EPS && expires && today && expires < today),
  };
}

/**
 * What a document line will take from the free stock: lines grouped by
 * item and source, reserves consumed by the line count against the reserve,
 * not against the free quantity. → [{ itemId, need, free, short }].
 */
export function shortages(needs, available) {
  const out = [];
  for (const need of needs) {
    const have = available.get(need.key) ?? 0;
    if (need.qty > have + EPS) out.push({ ...need, available: q4(Math.max(0, have)), short: q4(need.qty - Math.max(0, have)) });
  }
  return out;
}

/** Statuses a document may be edited in. */
export const EDITABLE = ['draft', 'requested'];

/**
 * The buttons of a document card, from its state and the person's rights on
 * its warehouses: { post, ship, receive, storno, request, confirm, decline, delete, edit, sign, cancel }.
 * `src` / `dst` are rights sets on the source / destination warehouse.
 */
export function docActions(doc, { src = new Set(), dst = new Set(), isAuthor = false, isRecipient = false, isHolder = false } = {}) {
  const def = DOC_TYPES[doc.type] || {};
  const status = doc.status;
  const out = {};
  const operateSrc = src.has('operate');
  const editable = EDITABLE.includes(status);
  const postRight = {
    receipt: dst.has('operate'),
    opening: dst.has('admin'),
    supplier_return: operateSrc,
    transfer: operateSrc,
    issue: operateSrc,
    return: dst.has('operate'),
    writeoff: src.has('writeoff'),
    correction: src.has('admin'),
    inventory: src.has('inventory'),
    handover: isHolder,
  }[doc.type];
  if (editable) {
    out.edit = Boolean(postRight || isAuthor);
    out.delete = Boolean(postRight || isAuthor);
    if (def.twoStep) out.ship = Boolean(postRight);
    else if (doc.type === 'handover') out.post = Boolean(isHolder);
    else out.post = Boolean(postRight);
    if (def.requestable && status === 'draft' && isAuthor && !postRight) out.request = true;
  }
  if (status === 'approved') out.post = Boolean(postRight);
  if (status === 'shipped') {
    out.receive = dst.has('operate');
    out.storno = operateSrc && !doc.received_at;
  }
  if (status === 'pending' && doc.type === 'handover') {
    out.confirm = Boolean(isRecipient);
    out.decline = Boolean(isRecipient || isHolder);
  }
  if (status === 'posted' && !def.system && doc.type !== 'transfer') {
    out.storno = Boolean(postRight || src.has('admin') || dst.has('admin'));
  }
  if (status === 'posted' && doc.type === 'transfer') out.storno = Boolean(src.has('admin') || dst.has('admin'));
  if (doc.type === 'issue' && ['draft', 'requested', 'posted'].includes(status)) out.sign = Boolean(operateSrc || isRecipient);
  return out;
}
