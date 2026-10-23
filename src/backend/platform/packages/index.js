import express from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { modulesDir } from './paths.js';
import { installSdkResolver } from '../sdkLoader.mjs';
import { runHttpServerHooks } from '../registry.js';

/*
 * Boot hook of module packages for server.js (one call, after the IP guard):
 *
 *   mountModulePackages(app)
 *
 * installs the @portal/sdk resolver and serves the browser code of installed
 * packages: GET /modules/<id>/<version>/web/… and …/locales/… from
 * $MODULES_DIR. The paths carry the version, so files are cached for a year
 * (immutable). Loading the packages themselves happens with the module
 * schemas (modules/index.js → platform/packages/loader.js).
 */

const ASSET = /^\/[a-z][a-z0-9_]{1,31}\/\d{1,6}\.\d{1,6}\.\d{1,6}\/(web|locales)\/[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/;

export function moduleAssets() {
  const root = modulesDir();
  const serve = express.static(root, {
    dotfiles: 'deny',
    index: false,
    redirect: false,
    fallthrough: false,
    immutable: true,
    maxAge: '365d',
    setHeaders(res, path) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Alpine-independent: module code is always JavaScript, even .mjs.
      if (/\.m?js$/.test(path)) res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    },
  });
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
    if (!ASSET.test(req.path) || req.path.split('/').some((part) => part === '..')) return res.status(404).json({ success: false, error: 'Not found' });
    return serve(req, res, (err) => {
      if (err && err.statusCode !== 404 && err.status !== 404) return next(err);
      return res.status(404).json({ success: false, error: 'Not found' });
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
