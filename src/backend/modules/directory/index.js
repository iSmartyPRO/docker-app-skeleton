import { ensureDirectorySchema } from './schema.js';
import { directoryRoutes } from './routes.js';
import './employeeSection.js'; // the «AD» section of employee cards (modules/employees/extensions.js)

/** AD directory module («Каталог AD»): OUs, users, groups and computers of Active Directory within a managed root. */
export default {
  id: 'directory',
  schema: ensureDirectorySchema,
  routes: directoryRoutes,
};
