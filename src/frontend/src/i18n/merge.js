/*
 * Merging of translation data. Shared copy: src/frontend/src/i18n/merge.js
 * (runtime, Vite plugin, i18n:check) and src/backend/services/i18n/merge.js,
 * kept identical by the backend test test/i18n.test.js. Pure, no imports.
 */

const isObject = (value) => value !== null && typeof value === 'object';

/**
 * `base` with `over` laid on top, without changing either: objects merge key by
 * key, arrays index by index (a translated list may be shorter — the rest stays
 * English), and a missing value (undefined / null) keeps the base one.
 */
export function overlay(base, over) {
  if (over === undefined || over === null) return base;
  if (!isObject(over) || !isObject(base) || Array.isArray(over) !== Array.isArray(base)) return over;
  if (Array.isArray(base)) {
    const out = base.slice();
    over.forEach((value, index) => {
      out[index] = overlay(base[index], value);
    });
    return out;
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = overlay(base[key], value);
  // Plural forms (`key_one`, `key_few`, … `key_other`, or a plain `key`) are one
  // unit: when a language writes any of them, English forms of that key are
  // dropped, so its own grammar is never mixed with English plural rules.
  for (const stem of pluralStems(over, base)) {
    for (const key of Object.keys(out)) if (!(key in over) && (key === stem || stemOf(key) === stem)) delete out[key];
  }
  return out;
}

/** CLDR plural categories, as key suffixes: `files_one`, `files_few`, … */
export const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL_KEY = new RegExp(`^(.+)_(${PLURAL_SUFFIXES.join('|')})$`);

/** `files_few` → 'files'; null for a key that is not a plural form. */
export function stemOf(key) {
  const match = PLURAL_KEY.exec(key);
  return match ? match[1] : null;
}

/**
 * Dotted paths of plural groups (`a.b.files` for `files_one`…) that a language
 * does not have, so its dictionary shows the English forms: those are chosen
 * with English plural rules (else zh, with a single form, would print "1 files").
 */
export function englishPlurals(reference, own, prefix = '', out = []) {
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return out;
  const mine = own && typeof own === 'object' && !Array.isArray(own) ? own : {};
  const stems = new Set(Object.keys(reference).map(stemOf).filter(Boolean));
  for (const stem of stems) {
    const has = typeof mine[stem] === 'string' || PLURAL_SUFFIXES.some((suffix) => typeof mine[`${stem}_${suffix}`] === 'string');
    if (!has) out.push(prefix ? `${prefix}.${stem}` : stem);
  }
  for (const [key, value] of Object.entries(reference)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) englishPlurals(value, mine[key], prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/** Keys of `over` that are plural groups: its own plural forms, or a plain text where `base` has forms. */
function pluralStems(over, base) {
  const stems = new Set();
  const baseStems = new Set(Object.keys(base).map(stemOf).filter(Boolean));
  for (const [key, value] of Object.entries(over)) {
    if (typeof value !== 'string') continue;
    const stem = stemOf(key);
    if (stem) stems.add(stem);
    else if (baseStems.has(key)) stems.add(key);
  }
  return stems;
}

/**
 * One dictionary from a language's namespace files:
 * `{ common: {...}, wh: {...}, _root: { brand } }` → `{ common, wh, brand }`.
 * The file `<ns>.js` holds `dict[ns]`; `_root.js` holds top-level keys.
 */
export function assemble(namespaces) {
  const dict = {};
  for (const [ns, content] of Object.entries(namespaces)) {
    if (ns === '_root') Object.assign(dict, content || {});
    else dict[ns] = content || {};
  }
  return dict;
}
