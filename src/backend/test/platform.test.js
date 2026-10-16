import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRule, occurrences, fromWall, toWall } from '../modules/calendar/recurrence.js';
import { mentionedUsernames } from '../modules/tasks/service.js';
import { buildMime, domainAllowed } from '../services/google.js';
import { seal, unseal } from '../services/crypto.js';
import { normalizeDomains } from '../services/settings.js';
import { buildManifest, faviconUrl } from '../routes/pwa.routes.js';

test('normalizeRule keeps a safe RRULE subset', () => {
  assert.equal(normalizeRule('RRULE:freq=weekly;byday=MO,WE;interval=2'), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
  assert.equal(normalizeRule('FREQ=MONTHLY;BYMONTHDAY=31;COUNT=12'), 'FREQ=MONTHLY;BYMONTHDAY=31;COUNT=12');
  assert.equal(normalizeRule('FREQ=DAILY;UNTIL=20261231'), 'FREQ=DAILY;UNTIL=20261231T235959Z');
  assert.equal(normalizeRule('FREQ=SECONDLY'), null, 'only daily..yearly');
  assert.equal(normalizeRule('FREQ=DAILY;BYDAY=XX'), 'FREQ=DAILY', 'unknown days dropped');
  assert.equal(normalizeRule(''), null);
});

test('time zone helpers round-trip wall time', () => {
  const instant = new Date('2026-10-12T03:00:00Z');
  const wall = toWall(instant, 'Asia/Bishkek');
  assert.equal(wall.toISOString(), '2026-10-12T09:00:00.000Z');
  assert.equal(fromWall(wall, 'Asia/Bishkek').toISOString(), instant.toISOString());
});

test('recurring events keep local time across DST', () => {
  // 09:00 in Berlin: UTC+2 in summer, UTC+1 after 25 Oct 2026.
  const event = { starts_at: '2026-10-19T07:00:00Z', ends_at: '2026-10-19T08:00:00Z', rrule: 'FREQ=WEEKLY', timezone: 'Europe/Berlin', exdates: [] };
  const list = occurrences(event, new Date('2026-10-18T00:00:00Z'), new Date('2026-11-03T00:00:00Z')).map((d) => d.toISOString());
  assert.deepEqual(list, ['2026-10-19T07:00:00.000Z', '2026-10-26T08:00:00.000Z', '2026-11-02T08:00:00.000Z']);
});

test('exdates remove single occurrences; plain events need overlap', () => {
  const event = { starts_at: '2026-10-12T03:00:00Z', ends_at: '2026-10-12T03:30:00Z', rrule: 'FREQ=DAILY;COUNT=3', timezone: 'Asia/Bishkek', exdates: ['2026-10-13T03:00:00Z'] };
  const list = occurrences(event, new Date('2026-10-01'), new Date('2026-11-01')).map((d) => d.toISOString());
  assert.deepEqual(list, ['2026-10-12T03:00:00.000Z', '2026-10-14T03:00:00.000Z']);
  const single = { starts_at: '2026-10-12T03:00:00Z', ends_at: '2026-10-12T05:00:00Z', rrule: null };
  assert.equal(occurrences(single, new Date('2026-10-12T04:00:00Z'), new Date('2026-10-13')).length, 1, 'running event overlaps');
  assert.equal(occurrences(single, new Date('2026-10-12T05:00:00Z'), new Date('2026-10-13')).length, 0);
});

test('mentions are parsed without emails', () => {
  assert.deepEqual(mentionedUsernames('Hi @olivia.martin and @Liam_N, mail me at a@b.com'), ['olivia.martin', 'liam_n']);
  assert.deepEqual(mentionedUsernames('no mentions'), []);
});

test('Gmail MIME message encodes UTF-8 subject and parts', () => {
  const mime = buildMime({ from: 'it@example.com', fromName: 'Портал', to: 'u@example.com', subject: 'Задача GEN-1', text: 'Привет', html: '<b>Привет</b>' });
  assert.match(mime, /^From: =\?UTF-8\?B\?/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /multipart\/alternative/);
  assert.ok(mime.includes(Buffer.from('Привет').toString('base64')));
});

test('sealed secrets open only with the same key and resist tampering', () => {
  const sealed = seal('refresh-token-123');
  assert.notEqual(sealed, 'refresh-token-123');
  assert.equal(unseal(sealed), 'refresh-token-123');
  const parts = sealed.split('.');
  parts[3] = Buffer.from('forged').toString('base64url');
  assert.equal(unseal(parts.join('.')), null);
  assert.equal(unseal(''), '');
});

test('Google domain allow-list uses hd or email domain', () => {
  assert.equal(normalizeDomains(' Corp.KZ, @example.com bad;x.org'), 'corp.kz,example.com,x.org');
  assert.ok(domainAllowed({ email: 'a@corp.kz' }, ['corp.kz']));
  assert.ok(domainAllowed({ email: 'a@gmail.com', hd: 'corp.kz' }, ['corp.kz']));
  assert.ok(!domainAllowed({ email: 'a@gmail.com' }, ['corp.kz']));
  assert.ok(domainAllowed({ email: 'a@gmail.com' }, []));
});

test('PWA manifest follows settings and enabled modules', () => {
  const parsed = {
    appName: 'Example Company Portal',
    appDescription: 'Portal',
    appearance: { customColors: {} },
    modules: { tasks: { enabled: true }, calendar: { enabled: false }, kb: { enabled: true } },
  };
  const manifest = buildManifest(parsed, 'ru');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.short_name, 'Example');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  assert.deepEqual(manifest.shortcuts.map((item) => item.url), ['/app/tasks', '/app/kb']);
  const custom = buildManifest({ ...parsed, appearance: { appIconUrl: '/uploads/logos/logo-x.png' } });
  assert.ok(custom.icons.every((icon) => icon.src === '/uploads/logos/logo-x.png'));
  const svg = buildManifest({ ...parsed, appearance: { appIconUrl: '/uploads/logos/logo-y.svg' } });
  assert.deepEqual(svg.icons, [{ src: '/uploads/logos/logo-y.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]);
});

test('tab icon follows the app icon setting, default otherwise', () => {
  assert.equal(faviconUrl({ appearance: { appIconUrl: '/uploads/logos/logo-x.png' } }), '/uploads/logos/logo-x.png');
  assert.equal(faviconUrl({ appearance: { appIconUrl: null } }), '/favicon.svg');
  assert.equal(faviconUrl({}), '/favicon.svg');
});

test('push subscriptions only reach real push services', async () => {
  const { isPushEndpoint } = await import('../services/push.js');
  assert.ok(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(isPushEndpoint('https://web.push.apple.com/QAbc'));
  assert.ok(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
  assert.ok(!isPushEndpoint('https://10.0.0.5/api'), 'no private hosts');
  assert.ok(!isPushEndpoint('https://fcm.googleapis.com:8443/x'), 'no custom ports');
  assert.ok(!isPushEndpoint('https://fcm.googleapis.com.evil.io/x'));
  assert.ok(!isPushEndpoint('http://fcm.googleapis.com/x'));
});

test('rules that never match or explode are refused', () => {
  assert.equal(normalizeRule('FREQ=DAILY;BYMONTHDAY=0'), 'FREQ=DAILY');
  const event = { starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-01-01T01:00:00Z', rrule: 'FREQ=DAILY', timezone: 'UTC', exdates: [] };
  const started = Date.now();
  assert.equal(occurrences(event, new Date('2026-01-01'), new Date('2030-01-01')).length, 1000, 'capped');
  assert.ok(Date.now() - started < 2000);
});
