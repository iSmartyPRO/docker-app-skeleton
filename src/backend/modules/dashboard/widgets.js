import { hasPermission } from '../../services/permissions.js';

/*
 * Widget catalog (server side): which module a widget needs and which
 * permission (`area`: the API token scope it needs when not the module's),
 * plus the built-in starting layout. Rendering, settings forms
 * and sizes for the UI live in the frontend catalog (modules/dashboard/catalog.js).
 */

export const WIDGETS = {
  welcome: {},
  quickActions: {},
  clock: {},
  note: {},
  notifications: { area: 'notifications' },
  inbox: { module: 'approvals' },
  procurement: { module: 'procurement' },
  warehouseLow: { module: 'warehouse' },
  warehouseIncoming: { module: 'warehouse' },
  warehouseMyTools: { module: 'warehouse' },
  myTasks: { module: 'tasks' },
  taskStats: { module: 'tasks' },
  taskTrend: { module: 'tasks' },
  agenda: { module: 'calendar' },
  miniCalendar: { module: 'calendar' },
  recentFiles: { module: 'files' },
  drive: { module: 'drive' },
  driveActivity: { module: 'drive', permission: 'drive.audit' },
  kbRecent: { module: 'kb' },
  links: { module: 'resources' },
  companies: { module: 'companies' },
  people: { permission: 'users.view', area: 'admin.users' },
};

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
  return Object.entries(WIDGETS)
    .filter(([, def]) => (!def.module || modules[def.module]?.enabled) && (!def.permission || hasPermission(permissions, def.permission)))
    .map(([type]) => type);
}

const ID = /^[a-z0-9_-]{1,40}$/i;

/** A layout as sent by the browser, made safe: known types, sane sizes, small settings. */
export function cleanLayout(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input.slice(0, 40)) {
    if (!raw || !WIDGETS[raw.type]) continue;
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
