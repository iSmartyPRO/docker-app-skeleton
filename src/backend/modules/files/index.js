import { query } from '../../config/database.js';
import { contextFromRequest, levelMap } from '../shared/acl.js';
import { ensureFilesSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';
import { filesPreview } from './preview.js';
import { registerFilesWidgets } from './widgets.js';
import * as api from './api.js';

/** Files module descriptor (see modules/index.js for the contract). */
export default {
  id: 'files',
  schema: ensureFilesSchema,
  routes: privateRoutes,
  publicRoutes,
  publicPrefix: '/l',
  api,
  register(ctx) {
    registerFilesWidgets(ctx);
    // Rich previews of public links /l/<token> (services/linkPreview).
    ctx.registerPreviewProvider((route) => filesPreview(route.token));
    ctx.registerTokenResources('files.spaces', {
      async list(req, { all = false } = {}) {
        const levels = await levelMap('fs_space_acl', contextFromRequest({ ...req, apiLimits: null }, 'files.admin'));
        const { rows } = await query(`SELECT id, name, color FROM fs_spaces ORDER BY LOWER(name)`).catch(() => ({ rows: [] }));
        return rows.filter((row) => all || levels.of(row.id) > 0);
      },
    });
  },
};
