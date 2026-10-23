import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  availableTransitions,
  checkTransition,
  cleanContract,
  cleanRisk,
  dateTransition,
  daysBetween,
  dueReminders,
  formatNumber,
  noticeDeadline,
  prolongTerm,
  statusFromApproval,
} from '../modules/contracts/logic.js';
import { CONTRACT_MESSAGES, contractMessage } from '../modules/contracts/messages.js';
import { translator } from '../services/i18n/index.js';

/** A message builder's texts in both reference languages. */
const both = (build, params) => ({ ru: build(translator('ru'), params), en: build(translator('en'), params) });
import { MODULE_CATALOG, resolveModules } from '../modules/catalog.js';
import { EVENT_CATALOG } from '../api/events.js';
import { NOTIFICATION_EVENTS } from '../services/notificationCatalog.js';
import { sourcePackage } from './helpers/modules.js';

// Contracts is a module package: its catalog entry as an installed package adds it (module.json + settings.js).
await sourcePackage('contracts');

/* Pure rules of the Contracts module (docs/contracts.md). Database tests: contracts.db.test.js. */

const LEGAL = { legal: true, editor: true };
const OWNER = { legal: false, editor: true };
const STRANGER = { legal: false, editor: false };

test('contracts: manual transitions follow the spec and the rights', () => {
  assert.ok(checkTransition('approved', 'signed', LEGAL).ok);
  assert.equal(checkTransition('approved', 'signed', OWNER).code, 'FORBIDDEN');
  assert.equal(checkTransition('draft', 'signed', LEGAL).code, 'BAD_TRANSITION');
  assert.equal(checkTransition('approval', 'approved', LEGAL).code, 'BAD_TRANSITION', 'approval statuses come from the approvals service only');
  assert.ok(checkTransition('active', 'terminated', LEGAL).rule.comment, 'termination needs a reason');
  assert.equal(checkTransition('completed', 'terminated', LEGAL).code, 'BAD_TRANSITION');
  assert.ok(checkTransition('rejected', 'draft', OWNER).ok);
  assert.equal(checkTransition('rejected', 'draft', STRANGER).code, 'FORBIDDEN');
  assert.equal(checkTransition('active', 'nonsense', LEGAL).code, 'BAD_STATUS');
  assert.deepEqual(availableTransitions('expiring', LEGAL).sort(), ['completed', 'terminated']);
  assert.deepEqual(availableTransitions('approved', OWNER), ['draft']);
  assert.deepEqual(availableTransitions('signed', STRANGER), []);
});

test('contracts: the approval process drives the status', () => {
  assert.equal(statusFromApproval('draft', 'pending', 'start'), 'approval');
  assert.equal(statusFromApproval('rejected', 'pending', 'start'), 'approval');
  assert.equal(statusFromApproval('approval', 'question', 'question'), 'question');
  assert.equal(statusFromApproval('question', 'pending', 'answer'), 'approval');
  assert.equal(statusFromApproval('approval', 'approved', 'approve'), 'approved');
  assert.equal(statusFromApproval('approval', 'rejected', 'reject'), 'rejected');
  assert.equal(statusFromApproval('approval', 'returned', 'return'), 'draft');
  assert.equal(statusFromApproval('question', 'withdrawn', 'withdraw'), 'draft');
  assert.throws(() => statusFromApproval('active', 'pending', 'start'), (err) => err.code === 'BAD_TRANSITION');
  assert.throws(() => statusFromApproval('approved', 'pending', 'start'), (err) => err.statusCode === 409);
});

test('contracts: numbers are prefix and four digits', () => {
  assert.equal(formatNumber('ДГ', 1), 'ДГ-0001');
  assert.equal(formatNumber('CTR', 12345), 'CTR-12345');
  assert.equal(formatNumber('', 7), '0007');
});

test('contracts: calendar-day arithmetic', () => {
  assert.equal(daysBetween('2026-10-13', '2026-11-12'), 30);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2027-12-15', 12), '2028-12-15');
  assert.equal(noticeDeadline({ autoRenew: true, endsOn: '2026-12-31', noticeDays: 30 }), '2026-12-01');
  assert.equal(noticeDeadline({ autoRenew: false, endsOn: '2026-12-31', noticeDays: 30 }), null);
});

test('contracts: dates move a contract in force (start, expiring, end, prolongation)', () => {
  const base = { status: 'signed', startsOn: '2026-11-01', endsOn: '2027-10-31', autoRenew: false };
  assert.equal(dateTransition(base, '2026-10-13', 30), null, 'not started yet');
  assert.deepEqual(dateTransition(base, '2026-11-01', 30), { status: 'active' });
  assert.deepEqual(dateTransition({ ...base, status: 'signed', startsOn: null }, '2026-10-13', 30), { status: 'active' }, 'no start date: in force once signed');
  assert.deepEqual(dateTransition({ ...base, status: 'active' }, '2027-10-01', 30), { status: 'expiring' });
  assert.equal(dateTransition({ ...base, status: 'expiring' }, '2027-10-20', 30), null);
  assert.deepEqual(dateTransition({ ...base, status: 'expiring' }, '2027-11-01', 30), { status: 'completed' });
  assert.equal(dateTransition({ ...base, status: 'draft' }, '2030-01-01', 30), null, 'only contracts in force');
  // A moved end date takes an expiring contract back to «Действует».
  assert.deepEqual(dateTransition({ ...base, status: 'expiring', endsOn: '2028-10-31' }, '2027-10-20', 30), { status: 'active' });
  // Auto-prolongation: the same term again.
  const auto = { status: 'expiring', startsOn: '2026-01-01', endsOn: '2026-12-31', autoRenew: true, noticeDays: 30 };
  const next = dateTransition(auto, '2027-01-01', 30);
  assert.equal(next.prolonged, true);
  assert.equal(next.startsOn, '2027-01-01');
  assert.equal(next.endsOn, '2027-12-31');
  assert.equal(next.status, 'active');
  assert.deepEqual(prolongTerm({ startsOn: null, endsOn: '2026-06-30' }, '2026-07-01'), { startsOn: '2026-07-01', endsOn: '2027-06-30' });
  assert.equal(prolongTerm({ startsOn: '2026-01-01', endsOn: '2026-01-31' }, '2026-04-15').endsOn, '2026-04-30', 'several terms when the server was off');
});

test('contracts: reminders 30 and 7 days before the end, once per threshold, never late', () => {
  const c = { status: 'active', endsOn: '2026-12-31', autoRenew: false };
  assert.deepEqual(dueReminders(c, '2026-11-30', [30, 7]), []);
  assert.deepEqual(dueReminders(c, '2026-12-01', [30, 7]).map((r) => [r.kind, r.days, r.left]), [['end', 30, 30]]);
  assert.deepEqual(dueReminders(c, '2026-12-20', [30, 7]).map((r) => r.days), [30], 'still the 30-day one (stored once by the job)');
  assert.deepEqual(dueReminders(c, '2026-12-24', [30, 7]).map((r) => r.days), [7]);
  assert.deepEqual(dueReminders(c, '2027-01-01', [30, 7]), [], 'after the end: nothing');
  assert.deepEqual(dueReminders({ ...c, status: 'draft' }, '2026-12-24', [30, 7]), []);
  // Auto-prolonged with a notice period: reminders before the refusal deadline, none for the end.
  const auto = { status: 'active', endsOn: '2026-12-31', autoRenew: true, noticeDays: 30 };
  const due = dueReminders(auto, '2026-11-25', [30, 7]);
  assert.deepEqual(due.map((r) => [r.kind, r.days, r.target]), [['notice', 7, '2026-12-01']]);
});

test('contracts: input is cleaned and checked', () => {
  const settings = { types: [{ key: 'supply' }, { key: 'lease' }] };
  const out = cleanContract({ title: '  Поставка  ', typeKey: 'supply', amount: '1500.555', currency: 'usd', endsOn: '2026-12-31', noticeDays: '30', lawyerId: '5', direction: 'client' }, settings);
  assert.equal(out.title, 'Поставка');
  assert.equal(out.amount, 1500.56);
  assert.equal(out.currency, 'USD');
  assert.equal(out.noticeDays, 30);
  assert.equal(out.lawyerId, 5);
  assert.throws(() => cleanContract({ title: '' }), (err) => err.code === 'TITLE_REQUIRED');
  assert.throws(() => cleanContract({ typeKey: 'unknown' }, settings), (err) => err.code === 'BAD_TYPE');
  assert.throws(() => cleanContract({ endsOn: '2026-02-30' }), (err) => err.code === 'INVALID_DATE');
  assert.throws(() => cleanContract({ amount: -1 }), (err) => err.code === 'BAD_AMOUNT');
  assert.throws(() => cleanContract({ direction: 'sideways' }), (err) => err.code === 'BAD_DIRECTION');
  assert.deepEqual(Object.keys(cleanContract({ title: 'x' })), ['title'], 'only keys present are returned');
  const risk = cleanRisk({ text: ' Штраф 1 % в день ', clause: '7.2', importance: 'high' });
  assert.deepEqual(risk, { text: 'Штраф 1 % в день', clause: '7.2', importance: 'high' });
  assert.throws(() => cleanRisk({ text: 'x', importance: 'extreme' }), (err) => err.code === 'BAD_IMPORTANCE');
  assert.throws(() => cleanRisk({ status: 'gone' }, true), (err) => err.code === 'BAD_RISK_STATUS');
});

test('contracts: settings are sanitized; the module is off by default', () => {
  const module = MODULE_CATALOG.find((m) => m.id === 'contracts');
  assert.equal(module.defaultEnabled, false);
  assert.equal(resolveModules({}).contracts.enabled, false);
  assert.deepEqual(module.permissions, ['contracts.create', 'contracts.view_all', 'contracts.legal', 'contracts.finance', 'contracts.admin']);
  const next = module.sanitize(module.defaults, { prefix: ' Д Г ', reminderDays: [7, 30, 0, 'x', 30], expiringDays: 9999, types: [{ key: 'lease' }, { key: 'custom', label: '' }, { key: 'mine', label: 'Мой тип' }], currencies: ['eur', 'euro', '12'] });
  assert.equal(next.prefix, 'ДГ');
  assert.deepEqual(next.reminderDays, [30, 7]);
  assert.equal(next.expiringDays, 365);
  assert.deepEqual(next.types, [{ key: 'lease', label: '' }, { key: 'mine', label: 'Мой тип' }]);
  assert.deepEqual(next.currencies, ['EUR']);
  assert.equal(next.defaultCurrency, 'EUR');
});

test('contracts: webhooks and notification kinds are registered', () => {
  for (const type of ['contracts.created', 'contracts.updated', 'contracts.status_changed', 'contracts.version_added', 'contracts.risk_changed', 'contracts.reminder', 'contracts.deleted']) {
    assert.ok(EVENT_CATALOG.some((event) => event.type === type && event.area === 'contracts'), type);
  }
  for (const kind of ['contracts.assigned', 'contracts.status', 'contracts.version', 'contracts.risk', 'contracts.reminder']) {
    assert.ok(NOTIFICATION_EVENTS.some((event) => event.kind === kind && event.module === 'contracts'), kind);
  }
});

test('contracts: notification texts in both languages with the recipient’s date format', () => {
  const contract = { number: 'ДГ-0007', title: 'Аренда склада', counterparty: 'ОсОО «Склад»', endsOn: '2026-12-31' };
  const ru = contractMessage('reminderEnd', { contract, left: 7, target: '2026-12-31' })('ru', { timeZone: 'Asia/Bishkek', dateFormat: 'DD.MM.YYYY', timeFormat: '24' });
  assert.match(ru.title, /через 7 дней/);
  assert.match(ru.body, /31\.12\.2026/);
  const en = contractMessage('reminderNotice', { contract, left: 1, target: '2026-12-01' })('en', { timeZone: 'UTC', dateFormat: 'MM/DD/YYYY', timeFormat: '12' });
  assert.match(en.title, /12\/01\/2026/);
  assert.match(en.body, /1 day left/);
  for (const [kind, build] of Object.entries(CONTRACT_MESSAGES)) {
    const texts = both(build, { contract, role: 'lawyer', status: 'signed', risk: { no: 1, importance: 'high', text: 't', clause: '1' }, no: 2, left: 3, target: '2026-12-01', endsOn: '2027-12-31', deposit: { kind: 'deposit', amount: 1, status: 'received' }, payment: { amount: 1 }, totals: { paid: 1, total: 1, percent: 100, full: true }, row: { dueOn: '2026-12-01', left: 1 } });
    assert.ok(texts.ru.title && texts.en.title, kind);
  }
});
