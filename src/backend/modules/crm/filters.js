import { visibleSql } from './access.js';
import { DATE_RE, idList, likePattern, parseAmount, parseDateOnly, posInt } from './util.js';

/*
 * One filter for every view: board, stage pages, list, counters, export,
 * calendar and the activity board. Everything a person types becomes a bound
 * parameter; column names and operators come from fixed tables only.
 *
 * The SQL runs over:
 *   crm_deals d JOIN crm_stages s ON s.id = d.stage_id
 *   LEFT JOIN cmp_companies c … LEFT JOIN cmp_people pp …
 */

export const FILTER_KEYS = [
  'q', 'pipeline', 'stages', 'group', 'owners', 'client', 'amountMin', 'amountMax', 'createdFrom', 'createdTo',
  'closeFrom', 'closeTo', 'createdBy', 'activity', 'source',
];
export const GROUPS = ['open', 'won', 'lost', 'all'];
export const ACTIVITY_STATES = ['overdue', 'today', 'planned', 'none'];
const CF_RE = /^cf_([a-z][a-z0-9_]{0,39})$/;

/** Keeps the known filter keys (and cf_<key>) as short strings — what presets store. */
export function cleanFilter(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input)) {
    if (!FILTER_KEYS.includes(key) && !CF_RE.test(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    const text = Array.isArray(value) ? value.map((item) => String(item)).join(',') : String(value);
    out[key] = text.slice(0, 300);
  }
  return out;
}

const openActivity = (extra = '') => `EXISTS (SELECT 1 FROM crm_activities fa WHERE fa.deal_id = d.id AND fa.done_at IS NULL${extra})`;

/**
 * WHERE conditions (joined with AND) and their parameters.
 *   ctx      crmContext — visibility, limits, the person's id for `me`
 *   input    the filter (query string or a preset)
 *   options  fields      custom fields of the settings (cf_<key> are checked against them)
 *            bounds      bucketBounds() — needed by `activity`
 *            ignore      filter keys to leave out (the board ignores `group`)
 *            trash       deleted deals instead of live ones
 *   p        Params (shared with the rest of the query)
 */
export function buildFilter(ctx, input = {}, options = {}, p) {
  const { fields = [], bounds = null, ignore = [], trash = false } = options;
  const f = (key) => (ignore.includes(key) ? undefined : input[key]);
  const where = [trash ? 'd.deleted_at IS NOT NULL' : 'd.deleted_at IS NULL', ...visibleSql(ctx, p)];

  const q = String(f('q') ?? '').trim().slice(0, 100);
  if (q) {
    const like = p.add(likePattern(q));
    where.push(`(d.title ILIKE ${like} OR d.comment ILIKE ${like} OR c.name ILIKE ${like}
      OR CONCAT_WS(' ', pp.last_name, pp.first_name, pp.middle_name) ILIKE ${like}
      OR CONCAT_WS(' ', pp.first_name, pp.last_name) ILIKE ${like})`);
  }

  const pipeline = posInt(f('pipeline'));
  if (pipeline) where.push(`d.pipeline_id = ${p.add(pipeline)}`);
  else if (f('pipeline') !== undefined && f('pipeline') !== '' && f('pipeline') !== 'all') where.push('FALSE');

  if (f('stages')) where.push(`d.stage_id = ANY(${p.add(idList(f('stages')))}::int[])`);

  const group = GROUPS.includes(f('group')) ? f('group') : ignore.includes('group') ? 'all' : 'open';
  if (group !== 'all') where.push(`s.kind = ${p.add(group)}`);

  if (f('owners')) {
    const raw = String(f('owners'));
    const ids = idList(raw, ctx.userId);
    const none = raw.split(',').includes('none');
    const parts = [];
    if (ids.length) parts.push(`d.owner_id = ANY(${p.add(ids)}::int[])`);
    if (none) parts.push('d.owner_id IS NULL');
    where.push(parts.length ? `(${parts.join(' OR ')})` : 'FALSE');
  }
  if (f('createdBy')) where.push(`d.created_by = ANY(${p.add(idList(f('createdBy'), ctx.userId))}::int[])`);

  const client = /^([cp]):(\d{1,9})$/.exec(String(f('client') ?? ''));
  if (client) where.push(`${client[1] === 'c' ? 'd.company_id' : 'd.person_id'} = ${p.add(Number(client[2]))}`);
  else if (f('client')) where.push('FALSE');

  const min = f('amountMin') !== undefined && f('amountMin') !== '' ? parseAmount(f('amountMin')) : null;
  const max = f('amountMax') !== undefined && f('amountMax') !== '' ? parseAmount(f('amountMax')) : null;
  if (min !== null) where.push(`d.amount >= ${p.add(min)}`);
  if (max !== null) where.push(`d.amount <= ${p.add(max)}`);

  // Dates are whole days: "to" includes its day.
  const createdFrom = parseDateOnly(f('createdFrom'));
  const createdTo = parseDateOnly(f('createdTo'));
  if (createdFrom) where.push(`d.created_at >= ${p.add(createdFrom)}::date`);
  if (createdTo) where.push(`d.created_at < ${p.add(createdTo)}::date + 1`);
  const closeFrom = parseDateOnly(f('closeFrom'));
  const closeTo = parseDateOnly(f('closeTo'));
  if (closeFrom) where.push(`d.close_date >= ${p.add(closeFrom)}::date`);
  if (closeTo) where.push(`d.close_date <= ${p.add(closeTo)}::date`);

  if (f('source')) {
    const sources = String(f('source')).split('|').map((item) => item.trim().slice(0, 80)).filter(Boolean).slice(0, 20);
    if (sources.length) where.push(`d.source = ANY(${p.add(sources)}::text[])`);
  }

  const activity = f('activity');
  if (ACTIVITY_STATES.includes(activity) && bounds) {
    if (activity === 'overdue') where.push(openActivity(` AND fa.due_at < ${p.add(bounds.now)}::timestamptz`));
    else if (activity === 'none') where.push(`NOT ${openActivity()}`);
    else {
      const endToday = p.add(bounds.endToday);
      if (activity === 'today') {
        const now = p.add(bounds.now);
        where.push(`NOT ${openActivity(` AND fa.due_at < ${now}::timestamptz`)}`);
        where.push(openActivity(` AND fa.due_at >= ${now}::timestamptz AND fa.due_at < ${endToday}::timestamptz`));
      } else {
        where.push(openActivity());
        where.push(`NOT ${openActivity(` AND fa.due_at < ${endToday}::timestamptz`)}`);
      }
    }
  }

  // Custom fields: keys must be configured; the key itself is a parameter too.
  for (const [name, value] of Object.entries(input)) {
    const match = CF_RE.exec(name);
    if (!match || ignore.includes(name) || value === undefined || value === null || value === '') continue;
    const field = fields.find((item) => item.key === match[1]);
    if (!field) continue;
    // The key becomes a parameter only when a condition uses it.
    let keyParam = null;
    const k = () => (keyParam ||= p.add(field.key));
    const text = String(value).slice(0, 200);
    switch (field.type) {
      case 'select':
        where.push(`d.custom->>${k()} = ANY(${p.add(text.split('|').filter(Boolean))}::text[])`);
        break;
      case 'multiselect':
        where.push(`COALESCE(d.custom->${k()}, '[]'::jsonb) @> jsonb_build_array(${p.add(text)}::text)`);
        break;
      case 'number':
      case 'money': {
        const n = Number(String(text).replace(',', '.'));
        where.push(Number.isFinite(n) ? `d.custom->${k()} = to_jsonb(${p.add(n)}::numeric)` : 'FALSE');
        break;
      }
      case 'user': {
        const id = text === 'me' ? ctx.userId : posInt(text);
        where.push(id ? `d.custom->${k()} = to_jsonb(${p.add(id)}::int)` : 'FALSE');
        break;
      }
      case 'bool':
        where.push(['1', 'true'].includes(text) ? `d.custom->${k()} = 'true'::jsonb` : `COALESCE(d.custom->${k()}, 'false'::jsonb) = 'false'::jsonb`);
        break;
      case 'date': {
        // "2026-10-01" or a range "2026-10-01..2026-10-31".
        const [from, to] = text.split('..');
        const a = parseDateOnly(from);
        const b = to !== undefined ? parseDateOnly(to) : a;
        if (!a && !b) where.push('FALSE');
        if (a) where.push(`d.custom->>${k()} >= ${p.add(a)}`);
        if (b) where.push(`d.custom->>${k()} <= ${p.add(b)}`);
        if (a || b) where.push(`d.custom->>${k()} ~ ${p.add(DATE_RE.source)}`);
        break;
      }
      default:
        where.push(`d.custom->>${k()} ILIKE ${p.add(likePattern(text))}`);
    }
  }
  return where;
}

/** Sorting from a fixed whitelist. */
export const SORTS = {
  updated: 'd.updated_at',
  created: 'd.created_at',
  amount: 'd.amount',
  title: 'LOWER(d.title)',
  close: 'd.close_date',
  stage: 's.sort',
};

export function orderBy(sort, order) {
  const column = SORTS[sort] || SORTS.updated;
  const direction = order === 'asc' ? 'ASC' : order === 'desc' ? 'DESC' : sort === 'title' || sort === 'stage' ? 'ASC' : 'DESC';
  return `${column} ${direction} NULLS LAST, d.id ${direction}`;
}

/** page ≥ 1, pageSize 1…100 (20 by default). */
export function pageOf(input = {}) {
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(input.pageSize, 10) || 20));
  const page = Math.min(100000, Math.max(1, Number.parseInt(input.page, 10) || 1));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
