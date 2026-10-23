import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Router } from 'express';
import { query, withTransaction } from '../../config/database.js';
import { requireAuth } from '../../middleware/auth.js';
import { getSettingsView } from '../../services/settings.js';
import { MODULE_CATALOG } from '../../modules/catalog.js';
import { BUILTIN_MANIFEST_IDS } from '../../modules/manifest.js';
import { installSdkResolver } from '../sdkLoader.mjs';
import { moduleContext as registryContext, registerModule as registryAdd, unregisterModule } from '../registry.js';
import { activePackages, readPointer, scanDisk, writePointer } from './disk.js';
import { ensurePackageTables, getModuleRow, listModuleRows, saveModuleRow } from './store.js';
import { inlineMigrations, mergeMigrations, packageMigrations, runMigrations } from './migrations.js';
import { listBackups, restoreBackup } from './backup.js';
import { satisfies } from './version.js';
import { versionDir } from './paths.js';
import { BOOT_ID, requestRestart } from './restart.js';

/*
 * The module loader (spec §6 stage 3, docs/module-packages.md «Boot»).
 *
 * Boot order: the core, then the modules built into the image (source
 * «bundled», modules/index.js MODULES — unchanged), then the installed
 * packages: for each $MODULES_DIR/<id>/current, in requirement order, its
 * server/index.js is imported (@portal/sdk resolved by platform/sdkLoader.mjs),
 * its pending migrations run, its routes are mounted under /api/app/<id> and
 * its register(ctx) is called. A package that fails is skipped and marked
 * `failed` with the error in installed_modules; the portal keeps running.
 *
 * The first boot after an update checks the new version (pending_check): if
 * it does not load, the previous version is put back (its tables restored from
 * the backup made before the update when that backup holds the structure) and
 * the app restarts once more.
 *
 * Loaded packages join the core registry (platform/registry.js), so other
 * modules reach their public API with ctx.modules.get(id)?.api — null while
 * not installed or switched off. LOADED keeps what this loader needs
 * (version, source, manifest, folder) for every module, bundled or package.
 */

const LOADED = new Map();
let packageRouter = Router();
let loading = null;

/** Mounted inside modules/index.js moduleRouter(): package routes are attached here as they load. */
export function packagesRouter() {
  return (req, res, next) => packageRouter(req, res, next);
}

export const loadedModule = (id) => LOADED.get(id) || null;
export const loadedModules = () => [...LOADED.values()];

/** Records a module built into the image (modules/index.js calls this for each). */
export function recordBundled(module, manifestEntry) {
  LOADED.set(module.id, { id: module.id, version: manifestEntry?.version || '0.0.0', source: 'bundled', api: module.api || null, module });
}

/**
 * The context a package's register(ctx) and routes(ctx) receive: the core
 * registry's context (platform/registry.js: modules, events, register*) plus
 * the package's own facts and the database.
 */
export function moduleContext(record) {
  return {
    ...registryContext(record.module),
    version: record.version,
    source: record.source,
    dir: record.dir || null,
    manifest: record.manifest || null,
    db: { query, withTransaction },
    log: {
      info: (...args) => console.log(`[${record.id}]`, ...args),
      warn: (...args) => console.warn(`[${record.id}]`, ...args),
      error: (...args) => console.error(`[${record.id}]`, ...args),
    },
  };
}

/** Calls register(ctx) of a loaded package, if it has one. Errors are reported, not thrown. */
export async function registerModule(record) {
  if (!record || typeof record.module?.register !== 'function' || record.registered) return null;
  record.registered = true;
  try {
    await record.module.register(record.context || moduleContext(record));
    return null;
  } catch (err) {
    console.error(`Module ${record.id}: register() failed: ${err.message}`);
    return err;
  }
}

function enabledOnly(id) {
  return async (req, res, next) => {
    try {
      const modules = (await getSettingsView()).modules;
      if (!modules[id]?.enabled) return res.status(404).json({ success: false, error: 'Module is disabled', code: 'MODULE_DISABLED' });
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Packages in requirement order (a package after the packages it requires). */
export function requirementOrder(packages) {
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const out = [];
  const done = new Set();
  const visit = (pkg, seen = new Set()) => {
    if (done.has(pkg.id) || seen.has(pkg.id)) return;
    seen.add(pkg.id);
    for (const link of pkg.manifest.requires || []) if (link.id && byId.has(link.id)) visit(byId.get(link.id), seen);
    done.add(pkg.id);
    out.push(pkg);
  };
  packages.forEach((pkg) => visit(pkg));
  return out;
}

/** Imports a package's server entry and checks the module contract. */
export async function importServerEntry(dir, manifest) {
  if (!manifest.server) return { id: manifest.id };
  installSdkResolver();
  const file = join(dir, manifest.server.entry);
  const mod = await import(`${pathToFileURL(file).href}?v=${encodeURIComponent(manifest.version)}`);
  const module = mod.default;
  if (!module || typeof module !== 'object') throw new Error(`${manifest.server.entry} has no default export`);
  if (module.id !== manifest.id) throw new Error(`${manifest.server.entry} exports id "${module.id}", manifest.json says "${manifest.id}"`);
  if (module.routes != null && typeof module.routes !== 'function') throw new Error('routes must be a function returning a router');
  if (module.publicRoutes != null && (typeof module.publicRoutes !== 'function' || typeof module.publicPrefix !== 'string' || !module.publicPrefix.startsWith('/'))) throw new Error('publicRoutes needs a publicPrefix starting with /');
  if (module.register != null && typeof module.register !== 'function') throw new Error('register must be a function');
  return module;
}

/** The migrations of a package: migrations/ files and the module's own `migrations` list. */
export const migrationsOf = (dir, module) => mergeMigrations(packageMigrations(dir), inlineMigrations(module?.migrations));

/** What is installed now, for the checks of checks.js: Map(id → { id, version, name, requires, source, nameForms }). */
export function installedIndex(manifestEntries) {
  const out = new Map();
  // Modules built into this core.
  for (const id of BUILTIN_MANIFEST_IDS) {
    const entry = manifestEntries[id];
    if (entry) out.set(id, { id, version: entry.version, name: entry.name, requires: entry.requires || [], source: 'bundled' });
  }
  // Packages as they are on disk now (an install or update waiting for the restart counts),
  // including ones that did not load (they can be updated or removed).
  for (const pkg of scanDisk({ fresh: true }).packages) {
    if (out.has(pkg.id)) continue;
    out.set(pkg.id, { id: pkg.id, version: pkg.version, name: pkg.manifest.name, requires: pkg.manifest.requires, source: 'package', nameForms: pkg.manifest.nameForms });
  }
  return out;
}

async function loadPackage(pkg) {
  const module = await importServerEntry(pkg.dir, pkg.manifest);
  // Requirements (the installer checked them; a module removed by hand afterwards is caught here).
  for (const link of pkg.manifest.requires || []) {
    if (!link.id) continue;
    const dep = LOADED.get(link.id);
    if (!dep) throw new Error(`requires module "${link.id}", which is not loaded`);
    if (link.version && !satisfies(dep.version, link.version)) throw new Error(`requires ${link.id} ${link.version} or newer (same major), found ${dep.version}`);
  }
  // The package's own settings sanitizer replaces the generic one (manifest settings.defaults).
  const catalogEntry = MODULE_CATALOG.find((entry) => entry.id === pkg.id);
  if (catalogEntry && typeof module.sanitizeSettings === 'function') catalogEntry.sanitize = module.sanitizeSettings;
  const migrations = migrationsOf(pkg.dir, module);
  if (migrations.length) await runMigrations({ moduleId: pkg.id, version: pkg.version, migrations, transaction: withTransaction });
  else if (typeof module.schema === 'function') await module.schema();
  return module;
}

function mount(record) {
  const { module, id } = record;
  if (typeof module.routes === 'function') {
    const routes = module.routes(record.context);
    packageRouter.use(`/app/${id}`, enabledOnly(id), requireAuth, routes);
  }
  if (typeof module.publicRoutes === 'function') packageRouter.use(module.publicPrefix, enabledOnly(id), module.publicRoutes());
}

async function rollbackAfterFailedUpdate(pkg, row, error) {
  const previous = row.previous_version;
  if (!previous || !existsSync(join(versionDir(pkg.id, previous), 'manifest.json'))) return false;
  let restored = 'not needed';
  const backup = row.backup_file ? listBackups(pkg.id).find((meta) => meta.file === row.backup_file) : null;
  if (backup) {
    try {
      if (backup.format === 'pg_dump') {
        await restoreBackup(backup);
        restored = 'restored';
      } else {
        restored = `kept in ${backup.file} (restore by hand)`;
      }
    } catch (err) {
      restored = `restore failed: ${err.message}`;
    }
  }
  writePointer(pkg.id, 'current', previous);
  writePointer(pkg.id, 'previous', null);
  await saveModuleRow({ id: pkg.id, version: previous, state: 'failed', pending_check: false, previous_version: null, error: `Version ${pkg.version} did not start (${error.message}); rolled back to ${previous}; tables: ${restored}` });
  console.error(`Module ${pkg.id} ${pkg.version} failed after update; rolled back to ${previous}`);
  requestRestart(`rollback of ${pkg.id} to ${previous}`);
  return true;
}

/**
 * Loads every installed package (once per process; later calls return the
 * same promise). `builtinIds`: modules built into the image.
 */
export function loadPackages({ builtinIds = [], manifestEntries = {} } = {}) {
  if (!loading) loading = doLoad(builtinIds, manifestEntries).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

async function doLoad(builtinIds, manifestEntries) {
  await ensurePackageTables();
  // Built-in modules have a row too (inventory, «what is installed»).
  for (const id of builtinIds) {
    const version = manifestEntries[id]?.version || LOADED.get(id)?.version || '0.0.0';
    await saveModuleRow({ id, version, state: 'installed', source: 'bundled', error: null });
  }
  const { problems } = scanDisk();
  const packages = requirementOrder(activePackages(builtinIds));
  for (const [id, message] of problems) {
    if (packages.some((pkg) => pkg.id === id)) continue;
    const version = readPointer(id) || (await getModuleRow(id))?.version || '0.0.0';
    await saveModuleRow({ id, version, state: 'failed', source: builtinIds.includes(id) ? 'bundled' : 'package', error: message.slice(0, 2000) }).catch(() => {});
  }
  const results = [];
  for (const pkg of packages) {
    const row = await getModuleRow(pkg.id);
    try {
      const module = await loadPackage(pkg);
      const record = { id: pkg.id, version: pkg.version, source: 'package', api: module.api || null, module, manifest: pkg.manifest, dir: pkg.dir };
      // In the core registry (ctx.modules.get(id)?.api for other modules), with the package version.
      registryAdd({ ...module, id: pkg.id, version: pkg.version });
      record.context = moduleContext(record);
      mount(record);
      LOADED.set(pkg.id, record);
      await saveModuleRow({ id: pkg.id, version: pkg.version, state: 'installed', source: 'package', error: null, pending_check: false, manifest: pkg.manifest, ...(row ? {} : { installed_by: 'disk' }) });
      results.push({ id: pkg.id, version: pkg.version, ok: true });
    } catch (err) {
      console.error(`Module package ${pkg.id} ${pkg.version} not loaded: ${err.stack || err.message}`);
      results.push({ id: pkg.id, version: pkg.version, ok: false, error: err.message });
      if (row?.pending_check && (await rollbackAfterFailedUpdate(pkg, row, err).catch(() => false))) continue;
      await saveModuleRow({ id: pkg.id, version: pkg.version, state: 'failed', source: 'package', error: String(err.message).slice(0, 2000), pending_check: false }).catch(() => {});
    }
  }
  return results;
}

/** Calls register(ctx) of every loaded package (after the built-in modules registered). */
export async function registerPackages() {
  for (const record of LOADED.values()) {
    if (record.source !== 'package') continue;
    const err = await registerModule(record);
    if (err) await saveModuleRow({ id: record.id, version: record.version, state: 'failed', error: `register(): ${err.message}`.slice(0, 2000) }).catch(() => {});
  }
}

/** Package rows with the switch state, for the Modules page and the inventory. */
export async function packageStates() {
  const rows = await listModuleRows();
  const modules = (await getSettingsView()).modules;
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    source: row.source,
    state: row.state === 'installed' ? (modules[row.id]?.enabled ? 'enabled' : 'disabled') : row.state,
    loaded: LOADED.has(row.id),
    error: row.error,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
    installedBy: row.installed_by,
    previousVersion: row.previous_version,
    signedBy: row.signed_by,
  }));
}

/**
 * GET /api/modules/installed: loaded packages (with their on/off state), the
 * addresses of their web code and translations, for the browser shell.
 */
export async function shellPackages() {
  const modules = (await getSettingsView()).modules;
  const out = [];
  for (const record of LOADED.values()) {
    if (record.source !== 'package') continue;
    const { manifest } = record;
    const base = `/modules/${record.id}/${record.version}/`;
    out.push({
      id: record.id,
      version: record.version,
      name: manifest.name,
      category: manifest.category,
      enabled: Boolean(modules[record.id]?.enabled),
      web: manifest.web ? { entry: base + manifest.web.entry, css: (manifest.web.css || []).map((file) => base + file), icon: manifest.web.icon, permission: manifest.web.permission || null, page: manifest.web.page !== false } : null,
      locales: Object.fromEntries(Object.entries(manifest.locales || {}).map(([lang, names]) => [lang, names.map((ns) => `${base}locales/${lang}/${ns}.js`)])),
    });
  }
  return { bootId: BOOT_ID, modules: out };
}

/** Tests: forget everything loaded. */
export function resetLoader() {
  for (const record of LOADED.values()) if (record.source === 'package') unregisterModule(record.id);
  LOADED.clear();
  packageRouter = Router();
  loading = null;
}
