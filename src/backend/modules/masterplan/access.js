import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { getAccessMap } from '../../services/rbac.js';
import { httpError } from '../shared/acl.js';
import { actCaps, globalRoles, has, readCaps, seesProject } from './rules.js';

/*
 * Who may do what (docs/masterplan.md "Roles and zones"):
 *   - a portal permission `masterplan.<role>` grants the role in every project;
 *   - an assignment (mp_assignments) grants a role in one project, limited to
 *     a node's subtree when node_id is set (zone of responsibility), possibly
 *     until a date (temporary access);
 *   - a person sees a project when they hold any role in it; reading uses every
 *     role they have in the project, acting only the roles whose zone contains
 *     the node (rules.js).
 */

export async function mpSettings() {
  const parsed = parseSettings(await getSettings());
  return { ...parsed.modules.masterplan.settings };
}

export async function modulesEnabled() {
  const parsed = parseSettings(await getSettings());
  return { crm: Boolean(parsed.modules.crm?.enabled), companies: Boolean(parsed.modules.companies?.enabled) };
}

export async function loadAssignments(userId, groupIds = []) {
  if (!userId) return [];
  const { rows } = await query(
    `SELECT project_id, node_id, role FROM mp_assignments
     WHERE ((subject_type = 'user' AND subject_id = $1) OR (subject_type = 'group' AND subject_id = ANY($2::int[])))
       AND (until IS NULL OR until >= CURRENT_DATE)`,
    [userId, groupIds]
  );
  return rows.map((row) => ({ projectId: row.project_id, nodeId: row.node_id, role: row.role }));
}

/** The access context of a request (or of a request-like object from requestAs). */
export async function mpContext(req, settings) {
  const access = req.access || {};
  const userId = req.user?.id || null;
  const roles = globalRoles(access.permissions || []);
  return {
    userId,
    globalRoles: roles,
    isAdmin: roles.has('admin'),
    assignments: await loadAssignments(userId, access.groupIds || []),
    settings: settings || (await mpSettings()),
  };
}

export const notFound = (what = 'Not found') => httpError(404, what, 'NOT_FOUND');
export const forbidden = (message = 'You do not have permission for this action', code = 'FORBIDDEN') => httpError(403, message, code);

/** Projects the person sees: every project for global roles, else those with an assignment. */
export function visibleProjectIds(ctx) {
  if (ctx.globalRoles.size) return null; // all
  return [...new Set(ctx.assignments.map((item) => item.projectId))];
}

export async function requireProject(ctx, id) {
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId < 1) throw notFound('Project not found');
  const { rows } = await query(`SELECT * FROM mp_projects WHERE id = $1`, [projectId]);
  if (!rows[0] || !seesProject(ctx, projectId)) throw notFound('Project not found');
  return rows[0];
}

export async function loadNode(id, client = { query }) {
  const nodeId = Number(id);
  if (!Number.isInteger(nodeId) || nodeId < 1) return null;
  const { rows } = await client.query(
    `SELECT n.*, t.key AS type_key, t.name AS type_name, t.sellable, t.stage_set, t.category, t.icon AS type_icon, t.color AS type_color
     FROM mp_nodes n LEFT JOIN mp_types t ON t.id = n.type_id WHERE n.id = $1`,
    [nodeId]
  );
  return rows[0] || null;
}

/** A node of a project the person sees (404 otherwise). */
export async function requireNode(ctx, id, client) {
  const node = await loadNode(id, client);
  if (!node || !seesProject(ctx, node.project_id)) throw notFound('Object not found');
  return node;
}

/** 403 unless the person's roles whose zone contains `node` give `cap`. */
export function requireAct(ctx, node, cap) {
  if (!has(actCaps(ctx, node), cap)) throw forbidden();
}

export function requireRead(ctx, projectId, cap) {
  if (!has(readCaps(ctx, projectId), cap)) throw forbidden();
}

export function requireAdmin(ctx) {
  if (!ctx.isAdmin) throw forbidden();
}

/** May configure this project (hierarchy, contours, team): a masterplan administrator, global or assigned on the project. */
export function canConfigure(ctx, projectId) {
  if (ctx.isAdmin) return true;
  return ctx.assignments.some((item) => item.projectId === Number(projectId) && !item.nodeId && item.role === 'admin');
}

export function requireConfigure(ctx, projectId) {
  if (!canConfigure(ctx, projectId)) throw forbidden();
}

/**
 * Active people holding one of `roles` where `node` is (for notifications).
 * Portal permissions count only when granted explicitly (super administrators'
 * `*` would make them get every sales notification).
 */
export async function usersWithRole(roles, node) {
  const wanted = new Set(roles);
  const ids = new Set();
  const { rows: active } = await query(`SELECT id FROM users WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE`);
  const map = await getAccessMap(active.map((row) => row.id));
  for (const [userId, access] of map) {
    if ((access.permissions || []).some((perm) => perm.startsWith('masterplan.') && wanted.has(perm.slice('masterplan.'.length)))) ids.add(userId);
  }
  if (node) {
    const { rows } = await query(
      `SELECT a.subject_type, a.subject_id FROM mp_assignments a
       WHERE a.project_id = $1 AND a.role = ANY($2::text[]) AND (a.node_id IS NULL OR a.node_id = ANY($3::int[]))
         AND (a.until IS NULL OR a.until >= CURRENT_DATE)`,
      [node.project_id, [...wanted], node.path || []]
    );
    const groups = rows.filter((row) => row.subject_type === 'group').map((row) => row.subject_id);
    for (const row of rows) if (row.subject_type === 'user') ids.add(row.subject_id);
    if (groups.length) {
      const { rows: members } = await query(`SELECT user_id FROM user_group_members WHERE group_id = ANY($1::int[])`, [groups]);
      for (const row of members) ids.add(row.user_id);
    }
  }
  const activeIds = new Set(active.map((row) => row.id));
  return [...ids].filter((id) => activeIds.has(id));
}
