import { createMasterplanSchema, startMasterplan } from './schema.js';
import { privateRoutes } from './routes.js';
import * as api from './api.js';
import { registerContractSync } from './contractSync.js';
import { objectSource } from './links.js';
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
  // Later changes: migrations/NNN_name.sql|js files (never edit 001).
  migrations: [{ id: '001_init', up: createMasterplanSchema }],
  routes: privateRoutes,
  api,
  sanitizeSettings,
  register(ctx) {
    // Booking timers, daily construction checks, CRM deal stage hooks.
    startMasterplan();
    // A unit follows the contract that sells it (contract.deposit_received / signed / paid).
    registerContractSync(ctx.events);
    // Procurement and Warehouse pick «objects» (projects and their plots / objects) through the core.
    ctx.registerObjectSource(objectSource);
  },
};
