import { decide } from '../api/scopes.js';
import { companyName, searchCompanies } from '../modules/companies/api.js';
import { linkProvider, modules, objectSource } from './registry.js';

/*
 * Pickers for links from a module's form to things other modules keep —
 * shared by Procurement and Warehouse (and any module with the same links).
 * Each answers only while the module that keeps the target is on (a link is
 * not a dependency) and with that module's own access rules:
 *   companies  Counterparties (core) — names are visible to everyone signed in
 *   projects   «objects» source (Masterplan registers one): projects the person sees
 *   objects    plots and objects of such a project
 *   deals      CRM deals, through the «Связи» provider 'crm.deal'
 * An API token also needs read access to the target module's area.
 */

const disabled = () => Object.assign(new Error('Module is disabled'), { statusCode: 404, code: 'MODULE_DISABLED' });

/** Does the request's API token (if any) reach the module's area? Session users: always. */
export function scopeAllows(req, area) {
  const policy = req?.apiToken?.policy;
  return !policy || decide(policy, 'GET', `/app/${area}`).ok;
}

/** Items of a picker: [{ id, label, hint? }]. Throws 404 MODULE_DISABLED while the target's module is off; null for an unknown kind. */
export async function pickerLookup(req, kind, input = {}) {
  const q = String(input.q || '').trim();
  switch (kind) {
    case 'companies': {
      if (!(await modules.enabled('companies')) || !scopeAllows(req, 'companies')) throw disabled();
      return searchCompanies(q, { limit: 20 });
    }
    case 'projects':
    case 'objects': {
      const source = await objectSource();
      if (!source || !scopeAllows(req, source.area || source.module)) throw disabled();
      return kind === 'projects' ? source.projects(req, { q }) : source.objects(req, { project: input.project, q });
    }
    case 'deals': {
      const deals = await linkProvider('crm.deal');
      if (!deals || !scopeAllows(req, deals.area || deals.module)) throw disabled();
      return (await deals.search(req, { q, pageSize: 20, group: 'all' })).map((deal) => ({ id: deal.id, label: deal.label, hint: deal.hint || '' }));
    }
    default:
      return null;
  }
}

/**
 * The label of a link target if the person may see it there, else null.
 * `key`: supplierCompanyId, projectId, objectId (with `projectId`: must be of that project), dealId, contractId.
 */
export async function pickerLabel(req, key, id, { projectId = null } = {}) {
  switch (key) {
    case 'supplierCompanyId': {
      if (!(await modules.enabled('companies')) || !scopeAllows(req, 'companies')) return null;
      return companyName(id);
    }
    case 'projectId':
    case 'objectId': {
      const source = await objectSource();
      if (!source || !scopeAllows(req, source.area || source.module)) return null;
      return key === 'projectId' ? source.projectLabel(req, id) : source.objectLabel(req, id, { projectId });
    }
    case 'dealId':
    case 'contractId': {
      const provider = await linkProvider(key === 'dealId' ? 'crm.deal' : 'contracts.contract');
      if (!provider || !scopeAllows(req, provider.area || provider.module)) return null;
      return (await provider.resolve(req, id))?.label ?? null;
    }
    default:
      return null;
  }
}
