/*
 * What the File server package adds outside its own pages (imported by its web
 * entry index.js): its tour, the public link page /d/<token>, the module API for
 * other modules (Tasks: «Из файлового сервера»), the dashboard widgets.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { period, limit } from '../../platform/widgets/fields';
import { lazy } from 'react';
import { contribute, provideModule } from '../../platform/extensions';
import { registerTour } from '../../tour/engine';
import driveTour from './tour';

registerTour(driveTour);

// Public links /d/<token> (no sign-in).
contribute('app.publicRoutes', { id: 'drive.link', path: '/d/:token', Component: lazy(() => import('./PublicDrive')) });

// What other modules may use when the File server is installed: its shares and folders (loaded on first use).
const driveApi = () => import('./api').then((module) => module.driveApi);
provideModule('drive', {
  api: {
    home: (...args) => driveApi().then((api) => api.home(...args)),
    list: (...args) => driveApi().then((api) => api.list(...args)),
  },
});

// Dashboard widgets (the server registers the same types with their data).
registerWidget('drive', {
  order: 110,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'Drive'),
  module: 'drive',
  category: 'content',
  icon: 'server',
  color: '#2563EB',
  link: '/app/drive',
  fit: true,
  size: { w: 4, h: 5, minW: 3, minH: 3 },
  preview: 'files',
  fields: [
    { key: 'list', type: 'segmented', default: 'recent', options: ['recent', 'favorites'].map((value) => ({ value, labelKey: `dashboard.fields.list.${value}` })) },
    { key: 'showShares', type: 'switch', default: true },
    limit(6, 3, 20),
  ],
});

registerWidget('driveActivity', {
  order: 220,
  Component: lazyWidget(() => import('./DashboardWidgets'), 'DriveActivity'),
  module: 'drive',
  category: 'admin',
  icon: 'shield',
  color: '#0F766E',
  link: '/app/drive/activity',
  size: { w: 6, h: 5, minW: 4, minH: 4 },
  preview: 'columns',
  fields: [period([7, 14, 30, 90], 14)],
});
