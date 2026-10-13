import { descendants } from '../lib';

/*
 * The chessboard grid (spec §9.2), shared by the chessboard page and the
 * mini-chessboard of a building's card.
 */

/** Houses with apartments: objects or levels with units that have a floor. */
export function housesOf(tree) {
  const out = [];
  for (const node of tree.byId.values()) {
    if (node.unit) continue;
    if (node.kind !== 'object' && !['house', 'section'].includes(node.levelKey)) continue;
    const units = descendants(tree, node.id).filter((item) => item.unit && item.unit.floor !== null && item.unit.floor !== undefined);
    if (units.length) out.push({ node, units });
  }
  // A house beats its own sections: keep the outermost.
  return out.filter((item) => !out.some((other) => other !== item && item.node.path.includes(other.node.id)));
}

/**
 * Columns: sections and risers; rows: floors (top floor first). A unit's
 * section is the level right under the house; its riser is `riser`, or its
 * place on the floor by number.
 */
export function chessGrid(house, tree) {
  const sections = new Map();
  for (const unit of house.units) {
    const sectionNode = unit.path.map((id) => tree.byId.get(id)).find((node) => node && node.parentId === house.node.id && node.kind === 'level') || null;
    const key = sectionNode?.id || 0;
    if (!sections.has(key)) sections.set(key, { node: sectionNode, units: [] });
    sections.get(key).units.push(unit);
  }
  const floors = new Set();
  const cols = [];
  for (const section of [...sections.values()].sort((a, b) => (a.node?.sort || 0) - (b.node?.sort || 0))) {
    const byFloor = new Map();
    for (const unit of section.units) {
      floors.add(unit.unit.floor);
      if (!byFloor.has(unit.unit.floor)) byFloor.set(unit.unit.floor, []);
      byFloor.get(unit.unit.floor).push(unit);
    }
    for (const list of byFloor.values()) list.sort((a, b) => (a.unit.riser ?? 999) - (b.unit.riser ?? 999) || String(a.unit.number).localeCompare(String(b.unit.number), undefined, { numeric: true }));
    const width = Math.max(...[...byFloor.values()].map((list) => Math.max(list.length, ...list.map((unit) => unit.unit.riser || 0))));
    const cells = new Map();
    for (const [floor, list] of byFloor) {
      const row = new Array(width).fill(null);
      list.forEach((unit, index) => {
        const at = unit.unit.riser ? unit.unit.riser - 1 : index;
        if (at < width && !row[at]) row[at] = unit;
        else row[row.indexOf(null)] = unit;
      });
      cells.set(floor, row);
    }
    cols.push({ section: section.node, width, cells });
  }
  return { cols, floors: [...floors].sort((a, b) => b - a) };
}

