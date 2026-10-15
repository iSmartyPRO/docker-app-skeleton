/*
 * Online editing settings without any dependency (settings.js imports this):
 * defaults, the list of formats and save-time cleaning. See config.js.
 */

/** Formats Collabora edits without loss; the default selection. */
export const DEFAULT_TYPES = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'];
/** Everything an administrator may allow (legacy binary formats are saved back as is by Collabora). */
export const SUPPORTED_TYPES = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'doc', 'xls', 'ppt', 'rtf', 'csv', 'txt', 'docm', 'xlsm', 'pptm', 'dotx', 'xltx', 'potx', 'odg'];

export const EDITING_DEFAULTS = {
  enabled: false,
  serverUrl: '',
  discoveryUrl: '',
  wopiBaseUrl: '',
  allowedTypes: DEFAULT_TYPES,
  openByDefault: true,
  tokenHours: 10,
};

export function cleanBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function httpUrl(value) {
  const text = cleanBase(value);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'EDITING_INVALID';
  error.expose = true;
  return error;
}

/** Save-time cleaning of the editing block; refuses malformed addresses. */
export function sanitizeEditing(current = {}, incoming) {
  const base = { ...EDITING_DEFAULTS, ...(current || {}) };
  if (!incoming || typeof incoming !== 'object') return base;
  const next = { ...base };
  if (typeof incoming.enabled === 'boolean') next.enabled = incoming.enabled;
  if (typeof incoming.openByDefault === 'boolean') next.openByDefault = incoming.openByDefault;
  for (const key of ['serverUrl', 'discoveryUrl', 'wopiBaseUrl']) {
    if (incoming[key] === undefined) continue;
    const url = httpUrl(incoming[key]);
    if (url === null) throw invalid(`${key} must be an http:// or https:// address`);
    next[key] = url;
  }
  if (Array.isArray(incoming.allowedTypes)) {
    next.allowedTypes = [...new Set(incoming.allowedTypes.map((ext) => String(ext).toLowerCase()).filter((ext) => SUPPORTED_TYPES.includes(ext)))];
  }
  if (incoming.tokenHours !== undefined) {
    const hours = Math.round(Number(incoming.tokenHours));
    next.tokenHours = Number.isFinite(hours) ? Math.min(24, Math.max(1, hours)) : base.tokenHours;
  }
  return next;
}

