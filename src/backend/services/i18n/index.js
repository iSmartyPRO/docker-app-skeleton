/*
 * Server-side localization (docs/i18n.md): texts the server writes for people —
 * notifications, e-mails, exports, link previews, the PWA manifest, demo data.
 *
 *   tr(locale, 'notify.task.assigned.title', { name })   dictionary text
 *   pick({ en: 'Hello', ru: 'Привет' }, locale)          per-language object
 *   plural(locale, n, { one, few, many, other })         CLDR form of a word
 *   formatNumber / formatDate                            Intl in the language
 *
 * Dictionaries: src/backend/locales/<lang>/<area>.js — `export default { … }`
 * holding `dict[area]`, plain data only. Each language is laid over English
 * once at startup, so a missing text reads in English. Plurals follow the
 * frontend convention: `key_one`, `key_few`, `key_many`, `key_other` … chosen
 * with Intl.PluralRules when a numeric `count` param is given.
 *
 * Which language a person gets: services/settings.js → localeFor().
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LANGUAGES, LOCALE_CODES, REFERENCE_LOCALE, localeTag, normalizeLocale, pick, pluralCategory } from './languages.js';
import { assemble, englishPlurals, overlay } from './merge.js';

export * from './languages.js';
export { assemble, englishPlurals, overlay } from './merge.js';

/** Every language the portal knows (the superadministrator enables a subset). */
export const SUPPORTED = LOCALE_CODES;

const here = dirname(fileURLToPath(import.meta.url));
export const LOCALES_DIR = resolve(here, '../../locales');

async function readLanguage(lang) {
  const dir = join(LOCALES_DIR, lang);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return {};
  const files = readdirSync(dir).filter((name) => name.endsWith('.js')).sort();
  const parts = await Promise.all(files.map(async (name) => [name.slice(0, -3), (await import(pathToFileURL(join(dir, name)).href)).default || {}]));
  return assemble(Object.fromEntries(parts));
}

/** Each language's own texts (not merged): what translators wrote. */
export const RAW = Object.fromEntries(await Promise.all(LOCALE_CODES.map(async (lang) => [lang, await readLanguage(lang)])));

/** Each language laid over English: what the server uses. */
const DICTS = Object.fromEntries(LOCALE_CODES.map((lang) => [lang, lang === REFERENCE_LOCALE ? RAW[lang] : overlay(RAW[REFERENCE_LOCALE], RAW[lang])]));

/** Plural groups each language lacks (shown in English, so chosen with English rules). */
const ENGLISH_PLURALS = Object.fromEntries(LOCALE_CODES.map((lang) => [lang, new Set(lang === REFERENCE_LOCALE ? [] : englishPlurals(RAW[REFERENCE_LOCALE], RAW[lang]))]));

/** A supported code, English for anything else ('ru-RU' → 'ru', 'de' → 'en'). */
export function localeOrDefault(value, fallback = REFERENCE_LOCALE) {
  return normalizeLocale(value) || normalizeLocale(fallback) || REFERENCE_LOCALE;
}

function lookup(dict, path) {
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), dict);
}

export function interpolate(value, params) {
  if (typeof value !== 'string' || !params) return value;
  return value.replace(/\{(\w+)\}/g, (match, key) => (params[key] != null ? String(params[key]) : match));
}

const isCount = (value) => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));

/**
 * The text at `key` in a language (English when it has none), `{name}` params
 * filled in; with a numeric `count`, the CLDR plural form `key_<category>`.
 * Unknown keys come back as the key itself, so a gap is visible, never empty.
 */
export function tr(locale, key, params) {
  const code = localeOrDefault(locale);
  const dict = DICTS[code];
  let value = null;
  if (params && isCount(params.count)) {
    const cut = key.lastIndexOf('.');
    const parent = cut < 0 ? dict : lookup(dict, key.slice(0, cut));
    const leaf = cut < 0 ? key : key.slice(cut + 1);
    const rules = ENGLISH_PLURALS[code].has(key) ? REFERENCE_LOCALE : code;
    if (parent && typeof parent === 'object') value = parent[`${leaf}_${pluralCategory(rules, Number(params.count))}`] ?? parent[`${leaf}_other`] ?? null;
  }
  if (value == null) value = lookup(dict, key);
  if (value == null) return key;
  return typeof value === 'string' ? interpolate(value, params) : value;
}

/** A translator bound to one language: `const t = translator(locale); t('a.b')`. */
export function translator(locale) {
  const code = localeOrDefault(locale);
  const t = (key, params) => tr(code, key, params);
  t.locale = code;
  t.tag = localeTag(code);
  t.pick = (value) => pick(value, code);
  return t;
}

/**
 * A word in the right plural form: plural('ru', 5, { one: 'файл', few: 'файла',
 * many: 'файлов' }) → 'файлов'. Missing forms fall back to `other`, then `many`, then `one`.
 */
export function plural(locale, count, forms) {
  const category = pluralCategory(localeOrDefault(locale), Number(count));
  return forms[category] ?? forms.other ?? forms.many ?? forms.one ?? '';
}

/** Languages of an Accept-Language header, best first ('ru-RU,ru;q=0.9,en;q=0.8' → ['ru-RU', 'ru', 'en']). */
export function acceptLanguages(header) {
  if (typeof header !== 'string' || !header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { tag: tag.trim(), q: q ? Number(q.slice(2)) || 0 : 1, index };
    })
    .filter((item) => item.tag && item.tag !== '*' && item.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((item) => item.tag);
}

export function formatNumber(locale, value, options) {
  return new Intl.NumberFormat(localeTag(localeOrDefault(locale)), options).format(Number(value) || 0);
}

export function formatDate(locale, value, options) {
  return new Intl.DateTimeFormat(localeTag(localeOrDefault(locale)), options).format(value instanceof Date ? value : new Date(value));
}

/** The decimal separator of a language ('ru' → ',', 'en' → '.'), for plain numbers in CSV files. */
export function decimalSeparator(locale) {
  return new Intl.NumberFormat(localeTag(localeOrDefault(locale))).formatToParts(1.5).find((part) => part.type === 'decimal')?.value || '.';
}

/**
 * Language of a file export: the `lang` the page asked for (a code or a tag
 * such as 'ru-RU'), else the person's own (req.locale).
 */
export function exportLocale(lang, fallback) {
  return normalizeLocale(lang) || localeOrDefault(fallback);
}

/**
 * "5 000 USD" / "120 000 сом": the amount with the language's separators and
 * the currency's local name when the dictionary has one (core.currency.<code>).
 */
export function moneyText(amount, currency, locale = REFERENCE_LOCALE) {
  if (amount === null || amount === undefined) return '';
  const value = Number(amount);
  const digits = Number.isInteger(value) ? 0 : 2;
  const number = formatNumber(locale, value, { minimumFractionDigits: digits, maximumFractionDigits: 2 });
  const key = `core.currency.${currency}`;
  const symbol = currency && /^[A-Z]{3}$/.test(currency) ? tr(locale, key) : null;
  return `${number} ${symbol && symbol !== key ? symbol : currency || ''}`.trim();
}

/** Registry entries of every language (code, native name, tag…). */
export function languageList() {
  return LANGUAGES.map((language) => ({ ...language }));
}
