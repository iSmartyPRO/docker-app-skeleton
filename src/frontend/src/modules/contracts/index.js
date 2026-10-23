/*
 * Browser entry of the Contracts package (web/index.js, docs/module-packages.md
 * «Web contract»): imported at start-up while the module is installed and on. Keep
 * it small: the pages and the dashboard widget load when opened.
 */
import './register';

export default {
  id: 'contracts',
  App: () => import('./ContractsApp'),
  Settings: () => import('./ContractsSettings'),
  tour: 'contracts',
};
