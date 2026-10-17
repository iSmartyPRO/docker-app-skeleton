import { query, withTransaction } from '../../config/database.js';
import { localeOrDefault, pick } from '../../services/i18n/index.js';
import { avatarOf, clean, httpError, intId } from '../shared/acl.js';
import { canDelete, canView, inPipelineLimits } from './access.js';
import { GROUPS, buildFilter, orderBy, pageOf } from './filters.js';
import { defaultPipelineId, loadPipeline, stageShape } from './pipelines.js';
import { afterDealChange } from './integrations.js';
import { listActivities } from './activities.js';
import { MAX_BULK, Params, RANK_STEP, boundsFor, idList, midRank, money, parseAmount, parseDateOnly, posInt, sumsByCurrency, toDateString } from './util.js';

/*
 * Deals: reading (board, stage pages, list, one deal), writing (create, patch
 * with optimistic locking, kanban moves, pipeline changes, trash, copies,
 * bulk actions), the history (crm_events) and comments.
 *
 * Every change: one crm_events row per changed thing, version + 1,
 * updated_by / updated_at; notifications, webhooks, the chat and the
 * Companies timeline follow after the transaction (integrations.js).
 */

export const FROM = `crm_deals d
  JOIN crm_stages s ON s.id = d.stage_id
  LEFT JOIN cmp_companies c ON c.id = d.company_id
  LEFT JOIN cmp_people pp ON pp.id = d.person_id`;

export const COLUMNS = `d.*, s.kind AS stage_kind, s.name AS stage_name, s.color AS stage_color, s.sort AS stage_sort,
  c.name AS company_name,
  NULLIF(CONCAT_WS(' ', pp.last_name, pp.first_name, pp.middle_name), '') AS person_name,
  pp.phones->0->>'value' AS person_phone, pp.emails->0->>'value' AS person_email`;

const USER_COLUMNS = `u.id, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path`;
const userOf = (row) => (row?.id ? { id: row.id, username: row.username, name: row.name || row.username, avatarUrl: avatarOf(row.avatar_path) } : null);

export const dealLink = (id) => `/app/crm/deals/${id}`;

// Labels of built-in fields in the history, per language. Events keep the label they were written
// with (older ones: Russian); eventShape shows built-in ones in the reader's language. The UI
// translates by `field` anyway; this is for API readers.
export const FIELD_LABELS = {
  title: { ru: 'Название', en: 'Name', ky: 'Аталышы', tr: 'Ad', zh: '名称' },
  amount: { ru: 'Сумма', en: 'Amount', ky: 'Сумма', tr: 'Tutar', zh: '金额' },
  currency: { ru: 'Валюта', en: 'Currency', ky: 'Валюта', tr: 'Para birimi', zh: '货币' },
  company: { ru: 'Компания', en: 'Company', ky: 'Компания', tr: 'Şirket', zh: '公司' },
  person: { ru: 'Контакт', en: 'Contact', ky: 'Байланыш', tr: 'Kişi', zh: '联系人' },
  owner: { ru: 'Ответственный', en: 'Responsible', ky: 'Жооптуу', tr: 'Sorumlu', zh: '负责人' },
  source: { ru: 'Источник', en: 'Source', ky: 'Булак', tr: 'Kaynak', zh: '来源' },
  comment: { ru: 'Комментарий', en: 'Comment', ky: 'Комментарий', tr: 'Yorum', zh: '备注' },
  closeDate: { ru: 'Дата закрытия', en: 'Close date', ky: 'Жабылуу күнү', tr: 'Kapanış tarihi', zh: '成交日期' },
  watchers: { ru: 'Наблюдатели', en: 'Watchers', ky: 'Байкоочулар', tr: 'Takipçiler', zh: '关注人' },
  lostReason: { ru: 'Причина провала', en: 'Lost reason', ky: 'Ийгиликсиздиктин себеби', tr: 'Kaybetme nedeni', zh: '输单原因' },
};
const COPY_SUFFIX = { ru: 'копия', en: 'copy', ky: 'көчүрмө', tr: 'kopya', zh: '副本' };
const fieldLabel = (key, locale) => (FIELD_LABELS[key] ? pick(FIELD_LABELS[key], localeOrDefault(locale)) : key);

// ── Loading and shapes ──────────────────────────────────────────────────────

export async function usersByIds(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ANY($1)`, [list]);
  return new Map(rows.map((row) => [row.id, userOf(row)]));
}

export async function watcherMap(dealIds) {
  const map = new Map();
  if (!dealIds.length) return map;
  const { rows } = await query(
    `SELECT w.deal_id, ${USER_COLUMNS} FROM crm_deal_watchers w JOIN users u ON u.id = w.user_id
     WHERE w.deal_id = ANY($1) ORDER BY LOWER(COALESCE(u.display_name, u.username))`,
    [dealIds]
  );
  for (const row of rows) {
    if (!map.has(row.deal_id)) map.set(row.deal_id, []);
    map.get(row.deal_id).push(userOf(row));
  }
  return map;
}

export async function loadDealRow(id, client = { query }) {
  const dealId = posInt(id);
  if (!dealId) return null;
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE d.id = $1`, [dealId]);
  return rows[0] || null;
}

/** A deal the person may see, with its watcher ids; 404 otherwise (also for the trash unless `deleted`). */
export async function requireDeal(ctx, id, { deleted = false, client } = {}) {
  const row = await loadDealRow(intId(id), client);
  if (!row || (!deleted && row.deleted_at)) throw httpError(404, 'Deal not found', 'NOT_FOUND');
  const { rows } = await (client || { query }).query(`SELECT user_id FROM crm_deal_watchers WHERE deal_id = $1`, [row.id]);
  const watcherIds = rows.map((item) => item.user_id);
  if (!canView(ctx, row, watcherIds)) throw httpError(404, 'Deal not found', 'NOT_FOUND');
  return { row, watcherIds };
}

function dealShape(row, { users, watchers, stats, next }, ctx) {
  const stat = stats.get(row.id) || { open: 0, overdue: 0 };
  const nextRow = next.get(row.id);
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    stageId: row.stage_id,
    title: row.title,
    amount: money(row.amount),
    currency: (row.currency || '').trim(),
    company: row.company_id ? { id: row.company_id, name: row.company_name || '' } : null,
    person: row.person_id ? { id: row.person_id, name: row.person_name || '', phone: row.person_phone || null, email: row.person_email || null } : null,
    owner: users.get(row.owner_id) || null,
    source: row.source || null,
    comment: row.comment || '',
    closeDate: toDateString(row.close_date),
    lostReason: row.lost_reason || null,
    custom: row.custom || {},
    watchers: watchers.get(row.id) || [],
    version: row.version,
    rank: row.rank,
    stageChangedAt: row.stage_changed_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: users.get(row.created_by) || null,
    deletedAt: row.deleted_at || null,
    activity: {
      next: nextRow ? { id: nextRow.id, kind: nextRow.kind, title: nextRow.title, dueAt: nextRow.due_at, overdue: Boolean(nextRow.due_at && new Date(nextRow.due_at) < new Date()) } : null,
      open: stat.open,
      overdue: stat.overdue,
    },
    canEdit: !row.deleted_at,
    canDelete: canDelete(ctx, row),
  };
}

/** Deal shapes for rows of COLUMNS: owners, watchers and activity counters in four batch queries. */
export async function hydrate(ctx, rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [users, watchers, stats, next] = await Promise.all([
    usersByIds(rows.flatMap((row) => [row.owner_id, row.created_by])),
    watcherMap(ids),
    query(
      `SELECT deal_id, COUNT(*)::int AS open, COUNT(*) FILTER (WHERE due_at < NOW())::int AS overdue
       FROM crm_activities WHERE deal_id = ANY($1) AND done_at IS NULL GROUP BY deal_id`,
      [ids]
    ),
    query(
      `SELECT DISTINCT ON (deal_id) id, deal_id, kind, title, due_at FROM crm_activities
       WHERE deal_id = ANY($1) AND done_at IS NULL ORDER BY deal_id, due_at ASC NULLS LAST, id`,
      [ids]
    ),
  ]);
  const extras = {
    users,
    watchers,
    stats: new Map(stats.rows.map((row) => [row.deal_id, row])),
    next: new Map(next.rows.map((row) => [row.deal_id, row])),
  };
  return rows.map((row) => dealShape(row, extras, ctx));
}

export async function dealsByIds(ctx, ids) {
  if (!ids.length) return [];
  const { rows } = await query(`SELECT ${COLUMNS} FROM ${FROM} WHERE d.id = ANY($1)`, [ids]);
  const order = new Map(ids.map((id, index) => [id, index]));
  rows.sort((a, b) => order.get(a.id) - order.get(b.id));
  return hydrate(ctx, rows);
}

export async function dealById(ctx, id) {
  const row = await loadDealRow(id);
  return row ? (await hydrate(ctx, [row]))[0] : null;
}

const filterOptions = (ctx, input, extra = {}) => ({ fields: ctx.settings.fields || [], bounds: boundsFor(ctx, input), ...extra });
const limitOf = (value, fallback = 30, max = 100) => Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));

// ── Board ───────────────────────────────────────────────────────────────────

/**
 * Kanban: every stage with its count and sums per currency (over the filter);
 * deals for the stages the `group` asks for (open by default), `limit` per stage.
 */
export async function board(ctx, input = {}) {
  const pipelineId = posInt(input.pipeline) || (await defaultPipelineId(ctx));
  if (!pipelineId) throw httpError(404, 'Pipeline not found', 'NOT_FOUND');
  const pipeline = await loadPipeline(ctx, pipelineId);
  const limit = limitOf(input.limit);
  const group = GROUPS.includes(input.group) ? input.group : 'open';
  const p = new Params();
  const where = buildFilter(ctx, { ...input, pipeline: pipelineId }, filterOptions(ctx, input, { ignore: ['group'] }), p);
  const loadKinds = group === 'all' ? ['open', 'won', 'lost'] : [group];
  const loadIds = pipeline.stages.filter((stage) => loadKinds.includes(stage.kind)).map((stage) => stage.id);

  const totals = await query(
    `SELECT d.stage_id, d.currency, COUNT(*)::int AS n, SUM(d.amount) AS sum FROM ${FROM} WHERE ${where.join(' AND ')} GROUP BY d.stage_id, d.currency`,
    p.values
  );
  const dealsQuery = new Params(p.values);
  const { rows } = await query(
    `SELECT * FROM (
       SELECT ${COLUMNS}, ROW_NUMBER() OVER (PARTITION BY d.stage_id ORDER BY d.rank, d.id) AS rn
       FROM ${FROM} WHERE ${where.join(' AND ')} AND d.stage_id = ANY(${dealsQuery.add(loadIds)}::int[])
     ) x WHERE x.rn <= ${limit + 1} ORDER BY x.stage_sort, x.rn`,
    dealsQuery.values
  );
  const deals = await hydrate(ctx, rows.filter((row) => Number(row.rn) <= limit));
  const more = new Set(rows.filter((row) => Number(row.rn) > limit).map((row) => row.stage_id));
  return {
    pipeline: pipeline.shape,
    stages: pipeline.stages.map((stage) => {
      const own = totals.rows.filter((row) => row.stage_id === stage.id);
      const loaded = loadIds.includes(stage.id);
      return {
        ...stageShape(stage),
        count: own.reduce((sum, row) => sum + row.n, 0),
        sum: sumsByCurrency(own),
        deals: loaded ? deals.filter((deal) => deal.stageId === stage.id) : [],
        hasMore: more.has(stage.id),
        loaded,
      };
    }),
  };
}

/** One kanban column, page by page. */
export async function stagePage(ctx, stageId, input = {}) {
  const { rows: stages } = await query(`SELECT * FROM crm_stages WHERE id = $1`, [intId(stageId)]);
  const stage = stages[0];
  if (!stage || !inPipelineLimits(ctx, stage.pipeline_id)) throw httpError(404, 'Stage not found', 'NOT_FOUND');
  const limit = limitOf(input.limit);
  const offset = Math.min(1_000_000, Math.max(0, Number.parseInt(input.offset, 10) || 0));
  const p = new Params();
  const where = buildFilter(ctx, { ...input, pipeline: stage.pipeline_id }, filterOptions(ctx, input, { ignore: ['group', 'stages'] }), p);
  where.push(`d.stage_id = ${p.add(stage.id)}`);
  const { rows } = await query(`SELECT ${COLUMNS} FROM ${FROM} WHERE ${where.join(' AND ')} ORDER BY d.rank, d.id LIMIT ${limit + 1} OFFSET ${offset}`, p.values);
  return { deals: await hydrate(ctx, rows.slice(0, limit)), hasMore: rows.length > limit };
}

// ── List, trash ─────────────────────────────────────────────────────────────

export async function listDeals(ctx, input = {}, { trash = false } = {}) {
  const { page, pageSize, offset } = pageOf(input);
  const p = new Params();
  const where = buildFilter(ctx, input, filterOptions(ctx, input, { trash, ignore: trash ? ['group'] : [] }), p);
  const order = trash ? 'd.deleted_at DESC, d.id DESC' : orderBy(input.sort, input.order);
  const { rows } = await query(`SELECT ${COLUMNS} FROM ${FROM} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${offset}`, p.values);
  const result = { items: await hydrate(ctx, rows), page, pageSize };
  if (input.count === '1' || input.count === 'true' || trash) {
    const { rows: count } = await query(`SELECT COUNT(*)::int AS n FROM ${FROM} WHERE ${where.join(' AND ')}`, p.values);
    result.total = count[0].n;
  }
  if (trash) {
    const deleters = await usersByIds(rows.map((row) => row.deleted_by));
    result.items = result.items.map((item, index) => ({ ...item, deletedBy: deleters.get(rows[index].deleted_by) || null }));
  }
  return result;
}

/** Ids of deals matching a filter (bulk "for all by filter"); refuses more than `max`. */
export async function idsByFilter(ctx, input = {}, max = MAX_BULK) {
  const p = new Params();
  const where = buildFilter(ctx, input, filterOptions(ctx, input), p);
  const { rows } = await query(`SELECT d.id FROM ${FROM} WHERE ${where.join(' AND ')} ORDER BY d.id LIMIT ${max + 1}`, p.values);
  if (rows.length > max) throw httpError(400, `At most ${max} deals at once — narrow the filter`, 'BULK_LIMIT');
  return rows.map((row) => row.id);
}

// ── One deal ────────────────────────────────────────────────────────────────

export function eventShape(row, locale) {
  const data = row.data || {};
  return {
    id: Number(row.id),
    kind: row.kind,
    body: row.body || null,
    // A built-in field's label in the reader's language (custom fields keep their own label).
    data: data.field && FIELD_LABELS[data.field] && data.label ? { ...data, label: fieldLabel(data.field, locale) } : data,
    author: row.author_id ? userOf({ id: row.author_id, username: row.username, name: row.name, avatar_path: row.avatar_path }) : null,
    createdAt: row.created_at,
  };
}

export async function listEvents(ctx, dealId, { before, limit } = {}) {
  const { row } = await requireDeal(ctx, dealId, { deleted: true });
  const size = limitOf(limit, 50, 200);
  const beforeId = posInt(before);
  const { rows } = await query(
    `SELECT e.*, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path
     FROM crm_events e LEFT JOIN users u ON u.id = e.author_id
     WHERE e.deal_id = $1 ${beforeId ? 'AND e.id < $2' : ''} ORDER BY e.id DESC LIMIT ${size + 1}`,
    beforeId ? [row.id, beforeId] : [row.id]
  );
  return { events: rows.slice(0, size).map((item) => eventShape(item, ctx.locale)), hasMore: rows.length > size };
}

export async function getDeal(ctx, id) {
  const { row } = await requireDeal(ctx, id, { deleted: true });
  const [deal, pipeline, activities, events] = await Promise.all([
    hydrate(ctx, [row]).then((list) => list[0]),
    loadPipeline({ ...ctx, limits: null }, row.pipeline_id).then((item) => item.shape),
    listActivities(ctx, row.id, { checked: true }),
    listEvents(ctx, row.id, { limit: 50 }),
  ]);
  return { deal, pipeline, activities, events: events.events, eventsHasMore: events.hasMore };
}

// ── Input cleaning ──────────────────────────────────────────────────────────

const fieldError = (field, message) => {
  const error = httpError(400, message, 'INVALID_FIELD');
  error.details = { field };
  return error;
};

async function activeUserIds(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0 && id < 2 ** 31))].slice(0, 100);
  if (!list.length) return [];
  const { rows } = await query(`SELECT id FROM users WHERE id = ANY($1) AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [list]);
  const ok = new Set(rows.map((row) => row.id));
  return list.filter((id) => ok.has(id));
}

async function ownerOf(value) {
  if (value === undefined || value === null || value === '' || value === 0) return null;
  const [id] = await activeUserIds([value]);
  if (!id) throw fieldError('ownerId', 'The responsible person is not an active user');
  return id;
}

/** Custom field values by their declared type; `current` is merged (null / '' removes a key). */
export async function cleanCustom(input, fields, current = {}) {
  const out = { ...(current || {}) };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const field of fields) {
    if (!Object.hasOwn(input, field.key)) continue;
    const value = input[field.key];
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) {
      delete out[field.key];
      continue;
    }
    switch (field.type) {
      case 'text':
        out[field.key] = clean(value, 1000);
        break;
      case 'textarea':
        out[field.key] = String(value).slice(0, 20000);
        break;
      case 'number':
      case 'money': {
        const n = typeof value === 'number' ? value : Number(String(value).replace(/[\s ]/g, '').replace(',', '.'));
        if (!Number.isFinite(n) || Math.abs(n) >= 1e16) throw fieldError(field.key, `${field.label}: a number is expected`);
        out[field.key] = field.type === 'money' ? money(n) : n;
        break;
      }
      case 'date': {
        const date = parseDateOnly(value);
        if (!date) throw fieldError(field.key, `${field.label}: a date YYYY-MM-DD is expected`);
        out[field.key] = date;
        break;
      }
      case 'select':
        if (!field.options.includes(String(value))) throw fieldError(field.key, `${field.label}: unknown option`);
        out[field.key] = String(value);
        break;
      case 'multiselect': {
        const list = [...new Set((Array.isArray(value) ? value : [value]).map(String))];
        if (list.some((item) => !field.options.includes(item))) throw fieldError(field.key, `${field.label}: unknown option`);
        out[field.key] = list;
        break;
      }
      case 'bool':
        out[field.key] = value === true || value === 'true' || value === 1 || value === '1';
        break;
      case 'url': {
        const text = clean(value, 500);
        if (!/^https?:\/\/[^\s]+$/i.test(text)) throw fieldError(field.key, `${field.label}: a link starting with http(s):// is expected`);
        out[field.key] = text;
        break;
      }
      case 'user': {
        const [id] = await activeUserIds([value]);
        if (!id) throw fieldError(field.key, `${field.label}: not an active user`);
        out[field.key] = id;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

async function clientRef(table, value, field) {
  if (value === undefined || value === null || value === '' || value === 0) return null;
  const id = posInt(value);
  if (!id) throw fieldError(field, 'Client not found');
  const { rows } = await query(`SELECT id FROM ${table} WHERE id = $1`, [id]);
  if (!rows[0]) throw fieldError(field, 'Client not found');
  return id;
}

function currencyOf(ctx, value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const code = String(value).trim().toUpperCase();
  if (!(ctx.settings.currencies || []).includes(code)) throw fieldError('currency', 'This currency is not enabled in the CRM settings');
  return code;
}

function amountOf(value) {
  const amount = parseAmount(value);
  if (amount === null) throw fieldError('amount', 'The amount must be a non-negative number');
  return amount;
}

function closeDateOf(value) {
  if (value === null || value === '' || value === undefined) return null;
  const date = parseDateOnly(value);
  if (!date) throw fieldError('closeDate', 'A date YYYY-MM-DD is expected');
  return date;
}

function lostReasonOf(ctx, value) {
  const reason = clean(value, 300) || null;
  if (!reason && (ctx.settings.lostReasons || []).length) throw httpError(400, 'Choose the reason why the deal is lost', 'LOST_REASON_REQUIRED');
  return reason;
}

// ── Ranks ───────────────────────────────────────────────────────────────────

/**
 * Rank for a deal dropped into a stage: between `beforeId` (the card that ends
 * up above) and `afterId` (the card below); top of the column when neither is
 * given. A column whose gaps ran out is re-spread once.
 */
export async function rankBetween(client, stageId, beforeId, afterId, selfId = 0, respread = true) {
  const pick = async (id) =>
    id && id !== selfId ? ((await client.query(`SELECT rank FROM crm_deals WHERE id = $1 AND stage_id = $2`, [id, stageId])).rows[0]?.rank ?? null) : null;
  let prev = await pick(posInt(beforeId));
  let next = await pick(posInt(afterId));
  if (prev === null && next === null) {
    const { rows } = await client.query(`SELECT MIN(rank) AS edge FROM crm_deals WHERE stage_id = $1 AND deleted_at IS NULL AND id <> $2`, [stageId, selfId]);
    return rows[0].edge === null ? RANK_STEP : Number(rows[0].edge) - RANK_STEP;
  }
  // Only one neighbour: the other one is whoever stands next to it now.
  if (prev !== null && next === null) {
    const { rows } = await client.query(`SELECT MIN(rank) AS r FROM crm_deals WHERE stage_id = $1 AND deleted_at IS NULL AND id <> $2 AND rank > $3`, [stageId, selfId, prev]);
    next = rows[0].r;
  } else if (next !== null && prev === null) {
    const { rows } = await client.query(`SELECT MAX(rank) AS r FROM crm_deals WHERE stage_id = $1 AND deleted_at IS NULL AND id <> $2 AND rank < $3`, [stageId, selfId, next]);
    prev = rows[0].r;
  }
  const rank = midRank(prev, next);
  if (rank !== null) return rank;
  if (!respread) return Number(prev) + RANK_STEP / 1e6;
  await client.query(
    `UPDATE crm_deals d SET rank = r.n * ${RANK_STEP}
     FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY rank, id) AS n FROM crm_deals WHERE stage_id = $1) r
     WHERE r.id = d.id`,
    [stageId]
  );
  return rankBetween(client, stageId, beforeId, afterId, selfId, false);
}

// ── Events ──────────────────────────────────────────────────────────────────

export async function logEvent(client, dealId, kind, { data = {}, body = null, authorId = null } = {}) {
  const { rows } = await client.query(
    `INSERT INTO crm_events (deal_id, kind, body, data, author_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [dealId, kind, body, JSON.stringify(data), authorId]
  );
  return rows[0];
}

const stageRef = (stage) => (stage ? { id: stage.id, name: stage.name, color: stage.color, kind: stage.kind } : null);

async function lockDeal(client, id) {
  const { rows } = await client.query(`SELECT * FROM crm_deals WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0];
}

/**
 * Moves a locked deal to a stage of its pipeline (and/or reorders it there).
 * Sets stage_changed_at, closed_at (won/lost; cleared when back to open),
 * the lost reason; writes the history. Returns what changed.
 */
async function moveLocked(client, ctx, row, stage, { beforeId, afterId, lostReason, reorder = true } = {}) {
  if (stage.pipeline_id !== row.pipeline_id) throw httpError(400, 'The stage belongs to another pipeline', 'STAGE_NOT_IN_PIPELINE');
  const changed = stage.id !== row.stage_id;
  const from = (await client.query(`SELECT * FROM crm_stages WHERE id = $1`, [row.stage_id])).rows[0];
  let reason = row.lost_reason;
  if (stage.kind === 'lost' && changed) reason = lostReasonOf(ctx, lostReason);
  else if (stage.kind === 'lost' && lostReason !== undefined) reason = lostReasonOf(ctx, lostReason);
  else if (stage.kind !== 'lost') reason = null;
  const positioned = reorder && (changed || beforeId || afterId);
  const rank = positioned ? await rankBetween(client, stage.id, beforeId, afterId, row.id) : row.rank;
  const closedAt = stage.kind === 'open' ? null : changed && from?.kind !== stage.kind ? new Date() : row.closed_at || new Date();
  if (!changed && rank === row.rank && reason === row.lost_reason) return { changed: false };
  await client.query(
    `UPDATE crm_deals SET stage_id = $2, rank = $3, lost_reason = $4, closed_at = $5,
       stage_changed_at = CASE WHEN $6 THEN NOW() ELSE stage_changed_at END,
       version = version + 1, updated_by = $7, updated_at = NOW()
     WHERE id = $1`,
    [row.id, stage.id, rank, reason, closedAt, changed, ctx.userId]
  );
  if (changed) {
    const kind = stage.kind === 'won' ? 'won' : stage.kind === 'lost' ? 'lost' : 'stage';
    await logEvent(client, row.id, kind, { data: { from: stageRef(from), to: stageRef(stage), ...(stage.kind === 'lost' ? { lostReason: reason } : {}) }, authorId: ctx.userId });
  } else if (reason !== row.lost_reason) {
    await logEvent(client, row.id, 'field', { data: { field: 'lostReason', label: fieldLabel('lostReason', ctx.locale), from: row.lost_reason, to: reason }, authorId: ctx.userId });
  }
  return { changed, from: stageRef(from), to: stageRef(stage) };
}

async function stageById(client, id) {
  const stageId = posInt(id);
  if (!stageId) throw httpError(400, 'Choose a stage', 'STAGE_REQUIRED');
  const { rows } = await client.query(`SELECT * FROM crm_stages WHERE id = $1`, [stageId]);
  if (!rows[0]) throw httpError(404, 'Stage not found', 'NOT_FOUND');
  return rows[0];
}

function conflict() {
  return httpError(409, 'The deal was changed by someone else — reload it', 'VERSION_CONFLICT');
}

/** Runs `work` on the locked deal; a stale `version` becomes 409 with the fresh deal attached. */
async function changeDeal(ctx, id, version, work) {
  const dealId = intId(id);
  const effects = [];
  try {
    await withTransaction(async (client) => {
      const { row: full } = await requireDeal(ctx, dealId, { client });
      const row = await lockDeal(client, dealId);
      if (!row || row.deleted_at) throw httpError(404, 'Deal not found', 'NOT_FOUND');
      if (version !== undefined && version !== null && version !== '' && Number(version) !== row.version) throw conflict();
      await work(client, { ...full, ...row }, effects);
    });
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') err.deal = await dealById(ctx, dealId);
    throw err;
  }
  await afterDealChange(ctx, dealId, effects);
  return dealById(ctx, dealId);
}

// ── Writing ─────────────────────────────────────────────────────────────────

export async function createDeal(ctx, input = {}, { copyOf = null } = {}) {
  const pipelineId = posInt(input.pipelineId) || (await defaultPipelineId(ctx));
  if (!pipelineId) throw httpError(400, 'Choose a pipeline', 'PIPELINE_REQUIRED');
  const pipeline = await loadPipeline(ctx, pipelineId, { allowArchived: false });
  const stage = input.stageId ? pipeline.stages.find((item) => item.id === Number(input.stageId)) : pipeline.stages.find((item) => item.kind === 'open');
  if (!stage) throw httpError(400, 'The stage belongs to another pipeline', 'STAGE_NOT_IN_PIPELINE');
  const title = clean(input.title, 300);
  if (!title) throw httpError(400, 'Deal title is required', 'TITLE_REQUIRED');
  const values = {
    amount: amountOf(input.amount),
    currency: currencyOf(ctx, input.currency, ctx.settings.currency || 'KGS'),
    companyId: await clientRef('cmp_companies', input.companyId, 'companyId'),
    personId: await clientRef('cmp_people', input.personId, 'personId'),
    ownerId: input.ownerId === undefined ? ctx.userId : await ownerOf(input.ownerId),
    source: clean(input.source, 80) || null,
    comment: String(input.comment ?? '').slice(0, 20000).trim() || null,
    closeDate: closeDateOf(input.closeDate),
    custom: await cleanCustom(input.custom, ctx.settings.fields || []),
    watcherIds: await activeUserIds(input.watcherIds),
    lostReason: stage.kind === 'lost' ? lostReasonOf(ctx, input.lostReason) : null,
  };
  const id = await withTransaction(async (client) => {
    const rank = await rankBetween(client, stage.id, null, null);
    const { rows } = await client.query(
      `INSERT INTO crm_deals (pipeline_id, stage_id, title, amount, currency, company_id, person_id, owner_id, source, comment,
                              close_date, lost_reason, custom, rank, closed_at, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING id`,
      [
        pipeline.row.id, stage.id, title, values.amount, values.currency, values.companyId, values.personId, values.ownerId,
        values.source, values.comment, values.closeDate, values.lostReason, JSON.stringify(values.custom), rank,
        stage.kind === 'open' ? null : new Date(), ctx.userId,
      ]
    );
    const dealId = rows[0].id;
    for (const userId of values.watcherIds) await client.query(`INSERT INTO crm_deal_watchers (deal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [dealId, userId]);
    await logEvent(client, dealId, 'created', { data: { stage: stageRef(stage), pipeline: { id: pipeline.row.id, name: pipeline.row.name }, ...(copyOf ? { copiedFrom: copyOf } : {}) }, authorId: ctx.userId });
    return dealId;
  });
  const effects = [{ type: 'created' }];
  if (values.ownerId && values.ownerId !== ctx.userId) effects.push({ type: 'assigned', userId: values.ownerId });
  if (stage.kind !== 'open') effects.push({ type: 'stage', to: stageRef(stage), silent: true });
  await afterDealChange(ctx, id, effects);
  return dealById(ctx, id);
}

/** PUT /deals/:id — any field, `custom` merged key by key, `stageId` (+ lostReason) moves the deal. */
export async function updateDeal(ctx, id, input = {}) {
  return changeDeal(ctx, id, input.version, async (client, row, effects) => {
    const sets = [];
    const params = [row.id];
    const set = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    const events = [];
    const field = (key, from, to, extra = {}) => events.push({ kind: 'field', data: { field: key, label: fieldLabel(key, ctx.locale), from, to, ...extra } });

    if (input.title !== undefined) {
      const title = clean(input.title, 300);
      if (!title) throw httpError(400, 'Deal title is required', 'TITLE_REQUIRED');
      if (title !== row.title) {
        set('title', title);
        field('title', row.title, title);
      }
    }
    const currentCurrency = (row.currency || '').trim();
    const amount = input.amount !== undefined ? amountOf(input.amount) : money(row.amount);
    const currency = input.currency !== undefined ? currencyOf(ctx, input.currency, currentCurrency) : currentCurrency;
    if (amount !== money(row.amount) || currency !== currentCurrency) {
      set('amount', amount);
      set('currency', currency);
      field('amount', { amount: money(row.amount), currency: currentCurrency }, { amount, currency });
    }
    if (input.companyId !== undefined) {
      const companyId = await clientRef('cmp_companies', input.companyId, 'companyId');
      if (companyId !== row.company_id) {
        set('company_id', companyId);
        const name = companyId ? (await client.query(`SELECT name FROM cmp_companies WHERE id = $1`, [companyId])).rows[0]?.name : null;
        field('company', row.company_id ? { id: row.company_id, name: row.company_name } : null, companyId ? { id: companyId, name } : null);
        if (companyId) effects.push({ type: 'client', companyId });
      }
    }
    if (input.personId !== undefined) {
      const personId = await clientRef('cmp_people', input.personId, 'personId');
      if (personId !== row.person_id) {
        set('person_id', personId);
        const name = personId
          ? (await client.query(`SELECT CONCAT_WS(' ', last_name, first_name, middle_name) AS name FROM cmp_people WHERE id = $1`, [personId])).rows[0]?.name
          : null;
        field('person', row.person_id ? { id: row.person_id, name: row.person_name } : null, personId ? { id: personId, name } : null);
        if (personId) effects.push({ type: 'client', personId });
      }
    }
    if (input.ownerId !== undefined) {
      const ownerId = await ownerOf(input.ownerId);
      if (ownerId !== row.owner_id) {
        set('owner_id', ownerId);
        const names = await usersByIds([row.owner_id, ownerId]);
        events.push({ kind: 'owner', data: { field: 'owner', label: fieldLabel('owner', ctx.locale), from: names.get(row.owner_id) || null, to: names.get(ownerId) || null } });
        if (ownerId && ownerId !== ctx.userId) effects.push({ type: 'assigned', userId: ownerId });
      }
    }
    if (input.source !== undefined) {
      const source = clean(input.source, 80) || null;
      if (source !== (row.source || null)) {
        set('source', source);
        field('source', row.source || null, source);
      }
    }
    if (input.comment !== undefined) {
      const comment = String(input.comment ?? '').slice(0, 20000).trim() || null;
      if (comment !== (row.comment || null)) {
        set('comment', comment);
        field('comment', row.comment || null, comment);
      }
    }
    if (input.closeDate !== undefined) {
      const closeDate = closeDateOf(input.closeDate);
      const before = toDateString(row.close_date);
      if (closeDate !== before) {
        set('close_date', closeDate);
        field('closeDate', before, closeDate);
      }
    }
    if (input.custom !== undefined) {
      const fields = ctx.settings.fields || [];
      const custom = await cleanCustom(input.custom, fields, row.custom);
      const keys = new Set([...Object.keys(row.custom || {}), ...Object.keys(custom)]);
      let changed = false;
      for (const key of keys) {
        const a = row.custom?.[key] ?? null;
        const b = custom[key] ?? null;
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        changed = true;
        const def = fields.find((item) => item.key === key);
        events.push({ kind: 'field', data: { field: `cf_${key}`, label: def?.label || key, from: a, to: b, type: def?.type || null } });
      }
      if (changed) set('custom', JSON.stringify(custom));
    }
    if (input.watcherIds !== undefined) {
      const wanted = await activeUserIds(input.watcherIds);
      const current = (await client.query(`SELECT user_id FROM crm_deal_watchers WHERE deal_id = $1`, [row.id])).rows.map((item) => item.user_id);
      const added = wanted.filter((userId) => !current.includes(userId));
      const removed = current.filter((userId) => !wanted.includes(userId));
      if (added.length || removed.length) {
        await client.query(`DELETE FROM crm_deal_watchers WHERE deal_id = $1 AND user_id = ANY($2)`, [row.id, removed]);
        for (const userId of added) await client.query(`INSERT INTO crm_deal_watchers (deal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [row.id, userId]);
        const names = await usersByIds([...added, ...removed]);
        events.push({ kind: 'field', data: { field: 'watchers', label: fieldLabel('watchers', ctx.locale), added: added.map((userId) => names.get(userId)), removed: removed.map((userId) => names.get(userId)) } });
        if (!sets.length) sets.push('custom = custom');
      }
    }

    if (sets.length) {
      params.push(ctx.userId);
      await client.query(`UPDATE crm_deals SET ${sets.join(', ')}, version = version + 1, updated_by = $${params.length}, updated_at = NOW() WHERE id = $1`, params);
      for (const event of events) await logEvent(client, row.id, event.kind, { data: event.data, authorId: ctx.userId });
      effects.push({ type: 'updated', changes: events.map((event) => event.data) });
    }
    if (input.stageId !== undefined || (input.lostReason !== undefined && row.stage_kind === 'lost')) {
      const fresh = await lockDeal(client, row.id);
      const stage = input.stageId !== undefined ? await stageById(client, input.stageId) : await stageById(client, row.stage_id);
      const moved = await moveLocked(client, ctx, fresh, stage, { lostReason: input.lostReason, reorder: input.stageId !== undefined && stage.id !== row.stage_id });
      if (moved.changed) effects.push({ type: 'stage', from: moved.from, to: moved.to });
    }
  });
}

/** Kanban drag: another stage and/or a place between two cards. */
export async function moveDeal(ctx, id, input = {}) {
  return changeDeal(ctx, id, input.version, async (client, row, effects) => {
    const stage = await stageById(client, input.stageId ?? row.stage_id);
    const moved = await moveLocked(client, ctx, row, stage, { beforeId: input.beforeId, afterId: input.afterId, lostReason: input.lostReason });
    if (moved.changed) effects.push({ type: 'stage', from: moved.from, to: moved.to });
  });
}

/** Another pipeline: `stageId` of that pipeline (its first open stage when omitted). */
export async function changePipeline(ctx, id, input = {}) {
  const target = await loadPipeline(ctx, input.pipelineId, { allowArchived: false });
  return changeDeal(ctx, id, input.version, async (client, row, effects) => {
    const stage = input.stageId ? target.stages.find((item) => item.id === Number(input.stageId)) : target.stages.find((item) => item.kind === 'open');
    if (!stage) throw httpError(400, 'The stage belongs to another pipeline', 'STAGE_NOT_IN_PIPELINE');
    if (target.row.id === row.pipeline_id) {
      const moved = await moveLocked(client, ctx, row, stage, { lostReason: input.lostReason });
      if (moved.changed) effects.push({ type: 'stage', from: moved.from, to: moved.to });
      return;
    }
    const from = (await client.query(`SELECT p.id, p.name, s.id AS stage_id, s.name AS stage_name, s.color, s.kind FROM crm_pipelines p JOIN crm_stages s ON s.id = $2 WHERE p.id = $1`, [row.pipeline_id, row.stage_id])).rows[0];
    const reason = stage.kind === 'lost' ? lostReasonOf(ctx, input.lostReason ?? row.lost_reason) : null;
    const rank = await rankBetween(client, stage.id, null, null, row.id);
    const closedAt = stage.kind === 'open' ? null : from.kind === stage.kind ? row.closed_at || new Date() : new Date();
    await client.query(
      `UPDATE crm_deals SET pipeline_id = $2, stage_id = $3, rank = $4, lost_reason = $5, closed_at = $6, stage_changed_at = NOW(),
         version = version + 1, updated_by = $7, updated_at = NOW() WHERE id = $1`,
      [row.id, target.row.id, stage.id, rank, reason, closedAt, ctx.userId]
    );
    const fromStage = { id: from.stage_id, name: from.stage_name, color: from.color, kind: from.kind };
    await logEvent(client, row.id, 'pipeline', {
      data: { from: { id: from.id, name: from.name, stage: fromStage }, to: { id: target.row.id, name: target.row.name, stage: stageRef(stage) } },
      authorId: ctx.userId,
    });
    effects.push({ type: 'stage', from: fromStage, to: stageRef(stage), pipeline: true });
  });
}

export async function deleteDeal(ctx, id) {
  const { row } = await requireDeal(ctx, id);
  if (!canDelete(ctx, row)) throw httpError(403, 'Only the owner, the creator or a CRM administrator can delete this deal', 'FORBIDDEN');
  await withTransaction(async (client) => {
    await client.query(`UPDATE crm_deals SET deleted_at = NOW(), deleted_by = $2, version = version + 1, updated_at = NOW(), updated_by = $2 WHERE id = $1`, [row.id, ctx.userId]);
    await logEvent(client, row.id, 'deleted', { authorId: ctx.userId });
  });
  await afterDealChange(ctx, row.id, [{ type: 'deleted' }]);
}

export async function restoreDeal(ctx, id) {
  const { row } = await requireDeal(ctx, id, { deleted: true });
  if (!row.deleted_at) return dealById(ctx, row.id);
  if (!canDelete(ctx, row)) throw httpError(403, 'Only the owner, the creator or a CRM administrator can restore this deal', 'FORBIDDEN');
  await withTransaction(async (client) => {
    await client.query(`UPDATE crm_deals SET deleted_at = NULL, deleted_by = NULL, version = version + 1, updated_at = NOW(), updated_by = $2 WHERE id = $1`, [row.id, ctx.userId]);
    await logEvent(client, row.id, 'restored', { authorId: ctx.userId });
  });
  await afterDealChange(ctx, row.id, [{ type: 'updated', changes: [{ field: 'restored' }] }]);
  return dealById(ctx, row.id);
}

export async function copyDeal(ctx, id) {
  const { row } = await requireDeal(ctx, id);
  const { rows } = await query(`SELECT user_id FROM crm_deal_watchers WHERE deal_id = $1`, [row.id]);
  const { rows: stages } = await query(`SELECT id, kind FROM crm_stages WHERE pipeline_id = $1 ORDER BY sort, id`, [row.pipeline_id]);
  const stageId = row.stage_kind === 'open' ? row.stage_id : stages.find((stage) => stage.kind === 'open')?.id;
  const { rows: archived } = await query(`SELECT archived_at FROM crm_pipelines WHERE id = $1`, [row.pipeline_id]);
  if (archived[0]?.archived_at) throw httpError(400, 'The pipeline is archived', 'ARCHIVED');
  // Custom values that are still valid (a field or an option may be gone since); an inactive owner becomes me.
  const fields = ctx.settings.fields || [];
  const custom = {};
  for (const field of fields) {
    if (row.custom?.[field.key] === undefined) continue;
    try {
      Object.assign(custom, await cleanCustom({ [field.key]: row.custom[field.key] }, [field]));
    } catch {
      /* dropped */
    }
  }
  const [ownerId] = await activeUserIds([row.owner_id]);
  return createDeal(
    ctx,
    {
      pipelineId: row.pipeline_id,
      stageId,
      title: `${row.title} (${pick(COPY_SUFFIX, localeOrDefault(ctx.locale))})`.slice(0, 300),
      amount: money(row.amount),
      currency: (ctx.settings.currencies || []).includes(row.currency?.trim()) ? row.currency.trim() : undefined,
      companyId: row.company_id,
      personId: row.person_id,
      ownerId: ownerId || ctx.userId,
      source: row.source,
      comment: row.comment,
      closeDate: toDateString(row.close_date),
      custom,
      watcherIds: rows.map((item) => item.user_id),
    },
    { copyOf: { id: row.id, title: row.title } }
  );
}

export async function addComment(ctx, id, input = {}) {
  const { row } = await requireDeal(ctx, id);
  const body = String(input.body ?? '').replace(/\r\n/g, '\n').trim().slice(0, 10000);
  if (!body) throw httpError(400, 'The comment is empty', 'TEXT_REQUIRED');
  const event = await logEvent({ query }, row.id, 'comment', { body, authorId: ctx.userId });
  await query(`UPDATE crm_deals SET updated_at = NOW() WHERE id = $1`, [row.id]);
  const users = await usersByIds([ctx.userId]);
  const author = users.get(ctx.userId);
  return eventShape({ ...event, username: author?.username, name: author?.name, avatar_path: null, author_id: ctx.userId }, ctx.locale);
}

// ── Bulk ────────────────────────────────────────────────────────────────────

export const BULK_ACTIONS = ['stage', 'owner', 'pipeline', 'watchers', 'delete'];

/**
 * { ids } or { all: true, filter }, an action and its value. Deals the person
 * cannot see are skipped (not an error); at most 1000.
 *   stage     value: stageId | { stageId, lostReason }
 *   owner     value: userId
 *   pipeline  value: pipelineId | { pipelineId, stageId }
 *   watchers  value: [userIds] (added) | { add: [], remove: [] }
 *   delete    to the trash (only deals the person may delete)
 */
export async function bulk(ctx, input = {}) {
  const action = BULK_ACTIONS.includes(input.action) ? input.action : null;
  if (!action) throw httpError(400, 'Unknown bulk action', 'INVALID_ACTION');
  let ids;
  if (input.all === true) ids = await idsByFilter(ctx, input.filter && typeof input.filter === 'object' ? input.filter : {});
  else {
    if (Array.isArray(input.ids) && input.ids.length > MAX_BULK) throw httpError(400, `At most ${MAX_BULK} deals at once`, 'BULK_LIMIT');
    ids = idList(input.ids, null, MAX_BULK);
  }
  const value = input.value;
  // Values are checked once, before any deal changes.
  if (action === 'stage') {
    const stage = await stageById({ query }, typeof value === 'object' && value ? value.stageId : value);
    if (stage.kind === 'lost') lostReasonOf(ctx, value?.lostReason);
  }
  if (action === 'owner') await ownerOf(value);
  if (action === 'pipeline') await loadPipeline(ctx, typeof value === 'object' && value ? value.pipelineId : value, { allowArchived: false });
  let affected = 0;
  const skipped = [];
  for (const dealId of ids) {
    try {
      if (action === 'stage') {
        const stageId = Number(typeof value === 'object' && value ? value.stageId : value);
        const deal = await dealById(ctx, dealId);
        if (deal && deal.stageId === stageId) continue;
        await moveDeal(ctx, dealId, { stageId, lostReason: typeof value === 'object' && value ? value.lostReason : undefined });
      } else if (action === 'owner') {
        await updateDeal(ctx, dealId, { ownerId: value });
      } else if (action === 'pipeline') {
        const pipelineId = typeof value === 'object' && value ? value.pipelineId : value;
        await changePipeline(ctx, dealId, { pipelineId, stageId: typeof value === 'object' && value ? value.stageId : undefined, lostReason: value?.lostReason });
      } else if (action === 'watchers') {
        const add = Array.isArray(value) ? value : Array.isArray(value?.add) ? value.add : [];
        const remove = (Array.isArray(value?.remove) ? value.remove : []).map(Number);
        const deal = await dealById(ctx, dealId);
        if (!deal) continue;
        const current = deal.watchers.map((user) => user.id);
        const wanted = [...new Set([...current, ...add.map(Number)])].filter((userId) => !remove.includes(userId));
        if (wanted.length === current.length && wanted.every((userId) => current.includes(userId))) continue;
        await updateDeal(ctx, dealId, { watcherIds: wanted });
      } else if (action === 'delete') {
        await deleteDeal(ctx, dealId);
      }
      affected += 1;
    } catch (err) {
      // A deal that fails (not visible, another pipeline, no right to delete…) does not stop the others.
      skipped.push({ id: dealId, code: err.code || 'ERROR' });
    }
  }
  return { affected, skipped: skipped.length ? skipped.slice(0, 50) : undefined };
}
