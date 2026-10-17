export default {
  groups: {
    drive: 'File server',
    tasks: 'Tasks',
    crm: 'CRM',
    calendar: 'Calendar',
    chat: 'Chat',
    files: 'Files',
    masterplan: 'Masterplan',
    approvals: 'Approvals',
    contracts: 'Contracts',
    procurement: 'Procurement',
    warehouse: 'Warehouse',
    employees: 'Employees',
  },
  events: {
    drive_linkActivity: {
      title: 'Activity on my links',
      desc: 'Visitors of your public links uploaded, changed or deleted files (one notice per visit)',
    },
    tasks_assigned: {
      title: 'I get a task',
      desc: 'You become the assignee, co-assignee or auditor',
    },
    tasks_status: {
      title: 'Status changes',
      desc: 'A task you take part in moves to another status',
    },
    tasks_result: {
      title: 'A result is added',
      desc: 'To a task you set',
    },
    tasks_priority: {
      title: 'Became urgent',
      desc: 'The priority of your task is raised to urgent',
    },
    tasks_due_soon: {
      title: 'Deadline is near',
      desc: 'Within a day of the deadline',
    },
    tasks_overdue: {
      title: 'Task overdue',
      desc: 'The deadline has passed',
    },
    tasks_accepted: {
      title: 'My task is accepted',
      desc: 'The assignee accepts a task you set',
    },
    tasks_not_accepted: {
      title: 'Not accepted in time',
      desc: 'The assignee has not accepted your task in time',
    },
    tasks_accept_overdue: {
      title: 'Accept a task',
      desc: 'A task given to you waits for acceptance longer than it should',
    },
    tasks_project: {
      title: 'Projects I follow',
      desc: 'New and completed tasks in projects you subscribed to',
    },
    tasks_reminder: {
      title: 'Task reminders',
      desc: 'The reminders you or others set in a task',
    },
    crm_assigned: {
      title: 'A deal is assigned to me',
      desc: 'You become the responsible person of a deal',
    },
    crm_activity: {
      title: 'An activity for me',
      desc: 'Someone plans a call, meeting or task for you in a deal',
    },
    crm_activity_due: {
      title: 'Activity reminders',
      desc: 'Before the due time of your activity',
    },
    crm_stage: {
      title: 'Stage of a deal I watch',
      desc: 'A deal you are responsible for or watch moves to another stage',
    },
    calendar_invited: {
      title: 'Invitation',
      desc: 'Someone invites you to an event',
    },
    calendar_updated: {
      title: 'Event changed',
      desc: 'Time or place of your event changed',
    },
    calendar_cancelled: {
      title: 'Event cancelled',
      desc: 'An event you were invited to is cancelled',
    },
    calendar_rsvp: {
      title: 'Answers to my invitations',
      desc: 'Someone accepts or declines',
    },
    calendar_subscribed: {
      title: 'Calendars I follow',
      desc: 'New and changed events in calendars you subscribed to',
    },
    calendar_reminder: {
      title: 'Event reminders',
      desc: 'Before an event starts',
    },
    chat_mention: {
      title: 'Mentions',
      desc: 'Someone writes @you',
    },
    chat_message: {
      title: 'Chat messages',
      desc: 'New messages in your chats (push only, not when you are reading)',
    },
    files_shared: {
      title: 'Shared with me',
      desc: 'Someone shares a file or folder with you',
    },
    files_linkActivity: {
      title: 'Activity on my public links',
      desc: 'Visitors upload or change files through a link with “Notify me” (one notice per visit)',
    },
    masterplan_expiring: {
      title: 'My reserve or booking ends soon',
      desc: '24 and 2 hours before the end (configurable)',
    },
    masterplan_expired: {
      title: 'A reserve or booking was released by the timer',
      desc: 'Yours, or in your zone as head of sales',
    },
    masterplan_status: {
      title: 'Units booked, sold, rolled back',
      desc: 'For heads of sales and management, in their zone',
    },
    masterplan_report: {
      title: 'New construction report',
      desc: 'On units you hold or are responsible for',
    },
    masterplan_review: {
      title: 'Report moderation',
      desc: 'A report waits for review / yours was published or returned',
    },
    masterplan_construction: {
      title: 'Construction alerts',
      desc: 'Objects without fresh reports, delays over the threshold',
    },
    masterplan_access: {
      title: 'Access requests',
      desc: 'Someone asks for access to Masterplan',
    },
    approval_request: {
      title: 'Waiting for my approval',
      desc: 'A document comes to your stage or is passed to you',
    },
    approval_question: {
      title: 'A question for me',
      desc: 'An approver asks about your document or asks you',
    },
    approval_answer: {
      title: 'An answer to my question',
      desc: 'The document is back on your approval',
    },
    approval_approved: {
      title: 'My document is approved',
      desc: 'All stages approved',
    },
    approval_rejected: {
      title: 'My document is rejected',
      desc: 'With the approver’s comment',
    },
    approval_returned: {
      title: 'Returned for rework',
      desc: 'Make changes and send it again',
    },
    approval_progress: {
      title: 'A stage of my document passed',
      desc: 'Each approved stage before the last one',
    },
    approval_reminder: {
      title: 'Approval reminders',
      desc: 'When 75 % of the reaction time is spent, and when it is overdue',
    },
    approval_escalation: {
      title: 'Escalations',
      desc: 'Someone else’s approval is overdue and you are its escalation contact',
    },
    approval_withdrawn: {
      title: 'Withdrawn by the author',
      desc: 'A document waiting for you was taken back',
    },
    contracts_assigned: {
      title: 'I am the lawyer or the owner of a contract',
      desc: 'Someone named you on a contract',
    },
    contracts_status: {
      title: 'Contract status',
      desc: 'Signed, in force, expiring, completed, terminated, prolonged',
    },
    contracts_version: {
      title: 'A new version of a contract',
      desc: 'With what changed',
    },
    contracts_risk: {
      title: 'A high-importance risk',
      desc: 'The lawyer found a serious issue in my contract',
    },
    contracts_reminder: {
      title: 'Contract end reminders',
      desc: '30 and 7 days before the end and before the refusal deadline',
    },
    contracts_payment: {
      title: 'Money on my contract',
      desc: 'A deposit confirmed, returned or credited; a payment received',
    },
    contracts_payment_due: {
      title: 'A payment is due soon',
      desc: 'A few days before a payment of my contract and on the day',
    },
    contracts_payment_overdue: {
      title: 'A payment is overdue',
      desc: 'To the business owner and to finance, once per payment',
    },
    procurement_to_pay: {
      title: 'A request waits for payment',
      desc: 'Accounting: an approved request is in the payments registry',
    },
    procurement_paid: {
      title: 'My request was paid',
      desc: 'Every payment, also a partial one',
    },
    procurement_delivered: {
      title: 'My request was delivered',
      desc: 'Delivery confirmed, fully or partly',
    },
    procurement_assigned: {
      title: 'I am responsible for a request',
      desc: 'Someone made you the buyer of a request',
    },
    procurement_due_soon: {
      title: 'Pay-by or deliver-by is near',
      desc: 'Once, a day before (configurable)',
    },
    procurement_overdue: {
      title: 'Payment or delivery is overdue',
      desc: 'Once, the day after the date',
    },
    warehouse_transfer_incoming: {
      title: 'Incoming transfer to accept',
      desc: 'To the MOL of the destination warehouse',
    },
    warehouse_requested: {
      title: 'A requisition was filed',
      desc: 'To the storekeepers of the warehouse',
    },
    warehouse_issued: {
      title: 'Goods were issued to me',
      desc: 'An issue to me or my requisition was posted',
    },
    warehouse_discrepancy: {
      title: 'Discrepancy on acceptance',
      desc: 'A transfer was accepted with a difference',
    },
    warehouse_handover: {
      title: 'Tool hand-over',
      desc: 'A colleague hands tools over, or accepted / declined mine',
    },
    warehouse_stock_low: {
      title: 'Below minimum (daily)',
      desc: 'A digest per warehouse to the MOL and the buyers',
    },
    warehouse_expiring: {
      title: 'Batches expiring',
      desc: 'Shelf life ends soon',
    },
    warehouse_service: {
      title: 'Tool service due',
      desc: 'Maintenance or calibration is near or overdue',
    },
    warehouse_tool_overdue: {
      title: 'Not returned on time',
      desc: 'Issued items past their return date',
    },
    warehouse_post_failed: {
      title: 'Approved but not posted',
      desc: 'The stock was gone when the write-off was approved',
    },
    warehouse_inventory_assigned: {
      title: 'Inventory: count or recount',
      desc: 'I was asked to count bins or to recount',
    },
    warehouse_inventory_due: {
      title: 'Regular inventory due',
      desc: 'A scheduled partial count is due (MOL and inventory people)',
    },
    employees_clearance: {
      title: 'Clearance expiring',
      desc: 'To HR, the employee and their manager, before and on the expiry date',
    },
  },
  lead: 'Choose where notifications reach you, when they keep quiet and what they are about. The bell in the portal always has everything.',
  whereTitle: 'Where',
  whereLead: 'Channels connected to your account. Switch one off to stop everything through it.',
  test: 'Send a test',
  thisDevice: 'On this device',
  testNote: 'A test goes through every connected channel, even switched-off ones, so you can check the connection.',
  devices: 'Devices: {n}',
  notConfigured: 'Not set up by the administrator yet.',
  state: {
    on: 'On',
    off: 'Off',
    disconnected: 'Not connected',
    admin: 'Unavailable',
    always: 'Always',
  },
  delivery: {
    sent: 'delivered',
    off: 'switched off by you',
    unreachable: 'not connected',
    quiet: 'held: quiet hours',
    paused: 'held: pause',
    deferred: 'held until quiet hours or the pause end',
    expired: 'not sent: held too long',
    skipped: 'not used',
  },
  short: {
    inbox: 'Bell',
    push: 'Push',
    email: 'Mail',
    telegram: 'TG',
    whatsapp: 'WA',
    mattermost: 'MM',
  },
  whenTitle: 'When',
  whenLead: 'Keep pushes and messages quiet at night or for a while. The bell still collects everything.',
  pauseButton: 'Pause',
  pause: {
    h1: 'For an hour',
    h3: 'For 3 hours',
    tomorrow: 'Until tomorrow morning',
    monday: 'Until Monday morning',
  },
  pausedUntil: 'Notifications are paused until {time}',
  resume: 'Resume now',
  quiet: 'Quiet hours',
  from: 'from',
  to: 'to',
  weekends: 'and all weekend',
  quietNote: 'Reminders you set yourself still arrive on time.',
  zoneNote: 'Times are in your time zone: {zone}.',
  zoneChange: 'Change',
  whatTitle: 'About what',
  whatLead: 'Each row is an event, each column a channel. Grey columns are not connected or switched off above.',
  presetsButton: 'Presets',
  presets: {
    recommended: 'Recommended',
    recommendedDesc: 'The defaults: important things everywhere, the rest as push.',
    important: 'Only important',
    importantDesc: 'Assignments, mentions, invitations, overdue tasks and reminders outside the portal.',
    everything: 'Everything everywhere',
    everythingDesc: 'Every event through every connected channel.',
    bellOnly: 'Bell only',
    bellOnlyDesc: 'Nothing outside the portal except reminders.',
  },
  alwaysTag: 'always',
  subTag: 'by subscription',
  matrixNote: 'Reminders you create choose their own channels and always arrive.',
  subsTitle: 'Subscriptions',
  subsLead: 'Follow a whole project or calendar without taking part in each item.',
  noSubs: 'No subscriptions. Subscribe on a project page (🔔) or in the calendar menu of a shared calendar (⋯ → Notify me about changes).',
  subType: {
    tasks_project: 'Task project',
    calendar_calendar: 'Calendar',
  },
  unsubscribe: 'Unsubscribe',
  historyTitle: 'Recent notifications',
  historyLead: 'Where each one went. Hover a channel to see why it did or did not arrive.',
  noHistory: 'Nothing yet.',
};
