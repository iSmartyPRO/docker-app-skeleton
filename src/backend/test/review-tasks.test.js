import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRecurrence, nextAfterFirstCopy, nextOccurrence } from '../modules/tasks/templates.js';
import { templateVisible } from '../modules/tasks/service.js';
import { remindsOthers } from '../modules/tasks/extras.js';
import { occurrenceTimes } from '../modules/calendar/reminders.js';
import { eventMessage, whenText } from '../modules/calendar/messages.js';

// ── Recurring tasks: the immediate first copy takes the first slot ─────────

test('daily recurrence created before today\'s slot does not make a second task today', () => {
  const rec = cleanRecurrence({ every: 1, unit: 'day', start: '2026-10-12', time: '09:00', tz: 'Asia/Bishkek' });
  const now = new Date('2026-10-12T02:00:00Z'); // 08:00 in Bishkek
  assert.equal(nextOccurrence(rec, now, 0).toISOString(), '2026-10-12T03:00:00.000Z', 'first slot is today 09:00');
  assert.equal(nextAfterFirstCopy(rec, now).toISOString(), '2026-10-13T03:00:00.000Z', 'next run is tomorrow 09:00');
});

test('daily recurrence created after today\'s slot continues the day after tomorrow\'s slot', () => {
  const rec = cleanRecurrence({ every: 1, unit: 'day', start: '2026-10-12', time: '09:00', tz: 'UTC' });
  const now = new Date('2026-10-12T10:00:00Z');
  // The copy made now stands for tomorrow's slot.
  assert.equal(nextAfterFirstCopy(rec, now).toISOString(), '2026-10-14T09:00:00.000Z');
});

test('count = 1: the first copy is the only one', () => {
  const rec = cleanRecurrence({ every: 1, unit: 'day', start: '2026-10-12', time: '09:00', tz: 'UTC', end: { mode: 'count', count: 1 } });
  assert.equal(nextAfterFirstCopy(rec, new Date('2026-10-12T08:00:00Z')), null);
});

test('count = 3: two more runs after the first copy', () => {
  const rec = cleanRecurrence({ every: 1, unit: 'week', start: '2026-10-12', time: '09:00', tz: 'UTC', end: { mode: 'count', count: 3 } });
  const second = nextAfterFirstCopy(rec, new Date('2026-10-12T08:00:00Z'));
  assert.equal(second.toISOString(), '2026-10-19T09:00:00.000Z');
  const third = nextOccurrence(rec, second, 2);
  assert.equal(third.toISOString(), '2026-10-26T09:00:00.000Z');
  assert.equal(nextOccurrence(rec, third, 3), null);
});

test('end date before the second slot ends the schedule', () => {
  const rec = cleanRecurrence({ every: 1, unit: 'day', start: '2026-10-12', time: '09:00', tz: 'UTC', end: { mode: 'date', date: '2026-10-12' } });
  assert.equal(nextAfterFirstCopy(rec, new Date('2026-10-12T08:00:00Z')), null);
  assert.equal(nextAfterFirstCopy(null), null);
});

// ── All-day event reminders east of UTC ────────────────────────────────────

test('all-day reminders count from local midnight but show the stored day', () => {
  const event = { all_day: true, timezone: 'Asia/Bishkek' };
  const day = new Date('2026-10-15T00:00:00Z');
  const { start, shown } = occurrenceTimes(event, day);
  assert.equal(start.toISOString(), '2026-10-14T18:00:00.000Z', 'fires from Bishkek midnight');
  assert.equal(shown.toISOString(), '2026-10-15T00:00:00.000Z');
  assert.match(whenText('en', { start: shown, allDay: true, timezone: 'Asia/Bishkek' }), /15 Oct 2026/);
  // The old behaviour (local instant) printed the day before.
  assert.match(whenText('en', { start, allDay: true, timezone: 'Asia/Bishkek' }), /14 Oct 2026/);
  const text = eventMessage('reminder', { title: 'Holiday', start: shown, allDay: true, timezone: 'Asia/Bishkek', minutes: 60 })('ru');
  assert.match(text.body, /15 окт/);
});

test('timed events: the reminder start is the occurrence itself', () => {
  const at = new Date('2026-10-15T04:30:00Z');
  const { start, shown } = occurrenceTimes({ all_day: false, timezone: 'Asia/Bishkek' }, at);
  assert.equal(start, at);
  assert.equal(shown, at);
});

// ── Access helpers ─────────────────────────────────────────────────────────

test('templates are visible to their author, when shared, and to administrators', () => {
  assert.equal(templateVisible({ created_by: 1, shared: false }, { userId: 1 }), true);
  assert.equal(templateVisible({ created_by: 1, shared: true }, { userId: 2 }), true);
  assert.equal(templateVisible({ created_by: 1, shared: false }, { userId: 2 }), false);
  assert.equal(templateVisible({ created_by: 1, shared: false }, { userId: 2, isAdmin: true }), true);
  assert.equal(templateVisible(undefined, { userId: 1 }), false);
});

test('reminders to anyone but the author are told apart', () => {
  assert.equal(remindsOthers(undefined), false, 'default target is me');
  assert.equal(remindsOthers(['me']), false);
  assert.equal(remindsOthers(['me', 'assignee']), true);
  assert.equal(remindsOthers(['auditors']), true);
  assert.equal(remindsOthers(['bogus']), false, 'unknown targets are dropped by insertReminder');
});
