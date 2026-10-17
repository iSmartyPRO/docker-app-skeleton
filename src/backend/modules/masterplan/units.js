import { query, withTransaction } from '../../config/database.js';
import { httpError } from '../shared/acl.js';
import { DEFAULT_TYPES, FINISHINGS, HELD, MAX_DEPTH, STATUSES, TIMED } from './constants.js';
import { requireConfigure, requireProject, visibleProjectIds } from './access.js';
import { capsOf, has, readCaps } from './rules.js';
import { NODE_SELECT, visibleNode } from './shapes.js';
import { treeChanged } from './realtime.js';
import { unitCharacteristics, unitCommercial } from './nodes.js';
import { Params, csvCell, idList, intOr, likePattern, logEvent, parseNumber, text } from './util.js';
import { looseDay, migrateLocked } from './migration.js';
import { SUPPORTED, localeOrDefault, tr } from '../../services/i18n/index.js';
import { statusName } from './messages.js';

/*
 * The registry of units (spec §9.3): filters, sorting, pages, CSV export,
 * and the Excel/CSV import with a validation report (§9.10). The browser
 * reads .xlsx files (exceljs) and sends rows as JSON; the server validates
 * every row and writes all of them in one transaction, or nothing.
 */

/**
 * Readiness as the plan shows it (inheritReadiness): a construction object's
 * own, a unit or plot inside one its nearest object's, else the node's own.
 */
const READINESS = `COALESCE((SELECT o.readiness FROM mp_nodes o JOIN mp_types ot ON ot.id = o.type_id
  WHERE o.id = ANY(n.path) AND ot.stage_set IS NOT NULL AND o.kind <> 'level' ORDER BY o.depth DESC LIMIT 1), n.readiness)`;

const STATUS_RANK_SQL = `array_position(ARRAY[${STATUSES.map((s) => `'${s}'`).join(',')}]::text[], u.status::text)`;

const SORTS = {
  code: 'LOWER(n.code)',
  name: 'LOWER(n.name)',
  price: 'u.price',
  area: 'COALESCE(u.area_total, u.area_plot)',
  plot: 'u.area_plot',
  ppm: 'u.price / NULLIF(COALESCE(u.area_total, u.area_plot), 0)',
  status: STATUS_RANK_SQL,
  floor: 'u.floor',
  bedrooms: 'u.bedrooms',
  updated: 'u.updated_at',
  readiness: READINESS,
};

/**
 * Projects (of those the person sees) where they hold `cap`: null = every
 * project. Without a project in the request the registry spans several, and
 * a capability counts only in the projects where the person has it.
 */
export function projectsWithCap(ctx, cap) {
  if (has(capsOf(ctx.globalRoles), cap)) return null;
  return [...new Set(ctx.assignments.map((item) => item.projectId))].filter((projectId) => has(readCaps(ctx, projectId), cap));
}

/**
 * WHERE conditions of the registry filter; price filters only for people who
 * see prices. `statusIn`: projects where statuses may be filtered (null = all).
 */
export function unitFilter(ctx, input, p, caps, { statusIn = null } = {}) {
  const where = ['u.node_id IS NOT NULL'];
  const ids = visibleProjectIds(ctx);
  if (ids) where.push(`n.project_id = ANY(${p.add(ids)}::int[])`);
  if (intOr(input.project)) where.push(`n.project_id = ${p.add(intOr(input.project))}`);
  if (intOr(input.node)) where.push(`n.path @> ARRAY[${p.add(intOr(input.node))}]::int[]`);
  const listed = idList(input.ids, 5000);
  if (listed.length) where.push(`n.id = ANY(${p.add(listed)}::int[])`);
  if (input.q) {
    const like = p.add(likePattern(text(input.q, 80)));
    // Also the old number (previous sales plan) and the building a unit is in («Апарт-корпус 40»).
    where.push(`(n.code ILIKE ${like} OR n.name ILIKE ${like} OR u.number ILIKE ${like} OR n.attrs->>'oldNumber' ILIKE ${like}
      OR EXISTS (SELECT 1 FROM mp_nodes b WHERE b.id = ANY(n.path) AND b.id <> n.id AND b.kind = 'object' AND (b.code ILIKE ${like} OR b.name ILIKE ${like})))`);
  }
  const statuses = String(input.status || '').split(',').filter((item) => STATUSES.includes(item));
  if (statuses.length && has(caps, 'status.view')) {
    where.push(`u.status = ANY(${p.add(statuses)}::text[])`);
    // Units of projects where the person does not see statuses never match a status filter.
    if (statusIn) where.push(`n.project_id = ANY(${p.add(statusIn)}::int[])`);
  }
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
  range('readiness', READINESS);
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
  // One project: its capabilities. Several: statuses count only where the person sees them.
  const statusIn = projectId ? null : projectsWithCap(ctx, 'status.view');
  const caps = projectId ? readCaps(ctx, projectId) : new Set(statusIn && !statusIn.length ? [] : ['status.view']);
  const p = new Params();
  const where = unitFilter(ctx, input, p, caps, { statusIn });
  const whereValues = [...p.values];
  const allowed = (key) => {
    if (key === 'price' || key === 'ppm') return has(caps, 'price.view');
    if (key === 'status') return has(caps, 'status.view');
    return true;
  };
  const sortKey = SORTS[input.sort] && allowed(input.sort) ? input.sort : 'code';
  // Sorting by status across projects ranks only the units whose status the person may see.
  const sortSql = sortKey === 'status' && statusIn ? `(CASE WHEN n.project_id = ANY(${p.add(statusIn)}::int[]) THEN ${STATUS_RANK_SQL} END)` : SORTS[sortKey];
  const order = input.order === 'desc' ? 'DESC' : 'ASC';
  const pageSize = Math.min(5000, Math.max(1, intOr(input.pageSize, 50)));
  const page = Math.max(1, intOr(input.page, 1));
  const select = NODE_SELECT.replace(/\n\s*FROM mp_nodes n\b/, `, ${READINESS} AS effective_readiness\n  FROM mp_nodes n`);
  const sql = `${select} WHERE ${where.join(' AND ')} ORDER BY ${sortSql} ${order} NULLS LAST, n.sort, n.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const [{ rows }, count] = await Promise.all([
    query(sql, p.values),
    query(`SELECT COUNT(*)::int AS n FROM mp_nodes n LEFT JOIN mp_units u ON u.node_id = n.id WHERE ${where.join(' AND ')}`, whereValues),
  ]);
  const presentation = input.presentation === '1' || input.presentation === 1;
  return {
    items: rows.map((row) => visibleNode(ctx, { ...row, readiness: row.effective_readiness ?? row.readiness }, { caps: readCaps(ctx, row.project_id), presentation })),
    total: count.rows[0].n,
    page,
    pageSize,
    sort: sortKey,
    order: order.toLowerCase(),
  };
}


/** CSV of the registry (UTF-8 BOM, `;`), only the columns the person may see. */
export async function exportCsv(ctx, input, res) {
  const { items } = await listUnits(ctx, { ...input, page: 1, pageSize: 5000 });
  const locale = localeOrDefault(input.locale);
  const cols = [
    ['code', (n) => n.code],
    ['name', (n) => n.name],
    ['type', (n) => n.type?.name],
    ['status', (n) => (n.unit?.status ? statusName(n.unit.status, locale) : '')],
    ['price', (n) => n.unit?.price],
    ['currency', (n) => n.unit?.currency],
    ['pricePerM2', (n) => n.unit?.pricePerM2],
    ['minPrice', (n) => n.unit?.minPrice],
    ['areaTotal', (n) => n.unit?.areaTotal],
    ['areaPlot', (n) => n.unit?.areaPlot],
    ['rooms', (n) => n.unit?.rooms],
    ['bedrooms', (n) => n.unit?.bedrooms],
    ['floor', (n) => n.unit?.floor],
    ['number', (n) => n.unit?.number],
    ['finishing', (n) => n.unit?.finishing],
    ['readiness', (n) => n.readiness],
    ['manager', (n) => n.unit?.manager?.name],
    ['client', (n) => n.unit?.client?.name],
    ['deal', (n) => (n.unit?.deal ? [`#${n.unit.deal.id}`, n.unit.deal.title].filter(Boolean).join(' ') : '')],
  ].filter(([, get]) => items.some((item) => get(item) !== undefined && get(item) !== null && get(item) !== ''));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="masterplan-units.csv"`);
  const lines = [cols.map(([key]) => csvCell(tr(locale, `masterplan.csv.${key}`))).join(';'), ...items.map((item) => cols.map(([, get]) => csvCell(get(item))).join(';'))];
  res.send(`﻿${lines.join('\r\n')}\r\n`);
}

// ── Import ──────────────────────────────────────────────────────────────────

const IMPORT_FIELDS = ['code', 'name', 'type', 'parent', 'status', 'price', 'currency', 'minPrice', 'discountPct', 'areaTotal', 'areaLiving', 'areaPlot', 'areaTerrace', 'rooms', 'bedrooms', 'bathrooms', 'levels', 'ceiling', 'floor', 'number', 'riser', 'finishing'];
/** Columns of a status migration (a held status with its client, manager, date, contract, timer end). */
const MIGRATION_FIELDS = ['client', 'manager', 'statusDate', 'contractNumber', 'contractDate', 'contractAmount', 'bookingUntil'];

/**
 * Validates and (unless dryRun) writes rows: { projectId, rows: [{ code, name, type, parent, … }], dryRun }.
 * `type` is a type key or name; `parent` the code of a node in the project or
 * of an earlier row. Existing codes are updated (characteristics, price with
 * history), new ones created. → { ok, created, updated, errors: [{ row, field, code, message }] }
 *
 * Status migration: a row with a held status (reserve … handed) and the
 * columns client, manager, statusDate, contractNumber, contractDate,
 * contractAmount, bookingUntil moves the unit to that status bypassing the
 * chain, the CRM deal and the timers (migration.js) — `reason` (one for the
 * whole file) is then required. Only Masterplan administrators import.
 */
export async function importUnits(ctx, input = {}) {
  const project = await requireProject(ctx, input.projectId);
  requireConfigure(ctx, project.id);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) throw httpError(400, 'The file has no rows', 'EMPTY');
  if (rows.length > 5000) throw httpError(400, 'At most 5000 rows at once', 'BULK_LIMIT');
  if (input.dryRun) return (await validateImport(ctx, project, rows, { query }, input)).result;

  let out = null;
  const written = await withTransaction(async (client) => {
    // Validated again under the units' locks: a unit reserved or repriced since the
    // dry run (or during the write) is not overwritten.
    await client.query(`SELECT node_id FROM mp_units WHERE project_id = $1 ORDER BY node_id FOR UPDATE`, [project.id]);
    out = await validateImport(ctx, project, rows, client, input);
    if (!out.result.ok) return false;
    await writeImport(client, ctx, project, out.plan, out.result);
    return true;
  });
  if (written) treeChanged(project.id);
  return out.result;
}

/** Checks every row against the project's nodes → { result, plan }. */
async function validateImport(ctx, project, rows, client = { query }, input = {}) {
  const [{ rows: types }, { rows: nodes }] = await Promise.all([
    client.query(`SELECT * FROM mp_types WHERE archived_at IS NULL`),
    client.query(`SELECT n.id, n.code, n.path, n.depth, n.kind, n.type_id, u.status, u.price, u.currency FROM mp_nodes n LEFT JOIN mp_units u ON u.node_id = n.id WHERE n.project_id = $1`, [project.id]),
  ]);
  const typeBy = (value) => {
    const key = String(value || '').trim().toLowerCase();
    // Its key, its name, or a stock type's name in any portal language.
    const stock = DEFAULT_TYPES.find((type) => Object.values(type.name).some((name) => name.toLowerCase() === key));
    return types.find((type) => type.key === key || type.name.toLowerCase() === key) || (stock && types.find((type) => type.key === stock.key)) || null;
  };
  const byCode = new Map(nodes.filter((node) => node.code).map((node) => [node.code.toLowerCase(), node]));
  const managerNames = rows.some((raw) => String(raw?.manager ?? '').trim())
    ? (await client.query(`SELECT id, username, COALESCE(display_name, username) AS name FROM users WHERE is_active IS NOT FALSE`)).rows
    : [];
  const managerBy = (value) => {
    const key = String(value).trim().toLowerCase();
    return managerNames.find((user) => user.username.toLowerCase() === key || user.name.toLowerCase() === key) || null;
  };
  const errors = [];
  const plan = [];
  const seen = new Map();
  rows.forEach((raw, index) => {
    const line = index + 1;
    const err = (field, code, message) => errors.push({ row: line, field, code, message });
    const row = Object.fromEntries([...IMPORT_FIELDS, ...MIGRATION_FIELDS].map((key) => [key, raw?.[key] === undefined || raw?.[key] === null ? '' : String(raw[key]).trim()]));
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
    let migration = null;
    if (row.status) {
      // A status key, or its name in any portal language («Свободно», «Available»…).
      const status = STATUSES.includes(row.status) ? row.status : STATUSES.find((key) => SUPPORTED.some((lang) => statusName(key, lang).toLowerCase() === row.status.toLowerCase()));
      if (!status) err('status', 'STATUS', `Unknown status “${row.status}”`);
      else row.status = status;
      // A held status is a migration; so is the unit's own held status repeated with new client / contract data.
      if (status && HELD.has(status)) migration = { to: status };
    }
    if (!migration && existing && row.status && HELD.has(existing.status)) err('status', 'UNIT_HELD', 'The unit is held for a client');
    if (!migration && MIGRATION_FIELDS.some((key) => row[key])) err(MIGRATION_FIELDS.find((key) => row[key]), 'MIGRATION_STATUS', 'Client, manager and contract columns need a held status (reserve … handed)');
    if (migration) {
      for (const key of ['statusDate', 'contractDate', 'bookingUntil']) {
        const day = looseDay(row[key]);
        if (day === false) err(key, 'INVALID_DATE', `Invalid date “${row[key]}”`);
        else migration[key] = day;
      }
      const amount = parseNumber(row.contractAmount);
      if (Number.isNaN(amount) || (amount !== null && amount < 0)) err('contractAmount', 'INVALID_FIELD', 'Invalid amount');
      let manager = null;
      if (row.manager) {
        manager = managerBy(row.manager);
        if (!manager) err('manager', 'UNKNOWN_MANAGER', `No portal user “${row.manager}”`);
      }
      if (migration.bookingUntil && TIMED.has(migration.to) && migration.bookingUntil < new Date().toISOString().slice(0, 10)) err('bookingUntil', 'ENDS_IN_PAST', 'The end of the reserve / booking is in the past');
      if (!text(input.reason, 300)) err('status', 'REASON_REQUIRED', 'A migration of statuses needs a reason (the field above the file)');
      migration = {
        to: migration.to,
        reason: text(input.reason, 300),
        date: migration.statusDate || null,
        clientName: text(row.client, 200) || null,
        managerId: manager?.id || null,
        deal: null,
        endsAt: TIMED.has(migration.to) ? migration.bookingUntil || null : null,
        contractNumber: text(row.contractNumber, 60) || null,
        contractDate: migration.contractDate || null,
        contractAmount: Number.isNaN(amount) ? null : amount,
        paidAmount: null,
        actDate: null,
        source: 'import',
      };
    }
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
    if (!sellable && migration) err('status', 'NOT_SELLABLE', 'This type is not for sale');
    if (existing && ctx.settings.fixPriceOnBooking && unit.price !== undefined && HELD.has(existing.status) && Number(existing.price) !== unit.price) err('price', 'PRICE_FIXED', 'The price of a held unit is fixed');
    plan.push({ line, code: row.code, name: row.name, type, parent, existing, unit, status: migration ? null : row.status || null, migration, depth: (parent?.depth || 0) + 1 });
  });
  const result = { ok: !errors.length, total: rows.length, created: plan.filter((item) => !item.existing).length, updated: plan.filter((item) => item.existing).length, migrated: plan.filter((item) => item.migration).length, errors: errors.slice(0, 500) };
  return { result, plan };
}

async function writeImport(client, ctx, project, plan, result) {
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
      if (item.migration) await migrateImported(client, ctx, { id: item.existing.id, project_id: project.id }, item.migration);
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
    if (item.type.sellable && item.migration) await migrateImported(client, ctx, { id, project_id: project.id }, item.migration);
    created.set(item.code.toLowerCase(), { id, path: [...path, id], depth: path.length + 1, code: item.code });
  }
  await logEvent(client, { projectId: project.id, kind: 'import', data: { created: result.created, updated: result.updated, migrated: result.migrated || undefined }, authorId: ctx.userId });
}

/** A migration row of the import, on the unit row already locked by the import. */
async function migrateImported(client, ctx, node, migration) {
  const { rows } = await client.query(`SELECT * FROM mp_units WHERE node_id = $1 FOR UPDATE`, [node.id]);
  await migrateLocked(client, ctx, node, rows[0], migration);
}
