/*
 * Browser entry of the Robot assistant package (web/index.js, docs/module-packages.md
 * «Web contract»): imported at start-up while the module is installed and on. It has
 * no page of its own (module.json `web.page: false`): register.js adds the overlay,
 * the Account → Appearance section and the maintenance picture (contributions).
 */
import './register';

export default {
  id: 'assistant',
  Settings: () => import('./AssistantSettings'),
};
