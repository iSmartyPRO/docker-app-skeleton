/*
 * Public API of Employees for other modules (docs/employees.md → «Hooks for
 * other modules»). Employees is an optional link for them, so they reach it at
 * run time:
 *
 *   modules.whenLoaded('employees', (employees) => employees.registerEmployeeExtension({ id, module, visible, load }));
 */

export { registerEmployeeExtension, listEmployeeExtensions } from './extensions.js';
