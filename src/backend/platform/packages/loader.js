import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Router } from 'express';
import { query, withTransaction } from '../../config/database.js';
import { APP_VERSION } from '../../config/version.js';
import { requireAuth } from '../../middleware/auth.js';
import { getSettingsView } from '../../services/settings.js';
import { recordSecurityEvent } from '../../services/security.js';
import { MODULE_CATALOG } from '../../modules/catalog.js';
import { BUILTIN_MANIFEST_IDS } from '../../modules/manifest.js';
import { installSdkResolver } from '../sdkLoader.mjs';
import { SDK_VERSION } from '../sdk/version.js';
import { moduleContext as registryContext, onShutdown, registerModule as registryAdd, unregisterModule } from '../registry.js';
import { activePackages, clearBootMarker, readBootMarker, readManifestAt, readPointer, scanDisk, writeBootMarker, writePointer } from './disk.js';
import { ensurePackageTables, getModuleRow, listModuleRows, saveModuleRow } from './store.js';
import { inlineMigrations, mergeMigrations, packageMigrations, runMigrations } from './migrations.js';
import { listBackups, restoreBackup } from './backup.js';
import { compatibilityProblem } from './checks.js';
import { verifyPackageDir } from './integrity.js';
import { startStagingCleanup } from './staging.js';
import { satisfies } from './version.js';
import { devMode, versionDir } from './paths.js';
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
 * Before a package's code is imported: its files are checked against the
 * signed listing it was installed with (integrity.js), and it must fit this
 * core (manifest `core`: same major, not newer) and SDK (`sdk`); otherwise it
 * is marked failed with the §5 message and not imported. Its import,
 * migrations and register() each have MODULE_BOOT_TIMEOUT_MS (120 s).
 *
 * The first boot after an update checks the new version (pending_check): if
 * it does not load, the previous version is put back (its tables restored from
 * the backup made before the update when that backup holds the structure) and
 * the app restarts once more. The outcome stays in installed_modules.last_rollback
 * (a later good boot does not clear it) and in the journal.
 *
 * A boot that never finishes with a package (node crashes — an uncaught
 * exception from its timers — or hangs) cannot catch anything: the boot
 * marker (disk.js) catches it at the next start, before the package is
 * imported again. An update is rolled back; a package that was already
 * running is skipped («blocked») until a new version is installed or it is
 * removed. So a broken package can never crash the portal in a loop. The first
 * boot after an update keeps the marker (and pending_check) for
 * MODULE_BOOT_SETTLE_MS (30 s) after register(), so a crash shortly after
 * the start rolls the update back too; a graceful shutdown confirms it early.
 *
 * Loaded packages join the core registry (platform/registry.js), so other
 * modules reach their public API with ctx.modules.get(id)?.api — null while
 * not installed or switched off. LOADED keeps what this loader needs
 * (version, source, manifest, folder) for every module, bundled or package.
 */

const LOADED = new Map();
let packageRouter = Router();
let loading = null;

const bootTimeoutMs = () => Number(process.env.MODULE_BOOT_TIMEOUT_MS) || 120_000;
const settleMs = () => (process.env.MODULE_BOOT_SETTLE_MS != null && process.env.MODULE_BOOT_SETTLE_MS !== '' ? Number(process.env.MODULE_BOOT_SETTLE_MS) : 30_000);

/** `promise`, or a rejection with err.timedOut after `ms` (the work itself cannot be stopped: the caller decides). */
function withTimeout(promise, ms, what) {
  let timer;
  const limit = new Promise((resolvePromise, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${what} did not finish within ${Math.round(ms / 1000)} s`), { timedOut: true })), ms);
    timer.unref?.();
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function journalBoot({ code, detail, params, severity = 'warning' }) {
  return recordSecurityEvent({ kind: 'module_package', severity, username: 'system', detail: String(detail).slice(0, 200), code, params }).catch(() => {});
}

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

/**
 * What is installed now, for the checks of checks.js: Map(id → { id, version, name, requires, source, nameForms, removed? }).
 * `removedRows`: installed_modules rows of removed packages (code gone, data kept) — they make an older file a downgrade.
 */
export function installedIndex(manifestEntries, { removedRows = [] } = {}) {
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
  for (const row of removedRows) {
    if (out.has(row.id) || row.state !== 'removed') continue;
    out.set(row.id, { id: row.id, version: row.version, name: row.manifest?.name, requires: [], source: 'package', removed: true });
  }
  return out;
}

/** Checks, imports and migrates one package. Returns { module, integrity }. */
async function loadPackage(pkg, row) {
  // Built for this core and SDK? (A core update may have left it behind: «needs an update».)
  const compat = compatibilityProblem(pkg.manifest, { coreVersion: APP_VERSION, sdkVersion: SDK_VERSION });
  if (compat) throw Object.assign(new Error(compat.message.en), { problem: compat });
  // The files are the signed package that was installed.
  const integrity = verifyPackageDir(pkg.dir, { expected: row, devMode: devMode() });
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
  return { module, integrity };
}

function mount(record) {
  const { module, id } = record;
  if (typeof module.routes === 'function') {
    const routes = module.routes(record.context);
    packageRouter.use(`/app/${id}`, enabledOnly(id), requireAuth, routes);
  }
  if (typeof module.publicRoutes === 'function') packageRouter.use(module.publicPrefix, enabledOnly(id), module.publicRoutes());
}

/**
 * The first boot of an updated version failed: back to the previous version
 * (tables restored from the pre-update backup when it is a pg_dump one), the
 * outcome in last_rollback and the journal, then one more restart. False when
 * there is nothing to go back to.
 */
export async function rollbackAfterFailedUpdate(pkg, row, error) {
  const previous = row?.previous_version;
  if (!previous || !existsSync(join(versionDir(pkg.id, previous), 'manifest.json'))) return false;
  let tables = 'not needed';
  let ok = true;
  const backup = row.backup_file ? listBackups(pkg.id).find((meta) => meta.file === row.backup_file) : null;
  if (row.backup_file && !backup) {
    tables = `backup ${basename(row.backup_file)} not found`;
    ok = false;
  }
  if (backup) {
    try {
      if (backup.format === 'pg_dump') {
        await restoreBackup(backup);
        tables = 'restored';
      } else {
        tables = `not restored automatically: data-only backup ${basename(backup.file)} (restore by hand)`;
        ok = false;
      }
    } catch (err) {
      tables = `restore failed: ${err.message}`.slice(0, 1000);
      ok = false;
    }
  }
  // The previous code is checked again at its boot; its listing is recorded now when it verifies.
  let listing = null;
  let manifest;
  try {
    manifest = readManifestAt(pkg.id, previous);
    listing = verifyPackageDir(versionDir(pkg.id, previous), { devMode: devMode() }).listingSha256;
  } catch {
    listing = null;
  }
  writePointer(pkg.id, 'current', previous);
  writePointer(pkg.id, 'previous', null);
  clearBootMarker(pkg.id);
  const lastRollback = { at: new Date().toISOString(), from: pkg.version, to: previous, reason: String(error.message).slice(0, 1000), tables, ok, backup: backup ? basename(backup.file) : null };
  await saveModuleRow({
    id: pkg.id,
    version: previous,
    state: 'failed',
    pending_check: false,
    previous_version: null,
    listing_sha256: listing,
    last_rollback: lastRollback,
    ...(manifest ? { manifest } : {}),
    error: `Version ${pkg.version} did not start (${error.message}); rolled back to ${previous}; tables: ${tables}`.slice(0, 2000),
  });
  console.error(`Module ${pkg.id} ${pkg.version} failed after update; rolled back to ${previous} (tables: ${tables})`);
  await journalBoot({ code: 'module_rolled_back', severity: ok ? 'warning' : 'error', detail: `${pkg.id} ${pkg.version} did not start, rolled back to ${previous} (tables: ${tables}): ${error.message}`, params: { module: pkg.id, version: pkg.version, from: previous } });
  requestRestart(`rollback of ${pkg.id} to ${previous}`);
  return true;
}

/** Marks a package failed (journaled when this is news, not at every boot). */
async function markFailed(pkg, row, message, extra = {}) {
  const error = String(message).slice(0, 2000);
  await saveModuleRow({ id: pkg.id, version: pkg.version, state: 'failed', source: 'package', error, pending_check: false, ...extra }).catch(() => {});
  if (row?.state !== 'failed' || row?.error !== error || row?.version !== pkg.version) {
    await journalBoot({ code: 'module_failed', detail: `${pkg.id} ${pkg.version} not loaded at boot: ${error}`, params: { module: pkg.id, version: pkg.version } });
  }
}

/** The previous boot never finished with this package (marker found): roll an update back, else skip it. */
async function handleUnfinishedBoot(pkg, row, marker) {
  const reason =
    marker.status === 'blocked'
      ? marker.reason || 'an earlier start stopped while loading it'
      : marker.status === 'timeout'
        ? marker.reason || 'it did not finish loading in time'
        : 'the previous start stopped while loading it (the process crashed or hung)';
  const error = new Error(reason);
  if (marker.status !== 'blocked' && row?.pending_check && (await rollbackAfterFailedUpdate(pkg, row, error).catch((err) => (console.error(`Rollback of ${pkg.id} failed: ${err.message}`), false)))) return reason;
  if (marker.status !== 'blocked') writeBootMarker(pkg.id, { version: pkg.version, status: 'blocked', bootId: BOOT_ID, reason });
  await markFailed(pkg, row, `${reason}. It is not loaded until a new version is installed, or it is removed and installed again.`);
  return reason;
}

/** A package that loaded: its first boot after an update is confirmed (pending_check off, marker gone). */
async function confirmBoot(record) {
  if (record.confirmed) return;
  record.confirmed = true;
  clearTimeout(record.settleTimer);
  clearBootMarker(record.id);
  if (record.pendingCheck) {
    await saveModuleRow({ id: record.id, version: record.version, pending_check: false }).catch(() => {});
    console.log(`Module ${record.id} ${record.version}: update confirmed`);
  }
}

// A graceful shutdown (another install's restart, a deploy) confirms the packages that started well.
onShutdown(async () => {
  for (const record of LOADED.values()) if (record.source === 'package' && record.registeredOk) await confirmBoot(record);
});

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
  startStagingCleanup();
  // Built-in modules have a row too (inventory, «what is installed»).
  for (const id of builtinIds) {
    const version = manifestEntries[id]?.version || LOADED.get(id)?.version || '0.0.0';
    await saveModuleRow({ id, version, state: 'installed', source: 'bundled', error: null });
  }
  const { problems } = scanDisk();
  const packages = requirementOrder(activePackages(builtinIds));
  // A module that was built into an older core and is now a package (masterplan): until its package
  // is installed it is «removed» — code gone, tables and settings kept (docs/module-packages.md).
  for (const row of await listModuleRows()) {
    if (row.source !== 'bundled' || builtinIds.includes(row.id) || packages.some((pkg) => pkg.id === row.id)) continue;
    await saveModuleRow({ id: row.id, version: row.version, state: 'removed', source: 'package', error: null, pending_check: false });
    console.warn(`Module ${row.id} is no longer built into the core: install its package to use it again (its data is kept)`);
  }
  for (const [id, message] of problems) {
    if (packages.some((pkg) => pkg.id === id)) continue;
    const version = readPointer(id) || (await getModuleRow(id))?.version || '0.0.0';
    await saveModuleRow({ id, version, state: 'failed', source: builtinIds.includes(id) ? 'bundled' : 'package', error: message.slice(0, 2000) }).catch(() => {});
  }
  const results = [];
  guardBoot();
  for (const pkg of packages) await bootOne(pkg, results);
  const behind = results.filter((item) => item.problem);
  if (behind.length) console.warn(`Modules that need an update for core ${APP_VERSION} (SDK ${SDK_VERSION}): ${behind.map((item) => `${item.id} ${item.version} — ${item.error}`).join('; ')}`);
  return results;
}

/*
 * Stopped from outside while packages load or register (docker stop, a deploy) is not a crash: the markers
 * of the packages in flight go, then the process ends as SIGTERM / SIGINT would have ended it. Only while
 * server.js has no handler of its own yet (it is installed after the boot); removed by registerPackages().
 */
const inFlight = new Set();
let bootGuards = null;
function guardBoot() {
  if (bootGuards) return;
  bootGuards = ['SIGTERM', 'SIGINT']
    .filter((signal) => process.listenerCount(signal) === 0)
    .map((signal) => [
      signal,
      () => {
        // server.js handles it once its handler is there (graceful shutdown; confirmBoot on the way out).
        if (process.listenerCount(signal) > 1) return;
        for (const id of inFlight) clearBootMarker(id);
        process.exit(signal === 'SIGINT' ? 130 : 143);
      },
    ]);
  for (const [signal, fn] of bootGuards) process.on(signal, fn);
}
function unguardBoot() {
  for (const [signal, fn] of bootGuards || []) process.off(signal, fn);
  bootGuards = null;
}

/** Boots one package (doLoad): marker check, then load, mount and record — or the failure path. */
async function bootOne(pkg, results) {
  const row = await getModuleRow(pkg.id);
  let marker = readBootMarker(pkg.id);
  if (marker?.version && marker.version !== pkg.version) {
    clearBootMarker(pkg.id); // left by another version
    marker = null;
  }
  if (marker) {
    const reason = await handleUnfinishedBoot(pkg, row, marker);
    results.push({ id: pkg.id, version: pkg.version, ok: false, error: reason });
    return;
  }
  writeBootMarker(pkg.id, { version: pkg.version, status: 'loading', bootId: BOOT_ID, pending: Boolean(row?.pending_check) });
  inFlight.add(pkg.id);
  try {
    const { module, integrity } = await withTimeout(loadPackage(pkg, row), bootTimeoutMs(), `Loading ${pkg.id} ${pkg.version}`);
    const record = { id: pkg.id, version: pkg.version, source: 'package', api: module.api || null, module, manifest: pkg.manifest, dir: pkg.dir, row, pendingCheck: Boolean(row?.pending_check), listingSha256: integrity.listingSha256 };
    // In the core registry (ctx.modules.get(id)?.api for other modules), with the package version.
    registryAdd({ ...module, id: pkg.id, version: pkg.version });
    record.context = moduleContext(record);
    mount(record);
    LOADED.set(pkg.id, record);
    // pending_check stays on until the new version has run for a while (confirmBoot).
    await saveModuleRow({
      id: pkg.id,
      version: pkg.version,
      state: 'installed',
      source: 'package',
      error: null,
      manifest: pkg.manifest,
      listing_sha256: integrity.listingSha256,
      ...(row ? {} : { installed_by: 'disk', signed_by: integrity.keyId || 'unsigned' }),
    });
    results.push({ id: pkg.id, version: pkg.version, ok: true });
  } catch (err) {
    console.error(`Module package ${pkg.id} ${pkg.version} not loaded: ${err.stack || err.message}`);
    results.push({ id: pkg.id, version: pkg.version, ok: false, error: err.message, ...(err.problem ? { problem: err.problem } : {}) });
    await failedAtBoot(pkg, row, err);
  }
}

/** What happens to a package whose load failed (import, checks, migrations or a timeout). */
async function failedAtBoot(pkg, row, err) {
  inFlight.delete(pkg.id);
  if (err.timedOut) {
    // The hung work cannot be stopped in this process: the marker stays, the next start decides
    // (a rollback runs there, in a fresh process, not against a transaction that may still hold locks).
    writeBootMarker(pkg.id, { version: pkg.version, status: 'timeout', bootId: BOOT_ID, reason: err.message });
    if (row?.pending_check) {
      await saveModuleRow({ id: pkg.id, version: pkg.version, state: 'failed', error: `${err.message}; the update is rolled back at the restart` }).catch(() => {});
      requestRestart(`rollback of ${pkg.id}: loading timed out`);
      return;
    }
    await markFailed(pkg, row, `${err.message}. It is not loaded until a new version is installed, or it is removed and installed again.`);
    return;
  }
  clearBootMarker(pkg.id);
  if (row?.pending_check && (await rollbackAfterFailedUpdate(pkg, row, err).catch((rollbackErr) => (console.error(`Rollback of ${pkg.id} failed: ${rollbackErr.message}`), false)))) return;
  await markFailed(pkg, row, err.message);
}

/** Calls register(ctx) of every loaded package (after the built-in modules registered). */
export async function registerPackages() {
  for (const record of LOADED.values()) {
    if (record.source !== 'package' || record.registeredOk) continue;
    let err;
    try {
      err = await withTimeout(registerModule(record), bootTimeoutMs(), `register() of ${record.id}`);
    } catch (timeout) {
      err = timeout;
    }
    if (err) {
      const pkg = { id: record.id, version: record.version, dir: record.dir, manifest: record.manifest };
      const failure = Object.assign(new Error(`register(): ${err.message}`), { timedOut: err.timedOut });
      await failedAtBoot(pkg, record.row, failure);
      continue;
    }
    record.registeredOk = true;
    inFlight.delete(record.id);
    if (!record.pendingCheck || settleMs() <= 0) {
      await confirmBoot(record);
    } else {
      record.settleTimer = setTimeout(() => confirmBoot(record), settleMs());
      record.settleTimer.unref?.();
    }
  }
  unguardBoot();
}

/** Package rows with the switch state, for the Modules page and the inventory. */
export async function packageStates() {
  const rows = await listModuleRows();
  const modules = (await getSettingsView()).modules;
  return rows.map((row) => {
    const marker = row.source === 'package' && row.state !== 'removed' ? readBootMarker(row.id) : null;
    // Does it fit this core? (After a core update: «needs an update», with the §5 message.)
    const incompatible = row.source === 'package' && row.state !== 'removed' && row.manifest?.core ? compatibilityProblem(row.manifest, { coreVersion: APP_VERSION, sdkVersion: SDK_VERSION }) : null;
    return {
      id: row.id,
      // The name from the last installed manifest (a removed package's card has nothing else).
      name: row.manifest?.name || null,
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
      pendingCheck: Boolean(row.pending_check),
      blocked: marker && marker.status !== 'loading' && marker.version === row.version ? marker.status : null,
      incompatible,
      lastRollback: row.last_rollback || null,
    };
  });
}

/**
 * GET /api/modules/installed: loaded packages (with their on/off state), the
 * addresses of their web code and translations, for the browser shell.
 * Anonymous visitors get none (`signedIn: false`; no public page needs a
 * package yet): which modules a portal runs is not public. The addresses
 * carry the version and the first 12 hex of the files' listing digest, so a
 * package reinstalled with other bytes under the same version gets new URLs
 * (the files are cached as immutable for a year).
 */
export async function shellPackages({ signedIn = true } = {}) {
  if (!signedIn) return { bootId: BOOT_ID, signedIn: false, modules: [] };
  const modules = (await getSettingsView()).modules;
  const out = [];
  for (const record of LOADED.values()) {
    if (record.source !== 'package') continue;
    const { manifest } = record;
    const base = assetBase(record);
    out.push({
      id: record.id,
      version: record.version,
      name: manifest.name,
      category: manifest.category,
      enabled: Boolean(modules[record.id]?.enabled),
      base,
      web: manifest.web ? { entry: base + manifest.web.entry, css: (manifest.web.css || []).map((file) => base + file), icon: manifest.web.icon, permission: manifest.web.permission || null, page: manifest.web.page !== false, settings: Boolean(manifest.web.settings) } : null,
      locales: Object.fromEntries(Object.entries(manifest.locales || {}).map(([lang, names]) => [lang, names.map((ns) => `${base}locales/${lang}/${ns}.js`)])),
    });
  }
  return { bootId: BOOT_ID, signedIn: true, modules: out };
}

/** Short digest of a loaded package's files for its asset URLs (null when unknown). */
export const assetDigest = (record) => (record?.listingSha256 ? record.listingSha256.slice(0, 12) : null);

/** /modules/<id>/<version>-<digest>/ (or /modules/<id>/<version>/ when the digest is unknown). */
export const assetBase = (record) => `/modules/${record.id}/${record.version}${assetDigest(record) ? `-${assetDigest(record)}` : ''}/`;

/** Tests: put a loaded package record in place (asset URLs, shell list). */
export function setLoadedForTests(record) {
  LOADED.set(record.id, { source: 'package', ...record });
}

/** Tests: forget everything loaded. */
export function resetLoader() {
  inFlight.clear();
  unguardBoot();
  for (const record of LOADED.values()) {
    if (record.source !== 'package') continue;
    clearTimeout(record.settleTimer);
    unregisterModule(record.id);
  }
  LOADED.clear();
  packageRouter = Router();
  loading = null;
}
