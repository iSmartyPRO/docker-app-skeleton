import { EPS, addDays, cents, q4 } from './logic.js';

/*
 * Pure rules of inventory sessions (spec §6, docs/warehouse.md#inventory-sessions):
 * statuses and the freeze, scope matching, counting operations from phones
 * (idempotent, applied in the order the device made them), aggregation of
 * several counters, reconciliation «учёт / факт / разница», the lines of the
 * one `inventory` act a session produces, schedules of regular partial counts.
 * No database here — unit-tested in test/warehouse-inventory.test.js.
 */

export const SESSION_STATUSES = ['draft', 'counting', 'review', 'finished', 'cancelled'];
export const FREEZE_POLICIES = ['block', 'record'];
export const AREA_STATUSES = ['todo', 'counting', 'done', 'recount'];
export const OP_KINDS = ['add', 'set', 'done', 'reopen'];

/** Statuses in which counts are accepted (review only for areas sent to recount). */
export const COUNTING = ['counting', 'review'];

/**
 * Does the session freeze its scope right now? While counting and under
 * review, and after «finish» until its act is posted (or rejected / cancelled).
 */
export function sessionFreezes(session, docStatus = null) {
  if (!session) return false;
  if (session.freeze_policy !== 'block' && session.freezePolicy !== 'block') return false;
  const status = session.status;
  if (status === 'counting' || status === 'review') return true;
  if (status === 'finished') return ['draft', 'pending', 'approved'].includes(docStatus);
  return false;
}

/**
 * Is a register place inside the session's scope? `binIds` / `categoryIds` are
 * already expanded to their subtrees; empty = everything. A bin scope never
 * covers stock without a bin.
 */
export function inScope(scope, { warehouseId, binId = null, categoryId = null }) {
  if (Number(scope.warehouseId ?? scope.warehouse_id) !== Number(warehouseId)) return false;
  const bins = scope.binIds ?? scope.bin_ids ?? [];
  const cats = scope.categoryIds ?? scope.category_ids ?? [];
  if (bins.length && !(binId && bins.map(Number).includes(Number(binId)))) return false;
  if (cats.length && !(categoryId && cats.map(Number).includes(Number(categoryId)))) return false;
  return true;
}

/**
 * The first frozen place among changed register rows, or null.
 * rows: [{ item_id, warehouse_id, bin_id, holder_type, dq }], categoryOf: Map(itemId → categoryId).
 */
export function frozenHit(sessions, rows, categoryOf = new Map()) {
  for (const row of rows) {
    if (row.holder_type !== 'warehouse' || Math.abs(Number(row.dq) || 0) < EPS) continue;
    for (const session of sessions) {
      if (inScope(session, { warehouseId: row.warehouse_id, binId: row.bin_id, categoryId: categoryOf.get(Number(row.item_id)) ?? null })) {
        return { session, itemId: Number(row.item_id), binId: row.bin_id || null };
      }
    }
  }
  return null;
}

/** A counter's quantity after one operation (base units, never below zero). */
export function applyCountOp(current, op) {
  const qty = Number(op.baseQty ?? op.qty);
  if (!Number.isFinite(qty)) return q4(current || 0);
  if (op.kind === 'set') return q4(Math.max(0, qty));
  if (op.kind === 'add') return q4(Math.max(0, Number(current || 0) + qty));
  return q4(current || 0);
}

/** A client operation, cleaned; null when it cannot be used. */
export function cleanOp(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clientId = String(raw.clientId ?? '').trim();
  if (!/^[A-Za-z0-9_.:-]{6,64}$/.test(clientId)) return null;
  const kind = OP_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!kind) return null;
  const int = (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null;
  };
  const out = { clientId, kind, binId: int(raw.binId), itemId: int(raw.itemId), instanceId: int(raw.instanceId), unit: raw.unit ? String(raw.unit).slice(0, 16) : null, recount: raw.recount === true, at: raw.at && !Number.isNaN(new Date(raw.at).getTime()) ? new Date(raw.at).toISOString() : null };
  if (kind === 'add' || kind === 'set') {
    const qty = Number(String(raw.qty ?? '').replace(',', '.'));
    if (!out.itemId || !Number.isFinite(qty) || Math.abs(qty) > 1e9) return null;
    if (kind === 'set' && qty < 0) return null;
    out.qty = qty;
  }
  return out;
}

const keyOf = (binId, itemId, instanceId = null) => `${binId || 0}|${itemId}|${instanceId || 0}`;
export const countKey = keyOf;

/**
 * Reconciliation (spec §6.3). Inputs:
 *   book    [{ bin_id, item_id, instance_id, qty }]      register rows of the scope (warehouse holder)
 *   counts  [{ bin_id, item_id, instance_id, counter_id, qty }]
 *   finals  [{ bin_id, item_id, instance_id, qty }]      the manager's decisions (override the sum)
 *   areas   [{ bin_id, status }]                          what was counted ('done') — others are not compared
 *   items   Map(id → { tracking, … })                    serial items are compared per instance when scanned
 *   costs   Map(itemId → unit cost in base currency) | null (no sums)
 * Returns rows per bin × item (× instance for scanned serial items):
 *   { key, binId, itemId, instanceId, book, counted, diff, sum, counters: [{ counterId, qty }], conflict, final, status }
 * status: 'match' | 'surplus' | 'shortage' | 'pending' (area not counted yet).
 */
export function reconcile({ book = [], counts = [], finals = [], areas = [], items = new Map(), costs = null }) {
  const doneAreas = new Set(areas.filter((a) => a.status === 'done').map((a) => Number(a.bin_id || 0)));
  // Serial items with at least one scanned instance in a bin are compared per instance there.
  const perInstance = new Set();
  for (const c of counts) if (c.instance_id && Number(c.qty) > EPS) perInstance.add(`${c.bin_id || 0}|${c.item_id}`);
  const rows = new Map();
  const row = (binId, itemId, instanceId) => {
    const serialMode = perInstance.has(`${binId || 0}|${itemId}`);
    const inst = serialMode ? instanceId || null : null;
    const k = keyOf(binId, itemId, inst);
    if (!rows.has(k)) rows.set(k, { key: k, binId: binId || null, itemId: Number(itemId), instanceId: inst, book: 0, counted: 0, counters: new Map(), final: null });
    return rows.get(k);
  };
  for (const b of book) {
    if (Math.abs(Number(b.qty)) < EPS) continue;
    const r = row(b.bin_id, b.item_id, b.instance_id);
    r.book = q4(r.book + Number(b.qty));
  }
  for (const c of counts) {
    if (!(Number(c.qty) > EPS)) continue;
    const r = row(c.bin_id, c.item_id, c.instance_id);
    r.counters.set(Number(c.counter_id), q4((r.counters.get(Number(c.counter_id)) || 0) + Number(c.qty)));
  }
  for (const f of finals) {
    const r = row(f.bin_id, f.item_id, f.instance_id);
    r.final = q4(Number(f.qty));
  }
  const out = [];
  for (const r of rows.values()) {
    const counters = [...r.counters.entries()].map(([counterId, qty]) => ({ counterId, qty }));
    const sum = q4(counters.reduce((acc, c) => acc + c.qty, 0));
    const counted = r.final !== null ? r.final : sum;
    const done = doneAreas.has(Number(r.binId || 0));
    const diff = q4(counted - r.book);
    const status = !done ? 'pending' : Math.abs(diff) < EPS ? 'match' : diff > 0 ? 'surplus' : 'shortage';
    const cost = costs ? Number(costs.get(r.itemId)) || 0 : null;
    out.push({
      key: r.key,
      binId: r.binId,
      itemId: r.itemId,
      instanceId: r.instanceId,
      serial: items.get(r.itemId)?.tracking === 'serial',
      book: q4(r.book),
      counted: done ? counted : sum,
      diff: done ? diff : null,
      sum: costs && done ? cents(diff * cost) : null,
      cost: costs ? cost : null,
      counters,
      conflict: counters.length > 1 && r.final === null,
      final: r.final,
      status,
    });
  }
  return out;
}

/** Totals of reconciliation rows (sums only when they were computed). */
export function reconcileTotals(rows) {
  const done = rows.filter((r) => r.status !== 'pending');
  const withSum = done.some((r) => r.sum !== null);
  const surplus = done.filter((r) => r.status === 'surplus');
  const shortage = done.filter((r) => r.status === 'shortage');
  return {
    rows: rows.length,
    compared: done.length,
    pending: rows.length - done.length,
    matches: done.filter((r) => r.status === 'match').length,
    surplus: surplus.length,
    shortage: shortage.length,
    conflicts: rows.filter((r) => r.conflict).length,
    surplusSum: withSum ? cents(surplus.reduce((acc, r) => acc + (r.sum || 0), 0)) : null,
    shortageSum: withSum ? cents(shortage.reduce((acc, r) => acc + (r.sum || 0), 0)) : null,
    // What moves either way: the act's approval compares this with the threshold.
    grossSum: withSum ? cents(done.reduce((acc, r) => acc + Math.abs(r.sum || 0), 0)) : null,
    netSum: withSum ? cents(done.reduce((acc, r) => acc + (r.sum || 0), 0)) : null,
  };
}

/**
 * The lines of the session's inventory act: one per compared row of the
 * counted areas (matches too — the act lists what was checked). Serial rows
 * per instance carry it; an instance found that the register holds somewhere
 * else (`elsewhere` set of instance ids) is left out (it is moved by a document, not by a count).
 */
export function actLines(rows, { elsewhere = new Set() } = {}) {
  const out = [];
  for (const r of rows) {
    if (r.status === 'pending') continue;
    if (r.instanceId && r.book < EPS && elsewhere.has(r.instanceId)) continue;
    out.push({ itemId: r.itemId, binId: r.binId, instanceId: r.instanceId, countedQty: q4(r.counted), bookQty: q4(r.book) });
  }
  return out;
}

/** Progress by areas (bins): { total, done, recount, counting, todo, percent }. */
export function areaProgress(areas) {
  const out = { total: areas.length, done: 0, recount: 0, counting: 0, todo: 0 };
  for (const a of areas) out[AREA_STATUSES.includes(a.status) ? a.status : 'todo'] += 1;
  out.percent = out.total ? Math.round((out.done / out.total) * 100) : 0;
  return out;
}

/**
 * Areas of a session: the bins in scope that can hold stock — leaves of the
 * bin tree plus any bin with stock — and «без ячейки» (null) when the scope is
 * not limited by bins (or the warehouse has no bins).
 * bins [{ id, parent_id }], stockBins Set(binId), scopeBins [] | null.
 */
export function sessionAreas({ binsEnabled, bins = [], stockBins = new Set(), scopeBins = [] }) {
  if (!binsEnabled) return [null];
  const parents = new Set(bins.map((b) => b.parent_id).filter(Boolean));
  const allowed = scopeBins?.length ? new Set(scopeBins.map(Number)) : null;
  const out = bins.filter((b) => (!allowed || allowed.has(b.id)) && (!parents.has(b.id) || stockBins.has(b.id))).map((b) => b.id);
  if (!allowed) out.push(null);
  return out;
}

/** All ids of the subtrees of `roots` in a tree [{ id, parent_id }]. */
export function subtree(nodes, roots) {
  const children = new Map();
  for (const n of nodes) {
    const p = n.parent_id ?? n.parentId ?? 0;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(n.id);
  }
  const out = new Set();
  const stack = [...roots.map(Number)];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    for (const c of children.get(id) || []) stack.push(c);
  }
  return [...out];
}

/** The next due day of a schedule «every N days» after a count finished on `day`. */
export function nextDue(dayText, everyDays) {
  const n = Math.max(1, Math.min(366, Math.round(Number(everyDays) || 30)));
  return addDays(dayText, n);
}

/** Reminder key of a due schedule: once on the due day, then once a week while overdue. */
export function reminderKey(schedule, today) {
  const due = String(schedule.next_on ?? schedule.nextOn).slice(0, 10);
  if (!due || due > today) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000);
  return `invdue:${schedule.id}:${due}:${Math.floor(days / 7)}`;
}

/** Card actions of a session from its status and the person's role. */
export function sessionActions(session, { manage = false, counter = false, docStatus = null } = {}) {
  const s = session.status;
  const out = {
    start: manage && s === 'draft',
    assign: manage && ['draft', 'counting', 'review'].includes(s),
    count: (manage || counter) && COUNTING.includes(s),
    close: manage && s === 'counting',
    reopen: manage && (s === 'review' || (s === 'finished' && ['rejected', 'cancelled', 'reversed'].includes(docStatus))),
    reconcile: manage && ['counting', 'review', 'finished'].includes(s),
    recount: manage && COUNTING.includes(s),
    finish: manage && COUNTING.includes(s),
    cancel: manage && ['draft', 'counting', 'review'].includes(s),
  };
  return out;
}
