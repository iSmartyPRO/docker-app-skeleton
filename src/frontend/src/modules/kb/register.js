/*
 * Frontend entry of the Knowledge base module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { limit } from '../../platform/widgets/fields';
import { lazy } from 'react';
import { contribute, provideModule } from '../../platform/extensions';

// Public shares /s/<slug> (no sign-in).
contribute('app.publicRoutes', { id: 'kb.share', path: '/s/:slug/*', Component: lazy(() => import('./PublicShare')) });

// The document viewers (core) show an article's files with this.
provideModule('kb', { Attachments: lazy(() => import('./components/Attachments')) });

// Dashboard widgets (the server registers the same types with their data).
registerWidget('kbRecent', {
  order: 120,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'KbRecent'),
  module: 'kb',
  category: 'content',
  icon: 'graduation',
  color: '#0EA5E9',
  link: '/app/kb',
  fit: true,
  size: { w: 4, h: 6, minW: 3, minH: 3 },
  preview: 'list',
  fields: [limit(6, 3, 12)],
});
