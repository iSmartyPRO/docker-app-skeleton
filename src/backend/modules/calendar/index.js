import { query } from '../../config/database.js';
import { contextFromRequest, levelMap } from '../shared/acl.js';
import { ensureCalendarSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { canViewCalendar } from './service.js';
import { registerCalendarWidgets } from './widgets.js';

/** Calendar module descriptor (see modules/index.js for the contract). */
export default {
  id: 'calendar',
  schema: ensureCalendarSchema,
  routes: privateRoutes,
  register(ctx) {
    registerCalendarWidgets(ctx);
    ctx.registerFollowable('calendar.calendar', { canFollow: (req, id) => canViewCalendar(contextFromRequest(req, 'calendar.admin'), id) });
    ctx.registerTokenResources('calendar.calendars', {
      async list(req, { all = false } = {}) {
        const levels = await levelMap('cal_acl', contextFromRequest({ ...req, apiLimits: null }, 'calendar.admin'));
        const { rows } = await query(
          `SELECT c.id, c.name, c.color, c.is_personal, COALESCE(u.display_name, u.username) AS owner FROM cal_calendars c LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.is_personal, LOWER(c.name)`
        ).catch(() => ({ rows: [] }));
        return rows.filter((row) => all || levels.of(row.id) > 0);
      },
    });
  },
};
