import { query, withTransaction } from '../../config/database.js';
import { emitEvent } from '../../api/events.js';
import { notify } from '../../services/notifications.js';
import { getAccessMap } from '../../services/rbac.js';
import { isoDay } from '../../services/datetime.js';
import { requestRegional } from '../../services/regional.js';
import { getDefaultLegalEntity, getLegalEntity, listLegalEntities } from '../../services/legalEntities.js';
import { avatarOf } from '../shared/acl.js';
import { getProcess, refreshApproval, restart, startApproval, withdraw } from '../approvals/api.js';
import { approvalSettings } from '../approvals/api.js';
import { APPROVAL_TYPE, Params, canSee, procContext, procurementSettings, rolesOn, visibleSql } from './access.js';
import {
  ACTIVE,
  CHIPS,
  DELIVERABLE,
  EDITABLE,
  FINISHED,
  IN_APPROVAL,
  PAYABLE,
  PAYMENT_TERMS,
  STATUSES,
  actionError,
  availableActions,
  cents,
  cleanItems,
  day,
  deriveStatus,
  formatNumber,
  httpError,
  itemsTotal,
  money,
  readyErrors,
} from './logic.js';
import { procurementMessage } from './messages.js';
import { validateLinks } from './lookups.js';

/*
 * Purchase requests: CRUD, lists with chips and counters, the card, the
 * manual transitions (submit, withdraw, cancel, close, reopen), history and
 * webhooks. Payments, deliveries and documents live in money.js / files.js.
 */

export const requestUrl = (id) => `/app/procurement/requests/${id}`;

const text = (value, max) => {
  const out = String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
  return out || null;
};
const intOrNull = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ── Context ─────────────────────────────────────────────────────────────────

/** The module context of an HTTP request (cached on it). */
export async function contextOf(req) {
  if (!req.proc) req.proc = procContext(req, await procurementSettings());
  return req.proc;
}

/** Today (YYYY-MM-DD) in the person's zone. */
export async function todayFor(req) {
  const regional = await requestRegional(req);
  return isoDay(new Date(), regional.timeZone);
}

// ── People ──────────────────────────────────────────────────────────────────

export async function usersByIds(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users WHERE id = ANY($1)`, [list]);
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, avatarUrl: avatarOf(row.avatar_path) }]));
}

async function activeUserId(id) {
  const n = intOrNull(id);
  if (!n) return null;
  const { rows } = await query(`SELECT id FROM users WHERE id = $1 AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [n]);
  if (!rows[0]) throw httpError(400, 'Unknown person', 'BAD_USER');
  return rows[0].id;
}

/** People who mark payments: explicit holders of procurement.pay (else every holder, `*` included). */
export async function payers() {
  const { rows } = await query(`SELECT id FROM users WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE`);
  const access = await getAccessMap(rows.map((row) => row.id));
  const explicit = [];
  const any = [];
  for (const row of rows) {
    const perms = access.get(row.id)?.permissions || [];
    if (perms.includes('procurement.pay')) explicit.push(row.id);
    if (perms.includes('procurement.pay') || perms.includes('*')) any.push(row.id);
  }
  return explicit.length ? explicit : any;
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export const SELECT = `SELECT r.*, ap.status AS approval_status, ap.due_at AS approval_due_at, ap.urgency AS approval_urgency,
    ap.stages AS approval_stages, ap.current_stage AS approval_stage
  FROM proc_requests r
  LEFT JOIN approval_processes ap ON ap.type = '${APPROVAL_TYPE}' AND ap.doc_id = r.id::text`;

function supplierOf(row) {
  if (!row.supplier_name && !row.supplier_company_id) return null;
  return { companyId: row.supplier_company_id, name: row.supplier_name || '', contact: row.supplier_contact || '' };
}

const link = (id, label) => (id || label ? { id: id || null, label: label || '' } : null);

/** One request for lists and webhooks. `today` = the viewer's day for overdue marks. */
export function requestShape(row, { people = new Map(), entities = new Map(), today = null } = {}) {
  const amount = Number(row.amount);
  const paid = Number(row.paid_amount);
  const payBy = row.pay_by ? isoDayOf(row.pay_by) : null;
  const deliverBy = row.deliver_by ? isoDayOf(row.deliver_by) : null;
  const approvalOverdue = Boolean(row.approval_status === 'pending' && row.approval_due_at && new Date(row.approval_due_at) <= new Date());
  const payOverdue = Boolean(today && payBy && payBy < today && PAYABLE.includes(row.status));
  const deliverOverdue = Boolean(today && deliverBy && deliverBy < today && DELIVERABLE.includes(row.status) && row.delivery_state !== 'full');
  const stage = row.approval_stages?.[row.approval_stage];
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    category: row.category || null,
    amount,
    currency: row.currency,
    paid,
    remaining: cents(Math.max(0, amount - paid)),
    urgency: row.urgency || row.approval_urgency || null,
    payBy,
    deliverBy,
    paymentTerms: row.payment_terms,
    advancePercent: row.advance_percent,
    supplier: supplierOf(row),
    legalEntity: row.legal_entity_id ? entities.get(row.legal_entity_id) || { id: row.legal_entity_id, label: `#${row.legal_entity_id}` } : null,
    author: people.get(row.author_id) || (row.author_id ? { id: row.author_id, name: '' } : null),
    responsible: people.get(row.responsible_id) || (row.responsible_id ? { id: row.responsible_id, name: '' } : null),
    project: link(row.project_id, row.project_label),
    object: link(row.object_id, row.object_label),
    deal: link(row.deal_id, row.deal_label),
    contract: link(row.contract_id, row.contract_label),
    deliveryState: row.delivery_state,
    approval: row.approval_status ? { status: row.approval_status, dueAt: row.approval_due_at, overdue: approvalOverdue, stage: stage?.name || '' } : null,
    overdue: approvalOverdue || payOverdue || deliverOverdue,
    overdueKind: approvalOverdue ? 'approval' : payOverdue ? 'pay' : deliverOverdue ? 'deliver' : null,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    deliveredAt: row.delivered_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    url: requestUrl(row.id),
  };
}

/** node-pg returns DATE as local midnight: read the calendar day without a zone shift. */
export function isoDayOf(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function hydrate(rows, today = null) {
  const people = await usersByIds(rows.flatMap((row) => [row.author_id, row.responsible_id]));
  const entities = new Map((await listLegalEntities({ includeArchived: true })).map((entity) => [entity.id, { id: entity.id, label: entity.label }]));
  return rows.map((row) => requestShape(row, { people, entities, today }));
}

// ── Lists ───────────────────────────────────────────────────────────────────

/** Urgency keys from the most urgent; «urgent» chip = all but the last (calmest) level. */
async function urgencyKeys() {
  const settings = await approvalSettings();
  const keys = (settings.urgencies || []).map((level) => level.key);
  return keys.length ? keys : ['critical', 'urgent', 'normal'];
}

/** Conditions of a chip over `r` / `ap`. */
async function chipSql(ctx, chip, p, today) {
  const me = () => p.add(ctx.userId);
  switch (chip) {
    case 'mine': {
      const m = me();
      return `(r.author_id = ${m} OR r.responsible_id = ${m} OR r.created_by = ${m})`;
    }
    case 'waiting': {
      const { principalSets, principalsOf, seatMatchSql } = await import('../approvals/api.js');
      const sets = principalSets(await principalsOf(ctx.userId));
      const base = p.values.length;
      const users = p.add(sets.userIds);
      p.add(sets.roleIds);
      p.add(sets.groupIds);
      p.add(sets.permissions);
      p.add(sets.star);
      const parts = [
        `(ap.status = 'pending' AND EXISTS (SELECT 1 FROM approval_seats s WHERE s.process_id = ap.id AND s.round = ap.round AND s.stage_index = ap.current_stage AND s.decision IS NULL AND ${seatMatchSql('s', base)}))`,
        `(ap.status = 'question' AND ap.question_to = ANY(${users}))`,
        `(r.status = 'returned' AND r.author_id = ${p.add(ctx.userId)})`,
      ];
      if (ctx.canPay) parts.push(`r.status = ANY(${p.add(PAYABLE)}::text[])`);
      return `(${parts.join(' OR ')})`;
    }
    case 'urgent': {
      const keys = await urgencyKeys();
      return `(r.urgency = ANY(${p.add(keys.slice(0, Math.max(1, keys.length - 1)))}::text[]) AND r.status = ANY(${p.add(ACTIVE)}::text[]))`;
    }
    case 'overdue': {
      const t = p.add(today);
      return `((r.status = ANY(${p.add(PAYABLE)}::text[]) AND r.pay_by < ${t}::date)
        OR (r.status = ANY(${p.add(DELIVERABLE)}::text[]) AND r.delivery_state <> 'full' AND r.deliver_by < ${t}::date)
        OR (ap.status = 'pending' AND ap.due_at <= NOW()))`;
    }
    case 'to_pay':
      return `r.status = ANY(${p.add(PAYABLE)}::text[])`;
    case 'active':
      return `r.status = ANY(${p.add(ACTIVE)}::text[])`;
    case 'finished':
      return `r.status = ANY(${p.add(FINISHED)}::text[])`;
    default:
      return null;
  }
}

const list = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 50);

/** WHERE parts for a filter (everything but the chip). */
async function filterSql(ctx, input, p) {
  const where = [];
  const visible = await visibleSql(ctx, p);
  if (visible) where.push(visible);
  const statuses = list(input.status).filter((status) => STATUSES.includes(status));
  if (statuses.length) where.push(`r.status = ANY(${p.add(statuses)}::text[])`);
  const q = String(input.q ?? input.search ?? '').trim().slice(0, 100);
  if (q) {
    const like = p.add(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(r.number ILIKE ${like} OR r.title ILIKE ${like} OR r.supplier_name ILIKE ${like} OR r.description ILIKE ${like})`);
  }
  const categories = list(input.category);
  if (categories.length) where.push(`r.category = ANY(${p.add(categories)}::text[])`);
  const currencies = list(input.currency).map((code) => code.toUpperCase());
  if (currencies.length) where.push(`r.currency = ANY(${p.add(currencies)}::text[])`);
  const urgencies = list(input.urgency);
  if (urgencies.length) where.push(`r.urgency = ANY(${p.add(urgencies)}::text[])`);
  for (const [key, column] of [['legalEntity', 'legal_entity_id'], ['responsible', 'responsible_id'], ['author', 'author_id'], ['contract', 'contract_id'], ['project', 'project_id'], ['deal', 'deal_id'], ['supplierCompany', 'supplier_company_id']]) {
    const ids = list(input[key]).map((value) => (value === 'me' ? ctx.userId : Number(value))).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length) where.push(`r.${column} = ANY(${p.add(ids)}::int[])`);
  }
  const from = day(input.from);
  const to = day(input.to);
  if (from) where.push(`r.created_at >= ${p.add(from)}::date`);
  if (to) where.push(`r.created_at < (${p.add(to)}::date + 1)`);
  return where;
}

const SORTS = {
  urgency: (keys) => `array_position(${keys}::text[], r.urgency) NULLS LAST, COALESCE(r.pay_by, r.deliver_by) NULLS LAST, r.id DESC`,
  number: () => 'r.seq',
  title: () => 'LOWER(r.title)',
  amount: () => 'r.amount',
  status: () => `array_position(ARRAY[${STATUSES.map((s) => `'${s}'`).join(',')}]::text[], r.status::text)`,
  payBy: () => 'r.pay_by',
  deliverBy: () => 'r.deliver_by',
  supplier: () => 'LOWER(r.supplier_name)',
  created: () => 'r.created_at',
  updated: () => 'r.updated_at',
};

/**
 * GET /requests: one page. Default order: urgency, then the nearest deadline
 * (spec §2). `contract=<id>` lists the requests linked to a contract (used by
 * the Contracts module), with the same visibility.
 */
export async function listRequests(req, input = {}) {
  const ctx = await contextOf(req);
  const today = await todayFor(req);
  const p = new Params();
  const where = await filterSql(ctx, input, p);
  if (CHIPS.includes(input.chip)) where.push(await chipSql(ctx, input.chip, p, today));
  const pageSize = Math.min(200, Math.max(1, Number(input.pageSize) || 50));
  const page = Math.max(1, Number(input.page) || 1);
  const sortKey = SORTS[input.sort] ? input.sort : 'urgency';
  const dir = input.order === 'asc' ? 'ASC' : input.order === 'desc' ? 'DESC' : sortKey === 'urgency' ? '' : 'DESC';
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const filterValues = [...p.values];
  const order = sortKey === 'urgency' ? SORTS.urgency(p.add(await urgencyKeys())) : `${SORTS[sortKey]()} ${dir} NULLS LAST, r.id DESC`;
  const [{ rows }, { rows: count }] = await Promise.all([
    query(`${SELECT} ${sql} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, p.values),
    query(`SELECT COUNT(*)::int AS n FROM proc_requests r LEFT JOIN approval_processes ap ON ap.type = '${APPROVAL_TYPE}' AND ap.doc_id = r.id::text ${sql}`, filterValues),
  ]);
  return { items: await hydrate(rows, today), total: count[0].n, page, pageSize };
}

/** Counters of the chips under the same filter. */
export async function chipCounters(req, input = {}) {
  const ctx = await contextOf(req);
  const today = await todayFor(req);
  const p = new Params();
  const where = await filterSql(ctx, input, p);
  const parts = [];
  for (const chip of CHIPS) parts.push(`COUNT(*) FILTER (WHERE ${await chipSql(ctx, chip, p, today)})::int AS "${chip}"`);
  const { rows } = await query(
    `SELECT COUNT(*)::int AS "all", ${parts.join(', ')} FROM proc_requests r
     LEFT JOIN approval_processes ap ON ap.type = '${APPROVAL_TYPE}' AND ap.doc_id = r.id::text
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    p.values
  );
  return rows[0];
}

/** Kanban: columns by status with their first cards and counts. */
export async function board(req, input = {}) {
  const ctx = await contextOf(req);
  const today = await todayFor(req);
  const p = new Params();
  const where = await filterSql(ctx, input, p);
  if (CHIPS.includes(input.chip)) where.push(await chipSql(ctx, input.chip, p, today));
  const keys = p.add(await urgencyKeys());
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const perColumn = Math.min(100, Math.max(5, Number(input.perColumn) || 40));
  const { rows } = await query(
    `SELECT * FROM (SELECT x.*, ROW_NUMBER() OVER (PARTITION BY x.status ORDER BY array_position(${keys}::text[], x.urgency) NULLS LAST, COALESCE(x.pay_by, x.deliver_by) NULLS LAST, x.id DESC) AS rn,
              COUNT(*) OVER (PARTITION BY x.status)::int AS column_total
       FROM (${SELECT} ${sql}) x) y WHERE y.rn <= ${perColumn}`,
    p.values
  );
  const items = await hydrate(rows, today);
  const columns = STATUSES.map((status) => ({ status, items: [], total: 0 }));
  rows.forEach((row, index) => {
    const column = columns.find((item) => item.status === row.status);
    column.items.push(items[index]);
    column.total = row.column_total;
  });
  return { columns };
}

// ── Reading one ─────────────────────────────────────────────────────────────

export async function loadRow(id, client = { query }) {
  const n = intOrNull(id);
  if (!n) return null;
  const { rows } = await client.query(`${SELECT} WHERE r.id = $1`, [n]);
  return rows[0] || null;
}

/** The row if the person may see it; 404 otherwise (existence does not leak). */
export async function visibleRow(req, id) {
  const ctx = await contextOf(req);
  const row = await loadRow(id);
  if (!row || !(await canSee(ctx, row))) throw httpError(404, 'Request not found', 'NOT_FOUND');
  return { ctx, row };
}

async function everSubmitted(id) {
  const { rows } = await query(`SELECT 1 FROM approval_processes WHERE type = $1 AND doc_id = $2`, [APPROVAL_TYPE, String(id)]);
  return rows.length > 0;
}

export async function documentsOf(requestId) {
  const { rows } = await query(
    `SELECT d.*, COALESCE(u.display_name, u.username) AS uploader_name FROM proc_documents d LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.request_id = $1 ORDER BY d.kind = 'invoice' DESC, d.id`,
    [requestId]
  );
  return rows.map((doc) => ({
    id: doc.id,
    kind: doc.kind,
    name: doc.name,
    ext: doc.ext,
    size: Number(doc.size),
    source: doc.source,
    paymentId: doc.payment_id,
    deliveryId: doc.delivery_id,
    uploadedBy: doc.uploaded_by ? { id: doc.uploaded_by, name: doc.uploader_name } : null,
    createdAt: doc.created_at,
    url: `/api/app/procurement/documents/${doc.id}/file`,
  }));
}

/** GET /requests/:id: the whole card. */
export async function getRequest(req, id) {
  const { ctx, row } = await visibleRow(req, id);
  const today = await todayFor(req);
  const [shape] = await hydrate([row], today);
  const [{ rows: items }, documents, { rows: payments }, { rows: deliveries }, submitted] = await Promise.all([
    query(`SELECT * FROM proc_items WHERE request_id = $1 ORDER BY sort, id`, [row.id]),
    documentsOf(row.id),
    query(`SELECT p.*, COALESCE(u.display_name, u.username) AS author_name FROM proc_payments p LEFT JOIN users u ON u.id = p.created_by WHERE p.request_id = $1 ORDER BY p.paid_on, p.id`, [row.id]),
    query(`SELECT d.*, COALESCE(u.display_name, u.username) AS author_name FROM proc_deliveries d LEFT JOIN users u ON u.id = d.created_by WHERE d.request_id = $1 ORDER BY d.delivered_on, d.id`, [row.id]),
    everSubmitted(row.id),
  ]);
  const roles = rolesOn(ctx, row);
  const extra = { paid: Number(row.paid_amount), everSubmitted: submitted };
  const actions = availableActions(row.status, roles, extra);
  const canEdit = (roles.author || roles.responsible || roles.admin) && EDITABLE.includes(row.status);
  const canEditSecondary = (roles.author || roles.responsible || roles.admin) && !['closed', 'cancelled', 'rejected'].includes(row.status);
  const settings = ctx.settings;
  const invoiceCount = documents.filter((doc) => doc.kind === 'invoice').length;
  return {
    request: {
      ...shape,
      description: row.description || '',
      hasItems: row.has_items,
      items: items.map((item) => ({ id: item.id, name: item.name, qty: Number(item.qty), unit: item.unit || '', price: Number(item.price), amount: Number(item.amount) })),
    },
    documents,
    payments: payments.map((pay) => ({
      id: pay.id,
      paidOn: isoDayOf(pay.paid_on),
      amount: Number(pay.amount),
      method: pay.method,
      reference: pay.reference || '',
      note: pay.note || '',
      author: pay.created_by ? { id: pay.created_by, name: pay.author_name } : null,
      createdAt: pay.created_at,
      documents: documents.filter((doc) => doc.paymentId === pay.id),
    })),
    deliveries: deliveries.map((item) => ({
      id: item.id,
      deliveredOn: isoDayOf(item.delivered_on),
      partial: item.partial,
      note: item.note || '',
      author: item.created_by ? { id: item.created_by, name: item.author_name } : null,
      createdAt: item.created_at,
      documents: documents.filter((doc) => doc.deliveryId === item.id),
    })),
    my: {
      ...roles,
      actions,
      canEdit,
      canEditSecondary,
      canAddDocuments: canEditSecondary || (roles.pay && PAYABLE.includes(row.status)),
      canPay: actions.includes('pay'),
      canDeliver: actions.includes('deliver'),
      missing: EDITABLE.includes(row.status) ? readyErrors(row, { invoiceCount, invoiceRequired: settings.invoiceRequired, currencies: settings.currencies }) : [],
    },
  };
}

// ── Writing ─────────────────────────────────────────────────────────────────

export async function logEvent(client, requestId, actorId, action, data = {}) {
  await client.query(`INSERT INTO proc_events (request_id, actor_id, action, data) VALUES ($1, $2, $3, $4)`, [requestId, actorId || null, action, JSON.stringify(data)]);
}

/** Next number under a row lock: two requests created at once never share one. */
export async function nextNumber(client, settings) {
  const { rows } = await client.query(`UPDATE proc_counters SET value = value + 1 WHERE key = 'request' RETURNING value`);
  let seq = rows[0]?.value;
  if (!seq) {
    await client.query(`INSERT INTO proc_counters (key, value) VALUES ('request', 1) ON CONFLICT (key) DO UPDATE SET value = proc_counters.value + 1`);
    seq = (await client.query(`SELECT value FROM proc_counters WHERE key = 'request'`)).rows[0].value;
  }
  return { seq, number: formatNumber(settings.numberPrefix, seq, settings.numberDigits) };
}

const FIELD_COLUMNS = {
  title: 'title',
  description: 'description',
  category: 'category',
  currency: 'currency',
  legalEntityId: 'legal_entity_id',
  paymentTerms: 'payment_terms',
  advancePercent: 'advance_percent',
  urgency: 'urgency',
  payBy: 'pay_by',
  deliverBy: 'deliver_by',
  supplierCompanyId: 'supplier_company_id',
  supplierName: 'supplier_name',
  supplierContact: 'supplier_contact',
  projectId: 'project_id',
  projectLabel: 'project_label',
  objectId: 'object_id',
  objectLabel: 'object_label',
  dealId: 'deal_id',
  dealLabel: 'deal_label',
  contractId: 'contract_id',
  contractLabel: 'contract_label',
  responsibleId: 'responsible_id',
};

/** Fields allowed after approval (they change nothing about the money). */
const SECONDARY = new Set(['description', 'deliverBy', 'supplierContact', 'responsibleId', 'projectId', 'projectLabel', 'objectId', 'objectLabel', 'dealId', 'dealLabel', 'contractId', 'contractLabel']);

/** Validates a patch against the settings; returns column values. */
async function cleanPatch(input, settings, { secondaryOnly = false } = {}) {
  const out = {};
  const has = (key) => input[key] !== undefined && (!secondaryOnly || SECONDARY.has(key));
  if (has('title')) out.title = text(input.title, 300) || '';
  if (has('description')) out.description = text(input.description, 20000);
  if (has('category')) {
    const key = text(input.category, 40);
    if (key && !(settings.categories || []).some((item) => item.key === key)) throw httpError(400, 'Unknown category', 'BAD_CATEGORY');
    out.category = key;
  }
  if (has('currency')) {
    const code = String(input.currency || '').toUpperCase();
    if (!(settings.currencies || []).includes(code)) throw httpError(400, 'Currency is not allowed', 'CURRENCY');
    out.currency = code;
  }
  if (has('legalEntityId')) {
    const id = intOrNull(input.legalEntityId);
    if (id && !(await getLegalEntity(id))) throw httpError(400, 'Unknown legal entity', 'BAD_LEGAL_ENTITY');
    out.legal_entity_id = id;
  }
  if (has('paymentTerms')) {
    if (!PAYMENT_TERMS.includes(input.paymentTerms)) throw httpError(400, 'Unknown payment terms', 'BAD_TERMS');
    out.payment_terms = input.paymentTerms;
  }
  if (has('advancePercent')) {
    const n = Number(input.advancePercent);
    out.advance_percent = input.advancePercent === null || input.advancePercent === '' ? null : Number.isFinite(n) ? Math.min(100, Math.max(1, Math.round(n))) : null;
  }
  if (has('urgency')) {
    const keys = await urgencyKeys();
    out.urgency = input.urgency && keys.includes(input.urgency) ? input.urgency : null;
  }
  for (const key of ['payBy', 'deliverBy']) {
    if (!has(key)) continue;
    const value = input[key] ? day(input[key]) : null;
    if (input[key] && !value) throw httpError(400, 'Invalid date', 'BAD_DATE');
    out[FIELD_COLUMNS[key]] = value;
  }
  for (const key of ['supplierCompanyId', 'projectId', 'objectId', 'dealId', 'contractId']) if (has(key)) out[FIELD_COLUMNS[key]] = intOrNull(input[key]);
  for (const [key, max] of [['supplierName', 300], ['supplierContact', 500], ['projectLabel', 200], ['objectLabel', 200], ['dealLabel', 300], ['contractLabel', 300]]) if (has(key)) out[FIELD_COLUMNS[key]] = text(input[key], max);
  if (has('responsibleId')) out.responsible_id = await activeUserId(input.responsibleId);
  return out;
}

/** Amount and items: either line items (amount = their sum) or one amount. */
function moneyPatch(input) {
  if (input.items === undefined && input.amount === undefined && input.hasItems === undefined) return null;
  const hasItems = input.hasItems !== undefined ? Boolean(input.hasItems) : Array.isArray(input.items) && input.items.length > 0;
  if (hasItems) {
    const items = cleanItems(input.items);
    return { hasItems: true, items, amount: itemsTotal(items) };
  }
  const amount = money(input.amount);
  if (input.amount !== undefined && input.amount !== null && input.amount !== '' && amount === null) throw httpError(400, 'Invalid amount', 'BAD_AMOUNT');
  return { hasItems: false, items: [], amount: amount ?? 0 };
}

async function writeItems(client, requestId, items) {
  await client.query(`DELETE FROM proc_items WHERE request_id = $1`, [requestId]);
  for (const [index, item] of items.entries()) {
    await client.query(`INSERT INTO proc_items (request_id, sort, name, qty, unit, price, amount) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [requestId, index, item.name, item.qty, item.unit || null, item.price, item.amount]);
  }
}

/** POST /requests: a new draft (the form autosaves into it). */
export async function createRequest(req, input = {}, { dropLinks = false } = {}) {
  const ctx = await contextOf(req);
  if (!ctx.canCreate) throw httpError(403, 'You cannot file purchase requests', 'FORBIDDEN');
  input = await validateLinks(req, { ...input }, {}, { drop: dropLinks });
  const settings = ctx.settings;
  const patch = await cleanPatch({ currency: settings.currency, ...input }, settings);
  const moneyValues = moneyPatch(input) || { hasItems: false, items: [], amount: 0 };
  if (patch.legal_entity_id === undefined) patch.legal_entity_id = (await getDefaultLegalEntity())?.id || null;
  if (patch.urgency === undefined) patch.urgency = (await approvalSettings()).defaultUrgency || null;
  const row = await withTransaction(async (client) => {
    const { seq, number } = await nextNumber(client, settings);
    const columns = { ...patch, seq, number, has_items: moneyValues.hasItems, amount: moneyValues.amount, author_id: ctx.userId, created_by: ctx.userId, responsible_id: patch.responsible_id ?? ctx.userId, status: 'draft' };
    const keys = Object.keys(columns);
    const { rows } = await client.query(
      `INSERT INTO proc_requests (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      keys.map((key) => columns[key])
    );
    const id = rows[0].id;
    if (moneyValues.hasItems) await writeItems(client, id, moneyValues.items);
    await logEvent(client, id, ctx.userId, 'created', { number });
    return loadRow(id, client);
  });
  if (row.responsible_id && row.responsible_id !== ctx.userId) notifyAssigned(row, ctx.userId);
  webhook('procurement.created', row, ctx.userId);
  return getRequest(req, row.id);
}

const CHANGE_LABELS = { title: 'title', description: 'description', category: 'category', currency: 'currency', legal_entity_id: 'legalEntity', payment_terms: 'paymentTerms', advance_percent: 'paymentTerms', urgency: 'urgency', pay_by: 'payBy', deliver_by: 'deliverBy', supplier_company_id: 'supplier', supplier_name: 'supplier', supplier_contact: 'supplierContact', project_id: 'project', project_label: 'project', object_id: 'object', object_label: 'object', deal_id: 'deal', deal_label: 'deal', contract_id: 'contract', contract_label: 'contract', responsible_id: 'responsible', amount: 'amount' };

function same(a, b) {
  if (a instanceof Date) a = isoDayOf(a);
  if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '';
  return String(a) === String(b);
}

/** PUT /requests/:id: the whole form while editable; deadlines, links and the responsible later. */
export async function updateRequest(req, id, input = {}) {
  const { ctx, row } = await visibleRow(req, id);
  const roles = rolesOn(ctx, row);
  if (!(roles.author || roles.responsible || roles.admin)) throw httpError(403, 'Only the author, the responsible person or an administrator can edit', 'FORBIDDEN');
  const full = EDITABLE.includes(row.status);
  if (!full && ['closed', 'cancelled', 'rejected'].includes(row.status)) throw httpError(409, 'The request is finished', 'LOCKED');
  input = { ...input };
  // After approval the supplier is locked (cleanPatch ignores it): nothing to check.
  if (!full) delete input.supplierCompanyId;
  input = await validateLinks(req, input, row);
  const patch = await cleanPatch(input, ctx.settings, { secondaryOnly: !full });
  const moneyValues = full ? moneyPatch(input) : null;
  if (!full && (input.amount !== undefined || input.items !== undefined) && moneyValues === null) {
    // Silently ignored would surprise: say that money is locked after approval.
    const changed = input.amount !== undefined && Number(input.amount) !== Number(row.amount);
    if (changed) throw httpError(409, 'The amount cannot change after approval', 'LOCKED');
  }
  const changes = Object.keys(patch).filter((key) => !same(row[key], patch[key]));
  if (moneyValues) {
    patch.has_items = moneyValues.hasItems;
    patch.amount = moneyValues.amount;
    if (Number(row.amount) !== moneyValues.amount) changes.push('amount');
  }
  // A new date re-arms its reminders.
  if (patch.pay_by !== undefined && !same(row.pay_by, patch.pay_by)) Object.assign(patch, { pay_soon_at: null, pay_overdue_at: null });
  if (patch.deliver_by !== undefined && !same(row.deliver_by, patch.deliver_by)) Object.assign(patch, { deliver_soon_at: null, deliver_overdue_at: null });
  const keys = Object.keys(patch);
  if (!keys.length && !moneyValues) return getRequest(req, row.id);
  await withTransaction(async (client) => {
    const { rows: locked } = await client.query(`SELECT status FROM proc_requests WHERE id = $1 FOR UPDATE`, [row.id]);
    if (locked[0].status !== row.status) throw httpError(409, 'The request has changed, reload it', 'STALE');
    if (keys.length) {
      await client.query(`UPDATE proc_requests SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [row.id, ...keys.map((key) => patch[key])]);
    }
    if (moneyValues) await writeItems(client, row.id, moneyValues.items);
    const fields = [...new Set(changes.map((key) => CHANGE_LABELS[key] || key))];
    // Drafts autosave every few seconds: their history would be noise.
    if (fields.length && row.status !== 'draft') await logEvent(client, row.id, ctx.userId, 'updated', { fields });
  });
  if (patch.responsible_id && patch.responsible_id !== row.responsible_id && patch.responsible_id !== ctx.userId) notifyAssigned({ ...row, responsible_id: patch.responsible_id }, ctx.userId);
  // The process follows the request: its summary, and the stages not reached yet re-planned
  // when the amount, category, project or legal entity changed (docs/approvals.md#replanning).
  if (IN_APPROVAL.includes(row.status) || row.status === 'returned') {
    await refreshApproval(APPROVAL_TYPE, row.id, { actorId: ctx.userId }).catch((err) => console.warn('[procurement] approval refresh failed:', err.message));
  }
  if (changes.length && row.status !== 'draft') webhook('procurement.updated', await loadRow(row.id), ctx.userId);
  return getRequest(req, row.id);
}

/** DELETE /requests/:id: a draft that never went to approval. */
export async function deleteRequest(req, id) {
  const { ctx, row } = await visibleRow(req, id);
  const error = actionError('delete', row.status, rolesOn(ctx, row), { everSubmitted: await everSubmitted(row.id) });
  if (error) throw httpError(error === 'FORBIDDEN' ? 403 : 409, 'Only a draft that was never sent can be deleted', error);
  const { removeDocumentBlobs } = await import('./files.js');
  await removeDocumentBlobs(row.id);
  await query(`DELETE FROM proc_requests WHERE id = $1`, [row.id]);
  webhook('procurement.deleted', row, ctx.userId);
}

/**
 * The approvals engine lets only the process author (or a manager) send a
 * returned document again or withdraw it; this module also lets the
 * responsible person do so (ACTIONS in logic.js). Once the module has
 * checked the role, the engine is called on the module's behalf, still in
 * the person's name (history, notifications).
 */
const moduleActor = (req) => ({ system: true, user: req.user });

function assertAction(action, ctx, row, extra = {}) {
  const error = actionError(action, row.status, rolesOn(ctx, row), extra);
  if (error === 'FORBIDDEN') throw httpError(403, 'You cannot do this', 'FORBIDDEN');
  if (error === 'HAS_PAYMENTS') throw httpError(409, 'The request already has payments', 'HAS_PAYMENTS');
  if (error) throw httpError(409, `Not possible in status "${row.status}"`, error, { status: row.status });
}

/** POST /requests/:id/submit: «Отправить на согласование» (also after rework). */
export async function submitRequest(req, id, input = {}) {
  const { ctx, row } = await visibleRow(req, id);
  assertAction('submit', ctx, row);
  const invoiceCount = Number((await query(`SELECT COUNT(*)::int AS n FROM proc_documents WHERE request_id = $1 AND kind = 'invoice'`, [row.id])).rows[0].n);
  const missing = readyErrors(row, { invoiceCount, invoiceRequired: ctx.settings.invoiceRequired, currencies: ctx.settings.currencies });
  if (missing.length) throw httpError(400, 'Fill in the request before sending it', missing[0], { missing });
  const options = { urgency: input.urgency || row.urgency || undefined, comment: input.comment };
  if (input.urgency && input.urgency !== row.urgency) {
    const keys = await urgencyKeys();
    if (keys.includes(input.urgency)) await query(`UPDATE proc_requests SET urgency = $2 WHERE id = $1`, [row.id, input.urgency]);
  }
  if (row.approval_status === 'returned') await restart(moduleActor(req), APPROVAL_TYPE, String(row.id), options);
  else await startApproval(req, APPROVAL_TYPE, String(row.id), options);
  webhook('procurement.submitted', await loadRow(row.id), ctx.userId);
  return { ...(await getRequest(req, row.id)), process: await getProcess(APPROVAL_TYPE, String(row.id), req) };
}

/** POST /requests/:id/withdraw: back to draft (through the approvals service). */
export async function withdrawRequest(req, id, input = {}) {
  const { ctx, row } = await visibleRow(req, id);
  assertAction('withdraw', ctx, row);
  await withdraw(moduleActor(req), APPROVAL_TYPE, String(row.id), { comment: input.comment });
  return getRequest(req, row.id);
}

/** Simple status moves of the card: cancel, close, reopen. */
async function moveStatus(req, id, action, input = {}) {
  const { ctx, row } = await visibleRow(req, id);
  assertAction(action, ctx, row, { paid: Number(row.paid_amount) });
  const comment = text(input.comment, 2000);
  if (action === 'cancel' && ['pending', 'question', 'returned'].includes(row.status)) {
    // Take it back from the approvers first; their inbox empties.
    await withdraw(moduleActor(req), APPROVAL_TYPE, String(row.id), { comment });
  }
  const next = await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM proc_requests WHERE id = $1 FOR UPDATE`, [row.id]);
    const current = rows[0];
    let to;
    if (action === 'cancel') {
      if (!['draft', 'returned', 'to_pay'].includes(current.status) || Number(current.paid_amount) > 0) throw httpError(409, 'The request has changed, reload it', 'STALE');
      to = 'cancelled';
    } else if (action === 'close') {
      if (!['paid', 'delivered'].includes(current.status)) throw httpError(409, 'The request has changed, reload it', 'STALE');
      to = 'closed';
    } else {
      if (!['closed', 'cancelled'].includes(current.status)) throw httpError(409, 'The request has changed, reload it', 'STALE');
      to = current.approved_at ? deriveStatus({ total: current.amount, paid: current.paid_amount, deliveryState: current.delivery_state }) : 'draft';
    }
    await client.query(
      `UPDATE proc_requests SET status = $2::text, closed_at = CASE WHEN $2::text = 'closed' THEN NOW() ELSE closed_at END,
              cancelled_at = CASE WHEN $2::text = 'cancelled' THEN NOW() ELSE cancelled_at END, updated_at = NOW() WHERE id = $1`,
      [row.id, to]
    );
    await logEvent(client, row.id, ctx.userId, action === 'reopen' ? 'reopened' : action === 'cancel' ? 'cancelled' : 'closed', { from: current.status, to, comment });
    return to;
  });
  const fresh = await loadRow(row.id);
  webhook(action === 'cancel' ? 'procurement.cancelled' : action === 'close' ? 'procurement.closed' : 'procurement.status_changed', fresh, ctx.userId, { from: row.status, to: next });
  return getRequest(req, row.id);
}

export const cancelRequest = (req, id, input) => moveStatus(req, id, 'cancel', input);
export const closeRequest = (req, id, input) => moveStatus(req, id, 'close', input);
export const reopenRequest = (req, id, input) => moveStatus(req, id, 'reopen', input);

/** POST /requests/:id/duplicate: a new draft with the same content (no documents, payments). */
export async function duplicateRequest(req, id) {
  const { row } = await visibleRow(req, id);
  const { rows: items } = await query(`SELECT name, qty, unit, price FROM proc_items WHERE request_id = $1 ORDER BY sort, id`, [row.id]);
  const input = { hasItems: row.has_items, items: items.map((item) => ({ ...item, qty: Number(item.qty), price: Number(item.price) })), amount: Number(row.amount) };
  for (const [key, column] of Object.entries(FIELD_COLUMNS)) {
    if (['payBy', 'deliverBy', 'responsibleId'].includes(key)) continue;
    input[key] = row[column];
  }
  const settings = (await contextOf(req)).settings;
  if (!settings.currencies.includes(input.currency)) input.currency = settings.currency;
  if (input.category && !settings.categories.some((item) => item.key === input.category)) input.category = null;
  // Links the person cannot open in their modules are left out of the copy.
  return createRequest(req, input, { dropLinks: true });
}

// ── History ─────────────────────────────────────────────────────────────────

/** Request events and the approval history, newest last. */
export async function history(req, id) {
  const { row } = await visibleRow(req, id);
  const { rows } = await query(`SELECT * FROM proc_events WHERE request_id = $1 ORDER BY id`, [row.id]);
  const people = await usersByIds(rows.map((event) => event.actor_id));
  const own = rows.map((event) => ({ source: 'request', action: event.action, actor: people.get(event.actor_id) || null, data: event.data || {}, at: event.created_at }));
  const process = await getProcess(APPROVAL_TYPE, String(row.id)).catch(() => null);
  const approval = (process?.history || []).map((event) => ({
    source: 'approval',
    action: event.action,
    actor: event.actor || null,
    onBehalfOf: event.onBehalfOf || null,
    target: event.target || null,
    data: { comment: event.comment || null, stage: event.stageName || null, round: event.round },
    at: event.at,
  }));
  return [...own, ...approval].sort((a, b) => new Date(a.at) - new Date(b.at));
}

// ── Side effects ────────────────────────────────────────────────────────────

/** Webhook with the request's own visibility rule; never throws. */
export function webhook(type, row, actorId, extra = {}) {
  if (!row) return;
  const data = { request: requestShape(row), ...extra };
  procurementSettings()
    .then((settings) =>
      emitEvent(type, {
        actorId,
        data,
        visible: async (hookReq) => canSee(procContext(hookReq, settings), row).catch(() => false),
      })
    )
    .catch(() => {});
}

function docOf(row) {
  return { number: row.number, title: row.title, amount: Number(row.amount), currency: row.currency, paid: Number(row.paid_amount), remaining: cents(Math.max(0, Number(row.amount) - Number(row.paid_amount))), supplier: row.supplier_name || '', payBy: row.pay_by ? isoDayOf(row.pay_by) : null, deliverBy: row.deliver_by ? isoDayOf(row.deliver_by) : null };
}

export { docOf };

async function nameOf(userId) {
  return (await usersByIds([userId])).get(userId)?.name || '';
}

function notifyAssigned(row, actorId) {
  (async () => {
    await notify({ userIds: [row.responsible_id], kind: 'procurement.assigned', module: 'procurement', link: requestUrl(row.id), actorId, render: procurementMessage('assigned', { doc: docOf(row), actor: await nameOf(actorId) }) });
  })().catch((err) => console.warn('[procurement] notify assigned:', err.message));
}

/** After approval: accountants hear that a request waits for payment. */
export async function notifyToPay(row) {
  await notify({ userIds: await payers(), kind: 'procurement.to_pay', module: 'procurement', link: `/app/procurement/payments?open=${row.id}`, render: procurementMessage('toPay', { doc: docOf(row) }) });
}

/** Runs `fn` once the request reached `status` (i.e. the decision's transaction committed); gives up after ~8 s. */
export function whenCommitted(requestId, status, fn) {
  const delays = [80, 400, 1500, 6000];
  const attempt = async (index) => {
    try {
      const { rows } = await query(`SELECT * FROM proc_requests WHERE id = $1`, [requestId]);
      if (rows[0]?.status === status) return fn(rows[0]);
    } catch {
      /* try again */
    }
    if (index + 1 < delays.length) setTimeout(() => attempt(index + 1), delays[index + 1]).unref?.();
    return null;
  };
  setTimeout(() => attempt(0), delays[0]).unref?.();
}

