import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSettings, parseSettings } from '../services/settings.js';
import { MODULE_CATALOG } from './catalog.js';
import kb from './kb/index.js';
import tasks from './tasks/index.js';
import calendar from './calendar/index.js';

/*
 * Module platform.
 *
 * A module is a folder under src/backend/modules/<id>/ exporting:
 *   id            short id, used in URLs: /app/<id>, /api/app/<id>
 *   schema()      creates/upgrades its tables (idempotent)
 *   routes()      Express router for signed-in users, mounted at /api/app/<id>
 *   publicRoutes  optional router for anonymous visitors (e.g. share links)
 *   publicPrefix  where publicRoutes live under /api (e.g. "/s")
 * plus an entry in modules/catalog.js (permissions, default settings).
 *
 * A disabled module answers 404 everywhere, so it is invisible.
 */

export const MODULES = [kb, tasks, calendar];

async function moduleState(id) {
  const parsed = parseSettings(await getSettings());
  return parsed.modules[id];
}

function enabledOnly(id) {
  return async (req, res, next) => {
    try {
      const state = await moduleState(id);
      if (!state?.enabled) {
        res.status(404).json({ success: false, error: 'Module is disabled', code: 'MODULE_DISABLED' });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function ensureModuleSchemas() {
  for (const module of MODULES) {
    await module.schema();
  }
}

/** Mounts every module under /api: /app/<id> (auth) and its public prefix. */
export function moduleRouter() {
  const router = Router();

  router.get('/apps', requireAuth, async (req, res, next) => {
    try {
      const parsed = parseSettings(await getSettings());
      res.json({
        success: true,
        apps: MODULE_CATALOG.map((module) => ({ id: module.id, enabled: parsed.modules[module.id]?.enabled })).filter(
          (app) => app.enabled
        ),
      });
    } catch (err) {
      next(err);
    }
  });

  for (const module of MODULES) {
    router.use(`/app/${module.id}`, enabledOnly(module.id), requireAuth, module.routes());
    if (module.publicRoutes) {
      router.use(module.publicPrefix, enabledOnly(module.id), module.publicRoutes());
    }
  }
  return router;
}
