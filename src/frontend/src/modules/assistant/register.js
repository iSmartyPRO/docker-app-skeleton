/*
 * Frontend entry of the Assistant module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazy } from 'react';
import { contribute } from '../../platform/extensions';

// The robot assistant over every page (after the page, for signed-in people while the module is on).
contribute('app.overlays', { id: 'assistant', module: 'assistant', signedIn: true, Component: lazy(() => import('./Assistant')) });

// Account → Appearance: the person's assistant settings.
contribute('account.appearance', { id: 'assistant', order: 50, Component: lazy(() => import('./AccountAssistant')) });

// The robot drawing of the maintenance screen (fetched when the page is idle).
contribute('maintenance.art', { id: 'robot', load: () => import('./robots') });
