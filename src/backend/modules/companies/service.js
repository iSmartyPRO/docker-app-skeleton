import { query, withTransaction } from '../../config/database.js';
import { seal, unseal } from '../../services/crypto.js';
import { getSetting, getSettings, parseSettings, setSetting } from '../../services/settings.js';
import { avatarOf, contextFromRequest, httpError, intId } from '../shared/acl.js';
import { COUNTRIES, COUNTRY_CODES, cleanIds, primaryIdKey, profileOf } from './countries.js';
import { claimDocument, stashDocument } from './files.js';
import { REGISTRIES, lookupRegistry } from './registry/index.js';

/*
 * Counterparties: companies, contact people, careers, timeline, ratings.
 * Every signed-in employee can see the directory. Who may change it follows
 * the module setting (everyone, or the responsible person and admins).
 * Nothing is lost: changes are written to the timeline with old and new
 * values, people who leave a company keep their history, and archived cards
 * can be restored.
 */

// ── Context and settings ────────────────────────────────────────────────────

export function companiesContext(req) {
  const ctx = contextFromRequest(req, 'companies.admin');
  return { ...ctx, userName: req.user?.displayName || req.user?.username || '' };
}

export async function companiesSettings() {
  const parsed = parseSettings(await getSettings());
  return { enabled: Boolean(parsed.modules.companies?.enabled), ...parsed.modules.companies.settings };
}

const DADATA_KEY = 'companies_dadata_key';

export async function dadataKey() {
  const sealed = await getSetting(DADATA_KEY, '');
  return sealed ? unseal(sealed) || '' : '';
}

export async function setDadataKey(value) {
  const key = String(value || '').trim();
  if (key && !/^[a-f0-9]{40}$/i.test(key)) throw httpError(400, 'A DaData API key has 40 hexadecimal characters', 'INVALID_KEY');
  await setSetting(DADATA_KEY, key ? seal(key) : '');
}

export async function meta(ctx) {
  const settings = await companiesSettings();
  const key = await dadataKey();
  return {
    countries: Object.fromEntries(
      Object.entries(COUNTRIES).map(([code, profile]) => [code, { ...profile, registry: REGISTRIES[code] ? profile.registry || { id: code } : null }])
    ),
    settings: {
      defaultCountry: settings.defaultCountry,
      countries: settings.countries,
      editPolicy: settings.editPolicy,
      relations: settings.relations,
      customFields: settings.customFields,
    },
    integrations: { dadata: Boolean(key), dadataHint: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : null },
    isAdmin: ctx.isAdmin,
  };
}

function canEdit(ctx, row, settings) {
  if (ctx.isAdmin) return true;
  if (settings.editPolicy === 'everyone') return true;
  return row.owner_id === ctx.userId || row.created_by === ctx.userId;
}

function requireEdit(ctx, row, settings) {
  if (!canEdit(ctx, row, settings)) throw httpError(403, 'Only the responsible person or an administrator can change this card', 'FORBIDDEN');
}

// ── Field cleaning ──────────────────────────────────────────────────────────

const str = (value, max) => {
  const text = String(value ?? '').replace(/\u0000/g, '').trim();
  return text ? text.slice(0, max) : null;
};

const date = (value) => {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(new Date(text).getTime()) ? text : null;
};

const int = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < 10_000_000 ? n : null;
};

function contactList(list, max = 10) {
  return (Array.isArray(list) ? list : [])
    .map((item) => ({ value: str(item?.value, 200), label: str(item?.label, 40) }))
    .filter((item) => item.value)
    .slice(0, max);
}

function messengers(input) {
  const out = {};
  for (const key of ['telegram', 'whatsapp', 'wechat', 'viber', 'skype', 'linkedin', 'instagram']) {
    const value = str(input?.[key], 200);
    if (value) out[key] = value;
  }
  return out;
}

function bankAccounts(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => ({
      bank: str(item?.bank, 200),
      bic: str(item?.bic, 40),
      account: str(item?.account, 64),
      corr: str(item?.corr, 64),
      swift: str(item?.swift, 20),
      currency: str(item?.currency, 8),
    }))
    .filter((item) => item.bank || item.account)
    .slice(0, 10);
}

const tags = (list) => [...new Set((Array.isArray(list) ? list : []).map((tag) => str(tag, 40)).filter(Boolean))].slice(0, 20);

function customValues(input, fields, entity) {
  const out = {};
  for (const field of (fields || []).filter((item) => item.entity === entity)) {
    const value = input?.[field.key];
    if (value === undefined || value === null || value === '') continue;
    if (field.type === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) out[field.key] = n;
    } else if (field.type === 'date') {
      const d = date(value);
      if (d) out[field.key] = d;
    } else if (field.type === 'select') {
      if ((field.options || []).includes(value)) out[field.key] = value;
    } else {
      const text = str(value, 1000);
      if (text) out[field.key] = text;
    }
  }
  return out;
}

const COMPANY_TEXT = {
  name: 300,
  full_name: 1000,
  local_name: 1000,
  legal_form: 60,
  registering_authority: 500,
  legal_address: 1000,
  actual_address: 1000,
  director_name: 200,
  director_title: 200,
  activity: 1000,
  activity_code: 20,
  industry: 120,
  employees: 20,
  website: 300,
  notes: 20000,
};
const KINDS = ['legal', 'individual', 'branch', 'government', 'other'];
const STATUSES = ['active', 'liquidating', 'liquidated', 'reorganizing', 'unknown'];

/** The editable shape of a company from input over the current row. */
function companyValues(input, current, settings) {
  const country = COUNTRY_CODES.includes(input.country) ? input.country : current.country || settings.defaultCountry || 'KG';
  const values = { country };
  for (const [key, max] of Object.entries(COMPANY_TEXT)) {
    values[key] = input[key] !== undefined ? str(input[key], max) : current[key] ?? null;
  }
  if (!values.name) throw httpError(400, 'Enter the company name', 'NAME_REQUIRED');
  if (values.website && !/^https?:\/\//i.test(values.website)) values.website = `https://${values.website}`;
  values.kind = KINDS.includes(input.kind) ? input.kind : current.kind || 'legal';
  values.status = STATUSES.includes(input.status) ? input.status : current.status || 'unknown';
  values.registered_on = input.registered_on !== undefined ? date(input.registered_on) : current.registered_on ?? null;
  values.closed_on = input.closed_on !== undefined ? date(input.closed_on) : current.closed_on ?? null;
  values.founders_count = input.founders_count !== undefined ? int(input.founders_count) : current.founders_count ?? null;
  const { ids, errors } = cleanIds(country, input.ids !== undefined ? input.ids : current.ids || {});
  if (Object.keys(errors).length) {
    const error = httpError(400, 'Check the identifiers', 'INVALID_IDS');
    error.details = { fields: Object.keys(errors) };
    throw error;
  }
  values.ids = ids;
  values.phones = input.phones !== undefined ? contactList(input.phones) : current.phones || [];
  values.emails = input.emails !== undefined ? contactList(input.emails) : current.emails || [];
  values.messengers = input.messengers !== undefined ? messengers(input.messengers) : current.messengers || {};
  values.bank_accounts = input.bank_accounts !== undefined ? bankAccounts(input.bank_accounts) : current.bank_accounts || [];
  const relationKeys = new Set((settings.relations || []).map((relation) => relation.key));
  values.relations = input.relations !== undefined ? tags(input.relations).filter((key) => relationKeys.has(key)) : current.relations || [];
  values.tags = input.tags !== undefined ? tags(input.tags) : current.tags || [];
  values.owner_id = input.owner_id !== undefined ? (input.owner_id ? intId(input.owner_id) : null) : current.owner_id ?? null;
  values.custom = input.custom !== undefined ? customValues(input.custom, settings.customFields, 'company') : current.custom || {};
  return values;
}

const PERSON_TEXT = { last_name: 120, first_name: 120, middle_name: 120, city: 120, notes: 20000 };

function personValues(input, current, settings) {
  const values = {};
  for (const [key, max] of Object.entries(PERSON_TEXT)) {
    values[key] = input[key] !== undefined ? str(input[key], max) : current[key] ?? null;
  }
  if (!values.first_name && !values.last_name) throw httpError(400, 'Enter a name', 'NAME_REQUIRED');
  if (!values.first_name) {
    values.first_name = values.last_name;
    values.last_name = null;
  }
  values.birthday = input.birthday !== undefined ? date(input.birthday) : current.birthday ?? null;
  values.gender = ['m', 'f'].includes(input.gender) ? input.gender : input.gender !== undefined ? null : current.gender ?? null;
  values.country = input.country !== undefined ? (COUNTRY_CODES.includes(input.country) ? input.country : null) : current.country ?? null;
  values.phones = input.phones !== undefined ? contactList(input.phones) : current.phones || [];
  values.emails = input.emails !== undefined ? contactList(input.emails) : current.emails || [];
  values.messengers = input.messengers !== undefined ? messengers(input.messengers) : current.messengers || {};
  values.languages = input.languages !== undefined ? tags(input.languages) : current.languages || [];
  values.tags = input.tags !== undefined ? tags(input.tags) : current.tags || [];
  values.owner_id = input.owner_id !== undefined ? (input.owner_id ? intId(input.owner_id) : null) : current.owner_id ?? null;
  values.custom = input.custom !== undefined ? customValues(input.custom, settings.customFields, 'person') : current.custom || {};
  return values;
}

// ── Diff and timeline ───────────────────────────────────────────────────────

const comparable = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === undefined || value === '') return null;
  return value;
};

/** Field-by-field changes; identifiers and custom fields per key. */
function diff(before, after, keys) {
  const changes = [];
  for (const key of keys) {
    if (key === 'ids' || key === 'custom' || key === 'messengers') {
      const all = new Set([...Object.keys(before[key] || {}), ...Object.keys(after[key] || {})]);
      for (const sub of all) {
        const from = comparable(before[key]?.[sub]);
        const to = comparable(after[key]?.[sub]);
        if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field: `${key}.${sub}`, from, to });
      }
      continue;
    }
    const from = comparable(before[key]);
    const to = comparable(after[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field: key, from, to });
  }
  return changes;
}

export async function logEvent(client, { type, id, kind, body = null, data = {}, authorId = null, at = null }) {
  await (client || { query }).query(
    `INSERT INTO cmp_events (entity_type, entity_id, kind, body, data, author_id, happened_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))`,
    [type, id, kind, body, JSON.stringify(data), authorId, at]
  );
}

// ── Shapes ──────────────────────────────────────────────────────────────────

const iso = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value || null);
const userRef = (id, name) => (id ? { id, name } : null);

function companyShape(row, extra = {}) {
  return {
    id: row.id,
    country: row.country,
    kind: row.kind,
    name: row.name,
    full_name: row.full_name,
    local_name: row.local_name,
    legal_form: row.legal_form,
    ids: row.ids || {},
    status: row.status,
    registered_on: iso(row.registered_on),
    closed_on: iso(row.closed_on),
    registering_authority: row.registering_authority,
    legal_address: row.legal_address,
    actual_address: row.actual_address,
    director_name: row.director_name,
    director_title: row.director_title,
    founders_count: row.founders_count,
    activity: row.activity,
    activity_code: row.activity_code,
    industry: row.industry,
    employees: row.employees,
    phones: row.phones || [],
    emails: row.emails || [],
    website: row.website,
    messengers: row.messengers || {},
    bank_accounts: row.bank_accounts || [],
    relations: row.relations || [],
    tags: row.tags || [],
    owner: userRef(row.owner_id, row.owner_name),
    notes: row.notes,
    custom: row.custom || {},
    registry: row.registry ? { source: row.registry.source, sourceName: row.registry.sourceName, checkedAt: row.registry.checkedAt, url: row.registry.url } : null,
    archived: Boolean(row.archived_at),
    archivedAt: row.archived_at,
    archiveReason: row.archive_reason,
    createdBy: userRef(row.created_by, row.created_name),
    updatedBy: userRef(row.updated_by, row.updated_name),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rating: row.rating_avg !== undefined && row.rating_avg !== null ? { avg: Number(row.rating_avg), count: Number(row.rating_count) } : null,
    contactsCount: row.contacts_count !== undefined ? Number(row.contacts_count) : undefined,
    ...extra,
  };
}

function personShape(row, extra = {}) {
  return {
    id: row.id,
    last_name: row.last_name,
    first_name: row.first_name,
    middle_name: row.middle_name,
    fullName: [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' '),
    birthday: iso(row.birthday),
    gender: row.gender,
    phones: row.phones || [],
    emails: row.emails || [],
    messengers: row.messengers || {},
    country: row.country,
    city: row.city,
    languages: row.languages || [],
    tags: row.tags || [],
    owner: userRef(row.owner_id, row.owner_name),
    notes: row.notes,
    custom: row.custom || {},
    archived: Boolean(row.archived_at),
    archivedAt: row.archived_at,
    archiveReason: row.archive_reason,
    createdBy: userRef(row.created_by, row.created_name),
    updatedBy: userRef(row.updated_by, row.updated_name),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rating: row.rating_avg !== undefined && row.rating_avg !== null ? { avg: Number(row.rating_avg), count: Number(row.rating_count) } : null,
    current: row.current_company_id ? { companyId: row.current_company_id, companyName: row.current_company_name, title: row.current_title } : row.current_company_id === null ? null : undefined,
    ...extra,
  };
}

function positionShape(row) {
  return {
    id: row.id,
    personId: row.person_id,
    companyId: row.company_id,
    companyName: row.company_name,
    companyCountry: row.company_country,
    companyArchived: Boolean(row.company_archived),
    personName: [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' ') || undefined,
    personArchived: row.person_archived !== undefined ? Boolean(row.person_archived) : undefined,
    personPhones: row.person_phones,
    personEmails: row.person_emails,
    title: row.title,
    department: row.department,
    isPrimary: row.is_primary,
    isDecisionMaker: row.is_decision_maker,
    workPhone: row.work_phone,
    workEmail: row.work_email,
    startedOn: iso(row.started_on),
    endedOn: iso(row.ended_on),
    endReason: row.end_reason,
    current: !row.ended_on,
  };
}

const RATING_JOIN = (type, alias) => `
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(score)::numeric, 1) AS rating_avg, COUNT(*) AS rating_count FROM (
      SELECT DISTINCT ON (author_id) score FROM cmp_ratings
      WHERE entity_type = '${type}' AND entity_id = ${alias}.id ORDER BY author_id, created_at DESC
    ) latest
  ) r ON TRUE`;

const USER_JOINS = (alias) => `
  LEFT JOIN users ou ON ou.id = ${alias}.owner_id
  LEFT JOIN users cu ON cu.id = ${alias}.created_by
  LEFT JOIN users uu ON uu.id = ${alias}.updated_by`;
const USER_NAMES = `COALESCE(ou.display_name, ou.username) AS owner_name,
  COALESCE(cu.display_name, cu.username) AS created_name,
  COALESCE(uu.display_name, uu.username) AS updated_name`;

// ── Companies ───────────────────────────────────────────────────────────────

export async function listCompanies(ctx, filters = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace(/\?/g, `$${params.length}`));
  };
  where.push(filters.archived === '1' ? 'c.archived_at IS NOT NULL' : 'c.archived_at IS NULL');
  const q = String(filters.q || '').trim().slice(0, 100);
  if (q) {
    add(
      `(c.name ILIKE ? OR c.full_name ILIKE ? OR c.local_name ILIKE ? OR c.ids::text ILIKE ? OR c.phones::text ILIKE ? OR c.emails::text ILIKE ? OR c.director_name ILIKE ?)`,
      `%${q.replace(/[%_\\]/g, '\\$&')}%`
    );
  }
  if (COUNTRY_CODES.includes(filters.country)) add('c.country = ?', filters.country);
  if (filters.relation) add('? = ANY(c.relations)', String(filters.relation).slice(0, 40));
  if (filters.tag) add('? = ANY(c.tags)', String(filters.tag).slice(0, 40));
  if (filters.owner === 'me') add('c.owner_id = ?', ctx.userId);
  if (STATUSES.includes(filters.status)) add('c.status = ?', filters.status);
  const sort = { name: 'LOWER(c.name)', updated: 'c.updated_at DESC', created: 'c.created_at DESC', rating: 'r.rating_avg DESC NULLS LAST' }[filters.sort] || 'LOWER(c.name)';
  const limit = Math.min(Number(filters.limit) || 50, 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const { rows } = await query(
    `SELECT c.*, ${USER_NAMES}, r.rating_avg, r.rating_count,
            (SELECT COUNT(*) FROM cmp_positions p JOIN cmp_people pp ON pp.id = p.person_id
             WHERE p.company_id = c.id AND p.ended_on IS NULL AND pp.archived_at IS NULL) AS contacts_count,
            COUNT(*) OVER () AS total
     FROM cmp_companies c ${USER_JOINS('c')} ${RATING_JOIN('company', 'c')}
     WHERE ${where.join(' AND ')}
     ORDER BY ${sort}, c.id
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { items: rows.map((row) => companyShape(row)), total: rows[0] ? Number(rows[0].total) : 0 };
}

async function loadCompany(id, client = { query }) {
  const { rows } = await client.query(
    `SELECT c.*, ${USER_NAMES}, r.rating_avg, r.rating_count
     FROM cmp_companies c ${USER_JOINS('c')} ${RATING_JOIN('company', 'c')} WHERE c.id = $1`,
    [intId(id)]
  );
  if (!rows[0]) throw httpError(404, 'Company not found', 'NOT_FOUND');
  return rows[0];
}

async function companyPositions(companyId) {
  const { rows } = await query(
    `SELECT p.*, pp.last_name, pp.first_name, pp.middle_name, pp.archived_at IS NOT NULL AS person_archived,
            pp.phones AS person_phones, pp.emails AS person_emails
     FROM cmp_positions p JOIN cmp_people pp ON pp.id = p.person_id
     WHERE p.company_id = $1
     ORDER BY p.ended_on IS NOT NULL, p.is_decision_maker DESC, LOWER(pp.last_name), p.started_on DESC NULLS LAST`,
    [companyId]
  );
  return rows.map(positionShape);
}

export async function getCompany(ctx, id) {
  const settings = await companiesSettings();
  const row = await loadCompany(id);
  const files = await query(
    `SELECT f.id, f.kind, f.name, f.size, f.source, f.created_at, COALESCE(u.display_name, u.username) AS author
     FROM cmp_files f LEFT JOIN users u ON u.id = f.created_by WHERE f.company_id = $1 ORDER BY f.created_at DESC`,
    [row.id]
  );
  return companyShape(row, {
    positions: await companyPositions(row.id),
    files: files.rows.map((file) => ({ id: file.id, kind: file.kind, name: file.name, size: Number(file.size), source: file.source, createdAt: file.created_at, author: file.author })),
    canEdit: canEdit(ctx, row, settings),
  });
}

/** Active cards with the same main identifier in the same country. */
export async function findDuplicates(country, ids, exceptId = null) {
  const key = primaryIdKey(country);
  const value = ids?.[key];
  if (!value) return [];
  const { rows } = await query(
    `SELECT id, name, archived_at FROM cmp_companies WHERE country = $1 AND ids->>$2 = $3 AND id <> $4 ORDER BY archived_at NULLS FIRST LIMIT 5`,
    [country, key, String(value), exceptId || 0]
  );
  return rows.map((row) => ({ id: row.id, name: row.name, archived: Boolean(row.archived_at) }));
}

async function attachDocument(client, companyId, documentId, registry, authorId) {
  if (!documentId) return null;
  const stored = await claimDocument(documentId, 'pdf');
  if (!stored) return null;
  const name = `${registry?.sourceName || 'Выписка'} ${new Date().toLocaleDateString('ru-RU')}.pdf`;
  const { rows } = await client.query(
    `INSERT INTO cmp_files (company_id, kind, name, storage_key, size, source, created_by) VALUES ($1, 'extract', $2, $3, $4, $5, $6) RETURNING id`,
    [companyId, name, stored.key, stored.size, registry?.source || null, authorId]
  );
  return rows[0].id;
}

const COMPANY_COLUMNS = [
  'country', 'kind', 'name', 'full_name', 'local_name', 'legal_form', 'ids', 'status', 'registered_on', 'closed_on',
  'registering_authority', 'legal_address', 'actual_address', 'director_name', 'director_title', 'founders_count',
  'activity', 'activity_code', 'industry', 'employees', 'phones', 'emails', 'website', 'messengers', 'bank_accounts',
  'relations', 'tags', 'owner_id', 'notes', 'custom',
];
const JSON_COLUMNS = new Set(['ids', 'phones', 'emails', 'messengers', 'bank_accounts', 'custom']);
const asParam = (key, value) => (JSON_COLUMNS.has(key) ? JSON.stringify(value) : value);

function registryRecord(registry) {
  if (!registry?.source) return null;
  return {
    source: String(registry.source).slice(0, 30),
    sourceName: String(registry.sourceName || '').slice(0, 60),
    checkedAt: registry.checkedAt || new Date().toISOString(),
    url: typeof registry.url === 'string' && /^https:\/\//.test(registry.url) ? registry.url.slice(0, 300) : null,
  };
}

export async function createCompany(ctx, input = {}) {
  const settings = await companiesSettings();
  const values = companyValues(input, {}, settings);
  if (!input.force) {
    const duplicates = await findDuplicates(values.country, values.ids);
    if (duplicates.length) {
      const error = httpError(409, 'A company with this identifier already exists', 'DUPLICATE');
      error.details = { duplicates };
      throw error;
    }
  }
  const registry = registryRecord(input.registry);
  const id = await withTransaction(async (client) => {
    const columns = [...COMPANY_COLUMNS, 'registry', 'created_by', 'updated_by'];
    const params = [...COMPANY_COLUMNS.map((key) => asParam(key, values[key])), registry ? JSON.stringify(registry) : null, ctx.userId, ctx.userId];
    const { rows } = await client.query(
      `INSERT INTO cmp_companies (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      params
    );
    const companyId = rows[0].id;
    await logEvent(client, { type: 'company', id: companyId, kind: 'created', authorId: ctx.userId, data: registry ? { source: registry.sourceName } : {} });
    const fileId = await attachDocument(client, companyId, input.documentId, registry, ctx.userId);
    if (fileId) await logEvent(client, { type: 'company', id: companyId, kind: 'file', body: 'extract', data: { fileId, source: registry?.sourceName }, authorId: ctx.userId });
    return companyId;
  });
  return getCompany(ctx, id);
}

export async function updateCompany(ctx, id, input = {}) {
  const settings = await companiesSettings();
  const current = await loadCompany(id);
  requireEdit(ctx, current, settings);
  const values = companyValues(input, current, settings);
  if (values.country !== current.country || values.ids[primaryIdKey(values.country)] !== current.ids?.[primaryIdKey(current.country)]) {
    const duplicates = await findDuplicates(values.country, values.ids, current.id);
    if (duplicates.length && !input.force) {
      const error = httpError(409, 'A company with this identifier already exists', 'DUPLICATE');
      error.details = { duplicates };
      throw error;
    }
  }
  const changes = diff(current, values, COMPANY_COLUMNS);
  if (!changes.length) return getCompany(ctx, id);
  await withTransaction(async (client) => {
    const sets = COMPANY_COLUMNS.map((key, i) => `${key} = $${i + 1}`);
    await client.query(
      `UPDATE cmp_companies SET ${sets.join(', ')}, updated_by = $${COMPANY_COLUMNS.length + 1}, updated_at = NOW() WHERE id = $${COMPANY_COLUMNS.length + 2}`,
      [...COMPANY_COLUMNS.map((key) => asParam(key, values[key])), ctx.userId, current.id]
    );
    await logEvent(client, { type: 'company', id: current.id, kind: 'changed', data: { changes }, authorId: ctx.userId });
  });
  return getCompany(ctx, id);
}

export async function archiveCompany(ctx, id, reason, archived = true) {
  const settings = await companiesSettings();
  const current = await loadCompany(id);
  requireEdit(ctx, current, settings);
  await withTransaction(async (client) => {
    await client.query(
      archived
        ? `UPDATE cmp_companies SET archived_at = NOW(), archived_by = $2, archive_reason = $3, updated_at = NOW() WHERE id = $1`
        : `UPDATE cmp_companies SET archived_at = NULL, archived_by = NULL, archive_reason = NULL, updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      archived ? [current.id, ctx.userId, str(reason, 500)] : [current.id, ctx.userId]
    );
    await logEvent(client, { type: 'company', id: current.id, kind: archived ? 'archived' : 'restored', body: archived ? str(reason, 500) : null, authorId: ctx.userId });
  });
  return getCompany(ctx, id);
}

export async function deleteCompany(ctx, id) {
  if (!ctx.isAdmin) throw httpError(403, 'Only administrators can delete for good', 'FORBIDDEN');
  const current = await loadCompany(id);
  const files = await query(`SELECT storage_key FROM cmp_files WHERE company_id = $1`, [current.id]);
  await query(`DELETE FROM cmp_events WHERE entity_type = 'company' AND entity_id = $1`, [current.id]);
  await query(`DELETE FROM cmp_ratings WHERE entity_type = 'company' AND entity_id = $1`, [current.id]);
  await query(`DELETE FROM cmp_companies WHERE id = $1`, [current.id]);
  const { removeFile } = await import('./files.js');
  for (const row of files.rows) await removeFile(row.storage_key);
}

// ── Registry ────────────────────────────────────────────────────────────────

/** Looks a company up in its country's register; the extract waits to be attached. */
export async function registryLookup(country, id) {
  const result = await lookupRegistry(country, id, { dadataKey: await dadataKey() });
  const documentId = result.document ? await stashDocument(result.document.buffer, 'pdf') : null;
  return {
    source: result.source,
    sourceName: result.sourceName,
    url: result.url,
    checkedAt: result.checkedAt,
    fields: result.fields,
    documentId,
    documentName: result.document?.name || null,
  };
}

const REGISTRY_FIELDS = [
  'name', 'full_name', 'local_name', 'legal_form', 'kind', 'status', 'registered_on', 'closed_on', 'registering_authority',
  'legal_address', 'director_name', 'director_title', 'founders_count', 'activity_code', 'employees',
];

/** Compares a card with its register: [{ field, current, registry }] for every difference. */
export async function verifyCompany(ctx, id) {
  const row = await loadCompany(id);
  const key = primaryIdKey(row.country);
  const value = row.ids?.[key];
  if (!value) throw httpError(400, 'Fill in the identifier first', 'NO_IDENTIFIER');
  const result = await registryLookup(row.country, value);
  const current = companyShape(row);
  const differences = [];
  for (const field of REGISTRY_FIELDS) {
    const registry = result.fields[field];
    if (registry === undefined || registry === null || registry === '') continue;
    if (String(current[field] ?? '') !== String(registry)) differences.push({ field, current: current[field] ?? null, registry });
  }
  for (const [sub, registry] of Object.entries(result.fields.ids || {})) {
    if (!registry) continue;
    if (String(current.ids?.[sub] ?? '') !== String(registry)) differences.push({ field: `ids.${sub}`, current: current.ids?.[sub] ?? null, registry });
  }
  return { ...result, differences };
}

/** Takes the chosen registry values into the card and records the check. */
export async function applyRegistry(ctx, id, input = {}) {
  const settings = await companiesSettings();
  const current = await loadCompany(id);
  requireEdit(ctx, current, settings);
  const chosen = input.fields && typeof input.fields === 'object' ? input.fields : {};
  const patch = {};
  for (const [field, value] of Object.entries(chosen)) {
    if (field.startsWith('ids.')) {
      patch.ids = { ...(patch.ids || current.ids || {}), [field.slice(4)]: value };
    } else if (REGISTRY_FIELDS.includes(field)) {
      patch[field] = value;
    }
  }
  const values = companyValues(patch, current, settings);
  const changes = diff(current, values, COMPANY_COLUMNS);
  const registry = registryRecord(input.registry);
  await withTransaction(async (client) => {
    const sets = COMPANY_COLUMNS.map((key, i) => `${key} = $${i + 1}`);
    await client.query(
      `UPDATE cmp_companies SET ${sets.join(', ')}, registry = $${COMPANY_COLUMNS.length + 1}, updated_by = $${COMPANY_COLUMNS.length + 2}, updated_at = NOW()
       WHERE id = $${COMPANY_COLUMNS.length + 3}`,
      [...COMPANY_COLUMNS.map((key) => asParam(key, values[key])), registry ? JSON.stringify(registry) : current.registry, ctx.userId, current.id]
    );
    const fileId = await attachDocument(client, current.id, input.documentId, registry, ctx.userId);
    await logEvent(client, {
      type: 'company',
      id: current.id,
      kind: 'registry',
      data: { source: registry?.sourceName, changes, differences: Number(input.differences) || changes.length, fileId },
      authorId: ctx.userId,
    });
  });
  return getCompany(ctx, id);
}

// ── People ──────────────────────────────────────────────────────────────────

const PERSON_COLUMNS = ['last_name', 'first_name', 'middle_name', 'birthday', 'gender', 'phones', 'emails', 'messengers', 'country', 'city', 'languages', 'tags', 'owner_id', 'notes', 'custom'];
const PERSON_JSON = new Set(['phones', 'emails', 'messengers', 'custom']);
const personParam = (key, value) => (PERSON_JSON.has(key) ? JSON.stringify(value) : value);

const CURRENT_JOB = `
  LEFT JOIN LATERAL (
    SELECT p.company_id AS current_company_id, c.name AS current_company_name, p.title AS current_title
    FROM cmp_positions p JOIN cmp_companies c ON c.id = p.company_id
    WHERE p.person_id = pp.id AND p.ended_on IS NULL
    ORDER BY p.is_primary DESC, p.started_on DESC NULLS LAST, p.id DESC LIMIT 1
  ) job ON TRUE`;

export async function listPeople(ctx, filters = {}) {
  const where = [filters.archived === '1' ? 'pp.archived_at IS NOT NULL' : 'pp.archived_at IS NULL'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace(/\?/g, `$${params.length}`));
  };
  const q = String(filters.q || '').trim().slice(0, 100);
  if (q) {
    add(
      `(CONCAT_WS(' ', pp.last_name, pp.first_name, pp.middle_name) ILIKE ? OR CONCAT_WS(' ', pp.first_name, pp.last_name) ILIKE ?
        OR pp.phones::text ILIKE ? OR pp.emails::text ILIKE ? OR pp.messengers::text ILIKE ? OR job.current_company_name ILIKE ?)`,
      `%${q.replace(/[%_\\]/g, '\\$&')}%`
    );
  }
  if (filters.owner === 'me') add('pp.owner_id = ?', ctx.userId);
  if (filters.tag) add('? = ANY(pp.tags)', String(filters.tag).slice(0, 40));
  if (filters.free === '1') where.push('job.current_company_id IS NULL');
  const limit = Math.min(Number(filters.limit) || 50, 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const sort = { updated: 'pp.updated_at DESC', created: 'pp.created_at DESC', rating: 'r.rating_avg DESC NULLS LAST' }[filters.sort] || 'LOWER(COALESCE(pp.last_name, pp.first_name)), LOWER(pp.first_name)';
  const { rows } = await query(
    `SELECT pp.*, ${USER_NAMES}, r.rating_avg, r.rating_count, job.*, COUNT(*) OVER () AS total
     FROM cmp_people pp ${USER_JOINS('pp')} ${RATING_JOIN('person', 'pp')} ${CURRENT_JOB}
     WHERE ${where.join(' AND ')}
     ORDER BY ${sort}, pp.id
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { items: rows.map((row) => personShape({ ...row, current_company_id: row.current_company_id ?? null })), total: rows[0] ? Number(rows[0].total) : 0 };
}

async function loadPerson(id) {
  const { rows } = await query(
    `SELECT pp.*, ${USER_NAMES}, r.rating_avg, r.rating_count
     FROM cmp_people pp ${USER_JOINS('pp')} ${RATING_JOIN('person', 'pp')} WHERE pp.id = $1`,
    [intId(id)]
  );
  if (!rows[0]) throw httpError(404, 'Contact not found', 'NOT_FOUND');
  return rows[0];
}

export async function getPerson(ctx, id) {
  const settings = await companiesSettings();
  const row = await loadPerson(id);
  const { rows } = await query(
    `SELECT p.*, c.name AS company_name, c.country AS company_country, c.archived_at IS NOT NULL AS company_archived
     FROM cmp_positions p JOIN cmp_companies c ON c.id = p.company_id
     WHERE p.person_id = $1
     ORDER BY p.ended_on IS NOT NULL, p.ended_on DESC NULLS FIRST, p.started_on DESC NULLS LAST, p.id DESC`,
    [row.id]
  );
  return personShape(row, { positions: rows.map(positionShape), canEdit: canEdit(ctx, row, settings) });
}

function positionValues(input, current = {}) {
  return {
    title: input.title !== undefined ? str(input.title, 200) : current.title ?? null,
    department: input.department !== undefined ? str(input.department, 200) : current.department ?? null,
    is_primary: typeof input.isPrimary === 'boolean' ? input.isPrimary : current.is_primary ?? true,
    is_decision_maker: typeof input.isDecisionMaker === 'boolean' ? input.isDecisionMaker : current.is_decision_maker ?? false,
    work_phone: input.workPhone !== undefined ? str(input.workPhone, 60) : current.work_phone ?? null,
    work_email: input.workEmail !== undefined ? str(input.workEmail, 200) : current.work_email ?? null,
    started_on: input.startedOn !== undefined ? date(input.startedOn) : current.started_on ?? null,
  };
}

async function insertPosition(client, ctx, personId, companyId, input) {
  const company = await client.query(`SELECT id, name FROM cmp_companies WHERE id = $1`, [intId(companyId)]);
  if (!company.rows[0]) throw httpError(404, 'Company not found', 'NOT_FOUND');
  const v = positionValues(input);
  const person = await client.query(`SELECT CONCAT_WS(' ', last_name, first_name, middle_name) AS name FROM cmp_people WHERE id = $1`, [personId]);
  const { rows } = await client.query(
    `INSERT INTO cmp_positions (person_id, company_id, title, department, is_primary, is_decision_maker, work_phone, work_email, started_on, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [personId, company.rows[0].id, v.title, v.department, v.is_primary, v.is_decision_maker, v.work_phone, v.work_email, v.started_on, ctx.userId]
  );
  const data = { companyId: company.rows[0].id, companyName: company.rows[0].name, title: v.title, startedOn: v.started_on };
  await logEvent(client, { type: 'person', id: personId, kind: 'joined', data, authorId: ctx.userId });
  await logEvent(client, { type: 'company', id: company.rows[0].id, kind: 'joined', data: { ...data, personId, personName: person.rows[0]?.name }, authorId: ctx.userId });
  return rows[0].id;
}

export async function createPerson(ctx, input = {}) {
  const settings = await companiesSettings();
  const values = personValues(input, {}, settings);
  const id = await withTransaction(async (client) => {
    const columns = [...PERSON_COLUMNS, 'created_by', 'updated_by'];
    const { rows } = await client.query(
      `INSERT INTO cmp_people (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      [...PERSON_COLUMNS.map((key) => personParam(key, values[key])), ctx.userId, ctx.userId]
    );
    await logEvent(client, { type: 'person', id: rows[0].id, kind: 'created', authorId: ctx.userId });
    if (input.position?.companyId) await insertPosition(client, ctx, rows[0].id, input.position.companyId, input.position);
    return rows[0].id;
  });
  return getPerson(ctx, id);
}

export async function updatePerson(ctx, id, input = {}) {
  const settings = await companiesSettings();
  const current = await loadPerson(id);
  requireEdit(ctx, current, settings);
  const values = personValues(input, current, settings);
  const changes = diff(current, values, PERSON_COLUMNS);
  if (changes.length) {
    await withTransaction(async (client) => {
      const sets = PERSON_COLUMNS.map((key, i) => `${key} = $${i + 1}`);
      await client.query(
        `UPDATE cmp_people SET ${sets.join(', ')}, updated_by = $${PERSON_COLUMNS.length + 1}, updated_at = NOW() WHERE id = $${PERSON_COLUMNS.length + 2}`,
        [...PERSON_COLUMNS.map((key) => personParam(key, values[key])), ctx.userId, current.id]
      );
      await logEvent(client, { type: 'person', id: current.id, kind: 'changed', data: { changes }, authorId: ctx.userId });
    });
  }
  return getPerson(ctx, id);
}

export async function archivePerson(ctx, id, reason, archived = true) {
  const settings = await companiesSettings();
  const current = await loadPerson(id);
  requireEdit(ctx, current, settings);
  await withTransaction(async (client) => {
    await client.query(
      archived
        ? `UPDATE cmp_people SET archived_at = NOW(), archived_by = $2, archive_reason = $3, updated_at = NOW() WHERE id = $1`
        : `UPDATE cmp_people SET archived_at = NULL, archived_by = NULL, archive_reason = NULL, updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      archived ? [current.id, ctx.userId, str(reason, 500)] : [current.id, ctx.userId]
    );
    await logEvent(client, { type: 'person', id: current.id, kind: archived ? 'archived' : 'restored', body: archived ? str(reason, 500) : null, authorId: ctx.userId });
  });
  return getPerson(ctx, id);
}

export async function deletePerson(ctx, id) {
  if (!ctx.isAdmin) throw httpError(403, 'Only administrators can delete for good', 'FORBIDDEN');
  const current = await loadPerson(id);
  await query(`DELETE FROM cmp_events WHERE entity_type = 'person' AND entity_id = $1`, [current.id]);
  await query(`DELETE FROM cmp_ratings WHERE entity_type = 'person' AND entity_id = $1`, [current.id]);
  await query(`DELETE FROM cmp_people WHERE id = $1`, [current.id]);
}

// ── Careers ─────────────────────────────────────────────────────────────────

export async function addPosition(ctx, personId, input = {}) {
  const settings = await companiesSettings();
  const person = await loadPerson(personId);
  requireEdit(ctx, person, settings);
  await withTransaction((client) => insertPosition(client, ctx, person.id, input.companyId, input));
  return getPerson(ctx, person.id);
}

async function loadPosition(id) {
  const { rows } = await query(
    `SELECT p.*, c.name AS company_name, pp.owner_id, pp.created_by AS person_created_by,
            CONCAT_WS(' ', pp.last_name, pp.first_name, pp.middle_name) AS person_name
     FROM cmp_positions p JOIN cmp_companies c ON c.id = p.company_id JOIN cmp_people pp ON pp.id = p.person_id WHERE p.id = $1`,
    [intId(id)]
  );
  if (!rows[0]) throw httpError(404, 'Position not found', 'NOT_FOUND');
  return rows[0];
}

export async function updatePosition(ctx, id, input = {}) {
  const settings = await companiesSettings();
  const position = await loadPosition(id);
  requireEdit(ctx, { owner_id: position.owner_id, created_by: position.person_created_by }, settings);
  const v = positionValues(input, position);
  const endedOn = input.endedOn !== undefined ? date(input.endedOn) : position.ended_on;
  const changes = diff(position, { ...v, ended_on: endedOn }, ['title', 'department', 'is_primary', 'is_decision_maker', 'work_phone', 'work_email', 'started_on', 'ended_on']);
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE cmp_positions SET title = $1, department = $2, is_primary = $3, is_decision_maker = $4, work_phone = $5, work_email = $6,
         started_on = $7, ended_on = $8, updated_at = NOW() WHERE id = $9`,
      [v.title, v.department, v.is_primary, v.is_decision_maker, v.work_phone, v.work_email, v.started_on, endedOn, position.id]
    );
    if (changes.length) {
      await logEvent(client, { type: 'person', id: position.person_id, kind: 'position', data: { companyId: position.company_id, companyName: position.company_name, changes }, authorId: ctx.userId });
    }
  });
  return getPerson(ctx, position.person_id);
}

/**
 * The person leaves a company — the record stays as career history. With
 * `to`, they move on to another company in the same step.
 */
export async function endPosition(ctx, id, input = {}) {
  const settings = await companiesSettings();
  const position = await loadPosition(id);
  requireEdit(ctx, { owner_id: position.owner_id, created_by: position.person_created_by }, settings);
  if (position.ended_on) throw httpError(400, 'This job has already ended', 'ALREADY_ENDED');
  const endedOn = date(input.endedOn) || new Date().toISOString().slice(0, 10);
  const reason = str(input.reason, 500);
  await withTransaction(async (client) => {
    await client.query(`UPDATE cmp_positions SET ended_on = $1, end_reason = $2, updated_at = NOW() WHERE id = $3`, [endedOn, reason, position.id]);
    const data = { companyId: position.company_id, companyName: position.company_name, title: position.title, endedOn, reason };
    await logEvent(client, { type: 'person', id: position.person_id, kind: 'left', data, authorId: ctx.userId });
    await logEvent(client, { type: 'company', id: position.company_id, kind: 'left', data: { ...data, personId: position.person_id, personName: position.person_name }, authorId: ctx.userId });
    if (input.to?.companyId) {
      await insertPosition(client, ctx, position.person_id, input.to.companyId, { startedOn: input.to.startedOn || endedOn, ...input.to });
    }
  });
  return getPerson(ctx, position.person_id);
}

export async function deletePosition(ctx, id) {
  if (!ctx.isAdmin) throw httpError(403, 'Positions are kept as history; end them instead', 'FORBIDDEN');
  const position = await loadPosition(id);
  await query(`DELETE FROM cmp_positions WHERE id = $1`, [position.id]);
  await logEvent(null, { type: 'person', id: position.person_id, kind: 'position_removed', data: { companyId: position.company_id, companyName: position.company_name }, authorId: ctx.userId });
  return getPerson(ctx, position.person_id);
}

// ── Timeline ────────────────────────────────────────────────────────────────

const NOTE_KINDS = ['note', 'call', 'meeting', 'email', 'deal', 'issue'];
const ENTITY = { company: 'company', person: 'person' };

async function requireEntity(type, id) {
  if (!ENTITY[type]) throw httpError(404, 'Not found', 'NOT_FOUND');
  const table = type === 'company' ? 'cmp_companies' : 'cmp_people';
  const { rows } = await query(`SELECT id FROM ${table} WHERE id = $1`, [intId(id)]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  return rows[0].id;
}

export async function timeline(type, id, { before, kinds } = {}) {
  const entityId = await requireEntity(type, id);
  const params = [type, entityId];
  let extra = '';
  if (before) {
    params.push(new Date(before));
    extra += ` AND e.happened_at < $${params.length}`;
  }
  const list = String(kinds || '').split(',').filter(Boolean);
  if (list.length) {
    params.push(list);
    extra += ` AND e.kind = ANY($${params.length})`;
  }
  const { rows } = await query(
    `SELECT e.*, COALESCE(u.display_name, u.username) AS author_name, u.avatar_path
     FROM cmp_events e LEFT JOIN users u ON u.id = e.author_id
     WHERE e.entity_type = $1 AND e.entity_id = $2${extra}
     ORDER BY e.happened_at DESC, e.id DESC LIMIT 51`,
    params
  );
  return {
    items: rows.slice(0, 50).map((row) => ({
      id: row.id,
      kind: row.kind,
      body: row.body,
      data: row.data || {},
      at: row.happened_at,
      createdAt: row.created_at,
      author: row.author_id ? { id: row.author_id, name: row.author_name, avatar: avatarOf(row.avatar_path) } : null,
    })),
    more: rows.length > 50,
  };
}

export async function addNote(ctx, type, id, input = {}) {
  const entityId = await requireEntity(type, id);
  const kind = NOTE_KINDS.includes(input.kind) ? input.kind : 'note';
  const body = str(input.body, 10000);
  if (!body) throw httpError(400, 'Write something first', 'EMPTY');
  const at = input.at && !Number.isNaN(new Date(input.at).getTime()) ? new Date(input.at) : null;
  await logEvent(null, { type, id: entityId, kind, body, authorId: ctx.userId, at, data: input.result ? { result: str(input.result, 40) } : {} });
  await query(`UPDATE ${type === 'company' ? 'cmp_companies' : 'cmp_people'} SET updated_at = NOW() WHERE id = $1`, [entityId]);
  return timeline(type, entityId);
}

export async function deleteNote(ctx, eventId) {
  const { rows } = await query(`SELECT * FROM cmp_events WHERE id = $1`, [intId(eventId)]);
  const event = rows[0];
  if (!event || !NOTE_KINDS.includes(event.kind)) throw httpError(404, 'Not found', 'NOT_FOUND');
  // Changes made by the system are permanent; people remove only their own notes.
  if (event.author_id !== ctx.userId && !ctx.isAdmin) throw httpError(403, 'Only the author can delete a note', 'FORBIDDEN');
  await query(`DELETE FROM cmp_events WHERE id = $1`, [event.id]);
}

// ── Ratings ─────────────────────────────────────────────────────────────────

const CRITERIA = ['reliability', 'payment', 'quality', 'communication'];

export async function ratings(type, id) {
  const entityId = await requireEntity(type, id);
  const { rows } = await query(
    `SELECT r.*, COALESCE(u.display_name, u.username) AS author_name
     FROM cmp_ratings r LEFT JOIN users u ON u.id = r.author_id
     WHERE r.entity_type = $1 AND r.entity_id = $2 ORDER BY r.created_at DESC LIMIT 200`,
    [type, entityId]
  );
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.author_id)) latest.set(row.author_id, row);
  const current = [...latest.values()];
  const avg = (values) => (values.length ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10 : null);
  return {
    summary: {
      avg: avg(current.map((row) => row.score)),
      count: current.length,
      criteria: Object.fromEntries(CRITERIA.map((key) => [key, avg(current.map((row) => row.criteria?.[key]).filter((v) => Number.isFinite(v)))])),
      distribution: [5, 4, 3, 2, 1].map((score) => ({ score, count: current.filter((row) => row.score === score).length })),
    },
    items: rows.map((row) => ({
      id: row.id,
      score: row.score,
      criteria: row.criteria || {},
      comment: row.comment,
      author: row.author_id ? { id: row.author_id, name: row.author_name } : null,
      at: row.created_at,
      current: latest.get(row.author_id)?.id === row.id,
    })),
  };
}

export async function rate(ctx, type, id, input = {}) {
  const entityId = await requireEntity(type, id);
  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw httpError(400, 'Choose from 1 to 5 stars', 'INVALID_SCORE');
  const criteria = {};
  for (const key of CRITERIA) {
    const value = Number(input.criteria?.[key]);
    if (Number.isInteger(value) && value >= 1 && value <= 5) criteria[key] = value;
  }
  const comment = str(input.comment, 2000);
  await withTransaction(async (client) => {
    await client.query(`INSERT INTO cmp_ratings (entity_type, entity_id, score, criteria, comment, author_id) VALUES ($1, $2, $3, $4, $5, $6)`, [
      type,
      entityId,
      score,
      JSON.stringify(criteria),
      comment,
      ctx.userId,
    ]);
    await logEvent(client, { type, id: entityId, kind: 'rating', body: comment, data: { score, criteria }, authorId: ctx.userId });
  });
  return ratings(type, entityId);
}

// ── Other ───────────────────────────────────────────────────────────────────

export async function staff() {
  const { rows } = await query(
    `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users
     WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE ORDER BY LOWER(COALESCE(display_name, username))`
  );
  return rows.map((row) => ({ id: row.id, name: row.name, username: row.username, avatar: avatarOf(row.avatar_path) }));
}

export async function searchAll(ctx, q) {
  const [companies, people] = await Promise.all([listCompanies(ctx, { q, limit: 8 }), listPeople(ctx, { q, limit: 8 })]);
  return { companies: companies.items, people: people.items };
}

export { COUNTRY_CODES, profileOf };
