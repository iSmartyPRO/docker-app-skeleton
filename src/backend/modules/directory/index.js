import { ensureDirectorySchema } from './schema.js';
import { directoryRoutes } from './routes.js';
import { registerEmployeeSection } from './employeeSection.js';

/** AD directory module («Каталог AD»): OUs, users, groups and computers of Active Directory within a managed root. */
export default {
  id: 'directory',
  schema: ensureDirectorySchema,
  routes: directoryRoutes,
  register() {
    // The «AD» section of employee cards (modules/employees/api.js), while Employees is installed.
    registerEmployeeSection();
  },
};
