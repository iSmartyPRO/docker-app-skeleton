/*
 * Frontend entry of the Calendar module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';

// Dashboard widgets (the server registers the same types with their data).
registerWidget('agenda', {
  order: 80,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'Agenda'),
  module: 'calendar',
  category: 'calendar',
  icon: 'calendar',
  color: '#F97316',
  link: '/app/calendar',
  fit: true,
  size: { w: 4, h: 6, minW: 3, minH: 3 },
  preview: 'agenda',
  fields: [
    { key: 'days', type: 'segmented', default: 7, options: [1, 3, 7, 14].map((value) => ({ value, labelKey: 'dashboard.fields.days', n: value })) },
    { key: 'calendars', type: 'multi', from: 'calendars', allowEmpty: 'dashboard.fields.allCalendars' },
    { key: 'withTasks', type: 'switch', default: true, module: 'tasks' },
  ],
});

registerWidget('miniCalendar', {
  order: 90,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'MiniCalendar'),
  module: 'calendar',
  category: 'calendar',
  icon: 'calendar',
  color: '#FB923C',
  link: '/app/calendar',
  fit: true,
  size: { w: 4, h: 6, minW: 3, minH: 4 },
  preview: 'month',
  fields: [{ key: 'calendars', type: 'multi', from: 'calendars', allowEmpty: 'dashboard.fields.allCalendars' }],
});
