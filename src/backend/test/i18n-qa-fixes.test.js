import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tr } from '../services/i18n/index.js';

/*
 * Five-language QA fixes: the browser Intl fallback for Kyrgyz (Chromium has
 * no ky data; Node has, so the fallback is compared with Node's own CLDR
 * output), server texts for codes that used to reach CSV exports raw, and
 * activity-log texts by code. Database-free.
 */

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const fallback = await import('../../frontend/src/i18n/intl-fallback.js');
const ky = { lang: 'ky', tag: 'ky-KG', data: fallback.FALLBACKS.ky };

test('intl fallback: Kyrgyz dates match CLDR (Node) for the layouts the portal uses', () => {
  const DTF = fallback.makeDateTimeFormat(Intl.DateTimeFormat);
  const moments = [new Date(Date.UTC(2026, 9, 17, 14, 7, 9)), new Date(Date.UTC(2026, 0, 1, 3, 0)), new Date(Date.UTC(2025, 4, 31, 23, 59))];
  const layouts = [
    { dateStyle: 'full' },
    { dateStyle: 'long' },
    { dateStyle: 'medium' },
    { weekday: 'long', day: 'numeric', month: 'long' },
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    { weekday: 'short', day: 'numeric', month: 'short' },
    { day: 'numeric', month: 'short' },
    { day: 'numeric', month: 'long' },
    { month: 'long', year: 'numeric' },
    { month: 'short', year: 'numeric' },
    { month: 'long' },
    { month: 'short' },
    { weekday: 'long' },
    { weekday: 'short' },
    { weekday: 'narrow' },
    { dateStyle: 'medium', timeStyle: 'short' },
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
    { hour: '2-digit', minute: '2-digit' },
    { year: 'numeric' },
  ];
  for (const date of moments)
    for (const options of layouts) {
      const opts = { ...options, timeZone: 'Asia/Bishkek' };
      assert.equal(new DTF(ky, opts).format(date), new Intl.DateTimeFormat('ky-KG', opts).format(date), JSON.stringify(options));
    }
  // Numeric dates use the related locale (dd.mm.yyyy), not English.
  assert.equal(new DTF(ky, { timeZone: 'UTC' }).format(moments[0]), '17.10.2026');
  assert.equal(new DTF(ky, { timeZone: 'UTC' }).resolvedOptions().locale, 'ky-KG');
  assert.throws(() => new DTF(ky, {}).format(new Date(NaN)), RangeError);
});

test('intl fallback: Kyrgyz relative times, numbers and lists', () => {
  const RTF = fallback.makeRelativeTimeFormat(Intl.NumberFormat);
  for (const numeric of ['auto', 'always'])
    for (const [value, unit] of [[-33, 'minute'], [-20, 'hours'], [-1, 'day'], [0, 'day'], [1, 'day'], [2, 'day'], [-2, 'week'], [-1, 'month'], [-1, 'year'], [3, 'year'], [-1234, 'hour'], [5, 'second']]) {
      assert.equal(new RTF(ky, { numeric }).format(value, unit), new Intl.RelativeTimeFormat('ky-KG', { numeric }).format(value, unit), `${numeric} ${value} ${unit}`);
    }
  const NF = fallback.makeNumberFormat(Intl.NumberFormat);
  for (const [value, options] of [[1234567.5, {}], [3.9, { maximumFractionDigits: 1 }], [1500, { style: 'currency', currency: 'KGS' }], [15000, { notation: 'compact' }], [0.15, { style: 'percent' }]])
    assert.equal(new NF(ky, options).format(value), new Intl.NumberFormat('ky-KG', options).format(value), JSON.stringify(options));
  const LF = fallback.makeListFormat(Intl.ListFormat);
  assert.equal(new LF(ky).format(['a', 'b', 'c']), new Intl.ListFormat('ky-KG').format(['a', 'b', 'c']));
  assert.equal(new LF(ky, { type: 'disjunction' }).format(['a', 'b']), new Intl.ListFormat('ky-KG', { type: 'disjunction' }).format(['a', 'b']));
});

test('intl fallback: wraps only what the browser lacks, and only for the fallback language', () => {
  // A fake Intl that "knows" everything but Kyrgyz, like Chromium.
  const without = (Native) => {
    function Fake(locales, options) {
      return new Native(locales, options);
    }
    Fake.prototype = Native.prototype;
    Fake.supportedLocalesOf = (list) => Native.supportedLocalesOf(list).filter((tag) => !/^ky\b/i.test(tag));
    return Fake;
  };
  const g = {
    Intl: { DateTimeFormat: without(Intl.DateTimeFormat), NumberFormat: without(Intl.NumberFormat), RelativeTimeFormat: without(Intl.RelativeTimeFormat), ListFormat: without(Intl.ListFormat) },
    Date: class extends Date {},
    Number: function N() {},
  };
  g.Number.prototype = { toLocaleString() { return 'native'; } };
  g.Date.prototype.toLocaleDateString = function () { return 'native'; };
  g.Date.prototype.toLocaleTimeString = function () { return 'native'; };
  g.Date.prototype.toLocaleString = function () { return 'native'; };
  assert.equal(fallback.installIntlFallbacks(g), true);
  assert.equal(fallback.installIntlFallbacks(g), false, 'idempotent');
  const date = new Date(Date.UTC(2026, 9, 17, 9, 0));
  assert.equal(new g.Intl.DateTimeFormat('ky-KG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date), '17-октябрь, ишемби');
  assert.equal(g.Intl.DateTimeFormat('ky', { month: 'long', timeZone: 'UTC' }).format(date), 'Октябрь');
  assert.equal(new g.Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(date), 'октябрь', 'other languages untouched');
  assert.equal(new g.Intl.DateTimeFormat(['ru-RU', 'ky-KG'], { month: 'long', timeZone: 'UTC' }).format(date), 'октябрь', 'first supported tag wins');
  assert.equal(new g.Intl.RelativeTimeFormat('ky-KG', { numeric: 'auto' }).format(-1, 'day'), 'кечээ');
  assert.equal(new g.Intl.NumberFormat('ky-KG').format(3.5), '3,5');
  assert.equal(g.Date.prototype.toLocaleDateString.call(date, 'ky-KG', { day: 'numeric', month: 'long', timeZone: 'UTC' }), '17-октябрь');
  assert.equal(g.Date.prototype.toLocaleDateString.call(date, 'en-GB'), 'native');
  assert.equal(g.Number.prototype.toLocaleString.call(1234.5, 'ky-KG'), new Intl.NumberFormat('ky-KG').format(1234.5));
  assert.equal(g.Number.prototype.toLocaleString.call(1234.5, 'tr-TR'), 'native');
  assert.equal(fallback.fallbackFor(Intl.DateTimeFormat, 'ky-KG'), null, 'Node has Kyrgyz: nothing to fill in');
});

test('csv exports: urgency, tool states and finishing codes have texts in every language', () => {
  for (const lang of ['en', 'ru', 'ky', 'tr', 'zh']) {
    for (const key of ['critical', 'urgent', 'normal']) assert.notEqual(tr(lang, `procurement.urgency.${key}`), `procurement.urgency.${key}`, `${lang} urgency ${key}`);
    for (const key of ['ok', 'repair', 'written_off', 'lost']) assert.notEqual(tr(lang, `warehouse.toolState.${key}`), `warehouse.toolState.${key}`, `${lang} tool ${key}`);
    for (const key of ['pso', 'rough', 'whitebox', 'turnkey', 'furnished']) assert.notEqual(tr(lang, `masterplan.finishing.${key}`), `masterplan.finishing.${key}`, `${lang} finishing ${key}`);
  }
  assert.equal(tr('tr', 'procurement.urgency.critical'), 'Kritik');
  assert.match(read('../modules/procurement/reports.js'), /urgency: \{ value: \(item, ctx\) => urgencyText\(item\.urgency, ctx\) \}/);
  assert.match(read('../modules/warehouse/reports.js'), /toolState\(lang, tool\.state\)/);
  assert.match(read('../modules/masterplan/units.js'), /finishingName\(n\.unit\.finishing, locale\)/);
});

test('activity log: event codes have a text in every language with the same placeholders', async () => {
  const codes = new Set();
  for (const file of ['../routes/auth.routes.js', '../routes/admin.routes.js', '../middleware/ipGuard.js', '../services/signin.js', '../services/crypto.js', '../modules/employees/accounts.js']) {
    for (const match of read(file).matchAll(/\bcode: '([a-z_]+)'|'(employee_(?:created|linked|unlinked|blocked|unblocked))'|limited\('[^']+', '([a-z_]+)'\)|`signin_\$\{kind\}`/g)) {
      const code = match[1] || match[2] || match[3];
      if (code) codes.add(code);
    }
  }
  for (const kind of ['login_failed', 'account_disabled', 'account_blocked']) codes.add(`signin_${kind}`);
  codes.add('signin_failed');
  codes.delete('RATE_LIMITED');
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  const en = (await import('../../frontend/src/locales/en/activity.js')).default.detail;
  for (const lang of ['ru', 'ky', 'tr', 'zh']) {
    const dict = (await import(`../../frontend/src/locales/${lang}/activity.js`)).default.detail;
    for (const code of codes) {
      assert.ok(en[code], `en activity.detail.${code}`);
      assert.ok(dict[code], `${lang} activity.detail.${code}`);
      assert.equal(placeholders(dict[code]), placeholders(en[code]), `${lang} ${code}`);
    }
  }
  const security = read('../services/security.js');
  assert.match(security, /ADD COLUMN IF NOT EXISTS detail_code VARCHAR\(48\), ADD COLUMN IF NOT EXISTS detail_params JSONB/);
  assert.match(security, /SELECT id, kind, severity, username, ip, detail, detail_code, detail_params, created_at/);
});
