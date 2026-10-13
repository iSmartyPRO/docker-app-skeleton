import { query } from '../../config/database.js';
import { httpError } from './logic.js';
import { modulesEnabled } from './access.js';

/*
 * «Связи»: a contract may point at a CRM deal and a Masterplan project or
 * object (purchase requests point at the contract from their side, see
 * GET /api/app/procurement/requests?contract=<id>). A link is shown only
 * while its module is on, and its title only to people that module lets see
 * it ("no access" otherwise). Setting a link checks the person's rights there.
 */

async function crmTools() {
  const [{ crmContext, crmSettings }, { requireDeal, listDeals }] = await Promise.all([import('../crm/access.js'), import('../crm/deals.js')]);
  return { crmContext, crmSettings, requireDeal, listDeals };
}

async function mpTools() {
  const access = await import('../masterplan/access.js');
  return access;
}

async function dealFor(ctx, dealId) {
  const { crmContext, crmSettings, requireDeal } = await crmTools();
  const { row } = await requireDeal(crmContext(ctx.req, await crmSettings()), dealId);
  return row;
}

async function mpContextOf(ctx) {
  const { mpContext, mpSettings } = await mpTools();
  return mpContext(ctx.req, await mpSettings());
}

/** Checks links being set (only changed ones): the module is on and the person may see the target. */
export async function validateLinks(ctx, data, current = {}) {
  const enabled = await modulesEnabled();
  if (data.dealId && data.dealId !== current.dealId) {
    if (!enabled.crm) throw httpError(400, 'The CRM is turned off', 'CRM_DISABLED', { field: 'dealId' });
    await dealFor(ctx, data.dealId).catch(() => {
      throw httpError(400, 'Unknown deal', 'BAD_DEAL', { field: 'dealId' });
    });
  }
  if ((data.mpProjectId && data.mpProjectId !== current.mpProjectId) || (data.mpNodeId && data.mpNodeId !== current.mpNodeId)) {
    if (!enabled.masterplan) throw httpError(400, 'Masterplan is turned off', 'MASTERPLAN_DISABLED', { field: 'mpProjectId' });
    const { requireProject, requireNode } = await mpTools();
    const mctx = await mpContextOf(ctx);
    if (data.mpNodeId) {
      const node = await requireNode(mctx, data.mpNodeId).catch(() => null);
      if (!node) throw httpError(400, 'Unknown object', 'BAD_OBJECT', { field: 'mpNodeId' });
      data.mpProjectId = node.project_id;
    } else if (data.mpProjectId) {
      const project = await requireProject(mctx, data.mpProjectId).catch(() => null);
      if (!project) throw httpError(400, 'Unknown project', 'BAD_OBJECT', { field: 'mpProjectId' });
      if (!('mpNodeId' in data)) data.mpNodeId = null;
    }
  }
  if ('mpProjectId' in data && !data.mpProjectId) data.mpNodeId = null;
}

/** Links of a contract as the person may see them. */
export async function resolveLinks(ctx, row) {
  const enabled = await modulesEnabled();
  const out = { modules: { crm: enabled.crm, masterplan: enabled.masterplan, procurement: enabled.procurement }, deal: null, masterplan: null };
  if (row.deal_id && enabled.crm) {
    const deal = await dealFor(ctx, row.deal_id).catch(() => null);
    out.deal = deal
      ? { id: deal.id, title: deal.title, amount: deal.amount === null ? null : Number(deal.amount), currency: deal.currency, stage: deal.stage_name || null, stageColor: deal.stage_color || null, url: `/app/crm/deals/${deal.id}` }
      : { id: row.deal_id, hidden: true };
  }
  if (row.mp_project_id && enabled.masterplan) {
    try {
      const { requireProject, requireNode } = await mpTools();
      const mctx = await mpContextOf(ctx);
      const project = await requireProject(mctx, row.mp_project_id);
      const node = row.mp_node_id ? await requireNode(mctx, row.mp_node_id).catch(() => null) : null;
      out.masterplan = {
        projectId: project.id,
        project: project.name,
        nodeId: node?.id || null,
        node: node ? [node.code, node.name].filter(Boolean).join(' · ') : null,
        url: `/app/masterplan/p/${project.id}/plan`,
      };
    } catch {
      out.masterplan = { projectId: row.mp_project_id, hidden: true };
    }
  }
  return out;
}

/** Deals for the link picker (the person's CRM visibility). */
export async function dealOptions(ctx, search) {
  if (!(await modulesEnabled()).crm) return [];
  const { crmContext, crmSettings, listDeals } = await crmTools();
  const result = await listDeals(crmContext(ctx.req, await crmSettings()), { q: String(search || '').slice(0, 100), pageSize: 20 });
  return result.items.map((deal) => ({ id: deal.id, title: deal.title, amount: deal.amount, currency: deal.currency, stage: deal.stage?.name || deal.stageName || null }));
}

/** Masterplan projects and objects for the link picker (projects the person sees). */
export async function masterplanOptions(ctx, search) {
  if (!(await modulesEnabled()).masterplan) return [];
  const { visibleProjectIds } = await mpTools();
  const mctx = await mpContextOf(ctx);
  const ids = visibleProjectIds(mctx);
  const q = String(search || '').trim().slice(0, 100);
  const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const params = [like];
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
