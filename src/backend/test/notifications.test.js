import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventAllows, inboxAllows, quietState, resolvePrefs } from '../services/notifications.js';

test('notification prefs: first-version flat flags are read as channels', () => {
  const prefs = resolvePrefs({ push: false, email: true });
  assert.equal(prefs.channels.push, false);
  assert.equal(prefs.channels.email, true);
  assert.equal(prefs.channels.telegram, true);
  assert.deepEqual(prefs.events, {});
});

test('notification prefs: event defaults, overrides and master switches', () => {
  const prefs = resolvePrefs({ channels: { telegram: false }, events: { 'tasks.status': { push: false, email: true } } });
  assert.equal(eventAllows(prefs, 'tasks.assigned', 'email'), true);
  assert.equal(eventAllows(prefs, 'tasks.status', 'push'), false);
  assert.equal(eventAllows(prefs, 'tasks.status', 'email'), true);
  // The master switch wins over the event.
  assert.equal(eventAllows(prefs, 'tasks.assigned', 'telegram'), false);
  // A chat message is a push only.
  assert.equal(eventAllows(prefs, 'chat.message', 'email'), false);
});

test('notification prefs: reminders are urgent and cannot be muted per event', () => {
  const prefs = resolvePrefs({ events: { 'tasks.reminder': { inbox: false, push: false } } });
  assert.equal(inboxAllows(prefs, 'tasks.reminder'), true);
  assert.equal(eventAllows(prefs, 'tasks.reminder', 'push'), true);
  assert.equal(inboxAllows(resolvePrefs({ events: { 'tasks.status': { inbox: false } } }), 'tasks.status'), false);
});

test('notification prefs: quiet hours across midnight, weekends and pause', () => {
  const prefs = resolvePrefs({ quiet: { enabled: true, from: '22:00', to: '08:00' }, tz: 'UTC' });
  assert.equal(quietState(prefs, new Date('2026-10-13T23:30:00Z')), 'quiet');
  assert.equal(quietState(prefs, new Date('2026-10-13T07:59:00Z')), 'quiet');
  assert.equal(quietState(prefs, new Date('2026-10-13T12:00:00Z')), null);
  const weekends = resolvePrefs({ quiet: { enabled: true, from: '22:00', to: '08:00', weekends: true }, tz: 'UTC' });
  assert.equal(quietState(weekends, new Date('2026-10-17T12:00:00Z')), 'quiet');
  const paused = resolvePrefs({ pausedUntil: new Date(Date.now() + 3600000).toISOString() });
  assert.equal(quietState(paused), 'paused');
  assert.equal(resolvePrefs({ pausedUntil: '2000-01-01T00:00:00Z' }).pausedUntil, null);
});

test('notification prefs: quiet hours follow the person time zone', () => {
  const bishkek = resolvePrefs({ quiet: { enabled: true, from: '22:00', to: '08:00' }, tz: 'Asia/Bishkek' });
  // 17:00 UTC is 23:00 in Bishkek (UTC+6).
  assert.equal(quietState(bishkek, new Date('2026-10-13T17:00:00Z')), 'quiet');
  assert.equal(quietState(bishkek, new Date('2026-10-13T06:00:00Z')), null);
});

test('notification prefs: WhatsApp is a messenger channel with its own switch', () => {
  const prefs = resolvePrefs({ channels: { whatsapp: false } });
  assert.equal(prefs.channels.whatsapp, false);
  assert.equal(eventAllows(prefs, 'tasks.assigned', 'whatsapp'), false);
  assert.equal(eventAllows(resolvePrefs({}), 'tasks.assigned', 'whatsapp'), true);
  assert.equal(eventAllows(resolvePrefs({}), 'tasks.status', 'whatsapp'), false);
  assert.equal(eventAllows(resolvePrefs({}), 'chat.message', 'whatsapp'), false);
});

test('a contact another account has is refused, with the owner shown to administrators only', async () => {
  const { assertUniqueContacts } = await import('../services/users.js');
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: params[0] === '+996700000001' ? [{ username: 'other' }] : [] };
    },
  };
  await assertUniqueContacts(client, { phone: '+996700000002', email: null }, { excludeId: 5 });
  assert.equal(calls.length, 1, 'empty values are not checked');
  assert.deepEqual(calls[0].params, ['+996700000002', 5]);

  const self = await assertUniqueContacts(client, { phone: '+996700000001' }, { excludeId: 5 }).catch((err) => err);
  assert.equal(self.statusCode, 409);
  assert.equal(self.code, 'CONTACT_TAKEN');
  assert.deepEqual(self.details, { field: 'phone' });

  const admin = await assertUniqueContacts(client, { phone: '+996700000001' }, { excludeId: 5, reveal: true }).catch((err) => err);
  assert.deepEqual(admin.details, { field: 'phone', username: 'other' });
  assert.match(calls.at(-1).sql, /id <> \$2/);
});
