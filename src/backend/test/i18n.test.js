import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RAW,
  SUPPORTED,
  acceptLanguages,
  decimalSeparator,
  englishPlurals,
  exportLocale,
  localeOrDefault,
  matchBrowserLocale,
  moneyText,
  normalizeLocale,
  overlay,
  pick,
  plural,
  pluralCategories,
  pluralCategory,
  portalDefaultLocale,
  resolveLocale,
  sanitizeLocalization,
  tr,
  translator,
} from '../services/i18n/index.js';
import { compareTranslation, coverageOf, writtenErrors } from '../services/i18n/check.js';
import { deniedSettingsKeys, dropUnchangedSettingsKeys } from '../services/permissions.js';
import { parseSettings, recipientLocale, rememberRequestLocale, validateLocalization } from '../services/settings.js';

/*
 * Localization (docs/i18n.md): the language registry, locale resolution,
 * fallback to English, CLDR plurals, server dictionaries and the
 * superadministrator-only language settings. Database-free.
 */

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('i18n: frontend and backend share identical registry, merge and check code', () => {
  for (const file of ['languages.js', 'merge.js', 'check.js']) {
    assert.equal(read(`../services/i18n/${file}`), read(`../../frontend/src/i18n/${file}`), `${file}: copy src/frontend/src/i18n/${file} to src/backend/services/i18n/`);
  }
});

test('i18n: registry lists the five languages with Intl, dayjs and antd codes', () => {
  assert.deepEqual(SUPPORTED, ['en', 'ru', 'ky', 'tr', 'zh']);
  const t = translator('zh');
  assert.equal(t.tag, 'zh-CN');
  assert.equal(normalizeLocale('ru-RU'), 'ru');
  assert.equal(normalizeLocale('zh_Hans_CN'), 'zh');
  assert.equal(normalizeLocale('KY'), 'ky');
  assert.equal(normalizeLocale('de'), null);
  assert.equal(normalizeLocale(null), null);
  assert.equal(localeOrDefault('fr'), 'en');
  assert.equal(exportLocale('tr-TR', 'ru'), 'tr');
  assert.equal(exportLocale(undefined, 'ru'), 'ru');
  assert.deepEqual(acceptLanguages('ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7,*;q=0.1'), ['ru-RU', 'ru', 'en-US', 'en']);
  assert.deepEqual(acceptLanguages('en;q=0.5, tr'), ['tr', 'en']);
});

test('i18n: localization settings — legacy default, order, browser fallback', () => {
  // Portals from before: ru + en, the old single default migrates.
  assert.deepEqual(sanitizeLocalization(null, 'ru'), { enabled: ['ru', 'en'], default: 'ru', fallback: 'en' });
  assert.deepEqual(sanitizeLocalization(undefined, 'auto'), { enabled: ['ru', 'en'], default: 'browser', fallback: 'en' });
  // Garbage is cleaned up, never trusted.
  assert.deepEqual(sanitizeLocalization({ enabled: ['zh', 'xx', 'zh', 'ky'], default: 'ru', fallback: 'de' }), { enabled: ['zh', 'ky'], default: 'zh', fallback: 'zh' });
  assert.deepEqual(sanitizeLocalization({ enabled: [] }), { enabled: ['ru', 'en'], default: 'browser', fallback: 'en' });
  assert.equal(matchBrowserLocale(['de-DE', 'tr-TR', 'en'], ['en', 'tr']), 'tr');
  assert.equal(portalDefaultLocale({ enabled: ['ru', 'ky'], default: 'browser', fallback: 'ky' }, ['de', 'fr']), 'ky');
  assert.equal(parseSettings({ default_locale: 'en' }).localization.default, 'en');
  assert.equal(parseSettings({ localization: JSON.stringify({ enabled: ['ky', 'ru'], default: 'browser', fallback: 'ru' }) }).defaultLocale, 'auto');
});

test('i18n: locale resolution — profile, device, portal default, browser, disabled languages', () => {
  const localization = { enabled: ['ru', 'en', 'ky'], default: 'browser', fallback: 'en' };
  assert.deepEqual(resolveLocale({ profile: 'ky', device: 'ru', localization, browser: ['en'] }), { locale: 'ky', source: 'profile' });
  assert.deepEqual(resolveLocale({ profile: null, device: 'ru', localization, browser: ['en'] }), { locale: 'ru', source: 'device' });
  assert.deepEqual(resolveLocale({ localization, browser: ['de-DE', 'ky-KG'] }), { locale: 'ky', source: 'browser' });
  assert.deepEqual(resolveLocale({ localization, browser: ['de-DE', 'fr'] }), { locale: 'en', source: 'fallback' });
  assert.deepEqual(resolveLocale({ localization: { ...localization, default: 'ru' }, browser: ['ky'] }), { locale: 'ru', source: 'portal' });
  // The person's language was switched off: the portal default applies.
  const off = { enabled: ['ru', 'en'], default: 'ru', fallback: 'en' };
  assert.deepEqual(resolveLocale({ profile: 'zh', localization: off }), { locale: 'ru', source: 'portal' });
  assert.deepEqual(resolveLocale({ profile: 'zh', device: 'tr', localization: off, browser: ['zh'] }), { locale: 'ru', source: 'portal' });
  // Server side: notifications and e-mails go out in the same language.
  assert.equal(recipientLocale({ locale: 'ky' }, localization), 'ky');
  assert.equal(recipientLocale({ locale: 'zh' }, off), 'ru');
  assert.equal(recipientLocale(null, localization, ['tr', 'ky']), 'ky');
  assert.equal(recipientLocale(null, { enabled: ['ru'], default: 'browser' }), 'ru');
  // Outside a request (no browser languages): the language of the person's last request.
  assert.equal(recipientLocale({ locale: null, last_locale: 'ru' }, localization), 'ru');
  assert.equal(recipientLocale({ locale: 'ky', last_locale: 'ru' }, localization), 'ky', 'the profile wins');
  assert.equal(recipientLocale({ locale: null, last_locale: 'ru' }, localization, ['ky']), 'ky', 'a request has its own languages');
  assert.equal(recipientLocale({ locale: null, last_locale: 'ru' }, { ...localization, default: 'en' }), 'en', 'only in browser mode');
  assert.equal(recipientLocale({ locale: null, last_locale: 'zh' }, localization), 'en', 'a disabled last language: the fallback');
});

test('i18n: the last request language is written only when it changes', async () => {
  const writes = [];
  const write = async (id, value) => writes.push([id, value]);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  assert.equal(rememberRequestLocale({ id: 9001, locale: null, last_locale: 'ru' }, 'ru', { write }), false, 'stored already');
  assert.equal(rememberRequestLocale({ id: 9001, locale: null, last_locale: 'ru' }, 'en', { write }), true);
  // The session row may be cached with the old value: still one write per change.
  assert.equal(rememberRequestLocale({ id: 9001, locale: null, last_locale: 'ru' }, 'en', { write }), false);
  assert.equal(rememberRequestLocale({ id: 9002, locale: 'ky' }, 'ky', { write }), false, 'the profile language is in effect');
  assert.equal(rememberRequestLocale({ id: 9003, locale: 'zh', last_locale: null }, 'ru', { write }), true, 'a disabled profile language falls through');
  await flush();
  assert.deepEqual(writes, [[9001, 'en'], [9003, 'ru']]);
  // A failed write is tried again by a later request.
  const failing = async () => {
    throw new Error('db down');
  };
  assert.equal(rememberRequestLocale({ id: 9004, locale: null }, 'tr', { write: failing }), true);
  await flush();
  assert.equal(rememberRequestLocale({ id: 9004, locale: null }, 'tr', { write }), true);
});

test('i18n: language settings are validated strictly and only superadministrators change them', () => {
  assert.deepEqual(validateLocalization({ enabled: ['ky', 'ru'], default: 'browser' }), { enabled: ['ky', 'ru'], default: 'browser', fallback: 'ky' });
  assert.deepEqual(validateLocalization({ enabled: ['en'], default: 'en', fallback: 'en' }), { enabled: ['en'], default: 'en', fallback: 'en' });
  const code = (input) => {
    try {
      validateLocalization(input);
      return 'ok';
    } catch (error) {
      assert.equal(error.statusCode, 400);
      return error.code;
    }
  };
  assert.equal(code({ enabled: [] }), 'LOCALIZATION_EMPTY');
  assert.equal(code({ enabled: 'ru' }), 'LOCALIZATION_EMPTY');
  assert.equal(code({ enabled: ['ru', 'de'] }), 'LOCALIZATION_INVALID');
  assert.equal(code({ enabled: ['ru', 'ru'] }), 'LOCALIZATION_INVALID');
  assert.equal(code({ enabled: ['ru'], default: 'en' }), 'LOCALIZATION_INVALID');
  assert.equal(code({ enabled: ['ru', 'en'], default: 'browser', fallback: 'zh' }), 'LOCALIZATION_INVALID');
  assert.equal(code(null), 'LOCALIZATION_INVALID');
  // Even an administrator with every settings permission is refused; '*' is not.
  const admin = new Set(['settings.view', 'settings.general', 'settings.security', 'settings.auth', 'settings.integrations', 'settings.modules', 'settings.system']);
  assert.deepEqual(deniedSettingsKeys({ localization: { enabled: ['ru'] } }, admin), ['localization']);
  assert.deepEqual(deniedSettingsKeys({ defaultLocale: 'ru' }, admin), ['defaultLocale']);
  assert.deepEqual(deniedSettingsKeys({ localization: { enabled: ['ru'] }, appName: 'X' }, new Set(['*'])), []);
  // An older General form always sends defaultLocale: unchanged, it is dropped instead of refusing the save.
  const general = new Set(['settings.general']);
  const current = { defaultLocale: 'auto' };
  const kept = dropUnchangedSettingsKeys({ appName: 'X', defaultLocale: 'auto' }, general, current);
  assert.deepEqual(kept, { appName: 'X' });
  assert.deepEqual(deniedSettingsKeys(kept, general), []);
  assert.deepEqual(deniedSettingsKeys(dropUnchangedSettingsKeys({ appName: 'X', defaultLocale: 'ru' }, general, current), general), ['defaultLocale'], 'a change is still refused');
  assert.deepEqual(dropUnchangedSettingsKeys({ defaultLocale: 'auto' }, new Set(['*']), current), { defaultLocale: 'auto' }, 'superadministrators keep it');
});

test('i18n: CLDR plural categories for en, ru, ky, tr, zh', () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25, 1.5].map((n) => pluralCategory('ru', n)), ['one', 'few', 'many', 'many', 'one', 'few', 'many', 'other']);
  assert.deepEqual([0, 1, 2, 5].map((n) => pluralCategory('en', n)), ['other', 'one', 'other', 'other']);
  assert.deepEqual([1, 2].map((n) => pluralCategory('ky', n)), ['one', 'other']);
  assert.deepEqual([1, 2].map((n) => pluralCategory('tr', n)), ['one', 'other']);
  assert.deepEqual([1, 2].map((n) => pluralCategory('zh', n)), ['other', 'other']);
  assert.deepEqual([...pluralCategories('ru')].sort(), ['few', 'many', 'one', 'other']);
  assert.deepEqual(pluralCategories('zh'), ['other']);
  assert.equal(plural('ru', 22, { one: 'файл', few: 'файла', many: 'файлов' }), 'файла');
  assert.equal(plural('ru', 25, { one: 'файл', few: 'файла', many: 'файлов' }), 'файлов');
  assert.equal(plural('zh', 3, { other: '个文件' }), '个文件');
});

test('i18n: tr() — dictionary texts, plurals, interpolation and English fallback', () => {
  assert.equal(tr('ru', 'calendar.lead.days', { count: 21 }), '21 день');
  assert.equal(tr('ru', 'calendar.lead.days', { count: 3 }), '3 дня');
  assert.equal(tr('ru', 'calendar.lead.days', { count: 11 }), '11 дней');
  assert.equal(tr('en', 'calendar.lead.days', { count: 1 }), '1 day');
  assert.equal(tr('ky', 'tasks.notify.assigned.title', { ref: 'WEB-1' }), 'Сизге WEB-1 тапшырмасы дайындалды');
  assert.equal(tr('ru', 'tasks.notify.assigned.title', { ref: 'WEB-1' }), 'Вам назначена задача WEB-1');
  // Values are not re-scanned for placeholders; unknown placeholders stay visible.
  assert.equal(tr('en', 'crm.notify.deal', { deal: '{x}' }), 'Deal “{x}”');
  assert.equal(tr('en', 'masterplan.conflict.reserved'), 'The unit has just been reserved by {manager}');
  // An unknown key comes back as is: a gap is visible, never empty.
  assert.equal(tr('ru', 'nope.missing'), 'nope.missing');
  assert.equal(pick({ ru: 'Привет', en: 'Hello' }, 'ky'), 'Hello');
  assert.equal(pick({ ru: 'Привет', en: '' }, 'tr'), 'Привет');
  assert.equal(pick({ ru: 'Привет', en: 'Hello', ky: 'Салам' }, 'ky'), 'Салам');
  assert.equal(pick('plain', 'zh'), 'plain');
  assert.equal(moneyText(120000, 'KGS', 'ru').replace(/\s/g, ' '), '120 000 сом');
  assert.equal(moneyText(5000.5, 'USD', 'en'), '5,000.50 USD');
  assert.equal(moneyText(10, 'KGS', 'zh'), '10 KGS');
  assert.equal(decimalSeparator('ru'), ',');
  assert.equal(decimalSeparator('zh'), '.');
});

/*
 * English fallback, independent of how far any translation has got: a
 * synthetic dictionary that deliberately lacks texts, plus a property check of
 * tr() over every real key (own text when written, English otherwise).
 */
test('i18n: English fallback — missing texts show English, missing plural groups use English rules', () => {
  const en = { lead: { days_one: '{count} day', days_other: '{count} days' }, title: 'Hello {name}', kept: 'Only English' };
  const zh = { title: '你好，{name}' };
  const merged = overlay(en, zh);
  assert.equal(merged.kept, 'Only English');
  assert.equal(merged.title, '你好，{name}');
  // The plural group is absent in zh, so its English forms are chosen with English rules (not "1 days").
  assert.deepEqual(englishPlurals(en, zh), ['lead.days']);
  assert.equal(merged.lead[`days_${pluralCategory('en', 1)}`], '{count} day');
  assert.equal(pluralCategory('zh', 1), 'other');
  // Once the language writes the group, only its own forms remain.
  assert.deepEqual(overlay(en, { lead: { days_other: '{count} 天' } }).lead, { days_other: '{count} 天' });
  assert.deepEqual(englishPlurals(en, { lead: { days_other: '{count} 天' } }), []);
});

test('i18n: tr() — every non-English language returns its own text or else English', () => {
  const leaves = (dict, prefix = '', out = []) => {
    for (const [key, value] of Object.entries(dict || {})) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) leaves(value, path, out);
      else if (typeof value === 'string' && !/_(zero|one|two|few|many|other)$/.test(key)) out.push(path);
    }
    return out;
  };
  const at = (dict, path) => path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), dict);
  const keys = leaves(RAW.en);
  assert.ok(keys.length > 0);
  for (const lang of SUPPORTED.filter((code) => code !== 'en')) {
    for (const key of keys) {
      const own = at(RAW[lang], key);
      assert.equal(tr(lang, key), typeof own === 'string' ? own : at(RAW.en, key), `${lang}: ${key}`);
    }
    // Plural groups the language has not written yet: English forms with English rules.
    for (const group of englishPlurals(RAW.en, RAW[lang])) {
      const one = at(RAW.en, `${group}_one`);
      if (typeof one === 'string') assert.equal(tr(lang, group, { count: 1 }), one.replace('{count}', '1'), `${lang}: ${group}`);
    }
  }
});

test('i18n: overlay — plural groups are atomic, lists merge by index', () => {
  const en = { files_one: '{count} file', files_other: '{count} files', title: 'T', list: ['a', 'b'] };
  assert.deepEqual(overlay(en, { files_one: 'файл', files_few: 'файла' }), { files_one: 'файл', files_few: 'файла', title: 'T', list: ['a', 'b'] });
  assert.deepEqual(overlay(en, { files: '个文件', list: ['甲'] }), { files: '个文件', title: 'T', list: ['甲', 'b'] });
  assert.deepEqual(overlay(en, {}), en);
  assert.deepEqual(englishPlurals({ a: en }, { a: {} }), ['a.files']);
  assert.deepEqual(englishPlurals({ a: en }, { a: { files: 'x' } }), []);
});

test('i18n: compareTranslation finds gaps, extra keys, placeholders and plural forms', () => {
  const en = { a: 'Hello {name}', b: { c: 'x' }, n_one: '{count} item', n_other: '{count} items', list: ['one', 'two'] };
  const ru = { a: 'Привет {who}', b: { c: 'x', stale: 'y' }, n_one: '{count} штука', list: ['раз'] };
  const report = compareTranslation(en, ru, { categories: pluralCategories('ru') });
  assert.equal(report.total, 5);
  assert.deepEqual(report.missing, ['list.1']);
  assert.deepEqual(report.extra, ['b.stale']);
  assert.deepEqual(report.placeholders, ['a: {who}']);
  assert.deepEqual(report.lostPlaceholders, ['a: {name}']);
  assert.equal(report.plurals.length, 1);
  assert.match(report.plurals[0], /n_few, n_many, n_other/);
  assert.equal(writtenErrors(report).length, 3);
  const empty = compareTranslation(en, {}, { categories: ['other'] });
  assert.equal(coverageOf(empty), 0);
  assert.equal(writtenErrors(empty).length, 0);
});

test('i18n: server dictionaries — English and Russian complete and equal-keyed, others report coverage', (t) => {
  for (const lang of SUPPORTED.filter((code) => code !== 'en')) {
    const report = compareTranslation(RAW.en, RAW[lang], { categories: pluralCategories(lang) });
    const errors = writtenErrors(report);
    assert.deepEqual(errors, [], `${lang}: ${errors.join('; ')}`);
    if (lang === 'ru') assert.deepEqual(report.missing, [], `ru is missing: ${report.missing.join(', ')}`);
    t.diagnostic(`backend ${lang}: ${(coverageOf(report) * 100).toFixed(1)}% (${report.translated}/${report.total})`);
  }
});

test('i18n: interface dictionaries and help — Russian complete, nobody writes mistakes', async (t) => {
  const { dictionaries, articleIds, readArticle } = await import('../../frontend/scripts/i18n-node.mjs');
  for (const lang of SUPPORTED.filter((code) => code !== 'en')) {
    const report = compareTranslation(dictionaries.en, dictionaries[lang], { categories: pluralCategories(lang) });
    assert.deepEqual(writtenErrors(report), [], lang);
    if (lang === 'ru') assert.deepEqual(report.missing, [], 'ru interface');
    t.diagnostic(`interface ${lang}: ${(coverageOf(report) * 100).toFixed(1)}%`);
  }
  for (const kind of ['content', 'admin']) {
    for (const id of articleIds(kind)) {
      const report = compareTranslation(await readArticle(kind, 'en', id), await readArticle(kind, 'ru', id), { categories: pluralCategories('ru'), structural: ['id', 'icon', 'related', 'more'] });
      assert.deepEqual([...report.missing, ...writtenErrors(report)], [], `help/${kind}/ru/${id}.js`);
      for (const lang of ['ky', 'tr', 'zh']) assert.notEqual(await readArticle(kind, lang, id), null, `help/${kind}/${lang}/${id}.js exists`);
    }
  }
});

test('i18n: shipped bundles are complete — a language lacking a text shows English', async () => {
  const { buildDictionary } = await import('../../frontend/scripts/i18n-node.mjs');
  const ky = await buildDictionary('ky');
  const en = await buildDictionary('en');
  assert.equal(ky.common.save, 'Сактоо');
  assert.equal(compareTranslation(en, ky, { categories: ['one', 'other'] }).missing.length, 0);
  const ru = await buildDictionary('ru');
  assert.equal(ru.common.save, 'Сохранить');
});
