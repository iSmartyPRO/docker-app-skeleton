import { createQrSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';
import { sanitizeSettings } from './settings.js';
// Demo data (Settings → Modules → Demo data): registerDemo at import time.
import './demo.js';

/*
 * QR codes module descriptor: branded codes from templates, dynamic links with scan counts
 * (docs/qr.md). Distributed as a module package (docs/module-packages.md), not built into the
 * core: scripts/build-module.mjs bundles this file into server/index.js, module.json holds the
 * manifest facts, settings.js the settings defaults and sanitizer.
 */
export default {
  id: 'qr',
  // 001 is the schema QR codes had while built into the core: CREATE … IF NOT EXISTS, so on a portal
  // that already has the qr_* tables it changes nothing. Later changes: migrations/NNN_name.sql|js.
  migrations: [{ id: '001_init', up: createQrSchema }],
  routes: privateRoutes,
  // Anonymous: logo files and the redirect of dynamic codes (/api/qr/go/<slug>; nginx maps /q/<slug> here).
  publicRoutes,
  publicPrefix: '/qr',
  sanitizeSettings,
};
