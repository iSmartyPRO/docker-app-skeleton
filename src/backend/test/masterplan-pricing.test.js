import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeGrid, cleanPlans, paymentOptions, paymentSchedule, planTotal, pricesAt } from '../modules/masterplan/pricing.js';
import { canMigrate, looseDay, migrationPlan } from '../modules/masterplan/migration.js';

/*
 * Masterplan additions: price grid by payment form (first payment, monthly
 * payments, rounding, versions by date), status migration by administrators
 * (bypass of the chain and timers), price per m² at a moment.
 */

const WH_PLANS = [
  { name: '100%', mode: 'base', firstPct: 100 },
  { name: 'Рассрочка 50%', mode: 'ppm', ppm: 2200, firstPct: 50, months: 12 },
  { name: 'Рассрочка 30%', mode: 'ppm', ppm: 2500, firstPct: 30, months: 24 },
];

test('price grid: plans are cleaned and checked', () => {
  const plans = cleanPlans(WH_PLANS);
  assert.equal(plans.length, 3);
  assert.deepEqual(plans.map((p) => p.key), ['p1', 'p2', 'p3']);
  assert.equal(plans[0].months, 0, 'full payment has no term');
  assert.equal(plans[1].ppm, 2200);
  assert.throws(() => cleanPlans([]), { code: 'INVALID_FIELD' });
  assert.throws(() => cleanPlans([{ name: '', mode: 'base' }]), { code: 'INVALID_FIELD' });
  assert.throws(() => cleanPlans([{ name: 'x', mode: 'ppm', firstPct: 50, months: 12 }]), { code: 'INVALID_FIELD' }, 'ppm needs a price');
  assert.throws(() => cleanPlans([{ name: 'x', mode: 'base', firstPct: 50 }]), { code: 'INVALID_FIELD' }, 'an installment needs a term');
  assert.throws(() => cleanPlans([{ name: 'x', mode: 'base', firstPct: 120 }]), { code: 'INVALID_FIELD' });
  assert.throws(() => cleanPlans(Array.from({ length: 9 }, (_, i) => ({ name: `p${i}`, mode: 'base' }))), { code: 'INVALID_FIELD' });
  const dup = cleanPlans([{ key: 'a', name: 'A', mode: 'base' }, { key: 'a', name: 'B', mode: 'markup', markupPct: 10, firstPct: 50, months: 6 }]);
  assert.notEqual(dup[0].key, dup[1].key, 'keys are unique');
});

test('price grid: payment schedule — first payment, equal monthly payments, rounding in the last', () => {
  assert.deepEqual(paymentSchedule(212784, 50, 12), { total: 212784, first: 106392, rest: 106392, months: 12, monthly: 8866, last: 8866 });
  // 241 800 × 30 % = 72 540; 169 260 / 24 = 7 052.5 → 7 053, the last one 7 041 (7 053 × 23 + 7 041 = 169 260).
  const s = paymentSchedule(241800, 30, 24);
  assert.equal(s.first, 72540);
  assert.equal(s.monthly, 7053);
  assert.equal(s.first + s.monthly * 23 + s.last, 241800);
  assert.deepEqual(paymentSchedule(193440, 100, 0), { total: 193440, first: 193440, rest: 0, months: 0, monthly: 0, last: 0 });
  assert.equal(paymentSchedule(1000.4, 33.3, 3).total, 1000, 'whole currency units');
  const odd = paymentSchedule(100000, 33.3, 7);
  assert.equal(odd.first + odd.monthly * 6 + odd.last, 100000, 'the parts always add up to the total');
});

test('price grid: totals by mode and the 3 White Hills variants of a 96.72 m² house', () => {
  const unit = { price: 193440, areaTotal: 96.72, currency: 'USD' };
  assert.equal(planTotal({ mode: 'base' }, { price: 193440, area: 96.72 }), 193440);
  assert.equal(planTotal({ mode: 'markup', markupPct: 10 }, { price: 193440, area: 96.72 }), 212784);
  assert.equal(planTotal({ mode: 'ppm', ppm: 2200 }, { price: 0, area: 96.72 }), 212784);
  assert.equal(planTotal({ mode: 'ppm', ppm: 2200 }, { price: 1, area: 0 }), null, 'no area — no price per m²');
  assert.equal(planTotal({ mode: 'ppm', ppm: 2200 }, { price: 1, area: 10, currency: 'KGS', gridCurrency: 'USD' }), null, 'another currency');
  assert.equal(planTotal({ mode: 'base' }, { price: null, area: 10 }), null);
  const grid = { id: 1, effectiveFrom: '2026-10-01', currency: 'USD', plans: cleanPlans(WH_PLANS), plannedPpm: 3000 };
  const out = paymentOptions(unit, grid);
  assert.equal(out.plans.length, 3);
  assert.deepEqual(out.plans.map((p) => p.total), [193440, 212784, 241800]);
  assert.deepEqual(out.plans.map((p) => p.ppm), [2000, 2200, 2500]);
  assert.equal(out.plans[1].first, 106392);
  assert.equal(out.plans[1].monthly, 8866);
  assert.equal(out.plans[2].first, 72540);
  assert.equal(out.planned.ppm, 3000);
  assert.equal(out.planned.total, 290160);
  assert.equal(out.planned.growthPct, 50);
  // A unit without a price and area gets nothing; without a grid — nothing.
  assert.equal(paymentOptions({ price: null, areaTotal: null }, grid), null);
  assert.equal(paymentOptions(unit, null), null);
  // A plot priced by its plot area.
  assert.equal(paymentOptions({ price: 50000, areaPlot: 1000, currency: 'USD' }, grid).plans[1].total, 2200000);
});

test('price grid: the version in force by date, the type’s own before the project’s', () => {
  const grids = [
    { id: 1, typeId: null, effectiveFrom: '2026-01-01' },
    { id: 2, typeId: null, effectiveFrom: '2026-10-01' },
    { id: 3, typeId: null, effectiveFrom: '2027-01-01' },
    { id: 4, typeId: 7, effectiveFrom: '2026-06-01' },
  ];
  assert.equal(activeGrid(grids, null, '2026-10-13').id, 2);
  assert.equal(activeGrid(grids, null, '2026-09-30').id, 1);
  assert.equal(activeGrid(grids, null, '2027-01-01').id, 3, 'a future version starts on its day');
  assert.equal(activeGrid(grids, 7, '2026-10-13').id, 4);
  assert.equal(activeGrid(grids, 7, '2026-05-31').id, 1, 'before the type’s own grid the project’s applies');
  assert.equal(activeGrid(grids, 8, '2026-10-13').id, 2);
  assert.equal(activeGrid(grids, null, '2025-12-31'), null);
  assert.equal(activeGrid([{ id: 5, typeId: null, effectiveFrom: '2026-10-01' }, { id: 6, typeId: null, effectiveFrom: '2026-10-01' }], null, '2026-10-13').id, 6, 'the later of one day');
});

test('price per m² over time: the price of a unit at a moment from its history', () => {
  const units = [
    { node_id: 1, price: 2200, created_at: '2026-01-01' },
    { node_id: 2, price: 500, created_at: '2026-01-01' },
    { node_id: 3, price: 900, created_at: '2026-09-01' },
  ];
  const history = [
    { unit_id: 1, old_price: 2000, new_price: 2100, created_at: '2026-05-01' },
    { unit_id: 1, old_price: 2100, new_price: 2200, created_at: '2026-08-01' },
  ];
  const at = (d) => Object.fromEntries(pricesAt(units, history, d));
  assert.deepEqual(at('2026-03-01'), { 1: 2000, 2: 500 });
  assert.deepEqual(at('2026-06-01'), { 1: 2100, 2: 500 });
  assert.deepEqual(at('2026-10-01'), { 1: 2200, 2: 500, 3: 900 });
});

test('migration: administrators only; any status bypassing the chain and the deal', () => {
  const admin = { isAdmin: true, assignments: [] };
  const projectAdmin = { isAdmin: false, assignments: [{ projectId: 5, nodeId: null, role: 'admin' }] };
  const zoneAdmin = { isAdmin: false, assignments: [{ projectId: 5, nodeId: 9, role: 'admin' }] };
  const head = { isAdmin: false, assignments: [{ projectId: 5, nodeId: null, role: 'sales_head' }] };
  assert.equal(canMigrate(admin, 5), true);
  assert.equal(canMigrate(projectAdmin, 5), true);
  assert.equal(canMigrate(projectAdmin, 6), false);
  assert.equal(canMigrate(zoneAdmin, 5), false, 'an administrator of a zone does not migrate');
  assert.equal(canMigrate(head, 5), false, 'heads of sales use the normal chain');

  const now = new Date('2026-10-13T10:00:00Z');
  const free = { status: 'not_for_sale', price: '193440', contract_amount: null, booking_id: null };
  // not_for_sale → booking directly, without a CRM deal, with no timer.
  const booked = migrationPlan({ row: free, input: { to: 'booking', reason: 'Генплан продаж 06.10.2026', clientName: 'Иванов', managerId: 3, date: '2026-10-06' }, now });
  assert.equal(booked.ok, true);
  assert.equal(booked.set.status, 'booking');
  assert.equal(booked.set.client_name, 'Иванов');
  assert.equal(booked.set.manager_id, 3);
  assert.equal(booked.set.booking_id, null, 'no timer: never expires');
  assert.equal(booked.endsAt, null);
  assert.equal(booked.set.status_changed_at.toISOString().slice(0, 10), '2026-10-06');
  // → sold dated 06.10.2026: contract amount = price, paid in full.
  const sold = migrationPlan({ row: free, input: { to: 'sold', reason: 'Генплан', date: '2026-10-06', contractNumber: 'WH-17' }, now });
  assert.equal(sold.set.status, 'sold');
  assert.equal(sold.set.contract_amount, 193440);
  assert.equal(sold.set.paid_amount, 193440);
  assert.equal(sold.set.contract_date, '2026-10-06', 'the contract date defaults to the status date');
  assert.equal(sold.set.contract_number, 'WH-17');
  // With an end date the reserve gets a timer that ends that day.
  const timed = migrationPlan({ row: free, input: { to: 'reserve', reason: 'x', endsAt: '2026-10-20' }, now });
  assert.equal(timed.endsAt.toISOString(), '2026-10-20T23:59:59.000Z');
  assert.equal(migrationPlan({ row: free, input: { to: 'reserve', reason: 'x', endsAt: '2026-10-01' }, now }).code, 'ENDS_IN_PAST');
  assert.equal(migrationPlan({ row: free, input: { to: 'sold', endsAt: '2026-10-01', reason: 'x' }, now }).ok, true, 'an end date matters only for reserve / booking');
  // A reason is mandatory; unknown statuses are refused.
  assert.equal(migrationPlan({ row: free, input: { to: 'booking', reason: '  ' }, now }).code, 'REASON_REQUIRED');
  assert.equal(migrationPlan({ row: free, input: { to: 'gone', reason: 'x' }, now }).code, 'INVALID_STATUS');
  // The same status may be migrated again (to add the client / contract).
  assert.equal(migrationPlan({ row: { ...free, status: 'booking' }, input: { to: 'booking', reason: 'x', clientName: 'B' }, now }).ok, true);
  // Back to free sale: everything about the client is cleared and remembered in the history.
  const back = migrationPlan({ row: { status: 'sold', client_name: 'A', contract_number: 'N', contract_amount: '10', paid_amount: '10', booking_id: 4 }, input: { to: 'free', reason: 'ошибка' }, now });
  assert.equal(back.set.client_name, null);
  assert.equal(back.set.contract_amount, null);
  assert.equal(back.closeBooking, true);
  assert.equal(back.cleared.client.name, 'A');
  // Closing sales of a sold unit keeps its record.
  const closed = migrationPlan({ row: { status: 'sold', client_name: 'A', contract_amount: '10' }, input: { to: 'not_for_sale', reason: 'x' }, now });
  assert.equal(closed.set.client_name, undefined);
  // handed: the act date defaults to the status date.
  assert.equal(migrationPlan({ row: free, input: { to: 'handed', reason: 'x', date: '2026-09-01' }, now }).set.act_date, '2026-09-01');
  assert.equal(migrationPlan({ row: free, input: { to: 'sold', reason: 'x', contractAmount: -1 }, now }).code, 'INVALID_FIELD');
});

test('migration: dates of the import', () => {
  assert.equal(looseDay('2026-10-06'), '2026-10-06');
  assert.equal(looseDay('06.10.2026'), '2026-10-06');
  assert.equal(looseDay('6/10/2026'), '2026-10-06');
  assert.equal(looseDay('2026-10-06T00:00:00.000Z'), '2026-10-06');
  assert.equal(looseDay(''), null);
  assert.equal(looseDay('31.02.2026'), false);
  assert.equal(looseDay('завтра'), false);
});
