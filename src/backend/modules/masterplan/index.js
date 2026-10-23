import { ensureMasterplanSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import * as api from './api.js';
import { registerContractSync } from './contractSync.js';
import { objectSource } from './links.js';

/** Masterplan module descriptor (see modules/index.js for the contract; spec: docs/masterplan.md). */
export default {
  id: 'masterplan',
  schema: ensureMasterplanSchema,
  routes: privateRoutes,
  api,
  register(ctx) {
    // A unit follows the contract that sells it (contract.deposit_received / signed / paid).
    registerContractSync(ctx.events);
    // Procurement and Warehouse pick «objects» (projects and their plots / objects) through the core.
    ctx.registerObjectSource(objectSource);
  },
};
