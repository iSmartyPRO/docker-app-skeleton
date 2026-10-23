import * as nodeModule from 'node:module';

/*
 * How package code finds the core (docs/module-packages.md «Server SDK»).
 *
 * A package's server/index.js is an ES module bundle living in the data
 * volume ($MODULES_DIR/<id>/<version>/server/), far from the core's
 * node_modules. A resolve hook (node:module registerHooks, or register() on
 * older Node) maps:
 *
 *   @portal/sdk                 → src/backend/platform/sdk/server.js (the stable SDK)
 *   @portal/sdk/core/<path>.js  → src/backend/<path>.js (transitional: core files that
 *                                 in-repo modules import with ../../; module internals refused)
 *   any other bare name (pg, express, …) imported from outside the core
 *                               → resolved as if imported by the core, so packages use
 *                                 the core's copies of its dependencies.
 *
 * NOT a security boundary. A signed package runs inside the portal process
 * with all its privileges: it can import node:fs, read /app/.env, use relative
 * or file: imports of any core file. These rules keep honest code on the SDK
 * (the build refuses module internals the same way); the trust comes from the
 * signature alone. The few refusals below only make accidental reliance on
 * the core's secrets and installer machinery fail loudly.
 */

// Core files a package never needs through the SDK path: configuration with secrets,
// key handling, the portal identity and the package platform itself.
const SENSITIVE = [/^config\/app\.js$/, /^services\/crypto\.js$/, /^platform\/identity\.js$/, /^platform\/packages\//, /^platform\/sdkLoader\.mjs$/, /^platform\/trusted-keys\.json$/];

const BACKEND = new URL('../', import.meta.url);
const BACKEND_PARENT = new URL('package.json', BACKEND).href;
const SDK_URL = new URL('./sdk/server.js', import.meta.url).href;
const CORE_PREFIX = '@portal/sdk/core/';

const isBare = (specifier) => !/^(\.{0,2}\/|[a-zA-Z][a-zA-Z0-9+.-]*:)/.test(specifier) && !specifier.startsWith('#');

/** True when a core file may be imported by package code. */
export function corePathAllowed(path) {
  if (typeof path !== 'string' || !/^[a-zA-Z0-9_./-]+\.(js|mjs|json)$/.test(path)) return false;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return false;
  if (['node_modules', 'test', 'test-fixtures', 'scripts'].includes(parts[0])) return false;
  if (SENSITIVE.some((pattern) => pattern.test(path))) return false;
  if (parts[0] === 'modules') {
    if (parts.length === 2) return ['catalog.js', 'manifest.js', 'dependencies.js'].includes(parts[1]);
    if (parts[1] === 'shared') return true;
    // Another module: its public surface only.
    return parts.length === 3 && parts[2] === 'api.js';
  }
  return true;
}

/** The URL a specifier maps to, or null to resolve normally. Throws for refused SDK paths. */
export function mapSpecifier(specifier, parentURL) {
  if (specifier === '@portal/sdk' || specifier === '@portal/sdk/server') return { url: SDK_URL };
  if (specifier.startsWith(CORE_PREFIX)) {
    const path = specifier.slice(CORE_PREFIX.length);
    if (!corePathAllowed(path)) {
      const err = new Error(`${specifier} is not part of the portal SDK (module internals and tools cannot be imported)`);
      err.code = 'ERR_PORTAL_SDK_PATH';
      throw err;
    }
    return { url: new URL(path, BACKEND).href };
  }
  if (specifier.startsWith('@portal/sdk/')) {
    const err = new Error(`${specifier} is not part of the portal SDK`);
    err.code = 'ERR_PORTAL_SDK_PATH';
    throw err;
  }
  if (isBare(specifier) && parentURL && parentURL.startsWith('file:') && !parentURL.startsWith(BACKEND.href)) return { parentURL: BACKEND_PARENT };
  return null;
}

export function resolve(specifier, context, nextResolve) {
  const mapped = mapSpecifier(specifier, context.parentURL);
  if (!mapped) return nextResolve(specifier, context);
  if (mapped.url) return { url: mapped.url, shortCircuit: true };
  return nextResolve(specifier, { ...context, parentURL: mapped.parentURL });
}

let installed = false;

/** Installs the hook once per process (before the first package import). */
export function installSdkResolver() {
  if (installed) return;
  installed = true;
  if (typeof nodeModule.registerHooks === 'function') nodeModule.registerHooks({ resolve });
  else nodeModule.register(import.meta.url);
}
