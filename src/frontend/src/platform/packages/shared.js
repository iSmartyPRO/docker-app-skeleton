import { LIBS, loaders } from 'virtual:portal-shared';
import { SDK_VERSION } from '../sdk/version';

/*
 * window.__PORTAL_SHARED__ — how module packages get the core's libraries and
 * SDK (docs/module-packages.md «Web SDK»). The /sdk/<name>.js shims emitted by
 * the core build await load(name); each name is a separate chunk, downloaded
 * only when a package imports it. npm packages built as CommonJS (React…)
 * come back with their exports as named members.
 */

const cache = new Map();

function normalize(name, ns) {
  if (!LIBS.includes(name)) return ns;
  const base = ns?.default;
  if (!base || (typeof base !== 'object' && typeof base !== 'function')) return ns;
  const out = {};
  for (const key of Object.keys(base)) out[key] = base[key];
  Object.assign(out, ns);
  out.default = base;
  return out;
}

export function installShared() {
  if (typeof window === 'undefined' || window.__PORTAL_SHARED__) return;
  window.__PORTAL_SHARED__ = Object.freeze({
    sdk: SDK_VERSION,
    names: Object.freeze(Object.keys(loaders)),
    load(name) {
      if (!loaders[name]) return Promise.reject(new Error(`The portal does not share ${name}`));
      if (!cache.has(name)) cache.set(name, loaders[name]().then((ns) => normalize(name, ns)));
      return cache.get(name);
    },
  });
}
