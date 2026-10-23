import { query } from '../../config/database.js';
import { getSettingsView } from '../../services/settings.js';
import { hasPermission } from '../../services/permissions.js';
import { listNotifications, unreadCount } from '../../services/notifications.js';
import { getUserStats, recentLogins } from '../../services/users.js';
import { areaAllowed, bounds, dayKeys, int, seriesOf, widgetDefinition, widgetDefinitions, widgetSections } from '../../platform/widgets.js';
import { httpError } from '../shared/acl.js';
import { widgetCatalog } from './widgets.js';
import { inboxFor } from '../../services/inbox.js';
import { requestZone } from '../../services/regional.js';

/*
 * Data behind each widget. The dashboard shell provides the core widgets
 * (welcome, inbox, notifications, people); a module's widget gets its data
 * from the provider the module registered (platform/widgets.js
 * registerWidget), and parts of a widget from widget sections (Tasks adds its
 * counters to «Welcome»). Every provider reads through the owning module's
 * own service with the person's context, so a widget never shows more than
 * the module itself would. Day boundaries follow the person's zone (an
 * explicit `tz` from the browser, else their region settings).
 */

// Kept for existing callers (tests, other providers): the helpers live in platform/widgets.js.
export { areaAllowed, bounds };

// ── People (console) and personal ───────────────────────────────────────────

async function people(req, settings, tz) {
  const days = int(settings.period, 7, 90, 14);
  const { today, since } = await bounds(tz, days);
  const [stats, logins, joined, last] = await Promise.all([
    getUserStats(),
    query(
      `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day,
              COUNT(*) FILTER (WHERE success)::int AS ok, COUNT(*) FILTER (WHERE NOT success)::int AS failed
       FROM login_attempts WHERE created_at >= $1 GROUP BY 1`,
      [since, tz]
    ),
    query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= $1`, [since]),
    recentLogins(5),
  ]);
  const keys = dayKeys(today, days, tz);
  return {
    total: stats.total,
    active30d: stats.active30d,
    blocked: stats.blocked,
    disabled: stats.disabled,
    groups: stats.groups,
    joined: joined.rows[0].count,
    days: keys,
    logins: seriesOf(keys, logins.rows, 'ok'),
    failed: seriesOf(keys, logins.rows, 'failed'),
    recent: last.map((user) => ({ id: user.id, name: user.displayName || user.username, avatarUrl: user.avatarUrl || null, at: user.lastLoginAt })),
  };
}

async function notifications(req, settings) {
  return listNotifications(req.user.id, { limit: int(settings.limit, 3, 20, 6), unreadOnly: Boolean(settings.unreadOnly) });
}

/** «Welcome»: unread notifications; modules add their parts (tasks, events) as widget sections. */
async function welcome(req) {
  return areaAllowed(req, 'notifications') ? { unread: await unreadCount(req.user.id) } : {};
}

/** «Ждёт меня»: the first items of the inbox (approvals, tasks waiting for acceptance…) and the counters. */
async function inbox(req, settings) {
  const { items } = await inboxFor(req);
  const list = settings.module ? items.filter((item) => item.module === settings.module) : items;
  return { items: list.slice(0, int(settings.limit, 3, 20, 6)), total: list.length, overdue: list.filter((item) => item.overdue).length };
}

/** Providers of the core widgets; module widgets bring their own (registerWidget data). */
export const PROVIDERS = {
  welcome,
  inbox,
  notifications,
  people,
};

const providerOf = (type) => PROVIDERS[type] || widgetDefinition(type)?.data || null;

/** Sections other modules add to a widget, run while their module is on and the token reaches their area. */
async function withSections(type, out, req, modules, args) {
  for (const section of widgetSections(type)) {
    if (section.module && !modules[section.module]?.enabled) continue;
    if (!areaAllowed(req, section.area || section.module)) continue;
    const part = await section.data(req, ...args);
    if (part && typeof part === 'object') Object.assign(out, part);
  }
  return out;
}

/** Runs a widget's provider if this person may use the widget. */
export async function widgetData(req, type, input = {}) {
  const def = widgetCatalog()[type];
  const provider = providerOf(type);
  if (!def || !provider) throw httpError(404, 'Unknown widget', 'NOT_FOUND');
  const modules = (await getSettingsView()).modules;
  if (def.module && !modules[def.module]?.enabled) throw httpError(404, 'Module is disabled', 'MODULE_DISABLED');
  if (def.permission && !hasPermission(req.access?.permissions || [], def.permission)) throw httpError(403, 'You do not have permission for this widget', 'FORBIDDEN');
  const area = def.area || def.module;
  if (!areaAllowed(req, area)) throw httpError(403, `The token lacks the ${area}:read scope`, 'SCOPE_DENIED');
  let settings = {};
  try {
    settings = input.settings ? JSON.parse(input.settings) : {};
  } catch {
    settings = {};
  }
  // Day boundaries: the zone the browser sent when valid, else the person's region zone.
  const args = [settings && typeof settings === 'object' ? settings : {}, await requestZone(req, input.tz), input];
  return withSections(type, await provider(req, ...args), req, modules, args);
}

/** Choices for widget settings (projects, calendars, link categories), from the modules' widget options. */
export async function widgetOptions(req) {
  const modules = (await getSettingsView()).modules;
  const out = {};
  for (const def of Object.values(widgetDefinitions())) {
    if (typeof def.options !== 'function') continue;
    if (def.module && !modules[def.module]?.enabled) continue;
    if (!areaAllowed(req, def.area || def.module)) continue;
    Object.assign(out, await def.options(req));
  }
  return out;
}
