import { decide } from '../api/scopes.js';
import { startOfDay } from '../services/datetime.js';

/*
 * Dashboard widgets (server side) — the extension point modules use to put
 * their data on the dashboard; the dashboard shell itself imports no module.
 *
 *   registerWidget({
 *     type: 'myTasks',              // unique; the frontend registers a component with the same type
 *     module: 'tasks',              // the widget is offered only while this module is on
 *     area: 'tasks',                // API token area it needs (default: module)
 *     permission: 'drive.audit',    // optional: needed permission; anyPermission: [..] — any of them
 *     data: async (req, settings, tz, input) => ({ … }),   // GET /api/app/dashboard/data/<type>; optional
 *                                                          //   (widgets that call their module's API themselves have none)
 *     options: async (req) => ({ projects: [...] }),       // merged into GET /api/app/dashboard/options; optional
 *   });
 *
 *   // A part of somebody else's widget, e.g. the task counters of «Welcome»:
 *   registerWidgetSection('welcome', { module: 'tasks', data: async (req, settings, tz, input) => ({ tasks }) });
 *
 * The helpers below (int, pick, bounds, dayKeys, seriesOf, areaAllowed) are
 * shared by the providers of every module.
 */

const widgetMap = new Map();
const sectionMap = new Map();

export function registerWidget(definition) {
  if (!definition?.type) throw new Error('registerWidget needs a type');
  widgetMap.set(definition.type, { module: null, ...definition });
}

export function registerWidgetSection(type, definition) {
  if (typeof definition?.data !== 'function') throw new Error('registerWidgetSection needs data()');
  sectionMap.set(type, [...(sectionMap.get(type) || []), { module: null, ...definition }]);
}

/** Registered widgets: { type: definition }. */
export const widgetDefinitions = () => Object.fromEntries(widgetMap);
export const widgetDefinition = (type) => widgetMap.get(type) || null;
export const widgetSections = (type) => sectionMap.get(type) || [];

// ── Helpers for providers ───────────────────────────────────────────────────

export const DAY = 24 * 3600 * 1000;

const AREA_PATHS = { notifications: '/notifications', 'admin.users': '/admin/users' };

/**
 * Whether the request may read an area (a module id, 'notifications',
 * 'admin.users'): an API token needs the scope it would need to call that
 * area's API directly; session requests (no token) always may.
 */
export function areaAllowed(req, area) {
  const policy = req?.apiToken?.policy;
  if (!policy || !area) return true;
  return decide(policy, 'GET', AREA_PATHS[area] || `/app/${area}`).ok;
}

export const int = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/** Start of today, tomorrow and of the day `days - 1` ago in the person's zone, as instants (DST safe). */
export function bounds(tz, days = 1, now = new Date()) {
  return { today: startOfDay(now, tz), tomorrow: startOfDay(now, tz, 1), since: startOfDay(now, tz, -(days - 1)) };
}

/** "YYYY-MM-DD" for each of the last `days` days in the zone, oldest first. */
export function dayKeys(today, days, tz) {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) keys.push(fmt.format(new Date(new Date(today).getTime() - i * DAY + 12 * 3600 * 1000)));
  return keys;
}

export const seriesOf = (keys, rows, field = 'count') => {
  const map = new Map(rows.map((row) => [row.day, Number(row[field])]));
  return keys.map((key) => map.get(key) || 0);
};
