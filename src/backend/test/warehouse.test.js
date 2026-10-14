import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_CATALOG, WAREHOUSE_DEFAULTS, resolveModules, sanitizeWarehouse } from '../modules/catalog.js';
import {
  COST_KEYS,
  averageAfter,
  cleanUnits,
  convertFromBase,
  csvCell,
  docActions,
  globalRights,
  inBestUnit,
  needsApproval,
  ownCode,
  parseOwnCode,
  rightsOn,
  shortages,
  stockFlags,
  stripCost,
  takeCost,
  toBaseMoney,
  toBaseQty,
  unitFactor,
  validEan13,
  barcodeKind,
} from '../modules/warehouse/logic.js';
import { NOTIFICATION_EVENTS } from '../services/notificationCatalog.js';
import { EVENT_CATALOG } from '../api/events.js';
import { WAREHOUSE_MESSAGES } from '../modules/warehouse/messages.js';

const settings = { ...WAREHOUSE_DEFAULTS };

test('warehouse: off by default, permissions and defaults catalogued', () => {
  const entry = MODULE_CATALOG.find((m) => m.id === 'warehouse');
  assert.equal(entry.defaultEnabled, false);
  assert.deepEqual(entry.permissions, ['warehouse.view', 'warehouse.request', 'warehouse.operate', 'warehouse.writeoff', 'warehouse.inventory', 'warehouse.cost', 'warehouse.backdate', 'warehouse.admin']);
  assert.equal(resolveModules({}).warehouse.enabled, false);
  assert.equal(WAREHOUSE_DEFAULTS.approvalThreshold, 500);
  assert.equal(WAREHOUSE_DEFAULTS.approvalThresholdCurrency, 'USD');
});

test('warehouse: settings are sanitized', () => {
  const next = sanitizeWarehouse(settings, { currency: 'kgs', currencies: ['usd', 'bad1', 'KGS'], rates: { USD: 0.0114, EUR: -1, rub: 0.9, x: 1 }, approvalThreshold: -5, approvalTypes: ['writeoff', 'nope'], closedUntil: '2026-13-01', numberPrefixes: { receipt: 'П<Р>', issue: '' }, numberDigits: 99, lowStockRecipients: [3, '4', -1, 'x'] });
  assert.equal(next.currency, 'KGS');
  assert.deepEqual(next.currencies, ['USD', 'KGS']);
  assert.deepEqual(next.rates, { USD: 0.0114, RUB: 0.9 });
  assert.equal(next.approvalThreshold, 500);
  assert.deepEqual(next.approvalTypes, ['writeoff']);
  assert.equal(next.closedUntil, null);
  assert.equal(next.numberPrefixes.receipt, 'ПР');
  assert.equal(next.numberPrefixes.issue, 'ТР');
  assert.equal(next.numberDigits, 8);
  assert.deepEqual(next.lowStockRecipients, [3, 4]);
  assert.equal(sanitizeWarehouse(settings, { closedUntil: '2026-09-30' }).closedUntil, '2026-09-30');
});

test('warehouse: units and conversion «2 уп = 48 шт»', () => {
  const item = { base_unit: 'шт', units: cleanUnits([{ code: 'уп', factor: 24 }, { code: 'шт', factor: 2 }, { code: 'кор', factor: '240' }, { code: 'bad', factor: 0 }], 'шт') };
  assert.deepEqual(item.units, [{ code: 'уп', factor: 24 }, { code: 'кор', factor: 240 }]);
  assert.equal(unitFactor(item, 'уп'), 24);
  assert.equal(unitFactor(item, 'шт'), 1);
  assert.equal(unitFactor(item, 'м'), null);
  assert.equal(toBaseQty(2, 24), 48);
  assert.equal(toBaseQty(0.5, 50), 25);
  assert.deepEqual(inBestUnit(item, 480), { qty: 2, unit: 'кор' });
  assert.deepEqual(inBestUnit(item, 48), { qty: 2, unit: 'уп' });
  assert.deepEqual(inBestUnit(item, 50), { qty: 50, unit: 'шт' });
});

test('warehouse: moving average costing', () => {
  // A pool of 200 worth 50: taking 40 costs 10, taking all costs exactly the rest.
  assert.equal(takeCost(40, 200, 50), 10);
  assert.equal(takeCost(200, 200, 50), 50);
  assert.equal(takeCost(3, 3, 10), 10);
  assert.equal(takeCost(1, 3, 10), 3.33);
  // An empty pool takes the last known average.
  assert.equal(takeCost(5, 0, 0, 2.5), 12.5);
  assert.equal(averageAfter(100, 20, 100, 30), 0.25);
  assert.equal(averageAfter(0, 0, 0, 0, 1.7), 1.7);
});

test('warehouse: currencies and the approval threshold ($500)', () => {
  const s = { ...settings, currency: 'USD', rates: { KGS: 87.5 } };
  assert.equal(toBaseMoney(875, 'KGS', s), 10);
  assert.equal(toBaseMoney(100, 'KGS', s, 100), 1);
  assert.throws(() => toBaseMoney(1, 'EUR', s), (err) => err.code === 'NO_RATE');
  assert.equal(needsApproval('writeoff', 500, s), false);
  assert.equal(needsApproval('writeoff', 500.01, s), true);
  assert.equal(needsApproval('issue', 10000, s), false);
  // Base currency KGS, threshold in USD: 50 000 сом ≈ $571 → approval.
  const kgs = { ...settings, currency: 'KGS', rates: { USD: 1 / 87.5 } };
  assert.equal(convertFromBase(43750, 'USD', kgs), 500);
  assert.equal(needsApproval('writeoff', 50000, kgs), true);
  assert.equal(needsApproval('writeoff', 40000, kgs), false);
});

test('warehouse: rights per warehouse (global, assignment, MOL)', () => {
  const none = globalRights([], { everyoneCanView: false });
  assert.equal(none.size, 0);
  const everyone = globalRights([], { everyoneCanView: true });
  assert.deepEqual([...everyone].sort(), ['request', 'view']);
  const admin = globalRights(['warehouse.admin'], {});
  assert.ok(admin.has('cost') && admin.has('backdate'));
  const star = globalRights(['*'], {});
  assert.ok(star.has('admin'));
  const zones = { global: none, assignments: new Map([[2, new Set(['operate'])]]), molOf: new Set([1]) };
  assert.ok(rightsOn(zones, 1).has('writeoff'));
  assert.ok(!rightsOn(zones, 1).has('cost'));
  assert.ok(!rightsOn(zones, 1).has('backdate'));
  assert.ok(rightsOn(zones, 2).has('operate'));
  assert.ok(rightsOn(zones, 2).has('view'));
  assert.ok(!rightsOn(zones, 2).has('writeoff'));
  assert.equal(rightsOn(zones, 3).size, 0);
  const local = { global: none, assignments: new Map([[5, new Set(['admin'])]]), molOf: new Set() };
  assert.ok(rightsOn(local, 5).has('cost'));
});

test('warehouse: document actions follow rights and status', () => {
  const operate = new Set(['view', 'operate']);
  assert.equal(docActions({ type: 'issue', status: 'draft' }, { src: operate }).post, true);
  assert.equal(docActions({ type: 'issue', status: 'draft' }, { src: new Set(['view', 'request']), isAuthor: true }).post, false);
  assert.equal(docActions({ type: 'issue', status: 'draft' }, { src: new Set(['view', 'request']), isAuthor: true }).request, true);
  assert.equal(docActions({ type: 'transfer', status: 'draft' }, { src: operate }).ship, true);
  assert.equal(docActions({ type: 'transfer', status: 'draft' }, { src: operate }).post, undefined);
  assert.equal(docActions({ type: 'transfer', status: 'shipped' }, { src: operate, dst: new Set() }).receive, false);
  assert.equal(docActions({ type: 'transfer', status: 'shipped' }, { dst: operate }).receive, true);
  assert.equal(docActions({ type: 'writeoff', status: 'draft' }, { src: operate }).post, false);
  assert.equal(docActions({ type: 'writeoff', status: 'draft' }, { src: new Set(['writeoff']) }).post, true);
  assert.equal(docActions({ type: 'correction', status: 'draft' }, { src: operate }).post, false);
  assert.equal(docActions({ type: 'receipt', status: 'posted' }, { dst: operate }).storno, true);
  assert.equal(docActions({ type: 'storno', status: 'posted' }, { src: new Set(['admin']) }).storno, undefined);
  assert.equal(docActions({ type: 'handover', status: 'pending' }, { isRecipient: true }).confirm, true);
  assert.equal(docActions({ type: 'handover', status: 'pending' }, { isHolder: true }).confirm, false);
});

test('warehouse: shortages and stock flags', () => {
  const list = shortages([{ key: 'a', qty: 10 }, { key: 'b', qty: 2 }], new Map([['a', 4], ['b', 5]]));
  assert.deepEqual(list, [{ key: 'a', qty: 10, available: 4, short: 6 }]);
  const flags = stockFlags({ qty: 3, min_qty: 5, reserved: 1, last_move_at: '2026-01-01T00:00:00Z', next_expiry: '2026-10-20' }, { today: '2026-10-14', staleDays: 90, expiryWarnDays: 30 });
  assert.deepEqual(flags, { belowMin: true, out: false, reserved: true, stale: true, expiring: true, expired: false });
  assert.equal(stockFlags({ qty: 0 }, { today: '2026-10-14' }).out, true);
});

test('warehouse: cost keys are stripped from any payload', () => {
  const payload = { items: [{ qty: 5, amount: 10, price: 2, item: { name: 'x', lastPrice: 1 } }], total: 3, totals: { amount: 1 }, document: { sum: 5, currency: 'USD' } };
  const out = stripCost(payload);
  assert.deepEqual(out, { items: [{ qty: 5, item: { name: 'x' } }], total: 3, document: {} });
  assert.ok(COST_KEYS.has('amount') && !COST_KEYS.has('total') && !COST_KEYS.has('value'));
});

test('warehouse: scan codes and barcodes', () => {
  assert.deepEqual(parseOwnCode('WI-12'), { kind: 'item', id: 12 });
  assert.deepEqual(parseOwnCode('wb-7'), { kind: 'bin', id: 7 });
  assert.equal(parseOwnCode('4600000000000'), null);
  assert.equal(ownCode('instance', 5), 'WT-5');
  assert.equal(validEan13('4006381333931'), true);
  assert.equal(validEan13('4006381333932'), false);
  assert.equal(barcodeKind('4006381333931'), 'ean13');
  assert.equal(barcodeKind('ABC-123'), 'code128');
});

test('warehouse: CSV export neutralises formulas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-12,5'), '"-12,5"');
  assert.equal(csvCell('@SUM'), `"'@SUM"`);
});

test('warehouse: notifications, webhooks and texts are catalogued', () => {
  const kinds = NOTIFICATION_EVENTS.filter((event) => event.module === 'warehouse').map((event) => event.kind);
  for (const kind of ['warehouse.transfer_incoming', 'warehouse.requested', 'warehouse.issued', 'warehouse.discrepancy', 'warehouse.handover', 'warehouse.stock_low', 'warehouse.expiring', 'warehouse.service', 'warehouse.tool_overdue', 'warehouse.post_failed']) assert.ok(kinds.includes(kind), kind);
  const events = EVENT_CATALOG.filter((event) => event.area === 'warehouse').map((event) => event.type);
  for (const type of ['warehouse.document.posted', 'warehouse.stock.low', 'warehouse.transfer.received', 'warehouse.transfer.shipped', 'warehouse.document.reversed', 'warehouse.tool.handover']) assert.ok(events.includes(type), type);
  for (const [kind, fn] of Object.entries(WAREHOUSE_MESSAGES)) {
    const texts = fn({ doc: { number: 'ПМ-00001', lines: 2 }, from: 'A', to: 'B', warehouse: 'A', rows: [{ name: 'Цемент', qty: 1, min: 5, unit: 'кг', diff: -1, batch: 'P1', expiresOn: '2026-10-20' }], act: 'АР-00001', actor: 'Иван', tool: 'Дрель', due: '2026-10-20', items: '• Дрель', accepted: true, reason: 'нет остатка' });
    assert.ok(texts.ru.title && texts.en.title, kind);
    // Notifications never carry sums.
    assert.ok(!/\$|USD|сом/.test(`${texts.ru.title} ${texts.ru.body}`), kind);
  }
});
