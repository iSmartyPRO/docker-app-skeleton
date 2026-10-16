import { query, withTransaction } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { portalRegional } from '../../services/regional.js';
import { recordSecurityEvent } from '../../services/security.js';
import { hasPermission } from '../../services/permissions.js';
import { assertCanManage } from '../../services/users.js';
import { avatarOf } from '../shared/acl.js';
import { activeProvider } from './providers.js';
import { ancestorIds, buildTree, byId, cleanUnitInput, descendantIds, effectiveTimeZone, httpError, pathNames, reorderSiblings, wouldCycle } from './logic.js';

/*
 * Org structure service (docs/org-structure.md): reading the tree for
 * everyone, editing it for `org.manage`. Every change is written to
 * org_unit_events (the unit's history) and moves / deletions also to the
 * security activity log.
 */

const MAX_UNITS = 5000;

export async function orgSettings() {
  const parsed = parseSettings(await getSettings());
  return parsed.modules.org?.settings || { types: [], purposes: [] };
}

const permsOf = (ctx) => ctx?.access?.permissions || ctx?.user?.permissions || [];
export const canManageOrg = (ctx) => ctx?.system === true || hasPermission(permsOf(ctx), 'org.manage');
const actorOf = (ctx) => (ctx?.user?.id ? Number(ctx.user.id) : null);

function assertManage(ctx) {
  if (!canManageOrg(ctx)) throw httpError(403, 'Only org structure managers can change it', 'FORBIDDEN');
}

export function toUnit(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    code: row.code || null,
    legalEntityId: row.legal_entity_id || null,
    headUserId: row.head_user_id || null,
    headEmployeeId: row.head_employee_id || null,
    address: row.address || null,
    timeZone: row.time_zone || null,
    status: row.status,
    purposes: row.purposes || [],
    note: row.note || null,
    sort: row.sort,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every unit as a flat list (closed ones too unless `includeClosed` is false). */
export async function loadUnits({ includeClosed = true, client = { query } } = {}) {
  const { rows } = await client.query(
    `SELECT * FROM org_units ${includeClosed ? '' : `WHERE status = 'active'`} ORDER BY sort, LOWER(name) LIMIT ${MAX_UNITS}`
  );
  return rows.map(toUnit);
}

async function usersByIds(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { rows } = await query(
    `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path, position_title, is_active, is_blocked FROM users WHERE id = ANY($1)`,
    [list]
  );
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, username: row.username, avatarUrl: avatarOf(row.avatar_path), position: row.position_title || null, active: row.is_active !== false && row.is_blocked !== true }]));
}

/**
 * Units with what the editor and the chart show: path, depth, effective zone,
 * head (person), legal entity, counts (children, portal accounts, employees).
 */
export async function listUnits({ includeClosed = true } = {}) {
  const units = await loadUnits({ includeClosed: true });
  const map = byId(units);
  const regional = await portalRegional().catch(() => ({ timeZone: 'UTC' }));
  const provider = await activeProvider();
  const heads = await usersByIds(units.map((unit) => unit.headUserId));
  const headEmployees = provider?.employeesById ? await provider.employeesById(units.map((unit) => unit.headEmployeeId).filter(Boolean)) : new Map();
  const { rows: counts } = await query(`SELECT org_unit_id, COUNT(*)::int AS n FROM users WHERE org_unit_id IS NOT NULL AND is_active IS NOT FALSE GROUP BY org_unit_id`);
  const userCount = new Map(counts.map((row) => [row.org_unit_id, row.n]));
  const headcount = provider?.headcount ? await provider.headcount() : null;
  const { rows: entities } = await query(`SELECT id, COALESCE(short_name, name) AS label FROM legal_entities`);
  const entityLabel = new Map(entities.map((row) => [row.id, row.label]));
  const childCount = new Map();
  for (const unit of units) if (unit.parentId) childCount.set(unit.parentId, (childCount.get(unit.parentId) || 0) + 1);
  const out = units
    .filter((unit) => includeClosed || unit.status === 'active')
    .map((unit) => {
      const employee = unit.headEmployeeId ? headEmployees.get(unit.headEmployeeId) : null;
      const user = unit.headUserId ? heads.get(unit.headUserId) : null;
      const head = employee
        ? { kind: 'employee', id: employee.id, name: employee.name, avatarUrl: employee.photoUrl || null, userId: employee.userId || null, position: employee.position || null }
        : user
          ? { kind: 'user', id: user.id, name: user.name, avatarUrl: user.avatarUrl, userId: user.id, position: user.position, active: user.active }
          : null;
      const zone = effectiveTimeZone(map, unit.id, regional.timeZone || 'UTC');
      return {
        ...unit,
        path: pathNames(map, unit.id),
        depth: ancestorIds(map, unit.id).length - 1,
        effectiveTimeZone: zone.timeZone,
        timeZoneInherited: zone.inherited,
        legalEntity: unit.legalEntityId ? { id: unit.legalEntityId, label: entityLabel.get(unit.legalEntityId) || `#${unit.legalEntityId}` } : null,
        head,
        counts: { children: childCount.get(unit.id) || 0, users: userCount.get(unit.id) || 0, employees: headcount ? headcount.get(unit.id) || 0 : null },
      };
    });
  return out;
}

/** The nested tree for the chart: [{ ...unit, children, total }], `total` = people in the subtree. */
export async function orgChart({ includeClosed = false } = {}) {
  const list = await listUnits({ includeClosed });
  const tree = buildTree(list);
  const sum = (node) => {
    const own = node.counts.employees ?? node.counts.users;
    node.total = own + node.children.reduce((acc, child) => acc + sum(child), 0);
    return node.total;
  };
  tree.forEach(sum);
  return tree;
}

async function logEvent(client, unitId, action, actorId, data = {}) {
  await client.query(`INSERT INTO org_unit_events (unit_id, action, actor_id, data) VALUES ($1, $2, $3, $4)`, [unitId, action, actorId, JSON.stringify(data)]);
}

function auditLog(ctx, detail) {
  recordSecurityEvent({ kind: 'org_structure', severity: 'info', username: ctx?.user?.username, ip: ctx?.ip, detail }).catch(() => {});
}

async function assertRefs(client, input, settings, unitId = null) {
  if (input.parentId) {
    const { rows } = await client.query(`SELECT id FROM org_units WHERE id = $1`, [input.parentId]);
    if (!rows[0]) throw httpError(400, 'The parent unit does not exist', 'BAD_PARENT');
    if (unitId) {
      const units = await loadUnits({ client });
      if (wouldCycle(units, unitId, input.parentId)) throw httpError(409, 'A unit cannot be moved under itself or its own subunit', 'ORG_CYCLE');
    }
  }
  if (input.legalEntityId) {
    const { rows } = await client.query(`SELECT id FROM legal_entities WHERE id = $1`, [input.legalEntityId]);
    if (!rows[0]) throw httpError(400, 'Unknown legal entity', 'BAD_LEGAL_ENTITY');
  }
  if (input.headUserId) {
    const { rows } = await client.query(`SELECT id FROM users WHERE id = $1`, [input.headUserId]);
    if (!rows[0]) throw httpError(400, 'Unknown head', 'BAD_HEAD');
  }
  if (input.type && settings) {
    const type = (settings.types || []).find((item) => item.key === input.type);
    if (type && !type.legal && input.legalEntityId) input.legalEntityId = null;
  }
}

const COLUMNS = {
  parentId: 'parent_id',
  type: 'type',
  name: 'name',
  code: 'code',
  legalEntityId: 'legal_entity_id',
  headUserId: 'head_user_id',
  headEmployeeId: 'head_employee_id',
  address: 'address',
  timeZone: 'time_zone',
  status: 'status',
  purposes: 'purposes',
  note: 'note',
  sort: 'sort',
};

function uniqueCode(err) {
  if (err?.code === '23505') return httpError(409, 'Another unit already has this code', 'CODE_TAKEN');
  return err;
}

export async function getUnit(id) {
  const { rows } = await query(`SELECT * FROM org_units WHERE id = $1`, [Number(id) || 0]);
  if (!rows[0]) throw httpError(404, 'Unit not found', 'NOT_FOUND');
  return toUnit(rows[0]);
}

export async function createUnit(ctx, raw = {}) {
  assertManage(ctx);
  const settings = await orgSettings();
  const input = cleanUnitInput(raw, settings);
  if (input.headUserId && input.headEmployeeId) input.headUserId = null;
  try {
    return await withTransaction(async (client) => {
      await assertRefs(client, input, settings);
      const { rows: last } = await client.query(`SELECT COALESCE(MAX(sort), 0) + 10 AS next FROM org_units WHERE parent_id IS NOT DISTINCT FROM $1`, [input.parentId]);
      const { rows } = await client.query(
        `INSERT INTO org_units (parent_id, type, name, code, legal_entity_id, head_user_id, head_employee_id, address, time_zone, status, purposes, note, sort, closed_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
        [input.parentId, input.type, input.name, input.code, input.legalEntityId, input.headUserId, input.headEmployeeId, input.address, input.timeZone, input.status, input.purposes, input.note, input.sort ?? last[0].next, input.status === 'closed' ? new Date() : null, actorOf(ctx)]
      );
      await logEvent(client, rows[0].id, 'created', actorOf(ctx), { name: input.name, parentId: input.parentId, type: input.type });
      return toUnit(rows[0]);
    });
  } catch (err) {
    throw uniqueCode(err);
  }
}

export async function updateUnit(ctx, id, raw = {}) {
  assertManage(ctx);
  const settings = await orgSettings();
  const unitId = (await getUnit(id)).id;
  const input = cleanUnitInput(raw, settings, { partial: true });
  if (input.headEmployeeId) input.headUserId = null;
  else if (input.headUserId) input.headEmployeeId = null;
  try {
    return await withTransaction(async (client) => {
      // A new parent: the same tree lock as moveUnit, so two moves cannot make a loop together.
      if (input.parentId !== undefined) await client.query(`SELECT pg_advisory_xact_lock(hashtext('org_units:tree'))`);
      const { rows: current } = await client.query(`SELECT * FROM org_units WHERE id = $1 FOR UPDATE`, [unitId]);
      if (!current[0]) throw httpError(404, 'Unit not found', 'NOT_FOUND');
      const before = toUnit(current[0]);
      await assertRefs(client, input, settings, before.id);
      const keys = Object.keys(input).filter((key) => COLUMNS[key]);
      const changes = {};
      for (const key of keys) {
        const a = JSON.stringify(before[key] ?? null);
        const b = JSON.stringify(input[key] ?? null);
        if (a !== b) changes[key] = { from: before[key] ?? null, to: input[key] ?? null };
      }
      if (!Object.keys(changes).length) return before;
      const sets = Object.keys(changes).map((key, index) => `${COLUMNS[key]} = $${index + 2}`);
      const values = Object.keys(changes).map((key) => input[key]);
      if (changes.status) sets.push(`closed_at = ${input.status === 'closed' ? 'NOW()' : 'NULL'}`);
      const { rows } = await client.query(`UPDATE org_units SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`, [before.id, ...values]);
      const action = changes.parentId ? 'moved' : changes.status ? (input.status === 'closed' ? 'closed' : 'reopened') : 'updated';
      await logEvent(client, before.id, action, actorOf(ctx), { changes });
      if (changes.parentId) auditLog(ctx, `moved «${before.name}» (#${before.id}) from #${before.parentId || 0} to #${input.parentId || 0}`);
      return toUnit(rows[0]);
    });
  } catch (err) {
    throw uniqueCode(err);
  }
}

/**
 * Drag and drop: `parentId` (null = top level) and the position among the
 * new siblings (`index`, 0-based; omitted = last). Refuses loops.
 */
export async function moveUnit(ctx, id, { parentId = null, index } = {}) {
  assertManage(ctx);
  const target = parentId === null || parentId === undefined || parentId === '' ? null : Number(parentId);
  if (target !== null && (!Number.isInteger(target) || target < 1)) throw httpError(400, 'Bad parent', 'BAD_PARENT');
  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('org_units:tree'))`);
    const units = await loadUnits({ client });
    const unit = units.find((item) => item.id === Number(id));
    if (!unit) throw httpError(404, 'Unit not found', 'NOT_FOUND');
    if (target !== null && !units.some((item) => item.id === target)) throw httpError(400, 'The parent unit does not exist', 'BAD_PARENT');
    if (wouldCycle(units, unit.id, target)) throw httpError(409, 'A unit cannot be moved under itself or its own subunit', 'ORG_CYCLE');
    const siblings = units
      .filter((item) => (item.parentId || null) === target && item.id !== unit.id)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru'))
      .map((item) => item.id);
    const order = reorderSiblings(siblings, unit.id, Number.isInteger(Number(index)) && index !== null && index !== undefined ? Number(index) : undefined);
    for (const item of order) await client.query(`UPDATE org_units SET sort = $2 WHERE id = $1 AND sort <> $2`, [item.id, item.sort]);
    const moved = (unit.parentId || null) !== target;
    if (moved) {
      await client.query(`UPDATE org_units SET parent_id = $2, updated_at = NOW() WHERE id = $1`, [unit.id, target]);
      await logEvent(client, unit.id, 'moved', actorOf(ctx), { changes: { parentId: { from: unit.parentId || null, to: target } } });
      auditLog(ctx, `moved «${unit.name}» (#${unit.id}) from #${unit.parentId || 0} to #${target || 0}`);
    } else {
      await logEvent(client, unit.id, 'reordered', actorOf(ctx), { index: order.findIndex((item) => item.id === unit.id) });
    }
    const { rows } = await client.query(`SELECT * FROM org_units WHERE id = $1`, [unit.id]);
    return toUnit(rows[0]);
  });
}

/** Deletes an empty unit (no subunits, nobody in it); otherwise close it instead. */
export async function deleteUnit(ctx, id) {
  assertManage(ctx);
  const unit = await getUnit(id);
  return withTransaction(async (client) => {
    const { rows: kids } = await client.query(`SELECT COUNT(*)::int AS n FROM org_units WHERE parent_id = $1`, [unit.id]);
    const { rows: people } = await client.query(`SELECT COUNT(*)::int AS n FROM users WHERE org_unit_id = $1`, [unit.id]);
    let employees = 0;
    if ((await client.query(`SELECT to_regclass('employees') AS t`)).rows[0].t) {
      employees = (await client.query(`SELECT COUNT(*)::int AS n FROM employees WHERE unit_id = $1 OR site_id = $1`, [unit.id])).rows[0].n;
    }
    if (kids[0].n || people[0].n || employees) {
      throw httpError(409, 'The unit has subunits or people: move them or close the unit instead', 'UNIT_IN_USE', { children: kids[0].n, users: people[0].n, employees });
    }
    await client.query(`DELETE FROM org_units WHERE id = $1`, [unit.id]);
    await logEvent(client, unit.id, 'deleted', actorOf(ctx), { name: unit.name, parentId: unit.parentId });
    auditLog(ctx, `deleted «${unit.name}» (#${unit.id})`);
    return { id: unit.id, deleted: true };
  });
}

/** History of a unit, newest first, with actor names. */
export async function unitHistory(id, { limit = 100 } = {}) {
  const { rows } = await query(
    `SELECT e.id, e.action, e.data, e.created_at, e.actor_id, COALESCE(u.display_name, u.username) AS actor_name
     FROM org_unit_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.unit_id = $1 ORDER BY e.id DESC LIMIT $2`,
    [Number(id) || 0, Math.min(500, Math.max(1, Number(limit) || 100))]
  );
  return rows.map((row) => ({ id: Number(row.id), action: row.action, data: row.data || {}, at: row.created_at, actor: row.actor_id ? { id: row.actor_id, name: row.actor_name } : null }));
}

/** Portal accounts of a unit (the light link users.org_unit_id). */
export async function unitMembers(id, { withDescendants = false } = {}) {
  let ids = [Number(id)];
  if (withDescendants) ids = [...ids, ...descendantIds(await loadUnits(), id)];
  const { rows } = await query(
    `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path, position_title, org_unit_id FROM users
     WHERE org_unit_id = ANY($1) AND is_active IS NOT FALSE ORDER BY LOWER(COALESCE(display_name, username)) LIMIT 1000`,
    [ids]
  );
  return rows.map((row) => ({ id: row.id, username: row.username, name: row.name, avatarUrl: avatarOf(row.avatar_path), position: row.position_title || null, unitId: row.org_unit_id }));
}

/**
 * The light «подразделение / должность» of a portal account. People with
 * `org.manage` or `users.manage` set it; an account linked to an employee
 * card (Employees on) follows the card instead (409 MANAGED_BY_EMPLOYEE).
 */
export async function setUserUnit(ctx, userId, { unitId = null, position } = {}) {
  const perms = permsOf(ctx);
  if (!(ctx?.system === true || hasPermission(perms, 'org.manage') || hasPermission(perms, 'users.manage'))) throw httpError(403, 'You cannot change this', 'FORBIDDEN');
  const id = Number(userId);
  const { rows } = await query(`SELECT id FROM users WHERE id = $1`, [id || 0]);
  if (!rows[0]) throw httpError(404, 'User not found', 'NOT_FOUND');
  // The unit decides who approves for the person: not for an account with more access than yours.
  if (ctx?.system !== true) {
    const actor = ctx.actor || { id: actorOf(ctx), permissions: new Set(perms) };
    await assertCanManage(actor, id).catch((err) => {
      throw httpError(403, err.message, 'FORBIDDEN');
    });
  }
  const provider = await activeProvider();
  if (provider?.employeeOfUser && (await provider.employeeOfUser(id))) throw httpError(409, 'The unit of this account follows its employee card', 'MANAGED_BY_EMPLOYEE');
  const unit = unitId === null || unitId === '' || unitId === undefined ? null : Number(unitId);
  if (unit !== null) await getUnit(unit);
  const title = position === undefined ? undefined : String(position || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 160) || null;
  if (title === undefined) await query(`UPDATE users SET org_unit_id = $2, updated_at = NOW() WHERE id = $1`, [id, unit]);
  else await query(`UPDATE users SET org_unit_id = $2, position_title = $3, updated_at = NOW() WHERE id = $1`, [id, unit, title]);
  return userPlacement(id);
}

/** Where a portal account sits: { unit, position, employee } (employee when linked and the module is on). */
export async function userPlacement(userId) {
  const { rows } = await query(`SELECT org_unit_id, position_title FROM users WHERE id = $1`, [Number(userId) || 0]);
  if (!rows[0]) return null;
  const provider = await activeProvider();
  const employee = provider?.employeeOfUser ? await provider.employeeOfUser(Number(userId)) : null;
  let unit = null;
  if (rows[0].org_unit_id) {
    const units = await loadUnits();
    const found = units.find((item) => item.id === rows[0].org_unit_id);
    if (found) unit = { id: found.id, name: found.name, type: found.type, path: pathNames(units, found.id) };
  }
  return { unit, position: rows[0].position_title || null, employee: employee || null, managed: Boolean(employee) };
}

export { buildTree };
