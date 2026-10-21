import { useEffect, useState, useSyncExternalStore } from 'react';
import api from '../services/api';
import { FEATURE_MODULES, MODULE_REGISTRY } from './registry';
import { activeLocale } from '../i18n/translations';

/**
 * Client side of the module manifest (docs/extending.md «Module manifest»).
 *
 * The server manifest (src/backend/modules/manifest.js) owns the facts —
 * version, category, requires, enhances, minCore, changelog, permissions —
 * and GET /api/admin/modules returns them with each module's state. This file
 * adds what only the browser has:
 *
 *   MODULE_UI[id] = {
 *     tour: null,          // the module's guided tour — see below
 *   }
 *   plus, derived automatically:
 *     adminDocs            help/admin/<lang>/<id>.js exists → the «About the module» page
 *     help                 help/content/<lang>/<id>.js exists → the user guide /help/<id>
 *     icon, labelKey, descKey, Settings, path  ← modules/registry.js
 *
 * Tours (workstream «tours»): set `tour` of a module to anything the tour
 * runner understands — a tour id string, a tour object, or a loader
 * `() => import('../tours/tasks')`. The runner is installed once with
 * setTourRunner(fn); fn(tour, { moduleId }) starts it. The «Tour» buttons
 * (Modules page, About the module) appear only when the module has a `tour`
 * and a runner is installed: useModuleTour(id) → { available, start }.
 */
export const MODULE_UI = {
  approvals: { tour: 'approvals' }, // modules/shared/businessTours.js
  dashboard: { tour: null },
  tasks: { tour: null },
  calendar: { tour: null },
  chat: { tour: null },
  resources: { tour: null },
  qr: { tour: null },
  assistant: { tour: null },
  files: { tour: null },
  kb: { tour: null },
  contracts: { tour: 'contracts' }, // modules/shared/businessTours.js
  companies: { tour: null },
  crm: { tour: 'crm' }, // modules/shared/businessTours.js
  procurement: { tour: 'procurement' }, // modules/shared/businessTours.js
  warehouse: { tour: 'warehouse' }, // modules/shared/businessTours.js
  masterplan: { tour: 'masterplan' }, // modules/shared/businessTours.js
  drive: { tour: null },
  // Tours registered in modules/people/tours.js (imported by App.jsx).
  org: { tour: 'org' },
  employees: { tour: 'employees' },
  // Registered in modules/directory/register.js (imported by App.jsx).
  directory: { tour: 'directory' },
};

/** Category icons (MenuIcon names) for the Modules page; labels are i18n platform.categories.<id>. */
export const CATEGORY_ICONS = {
  work: 'tasks',
  documents: 'file',
  sales: 'target',
  supply: 'box',
  construction: 'siteplan',
  people: 'people',
  infrastructure: 'server',
};

// One file per language (help/admin/<lang>/<id>.js), laid over English at build time (?l10n).
const adminDocLoaders = import.meta.glob('../help/admin/*/*.js', { query: '?l10n', import: 'default' });
const helpLoaders = import.meta.glob('../help/content/en/*.js', { query: '?l10n', import: 'default' });

export const hasAdminDocs = (id) => Boolean(adminDocLoaders[`../help/admin/en/${id}.js`]);
export const hasUserHelp = (id) => Boolean(helpLoaders[`../help/content/en/${id}.js`]);

const docsCache = new Map();
/** The admin docs content of a module (help/admin/<lang>/<id>.js, see help/ADMIN_SCHEMA.md), or null. */
export function loadAdminDocs(id, locale = activeLocale()) {
  const lang = adminDocLoaders[`../help/admin/${locale}/${id}.js`] ? locale : 'en';
  const key = `${lang}/${id}`;
  if (!docsCache.has(key)) {
    const loader = adminDocLoaders[`../help/admin/${key}.js`];
    docsCache.set(key, loader ? loader() : Promise.resolve(null));
  }
  return docsCache.get(key);
}

/** Registry entry (app or feature module) of an id: icon, labelKey, descKey, Settings, path. */
export function moduleUi(id) {
  const entry = MODULE_REGISTRY.find((module) => module.id === id) || FEATURE_MODULES.find((module) => module.id === id) || null;
  return entry ? { ...entry, ...(MODULE_UI[id] || {}) } : null;
}

// ── Tours bridge ────────────────────────────────────────────────────────────

let tourRunner = null;
const tourListeners = new Set();

/** Installed by the tours framework: fn(tour, { moduleId }) starts a tour. Pass null to remove. */
export function setTourRunner(fn) {
  tourRunner = typeof fn === 'function' ? fn : null;
  tourListeners.forEach((listener) => listener());
}

export function startModuleTour(id) {
  const tour = MODULE_UI[id]?.tour;
  if (!tour || !tourRunner) return false;
  tourRunner(tour, { moduleId: id });
  return true;
}

const subscribeTours = (listener) => {
  tourListeners.add(listener);
  return () => tourListeners.delete(listener);
};

export function useModuleTour(id) {
  const runner = useSyncExternalStore(subscribeTours, () => tourRunner);
  const available = Boolean(runner && MODULE_UI[id]?.tour);
  return { available, start: () => startModuleTour(id) };
}

// ── Server manifest ─────────────────────────────────────────────────────────

/**
 * GET /api/admin/modules: { modules: [{ id, name, version, category, minCore,
 * requires, enhances, changelog, docs, permissions, core, enabled, status,
 * missing, dependents, demo }], core: [...], coreVersion, demo }.
 */
export function useModulesCatalog() {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await api.get('/admin/modules');
      setState({ data: res.data, error: null, loading: false });
    } catch (error) {
      setState((prev) => ({ ...prev, error, loading: false }));
    }
  };
  useEffect(() => {
    load();
  }, []);
  return { ...state, reload: load };
}
