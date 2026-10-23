import { createDirectorySchema } from './schema.js';
import { directoryRoutes } from './routes.js';
import { registerEmployeeSection } from './employeeSection.js';
import { sanitizeSettings } from './settings.js';
// Demo data (Settings → Modules → Demo data): the demo directory, registerDemo at import time.
import './demo.js';

/*
 * AD directory module («Каталог AD»): OUs, users, groups and computers of Active
 * Directory within a managed root.
 *
 * Distributed as a module package (docs/module-packages.md), not built into the
 * core: scripts/build-module.mjs bundles this file into server/index.js,
 * module.json holds the manifest facts, settings.js the settings defaults and
 * sanitizer. It requires the Active Directory integration (or the demo
 * directory); the File server (its AD connection and the people's stored AD
 * passwords, driveLink.js) and Employees (the «AD» section of cards, the cards'
 * AD logins, employeesLink.js) are optional links reached through their public
 * APIs at call time (packages load in any order).
 */
export default {
  id: 'directory',
  // 001 is the schema the directory had while built into the core: CREATE … IF NOT EXISTS, so on a
  // portal that already has the ad_* tables it changes nothing. Later changes: migrations/NNN_name.sql|js.
  migrations: [{ id: '001_init', up: createDirectorySchema }],
  routes: directoryRoutes,
  sanitizeSettings,
  register() {
    // The «AD» section of employee cards (modules/employees/api.js), while Employees is installed.
    registerEmployeeSection();
  },
};
