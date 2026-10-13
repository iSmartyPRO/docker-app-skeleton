import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRM_DEFAULTS, crmFieldKey, resolveModules, sanitizeCrm, sanitizeModules } from '../modules/catalog.js';
import { buildFilter, cleanFilter, orderBy, pageOf } from '../modules/crm/filters.js';
import { visibleSql } from '../modules/crm/access.js';
import { normalizeStages } from '../modules/crm/pipelines.js';
import { Params, activityBucket, bucketBounds, counterBucket, csvCell, idList, likePattern, midRank, money, parseAmount, parseDateOnly, sumsByCurrency, zonedMidnight } from '../modules/crm/util.js';

const ctx = (extra = {}) => ({ userId: 7, seesAll: true, limits: null, settings: CRM_DEFAULTS, ...extra });
const FIELDS = [
  { key: 'region', label: 'Регион', type: 'select', options: ['Бишкек', 'Ош'] },
  { key: 'tags', label: 'Теги', type: 'multiselect', options: ['vip', 'new'] },
  { key: 'budget', label: 'Бюджет', type: 'money', options: [] },
  { key: 'visit', label: 'Визит', type: 'date', options: [] },
  { key: 'manager', label: 'Менеджер', type: 'user', options: [] },
  { key: 'note', label: 'Заметка', type: 'text', options: [] },
];

test('module catalog: crm defaults and strict sanitize', () => {
  const fresh = resolveModules();
  assert.equal(fresh.crm.enabled, true);
  assert.equal(fresh.crm.settings.currency, 'KGS');
  assert.equal(fresh.crm.settings.visibility, 'all');

  const next = sanitizeCrm(CRM_DEFAULTS, {
    currencies: ['usd', 'EUR', 'bad1', 'EUR', 'X'],
    currency: 'RUB',
    visibility: 'everyone',
    sources: ['Сайт', '  ', 'Сайт', '<b>x</b>'],
    lostReasons: 'nope',
    sections: [{ title: 'Логистика' }, { key: 'extra', title: 'Доп' }, { key: 'extra', title: 'dup' }],
    fields: [
      { label: 'Регион', type: 'select', options: ['Бишкек', 'Бишкек', ''], section: 'nowhere', listColumn: true },
      { label: 'Region code', type: 'evil' },
      { key: 'title', label: 'Clash with a built-in' },
      { key: 'BadKey!', label: 'Срок поставки', type: 'date', required: 'yes' },
      { label: '' },
    ],
    builtinSections: { source: 'extra', title: 'nowhere', hacked: 'extra' },
    activityReminders: 'no',
  });
  assert.deepEqual(next.currencies, ['USD', 'EUR']);
  assert.equal(next.currency, 'USD', 'a currency outside the list falls back to the first one');
  assert.equal(next.visibility, 'all', 'unknown visibility ignored');
  assert.deepEqual(next.sources, ['Сайт', 'bx/b']);
  assert.deepEqual(next.lostReasons, CRM_DEFAULTS.lostReasons, 'non-arrays ignored');
  assert.equal(next.sections[0].key, 'about', "'about' always exists");
  assert.ok(/^s_[0-9a-z]+$/.test(next.sections[1].key), 'non-latin section titles get s_<base36>');
  assert.equal(next.sections.filter((section) => section.key === 'extra').length, 1);
  assert.equal(next.fields.length, 3);
  const [region, code, deadline] = next.fields;
  assert.ok(/^f_[0-9a-z]+$/.test(region.key), 'non-latin labels get f_<base36>');
  assert.deepEqual(region.options, ['Бишкек']);
  assert.equal(region.section, 'about');
  assert.equal(region.listColumn, true);
  assert.equal(code.key, 'region_code');
  assert.equal(code.type, 'text');
  assert.equal(deadline.required, false, 'only true is true');
  assert.deepEqual(next.builtinSections, { source: 'extra' });
  assert.equal(next.activityReminders, true);
  assert.equal(crmFieldKey({ label: 'Регион' }), crmFieldKey({ label: 'Регион' }), 'keys are stable');

  const many = sanitizeCrm(CRM_DEFAULTS, { fields: Array.from({ length: 100 }, (_, i) => ({ key: `f${i}`, label: `F${i}` })), sections: Array.from({ length: 20 }, (_, i) => ({ key: `s${i}`, title: `S${i}` })) });
  assert.equal(many.fields.length, 80);
  assert.equal(many.sections.length, 12);

  const viaModules = sanitizeModules(resolveModules(), { crm: { enabled: false, settings: { visibility: 'own' } } });
  assert.equal(viaModules.crm.enabled, false);
  assert.equal(viaModules.crm.settings.visibility, 'own');
});

test('filter builder binds every value as a parameter', () => {
  const p = new Params();
  const evil = "x'; DROP TABLE crm_deals; --";
  const where = buildFilter(
    ctx(),
    {
      q: evil,
      pipeline: '3',
      stages: '1,2,abc,-4',
      owners: 'me,5',
      client: 'c:12',
      amountMin: '1 000,50',
      amountMax: 'zzz',
      createdFrom: '2026-01-01',
      createdTo: '2026-02-31',
      source: 'Сайт|Звонок',
      cf_region: 'Ош',
      cf_tags: 'vip',
      cf_budget: '1500',
      cf_visit: '2026-10-01..2026-10-31',
      cf_manager: 'me',
      cf_note: evil,
      cf_unknown: 'x',
      'cf_bad key': 'x',
    },
    { fields: FIELDS },
    p
  );
  const sql = where.join(' AND ');
  assert.ok(!sql.includes('DROP TABLE'), 'user text never reaches the SQL');
  assert.ok(!sql.includes('Ош') && !sql.includes('region'), 'custom keys and values are parameters');
  assert.ok(sql.includes('d.deleted_at IS NULL'));
  assert.ok(p.values.includes(likePattern(evil)), 'LIKE wildcards in the text are escaped');
  assert.ok(likePattern('50%_off').includes('\\%'));
  assert.ok(p.values.includes(3));
  assert.deepEqual(p.values.find((value) => Array.isArray(value) && value.includes(1)), [1, 2]);
  assert.deepEqual(p.values.find((value) => Array.isArray(value) && value.includes(5)), [7, 5], "'me' is the person");
  assert.ok(p.values.includes(12));
  assert.ok(p.values.includes(1000.5));
  assert.ok(!sql.includes('d.amount <='), 'an invalid amount is ignored');
  assert.ok(p.values.includes('2026-01-01') && !p.values.includes('2026-02-31'), 'impossible dates are ignored');
  assert.ok(sql.includes("s.kind = $"), 'group defaults to open');
  assert.ok(p.values.includes('open'));
  assert.ok(p.values.includes('region') && p.values.includes('tags') && p.values.includes('visit'));
  assert.ok(!p.values.includes('unknown'), 'unconfigured custom fields are ignored');
  // Placeholders are numbered 1…n without gaps.
  const used = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  assert.equal(Math.max(...used), p.values.length);
});

test('filter builder: groups, activity states, visibility, trash', () => {
  const p = new Params();
  const bounds = bucketBounds(new Date('2026-10-13T06:00:00Z'), 'Asia/Bishkek');
  const where = buildFilter(ctx({ seesAll: false, limits: { crm_pipelines: new Set([1, 2]) } }), { group: 'all', activity: 'today' }, { bounds }, p);
  const sql = where.join(' AND ');
  assert.ok(!sql.includes('s.kind'), "group 'all' has no stage condition");
  assert.ok(sql.includes('d.pipeline_id = ANY('), 'token limits narrow pipelines');
  assert.ok(sql.includes('crm_deal_watchers'), "'own' visibility: owner, creator or watcher");
  assert.ok(sql.includes('NOT EXISTS'), 'today excludes overdue deals');
  assert.ok(p.values.some((value) => value instanceof Date));

  const trash = new Params();
  assert.ok(buildFilter(ctx(), {}, { trash: true, ignore: ['group'] }, trash).join(' ').includes('d.deleted_at IS NOT NULL'));
  assert.equal(trash.values.length, 0);

  const bad = new Params();
  assert.ok(buildFilter(ctx(), { client: 'x:1' }, {}, bad).includes('FALSE'));
  assert.deepEqual(visibleSql(ctx(), new Params()), [], 'nothing to add for those who see all');
});

test('sorting comes from a whitelist, pages are clamped', () => {
  assert.equal(orderBy('amount', 'asc'), 'd.amount ASC NULLS LAST, d.id ASC');
  assert.equal(orderBy('1; DROP TABLE x', 'sideways'), 'd.updated_at DESC NULLS LAST, d.id DESC');
  assert.equal(orderBy('title'), 'LOWER(d.title) ASC NULLS LAST, d.id ASC');
  assert.deepEqual(pageOf({ page: '-3', pageSize: '1000' }), { page: 1, pageSize: 100, offset: 0 });
  assert.deepEqual(pageOf({ page: '3', pageSize: '50' }), { page: 3, pageSize: 50, offset: 100 });
  assert.deepEqual(pageOf({}), { page: 1, pageSize: 20, offset: 0 });
});

test('presets keep only known filter keys', () => {
  assert.deepEqual(cleanFilter({ q: 'abc', owners: ['me', 3], cf_region: 'Ош', evil: 'x', 'cf_Bad': 'y', group: '' }), { q: 'abc', owners: 'me,3', cf_region: 'Ош' });
  assert.deepEqual(cleanFilter('nope'), {});
});

test('rank midpoint and re-spread signal', () => {
  assert.equal(midRank(1024, 2048), 1536);
  assert.equal(midRank(null, 1024), 0);
  assert.equal(midRank(1024, null), 2048);
  assert.equal(midRank(null, null), 1024);
  assert.equal(midRank(5, 5 + 1e-9), null, 'an exhausted gap asks for a re-spread');
  // Repeated insertion at the same place halves the gap until it is exhausted.
  let low = 1024;
  const high = 2048;
  let steps = 0;
  for (;;) {
    const next = midRank(low, high);
    if (next === null) break;
    assert.ok(next > low && next < high);
    low = next;
    steps += 1;
  }
  assert.ok(steps > 20 && steps < 60);
});

test('pipeline stages: open first, then exactly one won and one lost', () => {
  const stages = normalizeStages([
    { name: 'Успех', kind: 'won' },
    { name: 'Новая' },
    { name: 'Провал', kind: 'lost', color: '#123456' },
    { name: 'КП', kind: 'open', id: '5' },
  ]);
  assert.deepEqual(stages.map((stage) => stage.kind), ['open', 'open', 'won', 'lost']);
  assert.equal(stages[1].id, 5);
  assert.equal(stages[3].color, '#123456');
  assert.throws(() => normalizeStages([{ name: 'A' }, { name: 'B', kind: 'won' }]), /exactly one/);
  assert.throws(() => normalizeStages([{ name: 'W', kind: 'won' }, { name: 'L', kind: 'lost' }]), /open stage/);
});

test('CSV cells: formula guard, quoting, numbers', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('+7 999'), "'+7 999");
  assert.equal(csvCell('-5'), "'-5");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell(-5), '-5', 'numbers stay numbers');
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('ООО «Ромашка»'), 'ООО «Ромашка»');
});

test('activity buckets by the nearest open activity', () => {
  // Tuesday 2026-10-13 12:00 in Bishkek (UTC+6).
  const now = new Date('2026-10-13T06:00:00Z');
  const bounds = bucketBounds(now, 'Asia/Bishkek');
  assert.equal(bounds.startToday.toISOString(), '2026-10-12T18:00:00.000Z');
  assert.equal(bounds.endToday.toISOString(), '2026-10-13T18:00:00.000Z');
  assert.equal(bounds.endWeek.toISOString(), '2026-10-18T18:00:00.000Z', 'the week ends on Sunday night');
  assert.equal(bounds.endNextWeek.toISOString(), '2026-10-25T18:00:00.000Z');
  const at = (iso) => new Date(iso);
  assert.equal(activityBucket(null, 0, bounds), 'none');
  assert.equal(activityBucket(null, 2, bounds), 'later', 'open activities without a date');
  assert.equal(activityBucket(at('2026-10-13T05:59:00Z'), 1, bounds), 'overdue');
  assert.equal(activityBucket(at('2026-10-13T17:59:00Z'), 1, bounds), 'today');
  assert.equal(activityBucket(at('2026-10-13T18:00:00Z'), 1, bounds), 'week');
  assert.equal(activityBucket(at('2026-10-20T10:00:00Z'), 1, bounds), 'nextWeek');
  assert.equal(activityBucket(at('2026-11-20T10:00:00Z'), 1, bounds), 'later');
  assert.equal(counterBucket(at('2026-10-20T10:00:00Z'), 1, bounds), 'planned');
  assert.equal(counterBucket(at('2026-10-13T07:00:00Z'), 1, bounds), 'today');

  // Sunday: "this week" is empty, next week starts tomorrow.
  const sunday = bucketBounds(new Date('2026-10-18T06:00:00Z'), 'Asia/Bishkek');
  assert.equal(sunday.endWeek.getTime(), sunday.endToday.getTime());
  // A zone with daylight saving.
  assert.equal(zonedMidnight(2026, 3, 29, 'Europe/Berlin').toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(zonedMidnight(2026, 3, 30, 'Europe/Berlin').toISOString(), '2026-03-29T22:00:00.000Z');
});

test('money, amounts, dates, id lists', () => {
  assert.equal(money('1234.567'), 1234.57);
  assert.equal(money(null), 0);
  assert.equal(parseAmount('1 500,50'), 1500.5);
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount(-1), null);
  assert.equal(parseAmount('abc'), null);
  assert.deepEqual(sumsByCurrency([{ currency: 'KGS', sum: '100.10' }, { currency: 'USD', sum: '5' }, { currency: 'KGS', sum: '0.2' }]), { KGS: 100.3, USD: 5 });
  assert.equal(parseDateOnly('2026-02-29'), null);
  assert.equal(parseDateOnly('2028-02-29'), '2028-02-29');
  assert.deepEqual(idList('1, 2,2,x,me,0,-1', 9), [1, 2, 9]);
  assert.deepEqual(idList(['3', 4]), [3, 4]);
});

test('every filter variant numbers its placeholders without gaps', () => {
  const bounds = bucketBounds(new Date('2026-10-13T06:00:00Z'), 'UTC');
  const variants = [
    {},
    { activity: 'overdue' },
    { activity: 'today' },
    { activity: 'planned' },
    { activity: 'none' },
    { owners: 'none' },
    { owners: 'me,none' },
    { cf_visit: '..2026-10-31' },
    { cf_budget: 'x' },
    { pipeline: 'all', group: 'won' },
  ];
  for (const input of variants) {
    for (const own of [true, false]) {
      const p = new Params();
      const sql = buildFilter(ctx({ seesAll: own }), input, { fields: FIELDS, bounds }, p).join(' AND ');
      const used = new Set([...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])));
      assert.equal(used.size, p.values.length, `${JSON.stringify(input)}: every parameter is used`);
      for (let i = 1; i <= p.values.length; i += 1) assert.ok(used.has(i), `${JSON.stringify(input)}: $${i} used`);
    }
  }
});
