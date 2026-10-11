import { Router } from 'express';
import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { hasPermission } from '../../services/permissions.js';
import { httpError, wrap } from '../shared/acl.js';
import { DEFAULT_LAYOUT, availableTypes, cleanLayout } from './widgets.js';
import { widgetData, widgetOptions } from './data.js';

const permissionsOf = (req) => req.access?.permissions || [];

function requireManage(req) {
  if (!hasPermission(permissionsOf(req), 'dashboard.admin')) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
}

async function defaultLayout() {
  const { rows } = await query(`SELECT widgets FROM dash_default WHERE id = 1`);
  return rows[0] ? { widgets: cleanLayout(rows[0].widgets), custom: true } : { widgets: DEFAULT_LAYOUT, custom: false };
}

/** /api/app/dashboard — the person's dashboard. */
export function privateRoutes() {
  const router = Router();

  router.get('/', wrap(async (req, res) => {
    const modules = parseSettings(await getSettings()).modules;
    const available = availableTypes(modules, permissionsOf(req));
    const { rows } = await query(`SELECT widgets, updated_at FROM dash_layouts WHERE user_id = $1`, [req.user.id]);
    const base = await defaultLayout();
    const widgets = rows[0] ? cleanLayout(rows[0].widgets) : base.widgets;
    res.json({
      success: true,
      // Widgets of modules switched off since stay stored, just not shown.
      widgets: widgets.filter((widget) => available.includes(widget.type)),
      hidden: widgets.filter((widget) => !available.includes(widget.type)).length,
      personal: Boolean(rows[0]),
      available,
      canManage: hasPermission(permissionsOf(req), 'dashboard.admin'),
      canPersonalize: modules.dashboard?.settings?.personalize !== false || hasPermission(permissionsOf(req), 'dashboard.admin'),
      defaultIsCustom: base.custom,
    });
  }));

  router.put('/layout', wrap(async (req, res) => {
    const modules = parseSettings(await getSettings()).modules;
    if (modules.dashboard?.settings?.personalize === false && !hasPermission(permissionsOf(req), 'dashboard.admin')) {
      throw httpError(403, 'Personal dashboards are turned off', 'FORBIDDEN');
    }
    const available = availableTypes(modules, permissionsOf(req));
    const incoming = cleanLayout(req.body?.widgets);
    // Keep stored widgets of modules that are off right now, so they come back with the module.
    const { rows } = await query(`SELECT widgets FROM dash_layouts WHERE user_id = $1`, [req.user.id]);
    const parked = rows[0] ? cleanLayout(rows[0].widgets).filter((widget) => !available.includes(widget.type)) : [];
    const widgets = [...incoming.filter((widget) => available.includes(widget.type)), ...parked].slice(0, 40);
    await query(
      `INSERT INTO dash_layouts (user_id, widgets, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET widgets = EXCLUDED.widgets, updated_at = NOW()`,
      [req.user.id, JSON.stringify(widgets)]
    );
    res.json({ success: true });
  }));

  router.delete('/layout', wrap(async (req, res) => {
    await query(`DELETE FROM dash_layouts WHERE user_id = $1`, [req.user.id]);
    res.json({ success: true });
  }));

  // The starting layout for everyone without their own (dashboard.admin).
  router.put('/default', wrap(async (req, res) => {
    requireManage(req);
    const widgets = cleanLayout(req.body?.widgets);
    await query(
      `INSERT INTO dash_default (id, widgets, updated_by, updated_at) VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET widgets = EXCLUDED.widgets, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [JSON.stringify(widgets), req.user.id]
    );
    res.json({ success: true });
  }));
  router.delete('/default', wrap(async (req, res) => {
    requireManage(req);
    await query(`DELETE FROM dash_default WHERE id = 1`);
    res.json({ success: true });
  }));

  router.get('/options', wrap(async (req, res) => res.json({ success: true, ...(await widgetOptions(req)) })));
  router.get('/data/:type', wrap(async (req, res) => res.json({ success: true, ...(await widgetData(req, req.params.type, req.query)) })));

  return router;
}
