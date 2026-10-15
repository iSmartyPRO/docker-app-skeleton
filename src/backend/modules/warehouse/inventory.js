import { query, withTransaction } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import { costOn, intOrNull, logEvent, portalToday, text, todayFor, usersByIds, whContext } from './access.js';
import { EPS, formatNumber, httpError, needsApproval, q4, unitFactor } from './logic.js';
import {
  COUNTING,
  FREEZE_POLICIES,
  actLines,
  applyCountOp,
  instancesTwice,
  areaProgress,
  cleanOp,
  nextDue,
  reconcile,
  reconcileTotals,
  reminderKey,
  sessionActions,
  sessionAreas,
  sessionFreezes,
  subtree,
} from './inventoryLogic.js';
import { warehouseMessage } from './messages.js';

/*
 * Inventory sessions (spec §6, §8.6; docs/warehouse.md#inventory-sessions).
 *
 *   create   warehouse, optional bins / categories (expanded to subtrees),
 *            blind mode, freeze policy «block» (movements in the scope are
 *            refused, freeze.js) or «record» (allowed, listed in the reconciliation)
 *   areas    one per bin in scope (+ «без ячейки»), assigned to counters; progress by areas
 *   count    phones send operations with client-generated ids (POST /sync):
 *            add / set a quantity of an item (or a scanned instance) in a bin,
 *            mark a bin done; a repeated id is a no-op, so an offline queue
 *            can be re-sent safely. Each counter has own rows: two people
 *            counting one bin are summed and shown as a conflict.
 *   review   reconciliation «учёт / факт / разница / сумма разницы» (sums by
 *            warehouse.cost), only differences, recount requests, the
 *            manager's decision for a row
 *   finish   ONE `inventory` act with the counted rows of the counted bins,
 *            posted at once or sent to approval (gross difference above the threshold)
 * Posting stays online; the act makes the book equal to the count at posting.
 */

const like = (value) => `%${String(value || '').trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ── Loading and shapes ──────────────────────────────────────────────────────

async function loadSession(id, client = { query }, lock = '') {
  const n = intOrNull(id);
  if (!n) return null;
  const { rows } = await client.query(`SELECT * FROM wh_inv_sessions WHERE id = $1 ${lock}`, [n]);
  return rows[0] || null;
}

async function docStatusOf(docId) {
  if (!docId) return null;
  const { rows } = await query(`SELECT id, number, status FROM wh_docs WHERE id = $1`, [docId]);
  return rows[0] || null;
}

async function participants(sessionId) {
  const { rows } = await query(
    `SELECT user_id FROM wh_inv_people WHERE session_id = $1 UNION SELECT assignee_id FROM wh_inv_areas WHERE session_id = $1 AND assignee_id IS NOT NULL`,
    [sessionId]
  );
  return rows.map((row) => row.user_id);
}

/** The person's role on a session: manage (warehouse.inventory there) and / or counter (taking part). */
async function roleOn(ctx, session) {
  const manage = ctx.can('inventory', session.warehouse_id);
  const people = await participants(session.id);
  const counter = Boolean(ctx.userId && people.includes(ctx.userId));
  return { manage, counter, people };
}

async function visibleSession(req, id) {
  const ctx = await whContext(req);
  const session = await loadSession(id);
  if (!session) throw httpError(404, 'Inventory not found', 'NOT_FOUND');
  const role = await roleOn(ctx, session);
  if (!role.manage && !role.counter) throw httpError(404, 'Inventory not found', 'NOT_FOUND');
  return { ctx, session, ...role };
}

async function managedSession(req, id) {
  const out = await visibleSession(req, id);
  if (!out.manage) throw httpError(403, 'Inventories are run by those with the «inventory» right on this warehouse', 'FORBIDDEN');
  return out;
}

async function binPaths(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, path FROM wh_bins WHERE id = ANY($1::int[])`, [list]);
  return new Map(rows.map((row) => [row.id, row.path]));
}

async function categoryNames(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, name FROM wh_categories WHERE id = ANY($1::int[])`, [list]);
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function areasOf(sessionId, db = { query }) {
  const { rows } = await db.query(
    `SELECT a.*, b.path, (SELECT COUNT(*)::int FROM wh_inv_counts c WHERE c.session_id = a.session_id AND COALESCE(c.bin_id, 0) = COALESCE(a.bin_id, 0) AND c.qty > 0) AS counted,
            (SELECT COUNT(DISTINCT c.counter_id)::int FROM wh_inv_counts c WHERE c.session_id = a.session_id AND COALESCE(c.bin_id, 0) = COALESCE(a.bin_id, 0) AND c.qty > 0) AS counters
     FROM wh_inv_areas a LEFT JOIN wh_bins b ON b.id = a.bin_id WHERE a.session_id = $1 ORDER BY a.bin_id IS NULL, b.path`,
    [sessionId]
  );
  return rows;
}

const areaShape = (row, people) => ({
  id: row.id,
  binId: row.bin_id,
  path: row.path || null,
  status: row.status,
  assignee: row.assignee_id ? people.get(row.assignee_id) || { id: row.assignee_id, name: '' } : null,
  doneBy: row.done_by ? people.get(row.done_by) || { id: row.done_by, name: '' } : null,
  doneAt: row.done_at,
  counted: row.counted ?? 0,
  counters: row.counters ?? 0,
});

/** Areas of many sessions in one query (with counted rows and counters per area). */
async function areasOfMany(sessionIds) {
  if (!sessionIds.length) return new Map();
  const { rows } = await query(
    `SELECT a.*, b.path, COALESCE(c.counted, 0)::int AS counted, COALESCE(c.counters, 0)::int AS counters
     FROM wh_inv_areas a LEFT JOIN wh_bins b ON b.id = a.bin_id
     LEFT JOIN (SELECT session_id, COALESCE(bin_id, 0) AS bk, COUNT(*) AS counted, COUNT(DISTINCT counter_id) AS counters FROM wh_inv_counts WHERE session_id = ANY($1::int[]) AND qty > 0 GROUP BY session_id, COALESCE(bin_id, 0)) c
       ON c.session_id = a.session_id AND c.bk = COALESCE(a.bin_id, 0)
     WHERE a.session_id = ANY($1::int[]) ORDER BY a.session_id, a.bin_id IS NULL, b.path`,
    [sessionIds]
  );
  const out = new Map(sessionIds.map((id) => [id, []]));
  for (const row of rows) out.get(row.session_id).push(row);
  return out;
}

async function participantsOfMany(sessionIds) {
  const out = new Map(sessionIds.map((id) => [id, []]));
  if (!sessionIds.length) return out;
  const { rows } = await query(
    `SELECT session_id, user_id FROM wh_inv_people WHERE session_id = ANY($1::int[]) UNION SELECT session_id, assignee_id FROM wh_inv_areas WHERE session_id = ANY($1::int[]) AND assignee_id IS NOT NULL`,
    [sessionIds]
  );
  for (const row of rows) if (!out.get(row.session_id).includes(row.user_id)) out.get(row.session_id).push(row.user_id);
  return out;
}

/**
 * Card shapes of sessions, loaded in bulk (lists ask for up to 200 at once):
 * a fixed number of queries whatever the number of rows. `docs` (Map
 * sessionId → { id, status, number } | null) skips loading the acts.
 */
async function sessionShapes(ctx, rows, { areas = null, people = null, docs = null } = {}) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [{ rows: whs }, areaMap, peopleMap, { rows: docRows }, { rows: schedules }] = await Promise.all([
    query(`SELECT id, name, bins_enabled FROM wh_warehouses WHERE id = ANY($1::int[])`, [[...new Set(rows.map((row) => row.warehouse_id))]]),
    areas ? new Map([[rows[0].id, areas]]) : areasOfMany(ids),
    people ? new Map([[rows[0].id, people]]) : participantsOfMany(ids),
    docs ? { rows: [] } : query(`SELECT id, number, status FROM wh_docs WHERE id = ANY($1::int[])`, [rows.map((row) => row.doc_id).filter(Boolean)]),
    query(`SELECT id, title, every_days FROM wh_inv_schedules WHERE id = ANY($1::int[])`, [rows.map((row) => row.schedule_id).filter(Boolean)]),
  ]);
  const whOf = new Map(whs.map((w) => [w.id, w]));
  const docOf = new Map(docRows.map((d) => [d.id, d]));
  const scheduleOf = new Map(schedules.map((sc) => [sc.id, sc]));
  const users = await usersByIds(rows.flatMap((row) => [...(peopleMap.get(row.id) || []), row.created_by, row.finished_by, ...(areaMap.get(row.id) || []).flatMap((a) => [a.assignee_id, a.done_by])]));
  const paths = await binPaths(rows.flatMap((row) => row.bin_roots || []));
  const cats = await categoryNames(rows.flatMap((row) => row.category_roots || []));
  return rows.map((row) => {
    const wh = whOf.get(row.warehouse_id);
    const list = areaMap.get(row.id) || [];
    const who = peopleMap.get(row.id) || [];
    const docRow = docs ? docs.get(row.id) ?? null : row.doc_id ? docOf.get(row.doc_id) || null : null;
    const schedule = row.schedule_id ? scheduleOf.get(row.schedule_id) || null : null;
    return {
      id: row.id,
      number: row.number,
      title: row.title || '',
      status: row.status,
      warehouse: wh ? { id: wh.id, name: wh.name, binsEnabled: wh.bins_enabled } : { id: row.warehouse_id, name: '' },
      blind: row.blind,
      freezePolicy: row.freeze_policy,
      freezes: sessionFreezes(row, docRow?.status || null),
      scope: {
        bins: (row.bin_roots || []).map((id) => ({ id, path: paths.get(id) || `#${id}` })),
        categories: (row.category_roots || []).map((id) => ({ id, name: cats.get(id) || `#${id}` })),
        partial: Boolean((row.bin_roots || []).length || (row.category_roots || []).length),
      },
      comment: row.comment || '',
      createdBy: row.created_by ? users.get(row.created_by) || null : null,
      createdAt: row.created_at,
      startedAt: row.started_at,
      closedAt: row.closed_at,
      finishedAt: row.finished_at,
      finishedBy: row.finished_by ? users.get(row.finished_by) || null : null,
      cancelledAt: row.cancelled_at,
      doc: docRow ? { id: docRow.id, number: docRow.number, status: docRow.status, url: `/app/warehouse/documents/${docRow.id}` } : null,
      schedule: schedule ? { id: schedule.id, title: schedule.title || '', everyDays: schedule.every_days } : null,
      progress: areaProgress(list),
      people: who.map((id) => users.get(id) || { id, name: '' }),
      url: `/app/warehouse/inventory/${row.id}`,
      _users: users,
      _areas: list,
    };
  });
}

async function sessionShape(ctx, row, { areas = null, people = null, doc = undefined } = {}) {
  const [shape] = await sessionShapes(ctx, [row], { areas, people, docs: doc === undefined ? null : new Map([[row.id, doc]]) });
  return shape;
}

const publicShape = (shape) => {
  const { _users, _areas, ...rest } = shape;
  return rest;
};

// ── Lists ───────────────────────────────────────────────────────────────────

/** Warehouse ids where the person may run inventories (null = all). */
function inventoryWarehouses(ctx) {
  if (ctx.global.has('inventory') || ctx.global.has('admin')) return null;
  return [...new Set([...ctx.assignments.keys(), ...ctx.molOf])].filter((id) => ctx.can('inventory', id));
}

/** GET /inventory: sessions I run (my warehouses) or take part in. */
export async function listSessions(req, input = {}) {
  const ctx = await whContext(req);
  const ids = inventoryWarehouses(ctx);
  const params = [ids, ctx.userId || 0];
  const where = [`(($1::int[] IS NULL OR s.warehouse_id = ANY($1::int[])) OR EXISTS (SELECT 1 FROM wh_inv_people p WHERE p.session_id = s.id AND p.user_id = $2) OR EXISTS (SELECT 1 FROM wh_inv_areas a WHERE a.session_id = s.id AND a.assignee_id = $2))`];
  const statuses = String(input.status || '').split(',').filter((s) => ['draft', 'counting', 'review', 'finished', 'cancelled'].includes(s));
  if (statuses.length) {
    params.push(statuses);
    where.push(`s.status = ANY($${params.length}::text[])`);
  }
  if (input.active === '1') where.push(`s.status IN ('draft', 'counting', 'review')`);
  const wh = intOrNull(input.warehouse);
  if (wh) {
    params.push(wh);
    where.push(`s.warehouse_id = $${params.length}`);
  }
  if (input.mine === '1') where.push(`(EXISTS (SELECT 1 FROM wh_inv_people p WHERE p.session_id = s.id AND p.user_id = $2) OR EXISTS (SELECT 1 FROM wh_inv_areas a WHERE a.session_id = s.id AND a.assignee_id = $2))`);
  if (input.q) {
    params.push(like(input.q));
    where.push(`(s.number ILIKE $${params.length} OR s.title ILIKE $${params.length})`);
  }
  const { rows } = await query(`SELECT s.* FROM wh_inv_sessions s WHERE ${where.join(' AND ')} ORDER BY (s.status IN ('counting', 'review', 'draft')) DESC, s.created_at DESC LIMIT 200`, params);
  const out = [];
  const shapes = await sessionShapes(ctx, rows);
  for (const [index, row] of rows.entries()) {
    const shape = shapes[index];
    const mine = shape._areas.filter((a) => a.assignee_id === ctx.userId);
    out.push({ ...publicShape(shape), mine: { areas: mine.length, done: mine.filter((a) => a.status === 'done').length }, my: sessionActions(row, { manage: ctx.can('inventory', row.warehouse_id), counter: shape.people.some((p) => p.id === ctx.userId), docStatus: shape.doc?.status }) });
  }
  const { rows: count } = await query(`SELECT status, COUNT(*)::int AS n FROM wh_inv_sessions s WHERE ${where[0]} GROUP BY status`, params.slice(0, 2));
  const counters = { all: 0 };
  for (const c of count) {
    counters[c.status] = c.n;
    counters.all += c.n;
  }
  counters.active = (counters.draft || 0) + (counters.counting || 0) + (counters.review || 0);
  return { items: out, counters, canCreate: ctx.canAny('inventory') };
}

/** GET /inventory/active?warehouse=: running inventories (for the banner on documents and the mobile mode). */
export async function activeSessions(req, input = {}) {
  const ctx = await whContext(req);
  const wh = intOrNull(input.warehouse);
  const { rows } = await query(
    `SELECT s.*, d.status AS doc_status FROM wh_inv_sessions s LEFT JOIN wh_docs d ON d.id = s.doc_id
     WHERE (s.status IN ('counting', 'review') OR (s.status = 'finished' AND d.status IN ('draft', 'pending', 'approved'))) AND ($1::int IS NULL OR s.warehouse_id = $1)
     ORDER BY s.started_at`,
    [wh]
  );
  const visible = rows.filter((row) => ctx.sees(row.warehouse_id));
  const out = [];
  const shapes = await sessionShapes(ctx, visible, { docs: new Map(visible.map((row) => [row.id, row.doc_id ? { id: row.doc_id, status: row.doc_status, number: '' } : null])) });
  for (const [index, row] of visible.entries()) {
    const shape = publicShape(shapes[index]);
    out.push({ id: shape.id, number: shape.number, title: shape.title, status: shape.status, warehouse: shape.warehouse, freezePolicy: shape.freezePolicy, freezes: shape.freezes, scope: shape.scope, progress: shape.progress, startedAt: shape.startedAt, canOpen: ctx.can('inventory', row.warehouse_id) || shape.people.some((p) => p.id === ctx.userId) });
  }
  return { sessions: out };
}

// ── Create, start, assign, close ────────────────────────────────────────────

async function warehouseRow(id) {
  const { rows } = await query(`SELECT * FROM wh_warehouses WHERE id = $1`, [intOrNull(id) || 0]);
  return rows[0] || null;
}

/** Bins in scope: the chosen roots and their subtrees (validated: the warehouse's own). */
async function expandBins(warehouseId, roots) {
  const list = [...new Set((Array.isArray(roots) ? roots : []).map(intOrNull).filter(Boolean))];
  if (!list.length) return { roots: [], ids: [] };
  const { rows } = await query(`SELECT id, parent_id FROM wh_bins WHERE warehouse_id = $1`, [warehouseId]);
  const own = new Set(rows.map((r) => r.id));
  if (list.some((id) => !own.has(id))) throw httpError(400, 'The bin belongs to another warehouse', 'BAD_BIN');
  return { roots: list, ids: subtree(rows, list) };
}

async function expandCategories(roots) {
  const list = [...new Set((Array.isArray(roots) ? roots : []).map(intOrNull).filter(Boolean))];
  if (!list.length) return { roots: [], ids: [] };
  const { rows } = await query(`SELECT id, parent_id FROM wh_categories`);
  const own = new Set(rows.map((r) => r.id));
  if (list.some((id) => !own.has(id))) throw httpError(400, 'Unknown category', 'BAD_CATEGORY');
  return { roots: list, ids: subtree(rows, list) };
}

const overlaps = (a, b) => !a.length || !b.length || a.some((id) => b.includes(id));

async function cleanPeople(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(intOrNull).filter(Boolean))].slice(0, 100);
  if (!list.length) return [];
  const { rows } = await query(`SELECT id FROM users WHERE id = ANY($1::int[]) AND is_active IS NOT FALSE`, [list]);
  return rows.map((row) => row.id);
}

async function nextSessionNumber(client, settings) {
  const { rows } = await client.query(`INSERT INTO wh_counters (key, value) VALUES ('inv:session', 1) ON CONFLICT (key) DO UPDATE SET value = wh_counters.value + 1 RETURNING value`);
  return formatNumber(settings.numberPrefixes?.inventory_session || 'ИНВ', rows[0].value, settings.numberDigits || 5);
}

async function notifyAssigned(ctx, session, userIds, areaPaths = []) {
  if (!userIds.length) return;
  const wh = await warehouseRow(session.warehouse_id);
  const actor = (await usersByIds([ctx.userId])).get(ctx.userId)?.name || '';
  notify({ userIds, kind: 'warehouse.inventory_assigned', module: 'warehouse', link: `/app/warehouse/m/inventory/${session.id}`, actorId: ctx.userId, render: warehouseMessage('inventoryAssigned', { session: { number: session.number, title: session.title }, warehouse: wh?.name || '', actor, bins: areaPaths }) }).catch(() => {});
}

/**
 * POST /inventory { warehouseId, title?, binIds?, categoryIds?, blind?, freezePolicy?, counters?, start? (default true), scheduleId?, comment? }
 */
export async function createSession(req, input = {}) {
  const ctx = await whContext(req);
  let source = { ...input };
  const scheduleId = intOrNull(input.scheduleId);
  if (scheduleId) {
    const { rows } = await query(`SELECT * FROM wh_inv_schedules WHERE id = $1`, [scheduleId]);
    if (!rows[0]) throw httpError(404, 'Schedule not found', 'NOT_FOUND');
    const s = rows[0];
    source = { warehouseId: s.warehouse_id, binIds: s.bin_ids, categoryIds: s.category_ids, blind: s.blind, title: s.title, ...input };
  }
  const wh = await warehouseRow(source.warehouseId);
  if (!wh || wh.archived_at) throw httpError(400, 'Choose the warehouse', 'WAREHOUSE_REQUIRED');
  if (!ctx.can('inventory', wh.id)) throw httpError(403, 'Inventories are run by those with the «inventory» right on this warehouse', 'FORBIDDEN');
  const bins = await expandBins(wh.id, source.binIds);
  const cats = await expandCategories(source.categoryIds);
  const policy = FREEZE_POLICIES.includes(source.freezePolicy) ? source.freezePolicy : 'block';
  const counters = await cleanPeople(source.counters);
  const start = source.start !== false;
  // One running inventory per scope: two sessions over the same goods would fight over the book.
  const { rows: active } = await query(`SELECT number, bin_ids, category_ids FROM wh_inv_sessions WHERE warehouse_id = $1 AND status IN ('draft', 'counting', 'review')`, [wh.id]);
  const clash = active.find((s) => overlaps(s.bin_ids || [], bins.ids) && overlaps(s.category_ids || [], cats.ids));
  if (clash) throw httpError(409, `Inventory ${clash.number} already covers these goods`, 'SESSION_ACTIVE', { number: clash.number });
  // Areas: bins in scope that can hold stock (leaves and bins with stock) + «без ячейки».
  const { rows: binRows } = await query(
    `SELECT b.id, b.parent_id FROM wh_bins b WHERE b.warehouse_id = $1 AND (b.archived_at IS NULL OR EXISTS (SELECT 1 FROM wh_stock s WHERE s.bin_id = b.id AND s.qty <> 0))`,
    [wh.id]
  );
  const { rows: stockBins } = await query(`SELECT DISTINCT bin_id FROM wh_stock WHERE warehouse_id = $1 AND bin_id IS NOT NULL AND qty <> 0`, [wh.id]);
  const areas = sessionAreas({ binsEnabled: wh.bins_enabled, bins: binRows, stockBins: new Set(stockBins.map((r) => r.bin_id)), scopeBins: bins.ids });
  if (!areas.length) throw httpError(400, 'There are no bins in this scope', 'NO_AREAS');
  const id = await withTransaction(async (client) => {
    const number = await nextSessionNumber(client, ctx.settings);
    const { rows } = await client.query(
      `INSERT INTO wh_inv_sessions (number, warehouse_id, title, status, blind, freeze_policy, bin_roots, bin_ids, category_roots, category_ids, schedule_id, comment, created_by, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [number, wh.id, text(source.title, 200), start ? 'counting' : 'draft', source.blind === true, policy, bins.roots, bins.ids, cats.roots, cats.ids, scheduleId, text(source.comment, 2000), ctx.userId, start ? new Date() : null]
    );
    const sessionId = rows[0].id;
    for (const binId of areas) await client.query(`INSERT INTO wh_inv_areas (session_id, bin_id) VALUES ($1, $2)`, [sessionId, binId]);
    for (const userId of counters) await client.query(`INSERT INTO wh_inv_people (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [sessionId, userId]);
    return sessionId;
  });
  const session = await loadSession(id);
  await notifyAssigned(ctx, session, counters);
  return getSession(req, id);
}

/** GET /inventory/:id: the card (areas with progress, people, actions). */
export async function getSession(req, id) {
  const { ctx, session, manage, counter, people } = await visibleSession(req, id);
  const shape = await sessionShape(ctx, session, { people });
  const { rows: recounts } = await query(`SELECT r.*, b.path, i.name AS item_name FROM wh_inv_recounts r LEFT JOIN wh_bins b ON b.id = r.bin_id LEFT JOIN wh_items i ON i.id = r.item_id WHERE r.session_id = $1 AND r.done_at IS NULL ORDER BY r.id`, [session.id]);
  return {
    session: publicShape(shape),
    areas: shape._areas.map((a) => areaShape(a, shape._users)),
    recounts: recounts.map((r) => ({ id: r.id, binId: r.bin_id, path: r.path || null, itemId: r.item_id, itemName: r.item_name || null, requestedAt: r.requested_at })),
    my: { ...sessionActions(session, { manage, counter, docStatus: shape.doc?.status }), manage, counter, cost: costOn(ctx, [session.warehouse_id]) },
  };
}

async function setStatus(req, id, from, to, extra = '') {
  const { ctx, session } = await managedSession(req, id);
  await withTransaction(async (client) => {
    const current = await loadSession(session.id, client, 'FOR UPDATE');
    if (!from.includes(current.status)) throw httpError(409, 'Not possible in this status', 'BAD_TRANSITION', { status: current.status });
    await client.query(`UPDATE wh_inv_sessions SET status = $2, updated_at = NOW()${extra} WHERE id = $1`, [session.id, to]);
  });
  return { ctx, session };
}

export async function startSession(req, id) {
  await setStatus(req, id, ['draft'], 'counting', ', started_at = NOW()');
  return getSession(req, id);
}

/** POST /inventory/:id/close — counting is over: the manager reviews (recounts still possible). */
export async function closeCounting(req, id) {
  await setStatus(req, id, ['counting'], 'review', ', closed_at = NOW()');
  return getSession(req, id);
}

/** POST /inventory/:id/reopen — back to counting; after a rejected act the session is reviewed again. */
export async function reopenSession(req, id) {
  const { session } = await managedSession(req, id);
  const doc = await docStatusOf(session.doc_id);
  if (session.status === 'review') await setStatus(req, id, ['review'], 'counting', ', closed_at = NULL');
  // A deleted act (a draft that failed to post) leaves doc_id NULL: the session is reviewed again too.
  else if (session.status === 'finished' && (!doc || ['rejected', 'cancelled', 'reversed'].includes(doc.status))) await setStatus(req, id, ['finished'], 'review', ', doc_id = NULL, finished_at = NULL, finished_by = NULL');
  else throw httpError(409, 'Not possible in this status', 'BAD_TRANSITION', { status: session.status });
  return getSession(req, id);
}

export async function cancelSession(req, id) {
  await setStatus(req, id, ['draft', 'counting', 'review'], 'cancelled', ', cancelled_at = NOW()');
  return getSession(req, id);
}

/**
 * PUT /inventory/:id/assign { binIds: [...] (zones expand to their bins; 0 = «без ячейки»), userId | null }
 * — areas to a counter (or unassigned). The counter joins the session.
 */
export async function assignAreas(req, id, input = {}) {
  const { ctx, session } = await managedSession(req, id);
  if (!['draft', 'counting', 'review'].includes(session.status)) throw httpError(409, 'Not possible in this status', 'BAD_TRANSITION');
  const userId = input.userId === null || input.userId === undefined ? null : (await cleanPeople([input.userId]))[0] || null;
  if (input.userId && !userId) throw httpError(400, 'Unknown person', 'BAD_PERSON');
  const raw = Array.isArray(input.binIds) ? input.binIds : [];
  const noBin = raw.some((v) => v === 0 || v === '0' || v === null);
  const roots = raw.map(intOrNull).filter(Boolean);
  const { rows: binRows } = await query(`SELECT id, parent_id FROM wh_bins WHERE warehouse_id = $1`, [session.warehouse_id]);
  const ids = subtree(binRows, roots);
  const { rows } = await query(
    `UPDATE wh_inv_areas SET assignee_id = $2, updated_at = NOW() WHERE session_id = $1 AND (bin_id = ANY($3::int[]) OR ($4::boolean AND bin_id IS NULL)) RETURNING bin_id`,
    [session.id, userId, ids, noBin]
  );
  if (userId) {
    await query(`INSERT INTO wh_inv_people (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [session.id, userId]);
    const paths = await binPaths(rows.map((r) => r.bin_id));
    await notifyAssigned(ctx, session, [userId], [...paths.values()].slice(0, 12));
  }
  return getSession(req, id);
}

/** POST /inventory/:id/people { userIds } — counters without fixed areas. */
export async function addPeople(req, id, input = {}) {
  const { ctx, session } = await managedSession(req, id);
  const ids = await cleanPeople(input.userIds);
  const before = await participants(session.id);
  for (const userId of ids) await query(`INSERT INTO wh_inv_people (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [session.id, userId]);
  if (Array.isArray(input.remove)) {
    const remove = input.remove.map(intOrNull).filter(Boolean);
    await query(`DELETE FROM wh_inv_people WHERE session_id = $1 AND user_id = ANY($2::int[])`, [session.id, remove]);
    await query(`UPDATE wh_inv_areas SET assignee_id = NULL WHERE session_id = $1 AND assignee_id = ANY($2::int[])`, [session.id, remove]);
  }
  await notifyAssigned(ctx, session, ids.filter((uid) => !before.includes(uid)));
  return getSession(req, id);
}

// ── Counting (phones) ───────────────────────────────────────────────────────

const itemShape = (row) => ({ id: row.id, name: row.name, sku: row.sku || '', baseUnit: row.base_unit, units: row.units || [], tracking: row.tracking, categoryId: row.category_id });

/**
 * GET /inventory/:id/area?bin=<id|0> — what a counter needs in one bin: my
 * counts, how many others counted here, recounts asked, and (not in blind
 * mode) what the book expects there.
 */
export async function areaView(req, id, input = {}) {
  const { ctx, session, manage } = await visibleSession(req, id);
  const binId = intOrNull(input.bin);
  const { rows: areaRows } = await query(`SELECT a.*, b.path FROM wh_inv_areas a LEFT JOIN wh_bins b ON b.id = a.bin_id WHERE a.session_id = $1 AND COALESCE(a.bin_id, 0) = $2`, [session.id, binId || 0]);
  const area = areaRows[0];
  if (!area) throw httpError(404, 'This bin is not in the inventory', 'NOT_IN_SCOPE');
  const { rows: counts } = await query(
    `SELECT c.*, ins.inventory_no FROM wh_inv_counts c LEFT JOIN wh_instances ins ON ins.id = c.instance_id WHERE c.session_id = $1 AND COALESCE(c.bin_id, 0) = $2 AND c.qty > 0 ORDER BY c.updated_at DESC`,
    [session.id, binId || 0]
  );
  const mine = counts.filter((c) => c.counter_id === ctx.userId);
  const others = new Set(counts.filter((c) => c.counter_id !== ctx.userId).map((c) => c.counter_id));
  let expected = [];
  if (!session.blind) {
    const { rows } = await query(
      `SELECT s.item_id, SUM(s.qty) AS qty FROM wh_stock s JOIN wh_items i ON i.id = s.item_id
       WHERE s.warehouse_id = $1 AND s.holder_type = 'warehouse' AND COALESCE(s.bin_id, 0) = $2 AND (cardinality($3::int[]) = 0 OR i.category_id = ANY($3::int[]))
       GROUP BY s.item_id HAVING SUM(s.qty) <> 0`,
      [session.warehouse_id, binId || 0, session.category_ids || []]
    );
    expected = rows;
  }
  const itemIds = [...new Set([...counts.map((c) => c.item_id), ...expected.map((e) => e.item_id)])];
  const { rows: itemRows } = itemIds.length ? await query(`SELECT * FROM wh_items WHERE id = ANY($1::int[])`, [itemIds]) : { rows: [] };
  const items = new Map(itemRows.map((row) => [row.id, itemShape(row)]));
  const { rows: recounts } = await query(`SELECT r.id, r.item_id FROM wh_inv_recounts r WHERE r.session_id = $1 AND COALESCE(r.bin_id, 0) = $2 AND r.done_at IS NULL`, [session.id, binId || 0]);
  const byItem = new Map();
  for (const c of mine) {
    const key = c.item_id;
    const entry = byItem.get(key) || { item: items.get(c.item_id), qty: 0, instances: [], updatedAt: c.updated_at };
    entry.qty = q4(entry.qty + Number(c.qty));
    if (c.instance_id) entry.instances.push({ id: c.instance_id, inventoryNo: c.inventory_no });
    byItem.set(key, entry);
  }
  const people = await usersByIds([area.assignee_id, area.done_by]);
  return {
    session: { id: session.id, number: session.number, status: session.status, blind: session.blind, warehouseId: session.warehouse_id },
    area: areaShape({ ...area, counted: counts.length, counters: new Set(counts.map((c) => c.counter_id)).size }, people),
    mine: [...byItem.values()],
    others: others.size,
    expected: session.blind ? null : expected.map((e) => ({ item: items.get(e.item_id), book: q4(e.qty), countedByMe: byItem.get(e.item_id)?.qty || 0 })),
    recounts: recounts.map((r) => ({ id: r.id, itemId: r.item_id, itemName: r.item_id ? items.get(r.item_id)?.name || '' : null })),
    canCount: COUNTING.includes(session.status) && (session.status === 'counting' || area.status === 'recount' || recounts.length > 0),
    manage,
  };
}

/** Is the op allowed in the session's state? In review only bins / items sent to recount. */
async function assertCountable(client, session, op) {
  if (!COUNTING.includes(session.status)) throw httpError(409, 'The inventory is not counting any more', 'SESSION_CLOSED');
  const { rows } = await client.query(`SELECT * FROM wh_inv_areas WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2`, [session.id, op.binId || 0]);
  const area = rows[0];
  if (!area) throw httpError(400, 'This bin is not in the inventory', 'NOT_IN_SCOPE', { binId: op.binId || null });
  if (session.status === 'review' && area.status !== 'recount') {
    const { rows: open } = await client.query(`SELECT 1 FROM wh_inv_recounts WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2 AND done_at IS NULL AND (item_id IS NULL OR item_id = $3)`, [session.id, op.binId || 0, op.itemId || 0]);
    if (!open.length) throw httpError(409, 'Counting is closed; only bins sent to recount are counted', 'SESSION_CLOSED');
  }
  return area;
}

async function applyOp(client, ctx, session, op) {
  const area = await assertCountable(client, session, op);
  if (op.kind === 'done' || op.kind === 'reopen') {
    const done = op.kind === 'done';
    await client.query(`UPDATE wh_inv_areas SET status = $2, done_by = $3, done_at = $4, updated_at = NOW() WHERE id = $1`, [area.id, done ? 'done' : 'counting', done ? ctx.userId : null, done ? new Date() : null]);
    if (done) await client.query(`UPDATE wh_inv_recounts SET done_at = NOW() WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2 AND done_at IS NULL`, [session.id, op.binId || 0]);
    return;
  }
  const { rows: itemRows } = await client.query(`SELECT * FROM wh_items WHERE id = $1`, [op.itemId]);
  const item = itemRows[0];
  if (!item) throw httpError(400, 'Unknown item', 'BAD_ITEM');
  if (item.kind === 'service') throw httpError(400, `«${item.name}» is a service and has no stock`, 'ITEM_SERVICE');
  const cats = session.category_ids || [];
  if (cats.length && !cats.includes(item.category_id)) throw httpError(400, `«${item.name}» is not in this inventory`, 'NOT_IN_SCOPE', { itemId: item.id });
  let instanceId = op.instanceId;
  if (instanceId) {
    const { rows } = await client.query(`SELECT item_id FROM wh_instances WHERE id = $1`, [instanceId]);
    if (!rows[0] || rows[0].item_id !== item.id) throw httpError(400, 'The instance belongs to another item', 'BAD_INSTANCE');
  } else instanceId = null;
  // Serial items are counted by their pieces: scan the instance (add), or take one specific instance back (set 0).
  if (item.tracking === 'serial' && !instanceId) throw httpError(400, `${item.name}: scan the label of each piece`, 'SERIAL_SCAN_INSTANCE', { itemId: item.id });
  if (instanceId && op.kind === 'set' && !(op.qty === 0 || op.qty === 1)) throw httpError(400, 'One instance is one piece', 'INSTANCE_QTY');
  const factor = unitFactor(item, op.unit || item.base_unit);
  if (!factor) throw httpError(400, `Unknown unit «${op.unit}» for ${item.name}`, 'BAD_UNIT');
  let baseQty = q4(op.qty * factor);
  if (item.tracking === 'serial' && Math.abs(baseQty - Math.round(baseQty)) > EPS) throw httpError(400, `${item.name}: count serial items in whole pieces`, 'SERIAL_WHOLE');
  const keyArgs = [session.id, ctx.userId, op.binId || 0, item.id, instanceId || 0];
  const { rows: current } = await client.query(
    `SELECT id, qty FROM wh_inv_counts WHERE session_id = $1 AND counter_id = $2 AND COALESCE(bin_id, 0) = $3 AND item_id = $4 AND COALESCE(instance_id, 0) = $5 FOR UPDATE`,
    keyArgs
  );
  let next = applyCountOp(current[0] ? Number(current[0].qty) : 0, { kind: op.kind, baseQty });
  if (instanceId) next = Math.min(1, next);
  if (current[0]) await client.query(`UPDATE wh_inv_counts SET qty = $2, updated_at = NOW() WHERE id = $1`, [current[0].id, next]);
  else await client.query(`INSERT INTO wh_inv_counts (session_id, counter_id, bin_id, item_id, instance_id, qty) VALUES ($1, $2, $3, $4, $5, $6)`, [session.id, ctx.userId, op.binId || null, item.id, instanceId, next]);
  // A recount asked for this item (or the whole bin): the new count replaces everyone's earlier rows.
  const { rows: open } = await client.query(`SELECT id, item_id FROM wh_inv_recounts WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2 AND done_at IS NULL AND item_id = $3`, [session.id, op.binId || 0, item.id]);
  if (open.length) {
    await client.query(`DELETE FROM wh_inv_counts WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2 AND item_id = $3 AND counter_id <> $4`, [session.id, op.binId || 0, item.id, ctx.userId]);
    await client.query(`DELETE FROM wh_inv_finals WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2 AND item_id = $3`, [session.id, op.binId || 0, item.id]);
    await client.query(`UPDATE wh_inv_recounts SET done_at = NOW() WHERE id = ANY($1::int[])`, [open.map((r) => r.id)]);
  }
  if (area.status === 'todo') await client.query(`UPDATE wh_inv_areas SET status = 'counting', updated_at = NOW() WHERE id = $1`, [area.id]);
}

/**
 * POST /inventory/:id/sync { ops: [{ clientId, kind: add|set|done|reopen, binId, itemId, instanceId, qty, unit, recount, at }] }
 * — the offline queue of a phone. Each op runs in its own transaction; an id
 * already applied answers «duplicate» and changes nothing.
 * → { results: [{ clientId, status: applied|duplicate|rejected, code?, message? }] }
 */
export async function syncOps(req, id, input = {}) {
  const { ctx, session, manage, counter } = await visibleSession(req, id);
  if (!manage && !counter) throw httpError(403, 'You do not count in this inventory', 'FORBIDDEN');
  const ops = (Array.isArray(input.ops) ? input.ops : []).slice(0, 500);
  const results = [];
  for (const raw of ops) {
    const op = cleanOp(raw);
    if (!op) {
      results.push({ clientId: raw?.clientId ?? null, status: 'rejected', code: 'BAD_OP' });
      continue;
    }
    try {
      const status = await withTransaction(async (client) => {
        const current = await loadSession(session.id, client, 'FOR SHARE');
        const { rows: seen } = await client.query(`SELECT 1 FROM wh_inv_ops WHERE session_id = $1 AND client_id = $2`, [session.id, op.clientId]);
        if (seen.length) return 'duplicate';
        await applyOp(client, ctx, current, op);
        const { rows } = await client.query(
          `INSERT INTO wh_inv_ops (session_id, client_id, counter_id, op, made_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`,
          [session.id, op.clientId, ctx.userId, JSON.stringify(op), op.at]
        );
        // A parallel request applied the same id first: undo ours.
        if (!rows.length) throw Object.assign(new Error('duplicate'), { duplicate: true });
        return 'applied';
      });
      results.push({ clientId: op.clientId, status });
    } catch (err) {
      if (err.duplicate) results.push({ clientId: op.clientId, status: 'duplicate' });
      else if (err.statusCode && err.statusCode < 500) results.push({ clientId: op.clientId, status: 'rejected', code: err.code || 'ERROR', message: err.message, info: err.info || null });
      else throw err;
    }
  }
  return { results };
}

// ── Review ──────────────────────────────────────────────────────────────────

/** Unit costs (base currency) per item at a warehouse: the pool's average, else the last average, else the last price. */
async function unitCosts(warehouseId, itemIds) {
  if (!itemIds.length) return new Map();
  const [{ rows: pools }, { rows: costs }, { rows: items }] = await Promise.all([
    query(`SELECT item_id, SUM(qty) AS q, SUM(amount) AS a FROM wh_stock WHERE warehouse_id = $1 AND holder_type = 'warehouse' AND item_id = ANY($2::int[]) GROUP BY item_id`, [warehouseId, itemIds]),
    query(`SELECT item_id, avg_cost FROM wh_costs WHERE warehouse_id = $1 AND item_id = ANY($2::int[])`, [warehouseId, itemIds]),
    query(`SELECT id, last_price FROM wh_items WHERE id = ANY($1::int[])`, [itemIds]),
  ]);
  const out = new Map();
  for (const item of items) out.set(item.id, Number(item.last_price) || 0);
  for (const c of costs) out.set(c.item_id, Number(c.avg_cost));
  for (const p of pools) if (Number(p.q) > EPS) out.set(p.item_id, Math.round((Number(p.a) / Number(p.q)) * 1e6) / 1e6);
  return out;
}

/** Everything the reconciliation and the act are computed from (`db`: the finish's transaction, after its lock). */
async function reviewData(ctx, session, { withCost, db = null }) {
  const binScope = session.bin_ids || [];
  const catScope = session.category_ids || [];
  const q = db || { query };
  // One client runs one statement at a time: inside a transaction the reads go one after another.
  const all = db ? async (list) => { const out = []; for (const f of list) out.push(await f()); return out; } : (list) => Promise.all(list.map((f) => f()));
  const [{ rows: book }, { rows: counts }, { rows: finals }, areas] = await all([
    () => q.query(
      `SELECT s.bin_id, s.item_id, s.instance_id, SUM(s.qty) AS qty FROM wh_stock s JOIN wh_items i ON i.id = s.item_id
       WHERE s.warehouse_id = $1 AND s.holder_type = 'warehouse' AND (cardinality($2::int[]) = 0 OR s.bin_id = ANY($2::int[])) AND (cardinality($3::int[]) = 0 OR i.category_id = ANY($3::int[]))
       GROUP BY s.bin_id, s.item_id, s.instance_id HAVING SUM(s.qty) <> 0`,
      [session.warehouse_id, binScope, catScope]
    ),
    () => q.query(`SELECT bin_id, item_id, instance_id, counter_id, qty FROM wh_inv_counts WHERE session_id = $1 AND qty > 0`, [session.id]),
    () => q.query(`SELECT bin_id, item_id, instance_id, qty FROM wh_inv_finals WHERE session_id = $1`, [session.id]),
    () => areasOf(session.id, q),
  ]);
  const itemIds = [...new Set([...book.map((b) => b.item_id), ...counts.map((c) => c.item_id), ...finals.map((f) => f.item_id)])];
  const { rows: itemRows } = itemIds.length ? await q.query(`SELECT * FROM wh_items WHERE id = ANY($1::int[])`, [itemIds]) : { rows: [] };
  const items = new Map(itemRows.map((row) => [row.id, row]));
  const costs = withCost ? await unitCosts(session.warehouse_id, itemIds) : null;
  const rows = reconcile({ book, counts, finals, areas, items, costs });
  // Scanned instances the register holds outside this scope are not moved by the count.
  const scanned = [...new Set(counts.filter((c) => c.instance_id).map((c) => c.instance_id))];
  const elsewhere = new Set();
  if (scanned.length) {
    const inScopeKeys = new Set(book.filter((b) => b.instance_id).map((b) => b.instance_id));
    const { rows: held } = await q.query(`SELECT DISTINCT instance_id FROM wh_stock WHERE instance_id = ANY($1::int[]) AND qty > 0`, [scanned]);
    for (const h of held) if (!inScopeKeys.has(h.instance_id)) elsewhere.add(h.instance_id);
  }
  return { rows, items, areas, elsewhere, book, counts };
}

/** May the person see the book now? Blind mode hides it from those counting until counting is closed. */
function assertBookVisible(ctx, session, counter) {
  if (session.blind && session.status === 'counting' && counter && !ctx.isAdmin && session.created_by !== ctx.userId) {
    throw httpError(403, 'Blind inventory: the book is shown after counting is closed', 'BLIND');
  }
}

/**
 * GET /inventory/:id/reconcile?onlyDiff=1 — «учёт / факт / разница / сумма
 * разницы» per bin × item, conflicts (several counters), not counted bins,
 * movements during the count (policy «record»), whether the act goes to approval.
 */
export async function reconcileSession(req, id, input = {}) {
  const { ctx, session, counter } = await managedSession(req, id);
  assertBookVisible(ctx, session, counter);
  const withCost = costOn(ctx, [session.warehouse_id]);
  const { rows, items, areas, elsewhere } = await reviewData(ctx, session, { withCost });
  const totals = reconcileTotals(rows);
  const paths = await binPaths(rows.map((r) => r.binId));
  const { rows: inst } = await query(`SELECT id, inventory_no FROM wh_instances WHERE id = ANY($1::int[])`, [[...new Set(rows.map((r) => r.instanceId).filter(Boolean))]]);
  const instOf = new Map(inst.map((i) => [i.id, i.inventory_no]));
  const people = await usersByIds(rows.flatMap((r) => r.counters.map((c) => c.counterId)));
  const categories = await categoryNames([...items.values()].map((i) => i.category_id));
  const { rows: recounts } = await query(`SELECT bin_id, item_id FROM wh_inv_recounts WHERE session_id = $1 AND done_at IS NULL`, [session.id]);
  const recountKey = new Set(recounts.map((r) => `${r.bin_id || 0}|${r.item_id || 0}`));
  let list = rows.map((r) => {
    const item = items.get(r.itemId);
    return {
      ...r,
      item: item ? { id: item.id, name: item.name, sku: item.sku || '', baseUnit: item.base_unit, units: item.units || [], tracking: item.tracking, category: categories.get(item.category_id) || null } : { id: r.itemId, name: `#${r.itemId}` },
      bin: r.binId ? { id: r.binId, path: paths.get(r.binId) || '' } : null,
      instance: r.instanceId ? { id: r.instanceId, inventoryNo: instOf.get(r.instanceId) || '' } : null,
      counters: r.counters.map((c) => ({ ...c, name: people.get(c.counterId)?.name || '' })),
      elsewhere: Boolean(r.instanceId && elsewhere.has(r.instanceId) && r.book < EPS),
      recount: recountKey.has(`${r.binId || 0}|${r.itemId}`) || recountKey.has(`${r.binId || 0}|0`),
    };
  });
  if (input.onlyDiff === '1' || input.onlyDiff === true) list = list.filter((r) => r.status === 'surplus' || r.status === 'shortage' || r.conflict || r.status === 'pending');
  list.sort((a, b) => (a.bin?.path || '').localeCompare(b.bin?.path || '') || String(a.item.name).localeCompare(String(b.item.name)));
  // Policy «record»: what moved in the scope since the count started (other documents).
  let moves = [];
  if (session.started_at) {
    const { rows: m } = await query(
      `SELECT m.doc_id, d.number, d.type, m.item_id, i.name, i.base_unit, m.bin_id, SUM(m.qty) AS qty, MAX(m.created_at) AS at
       FROM wh_moves m JOIN wh_docs d ON d.id = m.doc_id JOIN wh_items i ON i.id = m.item_id
       WHERE m.warehouse_id = $1 AND m.holder_type = 'warehouse' AND m.created_at >= $2 AND m.doc_id <> COALESCE($3, 0)
         AND (cardinality($4::int[]) = 0 OR m.bin_id = ANY($4::int[])) AND (cardinality($5::int[]) = 0 OR i.category_id = ANY($5::int[]))
       GROUP BY m.doc_id, d.number, d.type, m.item_id, i.name, i.base_unit, m.bin_id ORDER BY MAX(m.created_at) LIMIT 200`,
      [session.warehouse_id, session.started_at, session.doc_id, session.bin_ids || [], session.category_ids || []]
    );
    moves = m.map((row) => ({ doc: { id: row.doc_id, number: row.number, type: row.type }, item: { id: row.item_id, name: row.name, baseUnit: row.base_unit }, binId: row.bin_id, qty: q4(row.qty), at: row.at }));
  }
  const notDone = areas.filter((a) => a.status !== 'done').length;
  return {
    session: publicShape(await sessionShape(ctx, session)),
    rows: list,
    summary: totals,
    moves,
    notDone,
    approvalExpected: withCost && totals.grossSum !== null ? needsApproval('inventory', totals.grossSum, ctx.settings) : null,
    approvalThreshold: { amount: ctx.settings.approvalThreshold, currency: ctx.settings.approvalThresholdCurrency, applies: (ctx.settings.approvalTypes || []).includes('inventory') },
    cost: withCost,
  };
}

/**
 * POST /inventory/:id/recount { binId (0 = «без ячейки»), itemId? } — the
 * counts of that item (or the whole bin) are cleared and the bin goes back to
 * the counters marked «пересчитать».
 */
export async function requestRecount(req, id, input = {}) {
  const { ctx, session } = await managedSession(req, id);
  if (!COUNTING.includes(session.status)) throw httpError(409, 'Not possible in this status', 'BAD_TRANSITION');
  const binId = intOrNull(input.binId);
  const itemId = intOrNull(input.itemId);
  let assignee = null;
  await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM wh_inv_areas WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2 FOR UPDATE`, [session.id, binId || 0]);
    if (!rows[0]) throw httpError(400, 'This bin is not in the inventory', 'NOT_IN_SCOPE');
    assignee = rows[0].assignee_id;
    const itemSql = itemId ? ' AND item_id = $3' : '';
    const args = itemId ? [session.id, binId || 0, itemId] : [session.id, binId || 0];
    await client.query(`DELETE FROM wh_inv_counts WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2${itemSql}`, args);
    await client.query(`DELETE FROM wh_inv_finals WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2${itemSql}`, args);
    await client.query(`INSERT INTO wh_inv_recounts (session_id, bin_id, item_id, requested_by) VALUES ($1, $2, $3, $4)`, [session.id, binId, itemId, ctx.userId]);
    await client.query(`UPDATE wh_inv_areas SET status = 'recount', done_at = NULL, done_by = NULL, updated_at = NOW() WHERE id = $1`, [rows[0].id]);
  });
  if (assignee) {
    const path = binId ? (await binPaths([binId])).get(binId) : null;
    const item = itemId ? (await query(`SELECT name FROM wh_items WHERE id = $1`, [itemId])).rows[0]?.name : null;
    notify({ userIds: [assignee], kind: 'warehouse.inventory_assigned', module: 'warehouse', link: `/app/warehouse/m/inventory/${session.id}`, actorId: ctx.userId, render: warehouseMessage('inventoryRecount', { session: { number: session.number }, bin: path, item }) }).catch(() => {});
  }
  return getSession(req, id);
}

/** PUT /inventory/:id/final { binId, itemId, instanceId?, qty | null } — the manager decides a row (a conflict), null clears it. */
export async function setFinal(req, id, input = {}) {
  const { ctx, session } = await managedSession(req, id);
  if (!COUNTING.includes(session.status)) throw httpError(409, 'Not possible in this status', 'BAD_TRANSITION');
  const binId = intOrNull(input.binId);
  const itemId = intOrNull(input.itemId);
  const instanceId = intOrNull(input.instanceId);
  if (!itemId) throw httpError(400, 'Choose the item', 'LINE_ITEM_REQUIRED');
  const keyArgs = [session.id, binId || 0, itemId, instanceId || 0];
  if (input.qty === null || input.qty === undefined || input.qty === '') {
    await query(`DELETE FROM wh_inv_finals WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2 AND item_id = $3 AND COALESCE(instance_id, 0) = $4`, keyArgs);
  } else {
    const qty = Number(String(input.qty).replace(',', '.'));
    if (!Number.isFinite(qty) || qty < 0 || qty > 1e9) throw httpError(400, 'Invalid quantity', 'BAD_QTY');
    if (instanceId && qty > 1) throw httpError(400, 'One instance is one piece', 'INSTANCE_QTY');
    const { rows: area } = await query(`SELECT 1 FROM wh_inv_areas WHERE session_id = $1 AND COALESCE(bin_id, 0) = $2`, [session.id, binId || 0]);
    if (!area.length) throw httpError(400, 'This bin is not in the inventory', 'NOT_IN_SCOPE');
    await query(
      `INSERT INTO wh_inv_finals (session_id, bin_id, item_id, instance_id, qty, decided_by) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, COALESCE(bin_id, 0), item_id, COALESCE(instance_id, 0)) DO UPDATE SET qty = EXCLUDED.qty, decided_by = EXCLUDED.decided_by, decided_at = NOW()`,
      [session.id, binId, itemId, instanceId, q4(qty), ctx.userId]
    );
  }
  return reconcileSession(req, id, { onlyDiff: input.onlyDiff });
}

/**
 * POST /inventory/:id/finish { force? } — ONE `inventory` act with the
 * counted rows of the counted bins (bins not marked done are left out:
 * `force` confirms that), posted at once or sent to approval when the gross
 * difference is above the threshold. The session stays «finished» with the act.
 */
export async function finishSession(req, id, input = {}) {
  const { ctx, session } = await managedSession(req, id);
  if (!COUNTING.includes(session.status)) throw httpError(409, 'Not possible in this status', 'BAD_TRANSITION', { status: session.status });
  const { createDoc, postDoc } = await import('./documents.js');
  const docId = await withTransaction(async (client) => {
    // The lock first, then the counts: a phone's sync holds the session FOR SHARE, so the act sees every op committed before it.
    const current = await loadSession(session.id, client, 'FOR UPDATE');
    if (!COUNTING.includes(current.status)) throw httpError(409, 'The inventory has changed, reload it', 'STALE');
    const { rows, areas, elsewhere, book, items } = await reviewData(ctx, current, { withCost: false, db: client });
    const notDone = areas.filter((a) => a.status !== 'done');
    if (notDone.length && input.force !== true) throw httpError(409, `${notDone.length} bins are not counted yet`, 'AREAS_NOT_DONE', { count: notDone.length });
    const lines = actLines(rows, { elsewhere, book });
    if (!lines.length) throw httpError(400, 'Nothing was counted', 'NOTHING_COUNTED');
    // More pieces of a serial item than the book, without their instances (a manager's decision): which ones?
    const unnamed = lines.find((line) => !line.instanceId && items.get(line.itemId)?.tracking === 'serial' && line.countedQty > line.bookQty + EPS);
    if (unnamed) throw httpError(409, `${items.get(unnamed.itemId).name}: a found piece of a serial item is recorded by its instance (scan its label)`, 'SERIAL_INSTANCE_REQUIRED', { itemId: unnamed.itemId });
    const twice = instancesTwice(lines);
    if (twice.length) {
      const { rows: inst } = await client.query(`SELECT inventory_no FROM wh_instances WHERE id = ANY($1::int[]) ORDER BY inventory_no`, [twice]);
      throw httpError(409, `Counted in two places: ${inst.map((i) => i.inventory_no).join(', ')} — decide where it is`, 'INSTANCE_TWICE', { instanceIds: twice, inventoryNos: inst.map((i) => i.inventory_no), inventoryNo: inst[0]?.inventory_no || '' });
    }
    const comment = [current.number, current.title].filter(Boolean).join(' · ');
    const doc = await createDoc(req, { type: 'inventory', warehouseId: current.warehouse_id, comment }, { client });
    const { rows: itemRows } = await client.query(`SELECT id, base_unit FROM wh_items WHERE id = ANY($1::int[])`, [[...new Set(lines.map((l) => l.itemId))]]);
    const unitOf = new Map(itemRows.map((r) => [r.id, r.base_unit]));
    for (const [index, line] of lines.entries()) {
      await client.query(
        `INSERT INTO wh_doc_lines (doc_id, sort, item_id, qty, unit, factor, base_qty, bin_id, instance_id, counted_qty, book_qty, note) VALUES ($1, $2, $3, 0, $4, 1, 0, $5, $6, $7, $8, $9)`,
        [doc.id, index, line.itemId, unitOf.get(line.itemId) || 'шт', line.binId, line.instanceId, line.countedQty, line.bookQty, current.number]
      );
    }
    await client.query(`UPDATE wh_inv_sessions SET status = 'finished', doc_id = $2, finished_at = NOW(), finished_by = $3, closed_at = COALESCE(closed_at, NOW()), updated_at = NOW() WHERE id = $1`, [current.id, doc.id, ctx.userId]);
    await logEvent(client, 'doc', doc.id, ctx.userId, 'inventory_session', { session: current.number, sessionId: current.id, lines: lines.length });
    if (current.schedule_id) {
      const today = await todayFor(req);
      const { rows: sched } = await client.query(`SELECT every_days FROM wh_inv_schedules WHERE id = $1`, [current.schedule_id]);
      if (sched[0]) await client.query(`UPDATE wh_inv_schedules SET next_on = $2, last_session_id = $3 WHERE id = $1`, [current.schedule_id, nextDue(today, sched[0].every_days), current.id]);
    }
    return doc.id;
  });
  let postError = null;
  try {
    await postDoc(req, docId, { comment: input.comment });
  } catch (err) {
    if (!err.statusCode || err.statusCode >= 500) throw err;
    postError = { code: err.code || 'ERROR', message: err.message, info: err.info || null };
  }
  const card = await getSession(req, id);
  return { ...card, postError };
}

// ── Schedules of regular partial counts ─────────────────────────────────────

async function scheduleShape(rows) {
  const whs = new Map((await query(`SELECT id, name FROM wh_warehouses WHERE id = ANY($1::int[])`, [[...new Set(rows.map((r) => r.warehouse_id))]])).rows.map((r) => [r.id, r.name]));
  const cats = await categoryNames(rows.flatMap((r) => r.category_ids || []));
  const paths = await binPaths(rows.flatMap((r) => r.bin_ids || []));
  const active = rows.length ? (await query(`SELECT schedule_id, id, number FROM wh_inv_sessions WHERE schedule_id = ANY($1::int[]) AND status IN ('draft', 'counting', 'review')`, [rows.map((r) => r.id)])).rows : [];
  const activeOf = new Map(active.map((a) => [a.schedule_id, { id: a.id, number: a.number }]));
  return rows.map((r) => ({
    id: r.id,
    warehouse: { id: r.warehouse_id, name: whs.get(r.warehouse_id) || '' },
    title: r.title || '',
    categories: (r.category_ids || []).map((cid) => ({ id: cid, name: cats.get(cid) || `#${cid}` })),
    bins: (r.bin_ids || []).map((bid) => ({ id: bid, path: paths.get(bid) || `#${bid}` })),
    everyDays: r.every_days,
    nextOn: typeof r.next_on === 'string' ? r.next_on : r.next_on ? `${r.next_on.getFullYear()}-${String(r.next_on.getMonth() + 1).padStart(2, '0')}-${String(r.next_on.getDate()).padStart(2, '0')}` : null,
    blind: r.blind,
    enabled: r.enabled,
    active: activeOf.get(r.id) || null,
  }));
}

export async function listSchedules(req, input = {}) {
  const ctx = await whContext(req);
  const ids = inventoryWarehouses(ctx);
  const wh = intOrNull(input.warehouse);
  const { rows } = await query(`SELECT * FROM wh_inv_schedules WHERE ($1::int[] IS NULL OR warehouse_id = ANY($1::int[])) AND ($2::int IS NULL OR warehouse_id = $2) ORDER BY next_on, id`, [ids, wh]);
  return { schedules: await scheduleShape(rows) };
}

async function cleanSchedule(ctx, input, current = {}) {
  const warehouseId = intOrNull(input.warehouseId ?? current.warehouse_id);
  const wh = await warehouseRow(warehouseId);
  if (!wh) throw httpError(400, 'Choose the warehouse', 'WAREHOUSE_REQUIRED');
  if (!ctx.can('inventory', wh.id)) throw httpError(403, 'Inventories are run by those with the «inventory» right on this warehouse', 'FORBIDDEN');
  const bins = input.binIds !== undefined ? await expandBins(wh.id, input.binIds) : { roots: current.bin_ids || [] };
  const cats = input.categoryIds !== undefined ? await expandCategories(input.categoryIds) : { roots: current.category_ids || [] };
  const every = Math.round(Number(input.everyDays ?? current.every_days ?? 30));
  if (!(every >= 1 && every <= 366)) throw httpError(400, 'Every 1 to 366 days', 'BAD_INTERVAL');
  const { day } = await import('./logic.js');
  const nextOn = input.nextOn !== undefined ? day(input.nextOn) : current.next_on;
  if (!nextOn) throw httpError(400, 'Choose the first date', 'BAD_DATE');
  return { warehouse_id: wh.id, title: text(input.title ?? current.title, 200), bin_ids: bins.roots, category_ids: cats.roots, every_days: every, next_on: nextOn, blind: input.blind ?? current.blind ?? false, enabled: input.enabled ?? current.enabled ?? true };
}

export async function saveSchedule(req, id, input = {}) {
  const ctx = await whContext(req);
  let current = {};
  if (id) {
    const { rows } = await query(`SELECT * FROM wh_inv_schedules WHERE id = $1`, [intOrNull(id) || 0]);
    if (!rows[0]) throw httpError(404, 'Schedule not found', 'NOT_FOUND');
    current = rows[0];
    if (!ctx.can('inventory', current.warehouse_id)) throw httpError(403, 'Forbidden', 'FORBIDDEN');
  }
  const v = await cleanSchedule(ctx, input, current);
  if (id) {
    await query(`UPDATE wh_inv_schedules SET warehouse_id = $2, title = $3, bin_ids = $4, category_ids = $5, every_days = $6, next_on = $7, blind = $8, enabled = $9 WHERE id = $1`, [current.id, v.warehouse_id, v.title, v.bin_ids, v.category_ids, v.every_days, v.next_on, Boolean(v.blind), Boolean(v.enabled)]);
  } else {
    await query(`INSERT INTO wh_inv_schedules (warehouse_id, title, bin_ids, category_ids, every_days, next_on, blind, enabled, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [v.warehouse_id, v.title, v.bin_ids, v.category_ids, v.every_days, v.next_on, Boolean(v.blind), Boolean(v.enabled), ctx.userId]);
  }
  return listSchedules(req, {});
}

export async function deleteSchedule(req, id) {
  const ctx = await whContext(req);
  const { rows } = await query(`SELECT * FROM wh_inv_schedules WHERE id = $1`, [intOrNull(id) || 0]);
  if (!rows[0]) throw httpError(404, 'Schedule not found', 'NOT_FOUND');
  if (!ctx.can('inventory', rows[0].warehouse_id)) throw httpError(403, 'Forbidden', 'FORBIDDEN');
  await query(`DELETE FROM wh_inv_schedules WHERE id = $1`, [rows[0].id]);
  return listSchedules(req, {});
}

/** People who run inventories of a warehouse: the MOL and those assigned «inventory» / «admin» there. */
export async function inventoryKeepers(warehouseId) {
  const { rows } = await query(
    `SELECT mol_id AS id FROM wh_warehouses WHERE id = $1 AND mol_id IS NOT NULL
     UNION
     SELECT DISTINCT u.id FROM wh_assignments a
     JOIN users u ON (a.subject_type = 'user' AND u.id = a.subject_id) OR (a.subject_type = 'group' AND u.id IN (SELECT user_id FROM user_group_members WHERE group_id = a.subject_id))
     WHERE a.warehouse_id = $1 AND ('inventory' = ANY(a.rights) OR 'admin' = ANY(a.rights)) AND (a.until IS NULL OR a.until >= CURRENT_DATE) AND u.is_active IS NOT FALSE`,
    [warehouseId]
  );
  return rows.map((row) => row.id).slice(0, 30);
}

/**
 * warehouse:inventory (hourly): a schedule that is due and has no running
 * session reminds the warehouse's MOL and inventory people — once on the due
 * day, then once a week while overdue (keys in wh_notices).
 */
export async function runInventoryReminders({ today: forcedToday, force = false } = {}) {
  if (!force) {
    const { getSettings, parseSettings } = await import('../../services/settings.js');
    if (!parseSettings(await getSettings()).modules.warehouse?.enabled) return { skipped: true };
  }
  const today = forcedToday || (await portalToday());
  const { rows } = await query(
    `SELECT sc.*, w.name AS warehouse_name FROM wh_inv_schedules sc JOIN wh_warehouses w ON w.id = sc.warehouse_id AND w.archived_at IS NULL
     WHERE sc.enabled AND sc.next_on <= $1::date
       AND NOT EXISTS (SELECT 1 FROM wh_inv_sessions s WHERE s.schedule_id = sc.id AND s.status IN ('draft', 'counting', 'review'))`,
    [today]
  );
  let sent = 0;
  for (const schedule of rows) {
    const nextOn = typeof schedule.next_on === 'string' ? schedule.next_on : `${schedule.next_on.getFullYear()}-${String(schedule.next_on.getMonth() + 1).padStart(2, '0')}-${String(schedule.next_on.getDate()).padStart(2, '0')}`;
    const key = reminderKey({ id: schedule.id, next_on: nextOn }, today);
    if (!key) continue;
    const { rows: fresh } = await query(`INSERT INTO wh_notices (key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key`, [key]);
    if (!fresh.length) continue;
    const cats = await categoryNames(schedule.category_ids || []);
    const people = await inventoryKeepers(schedule.warehouse_id);
    await notify({ userIds: people, kind: 'warehouse.inventory_due', module: 'warehouse', link: `/app/warehouse/inventory?schedule=${schedule.id}`, render: warehouseMessage('inventoryDue', { warehouse: schedule.warehouse_name, title: schedule.title, categories: [...cats.values()], due: nextOn, everyDays: schedule.every_days }) }).catch(() => {});
    sent += 1;
  }
  return { sent };
}
