export default {
  id: 'calendar',
  icon: 'calendar',
  title: 'Calendar',
  tagline: 'Meetings, task deadlines and shared calendars in one place',
  summary: 'Plan meetings, invite colleagues and get reminders. Tasks with a deadline appear in the calendar by themselves — move them with the mouse or create them right here. Everyone sets the calendar up for themselves: view, working hours, which tasks to show.',
  highlights: [
    {
      icon: '📅',
      title: 'Events and invitations',
      text: 'Meetings with attendees, place, video link and “going / not going” answers.',
    },
    {
      icon: '☑️',
      title: 'Tasks on the calendar',
      text: 'Your task deadlines sit next to meetings; drag a task to move its deadline.',
    },
    {
      icon: '⚡',
      title: 'Quick creation',
      text: 'Click an empty slot and choose “Event” or “Task”.',
    },
    {
      icon: '🔁',
      title: 'Repeats and reminders',
      text: 'Weekly stand-ups, reminders ahead of time — to the portal, push, e-mail and messengers.',
    },
    {
      icon: '👥',
      title: 'Shared calendars',
      text: 'Team or meeting-room calendars shared with groups; follow one to hear about changes.',
    },
    {
      icon: '⚙️',
      title: 'Your way',
      text: 'View, week start, working hours, grid step, weekends, which tasks to show.',
    },
  ],
  tips: [
    'Click and drag across the grid — the event gets that length at once.',
    'Drag a task from “Without a deadline” onto a day to give it a deadline.',
    'The ticks on the left hide and show calendars, invitations and tasks — your choice is remembered.',
    'Click a day number to open that day.',
    '⚙ in the top bar opens your calendar settings.',
  ],
  sections: [
    {
      id: 'views',
      title: 'Views and navigation',
      body: `Switch views at the top: **Month**, **Week**, **Work week** (no Saturday and Sunday), **Day** and **Agenda** — a list of events by day. **Today** returns to the current date, the arrows ‹ › move back and forth.

The mini calendar on the left jumps to any date. On a phone the side panel opens with ☰.`,
    },
    {
      id: 'events',
      title: 'Creating an event',
      body: 'An event is a meeting or busy time: title, start and end, calendar, attendees, place, video link, reminders, description and colour.',
      steps: [
        'Click an empty slot (or drag for the length you need) or **+ Event** on the left.',
        'If both events and tasks are available, choose **Event**.',
        'Enter the title, check the time, pick the calendar and invite attendees.',
        'Add a place or a call link and a reminder. Click **Save**.',
      ],
      example: {
        title: 'Team stand-up',
        body: 'Drag across Monday 9:00–9:30, call it “Stand-up”, choose the “Sales” calendar, set “Repeat” to “Every week”, add attendees and a reminder 10 minutes before. Colleagues get an invitation and can answer “Going”.',
      },
    },
    {
      id: 'invitations',
      title: 'Invitations and answers',
      body: `Attendees get an invitation notification. The event appears in their calendar (“Invitations” on the left) even if they cannot see that calendar.

In the event card answer **Going**, **Maybe** or **Not going** — the organiser sees the answers. Declined events stay crossed out; hide them in the calendar settings.`,
    },
    {
      id: 'repeat',
      title: 'Recurring events',
      body: 'In “Repeat” choose a preset (daily, weekdays, weekly, monthly, yearly) or set your own: interval, weekdays and end. When you change or delete one occurrence the portal asks: just this one or the whole series.',
      note: 'Dragging a recurring event also asks what to move — one occurrence or the whole series.',
    },
    {
      id: 'reminders',
      title: 'Reminders',
      body: `A reminder arrives the chosen time before the start: in the portal bell, as a push, by e-mail and to Telegram/WhatsApp/Mattermost — following your [notification settings](/account/notifications). The default reminder for new events is set in the calendar settings.

If a reminder did not arrive, open the notification settings: at the bottom you see where each notification went and why, and “Send a test” checks the channels.`,
    },
    {
      id: 'tasks',
      title: 'Tasks in the calendar',
      body: `Tasks with a **deadline** appear on its date and time next to events: ☐ — open, ✓ and crossed out — done, a red bar — overdue. Click to open the task.

- **Drag** a task to another day or hour to move its deadline (if you may change it).
- **“Without a deadline”** on the left lists your open tasks without one. Drag any onto a day to schedule it.
- **Create a task** with “Task” on the left, or click an empty slot and choose “Task”. It is assigned to you; details go in the task card.

Which tasks to show — the ones you do, all you take part in, or all you can see — and whether to show completed ones is set in the settings (⚙).`,
      example: {
        title: 'Plan the week',
        body: 'On Monday morning open “Work week”. “Without a deadline” lists five tasks — drag each into free time between meetings. They get deadlines, and the colleagues who set them see the dates in the task cards.',
      },
      note: 'A new task gets the deadline “in a week” by default — look for it next week, or click “In the calendar” in the note after creating it.',
    },
    {
      id: 'calendars',
      title: 'Personal and shared calendars',
      body: `Everyone has a personal calendar. Shared ones — e.g. “Sales” or “Meeting room 1” — are created with **+** in the calendar list (if the administrator allows it).

Through the calendar menu (⋯) the owner sets **access**: who only views, who adds events, who manages. The tick next to the name hides or shows the calendar.`,
      example: {
        title: 'A meeting room calendar',
        body: 'Create a calendar “Meeting room 1”, open ⋯ → Access and let everyone add events. Now a booking is an event in that calendar and everyone sees when the room is busy.',
      },
    },
    {
      id: 'follow',
      title: 'Following a calendar',
      body: 'To hear about new and changed events of a shared calendar without being an attendee, open ⋯ next to it → **Notify me about changes**. Unsubscribe there or in [notification settings](/account/notifications) → “Subscriptions”.',
    },
    {
      id: 'settings',
      title: 'Your settings',
      body: `⚙ in the top bar opens settings that apply only to you:
- **View** on open, week start, **working hours** (highlighted, and where the day scrolls to), grid step, weekends, week numbers, declined events;
- **Tasks**: whether to show them, which ones (I do / all mine / all visible), completed ones, task block length;
- **New events**: default calendar, length and reminder.

“Reset to defaults” brings back the portal settings.`,
    },
    {
      id: 'google',
      title: 'Google Calendar',
      body: 'If the administrator enabled Google, connect your Google account — its calendars appear on the left as a separate block. Google events can be created, moved and deleted right here.',
    },
  ],
  faq: [
    {
      q: 'I created a task but it is not in the calendar',
      a: 'Most likely its deadline is next week: the default is “in a week”. Click “In the calendar” in the note after creating it, or go to next week. Also check that “My tasks” is on in the sidebar and “Show tasks” in ⚙. Tasks without a deadline are in “Without a deadline”.',
    },
    {
      q: 'Why can’t I drag a task?',
      a: 'Completed tasks do not move. If the originator locked the deadline, the portal puts the task back and shows why.',
    },
    {
      q: 'A meeting reminder did not arrive',
      a: 'Open [notification settings](/account/notifications): check the channels are connected (Telegram — “Profile → Security”, push — enabled on the device), there is no pause or quiet hours, and look at “Recent notifications” — the reason is there. “Send a test” checks every channel at once.',
    },
    {
      q: 'How do I hide weekends?',
      a: 'Choose the “Work week” view or turn off “Show weekends” in ⚙.',
    },
    {
      q: 'Who sees my events?',
      a: 'Events of your personal calendar are seen by you and the attendees. Events of a shared calendar — by everyone the calendar is shared with.',
    },
    {
      q: 'How do I make a meeting a video call?',
      a: 'Paste the link into “Meeting link” — the event card gets a join button.',
    },
  ],
  fields: {
    quickTask: {
      title: 'A task from the calendar',
      text: 'A quick task due at the chosen time. Assigned to you; everything else is in the task card.',
      more: 'tasks',
    },
    undated: {
      title: 'Tasks without a deadline',
      text: 'Your open tasks without a deadline. Drag one onto a day or hour to give it a deadline.',
      more: 'tasks',
    },
    workHours: {
      title: 'Working hours',
      text: 'Highlighted in day and week views; the day opens at their start.',
      more: 'settings',
    },
    tasks: {
      title: 'Tasks in the calendar',
      text: 'Task deadlines next to events. Dragging moves the deadline.',
      more: 'tasks',
    },
    taskScope: {
      title: 'Which tasks',
      text: '“I do” — you are the assignee or co-assignee; “All mine” — any role of yours; “All visible” — also tasks of projects you can see.',
      more: 'tasks',
    },
    reminders: {
      title: 'Reminder',
      text: 'How many minutes before the start. Where it arrives follows your notification settings.',
      more: 'reminders',
    },
  },
  related: [
    'tasks',
    'notifications',
    'chat',
  ],
};
