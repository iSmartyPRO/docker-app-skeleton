import { ensureDashboardSchema } from './schema.js';
import { privateRoutes } from './routes.js';

/** Dashboard module descriptor: personal widgets over the other modules' data. */
export default {
  id: 'dashboard',
  schema: ensureDashboardSchema,
  routes: privateRoutes,
};
