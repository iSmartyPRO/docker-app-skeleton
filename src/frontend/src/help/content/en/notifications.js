export default {
  id: 'notifications',
  icon: 'bell',
  title: 'Notifications',
  tagline: 'What the portal tells you, where and when',
  summary: 'The portal tells you about tasks, meetings, mentions and files. Everything always lands in the bell, and you decide what else goes to push, e-mail, Telegram, WhatsApp and Mattermost: per event, with quiet hours and a pause. Follow a project or a calendar to keep an eye on all of it.',
  highlights: [
    {
      icon: '🔔',
      title: 'The bell',
      text: 'Every notification in one place in the header, with an unread counter.',
    },
    {
      icon: '📱',
      title: 'Push and messengers',
      text: 'Push to phone and computer, e-mail, Telegram, WhatsApp and Mattermost — whichever are connected.',
    },
    {
      icon: '🎚️',
      title: 'Per event',
      text: 'An “event × channel” table: e.g. assignments everywhere, status changes push only.',
    },
    {
      icon: '🌙',
      title: 'Quiet hours and pause',
      text: 'No pushes or messages at night or at weekends; pause for an hour or until morning.',
    },
    {
      icon: '⭐',
      title: 'Subscriptions',
      text: 'Follow a whole project or calendar without taking part in each item.',
    },
    {
      icon: '🧪',
      title: 'Test and history',
      text: 'A test through every channel and a history: where each one went and why it did not arrive.',
    },
  ],
  tips: [
    'Start with “Send a test” — you see at once which channels work.',
    'Push on a phone works best when the portal is installed as an app.',
    'Too many messages? “Presets” → “Only important”.',
    'Reminders you set yourself always arrive — even during quiet hours.',
    'A muted chat (⋯ → Mute) sends no push, but @mentions still arrive.',
  ],
  sections: [
    {
      id: 'channels',
      title: 'Channels: where notifications go',
      body: `- **The bell** in the header — always, nothing is lost.
- **Push** — pop-up notifications on phone and computer. Turned on per device in [notification settings](/account/notifications) (“Push on this device”). On iPhone push works only in the installed app (Share → “Add to Home Screen”).
- **E-mail** — to the address in your [profile](/account).
- **Telegram** — link your account in [Profile → Security](/account/security).
- **WhatsApp** — add your mobile phone in the [profile](/account); messages go to that number (if the administrator has connected WhatsApp).
- **Mattermost** — enter your Mattermost name in your [profile](/account).

A channel card shows its state: “On”, “Off” (by you) or “Not connected” — with a link to connect it. A switched-off channel gets nothing.`,
      steps: [
        'Open [Profile → Notifications](/account/notifications).',
        'Connect the channels you want using the links in the cards.',
        'Click **Send a test** — each channel shows “delivered” or the reason it failed.',
      ],
    },
    {
      id: 'events',
      title: 'What to tell you about',
      body: `In the “About what” table rows are events (you got a task, a meeting invitation, a chat mention…), columns are channels. Tick where you want each event. Grey columns are channels that are not connected or switched off.

The **“Bell”** column is the portal bell. Untick it if you do not need an event at all. Reminders (“always”) cannot be switched off — they go where you chose when creating them.

**Presets** change the whole table at once: “Recommended”, “Only important”, “Everything everywhere”, “Bell only”.`,
      example: {
        title: 'Fewer e-mails, nothing important missed',
        body: 'Choose “Presets” → “Only important”: assignments, mentions, invitations, overdue tasks and reminders go to e-mail and Telegram, the rest only to the bell. Then tick push for “Status changes” if you want to follow progress.',
      },
    },
    {
      id: 'quiet',
      title: 'Quiet hours and pause',
      body: `**Quiet hours** — e.g. 22:00 to 08:00 and all weekend — keep push, e-mail and messengers silent. **Pause** does the same for a while: an hour, 3 hours, until tomorrow morning or until Monday.

The bell keeps collecting everything, so in the morning you see what happened. Reminders you set yourself always arrive on time.

Quiet hours and the pause follow your time zone — change it in [Appearance → Date and time](/account/appearance).`,
      note: 'Quiet hours use your browser’s time zone — it is saved when you change the settings.',
    },
    {
      id: 'subscriptions',
      title: 'Following projects and calendars',
      body: `A subscription lets you follow a whole project or calendar without taking part in each task or event.

- **Task project**: 🔔 **Follow** on the project page — you hear about new and completed tasks.
- **Calendar**: ⋯ next to a shared calendar → **Notify me about changes** — new, changed and removed events.

All subscriptions are listed in notification settings, where you can also unsubscribe. How they reach you is set in the rows “Projects I follow” and “Calendars I follow”.`,
      example: {
        title: 'A manager follows a project',
        body: 'A head of department is not in every task of the “Website” project but wants to know what is new and what is closed. They click 🔔 “Follow” on the project page and get a push for every new and completed task.',
      },
    },
    {
      id: 'reminders',
      title: 'Reminders',
      body: `You set a reminder in a task or event yourself, so it always arrives — even during quiet hours or a pause — through the channels chosen when creating it.

When choosing the time use quick options (“In an hour”, “Tomorrow morning”) or date and time separately. Under the picker the portal says exactly when the reminder fires and warns if a chosen channel is not connected.`,
      example: {
        title: 'A reminder did not arrive',
        body: 'You changed only the time and the date stayed tomorrow — so it fires tomorrow. Now the picker says “Fires … — in …”, which makes this hard to miss. If messengers are chosen but Telegram is not linked, the portal warns and links to the fix.',
      },
    },
    {
      id: 'history',
      title: 'Delivery history',
      body: 'At the bottom of notification settings are the recent notifications with a mark per channel: green — delivered, grey — not used (off, not connected, quiet hours), red — failed. Hover a mark to read the reason.',
    },
    {
      id: 'chat',
      title: 'Chats',
      body: 'For new messages a chat sends only a push — and only if you are not looking at that chat. A @mention is a full notification to all chosen channels. A muted chat sends no push except mentions.',
    },
  ],
  faq: [
    {
      q: 'Nothing arrives in Telegram',
      a: 'Link Telegram in [Profile → Security](/account/security), then in [notifications](/account/notifications) switch the Telegram card on and click “Send a test”. If the card says “Unavailable”, the administrator has not set up the bot yet.',
    },
    {
      q: 'No push on my phone',
      a: 'Open notification settings on the phone itself and turn on “Push on this device”. On iPhone first add the portal to the Home Screen and open it from there. Check that notifications for the browser/app are allowed in the phone’s settings.',
    },
    {
      q: 'How do I get fewer notifications?',
      a: '“Presets” → “Only important”, turn on quiet hours, mute noisy chats, and untick specific events in the table.',
    },
    {
      q: 'Are notifications lost during quiet hours?',
      a: 'No. They are always in the bell; quiet hours only hold back push, e-mail and messengers.',
    },
    {
      q: 'Where can I see why a notification did not arrive?',
      a: 'In notification settings → “Recent notifications”: hover a channel mark.',
    },
  ],
  fields: {
    channels: {
      title: 'Channels',
      text: 'Where notifications go besides the bell. “Send a test” checks every connected channel.',
      more: 'channels',
    },
    quiet: {
      title: 'Quiet hours and pause',
      text: 'Push, e-mail and messengers stay silent then; the bell collects everything. Your reminders always arrive.',
      more: 'quiet',
    },
    events: {
      title: 'Events and channels',
      text: 'Tick where each event goes. “Presets” change everything at once.',
      more: 'events',
    },
    subscriptions: {
      title: 'Subscriptions',
      text: 'Follow a project (🔔 on its page) or a calendar (⋯ → Notify me about changes).',
      more: 'subscriptions',
    },
  },
  related: [
    'account',
    'tasks',
    'calendar',
    'chat',
  ],
};
