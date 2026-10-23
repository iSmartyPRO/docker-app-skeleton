/*
 * Browser entry of the Procurement package (web/index.js, docs/module-packages.md
 * «Web contract»): imported at start-up while the module is installed and on. Keep
 * it small: the pages and the dashboard widgets load when opened.
 */
import './register';

export default {
  id: 'procurement',
  App: () => import('./ProcurementApp'),
  Settings: () => import('./ProcurementSettings'),
  tour: 'procurement',
};
