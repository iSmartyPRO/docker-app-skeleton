import { ensureCrmSchema } from './schema.js';
import { privateRoutes } from './routes.js';

/** CRM module descriptor (see modules/index.js for the contract; spec: docs/crm.md). */
export default {
  id: 'crm',
  schema: ensureCrmSchema,
  routes: privateRoutes,
};
