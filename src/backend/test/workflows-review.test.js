import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replanStages } from '../modules/approvals/logic.js';
import { tokenAllowsType } from '../modules/approvals/engine.js';

/*
 * Pure rules behind the code-review fixes of approvals, procurement and
 * contracts (the database side is in *-review.db.test.js).
 */

const stage = (id) => ({ id, name: id.toUpperCase(), mode: 'any', approvers: [{ kind: 'user', id: 1 }] });

test('replanStages: stages ahead follow the plan, reached ones stay', () => {
  const running = [stage('head')];
  // The amount went up: the CFO stage is added after the current one.
  let next = replanStages(running, 0, { stages: [stage('head'), stage('cfo')], skipped: [] });
  assert.equal(next.changed, true);
  assert.deepEqual(next.stages.map((s) => s.id), ['head', 'cfo']);
  assert.deepEqual(next.added, ['cfo']);
  // It went down again: the stage nobody reached is dropped.
  next = replanStages(next.stages, 0, { stages: [stage('head')], skipped: [{ id: 'cfo', name: 'CFO' }] });
  assert.deepEqual(next.stages.map((s) => s.id), ['head']);
  assert.deepEqual(next.removed, ['cfo']);
  assert.deepEqual(next.skipped, [{ id: 'cfo', name: 'CFO' }]);
  // A stage before the current one that now applies still has to decide (after the current one).
  next = replanStages([stage('head'), stage('it')], 1, { stages: [stage('cfo'), stage('head'), stage('it')], skipped: [] });
  assert.deepEqual(next.stages.map((s) => s.id), ['head', 'it', 'cfo']);
  // The current stage stays even when its condition no longer holds.
  next = replanStages([stage('head'), stage('cfo')], 1, { stages: [stage('head')], skipped: [{ id: 'cfo' }] });
  assert.equal(next.changed, false);
  assert.deepEqual(next.stages.map((s) => s.id), ['head', 'cfo']);
  assert.deepEqual(next.skipped, []);
  // Same stages ahead: the snapshot is kept as it is.
  const kept = [stage('head'), { ...stage('cfo'), approvers: [{ kind: 'user', id: 7 }] }];
  next = replanStages(kept, 0, { stages: [stage('head'), stage('cfo')], skipped: [] });
  assert.equal(next.changed, false);
  assert.equal(next.stages, kept);
});

test('tokenAllowsType: an API token reaches documents only of modules in its scope', () => {
  // A module built into this core (a package's area is known only while it is installed).
  const type = { key: 'kb.request', module: 'kb' };
  const token = (scopes, rules = []) => ({ user: { id: 1 }, apiToken: { policy: { scopes, rules } } });
  assert.equal(tokenAllowsType({ user: { id: 1 } }, type, 'write'), true, 'a session is not affected');
  assert.equal(tokenAllowsType({ system: true }, type, 'write'), true);
  assert.equal(tokenAllowsType(token({ approvals: 'write' }), type, 'read'), false);
  assert.equal(tokenAllowsType(token({ approvals: 'write', kb: 'read' }), type, 'read'), true);
  assert.equal(tokenAllowsType(token({ approvals: 'write', kb: 'read' }), type, 'write'), false);
  assert.equal(tokenAllowsType(token({ approvals: 'write', kb: 'write' }), type, 'write'), true);
  // The token may also come on the request inside a provider context.
  assert.equal(tokenAllowsType({ user: { id: 1 }, req: token({ approvals: 'read' }) }, type, 'read'), false);
  // A deny rule on the module wins.
  assert.equal(tokenAllowsType(token({ kb: 'write' }, [{ effect: 'deny', methods: [], path: '/app/kb/**' }]), type, 'read'), false);
});
