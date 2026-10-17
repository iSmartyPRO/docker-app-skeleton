/*
 * Language registry — the single list of interface languages.
 *
 * The same file lives in src/frontend/src/i18n/languages.js and
 * src/backend/services/i18n/languages.js (the frontend
 * and backend are built separately); a backend test keeps the two copies
 * identical. Edit both, or copy one over the other. Pure data and pure
 * functions only: no imports, no browser or Node APIs.
 *
 * English is the reference language: every key exists in English first, and
 * a text missing in another language falls back to English.
 *
 *   code    portal code, stored in users.locale and in the settings
 *   name    native name, shown in every language switcher
 *   english English name (docs, logs, translation tooling)
 *   tag     BCP 47 tag for Intl (dates, numbers, plurals, collation)
 *   dayjs   dayjs locale file (dayjs/locale/<dayjs>.js)
 *   antd    antd ConfigProvider locale (antd/locale/<antd>.js)
 *   dir     text direction
 */

export const LANGUAGES = [
  { code: 'en', name: 'English', english: 'English', tag: 'en-GB', dayjs: 'en-gb', antd: 'en_GB', dir: 'ltr' },
  { code: 'ru', name: 'Русский', english: 'Russian', tag: 'ru-RU', dayjs: 'ru', antd: 'ru_RU', dir: 'ltr' },
  { code: 'ky', name: 'Кыргызча', english: 'Kyrgyz', tag: 'ky-KG', dayjs: 'ky', antd: 'ky_KG', dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', english: 'Turkish', tag: 'tr-TR', dayjs: 'tr', antd: 'tr_TR', dir: 'ltr' },
  { code: 'zh', name: '中文', english: 'Chinese (Simplified)', tag: 'zh-CN', dayjs: 'zh-cn', antd: 'zh_CN', dir: 'ltr' },
];

/** The reference language and the last fallback for any missing text. */
export const REFERENCE_LOCALE = 'en';

export const LOCALE_CODES = LANGUAGES.map((language) => language.code);

/** What a portal has before the superadministrator changes anything (the languages it had before). */
export const DEFAULT_LOCALIZATION = Object.freeze({ enabled: Object.freeze(['ru', 'en']), default: 'browser', fallback: 'en' });

const BY_CODE = Object.fromEntries(LANGUAGES.map((language) => [language.code, language]));

/** Registry entry of a code (English for anything unknown). */
export function languageInfo(code) {
  return BY_CODE[code] || BY_CODE[REFERENCE_LOCALE];
}

/** Intl tag of a code: 'ru' → 'ru-RU'. */
export function localeTag(code) {
  return languageInfo(normalizeLocale(code) || REFERENCE_LOCALE).tag;
}

/**
 * A supported code from anything that names a language: 'ru', 'ru-RU',
 * 'zh_Hans_CN', 'EN-us', 'tr;q=0.8'. Null when it is none of ours.
 */
export function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  const primary = value.trim().toLowerCase().split(/[-_;,\s]/, 1)[0];
  return BY_CODE[primary] ? primary : null;
}

const unique = (list) => [...new Set(list)];

/**
 * The portal's language settings, cleaned up:
 *   enabled   languages people may pick, in the order switchers show them (at least one)
 *   default   a code, or 'browser' (the first browser language that is enabled)
 *   fallback  the language for 'browser' when no browser language is enabled
 * `legacyDefault` is the old single setting ('auto' | 'ru' | 'en'), used when
 * nothing else is stored.
 */
export function sanitizeLocalization(raw, legacyDefault) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  let enabled = unique((Array.isArray(source.enabled) ? source.enabled : []).map(normalizeLocale).filter(Boolean));
  if (!enabled.length) enabled = [...DEFAULT_LOCALIZATION.enabled];
  let def = source.default === 'browser' ? 'browser' : normalizeLocale(source.default);
  if (!def) {
    const legacy = normalizeLocale(legacyDefault);
    def = legacy && enabled.includes(legacy) ? legacy : DEFAULT_LOCALIZATION.default;
  }
  if (def !== 'browser' && !enabled.includes(def)) def = enabled[0];
  let fallback = normalizeLocale(source.fallback);
  if (!fallback || !enabled.includes(fallback)) fallback = enabled.includes(REFERENCE_LOCALE) ? REFERENCE_LOCALE : enabled[0];
  return { enabled, default: def, fallback };
}

/** First of the browser's languages (navigator.languages) that the portal has enabled. */
export function matchBrowserLocale(browserLanguages, enabled) {
  for (const value of browserLanguages || []) {
    const code = normalizeLocale(value);
    if (code && enabled.includes(code)) return code;
  }
  return null;
}

/** The portal default for people with no choice of their own (and for server texts). */
export function portalDefaultLocale(localization, browserLanguages = []) {
  const settings = sanitizeLocalization(localization);
  if (settings.default !== 'browser') return settings.default;
  return matchBrowserLocale(browserLanguages, settings.enabled) || settings.fallback;
}

/**
 * The interface language and where it came from:
 *   1. 'profile'  the person's own choice (follows them to every device);
 *   2. 'device'   the choice made on this device (guests, before signing in);
 *   3. 'portal'   the portal default language;
 *   4. 'browser'  the portal default is "browser language": the first enabled one;
 *   5. 'fallback' none of the browser's languages is enabled.
 * A choice of a language the superadministrator has since disabled is skipped.
 */
export function resolveLocale({ profile, device, localization, browser = [] } = {}) {
  const settings = sanitizeLocalization(localization);
  const allowed = (value) => {
    const code = normalizeLocale(value);
    return code && settings.enabled.includes(code) ? code : null;
  };
  if (allowed(profile)) return { locale: allowed(profile), source: 'profile' };
  if (allowed(device)) return { locale: allowed(device), source: 'device' };
  if (settings.default !== 'browser') return { locale: settings.default, source: 'portal' };
  const match = matchBrowserLocale(browser, settings.enabled);
  return match ? { locale: match, source: 'browser' } : { locale: settings.fallback, source: 'fallback' };
}

/** CLDR plural category of `count` in a language: 'one' | 'few' | 'many' | 'other' | … */
const pluralRules = new Map();
export function pluralCategory(code, count) {
  const tag = localeTag(code);
  if (!pluralRules.has(tag)) {
    try {
      pluralRules.set(tag, new Intl.PluralRules(tag));
    } catch {
      pluralRules.set(tag, new Intl.PluralRules('en'));
    }
  }
  return pluralRules.get(tag).select(Number(count));
}

/** The plural categories a language needs ('ru' → one, few, many, other). */
export function pluralCategories(code) {
  try {
    return new Intl.PluralRules(localeTag(code)).resolvedOptions().pluralCategories;
  } catch {
    return ['one', 'other'];
  }
}

/**
 * A text from a per-language object — `{ en: 'Hello', ru: 'Привет' }` — in
 * `code`, else English, else the first language present. Strings pass as is.
 */
export function pick(value, code) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  const own = value[code];
  if (own !== undefined && own !== null && own !== '') return own;
  const reference = value[REFERENCE_LOCALE];
  if (reference !== undefined && reference !== null && reference !== '') return reference;
  for (const language of LANGUAGES) {
    const text = value[language.code];
    if (text !== undefined && text !== null && text !== '') return text;
  }
  return '';
}
