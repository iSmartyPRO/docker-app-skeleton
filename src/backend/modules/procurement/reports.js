import { query } from '../../config/database.js';
import { formatDate, formatDateTime } from '../../services/datetime.js';
import { requestRegional } from '../../services/regional.js';
import { exportLocale, tr } from '../../services/i18n/index.js';
import { approvalSettings } from '../approvals/api.js';
import { Params, visibleSql } from './access.js';
import { PAYABLE, STATUSES, cents, httpError, payGroup, toCsv, totalsByCurrency } from './logic.js';
import { SELECT, contextOf, hydrate, listRequests, todayFor } from './service.js';

/*
 * Accounting and management views: the payments registry (groups by the
 * pay-by day, totals per currency, CSV), list export (only the visible
 * columns, only what the person may see), the summary for management and
 * the dashboard widget.
 */

// ── Payments registry ───────────────────────────────────────────────────────

export async function registry(req, input = {}) {
  const ctx = await contextOf(req);
  if (!ctx.canPay) throw httpError(403, 'The payments registry is for accounting', 'FORBIDDEN');
  const today = await todayFor(req);
  const p = new Params();
  const where = [`r.status = ANY(${p.add(PAYABLE)}::text[])`];
  const q = String(input.q || '').trim().slice(0, 100);
  if (q) {
    const like = p.add(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(r.number ILIKE ${like} OR r.title ILIKE ${like} OR r.supplier_name ILIKE ${like})`);
  }
  const entity = Number(input.legalEntity);
  if (Number.isInteger(entity) && entity > 0) where.push(`r.legal_entity_id = ${p.add(entity)}`);
  const { rows } = await query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY r.pay_by NULLS LAST, r.id LIMIT 2000`, p.values);
  const items = await hydrate(rows, today);
  const groups = { overdue: [], today: [], week: [], later: [] };
  for (const item of items) groups[payGroup(item.payBy, today)].push(item);
  return {
    today,
    groups: Object.entries(groups).map(([key, list]) => ({ key, items: list, totals: totalsByCurrency(list, 'remaining') })),
    totals: totalsByCurrency(items, 'remaining'),
    count: items.length,
  };
}

const statusText = (status, locale) => {
  const key = `procurement.status.${status}`;
  const text = tr(locale, key);
  return text === key ? status : text;
};
/** An urgency level: the administrator's name for it, else the stock name in the language, else the key. */
const urgencyText = (key, ctx) => {
  if (!key) return '';
  const level = (ctx.urgencies || []).find((item) => item.key === key);
  if (level?.label) return level.label;
  const text = tr(ctx.locale, `procurement.urgency.${key}`);
  return text === `procurement.urgency.${key}` ? key : text;
};
const num = (value) => (value === null || value === undefined ? '' : String(cents(value)));

/** CSV of the registry, in the person's language and date format. */
export async function registryCsv(req, input = {}) {
  const data = await registry(req, input);
  const regional = await requestRegional(req);
  const locale = exportLocale(input.lang, req.locale);
  const header = tr(locale, 'procurement.registryCsv.head');
  const rows = data.groups.flatMap((group) =>
    group.items.map((item) => [
      tr(locale, `procurement.registryCsv.group.${group.key}`),
      item.number,
      item.title,
      item.supplier?.name || '',
      item.legalEntity?.label || '',
      item.payBy ? formatDate(item.payBy, regional, locale) : '',
      num(item.amount),
      num(item.paid),
      num(item.remaining),
      item.currency,
      statusText(item.status, locale),
      item.author?.name || '',
    ])
  );
  return { csv: toCsv(header, rows), filename: `payments-${data.today}.csv` };
}

// ── List export ─────────────────────────────────────────────────────────────

export const EXPORT_COLUMNS = {
  number: { value: (item) => item.number },
  title: { value: (item) => item.title },
  amount: { value: (item) => num(item.amount) },
  currency: { value: (item) => item.currency },
  paid: { value: (item) => num(item.paid) },
  supplier: { value: (item) => item.supplier?.name || '' },
  category: { value: (item, ctx) => ctx.categories.get(item.category) || item.category || '' },
  urgency: { value: (item, ctx) => urgencyText(item.urgency, ctx) },
  status: { value: (item, ctx) => statusText(item.status, ctx.locale) },
  payBy: { value: (item, ctx) => (item.payBy ? formatDate(item.payBy, ctx.regional, ctx.locale) : '') },
  deliverBy: { value: (item, ctx) => (item.deliverBy ? formatDate(item.deliverBy, ctx.regional, ctx.locale) : '') },
  responsible: { value: (item) => item.responsible?.name || '' },
  author: { value: (item) => item.author?.name || '' },
  legalEntity: { value: (item) => item.legalEntity?.label || '' },
  createdAt: { value: (item, ctx) => formatDateTime(item.createdAt, ctx.regional, ctx.locale) },
};

/** CSV of the list under the current filter; `columns` = the visible columns in their order. */
export async function listCsv(req, input = {}) {
  const ctx = await contextOf(req);
  const regional = await requestRegional(req);
  const locale = exportLocale(input.lang, req.locale);
  const asked = String(input.columns || '').split(',').filter((key) => EXPORT_COLUMNS[key]);
  const columns = asked.length ? asked : ['number', 'title', 'amount', 'currency', 'supplier', 'urgency', 'status', 'payBy', 'deliverBy', 'responsible'];
  const items = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await listRequests(req, { ...input, page, pageSize: 200 });
    items.push(...result.items);
    if (items.length >= result.total || !result.items.length) break;
  }
  const urgencies = (await approvalSettings().catch(() => ({})))?.urgencies || [];
  const helpers = { regional, locale, urgencies, categories: new Map((ctx.settings.categories || []).map((item) => [item.key, item.name])) };
  const csv = toCsv(columns.map((key) => tr(locale, `procurement.columns.${key}`)), items.map((item) => columns.map((key) => EXPORT_COLUMNS[key].value(item, helpers))));
  return { csv, filename: `procurement-${await todayFor(req)}.csv` };
}

// ── Summary for management ──────────────────────────────────────────────────

/**
 * Sums by status, category and month (per currency), the average approval
 * time, overdue requests. Over what the person may see; `from`/`to` limit by
 * creation day (default: the last 12 months).
 */
export async function summary(req, input = {}) {
  const ctx = await contextOf(req);
  const today = await todayFor(req);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(input.from || '') ? input.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(input.to || '') ? input.to : null;
  // Each query gets its own parameter list (node-pg refuses unused parameters).
  const base = async () => {
    const p = new Params();
    const where = [];
    const visible = await visibleSql(ctx, p);
    if (visible) where.push(visible);
    where.push(from ? `r.created_at >= ${p.add(from)}::date` : `r.created_at >= NOW() - INTERVAL '12 months'`);
    if (to) where.push(`r.created_at < (${p.add(to)}::date + 1)`);
    return { p, sql: `FROM proc_requests r WHERE ${where.join(' AND ')}` };
  };
  const run = async (build) => {
    const { p, sql } = await base();
    return query(build(sql, p), p.values);
  };
  const [byStatus, byCategory, byMonth, approval, overdue] = await Promise.all([
    run((sql) => `SELECT r.status, r.currency, COUNT(*)::int AS n, SUM(r.amount) AS amount, SUM(r.paid_amount) AS paid ${sql} GROUP BY 1, 2`),
    run((sql, p) => `SELECT COALESCE(r.category, '') AS category, r.currency, COUNT(*)::int AS n, SUM(r.amount) AS amount ${sql} AND r.status <> ALL(${p.add(['draft', 'cancelled', 'rejected'])}::text[]) GROUP BY 1, 2`),
    run((sql, p) => `SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month, r.currency, COUNT(*)::int AS n, SUM(r.amount) AS amount ${sql} AND r.status <> ALL(${p.add(['draft', 'cancelled'])}::text[]) GROUP BY 1, 2 ORDER BY 1`),
    run(
      (sql) => `SELECT COUNT(*)::int AS n, AVG(EXTRACT(EPOCH FROM (r.approved_at - r.submitted_at)))::float AS avg_seconds,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.approved_at - r.submitted_at)))::float AS median_seconds
       ${sql} AND r.approved_at IS NOT NULL AND r.submitted_at IS NOT NULL AND r.approved_at >= r.submitted_at`
    ),
    run(
      (sql, p) => `${SELECT} WHERE r.id IN (SELECT r.id ${sql}) AND (
         (r.status = ANY(${p.add(PAYABLE)}::text[]) AND r.pay_by < ${p.add(today)}::date)
         OR (r.status = ANY(${p.add(['to_pay', 'partially_paid', 'paid'])}::text[]) AND r.delivery_state <> 'full' AND r.deliver_by < ${p.add(today)}::date)
         OR (ap.status = 'pending' AND ap.due_at <= NOW()))
       ORDER BY COALESCE(r.pay_by, r.deliver_by) NULLS LAST LIMIT 50`
    ),
  ]);
  const sums = (rows) => rows.map((row) => ({ ...row, amount: cents(row.amount), ...(row.paid !== undefined ? { paid: cents(row.paid) } : {}) }));
  return {
    byStatus: sums(byStatus.rows).sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)),
    byCategory: sums(byCategory.rows),
    byMonth: sums(byMonth.rows),
    approval: { count: approval.rows[0].n, avgSeconds: approval.rows[0].avg_seconds === null ? null : Math.round(approval.rows[0].avg_seconds), medianSeconds: approval.rows[0].median_seconds === null ? null : Math.round(approval.rows[0].median_seconds), avgHours: approval.rows[0].avg_seconds ? Math.round((approval.rows[0].avg_seconds / 3600) * 10) / 10 : null, medianHours: approval.rows[0].median_seconds ? Math.round((approval.rows[0].median_seconds / 3600) * 10) / 10 : null },
    overdue: await hydrate(overdue.rows, today),
  };
}

/** Dashboard widget: my numbers at a glance. */
export async function widget(req) {
  const ctx = await contextOf(req);
  const { chipCounters } = await import('./service.js');
  const counters = await chipCounters(req, {});
  const p = new Params();
  const where = [`r.status = ANY(${p.add(PAYABLE)}::text[])`];
  const visible = await visibleSql(ctx, p);
  if (visible) where.push(visible);
  const { rows } = await query(`SELECT r.currency, SUM(r.amount - r.paid_amount) AS amount FROM proc_requests r WHERE ${where.join(' AND ')} GROUP BY 1 ORDER BY 1`, p.values);
  const recent = await listRequests(req, { chip: counters.waiting ? 'waiting' : 'mine', pageSize: 5 });
  return {
    counters,
    toPay: rows.map((row) => ({ currency: row.currency, amount: cents(row.amount) })),
    items: recent.items,
    focus: counters.waiting ? 'waiting' : 'mine',
    canCreate: ctx.canCreate,
    canPay: ctx.canPay,
  };
}

