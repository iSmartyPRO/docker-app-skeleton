/** Small helpers of the org structure UI (labels, tree building). */

export function typeOf(meta, key) {
  return (meta?.types || []).find((type) => type.key === key) || { key, label: '', icon: 'layers', color: '#64748B' };
}

/** The type's own name, else the stock translation (org.types.<key>), else the key. */
export function typeLabel(type, t) {
  if (!type) return '';
  if (type.label) return type.label;
  const key = `org.types.${type.key}`;
  const text = t(key);
  return text === key ? type.key : text;
}

export function purposeLabel(purpose, t) {
  if (!purpose) return '';
  if (purpose.label) return purpose.label;
  const key = `org.purposes.${purpose.key}`;
  const text = t(key);
  return text === key ? purpose.key : text;
}

/** Nested tree from the flat list: [{ ...unit, children }], siblings by sort, then name. */
export function buildTree(units = []) {
  const nodes = new Map(units.map((unit) => [unit.id, { ...unit, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const order = (list) => {
    list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name), 'ru'));
    list.forEach((node) => order(node.children));
    return list;
  };
  return order(roots);
}

/** Ids below a unit (not the unit itself). */
export function descendantsOf(units = [], id) {
  const out = [];
  const queue = units.filter((unit) => unit.parentId === id).map((unit) => unit.id);
  while (queue.length) {
    const next = queue.shift();
    out.push(next);
    for (const unit of units) if (unit.parentId === next) queue.push(unit.id);
  }
  return out;
}

export const initialsOf = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
