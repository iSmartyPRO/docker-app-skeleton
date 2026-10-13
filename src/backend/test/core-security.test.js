import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret-for-core-security-1234567890';

const { impersonationLock, impersonatorAllowed, refuseImpersonation, requireAuth } = await import('../middleware/auth.js');
const { classify, decide, normalizePath, requestPath } = await import('../api/scopes.js');

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

// ── 1. "Sign in as" is never reachable with an API token ─────────────────────

test('the impersonate route is blocked for API tokens whatever the case or slashes', () => {
  for (const raw of ['/api/admin/users/5/impersonate', '/api/v1/admin/users/5/impersonate', '/api/Admin/Users/5/Impersonate', '/api//admin//users/5/impersonate/']) {
    assert.deepEqual(classify(requestPath(raw)), { blocked: true }, raw);
  }
  const policy = { scopes: { 'admin.users': 'write' }, rules: [{ effect: 'allow', methods: [], path: '/admin/**', note: '' }] };
  assert.equal(decide(policy, 'POST', normalizePath('/api/admin/users/5/impersonate')).code, 'ROUTE_NOT_AVAILABLE');
  // Other user administration stays available to such a token.
  assert.equal(decide(policy, 'PUT', normalizePath('/api/admin/users/5')).ok, true);
});

test('the impersonate route itself refuses token requests before touching anything', async () => {
  const express = (await import('express')).default;
  const { default: adminRoutes } = await import('../routes/admin.routes.js');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.userRow = { id: 1, username: 'root', is_active: true, is_blocked: false };
    req.access = { permissions: ['*'] };
    req.actor = { id: 1, permissions: new Set(['*']) };
    req.user = { id: 1, username: 'root' };
    req.apiToken = { id: 9, name: 't' };
    next();
  });
  app.use('/api/admin', adminRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/users/2/impersonate`, { method: 'POST' });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'ROUTE_NOT_AVAILABLE');
    assert.equal(response.headers.get('set-cookie'), null);
  } finally {
    server.close();
  }
});

// ── 2 + 4. What a "sign in as" session may not change ────────────────────────

test('impersonation locks are judged on the normalised path (case, slashes, /v1)', () => {
  for (const raw of [
    '/api/Account/Password',
    '/API/account/password',
    '/api//account//sessions/revoke-others',
    '/api/v1/ACCOUNT/telegram',
    '/api/account/api/tokens',
    '/api/Auth/Google/connect',
    '/api/admin/users/7/IMPERSONATE',
    '/api/admin/api/tokens',
    '/api/Admin/API',
    '/api/pwa/push',
    '/api/pwa/Push/test',
    '/api/account/sessions/abc?x=1',
  ]) {
    assert.ok(impersonationLock('POST', raw, {}, {}), raw);
  }
  for (const raw of ['/api/app/tasks/1', '/api/account/notifications', '/api/auth/impersonate/stop', '/api/auth/logout', '/api/admin/users/7']) {
    assert.equal(impersonationLock('POST', raw, {}, {}), null, raw);
  }
  // Looking is always allowed.
  assert.equal(impersonationLock('GET', '/api/account/sessions'), null);
  assert.equal(impersonationLock('HEAD', '/api/Account/Password'), null);
});

test('the profile may be edited while impersonating, except the sign-in contacts', () => {
  const current = { email: 'a@x.org', phone: '+996700123456', mattermost: 'john' };
  assert.equal(impersonationLock('PUT', '/api/account/profile', { displayName: 'New', locale: 'ru', theme: 'dark' }, current), null);
  // A whole-profile save that re-sends the same contacts is not a change.
  assert.equal(impersonationLock('PUT', '/api/account/profile', { displayName: 'New', email: 'A@x.org', phone: '+996 700 123 456', mattermost: '@John' }, current), null);
  assert.deepEqual(impersonationLock('PUT', '/api/Account/Profile', { email: 'evil@x.org' }, current), { fields: ['email'] });
  assert.deepEqual(impersonationLock('PUT', '/api/account/profile', { phone: '+996700000001', mattermost: 'eve' }, current), { fields: ['phone', 'mattermost'] });
});

test('requireAuth refuses a locked request of an impersonation session (mixed-case URL)', async () => {
  const req = {
    method: 'POST',
    originalUrl: '/api/Account/Password',
    auth: { imp: 1 },
    userRow: { id: 7, is_active: true, is_blocked: false },
    body: {},
  };
  const res = fakeRes();
  let passed = false;
  await requireAuth(req, res, () => {
    passed = true;
  });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'IMPERSONATION_LIMIT');

  const profile = { ...req, method: 'PUT', originalUrl: '/api/account/profile', userRow: { ...req.userRow, email: 'a@x.org' }, body: { email: 'b@x.org' } };
  const res2 = fakeRes();
  await requireAuth(profile, res2, () => {
    passed = true;
  });
  assert.equal(passed, false);
  assert.deepEqual(res2.body.fields, ['email']);

  // The person's own session is not limited.
  const own = { ...req, auth: {} };
  await requireAuth(own, fakeRes(), () => {
    passed = true;
  });
  assert.equal(passed, true);
});

test('refuseImpersonation guards writes only', () => {
  let passed = 0;
  const next = () => {
    passed += 1;
  };
  refuseImpersonation({ method: 'GET', auth: { imp: 1 } }, fakeRes(), next);
  refuseImpersonation({ method: 'POST', auth: {} }, fakeRes(), next);
  assert.equal(passed, 2);
  const res = fakeRes();
  refuseImpersonation({ method: 'DELETE', auth: { imp: 1 } }, res, next);
  assert.equal(passed, 2);
  assert.equal(res.body.code, 'IMPERSONATION_LIMIT');
});

// ── 3. The impersonator must still be allowed ────────────────────────────────

test('an impersonation session needs an active, unblocked superadministrator behind it', () => {
  const admin = { row: { id: 1, is_active: true, is_blocked: false }, access: { permissions: ['*'] } };
  assert.equal(impersonatorAllowed(admin), true);
  assert.equal(impersonatorAllowed(null), false);
  assert.equal(impersonatorAllowed({ ...admin, row: { ...admin.row, is_blocked: true } }), false);
  assert.equal(impersonatorAllowed({ ...admin, row: { ...admin.row, is_active: false } }), false);
  assert.equal(impersonatorAllowed({ ...admin, access: { permissions: ['console.access', 'users.manage'] } }), false);
});

// ── 7. Sample accounts of the setup wizard ───────────────────────────────────

test('a directory sign-in never takes over a seeded sample account', async () => {
  const { directoryMayLink } = await import('../services/signin.js');
  const { isDemoSeedAccount } = await import('../services/rbac.js');
  const demo = { username: 'olivia.martin', email: 'olivia.martin@example.com', auth_source: 'local', password_hash: '!' };
  assert.equal(isDemoSeedAccount(demo), true);
  assert.equal(directoryMayLink(demo), false);
  // Once an administrator gave it a real address it is an ordinary invited account.
  assert.equal(directoryMayLink({ ...demo, email: 'olivia@corp.kg' }), true);
  assert.equal(directoryMayLink({ username: 'ivan.petrov', email: 'ivan.petrov@example.com', auth_source: 'local', password_hash: '!' }), true);
});
