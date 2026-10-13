import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefsWithZone, quietState, quietZone } from '../services/notifications.js';
import { boundsFor, bucketBounds, dayStartAt } from '../modules/crm/util.js';
import { crmMessage } from '../modules/crm/messages.js';
import { eventMessage, whenText } from '../modules/calendar/messages.js';
import { validTimeZone } from '../modules/calendar/recurrence.js';
import { calendarDefaults } from '../modules/calendar/service.js';
import { reminderText, taskMessage } from '../modules/tasks/messages.js';
import { cleanRecurrence, nextOccurrence } from '../modules/tasks/templates.js';
import { bounds as dashboardBounds } from '../modules/dashboard/data.js';

const portal = { timeZone: 'Asia/Bishkek', dateFormat: 'DD.MM.YYYY', timeFormat: '24', weekStart: 1 };
const ny = { timeZone: 'America/New_York', dateFormat: 'MM/DD/YYYY', timeFormat: '12', weekStart: 0, locale: 'en' };

test('quiet hours: own region zone, then the legacy notify_prefs.tz, then the device, then the portal', () => {
  assert.equal(quietZone({ regional: { timeZone: 'Europe/Berlin' }, notify_prefs: { tz: 'Asia/Tokyo' } }, portal), 'Europe/Berlin');
  assert.equal(quietZone({ regional: { timeZone: 'device' }, device_tz: 'Europe/Moscow' }, portal), 'Europe/Moscow');
  assert.equal(quietZone({ regional: {}, notify_prefs: { tz: 'Asia/Tokyo' }, device_tz: 'Europe/Moscow' }, portal), 'Asia/Tokyo');
  assert.equal(quietZone({ regional: {}, device_tz: 'Europe/Moscow' }, portal), 'Europe/Moscow');
  assert.equal(quietZone({ regional: {} }, portal), 'Asia/Bishkek');
  assert.equal(quietZone(null, portal), 'Asia/Bishkek');
  // 22:00–08:00 in New York: 03:00 UTC is 23:00 there.
  const prefs = prefsWithZone({ regional: { timeZone: 'America/New_York' }, notify_prefs: { quiet: { enabled: true, from: '22:00', to: '08:00' } } }, portal);
  assert.equal(prefs.tz, 'America/New_York');
  assert.equal(quietState(prefs, new Date('2026-10-14T03:00:00Z')), 'quiet');
  assert.equal(quietState(prefs, new Date('2026-10-14T15:00:00Z')), null);
});

test('crm buckets honour the week start and the explicit request parameters', () => {
  // Tuesday 13 Oct 2026, 12:00 in Bishkek.
  const now = new Date('2026-10-13T06:00:00Z');
  const sunday = bucketBounds(now, 'Asia/Bishkek', 0);
  assert.equal(sunday.endWeek.toISOString(), '2026-10-17T18:00:00.000Z', 'a Sunday-first week ends on Saturday night');
  assert.equal(sunday.endNextWeek.toISOString(), '2026-10-24T18:00:00.000Z');
  const ctx = { regional: { timeZone: 'Asia/Bishkek', weekStart: 6 } };
  assert.equal(boundsFor(ctx, {}, now).weekStart, 6);
  assert.equal(boundsFor(ctx, {}, now).endWeek.toISOString(), '2026-10-16T18:00:00.000Z');
  const sent = boundsFor(ctx, { tz: 'UTC', weekStart: '1' }, now);
  assert.equal(sent.zone, 'UTC');
  assert.equal(sent.endToday.toISOString(), '2026-10-14T00:00:00.000Z');
  assert.equal(sent.endWeek.toISOString(), '2026-10-19T00:00:00.000Z');
  assert.equal(boundsFor(ctx, { tz: 'Mars/Base', weekStart: '3' }, now).zone, 'Asia/Bishkek', 'invalid parameters fall back');
  assert.equal(dayStartAt('2026-10-13', 'Asia/Bishkek').toISOString(), '2026-10-12T18:00:00.000Z');
  assert.equal(dayStartAt('2026-10-13', 'Asia/Bishkek', 1).toISOString(), '2026-10-13T18:00:00.000Z');
  assert.equal(dayStartAt('13.10.2026', 'UTC'), null);
});

test('messages format moments in the recipient’s region settings', () => {
  const due = '2026-10-14T13:30:00Z';
  const crm = crmMessage('activityDue', { title: 'Call', deal: 'Big deal', dueAt: due });
  assert.match(crm('ru', portal).body, /Срок: 14\.10\.2026, 19:30/);
  assert.match(crm('en', ny).body, /Due: 10\/14\/2026, 9:30 AM/);
  // Legacy callers with a zone only.
  assert.match(crmMessage('activity', { title: 'x', deal: 'y', dueAt: due, zone: 'UTC' })('en').body, /14\.10\.2026, 13:30/);

  assert.match(taskMessage('dueSoon', { ref: 'WEB-1', title: 'Fix', dueAt: due })('en', ny).body, /Deadline: 10\/14\/2026, 9:30 AM/);
  assert.equal(taskMessage('assigned', { ref: 'WEB-1', title: 'Fix', actor: 'Ann', project: 'Web' })('ru').title, 'Вам назначена задача WEB-1');
  assert.match(reminderText('ru', portal, { ref: 'WEB-1', title: 'Fix', dueAt: due }).body, /Крайний срок: 14\.10\.2026, 19:30/);
  assert.equal(reminderText('en', ny, { ref: 'WEB-1', title: 'Fix', dueAt: null }).body, 'Fix');
});

test('calendar texts: the recipient’s zone, a zone label for events planned elsewhere, all-day days unshifted', () => {
  const start = '2026-10-14T03:00:00Z'; // 09:00 Bishkek, 23:00 (13th) New York
  assert.equal(whenText('ru', { start, allDay: false, timezone: 'Asia/Bishkek' }, portal), '14.10.2026, 09:00');
  assert.equal(whenText('en', { start, allDay: false, timezone: 'Asia/Bishkek' }, ny), '10/13/2026, 11:00 PM (UTC−4)');
  assert.equal(whenText('en', { start: '2026-10-15', allDay: true, timezone: 'Asia/Bishkek' }, ny), '10/15/2026');
  assert.equal(whenText('en', { start: new Date('2026-10-15T00:00:00Z'), allDay: true, timezone: 'Asia/Bishkek' }, { ...portal, timeZone: 'Pacific/Honolulu' }), '15.10.2026');
  const text = eventMessage('invited', { title: 'Sync', start, allDay: false, timezone: 'Asia/Bishkek', actor: 'Ann' });
  assert.match(text('en', ny).body, /^10\/13\/2026, 11:00 PM \(UTC−4\)/);
  // Without settings: the event's own zone, as before.
  assert.match(text('en').body, /14 Oct 2026/);
});

test('zones: a missing zone is not valid; schedules default to the author zone and today there', () => {
  assert.equal(validTimeZone(undefined), false);
  assert.equal(validTimeZone('Asia/Bishkek'), true);
  const rec = cleanRecurrence({ every: 1, unit: 'day', start: '2026-10-12', time: '09:00' }, 'Asia/Bishkek');
  assert.equal(rec.tz, 'Asia/Bishkek');
  assert.equal(nextOccurrence(rec, new Date('2026-10-12T00:00:00Z')).toISOString(), '2026-10-12T03:00:00.000Z');
  assert.equal(cleanRecurrence({ tz: 'Europe/Berlin' }, 'Asia/Bishkek').tz, 'Europe/Berlin');
  assert.equal(cleanRecurrence({}, 'nope').tz, 'UTC');
  assert.match(cleanRecurrence({}, 'Asia/Bishkek').start, /^\d{4}-\d{2}-\d{2}$/);
});

test('calendar week start: own choice, then a changed portal week start, then the module setting', () => {
  assert.equal(calendarDefaults({ weekStart: 0, dayStart: '07:00' }, 1, null).weekStart, 0);
  assert.equal(calendarDefaults({ weekStart: 1 }, 6, null).weekStart, 6);
  assert.equal(calendarDefaults({ weekStart: 0 }, 6, 1).weekStart, 1);
  assert.equal(calendarDefaults({ weekStart: 1 }, 1, 0).dayStart, undefined);
});

test('dashboard day bounds are local midnights, DST included', () => {
  const b = dashboardBounds('Europe/Berlin', 3, new Date('2026-03-30T10:00:00Z'));
  assert.equal(b.today.toISOString(), '2026-03-29T22:00:00.000Z');
  assert.equal(b.tomorrow.toISOString(), '2026-03-30T22:00:00.000Z');
  assert.equal(b.since.toISOString(), '2026-03-27T23:00:00.000Z', 'before the switch to summer time');
});
