import authRoutes from '../routes/auth.routes.js';
import adminRoutes from '../routes/admin.routes.js';
import accountRoutes from '../routes/account.routes.js';
import notificationRoutes from '../routes/notifications.routes.js';
import { MOUNTED } from '../modules/index.js';
import { classify } from './scopes.js';
import { DOCS, SECTIONS } from './reference.js';

/*
 * Every endpoint of the API, read from the mounted Express routers, so the
 * reference never misses a route. Hand-written docs (reference.js) are joined
 * by "METHOD /path".
 */

/**
 * The path a nested router is mounted at (`router.use('/access', sub)`), from Express 4's layer
 * regexp: /^\/access\/?(?=\/|$)/i → "/access", parameters back as ":name". null when unreadable.
 */
export function mountPathOf(layer) {
  if (layer.regexp?.fast_slash) return '';
  let source = String(layer.regexp?.source || '');
  if (!source.startsWith('^') || !source.endsWith('\\/?(?=\\/|$)')) return null;
  source = source.slice(1, -'\\/?(?=\\/|$)'.length);
  const keys = [...(layer.keys || [])];
  source = source.replace(/\(\?:\\\/\(\[\^\/\]\+\?\)\)/g, () => `/:${keys.shift()?.name ?? 'param'}`);
  const path = source.replace(/\\\//g, '/').replace(/\\([.-])/g, '$1');
  return /^(\/[\w:.-]+)+$/.test(path) ? path : null;
}

function routesOf(router, prefix) {
  const out = [];
  for (const layer of router.stack || []) {
    if (!layer.route) {
      // A nested router (e.g. the File server's /access): its routes under the mount path.
      if (Array.isArray(layer.handle?.stack)) {
        const mount = mountPathOf(layer);
        if (mount !== null) out.push(...routesOf(layer.handle, `${prefix}${mount}`));
      }
      continue;
    }
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const path of paths) {
      if (typeof path !== 'string') continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        out.push({ method: method.toUpperCase(), path: `${prefix}${path === '/' && prefix ? '/' : path}` });
      }
    }
  }
  return out;
}

const CORE = [
  ['/auth', authRoutes],
  ['/account', accountRoutes],
  ['/notifications', notificationRoutes],
  ['/admin', adminRoutes],
];

let cached = null;

/** [{ method, path, section, area, level, blocked, doc }] */
export function endpoints() {
  if (cached) return cached;
  const raw = [
    { method: 'GET', path: '/apps' },
    { method: 'GET', path: '/status' },
    ...CORE.flatMap(([prefix, router]) => routesOf(router, prefix)),
    ...MOUNTED.flatMap((mount) => routesOf(mount.router, mount.prefix)),
  ];
  const seen = new Set();
  const list = [];
  for (const route of raw) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A concrete path to classify: parameters become a placeholder segment.
    const sample = route.path.replace(/:(\w+)(\([^)]*\))?/g, (_, name, choices) => (choices ? choices.slice(1, -1).split('|')[0] : '1')).replace(/\/$/, '') || '/';
    const where = classify(sample);
    if (where.blocked) continue;
    const section = SECTIONS.find((item) => item.prefix.some((prefix) => sample === prefix || sample.startsWith(`${prefix}/`) || (prefix.endsWith('/me') && sample === prefix)));
    list.push({
      method: route.method,
      path: route.path,
      section: section?.key || 'common',
      area: where.area || null,
      level: where.area ? (['GET', 'HEAD'].includes(route.method) ? 'read' : 'write') : null,
      // Public paths run as an anonymous visitor, not as the token's owner.
      anonymous: Boolean(where.anonymous),
      doc: DOCS[key] || null,
    });
  }
  // Sections in their order; inside, documented endpoints in the order they are written up, then the rest by path.
  const order = SECTIONS.map((section) => section.key);
  const docOrder = Object.keys(DOCS);
  const rank = (endpoint) => (endpoint.doc ? docOrder.indexOf(`${endpoint.method} ${endpoint.path}`) : Infinity);
  list.sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || rank(a) - rank(b) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  cached = list;
  return list;
}
