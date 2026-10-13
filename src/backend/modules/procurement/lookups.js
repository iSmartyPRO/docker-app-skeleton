import { query } from '../../config/database.js';
import { decide } from '../../api/scopes.js';
import { modulesState } from './access.js';
import { httpError } from './logic.js';

/*
 * Pickers of the request form for links to other modules. Each one answers
 * only while its module is on (spec §3: a link is not a dependency) and
 * follows that module's own access rules:
 *   companies  suppliers from Counterparties (names are visible to everyone signed in there too)
 *   projects   Masterplan projects the person sees; objects = plots and objects of such a project
 *   deals      CRM deals, with the CRM's own visibility rules
 * Contracts are picked through the Contracts module's own API by the browser.
 * An API token also needs read access to the linked module's area.
 *
 * validateLinks() applies the same rules when a request is saved: a link
 * that changes must point at something the person may see there, and its
 * label is then taken from the target (a free-text label without an id stays).
 */

/** Does the request's API token (if any) reach the module's area? Session users: always. */
function scopeAllows(req, module) {
  const policy = req?.apiToken?.policy;
  return !policy || decide(policy, 'GET', `/app/${module}`).ok;
}

async function masterplanContext(req) {
  const { mpContext, mpSettings, visibleProjectIds } = await import('../masterplan/access.js');
  const ctx = await mpContext(req, await mpSettings());
  return { ctx, ids: visibleProjectIds(ctx) };
}

const sees = (ids, projectId) => ids === null || ids.includes(Number(projectId));

const like = (q) => `%${String(q || '').trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function lookup(req, kind, input = {}) {
  const modules = await modulesState();
  const q = String(input.q || '').trim();
  switch (kind) {
    case 'companies': {
      if (!modules.companies || !scopeAllows(req, 'companies')) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
      const { rows } = await query(
        `SELECT c.id, c.name, c.ids, c.legal_address FROM cmp_companies c
         WHERE c.archived_at IS NULL AND ($1 = '%%' OR c.name ILIKE $1 OR c.full_name ILIKE $1 OR c.ids::text ILIKE $1)
         ORDER BY LOWER(c.name) LIMIT 20`,
        [like(q)]
      );
      return rows.map((row) => ({ id: row.id, label: row.name, hint: Object.values(row.ids || {}).filter(Boolean).join(' · ') }));
    }
    case 'projects': {
      if (!modules.masterplan || !scopeAllows(req, 'masterplan')) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
      const { ids } = await masterplanContext(req);
      if (ids && !ids.length) return [];
      const { rows } = await query(
        `SELECT id, name FROM mp_projects WHERE archived_at IS NULL AND name ILIKE $1 AND ($2::int[] IS NULL OR id = ANY($2::int[])) ORDER BY sort, id LIMIT 50`,
        [like(q), ids]
      );
      return rows.map((row) => ({ id: row.id, label: row.name }));
    }
    case 'objects': {
      if (!modules.masterplan || !scopeAllows(req, 'masterplan')) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
      const project = Number(input.project);
      if (!Number.isInteger(project) || project < 1) return [];
      if (!sees((await masterplanContext(req)).ids, project)) return [];
      const { rows } = await query(
        `SELECT id, name, code, kind FROM mp_nodes WHERE project_id = $1 AND kind IN ('level', 'plot', 'object') AND (name ILIKE $2 OR code ILIKE $2)
         ORDER BY depth, sort, id LIMIT 100`,
        [project, like(q)]
      );
      return rows.map((row) => ({ id: row.id, label: [row.code, row.name].filter(Boolean).join(' · ') || `#${row.id}` }));
    }
    case 'deals': {
      if (!modules.crm || !scopeAllows(req, 'crm')) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
      const { crmContext, crmSettings } = await import('../crm/access.js');
      const { listDeals } = await import('../crm/deals.js');
      const result = await listDeals(crmContext(req, await crmSettings()), { q, pageSize: 20, group: 'all' });
      return result.items.map((deal) => ({ id: deal.id, label: deal.title, hint: deal.client?.name || '' }));
    }
    default:
      throw httpError(404, 'Unknown lookup', 'NOT_FOUND');
  }
}

const LINK_ERROR = {
  supplierCompanyId: ['BAD_SUPPLIER', 'Unknown supplier'],
  projectId: ['BAD_PROJECT', 'Unknown project'],
  objectId: ['BAD_OBJECT', 'Unknown object'],
  dealId: ['BAD_DEAL', 'Unknown deal'],
  contractId: ['BAD_CONTRACT', 'Unknown contract'],
};

/** The target's name if the person may see it there, else null. */
async function linkTarget(req, kind, id, patch, modules) {
  switch (kind) {
    case 'supplierCompanyId': {
      if (!modules.companies || !scopeAllows(req, 'companies')) return null;
      const { rows } = await query(`SELECT name FROM cmp_companies WHERE id = $1`, [id]);
      return rows[0]?.name ?? null;
    }
    case 'projectId': {
      if (!modules.masterplan || !scopeAllows(req, 'masterplan')) return null;
      if (!sees((await masterplanContext(req)).ids, id)) return null;
      const { rows } = await query(`SELECT name FROM mp_projects WHERE id = $1`, [id]);
      return rows[0]?.name ?? null;
    }
    case 'objectId': {
      if (!modules.masterplan || !scopeAllows(req, 'masterplan')) return null;
      const { rows } = await query(`SELECT project_id, code, name FROM mp_nodes WHERE id = $1`, [id]);
      const node = rows[0];
      if (!node || !sees((await masterplanContext(req)).ids, node.project_id)) return null;
      // An object belongs to the request's project (when one is given).
      if (patch.projectId && Number(patch.projectId) !== Number(node.project_id)) return null;
      return [node.code, node.name].filter(Boolean).join(' · ') || `#${id}`;
    }
    case 'dealId': {
      if (!modules.crm || !scopeAllows(req, 'crm')) return null;
      const [{ crmContext, crmSettings }, { requireDeal }] = await Promise.all([import('../crm/access.js'), import('../crm/deals.js')]);
      const deal = await requireDeal(crmContext(req, await crmSettings()), id).catch(() => null);
      return deal ? deal.row.title : null;
    }
    case 'contractId': {
      if (!modules.contracts || !scopeAllows(req, 'contracts')) return null;
      const [{ canView, contractsContext, contractsSettings }, { loadRow }] = await Promise.all([import('../contracts/access.js'), import('../contracts/service.js')]);
      const row = await loadRow(id).catch(() => null);
      if (!row || !(await canView(contractsContext(req, await contractsSettings()), row))) return null;
      return [row.number, row.title].filter(Boolean).join(' · ');
    }
    default:
      return null;
  }
}

const LABEL_OF = { supplierCompanyId: 'supplierName', projectId: 'projectLabel', objectId: 'objectLabel', dealId: 'dealLabel', contractId: 'contractLabel' };

/**
 * Checks the links of a request patch (API field names) that change against
 * `current` (the stored row; {} for a new request). A link the person may
 * not see in its module is refused (400), or with `drop` (duplicating a
 * colleague's request) quietly left out. Links that stay as they are are not
 * re-checked, so a request keeps a link its editor cannot open.
 */
export async function validateLinks(req, patch, current = {}, { drop = false } = {}) {
  const columns = { supplierCompanyId: 'supplier_company_id', projectId: 'project_id', objectId: 'object_id', dealId: 'deal_id', contractId: 'contract_id' };
  let modules = null;
  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] === undefined || patch[key] === null || patch[key] === '') continue;
    const id = Number(patch[key]);
    if (!Number.isInteger(id) || id < 1) continue;
    if (Number(current[column]) === id) continue;
    modules = modules || (await modulesState());
    const name = await linkTarget(req, key, id, { projectId: patch.projectId !== undefined ? patch.projectId : current.project_id }, modules);
    if (name === null) {
      if (!drop) throw httpError(400, LINK_ERROR[key][1], LINK_ERROR[key][0], { field: key });
      patch[key] = null;
      continue;
    }
    // The stored label is the target's own name, not whatever the client sent.
    if (name) patch[LABEL_OF[key]] = name;
  }
  return patch;
}
