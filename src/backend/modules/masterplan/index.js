import { ensureMasterplanSchema } from './schema.js';
import { privateRoutes } from './routes.js';

/** Masterplan module descriptor (see modules/index.js for the contract; spec: docs/masterplan.md). */
export default {
  id: 'masterplan',
  schema: ensureMasterplanSchema,
  routes: privateRoutes,
};
