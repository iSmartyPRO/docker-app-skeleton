import { query } from '../../config/database.js';
import { getAccessMap } from '../../services/rbac.js';
import { hasPermission } from '../../services/permissions.js';
import { isoDay } from '../../services/datetime.js';
import { portalRegional } from '../../services/regional.js';
import { avatarOf } from '../shared/acl.js';

/*
 * Who may decide a seat, and who is told about it.
 *
 * A seat is one approver entry of a stage: a person, a role, a group (or,
 * for defaults, a permission such as "procurement.admin"). Any member of a
 * role or group may decide for it. A seat delegated to someone belongs to
 * that person only. An active substitute (approval_substitutes, date range
 * in the portal's zone) acts for the person they stand in for, with the
 * same rights; the decision records `on_behalf_of`.
 */

const ACTIVE_USER = `is_active IS NOT FALSE AND is_blocked IS NOT TRUE`;

/** Today in the portal's zone (substitution periods are calendar days). */
export async function portalToday(now = new Date()) {
  const regional = await portalRegional();
  return isoDay(now, regional.timeZone);
}

/** Ids of the people `userId` stands in for today. */
export async function substitutedBy(userId, client = { query }) {
  const today = await portalToday();
  const { rows } = await client.query(
    `SELECT s.user_id FROM approval_substitutes s JOIN users u ON u.id = s.user_id
     WHERE s.substitute_id = $1 AND s.starts_on <= $2::date AND s.ends_on >= $2::date`,
    [userId, today]
  );
  return [...new Set(rows.map((row) => row.user_id))];
}

/** Active substitutes of each given person today: Map(userId → [substituteId]). */
export async function substitutesOf(userIds, client = { query }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  const out = new Map();
  if (!ids.length) return out;
  const today = await portalToday();
  const { rows } = await client.query(
    `SELECT s.user_id, s.substitute_id FROM approval_substitutes s JOIN users u ON u.id = s.substitute_id
     WHERE s.user_id = ANY($1) AND s.starts_on <= $2::date AND s.ends_on >= $2::date AND u.${ACTIVE_USER}`,
    [ids, today]
  );
  for (const row of rows) {
    if (!out.has(row.user_id)) out.set(row.user_id, []);
    out.get(row.user_id).push(row.substitute_id);
  }
  return out;
}

/**
 * Everyone `userId` may act as now: themselves plus the people they stand in
 * for, with their roles, groups and permissions. One object per principal so
 * a decision can say on whose behalf it was taken.
 */
export async function principalsOf(userId) {
  const ids = [userId, ...(await substitutedBy(userId)).filter((id) => id !== userId)];
  const access = await getAccessMap(ids);
  return ids.map((id) => {
    const item = access.get(id) || { roles: [], groups: [], permissions: [] };
    return {
      userId: id,
      roleIds: (item.roles || []).map((role) => role.id),
      groupIds: (item.groups || []).map((group) => group.id),
      permissions: item.permissions || [],
    };
  });
}

/** Flattened principals for SQL filters. */
export function principalSets(principals) {
  return {
    userIds: [...new Set(principals.map((p) => p.userId))],
    roleIds: [...new Set(principals.flatMap((p) => p.roleIds))],
    groupIds: [...new Set(principals.flatMap((p) => p.groupIds))],
    permissions: [...new Set(principals.flatMap((p) => p.permissions))],
    star: principals.some((p) => p.permissions.includes('*')),
  };
}

/** SQL condition: seat `s` may be decided by one of the principals ($1 users, $2 roles, $3 groups, $4 permissions, $5 star). */
export function seatMatchSql(alias = 's', offset = 0) {
  const p = (n) => `$${n + offset}`;
  return `(${alias}.delegated_to = ANY(${p(1)}) OR (${alias}.delegated_to IS NULL AND (
    (${alias}.kind = 'user' AND ${alias}.ref_id = ANY(${p(1)}))
    OR (${alias}.kind = 'role' AND ${alias}.ref_id = ANY(${p(2)}))
    OR (${alias}.kind = 'group' AND ${alias}.ref_id = ANY(${p(3)}))
    OR (${alias}.kind = 'permission' AND (${p(5)} OR ${alias}.ref_key = ANY(${p(4)})))
  )))`;
}

export function seatMatchParams(sets) {
  return [sets.userIds, sets.roleIds, sets.groupIds, sets.permissions, sets.star];
}

/** The principal of `principals` that matches a seat (the person themselves first), or null. */
export function matchingPrincipal(seat, principals) {
  for (const principal of principals) {
    if (seat.delegated_to) {
      if (seat.delegated_to === principal.userId) return principal;
      continue;
    }
    if (seat.kind === 'user' && seat.ref_id === principal.userId) return principal;
    if (seat.kind === 'role' && principal.roleIds.includes(seat.ref_id)) return principal;
    if (seat.kind === 'group' && principal.groupIds.includes(seat.ref_id)) return principal;
    if (seat.kind === 'permission' && hasPermission(principal.permissions, seat.ref_key)) return principal;
  }
  return null;
}

/** Active people holding a role directly or through a group. */
async function roleMembers(roleIds) {
  if (!roleIds.length) return [];
  const { rows } = await query(
    `SELECT DISTINCT u.id FROM users u
     WHERE u.${ACTIVE_USER} AND (
       EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = ANY($1))
       OR EXISTS (SELECT 1 FROM user_group_members m JOIN group_roles gr ON gr.group_id = m.group_id WHERE m.user_id = u.id AND gr.role_id = ANY($1))
     )`,
    [roleIds]
  );
  return rows.map((row) => row.id);
}

async function groupMembers(groupIds) {
  if (!groupIds.length) return [];
  const { rows } = await query(
    `SELECT DISTINCT u.id FROM users u JOIN user_group_members m ON m.user_id = u.id WHERE m.group_id = ANY($1) AND u.${ACTIVE_USER}`,
    [groupIds]
  );
  return rows.map((row) => row.id);
}

/** Active people holding a permission (super administrators included). */
export async function permissionHolders(permission) {
  const { rows } = await query(`SELECT id FROM users WHERE ${ACTIVE_USER}`);
  const access = await getAccessMap(rows.map((row) => row.id));
  return rows.map((row) => row.id).filter((id) => hasPermission(access.get(id)?.permissions || [], permission));
}

/**
 * The people behind approver entries (seats or escalation refs), plus their
 * active substitutes unless `substitutes: false`.
 */
export async function peopleOf(entries, { substitutes = true } = {}) {
  const users = new Set();
  const roles = [];
  const groups = [];
  for (const entry of entries || []) {
    const delegated = entry.delegated_to ?? null;
    const kind = entry.kind;
    const id = entry.ref_id ?? entry.id;
    if (delegated) users.add(delegated);
    else if (kind === 'user' && id) users.add(Number(id));
    else if (kind === 'role' && id) roles.push(Number(id));
    else if (kind === 'group' && id) groups.push(Number(id));
    else if (kind === 'permission') for (const holder of await permissionHolders(entry.ref_key ?? entry.key)) users.add(holder);
  }
  for (const id of await roleMembers(roles)) users.add(id);
  for (const id of await groupMembers(groups)) users.add(id);
  if (users.size) {
    const { rows } = await query(`SELECT id FROM users WHERE id = ANY($1) AND ${ACTIVE_USER}`, [[...users]]);
    users.clear();
    for (const row of rows) users.add(row.id);
  }
  if (substitutes && users.size) {
    for (const list of (await substitutesOf([...users])).values()) for (const id of list) users.add(id);
  }
  return [...users];
}

/** People shapes by id: { id, name, username, avatarUrl }. */
export async function usersById(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users WHERE id = ANY($1)`, [list]);
  return new Map(rows.map((row) => [row.id, { id: row.id, username: row.username, name: row.name, avatarUrl: avatarOf(row.avatar_path) }]));
}

export async function rolesById(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, key, name, is_system FROM app_roles WHERE id = ANY($1)`, [list]);
  return new Map(rows.map((row) => [row.id, { id: row.id, key: row.key, name: row.name, isSystem: row.is_system }]));
}

export async function groupsById(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, name FROM app_groups WHERE id = ANY($1)`, [list]);
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name }]));
}

/** Labels for approver entries ({ kind, id|key }) → { kind, id, key, name, avatarUrl, members? }. */
export async function describeApprovers(entries) {
  const users = await usersById(entries.filter((e) => e.kind === 'user').map((e) => e.id ?? e.ref_id));
  const roles = await rolesById(entries.filter((e) => e.kind === 'role').map((e) => e.id ?? e.ref_id));
  const groups = await groupsById(entries.filter((e) => e.kind === 'group').map((e) => e.id ?? e.ref_id));
  return entries.map((entry) => {
    const id = entry.id ?? entry.ref_id ?? null;
    if (entry.kind === 'user') {
      const user = users.get(id);
      return { kind: 'user', id, name: user?.name || `#${id}`, avatarUrl: user?.avatarUrl || null, missing: !user };
    }
    if (entry.kind === 'role') return { kind: 'role', id, name: roles.get(id)?.name || `#${id}`, roleKey: roles.get(id)?.key || null, missing: !roles.get(id) };
    if (entry.kind === 'group') return { kind: 'group', id, name: groups.get(id)?.name || `#${id}`, missing: !groups.get(id) };
    return { kind: 'permission', key: entry.key ?? entry.ref_key, name: entry.key ?? entry.ref_key };
  });
}
