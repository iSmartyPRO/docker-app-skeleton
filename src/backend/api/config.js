import { getSettings, setSetting } from '../services/settings.js';

/*
 * Settings of the public API, stored as one JSON value (`api_config`).
 */

export const API_DEFAULTS = {
  // Master switch: off answers 503 API_DISABLED to every token.
  enabled: true,
  // People holding `api.tokens` may create tokens for themselves.
  personalTokens: true,
  // Upper bound for a token's lifetime in days (0 = no limit).
  maxLifetimeDays: 0,
  // Requests per minute for a token that sets no own limit.
  defaultRateLimit: 120,
  // How long the request log is kept.
  logRetentionDays: 30,
  // The developer portal (/developers) is readable without signing in.
  docsPublic: false,
  // Outgoing webhooks.
  webhooks: true,
  // Webhooks may call addresses in private networks (10.x, 192.168.x, localhost…).
  webhooksPrivate: false,
};

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export async function apiConfig() {
  const raw = (await getSettings()).api_config;
  let stored = {};
  try {
    stored = raw ? JSON.parse(raw) : {};
  } catch {
    stored = {};
  }
  return { ...API_DEFAULTS, ...stored };
}

export async function updateApiConfig(patch = {}) {
  const current = await apiConfig();
  const next = { ...current };
  for (const key of ['enabled', 'personalTokens', 'docsPublic', 'webhooks', 'webhooksPrivate']) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key];
  }
  if (patch.maxLifetimeDays !== undefined) next.maxLifetimeDays = clampInt(patch.maxLifetimeDays, 0, 3650, 0);
  if (patch.defaultRateLimit !== undefined) next.defaultRateLimit = clampInt(patch.defaultRateLimit, 1, 100000, 120);
  if (patch.logRetentionDays !== undefined) next.logRetentionDays = clampInt(patch.logRetentionDays, 1, 365, 30);
  await setSetting('api_config', JSON.stringify(next));
  return next;
}
