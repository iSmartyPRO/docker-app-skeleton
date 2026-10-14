import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actLines,
  applyCountOp,
  areaProgress,
  cleanOp,
  frozenHit,
  inScope,
  nextDue,
  reconcile,
  reconcileTotals,
  reminderKey,
  sessionActions,
  sessionAreas,
  sessionFreezes,
  subtree,
} from '../modules/warehouse/inventoryLogic.js';
import { COST_KEYS, stripCost } from '../modules/warehouse/logic.js';
import { WAREHOUSE_MESSAGES } from '../modules/warehouse/messages.js';

/* Inventory sessions: pure rules (docs/warehouse.md#inventory-sessions). */

test('freeze: block policy freezes while counting, in review and until the act is posted', () => {
  const s = (status, policy = 'block') => ({ status, freeze_policy: policy });
  assert.equal(sessionFreezes(s('draft')), false);
  assert.equal(sessionFreezes(s('counting')), true);
  assert.equal(sessionFreezes(s('review')), true);
  assert.equal(sessionFreezes(s('finished'), 'pending'), true);
  assert.equal(sessionFreezes(s('finished'), 'draft'), true);
  assert.equal(sessionFreezes(s('finished'), 'posted'), false);
  assert.equal(sessionFreezes(s('finished'), 'rejected'), false);
  assert.equal(sessionFreezes(s('cancelled')), false);
  assert.equal(sessionFreezes(s('counting', 'record')), false);
});

test('scope: warehouse, bins (never stock without a bin), categories', () => {
  const scope = { warehouse_id: 1, bin_ids: [10, 11], category_ids: [] };
  assert.equal(inScope(scope, { warehouseId: 1, binId: 10 }), true);
  assert.equal(inScope(scope, { warehouseId: 1, binId: 12 }), false);
  assert.equal(inScope(scope, { warehouseId: 1, binId: null }), false);
  assert.equal(inScope(scope, { warehouseId: 2, binId: 10 }), false);
  const cats = { warehouse_id: 1, bin_ids: [], category_ids: [5] };
  assert.equal(inScope(cats, { warehouseId: 1, binId: null, categoryId: 5 }), true);
  assert.equal(inScope(cats, { warehouseId: 1, binId: 3, categoryId: 6 }), false);
  assert.equal(inScope({ warehouse_id: 1, bin_ids: [], category_ids: [] }, { warehouseId: 1 }), true);
});

test('frozenHit: only changed warehouse rows in scope hit', () => {
  const sessions = [{ id: 7, number: 'ИНВ-00001', warehouse_id: 1, bin_ids: [], category_ids: [5] }];
  const cats = new Map([[100, 5], [101, 6]]);
  assert.equal(frozenHit(sessions, [{ item_id: 101, warehouse_id: 1, bin_id: null, holder_type: 'warehouse', dq: -1 }], cats), null);
  assert.equal(frozenHit(sessions, [{ item_id: 100, warehouse_id: 1, bin_id: null, holder_type: 'employee', dq: 1 }], cats), null);
  assert.equal(frozenHit(sessions, [{ item_id: 100, warehouse_id: 1, bin_id: null, holder_type: 'warehouse', dq: 0 }], cats), null);
  const hit = frozenHit(sessions, [{ item_id: 100, warehouse_id: 1, bin_id: 4, holder_type: 'warehouse', dq: -2 }], cats);
  assert.equal(hit.session.id, 7);
  assert.equal(hit.itemId, 100);
});

test('count operations: add, set, never below zero; ops are validated', () => {
  assert.equal(applyCountOp(5, { kind: 'add', baseQty: 3 }), 8);
  assert.equal(applyCountOp(5, { kind: 'add', baseQty: -9 }), 0);
  assert.equal(applyCountOp(5, { kind: 'set', baseQty: 2 }), 2);
  assert.equal(applyCountOp(5, { kind: 'done' }), 5);
  assert.equal(cleanOp({ clientId: 'x', kind: 'add', itemId: 1, qty: 1 }), null); // id too short
  assert.equal(cleanOp({ clientId: 'abcdef12', kind: 'drop', itemId: 1, qty: 1 }), null);
  assert.equal(cleanOp({ clientId: 'abcdef12', kind: 'add', qty: 1 }), null); // no item
  assert.equal(cleanOp({ clientId: 'abcdef12', kind: 'set', itemId: 1, qty: -1 }), null);
  assert.equal(cleanOp({ clientId: 'abcdef12;drop', kind: 'add', itemId: 1, qty: 1 }), null);
  const op = cleanOp({ clientId: 'k-1a2b3c', kind: 'add', binId: '3', itemId: 9, qty: '2,5', unit: 'уп' });
  assert.deepEqual({ kind: op.kind, binId: op.binId, itemId: op.itemId, qty: op.qty, unit: op.unit }, { kind: 'add', binId: 3, itemId: 9, qty: 2.5, unit: 'уп' });
  assert.equal(cleanOp({ clientId: 'k-1a2b3d', kind: 'done', binId: null }).kind, 'done');
});

test('reconcile: two counters in one bin are summed and flagged; the manager decides', () => {
  const book = [
    { bin_id: 1, item_id: 10, instance_id: null, qty: 100 },
    { bin_id: 1, item_id: 11, instance_id: null, qty: 5 },
    { bin_id: 2, item_id: 10, instance_id: null, qty: 7 },
  ];
  const counts = [
    { bin_id: 1, item_id: 10, instance_id: null, counter_id: 501, qty: 60 },
    { bin_id: 1, item_id: 10, instance_id: null, counter_id: 502, qty: 38 },
    { bin_id: 1, item_id: 12, instance_id: null, counter_id: 501, qty: 3 },
    { bin_id: 2, item_id: 10, instance_id: null, counter_id: 502, qty: 7 },
  ];
  const areas = [{ bin_id: 1, status: 'done' }, { bin_id: 2, status: 'counting' }];
  const costs = new Map([[10, 2], [11, 10], [12, 1.5]]);
  const rows = reconcile({ book, counts, areas, costs });
  const by = (bin, item) => rows.find((r) => r.binId === bin && r.itemId === item);
  assert.equal(by(1, 10).counted, 98);
  assert.equal(by(1, 10).diff, -2);
  assert.equal(by(1, 10).sum, -4);
  assert.equal(by(1, 10).conflict, true);
  assert.equal(by(1, 10).status, 'shortage');
  assert.equal(by(1, 11).counted, 0);
  assert.equal(by(1, 11).diff, -5);
  assert.equal(by(1, 12).status, 'surplus');
  assert.equal(by(1, 12).sum, 4.5);
  assert.equal(by(2, 10).status, 'pending');
  assert.equal(by(2, 10).diff, null);
  const totals = reconcileTotals(rows);
  assert.equal(totals.conflicts, 1);
  assert.equal(totals.pending, 1);
  assert.equal(totals.shortageSum, -54);
  assert.equal(totals.surplusSum, 4.5);
  assert.equal(totals.grossSum, 58.5);
  // The manager takes 100 for the conflict.
  const decided = reconcile({ book, counts, areas, costs, finals: [{ bin_id: 1, item_id: 10, instance_id: null, qty: 100 }] });
  const row = decided.find((r) => r.binId === 1 && r.itemId === 10);
  assert.equal(row.conflict, false);
  assert.equal(row.status, 'match');
  // Without the cost right there are no sums at all.
  const blind = reconcile({ book, counts, areas, costs: null });
  assert.ok(blind.every((r) => r.sum === null && r.cost === null));
  assert.equal(reconcileTotals(blind).grossSum, null);
});

test('reconcile: serial items scanned by instance are compared per instance', () => {
  const items = new Map([[20, { tracking: 'serial' }]]);
  const book = [
    { bin_id: null, item_id: 20, instance_id: 1, qty: 1 },
    { bin_id: null, item_id: 20, instance_id: 2, qty: 1 },
  ];
  const counts = [
    { bin_id: null, item_id: 20, instance_id: 1, counter_id: 9, qty: 1 },
    { bin_id: null, item_id: 20, instance_id: 3, counter_id: 9, qty: 1 },
  ];
  const rows = reconcile({ book, counts, areas: [{ bin_id: null, status: 'done' }], items });
  assert.equal(rows.find((r) => r.instanceId === 1).status, 'match');
  assert.equal(rows.find((r) => r.instanceId === 2).status, 'shortage');
  assert.equal(rows.find((r) => r.instanceId === 3).status, 'surplus');
  // An instance held somewhere else is not moved by the count.
  const lines = actLines(rows, { elsewhere: new Set([3]) });
  assert.deepEqual(lines.map((l) => [l.instanceId, l.countedQty]).sort(), [[1, 1], [2, 0]]);
  // Without scans the serial item is compared by quantity.
  const byQty = reconcile({ book, counts: [{ bin_id: null, item_id: 20, instance_id: null, counter_id: 9, qty: 2 }], areas: [{ bin_id: null, status: 'done' }], items });
  assert.equal(byQty.length, 1);
  assert.equal(byQty[0].status, 'match');
});

test('act lines: counted areas only, matches included', () => {
  const rows = reconcile({
    book: [{ bin_id: 1, item_id: 10, qty: 3 }, { bin_id: 2, item_id: 10, qty: 4 }],
    counts: [{ bin_id: 1, item_id: 10, counter_id: 1, qty: 3 }, { bin_id: 2, item_id: 10, counter_id: 1, qty: 1 }],
    areas: [{ bin_id: 1, status: 'done' }, { bin_id: 2, status: 'todo' }],
  });
  assert.deepEqual(actLines(rows), [{ itemId: 10, binId: 1, instanceId: null, countedQty: 3, bookQty: 3 }]);
});

test('areas: leaves and bins with stock, «без ячейки» only for a full count', () => {
  const bins = [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 3, parent_id: 1 }, { id: 4, parent_id: null }];
  assert.deepEqual(sessionAreas({ binsEnabled: false, bins }), [null]);
  assert.deepEqual(sessionAreas({ binsEnabled: true, bins }), [2, 3, 4, null]);
  assert.deepEqual(sessionAreas({ binsEnabled: true, bins, stockBins: new Set([1]) }), [1, 2, 3, 4, null]);
  assert.deepEqual(sessionAreas({ binsEnabled: true, bins, scopeBins: subtree(bins, [1]) }), [2, 3]);
  assert.deepEqual(subtree(bins, [1]).sort(), [1, 2, 3]);
  const p = areaProgress([{ status: 'done' }, { status: 'done' }, { status: 'todo' }, { status: 'recount' }]);
  assert.deepEqual(p, { total: 4, done: 2, recount: 1, counting: 0, todo: 1, percent: 50 });
});

test('schedules: next due date and weekly reminder keys', () => {
  assert.equal(nextDue('2026-10-14', 30), '2026-11-13');
  assert.equal(nextDue('2026-12-31', 1), '2027-01-01');
  assert.equal(reminderKey({ id: 5, next_on: '2026-10-20' }, '2026-10-14'), null);
  assert.equal(reminderKey({ id: 5, next_on: '2026-10-14' }, '2026-10-14'), 'invdue:5:2026-10-14:0');
  assert.equal(reminderKey({ id: 5, next_on: '2026-10-14' }, '2026-10-20'), 'invdue:5:2026-10-14:0');
  assert.equal(reminderKey({ id: 5, next_on: '2026-10-14' }, '2026-10-21'), 'invdue:5:2026-10-14:1');
});

test('session actions follow the status and the role', () => {
  const a = sessionActions({ status: 'counting' }, { manage: true });
  assert.equal(a.finish, true);
  assert.equal(a.count, true);
  assert.equal(a.start, false);
  const c = sessionActions({ status: 'counting' }, { counter: true });
  assert.equal(c.count, true);
  assert.equal(c.finish, false);
  assert.equal(c.reconcile, false);
  assert.equal(sessionActions({ status: 'review' }, { counter: true }).count, true);
  assert.equal(sessionActions({ status: 'finished' }, { manage: true, docStatus: 'pending' }).reopen, false);
  assert.equal(sessionActions({ status: 'finished' }, { manage: true, docStatus: 'rejected' }).reopen, true);
  assert.equal(sessionActions({ status: 'draft' }, { manage: true }).start, true);
});

test('inventory sums are money keys; texts carry no sums', () => {
  for (const key of ['sum', 'cost', 'surplusSum', 'shortageSum', 'grossSum', 'netSum']) assert.ok(COST_KEYS.has(key), key);
  const out = stripCost({ rows: [{ book: 3, counted: 2, sum: -4, cost: 2 }], summary: { matches: 1, grossSum: 4, surplusSum: 0 } });
  assert.deepEqual(out, { rows: [{ book: 3, counted: 2 }], summary: { matches: 1 } });
  for (const kind of ['inventoryAssigned', 'inventoryRecount', 'inventoryDue']) {
    const texts = WAREHOUSE_MESSAGES[kind]({ session: { number: 'ИНВ-00001', title: 'T' }, warehouse: 'W', actor: 'A', bins: ['A-01'], bin: 'A-01', item: 'X', categories: ['C'], due: '2026-10-14', everyDays: 30 });
    assert.ok(texts.ru.title && texts.en.title, kind);
    assert.doesNotMatch(JSON.stringify(texts), /\$|USD|сом/);
  }
});

test('notification kinds of inventories are catalogued', async () => {
  const { NOTIFICATION_EVENTS } = await import('../services/notificationCatalog.js');
  const kinds = NOTIFICATION_EVENTS.filter((event) => event.module === 'warehouse').map((event) => event.kind);
  for (const kind of ['warehouse.inventory_assigned', 'warehouse.inventory_due']) assert.ok(kinds.includes(kind), kind);
});
