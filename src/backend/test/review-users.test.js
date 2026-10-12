import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_PATCH_PERMISSIONS, deniedSettingsKeys } from '../services/permissions.js';
import { createRateLimiter, releaseAt, resolvePrefs, takeTestSend } from '../services/notifications.js';
import { assertUniqueContacts, contactLockKey, tokenLockedChanges } from '../services/users.js';
import { lostPermissions } from '../services/rbac.js';
import { onBeforeUserDelete, runBeforeUserDelete } from '../services/hooks.js';

test('settings patch: every key updateAdminSettings applies has a permission', async () => {
  const { readFile } = await import('fs/promises');
  const source = await readFile(new URL('../services/settings.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function updateAdminSettings'));
  const end = body.indexOf('\n}\n');
  const keys = new Set([...body.slice(0, end).matchAll(/patch\.([a-zA-Z]+)/g)].map((match) => match[1]));
  assert.ok(keys.size >= 10);
  for (const key of keys) assert.ok(SETTINGS_PATCH_PERMISSIONS[key], `${key} has no permission`);
});

test('settings patch: view-only, unknown keys and partial permissions are refused', () => {
  const viewer = new Set(['console.access', 'settings.view']);
  assert.deepEqual(deniedSettingsKeys({ defaultLocale: 'ru', homePage: 'landing' }, viewer), ['defaultLocale', 'homePage']);
  assert.deepEqual(deniedSettingsKeys({ appName: 'x' }, new Set(['settings.general'])), []);
  assert.deepEqual(deniedSettingsKeys({ appName: 'x', security: {} }, new Set(['settings.general'])), ['security']);
  assert.deepEqual(deniedSettingsKeys({ somethingNew: 1 }, new Set(['*'])), ['somethingNew']);
  assert.deepEqual(deniedSettingsKeys({ constructor: 1, toString: 1 }, new Set(['*'])), ['constructor', 'toString']);
  assert.deepEqual(deniedSettingsKeys({ homePage: 'landing' }, new Set(['settings.security'])), []);
  assert.deepEqual(deniedSettingsKeys({}, viewer), []);
});

test('rate limiter: 3 per window, then RATE_LIMITED with retryAfter until the oldest hit expires', () => {
  const limiter = createRateLimiter([{ limit: 3, windowMs: 600_000 }, { limit: 5, windowMs: 86_400_000 }]);
  const t0 = 1_000_000;
  assert.ok(limiter.take('u1', t0).ok);
  assert.ok(limiter.take('u1', t0 + 1000).ok);
  assert.ok(limiter.take('u1', t0 + 2000).ok);
  const denied = limiter.take('u1', t0 + 3000);
  assert.equal(denied.ok, false);
  assert.equal(denied.retryAfter, 597);
  assert.ok(limiter.take('u2', t0 + 3000).ok, 'per key');
  assert.ok(limiter.take('u1', t0 + 600_000).ok, 'room again after the window');
  assert.equal(limiter.take('u1', t0 + 600_001).ok, false, 'still three in the last 10 minutes');
  assert.ok(limiter.take('u1', t0 + 601_000).ok);
  const daily = limiter.take('u1', t0 + 1_300_000);
  assert.equal(daily.ok, false, 'the daily cap applies too');
  assert.ok(daily.retryAfter > 80_000);
});

test('test sends are rationed per person', () => {
  const now = Date.now();
  const id = `t-${Math.random()}`;
  assert.ok(takeTestSend(id, now).ok);
  assert.ok(takeTestSend(id, now).ok);
  assert.ok(takeTestSend(id, now).ok);
  const fourth = takeTestSend(id, now);
  assert.equal(fourth.ok, false);
  assert.ok(fourth.retryAfter > 0 && fourth.retryAfter <= 600);
});

test('releaseAt: quiet hours end, weekends, pause, and no hold', () => {
  const night = resolvePrefs({ quiet: { enabled: true, from: '22:00', to: '08:00' }, tz: 'UTC' });
  assert.equal(releaseAt(night, new Date('2026-10-13T23:30:15Z')).toISOString(), '2026-10-14T08:00:00.000Z');
  assert.equal(releaseAt(night, new Date('2026-10-13T07:59:00Z')).toISOString(), '2026-10-13T08:00:00.000Z');
  const noon = new Date('2026-10-13T12:00:00Z');
  assert.equal(releaseAt(night, noon).getTime(), noon.getTime());

  // Friday 23:00 with weekends quiet → Monday 08:00.
  const weekends = resolvePrefs({ quiet: { enabled: true, from: '22:00', to: '08:00', weekends: true }, tz: 'UTC' });
  assert.equal(releaseAt(weekends, new Date('2026-10-16T23:00:00Z')).toISOString(), '2026-10-19T08:00:00.000Z');

  // Time zone: Bishkek (UTC+6), quiet 22–08 local → 02:00 UTC.
  const bishkek = resolvePrefs({ quiet: { enabled: true, from: '22:00', to: '08:00' }, tz: 'Asia/Bishkek' });
  assert.equal(releaseAt(bishkek, new Date('2026-10-13T17:00:00Z')).toISOString(), '2026-10-14T02:00:00.000Z');

  // A pause ending inside quiet hours waits for the quiet hours too.
  const until = new Date(Date.now() + 3 * 86_400_000);
  until.setUTCHours(23, 0, 0, 0);
  const paused = resolvePrefs({ pausedUntil: until.toISOString(), quiet: { enabled: true, from: '22:00', to: '08:00' }, tz: 'UTC' });
  const expected = new Date(until);
  expected.setUTCDate(expected.getUTCDate() + 1);
  expected.setUTCHours(8, 0, 0, 0);
  assert.equal(releaseAt(paused).toISOString(), expected.toISOString());
});

test('API tokens cannot change sign-in contacts; resending the same value is fine', () => {
  const current = { email: 'A@x.org', phone: '+996700123456', mattermost: 'john' };
  assert.deepEqual(tokenLockedChanges({ email: 'evil@x.org' }, current, false), [], 'cookie sessions are not limited');
  assert.deepEqual(tokenLockedChanges({ email: 'evil@x.org', phone: '+996700000001', mattermost: 'eve', displayName: 'Z' }, current, true), ['email', 'phone', 'mattermost']);
  assert.deepEqual(tokenLockedChanges({ email: 'a@x.org', phone: '+996 700 123 456', mattermost: '@John', displayName: 'Z' }, current, true), []);
  assert.deepEqual(tokenLockedChanges({ email: '' }, current, true), ['email'], 'clearing is a change');
  assert.deepEqual(tokenLockedChanges({ phone: 'garbage' }, current, true), ['phone']);
  assert.deepEqual(tokenLockedChanges({ phone: null }, { phone: null }, true), []);
  assert.deepEqual(tokenLockedChanges({ displayName: 'Z', locale: 'ru' }, current, true), []);
});

test('contact uniqueness locks every checked value, in a fixed order, before checking', async () => {
  const calls = [];
  const client = { query: async (sql, params) => (calls.push({ sql, params }), { rows: [] }) };
  await assertUniqueContacts(client, { phone: '+996700000002', email: 'B@x.org', mattermost: null }, { excludeId: 5, lock: true });
  const locks = calls.filter((call) => /pg_advisory_xact_lock/.test(call.sql));
  assert.deepEqual(locks.map((call) => call.params[0]), ['contact:email:b@x.org', 'contact:phone:+996700000002']);
  assert.ok(calls.indexOf(locks.at(-1)) < calls.findIndex((call) => /SELECT username/.test(call.sql)));
  assert.equal(contactLockKey('email', 'X@Y.z'), 'contact:email:x@y.z');
});

test('lostPermissions: what an edit takes away', () => {
  assert.deepEqual(lostPermissions(['a', 'b'], ['a']), ['b']);
  assert.deepEqual(lostPermissions(['a'], ['a', 'b']), []);
  assert.deepEqual(lostPermissions(['*'], ['a']), ['*']);
  assert.deepEqual(lostPermissions(['a'], ['*']), []);
  assert.deepEqual(lostPermissions(['a'], undefined), ['a']);
});

test('before-user-delete hooks run in order with the transaction client and can abort', async () => {
  const seen = [];
  const off1 = onBeforeUserDelete(async (client, userId, { actor }) => seen.push(['one', client.tag, userId, actor.id]));
  const off2 = onBeforeUserDelete(async () => {
    throw new Error('stop');
  });
  await assert.rejects(runBeforeUserDelete({ tag: 'tx' }, 7, { actor: { id: 1 } }), /stop/);
  assert.deepEqual(seen, [['one', 'tx', 7, 1]]);
  off2();
  await runBeforeUserDelete({ tag: 'tx' }, 8, { actor: { id: 1 } });
  assert.equal(seen.length, 2);
  off1();
});
