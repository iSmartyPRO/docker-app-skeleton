import { useSyncExternalStore } from 'react';

/*
 * Extension points of the shell (docs/extending.md «Module registry and
 * extension points», frontend). The shell and the modules never import each
 * other's internals: a module's entry (modules/<id>/register.js, loaded by
 * modules/registry.js — later the package's web/index.js) contributes to
 * named points, and whoever owns a point reads them.
 *
 *   contribute('header.actions', { id: 'chat', order: 10, Component: ChatButton });
 *   const items = useContributions('header.actions');   // sorted by order, re-renders on change
 *
 * Points used today:
 *   app.providers        { id, order, Component }               wraps the whole app (ChatProvider)
 *   app.publicRoutes     { id, path, Component }                pages without sign-in (/s/…, /l/…, /d/…)
 *   app.homePages        { id, Component }                      «Home page» choices drawn in place (resources)
 *   app.overlays         { id, module, Component }              drawn over every page (the assistant)
 *   app.accountRoutes    { id, path, Component }                pages under /account (approvals substitute)
 *   header.actions       { id, module, order, Component }       buttons in the top bar (chat, «Ждёт меня»)
 *   account.appearance   { id, module, order, Component }       sections of Account → Appearance
 *   maintenance.art      { id, load: () => Promise<pictures> }  pictures of the maintenance page
 *   chat.systemEvents    { id: prefix, render(data, ctx) }       how a module's events read in conversations
 *   employees.tabs       { id, labelKey, order, when, Component } tabs of employee cards
 *   links.<host>         { id, module, Component }              «Связи» blocks of a card (platform/links.jsx)
 *   search.providers     { id, module, search(q) }               global search (platform/search.js)
 * Dashboard widgets have their own registry (platform/widgets.js).
 *
 * A module's public UI for optional consumers (manifest `enhances`):
 *   provideModule('chat', { Conversation: lazy(…), openRoom: async (…) => … });
 *   moduleUi('chat')?.Conversation          // null when Chat is not installed
 *   useModuleUi('chat')                     // null also while Chat is switched off
 */

const points = new Map();
const snapshots = new Map();
const listeners = new Map();
const EMPTY = Object.freeze([]);

function refresh(point) {
  const items = points.get(point);
  snapshots.set(point, Object.freeze([...(items?.values() || [])].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))));
  (listeners.get(point) || new Set()).forEach((listener) => listener());
}

/** Adds (or replaces, by id) an item of a point. Returns a function that removes it. */
export function contribute(point, item) {
  if (!item?.id) throw new Error(`contribute(${point}): an item needs an id`);
  if (!points.has(point)) points.set(point, new Map());
  points.get(point).set(item.id, item);
  refresh(point);
  return () => {
    if (points.get(point)?.get(item.id) === item) {
      points.get(point).delete(item.id);
      refresh(point);
    }
  };
}

/** The items of a point, sorted by `order` (a stable array between changes). */
export const contributions = (point) => snapshots.get(point) || EMPTY;

export function subscribe(point, listener) {
  if (!listeners.has(point)) listeners.set(point, new Set());
  listeners.get(point).add(listener);
  return () => listeners.get(point).delete(listener);
}

export function useContributions(point) {
  return useSyncExternalStore(
    (listener) => subscribe(point, listener),
    () => contributions(point),
    () => contributions(point)
  );
}

// ── Public UI of modules ────────────────────────────────────────────────────

const provided = new Map();
const providedListeners = new Set();

export function provideModule(id, api) {
  provided.set(id, api);
  providedListeners.forEach((listener) => listener());
}

/** The module's public UI while it is installed (switched on or not), else null. */
export const moduleUi = (id) => provided.get(id) || null;

/** Ids of the modules that provided a public UI. */
export const providedModules = () => [...provided.keys()];

function useProvided(id) {
  return useSyncExternalStore(
    (listener) => {
      providedListeners.add(listener);
      return () => providedListeners.delete(listener);
    },
    () => provided.get(id) || null,
    () => provided.get(id) || null
  );
}

/**
 * The module's public UI while it is installed and switched on in `settings`
 * (public settings from useSettings()), else null.
 */
export function useModuleUi(id, settings) {
  const api = useProvided(id);
  if (!api) return null;
  if (settings && !settings.modules?.[id]?.enabled) return null;
  return api;
}
