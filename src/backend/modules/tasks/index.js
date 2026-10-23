import { query } from '../../config/database.js';
import { contextFromRequest, levelMap, levelOn } from '../shared/acl.js';
import { ensureTasksSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { registerTaskWidgets } from './widgets.js';

/** Tasks module descriptor (see modules/index.js for the contract). */
export default {
  id: 'tasks',
  schema: ensureTasksSchema,
  routes: privateRoutes,
  register(ctx) {
    registerTaskWidgets(ctx);
    // Notification subscriptions to a project: only shared projects the person can see.
    ctx.registerFollowable('tasks.project', {
      async canFollow(req, id) {
        const { rows } = await query(`SELECT is_personal FROM task_projects WHERE id = $1`, [id]);
        return Boolean(rows[0]) && !rows[0].is_personal && (await levelOn('task_acl', id, contextFromRequest(req, 'tasks.admin'))) > 0;
      },
    });
    // API tokens can be narrowed to projects (an administrator sees all).
    ctx.registerTokenResources('tasks.projects', {
      async list(req, { all = false } = {}) {
        const levels = await levelMap('task_acl', contextFromRequest({ ...req, apiLimits: null }, 'tasks.admin'));
        const { rows } = await query(`SELECT id, name, key AS code, color, is_personal FROM task_projects WHERE archived_at IS NULL ORDER BY is_personal DESC, LOWER(name)`).catch(() => ({ rows: [] }));
        return rows.filter((row) => all || row.is_personal || levels.of(row.id) > 0);
      },
    });
  },
};
