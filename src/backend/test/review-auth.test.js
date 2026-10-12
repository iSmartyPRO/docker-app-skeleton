import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockoutKey, trustProxy } from '../services/security.js';
import {
  assertSecretsStayWithEndpoint,
  mergeKeepSecrets,
  reusableSecret,
  secretEndpointChanged,
} from '../services/settings.js';
import { directoryMayLink } from '../services/signin.js';

test('lockoutKey folds case and whitespace', () => {
  assert.equal(lockoutKey(' Ivan '), 'ivan');
  assert.equal(lockoutKey('IVAN'), lockoutKey('ivan'));
  assert.equal(lockoutKey(''), '');
  assert.equal(lockoutKey(null), '');
});

test('lockoutKey folds directory spellings only for password sign-in', () => {
  const variants = ['ivan', 'CORP\\ivan', 'ivan@corp.kz', 'Ivan@Corp.KZ', 'corp.kz\\IVAN'];
  for (const v of variants) assert.equal(lockoutKey(v, { directory: true }), 'ivan', v);
  // Email codes: the domain is part of who the person is.
  assert.equal(lockoutKey('Ivan@Corp.KZ'), 'ivan@corp.kz');
  assert.notEqual(lockoutKey('ivan@a.com'), lockoutKey('ivan@b.com'));
});

test('lockoutKey normalizes phone numbers and @handles', () => {
  assert.equal(lockoutKey('+7 (701) 123-45-67'), '77011234567');
  assert.equal(lockoutKey('77011234567'), '77011234567');
  assert.equal(lockoutKey('@Ivan_Bot'), 'ivan_bot');
  assert.equal(lockoutKey('@ivan', { directory: true }), 'ivan');
  assert.ok(lockoutKey('x'.repeat(200)).length <= 64);
});

test('trustProxy believes X-Forwarded-For only from loopback', () => {
  const trust = trustProxy(undefined);
  assert.equal(trust('127.0.0.1', 0), true);
  assert.equal(trust('::1', 0), true);
  assert.equal(trust('::ffff:127.0.0.1', 0), true);
  assert.equal(trust('172.18.0.5', 0), false, 'another container talking to :3001 directly');
  assert.equal(trust('10.0.0.1', 1), false, 'one hop by default');
});

test('trustProxy honours TRUST_PROXY_HOPS behind the loopback hop', () => {
  const two = trustProxy('2');
  assert.equal(two('127.0.0.1', 0), true);
  assert.equal(two('172.18.0.9', 1), true);
  assert.equal(two('203.0.113.1', 2), false);
  assert.equal(two('172.18.0.9', 0), false);
  assert.equal(trustProxy('0'), false);
});

test('secretEndpointChanged compares normalized endpoints', () => {
  const stored = { host: 'smtp.corp.kz', port: 587, password: 'p' };
  assert.equal(secretEndpointChanged('email', stored, { ...stored, host: ' SMTP.corp.kz ', port: '587' }), false);
  assert.equal(secretEndpointChanged('email', stored, { ...stored, host: 'evil.example' }), true);
  assert.equal(secretEndpointChanged('email', stored, { ...stored, port: 2525 }), true);
  const mm = { serverUrl: 'https://chat.corp.kz' };
  assert.equal(secretEndpointChanged('mattermost', mm, { serverUrl: 'https://chat.corp.kz/api/v4/' }), false);
  assert.equal(secretEndpointChanged('mattermost', mm, { serverUrl: 'https://chat.evil.example' }), true);
  assert.equal(secretEndpointChanged('whatsapp', { serverUrl: 'https://gw.kz/api' }, { serverUrl: 'https://gw.kz' }), false);
  assert.equal(secretEndpointChanged('activeDirectory', { host: 'dc1', port: 389 }, { host: 'dc2', port: 389 }), true);
  // Fixed endpoints (Telegram, Wazzup, Google) never count as changed.
  assert.equal(secretEndpointChanged('telegram', { botToken: 'a' }, { botToken: '' }), false);
});

test('reusableSecret reuses the saved secret only for the saved server', () => {
  const stored = { host: 'smtp.corp.kz', port: 587, password: 'saved' };
  assert.equal(reusableSecret('email', 'password', stored, {}), 'saved');
  assert.equal(reusableSecret('email', 'password', stored, { host: 'smtp.corp.kz', password: '' }), 'saved');
  assert.equal(reusableSecret('email', 'password', stored, { host: 'evil.example', password: 'typed' }), 'typed');
  assert.throws(
    () => reusableSecret('email', 'password', stored, { host: 'evil.example', password: '' }),
    (err) => err.statusCode === 400 && err.code === 'SECRET_REQUIRED'
  );
  assert.throws(
    () => reusableSecret('activeDirectory', 'bindPassword', { host: 'dc1', bindPassword: 'x' }, { host: 'attacker' }),
    (err) => err.code === 'SECRET_REQUIRED'
  );
  // Nothing saved: nothing to leak, the integration reports the missing secret itself.
  assert.equal(reusableSecret('email', 'password', { host: 'a' }, { host: 'b' }), '');
});

test('assertSecretsStayWithEndpoint guards the save path', () => {
  const current = {
    email: { host: 'smtp.corp.kz', port: 587, password: 'saved' },
    mattermost: { serverUrl: 'https://chat.corp.kz', botToken: 'tok' },
  };
  assert.doesNotThrow(() => assertSecretsStayWithEndpoint(current, { email: { host: 'smtp.corp.kz', password: '' } }));
  assert.doesNotThrow(() => assertSecretsStayWithEndpoint(current, { email: { host: 'new.host', password: 'new' } }));
  assert.throws(
    () => assertSecretsStayWithEndpoint(current, { mattermost: { serverUrl: 'https://evil.example', botToken: '' } }),
    (err) => err.code === 'SECRET_REQUIRED'
  );
  // Same server, blank secret: merge keeps the stored one as before.
  const next = mergeKeepSecrets(current, { mattermost: { serverUrl: 'https://chat.corp.kz/', botToken: '' } });
  assert.equal(next.mattermost.botToken, 'tok');
});

test('directoryMayLink never takes over self-provisioned accounts', () => {
  const noPassword = '!';
  assert.equal(directoryMayLink(null), false);
  assert.equal(directoryMayLink({ auth_source: 'ldap', password_hash: noPassword }), true);
  assert.equal(directoryMayLink({ auth_source: 'local', password_hash: noPassword }), true);
  assert.equal(directoryMayLink({ auth_source: null, password_hash: noPassword }), true);
  assert.equal(directoryMayLink({ auth_source: 'telegram', password_hash: noPassword }), false);
  assert.equal(directoryMayLink({ auth_source: 'google', password_hash: noPassword }), false);
  assert.equal(
    directoryMayLink({ auth_source: 'local', password_hash: '$2a$12$abcdefghijklmnopqrstuuJ8m1Xg0yHq3T9b4c5d6e7f8g9h0i1j2' }),
    false,
    'accounts with their own password are not taken over'
  );
});
