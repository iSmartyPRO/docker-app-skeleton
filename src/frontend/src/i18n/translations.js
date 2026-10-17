/*
 * Interface translations at runtime (docs/i18n.md).
 *
 * Texts live in src/locales/<lang>/<namespace>.js. Each language is a separate
 * chunk (virtual:i18n/dict/<lang>, see scripts/vite-plugin-i18n.mjs) that is
 * already complete — English fills every key the language lacks — so only the
 * active language is downloaded. LocaleContext loads it before showing the
 * interface and on every switch.
 *
 *   translate(locale, 'tasks.created', { count: 3 })
 *     `a.b.c` path, `{name}` interpolation, CLDR plurals: with a numeric
 *     `count` param, `key_one` / `key_few` / `key_many` / `key_other` … are
 *     chosen by Intl.PluralRules of the language (falling back to `key_other`,
 *     then `key`).
 */
import { coverage, loaders } from 'virtual:i18n/catalog';
import { REFERENCE_LOCALE, normalizeLocale, pluralCategory } from './languages';

const loaded = new Map();
// Per language: plural groups it lacks — English forms, chosen with English rules.
const englishPlurals = new Map();
const pending = new Map();
let active = null;

/** Languages that have a translation folder (src/locales/<code>). */
export const AVAILABLE_LOCALES = Object.keys(loaders);

/** Share of the English interface texts each language has translated (0…1), computed at build. */
export const TRANSLATION_COVERAGE = coverage;

/** Downloads (once) the dictionary of a language; resolves to it. */
export function loadDictionary(code) {
  const locale = loaders[code] ? code : REFERENCE_LOCALE;
  if (loaded.has(locale)) return Promise.resolve(loaded.get(locale));
  if (!pending.has(locale)) {
    pending.set(
      locale,
      loaders[locale]()
        .then((mod) => {
          loaded.set(locale, mod.default);
          englishPlurals.set(locale, new Set(mod.fallbackPlurals || []));
          pending.delete(locale);
          return mod.default;
        })
        .catch((error) => {
          pending.delete(locale);
          throw error;
        })
    );
  }
  return pending.get(locale);
}

/** The dictionary of a language when it is already downloaded, else null. */
export function getDictionary(code) {
  return loaded.get(code) || null;
}

/** Called by LocaleContext once a language is in use (texts outside React read it). */
export function setActiveLocale(code) {
  active = code;
}

/** The language of the interface right now ('en' before anything has loaded). */
export function activeLocale() {
  return active || REFERENCE_LOCALE;
}

/** Starts downloading the most likely language before React needs it. */
export function preloadDictionary(guess) {
  const code = normalizeLocale(guess);
  if (code && loaders[code]) loadDictionary(code).catch(() => {});
}

function lookup(dict, path) {
  if (!dict) return null;
  return path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), dict);
}

function plural(dict, locale, path, count) {
  const cut = path.lastIndexOf('.');
  const parent = cut < 0 ? dict : lookup(dict, path.slice(0, cut));
  const key = cut < 0 ? path : path.slice(cut + 1);
  if (!parent || typeof parent !== 'object') return null;
  const rules = englishPlurals.get(locale)?.has(path) ? REFERENCE_LOCALE : locale;
  const form = parent[`${key}_${pluralCategory(rules, count)}`] ?? parent[`${key}_other`];
  return typeof form === 'string' ? form : null;
}

export function interpolate(value, params) {
  if (typeof value !== 'string' || !params) return value;
  return value.replace(/\{(\w+)\}/g, (match, key) => (params[key] != null ? String(params[key]) : match));
}

const isCount = (value) => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));

/**
 * The text at `path` in `locale` (or the active language when that one is not
 * downloaded), with `{name}` params filled in. Null when the key is unknown.
 */
export function translate(locale, path, params) {
  const code = loaded.has(locale) ? locale : activeLocale();
  const dict = loaded.get(code) || loaded.get(REFERENCE_LOCALE) || null;
  let value = null;
  if (params && isCount(params.count)) value = plural(dict, code, path, Number(params.count));
  if (value == null) value = lookup(dict, path);
  return interpolate(value, params);
}

/** translate() in the active language, the key itself when unknown (for code outside React). */
export function t(path, params) {
  return translate(activeLocale(), path, params) ?? path;
}
