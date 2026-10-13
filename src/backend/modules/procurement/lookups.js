import { query } from '../../config/database.js';
import { modulesState } from './access.js';
import { httpError } from './logic.js';

/*
 * Pickers of the request form for links to other modules. Each one answers
 * only while its module is on (spec §3: a link is not a dependency):
 *   companies  suppliers from Counterparties (names are visible to everyone signed in there too)
 *   projects   Masterplan projects; objects = plots and objects of a project
 *   deals      CRM deals, with the CRM's own visibility rules
 * Contracts are picked through the Contracts module's own API by the browser.
 */

const like = (q) => `%${String(q || '').trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function lookup(req, kind, input = {}) {
  const modules = await modulesState();
  const q = String(input.q || '').trim();
  switch (kind) {
    case 'companies': {
      if (!modules.companies) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
      const { rows } = await query(
        `SELECT c.id, c.name, c.ids, c.legal_address FROM cmp_companies c
         WHERE c.archived_at IS NULL AND ($1 = '%%' OR c.name ILIKE $1 OR c.full_name ILIKE $1 OR c.ids::text ILIKE $1)
         ORDER BY LOWER(c.name) LIMIT 20`,
        [like(q)]
      );
      return rows.map((row) => ({ id: row.id, label: row.name, hint: Object.values(row.ids || {}).filter(Boolean).join(' · ') }));
    }
    case 'projects': {
      if (!modules.masterplan) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
      const { rows } = await query(`SELECT id, name FROM mp_projects WHERE archived_at IS NULL AND name ILIKE $1 ORDER BY sort, id LIMIT 50`, [like(q)]);
      return rows.map((row) => ({ id: row.id, label: row.name }));
    }
    case 'objects': {
      if (!modules.masterplan) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
      const project = Number(input.project);
      if (!Number.isInteger(project) || project < 1) return [];
      const { rows } = await query(
        `SELECT id, name, code, kind FROM mp_nodes WHERE project_id = $1 AND kind IN ('level', 'plot', 'object') AND (name ILIKE $2 OR code ILIKE $2)
         ORDER BY depth, sort, id LIMIT 100`,
        [project, like(q)]
      );
      return rows.map((row) => ({ id: row.id, label: [row.code, row.name].filter(Boolean).join(' · ') || `#${row.id}` }));
    }
    case 'deals': {
      if (!modules.crm) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
      const { crmContext, crmSettings } = await import('../crm/access.js');
      const { listDeals } = await import('../crm/deals.js');
      const result = await listDeals(crmContext(req, await crmSettings()), { q, pageSize: 20, group: 'all' });
      return result.items.map((deal) => ({ id: deal.id, label: deal.title, hint: deal.client?.name || '' }));
    }
    default:
      throw httpError(404, 'Unknown lookup', 'NOT_FOUND');
  }
}
