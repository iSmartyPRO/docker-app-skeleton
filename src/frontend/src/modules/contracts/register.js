/*
 * Frontend entry of the Contracts module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { registerTour } from '../../tour/engine';
import contractsTour from './tour';
// How contract events read in conversations (Chat).
import './chatEvents';

registerTour(contractsTour);

// Dashboard widgets (the server registers the same types with their data).
registerWidget('contractsPayments', {
  order: 150,
  Component: lazyWidget(() => import('./PaymentsWidget'), 'default'),
  module: 'contracts',
  category: 'business',
  icon: 'wallet',
  color: '#0EA5E9',
  link: '/app/contracts/payments',
  fit: true,
  size: { w: 4, h: 5, minW: 3, minH: 4 },
  preview: 'list',
  fields: [],
});
