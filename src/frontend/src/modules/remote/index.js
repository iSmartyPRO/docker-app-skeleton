/*
 * Browser entry of the Remote access package (web/index.js, docs/module-packages.md
 * «Web contract»): imported at start-up while the module is installed and on. Keep it
 * small: the pages — and the viewers with guacamole-common-js and noVNC — load when opened.
 * The page is listed only for people with a remote.* permission (module.json webPermission).
 */
import './register';

export default {
  id: 'remote',
  App: () => import('./RemoteApp'),
  Settings: () => import('./RemoteSettings'),
  tour: 'remote',
};
