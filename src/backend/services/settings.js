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
      defaultChatId: '',
    },
    whatsapp: {
      enabled: false,
      serverUrl: '',
      apiKey: '',
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
}

export async function getSettings() {
  const result = await query('SELECT key, value FROM app_settings ORDER BY key');
  const settings = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  return settings;
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
  const integrations = parseJson(
    raw.integrations,
    JSON.parse(DEFAULTS.integrations)
  );
  const security = parseJson(raw.security, JSON.parse(DEFAULTS.security));

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
  };
}

export function toPublicSettings(parsed) {
  return {
    appName: parsed.appName,
    appVersion: parsed.appVersion,
    appDescription: parsed.appDescription,
    accessMode: parsed.accessMode || 'closed',
    appearance: parsed.appearance,
    integrations: {
      email: { enabled: Boolean(parsed.integrations.email?.enabled) },
      telegram: { enabled: Boolean(parsed.integrations.telegram?.enabled) },
      whatsapp: { enabled: Boolean(parsed.integrations.whatsapp?.enabled) },
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
    integrations: maskIntegrations(parsed.integrations),
  };
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizeSecurity(current, incoming) {
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  return {
    whitelistEnabled: Boolean(src.whitelistEnabled ?? current.whitelistEnabled),
    blacklistEnabled: src.blacklistEnabled !== false,
    maxLoginAttempts: clampInt(src.maxLoginAttempts ?? current.maxLoginAttempts, 3, 30, 8),
    lockoutMinutes: clampInt(src.lockoutMinutes ?? current.lockoutMinutes, 5, 180, 15),
    sessionDays: clampInt(src.sessionDays ?? current.sessionDays, 1, 90, 7),
  };
}

function mergeKeepSecrets(current, incoming) {
  const next = structuredClone(current);
  for (const group of Object.keys(incoming || {})) {
    next[group] = { ...next[group], ...incoming[group] };
  }
  for (const [group, field] of SECRET_PATHS) {
    if (incoming?.[group] && !incoming[group][field]) {
      next[group][field] = current[group]?.[field] || '';
    }
  }
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
    await setSetting(
      'integrations',
      JSON.stringify(mergeKeepSecrets(parsed.integrations, patch.integrations))
    );
  }
  if (patch.security) {
    await setSetting(
      'security',
      JSON.stringify(sanitizeSecurity(parsed.security || {}, patch.security))
    );
  }
  if (patch.rateLimit) {
    if (patch.rateLimit.windowMs) {
      await setSetting('rate_limit_window_ms', Number(patch.rateLimit.windowMs));
    }
    if (patch.rateLimit.max) {
      await setSetting('rate_limit_max', Number(patch.rateLimit.max));
    }
  }

  return toAdminSettings(parseSettings(await getSettings()));
}

export async function setProjectLogo(filename) {
  const parsed = parseSettings(await getSettings());
  const previous = parsed.appearance.logoUrl;
  if (previous) {
    await unlink(join(logoDir, basename(previous))).catch(() => {});
  }
  return updateAdminSettings({
    appearance: { logoUrl: `/uploads/logos/${basename(filename)}` },
  });
}

export async function clearProjectLogo() {
  const parsed = parseSettings(await getSettings());
  if (parsed.appearance.logoUrl) {
    await unlink(join(logoDir, basename(parsed.appearance.logoUrl))).catch(() => {});
  }
  return updateAdminSettings({ appearance: { logoUrl: null } });
}
