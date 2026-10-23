import { test } from 'node:test';
import assert from 'node:assert/strict';

/*
 * The browser package loader's decisions (src/frontend/src/platform/packages/loaderLogic.js;
 * loader.js wires them to fetch, sessionStorage and the DOM): retries within the start-up
 * budget, reloads at most once per server boot and reason, late and after-sign-in answers,
 * duplicates, the entry contract.
 */

const logic = await import('../../frontend/src/platform/packages/loaderLogic.js');

const response = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('fetchInstalled: data on 200; retry on 5xx, 429, a network error or no answer; no retry on 4xx', async () => {
  const calls = [];
  const ok = await logic.fetchInstalled(async (url, options) => (calls.push([url, options]), response(200, { bootId: 'b1', modules: [] })), 1000);
  assert.deepEqual(ok, { data: { bootId: 'b1', modules: [] } });
  assert.equal(calls[0][0], '/api/modules/installed');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.deepEqual(await logic.fetchInstalled(async () => response(503), 1000), { retry: true });
  assert.deepEqual(await logic.fetchInstalled(async () => response(429), 1000), { retry: true });
  assert.deepEqual(await logic.fetchInstalled(async () => response(404), 1000), { retry: false });
  assert.deepEqual(await logic.fetchInstalled(async () => { throw new TypeError('Failed to fetch'); }, 1000), { retry: true });
  // No answer within the time: given up, to be retried.
  assert.deepEqual(await logic.fetchInstalled(() => new Promise(() => {}), 20), { retry: true });
});

test('fetchWithinBudget: retries with growing pauses, never past the deadline', async () => {
  let clock = 0;
  const pauses = [];
  const answers = [{ retry: true }, { retry: true }, { data: { modules: [] } }];
  const result = await logic.fetchWithinBudget(async () => answers.shift(), { timeoutMs: 3000, now: () => clock, sleep: async (ms) => { pauses.push(ms); clock += ms; } });
  assert.deepEqual(result, { data: { modules: [] } });
  assert.deepEqual(pauses, [250, 500]);
  // Always failing: stops at the budget.
  clock = 0;
  pauses.length = 0;
  let attempts = 0;
  const failed = await logic.fetchWithinBudget(async () => (attempts++, (clock += 100), { retry: true }), { timeoutMs: 3000, now: () => clock, sleep: async (ms) => { pauses.push(ms); clock += ms; } });
  assert.deepEqual(failed, { retry: true });
  assert.ok(clock <= 3000, `ended at ${clock}`);
  assert.ok(attempts >= 3);
  // No time at all: no attempt.
  assert.equal(await logic.fetchWithinBudget(async () => ({ data: {} }), { timeoutMs: 10, now: () => 0, sleep: async () => {} }), null);
});

test('background retries: 2 s doubling to 60 s, ten attempts', () => {
  assert.deepEqual(logic.backgroundDelays(), [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000, 60000, 60000]);
});

test('shouldReload: once per server boot and reason; never without storage', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.equal(logic.shouldReload(storage, 'late', 'boot1'), true);
  assert.equal(logic.shouldReload(storage, 'late', 'boot1'), false, 'not twice for the same boot');
  assert.equal(logic.shouldReload(storage, 'signin', 'boot1'), true, 'another reason');
  assert.equal(logic.shouldReload(storage, 'signin', 'boot2'), true, 'a new server boot');
  const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} };
  assert.equal(logic.shouldReload(broken, 'late', 'boot1'), false, 'blocked storage: no reload (it could loop)');
  const readOnly = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(logic.shouldReload(readOnly, 'late', 'boot1'), false);
});

test('late answers: reload for new packages, watch the sign-in when signed out, retry when it failed', () => {
  const known = [{ id: 'hello' }];
  assert.equal(logic.lateAnswerAction({ retry: true }, known), 'retry');
  assert.equal(logic.lateAnswerAction(null, known), 'retry');
  assert.equal(logic.lateAnswerAction({ data: { modules: [{ id: 'hello' }] } }, known), null, 'nothing new');
  assert.equal(logic.lateAnswerAction({ data: { modules: [{ id: 'hello' }, { id: 'masterplan' }] } }, known), 'reload');
  assert.equal(logic.lateAnswerAction({ data: { signedIn: false, modules: [] } }, known), 'watch-sign-in');
  // After signing in: reload only when the signed-in list has packages.
  assert.equal(logic.lateAnswerAction({ data: { signedIn: true, modules: [{ id: 'hello' }] } }, [], { afterSignIn: true }), 'reload');
  assert.equal(logic.lateAnswerAction({ data: { signedIn: true, modules: [] } }, [], { afterSignIn: true }), null);
  assert.equal(logic.lateAnswerAction({ retry: true }, [], { afterSignIn: true }), 'retry');
});

test('packagesToPrepare: in order, no duplicates, none prepared twice, no id no package', () => {
  const data = { modules: [{ id: 'a' }, { id: 'b' }, { id: 'a' }, null, { name: 'no id' }, { id: 'c' }] };
  assert.deepEqual(logic.packagesToPrepare(data, [{ id: 'b' }]).map((pkg) => pkg.id), ['a', 'c']);
  assert.deepEqual(logic.packagesToPrepare(null), []);
});

test('entry contract, base URL and translation namespaces', () => {
  const pkg = { id: 'hello', version: '1.2.0' };
  const entry = { id: 'hello', App: () => {} };
  assert.equal(logic.checkEntry(pkg, { default: entry }), entry);
  assert.equal(logic.checkEntry(pkg, { id: 'hello' }).id, 'hello', 'a module without default export is its own entry');
  assert.throws(() => logic.checkEntry(pkg, { default: { id: 'other' } }), /says id "other"/);
  assert.throws(() => logic.checkEntry(pkg, null), /no default export/);
  assert.equal(logic.packageBase(pkg), '/modules/hello/1.2.0/');
  assert.equal(logic.packageBase({ ...pkg, base: '/modules/hello/1.2.0-abcdefabcdef/' }), '/modules/hello/1.2.0-abcdefabcdef/');
  assert.equal(logic.namespaceOf('/modules/hello/1.2.0-abc/locales/ru/hello.js'), 'hello');
});
