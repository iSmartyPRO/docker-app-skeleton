/*
 * Frontend entry of the Files module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { limit } from '../../platform/widgets/fields';
import { lazy } from 'react';
import { contribute, provideModule } from '../../platform/extensions';

// Public links /l/<token> (no sign-in).
contribute('app.publicRoutes', { id: 'files.link', path: '/l/:token', Component: lazy(() => import('./PublicLink')) });

// What other modules may use when Files is installed (manifest «enhances»): pick, browse and show nodes.
provideModule('files', {
  FilePicker: lazy(() => import('./components/dialogs').then((module) => ({ default: module.FilePicker }))),
  FolderBrowser: lazy(() => import('./components/FolderBrowser')),
  NodeViewer: lazy(() => import('./components/NodeViewer')),
});

// Dashboard widgets (the server registers the same types with their data).
registerWidget('recentFiles', {
  order: 100,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'RecentFiles'),
  module: 'files',
  category: 'content',
  icon: 'folder',
  color: '#3B82F6',
  link: '/app/files/recent',
  fit: true,
  size: { w: 4, h: 5, minW: 3, minH: 3 },
  preview: 'files',
  fields: [{ key: 'showUsage', type: 'switch', default: true }, limit(6, 3, 20)],
});
