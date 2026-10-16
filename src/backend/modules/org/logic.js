/*
 * Pure pieces of the org structure (no database): cleaning unit input, tree
 * building, cycle checks, the order of siblings after a move, the effective
 * time zone and the «manager of» walk. Unit-tested in test/org.test.js.
 */

export const UNIT_STATUSES = ['active', 'closed'];
export const MAX_DEPTH = 64;

export function httpError(statusCode, message, code, info) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (info) error.info = info;
  return error;
}

const text = (value, max) => {
  const out = String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return out || null;
};
const intOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** IANA zone check without throwing. */
export function isTimeZone(value) {
  if (!value || typeof value !== 'string' || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * A unit as sent by the editor, made safe. `settings`: the org settings
 * (types, purposes). Only keys present in `input` are returned for a patch
 * (`partial`), so an update never clears what it did not send.
 */
export function cleanUnitInput(input = {}, settings = {}, { partial = false } = {}) {
  const out = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const typeKeys = (settings.types || []).map((type) => type.key);
  const purposeKeys = (settings.purposes || []).map((purpose) => purpose.key);
  if (!partial || has('name')) {
    const name = text(input.name, 200);
    if (!name) throw httpError(400, 'Name the unit', 'NAME_REQUIRED');
    out.name = name;
  }
  if (!partial || has('type')) {
    const type = String(input.type || '').trim();
    if (!typeKeys.includes(type)) throw httpError(400, 'Unknown unit type', 'BAD_TYPE');
    out.type = type;
  }
  if (!partial || has('code')) {
    const code = text(input.code, 40);
    if (code && !/^[\p{L}\p{N}][\p{L}\p{N}._\-/ ]*$/u.test(code)) throw httpError(400, 'The code may hold letters, digits, dots, dashes and slashes', 'BAD_CODE');
    out.code = code;
  }
  if (!partial || has('parentId')) out.parentId = intOrNull(input.parentId);
  if (!partial || has('legalEntityId')) out.legalEntityId = intOrNull(input.legalEntityId);
  if (!partial || has('headUserId')) out.headUserId = intOrNull(input.headUserId);
  if (!partial || has('headEmployeeId')) out.headEmployeeId = intOrNull(input.headEmployeeId);
  if (!partial || has('address')) out.address = text(input.address, 400);
  if (!partial || has('note')) out.note = text(input.note, 1000);
  if (!partial || has('timeZone')) {
    const zone = text(input.timeZone, 64);
    if (zone && !isTimeZone(zone)) throw httpError(400, 'Unknown time zone', 'BAD_TIME_ZONE');
    out.timeZone = zone;
  }
  if (!partial || has('status')) out.status = input.status === 'closed' ? 'closed' : 'active';
  if (!partial || has('purposes')) {
    const list = Array.isArray(input.purposes) ? input.purposes : [];
    out.purposes = [...new Set(list.map((item) => String(item || '').trim()).filter((item) => purposeKeys.includes(item)))].slice(0, 10);
  }
  if (has('sort')) {
    const sort = Number(input.sort);
    out.sort = Number.isFinite(sort) ? Math.max(-1e6, Math.min(1e6, Math.round(sort))) : 0;
  }
  return out;
}

/** Map id → unit for a flat list. */
export const byId = (units) => new Map(units.map((unit) => [Number(unit.id), unit]));

/** Ids from `id` up to the root (the unit first). Stops on a broken chain or a loop. */
export function ancestorIds(units, id) {
  const map = units instanceof Map ? units : byId(units);
  const out = [];
  const seen = new Set();
  let current = map.get(Number(id));
  while (current && !seen.has(Number(current.id)) && out.length < MAX_DEPTH) {
    seen.add(Number(current.id));
    out.push(Number(current.id));
    current = current.parentId ? map.get(Number(current.parentId)) : null;
  }
  return out;
}

/** Ids of every unit below `id` (not the unit itself), breadth first. */
export function descendantIds(units, id) {
  const children = new Map();
  for (const unit of units) {
    const parent = unit.parentId ? Number(unit.parentId) : 0;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(Number(unit.id));
  }
  const out = [];
  const seen = new Set([Number(id)]);
  const queue = [...(children.get(Number(id)) || [])];
  while (queue.length) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    queue.push(...(children.get(next) || []));
  }
  return out;
}

/** True when putting `id` under `parentId` would make a loop (a unit under itself or its descendant). */
export function wouldCycle(units, id, parentId) {
  if (!parentId) return false;
  if (Number(parentId) === Number(id)) return true;
  return descendantIds(units, id).includes(Number(parentId));
}

/** Nested tree from a flat list: [{ ...unit, children: [...] }], siblings by sort then name. */
export function buildTree(units) {
  const nodes = new Map(units.map((unit) => [Number(unit.id), { ...unit, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(Number(node.parentId)) : null;
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

/**
 * New sibling order after a move: `siblings` are the ids under the new parent
 * (without the moved one) in their current order; the moved unit goes to
 * `index` (clamped). Returns [{ id, sort }] with sort = 10, 20, 30…
 */
export function reorderSiblings(siblings, movedId, index) {
  const list = siblings.map(Number).filter((id) => id !== Number(movedId));
  const at = Number.isInteger(index) ? Math.max(0, Math.min(list.length, index)) : list.length;
  list.splice(at, 0, Number(movedId));
  return list.map((id, position) => ({ id, sort: (position + 1) * 10 }));
}

/** The unit's own zone, else the nearest ancestor's, else the portal's. */
export function effectiveTimeZone(units, id, portalZone = 'UTC') {
  const map = units instanceof Map ? units : byId(units);
  for (const unitId of ancestorIds(map, id)) {
    const zone = map.get(unitId)?.timeZone;
    if (zone) return { timeZone: zone, inherited: unitId !== Number(id), from: unitId };
  }
  return { timeZone: portalZone, inherited: true, from: null };
}

/**
 * «Руководитель подразделения» of a person: the head of their unit; when the
 * person is that head (or the unit has no usable head), the head of the
 * parent unit, and so on up to the root. `headOf(unit)` returns the head's
 * user id or null; `isActive(userId)` filters blocked accounts. Returns
 * { userId, unitId } or null.
 */
export function walkManager({ units, unitId, userId, headOf, isActive = () => true }) {
  const map = units instanceof Map ? units : byId(units);
  for (const id of ancestorIds(map, unitId)) {
    const head = headOf(map.get(id));
    if (head && Number(head) !== Number(userId) && isActive(Number(head))) return { userId: Number(head), unitId: id };
  }
  return null;
}

/** Path names root → unit, e.g. ['ООО «Пример»', 'Филиал «Восток»', 'Отдел продаж']. */
export function pathNames(units, id) {
  const map = units instanceof Map ? units : byId(units);
  return ancestorIds(map, id)
    .reverse()
    .map((unitId) => map.get(unitId)?.name)
    .filter(Boolean);
}
