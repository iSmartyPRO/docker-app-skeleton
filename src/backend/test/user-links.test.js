import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../services/auth.js';

test('a "sign in as" token carries the administrator and lasts a day', () => {
  process.env.JWT_SECRET ||= 'test-secret-for-user-links-1234567890';
  const token = signToken({ id: 7, token_version: 2 }, { sessionDays: 1, claims: { imp: 1 } });
  const payload = verifyToken(token);
  assert.equal(payload.sub, '7');
  assert.equal(payload.tv, 2);
  assert.equal(payload.imp, 1);
  assert.ok(payload.exp - payload.iat <= 24 * 60 * 60);
});

test('sensitive account actions are locked while acting as someone else', async () => {
  const { impersonationLock } = await import('../middleware/auth.js');
  for (const path of ['/api/account/password', '/api/account/sessions/revoke', '/api/account/telegram', '/api/account/api/tokens', '/api/auth/google/connect', '/api/admin/users/5/impersonate', '/api/v1/account/password']) {
    assert.ok(impersonationLock('POST', path), path);
  }
  for (const path of ['/api/account/profile', '/api/app/tasks', '/api/account/notifications']) assert.equal(impersonationLock('PUT', path, {}, {}), null, path);
});
