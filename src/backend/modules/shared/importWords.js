/*
 * Words of import files (statuses, types, tracking, employment…) in any portal language.
 * importWord() folds case, spaces and the Turkish dotted / dotless i («MÜSAİT», «ı»), so the
 * same spelling typed on any keyboard matches.
 */

export const importWord = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/̇/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ');

/**
 * `{ value: [words…] }` → `{ importWord(word): value }`. A word that would name two values
 * throws at start-up (test/import-vocabulary.test.js checks every vocabulary).
 */
export function wordMap(groups) {
  const out = {};
  for (const [value, words] of Object.entries(groups)) {
    for (const word of words) {
      const key = importWord(word);
      if (Object.hasOwn(out, key) && out[key] !== value) throw new Error(`Import word “${word}” names both ${out[key]} and ${value}`);
      out[key] = value;
    }
  }
  return out;
}

/**
 * The entry an import word names, by language: the person's language first, then English, then
 * the other languages in `languages` order. A name two entries share in the first language that
 * knows it is refused as ambiguous rather than guessed.
 *
 * entries: [{ value, names: { ru, en, … } }] → { value } | { ambiguous: [values] } | null
 */
export function matchByLanguage(word, entries, locale, languages = []) {
  const key = importWord(word);
  if (!key) return null;
  const order = [...new Set([locale, 'en', ...languages].filter(Boolean))];
  for (const lang of order) {
    const hits = [...new Set(entries.filter((entry) => entry.names?.[lang] && importWord(entry.names[lang]) === key).map((entry) => entry.value))];
    if (hits.length === 1) return { value: hits[0] };
    if (hits.length > 1) return { ambiguous: hits };
  }
  return null;
}
