import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeKeepSecrets,
  sanitizeRateLimit,
  sanitizeSecurity,
  safeLogoUrl,
} from '../services/settings.js';

test('sanitizeSecurity keeps omitted flags instead of resetting them', () => {
  const current = { whitelistEnabled: true, blacklistEnabled: false, sessionDays: 14 };
  const next = sanitizeSecurity(current, { lockoutMinutes: 30 });
  assert.equal(next.whitelistEnabled, true);
  assert.equal(next.blacklistEnabled, false);
  assert.equal(next.sessionDays, 14);
  assert.equal(next.lockoutMinutes, 30);
});

test('sanitizeSecurity clamps numbers into safe ranges', () => {
  const next = sanitizeSecurity({}, { maxLoginAttempts: 1, lockoutMinutes: 9999, sessionDays: 0 });
  assert.equal(next.maxLoginAttempts, 3);
  assert.equal(next.lockoutMinutes, 180);
  assert.equal(next.sessionDays, 1);
});

test('sanitizeRateLimit refuses values that would lock the API', () => {
  const next = sanitizeRateLimit({ windowMs: 900000, max: 100 }, { max: 1, windowMs: 5 });
  assert.equal(next.max, 20);
  assert.equal(next.windowMs, 60000);
});

test('mergeKeepSecrets keeps stored secrets when the field is blank', () => {
  const current = { email: { host: 'a', password: 'secret' }, telegram: { botToken: 't' } };
  const next = mergeKeepSecrets(current, { email: { host: 'b', password: '' }, evil: { x: 1 } });
  assert.equal(next.email.host, 'b');
  assert.equal(next.email.password, 'secret');
  assert.equal(next.evil, undefined, 'unknown groups are dropped');
});

test('safeLogoUrl only allows files under /uploads/logos/', () => {
  assert.equal(safeLogoUrl('/uploads/logos/logo-1.png'), '/uploads/logos/logo-1.png');
  assert.equal(safeLogoUrl('/uploads/logos/../../etc/passwd'), null);
  assert.equal(safeLogoUrl('https://evil.example/x.svg'), null);
});

test('parseSettings adds integrations introduced after the settings were saved', async () => {
  const { parseSettings } = await import('../services/settings.js');
  const stored = JSON.stringify({ email: { enabled: true, host: 'smtp.example.com' } });
  const parsed = parseSettings({ integrations: stored });
  assert.equal(parsed.integrations.email.host, 'smtp.example.com');
  assert.equal(parsed.integrations.wazzup.enabled, false);
  assert.equal(parsed.integrations.wazzup.apiKey, '');
});

test('sanitizeWazzup keeps a transport → channel map and drops junk', async () => {
  const { sanitizeWazzup } = await import('../services/settings.js');
  const next = sanitizeWazzup({
    enabled: true,
    channelId: '3049-6838',
    channels: { whatsapp: ' abc ', instagram: 'def', 'bad key!': 'x', telegram: '', vk: 42 },
  });
  assert.equal(next.channelId, undefined);
  assert.deepEqual(next.channels, { whatsapp: 'abc', instagram: 'def' });
  assert.equal(next.enabled, true);
});
