import { lazy } from 'react';
import { lazyPage } from '../../lib/lazyPage';
import { FEATURE_MODULES, MODULE_REGISTRY } from '../../modules/registry';
import { MODULE_UI } from '../../modules/manifest';
import { addTranslationSource } from '../../i18n/translations';
import { addPackageSettingsItem } from '../../admin/navigation';
import { addMenuSlot } from '../../components/icons/menuIcons';
import { installShared } from './shared';
import { backgroundDelays, checkEntry, fetchInstalled as fetchList, fetchWithinBudget, lateAnswerAction, namespaceOf, packageBase, packagesToPrepare, shouldReload, withTimeout } from './loaderLogic';

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
 *     icon, apps.<id>.name — its App and Settings load only when opened; one
 *     without a page (web.page false: the robot assistant) joins FEATURE_MODULES;
 *   - a package with a Settings screen (manifest web.settings) gets its item
 *     in Settings → Modules (admin/navigation.js), like a built-in module;
 *   - a `tour` of web/index.js is the module's tour (MODULE_UI, «Tour» buttons).
 *
 * web/index.js contract:
 *   export default {
 *     id: 'hello',
 *     App: () => import('./HelloApp.jsx'),        // the page at /app/<id> (optional)
 *     Settings: () => import('./HelloSettings.jsx'), // Settings → <module> (optional)
 *     register(ctx) {},                            // optional; ctx = { id, version, base }
 *     tour: 'hello',                               // optional: its guided tour (registered by register())
 *   }
 *
 * A package that fails to load is left out (logged); the portal keeps working.
 *
 * The list is fetched with short retries within the start-up budget (a 503
 * while the portal restarts, a lost connection). If it still fails, it is
 * retried in the background with backoff; when the packages arrive late the
 * page reloads once to draw them. Anonymous visitors get no list (the server
 * does not tell who runs what); after signing in the list is fetched again
 * and the page reloads once when there are packages. Stylesheets are linked
 * only for packages that are switched on.
 */

export const PACKAGES = [];
const entries = new Map();
let bootId = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The pure decisions live in loaderLogic.js (tested without a browser).
const fetchInstalled = (timeoutMs) => fetchList((...args) => fetch(...args), timeoutMs);

/** Reloads the page once per boot of the server and reason (never in a loop; never without storage). */
function reloadOnce(reason, id) {
  let storage = null;
  try {
    storage = window.sessionStorage;
  } catch {
    return;
  }
  if (shouldReload(storage, reason, id)) window.location.reload();
}

let retrying = false;
/** The list could not be read before the first render: keep trying in the background (2 s, 4 s … 60 s). */
async function retryLater() {
  if (retrying) return;
  retrying = true;
  for (const delay of backgroundDelays()) {
    await sleep(delay);
    const result = await fetchInstalled(5000);
    const action = lateAnswerAction(result, PACKAGES);
    if (action === 'retry') continue;
    if (action === 'reload') reloadOnce('late', result.data.bootId);
    else if (action === 'watch-sign-in') watchSignIn();
    break;
  }
  retrying = false;
}

let watching = false;
/** Signed out now: after signing in (AuthContext fires `auth:signed-in`), read the list again. */
function watchSignIn() {
  if (watching) return;
  watching = true;
  window.addEventListener('auth:signed-in', async () => {
    watching = false;
    const result = await fetchInstalled(5000);
    const action = lateAnswerAction(result, PACKAGES, { afterSignIn: true });
    if (action === 'reload') reloadOnce('signin', result.data.bootId);
    else if (action === 'retry') retryLater();
  }, { once: true });
}

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
      import(/* @vite-ignore */ pkg.web.entry).then((mod) => checkEntry(pkg, mod))
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
        Promise.all(files.map((url) => import(/* @vite-ignore */ url).then((mod) => [namespaceOf(url), mod.default || {}]))).then((parts) => Object.fromEntries(parts))
      );
    }
    return cache.get(locale);
  };
}

/** Settings → Modules → <package>: the item of the settings navigation (and its icon slot). */
function addSettingsItem(pkg) {
  if (!pkg.web?.settings) return;
  // The package's own settings.<id> texts when it ships them, else its app name.
  const ownTexts = Object.values(pkg.locales || {}).some((files) => files.some((url) => url.endsWith('/settings.js')));
  const item = addPackageSettingsItem({
    id: pkg.id,
    icon: pkg.web.icon,
    keywords: [pkg.id, ...Object.values(pkg.name || {})].join(' '),
    ...(ownTexts ? {} : { labelKey: `apps.${pkg.id}.name`, descKey: `apps.${pkg.id}.desc` }),
  });
  addMenuSlot(item);
}

function addToRegistry(pkg) {
  if (!pkg.web || MODULE_REGISTRY.some((module) => module.id === pkg.id) || FEATURE_MODULES.some((module) => module.id === pkg.id)) return;
  if (pkg.web.page === false) {
    // No page of its own (the robot assistant): a feature module — its card, icon and Settings screen.
    FEATURE_MODULES.push({
      id: pkg.id,
      icon: pkg.web.icon || 'apps',
      labelKey: `apps.${pkg.id}.name`,
      descKey: `apps.${pkg.id}.desc`,
      package: { version: pkg.version, name: pkg.name },
      Settings: lazy(partLoader(pkg, 'Settings')),
    });
    return;
  }
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
  const deadline = Date.now() + timeoutMs;
  const result = await fetchWithinBudget(fetchInstalled, { timeoutMs, sleep });
  const data = result?.data;
  if (!data) {
    if (!result || result.retry) retryLater();
    return PACKAGES;
  }
  bootId = data.bootId || null;
  if (data.signedIn === false) watchSignIn();
  if (!data.modules?.length) return PACKAGES;
  for (const pkg of packagesToPrepare(data, PACKAGES)) {
    PACKAGES.push(pkg);
    if (Object.keys(pkg.locales || {}).length) addTranslationSource(translationsOf(pkg));
    // A switched-off package's styles stay out of the page.
    if (pkg.enabled !== false) for (const url of pkg.web?.css || []) linkCss(url);
    addToRegistry(pkg);
    addSettingsItem(pkg);
  }
  await withTimeout(
    Promise.allSettled(
      PACKAGES.filter((pkg) => pkg.web && pkg.enabled !== false).map((pkg) =>
        packageEntry(pkg)
          .then((entry) => {
            if (entry.tour) MODULE_UI[pkg.id] = { ...(MODULE_UI[pkg.id] || {}), tour: entry.tour };
            return typeof entry.register === 'function' ? entry.register({ id: pkg.id, version: pkg.version, base: packageBase(pkg) }) : null;
          })
          .catch((err) => console.warn(`Module package ${pkg.id} did not load:`, err?.message || err))
      )
    ),
    Math.max(200, deadline - Date.now())
  );
  return PACKAGES;
}
