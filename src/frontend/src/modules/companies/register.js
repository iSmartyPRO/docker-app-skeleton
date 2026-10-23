/*
 * Frontend entry of the Counterparties module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { limit } from '../../platform/widgets/fields';

// Dashboard widgets (the server registers the same types with their data).
registerWidget('companies', {
  order: 190,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'Companies'),
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
});
