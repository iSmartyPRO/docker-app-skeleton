import { lazy } from 'react';
import { lazyPage } from '../../lib/lazyPage';
import { MODULE_REGISTRY } from '../../modules/registry';
import { addTranslationSource } from '../../i18n/translations';
import { installShared } from './shared';

/*
 * Module packages in the browser shell (docs/module-packages.md «Shell»).
 *
 * Before the first render, main.jsx awaits loadInstalledPackages():
 * GET /api/modules/installed lists the installed packages; for each one
 *   - its translations (locales/<lang>/<ns>.js) are added to the dictionaries;
 *   - its stylesheet is linked;
 *   - when it is switched on, its web/index.js (small: names, loaders,
 *     register) is imported and register(ctx) runs (widgets and other
 *     extension points);
 *   - a page module joins MODULE_REGISTRY like a built-in one: /app/<id>,
 *     icon, apps.<id>.name — its App and Settings load only when opened.
 *
 * web/index.js contract:
 *   export default {
 *     id: 'hello',
 *     App: () => import('./HelloApp.jsx'),        // the page at /app/<id> (optional)
 *     Settings: () => import('./HelloSettings.jsx'), // Settings → <module> (optional)
 *     register(ctx) {},                            // optional; ctx = { id, version, base }
 *   }
 *
 * A package that fails to load is left out (logged); the portal keeps working.
 */

export const PACKAGES = [];
const entries = new Map();
let bootId = null;

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

function linkCss(url) {
  if (document.querySelector(`link[data-module-css="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.dataset.moduleCss = url;
  document.head.appendChild(link);
}

/** The default export of a package's web/index.js (imported once). */
export function packageEntry(pkg) {
  if (!pkg.web?.entry) return Promise.resolve({ id: pkg.id });
  if (!entries.has(pkg.id)) {
    entries.set(
      pkg.id,
      import(/* @vite-ignore */ pkg.web.entry).then((mod) => {
        const entry = mod.default || mod;
        if (entry.id && entry.id !== pkg.id) throw new Error(`web/index.js of ${pkg.id} says id "${entry.id}"`);
        return entry;
      })
    );
  }
  return entries.get(pkg.id);
}

/** A React.lazy-compatible loader of entry[part] (App / Settings), or a placeholder when the package has none. */
const partLoader = (pkg, part) => () =>
  packageEntry(pkg).then(async (entry) => {
    if (typeof entry[part] !== 'function') return { default: () => null };
    const mod = await entry[part]();
    return { default: mod?.default || mod };
  });

function translationsOf(pkg) {
  const cache = new Map();
  return (locale) => {
    const files = pkg.locales?.[locale];
    if (!files?.length) return Promise.resolve(null);
    if (!cache.has(locale)) {
      cache.set(
        locale,
        Promise.all(files.map((url) => import(/* @vite-ignore */ url).then((mod) => [url.split('/').pop().replace(/\.js$/, ''), mod.default || {}]))).then((parts) => Object.fromEntries(parts))
      );
    }
    return cache.get(locale);
  };
}

function addToRegistry(pkg) {
  if (!pkg.web || pkg.web.page === false || MODULE_REGISTRY.some((module) => module.id === pkg.id)) return;
  MODULE_REGISTRY.push({
    id: pkg.id,
    path: `/app/${pkg.id}`,
    icon: pkg.web.icon || 'apps',
    ...(pkg.web.permission ? { permission: pkg.web.permission } : {}),
    labelKey: `apps.${pkg.id}.name`,
    descKey: `apps.${pkg.id}.desc`,
    package: { version: pkg.version, name: pkg.name },
    App: lazyPage(partLoader(pkg, 'App')),
    Settings: lazy(partLoader(pkg, 'Settings')),
  });
}

/** Packages switched on now (after loadInstalledPackages). */
export const installedPackage = (id) => PACKAGES.find((pkg) => pkg.id === id) || null;
export const packagesBootId = () => bootId;

/**
 * Reads the installed packages and prepares them (see above). Never throws;
 * gives up after `timeoutMs` so a slow server never blocks the portal.
 */
export async function loadInstalledPackages({ timeoutMs = 3000 } = {}) {
  installShared();
  let data = null;
  try {
    const res = await withTimeout(fetch('/api/modules/installed', { credentials: 'same-origin', headers: { Accept: 'application/json' } }), timeoutMs);
    if (res?.ok) data = await res.json();
  } catch {
    data = null;
  }
  if (!data?.modules?.length) return PACKAGES;
  bootId = data.bootId || null;
  for (const pkg of data.modules) {
    if (!pkg?.id || PACKAGES.some((item) => item.id === pkg.id)) continue;
    PACKAGES.push(pkg);
    if (Object.keys(pkg.locales || {}).length) addTranslationSource(translationsOf(pkg));
    for (const url of pkg.web?.css || []) linkCss(url);
    addToRegistry(pkg);
  }
  await withTimeout(
    Promise.allSettled(
      PACKAGES.filter((pkg) => pkg.web && pkg.enabled !== false).map((pkg) =>
        packageEntry(pkg)
          .then((entry) => (typeof entry.register === 'function' ? entry.register({ id: pkg.id, version: pkg.version, base: `/modules/${pkg.id}/${pkg.version}/` }) : null))
          .catch((err) => console.warn(`Module package ${pkg.id} did not load:`, err?.message || err))
      )
    ),
    timeoutMs
  );
  return PACKAGES;
}
