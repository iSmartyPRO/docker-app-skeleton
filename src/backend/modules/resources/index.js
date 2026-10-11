import { ensureResourcesSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';

/** Online resources module descriptor: company links as icon tiles, usually on the home page. */
export default {
  id: 'resources',
  schema: ensureResourcesSchema,
  routes: privateRoutes,
  publicRoutes,
  publicPrefix: '/res',
};
