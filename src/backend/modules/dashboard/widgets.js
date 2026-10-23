import { hasPermission } from '../../services/permissions.js';
import { widgetDefinitions } from '../../platform/widgets.js';

/*
 * Widget catalog (server side): which module a widget needs and which
 * permission (`area`: the API token scope it needs when not the module's),
 * plus the built-in starting layout (widget types only — a type whose module
 * is not installed simply drops out). Rendering, settings forms
 * and sizes for the UI live in the frontend catalog (modules/dashboard/catalog.js).
 */

export const CORE_WIDGETS = {
  welcome: {},
  quickActions: {},
  clock: {},
  note: {},
  notifications: { area: 'notifications' },
  inbox: { module: 'approvals' },
  people: { permission: 'users.view', area: 'admin.users' },
};

/**
 * Every widget type: the core ones above and those modules registered
 * (platform/widgets.js registerWidget — e.g. Tasks «myTasks», Contracts
 * «contractsPayments» for finance, Warehouse «warehouseLow»).
 */
export function widgetCatalog() {
  return { ...CORE_WIDGETS, ...widgetDefinitions() };
}

/** The starting dashboard; widgets of switched-off modules drop out, the grid closes the gaps. */
export const DEFAULT_LAYOUT = [
  { type: 'welcome', w: 8, h: 3 },
  { type: 'quickActions', w: 4, h: 3 },
  { type: 'myTasks', w: 5, h: 6 },
  { type: 'agenda', w: 4, h: 6 },
  { type: 'taskStats', w: 3, h: 6 },
  { type: 'taskTrend', w: 8, h: 5 },
  { type: 'notifications', w: 4, h: 5 },
  { type: 'inbox', w: 4, h: 6 },
  { type: 'miniCalendar', w: 4, h: 6 },
  { type: 'links', w: 4, h: 6 },
  { type: 'kbRecent', w: 4, h: 6 },
  { type: 'recentFiles', w: 4, h: 5 },
  { type: 'drive', w: 4, h: 5 },
  { type: 'companies', w: 4, h: 5 },
  { type: 'people', w: 6, h: 5 },
  { type: 'driveActivity', w: 6, h: 5 },
].map((widget, index) => ({ id: `d${index + 1}`, settings: {}, ...widget }));

/** Widget types this person can use now (module on, permission held). */
export function availableTypes(modules, permissions) {
  return Object.entries(widgetCatalog())
    .filter(([, def]) => (!def.module || modules[def.module]?.enabled) && (!def.permission || hasPermission(permissions, def.permission)) && (!def.anyPermission || def.anyPermission.some((perm) => hasPermission(permissions, perm))))
    .map(([type]) => type);
}

const ID = /^[a-z0-9_-]{1,40}$/i;
// A widget type as modules name them (myTasks, contractsPayments, a package's hello.greeting…).
const TYPE = /^[a-z][a-z0-9_.-]{0,59}$/i;

/**
 * A layout as sent by the browser or read from the database, made safe: sane
 * types, sizes and small settings. Types the server does not know right now are
 * KEPT — their module may be off, failed to register or not loaded yet (a
 * package), and must find its widgets again when it is back; the routes show
 * and offer only availableTypes() (docs/dashboard.md).
 */
export function cleanLayout(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input.slice(0, 40)) {
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string' || !TYPE.test(raw.type)) continue;
    const id = ID.test(String(raw.id || '')) && !seen.has(raw.id) ? String(raw.id) : `w${Date.now().toString(36)}${out.length}`;
    seen.add(id);
    let settings = raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings) ? raw.settings : {};
    if (JSON.stringify(settings).length > 8000) settings = {};
    out.push({
      id,
      type: raw.type,
      w: Math.min(12, Math.max(2, Math.round(Number(raw.w) || 4))),
      h: Math.min(12, Math.max(2, Math.round(Number(raw.h) || 4))),
      settings,
    });
  }
  return out;
}

/*
 * A saved layout: the widgets sent (only types available right now) plus the stored widgets of
 * types not available now (module off, package not installed or not loaded, no permission),
 * so they come back with the module. Used for personal layouts and the default one.
 */
export function mergeParked(incoming, stored, available) {
  const allowed = new Set(available);
  const kept = cleanLayout(incoming).filter((widget) => allowed.has(widget.type));
  const parked = cleanLayout(stored).filter((widget) => !allowed.has(widget.type));
  const ids = new Set(kept.map((widget) => widget.id));
  return [...kept, ...parked.filter((widget) => !ids.has(widget.id))].slice(0, 40);
}
