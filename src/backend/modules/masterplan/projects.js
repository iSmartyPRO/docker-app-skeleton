import { query, withTransaction } from '../../config/database.js';
import { localeFor } from '../../services/settings.js';
import { avatarOf, httpError } from '../shared/acl.js';
import { DEFAULT_LEVELS, PROJECT_CLASSES, PROJECT_STATUSES, ROLES, defaultLevels } from './constants.js';
import { canConfigure, forbidden, notFound, requireAdmin, requireConfigure, requireProject, visibleProjectIds } from './access.js';
import { has, readCaps, rolesIn } from './rules.js';
import { inheritReadiness, nodeSelect, visibleNode } from './shapes.js';
import { treeChanged } from './realtime.js';
import { projectPricing } from './pricing.js';
import { dayString, intOr, iso, logEvent, parseDay, parseNumber, text } from './util.js';

/*
 * Projects, their settings, the team (roles with zones), the site plan data
 * (every node with its sales data, plans and contours) and the plans editor.
 */

export const PROJECT_SETTING_DEFAULTS = {
  // Reports of foremen wait for the head of construction before they are published (§7.3).
  moderation: false,
  // Readiness of a building: 'stages' (weighted by the stage directory) or 'manual'.
  readinessMode: 'stages',
  // Level types offered in this project's tree.
  levels: DEFAULT_LEVELS,
};

export function projectSettings(raw = {}) {
  const out = { ...PROJECT_SETTING_DEFAULTS, ...(raw || {}) };
  if (!Array.isArray(out.levels) || !out.levels.length) out.levels = DEFAULT_LEVELS;
  return out;
}

function cleanProjectSettings(current, incoming = {}) {
  const next = projectSettings(current);
  if (typeof incoming.moderation === 'boolean') next.moderation = incoming.moderation;
  if (['stages', 'manual'].includes(incoming.readinessMode)) next.readinessMode = incoming.readinessMode;
  if (Array.isArray(incoming.levels)) {
    const seen = new Set();
    const levels = incoming.levels
      .map((item) => ({ key: text(item?.key, 24).toLowerCase().replace(/[^a-z0-9_]/g, ''), name: text(item?.name, 40) }))
      .filter((item) => item.key && item.name && !seen.has(item.key) && seen.add(item.key))
      .slice(0, 12);
    if (levels.length) next.levels = levels;
  }
  return next;
}

export function projectShape(row, ctx) {
  const roles = rolesIn(ctx, row.id);
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    description: row.description,
    class: row.class,
    currency: (row.currency || '').trim(),
    status: row.status,
    startDate: dayString(row.start_date),
    finishDate: dayString(row.finish_date),
    manager: row.manager_id ? { id: row.manager_id, name: row.manager_name, avatarUrl: avatarOf(row.manager_avatar) } : null,
    settings: projectSettings(row.settings),
    archived: Boolean(row.archived_at),
    myRoles: [...roles],
    caps: [...readCaps(ctx, row.id)],
    canConfigure: canConfigure(ctx, row.id),
    createdAt: iso(row.created_at),
  };
}

const PROJECT_SELECT = `SELECT p.*, COALESCE(m.display_name, m.username) AS manager_name, m.avatar_path AS manager_avatar
  FROM mp_projects p LEFT JOIN users m ON m.id = p.manager_id`;

export async function listProjects(ctx, { archived = false } = {}) {
  const ids = visibleProjectIds(ctx);
  if (ids && !ids.length) return [];
  const { rows } = await query(
    `${PROJECT_SELECT} WHERE ($1::int[] IS NULL OR p.id = ANY($1::int[])) ${archived ? '' : 'AND p.archived_at IS NULL'} ORDER BY p.sort, p.id`,
    [ids]
  );
  const counts = await query(
    `SELECT project_id, status, COUNT(*)::int AS n FROM mp_units WHERE project_id = ANY($1::int[]) GROUP BY project_id, status`,
    [rows.map((row) => row.id)]
  );
  return rows.map((row) => {
    const shape = projectShape(row, ctx);
    const own = counts.rows.filter((item) => item.project_id === row.id);
    shape.counts = has(readCaps(ctx, row.id), 'status.view') ? Object.fromEntries(own.map((item) => [item.status, item.n])) : null;
    shape.units = own.reduce((sum, item) => sum + item.n, 0);
    return shape;
  });
}

function projectFields(input, current = {}) {
  const out = {};
  if (input.name !== undefined) {
    out.name = text(input.name, 160);
    if (!out.name) throw httpError(400, 'Name the project', 'NAME_REQUIRED');
  }
  for (const [key, max] of [['code', 30], ['address', 300]]) if (input[key] !== undefined) out[key] = text(input[key], max) || null;
  if (input.description !== undefined) out.description = text(input.description, 5000) || null;
  if (input.class !== undefined) out.class = PROJECT_CLASSES.includes(input.class) ? input.class : null;
  if (input.status !== undefined) {
    if (!PROJECT_STATUSES.includes(input.status)) throw httpError(400, 'Unknown project status', 'INVALID_FIELD');
    out.status = input.status;
  }
  if (input.currency !== undefined) {
    const code = String(input.currency || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw httpError(400, 'Invalid currency', 'INVALID_FIELD');
    out.currency = code;
  }
  for (const key of ['lat', 'lng']) {
    if (input[key] === undefined) continue;
    const n = parseNumber(input[key]);
    if (Number.isNaN(n)) throw httpError(400, `Invalid ${key}`, 'INVALID_FIELD');
    out[key] = n;
  }
  if (input.startDate !== undefined) out.start_date = parseDay(input.startDate, 'startDate');
  if (input.finishDate !== undefined) out.finish_date = parseDay(input.finishDate, 'finishDate');
  if (input.managerId !== undefined) out.manager_id = intOr(input.managerId) || null;
  if (input.settings !== undefined) out.settings = JSON.stringify(cleanProjectSettings(current.settings, input.settings || {}));
  if (input.archived !== undefined) out.archived_at = input.archived ? new Date() : null;
  return out;
}

export async function getProject(ctx, id) {
  const row = await requireProject(ctx, id);
  const { rows } = await query(`${PROJECT_SELECT} WHERE p.id = $1`, [row.id]);
  const shape = projectShape(rows[0], ctx);
  // Payment plans in force (price grid by payment form) — for people who see prices.
  shape.pricing = await projectPricing(ctx, row.id);
  return shape;
}

export async function createProject(ctx, input) {
  requireAdmin(ctx);
  const fields = projectFields({ currency: ctx.settings.currency, ...input, name: input.name ?? '' });
  // A new project names its level types in the portal language.
  if (!fields.settings) fields.settings = JSON.stringify(projectSettings({ levels: defaultLevels(await localeFor(null)) }));
  const keys = Object.keys(fields);
  const { rows } = await query(
    `INSERT INTO mp_projects (${keys.join(', ')}, created_by) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}, $${keys.length + 1}) RETURNING id`,
    [...keys.map((key) => fields[key]), ctx.userId]
  );
  await logEvent(null, { projectId: rows[0].id, kind: 'project', data: { action: 'created', name: fields.name }, authorId: ctx.userId });
  return getProject(ctx, rows[0].id);
}

export async function updateProject(ctx, id, input) {
  const row = await requireProject(ctx, id);
  requireConfigure(ctx, row.id);
  const fields = projectFields(input, row);
  const keys = Object.keys(fields);
  if (keys.length) {
    await query(`UPDATE mp_projects SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [row.id, ...keys.map((key) => fields[key])]);
    await logEvent(null, { projectId: row.id, kind: 'project', data: { action: 'updated', fields: keys }, authorId: ctx.userId });
  }
  treeChanged(row.id);
  return getProject(ctx, row.id);
}

/** Deletes a project with everything in it — only when nothing in it is held for a client. */
export async function deleteProject(ctx, id) {
  const row = await requireProject(ctx, id);
  requireAdmin(ctx);
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM mp_units WHERE project_id = $1 AND status NOT IN ('free', 'not_for_sale')`, [row.id]);
  if (rows[0].n) throw httpError(409, 'Units of this project are held for clients; archive it instead', 'PROJECT_HAS_SALES');
  await query(`DELETE FROM mp_projects WHERE id = $1`, [row.id]);
}

// ── Site plan data ───────────────────────────────────────────────────────────

/**
 * Everything the site plan, the registry filters and the chessboard need in
 * one request: the nodes (with sales data the viewer may see), plans and
 * contours. ~1000 objects stay well under a second.
 */
export async function projectMap(ctx, id, { presentation = false } = {}) {
  const project = await getProject(ctx, id);
  const caps = readCaps(ctx, project.id);
  const select = await nodeSelect();
  const [nodes, plans, contours, markers] = await Promise.all([
    query(`${select} WHERE n.project_id = $1 ORDER BY n.depth, n.sort, n.id`, [project.id]),
    query(`SELECT p.*, m.thumb_key FROM mp_plans p LEFT JOIN mp_media m ON m.id = p.media_id WHERE p.project_id = $1 ORDER BY p.sort, p.id`, [project.id]),
    query(`SELECT c.plan_id, c.node_id, c.points FROM mp_contours c JOIN mp_plans p ON p.id = c.plan_id WHERE p.project_id = $1`, [project.id]),
    // Point markers (markers.js): an object placed as a numbered circle instead of a polygon.
    query(`SELECT k.plan_id, k.node_id, k.x, k.y, k.r, k.label FROM mp_markers k JOIN mp_plans p ON p.id = k.plan_id WHERE p.project_id = $1`, [project.id]),
  ]);
  const list = inheritReadiness(nodes.rows.map((row) => visibleNode(ctx, row, { presentation, caps })));
  return {
    project,
    nodes: list,
    plans: plans.rows.map(planShape),
    contours: contours.rows.map((row) => ({ planId: row.plan_id, nodeId: row.node_id, points: row.points })),
    markers: markers.rows.map((row) => ({ planId: row.plan_id, nodeId: row.node_id, x: Number(row.x), y: Number(row.y), r: Number(row.r), label: row.label || null })),
    caps: [...caps],
    presentation,
  };
}

export function planShape(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    nodeId: row.node_id,
    name: row.name,
    width: row.width,
    height: row.height,
    mediaId: row.media_id,
    url: row.media_id ? `/api/app/masterplan/media/${row.media_id}` : null,
    thumbUrl: row.media_id && row.thumb_key ? `/api/app/masterplan/media/${row.media_id}?thumb=1` : null,
  };
}

// ── Plans and contours (administrators) ─────────────────────────────────────

export async function createPlan(ctx, projectId, input) {
  const project = await requireProject(ctx, projectId);
  requireConfigure(ctx, project.id);
  const mediaId = intOr(input.mediaId);
  const nodeId = intOr(input.nodeId);
  if (mediaId) {
    const { rows } = await query(`SELECT id FROM mp_media WHERE id = $1 AND project_id = $2`, [mediaId, project.id]);
    if (!rows[0]) throw httpError(400, 'Unknown image', 'INVALID_FIELD');
  }
  if (nodeId) {
    const { rows } = await query(`SELECT id FROM mp_nodes WHERE id = $1 AND project_id = $2`, [nodeId, project.id]);
    if (!rows[0]) throw httpError(400, 'Unknown object', 'INVALID_FIELD');
  }
  const width = Math.min(20000, Math.max(100, intOr(input.width, 1600)));
  const height = Math.min(20000, Math.max(100, intOr(input.height, 1000)));
  const { rows } = await query(
    `INSERT INTO mp_plans (project_id, node_id, media_id, name, width, height) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [project.id, nodeId, mediaId, text(input.name, 160) || null, width, height]
  );
  await logEvent(null, { projectId: project.id, nodeId, kind: 'plan', data: { action: 'created', planId: rows[0].id }, authorId: ctx.userId });
  treeChanged(project.id);
  return planShape(rows[0]);
}

export async function requirePlan(ctx, id) {
  const { rows } = await query(`SELECT * FROM mp_plans WHERE id = $1`, [intOr(id, 0)]);
  if (!rows[0]) throw notFound('Plan not found');
  await requireProject(ctx, rows[0].project_id);
  requireConfigure(ctx, rows[0].project_id);
  return rows[0];
}

export async function updatePlan(ctx, id, input) {
  const plan = await requirePlan(ctx, id);
  const name = input.name !== undefined ? text(input.name, 160) || null : plan.name;
  const mediaId = input.mediaId !== undefined ? intOr(input.mediaId) : plan.media_id;
  // As on creation: the image must be one of this project's files.
  if (mediaId && mediaId !== plan.media_id) {
    const { rows } = await query(`SELECT id FROM mp_media WHERE id = $1 AND project_id = $2`, [mediaId, plan.project_id]);
    if (!rows[0]) throw httpError(400, 'Unknown image', 'INVALID_FIELD');
  }
  const width = input.width !== undefined ? Math.min(20000, Math.max(100, intOr(input.width, plan.width))) : plan.width;
  const height = input.height !== undefined ? Math.min(20000, Math.max(100, intOr(input.height, plan.height))) : plan.height;
  const { rows } = await query(`UPDATE mp_plans SET name = $2, media_id = $3, width = $4, height = $5, updated_at = NOW() WHERE id = $1 RETURNING *`, [plan.id, name, mediaId, width, height]);
  treeChanged(plan.project_id);
  return planShape(rows[0]);
}

export async function deletePlan(ctx, id) {
  const plan = await requirePlan(ctx, id);
  await query(`DELETE FROM mp_plans WHERE id = $1`, [plan.id]);
  treeChanged(plan.project_id);
}

/** Polygon points in plan coordinates: [[x, y], …], 3..500 points, inside the plan (with a margin). */
export function cleanPoints(points, plan) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 500) return null;
  const out = [];
  for (const point of points) {
    const x = Number(point?.[0]);
    const y = Number(point?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < -plan.width || y < -plan.height || x > plan.width * 2 || y > plan.height * 2) return null;
    out.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  return out;
}

/**
 * Sets contours of a plan: `{ contours: [{ nodeId, points | null }] }` — null
 * removes a node's contour. Nodes must belong to the plan's project.
 */
export async function saveContours(ctx, planId, input) {
  const plan = await requirePlan(ctx, planId);
  const items = Array.isArray(input.contours) ? input.contours.slice(0, 2000) : [];
  const nodeIds = items.map((item) => intOr(item.nodeId)).filter(Boolean);
  const { rows: known } = await query(`SELECT id FROM mp_nodes WHERE project_id = $1 AND id = ANY($2::int[])`, [plan.project_id, nodeIds]);
  const allowed = new Set(known.map((row) => row.id));
  let changed = 0;
  await withTransaction(async (client) => {
    for (const item of items) {
      const nodeId = intOr(item.nodeId);
      if (!allowed.has(nodeId)) throw httpError(400, 'Unknown object', 'INVALID_FIELD');
      if (item.points === null) {
        await client.query(`DELETE FROM mp_contours WHERE plan_id = $1 AND node_id = $2`, [plan.id, nodeId]);
      } else {
        const points = cleanPoints(item.points, plan);
        if (!points) throw httpError(400, 'A contour needs 3 to 500 points inside the plan', 'INVALID_CONTOUR');
        await client.query(
          `INSERT INTO mp_contours (plan_id, node_id, points) VALUES ($1, $2, $3) ON CONFLICT (plan_id, node_id) DO UPDATE SET points = EXCLUDED.points`,
          [plan.id, nodeId, JSON.stringify(points)]
        );
        // One placement per plan: a contour replaces the node's point marker (markers.js).
        await client.query(`DELETE FROM mp_markers WHERE plan_id = $1 AND node_id = $2`, [plan.id, nodeId]);
      }
      changed += 1;
    }
    if (changed) await logEvent(client, { projectId: plan.project_id, kind: 'contours', data: { planId: plan.id, count: changed }, authorId: ctx.userId });
  });
  treeChanged(plan.project_id);
  return { changed };
}

// ── Team: roles with zones ──────────────────────────────────────────────────

export async function listTeam(ctx, projectId) {
  const project = await requireProject(ctx, projectId);
  if (!canConfigure(ctx, project.id)) throw forbidden();
  const { rows } = await query(
    `SELECT a.*, COALESCE(u.display_name, u.username) AS user_name, u.avatar_path, g.name AS group_name, n.code AS node_code, n.name AS node_name
     FROM mp_assignments a
     LEFT JOIN users u ON a.subject_type = 'user' AND u.id = a.subject_id
     LEFT JOIN app_groups g ON a.subject_type = 'group' AND g.id = a.subject_id
     LEFT JOIN mp_nodes n ON n.id = a.node_id
     WHERE a.project_id = $1 ORDER BY a.role, a.id`,
    [project.id]
  );
  return rows.map((row) => ({
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    label: row.subject_type === 'user' ? row.user_name : row.group_name,
    avatarUrl: row.subject_type === 'user' ? avatarOf(row.avatar_path) : null,
    role: row.role,
    nodeId: row.node_id,
    node: row.node_id ? { id: row.node_id, code: row.node_code, name: row.node_name } : null,
    until: dayString(row.until),
  }));
}

/** Replaces the project's assignments: [{ subjectType, subjectId, role, nodeId?, until? }]. */
export async function saveTeam(ctx, projectId, entries) {
  const project = await requireProject(ctx, projectId);
  if (!canConfigure(ctx, project.id)) throw forbidden();
  const list = Array.isArray(entries) ? entries.slice(0, 1000) : [];
  const nodeIds = list.map((item) => intOr(item.nodeId)).filter(Boolean);
  const { rows: known } = await query(`SELECT id FROM mp_nodes WHERE project_id = $1 AND id = ANY($2::int[])`, [project.id, nodeIds]);
  const nodes = new Set(known.map((row) => row.id));
  const seen = new Set();
  const clean = [];
  for (const item of list) {
    const subjectType = ['user', 'group'].includes(item?.subjectType) ? item.subjectType : null;
    const subjectId = intOr(item?.subjectId);
    const role = ROLES.includes(item?.role) ? item.role : null;
    const nodeId = intOr(item?.nodeId);
    if (!subjectType || !subjectId || !role) throw httpError(400, 'Each entry needs a person or group and a role', 'INVALID_FIELD');
    if (nodeId && !nodes.has(nodeId)) throw httpError(400, 'Unknown zone', 'INVALID_FIELD');
    // Only global administrators make project administrators.
    if (role === 'admin' && !ctx.isAdmin) throw forbidden();
    const key = `${subjectType}:${subjectId}:${role}:${nodeId || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ subjectType, subjectId, role, nodeId: nodeId || null, until: parseDay(item.until, 'until') });
  }
  await withTransaction(async (client) => {
    // A project administrator who is not a global one keeps their own admin entries.
    if (ctx.isAdmin) await client.query(`DELETE FROM mp_assignments WHERE project_id = $1`, [project.id]);
    else await client.query(`DELETE FROM mp_assignments WHERE project_id = $1 AND role <> 'admin'`, [project.id]);
    for (const item of clean) {
      if (item.role === 'admin' && !ctx.isAdmin) continue;
      await client.query(
        `INSERT INTO mp_assignments (project_id, node_id, subject_type, subject_id, role, until, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [project.id, item.nodeId, item.subjectType, item.subjectId, item.role, item.until, ctx.userId]
      );
    }
    await logEvent(client, { projectId: project.id, kind: 'team', data: { count: clean.length }, authorId: ctx.userId });
  });
  return listTeam(ctx, project.id);
}
