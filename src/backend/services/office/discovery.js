import { editingConfig } from './config.js';

/*
 * WOPI discovery of the Collabora server: which extensions it opens and the
 * editor page (urlsrc) for each action. Read from {discoveryUrl}/hosting/discovery,
 * kept in memory for a day; a failed read is retried after a few minutes and
 * the last good copy keeps working meanwhile.
 */

const DAY = 24 * 60 * 60 * 1000;
const RETRY = 5 * 60 * 1000;
const cache = new Map();

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (text) => String(text).replace(/&(amp|lt|gt|quot|apos);/g, (_m, name) => ENTITIES[name]);

function attrs(source) {
  const out = {};
  for (const match of String(source).matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[match[1]] = decode(match[2]);
  return out;
}

/**
 * Discovery XML → { extensions: { ext: { edit?, view?, app } }, capabilitiesUrl, proofKey }.
 * Only "edit" and "view" actions by extension matter here.
 */
export function parseDiscovery(xml) {
  const text = String(xml || '');
  if (!/<wopi-discovery[\s>]/.test(text)) throw new Error('Not a WOPI discovery document');
  const extensions = {};
  let capabilitiesUrl = null;
  for (const app of text.matchAll(/<app\b([^>]*)>([\s\S]*?)<\/app>/g)) {
    const appAttrs = attrs(app[1]);
    for (const action of app[2].matchAll(/<action\b([^>]*?)\/?>/g)) {
      const a = attrs(action[1]);
      if (a.name === 'getinfo' && a.urlsrc) capabilitiesUrl = a.urlsrc;
      const ext = String(a.ext || '').toLowerCase();
      if (!ext || !a.urlsrc || !['edit', 'view', 'view_comment'].includes(a.name)) continue;
      const entry = (extensions[ext] ||= { app: appAttrs.name || '' });
      const name = a.name === 'view_comment' ? 'view' : a.name;
      if (!entry[name]) entry[name] = a.urlsrc;
    }
  }
  const proof = /<proof-key\b([^>]*)\/?>/.exec(text);
  return { extensions, capabilitiesUrl, proofKey: proof ? attrs(proof[1]) : null };
}

/** The editor page for `ext`: the edit action (or view), with its origin moved to the public server address. */
export function actionUrl(discovery, ext, { serverUrl, mode = 'edit' } = {}) {
  const entry = discovery?.extensions?.[String(ext || '').toLowerCase()];
  if (!entry) return null;
  const raw = (mode === 'view' ? entry.view || entry.edit : entry.edit || entry.view) || null;
  if (!raw) return null;
  // MS-style placeholders (<ui=UI_LLCC&>) are not used by Collabora; drop them if present.
  let url;
  try {
    url = new URL(raw.replace(/<[^>]*>/g, ''));
  } catch {
    return null;
  }
  if (serverUrl) {
    try {
      return `${new URL(serverUrl).origin}${url.href.slice(url.origin.length)}`;
    } catch {
      /* keep */
    }
  }
  return url.toString();
}

export async function fetchDiscovery(discoveryUrl, { timeoutMs = 10000 } = {}) {
  const res = await fetch(`${discoveryUrl}/hosting/discovery`, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'text/xml, application/xml' } });
  if (!res.ok) throw new Error(`Discovery returned HTTP ${res.status}`);
  return parseDiscovery(await res.text());
}

/** Cached discovery for the configured server; `force` reads it again. Throws when none is available. */
export async function getDiscovery({ force = false, editing } = {}) {
  const cfg = editing || (await editingConfig());
  if (!cfg.discoveryUrl) throw Object.assign(new Error('The editor server is not configured'), { statusCode: 409, code: 'EDITOR_DISABLED' });
  const key = cfg.discoveryUrl;
  const entry = cache.get(key);
  const now = Date.now();
  const fresh = entry?.value && now - entry.at < DAY;
  const retryLater = entry?.error && now - entry.failedAt < RETRY;
  if (!force && (fresh || (retryLater && entry.value))) return entry.value;
  if (!force && retryLater && !entry.value) throw entry.error;
  if (!force && entry?.pending) return entry.pending;
  const pending = fetchDiscovery(key)
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((err) => {
      const error = Object.assign(new Error(`The editor server is not reachable: ${err.message}`), { statusCode: 503, code: 'EDITOR_UNREACHABLE' });
      cache.set(key, { ...(cache.get(key) || {}), pending: null, error, failedAt: Date.now() });
      const last = cache.get(key);
      if (last?.value) return last.value;
      throw error;
    });
  cache.set(key, { ...(entry || {}), pending });
  return pending;
}

/** What is cached, without any network request (lists, menus). */
export function cachedDiscovery(discoveryUrl) {
  return cache.get(discoveryUrl)?.value || null;
}

/** Drops the cache (settings changed, or the editor reported an error). */
export function forgetDiscovery() {
  cache.clear();
}
