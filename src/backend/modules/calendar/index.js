import { ensureCalendarSchema } from './schema.js';
import { privateRoutes } from './routes.js';

/** Calendar module descriptor (see modules/index.js for the contract). */
export default {
  id: 'calendar',
  schema: ensureCalendarSchema,
  routes: privateRoutes,
};
