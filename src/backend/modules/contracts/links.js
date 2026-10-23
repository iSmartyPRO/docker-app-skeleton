import { httpError } from './logic.js';
import { modulesEnabled } from './access.js';
import { linkProvider, modules } from '../../platform/registry.js';

/*
 * «Связи»: a contract may point at a CRM deal and a Masterplan project or
 * object (purchase requests point at the contract from their side, see
 * GET /api/app/procurement/requests?contract=<id>). A link is shown only
 * while its module is on, and its title only to people that module lets see
 * it ("no access" otherwise). Setting a link checks the person's rights there.
 */

// CRM and Masterplan are optional links: their providers are looked up at run time (null while off).
const crmDeals = () => linkProvider('crm.deal');
const masterplanApi = () => modules.loaded('masterplan')?.api || null;

/** The deal row if the person may see it in the CRM; throws otherwise. */
async function dealFor(ctx, dealId) {
  const deals = await crmDeals();
  const deal = deals ? await deals.resolve(ctx.req, dealId) : null;
  if (!deal) throw httpError(404, 'Deal not found', 'NOT_FOUND');
  return deal.row;
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
    const mp = masterplanApi();
    if (!mp) throw httpError(400, 'Masterplan is turned off', 'MASTERPLAN_DISABLED', { field: 'mpProjectId' });
    if (data.mpNodeId) {
      const node = await mp.nodeFor(ctx.req, data.mpNodeId);
      if (!node) throw httpError(400, 'Unknown object', 'BAD_OBJECT', { field: 'mpNodeId' });
      data.mpProjectId = node.project_id;
    } else if (data.mpProjectId) {
      const project = await mp.projectFor(ctx.req, data.mpProjectId);
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
      const mp = masterplanApi();
      const project = mp ? await mp.projectFor(ctx.req, row.mp_project_id) : null;
      if (!project) throw new Error('hidden');
      const node = row.mp_node_id ? await mp.nodeFor(ctx.req, row.mp_node_id) : null;
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
  const deals = await crmDeals();
  if (!deals) return [];
  const items = await deals.search(ctx.req, { q: String(search || '').slice(0, 100), pageSize: 20 });
  return items.map((deal) => ({ id: deal.id, title: deal.title, amount: deal.amount, currency: deal.currency, stage: deal.stage }));
}

/** Masterplan projects and objects for the link picker (projects the person sees). */
export async function masterplanOptions(ctx, search) {
  if (!(await modulesEnabled()).masterplan) return [];
  const mp = masterplanApi();
  return mp ? mp.projectLinkOptions(ctx.req, search) : [];
}
