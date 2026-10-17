import config from '../../config/app.js';
import { getSettings, parseSettings } from '../settings.js';
import { actionUrl, cachedDiscovery, fetchDiscovery, forgetDiscovery, getDiscovery } from './discovery.js';
import { editingConfig, editingFrom, portalBase, sanitizeEditing } from './config.js';
import { locksOf } from './locks.js';
import { signWopiToken } from './tokens.js';
import { INSTANCE } from './wopi.js';
import { localeOrDefault, localeTag } from '../i18n/index.js';

/*
 * Opening the editor for a signed-in person: the module checks access and
 * names the file (WOPI id, extension, permission), this builds what the
 * browser needs to post the Collabora frame:
 *   { url, accessToken, accessTokenTtl, mode, editorOrigin, lockedBy }
 */

function httpError(status, code, message) {
  const error = new Error(message);
  error.statusCode = status;
  error.code = code;
  error.expose = true;
  return error;
}

const hostOf = (value) => {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * The browser origin Collabora posts messages to (PostMessageOrigin): the
 * page's own Origin when it is one of the portal's addresses, else the
 * configured public address.
 */
export function browserOrigin(req) {
  const origin = String(req.get?.('origin') || '');
  const allowed = new Set([hostOf(config.frontend.url), hostOf(process.env.PUBLIC_URL || ''), String(req.get?.('host') || '').toLowerCase()].filter(Boolean));
  if (origin && allowed.has(hostOf(origin))) return new URL(origin).origin;
  try {
    return new URL(portalBase()).origin;
  } catch {
    return '';
  }
}

/** What lists and menus need: on/off and the extensions per mode (no network request). */
export async function editorClientConfig() {
  const editing = await editingConfig();
  if (!editing.enabled) return { enabled: false, edit: [], view: [] };
  const discovery = cachedDiscovery(editing.discoveryUrl);
  // Read discovery in the background so the next listing knows exactly what the server opens.
  if (!discovery) getDiscovery({ editing }).catch(() => {});
  const known = (ext, mode) => !discovery || Boolean(discovery.extensions?.[ext]?.[mode] || (mode === 'view' && discovery.extensions?.[ext]?.edit));
  return {
    enabled: true,
    openByDefault: editing.openByDefault,
    edit: editing.allowedTypes.filter((ext) => known(ext, 'edit')),
    view: editing.allowedTypes.filter((ext) => known(ext, 'view')),
  };
}

/**
 * The editor frame for one file.
 *   fileId     WOPI file id ("files-12", "drive-…")
 *   ext        file extension
 *   canWrite   the person may change the file now
 *   want       'edit' | 'view' (asked by the page)
 *   lockKey    the file's lock (to show who is editing)
 *   entryId    Drive entry the token is bound to
 */
export async function editorSession(req, { fileId, ext, canWrite, want = 'edit', lockKey, entryId = null, lang, dark }) {
  const editing = await editingConfig();
  if (!editing.enabled) throw httpError(409, 'EDITOR_DISABLED', 'Online editing is turned off');
  const type = String(ext || '').toLowerCase();
  if (!editing.allowedTypes.includes(type)) throw httpError(400, 'EDITOR_TYPE', 'This file type is not opened in the editor');
  const discovery = await getDiscovery({ editing });
  const mode = want === 'view' || !canWrite ? 'view' : 'edit';
  const src = actionUrl(discovery, type, { serverUrl: editing.serverUrl, mode });
  if (!src) throw httpError(400, 'EDITOR_TYPE', 'The editor server does not open this file type');
  const url = new URL(src);
  url.searchParams.set('WOPISrc', `${editing.wopiBaseUrl}/api/wopi/files/${fileId}`);
  // The editor's interface language: the portal code (Collabora wants zh-CN for Chinese).
  const code = localeOrDefault(lang);
  url.searchParams.set('lang', code === 'zh' ? localeTag(code) : code);
  // Compact (classic toolbar) UI; the theme follows the portal.
  url.searchParams.set('ui_defaults', `UIMode=compact;TextSidebar=false;UITheme=${dark ? 'dark' : 'light'}`);
  if (mode === 'view') url.searchParams.set('permission', 'readonly');
  const { token, expiresAt } = signWopiToken({
    fileId,
    userId: req.user.id,
    sessionId: req.sessionId,
    tokenVersion: req.userRow?.token_version,
    permission: mode,
    origin: browserOrigin(req),
    entryId,
    hours: editing.tokenHours,
  });
  const lock = lockKey ? (await locksOf([lockKey])).get(lockKey) : null;
  return {
    url: url.toString(),
    accessToken: token,
    accessTokenTtl: expiresAt,
    mode,
    canWrite: Boolean(canWrite),
    fileId,
    editorOrigin: url.origin,
    lockedBy: lock && Number(lock.userId) !== Number(req.user.id) ? { name: lock.userName, since: lock.since } : null,
  };
}

// ── Settings check ──────────────────────────────────────────────────────────

/**
 * "Check connection" on the settings page: reads discovery and capabilities
 * with the values on screen and reports what the server opens. Whether this
 * portal is an allowed WOPI host is only known when a document opens
 * (Collabora answers the frame with an error page otherwise).
 */
export async function testEditor(override = {}) {
  const parsed = parseSettings(await getSettings());
  const stored = parsed.integrations.documents || {};
  const draft = {
    ...parsed,
    integrations: {
      ...parsed.integrations,
      documents: { ...stored, ...(override.serverUrl !== undefined ? { serverUrl: override.serverUrl } : {}), editing: sanitizeEditing(stored.editing, { ...(override.editing || {}), enabled: true }) },
    },
  };
  const editing = editingFrom(draft);
  if (!editing.serverUrl) throw httpError(400, 'EDITOR_URL_REQUIRED', 'Enter the Collabora server address');
  const started = Date.now();
  let discovery;
  try {
    discovery = await fetchDiscovery(editing.discoveryUrl);
  } catch (err) {
    throw httpError(502, 'EDITOR_UNREACHABLE', `Could not read ${editing.discoveryUrl}/hosting/discovery: ${err.message}`);
  }
  forgetDiscovery();
  const ms = Date.now() - started;
  let product = null;
  const capsUrl = discovery.capabilitiesUrl ? actionUrlOrigin(discovery.capabilitiesUrl, editing.discoveryUrl) : `${editing.discoveryUrl}/hosting/capabilities`;
  try {
    const res = await fetch(capsUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const caps = await res.json();
      product = { name: caps.productName || 'Collabora Online', version: caps.productVersion || null, hash: caps.productVersionHash || null };
    }
  } catch {
    /* optional */
  }
  const all = Object.keys(discovery.extensions).sort();
  const editable = all.filter((ext) => discovery.extensions[ext].edit);
  const viewOnly = all.filter((ext) => !discovery.extensions[ext].edit && discovery.extensions[ext].view);
  const sample = actionUrl(discovery, 'docx', { serverUrl: editing.serverUrl }) || actionUrl(discovery, editable[0], { serverUrl: editing.serverUrl });
  // Does wopiBaseUrl lead back to this very portal? (Seen from the portal's network, not Collabora's.)
  let callback = { url: `${editing.wopiBaseUrl}/api/wopi/ping`, ok: false, error: null };
  try {
    const res = await fetch(callback.url, { signal: AbortSignal.timeout(6000) });
    const body = res.ok ? await res.json().catch(() => null) : null;
    callback = { ...callback, ok: body?.instance === INSTANCE, other: Boolean(body?.wopi && body.instance !== INSTANCE), status: res.status };
  } catch (err) {
    callback.error = err.message;
  }
  const portal = new URL(editing.wopiBaseUrl);
  return {
    ok: true,
    message: `Collabora answered in ${ms} ms: ${editable.length} editable formats`,
    product,
    editorUrl: sample ? new URL(sample).origin : editing.serverUrl,
    editable,
    viewOnly,
    allowed: editing.allowedTypes.filter((ext) => discovery.extensions[ext]),
    missing: editing.allowedTypes.filter((ext) => !discovery.extensions[ext]),
    callback,
    collabora: {
      aliasgroup: `${portal.protocol}//${portal.hostname}:${portal.port || (portal.protocol === 'https:' ? 443 : 80)}`,
      wopiHost: portal.hostname,
      frameAncestor: browserOriginFallback(),
    },
  };
}

function actionUrlOrigin(url, base) {
  try {
    const target = new URL(url);
    return `${new URL(base).origin}${target.href.slice(target.origin.length)}`;
  } catch {
    return `${base}/hosting/capabilities`;
  }
}

function browserOriginFallback() {
  try {
    return new URL(portalBase()).origin;
  } catch {
    return '';
  }
}

/**
 * What the Collabora server needs to trust this portal (settings page):
 * the alias group / WOPI host (the callback address) and the frame ancestor
 * (the address people open the portal at).
 */
export async function editorInfo() {
  const editing = await editingConfig();
  let callback = null;
  try {
    callback = new URL(editing.wopiBaseUrl);
  } catch {
    /* not set */
  }
  const port = callback ? callback.port || (callback.protocol === 'https:' ? '443' : '80') : '';
  return {
    portalUrl: portalBase(),
    wopiBaseUrl: editing.wopiBaseUrl,
    serverUrl: editing.serverUrl,
    discoveryUrl: editing.discoveryUrl,
    wopiSrcExample: `${editing.wopiBaseUrl}/api/wopi/files/<id>`,
    collabora: callback
      ? {
          aliasgroup: `${callback.protocol}//${callback.hostname}:${port}`,
          wopiHost: callback.hostname,
          frameAncestor: browserOriginFallback(),
        }
      : null,
  };
}
