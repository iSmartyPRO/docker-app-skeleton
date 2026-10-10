import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { query } from '../config/database.js';
import { logoDir } from '../config/paths.js';
import { APP_VERSION } from '../config/version.js';

export const DEFAULTS = {
  app_name: 'docker-app-skeleton',
  app_version: APP_VERSION,
  app_description: 'Premium application skeleton on React, Express and PostgreSQL',
  rate_limit_window_ms: '900000',
  rate_limit_max: '100',
  access_mode: '',
  appearance: JSON.stringify({
    template: 'navy',
    customColors: {},
    typography: {
      preset: 'manrope',
      fontFamily: 'Manrope',
      headingFamily: 'Manrope',
      baseFontSize: 16,
      headingWeight: 700,
    },
    defaultTheme: 'light',
    logoUrl: null,
    logoDarkUrl: null,
    logoHeight: 32,
    icons: {
      style: 'colored',
      menu: {},
    },
  }),
  integrations: JSON.stringify({
    email: {
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      user: '',
      password: '',
      from: '',
    },
    telegram: {
      enabled: false,
      botToken: '',
      botUsername: '',
      defaultChatId: '',
    },
    whatsapp: {
      enabled: false,
      serverUrl: '',
      apiKey: '',
    },
    wazzup: {
      enabled: false,
      apiKey: '',
      // Default channel per transport, e.g. { whatsapp: '<channelId>', instagram: '<channelId>' }
      channels: {},
    },
    activeDirectory: {
      enabled: false,
      host: '',
      port: 389,
      useTls: false,
      bindDn: '',
      bindPassword: '',
      baseDn: '',
    },
  }),
  // Sign-in methods. Each one beyond the password needs its integration configured.
  auth: JSON.stringify({
    password: { enabled: true },
    ldap: { enabled: false, autoProvision: true, groupMap: [] },
    telegram: { enabled: false, autoProvision: false },
    emailCode: { enabled: false },
    whatsappCode: { enabled: false },
    telegramCode: { enabled: false },
    // Lets code channels send a one-click sign-in link instead of a code.
    magicLink: { enabled: false },
  }),
  security: JSON.stringify({
    whitelistEnabled: false,
    blacklistEnabled: true,
    maxLoginAttempts: 8,
    lockoutMinutes: 15,
    sessionDays: 7,
  }),
};

const SECRET_PATHS = [
  ['email', 'password'],
  ['telegram', 'botToken'],
  ['whatsapp', 'apiKey'],
  ['wazzup', 'apiKey'],
  ['activeDirectory', 'bindPassword'],
];

export async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const [key, value] of Object.entries(DEFAULTS)) {
    await query(
      `
      INSERT INTO app_settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO NOTHING
      `,
      [key, value]
    );
  }

  const appearanceRow = await query(
    `SELECT value FROM app_settings WHERE key = 'appearance'`
  );
  if (appearanceRow.rows[0]) {
    try {
      const appearance = JSON.parse(appearanceRow.rows[0].value);
      const custom = appearance.customColors || {};
      const hasCustom = Object.keys(custom).length > 0;
      if (appearance.template === 'aurora' && !hasCustom) {
        appearance.template = 'navy';
        await query(
          `
          UPDATE app_settings
          SET value = $1, updated_at = NOW()
          WHERE key = 'appearance'
          `,
          [JSON.stringify(appearance)]
        );
      }
    } catch {
      /* keep stored value */
    }
  }
  invalidateSettings();
}

// ipGuard and the rate limiter read settings on every request, so raw rows are
// cached briefly. Every write goes through setSetting(), which drops the cache.
const CACHE_TTL_MS = 5000;
let cached = null;
let cachedAt = 0;

export function invalidateSettings() {
  cached = null;
  cachedAt = 0;
}

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return { ...cached };
  }
  const result = await query('SELECT key, value FROM app_settings ORDER BY key');
  const settings = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  cached = settings;
  cachedAt = Date.now();
  return { ...settings };
}

export async function getSetting(key, fallback = null) {
  const result = await query('SELECT value FROM app_settings WHERE key = $1', [
    key,
  ]);
  return result.rows[0]?.value ?? fallback;
}

export async function setSetting(key, value) {
  await query(
    `
    INSERT INTO app_settings (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, String(value)]
  );
  invalidateSettings();
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function maskIntegrations(integrations) {
  const clone = structuredClone(integrations);
  for (const [group, field] of SECRET_PATHS) {
    if (clone[group]) {
      const set = Boolean(clone[group][field]);
      clone[group][`${field}Set`] = set;
      clone[group][field] = '';
    }
  }
  return clone;
}

export function safeLogoUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/logos/')) return null;
  if (url.includes('..') || url.includes('\\')) return null;
  return url;
}

export function parseSettings(raw) {
  const appearance = parseJson(raw.appearance, JSON.parse(DEFAULTS.appearance));
  appearance.logoUrl = safeLogoUrl(appearance.logoUrl);
  appearance.logoDarkUrl = safeLogoUrl(appearance.logoDarkUrl);
  appearance.logoHeight = clampInt(appearance.logoHeight, 20, 64, 32);
  // Merge stored groups over defaults so integrations added in later versions
  // appear in existing installations without a migration.
  const integrationDefaults = JSON.parse(DEFAULTS.integrations);
  const storedIntegrations = parseJson(raw.integrations, {});
  const integrations = Object.fromEntries(
    Object.entries(integrationDefaults).map(([group, defaults]) => [
      group,
      { ...defaults, ...(storedIntegrations[group] || {}) },
    ])
  );
  const security = parseJson(raw.security, JSON.parse(DEFAULTS.security));
  const authDefaults = JSON.parse(DEFAULTS.auth);
  const storedAuth = parseJson(raw.auth, {});
  const auth = Object.fromEntries(
    Object.entries(authDefaults).map(([method, defaults]) => [
      method,
      { ...defaults, ...(storedAuth[method] || {}) },
    ])
  );

  return {
    appName: raw.app_name || DEFAULTS.app_name,
    appVersion: APP_VERSION,
    appDescription: raw.app_description || DEFAULTS.app_description,
    accessMode: raw.access_mode === 'open' || raw.access_mode === 'closed'
      ? raw.access_mode
      : '',
    rateLimit: {
      windowMs: Number(raw.rate_limit_window_ms) || Number(DEFAULTS.rate_limit_window_ms),
      max: Number(raw.rate_limit_max) || Number(DEFAULTS.rate_limit_max),
    },
    appearance,
    integrations,
    security,
    auth,
  };
}

/**
 * Whether each sign-in method can actually work right now: enabled in
 * Settings → Sign-in methods AND its integration is enabled and configured.
 */
export function authAvailability(parsed) {
  const { integrations: i, auth } = parsed;
  const ready = {
    ldap: Boolean(i.activeDirectory?.enabled && i.activeDirectory?.host && i.activeDirectory?.baseDn),
    telegram: Boolean(i.telegram?.enabled && i.telegram?.botToken && i.telegram?.botUsername),
    emailCode: Boolean(i.email?.enabled && i.email?.host),
    whatsappCode: Boolean(i.wazzup?.enabled && i.wazzup?.apiKey && i.wazzup?.channels?.whatsapp),
    telegramCode: Boolean(i.telegram?.enabled && i.telegram?.botToken),
  };
  ready.magicLink = ready.emailCode || ready.whatsappCode || ready.telegramCode;
  return {
    ready,
    password: auth.password?.enabled !== false,
    ldap: Boolean(auth.ldap?.enabled && ready.ldap),
    telegram: Boolean(auth.telegram?.enabled && ready.telegram),
    emailCode: Boolean(auth.emailCode?.enabled && ready.emailCode),
    whatsappCode: Boolean(auth.whatsappCode?.enabled && ready.whatsappCode),
    telegramCode: Boolean(auth.telegramCode?.enabled && ready.telegramCode),
    magicLink: Boolean(auth.magicLink?.enabled),
  };
}

const AUTH_INTEGRATION = {
  ldap: 'Active Directory',
  telegram: 'Telegram bot (token and bot username)',
  emailCode: 'Email (SMTP)',
  whatsappCode: 'Wazzup (with a WhatsApp channel)',
  telegramCode: 'Telegram bot',
};

export function sanitizeAuth(current, incoming, readiness) {
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  const next = structuredClone(current);
  const flag = (method, key) => {
    const value = src[method]?.[key];
    if (typeof value === 'boolean' && next[method]) next[method][key] = value;
  };
  for (const method of Object.keys(next)) flag(method, 'enabled');
  flag('ldap', 'autoProvision');
  flag('telegram', 'autoProvision');
  if (Array.isArray(src.ldap?.groupMap)) {
    next.ldap.groupMap = src.ldap.groupMap
      .filter((rule) => rule && String(rule.adGroup || '').trim() && Number.isInteger(Number(rule.groupId)))
      .slice(0, 50)
      .map((rule) => ({ adGroup: String(rule.adGroup).trim().slice(0, 300), groupId: Number(rule.groupId) }));
  }
  for (const method of Object.keys(AUTH_INTEGRATION)) {
    if (!next[method]) continue;
    const turnedOn = next[method].enabled && !current[method]?.enabled;
    if (turnedOn && !readiness[method]) {
      const error = new Error(`Configure and enable the ${AUTH_INTEGRATION[method]} integration first`);
      error.statusCode = 400;
      throw error;
    }
  }
  const signInMethods = Object.entries(next).filter(([method]) => method !== 'magicLink');
  if (!signInMethods.some(([, method]) => method.enabled)) {
    const error = new Error('At least one sign-in method must stay enabled');
    error.statusCode = 400;
    throw error;
  }
  return next;
}

export function toPublicSettings(parsed) {
  return {
    appName: parsed.appName,
    appVersion: parsed.appVersion,
    appDescription: parsed.appDescription,
    accessMode: parsed.accessMode || 'closed',
    appearance: parsed.appearance,
    auth: (() => {
      const available = authAvailability(parsed);
      return {
        password: available.password || available.ldap,
        ldap: available.ldap,
        telegram: available.telegram
          ? { enabled: true, botUsername: parsed.integrations.telegram.botUsername }
          : { enabled: false },
        emailCode: available.emailCode,
        whatsappCode: available.whatsappCode,
        telegramCode: available.telegramCode,
        magicLink:
          available.magicLink && (available.emailCode || available.whatsappCode || available.telegramCode),
      };
    })(),
    integrations: {
      email: { enabled: Boolean(parsed.integrations.email?.enabled) },
      telegram: { enabled: Boolean(parsed.integrations.telegram?.enabled) },
      whatsapp: { enabled: Boolean(parsed.integrations.whatsapp?.enabled) },
      wazzup: { enabled: Boolean(parsed.integrations.wazzup?.enabled) },
      activeDirectory: {
        enabled: Boolean(parsed.integrations.activeDirectory?.enabled),
      },
    },
  };
}

export function toAdminSettings(parsed) {
  return {
    ...toPublicSettings(parsed),
    accessMode: parsed.accessMode || '',
    rateLimit: parsed.rateLimit,
    security: parsed.security,
    authMethods: parsed.auth,
    authReady: authAvailability(parsed).ready,
    integrations: maskIntegrations(parsed.integrations),
  };
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeSecurity(current, incoming) {
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  return {
    whitelistEnabled: Boolean(src.whitelistEnabled ?? current.whitelistEnabled),
    blacklistEnabled: (src.blacklistEnabled ?? current.blacklistEnabled) !== false,
    maxLoginAttempts: clampInt(src.maxLoginAttempts ?? current.maxLoginAttempts, 3, 30, 8),
    lockoutMinutes: clampInt(src.lockoutMinutes ?? current.lockoutMinutes, 5, 180, 15),
    sessionDays: clampInt(src.sessionDays ?? current.sessionDays, 1, 90, 7),
  };
}

export function sanitizeRateLimit(current, incoming) {
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  return {
    windowMs: clampInt(src.windowMs ?? current.windowMs, 60_000, 24 * 60 * 60_000, 900_000),
    max: clampInt(src.max ?? current.max, 20, 100_000, 100),
  };
}

const INTEGRATION_GROUPS = ['email', 'telegram', 'whatsapp', 'wazzup', 'activeDirectory'];

export function mergeKeepSecrets(current, incoming) {
  const next = structuredClone(current);
  for (const group of Object.keys(incoming || {})) {
    if (!INTEGRATION_GROUPS.includes(group)) continue;
    if (!incoming[group] || typeof incoming[group] !== 'object') continue;
    next[group] = { ...next[group], ...incoming[group] };
  }
  for (const [group, field] of SECRET_PATHS) {
    if (incoming?.[group] && !incoming[group][field]) {
      next[group][field] = current[group]?.[field] || '';
    }
  }
  return next;
}

/** Keeps only `{ transport: channelId }` string pairs; drops the pre-release `channelId` field. */
export function sanitizeWazzup(group = {}) {
  const next = { ...group };
  delete next.channelId;
  const source = next.channels && typeof next.channels === 'object' ? next.channels : {};
  next.channels = Object.fromEntries(
    Object.entries(source)
      .filter(([transport, id]) => /^[a-z0-9_-]{1,32}$/i.test(transport) && typeof id === 'string' && id.trim())
      .slice(0, 20)
      .map(([transport, id]) => [transport, id.trim().slice(0, 100)])
  );
  return next;
}

export async function updateAdminSettings(patch) {
  const parsed = parseSettings(await getSettings());

  if (patch.appName != null) await setSetting('app_name', String(patch.appName).slice(0, 80));
  if (patch.appDescription != null) {
    await setSetting('app_description', String(patch.appDescription).slice(0, 400));
  }
  if (patch.accessMode === 'open' || patch.accessMode === 'closed') {
    await setSetting('access_mode', patch.accessMode);
  }
  if (patch.appearance) {
    const nextAppearance = {
      ...parsed.appearance,
      ...patch.appearance,
      typography: {
        ...parsed.appearance.typography,
        ...patch.appearance.typography,
      },
      customColors:
        patch.appearance.customColors !== undefined
          ? patch.appearance.customColors
          : parsed.appearance.customColors || {},
      logoUrl:
        patch.appearance.logoUrl === undefined
          ? parsed.appearance.logoUrl
          : safeLogoUrl(patch.appearance.logoUrl),
      logoDarkUrl:
        patch.appearance.logoDarkUrl === undefined
          ? parsed.appearance.logoDarkUrl
          : safeLogoUrl(patch.appearance.logoDarkUrl),
      logoHeight: clampInt(patch.appearance.logoHeight ?? parsed.appearance.logoHeight, 20, 64, 32),
      icons: patch.appearance.icons
        ? {
            style: patch.appearance.icons.style === 'mono' ? 'mono' : 'colored',
            menu: {
              ...(parsed.appearance.icons?.menu || {}),
              ...(patch.appearance.icons.menu || {}),
            },
          }
        : parsed.appearance.icons || { style: 'colored', menu: {} },
    };
    await setSetting('appearance', JSON.stringify(nextAppearance));
  }
  if (patch.integrations) {
    const merged = mergeKeepSecrets(parsed.integrations, patch.integrations);
    merged.wazzup = sanitizeWazzup(merged.wazzup);
    await setSetting('integrations', JSON.stringify(merged));
  }
  if (patch.auth) {
    await setSetting(
      'auth',
      JSON.stringify(sanitizeAuth(parsed.auth, patch.auth, authAvailability(parsed).ready))
    );
  }
  if (patch.security) {
    await setSetting(
      'security',
      JSON.stringify(sanitizeSecurity(parsed.security || {}, patch.security))
    );
  }
  if (patch.rateLimit) {
    const rateLimit = sanitizeRateLimit(parsed.rateLimit, patch.rateLimit);
    await setSetting('rate_limit_window_ms', rateLimit.windowMs);
    await setSetting('rate_limit_max', rateLimit.max);
  }

  return toAdminSettings(parseSettings(await getSettings({ fresh: true })));
}

/** `primary` is used everywhere; `dark` replaces it in the dark theme when set. */
function logoKey(variant) {
  return variant === 'dark' ? 'logoDarkUrl' : 'logoUrl';
}

export async function setProjectLogo(filename, variant = 'primary') {
  const key = logoKey(variant);
  const parsed = parseSettings(await getSettings({ fresh: true }));
  const previous = parsed.appearance[key];
  if (previous) {
    await unlink(join(logoDir, basename(previous))).catch(() => {});
  }
  return updateAdminSettings({
    appearance: { [key]: `/uploads/logos/${basename(filename)}` },
  });
}

export async function clearProjectLogo(variant = 'primary') {
  const key = logoKey(variant);
  const parsed = parseSettings(await getSettings({ fresh: true }));
  if (parsed.appearance[key]) {
    await unlink(join(logoDir, basename(parsed.appearance[key]))).catch(() => {});
  }
  return updateAdminSettings({ appearance: { [key]: null } });
}
