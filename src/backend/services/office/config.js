import config from '../../config/app.js';
import { getSettings, parseSettings } from '../settings.js';

/*
 * Online editing of office documents (Collabora Online over WOPI) — settings.
 *
 * Stored inside the document integration: integrations.documents.editing.
 *   enabled        on/off
 *   serverUrl      the Collabora address people's browsers open (public), e.g.
 *                  https://collabora.example.com; empty = documents.serverUrl
 *   discoveryUrl   optional address the portal itself uses to read
 *                  /hosting/discovery (e.g. http://collabora:9980 inside Docker);
 *                  empty = serverUrl
 *   wopiBaseUrl    the portal address Collabora calls back (WOPI host), e.g.
 *                  https://portal.example.com; empty = PUBLIC_URL / FRONTEND_URL
 *   allowedTypes   extensions that may be opened in the editor
 *   openByDefault  opening an office file (click) starts the editor
 *   tokenHours     lifetime of an editor session token
 */

export { DEFAULT_TYPES, EDITING_DEFAULTS, SUPPORTED_TYPES, cleanBase, sanitizeEditing } from './editing.js';
import { DEFAULT_TYPES, EDITING_DEFAULTS, SUPPORTED_TYPES, cleanBase } from './editing.js';

/** The portal's own public address (PUBLIC_URL, else FRONTEND_URL). */
export function portalBase() {
  return cleanBase(process.env.PUBLIC_URL || config.frontend.url || '');
}

/** Effective editing configuration from parsed settings. */
export function editingFrom(parsed) {
  const documents = parsed?.integrations?.documents || {};
  const stored = { ...EDITING_DEFAULTS, ...(documents.editing || {}) };
  const serverUrl = cleanBase(stored.serverUrl || documents.serverUrl);
  const allowed = (Array.isArray(stored.allowedTypes) ? stored.allowedTypes : DEFAULT_TYPES).filter((ext) => SUPPORTED_TYPES.includes(ext));
  return {
    enabled: Boolean(stored.enabled && serverUrl),
    configured: Boolean(serverUrl),
    serverUrl,
    discoveryUrl: cleanBase(stored.discoveryUrl) || serverUrl,
    wopiBaseUrl: cleanBase(stored.wopiBaseUrl) || portalBase(),
    allowedTypes: allowed,
    openByDefault: stored.openByDefault !== false,
    tokenHours: Math.min(24, Math.max(1, Number(stored.tokenHours) || 10)),
  };
}

export async function editingConfig() {
  return editingFrom(parseSettings(await getSettings()));
}

/** Origin of the Collabora server (for CSP frame-src / form-action), or null. */
export function editorOrigin(editing) {
  if (!editing?.enabled) return null;
  try {
    return new URL(editing.serverUrl).origin;
  } catch {
    return null;
  }
}
