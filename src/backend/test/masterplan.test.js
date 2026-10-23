import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULE_CATALOG, resolveModules } from '../modules/catalog.js';
import { MASTERPLAN_DEFAULTS, sanitizeMasterplan } from '../modules/masterplan/settings.js';
import { platformCatalogEntry } from '../platform/packages/manifestFile.js';
import { NOTIFICATION_EVENTS } from '../services/notificationCatalog.js';
import { DEFAULT_STAGES, DEFAULT_TYPES, ROLES, ROLE_CAPS, STATUSES } from '../modules/masterplan/constants.js';
import {
  actCaps,
  apartmentGrid,
  applyPriceChange,
  bulkCodes,
  capsOf,
  checkExtend,
  checkTransition,
  conflictMessage,
  dealLinkAllowed,
  globalRoles,
  has,
  nextStatuses,
  priceCutAllowed,
  projectUnit,
  readCaps,
  rolesAt,
  scheduleState,
  seesProject,
  weightedReadiness,
} from '../modules/masterplan/rules.js';
import { warningDue } from '../modules/masterplan/sales.js';
import { cleanPoints } from '../modules/masterplan/projects.js';
import { safeSvg } from '../modules/masterplan/media.js';
import { inheritReadiness } from '../modules/masterplan/shapes.js';
import { toBase } from '../modules/masterplan/dashboard.js';
import { cleanAttrs, unitCharacteristics, unitCommercial } from '../modules/masterplan/nodes.js';
import { csvCell, parseNumber } from '../modules/masterplan/util.js';

const caps = (...roles) => capsOf(new Set(roles));
const go = (from, to, roles, extra = {}) =>
  checkTransition({ unit: { status: from, managerId: extra.managerId ?? 7, dealId: extra.dealId ?? null }, to, caps: caps(...roles), userId: extra.userId ?? 7, input: extra.input || {}, opts: { crmEnabled: true, requireDeal: true, dealHasClient: true, ...(extra.opts || {}) } });

test('package: masterplan is off by default, permissions are module roles, settings are sanitized', async () => {
  // Not built into the core: its catalog entry comes from the package manifest (module.json + settings.js).
  assert.ok(!MODULE_CATALOG.some((entry) => entry.id === 'masterplan'), 'not in the core catalog');
  const settings = await import('../modules/masterplan/settings.js');
  const config = JSON.parse(readFileSync(new URL('../modules/masterplan/module.json', import.meta.url), 'utf8'));
  const entry = platformCatalogEntry({ id: 'masterplan', permissions: config.permissions, settings: { defaultEnabled: settings.defaultEnabled, defaults: settings.defaults, public: [] } });
  MODULE_CATALOG.push({ ...entry, sanitize: settings.sanitizeSettings });
  try {
    const fresh = resolveModules();
    assert.equal(fresh.masterplan.enabled, false);
    assert.equal(fresh.masterplan.settings.reserveHours, 48);
  } finally {
    MODULE_CATALOG.pop();
  }
  for (const role of ROLES) assert.ok(config.permissions.includes(`masterplan.${role}`), role);
  assert.equal(config.permissions.length, ROLES.length);
  const next = sanitizeMasterplan(MASTERPLAN_DEFAULTS, {
    currencies: ['usd', 'kgs', 'bad!', 'USD'],
    currency: 'EUR',
    rates: { kgs: 87.5, XX: 1, RUB: -1, USD: 2 },
    statusColors: { free: '#00ff00', sold: 'red', hacked: '#000000' },
    reserveHours: 9999,
    bookingDays: 0,
    managerExtensions: '2',
    reserveLimit: -5,
    warnHours: [2, 24, 24, 'x', 0],
    requireDeal: 'no',
    stageMap: { 12: 'deposit', 13: 'teleport', abc: 'sold' },
  });
  assert.deepEqual(next.currencies, ['USD', 'KGS']);
  assert.equal(next.currency, 'USD', 'a currency outside the list falls back');
  assert.deepEqual(next.rates, { KGS: 87.5 });
  assert.equal(next.statusColors.free, '#00FF00');
  assert.equal(next.statusColors.sold, MASTERPLAN_DEFAULTS.statusColors.sold);
  assert.equal(next.statusColors.hacked, undefined);
  assert.equal(next.reserveHours, 336);
  assert.equal(next.bookingDays, 1);
  assert.equal(next.managerExtensions, 2);
  assert.equal(next.reserveLimit, 0);
  assert.deepEqual(next.warnHours, [24, 2]);
  assert.equal(next.requireDeal, true);
  assert.deepEqual(next.stageMap, { 12: 'deposit' });
});

test('notification kinds of the module are in the catalog', () => {
  for (const kind of ['masterplan.expiring', 'masterplan.expired', 'masterplan.status', 'masterplan.report', 'masterplan.review', 'masterplan.construction', 'masterplan.access']) {
    assert.ok(NOTIFICATION_EVENTS.some((event) => event.kind === kind), kind);
  }
});

test('directories: every seeded type and stage set is consistent', () => {
  assert.equal(new Set(DEFAULT_TYPES.map((type) => type.key)).size, DEFAULT_TYPES.length);
  for (const type of DEFAULT_TYPES) {
    assert.ok(['object', 'plot', 'unit'].includes(type.nodeKind), type.key);
    if (type.stageSet) assert.ok(DEFAULT_STAGES[type.stageSet], type.key);
  }
  for (const [set, stages] of Object.entries(DEFAULT_STAGES)) assert.equal(stages.reduce((sum, [, w]) => sum + w, 0), 100, `${set} weights add up to 100`);
  assert.equal(DEFAULT_STAGES.lowrise.length, 15);
});

test('roles: global roles from permissions, zones from assignments', () => {
  assert.deepEqual([...globalRoles(['*'])], ['admin'], 'a super administrator is the module administrator, not every role');
  assert.deepEqual([...globalRoles(['masterplan.sales', 'crm.admin'])], ['sales']);
  const ctx = {
    userId: 5,
    globalRoles: new Set(),
    assignments: [
      { projectId: 1, nodeId: 10, role: 'foreman' },
      { projectId: 1, nodeId: null, role: 'sales' },
      { projectId: 2, nodeId: 99, role: 'sales_head' },
    ],
  };
  const inA = { project_id: 1, path: [3, 10, 11] };
  const inB = { project_id: 1, path: [3, 20, 21] };
  assert.ok(rolesAt(ctx, inA).has('foreman'));
  assert.ok(!rolesAt(ctx, inB).has('foreman'), 'the foreman of sector A does not act in sector B');
  assert.ok(rolesAt(ctx, inB).has('sales'), 'a project-wide role acts everywhere in the project');
  assert.ok(has(actCaps(ctx, inA), 'build.edit'));
  assert.ok(!has(actCaps(ctx, inB), 'build.edit'));
  assert.ok(has(readCaps(ctx, 1), 'build.view'), 'reading counts every role in the project');
  assert.ok(seesProject(ctx, 2));
  assert.ok(!seesProject(ctx, 3));
  assert.ok(!rolesAt(ctx, { project_id: 2, path: [1, 2] }).has('sales_head'));
  assert.ok(has(capsOf(new Set(['admin'])), 'anything'), 'admin has every capability');
});

test('field hiding: minimum price, clients, amounts by role and ownership; presentation mode', () => {
  const unit = {
    status: 'booking',
    price: 250000,
    minPrice: 230000,
    manager: { id: 7, name: 'Айбек' },
    booking: { endsAt: '2026-10-20T00:00:00Z' },
    deal: { id: 3, title: 'Сделка' },
    client: { name: 'Иванов' },
    contract: { number: '1' },
    paidAmount: 1000,
    remaining: 5,
  };
  const own = projectUnit(unit, { caps: caps('sales'), userId: 7 });
  assert.equal(own.minPrice, undefined);
  assert.equal(own.client.name, 'Иванов', 'a manager sees the client of their own booking');
  const others = projectUnit(unit, { caps: caps('sales'), userId: 8 });
  assert.equal(others.client, undefined);
  assert.equal(others.deal, undefined);
  assert.equal(others.paidAmount, undefined);
  assert.equal(others.manager.name, 'Айбек', '“Бронь (менеджер X)” stays visible');
  const head = projectUnit(unit, { caps: caps('sales_head'), userId: 1 });
  assert.equal(head.minPrice, 230000);
  assert.equal(head.client.name, 'Иванов');
  const build = projectUnit(unit, { caps: caps('construction_head'), userId: 1 });
  assert.equal(build.status, 'booking');
  assert.equal(build.price, undefined);
  assert.equal(build.manager, undefined);
  const foreman = projectUnit(unit, { caps: caps('foreman'), userId: 1 });
  assert.equal(foreman.status, undefined, 'foremen do not see sales data');
  const show = projectUnit(unit, { caps: caps('admin'), userId: 1, presentation: true });
  assert.equal(show.price, 250000);
  for (const key of ['minPrice', 'manager', 'client', 'deal', 'contract', 'paidAmount', 'booking']) assert.equal(show[key], undefined, key);
  const finance = projectUnit(unit, { caps: caps('finance'), userId: 1 });
  assert.equal(finance.paidAmount, 1000);
  assert.equal(finance.minPrice, undefined);
});

test('transitions §6.2: forward moves and who makes them', () => {
  assert.deepEqual(go('free', 'reserve', ['sales']), { ok: true, kind: 'forward' });
  assert.equal(go('free', 'reserve', ['foreman']).code, 'FORBIDDEN');
  assert.equal(go('free', 'booking', ['sales']).code, 'INVALID_TRANSITION', 'no skipping the reserve');
  assert.equal(go('reserve', 'booking', ['sales'], { input: { dealId: 5 } }).ok, true);
  assert.equal(go('reserve', 'booking', ['sales'], { userId: 8, input: { dealId: 5 } }).code, 'NOT_OWN', 'only the own reserve');
  assert.equal(go('reserve', 'booking', ['sales_head'], { userId: 8, input: { dealId: 5 } }).ok, true);
  assert.equal(go('reserve', 'booking', ['sales'], { opts: { dealHasClient: true }, input: {} }).code, 'DEAL_REQUIRED');
  assert.equal(go('reserve', 'booking', ['sales'], { input: { dealId: 5 }, opts: { dealHasClient: false } }).code, 'CLIENT_REQUIRED');
  assert.equal(go('reserve', 'booking', ['sales'], { opts: { crmEnabled: false, dealHasClient: false }, input: { client: { name: 'Иванов' } } }).ok, true, 'without the CRM a client name is enough');
  assert.equal(go('booking', 'deposit', ['sales']).code, 'FORBIDDEN');
  assert.equal(go('booking', 'deposit', ['finance']).ok, true);
  assert.equal(go('deposit', 'contract', ['legal']).code, 'CONTRACT_REQUIRED');
  assert.equal(go('deposit', 'contract', ['legal'], { input: { contractNumber: 'A-1', contractDate: '2026-10-13' } }).ok, true);
  assert.equal(go('deposit', 'contract', ['sales_head'], { input: { contractNumber: 'A-1', contractDate: '2026-10-13' } }).ok, true);
  assert.equal(go('deposit', 'contract', ['finance'], { input: { contractNumber: 'A-1', contractDate: '2026-10-13' } }).code, 'FORBIDDEN');
  assert.equal(go('contract', 'sold', ['finance']).ok, true);
  assert.equal(go('contract', 'sold', ['legal']).code, 'FORBIDDEN');
  assert.equal(go('sold', 'handed', ['construction_head']).code, 'ACT_DATE_REQUIRED');
  assert.equal(go('sold', 'handed', ['construction_head'], { input: { actDate: '2026-10-13' } }).ok, true);
  assert.equal(go('sold', 'handed', ['legal'], { input: { actDate: '2026-10-13' } }).ok, true);
  assert.equal(go('sold', 'sold', ['admin']).code, 'SAME_STATUS');
});

test('transitions §6.2: release, closing, rollback, reserve limit', () => {
  assert.equal(go('reserve', 'free', ['sales']).code, 'REASON_REQUIRED');
  assert.deepEqual(go('booking', 'free', ['sales'], { input: { reason: 'передумал' } }), { ok: true, kind: 'release' });
  assert.equal(go('booking', 'free', ['sales'], { userId: 8, input: { reason: 'x' } }).code, 'NOT_OWN');
  assert.equal(go('booking', 'free', ['sales_head'], { userId: 8, input: { reason: 'x' } }).ok, true);
  assert.equal(go('free', 'not_for_sale', ['sales_head']).code, 'FORBIDDEN', 'only management closes sales');
  assert.deepEqual(go('free', 'not_for_sale', ['executive']), { ok: true, kind: 'close' });
  assert.equal(go('contract', 'not_for_sale', ['executive']).code, 'REASON_REQUIRED');
  assert.deepEqual(go('not_for_sale', 'free', ['executive']), { ok: true, kind: 'open' });
  assert.equal(go('not_for_sale', 'free', ['sales']).code, 'FORBIDDEN');
  assert.equal(go('contract', 'free', ['sales_head']).code, 'REASON_REQUIRED');
  assert.deepEqual(go('contract', 'free', ['sales_head'], { input: { reason: 'расторжение' } }), { ok: true, kind: 'rollback' });
  assert.equal(go('sold', 'contract', ['legal'], { input: { reason: 'x' } }).code, 'FORBIDDEN');
  assert.equal(go('handed', 'sold', ['executive'], { input: { reason: 'x' } }).ok, true);
  assert.equal(go('not_for_sale', 'reserve', ['admin']).code, 'INVALID_TRANSITION');
  assert.equal(go('free', 'reserve', ['sales'], { opts: { reserveLimit: 5, activeReserves: 5 } }).code, 'RESERVE_LIMIT');
  assert.equal(go('free', 'reserve', ['sales'], { opts: { reserveLimit: 5, activeReserves: 4 } }).ok, true);
  assert.equal(go('free', 'reserve', ['sales_head'], { opts: { reserveLimit: 5, activeReserves: 9 } }).ok, true, 'heads are not limited');
  assert.equal(go('free', 'reserve', ['sales'], { opts: { reserveLimit: 0, activeReserves: 99 } }).ok, true, '0 = no limit');
  assert.equal(go('free', 'teleported', ['admin']).code, 'INVALID_STATUS');
});

test('next statuses for the card buttons', () => {
  assert.deepEqual(nextStatuses({ unit: { status: 'free', managerId: null }, caps: caps('sales'), userId: 7 }), ['reserve']);
  assert.deepEqual(nextStatuses({ unit: { status: 'reserve', managerId: 7 }, caps: caps('sales'), userId: 7 }), ['free', 'booking']);
  assert.deepEqual(nextStatuses({ unit: { status: 'reserve', managerId: 9 }, caps: caps('sales'), userId: 7 }), []);
  assert.deepEqual(nextStatuses({ unit: { status: 'booking', managerId: 9 }, caps: caps('finance'), userId: 7 }), ['deposit']);
  assert.ok(nextStatuses({ unit: { status: 'free' }, caps: caps('admin'), userId: 1 }).includes('not_for_sale'));
  assert.deepEqual(nextStatuses({ unit: { status: 'free' }, caps: caps('foreman'), userId: 1 }), []);
});

test('extensions: the manager once, then the head of sales', () => {
  const unit = { status: 'booking', managerId: 7 };
  assert.equal(checkExtend({ unit, booking: { extensions: 0 }, caps: caps('sales'), userId: 7 }).ok, true);
  assert.equal(checkExtend({ unit, booking: { extensions: 1 }, caps: caps('sales'), userId: 7 }).code, 'EXTEND_LIMIT');
  assert.equal(checkExtend({ unit, booking: { extensions: 1 }, caps: caps('sales'), userId: 7, managerExtensions: 2 }).ok, true);
  assert.equal(checkExtend({ unit, booking: { extensions: 0 }, caps: caps('sales'), userId: 8 }).code, 'NOT_OWN');
  assert.equal(checkExtend({ unit, booking: { extensions: 5 }, caps: caps('sales_head'), userId: 8 }).ok, true);
  assert.equal(checkExtend({ unit: { status: 'contract' }, booking: null, caps: caps('admin'), userId: 1 }).code, 'NOT_HELD');
});

test('a held unit is not linked to another deal; the conflict message names the holder', () => {
  assert.equal(dealLinkAllowed({ status: 'reserve', dealId: 3 }, 4), false);
  assert.equal(dealLinkAllowed({ status: 'reserve', dealId: 3 }, 3), true);
  assert.equal(dealLinkAllowed({ status: 'free', dealId: 3 }, 4), true);
  assert.equal(dealLinkAllowed({ status: 'reserve', dealId: null }, 4), true);
  assert.equal(conflictMessage({ status: 'reserve', managerName: 'Мария Ким' }), 'Объект только что забронирован менеджером Мария Ким');
  assert.equal(conflictMessage({ status: 'sold', actorName: 'Финансист' }), 'Объект только что изменён пользователем Финансист');
  assert.match(conflictMessage({ status: 'booking', managerName: 'X' }, 'en'), /reserved by X/);
});

test('prices: bulk modes and the limit of the head of sales', () => {
  assert.equal(applyPriceChange(250000, 'percent', 10), 275000);
  assert.equal(applyPriceChange(250000, 'percent', -15), 212500);
  assert.equal(applyPriceChange(100, 'amount', -150), null);
  assert.equal(applyPriceChange(100.123, 'set', 99.999), 100);
  assert.equal(applyPriceChange(1, 'magic', 2), null);
  assert.equal(priceCutAllowed(100, 85, caps('sales_head'), 10), false);
  assert.equal(priceCutAllowed(100, 91, caps('sales_head'), 10), true);
  assert.equal(priceCutAllowed(100, 50, caps('executive'), 10), true, 'management is not limited');
  assert.equal(priceCutAllowed(100, 50, caps('sales_head', 'executive'), 10), true);
  assert.equal(priceCutAllowed(100, 50, caps('sales_head'), 0), true, '0 = no limit');
  assert.equal(priceCutAllowed(100, 150, caps('sales_head'), 10), true);
});

test('construction: weighted readiness and schedule state', () => {
  assert.equal(weightedReadiness([{ weight: 10, percent: 100 }, { weight: 30, percent: 50 }, { weight: 60, percent: 0 }]), 25);
  assert.equal(weightedReadiness([]), 0);
  assert.equal(weightedReadiness([{ weight: 1, percent: 140 }]), 100);
  assert.deepEqual(scheduleState([], '2026-10-13'), { state: 'no_plan', delayDays: 0 });
  assert.deepEqual(scheduleState([{ planEnd: '2026-10-01', percent: 40 }, { planEnd: '2026-09-28', percent: 100 }], '2026-10-13'), { state: 'behind', delayDays: 12 });
  assert.deepEqual(scheduleState([{ planEnd: '2026-10-20', percent: 100, factEnd: '2026-10-10' }], '2026-10-13'), { state: 'ahead', delayDays: -10 });
  assert.deepEqual(scheduleState([{ planEnd: '2026-10-20', percent: 50 }], '2026-10-13'), { state: 'on_track', delayDays: 0 });
});

test('readiness: units follow their building, levels average their objects by area', () => {
  const type = { stageSet: 'lowrise' };
  const nodes = inheritReadiness([
    { id: 1, kind: 'level', path: [1], readiness: 0 },
    { id: 2, kind: 'object', type, path: [1, 2], readiness: 100, area: 300 },
    { id: 3, kind: 'object', type, path: [1, 3], readiness: 0, area: 100 },
    { id: 4, kind: 'object', type: { stageSet: 'apartment' }, path: [1, 4], readiness: 50, area: null },
    { id: 5, kind: 'level', path: [1, 4, 5], readiness: 0 },
    { id: 6, kind: 'unit', type: { stageSet: null }, path: [1, 4, 5, 6], readiness: 0 },
  ]);
  const by = Object.fromEntries(nodes.map((node) => [node.id, node]));
  assert.equal(by[6].readiness, 50, 'an apartment follows its building');
  assert.equal(by[5].readiness, 50, 'a section inside the building too');
  assert.equal(by[1].readiness, Math.round(((300 * 100 + 100 * 0 + 1 * 50) / 401) * 10) / 10);
});

test('bulk codes and apartment grids', () => {
  assert.deepEqual(bulkCodes({ prefix: 'A-1-', from: 1, count: 3, pad: 2 }), ['A-1-01', 'A-1-02', 'A-1-03']);
  assert.equal(bulkCodes({ prefix: 'A-1-', from: 1, count: 15, pad: 2 }).at(-1), 'A-1-15');
  assert.equal(bulkCodes({ count: 10000 }).length, 500);
  const grid = apartmentGrid({ floorFrom: 1, floorTo: 3, perFloor: 4, startNumber: 1 });
  assert.equal(grid.length, 12);
  assert.deepEqual(grid[4], { floor: 2, riser: 1, number: '5' });
  assert.equal(apartmentGrid({ floorFrom: 2, floorTo: 2, perFloor: 2, numbering: 'floor' })[1].number, '202');
});

test('timers: which warning is due', () => {
  const now = new Date('2026-10-13T10:00:00Z');
  const at = (hours) => new Date(now.getTime() + hours * 3600000);
  const total = 48 * 3600000;
  assert.equal(warningDue(at(30), now, [24, 2], null, total), null);
  assert.equal(warningDue(at(20), now, [24, 2], null, total), 24);
  assert.equal(warningDue(at(20), now, [24, 2], 24, total), null, 'sent once');
  assert.equal(warningDue(at(1.5), now, [24, 2], 24, total), 2);
  assert.equal(warningDue(at(1.5), now, [24, 2], null, total), 2, 'a late start jumps to the closest warning');
  assert.equal(warningDue(at(-1), now, [24, 2], null, total), null);
  assert.equal(warningDue(at(10), now, [24, 2], null, 12 * 3600000), null, 'a 12-hour reserve gets no “24 hours left”');
});

test('input cleaning: unit fields, attributes, contours, SVG, CSV, numbers, currencies', () => {
  assert.deepEqual(unitCharacteristics({ areaTotal: '220,5', rooms: '6', finishing: 'pso', paymentForms: ['full', 'crypto'] }), { area_total: 220.5, rooms: 6, finishing: 'pso', payment_forms: ['full'] });
  assert.throws(() => unitCharacteristics({ rooms: '2.5' }), /rooms/);
  assert.throws(() => unitCharacteristics({ areaTotal: '-1' }), /areaTotal/);
  assert.throws(() => unitCommercial({ currency: 'EUR' }, ['USD']), /currency/i);
  assert.deepEqual(unitCommercial({ price: '250 000', minPrice: '' }, ['USD']), { price: 250000, min_price: null });
  assert.deepEqual(cleanAttrs({ material: ' газоблок ', 'bad key!': 1, view: ['горы', 'вода'], drop: null }, { drop: 'x' }), { material: 'газоблок', badkey: 1, view: ['горы', 'вода'] });
  const plan = { width: 1000, height: 500 };
  assert.deepEqual(cleanPoints([[0, 0], [10.04, 0], [10, 10]], plan), [[0, 0], [10, 0], [10, 10]]);
  assert.equal(cleanPoints([[0, 0], [1, 1]], plan), null);
  assert.equal(cleanPoints([[0, 0], [1, 1], ['x', 2]], plan), null);
  assert.equal(cleanPoints([[0, 0], [1, 1], [99999, 2]], plan), null);
  assert.equal(safeSvg('<?xml version="1.0"?><svg viewBox="0 0 1 1"><rect/></svg>'), true);
  assert.equal(safeSvg('<svg onload="alert(1)"/>'), false);
  assert.equal(safeSvg('<svg><script>alert(1)</script></svg>'), false);
  assert.equal(safeSvg('<svg><a href="javascript:x"/></svg>'), false);
  assert.equal(safeSvg('<html><svg/></html>'), false);
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell(1.5), '1,5');
  assert.equal(parseNumber('1 500,50'), 1500.5);
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.equal(toBase(875, 'KGS', { currency: 'USD', rates: { KGS: 87.5 } }), 10);
  assert.equal(toBase(10, 'USD', { currency: 'USD', rates: {} }), 10);
  assert.equal(toBase(10, 'EUR', { currency: 'USD', rates: {} }), 0, 'no rate → not counted');
});

test('every role has known capabilities; statuses are in process order', () => {
  assert.deepEqual(STATUSES, ['not_for_sale', 'free', 'reserve', 'booking', 'deposit', 'contract', 'sold', 'handed']);
  for (const role of ROLES) assert.ok(Array.isArray(ROLE_CAPS[role]) && ROLE_CAPS[role].length, role);
});

test('version conflict: the holder only as far as the person may read it', async () => {
  const { conflict, mayChangeStatus, mayExtend } = await import('../modules/masterplan/sales.js');
  const row = { status: 'reserve', manager_id: 7, manager_name: 'Айбек', actor_name: 'Айбек', version: 4 };
  const full = conflict(row, caps('sales'));
  assert.equal(full.details.holder.manager.name, 'Айбек');
  assert.match(full.message, /Айбек/);
  const marketing = conflict(row, caps('marketing'));
  assert.equal(marketing.details.holder.status, 'reserve', 'status.view: the status');
  assert.equal(marketing.details.holder.manager, null, 'no booking.view: no names');
  assert.doesNotMatch(marketing.message, /Айбек/);
  const foreman = conflict(row, caps('foreman'));
  assert.equal(foreman.details.holder.status, null);
  assert.ok(!mayChangeStatus(caps('foreman')) && !mayChangeStatus(caps('marketing')));
  assert.ok(mayChangeStatus(caps('sales')) && mayChangeStatus(caps('finance')) && mayChangeStatus(caps('construction_head')));
  assert.ok(mayExtend(caps('sales')) && !mayExtend(caps('finance')));
});

test('API tokens: the CRM side of Masterplan needs the CRM scope', async () => {
  const { crmScopeAllows } = await import('../modules/masterplan/access.js');
  const tokenCtx = (crm) => ({ request: { apiToken: { policy: { scopes: { masterplan: 'write', crm }, rules: [] } } } });
  assert.ok(crmScopeAllows({ request: {} }, 'write'), 'a signed-in person is not limited');
  assert.ok(crmScopeAllows({ request: null }, 'write'));
  assert.ok(!crmScopeAllows(tokenCtx('none'), 'read'));
  assert.ok(crmScopeAllows(tokenCtx('read'), 'read'));
  assert.ok(!crmScopeAllows(tokenCtx('read'), 'write'));
  assert.ok(crmScopeAllows(tokenCtx('write'), 'write'));
});

test('registry across projects: a capability counts only where the person has it', async () => {
  const { projectsWithCap } = await import('../modules/masterplan/units.js');
  const ctx = { globalRoles: new Set(), assignments: [{ projectId: 1, nodeId: null, role: 'sales' }, { projectId: 2, nodeId: 5, role: 'foreman' }] };
  assert.deepEqual(projectsWithCap(ctx, 'status.view'), [1]);
  assert.equal(projectsWithCap({ globalRoles: new Set(['sales']), assignments: [] }, 'status.view'), null);
});

test('notifications: an expired reserve is called a reserve', async () => {
  const { mpMessage } = await import('../modules/masterplan/messages.js');
  assert.match(mpMessage('expired', { code: 'A-1', project: 'P', kind: 'reserve' })('ru').title, /^Резерв A-1 снят /);
  assert.match(mpMessage('expired', { code: 'A-1', project: 'P', kind: 'booking' })('ru').title, /^Бронь A-1 снята /);
  assert.match(mpMessage('bulkStatus', { count: 3, to: 'not_for_sale', project: 'P' })('en').title, /Not for sale: 3/);
});
