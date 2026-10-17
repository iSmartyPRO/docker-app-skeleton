import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'vm';
import { SUPPORTED } from '../services/i18n/index.js';
import { importWord, matchByLanguage, wordMap } from '../modules/shared/importWords.js';
import { STOCK_TYPE_NAMES, statusNames } from '../modules/masterplan/units.js';
import { TRACKING_WORD_GROUPS } from '../modules/warehouse/importer.js';
import { EMPLOYMENT_WORD_GROUPS, STATUS_WORD_GROUPS } from '../modules/employees/logic.js';

/*
 * Every import vocabulary (column headers, statuses, types, tracking and employment words of
 * Masterplan, Warehouse and Employees) names each value once per language, so a file in any
 * language maps to one meaning. The column lists live in the frontend; their array literals are
 * read from the source.
 */

/** names: [{ value, names: { lang: text } }] → the clashes inside one language. */
function clashesPerLanguage(entries) {
  const clashes = [];
  for (const lang of SUPPORTED) {
    const seen = new Map();
    for (const { value, names } of entries) {
      const word = names[lang] && importWord(names[lang]);
      if (!word) continue;
      if (seen.has(word) && seen.get(word) !== value) clashes.push(`${lang}: “${names[lang]}” is ${seen.get(word)} and ${value}`);
      seen.set(word, value);
    }
  }
  return clashes;
}

const frontendArray = (file, name) => {
  const source = readFileSync(new URL(`../../frontend/src/${file}`, import.meta.url), 'utf8');
  const start = source.indexOf(`export const ${name} = [`);
  assert.ok(start >= 0, `${name} in ${file}`);
  const from = source.indexOf('[', start);
  const end = source.indexOf('\n];', from);
  return vm.runInNewContext(`(${source.slice(from, end + 2)})`);
};

const COLUMN_LISTS = [
  ['modules/masterplan/media/xlsx.js', 'IMPORT_COLUMNS'],
  ['modules/warehouse/xlsx.js', 'ITEM_COLUMNS'],
  ['modules/warehouse/xlsx.js', 'OPENING_COLUMNS'],
  ['modules/employees/pages/ImportPage.jsx', 'EMPLOYEE_COLUMNS'],
];

test('import vocabularies: Masterplan stock types and statuses are unique per language', () => {
  assert.deepEqual(clashesPerLanguage(STOCK_TYPE_NAMES), []);
  assert.deepEqual(clashesPerLanguage(statusNames()), []);
  // Stronger: no name is another value's name in any other language either (Turkish «Villa» was
  // the cottage while English «Villa» is the villa), so language priority is never needed for them.
  for (const entries of [STOCK_TYPE_NAMES, statusNames()]) {
    const spellings = Object.fromEntries(entries.map(({ value, names }) => [value, Object.values(names)]));
    assert.doesNotThrow(() => wordMap(spellings));
  }
});

test('import vocabularies: column headers are unique per language, and every spelling names one column', () => {
  for (const [file, name] of COLUMN_LISTS) {
    const columns = frontendArray(file, name);
    assert.ok(columns.length > 3, `${name} read`);
    const entries = columns.map((column) => ({ value: column.key, names: Object.fromEntries(SUPPORTED.map((lang) => [lang, column[lang]])) }));
    assert.deepEqual(clashesPerLanguage(entries), [], `${name}: headers per language`);
    // Headers are matched in any language and through the aliases at once.
    const spellings = Object.fromEntries(columns.map((column) => [column.key, [...SUPPORTED.map((lang) => column[lang]).filter(Boolean), ...(column.aliases || [])]]));
    assert.doesNotThrow(() => wordMap(spellings), `${name}: one column per spelling`);
  }
});

test('import vocabularies: warehouse tracking and employee status / employment words name one value each', () => {
  for (const groups of [TRACKING_WORD_GROUPS, STATUS_WORD_GROUPS, EMPLOYMENT_WORD_GROUPS]) {
    assert.doesNotThrow(() => wordMap(groups));
  }
  assert.throws(() => wordMap({ a: ['Kat'], b: ['KAT'] }), /names both a and b/);
});

test('import words: Turkish i, case and spaces fold', () => {
  assert.equal(importWord('  MÜSAİT '), 'müsait');
  assert.equal(importWord('Satışa  kapalı'), 'satişa kapali');
  assert.equal(importWord('KAPALI'), importWord('kapalı'));
});

test('import words: language priority — the person’s language, then English, then the others', () => {
  const types = STOCK_TYPE_NAMES;
  assert.deepEqual(matchByLanguage('Villa', types, 'en', SUPPORTED), { value: 'villa' });
  assert.deepEqual(matchByLanguage('Villa', types, 'ru', SUPPORTED), { value: 'villa' }, 'English before the others');
  assert.deepEqual(matchByLanguage('müstakil EV', types, 'ru', SUPPORTED), { value: 'cottage' });
  assert.deepEqual(matchByLanguage('Коттедж', types, 'en', SUPPORTED), { value: 'cottage' });
  assert.equal(matchByLanguage('Castle', types, 'en', SUPPORTED), null);
  assert.deepEqual(matchByLanguage('MÜSAİT', statusNames(), 'tr', SUPPORTED), { value: 'free' });
  assert.deepEqual(matchByLanguage('müsait', statusNames(), 'en', SUPPORTED), { value: 'free' });
  // A word the person's language uses for one value wins over another language's meaning.
  const entries = [
    { value: 'a', names: { en: 'Kat', tr: 'Floor' } },
    { value: 'b', names: { en: 'Floor' } },
  ];
  assert.deepEqual(matchByLanguage('floor', entries, 'tr', SUPPORTED), { value: 'a' });
  assert.deepEqual(matchByLanguage('floor', entries, 'ru', SUPPORTED), { value: 'b' });
  // Two values sharing a name in the deciding language are refused.
  const twins = [
    { value: 'a', names: { en: 'Same' } },
    { value: 'b', names: { en: 'same' } },
  ];
  assert.deepEqual(matchByLanguage('Same', twins, 'en', SUPPORTED), { ambiguous: ['a', 'b'] });
});
