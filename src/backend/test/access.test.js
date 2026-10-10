import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { hasPermission, isSubset, normalizePermissions, SYSTEM_ROLES } from '../services/permissions.js';
import { mapDirectoryGroups } from '../services/ldap.js';
import { verifyTelegramPayload } from '../services/signin.js';
import { sanitizeAuth } from '../services/settings.js';

test('super admin holds everything; others only what they list', () => {
  assert.ok(hasPermission(['*'], 'roles.manage'));
  assert.ok(hasPermission(['users.view'], 'users.view'));
  assert.ok(!hasPermission(['users.view'], 'users.manage'));
});

test('isSubset blocks privilege escalation', () => {
  const admin = SYSTEM_ROLES.find((role) => role.key === 'admin').permissions;
  const auditor = SYSTEM_ROLES.find((role) => role.key === 'auditor').permissions;
  assert.ok(isSubset(auditor, admin), 'admin may grant auditor');
  assert.ok(!isSubset(['*'], admin), 'admin may not grant super admin');
  assert.ok(!isSubset(['roles.manage'], admin), 'admin may not grant roles.manage');
  assert.ok(isSubset(['*'], ['*']), 'super admin may grant anything');
});

test('normalizePermissions drops unknown permissions and collapses *', () => {
  assert.deepEqual(normalizePermissions(['users.view', 'nope', 'users.view']), ['users.view']);
  assert.deepEqual(normalizePermissions(['users.view', '*']), ['*']);
});

test('directory groups map by CN or full DN, case-insensitively', () => {
  const memberOf = ['CN=Portal Admins,OU=Groups,DC=corp,DC=local', 'CN=Sales,OU=Groups,DC=corp,DC=local'];
  const map = [
    { adGroup: 'portal admins', groupId: 1 },
    { adGroup: 'CN=Sales,OU=Groups,DC=corp,DC=local', groupId: 2 },
    { adGroup: 'Finance', groupId: 3 },
  ];
  assert.deepEqual(mapDirectoryGroups(map, memberOf).sort(), [1, 2]);
});

function signTelegram(data, token) {
  const check = Object.keys(data).sort().map((key) => `${key}=${data[key]}`).join('\n');
  const secret = createHash('sha256').update(token).digest();
  return createHmac('sha256', secret).update(check).digest('hex');
}

test('Telegram payloads are accepted only with a valid, fresh signature', () => {
  const token = '123456:ABC';
  const now = Date.now();
  const data = { id: '42', first_name: 'Ada', username: 'ada', auth_date: String(Math.floor(now / 1000)) };
  const payload = { ...data, hash: signTelegram(data, token) };

  assert.equal(verifyTelegramPayload(payload, token, now)?.id, '42');
  assert.equal(verifyTelegramPayload({ ...payload, id: '43' }, token, now), null, 'tampered');
  assert.equal(verifyTelegramPayload(payload, '999:XYZ', now), null, 'other bot');
  assert.equal(verifyTelegramPayload(payload, token, now + 2 * 86400 * 1000), null, 'expired');
});

test('sign-in methods need their integration and at least one stays on', () => {
  const current = {
    password: { enabled: true },
    ldap: { enabled: false, autoProvision: true, groupMap: [] },
    telegram: { enabled: false, autoProvision: false },
    emailCode: { enabled: false },
    whatsappCode: { enabled: false },
  };
  const ready = { ldap: false, telegram: true, emailCode: false, whatsappCode: false };
  assert.throws(() => sanitizeAuth(current, { ldap: { enabled: true } }, ready), /Active Directory/);
  assert.equal(sanitizeAuth(current, { telegram: { enabled: true } }, ready).telegram.enabled, true);
  assert.throws(() => sanitizeAuth(current, { password: { enabled: false } }, ready), /At least one/);
});
