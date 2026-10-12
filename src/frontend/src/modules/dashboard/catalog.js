import { Clock, CLOCK_ZONES, NOTE_COLORS, Note, Notifications, QuickActions, Welcome } from './widgets/Personal';
import { MyTasks, TaskStats, TaskTrend } from './widgets/Tasks';
import { Agenda, MiniCalendar } from './widgets/Calendar';
import { Companies, Drive, DriveActivity, KbRecent, Links, People, RecentFiles } from './widgets/Content';

/*
 * Frontend widget catalog. Each entry: the component, where it sits in the
 * gallery, its colour and icon, sizes (12-column grid, rows of ~56 px), the
 * module page it links to, a preview sketch for the gallery and the settings
 * form. The server keeps the matching list (modules/dashboard/widgets.js).
 *
 * Field types: segmented, select, multi, switch, number, zones, color.
 * `from` loads choices from /options (projects, calendars, categories, modules).
 */

export const CATEGORIES = ['overview', 'tasks', 'calendar', 'content', 'business', 'admin', 'tools'];

const period = (values = [7, 30, 90], fallback = 30) => ({ key: 'period', type: 'segmented', default: fallback, options: values.map((value) => ({ value, labelKey: 'dashboard.fields.days', n: value })) });
const limit = (fallback, min = 3, max = 20) => ({ key: 'limit', type: 'number', default: fallback, min, max });
const scopeField = (values = ['mine', 'all']) => ({ key: 'scope', type: 'segmented', default: 'mine', options: values.map((value) => ({ value, labelKey: `dashboard.fields.scope.${value}` })) });
const projectField = { key: 'project', type: 'select', from: 'projects', allowEmpty: 'dashboard.fields.allProjects' };

export const WIDGET_CATALOG = {
  welcome: {
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
    Component: QuickActions,
    category: 'overview',
    icon: 'apps',
    color: '#0EA5E9',
    size: { w: 4, h: 3, minW: 2, minH: 2 },
    preview: 'tiles',
    fields: [
      { key: 'modules', type: 'multi', from: 'modules', allowEmpty: 'dashboard.fields.allModules' },
      { key: 'style', type: 'segmented', default: 'tiles', options: ['tiles', 'list'].map((value) => ({ value, labelKey: `dashboard.fields.style.${value}` })) },
    ],
  },
  notifications: {
    Component: Notifications,
    category: 'overview',
    icon: 'bell',
    color: '#EF4444',
    size: { w: 4, h: 5, minW: 3, minH: 3 },
    preview: 'list',
    fields: [{ key: 'unreadOnly', type: 'switch', default: false }, limit(6, 3, 20)],
  },
  myTasks: {
    Component: MyTasks,
    module: 'tasks',
    category: 'tasks',
    icon: 'tasks',
    color: '#10B981',
    link: '/app/tasks',
    size: { w: 5, h: 6, minW: 3, minH: 3 },
    preview: 'checklist',
    fields: [
      scopeField(['mine', 'unassigned', 'all']),
      projectField,
      { key: 'due', type: 'segmented', default: 'any', options: ['any', 'overdue', 'today', 'week'].map((value) => ({ value, labelKey: `dashboard.fields.due.${value}` })) },
      { key: 'sort', type: 'select', default: 'due', options: ['due', 'priority', 'updated', 'created'].map((value) => ({ value, labelKey: `dashboard.fields.sort.${value}` })) },
      limit(8, 3, 30),
      { key: 'quickAdd', type: 'switch', default: true },
    ],
  },
  taskStats: {
    Component: TaskStats,
    module: 'tasks',
    category: 'tasks',
    icon: 'chart',
    color: '#8B5CF6',
    link: '/app/tasks',
    size: { w: 3, h: 6, minW: 3, minH: 4 },
    preview: 'donut',
    fields: [
      scopeField(),
      projectField,
      period([7, 30, 90, 365]),
      { key: 'view', type: 'segmented', default: 'status', options: ['status', 'priority', 'projects'].map((value) => ({ value, labelKey: `dashboard.fields.view.${value}` })) },
    ],
  },
  taskTrend: {
    Component: TaskTrend,
    module: 'tasks',
    category: 'tasks',
    icon: 'chart',
    color: '#6366F1',
    link: '/app/tasks',
    size: { w: 8, h: 5, minW: 4, minH: 3 },
    preview: 'area',
    fields: [
      scopeField(),
      projectField,
      period([14, 30, 90]),
      { key: 'chart', type: 'segmented', default: 'area', options: ['area', 'line', 'stack'].map((value) => ({ value, labelKey: `dashboard.fields.chart.${value}` })) },
    ],
  },
  agenda: {
    Component: Agenda,
    module: 'calendar',
    category: 'calendar',
    icon: 'calendar',
    color: '#F97316',
    link: '/app/calendar',
    size: { w: 4, h: 6, minW: 3, minH: 3 },
    preview: 'agenda',
    fields: [
      { key: 'days', type: 'segmented', default: 7, options: [1, 3, 7, 14].map((value) => ({ value, labelKey: 'dashboard.fields.days', n: value })) },
      { key: 'calendars', type: 'multi', from: 'calendars', allowEmpty: 'dashboard.fields.allCalendars' },
      { key: 'withTasks', type: 'switch', default: true, module: 'tasks' },
    ],
  },
  miniCalendar: {
    Component: MiniCalendar,
    module: 'calendar',
    category: 'calendar',
    icon: 'calendar',
    color: '#FB923C',
    link: '/app/calendar',
    size: { w: 4, h: 6, minW: 3, minH: 4 },
    preview: 'month',
    fields: [{ key: 'calendars', type: 'multi', from: 'calendars', allowEmpty: 'dashboard.fields.allCalendars' }],
  },
  recentFiles: {
    Component: RecentFiles,
    module: 'files',
    category: 'content',
    icon: 'folder',
    color: '#3B82F6',
    link: '/app/files/recent',
    size: { w: 4, h: 5, minW: 3, minH: 3 },
    preview: 'files',
    fields: [{ key: 'showUsage', type: 'switch', default: true }, limit(6, 3, 20)],
  },
  drive: {
    Component: Drive,
    module: 'drive',
    category: 'content',
    icon: 'server',
    color: '#2563EB',
    link: '/app/drive',
    size: { w: 4, h: 5, minW: 3, minH: 3 },
    preview: 'files',
    fields: [
      { key: 'list', type: 'segmented', default: 'recent', options: ['recent', 'favorites'].map((value) => ({ value, labelKey: `dashboard.fields.list.${value}` })) },
      { key: 'showShares', type: 'switch', default: true },
      limit(6, 3, 20),
    ],
  },
  kbRecent: {
    Component: KbRecent,
    module: 'kb',
    category: 'content',
    icon: 'graduation',
    color: '#0EA5E9',
    link: '/app/kb',
    size: { w: 4, h: 6, minW: 3, minH: 3 },
    preview: 'list',
    fields: [limit(6, 3, 12)],
  },
  links: {
    Component: Links,
    module: 'resources',
    category: 'content',
    icon: 'compass',
    color: '#14B8A6',
    link: '/app/resources',
    size: { w: 4, h: 6, minW: 2, minH: 2 },
    preview: 'tiles',
    fields: [
      { key: 'category', type: 'select', from: 'categories', allowEmpty: 'dashboard.fields.allCategories' },
      { key: 'style', type: 'segmented', default: 'tiles', options: ['tiles', 'list'].map((value) => ({ value, labelKey: `dashboard.fields.style.${value}` })) },
      limit(12, 2, 40),
    ],
  },
  companies: {
    Component: Companies,
    module: 'companies',
    category: 'business',
    icon: 'building',
    color: '#4F46E5',
    link: '/app/companies',
    size: { w: 4, h: 5, minW: 3, minH: 3 },
    preview: 'bars',
    fields: [
      { key: 'view', type: 'segmented', default: 'auto', options: ['auto', 'countries', 'relations', 'recent'].map((value) => ({ value, labelKey: `dashboard.fields.cview.${value}` })) },
      limit(5, 3, 10),
    ],
  },
  people: {
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
  driveActivity: {
    Component: DriveActivity,
    module: 'drive',
    category: 'admin',
    icon: 'shield',
    color: '#0F766E',
    link: '/app/drive/activity',
    size: { w: 6, h: 5, minW: 4, minH: 4 },
    preview: 'columns',
    fields: [period([7, 14, 30, 90], 14)],
  },
  clock: {
    Component: Clock,
    category: 'tools',
    icon: 'globe',
    color: '#0D9488',
    size: { w: 3, h: 3, minW: 2, minH: 2 },
    preview: 'clock',
    fields: [
      { key: 'zones', type: 'zones', options: CLOCK_ZONES, default: ['Europe/Moscow', 'Europe/London'] },
      { key: 'format', type: 'segmented', default: '24', options: ['24', '12'].map((value) => ({ value, labelKey: `dashboard.fields.format.${value}` })) },
      { key: 'analog', type: 'switch', default: false },
    ],
  },
  note: {
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

/** Settings with every field's default filled in. */
export function withDefaults(type, settings = {}) {
  const def = WIDGET_CATALOG[type];
  const out = { ...settings };
  (def?.fields || []).forEach((field) => {
    if (out[field.key] === undefined && field.default !== undefined) out[field.key] = field.default;
  });
  return out;
}
