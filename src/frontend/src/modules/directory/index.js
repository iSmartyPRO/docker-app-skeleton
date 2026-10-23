/*
 * Browser entry of the AD directory package (web/index.js, docs/module-packages.md
 * «Web contract»): imported at start-up while the module is installed and on. Keep
 * it small: the pages load when opened.
 */
import './register';

export default {
  id: 'directory',
  App: () => import('./DirectoryApp'),
  Settings: () => import('./DirectorySettings'),
  tour: 'directory',
};
