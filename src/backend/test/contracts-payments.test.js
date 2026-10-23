import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, buildSchedule, cleanDeposit, cleanDepositStatus, cleanPayment, cleanScheduleRows, dueGroup, monthDay, paymentReminders, payTotals, rowState, splitInstallments } from '../modules/contracts/payLogic.js';
import { paymentSchedule } from '../modules/masterplan/pricing.js';
import { depositAsPayment, paymentsRelevant } from '../modules/contracts/payments.js';
import { contractsContext } from '../modules/contracts/access.js';
import { csvCell } from '../modules/contracts/service.js';
import { CONTRACT_MESSAGES, contractMessage } from '../modules/contracts/messages.js';
import { translator } from '../services/i18n/index.js';

/** A message builder's texts in both reference languages. */
const both = (build, params) => ({ ru: build(translator('ru'), params), en: build(translator('en'), params) });
import { isoDay } from '../services/datetime.js';
import { MODULE_CATALOG } from '../modules/catalog.js';
import { EVENT_CATALOG } from '../api/events.js';
import { NOTIFICATION_EVENTS } from '../services/notificationCatalog.js';
import { availableTypes } from '../modules/dashboard/widgets.js';
import contractsModule from '../modules/contracts/index.js';
import { activateModules } from '../platform/registry.js';

// Contracts registers its dashboard widget through the core registry (register(ctx)).
await activateModules([contractsModule]);

/*
 * The money side of contracts (docs/contracts.md "Deposit and payments"):
 * schedule generation (rounding, the deposit offset), allocation of partial
 * payments oldest first, the state of rows by the regional day, reminders,
 * input cleaning, rights and catalogs. No database.
 */

const sum = (rows) => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;

test('payments: installments round to whole units, the last payment absorbs the difference', () => {
  // Same arithmetic as Masterplan's price grid.
  for (const [total, pct, months] of [[193440, 30, 12], [100000, 50, 7], [99999, 10, 36], [1000, 33.33, 3]]) {
    const ours = splitInstallments(total, pct, months);
    const grid = paymentSchedule(total, pct, months);
    assert.deepEqual([ours.first, ours.monthly, ours.last, ours.months], [grid.first, grid.monthly, grid.last, grid.months], `${total} ${pct} ${months}`);
  }
  // Cents stay in the last payment; a tiny rest never makes it negative.
  const cents = splitInstallments(1000.5, 30, 3);
  assert.deepEqual([cents.first, cents.monthly, cents.last], [300, 234, 232.5]);
  const tiny = splitInstallments(2, 0, 4);
  assert.ok(tiny.last >= 0 && tiny.monthly * 3 + tiny.last === 2);
  assert.deepEqual(splitInstallments(500, 100, 12), { total: 500, first: 500, months: 0, monthly: 0, last: 0 });
});

test('payments: schedule generation — full, installments by day of month, rounding', () => {
  const full = buildSchedule(120000, { mode: 'full', firstOn: '2026-11-01' });
  assert.deepEqual(full, [{ no: 1, dueOn: '2026-11-01', amount: 120000, purpose: 'full' }]);

  const plan = buildSchedule(193440, { mode: 'installments', firstPct: 30, months: 12, firstOn: '2026-10-20', startOn: '2026-11-05', day: 5 });
  assert.equal(plan.length, 13);
  assert.equal(plan[0].purpose, 'first');
  assert.equal(plan[0].amount, 58032);
  assert.equal(sum(plan), 193440, 'the rows add up to the total');
  assert.deepEqual(plan.slice(1, 4).map((r) => r.dueOn), ['2026-11-05', '2026-12-05', '2027-01-05']);
  assert.ok(plan.slice(1, -1).every((r) => r.amount === 11284));
  assert.equal(plan.at(-1).amount, 193440 - 58032 - 11284 * 11);

  // Day 31 clamps to the end of short months; the default start is a month after the first payment.
  const ends = buildSchedule(1000.5, { mode: 'installments', firstPct: 30, months: 3, firstOn: '2026-01-31', day: 31 });
  assert.deepEqual(ends.map((r) => r.dueOn), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(sum(ends), 1000.5);
  assert.equal(monthDay('2028-02-01', 30), '2028-02-29');

  assert.throws(() => buildSchedule(0, { firstOn: '2026-01-01' }), { code: 'AMOUNT_REQUIRED' });
  assert.throws(() => buildSchedule(100, { firstOn: '2026-02-30' }), { code: 'INVALID_DATE' });
});

test('payments: a deposit is its own row and is counted toward the first payment', () => {
  const rows = buildSchedule(100000, { mode: 'installments', firstPct: 30, months: 10, firstOn: '2026-10-20', deposit: { amount: 5000, dueOn: '2026-10-16' } });
  assert.deepEqual(rows[0], { no: 1, dueOn: '2026-10-16', amount: 5000, purpose: 'deposit' });
  assert.deepEqual(rows[1], { no: 2, dueOn: '2026-10-20', amount: 25000, purpose: 'first' });
  assert.equal(sum(rows), 100000, 'the deposit is part of the price, not on top of it');
  // 100 %: deposit + «Остаток».
  const full = buildSchedule(50000, { mode: 'full', firstOn: '2026-12-01', deposit: { amount: 2000 } });
  assert.deepEqual(full.map((r) => [r.purpose, r.amount, r.dueOn]), [['deposit', 2000, '2026-12-01'], ['rest', 48000, '2026-12-01']]);
  // A deposit larger than the first payment reduces the next rows in order.
  const big = buildSchedule(10000, { mode: 'installments', firstPct: 10, months: 3, firstOn: '2026-01-10', deposit: { amount: 2500, dueOn: '2026-01-05' } });
  assert.deepEqual(big.map((r) => [r.purpose, r.amount]), [['deposit', 2500], ['monthly', 1500], ['monthly', 3000], ['monthly', 3000]]);
  assert.equal(sum(big), 10000);
  // Without the offset the deposit is not in the schedule.
  const off = buildSchedule(10000, { mode: 'full', firstOn: '2026-01-10', deposit: { amount: 2500 }, offset: false });
  assert.deepEqual(off.map((r) => r.purpose), ['full']);
});

test('payments: partial payments fill the oldest rows first; the deposit counts by its status', () => {
  const rows = [
    { id: 1, no: 1, dueOn: '2026-10-16', amount: 5000, purpose: 'deposit' },
    { id: 2, no: 2, dueOn: '2026-10-20', amount: 25000, purpose: 'first' },
    { id: 3, no: 3, dueOn: '2026-11-20', amount: 7000, purpose: 'monthly' },
    { id: 4, no: 4, dueOn: '2026-12-20', amount: 7000, purpose: 'monthly' },
  ];
  // Received (not credited yet): covers the «Задаток» row only.
  let res = allocate(rows, [{ amount: 5000, only: 'deposit' }, { amount: 20000 }]);
  assert.deepEqual(res.rows.map((r) => r.paid), [5000, 20000, 0, 0]);
  assert.equal(res.paid, 25000);
  // A partial payment covers a row partly, the next one fills it and moves on.
  res = allocate(rows, [{ amount: 5000, only: 'deposit' }, { amount: 20000 }, { amount: 8000.55 }]);
  assert.deepEqual(res.rows.map((r) => r.paid), [5000, 25000, 3000.55, 0]);
  // Credited: counts as money toward any row (oldest first).
  res = allocate(rows.filter((r) => r.purpose !== 'deposit'), [{ amount: 5000 }]);
  assert.deepEqual(res.rows.map((r) => r.paid), [5000, 0, 0]);
  // Received without a deposit row: held, not counted.
  res = allocate(rows.filter((r) => r.purpose !== 'deposit'), [{ amount: 5000, only: 'deposit' }]);
  assert.equal(res.paid, 0);
  // Overpayment stays counted (surplus).
  res = allocate(rows, [{ amount: 50000 }]);
  assert.equal(res.surplus, 6000);
  assert.equal(res.paid, 50000);
  // Cents never drift.
  res = allocate([{ id: 1, no: 1, dueOn: '2026-01-01', amount: 0.3, purpose: 'full' }], [{ amount: 0.1 }, { amount: 0.2 }]);
  assert.equal(res.rows[0].paid, 0.3);

  // The deposit as a payment: credited → any row, received → the deposit row, others → nothing; other currency → nothing.
  assert.deepEqual(depositAsPayment({ status: 'credited', amount: '5000.00', currency: 'USD' }, 'USD'), { amount: 5000 });
  assert.deepEqual(depositAsPayment({ status: 'received', amount: '5000.00', currency: 'USD ' }, 'USD'), { amount: 5000, only: 'deposit' });
  assert.equal(depositAsPayment({ status: 'expected', amount: 1 }, 'USD'), null);
  assert.equal(depositAsPayment({ status: 'returned', amount: 1 }, 'USD'), null);
  assert.equal(depositAsPayment({ status: 'received', amount: 1, currency: 'KGS' }, 'USD'), null);
});

test('payments: overdue / soon by the regional day; totals; registry groups', () => {
  // 20:30 UTC on 14 Oct is already 15 Oct in Bishkek (UTC+6): a row due on the 14th is overdue there, due today in London.
  const moment = new Date('2026-10-14T20:30:00Z');
  const bishkek = isoDay(moment, 'Asia/Bishkek');
  const london = isoDay(moment, 'Europe/London');
  assert.equal(bishkek, '2026-10-15');
  assert.equal(london, '2026-10-14');
  const row = { dueOn: '2026-10-14', amount: 100, paid: 0 };
  assert.equal(rowState(row, bishkek), 'overdue');
  assert.equal(rowState(row, london), 'soon');
  assert.equal(rowState({ ...row, paid: 100 }, bishkek), 'paid');
  assert.equal(rowState({ ...row, paid: 40 }, bishkek), 'overdue', 'partly paid and late is still overdue');
  assert.equal(rowState({ dueOn: '2026-10-22', amount: 1, paid: 0 }, '2026-10-15', 7), 'soon');
  assert.equal(rowState({ dueOn: '2026-10-23', amount: 1, paid: 0 }, '2026-10-15', 7), 'planned');

  const rows = [
    { dueOn: '2026-09-01', amount: 1000, paid: 1000 },
    { dueOn: '2026-10-01', amount: 1000, paid: 250 },
    { dueOn: '2026-11-01', amount: 1000, paid: 0 },
  ];
  const totals = payTotals(rows, 1250, '2026-10-15');
  assert.deepEqual({ ...totals, next: undefined }, { total: 3000, paid: 1250, remaining: 1750, overdue: 750, percent: 41, full: false, next: undefined });
  assert.deepEqual(totals.next, { dueOn: '2026-10-01', amount: 750, state: 'overdue' });
  assert.equal(payTotals(rows, 3000, '2026-10-15').full, true);

  assert.equal(dueGroup('2026-10-14', '2026-10-15'), 'overdue');
  assert.equal(dueGroup('2026-10-15', '2026-10-15'), 'today');
  assert.equal(dueGroup('2026-10-22', '2026-10-15'), 'week');
  assert.equal(dueGroup('2026-10-23', '2026-10-15'), 'later');
  assert.equal(dueGroup(null, '2026-10-15'), 'later');
});

test('payments: reminders — the smallest threshold reached, once overdue, nothing when paid', () => {
  const row = { dueOn: '2026-10-20', amount: 100, paid: 0 };
  assert.deepEqual(paymentReminders(row, '2026-10-10'), []);
  assert.deepEqual(paymentReminders(row, '2026-10-17'), [{ kind: 'due', days: 3, left: 3 }]);
  assert.deepEqual(paymentReminders(row, '2026-10-19'), [{ kind: 'due', days: 3, left: 1 }]);
  assert.deepEqual(paymentReminders(row, '2026-10-20'), [{ kind: 'due', days: 0, left: 0 }]);
  assert.deepEqual(paymentReminders(row, '2026-10-25'), [{ kind: 'overdue', days: 0, left: -5 }]);
  assert.deepEqual(paymentReminders({ ...row, paid: 100 }, '2026-10-25'), []);
  assert.deepEqual(paymentReminders(row, '2026-10-17', [7]), [{ kind: 'due', days: 7, left: 3 }]);
});

test('payments: input cleaning', () => {
  assert.deepEqual(cleanDeposit({ kind: 'advance', amount: '5 000,50', currency: 'usd', dueOn: '2026-10-20', terms: ' Возврат в течение 10 дней ' }), { kind: 'advance', amount: 5000.5, currency: 'USD', dueOn: '2026-10-20', terms: 'Возврат в течение 10 дней' });
  assert.throws(() => cleanDeposit({ amount: 0 }), { code: 'BAD_AMOUNT' });
  assert.throws(() => cleanDeposit({ kind: 'bribe' }), { code: 'BAD_KIND' });
  assert.throws(() => cleanDeposit({ dueOn: '2026-13-01' }), { code: 'INVALID_DATE' });

  const received = cleanDepositStatus({ status: 'received', method: 'cash', reference: 'ПКО-7' }, { status: 'expected', amount: '5000' }, '2026-10-15');
  assert.deepEqual(received, { status: 'received', note: null, receivedOn: '2026-10-15', method: 'cash', reference: 'ПКО-7', settledOn: null, settledAmount: null });
  const returned = cleanDepositStatus({ status: 'returned', settledAmount: 10000, note: 'Отказ продавца: вдвойне' }, { status: 'received', amount: '5000', receivedOn: '2026-10-01' }, '2026-10-15');
  assert.equal(returned.settledAmount, 10000);
  assert.equal(returned.receivedOn, '2026-10-01');
  assert.equal(cleanDepositStatus({ status: 'returned' }, { status: 'received', amount: '5000' }, '2026-10-15').settledAmount, 5000, 'returned in full by default');
  assert.throws(() => cleanDepositStatus({ status: 'received' }, { status: 'received' }, '2026-10-15'), { code: 'SAME_STATUS' });
  assert.throws(() => cleanDepositStatus({ status: 'kept' }, {}, '2026-10-15'), { code: 'BAD_STATUS' });

  assert.deepEqual(cleanPayment({ amount: '1500' }, '2026-10-15'), { amount: 1500, paidOn: '2026-10-15', method: 'bank', reference: null, note: null });
  assert.throws(() => cleanPayment({ amount: -1 }, '2026-10-15'), { code: 'BAD_AMOUNT' });
  assert.throws(() => cleanPayment({ amount: 10, method: 'barter' }, '2026-10-15'), { code: 'BAD_METHOD' });

  const rows = cleanScheduleRows([{ id: 7, dueOn: '2026-12-01', amount: 100, purpose: 'monthly' }, { dueOn: '2026-11-01', amount: '50', purpose: 'first', note: 'x' }]);
  assert.deepEqual(rows, [
    { no: 1, id: null, dueOn: '2026-11-01', amount: 50, purpose: 'first', note: 'x' },
    { no: 2, id: 7, dueOn: '2026-12-01', amount: 100, purpose: 'monthly', note: null },
  ]);
  assert.throws(() => cleanScheduleRows([{ amount: 1 }]), { code: 'INVALID_DATE' });
  assert.throws(() => cleanScheduleRows([{ dueOn: '2026-01-01', amount: 0 }]), { code: 'BAD_AMOUNT' });
});

test('payments: contracts.finance — rights, visibility of tracked contracts, the tab only where relevant', () => {
  const ctxOf = (permissions, extra = {}) => contractsContext({ user: { id: 5 }, access: { permissions, groupIds: [] }, ...extra }, {});
  const finance = ctxOf(['contracts.finance']);
  assert.equal(finance.isFinance, true);
  assert.equal(finance.viewAll, false, 'finance does not see every contract, only those with money');
  assert.equal(ctxOf(['contracts.admin']).isFinance, true);
  assert.equal(ctxOf(['contracts.legal']).isFinance, false);
  assert.equal(ctxOf(['contracts.view_all']).isFinance, false);
  assert.equal(ctxOf(['contracts.finance'], { apiLimits: {} }).isFinance, false, 'a narrowed token never gets the finance bypass');

  assert.equal(paymentsRelevant({ direction: 'client' }), true);
  assert.equal(paymentsRelevant({ type_key: 'property_sale' }), true);
  assert.equal(paymentsRelevant({ direction: 'supplier', type_key: 'supply' }), false);
  assert.equal(paymentsRelevant({ direction: 'supplier', pay_tracked: true }), true);
});

test('payments: CSV cells are guarded against formulas', () => {
  for (const evil of ['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)', '\tx']) assert.ok(csvCell(evil).replace(/^"/, '').startsWith("'"), evil);
  assert.equal(csvCell('ОсОО «Бетон»; склад'), '"ОсОО «Бетон»; склад"');
  assert.equal(csvCell(null), '');
});

test('payments: catalogs — permission, webhooks, notifications, dashboard widget, settings', () => {
  const module = MODULE_CATALOG.find((m) => m.id === 'contracts');
  assert.ok(module.permissions.includes('contracts.finance'));
  assert.ok(module.defaults.types.some((type) => type.key === 'property_sale'));
  const next = module.sanitize(module.defaults, { paymentSoonDays: 999, paymentReminderDays: [0, 3, 3, -1, 'x'] });
  assert.equal(next.paymentSoonDays, 60);
  assert.deepEqual(next.paymentReminderDays, [3, 0]);
  for (const type of ['contracts.deposit.received', 'contracts.payment.received', 'contracts.payment.overdue']) {
    assert.ok(EVENT_CATALOG.some((event) => event.type === type && event.area === 'contracts'), type);
  }
  for (const kind of ['contracts.payment', 'contracts.payment_due', 'contracts.payment_overdue']) {
    assert.ok(NOTIFICATION_EVENTS.some((event) => event.kind === kind && event.module === 'contracts'), kind);
  }
  const modules = { contracts: { enabled: true } };
  assert.ok(availableTypes(modules, ['contracts.finance']).includes('contractsPayments'));
  assert.ok(availableTypes(modules, ['contracts.view_all']).includes('contractsPayments'));
  assert.ok(!availableTypes(modules, ['contracts.create']).includes('contractsPayments'));
  assert.ok(!availableTypes({ contracts: { enabled: false } }, ['contracts.finance']).includes('contractsPayments'));
});

test('payments: notification texts in both languages, amounts and dates per recipient', () => {
  const contract = { number: 'ДГ-0042', title: 'Продажа коттеджа A-12', counterparty: 'Иванов И.', currency: 'USD' };
  const regional = { timeZone: 'Asia/Bishkek', dateFormat: 'DD.MM.YYYY', timeFormat: '24' };
  const ru = contractMessage('paymentOverdue', { contract, row: { dueOn: '2026-10-01', left: 12500.5 } })('ru', regional);
  assert.match(ru.title, /Платёж просрочен/);
  assert.match(ru.body, /12\s500,5/);
  assert.match(ru.body, /01\.10\.2026/);
  const en = contractMessage('paymentDue', { contract, row: { dueOn: '2026-10-20', left: 1000 }, left: 3 })('en', { ...regional, dateFormat: 'MM/DD/YYYY' });
  assert.match(en.title, /in 3 days/);
  assert.match(en.body, /10\/20\/2026/);
  for (const kind of ['depositReceived', 'depositStatus', 'paymentReceived', 'paymentDue', 'paymentOverdue']) {
    const texts = both(CONTRACT_MESSAGES[kind], { contract, deposit: { kind: 'deposit', amount: 5000, currency: 'USD', receivedOn: '2026-10-15', status: 'credited' }, payment: { amount: 1, paidOn: '2026-10-15' }, totals: { paid: 1, total: 2, percent: 50, full: false }, row: { dueOn: '2026-10-20', left: 1 }, left: 0 });
    assert.ok(texts.ru.title && texts.en.title, kind);
  }
});

test('payments: «Продажа объекта» reaches settings saved before it existed, once', async () => {
  const { resolveModules } = await import('../modules/catalog.js');
  const old = resolveModules({ contracts: { enabled: true, settings: { types: [{ key: 'supply', label: '' }, { key: 'sale', label: 'Купля-продажа' }, { key: 'other', label: '' }] } } }).contracts.settings;
  assert.deepEqual(old.types.map((type) => type.key), ['supply', 'sale', 'property_sale', 'other']);
  // Saved after the upgrade (typesRev 2): an administrator who removed it keeps it removed.
  const module = MODULE_CATALOG.find((m) => m.id === 'contracts');
  const saved = module.sanitize(old, { types: [{ key: 'supply' }, { key: 'sale', label: 'Купля-продажа' }] });
  assert.equal(saved.typesRev, 2);
  const later = resolveModules({ contracts: { enabled: true, settings: saved } }).contracts.settings;
  assert.deepEqual(later.types.map((type) => type.key), ['supply', 'sale']);
  // Never saved: the stock list already has it.
  assert.ok(resolveModules({}).contracts.settings.types.some((type) => type.key === 'property_sale'));
});
