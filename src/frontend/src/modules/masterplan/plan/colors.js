import { HELD, STATUSES, descendants, readinessColor, statusColor } from '../lib';

const RANK = Object.fromEntries(STATUSES.map((status, index) => [status, index]));

/**
 * The colour of a node on a layer:
 *   sales  — its status; a building with apartments: "free" while any is free, else the furthest status
 *   build  — readiness, grey → green
 *   types  — the object type's colour
 */
export function nodeFill(node, layer, { settings, tree }) {
  if (layer === 'build') return readinessColor(node.readiness);
  if (layer === 'types') return node.type?.color || '#94A3B8';
  if (node.unit) return node.unit.status ? statusColor(node.unit.status, settings) : '#94A3B8';
  const below = descendants(tree, node.id).filter((item) => item.unit?.status);
  if (!below.length) return node.kind === 'level' ? 'transparent' : node.type?.color || '#94A3B8';
  if (below.some((item) => item.unit.status === 'free')) return statusColor('free', settings);
  const top = below.reduce((best, item) => (RANK[item.unit.status] > RANK[best] ? item.unit.status : best), 'not_for_sale');
  return statusColor(top, settings);
}

/** Units at or below a node. */
export function unitsUnder(node, tree) {
  if (!node) return [];
  return [node, ...descendants(tree, node.id)].filter((item) => item.unit);
}

export const isHeld = (node) => HELD.has(node.unit?.status);
