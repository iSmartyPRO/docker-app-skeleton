import { query } from '../../config/database.js';
import { mpContext, mpSettings, requireNode, requireProject, visibleProjectIds } from './access.js';

/*
 * What other modules may point at in Masterplan, with Masterplan's own
 * visibility (projects the person sees):
 *
 *   - the core «objects» source (platform/registry.js registerObjectSource):
 *     Procurement and Warehouse pick a project and an object of it;
 *   - project / object links of contracts (masterplan/api.js projectFor,
 *     nodeFor, projectLinkOptions).
 */

const like = (q) => `%${String(q || '').trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

async function contextOf(req) {
  const ctx = await mpContext(req || {}, await mpSettings());
  return { ctx, ids: visibleProjectIds(ctx) };
}

const sees = (ids, projectId) => ids === null || ids.includes(Number(projectId));

/** «Objects» source: Masterplan projects and their levels, plots and objects. */
export const objectSource = {
  id: 'masterplan',
  area: 'masterplan',
  priority: 10,
  async projects(req, { q = '' } = {}) {
    const { ids } = await contextOf(req);
    if (ids && !ids.length) return [];
    const { rows } = await query(
      `SELECT id, name FROM mp_projects WHERE archived_at IS NULL AND name ILIKE $1 AND ($2::int[] IS NULL OR id = ANY($2::int[])) ORDER BY sort, id LIMIT 50`,
      [like(q), ids]
    );
    return rows.map((row) => ({ id: row.id, label: row.name }));
  },
  async objects(req, { project, q = '' } = {}) {
    const projectId = Number(project);
    if (!Number.isInteger(projectId) || projectId < 1) return [];
    if (!sees((await contextOf(req)).ids, projectId)) return [];
    const { rows } = await query(
      `SELECT id, name, code, kind FROM mp_nodes WHERE project_id = $1 AND kind IN ('level', 'plot', 'object') AND (name ILIKE $2 OR code ILIKE $2)
       ORDER BY depth, sort, id LIMIT 100`,
      [projectId, like(q)]
    );
    return rows.map((row) => ({ id: row.id, label: [row.code, row.name].filter(Boolean).join(' · ') || `#${row.id}` }));
  },
  async projectLabel(req, id) {
    if (!sees((await contextOf(req)).ids, id)) return null;
    const { rows } = await query(`SELECT name FROM mp_projects WHERE id = $1`, [id]);
    return rows[0]?.name ?? null;
  },
  /** An object's label; null when unknown, not visible, or (with `projectId`) of another project. */
  async objectLabel(req, id, { projectId = null } = {}) {
    const { rows } = await query(`SELECT project_id, code, name FROM mp_nodes WHERE id = $1`, [id]);
    const node = rows[0];
    if (!node || !sees((await contextOf(req)).ids, node.project_id)) return null;
    if (projectId && Number(projectId) !== Number(node.project_id)) return null;
    return [node.code, node.name].filter(Boolean).join(' · ') || `#${id}`;
  },
};

/** A project the person sees (the mp_projects row), or null. */
export async function projectFor(req, id) {
  const { ctx } = await contextOf(req);
  return requireProject(ctx, id).catch(() => null);
}

/** A node of a project the person sees (with project_id, code, name), or null. */
export async function nodeFor(req, id) {
  const { ctx } = await contextOf(req);
  return requireNode(ctx, id).catch(() => null);
}

/** Projects and objects for a contract's link picker (projects the person sees). */
export async function projectLinkOptions(req, search) {
  const { ids } = await contextOf(req);
  const q = String(search || '').trim().slice(0, 100);
  const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const params = [pattern];
  let scope = '';
  if (ids) {
    params.push(ids);
    scope = `AND p.id = ANY($2::int[])`;
  }
  const { rows: projects } = await query(`SELECT p.id, p.name FROM mp_projects p WHERE p.name ILIKE $1 ${scope} ORDER BY p.name LIMIT 10`, params);
  const { rows: nodes } = q
    ? await query(
        `SELECT n.id, n.code, n.name, n.kind, p.id AS project_id, p.name AS project FROM mp_nodes n JOIN mp_projects p ON p.id = n.project_id
         WHERE (n.name ILIKE $1 OR n.code ILIKE $1) ${scope} ORDER BY n.depth, n.name LIMIT 20`,
        params
      )
    : { rows: [] };
  return [
    ...projects.map((p) => ({ projectId: p.id, nodeId: null, label: p.name, project: p.name })),
    ...nodes.map((n) => ({ projectId: n.project_id, nodeId: n.id, label: [n.code, n.name].filter(Boolean).join(' · '), project: n.project, kind: n.kind })),
  ];
}
