#!/usr/bin/env node
/*
 * Routes a package mounts, read from its own router stack (run in a child process with the
 * kit backend's environment — the package code is imported exactly as the loader does):
 *
 *   node introspect.mjs <backend dir> <installed version folder>
 *
 * Prints JSON { id, routes: [{ method, path }], public: [{ method, path }], skipped: [] } where
 * paths are full API paths (/api/app/<id>/…, /api<publicPrefix>/…).
 * The router is only built, never served; register() is not called (no side effects on the DB).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { routesOf } from './pure.mjs';

const [backendDir, versionDir] = process.argv.slice(2);
if (!backendDir || !versionDir) {
  console.error('usage: introspect.mjs <backend dir> <installed version folder>');
  process.exit(2);
}
const load = (path) => import(pathToFileURL(join(backendDir, path)).href);

try {
  const manifest = JSON.parse(readFileSync(join(versionDir, 'manifest.json'), 'utf8'));
  const loader = await load('platform/packages/loader.js');
  const module = await loader.importServerEntry(versionDir, manifest);
  const record = { id: manifest.id, version: manifest.version, source: 'package', dir: versionDir, manifest, module };
  const ctx = loader.moduleContext(record);
  const skipped = [];
  const routes = typeof module.routes === 'function' ? routesOf(module.routes(ctx), `/api/app/${manifest.id}`, skipped) : [];
  const pub = typeof module.publicRoutes === 'function' ? routesOf(module.publicRoutes(), `/api${module.publicPrefix}`, skipped) : [];
  process.stdout.write(`${JSON.stringify({ id: manifest.id, routes, public: pub, skipped })}\n`);
  process.exit(0);
} catch (err) {
  console.error(err.stack || err.message);
  process.exit(1);
}
