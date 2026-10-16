import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ancestorIds, buildTree, cleanUnitInput, descendantIds, effectiveTimeZone, isTimeZone, reorderSiblings, walkManager, wouldCycle } from '../modules/org/logic.js';
import { ORG_DEFAULTS, MODULE_CATALOG, resolveModules, sanitizeModules, sanitizeOrg } from '../modules/catalog.js';
import { MODULE_MANIFEST, CORE_SERVICES, validateManifests } from '../modules/manifest.js';
import { cleanRoute, stageSeatPlan, APPROVER_KINDS } from '../modules/approvals/logic.js';

/*
 * Pure parts of the org structure (docs/org-structure.md) and of the
 * «руководитель подразделения автора» approver (docs/approvals.md).
 */

const units = [
  { id: 1, parentId: null, name: 'Company', sort: 10, timeZone: 'Asia/Almaty' },
  { id: 2, parentId: 1, name: 'Office', sort: 10, timeZone: null },
  { id: 3, parentId: 2, name: 'Finance', sort: 20, timeZone: null },
  { id: 4, parentId: 2, name: 'HR', sort: 10, timeZone: 'Europe/Berlin' },
  { id: 5, parentId: 1, name: 'Branch', sort: 20, timeZone: null },
  { id: 6, parentId: 5, name: 'Site', sort: 10, timeZone: null },
];

test('org: ancestors, descendants and the tree', () => {
  assert.deepEqual(ancestorIds(units, 3), [3, 2, 1]);
  assert.deepEqual(descendantIds(units, 1).sort(), [2, 3, 4, 5, 6]);
  assert.deepEqual(descendantIds(units, 6), []);
  const tree = buildTree(units);
  assert.equal(tree.length, 1);
  assert.deepEqual(tree[0].children.map((node) => node.id), [2, 5]);
  assert.deepEqual(tree[0].children[0].children.map((node) => node.id), [4, 3], 'siblings follow sort');
});

test('org: moves that would make a loop are refused', () => {
  assert.equal(wouldCycle(units, 2, 3), true, 'under its own child');
  assert.equal(wouldCycle(units, 1, 6), true, 'under a grandchild');
  assert.equal(wouldCycle(units, 2, 2), true, 'under itself');
  assert.equal(wouldCycle(units, 6, 2), false);
  assert.equal(wouldCycle(units, 3, null), false, 'to the top level');
  // A broken chain (a loop already in data) never hangs the walk.
  const looped = [{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }];
  assert.ok(ancestorIds(looped, 1).length <= 2);
});

test('org: sibling order after a drop', () => {
  assert.deepEqual(reorderSiblings([4, 3], 6, 1), [{ id: 4, sort: 10 }, { id: 6, sort: 20 }, { id: 3, sort: 30 }]);
  assert.deepEqual(reorderSiblings([4, 3], 6, 99).map((item) => item.id), [4, 3, 6], 'clamped to the end');
  assert.deepEqual(reorderSiblings([4, 3, 6], 6, 0).map((item) => item.id), [6, 4, 3], 'the moved one is not counted twice');
  assert.deepEqual(reorderSiblings([], 6).map((item) => item.id), [6]);
});

test('org: the time zone is inherited from the nearest unit that has one', () => {
  assert.deepEqual(effectiveTimeZone(units, 3, 'UTC'), { timeZone: 'Asia/Almaty', inherited: true, from: 1 });
  assert.deepEqual(effectiveTimeZone(units, 4, 'UTC'), { timeZone: 'Europe/Berlin', inherited: false, from: 4 });
  assert.equal(effectiveTimeZone([{ id: 9, parentId: null }], 9, 'Asia/Bishkek').timeZone, 'Asia/Bishkek');
  assert.equal(isTimeZone('Asia/Bishkek'), true);
  assert.equal(isTimeZone('Mars/Olympus'), false);
});

test('org: managerOf walks up when the person is the head or the unit has none', () => {
  const heads = { 1: 100, 2: 200, 3: null, 4: 400, 5: 500, 6: 600 };
  const headOf = (unit) => heads[unit.id] || null;
  // An accountant in Finance (no head): the head of the Office.
  assert.deepEqual(walkManager({ units, unitId: 3, userId: 7, headOf }), { userId: 200, unitId: 2 });
  // The head of HR: not themselves — the head of the Office.
  assert.deepEqual(walkManager({ units, unitId: 4, userId: 400, headOf }), { userId: 200, unitId: 2 });
  // The head of the Office: the Company's head.
  assert.equal(walkManager({ units, unitId: 2, userId: 200, headOf }).userId, 100);
  // The top head has nobody above.
  assert.equal(walkManager({ units, unitId: 1, userId: 100, headOf }), null);
  // A blocked head is skipped.
  assert.equal(walkManager({ units, unitId: 6, userId: 7, headOf, isActive: (id) => id !== 600 }).userId, 500);
});

test('org: unit input is cleaned against the configured types and purposes', () => {
  const settings = ORG_DEFAULTS;
  const unit = cleanUnitInput({ name: '  Sales  <b>', type: 'department', code: 'S-1', purposes: ['sales', 'bogus', 'sales'], timeZone: '', status: 'x', parentId: '5' }, settings);
  assert.equal(unit.name, 'Sales b');
  assert.deepEqual(unit.purposes, ['sales']);
  assert.equal(unit.status, 'active');
  assert.equal(unit.parentId, 5);
  assert.equal(unit.timeZone, null);
  assert.throws(() => cleanUnitInput({ name: 'X', type: 'nope' }, settings), (err) => err.code === 'BAD_TYPE');
  assert.throws(() => cleanUnitInput({ name: ' ', type: 'company' }, settings), (err) => err.code === 'NAME_REQUIRED');
  assert.throws(() => cleanUnitInput({ name: 'X', type: 'company', timeZone: 'Nowhere/City' }, settings), (err) => err.code === 'BAD_TIME_ZONE');
  assert.throws(() => cleanUnitInput({ name: 'X', type: 'company', code: '=cmd' }, settings), (err) => err.code === 'BAD_CODE');
  // A patch keeps what it did not send.
  assert.deepEqual(Object.keys(cleanUnitInput({ name: 'Y' }, settings, { partial: true })), ['name']);
});

test('org: a core module with configurable types; employees requires it', () => {
  const org = MODULE_CATALOG.find((module) => module.id === 'org');
  assert.equal(org.core, true);
  assert.deepEqual(org.permissions, ['org.manage']);
  assert.equal(resolveModules({ org: { enabled: false } }).org.enabled, true, 'always on');
  assert.deepEqual(ORG_DEFAULTS.types.map((type) => type.key), ['company', 'office', 'branch', 'department', 'site']);
  const next = sanitizeOrg(ORG_DEFAULTS, { types: [{ key: 'company' }, { key: 'shop', label: 'Shop', icon: 'cart', color: '#112233', site: true }, { key: 'nameless' }, { key: 'BAD KEY', label: 'x' }] });
  assert.deepEqual(next.types.map((type) => type.key), ['company', 'shop']);
  assert.equal(next.types[1].color, '#112233');
  assert.equal(next.types[1].site, true);
  assert.equal(next.types[0].legal, true, 'stock flags kept');
  assert.deepEqual(sanitizeOrg(ORG_DEFAULTS, { types: [] }).types, ORG_DEFAULTS.types, 'never empty');
  const modules = sanitizeModules(resolveModules({}), { org: { enabled: false, settings: { purposes: [{ key: 'retail', label: 'Retail' }] } } });
  assert.equal(modules.org.enabled, true);
  assert.deepEqual(modules.org.settings.purposes, [{ key: 'retail', label: 'Retail' }]);
  assert.equal(MODULE_MANIFEST.org.category, 'people');
  assert.equal(MODULE_MANIFEST.employees.category, 'people');
  assert.ok(MODULE_MANIFEST.employees.requires.some((link) => link.id === 'org'));
  assert.ok(CORE_SERVICES.some((service) => service.id === 'org'));
  assert.deepEqual(validateManifests(MODULE_MANIFEST, { catalogIds: MODULE_CATALOG.map((module) => module.id), coreIds: MODULE_CATALOG.filter((module) => module.core).map((module) => module.id) }), []);
});

test('approvals: the author’s manager as an approver kind', () => {
  assert.ok(APPROVER_KINDS.includes('manager'));
  const route = cleanRoute({
    stages: [{ name: 'Head', approvers: [{ kind: 'manager' }, { kind: 'manager', level: 1 }, { kind: 'manager', level: 9 }, { kind: 'user', id: 5 }] }],
    escalateTo: [{ kind: 'manager' }, { kind: 'user', id: 7 }],
  });
  assert.deepEqual(route.stages[0].approvers, [{ kind: 'manager', level: 1 }, { kind: 'manager', level: 3 }, { kind: 'user', id: 5 }], 'deduplicated, level clamped');
  assert.deepEqual(route.escalateTo, [{ kind: 'user', id: 7 }], 'escalation goes to fixed people only');
});

test('approvals: manager seats resolve to people, with a fallback when nobody fits', () => {
  const fallback = [{ kind: 'permission', key: 'procurement.admin' }];
  const found = stageSeatPlan([{ kind: 'manager', level: 1 }, { kind: 'role', id: 3 }], { 1: 42 }, fallback);
  assert.deepEqual(found.seats, [{ kind: 'user', id: 42, via: 'manager:1' }, { kind: 'role', id: 3, via: null }]);
  assert.deepEqual(found.missing, []);
  const missing = stageSeatPlan([{ kind: 'manager', level: 1 }], { 1: null }, fallback);
  assert.deepEqual(missing.seats, [{ kind: 'permission', key: 'procurement.admin', via: 'fallback' }]);
  assert.deepEqual(missing.missing, [1]);
  // The route's escalation people stand in; a person already on the stage is not doubled.
  const escalation = stageSeatPlan([{ kind: 'manager', level: 1 }, { kind: 'user', id: 7 }], {}, [{ kind: 'user', id: 7 }, { kind: 'group', id: 2 }]);
  assert.deepEqual(escalation.seats.map((seat) => `${seat.kind}:${seat.id}`), ['user:7', 'group:2']);
  // The manager also named in person: one seat.
  assert.equal(stageSeatPlan([{ kind: 'manager', level: 1 }, { kind: 'user', id: 42 }], { 1: 42 }, fallback).seats.length, 1);
});
