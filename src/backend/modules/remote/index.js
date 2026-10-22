import { ensureRemoteSchema } from './schema.js';
import { privateRoutes } from './routes.js';

/** Remote access & assistance descriptor: computers, support and announced monitoring, audit. */
export default {
  id: 'remote',
  schema: ensureRemoteSchema,
  routes: privateRoutes,
};
