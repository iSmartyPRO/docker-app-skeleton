import { query } from '../../config/database.js';
import { decide } from '../../api/scopes.js';
import { clean, httpError } from '../shared/acl.js';
import { createCompany, createPerson } from '../companies/service.js';
import { modulesEnabled } from './access.js';
import { likePattern, posInt } from './util.js';

/*
 * Clients are companies and people of the Companies module: CRM searches
 * their tables and creates new cards through its service (so the Companies
 * timeline and duplicate rules stay theirs).
 */

const PERSON_NAME = `NULLIF(CONCAT_WS(' ', pp.last_name, pp.first_name, pp.middle_name), '')`;

/**
 * An API token reaches the Companies directory through the CRM only with its
 * own companies scope, as if it called the Companies API. Session requests
 * (no token) are not affected.
 */
export function companiesScopeAllows(req, level = 'read') {
  const policy = req?.apiToken?.policy;
  if (!policy) return true;
  return decide(policy, level === 'write' ? 'POST' : 'GET', '/app/companies/companies').ok;
}

/** `req`: the request, for the Companies module switch and the token's scope. */
export async function searchClients(input = {}, req = null) {
  if (!(await modulesEnabled()).companies || !companiesScopeAllows(req)) return { companies: [], people: [] };
  const q = String(input.q ?? '').trim().slice(0, 100);
  const like = q ? likePattern(q) : null;
  const [companies, people] = await Promise.all([
    query(
      `SELECT c.id, c.name, COALESCE(c.ids->>'inn', c.ids->>'bin', c.ids->>'taxId') AS inn
       FROM cmp_companies c
       WHERE c.archived_at IS NULL ${like ? `AND (c.name ILIKE $1 OR c.full_name ILIKE $1 OR c.ids::text ILIKE $1)` : ''}
       ORDER BY ${like ? 'POSITION(LOWER($2) IN LOWER(c.name)), LOWER(c.name)' : 'c.updated_at DESC'} LIMIT 10`,
      like ? [like, q] : []
    ),
    query(
      `SELECT pp.id, ${PERSON_NAME} AS name, pp.phones->0->>'value' AS phone, pp.emails->0->>'value' AS email, pc.id AS company_id, pc.name AS company_name
       FROM cmp_people pp
       LEFT JOIN LATERAL (
         SELECT c.id, c.name FROM cmp_positions po JOIN cmp_companies c ON c.id = po.company_id
         WHERE po.person_id = pp.id AND po.ended_on IS NULL ORDER BY po.is_primary DESC, po.id DESC LIMIT 1
       ) pc ON TRUE
       WHERE pp.archived_at IS NULL
         ${like ? `AND (CONCAT_WS(' ', pp.last_name, pp.first_name, pp.middle_name) ILIKE $1 OR CONCAT_WS(' ', pp.first_name, pp.last_name) ILIKE $1 OR pp.phones::text ILIKE $1 OR pp.emails::text ILIKE $1)` : ''}
       ORDER BY ${like ? 'LOWER(pp.last_name), LOWER(pp.first_name)' : 'pp.updated_at DESC'} LIMIT 10`,
      like ? [like] : []
    ),
  ]);
  return {
    companies: companies.rows.map((row) => ({ id: row.id, name: row.name, inn: row.inn || null })),
    people: people.rows.map((row) => ({
      id: row.id,
      name: row.name || '',
      phone: row.phone || null,
      email: row.email || null,
      company: row.company_id ? { id: row.company_id, name: row.company_name } : null,
    })),
  };
}

/**
 * Quick create: { type: 'company' | 'person', name, phone?, email?, companyId? }
 * → { type, id, name, … }. A person's name "Иванов Иван" is split as last + first name.
 */
export async function createClient(ctx, input = {}, req = null) {
  if (!(await modulesEnabled()).companies) throw httpError(400, 'The Companies module is off', 'COMPANIES_DISABLED');
  if (!companiesScopeAllows(req, 'write')) throw httpError(403, 'The token lacks the companies:write scope', 'SCOPE_DENIED');
  const type = input.type === 'person' ? 'person' : input.type === 'company' ? 'company' : null;
  if (!type) throw httpError(400, 'type must be company or person', 'INVALID_TYPE');
  const name = clean(input.name, 300);
  if (!name) throw httpError(400, 'Enter a name', 'NAME_REQUIRED');
  const phone = clean(input.phone, 60);
  const email = clean(input.email, 200);
  const contacts = { phones: phone ? [{ value: phone }] : [], emails: email ? [{ value: email }] : [] };
  const actor = { userId: ctx.userId, isAdmin: false };
  if (type === 'company') {
    // force: a quick card has no identifiers, the duplicate check has nothing to compare.
    const company = await createCompany(actor, { name, ...contacts, force: true });
    return { type, id: company.id, name: company.name };
  }
  const words = name.split(/\s+/).filter(Boolean);
  const companyId = posInt(input.companyId);
  const person = await createPerson(actor, {
    last_name: words.length > 1 ? words[0] : null,
    first_name: words.length > 1 ? words.slice(1).join(' ') : words[0],
    ...contacts,
    ...(companyId ? { position: { companyId } } : {}),
  });
  const { rows } = await query(`SELECT ${PERSON_NAME} AS name FROM cmp_people pp WHERE pp.id = $1`, [person.id]);
  const company = companyId ? (await query(`SELECT id, name FROM cmp_companies WHERE id = $1`, [companyId])).rows[0] || null : null;
  return { type, id: person.id, name: rows[0]?.name || name, phone: phone || null, email: email || null, company };
}
