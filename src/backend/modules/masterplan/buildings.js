import { query } from '../../config/database.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { has } from './rules.js';
import { money } from './util.js';

/*
 * Buildings as one card (docs/masterplan.md "Unified card"): a cottage is a
 * building with one unit, an apartment building one with many. This file
 * holds the pure parts — the aggregate of a building's units, the old number
 * of an object (transition from the previous sales plan), the series key of
 * shared media — and the small schema additions they need.
 */

// ── Old numbers ─────────────────────────────────────────────────────────────

/**
 * The number an object had on the previous sales plan, read from free text
 * such as «На прежнем генплане продаж — №14.» or «… — блок 1.» or «Было: 7».
 * «№14» becomes "14", «блок 1» stays "блок 1"; «без номера» gives null.
 */
export function parseOldNumber(description) {
  const source = String(description || '');
  const match = source.match(/(?:прежн\S*\s+генплан\S*(?:\s+продаж)?|стар\S*\s+генплан\S*|было)\s*[—–:-]+\s*(№\s*[0-9][\p{L}\d./-]*|(?:блок|корпус|дом)\s*№?\s*[0-9][\p{L}\d./-]*|[0-9][\p{L}\d./-]*)/iu);
  if (!match) return null;
  const value = match[1].replace(/[.,;]+$/, '').replace(/\s+/g, ' ').trim();
  if (value.startsWith('№')) return value.slice(1).trim() || null;
  return value.toLowerCase().replace(/№\s*/, '');
}

/** "14" → "№14"; words ("блок 1") stay as they are. */
export const oldNumberLabel = (value) => (value === null || value === undefined || value === '' ? null : /^\d/.test(String(value)) ? `№${value}` : String(value));

// ── Series (house project / apartment type) ─────────────────────────────────

const areaText = (value) => {
  const n = Math.round(Number(value) * 100) / 100;
  return `${String(n).replace('.', ',')} м²`;
};

/**
 * The series a node belongs to, for media shared by every object of it
 * (plans and renders of a house project or an apartment type): the explicit
 * attribute `series` («Одноэтажный дом 96,72 м²»), else for a unit its type,
 * rooms and area («Апартаменты · 1-комн. · 36,07 м²»). Null when neither.
 */
export function seriesKeyOf(node) {
  const own = String(node?.attrs?.series ?? '').trim();
  if (own) return own.slice(0, 160);
  const unit = node?.unit;
  const area = unit?.areaTotal ?? unit?.areaPlot;
  if (!unit || !node.type?.name || !area) return null;
  return [node.type.name, unit.rooms ? `${unit.rooms}-комн.` : null, areaText(area)].filter(Boolean).join(' · ').slice(0, 160);
}

// ── Building aggregate ──────────────────────────────────────────────────────

const range = (list) => (list.length ? { min: Math.min(...list), max: Math.max(...list) } : null);
const round2 = (value) => Math.round(value * 100) / 100;

/** The currency most of these units are priced in. */
function mainCurrency(units) {
  const counts = new Map();
  for (const node of units) if (node.unit.currency) counts.set(node.unit.currency, (counts.get(node.unit.currency) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

const byFloorAndNumber = (a, b) => (a.unit.floor ?? 0) - (b.unit.floor ?? 0) || String(a.unit.number ?? a.code ?? '').localeCompare(String(b.unit.number ?? b.code ?? ''), undefined, { numeric: true });

/**
 * What a building's card shows about its units: counts by status, free of
 * total, price and price per m² ranges of the free units, areas, floors,
 * finishing and payment forms, and the composition by rooms.
 *
 * `nodes` are API shapes already passed through field hiding (visibleNode),
 * and `caps` are the viewer's read capabilities: statuses only with
 * status.view, prices only with price.view (and status.view, since the
 * ranges are of the free units), so nothing hidden on a unit leaks through
 * the aggregate.
 */
export function buildingAggregate(nodes, caps) {
  const units = (nodes || []).filter((node) => node?.unit);
  const seeStatus = has(caps, 'status.view');
  const seePrice = has(caps, 'price.view') && seeStatus;
  const free = seeStatus ? units.filter((node) => node.unit.status === 'free') : [];
  const priced = seePrice ? free.filter((node) => node.unit.price !== null && node.unit.price !== undefined) : [];
  const currency = seePrice ? mainCurrency(priced) : null;
  const inCurrency = priced.filter((node) => node.unit.currency === currency);
  const areaOf = (node) => Number(node.unit.areaTotal ?? node.unit.areaPlot) || 0;

  const byStatus = {};
  if (seeStatus) for (const node of units) if (node.unit.status) byStatus[node.unit.status] = (byStatus[node.unit.status] || 0) + 1;

  const groups = new Map();
  for (const node of units) {
    const rooms = node.unit.rooms ?? null;
    const key = rooms !== null ? `r${rooms}` : `t${node.type?.id ?? 0}`;
    if (!groups.has(key)) groups.set(key, { key, rooms, typeName: node.type?.name || null, units: [] });
    groups.get(key).units.push(node);
  }
  const composition = [...groups.values()]
    .sort((a, b) => (a.rooms ?? 99) - (b.rooms ?? 99) || String(a.typeName).localeCompare(String(b.typeName)))
    .map((group) => {
      const groupFree = seeStatus ? group.units.filter((node) => node.unit.status === 'free').sort(byFloorAndNumber) : [];
      const groupPrices = seePrice ? groupFree.filter((node) => node.unit.currency === currency && node.unit.price !== null && node.unit.price !== undefined).map((node) => node.unit.price) : [];
      const areas = group.units.map(areaOf).filter(Boolean);
      return {
        key: group.key,
        rooms: group.rooms,
        typeName: group.typeName,
        area: range(areas),
        total: group.units.length,
        free: seeStatus ? groupFree.length : null,
        freeIds: seeStatus ? groupFree.map((node) => node.id) : null,
        priceFrom: groupPrices.length ? Math.min(...groupPrices) : null,
      };
    });

  const floors = [...new Set(units.map((node) => node.unit.floor).filter((floor) => floor !== null && floor !== undefined))].sort((a, b) => a - b);
  return {
    total: units.length,
    free: seeStatus ? free.length : null,
    byStatus: seeStatus ? byStatus : null,
    area: round2(units.reduce((sum, node) => sum + areaOf(node), 0)),
    freeArea: seeStatus ? round2(free.reduce((sum, node) => sum + areaOf(node), 0)) : null,
    floors,
    finishing: [...new Set(units.map((node) => node.unit.finishing).filter(Boolean))],
    paymentForms: has(caps, 'price.view') ? [...new Set(units.flatMap((node) => node.unit.paymentForms || []))] : [],
    // Whether prices are visible at all (so "no prices yet" is not shown to someone who may not see them).
    prices: seePrice,
    currency,
    price: range(inCurrency.map((node) => money(node.unit.price))),
    ppm: range(inCurrency.map((node) => node.unit.pricePerM2).filter((value) => value !== null && value !== undefined).map((value) => Math.round(value))),
    composition,
  };
}

// ── Schema additions ────────────────────────────────────────────────────────

/** Old numbers from descriptions into attrs.oldNumber; nodes that already have one are left alone. */
export async function backfillOldNumbers(client = { query }) {
  const { rows } = await client.query(`SELECT id, description FROM mp_nodes WHERE description IS NOT NULL AND NOT (attrs ? 'oldNumber')`);
  let changed = 0;
  for (const row of rows) {
    const value = parseOldNumber(row.description);
    if (!value) continue;
    await client.query(`UPDATE mp_nodes SET attrs = COALESCE(attrs, '{}'::jsonb) || jsonb_build_object('oldNumber', $2::text) WHERE id = $1 AND NOT (attrs ? 'oldNumber')`, [row.id, value]);
    changed += 1;
  }
  return changed;
}

/**
 * Idempotent: the `series` column of shared media, and the one-time backfill
 * of old numbers (a flag keeps a number someone removed on purpose removed).
 */
export async function ensureBuildingSchema() {
  await query(`ALTER TABLE mp_media ADD COLUMN IF NOT EXISTS series VARCHAR(160)`);
  await query(`CREATE INDEX IF NOT EXISTS mp_media_series_idx ON mp_media (project_id, series) WHERE series IS NOT NULL`);
  if ((await getSetting('masterplan_old_numbers')) !== 'true') {
    await backfillOldNumbers();
    await setSetting('masterplan_old_numbers', 'true');
  }
}
