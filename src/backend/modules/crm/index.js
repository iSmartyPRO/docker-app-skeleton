import { createCrmSchema, startCrm } from './schema.js';
import { privateRoutes } from './routes.js';
import { query } from '../../config/database.js';
import { localizedSettings, sanitizeSettings } from './settings.js';
import * as api from './api.js';
// Demo data (Settings → Modules → Demo data): registerDemo at import time.
import './demo.js';

/*
 * CRM module descriptor (spec: docs/crm.md). Distributed as a module package
 * (docs/module-packages.md), not built into the core: scripts/build-module.mjs
 * bundles this file into server/index.js, module.json holds the manifest facts,
 * settings.js the settings defaults and sanitizer. Other modules reach it only
 * through the registry (`modules.loaded('crm')?.api`, the «Связи» provider
 * 'crm.deal', the event 'crm.deal.stage'), at call time: packages load in any order.
 */
export default {
  id: 'crm',
  // 001 is the schema the CRM had while built into the core: CREATE … IF NOT EXISTS, so on a portal
  // that already has the crm_* tables it changes nothing. Later changes: migrations/NNN_name.sql|js.
  migrations: [{ id: '001_init', up: createCrmSchema }],
  routes: privateRoutes,
  api,
  sanitizeSettings,
  localizedSettings,
  register(ctx) {
    // Activity reminders, deal conversations (Chat entity rooms).
    startCrm();
    ctx.registerLinkProvider(api.dealLinkProvider);
    // API tokens can be narrowed to pipelines (every pipeline is offered; deals inside keep their own visibility).
    ctx.registerTokenResources('crm.pipelines', {
      async list() {
        const { rows } = await query(`SELECT id, name, color FROM crm_pipelines WHERE archived_at IS NULL ORDER BY sort, id`).catch(() => ({ rows: [] }));
        return rows;
      },
    });
  },
};
