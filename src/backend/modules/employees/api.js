/*
 * Public API of Employees for other modules (docs/employees.md → «Hooks for
 * other modules»). Employees is an optional link for them (a module package), so
 * they reach it at run time:
 *
 *   modules.whenLoaded('employees', (employees) => employees.registerEmployeeExtension({ id, module, visible, load }));
 *   modules.loaded('employees')?.api.cardsForAdAccounts({ logins, userIds })
 */

export { registerEmployeeExtension, listEmployeeExtensions } from './extensions.js';
// The AD login of employee cards (the AD directory module: links, the picker).
export { cardsForAdAccounts, clearAdAccount, findCardsByName, setAdAccount } from './adLinks.js';
