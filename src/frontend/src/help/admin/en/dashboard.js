export default {
  id: 'dashboard',
  purpose: 'The dashboard is a personal page of widgets over every module: my tasks, meetings, files, requests, stock and figures. The administrator sets the starting layout; everyone can rearrange it.',
  audience: 'Every employee; for managers — the day at a glance.',
  setup: [
    {
      title: 'Starting layout',
      text: 'In the [settings](/admin/settings/dashboard) build the set of widgets newcomers see.',
    },
    {
      title: 'Personal layouts',
      text: 'Allow or forbid people to change their layout.',
    },
    {
      title: 'Make it the home page',
      text: 'In [site access](/admin/settings/access) choose «Dashboard».',
    },
  ],
  roles: {
    'dashboard.admin': 'The starting layout and module settings.',
  },
  scenarios: [
    {
      title: 'A manager’s morning',
      text: '«Waiting for me», the team’s overdue tasks, today’s meetings and contract payments on one screen.',
    },
    {
      title: 'Storekeeper',
      text: '«Below minimum» and «Awaiting receipt» widgets instead of notes and charts.',
    },
  ],
  faq: [
    {
      q: 'A widget disappeared',
      a: 'Widgets of switched-off modules, or ones the person may not use, are hidden automatically.',
    },
    {
      q: 'Does changing the starting layout affect everyone?',
      a: 'Only those who have not arranged their own yet, and those who press «Reset».',
    },
  ],
};
