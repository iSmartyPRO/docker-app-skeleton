import { ensureFilesSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';

/** Files module descriptor (see modules/index.js for the contract). */
export default {
  id: 'files',
  schema: ensureFilesSchema,
  routes: privateRoutes,
  publicRoutes,
  publicPrefix: '/l',
};
