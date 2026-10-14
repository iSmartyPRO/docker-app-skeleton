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
      // «Принять в работу»: my task was accepted / not accepted in time; I have not accepted one in time.
      { kind: 'tasks.accepted', defaults: on(true, false, false) },
      { kind: 'tasks.not_accepted', defaults: on(true, true, true) },
      { kind: 'tasks.accept_overdue', defaults: on(true, true, true) },
      { kind: 'tasks.project', defaults: on(true, false, false), subscription: true },
      { kind: 'tasks.reminder', defaults: on(true, true, true), urgent: true },
    ],
  },
  {
    key: 'crm',
    module: 'crm',
    events: [
      { kind: 'crm.assigned', defaults: on(true, true, true) },
      { kind: 'crm.activity', defaults: on(true, true, true) },
      // Reminders set on an activity ("remind N minutes before"), like tasks.reminder.
      { kind: 'crm.activity_due', defaults: on(true, true, true), urgent: true },
      { kind: 'crm.stage', defaults: on(true, false, false) },
    ],
  },
  {
    key: 'masterplan',
    module: 'masterplan',
    events: [
      // A reserve or booking of mine ends soon (settings.warnHours before) / was released by the timer.
      { kind: 'masterplan.expiring', defaults: on(true, true, true) },
      { kind: 'masterplan.expired', defaults: on(true, true, true) },
      // Units reserved, booked, sold… in my zone (heads of sales, management).
      { kind: 'masterplan.status', defaults: on(true, false, false) },
      // New construction report on units I hold / sell.
      { kind: 'masterplan.report', defaults: on(true, false, false) },
      // Moderation: a report waits for me / my report was published or returned.
      { kind: 'masterplan.review', defaults: on(true, true, false) },
      // Objects without fresh reports, delays over the threshold.
      { kind: 'masterplan.construction', defaults: on(true, true, false) },
      { kind: 'masterplan.access', defaults: on(true, true, false) },
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
    events: [
      { kind: 'files.shared', defaults: on(true, true, false) },
      // Visitors uploaded or changed files through a public link with "notify me" (one notice per visit).
      { kind: 'files.linkActivity', defaults: on(true, true, false) },
    ],
  },
  {
    // File server: visitors of my public links uploaded, changed or deleted files (one digest per visit).
    key: 'drive',
    module: 'drive',
    events: [{ kind: 'drive.linkActivity', defaults: on(true, true, false) }],
  },
  {
    // Approvals (docs/approvals.md): a core service, so the group is always shown.
    key: 'approvals',
    module: 'approvals',
    events: [
      // Something waits for my decision (also: passed to me by another approver).
      { kind: 'approval.request', defaults: on(true, true, true) },
      // A question about my document, or one addressed to me.
      { kind: 'approval.question', defaults: on(true, true, true) },
      { kind: 'approval.answer', defaults: on(true, true, true) },
      // My document: final approval, rejection, return for rework; a stage passed.
      { kind: 'approval.approved', defaults: on(true, true, true) },
      { kind: 'approval.rejected', defaults: on(true, true, true) },
      { kind: 'approval.returned', defaults: on(true, true, true) },
      { kind: 'approval.progress', defaults: on(false, false, false) },
      // Deadline reminders and "overdue" to the approvers.
      { kind: 'approval.reminder', defaults: on(true, true, true) },
      // An overdue stage, to the route's escalation people (module administrators by default).
      { kind: 'approval.escalation', defaults: on(true, true, false) },
      { kind: 'approval.withdrawn', defaults: on(false, false, false) },
    ],
  },
  {
    // Contracts (docs/contracts.md); approvals of contracts use the approval.* kinds above.
    key: 'contracts',
    module: 'contracts',
    events: [
      // I became the lawyer or the business owner of a contract.
      { kind: 'contracts.assigned', defaults: on(true, true, false) },
      // Signed, in force, expiring, completed, terminated, prolonged — on contracts I own, handle or created.
      { kind: 'contracts.status', defaults: on(true, false, false) },
      { kind: 'contracts.version', defaults: on(true, false, false) },
      // A high-importance risk on my contract.
      { kind: 'contracts.risk', defaults: on(true, true, false) },
      // N days before the end or before the refusal deadline of an auto-prolonged contract.
      { kind: 'contracts.reminder', defaults: on(true, true, true) },
    ],
  },
  {
    // Procurement (docs/procurement.md); approvals of requests use the approval.* kinds above.
    key: 'procurement',
    module: 'procurement',
    events: [
      // An approved request waits for payment (accounting: procurement.pay).
      { kind: 'procurement.to_pay', defaults: on(true, true, true) },
      // My request was paid (also partly) / delivered.
      { kind: 'procurement.paid', defaults: on(true, true, true) },
      { kind: 'procurement.delivered', defaults: on(true, false, false) },
      // I became the responsible person of a request.
      { kind: 'procurement.assigned', defaults: on(true, true, false) },
      // «Pay by» / «deliver by» is near, or has passed (once each).
      { kind: 'procurement.due_soon', defaults: on(true, true, true) },
      { kind: 'procurement.overdue', defaults: on(true, true, true) },
    ],
  },
  {
    // Warehouse (docs/warehouse.md); approvals of write-offs use the approval.* kinds above.
    key: 'warehouse',
    module: 'warehouse',
    events: [
      // MOL of the destination: a transfer was shipped and waits for acceptance.
      { kind: 'warehouse.transfer_incoming', defaults: on(true, true, true) },
      // Storekeepers: a requisition was filed; the requester / recipient: it was issued.
      { kind: 'warehouse.requested', defaults: on(true, false, true) },
      { kind: 'warehouse.issued', defaults: on(true, false, false) },
      // Accepted with a difference (the discrepancy act).
      { kind: 'warehouse.discrepancy', defaults: on(true, true, true) },
      // A colleague hands tools over to me / my hand-over was accepted or declined.
      { kind: 'warehouse.handover', defaults: on(true, false, true) },
      // Daily digest «below minimum» (MOL and buyers); batches expiring.
      { kind: 'warehouse.stock_low', defaults: on(true, true, false) },
      { kind: 'warehouse.expiring', defaults: on(true, true, false) },
      // Tool service / calibration due; issued tools not returned on time.
      { kind: 'warehouse.service', defaults: on(true, true, false) },
      { kind: 'warehouse.tool_overdue', defaults: on(true, true, true) },
      // An approved write-off could not be posted (the stock is gone).
      { kind: 'warehouse.post_failed', defaults: on(true, true, false) },
      // Inventory: I was asked to count (or recount) / a regular partial count is due.
      { kind: 'warehouse.inventory_assigned', defaults: on(true, false, true) },
      { kind: 'warehouse.inventory_due', defaults: on(true, true, false) },
    ],
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
