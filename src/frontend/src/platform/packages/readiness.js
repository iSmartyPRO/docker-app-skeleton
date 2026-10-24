/*
 * What the shell is still waiting for (docs/module-packages.md «Shell»), shared by the loader (loader.js) and the
 * placeholders of package public pages (PublicPlaceholder.jsx):
 *   - the package list of the page the visitor opened (until the first answer, or the background retries give up):
 *     the catch-all route does not redirect that page meanwhile;
 *   - each package's web entry and register(): a placeholder at its public prefix (/d/*) waits for it.
 */
import { holdsCatchAll } from './loaderLogic';

/** The page the visitor opened (its path is what the list is asked for, also on every retry). */
export const START_PATH = typeof window !== 'undefined' ? window.location.pathname : '';
const OPENED_AT = Date.now();

let listPending = true;
const listeners = new Set();

export function settleList() {
  if (!listPending) return;
  listPending = false;
  listeners.forEach((listener) => listener());
}

export const subscribeList = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const isListPending = () => listPending;

/** May the catch-all redirect `path` now? (loaderLogic.holdsCatchAll) */
export const catchAllHolds = (path) => holdsCatchAll({ listPending, startPath: START_PATH, path, elapsedMs: Date.now() - OPENED_AT });
export const msSinceOpened = () => Date.now() - OPENED_AT;

const ready = new Map();

function deferred(id) {
  if (!ready.has(id)) {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    ready.set(id, { promise, resolve });
  }
  return ready.get(id);
}

/** Resolves true when the package's web entry has loaded and its register() ran, false when it failed. */
export const packageReady = (id) => deferred(id).promise;
export const markPackageReady = (id, ok) => deferred(id).resolve(Boolean(ok));
