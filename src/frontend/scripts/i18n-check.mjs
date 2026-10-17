#!/usr/bin/env node
/*
 * npm run i18n:check — translation report (docs/i18n.md).
 *
 * For every language against English: interface dictionaries
 * (src/locales/<lang>/*.js), help articles (src/help/content/<lang>/*.js) and
 * administrator docs (src/help/admin/<lang>/*.js):
 *   coverage %, missing keys, extra keys, {placeholder} mismatches, plural
 *   forms the language needs (CLDR, Intl.PluralRules).
 * Plus keys used in the code as t('a.b') literals that English lacks.
 *
 * Fails (exit 1) when
 *   - a required language (English, Russian) misses anything or has extra keys;
 *   - any language has a written mistake: unknown placeholder, extra key,
 *     incomplete plural group, a text where a list is expected;
 *   - the code uses a key English does not have.
 * Languages being translated (ky, tr, zh) only report their coverage.
 *
 *   node scripts/i18n-check.mjs [--verbose] [--lang ky]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compareTranslation, coverageOf, writtenErrors } from '../src/i18n/check.js';
import { LOCALE_CODES, REFERENCE_LOCALE, languageInfo, pluralCategories } from '../src/i18n/languages.js';
import { SRC_DIR, articleIds, dictionaries, readArticle } from './i18n-node.mjs';

const REQUIRED = ['en', 'ru'];
const STRUCTURAL = ['id', 'icon', 'related', 'more'];
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const only = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null;
const langs = LOCALE_CODES.filter((code) => code !== REFERENCE_LOCALE && (!only || code === only));

let failed = false;
const fail = (line) => {
  failed = true;
  console.log(`  ✗ ${line}`);
};
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const list = (items, max = verbose ? Infinity : 12) => items.slice(0, max).map((item) => `      ${item}`).join('\n') + (items.length > max ? `\n      … ${items.length - max} more (--verbose)` : '');

function sum(reports) {
  return reports.reduce(
    (acc, r) => {
      for (const key of Object.keys(acc)) acc[key] = Array.isArray(acc[key]) ? acc[key].concat(r[key]) : acc[key] + r[key];
      return acc;
    },
    { total: 0, translated: 0, missing: [], extra: [], placeholders: [], lostPlaceholders: [], plurals: [], types: [] }
  );
}

function show(lang, area, report) {
  const required = REQUIRED.includes(lang);
  const errors = writtenErrors(report);
  const state = required ? (report.missing.length || errors.length ? '✗' : '✓') : errors.length ? '✗' : '·';
  console.log(`  ${state} ${area.padEnd(12)} ${pct(coverageOf(report)).padStart(6)}  ${report.translated}/${report.total}` + (report.missing.length ? `  missing ${report.missing.length}` : '') + (errors.length ? `  errors ${errors.length}` : '') + (report.lostPlaceholders.length ? `  unused placeholders ${report.lostPlaceholders.length}` : ''));
  if (errors.length) {
    failed = true;
    console.log(list(errors));
  }
  if (required && report.missing.length) {
    failed = true;
    console.log(list(report.missing.map((key) => `missing ${key}`)));
  } else if (verbose && report.missing.length) console.log(list(report.missing.map((key) => `missing ${key}`)));
  if (verbose && report.lostPlaceholders.length) console.log(list(report.lostPlaceholders.map((item) => `unused ${item}`)));
}

async function articles(kind, lang, categories) {
  const reports = [];
  for (const id of articleIds(kind)) {
    const reference = await readArticle(kind, REFERENCE_LOCALE, id);
    const own = await readArticle(kind, lang, id);
    if (own === null && REQUIRED.includes(lang)) fail(`help/${kind}/${lang}/${id}.js is missing`);
    reports.push(compareTranslation(reference, own || {}, { categories, structural: STRUCTURAL }));
  }
  return sum(reports);
}

console.log('Translations against English (reference)\n');
const summary = [];
for (const lang of langs) {
  const info = languageInfo(lang);
  const categories = pluralCategories(lang);
  console.log(`${lang} — ${info.english} (${info.name}), plural forms: ${categories.join(', ')}${REQUIRED.includes(lang) ? ', required' : ''}`);
  const ui = compareTranslation(dictionaries[REFERENCE_LOCALE], dictionaries[lang] || {}, { categories });
  show(lang, 'interface', ui);
  const help = await articles('content', lang, categories);
  show(lang, 'help', help);
  const admin = await articles('admin', lang, categories);
  show(lang, 'admin docs', admin);
  const all = sum([ui, help, admin]);
  summary.push([lang, coverageOf(ui), coverageOf(help), coverageOf(admin), coverageOf(all)]);
  console.log('');
}

// Keys used in the code that English does not have (t('a.b') with a literal key).
const lookup = (dict, path) => path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict);
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return ['locales', 'help'].includes(name) && dir === SRC_DIR ? [] : walk(path);
  return /\.(jsx?|mjs)$/.test(name) ? [path] : [];
});
const unknown = [];
const en = dictionaries[REFERENCE_LOCALE];
for (const file of walk(SRC_DIR)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\bt\(\s*['"]([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)['"]/g)) {
    const key = match[1];
    const value = lookup(en, key);
    const plural = value === undefined && ['other', 'one'].some((suffix) => lookup(en, `${key}_${suffix}`) !== undefined);
    if (value === undefined && !plural) unknown.push(`${relative(SRC_DIR, file)}: ${key}`);
  }
}
console.log(`code: ${unknown.length ? `✗ ${unknown.length} t() key(s) missing in English` : '✓ every literal t() key exists in English'}`);
if (unknown.length) {
  failed = true;
  console.log(list([...new Set(unknown)]));
}

console.log('\nCoverage        interface   help   admin   all');
for (const [lang, ui, help, admin, all] of summary) console.log(`  ${lang.padEnd(12)} ${pct(ui).padStart(9)} ${pct(help).padStart(6)} ${pct(admin).padStart(7)} ${pct(all).padStart(6)}`);
console.log(failed ? '\ni18n:check failed' : '\ni18n:check passed');
process.exit(failed ? 1 : 0);
