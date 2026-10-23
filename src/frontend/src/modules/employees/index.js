/*
 * Browser entry of the Employees package (web/index.js, docs/module-packages.md
 * «Web contract»): imported at start-up while the module is installed and on. Keep
 * it small: the pages load when opened.
 */
import './register';

export default {
  id: 'employees',
  App: () => import('./EmployeesApp'),
  Settings: () => import('./EmployeesSettings'),
  tour: 'employees',
};
