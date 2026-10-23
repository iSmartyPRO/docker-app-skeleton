/*
 * Frontend entry of the Employees module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { registerTour } from '../../tour/engine';
import employeesTour from './tour';

registerTour(employeesTour);

// Dashboard widgets (the server registers the same types with their data).
registerWidget('employeesCelebrations', {
  order: 200,
  Component: lazyWidget(() => import('./CelebrationsWidget'), 'default'),
  module: 'employees',
  category: 'overview',
  icon: 'gift',
  color: '#EC4899',
  link: '/app/employees',
  fit: true,
  size: { w: 4, h: 5, minW: 3, minH: 3 },
  preview: 'list',
  fields: [],
});
