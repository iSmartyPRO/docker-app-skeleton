/*
 * Frontend entry of the Online resources module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { limit } from '../../platform/widgets/fields';
import { lazy } from 'react';
import { contribute } from '../../platform/extensions';

// Settings → Site access → Home page: the resources board, drawn in place (guests too).
contribute('app.homePages', { id: 'resources', Component: lazy(() => import('./ResourcesHome')) });

// Dashboard widgets (the server registers the same types with their data).
registerWidget('links', {
  order: 130,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'Links'),
  module: 'resources',
  category: 'content',
  icon: 'compass',
  color: '#14B8A6',
  link: '/app/resources',
  fit: true,
  size: { w: 4, h: 6, minW: 2, minH: 2 },
  preview: 'tiles',
  fields: [
    { key: 'category', type: 'select', from: 'categories', allowEmpty: 'dashboard.fields.allCategories' },
    { key: 'style', type: 'segmented', default: 'tiles', options: ['tiles', 'list'].map((value) => ({ value, labelKey: `dashboard.fields.style.${value}` })) },
    limit(12, 2, 40),
  ],
});
