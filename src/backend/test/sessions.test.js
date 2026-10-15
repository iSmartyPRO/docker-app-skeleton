import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUserAgent } from '../services/userAgent.js';
import {
  TOUCH_INTERVAL_MS,
  clientMode,
  legacySessionId,
  newSessionId,
  presentSession,
  requestDetails,
  sessionState,
  shouldTouch,
} from '../services/sessions.js';
import { signToken, verifyToken } from '../services/auth.js';

const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.52',
  win7Firefox: 'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macYandex: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 YaBrowser/24.4.0.0 Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphonePwa: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/127.0.6533.107 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  linuxOpera: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0',
};

test('user agent: browsers, systems and device kinds', () => {
  const cases = [
    [UA.winChrome, { browser: 'Chrome', browserVersion: '128', os: 'Windows', osVersion: '10', type: 'desktop' }],
    [UA.winEdge, { browser: 'Edge', browserVersion: '129', os: 'Windows', type: 'desktop' }],
    [UA.win7Firefox, { browser: 'Firefox', browserVersion: '115', os: 'Windows', osVersion: '7', type: 'desktop' }],
    [UA.macSafari, { browser: 'Safari', browserVersion: '17.5', os: 'macOS', osVersion: null, type: 'desktop' }],
    [UA.macYandex, { browser: 'Yandex', browserVersion: '24', os: 'macOS', type: 'desktop' }],
    [UA.iphoneSafari, { browser: 'Safari', browserVersion: '18.0', os: 'iOS', osVersion: '18', type: 'mobile' }],
    [UA.iphonePwa, { browser: 'Safari', browserVersion: null, os: 'iOS', osVersion: '17.6.1', type: 'mobile' }],
    [UA.iphoneChrome, { browser: 'Chrome', browserVersion: '127', os: 'iOS', osVersion: '17.5', type: 'mobile' }],
    [UA.ipad, { browser: 'Safari', os: 'iPadOS', osVersion: '17', type: 'tablet' }],
    [UA.androidChrome, { browser: 'Chrome', browserVersion: '128', os: 'Android', osVersion: '10', type: 'mobile' }],
    [UA.androidSamsung, { browser: 'Samsung Internet', browserVersion: '25', os: 'Android', osVersion: '14', type: 'mobile' }],
    [UA.androidTablet, { browser: 'Chrome', os: 'Android', osVersion: '13', type: 'tablet' }],
    [UA.linuxFirefox, { browser: 'Firefox', browserVersion: '130', os: 'Linux', type: 'desktop' }],
    [UA.linuxOpera, { browser: 'Opera', browserVersion: '112', os: 'Linux', type: 'desktop' }],
  ];
  for (const [ua, expected] of cases) {
    const parsed = parseUserAgent(ua);
    for (const [key, value] of Object.entries(expected)) assert.equal(parsed[key], value, `${key} of ${ua}`);
  }
});

test('user agent: Client Hints reveal Windows 11, real macOS and Android versions', () => {
  assert.equal(parseUserAgent(UA.winChrome, { platformVersion: '15.0.0' }).osVersion, '11');
  assert.equal(parseUserAgent(UA.winChrome, { platformVersion: '10.0.0' }).osVersion, '10');
  assert.equal(parseUserAgent(UA.macYandex, { platformVersion: '14.6.1' }).osVersion, '14.6.1');
  assert.equal(parseUserAgent(UA.androidChrome, { platformVersion: '14.0.0' }).osVersion, '14');
});

test('user agent: empty and unknown strings never throw', () => {
  assert.deepEqual(parseUserAgent(''), { browser: null, browserVersion: null, os: null, osVersion: null, type: 'desktop' });
  assert.deepEqual(parseUserAgent(undefined).type, 'desktop');
  assert.equal(parseUserAgent('curl/8.5.0').browser, null);
});

test('session state: active, expired, revoked, missing', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const later = new Date('2026-10-14T12:00:00Z');
  const earlier = new Date('2026-10-12T12:00:00Z');
  assert.equal(sessionState(null, now), 'missing');
  assert.equal(sessionState({ expires_at: later, revoked_at: null }, now), 'active');
  assert.equal(sessionState({ expires_at: earlier, revoked_at: null }, now), 'expired');
  assert.equal(sessionState({ expires_at: now, revoked_at: null }, now), 'expired');
  assert.equal(sessionState({ expires_at: later, revoked_at: earlier }, now), 'revoked');
});

test('session ids: random ones and stable legacy ones never clash', () => {
  const a = newSessionId();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, newSessionId());
  const legacy = legacySessionId('header.payload.signature');
  assert.equal(legacy, legacySessionId('header.payload.signature'));
  assert.match(legacy, /^l[0-9a-f]{31}$/);
  assert.notEqual(legacy, legacySessionId('other.token'));
});

test('client mode and request details come from the headers', () => {
  assert.equal(clientMode({ headers: { 'x-client-mode': 'PWA' } }), 'pwa');
  assert.equal(clientMode({ headers: { 'x-client-mode': 'browser' } }), 'browser');
  assert.equal(clientMode({ headers: { 'x-client-mode': 'native' } }), null);
  assert.equal(clientMode({ headers: {} }), null);
  const details = requestDetails({ ip: '::ffff:10.0.0.5', headers: { 'user-agent': UA.winChrome, 'x-client-platform-version': '15.0.0', 'x-client-mode': 'pwa' } });
  assert.deepEqual(details, { ip: '10.0.0.5', userAgent: UA.winChrome, client: 'pwa', platformVersion: '15.0.0' });
  assert.equal(requestDetails({ headers: { 'x-client-platform-version': '<script>' } }).platformVersion, null);
});

test('last activity is written at most once a minute, or when the client switches', () => {
  const memory = new Map();
  const t0 = 1_000_000;
  assert.equal(shouldTouch('s1', 'browser', t0, memory), true);
  assert.equal(shouldTouch('s1', 'browser', t0 + 1000, memory), false);
  assert.equal(shouldTouch('s1', null, t0 + 2000, memory), false);
  assert.equal(shouldTouch('s1', 'pwa', t0 + 3000, memory), true);
  assert.equal(shouldTouch('s1', 'pwa', t0 + 3000 + TOUCH_INTERVAL_MS - 1, memory), false);
  assert.equal(shouldTouch('s1', 'pwa', t0 + 3000 + TOUCH_INTERVAL_MS, memory), true);
  assert.equal(shouldTouch('s2', null, t0, memory), true);
});

test('a session row is presented with device details, current flag and impersonator', () => {
  const row = {
    id: 'abc',
    created_at: new Date('2026-10-01T10:00:00Z'),
    last_seen_at: new Date('2026-10-13T10:00:00Z'),
    expires_at: new Date('2026-10-20T10:00:00Z'),
    ip: '10.0.0.5',
    first_ip: '10.0.0.4',
    user_agent: UA.iphonePwa,
    platform_version: null,
    client: 'pwa',
    clients: ['browser', 'pwa', 'bogus'],
    method: 'password',
    impersonated_by: 3,
    impersonator_name: 'Admin',
  };
  const view = presentSession(row, 'abc');
  assert.equal(view.current, true);
  assert.equal(view.client, 'pwa');
  assert.deepEqual(view.clients, ['browser', 'pwa']);
  assert.equal(view.device.os, 'iOS');
  assert.equal(view.device.type, 'mobile');
  assert.deepEqual(view.impersonatedBy, { id: 3, name: 'Admin' });
  assert.equal(presentSession({ ...row, client: null, impersonated_by: null }, 'other').current, false);
  assert.equal(presentSession({ ...row, client: null }, null).client, 'browser');
  assert.equal(presentSession({ ...row, impersonated_by: null }).impersonatedBy, null);
});

test('session tokens carry the session id next to the user and token version', () => {
  process.env.JWT_SECRET ||= 'test-secret-for-sessions-1234567890';
  const payload = verifyToken(signToken({ id: 9, token_version: 4 }, { sessionDays: 7, claims: { sid: 'abc' } }));
  assert.equal(payload.sub, '9');
  assert.equal(payload.tv, 4);
  assert.equal(payload.sid, 'abc');
});

test('the account sessions routes stay locked while acting as someone else', async () => {
  const { impersonationLock } = await import('../middleware/auth.js');
  for (const path of ['/api/account/sessions/revoke-others', '/api/account/sessions/abc', '/api/v1/account/sessions']) assert.ok(impersonationLock('DELETE', path), path);
});
