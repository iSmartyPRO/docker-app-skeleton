import { ensureProcurementSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { registerProcurementApproval } from './approval.js';
import { registerRequestChat } from './chat.js';
import * as api from './api.js';

/*
 * Procurement: purchase requests → approval → payment → delivery
 * (spec: docs/specs/business-processes.ru.md §5, docs/procurement.md).
 * Registers its approval document type, the accounting inbox provider and
 * the request conversation at import time.
 */

registerProcurementApproval();
registerRequestChat();

export default {
  id: 'procurement',
  schema: ensureProcurementSchema,
  routes: privateRoutes,
  api,
  register(ctx) {
    // «Закупки» on the dashboard (the widget reads the module's own API).
    ctx.registerWidget({ type: 'procurement' });
  },
};
