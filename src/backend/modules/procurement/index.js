import { createProcurementSchema, startProcurement } from './schema.js';
import { privateRoutes } from './routes.js';
import { registerProcurementApproval } from './approval.js';
import { registerRequestChat } from './chat.js';
import { sanitizeSettings } from './settings.js';
import * as api from './api.js';
// Demo data (Settings → Modules → Demo data): registerDemo at import time.
import './demo.js';

/*
 * Procurement: purchase requests → approval → payment → delivery
 * (spec: docs/specs/business-processes.ru.md §5, docs/procurement.md).
 *
 * Distributed as a module package (docs/module-packages.md), not built into the
 * core: scripts/build-module.mjs bundles this file into server/index.js,
 * module.json holds the manifest facts, settings.js the settings defaults and
 * sanitizer. It requires Approvals (core); Counterparties, Masterplan (through the
 * core «objects» source), the CRM, Contracts, Files and Chat are optional links
 * reached through the registry at call time (packages load in any order).
 * Warehouse uses its public `api` (receipts from requests, delivery marks).
 */

export default {
  id: 'procurement',
  // 001 is the schema Procurement had while built into the core: CREATE … IF NOT EXISTS, so on a portal
  // that already has the proc_* tables it changes nothing. Later changes: migrations/NNN_name.sql|js.
  migrations: [{ id: '001_init', up: createProcurementSchema }],
  routes: privateRoutes,
  api,
  sanitizeSettings,
  register(ctx) {
    // The approval document type 'procurement.request' (core approvals service), the accounting
    // «Ждёт меня» items, request conversations (Chat entity rooms) and the deadline reminders.
    registerProcurementApproval();
    registerRequestChat();
    startProcurement();
    // «Закупки» on the dashboard (the widget reads the module's own API).
    ctx.registerWidget({ type: 'procurement' });
  },
};
