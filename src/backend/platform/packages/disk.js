import { existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ID_PATTERN, VERSION_PATTERN, modulesDir, moduleRoot, versionDir } from './paths.js';
import { normalizeManifest, platformCatalogEntry, platformManifestEntry } from './manifestFile.js';

/*
 * Installed packages on disk, read synchronously while the core loads.
 *
 * modules/catalog.js and modules/manifest.js are plain data read at import
 * time by settings, permissions, the API scopes…; installed packages must be
 * in them before those modules evaluate, so the active package list comes
 * from the disk ($MODULES_DIR/<id>/current → <version>/manifest.json), not
 * from the database (which is not connected yet). The database row
 * (installed_modules) keeps the state, history and errors; the loader
 * (loader.js) reconciles both at boot.
 *
 * No imports from the rest of the backend: this file runs inside catalog.js.
 */

let scanned = null;

/** The version a pointer file names (current / previous), or null. */
export function readPointer(id, name = 'current') {
  const file = join(moduleRoot(id), name);
  if (!existsSync(file)) return null;
  const value = readFileSync(file, 'utf8').trim();
  return VERSION_PATTERN.test(value) ? value : null;
}

/** Sets (or with null removes) a pointer file atomically. */
export function writePointer(id, name, version) {
  const file = join(moduleRoot(id), name);
  if (version == null) {
    rmSync(file, { force: true });
    return;
  }
  if (!VERSION_PATTERN.test(version)) throw new Error(`bad version ${version}`);
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${version}\n`);
  renameSync(temp, file);
}

/** manifest.json of an unpacked version, normalized; throws when unreadable. */
export function readManifestAt(id, version) {
  const file = join(versionDir(id, version), 'manifest.json');
  const { manifest, problems } = normalizeManifest(JSON.parse(readFileSync(file, 'utf8')));
  if (problems.length) throw new Error(`manifest.json: ${problems.join('; ')}`);
  if (manifest.id !== id) throw new Error(`manifest.json names "${manifest.id}", folder is "${id}"`);
  if (manifest.version !== version) throw new Error(`manifest.json has version ${manifest.version}, current points at ${version}`);
  return manifest;
}

/**
 * Every package with a `current` pointer: { packages: [{ id, version, dir, manifest }], problems: Map(id → message) }.
 * Read once per process (resetDiskScan() for tests).
 */
export function scanDisk({ fresh = false } = {}) {
  const root = modulesDir();
  if (!fresh && scanned && scanned.root === root) return scanned;
  const packages = [];
  const problems = new Map();
  let names = [];
  try {
    names = existsSync(root) ? readdirSync(root) : [];
  } catch (err) {
    console.warn(`Module packages: cannot read ${root}: ${err.message}`);
  }
  for (const id of names.sort()) {
    if (!ID_PATTERN.test(id)) continue;
    try {
      if (!statSync(join(root, id)).isDirectory()) continue;
      const version = readPointer(id);
      if (!version) continue;
      packages.push({ id, version, dir: versionDir(id, version), manifest: readManifestAt(id, version) });
    } catch (err) {
      problems.set(id, err.message);
      console.warn(`Module package ${id} skipped: ${err.message}`);
    }
  }
  const result = { root, packages, problems };
  // A fresh scan (the installer's checks) does not replace what this process booted with.
  if (!fresh || !scanned) scanned = result;
  return result;
}

export function resetDiskScan() {
  scanned = null;
}

/** Active packages whose ids do not clash with a module built into the core. */
export function activePackages(builtinIds = []) {
  const builtin = new Set(builtinIds);
  const { packages, problems } = scanDisk();
  for (const pkg of packages) {
    if (builtin.has(pkg.id) && !problems.has(pkg.id)) {
      problems.set(pkg.id, `"${pkg.id}" is built into this core version; the package is ignored`);
      console.warn(`Module package ${pkg.id} ignored: a built-in module has the same id`);
    }
  }
  return packages.filter((pkg) => !builtin.has(pkg.id));
}

/** Entries appended to MODULE_CATALOG (modules/catalog.js). */
export function packageCatalogEntries(builtinIds) {
  return activePackages(builtinIds).map((pkg) => platformCatalogEntry(pkg.manifest));
}

/** Entries merged into MODULE_MANIFEST (modules/manifest.js). */
export function packageManifestEntries(builtinIds) {
  return Object.fromEntries(activePackages(builtinIds).map((pkg) => [pkg.id, platformManifestEntry(pkg.manifest)]));
}
