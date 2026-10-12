import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { classify, decide, effectivePolicy, requestPath, ruleMatches } from '../api/scopes.js';
import { failedAuthState, mayActFor, noteFailedAuth, resetFailedAuth } from '../api/tokens.js';
import { guardedLookup, post } from '../api/webhooks.js';

const policy = (scopes, rules = []) => effectivePolicy({ scopes }, { rules });

// ── Path classification ─────────────────────────────────────────────────────

test('request path: absolute-form targets are judged by their pathname', () => {
  assert.equal(requestPath('/api/admin/api/tokens?x=1'), '/admin/api/tokens');
  assert.equal(requestPath('http://x/api/admin/api/tokens'), '/admin/api/tokens');
  assert.equal(requestPath('https://evil.example:8443/api/v1/admin/api/tokens?y'), '/admin/api/tokens');
  assert.equal(requestPath('HTTP://X/API/Admin/Users/1'), '/admin/users/1');
  assert.deepEqual(classify(requestPath('http://x/api/admin/api/tokens')), { blocked: true });
  assert.deepEqual(classify(requestPath('http://x/api/admin/users')), { area: 'admin.users' });
  assert.equal(decide(policy({}), 'GET', requestPath('http://x/api/admin/api/tokens')).code, 'ROUTE_NOT_AVAILABLE');
  assert.equal(decide(policy({}), 'GET', requestPath('http://x/api/admin/users')).code, 'SCOPE_DENIED');
});

test('request path: targets that are not a path are refused', () => {
  assert.equal(requestPath('*'), null);
  assert.equal(requestPath('example.com:443'), null);
  assert.equal(requestPath(''), null);
  assert.equal(decide(policy({ tasks: 'write' }), 'GET', null).ok, false);
  assert.equal(decide(policy({ tasks: 'write' }), 'GET', 'http:/x/api/admin').ok, false);
});

test('areas: public prefixes run anonymously, bootstrap reads keep the owner', () => {
  assert.deepEqual(classify('/d/abc123'), { free: true, anonymous: true });
  assert.deepEqual(classify('/res/icons/x.svg'), { free: true, anonymous: true });
  assert.deepEqual(classify('/apps'), { free: true });
  assert.deepEqual(classify('/developer/reference'), { free: true });
});

test('HEAD is judged as GET by rules and scopes', () => {
  const p = policy({ tasks: 'read' }, [{ effect: 'deny', methods: ['GET'], path: '/app/tasks/secret/**' }]);
  assert.equal(ruleMatches(p.rules[0], 'HEAD', '/app/tasks/secret/1'), true);
  assert.equal(decide(p, 'HEAD', '/app/tasks/secret/1').code, 'SCOPE_DENIED');
  assert.equal(decide(p, 'HEAD', '/app/tasks/tasks').ok, true);
  assert.equal(decide(policy({ tasks: 'none' }), 'HEAD', '/app/tasks/tasks').scope, 'tasks:read');
});

// ── Acting for another person ───────────────────────────────────────────────

test('acting for another person needs a superset of their rights', () => {
  assert.equal(mayActFor(new Set(['api.admin', 'users.view']), ['users.view']), true);
  assert.equal(mayActFor(new Set(['api.admin']), ['api.admin', 'users.edit']), false);
  assert.equal(mayActFor(new Set(['api.admin']), ['*']), false);
  assert.equal(mayActFor(new Set(['*']), ['*']), true);
  assert.equal(mayActFor(['api.admin'], []), true);
});

// ── Failed token checks ─────────────────────────────────────────────────────

test('failed token checks: 30 per 5 minutes per address, logged once a minute', () => {
  resetFailedAuth();
  const t0 = 1_000_000;
  let logged = 0;
  for (let i = 0; i < 30; i += 1) {
    assert.equal(failedAuthState('1.2.3.4', t0 + i).ok, true);
    if (noteFailedAuth('1.2.3.4', t0 + i)) logged += 1;
  }
  assert.equal(logged, 1);
  const locked = failedAuthState('1.2.3.4', t0 + 100);
  assert.equal(locked.ok, false);
  assert.ok(locked.retryAfter > 0 && locked.retryAfter <= 300);
  assert.equal(failedAuthState('5.6.7.8', t0 + 100).ok, true);
  assert.equal(noteFailedAuth('1.2.3.4', t0 + 61_000), true);
  assert.equal(failedAuthState('1.2.3.4', t0 + 5 * 60_000 + 30).ok, true);
  resetFailedAuth();
});

// ── Webhook delivery ────────────────────────────────────────────────────────

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('guarded lookup honours options.all and refuses private addresses', async () => {
  const all = await new Promise((resolve, reject) =>
    guardedLookup({ allowPrivate: true })('localhost', { all: true }, (err, list) => (err ? reject(err) : resolve(list)))
  );
  assert.ok(Array.isArray(all) && all.length >= 1 && all.every((entry) => entry.address && entry.family));
  const one = await new Promise((resolve, reject) =>
    guardedLookup({ allowPrivate: true })('localhost', {}, (err, address, family) => (err ? reject(err) : resolve({ address, family })))
  );
  assert.equal(typeof one.address, 'string');
  assert.ok([4, 6].includes(one.family));
  const refused = await new Promise((resolve) => guardedLookup({ allowPrivate: false })('localhost', { all: true }, (err) => resolve(err)));
  assert.match(String(refused?.message), /private network/);
});

test('webhook post: delivers to a host name (happy eyeballs lookup)', async () => {
  let received = null;
  const server = await listen((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received = { body, event: req.headers['x-portal-event'] };
      res.writeHead(204).end();
    });
  });
  try {
    const { port } = server.address();
    const response = await post(`http://localhost:${port}/hook`, { 'Content-Type': 'application/json', 'X-Portal-Event': 'ping' }, '{"a":1}', { allowPrivate: true });
    assert.equal(response.status, 204);
    assert.deepEqual(received, { body: '{"a":1}', event: 'ping' });
  } finally {
    server.close();
  }
});

test('webhook post: a private target is refused when private networks are off', async () => {
  let hit = false;
  const server = await listen((req, res) => {
    hit = true;
    res.end('ok');
  });
  try {
    const { port } = server.address();
    await assert.rejects(post(`http://localhost:${port}/hook`, {}, '{}', { allowPrivate: false }), /private network/);
    assert.equal(hit, false);
  } finally {
    server.close();
  }
});

test('webhook post: a trickling receiver hits the overall deadline', async () => {
  const server = await listen((req, res) => {
    res.writeHead(200);
    const timer = setInterval(() => res.write('.'), 50);
    res.on('close', () => clearInterval(timer));
  });
  try {
    const { port } = server.address();
    const started = Date.now();
    await assert.rejects(post(`http://localhost:${port}/hook`, {}, '{}', { allowPrivate: true, timeoutMs: 400 }), /Timed out/);
    assert.ok(Date.now() - started < 3000);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('webhook post: stops reading after the body cap', async () => {
  const server = await listen((req, res) => {
    res.writeHead(500);
    res.write('x'.repeat(5000));
    // Never ends: the client must answer from what it has.
  });
  try {
    const { port } = server.address();
    const response = await post(`http://localhost:${port}/hook`, {}, '{}', { allowPrivate: true, timeoutMs: 5000 });
    assert.equal(response.status, 500);
    assert.equal(response.text.length, 2000);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
