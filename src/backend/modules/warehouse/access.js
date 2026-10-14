import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { isoDay } from '../../services/datetime.js';
import { portalRegional, requestRegional } from '../../services/regional.js';
import { avatarOf } from '../shared/acl.js';
import { isParticipant } from '../approvals/api.js';
import { RIGHTS, globalRights, rightsOn, docWarehouses, httpError } from './logic.js';

/*
 * Who may do what (spec §9, docs/warehouse.md#permissions):
 *   - a portal permission `warehouse.<right>` grants the right on every warehouse;
 *   - an assignment (wh_assignments: a person or a group, a list of rights,
 *     optionally until a date) grants rights on one warehouse — the «zone of
 *     responsibility»;
 *   - the MOL of a warehouse may view, file requisitions, operate, write off
 *     and count there;
 *   - with the setting everyoneCanView every signed-in person views stock
 *     (without sums) and files requisitions;
 *   - `warehouse.cost` decides whether sums are sent at all (routes strip them).
 */

export const APPROVAL_TYPE = 'warehouse.document';

export async function warehouseSettings() {
  const parsed = parseSettings(await getSettings());
  return { ...parsed.modules.warehouse.settings };
}

export async function modulesState() {
  const parsed = parseSettings(await getSettings());
  const on = (id) => Boolean(parsed.modules[id]?.enabled);
  return { warehouse: on('warehouse'), procurement: on('procurement'), companies: on('companies'), crm: on('crm'), masterplan: on('masterplan'), tasks: on('tasks'), contracts: on('contracts'), chat: on('chat') };
}

async function loadZones(userId, groupIds) {
  const assignments = new Map();
  const molOf = new Set();
  if (!userId) return { assignments, molOf };
  const [{ rows }, { rows: mols }] = await Promise.all([
    query(
      `SELECT warehouse_id, rights FROM wh_assignments
       WHERE ((subject_type = 'user' AND subject_id = $1) OR (subject_type = 'group' AND subject_id = ANY($2::int[])))
         AND (until IS NULL OR until >= CURRENT_DATE)`,
      [userId, groupIds]
    ),
    query(`SELECT id FROM wh_warehouses WHERE mol_id = $1`, [userId]),
  ]);
  for (const row of rows) {
    const set = assignments.get(row.warehouse_id) || new Set();
    for (const right of row.rights || []) if (RIGHTS.includes(right)) set.add(right);
    assignments.set(row.warehouse_id, set);
  }
  for (const row of mols) molOf.add(row.id);
  return { assignments, molOf };
}

/** The access context of a request (or a request-like object from requestAs). Cached on req. */
export async function whContext(req, settingsArg = null) {
  if (req?.wh && !settingsArg) return req.wh;
  const settings = settingsArg || (await warehouseSettings());
  const system = req?.system === true;
  const perms = system ? ['*'] : req?.access?.permissions || req?.user?.permissions || [];
  const userId = req?.user?.id ? Number(req.user.id) : null;
  const groupIds = (req?.access?.groupIds || req?.access?.groups?.map?.((group) => group.id) || []).map(Number);
  // An API token narrowed to some resources never gets the administrator's bypass.
  const global = globalRights(req?.apiLimits ? perms.filter((perm) => perm !== '*' && perm !== 'warehouse.admin') : perms, settings);
  const { assignments, molOf } = await loadZones(userId, groupIds);
  const zones = { global, assignments, molOf };
  const cache = new Map();
  const ctx = {
    req,
    userId,
    groupIds,
    settings,
    global,
    assignments,
    molOf,
    isAdmin: global.has('admin'),
    rights(warehouseId) {
      if (warehouseId === null || warehouseId === undefined) return new Set(global);
      const key = Number(warehouseId);
      if (!cache.has(key)) cache.set(key, rightsOn(zones, key));
      return cache.get(key);
    },
    can(right, warehouseId) {
      return ctx.rights(warehouseId).has(right);
    },
    /** Holds the right on at least one warehouse. */
    canAny(right) {
      if (global.has(right) || global.has('admin')) return true;
      for (const id of new Set([...assignments.keys(), ...molOf])) if (ctx.can(right, id)) return true;
      return false;
    },
    /** Warehouse ids the person sees, or null for all. */
    visibleIds() {
      if (global.has('view')) return null;
      return [...new Set([...assignments.keys(), ...molOf])];
    },
    sees(warehouseId) {
      return warehouseId !== null && warehouseId !== undefined && ctx.can('view', warehouseId);
    },
  };
  ctx.costAny = ctx.canAny('cost');
  if (req && !settingsArg) req.wh = ctx;
  return ctx;
}

/** Does the person see sums on every warehouse in the list (or all, for null)? */
export function costOn(ctx, warehouseIds) {
  if (!ctx.costAny) return false;
  if (warehouseIds === null) return ctx.global.has('cost');
  return warehouseIds.every((id) => ctx.can('cost', id));
}

/** Small parameter collector for dynamic SQL. */
export class Params {
  constructor() {
    this.values = [];
  }
  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** SQL over `d` (wh_docs) for "may see the document", or null when everything. */
export function docVisibleSql(ctx, p) {
  const ids = ctx.visibleIds();
  if (ids === null) return null;
  if (!ctx.userId) return 'FALSE';
  const me = p.add(ctx.userId);
  const list = p.add(ids);
  return `(d.warehouse_id = ANY(${list}::int[]) OR d.to_warehouse_id = ANY(${list}::int[]) OR d.author_id = ${me} OR d.created_by = ${me}
    OR (d.to_holder_type = 'employee' AND d.to_holder_id = ${me}) OR (d.from_holder_type = 'employee' AND d.from_holder_id = ${me})
    OR EXISTS (SELECT 1 FROM approval_processes ap WHERE ap.type = '${APPROVAL_TYPE}' AND ap.doc_id = d.id::text AND ap.author_id = ${me}))`;
}

/** May the person see this document row? */
export async function canSeeDoc(ctx, row) {
  if (!row) return false;
  if (docWarehouses(row).some((id) => ctx.sees(id))) return true;
  if (!ctx.userId) return false;
  const me = ctx.userId;
  if (row.author_id === me || row.created_by === me) return true;
  if ((row.to_holder_type === 'employee' && row.to_holder_id === me) || (row.from_holder_type === 'employee' && row.from_holder_id === me)) return true;
  if (!ctx.req) return false;
  return isParticipant(ctx.req, APPROVAL_TYPE, String(row.id)).catch(() => false);
}

export async function requireRight(ctx, right, warehouseId, message) {
  if (!ctx.can(right, warehouseId)) throw httpError(403, message || 'You do not have the right for this warehouse', 'FORBIDDEN', { right, warehouseId });
}

// ── People and days ─────────────────────────────────────────────────────────

export async function usersByIds(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users WHERE id = ANY($1)`, [list]);
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, avatarUrl: avatarOf(row.avatar_path) }]));
}

export async function todayFor(req) {
  const regional = await requestRegional(req);
  return isoDay(new Date(), regional.timeZone);
}

export async function portalToday() {
  return isoDay(new Date(), (await portalRegional()).timeZone);
}

export async function logEvent(client, entityType, entityId, actorId, action, data = {}) {
  await client.query(`INSERT INTO wh_events (entity_type, entity_id, actor_id, action, data) VALUES ($1, $2, $3, $4, $5)`, [entityType, entityId, actorId || null, action, JSON.stringify(data)]);
}

export const text = (value, max) => {
  const out = String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
  return out || null;
};

export const intOrNull = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null;
};

/** node-pg returns DATE as local midnight: the calendar day without a zone shift. */
export function isoDayOf(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
