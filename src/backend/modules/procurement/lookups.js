import { pickerLabel, pickerLookup } from '../../platform/pickers.js';
import { httpError } from './logic.js';

/*
 * Pickers of the request form for links to other modules (the shared core
 * pickers, platform/pickers.js). Each one answers only while its module is on
 * (spec §3: a link is not a dependency) and follows that module's own access rules:
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

export async function lookup(req, kind, input = {}) {
  const items = await pickerLookup(req, kind, input);
  if (items === null) throw httpError(404, 'Unknown lookup', 'NOT_FOUND');
  return items;
}

const LINK_ERROR = {
  supplierCompanyId: ['BAD_SUPPLIER', 'Unknown supplier'],
  projectId: ['BAD_PROJECT', 'Unknown project'],
  objectId: ['BAD_OBJECT', 'Unknown object'],
  dealId: ['BAD_DEAL', 'Unknown deal'],
  contractId: ['BAD_CONTRACT', 'Unknown contract'],
};

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
  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] === undefined || patch[key] === null || patch[key] === '') continue;
    const id = Number(patch[key]);
    if (!Number.isInteger(id) || id < 1) continue;
    if (Number(current[column]) === id) continue;
    const name = await pickerLabel(req, key, id, { projectId: key === 'objectId' ? (patch.projectId !== undefined ? patch.projectId : current.project_id) || null : null });
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
