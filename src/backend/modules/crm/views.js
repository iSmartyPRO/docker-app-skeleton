import { query } from '../../config/database.js';
import { clean, httpError, intId } from '../shared/acl.js';
import { COLUMNS, FROM, hydrate } from './deals.js';
import { buildFilter, cleanFilter, orderBy } from './filters.js';
import { MAX_EXPORT, Params, bucketBounds, csvCell, money, parseDateOnly, toDateString } from './util.js';

/* Calendar, CSV export and personal saved filters (presets). */

// ── Calendar ────────────────────────────────────────────────────────────────

/** Deals by a date field (close date or a custom date field) between from and to (inclusive). */
export async function calendar(ctx, input = {}) {
  const from = parseDateOnly(input.from);
  const to = parseDateOnly(input.to);
  if (!from || !to || from > to) throw httpError(400, 'from and to are dates YYYY-MM-DD', 'INVALID_DATE');
  if ((new Date(to) - new Date(from)) / 86400000 > 400) throw httpError(400, 'At most 400 days at once', 'RANGE_TOO_LONG');
  const fields = ctx.settings.fields || [];
  const field = String(input.field || 'closeDate');
  const p = new Params();
  const where = buildFilter(ctx, input, { fields, bounds: bucketBounds(new Date(), input.tz) }, p);
  let dateSql;
  if (field === 'closeDate') {
    dateSql = 'd.close_date';
    where.push(`d.close_date BETWEEN ${p.add(from)}::date AND ${p.add(to)}::date`);
  } else {
    const def = fields.find((item) => `cf_${item.key}` === field && item.type === 'date');
    if (!def) throw httpError(400, 'field: closeDate or cf_<key> of a date field', 'INVALID_FIELD');
    const key = p.add(def.key);
    dateSql = `d.custom->>${key}`;
    where.push(`d.custom->>${key} ~ ${p.add('^\\d{4}-\\d{2}-\\d{2}$')}`, `d.custom->>${key} BETWEEN ${p.add(from)} AND ${p.add(to)}`);
  }
  const { rows } = await query(
    `SELECT d.id, d.title, d.amount, d.currency, d.pipeline_id, d.stage_id, d.owner_id, ${dateSql} AS date, s.name AS stage_name, s.color AS stage_color, s.kind AS stage_kind
     FROM ${FROM} WHERE ${where.join(' AND ')} ORDER BY 8, d.id LIMIT 3000`,
    p.values
  );
  return {
    items: rows.map((row) => ({
      dealId: row.id,
      title: row.title,
      date: toDateString(row.date),
      amount: money(row.amount),
      currency: (row.currency || '').trim(),
      stage: { id: row.stage_id, name: row.stage_name, color: row.stage_color, kind: row.stage_kind },
      pipelineId: row.pipeline_id,
      ownerId: row.owner_id,
    })),
    field,
  };
}

// ── Export ──────────────────────────────────────────────────────────────────

const EXPORT_COLUMNS = {
  id: { title: 'ID', value: (deal) => deal.id },
  title: { title: 'Название', value: (deal) => deal.title },
  pipeline: { title: 'Воронка', value: (deal, row) => row.pipeline_name },
  stage: { title: 'Стадия', value: (deal, row) => row.stage_name },
  amount: { title: 'Сумма', value: (deal) => deal.amount.toFixed(2).replace('.', ',') },
  currency: { title: 'Валюта', value: (deal) => deal.currency },
  company: { title: 'Компания', value: (deal) => deal.company?.name },
  person: { title: 'Контакт', value: (deal) => deal.person?.name },
  phone: { title: 'Телефон', value: (deal) => deal.person?.phone },
  email: { title: 'E-mail', value: (deal) => deal.person?.email },
  owner: { title: 'Ответственный', value: (deal) => deal.owner?.name },
  source: { title: 'Источник', value: (deal) => deal.source },
  closeDate: { title: 'Дата закрытия', value: (deal) => deal.closeDate },
  createdAt: { title: 'Создана', value: (deal) => stamp(deal.createdAt) },
  updatedAt: { title: 'Изменена', value: (deal) => stamp(deal.updatedAt) },
  closedAt: { title: 'Закрыта', value: (deal) => stamp(deal.closedAt) },
  createdBy: { title: 'Создал', value: (deal) => deal.createdBy?.name },
  comment: { title: 'Комментарий', value: (deal) => deal.comment },
  lostReason: { title: 'Причина провала', value: (deal) => deal.lostReason },
  watchers: { title: 'Наблюдатели', value: (deal) => deal.watchers.map((user) => user.name).join(', ') },
  nextActivity: { title: 'Ближайшее дело', value: (deal) => (deal.activity.next ? `${stamp(deal.activity.next.dueAt) || ''} ${deal.activity.next.title}`.trim() : '') },
};
const DEFAULT_EXPORT = ['id', 'title', 'pipeline', 'stage', 'amount', 'currency', 'company', 'person', 'phone', 'owner', 'source', 'closeDate', 'createdAt', 'nextActivity'];

const stamp = (value) => (value ? new Date(value).toISOString().slice(0, 16).replace('T', ' ') : '');

function customCell(field, value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (field.type === 'bool') return value ? 'Да' : 'Нет';
  if (field.type === 'money' || field.type === 'number') return String(value).replace('.', ',');
  return value;
}

/**
 * The filtered deals as CSV (Excel-friendly: UTF-8 BOM, ';'), written in
 * batches of 500, at most 20 000 rows. `columns`: comma-separated keys of
 * EXPORT_COLUMNS and cf_<key>.
 */
export async function exportCsv(ctx, input, res) {
  const fields = ctx.settings.fields || [];
  const requested = String(input.columns || '').split(',').map((item) => item.trim()).filter(Boolean);
  const columns = (requested.length ? requested : DEFAULT_EXPORT)
    .map((key) => {
      if (EXPORT_COLUMNS[key]) return { key, ...EXPORT_COLUMNS[key] };
      const field = fields.find((item) => `cf_${item.key}` === key);
      return field ? { key, title: field.label, value: (deal) => customCell(field, deal.custom[field.key]) } : null;
    })
    .filter(Boolean)
    .slice(0, 60);
  if (!columns.length) throw httpError(400, 'No known columns', 'INVALID_COLUMNS');
  const p = new Params();
  const where = buildFilter(ctx, input, { fields, bounds: bucketBounds(new Date(), input.tz) }, p);
  const order = orderBy(input.sort, input.order);
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="crm-deals-${date}.csv"`);
  res.write(`﻿${columns.map((column) => csvCell(column.title)).join(';')}\r\n`);
  const batch = 500;
  try {
    for (let offset = 0; offset < MAX_EXPORT; offset += batch) {
      const { rows } = await query(
        `SELECT ${COLUMNS}, pl.name AS pipeline_name FROM ${FROM} JOIN crm_pipelines pl ON pl.id = d.pipeline_id
         WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${Math.min(batch, MAX_EXPORT - offset)} OFFSET ${offset}`,
        p.values
      );
      if (!rows.length) break;
      const deals = await hydrate(ctx, rows);
      const lines = deals.map((deal, index) => columns.map((column) => csvCell(column.value(deal, rows[index]))).join(';'));
      res.write(`${lines.join('\r\n')}\r\n`);
      if (rows.length < batch) break;
    }
  } catch (err) {
    // Headers are gone already: the file ends where it failed.
    console.warn('[crm] export failed:', err.message);
  }
  res.end();
}

// ── Presets ─────────────────────────────────────────────────────────────────

const presetShape = (row) => ({ id: row.id, name: row.name, filter: row.filter || {}, sort: row.sort || null, createdAt: row.created_at });
const SORT_RE = /^(updated|created|amount|title|close|stage)(:(asc|desc))?$/;

export async function listPresets(ctx) {
  const { rows } = await query(`SELECT * FROM crm_presets WHERE user_id = $1 ORDER BY id`, [ctx.userId]);
  return rows.map(presetShape);
}

function presetValues(input) {
  const name = clean(input.name, 80);
  if (!name) throw httpError(400, 'Name the filter', 'NAME_REQUIRED');
  return { name, filter: cleanFilter(input.filter), sort: SORT_RE.test(String(input.sort || '')) ? String(input.sort) : null };
}

export async function createPreset(ctx, input = {}) {
  const values = presetValues(input);
  const { rows: count } = await query(`SELECT COUNT(*)::int AS n FROM crm_presets WHERE user_id = $1`, [ctx.userId]);
  if (count[0].n >= 50) throw httpError(400, 'At most 50 saved filters', 'LIMIT');
  const { rows } = await query(`INSERT INTO crm_presets (user_id, name, filter, sort) VALUES ($1, $2, $3, $4) RETURNING *`, [ctx.userId, values.name, JSON.stringify(values.filter), values.sort]);
  return presetShape(rows[0]);
}

export async function updatePreset(ctx, id, input = {}) {
  const { rows: found } = await query(`SELECT * FROM crm_presets WHERE id = $1 AND user_id = $2`, [intId(id), ctx.userId]);
  if (!found[0]) throw httpError(404, 'Filter not found', 'NOT_FOUND');
  const values = presetValues({ name: input.name ?? found[0].name, filter: input.filter ?? found[0].filter, sort: input.sort !== undefined ? input.sort : found[0].sort });
  const { rows } = await query(`UPDATE crm_presets SET name = $2, filter = $3, sort = $4 WHERE id = $1 RETURNING *`, [found[0].id, values.name, JSON.stringify(values.filter), values.sort]);
  return presetShape(rows[0]);
}

export async function deletePreset(ctx, id) {
  const { rowCount } = await query(`DELETE FROM crm_presets WHERE id = $1 AND user_id = $2`, [intId(id), ctx.userId]);
  if (!rowCount) throw httpError(404, 'Filter not found', 'NOT_FOUND');
}
