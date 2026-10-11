import { ensureCompaniesSchema } from './schema.js';
import { privateRoutes } from './routes.js';

/** Counterparties module descriptor: companies, contact people, careers, history and ratings. */
export default {
  id: 'companies',
  schema: ensureCompaniesSchema,
  routes: privateRoutes,
};
