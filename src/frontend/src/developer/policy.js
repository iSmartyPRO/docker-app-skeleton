/*
 * The token decision of the server (src/backend/api/scopes.js), repeated in
 * the browser so the editor can answer "would this request pass?" instantly.
 * Keep the two in step.
 */

const BLOCKED = [
  /^\/auth\/(?!me$)/,
  /^\/setup(\/|$)/,
  /^\/pwa\/push/,
  /^\/account\/(password|sessions|telegram|google|api)(\/|$)/,
  /^\/admin\/api(\/|$)/,
  /^\/admin\/users\/\d+\/revoke-sessions$/,
];
const FREE = [/^\/apps$/, /^\/status$/, /^\/settings$/, /^\/developer(\/|$)/, /^\/pwa\/(manifest|vapid)/];

export function normalizePath(raw) {
  let path = String(raw || '/').trim().split('?')[0].toLowerCase().replace(/\/{2,}/g, '/');
  if (path.startsWith('/api/v1/')) path = path.slice(7);
  else if (path.startsWith('/api/')) path = path.slice(4);
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

export function classify(path, moduleIds) {
  if (BLOCKED.some((re) => re.test(path))) return { blocked: true };
  if (FREE.some((re) => re.test(path))) return { free: true };
  if (path === '/auth/me' || path.startsWith('/account')) return { area: 'account' };
  if (path.startsWith('/notifications')) return { area: 'notifications' };
  const app = path.match(/^\/app\/([a-z0-9_-]+)/);
  if (app && moduleIds.includes(app[1])) return { area: app[1] };
  if (/^\/admin\/(users|groups|roles|permissions)(\/|$)/.test(path)) return { area: 'admin.users' };
  if (/^\/admin\/security(\/|$)/.test(path)) return { area: 'admin.security' };
  if (path.startsWith('/admin')) return { area: 'admin.settings' };
  return { free: true };
}

function patternOf(path) {
  const source = path
    .split('/')
    .map((part) => (part === '**' ? '\u0000' : part === '*' ? '[^/]+' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z]\w*/g, '[^/]+')))
    .join('/')
    .replace(/\/\u0000/g, '(?:/.*)?')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${source}$`);
}

export function ruleMatches(rule, method, path) {
  if (rule.methods?.length && !rule.methods.includes(method)) return false;
  let pattern = String(rule.path || '');
  if (!pattern.startsWith('/')) pattern = `/${pattern}`;
  try {
    return patternOf(normalizePath(pattern)).test(path);
  } catch {
    return false;
  }
}

/** → { ok, reason: 'blocked' | 'rule' | 'scope' | 'free' | 'area', scope?, rule? } */
export function decide({ scopes, rules }, method, rawPath, moduleIds) {
  const path = normalizePath(rawPath);
  const verb = String(method).toUpperCase();
  const where = classify(path, moduleIds);
  if (where.blocked) return { ok: false, reason: 'blocked' };
  const deny = (rules || []).find((rule) => rule.effect === 'deny' && ruleMatches(rule, verb, path));
  if (deny) return { ok: false, reason: 'rule', rule: deny.path };
  const allow = (rules || []).find((rule) => rule.effect === 'allow' && ruleMatches(rule, verb, path));
  if (allow) return { ok: true, reason: 'rule', rule: allow.path };
  if (where.free) return { ok: true, reason: 'free' };
  const need = ['GET', 'HEAD', 'OPTIONS'].includes(verb) ? 'read' : 'write';
  const have = scopes?.[where.area] || 'none';
  const ok = have === 'write' || (have === 'read' && need === 'read');
  return { ok, reason: ok ? 'area' : 'scope', scope: `${where.area}:${need}`, area: where.area };
}

/** A template's scopes overlaid with a token's own changes. */
export function effective(template, scopes, rules) {
  return { scopes: { ...(template?.scopes || {}), ...(scopes || {}) }, rules: [...(rules || []), ...(template?.rules || [])] };
}

export const areaKey = (key) => String(key).replace(/\./g, '_');
