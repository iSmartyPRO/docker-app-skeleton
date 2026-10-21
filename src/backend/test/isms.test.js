import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ismsBase } from '../services/integrations.js';
import { mergeKeepSecrets, reusableSecret, sanitizeIsms, secretEndpointChanged } from '../services/settings.js';

test('iSMS base URL works on any domain and tolerates the copied API path', () => {
  assert.equal(ismsBase('https://sms.ismarty.pro/'), 'https://sms.ismarty.pro');
  assert.equal(ismsBase('https://sms.ismarty.pro/api/v1/app/sms'), 'https://sms.ismarty.pro');
  assert.equal(ismsBase(' http://10.0.0.7:8092/api/app/sms/ '), 'http://10.0.0.7:8092');
  assert.equal(ismsBase('https://sms.example.com/api'), 'https://sms.example.com');
});

test('iSMS settings: trimmed address, whole-number SIM id or automatic', () => {
  assert.deepEqual(sanitizeIsms({ enabled: 1, serverUrl: ' https://sms.example.com// ', apiToken: 'pat_x', simId: '43' }), {
    enabled: true,
    serverUrl: 'https://sms.example.com',
    apiToken: 'pat_x',
    simId: 43,
  });
  assert.equal(sanitizeIsms({ simId: -1 }).simId, 0);
  assert.equal(sanitizeIsms({ simId: '4.5' }).simId, 0);
  assert.equal(sanitizeIsms({ simId: 'abc' }).simId, 0);
});

test('iSMS token is kept on save and reused only for the same server', () => {
  const current = { isms: { enabled: true, serverUrl: 'https://sms.example.com', apiToken: 'pat_saved', simId: 0 } };
  // A blank token field means "keep the saved one".
  assert.equal(mergeKeepSecrets(current, { isms: { simId: 43, apiToken: '' } }).isms.apiToken, 'pat_saved');
  // The API path copied from the server's docs is the same server.
  assert.equal(secretEndpointChanged('isms', current.isms, { serverUrl: 'https://SMS.example.com/api/v1/app/sms/' }), false);
  assert.equal(reusableSecret('isms', 'apiToken', current.isms, { serverUrl: 'https://sms.example.com/' }), 'pat_saved');
  // Another server must not receive the saved token.
  assert.throws(() => reusableSecret('isms', 'apiToken', current.isms, { serverUrl: 'https://evil.example.net' }), { code: 'SECRET_REQUIRED' });
  assert.equal(reusableSecret('isms', 'apiToken', current.isms, { serverUrl: 'https://evil.example.net', apiToken: 'pat_new' }), 'pat_new');
});

test('SMS sign-in codes: offered only when the method is on and iSMS Server is configured', async () => {
  const { authAvailability, sanitizeAuth } = await import('../services/settings.js');
  const parsed = (isms, smsCode) => ({
    integrations: { isms, google: {}, activeDirectory: {}, telegram: {}, email: {}, mattermost: {}, whatsapp: {}, wazzup: {} },
    auth: { password: { enabled: true }, smsCode: { enabled: smsCode }, magicLink: { enabled: true } },
  });
  const ready = { enabled: true, serverUrl: 'https://sms.example.com', apiToken: 'pat_x' };
  assert.equal(authAvailability(parsed(ready, true)).smsCode, true);
  assert.equal(authAvailability(parsed(ready, true)).ready.magicLink, true, 'links can go by SMS too');
  assert.equal(authAvailability(parsed(ready, false)).smsCode, false);
  assert.equal(authAvailability(parsed({ ...ready, apiToken: '' }, true)).smsCode, false);
  assert.equal(authAvailability(parsed({ ...ready, enabled: false }, true)).smsCode, false);

  // Switching the method on without the integration is refused.
  const current = { password: { enabled: true }, smsCode: { enabled: false } };
  assert.throws(() => sanitizeAuth(current, { smsCode: { enabled: true } }, { smsCode: false }), /iSMS Server/);
  assert.equal(sanitizeAuth(current, { smsCode: { enabled: true } }, { smsCode: true }).smsCode.enabled, true);
});
