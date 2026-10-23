import { lazy } from 'react';

/*
 * Dashboard widgets (frontend) — the extension point modules use to put
 * widgets on the dashboard; the dashboard shell imports no module.
 *
 *   registerWidget('myTasks', {
 *     module: 'tasks',            // offered while the module is on (the server decides: GET /app/dashboard → available)
 *     order: 40,                  // place in the gallery and the catalog
 *     category: 'tasks',          // gallery group: overview, tasks, calendar, content, business, admin, tools
 *     icon: 'tasks', color: '#10B981',
 *     size: { w: 5, h: 6, minW: 3, minH: 3 },
 *     preview: 'list',            // gallery sketch
 *     fit, bare, autoHeight, link, fields: [...]      // see modules/dashboard/catalog.js
 *     Component: lazyWidget(() => import('./DashboardWidgets'), 'MyTasks'),   // props: { widget, size, onSettings }
 *   });
 *
 * The server side registers the same type (src/backend/platform/widgets.js)
 * with its data provider; widgets read it with useWidgetData(type, settings)
 * (platform/widgets/api.js) and draw states and charts with common.jsx and
 * charts.jsx.
 */

const definitions = new Map();

/** Every registered widget by type, in `order` (one live object: the dashboard reads it directly). */
export const WIDGET_REGISTRY = {};

function rebuild() {
  for (const key of Object.keys(WIDGET_REGISTRY)) delete WIDGET_REGISTRY[key];
  [...definitions.entries()].sort((a, b) => (a[1].order ?? 1000) - (b[1].order ?? 1000)).forEach(([type, def]) => {
    WIDGET_REGISTRY[type] = def;
  });
}

export function registerWidget(type, definition) {
  if (!type || !definition?.Component) throw new Error('registerWidget needs a type and a Component');
  definitions.set(type, definition);
  rebuild();
  return () => {
    if (definitions.get(type) === definition) {
      definitions.delete(type);
      rebuild();
    }
  };
}

/** A lazily loaded widget component: `name` is the export (default when omitted). */
export function lazyWidget(loader, name = 'default') {
  return lazy(() => loader().then((module) => ({ default: module[name] })));
}
