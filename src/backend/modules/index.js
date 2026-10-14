import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSettings, parseSettings } from '../services/settings.js';
import { MODULE_CATALOG } from './catalog.js';
import files from './files/index.js';
import kb from './kb/index.js';
import tasks from './tasks/index.js';
import calendar from './calendar/index.js';
import drive from './drive/index.js';
import resources from './resources/index.js';
import companies from './companies/index.js';
import crm from './crm/index.js';
import masterplan from './masterplan/index.js';
import dashboard from './dashboard/index.js';
import chat from './chat/index.js';
import assistant from './assistant/index.js';
import approvals from './approvals/index.js';
import contracts from './contracts/index.js';
import procurement from './procurement/index.js';
import warehouse from './warehouse/index.js';

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

// Files first: the knowledge base keeps its files there.
// Chat before tasks: task conversations are entity rooms of the chat module.
// CRM after companies and chat: deals point at companies and people, and have conversations.
// Masterplan after CRM: units point at CRM deals and Counterparties.
// Procurement after the modules it links to (Counterparties, CRM, Masterplan, Files, Chat).
// Warehouse after Procurement and Masterplan (receipts from purchase requests, issues to objects).
// Approvals first: modules register their document types against it at import time and its tables must exist for theirs.
export const MODULES = [approvals, files, kb, chat, tasks, calendar, drive, resources, companies, crm, masterplan, procurement, warehouse, dashboard, assistant, contracts];

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

/** Module routers as mounted, for the API reference (api/introspect.js). */
export const MOUNTED = [];

/** Mounts every module under /api: /app/<id> (auth) and its public prefix. */
export function moduleRouter() {
  const router = Router();

  router.get('/apps', requireAuth, async (req, res, next) => {
    try {
      const parsed = parseSettings(await getSettings());
      res.json({
        success: true,
        apps: MODULE_CATALOG.filter((module) => !module.overlay).map((module) => ({ id: module.id, enabled: parsed.modules[module.id]?.enabled })).filter(
          (app) => app.enabled
        ),
      });
    } catch (err) {
      next(err);
    }
  });

  for (const module of MODULES) {
    const routes = module.routes();
    MOUNTED.push({ prefix: `/app/${module.id}`, router: routes, module: module.id });
    router.use(`/app/${module.id}`, enabledOnly(module.id), requireAuth, routes);
    if (module.publicRoutes) {
      router.use(module.publicPrefix, enabledOnly(module.id), module.publicRoutes());
    }
  }
  return router;
}
