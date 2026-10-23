import { query } from '../../config/database.js';
import { activeProvider } from './providers.js';
import { loadUnits } from './service.js';
import { ancestorIds, buildTree, byId, descendantIds, pathNames, walkManager } from './logic.js';

/*
 * Org structure API for modules (docs/org-structure.md → «Core API»). Import
 * only this file:
 *
 *   import { orgUnits, unitOf, managerOf, descendants, unitsByPurpose } from '../org/api.js';
 *
 *   await orgUnits()                         // [{ id, parentId, type, name, code, status, purposes, path, … }] (active units)
 *   await orgUnits({ includeClosed: true, tree: true })
 *   await unitOf({ userId: 7 })              // { id, name, type, path, … } | null — the account's unit
 *   await unitOf({ employeeId: 12 })         // through the Employees module (null while it is off)
 *   await managerOf(7)                       // user id of the person's manager | null
 *   await managerOf(7, { level: 2 })         // the manager's manager
 *   await descendants(3)                     // ids below unit 3 (add { includeSelf: true } for 3 too)
 *   await unitsByPurpose('warehouse')        // active units with that purpose, e.g. sites with a store
 *   await colleaguesOf(7, { subtree: true }) // account ids in the same unit (and below): «моё подразделение»
 *
 * managerOf rules: an explicit manager on the person's employee card wins
 * (Employees on, the manager has an active portal account); otherwise the
 * head of the person's unit; when the person is that head, or the unit has
 * no active head, the head of the parent unit, and so on up to the root.
 * Heads are portal accounts (org_units.head_user_id) or employees with a
 * portal account (head_employee_id, Employees on). null when nobody fits —
 * callers decide the fallback (Approvals: escalation people, then admins).
 */

const withPath = (units) => {
  const map = byId(units);
  return units.map((unit) => ({ ...unit, path: pathNames(map, unit.id) }));
};

export async function orgUnits({ includeClosed = false, tree = false } = {}) {
  const all = await loadUnits({ includeClosed: true });
  const list = withPath(all).filter((unit) => includeClosed || unit.status === 'active');
  return tree ? buildTree(list) : list;
}

async function unitById(id, units = null) {
  if (!id) return null;
  const list = units || (await loadUnits());
  const unit = list.find((item) => item.id === Number(id));
  return unit ? { ...unit, path: pathNames(list, unit.id) } : null;
}

/** The unit of a portal account ({ userId }) or of an employee card ({ employeeId }). */
export async function unitOf(subject = {}) {
  if (subject.employeeId) {
    const provider = await activeProvider();
    const placed = provider?.employeeUnit ? await provider.employeeUnit(Number(subject.employeeId)) : null;
    return placed?.unitId ? unitById(placed.unitId) : null;
  }
  const userId = Number(subject.userId ?? subject);
  if (!Number.isInteger(userId) || userId < 1) return null;
  const { rows } = await query(`SELECT org_unit_id FROM users WHERE id = $1`, [userId]);
  return rows[0]?.org_unit_id ? unitById(rows[0].org_unit_id) : null;
}

async function activeUsers(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Set();
  const { rows } = await query(`SELECT id FROM users WHERE id = ANY($1) AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [list]);
  return new Set(rows.map((row) => row.id));
}

async function managerOnce(userId, units, provider) {
  if (provider?.explicitManagerOf) {
    const explicit = await provider.explicitManagerOf(userId);
    if (explicit && explicit !== userId && (await activeUsers([explicit])).has(explicit)) return { userId: explicit, unitId: null, explicit: true };
  }
  const { rows } = await query(`SELECT org_unit_id FROM users WHERE id = $1`, [userId]);
  const unitId = rows[0]?.org_unit_id;
  if (!unitId) return null;
  const chain = ancestorIds(units, unitId);
  const map = byId(units);
  const employeeHeads = provider?.usersOfEmployees ? await provider.usersOfEmployees(chain.map((id) => map.get(id)?.headEmployeeId).filter(Boolean)) : new Map();
  const headOf = (unit) => (unit?.headEmployeeId ? employeeHeads.get(unit.headEmployeeId) || unit.headUserId || null : unit?.headUserId || null);
  const active = await activeUsers(chain.map((id) => headOf(map.get(id))));
  return walkManager({ units: map, unitId, userId, headOf, isActive: (id) => active.has(id) });
}

/**
 * The manager of a portal account as a user id (see the rules above).
 * `level` 2 = the manager's manager. `detail: true` returns { userId, unitId, explicit } instead.
 */
export async function managerOf(userId, { level = 1, detail = false } = {}) {
  let current = Number(userId);
  if (!Number.isInteger(current) || current < 1) return null;
  const units = await loadUnits();
  const provider = await activeProvider();
  let found = null;
  const seen = new Set([current]);
  for (let step = 0; step < Math.max(1, Math.min(3, Number(level) || 1)); step += 1) {
    found = await managerOnce(current, units, provider);
    if (!found || seen.has(found.userId)) return null;
    seen.add(found.userId);
    current = found.userId;
  }
  return detail ? found : found?.userId ?? null;
}

export async function descendants(unitId, { includeSelf = false } = {}) {
  const units = await loadUnits();
  const ids = descendantIds(units, unitId);
  return includeSelf ? [Number(unitId), ...ids] : ids;
}

export async function ancestors(unitId) {
  return ancestorIds(await loadUnits(), unitId);
}

export async function unitsByPurpose(tag, { includeClosed = false } = {}) {
  const purpose = String(tag || '');
  return (await orgUnits({ includeClosed })).filter((unit) => unit.purposes.includes(purpose));
}

/** Account ids in the person's unit (with `subtree`, also in the units below it). */
export async function colleaguesOf(userId, { subtree = false } = {}) {
  const unit = await unitOf({ userId });
  if (!unit) return [];
  const ids = subtree ? await descendants(unit.id, { includeSelf: true }) : [unit.id];
  const { rows } = await query(`SELECT id FROM users WHERE org_unit_id = ANY($1) AND is_active IS NOT FALSE`, [ids]);
  return rows.map((row) => row.id);
}

export { buildTree };

// Lower-level helpers for modules that work with the unit list themselves (Employees).
export { loadUnits };
export { byId, descendantIds, pathNames };
export { registerPeopleProvider } from './providers.js';
export { DEMO_HEADS, DEMO_UNITS } from './demoData.js';
