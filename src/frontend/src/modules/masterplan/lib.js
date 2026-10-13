import { localeTag } from '../../lib/format';

/*
 * Pure helpers of the Masterplan UI: money and areas, statuses and their
 * colours, type icons, the tree of a project, the shared filter applied on
 * the client (site plan, chessboard) and per-person storage.
 */

export const STATUSES = ['not_for_sale', 'free', 'reserve', 'booking', 'deposit', 'contract', 'sold', 'handed'];
export const HELD = new Set(['reserve', 'booking', 'deposit', 'contract', 'sold', 'handed']);
export const TIMED = new Set(['reserve', 'booking']);
export const DEFAULT_COLORS = {
  not_for_sale: '#94A3B8',
  free: '#22C55E',
  reserve: '#EAB308',
  booking: '#F97316',
  deposit: '#8B5CF6',
  contract: '#3B82F6',
  sold: '#EF4444',
  handed: '#7F1D1D',
};

export const statusColor = (status, settings) => settings?.statusColors?.[status] || DEFAULT_COLORS[status] || '#94A3B8';

/** Readiness 0..100 → a colour from grey to green (construction layer). */
export function readinessColor(value) {
  if (value === null || value === undefined) return '#CBD5E1';
  const v = Math.max(0, Math.min(100, Number(value))) / 100;
  // grey (148,163,184) → amber (245,158,11) → green (22,163,74)
  const mix = (a, b, k) => Math.round(a + (b - a) * k);
  const [r, g, b] = v < 0.5 ? [mix(148, 245, v * 2), mix(163, 158, v * 2), mix(184, 11, v * 2)] : [mix(245, 22, (v - 0.5) * 2), mix(158, 163, (v - 0.5) * 2), mix(11, 74, (v - 0.5) * 2)];
  return `rgb(${r}, ${g}, ${b})`;
}

export const TYPE_ICONS = {
  house: '🏡',
  townhouse: '🏘️',
  villa: '🏝️',
  building: '🏢',
  apartment: '🚪',
  land: '🌱',
  shop: '🏪',
  office: '💼',
  restaurant: '🍽️',
  fitness: '🏋️',
  admin: '🏛️',
  gate: '🚧',
  boiler: '🔥',
  road: '🛣️',
  network: '🔌',
  playground: '🛝',
  park: '🌳',
  water: '💧',
  parking: '🅿️',
  car: '🚗',
  storage: '📦',
  flag: '🚩',
};
export const LEVEL_ICON = '◫';
export const iconOf = (node) => (node?.kind === 'level' ? LEVEL_ICON : TYPE_ICONS[node?.type?.icon] || TYPE_ICONS.flag);

// ── Numbers ─────────────────────────────────────────────────────────────────

const formatters = new Map();
function numberFormat(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) {
    try {
      formatters.set(key, new Intl.NumberFormat(localeTag(locale), options));
    } catch {
      formatters.set(key, new Intl.NumberFormat(localeTag(locale)));
    }
  }
  return formatters.get(key);
}

/** $250,000 · 21 875 000 сом — whole numbers unless there are cents. */
export function formatMoney(amount, currency, locale) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const value = Number(amount) || 0;
  const digits = Math.round(value * 100) % 100 === 0 ? 0 : 2;
  if (currency === 'KGS') return `${numberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${locale === 'ru' ? 'сом' : 'KGS'}`;
  if (!currency) return numberFormat(locale, { maximumFractionDigits: digits }).format(value);
  return numberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
}

/** $250K / $1.2M — for tight spots (chessboard cells, plan labels). */
export function formatShortMoney(amount, currency, locale) {
  if (amount === null || amount === undefined) return '—';
  const value = Number(amount) || 0;
  const options = { notation: 'compact', maximumFractionDigits: value >= 1e6 ? 1 : 0 };
  if (currency && currency !== 'KGS') return numberFormat(locale, { ...options, style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(value);
  return `${numberFormat(locale, options).format(value)}${currency === 'KGS' ? (locale === 'ru' ? ' сом' : ' KGS') : ''}`;
}

export const formatNumber = (value, locale, digits = 0) => (value === null || value === undefined ? '—' : numberFormat(locale, { maximumFractionDigits: digits }).format(Number(value)));

export const formatArea = (value, locale) => (value === null || value === undefined ? '—' : `${numberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value))} м²`);

export const formatPercent = (value, locale) => (value === null || value === undefined ? '—' : `${numberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value))}%`);

/** Sums per currency → lines, biggest first. */
export function sumLines(sum, locale) {
  return Object.entries(sum || {})
    .filter(([, value]) => Number(value))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([currency, value]) => formatMoney(value, currency, locale));
}

// ── Time left ───────────────────────────────────────────────────────────────

/** { ms, days, hours, minutes, urgent (≤ 24 h), overdue } until a moment. */
export function timeLeft(endsAt, now = Date.now()) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  const abs = Math.max(0, ms);
  return {
    ms,
    days: Math.floor(abs / 86400000),
    hours: Math.floor((abs % 86400000) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
    urgent: ms <= 24 * 3600000,
    overdue: ms <= 0,
  };
}

// ── Tree ────────────────────────────────────────────────────────────────────

/** Index of a project's nodes: by id, children by parent (sorted), roots. */
export function indexTree(nodes) {
  const byId = new Map();
  const children = new Map();
  for (const node of nodes) {
    byId.set(node.id, node);
    const key = node.parentId || 0;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(node);
  }
  for (const list of children.values()) list.sort((a, b) => a.sort - b.sort || a.id - b.id);
  return { byId, children, roots: children.get(0) || [], kids: (id) => children.get(id || 0) || [] };
}

/** Every node below `id` (not itself). */
export function descendants(tree, id) {
  const out = [];
  const stack = [...tree.kids(id)];
  while (stack.length) {
    const node = stack.shift();
    out.push(node);
    stack.push(...tree.kids(node.id));
  }
  return out;
}

export const nodeLabel = (node) => (node ? [node.code, node.name].filter(Boolean).join(' · ') || `#${node.id}` : '');
export const shortLabel = (node) => (node ? node.code || node.name || `#${node.id}` : '');

/** Counts by status of the units below (or at) a node. */
export function countByStatus(units) {
  const out = {};
  for (const node of units) {
    const status = node.unit?.status;
    if (status) out[status] = (out[status] || 0) + 1;
  }
  return out;
}

// ── Filter (client side over the project's nodes) ───────────────────────────

export const EMPTY_FILTER = { q: '', statuses: [], types: [], priceMin: null, priceMax: null, areaMin: null, areaMax: null, plotMin: null, plotMax: null, bedrooms: null, finishing: [], stage: null, mine: false };

export function filterActive(filter) {
  return Object.entries(filter || {}).some(([key, value]) => (Array.isArray(value) ? value.length : value !== null && value !== '' && value !== false && value !== undefined && key !== 'q') || (key === 'q' && value));
}

/** "14" → "№14"; words ("блок 1") stay as they are. The number on the previous sales plan (attrs.oldNumber). */
export const oldNumberLabel = (value) => (value === null || value === undefined || value === '' ? null : /^\d/.test(String(value)) ? `№${value}` : String(value));

const norm = (value) => String(value ?? '').toLowerCase().replace(/ё/g, 'е').replace(/№\s*/g, '').replace(/\s+/g, ' ').trim();

/** Does the node's own code, name, number or old number contain the text? */
export function textHit(node, q) {
  const needle = norm(q);
  if (!needle) return true;
  return [node.code, node.name, node.unit?.number, node.attrs?.oldNumber].some((value) => value !== null && value !== undefined && norm(value).includes(needle));
}

/**
 * How well a node answers a search (0 = not at all): exact code or old number
 * first, then a name / code that starts with the text, then any hit.
 */
export function searchRank(node, q) {
  const needle = norm(q);
  if (!needle || !textHit(node, q)) return 0;
  if (norm(node.code) === needle || norm(node.name) === needle) return 4;
  if (norm(node.attrs?.oldNumber) === needle) return 3;
  if ([node.code, node.name].some((value) => norm(value).startsWith(needle))) return 2;
  return 1;
}

/**
 * Does a node (with sales data) pass the filter? With `tree`, the text also
 * matches through the node's ancestors: «Апарт-корпус 40» keeps its apartments.
 */
export function matches(node, filter, userId, tree) {
  if (!filter) return true;
  const u = node.unit || {};
  if (filter.q) {
    const chain = tree && node.path ? node.path.map((id) => tree.byId.get(id)).filter(Boolean) : [node];
    if (!chain.some((item) => textHit(item, filter.q))) return false;
  }
  if (filter.statuses?.length && !filter.statuses.includes(u.status)) return false;
  if (filter.types?.length && !filter.types.includes(node.type?.id)) return false;
  const area = u.areaTotal ?? u.areaPlot;
  const range = (value, min, max) => (min === null || min === undefined || (value !== null && value !== undefined && value >= min)) && (max === null || max === undefined || (value !== null && value !== undefined && value <= max));
  if (!range(u.price, filter.priceMin, filter.priceMax)) return false;
  if (!range(area, filter.areaMin, filter.areaMax)) return false;
  if (!range(u.areaPlot, filter.plotMin, filter.plotMax)) return false;
  if (filter.bedrooms && !(u.bedrooms >= filter.bedrooms)) return false;
  if (filter.finishing?.length && !filter.finishing.includes(u.finishing)) return false;
  if (filter.stage && node.stage?.id !== filter.stage) return false;
  if (filter.mine && u.manager?.id !== userId) return false;
  return true;
}

/** The filter as query parameters of GET /units. */
export function filterParams(filter) {
  const out = {};
  if (!filter) return out;
  if (filter.q) out.q = filter.q;
  if (filter.statuses?.length) out.status = filter.statuses.join(',');
  if (filter.types?.length) out.types = filter.types.join(',');
  if (filter.finishing?.length) out.finishing = filter.finishing.join(',');
  for (const key of ['priceMin', 'priceMax', 'areaMin', 'areaMax', 'plotMin', 'plotMax', 'bedrooms', 'stage']) if (filter[key] !== null && filter[key] !== undefined && filter[key] !== '') out[key] = filter[key];
  if (filter.mine) out.mine = '1';
  return out;
}

// ── Storage (per browser, per person) ───────────────────────────────────────

export function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStore(key, value) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: not remembered */
  }
}

export const userKey = (user, name) => `mp_${name}_${user?.id || 0}`;

/** Capabilities the server sent for a project (rules.js on the server). */
export const can = (caps, cap) => Array.isArray(caps) && (caps.includes('*') || caps.includes(cap));
