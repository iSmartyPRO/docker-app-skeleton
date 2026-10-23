import express from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { modulesDir } from './paths.js';
import { installSdkResolver } from '../sdkLoader.mjs';
import { runHttpServerHooks } from '../registry.js';
import { assetDigest, loadedModule } from './loader.js';

/*
 * Boot hook of module packages for server.js (one call, after the IP guard):
 *
 *   mountModulePackages(app)
 *
 * installs the @portal/sdk resolver and serves the browser code of installed
 * packages: GET /modules/<id>/<version>/web/… and …/locales/… from
 * $MODULES_DIR. The paths carry the version and a digest of the files, so
 * they are cached for a year (immutable). Loading the packages themselves happens with the module
 * schemas (modules/index.js → platform/packages/loader.js).
 */

// /<id>/<version>[-<digest>]/(web|locales)/<file>: the digest (12 hex of the files' listing, loader.js assetBase)
// makes the URL change when a package is reinstalled with other bytes under the same version.
const ASSET = /^\/([a-z][a-z0-9_]{1,31})\/(\d{1,6}\.\d{1,6}\.\d{1,6})(?:-([a-f0-9]{12}))?(\/(?:web|locales)\/[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*)$/;

function staticOf(root, { immutable }) {
  return express.static(root, {
    dotfiles: 'deny',
    index: false,
    redirect: false,
    fallthrough: false,
    ...(immutable ? { immutable: true, maxAge: '365d' } : { maxAge: 0 }),
    setHeaders(res, path) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (!immutable) res.setHeader('Cache-Control', 'no-cache');
      // Alpine-independent: module code is always JavaScript, even .mjs.
      if (/\.m?js$/.test(path)) res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    },
  });
}

export function moduleAssets() {
  const root = modulesDir();
  const pinned = staticOf(root, { immutable: true });
  const plain = staticOf(root, { immutable: false });
  const notFound = (res) => res.status(404).json({ success: false, error: 'Not found' });
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
    const match = ASSET.exec(req.path);
    if (!match || req.path.split('/').some((part) => part === '..')) return notFound(res);
    const [, id, version, digest, rest] = match;
    const record = loadedModule(id);
    // A digest is served only for the bytes it names (a stale tab gets 404 and reloads), cached for a year;
    // a URL without one (older shells) is revalidated every time.
    if (digest && (!record || record.version !== version || assetDigest(record) !== digest)) return notFound(res);
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = `/${id}/${version}${rest}${query}`;
    return (digest ? pinned : plain)(req, res, (err) => {
      if (err && err.statusCode !== 404 && err.status !== 404) return next(err);
      return notFound(res);
    });
  };
}

export function mountModulePackages(app) {
  installSdkResolver();
  try {
    if (!existsSync(modulesDir())) mkdirSync(modulesDir(), { recursive: true });
  } catch (err) {
    console.warn(`Module packages: ${modulesDir()} is not writable (${err.message}); installing packages will fail`);
  }
  app.use('/modules', moduleAssets());
}

/*
 * Modules hook into the HTTP server with ctx.onHttpServer (Remote's WebSocket
 * tunnel). Their register(ctx) runs with the schema bootstrap, which may come
 * after the server started (database not ready at boot), so the hooks run
 * once, when both have happened: startModuleServer(server) from server.js and
 * modulesRegistered() from the module boot (modules/index.js).
 */
let httpServer = null;
let registered = false;
let hooked = false;

function runHooksOnce() {
  if (hooked || !httpServer || !registered) return;
  hooked = true;
  runHttpServerHooks(httpServer);
}

export function startModuleServer(server) {
  httpServer = server;
  runHooksOnce();
}

export function modulesRegistered() {
  registered = true;
  runHooksOnce();
}
