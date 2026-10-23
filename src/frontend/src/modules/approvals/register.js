/*
 * Frontend entry of the Approvals («Ждёт меня») module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { limit } from '../../platform/widgets/fields';
import { lazy } from 'react';
import { contribute } from '../../platform/extensions';
import { registerTour } from '../../tour/engine';
import approvalsTour from './tour';

registerTour(approvalsTour);

// «Ждёт меня» in the top bar.
contribute('header.actions', { id: 'inbox', module: 'approvals', order: 20, Component: lazy(() => import('./InboxButton')) });

// Account → «Мой заместитель».
contribute('app.accountRoutes', { id: 'substitute', path: 'substitute', Component: lazy(() => import('./MySubstitute')) });

// Dashboard widgets (the server registers the same types with their data).
registerWidget('inbox', {
  order: 30,
  Component: lazyWidget(() => import('./InboxWidget'), 'default'),
  module: 'approvals',
  category: 'overview',
  icon: 'inbox',
  color: '#1C7ED6',
  fit: true,
  size: { w: 4, h: 6, minW: 3, minH: 3 },
  preview: 'list',
  fields: [limit(6, 3, 20)],
});
