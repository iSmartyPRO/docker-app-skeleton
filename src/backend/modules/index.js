import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSettings, getSettingsView, parseSettings } from '../services/settings.js';
import { readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { APP_VERSION } from '../config/version.js';
import { MODULE_CATALOG } from './catalog.js';
import { MODULE_MANIFEST, compareVersions, validateManifests } from './manifest.js';
import { ensureDemoSchema } from '../services/demo.js';
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
import org from './org/index.js';
import employees from './employees/index.js';
import directory from './directory/index.js';

/*
 * Module platform.
 *
 * A module is a folder under src/backend/modules/<id>/ exporting:
 *   id            short id, used in URLs: /app/<id>, /api/app/<id>
 *   schema()      creates/upgrades its tables (idempotent)
 *   routes()      Express router for signed-in users, mounted at /api/app/<id>
 *   publicRoutes  optional router for anonymous visitors (e.g. share links)
 *   publicPrefix  where publicRoutes live under /api (e.g. "/s")
 * plus an entry in modules/catalog.js (permissions, default settings), an
 * entry in modules/manifest.js (version, category, requires, enhances…) and,
 * optionally, demo data in <id>/demo.js (registerDemo, loaded automatically).
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
// Org structure before everything: approvals resolve «руководитель подразделения» through it, Employees point at its units.
// Directory after Employees and Drive: it adds a section to employee cards and reuses the File server's AD credentials.
export const MODULES = [org, approvals, files, kb, chat, tasks, calendar, drive, resources, companies, crm, masterplan, procurement, warehouse, dashboard, assistant, contracts, employees, directory];

/*
 * Manifests are checked when the platform loads: an unknown id or a
 * requirement cycle is a programming error and stops the start (the tests
 * run the same check). A module that needs a newer core only warns: it is
 * marked «incompatible» on the Modules page.
 */
const MANIFEST_PROBLEMS = validateManifests(MODULE_MANIFEST, {
  catalogIds: MODULE_CATALOG.map((module) => module.id),
  coreIds: MODULE_CATALOG.filter((module) => module.core).map((module) => module.id),
});
if (MANIFEST_PROBLEMS.length) throw new Error(`Module manifests are invalid:\n- ${MANIFEST_PROBLEMS.join('\n- ')}`);
for (const [id, entry] of Object.entries(MODULE_MANIFEST)) {
  if (compareVersions(APP_VERSION, entry.minCore) < 0) console.warn(`Module ${id} ${entry.version} needs core ${entry.minCore}; running ${APP_VERSION}`);
}

const here = dirname(fileURLToPath(import.meta.url));

/** Imports every modules/<id>/demo.js (each calls registerDemo). */
export async function loadModuleDemos() {
  for (const entry of readdirSync(here, { withFileTypes: true })) {
    const file = join(here, entry.name, 'demo.js');
    if (entry.isDirectory() && existsSync(file)) await import(pathToFileURL(file).href);
  }
}

async function moduleState(id) {
  return (await getSettingsView()).modules[id];
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
  await ensureDemoSchema();
  await loadModuleDemos();
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
