export default {
  id: 'chat',
  purpose: 'Chats is the portal’s messenger: direct and group conversations, discussions of tasks, deals, requests and contracts. Work talk stays in the company and next to the record instead of personal messengers.',
  audience: 'Every employee.',
  setup: [
    {
      title: 'Allow or forbid groups',
      text: 'In the [settings](/admin/settings/chat) decide whether anyone may create group chats.',
    },
    {
      title: 'Limit file size',
      text: 'The maximum attachment size in megabytes.',
    },
    {
      title: 'Set up video calls',
      text: 'A meeting link template; `{room}` becomes a unique code. Leave it empty to hide the call button.',
    },
    {
      title: 'Check push notifications',
      text: 'Messages reach people who are not looking through [notifications](/admin/settings/notifications).',
    },
  ],
  roles: {
    'chat.admin': 'Create groups when it is forbidden for others and delete any message. It does not allow reading other people’s direct chats.',
  },
  scenarios: [
    {
      title: 'Department chat',
      text: 'The head creates a «Sales» group and pins key messages; newcomers are added in one click.',
    },
    {
      title: 'Discussing a task',
      text: 'Each task has its own chat: participants see the history of changes and the discussion together.',
    },
  ],
  faq: [
    {
      q: 'What if chats are switched off?',
      a: 'Conversations are hidden but kept. Tasks, deals and requests lose their discussion tab.',
    },
    {
      q: 'Can the administrator read direct messages?',
      a: 'No. A direct chat is visible to its participants only.',
    },
    {
      q: 'Which call service is needed?',
      a: 'Any service where a meeting opens by link (Jitsi Meet by default). You can point to your own server.',
    },
  ],
};
