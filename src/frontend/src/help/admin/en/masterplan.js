export default {
  id: 'masterplan',
  purpose: 'Masterplan shows a development project as a whole: the site plan with clickable contours, the chessboard of buildings, the unit registry, sales statuses with timed bookings, prices with history and construction progress with photo reports.',
  audience: 'Developers: sales, finance, legal, construction, marketing and management.',
  setup: [
    {
      title: 'Switch the module on',
      text: 'It is off by default.',
    },
    {
      title: 'Create a project',
      text: 'Upload the site plan background, draw contours, add buildings, entrances, floors and units (or import).',
    },
    {
      title: 'Roles',
      text: 'Grant masterplan.* through roles or assign a role in a project with a zone (a subtree).',
    },
    {
      title: 'Sales',
      text: 'In the [settings](/admin/settings/masterplan): statuses, booking timers, currencies, the head of sales’ discount limit.',
    },
    {
      title: 'CRM',
      text: 'Switch on CRM and Counterparties to link units to deals and buyers.',
    },
  ],
  roles: {
    'masterplan.admin': 'Everything, including structure and settings.',
    'masterplan.sales': 'Bookings and unit sales.',
    'masterplan.foreman': 'Construction progress and photo reports.',
  },
  scenarios: [
    {
      title: 'Booking an apartment',
      text: 'A manager books a unit for 3 days from a CRM deal; when the timer runs out the unit is freed.',
    },
    {
      title: 'Construction report',
      text: 'A foreman marks floor progress and attaches photos from the «North Quarter» site.',
    },
  ],
  faq: [
    {
      q: 'Who sees prices?',
      a: 'It depends on the role: fields are hidden on the server.',
    },
    {
      q: 'Without CRM?',
      a: 'Yes, but without linking units to deals.',
    },
  ],
};
