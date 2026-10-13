import { HELD, STATUSES, descendants, readinessColor, statusColor } from '../lib';

const RANK = Object.fromEntries(STATUSES.map((status, index) => [status, index]));

function rgbOf(color) {
  const hex = String(color || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) return hex.split('').map((c) => parseInt(c + c, 16));
  if (/^[0-9a-f]{6}$/i.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return null;
}

/** a → b by t (0..1); colours that are not hex fall back to the nearer end. */
export function mixColor(a, b, t) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return t >= 0.5 ? b : a;
  const v = x.map((c, i) => Math.round(c + (y[i] - c) * Math.max(0, Math.min(1, t))));
  return `rgb(${v[0]}, ${v[1]}, ${v[2]})`;
}

/**
 * What the plan says about the units of a building (tooltip, colour): total,
 * free (null without status rights), the lowest price of a free unit. Uses
 * the map's nodes, which already went through the server's field hiding.
 */
export function buildingStats(node, tree) {
  const units = descendants(tree, node.id).filter((item) => item.unit);
  const seesStatus = units.some((item) => item.unit.status);
  const free = seesStatus ? units.filter((item) => item.unit.status === 'free') : [];
  const priced = free.filter((item) => item.unit.price !== null && item.unit.price !== undefined);
  const cheapest = priced.reduce((best, item) => (!best || item.unit.price < best.unit.price ? item : best), null);
  return { units, total: units.length, free: seesStatus ? free.length : null, priceFrom: cheapest ? cheapest.unit.price : null, currency: cheapest?.unit.currency || null };
}

/**
 * The colour of a node on a layer:
 *   sales  — its status; a building with units: by the share of free units,
 *            from the furthest status of the others (none free) to "free" (all free)
 *   build  — readiness, grey → green
 *   types  — the object type's colour
 */
export function nodeFill(node, layer, { settings, tree }) {
  if (layer === 'build') return readinessColor(node.readiness);
  if (layer === 'types') return node.type?.color || '#94A3B8';
  if (node.unit) return node.unit.status ? statusColor(node.unit.status, settings) : '#94A3B8';
  const below = descendants(tree, node.id).filter((item) => item.unit?.status);
  if (!below.length) return node.kind === 'level' ? 'transparent' : node.type?.color || '#94A3B8';
  const free = below.filter((item) => item.unit.status === 'free').length;
  const freeColor = statusColor('free', settings);
  if (free === below.length) return freeColor;
  const top = below.reduce((best, item) => (item.unit.status !== 'free' && RANK[item.unit.status] > RANK[best] ? item.unit.status : best), 'not_for_sale');
  const topColor = statusColor(top, settings);
  if (!free) return topColor;
  // One free unit already reads green-ish; a half-sold building sits in between.
  return mixColor(topColor, freeColor, 0.3 + 0.7 * (free / below.length));
}

/** Units at or below a node. */
export function unitsUnder(node, tree) {
  if (!node) return [];
  return [node, ...descendants(tree, node.id)].filter((item) => item.unit);
}

export const isHeld = (node) => HELD.has(node.unit?.status);
