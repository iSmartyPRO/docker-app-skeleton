import { Clock, CLOCK_ZONES, NOTE_COLORS, Note, Notifications, QuickActions, Welcome } from './widgets/Personal';
import { People } from './widgets/Content';
import { getRegional } from '../../lib/datetime';
import { WIDGET_REGISTRY, registerWidget } from '../../platform/widgets/registry';
import { limit, period } from '../../platform/widgets/fields';

/*
 * Frontend widget catalog. Each entry: the component, where it sits in the
 * gallery, its colour and icon, sizes (12-column grid, rows of ~56 px), the
 * module page it links to, a preview sketch for the gallery and the settings
 * form. Modules add theirs with registerWidget() in their register.js
 * (platform/widgets/registry.js); the shell keeps the core ones below.
 * `fit`: on phones the card is as tall as its content (lists, tiles);
 * without it the card keeps its rows (charts, calendars). The server keeps the matching list (modules/dashboard/widgets.js).
 *
 * Field types: segmented, select, multi, switch, number, zones, color.
 * `from` loads choices from /options (projects, calendars, categories, modules).
 */

export const CATEGORIES = ['overview', 'tasks', 'calendar', 'content', 'business', 'admin', 'tools'];

const CORE_WIDGETS = {
  welcome: {
    order: 10,
    Component: Welcome,
    category: 'overview',
    icon: 'home',
    color: '#6366F1',
    size: { w: 8, h: 3, minW: 4, minH: 2, maxH: 4 },
    preview: 'hero',
    bare: true,
    autoHeight: true,
    fields: [{ key: 'showStats', type: 'switch', default: true }],
  },
  quickActions: {
    order: 20,
    Component: QuickActions,
    category: 'overview',
    icon: 'apps',
    color: '#0EA5E9',
    fit: true,
    size: { w: 4, h: 3, minW: 2, minH: 2 },
    preview: 'tiles',
    fields: [
      { key: 'modules', type: 'multi', from: 'modules', allowEmpty: 'dashboard.fields.allModules' },
      { key: 'style', type: 'segmented', default: 'tiles', options: ['tiles', 'list'].map((value) => ({ value, labelKey: `dashboard.fields.style.${value}` })) },
    ],
  },
  notifications: {
    order: 40,
    Component: Notifications,
    category: 'overview',
    icon: 'bell',
    color: '#EF4444',
    fit: true,
    size: { w: 4, h: 5, minW: 3, minH: 3 },
    preview: 'list',
    fields: [{ key: 'unreadOnly', type: 'switch', default: false }, limit(6, 3, 20)],
  },
  people: {
    order: 210,
    Component: People,
    permission: 'users.view',
    category: 'admin',
    icon: 'people',
    color: '#EC4899',
    link: '/admin/users',
    size: { w: 6, h: 5, minW: 4, minH: 4 },
    preview: 'columns',
    fields: [period([7, 14, 30, 90], 14)],
  },
  clock: {
    order: 230,
    Component: Clock,
    category: 'tools',
    icon: 'globe',
    color: '#0D9488',
    fit: true,
    size: { w: 3, h: 3, minW: 2, minH: 2 },
    preview: 'clock',
    fields: [
      { key: 'zones', type: 'zones', options: CLOCK_ZONES, default: ['Europe/Moscow', 'Europe/London'] },
      // A new clock starts with the person's time format (regional settings).
      {
        key: 'format',
        type: 'segmented',
        get default() {
          return getRegional().timeFormat === '12' ? '12' : '24';
        },
        options: ['24', '12'].map((value) => ({ value, labelKey: `dashboard.fields.format.${value}` })),
      },
      { key: 'analog', type: 'switch', default: false },
    ],
  },
  note: {
    order: 240,
    Component: Note,
    category: 'tools',
    icon: 'file',
    color: '#F59E0B',
    size: { w: 3, h: 3, minW: 2, minH: 2 },
    preview: 'note',
    bare: true,
    fields: [{ key: 'color', type: 'color', options: NOTE_COLORS, default: NOTE_COLORS[0] }],
  },
};

Object.entries(CORE_WIDGETS).forEach(([type, definition]) => registerWidget(type, definition));

/** Every widget the browser knows: the core ones and those modules registered (one live object). */
export const WIDGET_CATALOG = WIDGET_REGISTRY;

/** Settings with every field's default filled in. */
export function withDefaults(type, settings = {}) {
  const def = WIDGET_CATALOG[type];
  const out = { ...settings };
  (def?.fields || []).forEach((field) => {
    if (out[field.key] === undefined && field.default !== undefined) out[field.key] = field.default;
  });
  return out;
}
