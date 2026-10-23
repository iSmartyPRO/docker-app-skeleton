/*
 * Public API of Counterparties — a core service (docs/companies.md): modules
 * may import this file (and only this file) of the folder.
 *
 *   import { createCompany, createPerson, logEvent } from '../companies/api.js';
 *
 *   await createCompany(actor, { name, phone, email, force: true })   // a new company card
 *   await createPerson(actor, { lastName, firstName, companyId, … })   // a new contact person
 *   await logEvent(null, { type: 'company' | 'person', id, kind, body, data, authorId })  // a line in the card's history
 *   await companyName(id)                                              // the name, or null
 *   await searchCompanies(q, { limit })                                // [{ id, label, hint }] for pickers
 */

import { query } from '../../config/database.js';

export { createCompany, createPerson, logEvent, companiesContext, companiesSettings, listCompanies } from './service.js';

const like = (q) => `%${String(q || '').trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Active companies matching `q` (name, full name, registry ids), for link pickers. */
export async function searchCompanies(q, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT c.id, c.name, c.ids, c.legal_address FROM cmp_companies c
     WHERE c.archived_at IS NULL AND ($1 = '%%' OR c.name ILIKE $1 OR c.full_name ILIKE $1 OR c.ids::text ILIKE $1)
     ORDER BY LOWER(c.name) LIMIT ${Math.max(1, Math.min(100, Number(limit) || 20))}`,
    [like(q)]
  );
  return rows.map((row) => ({ id: row.id, label: row.name, hint: Object.values(row.ids || {}).filter(Boolean).join(' · ') }));
}

/** A company's name (archived ones too), or null. */
export async function companyName(id) {
  const { rows } = await query(`SELECT name FROM cmp_companies WHERE id = $1`, [id]);
  return rows[0]?.name ?? null;
}
