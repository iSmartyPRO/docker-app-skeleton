/*
 * The decisions of the browser package loader (loader.js), without React, the DOM or the
 * network: what to fetch again, when to reload the page, which packages are new. Everything
 * the loader needs from the browser (fetch, sessionStorage, location, timers, the clock) is
 * passed in, so the backend tests run this file directly (test/frontend-package-loader.test.js).
 */

export const RELOAD_KEY = 'portal.packages.reloadedFor';
export const INSTALLED_URL = '/api/modules/installed';

export const withTimeout = (promise, ms, setTimer = setTimeout) => Promise.race([promise, new Promise((resolve) => setTimer(() => resolve(null), ms))]);

/** The list's URL: `path` (the page's location) lets an anonymous visitor of a package's public page get that package. */
export const installedUrl = (path) => (typeof path === 'string' && path.startsWith('/') && path !== '/' ? `${INSTALLED_URL}?path=${encodeURIComponent(path.slice(0, 300))}` : INSTALLED_URL);

/** One GET /api/modules/installed: { data } or { retry } (no answer, timeout, 5xx, 429: try again; 4xx: do not). */
export async function fetchInstalled(fetchFn, timeoutMs, { setTimer = setTimeout, path = '' } = {}) {
  try {
    const res = await withTimeout(fetchFn(installedUrl(path), { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' }), timeoutMs, setTimer);
    if (!res) return { retry: true };
    if (res.ok) return { data: await res.json() };
    return { retry: res.status >= 500 || res.status === 429 };
  } catch {
    return { retry: true };
  }
}

/**
 * Fetches the list within `timeoutMs` (the start-up budget), retrying a failed answer with short pauses
 * (250 ms, 500 ms, … never past the deadline). → the last result ({ data } | { retry }) or null when the
 * budget allowed no attempt.
 */
export async function fetchWithinBudget(fetchOnce, { timeoutMs = 3000, now = Date.now, sleep = (ms) => new Promise((done) => setTimeout(done, ms)) } = {}) {
  const deadline = now() + timeoutMs;
  let result = null;
  for (let attempt = 0; ; attempt += 1) {
    const left = deadline - now();
    if (left <= 50) break;
    result = await fetchOnce(left);
    if (!result.retry) break;
    const pause = Math.min(250 * 2 ** attempt, deadline - now() - 50);
    if (pause <= 0) break;
    await sleep(pause);
  }
  return result;
}

/** Pauses of the background retries after a failed start: 2 s, 4 s, … at most 60 s, 10 attempts. */
export const backgroundDelays = () => Array.from({ length: 10 }, (_, attempt) => Math.min(2000 * 2 ** attempt, 60000));

/**
 * Should the page reload for `reason` on server boot `id`? At most once per boot and reason (the key is kept
 * in sessionStorage); never without storage (a reload could repeat forever). Records the reload when yes.
 */
export function shouldReload(storage, reason, id) {
  try {
    const key = `${id || 'unknown'}:${reason}`;
    if (storage.getItem(RELOAD_KEY) === key) return false;
    storage.setItem(RELOAD_KEY, key);
    return true;
  } catch {
    return false;
  }
}

/** Packages of a list that the page has not prepared (a late answer brings new ones → reload once). */
export const newPackages = (data, known) => (data?.modules || []).filter((pkg) => pkg?.id && !known.some((item) => item.id === pkg.id));

/** What a late / after-sign-in answer means: 'reload' | 'watch-sign-in' | 'retry' | null. */
export function lateAnswerAction(result, known, { afterSignIn = false } = {}) {
  if (!result || result.retry) return 'retry';
  const data = result.data;
  // After signing in: reload once for packages the page has not prepared (a public page may have loaded its own already).
  if (afterSignIn) return newPackages(data, known).length ? 'reload' : null;
  if (newPackages(data, known).length) return 'reload';
  if (data?.signedIn === false) return 'watch-sign-in';
  return null;
}

/** The packages of an answer to prepare, in order, without duplicates or ones already prepared. */
export function packagesToPrepare(data, known = []) {
  const out = [];
  for (const pkg of data?.modules || []) {
    if (!pkg?.id || known.some((item) => item.id === pkg.id) || out.some((item) => item.id === pkg.id)) continue;
    out.push(pkg);
  }
  return out;
}

/** The base URL a package's register(ctx) gets (the server sends it with the listing digest). */
export const packageBase = (pkg) => pkg.base || `/modules/${pkg.id}/${pkg.version}/`;

/** Checks the default export of a package's web/index.js. */
export function checkEntry(pkg, mod) {
  const entry = mod?.default || mod;
  if (!entry || typeof entry !== 'object') throw new Error(`web/index.js of ${pkg.id} has no default export`);
  if (entry.id && entry.id !== pkg.id) throw new Error(`web/index.js of ${pkg.id} says id "${entry.id}"`);
  return entry;
}

/** The namespace a translation file fills: …/locales/<lang>/<ns>.js → <ns>. */
export const namespaceOf = (url) => String(url).split('/').pop().replace(/\.js$/, '');
