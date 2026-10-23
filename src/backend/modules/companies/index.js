import { ensureCompaniesSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { registerCompaniesWidgets } from './widgets.js';
import * as api from './api.js';

/** Counterparties (a core service): companies, contact people, careers, history and ratings. */
export default {
  id: 'companies',
  schema: ensureCompaniesSchema,
  routes: privateRoutes,
  api,
  register(ctx) {
    registerCompaniesWidgets(ctx);
  },
};
