import { query } from '../../config/database.js';
import { regionalFor } from '../../services/settings.js';
import { isoDay } from '../../services/datetime.js';
import { httpError } from '../shared/acl.js';
import { forbidden, notFound, requireConfigure, requireProject } from './access.js';
import { has, readCaps } from './rules.js';
import { treeChanged } from './realtime.js';
import { dayString, intOr, iso, logEvent, money, parseDay, parseNumber, text } from './util.js';

/*
 * Price grid by payment form (docs/masterplan.md "Prices by payment form").
 *
 * A project (optionally one object type of it) has versions of a grid, each
 * effective from a date: payment plans (100 %, installment 50 % / 30 % …) with
 * their price — the unit's own price ('base'), a price per m² ('ppm') or a
 * markup over the unit's price ('markup') — the first payment in percent and
 * the term in months. The unit's own price stays the base price (100 %); the
 * grid only adds the other variants and the planned price per m² at
 * completion. Old versions are kept as the history of prices.
 *
 *   mp_price_grids  id, project_id, type_id (null = whole project), effective_from,
 *                   currency, plans JSONB, planned_ppm, note, created_by, created_at
 */

export async function ensurePricingSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS mp_price_grids (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mp_projects(id) ON DELETE CASCADE,
      type_id INTEGER REFERENCES mp_types(id) ON DELETE CASCADE,
      effective_from DATE NOT NULL,
      currency CHAR(3),
      plans JSONB NOT NULL DEFAULT '[]',
      planned_ppm NUMERIC(18,2),
      note VARCHAR(300),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_price_grids_idx ON mp_price_grids (project_id, type_id, effective_from DESC, id DESC)`);
}

// ── Pure calculations (unit-tested) ─────────────────────────────────────────

export const PLAN_MODES = ['base', 'ppm', 'markup'];
export const MAX_PLANS = 8;

const round = (n) => Math.round(n);
const round2 = (n) => Math.round(n * 100) / 100;

/** Plans of a grid version, checked: [{ key, name, mode, ppm, markupPct, firstPct, months }]. Throws 400 on bad input. */
export function cleanPlans(list) {
  if (!Array.isArray(list) || !list.length) throw httpError(400, 'Add at least one payment plan', 'INVALID_FIELD');
  if (list.length > MAX_PLANS) throw httpError(400, `At most ${MAX_PLANS} payment plans`, 'INVALID_FIELD');
  const seen = new Set();
  return list.map((raw, index) => {
    const name = text(raw?.name, 60);
    if (!name) throw httpError(400, 'Name every payment plan', 'INVALID_FIELD', { field: 'name', index });
    const mode = PLAN_MODES.includes(raw?.mode) ? raw.mode : 'ppm';
    const num = (value, min, max, field) => {
      const n = parseNumber(value);
      if (n === null || Number.isNaN(n) || n < min || n > max) throw httpError(400, `Invalid value: ${field}`, 'INVALID_FIELD', { field, index });
      return n;
    };
    const firstPct = num(raw?.firstPct ?? 100, 0, 100, 'firstPct');
    const months = firstPct >= 100 ? 0 : Math.round(num(raw?.months, 1, 360, 'months'));
    const plan = { key: '', name, mode, firstPct: round2(firstPct), months };
    if (mode === 'ppm') plan.ppm = round2(num(raw?.ppm, 0.01, 1e9, 'ppm'));
    if (mode === 'markup') plan.markupPct = round2(num(raw?.markupPct, -90, 1000, 'markupPct'));
    let key = text(raw?.key, 24).toLowerCase().replace(/[^a-z0-9_]/g, '') || `p${index + 1}`;
    while (seen.has(key)) key = `${key}_${index + 1}`;
    seen.add(key);
    plan.key = key;
    return plan;
  });
}

/**
 * Payment schedule of a total: the first payment (percent of the total), the
 * rest in equal monthly payments; amounts in whole currency units, the last
 * monthly payment takes the rounding difference.
 */
export function paymentSchedule(total, firstPct, months) {
  const sum = round(Number(total) || 0);
  const pct = Math.min(100, Math.max(0, Number(firstPct) || 0));
  const n = pct >= 100 ? 0 : Math.max(1, Math.round(Number(months) || 1));
  const first = n ? round((sum * pct) / 100) : sum;
  const rest = sum - first;
  const monthly = n ? round(rest / n) : 0;
  const last = n ? rest - monthly * (n - 1) : 0;
  return { total: sum, first, rest, months: n, monthly, last };
}

/** Total price of a unit under a plan; null when the plan cannot be applied (no price, no area, another currency). */
export function planTotal(plan, { price, area, currency, gridCurrency }) {
  if (plan.mode === 'base') return price ? round(price) : null;
  if (plan.mode === 'markup') return price ? round(price * (1 + (Number(plan.markupPct) || 0) / 100)) : null;
  if (!area || !plan.ppm) return null;
  if (gridCurrency && currency && gridCurrency !== currency) return null;
  return round(plan.ppm * area);
}

/** The grid version in force for a type on a day: the type's own version first, else the project's. `grids` = rows or shapes. */
export function activeGrid(grids, typeId, today) {
  const pick = (forType) =>
    grids
      .filter((g) => (g.typeId ?? null) === forType && g.effectiveFrom <= today)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : (b.id || 0) - (a.id || 0)))[0] || null;
  return (typeId ? pick(Number(typeId)) : null) || pick(null);
}

/**
 * Payment variants of a unit under a grid version: → { effectiveFrom, currency,
 * plans: [{ key, name, mode, total, ppm, firstPct, first, months, monthly, last }],
 * planned: { ppm, total, growthPct } | null } or null when nothing applies.
 * unit = { price, areaTotal, areaPlot, currency }.
 */
export function paymentOptions(unit, grid) {
  if (!unit || !grid) return null;
  const price = Number(unit.price) || 0;
  const area = Number(unit.areaTotal) || Number(unit.areaPlot) || 0;
  const currency = unit.currency || grid.currency || null;
  const plans = [];
  for (const plan of grid.plans || []) {
    const total = planTotal(plan, { price, area, currency, gridCurrency: grid.currency });
    if (!total) continue;
    const schedule = paymentSchedule(total, plan.firstPct, plan.months);
    plans.push({ key: plan.key, name: plan.name, mode: plan.mode, ppm: area ? round2(total / area) : null, firstPct: Number(plan.firstPct), ...schedule });
  }
  let planned = null;
  const sameCurrency = !grid.currency || !currency || grid.currency === currency;
  if (grid.plannedPpm && area && sameCurrency) {
    const total = round(grid.plannedPpm * area);
    const now = price ? price / area : plans[0]?.ppm || null;
    planned = { ppm: Number(grid.plannedPpm), total, growthPct: now ? round2(((grid.plannedPpm - now) / now) * 100) : null };
  }
  if (!plans.length && !planned) return null;
  return { gridId: grid.id || null, effectiveFrom: grid.effectiveFrom, currency, plans, planned };
}

// ── Storage ─────────────────────────────────────────────────────────────────

export function gridShape(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    typeId: row.type_id,
    typeName: row.type_name || null,
    effectiveFrom: dayString(row.effective_from),
    currency: (row.currency || '').trim() || null,
    plans: Array.isArray(row.plans) ? row.plans : [],
    plannedPpm: money(row.planned_ppm),
    note: row.note,
    author: row.author_name ? { id: row.created_by, name: row.author_name } : null,
    createdAt: iso(row.created_at),
  };
}

export async function today() {
  return isoDay(new Date(), (await regionalFor(null)).timeZone || 'UTC');
}

async function loadGrids(projectId) {
  const { rows } = await query(
    `SELECT g.*, t.name AS type_name, COALESCE(u.display_name, u.username) AS author_name
     FROM mp_price_grids g LEFT JOIN mp_types t ON t.id = g.type_id LEFT JOIN users u ON u.id = g.created_by
     WHERE g.project_id = $1 ORDER BY g.effective_from DESC, g.id DESC`,
    [projectId]
  );
  return rows.map(gridShape);
}

/**
 * The versions in force today (one per type with its own grid, and the
 * project's), for the project shape: the card computes the variants from them.
 * Only for people who see prices.
 */
export async function projectPricing(ctx, projectId) {
  if (!has(readCaps(ctx, projectId), 'price.view')) return null;
  const grids = await loadGrids(projectId);
  if (!grids.length) return { grids: [], upcoming: 0 };
  const day = await today();
  const keys = [...new Set(grids.map((g) => g.typeId ?? null))];
  const active = keys.map((typeId) => activeGrid(grids.filter((g) => (g.typeId ?? null) === typeId), typeId, day)).filter(Boolean);
  return {
    today: day,
    grids: active.map(({ id, typeId, typeName, effectiveFrom, currency, plans, plannedPpm }) => ({ id, typeId, typeName, effectiveFrom, currency, plans, plannedPpm })),
    upcoming: grids.filter((g) => g.effectiveFrom > day).length,
  };
}

/** Every version (history) of a project's grids. */
export async function listGrids(ctx, projectId) {
  const project = await requireProject(ctx, projectId);
  if (!has(readCaps(ctx, project.id), 'price.view')) throw forbidden();
  return { grids: await loadGrids(project.id), today: await today(), currency: (project.currency || '').trim() };
}

/** A new version: { typeId?, effectiveFrom, plans, plannedPpm?, note? } (project administrators). */
export async function createGrid(ctx, projectId, input = {}) {
  const project = await requireProject(ctx, projectId);
  requireConfigure(ctx, project.id);
  const effectiveFrom = parseDay(input.effectiveFrom, 'effectiveFrom');
  if (!effectiveFrom) throw httpError(400, 'Choose the date the prices start', 'INVALID_DATE');
  const typeId = intOr(input.typeId) || null;
  if (typeId) {
    const { rows } = await query(`SELECT id FROM mp_types WHERE id = $1`, [typeId]);
    if (!rows[0]) throw httpError(400, 'Unknown object type', 'INVALID_TYPE');
  }
  const plans = cleanPlans(input.plans);
  const planned = parseNumber(input.plannedPpm);
  if (Number.isNaN(planned) || (planned !== null && (planned <= 0 || planned > 1e9))) throw httpError(400, 'Invalid planned price', 'INVALID_FIELD', { field: 'plannedPpm' });
  const { rows } = await query(
    `INSERT INTO mp_price_grids (project_id, type_id, effective_from, currency, plans, planned_ppm, note, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [project.id, typeId, effectiveFrom, (project.currency || '').trim() || null, JSON.stringify(plans), planned, text(input.note, 300) || null, ctx.userId]
  );
  await logEvent(null, { projectId: project.id, kind: 'pricing', data: { action: 'created', gridId: rows[0].id, typeId, effectiveFrom, plans: plans.map((p) => ({ name: p.name, mode: p.mode, ppm: p.ppm, markupPct: p.markupPct, firstPct: p.firstPct, months: p.months })), plannedPpm: planned }, authorId: ctx.userId });
  treeChanged(project.id);
  return (await loadGrids(project.id)).find((g) => g.id === rows[0].id);
}

/**
 * Removes a version — only one not in force yet, or one added within the last
 * day (a mistake); versions that were in force are the history of prices.
 */
export async function deleteGrid(ctx, id) {
  const { rows } = await query(`SELECT * FROM mp_price_grids WHERE id = $1`, [intOr(id, 0)]);
  if (!rows[0]) throw notFound('Price grid not found');
  await requireProject(ctx, rows[0].project_id);
  requireConfigure(ctx, rows[0].project_id);
  const day = await today();
  const fresh = Date.now() - new Date(rows[0].created_at).getTime() < 24 * 3600 * 1000;
  if (dayString(rows[0].effective_from) <= day && !fresh) throw httpError(409, 'Prices that were in force stay in the history; add a new version instead', 'GRID_IN_HISTORY');
  await query(`DELETE FROM mp_price_grids WHERE id = $1`, [rows[0].id]);
  await logEvent(null, { projectId: rows[0].project_id, kind: 'pricing', data: { action: 'deleted', gridId: rows[0].id, effectiveFrom: dayString(rows[0].effective_from) }, authorId: ctx.userId });
  treeChanged(rows[0].project_id);
}

// ── Price per m² over time (dashboard) ──────────────────────────────────────

/**
 * Price of each unit at a moment from its price history: the last change
 * before it; before the first change the old price; without history the
 * current price. → Map(unitId → price).
 */
export function pricesAt(units, history, at) {
  const byUnit = new Map();
  for (const row of history) {
    if (!byUnit.has(row.unit_id)) byUnit.set(row.unit_id, []);
    byUnit.get(row.unit_id).push(row);
  }
  const out = new Map();
  const t = new Date(at).getTime();
  for (const unit of units) {
    if (unit.created_at && new Date(unit.created_at).getTime() > t) continue;
    const list = (byUnit.get(unit.node_id) || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let price = Number(unit.price) || null;
    if (list.length) {
      const before = list.filter((row) => new Date(row.created_at).getTime() <= t);
      price = before.length ? Number(before[before.length - 1].new_price) || null : Number(list[0].old_price) || null;
    }
    if (price) out.set(unit.node_id, price);
  }
  return out;
}

/**
 * Average list price per m² (area-weighted, base currency) at the end of each
 * of the last `months` months and today, the grid versions of the project
 * (plans priced per m²) and the planned price at completion.
 */
export async function priceTrend(ctx, project, toBase, months = 12) {
  const settings = ctx.settings;
  const { rows: units } = await query(
    `SELECT u.node_id, u.price, u.currency, COALESCE(u.area_total, u.area_plot) AS area, n.created_at
     FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id WHERE u.project_id = $1 AND COALESCE(u.area_total, u.area_plot) > 0`,
    [project.id]
  );
  const { rows: history } = await query(
    `SELECT h.unit_id, h.old_price, h.new_price, h.created_at FROM mp_price_history h JOIN mp_units u ON u.node_id = h.unit_id WHERE u.project_id = $1 ORDER BY h.id`,
    [project.id]
  );
  const now = new Date();
  const moments = [];
  for (let i = months; i >= 1; i -= 1) moments.push(new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59));
  moments.push(now);
  const points = [];
  for (const at of moments) {
    const prices = pricesAt(units, history, at);
    let sum = 0;
    let area = 0;
    for (const unit of units) {
      const price = prices.get(unit.node_id);
      if (!price) continue;
      sum += toBase(price, (unit.currency || '').trim(), settings);
      area += Number(unit.area);
    }
    if (area) points.push({ date: isoDay(at, 'UTC'), ppm: round2(sum / area) });
  }
  const grids = (await loadGrids(project.id)).filter((g) => !g.typeId).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const base = (amount, currency) => toBase(amount, currency || settings.currency, settings);
  const planned = [...grids].reverse().find((g) => g.plannedPpm);
  return {
    currency: settings.currency,
    points,
    grids: grids.map((g) => ({
      effectiveFrom: g.effectiveFrom,
      plans: g.plans.filter((p) => p.mode === 'ppm').map((p) => ({ key: p.key, name: p.name, ppm: round2(base(p.ppm, g.currency)) })),
    })),
    planned: planned ? { ppm: round2(base(planned.plannedPpm, planned.currency)), date: dayString(project.finish_date) } : null,
  };
}
