/*
 * Frontend entry of the Warehouse module (loaded by modules/registry.js; in a
 * package this is web/index.js): what the module adds outside its own pages.
 * Keep it small — anything heavy is lazy.
 */
import { lazyWidget, registerWidget } from '../../platform/widgets/registry';
import { registerTour } from '../../tour/engine';
import warehouseTour from './tour';

registerTour(warehouseTour);

// Dashboard widgets (the server registers the same types with their data).
registerWidget('warehouseLow', {
  order: 160,
  Component: lazyWidget(() => import('./WarehouseWidgets'), 'LowStockWidget'),
  module: 'warehouse',
  category: 'business',
  icon: 'box',
  color: '#F59E0B',
  link: '/app/warehouse/stock?chip=below_min',
  fit: true,
  size: { w: 4, h: 5, minW: 3, minH: 3 },
  preview: 'list',
  fields: [],
});

registerWidget('warehouseIncoming', {
  order: 170,
  Component: lazyWidget(() => import('./WarehouseWidgets'), 'IncomingWidget'),
  module: 'warehouse',
  category: 'business',
  icon: 'send',
  color: '#8B5CF6',
  link: '/app/warehouse/documents?chip=awaiting_receipt',
  fit: true,
  size: { w: 4, h: 5, minW: 3, minH: 3 },
  preview: 'list',
  fields: [],
});

registerWidget('warehouseMyTools', {
  order: 180,
  Component: lazyWidget(() => import('./WarehouseWidgets'), 'MyToolsWidget'),
  module: 'warehouse',
  category: 'business',
  icon: 'wrench',
  color: '#D9480F',
  link: '/app/warehouse/my-tools',
  fit: true,
  size: { w: 4, h: 5, minW: 3, minH: 3 },
  preview: 'list',
  fields: [],
});
