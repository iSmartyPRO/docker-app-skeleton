import { ensureKbSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';

/** Knowledge base module descriptor (see modules/index.js for the contract). */
export default {
  id: 'kb',
  schema: ensureKbSchema,
  routes: privateRoutes,
  publicRoutes,
  publicPrefix: '/s',
};
