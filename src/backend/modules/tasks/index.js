import { ensureTasksSchema } from './schema.js';
import { privateRoutes } from './routes.js';

/** Tasks module descriptor (see modules/index.js for the contract). */
export default {
  id: 'tasks',
  schema: ensureTasksSchema,
  routes: privateRoutes,
};
