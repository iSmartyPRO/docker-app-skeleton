import { X509Certificate } from 'crypto';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { getPool, query, withTransaction } from '../config/database.js';
import { logoDir } from '../config/paths.js';
import { APP_VERSION } from '../config/version.js';
import { REGIONAL_DEFAULTS, resolveRegional, sanitizeRegional } from './datetime.js';
import { CRM_DEFAULTS, MODULE_CATALOG, MODULE_IDS, crmStockLists, resolveModules, sanitizeModules } from '../modules/catalog.js';
import { EDITING_DEFAULTS, sanitizeEditing } from './office/editing.js';
import { sanitizeDefaultTheme, sanitizeThemePolicy } from './themeCatalog.js';
import { planModuleChanges } from '../modules/dependencies.js';
import { SUPPORTED, acceptLanguages, resolveLocale, sanitizeLocalization } from './i18n/index.js';

export const DEFAULTS = {
  app_name: 'docker-app-skeleton',
  app_version: APP_VERSION,
  app_description: 'Premium application skeleton on React, Express and PostgreSQL',
  rate_limit_window_ms: '900000',
  rate_limit_max: '300',
  rate_limit_user_max: '5000',
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
    // Office → PDF conversion for previews (Collabora Online / LibreOffice convert-to API).
    documents: {
      enabled: false,
      serverUrl: '',
      // Online editing through the same Collabora server (WOPI); see services/office/config.js.
      editing: EDITING_DEFAULTS,
    },
    mattermost: {
      enabled: false,
      serverUrl: '',
      botToken: '',
      // Optional channel for security alerts (lockouts, IP blocks, delivery failures).
      notifyChannelId: '',
      notifySecurity: false,
    },
    // Google OAuth client: sign-in, Google Calendar per user, Gmail as the mail sender.
    google: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      // Comma-separated Google Workspace domains allowed to sign in (empty = any account).
      allowedDomains: '',
      calendar: true,
      gmailSend: false,
      // Connected sender account; the refresh token is sealed (services/crypto.js).
      gmailSender: '',
      gmailToken: '',
    },
    activeDirectory: {
      enabled: false,
      host: '',
      port: 389,
      useTls: false,
      bindDn: '',
      bindPassword: '',
      baseDn: '',
      // Optional PEM bundle of the CA that issued the domain controller's certificate (LDAPS).
      caCert: '',
    },
  }),
  // Sign-in methods. Each one beyond the password needs its integration configured.
  auth: JSON.stringify({
    password: { enabled: true },
    ldap: { enabled: false, autoProvision: true, groupMap: [] },
    telegram: { enabled: false, autoProvision: false },
    google: { enabled: false, autoProvision: false },
    emailCode: { enabled: false },
    // provider: 'gateway' (WhatsApp Gateway) or 'wazzup'; fallback tries the other one.
    whatsappCode: { enabled: false, provider: 'gateway', fallback: true },
    telegramCode: { enabled: false },
    mattermostCode: { enabled: false },
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
  ['mattermost', 'botToken'],
  ['google', 'clientSecret'],
  ['google', 'gmailToken'],
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
  await migrateCrmStockLists();
  invalidateSettings();
}

const CRM_STOCK_KEYS = ['sources', 'lostReasons'];
const parseModules = (value) => {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/*
 * CRM sources and lost reasons a portal never saved were the Russian stock lists, and deals hold
 * those texts. Store them, so a later portal language never relabels the lists away from the deals.
 * Idempotent: only missing lists are written. → the keys written.
 */
export async function migrateCrmStockLists(transaction = withTransaction) {
  return transaction(async (client) => {
    const row = (await client.query(`SELECT value FROM app_settings WHERE key = 'modules' FOR UPDATE`)).rows[0];
    const modules = row ? parseModules(row.value) : {};
    if (!modules) return []; // unreadable: left alone, resolveModules falls back as before
    const crm = modules.crm && typeof modules.crm === 'object' ? modules.crm : {};
    const settings = crm.settings && typeof crm.settings === 'object' ? crm.settings : {};
    const missing = CRM_STOCK_KEYS.filter((key) => !Array.isArray(settings[key]));
    if (!missing.length) return [];
    const added = Object.fromEntries(missing.map((key) => [key, [...CRM_DEFAULTS[key]]]));
    const next = { ...modules, crm: { ...crm, settings: { ...settings, ...added } } };
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('modules', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(next)]
    );
    return missing;
  });
}

/*
 * Setup of a brand-new portal: the stock lists in the installer's language, while no deal exists yet
 * and the lists are still the untouched Russian stock written by migrateCrmStockLists. → true when written.
 */
export async function localizeCrmStockLists(locale, transaction = withTransaction) {
  const written = await transaction(async (client) => {
    const deals = (await client.query(`SELECT to_regclass('public.crm_deals') AS t`)).rows[0]?.t;
    if (deals && (await client.query(`SELECT 1 FROM crm_deals LIMIT 1`)).rows.length) return false;
    const row = (await client.query(`SELECT value FROM app_settings WHERE key = 'modules' FOR UPDATE`)).rows[0];
    const modules = row ? parseModules(row.value) : {};
    if (!modules) return false;
    const crm = modules.crm && typeof modules.crm === 'object' ? modules.crm : {};
    const settings = crm.settings && typeof crm.settings === 'object' ? crm.settings : {};
    const stock = CRM_STOCK_KEYS.every((key) => !Array.isArray(settings[key]) || JSON.stringify(settings[key]) === JSON.stringify(CRM_DEFAULTS[key]));
    if (!stock) return false;
    const lists = crmStockLists(locale);
    const next = { ...modules, crm: { ...crm, settings: { ...settings, ...lists } } };
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('modules', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(next)]
    );
    return true;
  });
  invalidateSettings();
  return written;
}

// ipGuard and the rate limiter read settings on every request, so raw rows are
// cached briefly. Every write goes through setSetting(), which drops the cache.
const CACHE_TTL_MS = 5000;
let cached = null;
let cachedAt = 0;
// Bumped by every invalidation: a read that started before one never fills the cache.
let generation = 0;

export function invalidateSettings() {
  cached = null;
  cachedAt = 0;
  generation += 1;
}

/** The raw rows as one object; the cached object itself (never hand it out to callers that change it). */
async function rawSettings({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  const started = generation;
  const result = await query('SELECT key, value FROM app_settings ORDER BY key');
  const settings = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  if (started === generation) {
    cached = settings;
    cachedAt = Date.now();
  }
  return settings;
}

export async function getSettings(options = {}) {
  return { ...(await rawSettings(options)) };
}

/*
 * Parsed settings for read-only hot paths (every request: rate limit, module
 * switch, language, regional settings). parseSettings re-parses every JSON
 * value each call — it was ~16% of the server's CPU under load. The parse is
 * keyed on the raw object it was made from (same object = same contents, so
 * two loads that settle together can never mix snapshots) and is a deep-frozen
 * copy, so a caller that tries to change it fails loudly instead of changing it
 * for everyone — and module-level defaults it was merged from stay mutable.
 * Code that edits settings keeps using parseSettings(await getSettings()),
 * which returns its own copy.
 */
let parsedCache = null;
let parsedFrom = null;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export async function getSettingsView() {
  const raw = await rawSettings();
  if (parsedFrom === raw && parsedCache) return parsedCache;
  const parsed = deepFreeze(structuredClone(parseSettings(raw)));
  // Only the current raw cache keeps its parse (an uncached, stale or fresh-only load does not).
  if (raw === cached) {
    parsedCache = parsed;
    parsedFrom = raw;
  }
  return parsed;
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
  appearance.appIconUrl = safeLogoUrl(appearance.appIconUrl);
  appearance.shortName = String(appearance.shortName || '').slice(0, 24);
  appearance.logoHeight = clampInt(appearance.logoHeight, 20, 64, 32);
  // Themes (Account → Appearance): the portal default and which ones employees may choose.
  appearance.defaultTheme = sanitizeDefaultTheme(appearance.defaultTheme);
  appearance.themes = sanitizeThemePolicy(appearance.themes);
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
  // Online editing lives inside the document integration (services/office/config.js).
  try {
    integrations.documents.editing = sanitizeEditing({}, storedIntegrations.documents?.editing || {});
  } catch {
    integrations.documents.editing = { ...EDITING_DEFAULTS };
  }
  const security = parseJson(raw.security, JSON.parse(DEFAULTS.security));
  const authDefaults = JSON.parse(DEFAULTS.auth);
  const storedAuth = parseJson(raw.auth, {});
  const auth = Object.fromEntries(
    Object.entries(authDefaults).map(([method, defaults]) => [
      method,
      { ...defaults, ...(storedAuth[method] || {}) },
    ])
  );

  const localization = sanitizeLocalization(parseJson(raw.localization, null), raw.default_locale);

  return {
    appName: raw.app_name || DEFAULTS.app_name,
    appVersion: APP_VERSION,
    appDescription: raw.app_description || DEFAULTS.app_description,
    accessMode: raw.access_mode === 'open' || raw.access_mode === 'closed'
      ? raw.access_mode
      : '',
    // What "/" shows: the built-in landing page or a module (e.g. online resources).
    homePage: MODULE_IDS.includes(raw.home_page) ? raw.home_page : 'landing',
    // Demo data present (services/demo.js keeps it): { active, modules, updatedAt }.
    demo: parseJson(raw.demo_state, {}),
    // Interface languages (Settings → Languages, superadministrators): which are
    // enabled and in what order, the default ('browser' or a language) and the
    // fallback for 'browser'. Portals from before keep their old single setting.
    localization,
    // The old single setting, still answered: 'auto' (browser) | a language code.
    defaultLocale: localization.default === 'browser' ? 'auto' : localization.default,
    // Time zone and date/time formats of the whole portal (services/datetime.js).
    regional: sanitizeRegional(parseJson(raw.regional, {})),
    rateLimit: {
      windowMs: Number(raw.rate_limit_window_ms) || Number(DEFAULTS.rate_limit_window_ms),
      max: Number(raw.rate_limit_max) || Number(DEFAULTS.rate_limit_max),
      userMax: Number(raw.rate_limit_user_max) || Number(DEFAULTS.rate_limit_user_max),
    },
    appearance,
    integrations,
    security,
    auth,
    // Stock texts of unsaved module settings follow the portal language (browser → the fallback).
    modules: resolveModules(parseJson(raw.modules, {}), { locale: localization.default === 'browser' ? localization.fallback : localization.default }),
  };
}

/**
 * Whether WhatsApp sign-in codes can be delivered with these options — the
 * same choice services/integrations.js sendWhatsapp makes: the chosen
 * provider (or, unset, whichever is configured), then the other one only
 * when fallback is on.
 */
export function whatsappSignInReady(ready, options = {}) {
  const providers = { gateway: Boolean(ready.whatsappGateway), wazzup: Boolean(ready.whatsappWazzup) };
  const primary = options?.provider === 'wazzup' || options?.provider === 'gateway' ? options.provider : providers.gateway ? 'gateway' : 'wazzup';
  const backup = primary === 'gateway' ? 'wazzup' : 'gateway';
  return providers[primary] || Boolean(options?.fallback && providers[backup]);
}

/**
 * Whether each sign-in method can actually work right now: enabled in
 * Settings → Sign-in methods AND its integration is enabled and configured.
 */
export function authAvailability(parsed) {
  const { integrations: i, auth } = parsed;
  const ready = {
    google: Boolean(i.google?.enabled && i.google?.clientId && i.google?.clientSecret),
    gmail: Boolean(
      i.google?.enabled && i.google?.clientId && i.google?.clientSecret && i.google?.gmailSend && i.google?.gmailToken
    ),
    ldap: Boolean(i.activeDirectory?.enabled && i.activeDirectory?.host && i.activeDirectory?.baseDn),
    telegram: Boolean(i.telegram?.enabled && i.telegram?.botToken && i.telegram?.botUsername),
    smtp: Boolean(i.email?.enabled && i.email?.host),
    whatsappGateway: Boolean(i.whatsapp?.enabled && i.whatsapp?.serverUrl && i.whatsapp?.apiKey),
    whatsappWazzup: Boolean(i.wazzup?.enabled && i.wazzup?.apiKey && i.wazzup?.channels?.whatsapp),
    telegramCode: Boolean(i.telegram?.enabled && i.telegram?.botToken),
    mattermostCode: Boolean(i.mattermost?.enabled && i.mattermost?.serverUrl && i.mattermost?.botToken),
  };
  // Email goes through SMTP or, when connected, through Gmail.
  ready.emailCode = ready.smtp || ready.gmail;
  // Some WhatsApp provider is configured (notifications; lets the method be switched on).
  ready.whatsappCode = ready.whatsappGateway || ready.whatsappWazzup;
  // Sign-in codes go through the provider chosen in Sign-in methods (the other one only with fallback on).
  ready.whatsappSignIn = whatsappSignInReady(ready, auth?.whatsappCode);
  ready.magicLink = ready.emailCode || ready.whatsappSignIn || ready.telegramCode || ready.mattermostCode;
  return {
    ready,
    password: auth.password?.enabled !== false,
    ldap: Boolean(auth.ldap?.enabled && ready.ldap),
    telegram: Boolean(auth.telegram?.enabled && ready.telegram),
    google: Boolean(auth.google?.enabled && ready.google),
    emailCode: Boolean(auth.emailCode?.enabled && ready.emailCode),
    whatsappCode: Boolean(auth.whatsappCode?.enabled && ready.whatsappSignIn),
    telegramCode: Boolean(auth.telegramCode?.enabled && ready.telegramCode),
    mattermostCode: Boolean(auth.mattermostCode?.enabled && ready.mattermostCode),
    magicLink: Boolean(auth.magicLink?.enabled),
  };
}

const AUTH_INTEGRATION = {
  ldap: 'Active Directory',
  telegram: 'Telegram bot (token and bot username)',
  google: 'Google (OAuth client ID and secret)',
  emailCode: 'Email (SMTP) or Gmail',
  whatsappCode: 'WhatsApp Gateway or Wazzup (with a WhatsApp channel)',
  telegramCode: 'Telegram bot',
  mattermostCode: 'Mattermost',
};

/**
 * A localization patch, checked strictly (a wrong value is refused, never
 * silently fixed): `enabled` — at least one supported language, no repeats,
 * in display order; `default` — 'browser' or an enabled language; `fallback`
 * — an enabled language (defaults to English when enabled, else the first).
 */
export function validateLocalization(input) {
  const fail = (message, code = 'LOCALIZATION_INVALID') => {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = code;
    throw error;
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Localization settings must be an object');
  const enabled = input.enabled;
  if (!Array.isArray(enabled) || !enabled.length) fail('At least one language must stay enabled', 'LOCALIZATION_EMPTY');
  if (enabled.some((code) => !SUPPORTED.includes(code))) fail(`Unknown language; supported: ${SUPPORTED.join(', ')}`);
  if (new Set(enabled).size !== enabled.length) fail('A language is listed twice');
  const def = input.default ?? 'browser';
  if (def !== 'browser' && !enabled.includes(def)) fail('The default language must be enabled (or "browser")');
  let fallback = input.fallback;
  if (fallback === undefined || fallback === null || fallback === '') fallback = enabled.includes('en') ? 'en' : enabled[0];
  if (!enabled.includes(fallback)) fail('The fallback language must be enabled');
  return { enabled: [...enabled], default: def, fallback };
}

export function sanitizeAuth(current, incoming, readiness) {
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  const next = structuredClone(current);
  const flag = (method, key) => {
    const value = src[method]?.[key];
    if (typeof value === 'boolean' && next[method]) next[method][key] = value;
  };
  for (const method of Object.keys(next)) flag(method, 'enabled');
  flag('ldap', 'autoProvision');
  flag('whatsappCode', 'fallback');
  if (src.whatsappCode?.provider === 'gateway' || src.whatsappCode?.provider === 'wazzup') {
    next.whatsappCode.provider = src.whatsappCode.provider;
  }
  flag('telegram', 'autoProvision');
  flag('google', 'autoProvision');
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
  // On, but the chosen provider is not configured and fallback is off: codes would never arrive.
  if (next.whatsappCode?.enabled && readiness.whatsappCode && !whatsappSignInReady(readiness, next.whatsappCode)) {
    const changed =
      !current.whatsappCode?.enabled ||
      current.whatsappCode?.provider !== next.whatsappCode.provider ||
      Boolean(current.whatsappCode?.fallback) !== Boolean(next.whatsappCode.fallback);
    if (changed) {
      const error = new Error(
        `WhatsApp codes are set to go through ${next.whatsappCode.provider === 'wazzup' ? 'Wazzup' : 'WhatsApp Gateway'}, which is not configured. Choose the configured provider or turn on fallback.`
      );
      error.statusCode = 400;
      error.code = 'WHATSAPP_PROVIDER_NOT_READY';
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

/**
 * Language for server-made texts (emails, notifications, codes) to a person:
 * their own choice, else the portal default, else English.
 */
export async function localeFor(user, { acceptLanguage } = {}) {
  return recipientLocale(user, (await getSettingsView()).localization, acceptLanguages(acceptLanguage));
}

/**
 * The same, with the settings at hand (for loops over many recipients):
 * the person's language when it is enabled, else the portal default — a
 * language, or for "browser" the first enabled one of `browser` (Accept-Language
 * of a request), else the fallback language.
 */
export function recipientLocale(user, localization, browser = []) {
  // Outside a request (no browser languages at hand): the language of the person's last request.
  const languages = browser.length ? browser : user?.last_locale ? [user.last_locale] : [];
  return resolveLocale({ profile: user?.locale, localization, browser: languages }).locale;
}

/*
 * Remembers the language a request was answered in for a person without a profile language
 * (users.last_locale, see recipientLocale). Cheap: written only when it changed, at most once per
 * person and language in this process, never in the way of the request.
 */
const rememberedLocales = new Map();
export function rememberRequestLocale(row, locale, { write = (id, value) => query(`UPDATE users SET last_locale = $2 WHERE id = $1 AND last_locale IS DISTINCT FROM $2`, [id, value]) } = {}) {
  // The profile language in effect needs no memory (a disabled one does: it falls through).
  if (!row?.id || !locale || row.locale === locale) return false;
  if ((rememberedLocales.get(row.id) ?? row.last_locale ?? null) === locale) return false;
  if (rememberedLocales.size > 10000) rememberedLocales.clear();
  rememberedLocales.set(row.id, locale);
  Promise.resolve()
    .then(() => write(row.id, locale))
    .catch(() => rememberedLocales.delete(row.id));
  return true;
}

export function toPublicSettings(parsed) {
  return {
    appName: parsed.appName,
    appVersion: parsed.appVersion,
    appDescription: parsed.appDescription,
    accessMode: parsed.accessMode || 'closed',
    homePage: parsed.homePage,
    // The «Demo mode» banner (administrators see it while demo data exists).
    demo: { active: Boolean(parsed.demo?.active) },
    defaultLocale: parsed.defaultLocale,
    localization: parsed.localization,
    regional: parsed.regional,
    appearance: parsed.appearance,
    // Only on/off — module system settings stay admin-only.
    modules: Object.fromEntries(
      Object.entries(parsed.modules).map(([id, state]) => [
        id,
        // A module may carry a display name chosen by the administrator (e.g. "Company Drive").
        {
          enabled: state.enabled,
          ...(state.settings?.title ? { title: state.settings.title } : {}),
          // Settings a module marks as public (e.g. the assistant's default robot).
          ...Object.fromEntries((MODULE_CATALOG.find((entry) => entry.id === id)?.publicSettings || []).map((key) => [key, state.settings?.[key]])),
        },
      ])
    ),
    auth: (() => {
      const available = authAvailability(parsed);
      return {
        password: available.password || available.ldap,
        ldap: available.ldap,
        telegram: available.telegram
          ? { enabled: true, botUsername: parsed.integrations.telegram.botUsername }
          : { enabled: false },
        google: available.google,
        emailCode: available.emailCode,
        whatsappCode: available.whatsappCode,
        telegramCode: available.telegramCode,
        mattermostCode: available.mattermostCode,
        magicLink:
          available.magicLink &&
          (available.emailCode || available.whatsappCode || available.telegramCode || available.mattermostCode),
      };
    })(),
    integrations: {
      email: { enabled: Boolean(parsed.integrations.email?.enabled) },
      telegram: { enabled: Boolean(parsed.integrations.telegram?.enabled) },
      whatsapp: { enabled: Boolean(parsed.integrations.whatsapp?.enabled) },
      wazzup: { enabled: Boolean(parsed.integrations.wazzup?.enabled) },
      mattermost: { enabled: Boolean(parsed.integrations.mattermost?.enabled) },
      documents: { enabled: Boolean(parsed.integrations.documents?.enabled) },
      google: {
        enabled: authAvailability(parsed).ready.google,
        calendar: Boolean(authAvailability(parsed).ready.google && parsed.integrations.google.calendar),
      },
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
    modules: parsed.modules,
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
    max: clampInt(src.max ?? current.max, 20, 100_000, 300),
    userMax: clampInt(src.userMax ?? current.userMax, 200, 1_000_000, 5000),
  };
}

const INTEGRATION_GROUPS = ['email', 'telegram', 'whatsapp', 'wazzup', 'mattermost', 'documents', 'google', 'activeDirectory'];

/** "Example.com, @corp.kz" → "example.com,corp.kz". */
export function normalizeDomains(value) {
  return [
    ...new Set(
      String(value || '')
        .split(/[\s,;]+/)
        .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
        .filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
    ),
  ]
    .slice(0, 20)
    .join(',');
}

/**
 * Where each integration sends its stored secret. A blank secret field means
 * "keep the saved one" — but only while it still goes to the same server.
 * Otherwise anyone allowed to edit integrations could point the host at their
 * own machine, press Test (or Save) and receive the password they cannot see.
 */
const SECRET_ENDPOINTS = {
  email: ['host', 'port'],
  whatsapp: ['serverUrl'],
  mattermost: ['serverUrl'],
  activeDirectory: ['host', 'port'],
};

function endpointValue(field, value) {
  if (field === 'port') return String(Number(value) || '');
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\/api(\/v4)?$/, '');
}

/** True when `next` would send the group's secret somewhere other than `current`. */
export function secretEndpointChanged(group, current = {}, next = {}) {
  return (SECRET_ENDPOINTS[group] || []).some(
    (field) => endpointValue(field, current?.[field]) !== endpointValue(field, next?.[field])
  );
}

export function secretRequiredError(group, field) {
  const error = new Error(`Re-enter the ${field} for ${group}: the server address changed`);
  error.statusCode = 400;
  error.code = 'SECRET_REQUIRED';
  error.expose = true;
  error.details = { group, field };
  return error;
}

/**
 * The stored secret of `group` for a test or save with `override`: the typed
 * one if any, else the saved one when the endpoint is unchanged. Throws
 * SECRET_REQUIRED when the endpoint changed and nothing was typed.
 */
export function reusableSecret(group, field, stored = {}, override = {}) {
  if (override?.[field]) return override[field];
  if (!stored?.[field]) return '';
  if (secretEndpointChanged(group, stored, { ...stored, ...override })) throw secretRequiredError(group, field);
  return stored[field];
}

/** Save-time guard for mergeKeepSecrets: same rule as reusableSecret, for every group in the patch. */
export function assertSecretsStayWithEndpoint(current, incoming) {
  for (const [group, field] of SECRET_PATHS) {
    const patch = incoming?.[group];
    if (!patch || typeof patch !== 'object' || !INTEGRATION_GROUPS.includes(group)) continue;
    reusableSecret(group, field, current?.[group], patch);
  }
}

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
  // The Gmail sender is set only by the OAuth flow (setGoogleSender), never by a patch.
  if (!next.google) return next;
  next.google.gmailToken = current.google?.gmailToken || '';
  next.google.gmailSender = current.google?.gmailSender || '';
  next.google.allowedDomains = normalizeDomains(next.google.allowedDomains);
  for (const flagName of ['calendar', 'gmailSend', 'enabled']) next.google[flagName] = Boolean(next.google[flagName]);
  return next;
}

/**
 * Optional CA certificate(s) for LDAPS, PEM. Empty clears it; anything that
 * is not one or more parseable certificates is refused.
 */
export function sanitizeCaCert(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  const blocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  const invalid = () => {
    const error = new Error('The CA certificate must be in PEM format (-----BEGIN CERTIFICATE----- … -----END CERTIFICATE-----)');
    error.statusCode = 400;
    error.code = 'CA_CERT_INVALID';
    error.expose = true;
    return error;
  };
  if (!blocks.length || text.length > 64 * 1024) throw invalid();
  for (const block of blocks) {
    try {
      new X509Certificate(block);
    } catch {
      throw invalid();
    }
  }
  return blocks.join('\n');
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

/*
 * Switching modules on / off checks their requirements against the saved
 * state, so it reads fresh settings under an advisory lock: two
 * administrators (or app instances) cannot each pass the check and together
 * leave a module on without the one it needs.
 */
async function withModulesLock(fn) {
  const client = await getPool().connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext('settings:modules'))`);
    try {
      return await fn();
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext('settings:modules'))`).catch(() => {});
    }
  } finally {
    client.release();
  }
}

export async function updateAdminSettings(patch, { locked = false } = {}) {
  if (!locked && patch?.modules && typeof patch.modules === 'object') return withModulesLock(() => updateAdminSettings(patch, { locked: true }));
  const parsed = parseSettings(await getSettings({ fresh: true }));
  // Checked before anything is written, so a refused patch saves nothing.
  if (patch.integrations) assertSecretsStayWithEndpoint(parsed.integrations, patch.integrations);
  // Requirements between modules (modules/dependencies.js): refused with 409, or
  // the required modules are switched on too when the patch says alsoEnable.
  let modulesPatch = null;
  if (patch.modules && typeof patch.modules === 'object') {
    const current = Object.fromEntries(Object.entries(parsed.modules).map(([id, state]) => [id, Boolean(state.enabled)]));
    const integrations = Object.fromEntries(Object.entries(parsed.integrations || {}).map(([key, value]) => [key, Boolean(value?.enabled)]));
    const plan = planModuleChanges(current, patch.modules, { integrations, core: MODULE_CATALOG.filter((module) => module.core).map((module) => module.id) });
    modulesPatch = { ...patch.modules };
    for (const id of plan.autoEnabled) modulesPatch[id] = { ...(modulesPatch[id] || {}), enabled: true };
  }

  if (patch.appName != null) await setSetting('app_name', String(patch.appName).slice(0, 80));
  if (patch.appDescription != null) {
    await setSetting('app_description', String(patch.appDescription).slice(0, 400));
  }
  if (patch.accessMode === 'open' || patch.accessMode === 'closed') {
    await setSetting('access_mode', patch.accessMode);
  }
  if (patch.regional && typeof patch.regional === 'object') {
    await setSetting('regional', JSON.stringify(sanitizeRegional(patch.regional, parsed.regional)));
  }
  if (patch.localization !== undefined || patch.defaultLocale !== undefined) {
    const next = patch.localization !== undefined
      ? validateLocalization(patch.localization)
      : validateLocalization({ ...parsed.localization, default: patch.defaultLocale === 'auto' ? 'browser' : patch.defaultLocale });
    await setSetting('localization', JSON.stringify(next));
    // Kept in step for anything that still reads the old key.
    await setSetting('default_locale', next.default === 'browser' ? 'auto' : next.default);
  }
  if (patch.homePage === 'landing' || MODULE_IDS.includes(patch.homePage)) {
    await setSetting('home_page', patch.homePage);
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
      appIconUrl:
        patch.appearance.appIconUrl === undefined
          ? parsed.appearance.appIconUrl
          : safeLogoUrl(patch.appearance.appIconUrl),
      shortName: String(patch.appearance.shortName ?? parsed.appearance.shortName ?? '').trim().slice(0, 24),
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
      defaultTheme: sanitizeDefaultTheme(patch.appearance.defaultTheme ?? parsed.appearance.defaultTheme),
      themes: sanitizeThemePolicy(patch.appearance.themes ?? parsed.appearance.themes),
    };
    await setSetting('appearance', JSON.stringify(nextAppearance));
  }
  if (patch.integrations) {
    const merged = mergeKeepSecrets(parsed.integrations, patch.integrations);
    merged.wazzup = sanitizeWazzup(merged.wazzup);
    // The editing block is replaced as a whole by the patch, cleaned (addresses, formats, limits).
    merged.documents.editing = sanitizeEditing(parsed.integrations.documents?.editing, patch.integrations.documents?.editing);
    if (merged.activeDirectory) merged.activeDirectory.caCert = sanitizeCaCert(merged.activeDirectory.caCert);
    await setSetting('integrations', JSON.stringify(merged));
    // The editor server may have changed: read its discovery again on next use.
    if (patch.integrations.documents) (await import('./office/discovery.js')).forgetDiscovery();
  }
  if (modulesPatch) {
    await setSetting('modules', JSON.stringify(sanitizeModules(parsed.modules, modulesPatch)));
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
    await setSetting('rate_limit_user_max', rateLimit.userMax);
  }

  return toAdminSettings(parseSettings(await getSettings({ fresh: true })));
}

/** `primary` is used everywhere; `dark` replaces it in the dark theme when set. */
function logoKey(variant) {
  if (variant === 'icon') return 'appIconUrl';
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

/** Stores (or clears) the Gmail sender connected through Google OAuth. */
export async function setGoogleSender({ email = '', sealedToken = '' } = {}) {
  const parsed = parseSettings(await getSettings({ fresh: true }));
  const integrations = structuredClone(parsed.integrations);
  integrations.google.gmailSender = email;
  integrations.google.gmailToken = sealedToken;
  if (!sealedToken) integrations.google.gmailSend = false;
  await setSetting('integrations', JSON.stringify(integrations));
}

/** The region settings that apply to a person (users row or null), over the portal's. */
export async function regionalFor(user) {
  return resolveRegional((await getSettingsView()).regional || REGIONAL_DEFAULTS, user);
}
