import { query, withTransaction } from '../../config/database.js';
import { httpError } from '../shared/acl.js';
import { FINISHINGS, HELD, MAX_DEPTH, NODE_KINDS, PAYMENT_FORMS } from './constants.js';
import { canConfigure, forbidden, notFound, requireConfigure, requireNode, requireProject } from './access.js';
import { actCaps, apartmentGrid, bulkCodes, checkExtend, has, nextStatuses, priceCutAllowed, readCaps, rolesAt } from './rules.js';
import { inheritReadiness, loadNodeRow, loadNodes, NODE_SELECT, visibleNode } from './shapes.js';
import { projectSettings } from './projects.js';
import { treeChanged, unitsChanged } from './realtime.js';
import { nodeStages, recentReports } from './construction.js';
import { mediaShape } from './media.js';
import { dayString, intOr, iso, logEvent, money, parseDay, parseNumber, text, usersById } from './util.js';

/*
 * The hierarchy tree (spec §4): levels, plots, construction objects and
 * units. `path` holds the ancestors' ids and the node's own; `depth` is its
 * length (≤ 8). Sellable types get a sales row (mp_units).
 */

async function typeOf(typeId, client = { query }) {
  if (!typeId) return null;
  const { rows } = await client.query(`SELECT * FROM mp_types WHERE id = $1 AND archived_at IS NULL`, [typeId]);
  if (!rows[0]) throw httpError(400, 'Unknown object type', 'INVALID_TYPE');
  return rows[0];
}

/** Kind and type must agree; levels have a level key and no type. */
function checkKind(kind, type, levelKey, project) {
  if (!NODE_KINDS.includes(kind)) throw httpError(400, 'Unknown kind', 'INVALID_KIND');
  if (kind === 'level') {
    const levels = projectSettings(project.settings).levels.map((item) => item.key);
    if (!levels.includes(levelKey)) throw httpError(400, 'Unknown level type', 'INVALID_LEVEL');
    return;
  }
  if (!type) throw httpError(400, 'Choose an object type', 'TYPE_REQUIRED');
  if (type.node_kind !== kind) throw httpError(400, 'The type does not fit this kind of object', 'INVALID_TYPE');
}

const UNIT_NUMBERS = {
  areaTotal: ['area_total', 0, 1e7],
  areaLiving: ['area_living', 0, 1e7],
  areaPlot: ['area_plot', 0, 1e9],
  areaTerrace: ['area_terrace', 0, 1e7],
  ceiling: ['ceiling', 0, 99],
};
const UNIT_INTS = { rooms: ['rooms', 0, 100], bedrooms: ['bedrooms', 0, 100], bathrooms: ['bathrooms', 0, 100], levels: ['levels', 0, 200], floor: ['floor', -20, 400], riser: ['riser', 0, 500] };

/** Characteristics of a unit (unit.edit): input camelCase → { column: value }. */
export function unitCharacteristics(input = {}) {
  const out = {};
  for (const [key, [column, min, max]] of Object.entries({ ...UNIT_NUMBERS, ...UNIT_INTS })) {
    if (input[key] === undefined) continue;
    const n = parseNumber(input[key]);
    if (Number.isNaN(n) || (n !== null && (n < min || n > max)) || (n !== null && UNIT_INTS[key] && !Number.isInteger(n))) throw httpError(400, `Invalid value: ${key}`, 'INVALID_FIELD', { field: key });
    out[column] = n;
  }
  if (input.number !== undefined) out.number = text(input.number, 20) || null;
  if (input.finishing !== undefined) {
    if (input.finishing && !FINISHINGS.includes(input.finishing)) throw httpError(400, 'Unknown finishing', 'INVALID_FIELD');
    out.finishing = input.finishing || null;
  }
  if (input.paymentForms !== undefined) out.payment_forms = (Array.isArray(input.paymentForms) ? input.paymentForms : []).filter((item) => PAYMENT_FORMS.includes(item));
  if (input.noPublish !== undefined) out.no_publish = input.noPublish === true;
  return out;
}

/** Commercial fields (price.edit): price, currency, discount, minimum price. */
export function unitCommercial(input = {}, currencies = []) {
  const out = {};
  for (const [key, column] of [['price', 'price'], ['minPrice', 'min_price']]) {
    if (input[key] === undefined) continue;
    const n = parseNumber(input[key]);
    if (Number.isNaN(n) || (n !== null && (n < 0 || n > 1e15))) throw httpError(400, `Invalid value: ${key}`, 'INVALID_FIELD');
    out[column] = n === null ? null : Math.round(n * 100) / 100;
  }
  if (input.discountPct !== undefined) {
    const n = parseNumber(input.discountPct);
    if (Number.isNaN(n) || (n !== null && (n < 0 || n > 100))) throw httpError(400, 'Invalid discount', 'INVALID_FIELD');
    out.discount_pct = n;
  }
  if (input.currency !== undefined) {
    const code = String(input.currency || '').toUpperCase();
    if (!currencies.includes(code)) throw httpError(400, 'Unknown currency', 'INVALID_FIELD');
    out.currency = code;
  }
  return out;
}

/** Free attributes of a node (material, view, cadastral number…): flat, small values. */
export function cleanAttrs(input, current = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return current;
  const next = { ...current };
  for (const [rawKey, value] of Object.entries(input).slice(0, 60)) {
    const key = String(rawKey).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
    if (!key) continue;
    if (value === null || value === '') delete next[key];
    else if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
    else if (typeof value === 'boolean') next[key] = value;
    else if (Array.isArray(value)) next[key] = value.slice(0, 30).map((item) => text(item, 80)).filter(Boolean);
    else next[key] = text(value, 1000);
  }
  if (Object.keys(next).length > 80) throw httpError(400, 'Too many attributes', 'INVALID_FIELD');
  return next;
}

function nodeFields(input) {
  const out = {};
  if (input.code !== undefined) out.code = text(input.code, 60);
  if (input.name !== undefined) out.name = text(input.name, 200);
  if (input.description !== undefined) out.description = text(input.description, 10000) || null;
  if (input.area !== undefined) {
    const n = parseNumber(input.area);
    if (Number.isNaN(n) || (n !== null && n < 0)) throw httpError(400, 'Invalid area', 'INVALID_FIELD');
    out.area = n;
  }
  if (input.sort !== undefined && Number.isFinite(Number(input.sort))) out.sort = Number(input.sort);
  for (const [key, column] of [['buildUserId', 'build_user_id'], ['salesUserId', 'sales_user_id']]) if (input[key] !== undefined) out[column] = intOr(input[key]) || null;
  return out;
}

function buildFields(input) {
  const out = {};
  if (input.contractor !== undefined) out.contractor = text(input.contractor, 200) || null;
  if (input.planStart !== undefined) out.plan_start = parseDay(input.planStart, 'planStart');
  if (input.planEnd !== undefined) out.plan_end = parseDay(input.planEnd, 'planEnd');
  if (input.handover !== undefined) {
    if (input.handover && !FINISHINGS.includes(input.handover)) throw httpError(400, 'Unknown handover option', 'INVALID_FIELD');
    out.handover = input.handover || null;
  }
  return out;
}

async function codeFree(client, projectId, code, exceptId = 0) {
  if (!code) return true;
  const { rows } = await client.query(`SELECT 1 FROM mp_nodes WHERE project_id = $1 AND LOWER(code) = LOWER($2) AND id <> $3`, [projectId, code, exceptId]);
  return !rows.length;
}

async function nextSort(client, projectId, parentId) {
  const { rows } = await client.query(`SELECT COALESCE(MAX(sort), 0) AS s FROM mp_nodes WHERE project_id = $1 AND parent_id IS NOT DISTINCT FROM $2`, [projectId, parentId]);
  return Number(rows[0].s) + 1;
}

/** Inserts one node (and its sales row when the type is sellable) inside a transaction. */
async function insertNode(client, ctx, project, parent, { kind, levelKey, type, fields, unit }) {
  const path = parent ? [...parent.path] : [];
  if (path.length + 1 > MAX_DEPTH) throw httpError(400, `The tree is at most ${MAX_DEPTH} levels deep`, 'TOO_DEEP');
  if (fields.code && !(await codeFree(client, project.id, fields.code))) throw httpError(409, `Code ${fields.code} is taken`, 'CODE_TAKEN');
  const sort = fields.sort ?? (await nextSort(client, project.id, parent?.id || null));
  const cols = { ...fields, sort };
  const keys = Object.keys(cols);
  const { rows } = await client.query(
    `INSERT INTO mp_nodes (project_id, parent_id, kind, level_key, type_id, created_by, updated_by${keys.map((key) => `, ${key}`).join('')})
     VALUES ($1, $2, $3, $4, $5, $6, $6${keys.map((_, i) => `, $${i + 7}`).join('')}) RETURNING id`,
    [project.id, parent?.id || null, kind, kind === 'level' ? levelKey : null, type?.id || null, ctx.userId, ...keys.map((key) => cols[key])]
  );
  const id = rows[0].id;
  await client.query(`UPDATE mp_nodes SET path = $2::int[], depth = $3 WHERE id = $1`, [id, [...path, id], path.length + 1]);
  if (type?.sellable) {
    const { status = 'free', ...rest } = unit || {};
    const u = { currency: project.currency, ...rest };
    const ukeys = Object.keys(u);
    await client.query(
      `INSERT INTO mp_units (node_id, project_id, status, updated_by${ukeys.map((key) => `, ${key}`).join('')})
       VALUES ($1, $2, $3, $4${ukeys.map((_, i) => `, $${i + 5}`).join('')})`,
      [id, project.id, status, ctx.userId, ...ukeys.map((key) => u[key])]
    );
  }
  return id;
}

async function parentOf(client, project, parentId) {
  if (!parentId) return null;
  const { rows } = await client.query(`SELECT * FROM mp_nodes WHERE id = $1 AND project_id = $2`, [parentId, project.id]);
  if (!rows[0]) throw httpError(400, 'Unknown parent', 'INVALID_PARENT');
  return rows[0];
}

function initialUnit(input, settings) {
  const u = { ...unitCharacteristics(input.unit || {}), ...unitCommercial(input.unit || {}, settings.currencies) };
  if (input.unit?.status === 'not_for_sale') u.status = 'not_for_sale';
  return u;
}

export async function createNode(ctx, input) {
  const project = await requireProject(ctx, input.projectId);
  requireConfigure(ctx, project.id);
  const id = await withTransaction(async (client) => {
    const parent = await parentOf(client, project, intOr(input.parentId));
    const type = await typeOf(intOr(input.typeId), client);
    checkKind(input.kind, type, input.levelKey, project);
    const fields = { ...nodeFields(input), ...buildFields(input) };
    if (input.attrs) fields.attrs = JSON.stringify(cleanAttrs(input.attrs));
    if (!fields.code && !fields.name) throw httpError(400, 'Give the object a code or a name', 'NAME_REQUIRED');
    const nodeId = await insertNode(client, ctx, project, parent, { kind: input.kind, levelKey: input.levelKey, type, fields, unit: initialUnit(input, ctx.settings) });
    await logEvent(client, { projectId: project.id, nodeId, kind: 'created', data: { code: fields.code, name: fields.name, kind: input.kind }, authorId: ctx.userId });
    return nodeId;
  });
  treeChanged(project.id);
  return getNode(ctx, id);
}

/**
 * Bulk creation (§4.2): a line of plots "A-1-01 … A-1-15" (`codes`), or the
 * apartments of a section, floors × per floor (`grid`). Name templates may use
 * {code} and {n}. Returns the created ids.
 */
export async function bulkCreate(ctx, input) {
  const project = await requireProject(ctx, input.projectId);
  requireConfigure(ctx, project.id);
  const ids = await withTransaction(async (client) => {
    const parent = await parentOf(client, project, intOr(input.parentId));
    const type = await typeOf(intOr(input.typeId), client);
    checkKind(input.kind, type, input.levelKey, project);
    const unit = initialUnit(input, ctx.settings);
    const template = text(input.nameTemplate, 120);
    let items;
    if (input.grid) {
      const prefix = text(input.prefix, 40);
      items = apartmentGrid(input.grid).map((cell) => ({ code: `${prefix}${cell.number}`, n: cell.number, unit: { ...unit, floor: cell.floor, riser: cell.riser, number: cell.number } }));
    } else {
      items = bulkCodes({ prefix: text(input.prefix, 40), from: input.from, count: input.count, pad: input.pad, suffix: text(input.suffix, 20) }).map((code, index) => ({ code, n: Number(input.from || 1) + index, unit }));
    }
    if (!items.length) throw httpError(400, 'Nothing to create', 'EMPTY');
    if (items.length > 2000) throw httpError(400, 'At most 2000 objects at once', 'BULK_LIMIT');
    const taken = await client.query(`SELECT code FROM mp_nodes WHERE project_id = $1 AND LOWER(code) = ANY($2::text[])`, [project.id, items.map((item) => item.code.toLowerCase())]);
    if (taken.rows.length) throw httpError(409, `Codes are taken: ${taken.rows.slice(0, 5).map((row) => row.code).join(', ')}`, 'CODE_TAKEN');
    const out = [];
    let sort = await nextSort(client, project.id, parent?.id || null);
    for (const item of items) {
      const name = template ? template.replace(/\{code\}/g, item.code).replace(/\{n\}/g, String(item.n)) : '';
      out.push(await insertNode(client, ctx, project, parent, { kind: input.kind, levelKey: input.levelKey, type, fields: { code: item.code, name, sort: sort++ }, unit: item.unit }));
    }
    await logEvent(client, { projectId: project.id, nodeId: parent?.id || null, kind: 'bulk', data: { count: out.length, from: items[0].code, to: items[items.length - 1].code }, authorId: ctx.userId });
    return out;
  });
  treeChanged(project.id);
  return { ids, count: ids.length };
}

async function priceGuard(ctx, node, unitRow, changes) {
  if (changes.price === undefined || changes.price === Number(unitRow.price)) return;
  if (ctx.settings.fixPriceOnBooking && HELD.has(unitRow.status)) throw httpError(409, 'The price of a unit held for a client is fixed', 'PRICE_FIXED');
  if (!priceCutAllowed(Number(unitRow.price) || 0, changes.price ?? 0, actCaps(ctx, node), ctx.settings.salesHeadMaxCutPct)) {
    throw httpError(403, `A price cut over ${ctx.settings.salesHeadMaxCutPct}% needs management`, 'PRICE_LIMIT');
  }
}

/**
 * Changes a node. Each group of fields needs its own right (rules.js):
 * structure — configure; characteristics — unit.edit; price — price.edit;
 * construction details — build.edit. Sales fields take `version`
 * (409 VERSION_CONFLICT when stale).
 */
export async function updateNode(ctx, id, input) {
  const node = await requireNode(ctx, id);
  const caps = actCaps(ctx, node);
  const structural = { ...nodeFields(input) };
  const build = buildFields(input);
  const characteristics = unitCharacteristics(input.unit || {});
  const commercial = unitCommercial(input.unit || {}, ctx.settings.currencies);
  const configure = canConfigure(ctx, node.project_id) || rolesAt(ctx, node).has('admin');
  if (Object.keys(structural).length && !configure) throw forbidden();
  if (Object.keys(build).length && !(configure || has(caps, 'build.edit'))) throw forbidden();
  if (input.attrs !== undefined && !(configure || has(caps, 'unit.edit') || has(caps, 'build.edit'))) throw forbidden();
  if (Object.keys(characteristics).length && !(configure || has(caps, 'unit.edit'))) throw forbidden();
  if (Object.keys(commercial).length && !has(caps, 'price.edit')) throw forbidden();
  if (input.typeId !== undefined && !configure) throw forbidden();

  const changes = [];
  await withTransaction(async (client) => {
    const { rows: locked } = await client.query(`SELECT * FROM mp_nodes WHERE id = $1 FOR UPDATE`, [node.id]);
    const current = locked[0];
    if (structural.code !== undefined && structural.code !== current.code && !(await codeFree(client, node.project_id, structural.code, node.id))) throw httpError(409, `Code ${structural.code} is taken`, 'CODE_TAKEN');
    const fields = { ...structural, ...build };
    if (input.attrs !== undefined) fields.attrs = JSON.stringify(cleanAttrs(input.attrs, current.attrs || {}));
    if (input.typeId !== undefined && intOr(input.typeId) !== current.type_id) {
      const type = await typeOf(intOr(input.typeId), client);
      if (!type || type.node_kind !== current.kind) throw httpError(400, 'The type does not fit this kind of object', 'INVALID_TYPE');
      const { rows: unitRows } = await client.query(`SELECT status FROM mp_units WHERE node_id = $1`, [node.id]);
      if (unitRows[0] && !type.sellable) {
        if (HELD.has(unitRows[0].status)) throw httpError(409, 'The unit is held for a client', 'UNIT_HELD');
        await client.query(`DELETE FROM mp_units WHERE node_id = $1`, [node.id]);
      } else if (!unitRows[0] && type.sellable) {
        const { rows: project } = await client.query(`SELECT currency FROM mp_projects WHERE id = $1`, [node.project_id]);
        await client.query(`INSERT INTO mp_units (node_id, project_id, currency, updated_by) VALUES ($1, $2, $3, $4)`, [node.id, node.project_id, project[0].currency, ctx.userId]);
      }
      fields.type_id = type.id;
      changes.push({ field: 'type', from: current.type_id, to: type.id });
    }
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'attrs' || key === 'type_id') continue;
      const before = current[key] instanceof Date ? dayString(current[key]) : current[key];
      const norm = (v) => (v === null || v === undefined ? null : typeof v === 'number' ? v : String(v));
      if (norm(before) !== norm(value) && !(typeof value === 'number' && Number(before) === value)) changes.push({ field: key, from: before ?? null, to: value ?? null });
    }
    if (input.attrs !== undefined) changes.push({ field: 'attrs' });
    const keys = Object.keys(fields);
    if (keys.length) {
      await client.query(`UPDATE mp_nodes SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_by = $${keys.length + 2}, updated_at = NOW() WHERE id = $1`, [node.id, ...keys.map((key) => fields[key]), ctx.userId]);
    }

    const unitPatch = { ...characteristics, ...commercial };
    const ukeys = Object.keys(unitPatch);
    if (ukeys.length) {
      const { rows: unitRows } = await client.query(`SELECT * FROM mp_units WHERE node_id = $1 FOR UPDATE`, [node.id]);
      const unitRow = unitRows[0];
      if (!unitRow) throw httpError(400, 'This object is not for sale', 'NOT_SELLABLE');
      if (input.version !== undefined && Number(input.version) !== unitRow.version) throw versionConflict(node.id);
      await priceGuard(ctx, node, unitRow, { price: commercial.price });
      const { rows: updated } = await client.query(
        `UPDATE mp_units SET ${ukeys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, version = version + 1, updated_by = $${ukeys.length + 2}, updated_at = NOW() WHERE node_id = $1 RETURNING *`,
        [node.id, ...ukeys.map((key) => unitPatch[key]), ctx.userId]
      );
      if (commercial.price !== undefined && Number(unitRow.price) !== commercial.price) {
        await client.query(`INSERT INTO mp_price_history (unit_id, old_price, new_price, currency, reason, author_id) VALUES ($1, $2, $3, $4, $5, $6)`, [
          node.id,
          unitRow.price,
          commercial.price,
          updated[0].currency,
          text(input.reason, 300) || null,
          ctx.userId,
        ]);
        await logEvent(client, { projectId: node.project_id, nodeId: node.id, kind: 'price', data: { from: money(unitRow.price), to: commercial.price, currency: (updated[0].currency || '').trim(), reason: text(input.reason, 300) || null }, authorId: ctx.userId });
      }
      for (const key of ukeys) {
        if (key === 'price') continue;
        const before = unitRow[key];
        const after = unitPatch[key];
        if (JSON.stringify(before === null ? null : typeof after === 'number' ? Number(before) : before) !== JSON.stringify(after)) changes.push({ field: key, from: key === 'min_price' ? undefined : before, to: key === 'min_price' ? undefined : after, sensitive: key === 'min_price' || undefined });
      }
    }
    if (changes.length) await logEvent(client, { projectId: node.project_id, nodeId: node.id, kind: 'fields', data: { changes }, authorId: ctx.userId });
  });
  if (Object.keys(structural).length || input.typeId !== undefined) treeChanged(node.project_id);
  else unitsChanged(node.project_id, [node.id]);
  return getNode(ctx, node.id);
}


export function versionConflict(nodeId) {
  const error = httpError(409, 'The unit was changed by someone else', 'VERSION_CONFLICT');
  error.nodeId = nodeId;
  return error;
}

/** Moves a node (and its subtree) under another parent of the same project (§4.2, administrators). */
export async function moveNode(ctx, id, input) {
  const node = await requireNode(ctx, id);
  requireConfigure(ctx, node.project_id);
  const parentId = intOr(input.parentId) || null;
  await withTransaction(async (client) => {
    let parentPath = [];
    if (parentId) {
      const { rows } = await client.query(`SELECT * FROM mp_nodes WHERE id = $1 AND project_id = $2`, [parentId, node.project_id]);
      if (!rows[0]) throw httpError(400, 'Unknown parent', 'INVALID_PARENT');
      if (rows[0].path.includes(node.id)) throw httpError(400, 'A node cannot move into itself', 'INVALID_PARENT');
      parentPath = rows[0].path;
    }
    const { rows: deepest } = await client.query(`SELECT MAX(depth) AS d FROM mp_nodes WHERE path @> ARRAY[$1]::int[]`, [node.id]);
    const below = Number(deepest[0].d) - node.depth;
    if (parentPath.length + 1 + below > MAX_DEPTH) throw httpError(400, `The tree is at most ${MAX_DEPTH} levels deep`, 'TOO_DEEP');
    const oldPrefix = node.depth - 1;
    // Every node of the subtree: new ancestors + the part of its path from the moved node down.
    await client.query(
      `UPDATE mp_nodes SET path = $2::int[] || path[$3:array_length(path, 1)], depth = cardinality($2::int[]) + array_length(path, 1) - $3 + 1, updated_at = NOW()
       WHERE path @> ARRAY[$1]::int[]`,
      [node.id, parentPath, oldPrefix + 1]
    );
    const sort = input.sort !== undefined && Number.isFinite(Number(input.sort)) ? Number(input.sort) : await nextSort(client, node.project_id, parentId);
    await client.query(`UPDATE mp_nodes SET parent_id = $2, sort = $3 WHERE id = $1`, [node.id, parentId, sort]);
    await logEvent(client, { projectId: node.project_id, nodeId: node.id, kind: 'moved', data: { from: node.parent_id, to: parentId }, authorId: ctx.userId });
  });
  treeChanged(node.project_id);
  return getNode(ctx, node.id);
}

/** Deletes a node with its subtree, unless something in it is held for a client. */
export async function deleteNode(ctx, id) {
  const node = await requireNode(ctx, id);
  requireConfigure(ctx, node.project_id);
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id WHERE n.path @> ARRAY[$1]::int[] AND u.status NOT IN ('free', 'not_for_sale')`,
    [node.id]
  );
  if (rows[0].n) throw httpError(409, 'Units here are held for clients', 'NODE_HAS_SALES');
  await withTransaction(async (client) => {
    await logEvent(client, { projectId: node.project_id, nodeId: null, kind: 'deleted', data: { id: node.id, code: node.code, name: node.name }, authorId: ctx.userId });
    await client.query(`DELETE FROM mp_nodes WHERE id = $1`, [node.id]);
  });
  treeChanged(node.project_id);
}

// ── Card ────────────────────────────────────────────────────────────────────

export async function getNode(ctx, id, { presentation = false } = {}) {
  await requireNode(ctx, id);
  const row = await loadNodeRow(id);
  if (!row) throw notFound('Object not found');
  return visibleNode(ctx, row, { presentation });
}

/**
 * Everything the side card shows (§9.4–9.5): the node, breadcrumbs, the
 * summary below it, construction stages and reports, media, price history,
 * and what the person may do here.
 */
export async function nodeCard(ctx, id, { presentation = false } = {}) {
  const base = await requireNode(ctx, id);
  const caps = readCaps(ctx, base.project_id);
  const act = actCaps(ctx, base);
  const ancestors = await loadNodes(base.path);
  const byId = new Map(ancestors.map((row) => [row.id, visibleNode(ctx, row, { presentation, caps })]));
  const chain = inheritReadiness(base.path.map((nodeId) => byId.get(nodeId)).filter(Boolean));
  const node = chain[chain.length - 1];
  if (node.kind === 'level') {
    const sub = await query(
      `SELECT n.id, n.kind, n.area, n.readiness, t.stage_set FROM mp_nodes n LEFT JOIN mp_types t ON t.id = n.type_id WHERE n.path @> ARRAY[$1]::int[] AND n.id <> $1 AND t.stage_set IS NOT NULL AND n.kind <> 'level'`,
      [base.id]
    );
    let w = 0;
    let v = 0;
    for (const item of sub.rows) {
      const weight = Number(item.area) || 1;
      w += weight;
      v += weight * Number(item.readiness || 0);
    }
    if (w) node.readiness = Math.round((v / w) * 10) / 10;
  }
  const summary = await subtreeSummary(ctx, base, caps);
  const stageOwner = base.stage_set ? base : chain.slice(0, -1).reverse().find((item) => item.type?.stageSet && item.kind !== 'level');
  const stages = has(caps, 'build.view') && stageOwner ? await nodeStages(ctx, stageOwner.id ?? stageOwner) : null;
  const [reports, media, prices] = await Promise.all([
    has(caps, 'build.view') ? recentReports(ctx, base, { limit: 8 }) : [],
    query(`SELECT * FROM mp_media WHERE node_id = $1 AND report_id IS NULL ORDER BY id DESC LIMIT 60`, [base.id]),
    node.unit && has(caps, 'price.view') && !presentation
      ? query(`SELECT h.*, COALESCE(u.display_name, u.username) AS author FROM mp_price_history h LEFT JOIN users u ON u.id = h.author_id WHERE h.unit_id = $1 ORDER BY h.id DESC LIMIT 50`, [base.id])
      : { rows: [] },
  ]);
  const users = await usersById([base.build_user_id, base.sales_user_id]);
  const { rows: unitRows } = await query(`SELECT status, manager_id, deal_id FROM mp_units WHERE node_id = $1`, [base.id]);
  const unitFacts = unitRows[0] ? { status: unitRows[0].status, managerId: unitRows[0].manager_id, dealId: unitRows[0].deal_id } : null;
  const booking = unitFacts && ['reserve', 'booking'].includes(unitFacts.status) ? (await query(`SELECT * FROM mp_bookings WHERE unit_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1`, [base.id])).rows[0] : null;
  return {
    node,
    breadcrumbs: chain.slice(0, -1).map((item) => ({ id: item.id, code: item.code, name: item.name, kind: item.kind, levelKey: item.levelKey })),
    summary,
    stages: stages ? { ownerId: stageOwner.id, inherited: stageOwner.id !== base.id, ...stages } : null,
    reports,
    media: media.rows.map(mediaShape),
    priceHistory: prices.rows.map((row) => ({ id: row.id, from: money(row.old_price), to: money(row.new_price), currency: (row.currency || '').trim(), reason: row.reason, author: row.author, createdAt: iso(row.created_at) })),
    caps: presentation ? [] : [...act],
    responsible: presentation ? null : { build: users.get(base.build_user_id) || null, sales: users.get(base.sales_user_id) || null },
    actions: presentation
      ? {}
      : {
          next: unitFacts ? nextStatuses({ unit: unitFacts, caps: act, userId: ctx.userId }) : [],
          extend: unitFacts ? checkExtend({ unit: unitFacts, booking: booking ? { extensions: booking.extensions } : null, caps: act, userId: ctx.userId, managerExtensions: ctx.settings.managerExtensions }).ok === true : false,
          editUnit: Boolean(node.unit) && (has(act, 'unit.edit') || ctx.isAdmin),
          editPrice: Boolean(node.unit) && has(act, 'price.edit'),
          editBuild: has(act, 'build.edit'),
          report: has(act, 'build.edit'),
          media: has(act, 'media.edit') || has(act, 'build.edit') || ctx.isAdmin,
          configure: canConfigure(ctx, base.project_id),
        },
  };
}

/** Units below a node by status (count, area, sum per currency) — what the viewer may see. */
export async function subtreeSummary(ctx, node, caps) {
  if (!has(caps, 'status.view')) return null;
  const { rows } = await query(
    `SELECT u.status, COUNT(*)::int AS n, COALESCE(SUM(COALESCE(u.area_total, u.area_plot)), 0) AS area, u.currency, COALESCE(SUM(u.price), 0) AS sum
     FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id WHERE n.path @> ARRAY[$1]::int[] GROUP BY u.status, u.currency`,
    [node.id]
  );
  const out = { total: 0, byStatus: {}, area: {}, sum: {} };
  for (const row of rows) {
    out.total += row.n;
    out.byStatus[row.status] = (out.byStatus[row.status] || 0) + row.n;
    out.area[row.status] = Math.round(((out.area[row.status] || 0) + Number(row.area)) * 100) / 100;
    if (has(caps, 'price.view') && row.currency) {
      const cur = row.currency.trim();
      out.sum[row.status] = { ...(out.sum[row.status] || {}), [cur]: money(Number(out.sum[row.status]?.[cur] || 0) + Number(row.sum)) };
    }
  }
  return out;
}

/** History of a node (audit trail), newest first; sensitive values are hidden from those who may not see them. */
export async function nodeEvents(ctx, id, { before } = {}) {
  const node = await requireNode(ctx, id);
  const caps = readCaps(ctx, node.project_id);
  const params = [node.id];
  let where = 'e.node_id = $1';
  if (intOr(before)) {
    params.push(intOr(before));
    where += ` AND e.id < $${params.length}`;
  }
  const { rows } = await query(
    `SELECT e.*, COALESCE(u.display_name, u.username) AS author_name FROM mp_events e LEFT JOIN users u ON u.id = e.author_id WHERE ${where} ORDER BY e.id DESC LIMIT 51`,
    params
  );
  const items = rows.slice(0, 50).map((row) => {
    const data = { ...(row.data || {}) };
    if (!has(caps, 'price.view') && row.kind === 'price') return null;
    if (!has(caps, 'status.view') && ['status', 'booking', 'extend', 'expired'].includes(row.kind)) return null;
    const ownBooking = data.manager?.id && data.manager.id === ctx.userId;
    if (!(has(caps, 'clients.all') || (has(caps, 'clients.own') && ownBooking))) {
      delete data.client;
      delete data.deal;
    }
    if (!(has(caps, 'amounts.all') || (has(caps, 'amounts.own') && ownBooking))) delete data.amount;
    if (Array.isArray(data.changes) && !has(caps, 'minprice.view')) data.changes = data.changes.filter((change) => change.field !== 'min_price');
    return { id: row.id, kind: row.kind, data, author: row.author_id ? { id: row.author_id, name: row.author_name } : null, createdAt: iso(row.created_at) };
  });
  return { events: items.filter(Boolean), hasMore: rows.length > 50 };
}
