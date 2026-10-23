/*
 * Frontend entry of the Tasks module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { period, limit, scopeField, projectField } from '../../platform/widgets/fields';
// How task events read in conversations (Chat).
import './chatEvents';

// Dashboard widgets (the server registers the same types with their data).
registerWidget('myTasks', {
  order: 50,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'MyTasks'),
  module: 'tasks',
  category: 'tasks',
  icon: 'tasks',
  color: '#10B981',
  link: '/app/tasks',
  fit: true,
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
});

registerWidget('taskStats', {
  order: 60,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'TaskStats'),
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
});

registerWidget('taskTrend', {
  order: 70,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'TaskTrend'),
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
});
