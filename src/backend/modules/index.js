import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSettings, getSettingsView, parseSettings } from '../services/settings.js';
import { readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { APP_VERSION } from '../config/version.js';
import { BUILTIN_MODULE_IDS, MODULE_CATALOG } from './catalog.js';
import { MODULE_MANIFEST, compareVersions, validateManifests } from './manifest.js';
import { loadPackages, packagesRouter, recordBundled, registerPackages } from '../platform/packages/loader.js';
import { activateModules, registerModule as registerInCore } from '../platform/registry.js';
import { packageRoutes } from '../platform/packages/routes.js';
import { modulesRegistered } from '../platform/packages/index.js';
import { ensurePackageTables } from '../platform/packages/store.js';
import { inlineMigrations, runMigrations } from '../platform/packages/migrations.js';
import { withTransaction } from '../config/database.js';
import { ensureDemoSchema } from '../services/demo.js';
import files from './files/index.js';
import kb from './kb/index.js';
import tasks from './tasks/index.js';
import calendar from './calendar/index.js';
import drive from './drive/index.js';
import resources from './resources/index.js';
import companies from './companies/index.js';
import crm from './crm/index.js';
import dashboard from './dashboard/index.js';
import chat from './chat/index.js';
import approvals from './approvals/index.js';
import contracts from './contracts/index.js';
import procurement from './procurement/index.js';
import warehouse from './warehouse/index.js';
import org from './org/index.js';
import employees from './employees/index.js';
import directory from './directory/index.js';
import remote from './remote/index.js';

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
// Masterplan is a module package (docs/module-packages.md): it loads after every built-in module.
// Procurement after the modules it links to (Counterparties, CRM, Files, Chat).
// Warehouse after Procurement (receipts from purchase requests).
// Approvals first: modules register their document types against it at import time and its tables must exist for theirs.
// Org structure before everything: approvals resolve «руководитель подразделения» through it, Employees point at its units.
// Directory after Employees and Drive: it adds a section to employee cards and reuses the File server's AD credentials.
export const MODULES = [org, approvals, files, kb, chat, tasks, calendar, drive, resources, companies, crm, procurement, warehouse, dashboard, contracts, employees, directory, remote];
// Built-in modules are in the core registry from the start: one module's schema() or demo may look up another
// (modules.loaded('files') from the knowledge base); register(ctx) runs later, in bootModules().
for (const module of MODULES) registerInCore({ ...module, version: module.version || MODULE_MANIFEST[module.id]?.version });

/*
 * Manifests are checked when the platform loads: an unknown id or a
 * requirement cycle is a programming error and stops the start (the tests
 * run the same check). A module that needs a newer core only warns: it is
 * marked «incompatible» on the Modules page.
 */
// Built-in modules are checked strictly. Installed packages (docs/module-packages.md) were
// checked when they were installed; a problem found now (a required module removed by hand…)
// is reported and the package is marked failed by the loader instead of stopping the start.
const BUILTIN_SET = new Set(BUILTIN_MODULE_IDS);
const BUILTIN_MANIFEST = Object.fromEntries(Object.entries(MODULE_MANIFEST).filter(([id]) => BUILTIN_SET.has(id)));
const MANIFEST_PROBLEMS = validateManifests(BUILTIN_MANIFEST, {
  catalogIds: BUILTIN_MODULE_IDS,
  coreIds: MODULE_CATALOG.filter((module) => module.core && BUILTIN_SET.has(module.id)).map((module) => module.id),
});
if (MANIFEST_PROBLEMS.length) throw new Error(`Module manifests are invalid:\n- ${MANIFEST_PROBLEMS.join('\n- ')}`);
for (const problem of validateManifests(MODULE_MANIFEST, { catalogIds: MODULE_CATALOG.map((module) => module.id) })) {
  const id = problem.split(':', 1)[0];
  if (!BUILTIN_SET.has(id)) console.warn(`Module package ${problem}`);
}
for (const [id, entry] of Object.entries(MODULE_MANIFEST)) {
  if (compareVersions(APP_VERSION, entry.minCore) < 0) console.warn(`Module ${id} ${entry.version} needs core ${entry.minCore}; running ${APP_VERSION}`);
}

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Imports modules/<id>/demo.js of every built-in module (each calls registerDemo).
 * Folders of modules that are not built in (a package's source kept in the tree,
 * like masterplan) are skipped: a package registers its demo from its own code.
 */
export async function loadModuleDemos() {
  const builtin = new Set(MODULES.map((module) => module.id));
  for (const entry of readdirSync(here, { withFileTypes: true })) {
    const file = join(here, entry.name, 'demo.js');
    if (entry.isDirectory() && builtin.has(entry.name) && existsSync(file)) await import(pathToFileURL(file).href);
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

/*
 * Boot of the modules: built-in modules create their tables — schema() as
 * before, or versioned `migrations` ([{ id: '001_init', up(db) }], run once
 * each, platform/packages/migrations.js) — then installed packages load
 * (platform/packages/loader.js), then every module's register(ctx) runs:
 * built-in first, packages after. A package that fails is skipped and marked
 * failed; the portal keeps running.
 */
let modulesBooted = null;
export async function ensureModuleSchemas() {
  await ensurePackageTables();
  for (const module of MODULES) {
    if (Array.isArray(module.migrations) && module.migrations.length) {
      await runMigrations({ moduleId: module.id, version: MODULE_MANIFEST[module.id]?.version, migrations: inlineMigrations(module.migrations), transaction: withTransaction });
    } else if (typeof module.schema === 'function') {
      await module.schema();
    }
  }
  await ensureDemoSchema();
  await loadModuleDemos();
  // Once per process: the setup wizard and a delayed start may bootstrap again.
  modulesBooted ||= bootModules().catch((err) => {
    modulesBooted = null;
    console.error(`Module packages were not loaded: ${err.message}`);
  });
  await modulesBooted;
}

async function bootModules() {
  for (const module of MODULES) recordBundled(module, MODULE_MANIFEST[module.id]);
  // Built-in modules join the core registry and run their register(ctx) (platform/registry.js).
  await activateModules(MODULES.map((module) => ({ ...module, version: module.version || MODULE_MANIFEST[module.id]?.version })));
  try {
    await loadPackages({ builtinIds: BUILTIN_MODULE_IDS, manifestEntries: MODULE_MANIFEST });
    await registerPackages();
  } finally {
    // ctx.onHttpServer hooks (e.g. Remote's tunnel) run once the HTTP server is up too.
    modulesRegistered();
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

  // Module packages: /api/modules/installed (shell), /api/admin/modules/packages… (install, update, remove).
  router.use(packageRoutes());

  for (const module of MODULES) {
    const routes = module.routes();
    MOUNTED.push({ prefix: `/app/${module.id}`, router: routes, module: module.id });
    router.use(`/app/${module.id}`, enabledOnly(module.id), requireAuth, routes);
    if (module.publicRoutes) {
      router.use(module.publicPrefix, enabledOnly(module.id), module.publicRoutes());
    }
  }
  // Installed packages mount their routes here as they load (/app/<id>, their public prefix).
  router.use(packagesRouter());
  return router;
}
