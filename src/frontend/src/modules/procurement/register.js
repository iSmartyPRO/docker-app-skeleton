/*
 * Frontend entry of the Procurement module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { registerTour } from '../../tour/engine';
import procurementTour from './tour';

registerTour(procurementTour);

// Dashboard widgets (the server registers the same types with their data).
registerWidget('procurement', {
  order: 140,
  Component: lazyWidget(() => import('./ProcurementWidget'), 'default'),
  module: 'procurement',
  category: 'business',
  icon: 'cart',
  color: '#F97316',
  link: '/app/procurement',
  fit: true,
  size: { w: 4, h: 6, minW: 3, minH: 4 },
  preview: 'list',
  fields: [],
});
