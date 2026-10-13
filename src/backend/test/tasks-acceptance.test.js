import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCEPT_DEFAULTS, acceptHoursFor, isOrderRow, parseProjectHours, rearmsAcceptNotice, reopenAcceptance } from '../modules/tasks/orders.js';
import { taskMessage } from '../modules/tasks/messages.js';
import { EVENT_TYPES } from '../api/events.js';
import { NOTIFICATION_GROUPS } from '../services/notificationCatalog.js';
import { MODULE_CATALOG } from '../modules/catalog.js';

// ── «Принять в работу»: time to accept ─────────────────────────────────────

test('time to accept: module defaults, project override, important tasks', () => {
  assert.equal(acceptHoursFor({}, null, false), ACCEPT_DEFAULTS.hours);
  assert.equal(acceptHoursFor({}, null, true), ACCEPT_DEFAULTS.importantHours);
  assert.equal(acceptHoursFor({ acceptHours: 48, acceptHoursImportant: 8 }, null, false), 48);
  assert.equal(acceptHoursFor({ acceptHours: 48, acceptHoursImportant: 8 }, null, true), 8);
  // A project's own hours win; NULL means "as in the settings".
  assert.equal(acceptHoursFor({ acceptHours: 48 }, { accept_hours: 12, accept_hours_important: null }, false), 12);
  assert.equal(acceptHoursFor({ acceptHoursImportant: 8 }, { accept_hours: 12, accept_hours_important: null }, true), 8);
});

test('project hours from a form: empty is "as in the settings", the rest is clamped', () => {
  assert.equal(parseProjectHours(''), null);
  assert.equal(parseProjectHours(null), null);
  assert.equal(parseProjectHours(0), null);
  assert.equal(parseProjectHours('6'), 6);
  assert.equal(parseProjectHours(100000), 720);
});

// ── «Поручения»: the flag and the leadership rule ───────────────────────────

test('an order is flagged, or set by a leader for someone else', () => {
  const leaders = new Set([1]);
  assert.equal(isOrderRow({ is_order: true, originator_id: 5, assignee_id: 6 }, leaders), true);
  assert.equal(isOrderRow({ is_order: false, originator_id: 1, assignee_id: 6 }, leaders), true);
  assert.equal(isOrderRow({ is_order: false, originator_id: null, created_by: 1, assignee_id: 6 }, leaders), true);
  assert.equal(isOrderRow({ is_order: false, originator_id: 1, assignee_id: 1 }, leaders), false, 'a leader’s own task');
  assert.equal(isOrderRow({ is_order: false, originator_id: 1, assignee_id: null }, leaders), false, 'nobody to give it to');
  assert.equal(isOrderRow({ is_order: false, originator_id: 5, assignee_id: 6 }, leaders), false);
});

test('the module settings keep valid acceptance hours and leadership groups', () => {
  const tasks = MODULE_CATALOG.find((module) => module.id === 'tasks');
  assert.equal(tasks.defaults.acceptHours, 24);
  assert.equal(tasks.defaults.acceptHoursImportant, 4);
  assert.deepEqual(tasks.defaults.ordersGroupIds, []);
  const next = tasks.sanitize(tasks.defaults, { acceptHours: 5000, acceptHoursImportant: 'x', ordersGroupIds: [3, '4', -1, 'a', 3] });
  assert.equal(next.acceptHours, 720);
  assert.equal(next.acceptHoursImportant, 4);
  assert.deepEqual(next.ordersGroupIds, [3, 4]);
});

// ── Notifications and events ────────────────────────────────────────────────

test('acceptance notifications are in the catalog, task.accepted is a webhook event', () => {
  const kinds = NOTIFICATION_GROUPS.find((group) => group.key === 'tasks').events.map((event) => event.kind);
  for (const kind of ['tasks.accepted', 'tasks.not_accepted', 'tasks.accept_overdue']) assert.ok(kinds.includes(kind), kind);
  assert.ok(EVENT_TYPES.includes('task.accepted'));
});

test('texts: the assignee is asked to accept by a time; the originator hears the outcome', () => {
  const regional = { timeZone: 'UTC', dateFormat: 'DD.MM.YYYY', timeFormat: 'HH:mm' };
  const asked = taskMessage('assigned', { ref: 'HR-1', title: 'Find an administrator', actor: 'Director', project: 'HR', acceptBy: '2026-10-14T09:00:00Z' })('ru', regional);
  assert.match(asked.body, /Примите её в работу до/);
  const plain = taskMessage('assigned', { ref: 'HR-1', title: 'Find an administrator', actor: 'Director', project: 'HR' })('en', regional);
  assert.doesNotMatch(plain.body, /accept/);
  assert.equal(taskMessage('notAccepted', { ref: 'HR-1', title: 'T', hours: 26, assignee: 'Aida' })('ru').title, 'Задача HR-1 не принята за 26 ч');
  assert.match(taskMessage('accepted', { ref: 'HR-1', title: 'T', actor: 'Aida', comment: 'On it' })('en').body, /Aida: “On it”/);
  assert.match(taskMessage('acceptOverdue', { ref: 'HR-1', title: 'T', hours: 25 })('en').title, /Accept HR-1/);
});

test('a task completed before acceptance and reopened: accepted by its assignee, else the time to accept starts over', () => {
  assert.equal(reopenAcceptance({ actorId: 5, assigneeId: 5, originatorId: 1 }), 'accept');
  assert.equal(reopenAcceptance({ actorId: 1, assigneeId: 5, originatorId: 1 }), 'restart');
  assert.equal(reopenAcceptance({ actorId: 2, assigneeId: 1, originatorId: 1 }), 'accept', 'the originator’s own task');
  assert.equal(reopenAcceptance({ actorId: 1, assigneeId: null, originatorId: 1 }), null);
});

test('a new acceptance deadline re-arms the "not accepted" notice only while it is ahead', () => {
  const now = Date.parse('2026-10-13T10:00:00Z');
  assert.equal(rearmsAcceptNotice('2026-10-13T12:00:00Z', now), true);
  assert.equal(rearmsAcceptNotice('2026-10-13T09:00:00Z', now), false);
  assert.equal(rearmsAcceptNotice(null, now), false);
});
