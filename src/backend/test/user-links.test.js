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
  const source = (await import('fs')).readFileSync(new URL('../middleware/auth.js', import.meta.url), 'utf8');
  const pattern = new RegExp(source.match(/const IMPERSONATION_LOCKED = \/(.*)\/;/)[1]);
  for (const path of ['/api/account/password', '/api/account/sessions/revoke', '/api/account/telegram', '/api/account/api/tokens', '/api/auth/google/connect', '/api/admin/users/5/impersonate', '/api/v1/account/password']) {
    assert.ok(pattern.test(path), path);
  }
  for (const path of ['/api/account/profile', '/api/app/tasks', '/api/account/notifications']) assert.ok(!pattern.test(path), path);
});
