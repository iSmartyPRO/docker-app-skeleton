import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, cleanLimits, cleanRules, decide, effectivePolicy, limitsByTable, normalizePath, ruleMatches } from '../api/scopes.js';
import { cleanEvents, eventMatches } from '../api/events.js';

const policy = (scopes, rules = []) => effectivePolicy({ scopes }, { rules });

test('api paths: /api/v1 and /api normalise to the same path', () => {
  assert.equal(normalizePath('/api/v1/app/tasks/tasks?x=1'), '/app/tasks/tasks');
  assert.equal(normalizePath('/api/app/tasks/tasks/'), '/app/tasks/tasks');
});

test('api areas: modules, account, administration, blocked and free paths', () => {
  assert.deepEqual(classify('/app/tasks/tasks'), { area: 'tasks' });
  assert.deepEqual(classify('/auth/me'), { area: 'account' });
  assert.deepEqual(classify('/admin/groups/3'), { area: 'admin.users' });
  assert.deepEqual(classify('/admin/security/events'), { area: 'admin.security' });
  assert.deepEqual(classify('/admin/settings'), { area: 'admin.settings' });
  assert.deepEqual(classify('/auth/login'), { blocked: true });
  assert.deepEqual(classify('/account/password'), { blocked: true });
  assert.deepEqual(classify('/account/api/tokens'), { blocked: true });
  assert.deepEqual(classify('/admin/api/tokens'), { blocked: true });
  assert.deepEqual(classify('/apps'), { free: true });
});

test('api levels: read allows GET only, write allows everything', () => {
  const p = policy({ tasks: 'read', chat: 'write' });
  assert.equal(decide(p, 'GET', '/app/tasks/tasks').ok, true);
  assert.equal(decide(p, 'POST', '/app/tasks/tasks').scope, 'tasks:write');
  assert.equal(decide(p, 'DELETE', '/app/chat/messages/4').ok, true);
  assert.equal(decide(p, 'GET', '/app/calendar/events').ok, false);
});

test('api rules: deny wins, allow opens, blocked stays blocked', () => {
  const p = policy({ tasks: 'write', chat: 'read' }, [
    { effect: 'deny', methods: ['DELETE'], path: '/app/tasks/**' },
    { effect: 'allow', methods: ['POST'], path: '/app/chat/rooms/*/messages' },
    { effect: 'allow', methods: [], path: '/account/password' },
  ]);
  assert.equal(decide(p, 'DELETE', '/app/tasks/tasks/WEB-1').ok, false);
  assert.equal(decide(p, 'PUT', '/app/tasks/tasks/WEB-1').ok, true);
  assert.equal(decide(p, 'POST', '/app/chat/rooms/12/messages').ok, true);
  assert.equal(decide(p, 'POST', '/app/chat/rooms/12/members').ok, false);
  assert.equal(decide(p, 'PUT', '/account/password').code, 'ROUTE_NOT_AVAILABLE');
});

test('api rules: patterns and cleaning', () => {
  assert.equal(ruleMatches({ methods: [], path: '/app/tasks/**' }, 'GET', '/app/tasks'), true);
  assert.equal(ruleMatches({ methods: [], path: '/app/tasks/*' }, 'GET', '/app/tasks/a/b'), false);
  assert.equal(ruleMatches({ methods: [], path: '/app/tasks/tasks/:ref' }, 'GET', '/app/tasks/tasks/WEB-1'), true);
  const rules = cleanRules([{ effect: 'allow', path: '/api/v1/app/x', methods: ['get', 'BOGUS'] }, { effect: 'maybe', path: '/x' }, { effect: 'deny', path: 'bad path!' }]);
  assert.deepEqual(rules, [{ effect: 'allow', methods: ['GET'], path: '/app/x', note: '' }]);
});

test('api templates: token changes overlay the template', () => {
  const p = effectivePolicy({ scopes: { tasks: 'read', chat: 'write' }, rules: [] }, { scopes: { tasks: 'write', bogus: 'write' } });
  assert.equal(p.scopes.tasks, 'write');
  assert.equal(p.scopes.chat, 'write');
  assert.equal(p.scopes.bogus, undefined);
  assert.equal(p.scopes.calendar, 'none');
});

test('api limits: ids per kind, keyed by access-list table', () => {
  const limits = cleanLimits({ 'tasks.projects': ['3', 3, -1, 'x'], unknown: [1] });
  assert.deepEqual(limits, { 'tasks.projects': [3] });
  assert.deepEqual([...limitsByTable(limits).task_acl], [3]);
  assert.equal(limitsByTable({}), null);
});

test('api events: groups and wildcards', () => {
  assert.equal(eventMatches(['task.*'], 'task.created'), true);
  assert.equal(eventMatches(['task.*'], 'chat.message'), false);
  assert.equal(eventMatches(['*'], 'user.deleted'), true);
  assert.deepEqual(cleanEvents(['task.created', 'task.*', 'nope', 'calendar.*', 'zzz.*']), ['task.created', 'task.*', 'calendar.*']);
});
