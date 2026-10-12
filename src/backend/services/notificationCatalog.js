/*
 * Every kind of notification the portal sends, grouped for the preferences
 * screen, with the channels it uses unless the person says otherwise.
 *
 *   urgent     reminders the person scheduled themselves: they ignore quiet
 *              hours and the pause, and cannot be switched off per event
 *              (the reminder itself chooses its channels)
 *   channels   the external channels the event can use at all
 *              (a chat message is a push, never an e-mail)
 *
 * A module that sends a new kind adds it here; unknown kinds behave like
 * "on everywhere".
 */

const ALL = ['push', 'email', 'telegram', 'whatsapp', 'mattermost'];
// Messengers (Telegram, WhatsApp, Mattermost) share one default per event.
const on = (push, email, messenger) => ({ push, email, telegram: messenger, whatsapp: messenger, mattermost: messenger });

export const NOTIFICATION_GROUPS = [
  {
    key: 'tasks',
    module: 'tasks',
    events: [
      { kind: 'tasks.assigned', defaults: on(true, true, true) },
      { kind: 'tasks.status', defaults: on(true, false, false) },
      { kind: 'tasks.result', defaults: on(true, true, true) },
      { kind: 'tasks.priority', defaults: on(true, false, true) },
      { kind: 'tasks.due_soon', defaults: on(true, true, true) },
      { kind: 'tasks.overdue', defaults: on(true, true, true) },
      { kind: 'tasks.project', defaults: on(true, false, false), subscription: true },
      { kind: 'tasks.reminder', defaults: on(true, true, true), urgent: true },
    ],
  },
  {
    key: 'calendar',
    module: 'calendar',
    events: [
      { kind: 'calendar.invited', defaults: on(true, true, true) },
      { kind: 'calendar.updated', defaults: on(true, true, false) },
      { kind: 'calendar.cancelled', defaults: on(true, true, true) },
      { kind: 'calendar.rsvp', defaults: on(true, false, false) },
      { kind: 'calendar.subscribed', defaults: on(true, false, false), subscription: true },
      { kind: 'calendar.reminder', defaults: on(true, true, true), urgent: true },
    ],
  },
  {
    key: 'chat',
    module: 'chat',
    events: [
      { kind: 'chat.mention', defaults: on(true, true, true) },
      { kind: 'chat.message', defaults: on(true, false, false), channels: ['push'] },
    ],
  },
  {
    key: 'files',
    module: 'files',
    events: [{ kind: 'files.shared', defaults: on(true, true, false) }],
  },
  {
    key: 'system',
    module: null,
    events: [{ kind: 'system.test', defaults: on(true, true, true), urgent: true, hidden: true }],
  },
];

export const NOTIFICATION_EVENTS = NOTIFICATION_GROUPS.flatMap((group) => group.events.map((event) => ({ ...event, group: group.key, module: group.module, channels: event.channels || ALL })));

export function eventInfo(kind) {
  return NOTIFICATION_EVENTS.find((event) => event.kind === kind) || { kind, defaults: on(true, true, true), channels: ALL, urgent: false };
}
