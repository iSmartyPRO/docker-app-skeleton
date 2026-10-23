import { modules } from '../../platform/registry.js';

/*
 * The AD directory links AD accounts with employee cards (Employees, a separate
 * module package). Employees is an optional link: its public api.js
 * (cardsForAdAccounts, findCardsByName, setAdAccount, clearAdAccount) is looked
 * up at call time — null while it is not installed — and the directory never
 * queries the employees tables itself.
 */
export function employeesApi() {
  const api = modules.loaded('employees')?.api;
  return api && typeof api.cardsForAdAccounts === 'function' ? api : null;
}
