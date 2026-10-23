import { ensureCrmSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { query } from '../../config/database.js';
import * as api from './api.js';

/** CRM module descriptor (see modules/index.js for the contract; spec: docs/crm.md). */
export default {
  id: 'crm',
  schema: ensureCrmSchema,
  routes: privateRoutes,
  api,
  register(ctx) {
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
