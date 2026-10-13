import { query, withTransaction } from '../../config/database.js';
import { httpError } from '../shared/acl.js';
import { FINISHINGS, HELD, MAX_DEPTH, STATUSES } from './constants.js';
import { requireConfigure, requireProject, visibleProjectIds } from './access.js';
import { has, readCaps } from './rules.js';
import { NODE_SELECT, visibleNode } from './shapes.js';
import { treeChanged } from './realtime.js';
import { unitCharacteristics, unitCommercial } from './nodes.js';
import { Params, csvCell, idList, intOr, likePattern, logEvent, parseNumber, text } from './util.js';

/*
 * The registry of units (spec §9.3): filters, sorting, pages, CSV export,
 * and the Excel/CSV import with a validation report (§9.10). The browser
 * reads .xlsx files (exceljs) and sends rows as JSON; the server validates
 * every row and writes all of them in one transaction, or nothing.
 */

const SORTS = {
  code: 'LOWER(n.code)',
  name: 'LOWER(n.name)',
  price: 'u.price',
  area: 'COALESCE(u.area_total, u.area_plot)',
  plot: 'u.area_plot',
  ppm: 'u.price / NULLIF(COALESCE(u.area_total, u.area_plot), 0)',
  status: `array_position(ARRAY[${STATUSES.map((s) => `'${s}'`).join(',')}]::text[], u.status::text)`,
  floor: 'u.floor',
  bedrooms: 'u.bedrooms',
  updated: 'u.updated_at',
  readiness: 'n.readiness',
};

/** WHERE conditions of the registry filter; price filters only for people who see prices. */
export function unitFilter(ctx, input, p, caps) {
  const where = ['u.node_id IS NOT NULL'];
  const ids = visibleProjectIds(ctx);
  if (ids) where.push(`n.project_id = ANY(${p.add(ids)}::int[])`);
  if (intOr(input.project)) where.push(`n.project_id = ${p.add(intOr(input.project))}`);
  if (intOr(input.node)) where.push(`n.path @> ARRAY[${p.add(intOr(input.node))}]::int[]`);
  const listed = idList(input.ids, 5000);
  if (listed.length) where.push(`n.id = ANY(${p.add(listed)}::int[])`);
  if (input.q) {
    const like = p.add(likePattern(text(input.q, 80)));
    where.push(`(n.code ILIKE ${like} OR n.name ILIKE ${like} OR u.number ILIKE ${like})`);
  }
  const statuses = String(input.status || '').split(',').filter((item) => STATUSES.includes(item));
  if (statuses.length && has(caps, 'status.view')) where.push(`u.status = ANY(${p.add(statuses)}::text[])`);
  const types = idList(input.types);
  if (types.length) where.push(`n.type_id = ANY(${p.add(types)}::int[])`);
  const range = (key, column, allowed = true) => {
    if (!allowed) return;
    const min = parseNumber(input[`${key}Min`]);
    const max = parseNumber(input[`${key}Max`]);
    if (min !== null && !Number.isNaN(min)) where.push(`${column} >= ${p.add(min)}`);
    if (max !== null && !Number.isNaN(max)) where.push(`${column} <= ${p.add(max)}`);
  };
  range('price', 'u.price', has(caps, 'price.view'));
  range('area', 'COALESCE(u.area_total, u.area_plot)');
  range('plot', 'u.area_plot');
  range('floor', 'u.floor');
  range('readiness', 'n.readiness');
  const bedrooms = parseNumber(input.bedrooms);
  if (bedrooms !== null && !Number.isNaN(bedrooms)) where.push(`u.bedrooms >= ${p.add(bedrooms)}`);
  const rooms = parseNumber(input.rooms);
  if (rooms !== null && !Number.isNaN(rooms)) where.push(`u.rooms = ${p.add(rooms)}`);
  const finishing = String(input.finishing || '').split(',').filter((item) => FINISHINGS.includes(item));
  if (finishing.length) where.push(`u.finishing = ANY(${p.add(finishing)}::text[])`);
  if (input.mine === '1' || input.mine === true) where.push(`u.manager_id = ${p.add(ctx.userId)}`);
  if (intOr(input.manager) && has(caps, 'booking.view')) where.push(`u.manager_id = ${p.add(intOr(input.manager))}`);
  if (intOr(input.stage)) where.push(`n.current_stage_id = ${p.add(intOr(input.stage))}`);
  if (input.noPublish === '1') where.push('u.no_publish');
  return where;
}

export async function listUnits(ctx, input = {}) {
  const projectId = intOr(input.project);
  if (projectId) await requireProject(ctx, projectId);
  const caps = projectId ? readCaps(ctx, projectId) : new Set(['status.view']);
  const p = new Params();
  const where = unitFilter(ctx, input, p, caps);
  const sortKey = SORTS[input.sort] && (input.sort !== 'price' && input.sort !== 'ppm' ? true : has(caps, 'price.view')) ? input.sort : 'code';
  const order = input.order === 'desc' ? 'DESC' : 'ASC';
  const pageSize = Math.min(5000, Math.max(1, intOr(input.pageSize, 50)));
  const page = Math.max(1, intOr(input.page, 1));
  const sql = `${NODE_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${SORTS[sortKey]} ${order} NULLS LAST, n.sort, n.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const [{ rows }, count] = await Promise.all([
    query(sql, p.values),
    query(`SELECT COUNT(*)::int AS n FROM mp_nodes n LEFT JOIN mp_units u ON u.node_id = n.id WHERE ${where.join(' AND ')}`, p.values),
  ]);
  return { items: rows.map((row) => visibleNode(ctx, row, { caps: readCaps(ctx, row.project_id), presentation: input.presentation === '1' || input.presentation === 1 })), total: count.rows[0].n, page, pageSize, sort: sortKey, order: order.toLowerCase() };
}

const STATUS_RU = { not_for_sale: 'Не в продаже', free: 'Свободно', reserve: 'Резерв', booking: 'Бронь', deposit: 'Задаток', contract: 'Договор', sold: 'Продано', handed: 'Передано' };

/** CSV of the registry (UTF-8 BOM, `;`), only the columns the person may see. */
export async function exportCsv(ctx, input, res) {
  const { items } = await listUnits(ctx, { ...input, page: 1, pageSize: 5000 });
  const cols = [
    ['Код', (n) => n.code],
    ['Название', (n) => n.name],
    ['Тип', (n) => n.type?.name],
    ['Статус', (n) => (n.unit?.status ? STATUS_RU[n.unit.status] : '')],
    ['Цена', (n) => n.unit?.price],
    ['Валюта', (n) => n.unit?.currency],
    ['Цена за м²', (n) => n.unit?.pricePerM2],
    ['Мин. цена', (n) => n.unit?.minPrice],
    ['Площадь, м²', (n) => n.unit?.areaTotal],
    ['Участок, м²', (n) => n.unit?.areaPlot],
    ['Комнат', (n) => n.unit?.rooms],
    ['Спален', (n) => n.unit?.bedrooms],
    ['Этаж', (n) => n.unit?.floor],
    ['Номер', (n) => n.unit?.number],
    ['Отделка', (n) => n.unit?.finishing],
    ['Готовность, %', (n) => n.readiness],
    ['Менеджер', (n) => n.unit?.manager?.name],
    ['Клиент', (n) => n.unit?.client?.name],
    ['Сделка', (n) => (n.unit?.deal ? `#${n.unit.deal.id} ${n.unit.deal.title}` : '')],
  ].filter(([, get]) => items.some((item) => get(item) !== undefined && get(item) !== null && get(item) !== ''));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="masterplan-units.csv"`);
  const lines = [cols.map(([title]) => csvCell(title)).join(';'), ...items.map((item) => cols.map(([, get]) => csvCell(get(item))).join(';'))];
  res.send(`﻿${lines.join('\r\n')}\r\n`);
}

// ── Import ──────────────────────────────────────────────────────────────────

const IMPORT_FIELDS = ['code', 'name', 'type', 'parent', 'status', 'price', 'currency', 'minPrice', 'discountPct', 'areaTotal', 'areaLiving', 'areaPlot', 'areaTerrace', 'rooms', 'bedrooms', 'bathrooms', 'levels', 'ceiling', 'floor', 'number', 'riser', 'finishing'];

/**
 * Validates and (unless dryRun) writes rows: { projectId, rows: [{ code, name, type, parent, … }], dryRun }.
 * `type` is a type key or name; `parent` the code of a node in the project or
 * of an earlier row. Existing codes are updated (characteristics, price with
 * history), new ones created. → { ok, created, updated, errors: [{ row, field, code, message }] }
 */
export async function importUnits(ctx, input = {}) {
  const project = await requireProject(ctx, input.projectId);
  requireConfigure(ctx, project.id);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) throw httpError(400, 'The file has no rows', 'EMPTY');
  if (rows.length > 5000) throw httpError(400, 'At most 5000 rows at once', 'BULK_LIMIT');
  const [{ rows: types }, { rows: nodes }] = await Promise.all([
    query(`SELECT * FROM mp_types WHERE archived_at IS NULL`),
    query(`SELECT n.id, n.code, n.path, n.depth, n.kind, n.type_id, u.status, u.price, u.currency FROM mp_nodes n LEFT JOIN mp_units u ON u.node_id = n.id WHERE n.project_id = $1`, [project.id]),
  ]);
  const typeBy = (value) => {
    const key = String(value || '').trim().toLowerCase();
    return types.find((type) => type.key === key || type.name.toLowerCase() === key) || null;
  };
  const byCode = new Map(nodes.filter((node) => node.code).map((node) => [node.code.toLowerCase(), node]));
  const errors = [];
  const plan = [];
  const seen = new Map();
  rows.forEach((raw, index) => {
    const line = index + 1;
    const err = (field, code, message) => errors.push({ row: line, field, code, message });
    const row = Object.fromEntries(IMPORT_FIELDS.map((key) => [key, raw?.[key] === undefined || raw?.[key] === null ? '' : String(raw[key]).trim()]));
    if (!row.code) return err('code', 'REQUIRED', 'Code is required');
    const key = row.code.toLowerCase();
    if (seen.has(key)) return err('code', 'DUPLICATE', `Code repeats row ${seen.get(key)}`);
    seen.set(key, line);
    const existing = byCode.get(key);
    const type = row.type ? typeBy(row.type) : null;
    if (row.type && !type) err('type', 'UNKNOWN_TYPE', `Unknown type “${row.type}”`);
    if (!existing && !row.type) err('type', 'REQUIRED', 'Type is required for a new object');
    if (type && existing && existing.type_id !== type.id) err('type', 'TYPE_CHANGE', 'The type of an existing object is changed in its card');
    let parent = null;
    if (row.parent) {
      parent = byCode.get(row.parent.toLowerCase()) || plan.find((item) => item.code.toLowerCase() === row.parent.toLowerCase()) || null;
      if (!parent) err('parent', 'UNKNOWN_PARENT', `No object with code “${row.parent}”`);
      else if ((parent.depth || 0) + 1 > MAX_DEPTH) err('parent', 'TOO_DEEP', 'Too deep');
    }
    if (row.status) {
      const status = STATUSES.includes(row.status) ? row.status : Object.entries(STATUS_RU).find(([, name]) => name.toLowerCase() === row.status.toLowerCase())?.[0];
      if (!['free', 'not_for_sale'].includes(status)) err('status', 'STATUS', 'Import sets only “Свободно” or “Не в продаже”');
      else row.status = status;
    }
    if (existing && row.status && HELD.has(existing.status)) err('status', 'UNIT_HELD', 'The unit is held for a client');
    let unit = {};
    try {
      const filled = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== ''));
      unit = { ...unitCharacteristics(filled), ...unitCommercial(filled, ctx.settings.currencies) };
    } catch (e) {
      const field = IMPORT_FIELDS.find((name) => String(e.message).includes(name)) || 'value';
      err(field, e.code || 'INVALID_FIELD', e.message);
    }
    for (const [field, value] of Object.entries(unit)) if (value === null) delete unit[field];
    const sellable = existing ? Boolean(existing.status) : Boolean(type?.sellable);
    if (!sellable && Object.keys(unit).length) err('price', 'NOT_SELLABLE', 'This type is not for sale: price and areas go to its card');
    if (existing && ctx.settings.fixPriceOnBooking && unit.price !== undefined && HELD.has(existing.status) && Number(existing.price) !== unit.price) err('price', 'PRICE_FIXED', 'The price of a held unit is fixed');
    plan.push({ line, code: row.code, name: row.name, type, parent, existing, unit, status: row.status || null, depth: (parent?.depth || 0) + 1 });
  });
  const result = { ok: !errors.length, total: rows.length, created: plan.filter((item) => !item.existing).length, updated: plan.filter((item) => item.existing).length, errors: errors.slice(0, 500) };
  if (errors.length || input.dryRun) return result;

  await withTransaction(async (client) => {
    const created = new Map();
    for (const item of plan) {
      const parentNode = item.parent ? (item.parent.id ? item.parent : created.get(item.parent.code.toLowerCase())) : null;
      if (item.existing) {
        const unit = { ...item.unit };
        if (item.status) unit.status = item.status;
        if (item.name) await client.query(`UPDATE mp_nodes SET name = $2, updated_at = NOW(), updated_by = $3 WHERE id = $1`, [item.existing.id, item.name, ctx.userId]);
        const keys = Object.keys(unit);
        if (keys.length && item.existing.status) {
          await client.query(`UPDATE mp_units SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, version = version + 1, updated_by = $${keys.length + 2}, updated_at = NOW() WHERE node_id = $1`, [item.existing.id, ...keys.map((key) => unit[key]), ctx.userId]);
          if (unit.price !== undefined && Number(item.existing.price) !== unit.price) {
            await client.query(`INSERT INTO mp_price_history (unit_id, old_price, new_price, currency, reason, author_id) VALUES ($1, $2, $3, $4, 'Импорт', $5)`, [item.existing.id, item.existing.price, unit.price, unit.currency || item.existing.currency, ctx.userId]);
          }
        }
        continue;
      }
      const path = parentNode ? parentNode.path : [];
      const { rows: inserted } = await client.query(
        `INSERT INTO mp_nodes (project_id, parent_id, kind, type_id, code, name, sort, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
        [project.id, parentNode?.id || null, item.type.node_kind, item.type.id, item.code, item.name || '', item.line, ctx.userId]
      );
      const id = inserted[0].id;
      await client.query(`UPDATE mp_nodes SET path = $2::int[], depth = $3 WHERE id = $1`, [id, [...path, id], path.length + 1]);
      if (item.type.sellable) {
        const unit = { currency: project.currency, ...item.unit };
        const keys = Object.keys(unit);
        await client.query(
          `INSERT INTO mp_units (node_id, project_id, status, updated_by${keys.map((key) => `, ${key}`).join('')}) VALUES ($1, $2, $3, $4${keys.map((_, i) => `, $${i + 5}`).join('')})`,
          [id, project.id, item.status || 'free', ctx.userId, ...keys.map((key) => unit[key])]
        );
      }
      created.set(item.code.toLowerCase(), { id, path: [...path, id], depth: path.length + 1, code: item.code });
    }
    await logEvent(client, { projectId: project.id, kind: 'import', data: { created: result.created, updated: result.updated }, authorId: ctx.userId });
  });
  treeChanged(project.id);
  return result;
}
