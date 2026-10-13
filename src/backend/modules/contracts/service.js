import { query, withTransaction } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import { emitEvent } from '../../api/events.js';
import { formatDate, isoDay } from '../../services/datetime.js';
import { portalRegional, requestRegional } from '../../services/regional.js';
import { getDefaultLegalEntity, getLegalEntity } from '../../services/legalEntities.js';
import { getProcess, refreshApproval, waitingDocIds, withdraw } from '../approvals/api.js';
import { avatarOf, userShape } from '../shared/acl.js';
import { removeBlob } from '../shared/storage.js';
import {
  ARCHIVED,
  IN_WORK,
  RUNNING,
  TYPE_KEY,
  availableTransitions,
  checkContract,
  checkTransition,
  cleanContract,
  dateTransition,
  diff,
  formatNumber,
  httpError,
  noticeDeadline,
} from './logic.js';
import { Params, canEdit, canManageRisks, canView, canWorkFiles, contractsContext, contractsSettings, isOwn, modulesEnabled, rolesFor, visibleSql } from './access.js';
import { contractMessage } from './messages.js';
import { resolveLinks, validateLinks } from './links.js';

/*
 * The contract card and the registry (docs/contracts.md). Every change is
 * recorded in ctr_events (the «История» tab), posted to the contract's
 * conversation when it has one, sent as a webhook (contracts.*) and, where
 * it concerns someone, as a notification.
 */

export const COLUMNS = `c.id, c.seq, c.number, c.ext_number, c.title, c.type_key, c.direction, c.company_id, c.counterparty, c.legal_entity_id,
  c.framework, c.amount, c.currency, c.payment_terms, c.description,
  c.concluded_on::text AS concluded_on, c.starts_on::text AS starts_on, c.ends_on::text AS ends_on,
  c.auto_renew, c.notice_days, c.lawyer_id, c.owner_id, c.deal_id, c.mp_project_id, c.mp_node_id,
  c.status, c.status_changed_at, c.current_version_id, c.signed_version_id, c.signed_at, c.signed_by, c.terminated_reason,
  c.created_by, c.updated_by, c.created_at, c.updated_at`;

const LIST_EXTRAS = `ap.status AS approval_status, ap.urgency AS approval_urgency, ap.due_at AS approval_due_at,
  EXISTS (SELECT 1 FROM ctr_versions sv WHERE sv.contract_id = c.id AND sv.signed) AS has_signed,
  (SELECT COUNT(*)::int FROM ctr_versions vv WHERE vv.contract_id = c.id) AS versions,
  (SELECT COUNT(*)::int FROM ctr_risks rr WHERE rr.contract_id = c.id AND rr.status = 'open' AND rr.importance = 'high') AS open_high`;

const FROM = `ctr_contracts c LEFT JOIN approval_processes ap ON ap.type = '${TYPE_KEY}' AND ap.doc_id = c.id::text`;

export const contractUrl = (id) => `/app/contracts/${id}`;

/** The context for a request: settings, rights and the person's "today". */
export async function requestContext(req) {
  const settings = await contractsSettings();
  const ctx = contractsContext(req, settings);
  const regional = await requestRegional(req);
  ctx.today = isoDay(new Date(), regional.timeZone);
  ctx.regional = regional;
  return ctx;
}

export async function portalToday() {
  return isoDay(new Date(), (await portalRegional()).timeZone);
}

export async function loadRow(id, client = { query }) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return null;
  const { rows } = await client.query(`SELECT ${COLUMNS}, ${LIST_EXTRAS} FROM ${FROM} WHERE c.id = $1`, [n]);
  return rows[0] || null;
}

/** A contract the person may see; 404 otherwise (its existence never leaks). */
export async function requireContract(ctx, id) {
  const row = await loadRow(id);
  if (!row || !(await canView(ctx, row))) throw httpError(404, 'Contract not found', 'NOT_FOUND');
  return row;
}

async function usersById(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users WHERE id = ANY($1)`, [list]);
  return new Map(rows.map((row) => [row.id, userShape(row)]));
}

const num = (value) => (value === null || value === undefined ? null : Number(value));

/** Plain shape for the API, lists and webhooks. */
export function contractShape(row, users = new Map()) {
  const shape = {
    id: row.id,
    number: row.number,
    extNumber: row.ext_number || null,
    title: row.title,
    typeKey: row.type_key || null,
    direction: row.direction || null,
    companyId: row.company_id || null,
    counterparty: row.counterparty || null,
    legalEntityId: row.legal_entity_id || null,
    framework: Boolean(row.framework),
    amount: num(row.amount),
    currency: row.currency ? row.currency.trim() : null,
    paymentTerms: row.payment_terms || null,
    description: row.description || null,
    concludedOn: row.concluded_on || null,
    startsOn: row.starts_on || null,
    endsOn: row.ends_on || null,
    autoRenew: Boolean(row.auto_renew),
    noticeDays: row.notice_days ?? null,
    lawyer: users.get(row.lawyer_id) || (row.lawyer_id ? { id: row.lawyer_id } : null),
    owner: users.get(row.owner_id) || (row.owner_id ? { id: row.owner_id } : null),
    createdBy: users.get(row.created_by) || (row.created_by ? { id: row.created_by } : null),
    dealId: row.deal_id || null,
    mpProjectId: row.mp_project_id || null,
    mpNodeId: row.mp_node_id || null,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    currentVersionId: row.current_version_id || null,
    signedVersionId: row.signed_version_id || null,
    signedAt: row.signed_at || null,
    terminatedReason: row.terminated_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    url: contractUrl(row.id),
  };
  shape.noticeDeadline = noticeDeadline(shape);
  if ('approval_status' in row) {
    shape.approval = row.approval_status ? { status: row.approval_status, urgency: row.approval_urgency, dueAt: row.approval_due_at, overdue: row.approval_status === 'pending' && row.approval_due_at && new Date(row.approval_due_at) < new Date() } : null;
    shape.hasSigned = Boolean(row.has_signed);
    shape.versions = row.versions ?? 0;
    shape.openHighRisks = row.open_high ?? 0;
  }
  return shape;
}

async function shapeRows(rows) {
  const users = await usersById(rows.flatMap((row) => [row.lawyer_id, row.owner_id, row.created_by]));
  return rows.map((row) => contractShape(row, users));
}

// ── History, chat, webhooks, notifications ──────────────────────────────────

export async function logEvent(client, contractId, kind, data = {}, actorId = null) {
  await client.query(`INSERT INTO ctr_events (contract_id, kind, data, actor_id) VALUES ($1, $2, $3, $4)`, [contractId, kind, JSON.stringify(data), actorId]);
}

/** A system line in the contract's conversation — only when it already has one (no rooms for every contract). */
export async function postChat(contractId, actorId, data) {
  try {
    if (!(await modulesEnabled()).chat) return;
    const { rows } = await query(`SELECT 1 FROM chat_rooms WHERE entity_type = 'contract' AND entity_id = $1`, [contractId]);
    if (!rows.length) return;
    const { postSystem } = await import('../chat/service.js');
    await postSystem('contract', contractId, { actorId, data });
  } catch (err) {
    console.warn(`[contracts] chat line for ${contractId} failed:`, err.message);
  }
}

/** Webhook `contracts.<name>` to webhooks whose person may see the contract. */
export function emitContract(name, row, actorId, extra = {}) {
  const contract = contractShape(row);
  return emitEvent(`contracts.${name}`, {
    actorId,
    data: { contract: { ...contract, lawyer: contract.lawyer?.id || null, owner: contract.owner?.id || null, createdBy: contract.createdBy?.id || null }, ...extra },
    visible: async (req) => canView(contractsContext(req, await contractsSettings()), row),
  });
}

/** The people a contract concerns: owner, lawyer (and the creator when `withCreator`). */
export const contractPeople = (row, withCreator = true) => [...new Set([row.owner_id, row.lawyer_id, withCreator ? row.created_by : null].filter(Boolean))];

export async function notifyPeople(userIds, kind, message, params, row, actorId) {
  const ids = [...new Set(userIds.filter((id) => id && id !== actorId))];
  if (!ids.length) return;
  try {
    await notify({ userIds: ids, kind, module: 'contracts', link: contractUrl(row.id), actorId, render: contractMessage(message, { contract: contractShape(row), ...params }) });
  } catch (err) {
    console.warn(`[contracts] notification ${kind} failed:`, err.message);
  }
}

export async function actorNameOf(actorId) {
  if (!actorId) return '';
  const { rows } = await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [actorId]);
  return rows[0]?.name || '';
}

// ── Registry ────────────────────────────────────────────────────────────────

export const VIEWS = ['all', 'mine', 'waiting', 'urgent', 'overdue', 'work', 'active', 'expiring', 'unsigned', 'archive'];

/** SQL condition of a chip. `waiting` = ids of contracts waiting for the person. */
function viewSql(view, ctx, p, extra) {
  const me = () => p.add(ctx.userId);
  switch (view) {
    case 'mine': {
      const m = me();
      return `(c.created_by = ${m} OR c.owner_id = ${m} OR c.lawyer_id = ${m}) AND c.status <> ALL(${p.add(ARCHIVED)}::text[])`;
    }
    case 'waiting':
      return extra.waiting.length ? `c.id::text = ANY(${p.add(extra.waiting)}::text[])` : 'FALSE';
    case 'urgent':
      return extra.urgent.length ? `ap.status IN ('pending', 'question') AND c.status IN ('approval', 'question') AND ap.urgency = ANY(${p.add(extra.urgent)}::text[])` : 'FALSE';
    case 'overdue':
      return `ap.status = 'pending' AND c.status = 'approval' AND ap.due_at < NOW()`;
    case 'work':
      return `c.status = ANY(${p.add(IN_WORK)}::text[])`;
    case 'active':
      return `c.status IN ('active', 'expiring')`;
    case 'expiring':
      return `(c.status = 'expiring' OR (c.status = ANY(${p.add(RUNNING)}::text[]) AND c.ends_on BETWEEN ${p.add(ctx.today)}::date AND ${p.add(ctx.today)}::date + ${p.add(ctx.settings.expiringDays || 30)}::int))`;
    case 'unsigned':
      return `c.status IN ('approved', 'signed', 'active', 'expiring') AND NOT EXISTS (SELECT 1 FROM ctr_versions uv WHERE uv.contract_id = c.id AND uv.signed)`;
    case 'archive':
      return `c.status = ANY(${p.add(ARCHIVED)}::text[])`;
    default:
      return `c.status <> ALL(${p.add(ARCHIVED)}::text[])`;
  }
}

/** Urgency keys counted as «Срочные»: every configured level but the last (the calmest). */
async function urgentKeys() {
  const { approvalSettingsForContracts } = await import('./approval.js');
  const levels = (await approvalSettingsForContracts()).urgencies || [];
  return levels.slice(0, Math.max(0, levels.length - 1)).map((level) => level.key);
}

const SORTS = {
  number: 'c.seq',
  title: 'LOWER(c.title)',
  endsOn: 'c.ends_on',
  amount: 'c.amount',
  updated: 'c.updated_at',
  counterparty: 'LOWER(c.counterparty)',
  status: 'c.status',
};

const likePattern = (q) => `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

/** Filters shared by the list and the counters (everything but the chip). */
async function baseWhere(ctx, input, p) {
  const where = [await visibleSql(ctx, p)];
  const search = String(input.search ?? input.q ?? '').trim().slice(0, 100);
  if (search) {
    const like = p.add(likePattern(search));
    where.push(`(c.number ILIKE ${like} OR c.title ILIKE ${like} OR c.counterparty ILIKE ${like} OR c.ext_number ILIKE ${like})`);
  }
  if (input.status) {
    const list = String(input.status).split(',').filter(Boolean).slice(0, 10);
    where.push(`c.status = ANY(${p.add(list)}::text[])`);
  }
  if (input.type) where.push(`c.type_key = ${p.add(String(input.type).slice(0, 24))}`);
  if (['supplier', 'client'].includes(input.direction)) where.push(`c.direction = ${p.add(input.direction)}`);
  for (const [key, column] of [['owner', 'owner_id'], ['lawyer', 'lawyer_id'], ['company', 'company_id'], ['deal', 'deal_id'], ['legalEntity', 'legal_entity_id']]) {
    const n = Number(input[key] === 'me' ? ctx.userId : input[key]);
    if (input[key] !== undefined && input[key] !== '' && Number.isInteger(n) && n > 0) where.push(`c.${column} = ${p.add(n)}`);
  }
  return where;
}

export async function listContracts(ctx, input = {}) {
  const view = VIEWS.includes(input.view) ? input.view : 'all';
  const page = Math.max(1, Number.parseInt(input.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(input.pageSize ?? input.limit, 10) || 50));
  const p = new Params();
  const where = await baseWhere(ctx, input, p);
  const extra = {
    waiting: view === 'waiting' ? await waitingDocIds(ctx.req, TYPE_KEY) : [],
    urgent: view === 'urgent' ? await urgentKeys() : [],
  };
  where.push(viewSql(view, ctx, p, extra));
  const countValues = [...p.values];
  const dir = input.order === 'desc' ? 'DESC' : input.order === 'asc' ? 'ASC' : null;
  let order;
  if (SORTS[input.sort]) order = `${SORTS[input.sort]} ${dir || 'ASC'} NULLS LAST, c.id DESC`;
  else {
    // «Внимание»: overdue approvals, then questions and approvals by urgency, then the nearest end date.
    const levels = await urgentKeys().catch(() => []);
    order = `(ap.status = 'pending' AND c.status = 'approval' AND ap.due_at < NOW()) DESC,
      CASE c.status WHEN 'question' THEN 0 WHEN 'approval' THEN 1 WHEN 'expiring' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END,
      COALESCE(array_position(${p.add(levels)}::text[], ap.urgency), 99), c.ends_on NULLS LAST, c.id DESC`;
  }
  const sql = `SELECT ${COLUMNS}, ${LIST_EXTRAS} FROM ${FROM} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const [{ rows }, count] = await Promise.all([query(sql, p.values), query(`SELECT COUNT(*)::int AS n FROM ${FROM} WHERE ${where.join(' AND ')}`, countValues)]);
  return { items: await shapeRows(rows), total: count.rows[0].n, page, pageSize, view };
}

/** Counters of every chip under the same search and filters. */
export async function counters(ctx, input = {}) {
  const p = new Params();
  const where = await baseWhere(ctx, input, p);
  const extra = { waiting: await waitingDocIds(ctx.req, TYPE_KEY), urgent: await urgentKeys() };
  const parts = VIEWS.map((view) => `COUNT(*) FILTER (WHERE ${viewSql(view, ctx, p, extra)})::int AS "${view}"`);
  const { rows } = await query(`SELECT ${parts.join(', ')} FROM ${FROM} WHERE ${where.join(' AND ')}`, p.values);
  return rows[0];
}

/** The expiry calendar: contracts in force (or approved) ending, or with a refusal deadline, in the months shown. */
export async function calendar(ctx, input = {}) {
  const from = /^\d{4}-\d{2}$/.test(input.from || '') ? `${input.from}-01` : `${ctx.today.slice(0, 7)}-01`;
  const months = Math.min(24, Math.max(1, Number.parseInt(input.months, 10) || 12));
  const p = new Params();
  const where = [await visibleSql(ctx, p), `c.status IN ('approved', 'signed', 'active', 'expiring')`];
  const start = p.add(from);
  const span = p.add(months);
  where.push(`((c.ends_on >= ${start}::date AND c.ends_on < ${start}::date + make_interval(months => ${span}::int))
    OR (c.auto_renew AND c.notice_days IS NOT NULL AND c.ends_on - c.notice_days >= ${start}::date AND c.ends_on - c.notice_days < ${start}::date + make_interval(months => ${span}::int)))`);
  const { rows } = await query(`SELECT ${COLUMNS}, ${LIST_EXTRAS} FROM ${FROM} WHERE ${where.join(' AND ')} ORDER BY c.ends_on, c.id LIMIT 2000`, p.values);
  return { from, months, today: ctx.today, items: await shapeRows(rows) };
}

/** Picker for other modules (Procurement): visible contracts by number, title, counterparty. */
export async function pickContracts(ctx, input = {}) {
  const result = await listContracts(ctx, { ...input, pageSize: input.limit || 20, view: input.view || 'all' });
  return result;
}

// ── One contract ────────────────────────────────────────────────────────────

export async function versionsOf(contractId) {
  const { rows } = await query(
    `SELECT v.*, COALESCE(u.display_name, u.username) AS author_name, u.username AS author_username, u.avatar_path AS author_avatar
     FROM ctr_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.contract_id = $1 ORDER BY v.no DESC`,
    [contractId]
  );
  return rows.map(versionShape);
}

export function versionShape(row) {
  return {
    id: row.id,
    no: row.no,
    name: row.name,
    ext: row.ext || '',
    mime: row.mime || '',
    size: Number(row.size) || 0,
    comment: row.comment || '',
    signed: Boolean(row.signed),
    author: row.created_by ? { id: row.created_by, name: row.author_name || row.author_username, avatarUrl: avatarOf(row.author_avatar) } : null,
    createdAt: row.created_at,
    url: `/api/app/contracts/versions/${row.id}/file`,
  };
}

export async function risksOf(contractId) {
  const { rows } = await query(
    `SELECT r.*, COALESCE(u.display_name, u.username) AS author_name, COALESCE(rv.display_name, rv.username) AS resolver_name
     FROM ctr_risks r LEFT JOIN users u ON u.id = r.created_by LEFT JOIN users rv ON rv.id = r.resolved_by
     WHERE r.contract_id = $1
     ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, CASE r.importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, r.no`,
    [contractId]
  );
  return rows.map(riskShape);
}

export function riskShape(row) {
  return {
    id: row.id,
    no: row.no,
    text: row.text,
    clause: row.clause || '',
    importance: row.importance,
    status: row.status,
    author: row.created_by ? { id: row.created_by, name: row.author_name } : null,
    resolvedBy: row.resolved_by ? { id: row.resolved_by, name: row.resolver_name } : null,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** What the person may do with the contract (buttons of the card). */
export function rightsOf(ctx, row, process) {
  const own = isOwn(ctx, row);
  const approvalActive = process && ['pending', 'question'].includes(process.status);
  return {
    edit: canEdit(ctx, row),
    files: canWorkFiles(ctx, row),
    risks: canManageRisks(ctx, row),
    links: canWorkFiles(ctx, row),
    transitions: availableTransitions(row.status, rolesFor(ctx, row)),
    // Sending to approval goes through <ApprovalActions />; the server checks it again in onStatus.
    start: ['draft', 'rejected'].includes(row.status) && (own || ctx.isLegal) && !approvalActive,
    delete: ['draft', 'rejected'].includes(row.status) && !approvalActive && (row.created_by === ctx.userId || ctx.isAdmin || ctx.isLegal),
    signedMark: ctx.isLegal,
  };
}

export async function getContract(ctx, id) {
  const row = await requireContract(ctx, id);
  const [users, versions, risks, process, links, legalEntity] = await Promise.all([
    usersById([row.lawyer_id, row.owner_id, row.created_by, row.signed_by]),
    versionsOf(row.id),
    risksOf(row.id),
    getProcess(TYPE_KEY, row.id, ctx.req).catch(() => null),
    resolveLinks(ctx, row),
    row.legal_entity_id ? getLegalEntity(row.legal_entity_id) : null,
  ]);
  const contract = contractShape(row, users);
  contract.signedBy = users.get(row.signed_by) || null;
  contract.legalEntity = legalEntity ? { id: legalEntity.id, name: legalEntity.label || legalEntity.name, archived: legalEntity.archived } : null;
  return { contract, versions, risks, links, can: rightsOf(ctx, row, process), approval: process ? { id: process.id, status: process.status } : null };
}

export async function listEvents(ctx, id, input = {}) {
  const row = await requireContract(ctx, id);
  const before = Number(input.before);
  const params = [row.id];
  let cond = '';
  if (Number.isInteger(before) && before > 0) {
    params.push(before);
    cond = 'AND e.id < $2';
  }
  const { rows } = await query(
    `SELECT e.*, COALESCE(u.display_name, u.username) AS name, u.username, u.avatar_path FROM ctr_events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.contract_id = $1 ${cond} ORDER BY e.id DESC LIMIT 100`,
    params
  );
  return {
    events: rows.map((e) => ({ id: Number(e.id), kind: e.kind, data: e.data || {}, actor: e.actor_id ? userShape({ id: e.actor_id, username: e.username, name: e.name, avatar_path: e.avatar_path }) : null, at: e.created_at })),
    hasMore: rows.length === 100,
  };
}

// ── Create, update ──────────────────────────────────────────────────────────

async function activeUserId(id, field) {
  if (!id) return null;
  const { rows } = await query(`SELECT id FROM users WHERE id = $1 AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [id]);
  if (!rows[0]) throw httpError(400, 'Unknown person', 'BAD_USER', { field });
  return rows[0].id;
}

/** Company of Counterparties: its current name becomes the text counterparty (kept if the module is later switched off). */
async function companyName(id) {
  if (!id) return null;
  if (!(await modulesEnabled()).companies) throw httpError(400, 'Counterparties are turned off', 'COMPANIES_DISABLED', { field: 'companyId' });
  const { rows } = await query(`SELECT name FROM cmp_companies WHERE id = $1`, [id]).catch(() => ({ rows: [] }));
  if (!rows[0]) throw httpError(400, 'Unknown company', 'BAD_COMPANY', { field: 'companyId' });
  return rows[0].name;
}

const FIELD_COLUMNS = {
  title: 'title',
  extNumber: 'ext_number',
  typeKey: 'type_key',
  direction: 'direction',
  companyId: 'company_id',
  counterparty: 'counterparty',
  legalEntityId: 'legal_entity_id',
  framework: 'framework',
  amount: 'amount',
  currency: 'currency',
  paymentTerms: 'payment_terms',
  description: 'description',
  concludedOn: 'concluded_on',
  startsOn: 'starts_on',
  endsOn: 'ends_on',
  autoRenew: 'auto_renew',
  noticeDays: 'notice_days',
  lawyerId: 'lawyer_id',
  ownerId: 'owner_id',
  dealId: 'deal_id',
  mpProjectId: 'mp_project_id',
  mpNodeId: 'mp_node_id',
};
const LINK_KEYS = ['dealId', 'mpProjectId', 'mpNodeId'];

/** The row as camelCase values of FIELD_COLUMNS (for diffs and checks). */
function fieldsOf(row) {
  const out = {};
  for (const [key, column] of Object.entries(FIELD_COLUMNS)) {
    let value = row[column] ?? null;
    if (key === 'amount' && value !== null) value = Number(value);
    if (key === 'currency' && value) value = value.trim();
    out[key] = value;
  }
  return out;
}

async function prepare(ctx, input, current = {}) {
  const data = cleanContract(input, ctx.settings);
  if ('lawyerId' in data) data.lawyerId = await activeUserId(data.lawyerId, 'lawyerId');
  if ('ownerId' in data) data.ownerId = await activeUserId(data.ownerId, 'ownerId');
  if ('companyId' in data && data.companyId && data.companyId !== current.companyId) data.counterparty = await companyName(data.companyId);
  if ('legalEntityId' in data && data.legalEntityId && data.legalEntityId !== current.legalEntityId) {
    const entity = await getLegalEntity(data.legalEntityId);
    if (!entity || entity.archived) throw httpError(400, 'Unknown legal entity', 'BAD_LEGAL_ENTITY', { field: 'legalEntityId' });
  }
  if ('framework' in data && data.framework) data.amount = data.amount ?? null;
  await validateLinks(ctx, data, current);
  checkContract({ ...current, ...data });
  return data;
}

export async function createContract(ctx, input = {}) {
  if (!ctx.canCreate) throw httpError(403, 'You cannot create contracts', 'FORBIDDEN');
  const data = await prepare(ctx, { currency: ctx.settings.defaultCurrency, ...input });
  if (!data.title) throw httpError(400, 'The title is required', 'TITLE_REQUIRED', { field: 'title' });
  if (data.legalEntityId === undefined) data.legalEntityId = (await getDefaultLegalEntity())?.id || null;
  if (data.ownerId === undefined) data.ownerId = ctx.userId;
  const row = await withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ctr_contracts_number'))`);
    const { rows: seqRows } = await client.query(`SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM ctr_contracts`);
    const seq = seqRows[0].seq;
    let number = formatNumber(ctx.settings.prefix, seq);
    // A prefix changed back and forth could meet an old number: skip ahead.
    for (let i = 0; i < 50 && (await client.query(`SELECT 1 FROM ctr_contracts WHERE number = $1`, [number])).rows.length; i++) number = formatNumber(ctx.settings.prefix, seq + i + 1);
    const keys = Object.keys(data).filter((key) => FIELD_COLUMNS[key]);
    const columns = ['seq', 'number', 'created_by', 'updated_by', ...keys.map((key) => FIELD_COLUMNS[key])];
    const values = [seq, number, ctx.userId, ctx.userId, ...keys.map((key) => data[key])];
    const { rows } = await client.query(`INSERT INTO ctr_contracts (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, values);
    await logEvent(client, rows[0].id, 'created', { number, title: data.title }, ctx.userId);
    return loadRow(rows[0].id, client);
  });
  const actor = await actorNameOf(ctx.userId);
  if (row.lawyer_id) await notifyPeople([row.lawyer_id], 'contracts.assigned', 'assigned', { role: 'lawyer', actor }, row, ctx.userId);
  if (row.owner_id && row.owner_id !== row.lawyer_id) await notifyPeople([row.owner_id], 'contracts.assigned', 'assigned', { role: 'owner', actor }, row, ctx.userId);
  emitContract('created', row, ctx.userId);
  return getContract(ctx, row.id);
}

export async function updateContract(ctx, id, input = {}) {
  const before = await requireContract(ctx, id);
  const keys = Object.keys(input).filter((key) => FIELD_COLUMNS[key]);
  if (!keys.length) return getContract(ctx, before.id);
  const onlyLinks = keys.every((key) => LINK_KEYS.includes(key));
  if (onlyLinks ? !canWorkFiles(ctx, before) : !canEdit(ctx, before)) {
    throw httpError(403, before.status === 'approval' ? 'The contract is in approval: fields are locked' : 'You cannot change this contract', before.status === 'approval' ? 'LOCKED' : 'FORBIDDEN');
  }
  const current = fieldsOf(before);
  const data = await prepare(ctx, Object.fromEntries(keys.map((key) => [key, input[key]])), current);
  const changes = diff(current, { ...current, ...data }, Object.keys(data));
  if (!Object.keys(changes).length) return getContract(ctx, before.id);
  const row = await withTransaction(async (client) => {
    const sets = Object.keys(changes).map((key, i) => `${FIELD_COLUMNS[key]} = $${i + 2}`);
    await client.query(`UPDATE ctr_contracts SET ${sets.join(', ')}, updated_by = $${sets.length + 2}, updated_at = NOW() WHERE id = $1`, [before.id, ...Object.keys(changes).map((key) => data[key]), ctx.userId]);
    await logEvent(client, before.id, 'updated', { changes }, ctx.userId);
    return loadRow(before.id, client);
  });
  // Dates of a contract in force may move it between «Действует» and «Истекает».
  if (RUNNING.includes(row.status) && (changes.endsOn || changes.startsOn || changes.autoRenew)) {
    await applyDates(row, ctx.today, ctx.settings, ctx.userId);
  }
  // The process follows the contract: its summary, and the stages not reached yet re-planned
  // when the amount, type, direction or legal entity changed (docs/approvals.md#replanning).
  await refreshApproval(TYPE_KEY, row.id, { actorId: ctx.userId }).catch((err) => console.warn('[contracts] approval refresh failed:', err.message));
  const actor = await actorNameOf(ctx.userId);
  if (changes.lawyerId && row.lawyer_id) await notifyPeople([row.lawyer_id], 'contracts.assigned', 'assigned', { role: 'lawyer', actor }, row, ctx.userId);
  if (changes.ownerId && row.owner_id) await notifyPeople([row.owner_id], 'contracts.assigned', 'assigned', { role: 'owner', actor }, row, ctx.userId);
  emitContract('updated', row, ctx.userId, { changes });
  return getContract(ctx, row.id);
}

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Writes a status (and optional extra columns) and its history line. Used by
 * people (changeStatus), the approvals callback (inside its transaction) and
 * the daily job. Side effects run in `after()` once the caller committed.
 */
export async function writeStatus(client, row, to, { actorId = null, comment = null, extra = {}, source = 'manual' } = {}) {
  const sets = ['status = $2', 'status_changed_at = NOW()', 'updated_at = NOW()'];
  const values = [row.id, to];
  for (const [column, value] of Object.entries(extra)) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  await client.query(`UPDATE ctr_contracts SET ${sets.join(', ')} WHERE id = $1`, values);
  await logEvent(client, row.id, 'status', { from: row.status, to, comment: comment || undefined, source }, actorId);
}

/** Notifications, chat line and webhook of a status change (after the commit). */
export async function afterStatus(row, from, to, { actorId = null, comment = null, notifyStatus = true } = {}) {
  if (notifyStatus) await notifyPeople(contractPeople(row), 'contracts.status', 'status', { status: to, comment, actor: await actorNameOf(actorId) }, row, actorId);
  await postChat(row.id, actorId, { event: 'contract.status', from, to, comment: comment || undefined });
  emitContract('status_changed', row, actorId, { from, to });
}

/** Applies the date rules (start reached, expiring, ended, prolonged) to one contract now. */
export async function applyDates(row, today, settings, actorId = null) {
  const shape = contractShape(row);
  const next = dateTransition(shape, today, settings.expiringDays || 30);
  if (!next) return row;
  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT status, ends_on::text AS ends_on FROM ctr_contracts WHERE id = $1 FOR UPDATE`, [row.id]);
    if (!rows[0] || rows[0].status !== row.status || rows[0].ends_on !== row.ends_on) return null;
    const extra = next.prolonged ? { starts_on: next.startsOn, ends_on: next.endsOn } : {};
    if (next.prolonged) await logEvent(client, row.id, 'prolonged', { from: next.from, to: next.endsOn, startsOn: next.startsOn }, null);
    if (next.status !== row.status) await writeStatus(client, row, next.status, { actorId, extra, source: 'dates' });
    else await client.query(`UPDATE ctr_contracts SET starts_on = $2, ends_on = $3, updated_at = NOW() WHERE id = $1`, [row.id, next.startsOn, next.endsOn]);
    return loadRow(row.id, client);
  });
  if (!updated) return row;
  if (next.prolonged) {
    await notifyPeople(contractPeople(updated), 'contracts.status', 'prolonged', { endsOn: next.endsOn }, updated, null);
    await postChat(row.id, null, { event: 'contract.prolonged', to: next.endsOn });
    emitContract('prolonged', updated, null, { from: next.from, to: next.endsOn });
  }
  if (next.status !== row.status) await afterStatus(updated, row.status, next.status, { actorId, notifyStatus: next.status !== 'active' || row.status === 'signed' });
  return updated;
}

/**
 * A manual status change: sign, put in force, complete, terminate, back to draft.
 *   signed: { signedVersionId?, signedOn? } — the version that was signed (default: the current one, if any)
 *   terminated: { comment } required
 */
export async function changeStatus(ctx, id, input = {}) {
  const row = await requireContract(ctx, id);
  const to = String(input.to || '');
  const check = checkTransition(row.status, to, rolesFor(ctx, row));
  if (!check.ok) {
    if (check.code === 'FORBIDDEN') throw httpError(403, 'You cannot change the status of this contract', 'FORBIDDEN');
    throw httpError(409, `A contract «${row.status}» cannot become «${to}»`, 'BAD_TRANSITION', { status: row.status, to });
  }
  const comment = String(input.comment ?? '').trim().slice(0, 1000) || null;
  if (check.rule.comment && !comment) throw httpError(400, 'Give the reason', 'COMMENT_REQUIRED', { field: 'comment' });
  if (to === 'draft' && row.approval_status && ['pending', 'question'].includes(row.approval_status)) throw httpError(409, 'The contract is in approval', 'IN_APPROVAL');
  const extra = {};
  let signedVersion = null;
  if (to === 'signed') {
    const wanted = input.signedVersionId ? Number(input.signedVersionId) : row.current_version_id;
    if (wanted) {
      const { rows } = await query(`SELECT id FROM ctr_versions WHERE id = $1 AND contract_id = $2`, [wanted, row.id]);
      if (!rows[0]) throw httpError(400, 'Unknown version', 'BAD_VERSION', { field: 'signedVersionId' });
      signedVersion = rows[0].id;
    }
    const signedOn = input.signedOn && /^\d{4}-\d{2}-\d{2}$/.test(input.signedOn) ? input.signedOn : ctx.today;
    Object.assign(extra, { signed_at: new Date(), signed_by: ctx.userId, signed_version_id: signedVersion });
    if (!row.concluded_on) extra.concluded_on = signedOn;
  }
  if (to === 'terminated') extra.terminated_reason = comment;
  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT status FROM ctr_contracts WHERE id = $1 FOR UPDATE`, [row.id]);
    if (rows[0]?.status !== row.status) throw httpError(409, 'The contract has changed — reload it', 'STALE');
    if (signedVersion) await client.query(`UPDATE ctr_versions SET signed = TRUE WHERE id = $1`, [signedVersion]);
    await writeStatus(client, row, to, { actorId: ctx.userId, comment, extra });
    return loadRow(row.id, client);
  });
  await afterStatus(updated, row.status, to, { actorId: ctx.userId, comment });
  // A signed contract whose start date has come is in force at once.
  if (to === 'signed') return getContract(ctx, (await applyDates(updated, ctx.today, ctx.settings, ctx.userId)).id);
  return getContract(ctx, updated.id);
}

export async function deleteContract(ctx, id) {
  const row = await requireContract(ctx, id);
  if (!rightsOf(ctx, row, row.approval_status ? { status: row.approval_status } : null).delete) {
    throw httpError(403, 'Only a draft can be deleted, by its author or a lawyer', 'FORBIDDEN');
  }
  // A process returned for rework would stay in the author's inbox: close it first.
  if (row.approval_status === 'returned') await withdraw({ system: true, user: { id: ctx.userId } }, TYPE_KEY, row.id).catch(() => null);
  const versions = await query(`SELECT storage_key FROM ctr_versions WHERE contract_id = $1`, [row.id]);
  await query(`DELETE FROM ctr_contracts WHERE id = $1`, [row.id]);
  await query(`DELETE FROM approval_processes WHERE type = $1 AND doc_id = $2 AND status NOT IN ('pending', 'question')`, [TYPE_KEY, String(row.id)]).catch(() => null);
  for (const version of versions.rows) await removeBlob(version.storage_key);
  emitContract('deleted', row, ctx.userId);
}

// ── Export ──────────────────────────────────────────────────────────────────

const CSV_HEAD = {
  ru: ['№', 'Номер контрагента', 'Название', 'Контрагент', 'Тип', 'Направление', 'Сумма', 'Валюта', 'Заключён', 'Начало', 'Окончание', 'Автопролонгация', 'Статус', 'Ответственный', 'Юрист'],
  en: ['No.', 'Counterparty number', 'Title', 'Counterparty', 'Type', 'Direction', 'Amount', 'Currency', 'Concluded', 'Start', 'End', 'Auto-prolongation', 'Status', 'Business owner', 'Lawyer'],
};
const DIRECTION = { ru: { supplier: 'С поставщиком', client: 'С клиентом' }, en: { supplier: 'Supplier', client: 'Client' } };

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  // Formula injection: a cell starting with = + - @ is kept as text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The registry as CSV (Excel, `;`-separated, UTF-8 with BOM) under the same filters and rights, up to 5 000 rows. */
export async function exportCsv(ctx, input, res) {
  const locale = input.lang === 'en' ? 'en' : 'ru';
  const { typeName } = await import('./approval.js');
  const { statusName } = await import('./messages.js');
  const rows = [];
  for (let page = 1; page <= 25; page++) {
    const chunk = await listContracts(ctx, { ...input, page, pageSize: 200 });
    rows.push(...chunk.items);
    if (rows.length >= chunk.total) break;
  }
  const lines = [CSV_HEAD[locale].join(';')];
  // Dates as the person reads them elsewhere (their regional settings), like the procurement export.
  const regional = ctx.regional || (await requestRegional(ctx.req));
  const date = (value) => (value ? formatDate(value, regional, locale) : '');
  for (const c of rows) {
    lines.push(
      [c.number, c.extNumber, c.title, c.counterparty, typeName(ctx.settings, c.typeKey, locale), c.direction ? DIRECTION[locale][c.direction] : '', c.framework ? (locale === 'ru' ? 'рамочный' : 'framework') : c.amount ?? '', c.currency, date(c.concludedOn), date(c.startsOn), date(c.endsOn), c.autoRenew ? (locale === 'ru' ? 'да' : 'yes') : '', statusName(c.status, locale), c.owner?.name, c.lawyer?.name]
        .map(csvCell)
        .join(';')
    );
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contracts-${ctx.today}.csv"`);
  res.send(`﻿${lines.join('\r\n')}\r\n`);
}
