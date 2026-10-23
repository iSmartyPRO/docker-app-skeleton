/*
 * Core registry: the modules that are loaded and the extension points they
 * plug into (docs/extending.md «Module registry and extension points»).
 *
 * Core code never imports a module; modules never import each other's
 * internals. Instead:
 *
 *   - the loader (modules/index.js today, the package loader later) calls
 *     activateModules([...]) — every module is registered first, then each
 *     module's register(ctx) runs;
 *   - a module reaches an optional module (manifest `enhances`) at run time:
 *       ctx.modules.get('crm')?.api        // null when CRM is off or not installed
 *       ctx.modules.loaded('chat')?.api    // installed, even while switched off (data upkeep)
 *       await ctx.modules.use('crm')       // the api after a fresh «is it on?» check, or null
 *   - modules add to core features through the register* functions below
 *     (also on ctx): dashboard widgets, «objects» sources, «Связи» link
 *     providers, search providers, link previews, notification follow
 *     targets, API-token resource lists, server lifecycle hooks; events go
 *     through platform/events.js (ctx.events). ctx also carries the older
 *     core mechanisms: registerApprovalType (Approvals document types),
 *     registerInboxProvider («Ждёт меня»), registerJob (scheduler) — these
 *     return promises.
 *
 * Nothing here imports module code or the settings service statically (the
 * settings service reports module states with noteModuleStates()).
 */

import { events } from './events.js';
import { registerWidget, registerWidgetSection, widgetDefinitions } from './widgets.js';

// ── Loaded modules ──────────────────────────────────────────────────────────

const loadedModules = new Map();
const waiting = new Map();
// { id: boolean } as last seen in settings (null until settings were read once).
let enabledState = null;

/** The settings service calls this with settings.modules ({ id: { enabled } }) whenever it parses them. */
export function noteModuleStates(states) {
  if (!states || typeof states !== 'object') return;
  enabledState = Object.fromEntries(Object.entries(states).map(([id, state]) => [id, Boolean(state?.enabled)]));
}

/** Adds a loaded module (its default export: { id, api?, version?, … }). Idempotent per id. */
export function registerModule(module) {
  if (!module?.id) throw new Error('registerModule: a module needs an id');
  const entry = { id: module.id, version: module.version || null, api: module.api || null, module };
  loadedModules.set(module.id, entry);
  for (const fn of waiting.get(module.id) || []) runSafe(`whenLoaded(${module.id})`, () => fn(entry.api, entry));
  waiting.delete(module.id);
  return entry;
}

/** Forgets a module (tests; a package that failed to start). */
export function unregisterModule(id) {
  loadedModules.delete(id);
}

function runSafe(label, fn) {
  try {
    const result = fn();
    if (result && typeof result.catch === 'function') result.catch((err) => console.warn(`[modules] ${label} failed:`, err?.message || err));
  } catch (err) {
    console.warn(`[modules] ${label} failed:`, err?.message || err);
  }
}

async function readEnabled(id) {
  const { getSettingsView } = await import('../services/settings.js');
  return Boolean((await getSettingsView()).modules?.[id]?.enabled);
}

export const modules = {
  /** The module's entry while it is installed and switched on, else null. Sync: uses the last settings read. */
  get(id) {
    const entry = loadedModules.get(id);
    if (!entry) return null;
    if (enabledState && enabledState[id] === false) return null;
    return entry;
  },
  /** The module's entry while it is installed (switched on or not), else null. */
  loaded(id) {
    return loadedModules.get(id) || null;
  },
  /** Shorthand for get(id)?.api ?? null. */
  api(id) {
    return this.get(id)?.api ?? null;
  },
  /** Is the module installed and switched on right now (reads settings)? */
  async enabled(id) {
    return loadedModules.has(id) && (await readEnabled(id));
  },
  /** The module's api after a fresh check that it is installed and on, else null. */
  async use(id) {
    return (await this.enabled(id)) ? loadedModules.get(id).api ?? null : null;
  },
  /** Runs fn(api, entry) once the module is loaded (at once when it already is). */
  whenLoaded(id, fn) {
    const entry = loadedModules.get(id);
    if (entry) runSafe(`whenLoaded(${id})`, () => fn(entry.api, entry));
    else waiting.set(id, [...(waiting.get(id) || []), fn]);
  },
  /** Ids of the loaded modules, in load order. */
  ids() {
    return [...loadedModules.keys()];
  },
};

/** Is a module switched on (settings), for providers owned by a module; core providers (module null) always are. */
async function moduleOn(module) {
  if (!module) return true;
  return modules.enabled(module);
}

// ── «Связи»: link providers ─────────────────────────────────────────────────

/*
 * A module that owns something other cards may point at (a CRM deal, a
 * contract, a Masterplan object) registers a provider; the card that holds
 * the link asks for it by kind and works without it (the link is hidden).
 *
 *   registerLinkProvider({
 *     kind: 'crm.deal', module: 'crm',
 *     search: async (req, { q, pageSize, group }) => [{ id, label, hint, … }],
 *     resolve: async (req, id) => ({ id, label, url, … }) | null,   // null: unknown or not visible to this person
 *   });
 *   const deals = await linkProvider('crm.deal');                  // null while CRM is off / not installed
 */
const linkProviderMap = new Map();

export function registerLinkProvider(definition) {
  if (!definition?.kind) throw new Error('registerLinkProvider needs a kind');
  linkProviderMap.set(definition.kind, { module: null, ...definition });
}

/** The provider of `kind` while its module is on, else null. */
export async function linkProvider(kind) {
  const provider = linkProviderMap.get(kind);
  if (!provider) return null;
  return (await moduleOn(provider.module)) ? provider : null;
}

export const linkProviderKinds = () => [...linkProviderMap.keys()];

// ── «Объекты»: object sources ───────────────────────────────────────────────

/*
 * «Objects» are the places work is done for (a construction project and its
 * plots, a site of the org structure). Modules that pick an object
 * (Procurement, Warehouse) ask the core, never the module that keeps them:
 *
 *   registerObjectSource({
 *     id: 'masterplan', module: 'masterplan', area: 'masterplan', priority: 10,
 *     projects: async (req, { q }) => [{ id, label }],                 // top level
 *     objects: async (req, { project, q }) => [{ id, label }],         // inside a project
 *     projectLabel: async (req, id) => 'name' | null,                  // null: unknown / not visible
 *     objectLabel: async (req, id, { projectId }) => 'label' | null,
 *   });
 *   const source = await objectSource();   // the highest-priority source whose module is on, or null
 */
const objectSourceMap = new Map();

export function registerObjectSource(definition) {
  if (!definition?.id) throw new Error('registerObjectSource needs an id');
  objectSourceMap.set(definition.id, { module: null, priority: 0, ...definition });
}

/** The object source to use (by id, or the highest-priority one) while its module is on, else null. */
export async function objectSource(id = null) {
  const list = id ? [objectSourceMap.get(id)].filter(Boolean) : [...objectSourceMap.values()].sort((a, b) => b.priority - a.priority);
  for (const source of list) if (await moduleOn(source.module)) return source;
  return null;
}

export const objectSourceIds = () => [...objectSourceMap.keys()];

// ── Search providers ────────────────────────────────────────────────────────

/*
 *   registerSearchProvider({ id: 'kb', module: 'kb', search: async (req, q, { limit }) => [{ id, title, url, kind, hint }] });
 *   await searchProviders()   // providers whose module is on
 *   await searchAll(req, q)   // [{ provider, items }] — a failing provider is left out
 */
const searchProviderMap = new Map();

export function registerSearchProvider(definition) {
  if (!definition?.id || typeof definition.search !== 'function') throw new Error('registerSearchProvider needs { id, search }');
  searchProviderMap.set(definition.id, { module: null, ...definition });
}

export async function searchProviders() {
  const out = [];
  for (const provider of searchProviderMap.values()) if (await moduleOn(provider.module)) out.push(provider);
  return out;
}

export async function searchAll(req, q, { limit = 10 } = {}) {
  const results = [];
  for (const provider of await searchProviders()) {
    try {
      results.push({ provider: provider.id, module: provider.module, items: (await provider.search(req, q, { limit })) || [] });
    } catch (err) {
      console.warn(`[search] ${provider.id} failed:`, err?.message || err);
    }
  }
  return results;
}

// ── Public link previews (services/linkPreview) ────────────────────────────

/*
 *   registerPreviewProvider('files', async (route, { facts }) => model)
 * route: { module, token, folderId?, itemId? } from services/linkPreview parseRoute().
 */
const previewProviderMap = new Map();

export function registerPreviewProvider(module, fn) {
  previewProviderMap.set(module, fn);
}

export const previewProvider = (module) => previewProviderMap.get(module) || null;

// ── Notification follow targets (account → notification subscriptions) ─────

/*
 *   registerFollowable('tasks.project', { module: 'tasks', canFollow: async (req, id) => boolean })
 */
const followables = new Map();

export function registerFollowable(type, definition) {
  followables.set(type, { module: null, ...definition });
}

/** Can the person follow (and keep following) `type` #id? False for unknown types and modules that are off. */
export async function canFollow(req, type, id) {
  const definition = followables.get(type);
  if (!definition || !Number.isInteger(Number(id))) return false;
  if (definition.module && !modules.loaded(definition.module)) return false;
  return Boolean(await definition.canFollow(req, Number(id)));
}

// ── API token resources (api/templates.js resourceOptions) ──────────────────

/*
 *   registerTokenResources('tasks.projects', { module: 'tasks', list: async (req, { all }) => [{ id, name, code, color, is_personal, owner }] })
 */
const tokenResources = new Map();

export function registerTokenResources(key, definition) {
  tokenResources.set(key, { module: null, ...definition });
}

export const tokenResourceLister = (key) => tokenResources.get(key) || null;

// ── Server lifecycle ────────────────────────────────────────────────────────

/*
 * Modules that need the HTTP server (WebSocket tunnels) or must close things
 * on shutdown (SSE streams) register hooks; the boot code runs them:
 *   onHttpServer((server) => …)    runHttpServerHooks(server)
 *   onShutdown(() => …)            await runShutdownHooks()
 */
const httpServerHooks = [];
const shutdownHooks = [];

export const onHttpServer = (fn, { module = null } = {}) => httpServerHooks.push({ fn, module });
export const onShutdown = (fn, { module = null } = {}) => shutdownHooks.push({ fn, module });

export function runHttpServerHooks(server) {
  for (const { fn, module } of httpServerHooks) runSafe(`http server hook of ${module || 'core'}`, () => fn(server));
}

export async function runShutdownHooks() {
  for (const { fn, module } of shutdownHooks) {
    try {
      await fn();
    } catch (err) {
      console.warn(`[modules] shutdown hook of ${module || 'core'} failed:`, err?.message || err);
    }
  }
}

// ── Module context and activation ───────────────────────────────────────────

/**
 * What a module's register(ctx) receives. Registrations made through ctx are
 * tagged with the module's id, so they hide while the module is off.
 */
export function moduleContext(module) {
  const id = module.id;
  const own = (definition) => ({ module: id, ...definition });
  return {
    id,
    modules,
    events: {
      on: (name, handler) => events.on(name, handler, { module: id }),
      emit: events.emit,
    },
    registerWidget: (definition) => registerWidget(own(definition)),
    registerWidgetSection: (type, definition) => registerWidgetSection(type, own(definition)),
    registerLinkProvider: (definition) => registerLinkProvider(own(definition)),
    registerObjectSource: (definition) => registerObjectSource(own(definition)),
    registerSearchProvider: (definition) => registerSearchProvider(own(definition)),
    registerPreviewProvider: (fn) => registerPreviewProvider(id, fn),
    registerFollowable: (type, definition) => registerFollowable(type, own(definition)),
    registerTokenResources: (key, definition) => registerTokenResources(key, own(definition)),
    onHttpServer: (fn) => onHttpServer(fn, { module: id }),
    onShutdown: (fn) => onShutdown(fn, { module: id }),
    // Existing core mechanisms, reached through ctx too (loaded on use: no import cycles with the settings service).
    registerApprovalType: (definition) => import('../modules/approvals/api.js').then((approvals) => approvals.registerApprovalType(definition)),
    registerInboxProvider: (key, provider, options = {}) => import('../services/inbox.js').then((inbox) => inbox.registerInboxProvider(key, provider, { module: id, ...options })),
    registerJob: (job) => import('../services/scheduler.js').then((scheduler) => scheduler.registerJob(job)),
  };
}

const activated = new Set();

/**
 * Registers every module of the list, then runs each one's register(ctx)
 * (once per module). A register() that throws is logged and the module stays
 * loaded without its extensions — the portal keeps running.
 */
export function activateModules(list) {
  for (const module of list) registerModule(module);
  for (const module of list) {
    if (activated.has(module.id) || typeof module.register !== 'function') continue;
    activated.add(module.id);
    try {
      module.register(moduleContext(module));
    } catch (err) {
      console.error(`[modules] ${module.id}: register() failed:`, err?.message || err);
    }
  }
}

export { events, registerWidget, registerWidgetSection, widgetDefinitions };
