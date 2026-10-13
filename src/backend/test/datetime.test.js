import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatDateTime, formatTime, isoDay, resolveRegional, sanitizeRegional, sanitizeUserRegional, startOfDay, startOfWeek, wallToInstant, zoneLabel, zoneOffsetMinutes } from '../services/datetime.js';

const bishkek = { timeZone: 'Asia/Bishkek', dateFormat: 'DD.MM.YYYY', timeFormat: '24', weekStart: 1 };

test('moments are shown in the person’s zone and formats', () => {
  const at = '2026-10-13T20:30:00Z'; // 02:30 next day in Bishkek (UTC+6)
  assert.equal(formatDateTime(at, bishkek), '14.10.2026, 02:30');
  assert.equal(formatDate(at, { ...bishkek, timeZone: 'UTC', dateFormat: 'YYYY-MM-DD' }), '2026-10-13');
  assert.equal(formatTime(at, { ...bishkek, timeZone: 'America/New_York', timeFormat: '12' }), '4:30 PM');
  assert.equal(formatDate(at, { ...bishkek, dateFormat: 'D MMM YYYY' }, 'en'), '14 Oct 2026');
  assert.equal(formatDate(at, { ...bishkek, dateFormat: 'MM/DD/YYYY' }), '10/14/2026');
  // A date-only value is that day everywhere.
  assert.equal(formatDate('2026-10-13', { ...bishkek, timeZone: 'Pacific/Kiritimati' }), '13.10.2026');
});

test('days and weeks start at local midnight; wall times become instants, DST included', () => {
  assert.equal(startOfDay('2026-10-13T20:30:00Z', 'Asia/Bishkek').toISOString(), '2026-10-13T18:00:00.000Z');
  assert.equal(isoDay('2026-10-13T20:30:00Z', 'Asia/Bishkek'), '2026-10-14');
  // 14 Oct 2026 is a Wednesday → Monday 12 Oct 00:00 Bishkek.
  assert.equal(startOfWeek('2026-10-14T06:00:00Z', 'Asia/Bishkek', 1).toISOString(), '2026-10-11T18:00:00.000Z');
  assert.equal(startOfWeek('2026-10-14T06:00:00Z', 'Asia/Bishkek', 0).toISOString(), '2026-10-10T18:00:00.000Z');
  assert.equal(wallToInstant({ year: 2026, month: 3, day: 29, hour: 12 }, 'Europe/Berlin').toISOString(), '2026-03-29T10:00:00.000Z');
  assert.equal(wallToInstant({ year: 2026, month: 3, day: 28, hour: 12 }, 'Europe/Berlin').toISOString(), '2026-03-28T11:00:00.000Z');
  assert.equal(zoneOffsetMinutes('2026-10-13T00:00:00Z', 'Asia/Bishkek'), 360);
  assert.equal(zoneLabel('Asia/Kolkata', new Date('2026-01-01')), 'UTC+5:30');
});

test('a day whose midnight is skipped by DST starts at the transition', () => {
  // America/Santiago moves 00:00 → 01:00 on 6 Sep 2026: the day begins at 04:00Z (01:00 -03).
  const start = startOfDay('2026-09-06T12:00:00Z', 'America/Santiago');
  assert.equal(start.toISOString(), '2026-09-06T04:00:00.000Z');
  assert.equal(isoDay(start, 'America/Santiago'), '2026-09-06');
  assert.equal(startOfDay('2026-09-05T12:00:00Z', 'America/Santiago', 1).toISOString(), '2026-09-06T04:00:00.000Z');
  // Ordinary days around it are unaffected.
  assert.equal(startOfDay('2026-09-07T12:00:00Z', 'America/Santiago').toISOString(), '2026-09-07T03:00:00.000Z');
  assert.equal(startOfDay('2026-09-05T12:00:00Z', 'America/Santiago').toISOString(), '2026-09-05T04:00:00.000Z');
});

test('personal settings override the portal; "device" uses the zone the browser reported', () => {
  const portal = sanitizeRegional({ timeZone: 'Asia/Bishkek', dateFormat: 'YYYY-MM-DD', timeFormat: '12', weekStart: 0 });
  assert.deepEqual(resolveRegional(portal, null), { timeZone: 'Asia/Bishkek', dateFormat: 'YYYY-MM-DD', timeFormat: '12', weekStart: 0, locale: null });
  const own = resolveRegional(portal, { regional: { timeZone: 'device', dateFormat: 'DD.MM.YYYY', timeFormat: null, weekStart: 1 }, device_tz: 'Europe/Moscow', locale: 'ru' });
  assert.deepEqual(own, { timeZone: 'Europe/Moscow', dateFormat: 'DD.MM.YYYY', timeFormat: '12', weekStart: 1, locale: 'ru' });
  assert.equal(resolveRegional(portal, { regional: { timeZone: 'device' } }).timeZone, 'Asia/Bishkek');
  assert.deepEqual(sanitizeUserRegional({ timeZone: 'Mars/Base', dateFormat: 'portal', weekStart: '6' }), { timeZone: null, dateFormat: null, timeFormat: null, weekStart: 6 });
  assert.equal(sanitizeRegional({ timeZone: 'nope', dateFormat: 'x' }).dateFormat, 'DD.MM.YYYY');
});
