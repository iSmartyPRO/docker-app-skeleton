/*
 * Tabs other modules add to the employee card (docs/employees.md → «Hooks
 * for other modules»). The AD directory module, for one, registers an «AD»
 * tab from its register.js, through the shell (no import of this module):
 *
 *   import { contribute } from '../../platform/extensions';
 *
 *   contribute('employees.tabs', {
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

import { contribute, contributions, subscribe } from '../../platform/extensions';

// The tabs live in the shell's extension point «employees.tabs», so modules add them without importing Employees.
export function registerEmployeeTab(definition) {
  if (!definition?.id || !definition.Component) throw new Error('registerEmployeeTab needs { id, Component }');
  return contribute('employees.tabs', { order: 100, ...definition });
}

/** The registered tabs (a stable array between changes, for useSyncExternalStore). */
export const employeeTabs = () => contributions('employees.tabs');

export function subscribeEmployeeTabs(listener) {
  return subscribe('employees.tabs', listener);
}
