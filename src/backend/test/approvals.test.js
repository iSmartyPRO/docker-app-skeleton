import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanRoute,
  conditionHolds,
  conditionValues,
  decisionText,
  planStages,
  restartIndex,
  slaState,
  stageClosed,
  stageTimes,
  urgencyRank,
} from '../modules/approvals/logic.js';
import { APPROVALS_DEFAULTS, resolveModules, sanitizeApprovals, sanitizeModules } from '../modules/catalog.js';
import { compareInboxItems, normalizeInboxItem } from '../services/inbox.js';
import { approvalMessage } from '../modules/approvals/messages.js';

const FIELDS = [
  { key: 'amount', type: 'money' },
  { key: 'category', type: 'select' },
  { key: 'project', type: 'ref' },
  { key: 'legalEntity', type: 'ref' },
];

test('approvals: routes are cleaned (approvers, modes, conditions on known fields only)', () => {
  const route = cleanRoute(
    {
      name: ' Закупки <b> ',
      stages: [
        { name: 'Руководитель', mode: 'any', approvers: [{ kind: 'role', id: 3 }, { kind: 'role', id: 3 }, { kind: 'bogus', id: 1 }], conditions: [] },
        { name: 'Без согласующих', approvers: [] },
        {
          name: 'Финдир',
          approvers: [{ kind: 'user', id: '7' }],
          conditions: [
            { field: 'amount', op: 'gte', value: '5000', currency: 'usd' },
            { field: 'unknown', op: 'eq', value: 1 },
            { field: 'category', op: 'in', value: ['Оборудование', ''] },
          ],
        },
      ],
      restartFrom: 'current',
      escalateTo: [{ kind: 'group', id: 2 }, { kind: 'user', id: -1 }],
    },
    FIELDS
  );
  assert.equal(route.name, 'Закупки b');
  assert.equal(route.stages.length, 2, 'a stage without approvers is dropped');
  assert.equal(route.stages[0].mode, 'any');
  assert.deepEqual(route.stages[0].approvers, [{ kind: 'role', id: 3 }]);
  assert.equal(route.stages[1].mode, 'all');
  assert.deepEqual(route.stages[1].conditions, [
    { field: 'amount', op: 'gte', value: 5000, currency: 'USD' },
    { field: 'category', op: 'in', value: ['Оборудование'] },
  ]);
  assert.equal(route.restartFrom, 'current');
  assert.deepEqual(route.escalateTo, [{ kind: 'group', id: 2 }]);
  assert.ok(route.stages.every((stage) => /^[a-z0-9_-]+$/i.test(stage.id)));
});

test('approvals: conditions on amount, category, project and legal entity', () => {
  const values = { amount: 5000, currency: 'USD', category: 'Оборудование', project: 12, legalEntity: 'ОсОО Альфа' };
  assert.ok(conditionHolds({ field: 'amount', op: 'gte', value: 5000 }, values));
  assert.ok(!conditionHolds({ field: 'amount', op: 'gt', value: 5000 }, values));
  assert.ok(conditionHolds({ field: 'amount', op: 'gte', value: 5000, currency: 'USD' }, values));
  assert.ok(!conditionHolds({ field: 'amount', op: 'gte', value: 100, currency: 'KGS' }, values), 'a threshold in another currency does not apply');
  assert.ok(conditionHolds({ field: 'category', op: 'eq', value: 'оборудование' }, values), 'case-insensitive');
  assert.ok(conditionHolds({ field: 'category', op: 'nin', value: ['Услуги'] }, values));
  assert.ok(conditionHolds({ field: 'project', op: 'in', value: [12, 13] }, values));
  assert.ok(conditionHolds({ field: 'project', op: 'eq', value: '12' }, values));
  assert.ok(!conditionHolds({ field: 'legalEntity', op: 'neq', value: 'ОсОО Альфа' }, values));
  assert.ok(conditionHolds({ field: 'contract', op: 'empty' }, values));
  assert.ok(!conditionHolds({ field: 'amount', op: 'lt', value: 10 }, {}), 'a missing number never passes a threshold');
});

test('approvals: planning skips stages whose conditions fail', () => {
  const route = {
    stages: [
      { id: 'head', name: 'Руководитель', approvers: [{ kind: 'role', id: 1 }], conditions: [] },
      { id: 'cfo', name: 'Финдир', approvers: [{ kind: 'user', id: 2 }], conditions: [{ field: 'amount', op: 'gte', value: 5000 }] },
      { id: 'it', name: 'ИТ', approvers: [{ kind: 'group', id: 3 }], conditions: [{ field: 'category', op: 'eq', value: 'Оборудование' }] },
    ],
  };
  const small = planStages(route, conditionValues({ amount: 300, fields: { category: 'Услуги' } }));
  assert.deepEqual(small.stages.map((s) => s.id), ['head']);
  assert.deepEqual(small.skipped.map((s) => s.id), ['cfo', 'it']);
  const big = planStages(route, conditionValues({ amount: 5000, currency: 'USD', fields: { category: 'Оборудование' } }));
  assert.deepEqual(big.stages.map((s) => s.id), ['head', 'cfo', 'it']);
});

test('approvals: stage closing for all / any', () => {
  const seats = (...decisions) => decisions.map((decision) => ({ decision }));
  assert.ok(!stageClosed('all', seats('approved', null)));
  assert.ok(stageClosed('all', seats('approved', 'approved')));
  assert.ok(stageClosed('any', seats(null, 'approved')));
  assert.ok(!stageClosed('any', seats(null, null)));
});

test('approvals: restart from the first or the current stage', () => {
  const stages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(restartIndex('first', stages, 'b'), 0);
  assert.equal(restartIndex('current', stages, 'b'), 1);
  assert.equal(restartIndex('current', stages, 'gone'), 0, 'a stage that no longer applies starts over');
});

test('approvals: SLA from urgency levels, reminder at 75 %', () => {
  const settings = { ...APPROVALS_DEFAULTS };
  const start = new Date('2026-10-13T08:00:00Z');
  const critical = stageTimes(settings, 'critical', start);
  assert.equal(critical.hours, 4);
  assert.equal(critical.dueAt.toISOString(), '2026-10-13T12:00:00.000Z');
  assert.equal(critical.remindAt.toISOString(), '2026-10-13T11:00:00.000Z');
  assert.equal(stageTimes(settings, 'unknown', start).hours, 72, 'unknown urgency = the default level');
  assert.equal(slaState('2026-10-13T12:00:00Z', 24, Date.parse('2026-10-13T12:00:01Z')), 'overdue');
  assert.equal(slaState('2026-10-14T00:00:00Z', 24, Date.parse('2026-10-13T12:00:00Z')), 'soon');
  assert.equal(slaState('2026-10-20T00:00:00Z', 24, Date.parse('2026-10-13T12:00:00Z')), 'ok');
  assert.equal(slaState(null), 'none');
  assert.equal(urgencyRank(settings, 'critical'), 0);
  assert.equal(urgencyRank(settings, 'normal'), 2);
});

test('approvals: comment is required to reject, return and ask', () => {
  for (const action of ['reject', 'return', 'question']) assert.throws(() => decisionText(action, '  '), (err) => err.code === 'COMMENT_REQUIRED');
  assert.equal(decisionText('approve', ''), '');
});

test('approvals: settings are sanitized; the module cannot be switched off', () => {
  const next = sanitizeApprovals(APPROVALS_DEFAULTS, {
    urgencies: [
      { key: 'critical', label: '', color: '#ff0000', hours: 2 },
      { key: 'vip', label: '', hours: 1 },
      { key: 'Low Prio', label: 'Низкая', color: 'red', hours: 999999 },
    ],
    defaultUrgency: 'missing',
    reminderPercent: 200,
    soonHours: 0,
  });
  assert.deepEqual(next.urgencies.map((u) => u.key), ['critical', 'u2']);
  assert.equal(next.urgencies[0].color, '#FF0000');
  assert.equal(next.urgencies[1].hours, 24 * 90);
  assert.equal(next.defaultUrgency, 'u2');
  assert.equal(next.reminderPercent, 95);
  assert.equal(next.soonHours, 1);
  const modules = sanitizeModules(resolveModules({}), { approvals: { enabled: false } });
  assert.equal(modules.approvals.enabled, true);
  assert.equal(resolveModules({ approvals: { enabled: false } }).approvals.enabled, true);
});

test('inbox: items are normalised and sorted (overdue, urgency, deadline)', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const raw = [
    { id: 1, title: 'Normal later', urgency: 'normal', dueAt: '2026-10-15T00:00:00Z' },
    { id: 2, title: 'Critical', urgency: 'critical', dueAt: '2026-10-16T00:00:00Z' },
    { id: 3, title: 'Overdue normal', urgency: 'normal', dueAt: '2026-10-12T00:00:00Z' },
    { id: 4, title: 'No deadline', urgency: 'normal' },
    { id: 5, title: 'Normal sooner', urgency: 'normal', dueAt: '2026-10-14T00:00:00Z' },
    { title: 'no id' },
  ];
  const items = raw.map((item) => normalizeInboxItem({ ...item, module: 'tasks', kind: 'acceptance' }, 'tasks.acceptance', now)).filter(Boolean);
  assert.equal(items.length, 5);
  assert.equal(items[0].key, 'tasks.acceptance:1');
  items.sort(compareInboxItems);
  assert.deepEqual(items.map((item) => item.id), [3, 2, 5, 1, 4]);
  assert.equal(items[0].overdue, true);
});

test('approvals: notification texts in both languages', () => {
  const doc = { typeTitle: { ru: 'Заявка на закупку', en: 'Purchase request' }, title: 'Ноутбуки', number: 'ЗК-0001', amount: 5000, currency: 'USD', dueAt: null };
  const ru = approvalMessage('request', { doc, stage: 'Директор' })('ru');
  assert.match(ru.title, /Ждёт вашего согласования: Заявка на закупку ЗК-0001 «Ноутбуки»/);
  assert.match(ru.body, /5\s000 USD/);
  const en = approvalMessage('question', { doc, actor: 'Aida', comment: 'Why?' })('en');
  assert.match(en.title, /Aida asks about Purchase request ЗК-0001 “Ноутбуки”/);
});
