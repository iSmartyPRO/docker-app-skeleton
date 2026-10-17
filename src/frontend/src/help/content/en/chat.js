export default {
  id: 'chat',
  icon: 'chat',
  title: 'Chats',
  tagline: 'Real-time messaging with colleagues, groups and task discussions',
  summary: 'Message colleagues one to one, set up group chats and discuss tasks right in their card. Share files and screenshots, reply to messages, react and start a video call in one click. If you are not looking at a chat, a new message reaches you as a push notification.',
  highlights: [
    {
      icon: '💬',
      title: 'Direct and group',
      text: 'One chat per colleague and as many groups as your teams and projects need.',
    },
    {
      icon: '✅',
      title: 'Task chats',
      text: 'Every task has its own discussion with all its participants already inside.',
    },
    {
      icon: '📎',
      title: 'Files and screenshots',
      text: 'Paperclip, drag and drop or Ctrl+V — images show right in the conversation.',
    },
    {
      icon: '@',
      title: 'Mentions',
      text: 'Type @ and a name — the colleague is notified even if they muted the chat.',
    },
    {
      icon: '🎥',
      title: 'Video call',
      text: 'One button, and the meeting link is in the chat for everyone.',
    },
    {
      icon: '🔔',
      title: 'Push without the noise',
      text: 'A notification arrives only when you are not looking at that chat.',
    },
  ],
  tips: [
    'Took a screenshot? Just press **Ctrl+V** in the message box.',
    'Type **@** to mention a colleague — they will not miss it.',
    '**Shift+Enter** for a new line, **Enter** to send.',
    'Hover a message and click “Reply” to quote it.',
    'Noisy group? Menu **⋯** → “Mute”.',
    'Pin important chats — they always stay at the top of the list.',
  ],
  sections: [
    {
      id: 'chats',
      title: 'Direct and group chats',
      body: `All conversations live in [Chats](/app/chat). Pinned ones come first, then by the time of the last message. Filters above the list: **All**, **Unread**, **People**, **Groups**, **Tasks**.

- A **direct chat** is between two people. There is one per colleague, and history is kept.
- A **group chat** is for a team, department or project. Its creator becomes the owner.

The chat button in the portal header shows the unread count on every page and opens your recent conversations.`,
      steps: [
        'Click **✎** above the chat list (“New chat”).',
        'For a direct chat keep “Person” and pick a colleague.',
        'For a group switch to “Group”, enter a name and choose the members.',
        'Click “Create group”.',
      ],
      example: {
        title: 'A department group',
        body: 'A manager creates the group “Sales team” and adds six salespeople. Announcements, schedules and quick questions now live in one place, and new hires are added later from the “People” panel.',
      },
      note: 'If there is no “Group” tab, the administrator allowed only chat administrators to create groups. Ask them to create one for you.',
    },
    {
      id: 'task-chats',
      title: 'Task chats',
      body: `Every task has its own chat. It opens right in the task card and also appears in the chat list under the **Tasks** filter. Its name comes from the task, e.g. \`TSK-12 · Contract\`.

Task events land in the chat automatically: status changes, new assignees and so on. They are shown as grey lines and do not count as unread.

Whoever can see the task can see its chat. There is no separate member list to manage.`,
      example: {
        title: 'A question on a task',
        body: 'The assignee writes in the task chat: “@ivanov, what are the payment terms in the contract?” Ivanov gets notified and replies right there, and a month later the whole story is still next to the task.',
      },
      note: 'A task chat cannot be pinned or hidden, but it can be muted. To go to the task itself, choose “Open the task” in the **⋯** menu.',
    },
    {
      id: 'messages',
      title: 'Messages',
      body: `**Enter** sends a message, **Shift+Enter** adds a new line.

Simple formatting:
- \`**bold**\` → **bold**
- \`_italic_\` or \`*italic*\` → italic
- \`~~strike~~\` → strikethrough
- \`\` \`code\` \`\` and code blocks in triple backticks
- links become clickable by themselves

A message of one to three emoji is shown large.

Hover a message to see its actions:
- **Reply** sends your message with a quote; clicking the quote jumps to the original.
- **React** with 👍 ❤️ 😂 😮 🙏 🔥 or any emoji; hover a reaction to see who left it.
- **More** lets you copy the text, edit or delete your own message.`,
      example: {
        title: 'A quick answer',
        body: 'A colleague asks the group: “Who can run the demo tomorrow?” Instead of a separate message, react with 👍 — or click “Reply” and write “Me, at 11:00” so the answer is tied to the question.',
      },
      note: 'You can edit and delete only your own messages. A deleted one leaves a “Message deleted” stub. The group owner and chat administrators can delete any message.',
    },
    {
      id: 'mentions',
      title: 'Mentions',
      body: `Type **@** to see the chat members. Pick a person with the arrow keys and press **Enter** or **Tab**.

The mentioned person is notified through every channel they enabled in their profile: the bell, push, email, Telegram, Mattermost. This works **even if they muted the chat**. In the chat list such a conversation shows an **@** mark.`,
      example: {
        title: 'Calling the right person',
        body: 'In a group of 30 many people have muted the chat. Write “@petrova, please check the invoice” — Petrova gets notified and nobody else is disturbed.',
      },
    },
    {
      id: 'files',
      title: 'Files and images',
      body: `Three ways to send a file:
- the paperclip next to the message box;
- drag files into the chat window;
- paste a screenshot or a copied file with **Ctrl+V**.

Files upload at once; add some text and send them together. Images show a preview — click to view full screen. Other files appear as a card with name and size. Images, PDF, text, audio and video open in the browser, everything else downloads.

Everything shared in a chat is on the **Files** tab of the side panel; the ↗ button shows the message where it was sent.`,
      note: 'The size of one file is limited (100 MB by default). If a file is larger, you will see “… is larger than N MB”.',
    },
    {
      id: 'read-typing',
      title: 'Read receipts and typing',
      body: `- **✓** — the message was sent.
- **✓✓** — the others have read it.
- “Ivan is typing…” at the bottom — the other person is writing.
- The **New messages** bar marks where your unread part starts.
- The down-arrow button takes you back to the latest messages and shows how many new ones arrived.

Messages count as read once you scroll to the end of the chat in a visible tab.`,
    },
    {
      id: 'search',
      title: 'Search',
      body: `- **In the chat list** — the “Search chats” box above the list finds chats by name and colleagues by name.
- **Inside a chat** — the magnifier in the header opens “Search in this chat”. Type at least two letters; click a result to jump to the message, however old it is.`,
      steps: [
        'Open the chat and click the magnifier in the header.',
        'Type a word from the message, e.g. “invoice”.',
        'Click the result — it is highlighted in the conversation.',
      ],
    },
    {
      id: 'prefs',
      title: 'Pin, mute, hide',
      body: `The **⋯** menu in the chat header holds settings just for you; other members do not see them:
- **Pin** 📌 keeps the chat at the top of the list.
- **Mute** 🔕 stops push for this chat and turns its unread badge grey. Mentions (@) still reach you.
- **Hide from the list** removes the chat from the list; history is kept.`,
      note: 'A hidden chat comes back by itself as soon as a new message arrives. A direct chat can be brought back right away: “New chat” → pick the colleague.',
    },
    {
      id: 'calls',
      title: 'Video call',
      body: 'The camera button in the chat header creates a meeting (Jitsi by default) and opens it in a new tab. A “Join the call” link appears in the chat at once, so members join in one click. Nothing to install — a browser is enough.',
      example: {
        title: 'A quick stand-up',
        body: 'In the “Sales team” group click the camera — a call card appears in the chat. Colleagues who are not looking at the chat get a push and join right from their phones.',
      },
      note: 'If there is no camera button, the administrator has turned video calls off.',
    },
    {
      id: 'push',
      title: 'Push notifications',
      body: `A new message reaches your phone or computer as a push notification **only if you are not looking at that chat right now**. Each chat keeps one notification on the device — a newer one replaces the older.

Push does not arrive:
- for muted chats (except mentions);
- if push is not enabled on this device;
- if notifications for the portal are blocked in the browser or phone settings.`,
      steps: [
        'On a phone install the portal as an app (PWA): Share → “Add to Home Screen” on iPhone or “Install” in Chrome on Android.',
        'Open [Profile → Notifications](/account/notifications).',
        'Turn on “Push on this device” and allow notifications.',
        'Click “Test” — a test notification should arrive.',
      ],
      note: 'On iPhone push works only in the installed app and from iOS 16.4. Push is turned on separately on each device.',
    },
    {
      id: 'group-admin',
      title: 'Managing a group',
      body: `The person who created a group is its **owner** (marked “owner” in the member list). The owner can:
- add people: side panel **People** → “Add people”;
- remove members: the cross next to a name;
- rename the group: **⋯** menu → “Rename”;
- delete any message.

Any member can leave: **⋯** menu → “Leave the chat”. If the owner leaves, the role passes to the longest-standing member.

Changes to members and the name show up in the chat as grey lines.`,
      note: 'New members see the whole group history, including messages sent before they joined.',
    },
    {
      id: 'admin',
      title: 'Administration',
      body: `Module settings: **Admin → Settings → Modules → Chats**.
- **Enabled** — chats, the header button and task chats.
- **Group chats for everyone** — when off, only chat administrators create groups.
- **Largest file** — the limit for a single file, 1 to 2048 MB (100 by default).
- **Video calls** — the meeting link template; \`{room}\` becomes a unique code. Default \`https://meet.jit.si/{room}\`; leave it empty to hide the call button.

The **Chat admin** permission allows creating groups when that is restricted and deleting any message. It is granted through roles.`,
      example: {
        title: 'Your own video server',
        body: 'The company runs its own Jitsi at `meet.company.com`. Put `https://meet.company.com/{room}` in “Video calls” — every new call goes through it.',
      },
    },
  ],
  faq: [
    {
      q: 'Why do I not get push notifications?',
      a: 'Check in order: push is on for this device ([Profile → Notifications](/account/notifications) → “Push on this device”); notifications are not blocked in the browser or phone; the chat is not muted. On iPhone push works only in the installed app. And remember: if the chat is open on your screen, no push is sent for it.',
    },
    {
      q: 'How do I bring back a hidden chat?',
      a: 'It comes back by itself with the next new message. A direct chat can be opened right away: “New chat” → pick the colleague — all history is still there.',
    },
    {
      q: 'Who can see a task chat?',
      a: 'Everyone who can see the task itself: its author, assignees, watchers and anyone with access to it. The chat always follows the task’s access.',
    },
    {
      q: 'Can I edit or delete a sent message?',
      a: 'Yes, your own: hover the message → “More” → “Edit” or “Delete”. An edited one is marked “edited”, a deleted one leaves “Message deleted”.',
    },
    {
      q: 'Do others see that I muted or pinned a chat?',
      a: 'No. Pinning, muting and hiding are your personal settings only.',
    },
    {
      q: 'Why can I not create a group?',
      a: 'The administrator allowed only chat administrators to create groups. Ask them to create the group or grant you that permission.',
    },
    {
      q: 'A file will not send — what now?',
      a: 'Most likely it is over the size limit — the portal shows “… is larger than N MB”. Compress it or share a link from the [Knowledge base](/app/kb).',
    },
    {
      q: 'How do I leave a group?',
      a: '**⋯** menu in the chat header → “Leave the chat”. You can come back only if the owner adds you again.',
    },
  ],
  fields: {
    groupName: {
      title: 'Group name',
      text: 'All members see it in their chat list. The owner can rename the group later.',
      more: 'chats',
    },
    groupMembers: {
      title: 'Members',
      text: 'Start typing a colleague’s name. You become the group owner, and you can add people later too.',
      more: 'chats',
    },
    addMembers: {
      title: 'Add people',
      text: 'New members see the whole group history. The owner adds and removes people.',
      more: 'group-admin',
    },
    mute: {
      title: 'Mute',
      text: 'No push for this chat, but mentions (@) still reach you. Only you see this.',
      more: 'prefs',
    },
    pin: {
      title: 'Pin',
      text: 'The chat stays at the top of your list.',
      more: 'prefs',
    },
    hide: {
      title: 'Hide from the list',
      text: 'The chat leaves your list and comes back with the next new message. History is kept.',
      more: 'prefs',
    },
    allowGroups: {
      title: 'Group chats for everyone',
      text: 'Turn off if only chat administrators should create groups. Existing groups stay.',
      more: 'admin',
    },
    maxUploadMb: {
      title: 'Largest file',
      text: 'The limit for a single file in a message, 1 to 2048 MB. 100 MB by default.',
      more: 'admin',
    },
    callUrl: {
      title: 'Video calls',
      text: 'The meeting link; `{room}` becomes a unique code, e.g. `https://meet.jit.si/{room}`. Leave empty to hide the call button.',
      more: 'calls',
    },
  },
  related: [
    'tasks',
    'notifications',
    'start',
  ],
};
