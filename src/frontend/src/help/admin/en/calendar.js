export default {
  id: 'calendar',
  purpose: 'The Calendar brings together meetings, shared calendars of teams and rooms, invitations with replies and task deadlines. People see their day in one place, with Google Calendar alongside.',
  audience: 'Every employee; the office manager runs shared calendars (meeting rooms, holidays, company events).',
  setup: [
    {
      title: 'Set the working day',
      text: 'In the [settings](/admin/settings/calendar): week start, day hours, default view and default reminder. Everyone can change them for themselves.',
    },
    {
      title: 'Decide who creates shared calendars',
      text: '«Everyone» or «Administrators only» (calendar.admin).',
    },
    {
      title: 'Create shared calendars',
      text: 'For example «Meeting room», «Holidays», «Company events», and open them to groups to view or edit.',
    },
    {
      title: 'Connect Google (optional)',
      text: 'In the [Google integration](/admin/settings/google) switch on the calendar — people can show their Google calendars in the portal.',
    },
  ],
  roles: {
    'calendar.admin': 'Manage every shared calendar. Personal calendars stay private even to the administrator.',
  },
  scenarios: [
    {
      title: 'Booking a meeting room',
      text: 'A shared «Meeting room» calendar open to everyone for editing: booking a slot means adding an event to it.',
    },
    {
      title: 'Monday stand-up',
      text: 'A recurring event with attendees: each gets an invitation and a reminder 15 minutes before.',
    },
  ],
  faq: [
    {
      q: 'Why are tasks in my calendar?',
      a: 'The calendar shows deadlines of tasks the person takes part in when Tasks is on. It can be turned off in personal settings.',
    },
    {
      q: 'How are reminders delivered?',
      a: 'Through the notification center: in the portal and through the channels the person chose (e-mail, Telegram, etc.).',
    },
    {
      q: 'Is Google sync two-way?',
      a: 'Google calendars are shown live; events can be created in them from the portal when the person granted access.',
    },
  ],
};
