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

test('phones are validated against real numbering plans', async () => {
  const { normalizePhone } = await import('../services/users.js');
  assert.equal(normalizePhone('+996 559 25-57-77'), '+996559255777');
  assert.equal(normalizePhone('996502800800'), '+996502800800');
  assert.throws(() => normalizePhone('+9965255777'), /not valid/, 'a missing digit is rejected');
  assert.equal(normalizePhone(''), null);
});

test('WhatsApp Gateway base URL works on any domain', async () => {
  const { gatewayBase } = await import('../services/integrations.js');
  assert.equal(gatewayBase('https://wa.example.org/'), 'https://wa.example.org');
  assert.equal(gatewayBase('https://wa.example.org/api'), 'https://wa.example.org');
  assert.equal(gatewayBase(' http://10.0.0.5:8080/api/ '), 'http://10.0.0.5:8080');
});

test('Mattermost base URL and usernames', async () => {
  const { mattermostBase } = await import('../services/integrations.js');
  const { normalizeMattermost } = await import('../services/users.js');
  assert.equal(mattermostBase('https://chat.example.com/api/v4/'), 'https://chat.example.com');
  assert.equal(normalizeMattermost('@Ivan.Petrov'), 'ivan.petrov');
  assert.throws(() => normalizeMattermost('1bad'), /not valid/);
});

test('rate limits: guests per IP, signed-in people per account', async () => {
  const { sanitizeRateLimit } = await import('../services/settings.js');
  const current = { windowMs: 900000, max: 300, userMax: 5000 };
  assert.deepEqual(sanitizeRateLimit(current, {}), current);
  const next = sanitizeRateLimit(current, { max: 5, userMax: 10, windowMs: 1 });
  assert.equal(next.max, 20, 'guest cap has a floor');
  assert.equal(next.userMax, 200, 'per-person cap has a floor so nobody locks the admin console');
  assert.equal(next.windowMs, 60000);
});
