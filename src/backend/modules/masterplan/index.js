import { MASTERPLAN_MIGRATIONS, startMasterplan } from './schema.js';
import { privateRoutes } from './routes.js';
import * as api from './api.js';
import { registerContractSync, scheduleContractResync } from './contractSync.js';
import { objectSource } from './links.js';
import { scheduleCrmResync } from './crmLink.js';
import { watchCrmTable } from './shapes.js';
import { sanitizeSettings } from './settings.js';
// Demo data (Settings → Modules → Demo data): registerDemo at import time.
import './demo.js';

/*
 * Masterplan module descriptor (spec: docs/masterplan.md). Distributed as a
 * module package (docs/module-packages.md), not built into the core:
 * scripts/build-module.mjs bundles this file into server/index.js, module.json
 * holds the manifest facts, settings.js the settings defaults and sanitizer.
 */
export default {
  id: 'masterplan',
  // 001 is the schema Masterplan had while it was built into the core: CREATE … IF NOT EXISTS,
  // so on a portal that already has the mp_* tables it changes nothing (and keeps the data).
  // 002 drops its foreign keys into the CRM's tables (the CRM became a package; 001 no longer creates
  // them on a new database, so both end the same). Later changes: new numbers, never edit applied ones.
  migrations: MASTERPLAN_MIGRATIONS,
  routes: privateRoutes,
  api,
  sanitizeSettings,
  register(ctx) {
    // Booking timers, daily construction checks, CRM deal stage hooks.
    startMasterplan();
    // A unit follows the contract that sells it (contract.deposit_received / signed / paid).
    registerContractSync(ctx.events);
    // Contract events of the time it was not installed went to nobody: catch up once per install.
    scheduleContractResync(ctx);
    // Likewise the deal history of units sold / booked while the CRM was absent: once per CRM install.
    scheduleCrmResync(ctx);
    // «Is crm_deals there?» is cached briefly; package installs, removals and data deletions reset it.
    watchCrmTable(ctx.events);
    // Procurement and Warehouse pick «objects» (projects and their plots / objects) through the core.
    ctx.registerObjectSource(objectSource);
  },
};
