import { ensureOrgSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import * as api from './api.js';

/*
 * Org structure (spec docs/specs/platform-2.0.ru.md §3, docs/org-structure.md):
 * a core service, always on. The tree of units with configurable types,
 * heads, purposes and time zones; the API other modules use lives in api.js.
 * It is first in MODULES so its tables exist before the modules that point at them.
 */
export default {
  id: 'org',
  schema: ensureOrgSchema,
  routes: privateRoutes,
  api,
};
