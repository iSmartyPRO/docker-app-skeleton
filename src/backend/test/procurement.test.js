import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS,
  actionError,
  approvalTarget,
  availableActions,
  cleanItems,
  csvCell,
  day,
  deliveryStateOf,
  deriveStatus,
  formatNumber,
  itemsTotal,
  money,
  payGroup,
  readyErrors,
  toCsv,
  totalsByCurrency,
} from '../modules/procurement/logic.js';
import { MODULE_CATALOG, PROCUREMENT_DEFAULTS, resolveModules, sanitizeProcurement } from '../modules/catalog.js';
import { PROCUREMENT_MESSAGES, moneyText } from '../modules/procurement/messages.js';
import { cleanLegalEntity } from '../services/legalEntities.js';
import { NOTIFICATION_EVENTS } from '../services/notificationCatalog.js';
import { EVENT_TYPES } from '../api/events.js';

test('procurement: line items and money', () => {
  const items = cleanItems([
    { name: 'Ноутбук', qty: '2', unit: 'шт', price: '1 200,50' },
    { name: '', price: '' },
    { name: 'Мышь', qty: -1, price: 10 },
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { name: 'Ноутбук', qty: 2, unit: 'шт', price: 1200.5, amount: 2401 });
  assert.equal(items[1].qty, 1, 'a bad quantity becomes 1');
  assert.equal(itemsTotal(items), 2411);
  assert.equal(money('abc'), null);
  assert.equal(money(-5), null);
  assert.equal(money('0.105'), 0.11);
});

test('procurement: status after payments and delivery', () => {
  assert.equal(deriveStatus({ total: 100, paid: 0, deliveryState: 'none' }), 'to_pay');
  assert.equal(deriveStatus({ total: 100, paid: 40, deliveryState: 'none' }), 'partially_paid');
  assert.equal(deriveStatus({ total: 100, paid: 100, deliveryState: 'partial' }), 'paid');
  assert.equal(deriveStatus({ total: 100, paid: 100, deliveryState: 'full' }), 'delivered');
  assert.equal(deriveStatus({ total: 100, paid: 40, deliveryState: 'full' }), 'partially_paid', 'post-payment: delivered but not paid in full');
  assert.equal(deriveStatus({ total: 0.1 + 0.2, paid: 0.3, deliveryState: 'none' }), 'paid', 'no float noise');
  assert.equal(deliveryStateOf([]), 'none');
  assert.equal(deliveryStateOf([{ partial: true }]), 'partial');
  assert.equal(deliveryStateOf([{ partial: true }, { partial: false }]), 'full');
});

test('procurement: approval statuses map to request statuses, and only from allowed ones', () => {
  assert.equal(approvalTarget('draft', 'pending'), 'pending');
  assert.equal(approvalTarget('pending', 'question'), 'question');
  assert.equal(approvalTarget('question', 'pending'), 'pending', 'an answer returns it to approval');
  assert.equal(approvalTarget('pending', 'approved'), 'to_pay', 'approved becomes «К оплате» at once');
  assert.equal(approvalTarget('pending', 'rejected'), 'rejected');
  assert.equal(approvalTarget('question', 'returned'), 'returned');
  assert.equal(approvalTarget('returned', 'withdrawn'), 'draft');
  assert.throws(() => approvalTarget('rejected', 'pending'), (err) => err.code === 'BAD_TRANSITION');
  assert.throws(() => approvalTarget('paid', 'approved'), (err) => err.code === 'BAD_TRANSITION');
  assert.throws(() => approvalTarget('cancelled', 'pending'), (err) => err.code === 'BAD_TRANSITION');
});

test('procurement: manual actions follow the transition table and the roles', () => {
  const author = { author: true };
  assert.equal(actionError('submit', 'draft', author), null);
  assert.equal(actionError('submit', 'to_pay', author), 'BAD_TRANSITION');
  assert.equal(actionError('submit', 'draft', { pay: true }), 'FORBIDDEN');
  assert.equal(actionError('pay', 'to_pay', author), 'FORBIDDEN', 'the author does not mark payments');
  assert.equal(actionError('pay', 'to_pay', { pay: true }), null);
  assert.equal(actionError('pay', 'paid', { pay: true }), 'BAD_TRANSITION');
  assert.equal(actionError('cancel', 'to_pay', author, { paid: 10 }), 'HAS_PAYMENTS');
  assert.equal(actionError('cancel', 'to_pay', author, { paid: 0 }), null);
  assert.equal(actionError('close', 'partially_paid', author), 'BAD_TRANSITION');
  assert.equal(actionError('close', 'delivered', { responsible: true }), null);
  assert.equal(actionError('reopen', 'closed', author), 'FORBIDDEN');
  assert.equal(actionError('delete', 'draft', author, { everSubmitted: true }), 'BAD_TRANSITION', 'a draft that went to approval keeps its history');
  assert.equal(actionError('deliver', 'to_pay', { responsible: true }), null, 'post-payment terms: delivery before payment');
  assert.deepEqual(availableActions('draft', author, {}), ['submit', 'cancel', 'delete']);
  for (const rule of Object.values(ACTIONS)) assert.ok(rule.from.length && rule.who.length);
});

test('procurement: readiness before approval', () => {
  assert.deepEqual(readyErrors({ title: ' ', amount: 0, currency: 'USD' }, { invoiceRequired: true, currencies: ['USD'] }), ['TITLE_REQUIRED', 'AMOUNT_REQUIRED', 'INVOICE_REQUIRED']);
  assert.deepEqual(readyErrors({ title: 'A', amount: 5, currency: 'EUR' }, { invoiceRequired: false, currencies: ['USD'] }), ['CURRENCY']);
  assert.deepEqual(readyErrors({ title: 'A', amount: 5, currency: 'USD' }, { invoiceCount: 1, invoiceRequired: true, currencies: ['USD'] }), []);
});

test('procurement: numbers, days, registry groups, totals', () => {
  assert.equal(formatNumber('ЗК', 1, 4), 'ЗК-0001');
  assert.equal(formatNumber('ЗК', 12345, 4), 'ЗК-12345');
  assert.equal(formatNumber('', 7, 3), '007');
  assert.equal(day('2026-02-30'), null);
  assert.equal(day('2026-10-13T10:00:00Z'), '2026-10-13');
  assert.equal(payGroup('2026-10-12', '2026-10-13'), 'overdue');
  assert.equal(payGroup('2026-10-13', '2026-10-13'), 'today');
  assert.equal(payGroup('2026-10-20', '2026-10-13'), 'week');
  assert.equal(payGroup('2026-10-21', '2026-10-13'), 'later');
  assert.equal(payGroup(null, '2026-10-13'), 'later');
  assert.deepEqual(totalsByCurrency([{ currency: 'USD', amount: 1.1 }, { currency: 'KGS', amount: 5 }, { currency: 'USD', amount: 2.2 }]), [{ currency: 'KGS', amount: 5 }, { currency: 'USD', amount: 3.3 }]);
});

test('procurement: CSV export cannot inject formulas', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('+7 999'), `"'+7 999"`);
  assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
  assert.equal(csvCell('\tcmd'), `"'\tcmd"`);
  assert.equal(csvCell('-12.5'), '-12.5', 'negative numbers stay numbers');
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell(null), '');
  const csv = toCsv(['№', 'Название'], [['ЗК-0001', '=cmd|calc']]);
  assert.ok(csv.startsWith('﻿№;Название\r\n'));
  assert.ok(csv.includes(`"'=cmd|calc"`));
});

test('procurement: settings are sanitized; the module is off by default', () => {
  const entry = MODULE_CATALOG.find((module) => module.id === 'procurement');
  assert.ok(entry);
  assert.equal(entry.defaultEnabled, false);
  assert.deepEqual(entry.permissions, ['procurement.create', 'procurement.view_all', 'procurement.pay', 'procurement.admin']);
  assert.equal(resolveModules({}).procurement.enabled, false);
  const next = sanitizeProcurement(PROCUREMENT_DEFAULTS, {
    categories: [{ key: 'it', name: 'IT' }, { key: 'it', name: 'Dup' }, { name: '' }, { key: 'BAD KEY', name: '<b>X</b>', color: 'red' }],
    currencies: ['usd', 'kgs', 'nope'],
    currency: 'EUR',
    numberPrefix: 'ЗК<script>',
    numberDigits: 99,
    invoiceRequired: false,
    reminderDays: -3,
    units: ['шт', 'шт', ''],
  });
  assert.deepEqual(next.categories.map((item) => item.key), ['it', 'c2', 'c3']);
  assert.equal(next.categories[2].name, 'bX/b', 'markup is stripped');
  assert.match(next.categories[2].color, /^#[0-9A-F]{6}$/);
  assert.deepEqual(next.currencies, ['USD', 'KGS']);
  assert.equal(next.currency, 'USD', 'the default currency must be one of the list');
  assert.equal(next.numberPrefix, 'ЗКscript');
  assert.equal(next.numberDigits, 8);
  assert.equal(next.invoiceRequired, false);
  assert.equal(next.reminderDays, 0);
  assert.deepEqual(next.units, ['шт']);
});

test('procurement: notifications and webhooks are catalogued', () => {
  for (const kind of ['procurement.to_pay', 'procurement.paid', 'procurement.delivered', 'procurement.assigned', 'procurement.due_soon', 'procurement.overdue']) {
    assert.ok(NOTIFICATION_EVENTS.some((event) => event.kind === kind), kind);
  }
  for (const type of ['procurement.created', 'procurement.approved', 'procurement.paid', 'procurement.overdue', 'procurement.cancelled']) assert.ok(EVENT_TYPES.includes(type), type);
  const doc = { number: 'ЗК-0001', title: 'Бетон', amount: 120000, currency: 'KGS', paid: 20000, remaining: 100000, payBy: '2026-10-20', regional: { timeZone: 'Asia/Bishkek', dateFormat: 'DD.MM.YYYY', timeFormat: '24' } };
  const ru = PROCUREMENT_MESSAGES.paySoon({ doc }).ru;
  assert.match(ru.title, /20\.10\.2026/);
  assert.match(ru.body, /100\s000 сом/);
  const en = PROCUREMENT_MESSAGES.paid({ doc, payment: { amount: 20000, paidOn: '2026-10-13' }, full: false }).en;
  assert.match(en.title, /Partly paid/);
  assert.equal(moneyText(5000.5, 'USD', 'en'), '5,000.50 USD');
});

test('legal entities: input is validated', () => {
  assert.throws(() => cleanLegalEntity({ name: '  ' }), (err) => err.code === 'NAME_REQUIRED');
  const clean = cleanLegalEntity({ name: ' ОсОО «Вайт Хиллс» ', taxId: '0123', sort: 1e9, isDefault: 1 });
  assert.equal(clean.name, 'ОсОО «Вайт Хиллс»');
  assert.equal(clean.sort, 9999);
  assert.equal(clean.isDefault, true);
  assert.equal(clean.shortName, null);
});
