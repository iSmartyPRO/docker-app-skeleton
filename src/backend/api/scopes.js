import { MODULE_CATALOG } from '../modules/catalog.js';

/*
 * What a token may reach.
 *
 * Every API path belongs to one *area* (the account, notifications, each
 * module, three administration areas). A token holds a level per area:
 *   none   nothing
 *   read   GET / HEAD
 *   write  every method
 * Rules refine that by path: `deny` always wins, `allow` opens a path the
 * areas do not. Some paths are never available to tokens at all (signing in,
 * passwords, push subscriptions, token management itself).
 *
 * The person the token belongs to keeps their own rights: a token can only
 * narrow what its owner may do, never widen it.
 */

export const LEVELS = ['none', 'read', 'write'];

export const AREAS = [
  { key: 'account', group: 'personal', icon: 'user' },
  { key: 'notifications', group: 'personal', icon: 'bell' },
  ...MODULE_CATALOG.map((module) => ({ key: module.id, group: 'modules', icon: module.id, module: module.id })),
  { key: 'admin.users', group: 'admin', icon: 'people' },
  { key: 'admin.security', group: 'admin', icon: 'shield' },
  { key: 'admin.settings', group: 'admin', icon: 'settings' },
];
export const AREA_KEYS = AREAS.map((area) => area.key);

/** Paths a token can never use, whatever its scopes. */
const BLOCKED = [
  /^\/auth\/(?!me$)/,
  /^\/setup(\/|$)/,
  /^\/pwa\/push/,
  /^\/account\/(password|sessions|telegram|google|api)(\/|$)/,
  /^\/admin\/api(\/|$)/,
  /^\/admin\/users\/[^/]+\/revoke-sessions$/,
  // Answers with a session cookie for someone else ("sign in as").
  /^\/admin\/users\/[^/]+\/impersonate$/,
  // The AD directory changes Active Directory as the person's own domain account: sessions only.
  /^\/app\/directory(\/|$)/,
];

/** Open to any valid token: bootstrap reads and the developer reference. */
const FREE = [/^\/apps$/, /^\/status$/, /^\/settings$/, /^\/developer(\/|$)/, /^\/pwa\/(manifest|vapid)/];

const MODULE_IDS = new Set(MODULE_CATALOG.map((module) => module.id));

/**
 * The path as the gate compares it: lower case (Express routes ignore case,
 * so /api/Admin must be judged like /api/admin), repeated slashes collapsed.
 */
export function normalizePath(raw) {
  let path = String(raw || '/').split('?')[0].toLowerCase().replace(/\/{2,}/g, '/');
  if (path.startsWith('/api/v1/')) path = path.slice(7);
  else if (path.startsWith('/api/')) path = path.slice(4);
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

/**
 * The normalised path of a request target (req.originalUrl), or null when it
 * cannot be judged. Origin-form (`/api/x?y`) is taken as Express routes it;
 * absolute-form (`http://host/api/x`) is judged by its pathname, so it cannot
 * slip past the areas as a path that matches nothing. Anything else is null
 * and must be refused.
 */
export function requestPath(raw) {
  const text = String(raw ?? '');
  let pathname;
  if (text.startsWith('/')) pathname = text.split(/[?#]/)[0];
  else {
    try {
      pathname = new URL(text).pathname;
    } catch {
      return null;
    }
  }
  if (!pathname || !pathname.startsWith('/')) return null;
  return normalizePath(pathname);
}

/** The area a path belongs to: { area } | { free } | { blocked }. */
export function classify(path) {
  if (BLOCKED.some((re) => re.test(path))) return { blocked: true };
  if (FREE.some((re) => re.test(path))) return { free: true };
  if (path === '/auth/me' || path.startsWith('/account')) return { area: 'account' };
  if (path.startsWith('/notifications')) return { area: 'notifications' };
  const app = path.match(/^\/app\/([a-z0-9_-]+)/);
  if (app && MODULE_IDS.has(app[1])) return { area: app[1] };
  if (/^\/admin\/(users|groups|roles|permissions)(\/|$)/.test(path)) return { area: 'admin.users' };
  if (/^\/admin\/security(\/|$)/.test(path)) return { area: 'admin.security' };
  if (path.startsWith('/admin')) return { area: 'admin.settings' };
  // Public share prefixes and anything else work as for an anonymous visitor:
  // the gate drops the token owner's identity for them (see gate.js).
  return { free: true, anonymous: true };
}

export const isReadMethod = (method) => ['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase());

// ── Rules ───────────────────────────────────────────────────────────────────

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** `{ effect, methods, path }` cleaned; paths use * (one segment) and ** (the rest). */
export function cleanRules(list) {
  const out = [];
  for (const rule of Array.isArray(list) ? list : []) {
    const effect = rule?.effect === 'allow' ? 'allow' : rule?.effect === 'deny' ? 'deny' : null;
    let path = String(rule?.path || '').trim().toLowerCase();
    if (!effect || !path) continue;
    if (path.startsWith('/api/v1/')) path = path.slice(7);
    else if (path.startsWith('/api/')) path = path.slice(4);
    if (!path.startsWith('/')) path = `/${path}`;
    if (!/^[\w\-./*:]+$/.test(path) || path.length > 200) continue;
    const methods = (Array.isArray(rule.methods) ? rule.methods : [])
      .map((method) => String(method).toUpperCase())
      .filter((method) => METHODS.includes(method));
    out.push({ effect, methods: [...new Set(methods)], path, note: String(rule.note || '').slice(0, 120) });
  }
  return out.slice(0, 100);
}

const patternCache = new Map();
function patternOf(path) {
  if (!patternCache.has(path)) {
    const source = path.toLowerCase()
      .split('/')
      .map((part) => (part === '**' ? '\u0000' : part === '*' ? '[^/]+' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z]\w*/g, '[^/]+')))
      .join('/')
      .replace(/\/\u0000/g, '(?:/.*)?')
      .replace(/\u0000/g, '.*');
    patternCache.set(path, new RegExp(`^${source}$`));
  }
  return patternCache.get(path);
}

/** HEAD is a GET without a body: rules and scopes judge it as GET. */
const ruleMethod = (method) => {
  const upper = String(method).toUpperCase();
  return upper === 'HEAD' ? 'GET' : upper;
};

export function ruleMatches(rule, method, path) {
  if (rule.methods.length && !rule.methods.includes(ruleMethod(method))) return false;
  return patternOf(String(rule.path).toLowerCase()).test(String(path).toLowerCase());
}

// ── Scopes ──────────────────────────────────────────────────────────────────

export function cleanScopes(input, { partial = false } = {}) {
  const out = {};
  for (const key of AREA_KEYS) {
    const value = input?.[key];
    if (LEVELS.includes(value)) out[key] = value;
    else if (!partial) out[key] = 'none';
  }
  return out;
}

/*
 * Stored scopes of areas this core does not know (a module package not installed yet or
 * removed) are carried over by an edit, so the token or template gets them back with the package.
 */
export function keepUnknownScopes(stored, next) {
  let parsed = stored;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return next;
  const carried = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!AREA_KEYS.includes(key) && key !== '__proto__' && LEVELS.includes(value)) carried[key] = value;
  }
  return { ...carried, ...next };
}

/** A template's scopes overlaid with the token's own changes. */
export function effectivePolicy(template, token) {
  return {
    scopes: { ...cleanScopes(template?.scopes || {}), ...cleanScopes(token?.scopes || {}, { partial: true }) },
    rules: [...cleanRules(token?.rules), ...cleanRules(template?.rules)],
  };
}

/**
 * Whether a policy lets `method path` through.
 * → { ok, code?, scope?, rule? }
 */
export function decide(policy, method, path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return { ok: false, code: 'ROUTE_NOT_AVAILABLE' };
  const where = classify(path);
  if (where.blocked) return { ok: false, code: 'ROUTE_NOT_AVAILABLE' };
  const deny = policy.rules.find((rule) => rule.effect === 'deny' && ruleMatches(rule, method, path));
  if (deny) return { ok: false, code: 'SCOPE_DENIED', rule: deny.path };
  if (policy.rules.some((rule) => rule.effect === 'allow' && ruleMatches(rule, method, path))) return { ok: true };
  if (where.free) return { ok: true };
  const need = isReadMethod(method) ? 'read' : 'write';
  const have = policy.scopes[where.area] || 'none';
  const ok = have === 'write' || (have === 'read' && need === 'read');
  return ok ? { ok } : { ok, code: 'SCOPE_DENIED', scope: `${where.area}:${need}` };
}

// ── Resource limits ─────────────────────────────────────────────────────────

/*
 * A token (or a webhook) may be narrowed to some projects, calendars,
 * spaces or CRM pipelines. The limit is applied by the shared access lists of
 * the modules (modules/shared/acl.js), so every endpoint of the module honours
 * it. `table` is the key the limit is stored under (req.apiLimits[table]); for
 * kinds without an access list (`acl: false`, CRM pipelines) it is just a name
 * the module checks itself (withinLimits in modules/crm/access.js).
 */
export const RESOURCE_KINDS = [
  { key: 'tasks.projects', module: 'tasks', table: 'task_acl' },
  { key: 'calendar.calendars', module: 'calendar', table: 'cal_acl' },
  { key: 'files.spaces', module: 'files', table: 'fs_space_acl' },
  { key: 'crm.pipelines', module: 'crm', table: 'crm_pipelines', acl: false },
];

export function cleanLimits(input) {
  const out = {};
  for (const kind of RESOURCE_KINDS) {
    const list = input?.[kind.key];
    if (!Array.isArray(list)) continue;
    out[kind.key] = [...new Set(list.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  }
  return out;
}

/** Limits keyed by access-list table, as the modules read them: { task_acl: Set }. */
export function limitsByTable(limits) {
  const out = {};
  for (const kind of RESOURCE_KINDS) {
    if (Array.isArray(limits?.[kind.key])) out[kind.table] = new Set(limits[kind.key]);
  }
  return Object.keys(out).length ? out : null;
}
