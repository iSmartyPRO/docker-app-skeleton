/*
 * Tabs other modules add to the employee card (docs/employees.md → «Hooks
 * for other modules»). The AD directory module, for one, registers an «AD»
 * tab at import time:
 *
 *   import { registerEmployeeTab } from '../employees/extensions';
 *
 *   registerEmployeeTab({
 *     id: 'ad',                                   // = the server extension id (its data arrives as `data`)
 *     labelKey: 'ad.employeeTab',                 // i18n key of the tab title
 *     order: 50,                                  // position among the extra tabs
 *     when: ({ employee, meta, data }) => Boolean(data),   // optional: show only when this is true
 *     always: false,                              // true: show even when the server sent no data for it
 *     Component: lazy(() => import('../ad/EmployeeAdTab')), // props: { employee, data, reload, can }
 *   });
 *
 * The server side is registerEmployeeExtension() in
 * src/backend/modules/employees/extensions.js; its `load()` result is passed
 * to the tab as `data` (or { error } when it failed).
 */

const tabs = new Map();
const listeners = new Set();
let snapshot = [];
const refresh = () => {
  snapshot = [...tabs.values()].sort((a, b) => a.order - b.order);
  listeners.forEach((listener) => listener());
};

export function registerEmployeeTab(definition) {
  if (!definition?.id || !definition.Component) throw new Error('registerEmployeeTab needs { id, Component }');
  tabs.set(definition.id, { order: 100, ...definition });
  refresh();
  return () => {
    if (tabs.get(definition.id)?.Component === definition.Component) {
      tabs.delete(definition.id);
      refresh();
    }
  };
}

/** The registered tabs (a stable array between changes, for useSyncExternalStore). */
export const employeeTabs = () => snapshot;

export function subscribeEmployeeTabs(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
