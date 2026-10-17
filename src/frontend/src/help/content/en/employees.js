export default {
  id: 'employees',
  icon: 'people',
  title: 'Employees',
  tagline: 'Everyone who works for the company — in one directory.',
  summary: 'A directory of colleagues with positions, units and work contacts, the org chart and birthdays. HR keeps cards, documents and clearances here — also of people without portal access.',
  highlights: [
    {
      icon: '🔎',
      title: 'Find a colleague',
      text: 'Search by name, position, e-mail and phone; filter by unit and site.',
    },
    {
      icon: '🗂️',
      title: 'Org chart',
      text: 'Units with heads and headcount — click to see the people.',
    },
    {
      icon: '🛡️',
      title: 'Clearances',
      text: 'Clearance dates under control: a reminder comes in advance.',
    },
    {
      icon: '🎂',
      title: 'Celebrations',
      text: 'A dashboard widget with birthdays (day and month only) and work anniversaries.',
    },
  ],
  tips: [
    'Open your own card from «My card» — you can correct your phone and personal contacts there.',
    'Table or cards — the switch next to the search; the choice is remembered.',
    '«Export» saves the current selection as a CSV for Excel.',
  ],
  sections: [
    {
      id: 'registry',
      title: 'The registry',
      body: 'The registry lists people who work or are on vacation. You see names, photos, positions, units, sites and work contacts. Personal data is seen only by HR and the person themselves.',
    },
    {
      id: 'card',
      title: 'The employee card',
      body: 'Position, unit and site, manager, work contacts. HR also sees the personnel number, hire and termination dates, employment type, documents, skills and clearances, the portal account and the history of changes.',
    },
    {
      id: 'hr',
      title: 'For HR',
      body: 'A card can exist for a person without portal access. An account is created from the card in one click («Portal account» → «Create a user»), and on termination you are offered to block it.',
      steps: [
        'Press «Add employee» and fill in the name, position and unit.',
        'On «Skills and clearances» add clearances with their expiry date.',
        'On «Portal account» create a user or link an existing one.',
      ],
      note: 'Many people at once — «Import» from Excel: the file is checked first, problems are shown by row.',
    },
  ],
  faq: [
    {
      q: 'Why can’t I find a colleague?',
      a: 'The directory shows people who work or are on vacation. HR sees terminated people and candidates.',
    },
    {
      q: 'Who sees my birthday?',
      a: 'Colleagues see only the day and month, if the administrator allows it; the year — nobody but HR.',
    },
    {
      q: 'How do I fix my phone number?',
      a: 'Open «My card» → «My contacts».',
    },
  ],
  related: [
    'approvals',
    'dashboard',
  ],
};
