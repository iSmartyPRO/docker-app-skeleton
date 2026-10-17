export default {
  id: 'employees',
  purpose: 'Employees is the registry of everyone who works for the company, including people without portal access: builders, drivers, seasonal staff. The card keeps the position, unit and site, manager, contacts, HR data, documents, skills and clearances with expiry reminders. A portal account can be created from the card in one click.',
  audience: 'HR keeps the cards; heads and colleagues use the directory and the org chart; the administrator sets up access and positions.',
  setup: [
    {
      title: 'The org structure',
      text: 'Build the [org structure](/admin/settings/org) first: employees belong to its units and sites.',
    },
    {
      title: 'Switch the module on',
      text: 'It is off by default: «Settings → Modules → Employees».',
    },
    {
      title: 'Rights',
      text: 'Give HR `employees.hr` (and `users.manage` to create accounts), heads `employees.view`, the module administrator `employees.admin`. Or switch on «Directory for everyone».',
    },
    {
      title: 'Positions and import',
      text: 'Fill in the positions directory or load people from Excel: the import checks every row and adds new positions.',
    },
    {
      title: 'Clearances and reminders',
      text: 'Choose how many days ahead clearance reminders go (30 and 7 days and on the day by default) and to whom.',
    },
  ],
  roles: {
    'employees.view': 'The directory: name, photo, position, unit, site, manager, work contacts of working people. No personal data.',
    'employees.hr': 'Everything: terminated people and candidates, personal contacts, birth date, personnel number, documents, clearances, notes; creating cards and linking accounts. Creating and blocking accounts also needs `users.manage`.',
    'employees.admin': 'The positions directory and the module settings.',
  },
  access: 'The server decides visibility in every answer: without `employees.hr` personal fields are never sent. An employee with a linked account always sees their own card with personal data (without HR notes) and can correct their contacts.',
  scenarios: [
    {
      title: 'A new hire with access',
      text: 'HR creates the card, on «Portal account» presses «Create a user», picks one-time codes and a group — the person can sign in right away.',
    },
    {
      title: 'An installer without the portal',
      text: 'A card without an account: the «North Quarter» site, a work-at-height clearance until month’s end. Seven days before, HR and the foreman are reminded.',
    },
    {
      title: 'Termination',
      text: '«Terminate» sets the date and status and offers to block the portal account — access closes in one step.',
    },
  ],
  faq: [
    {
      q: 'How do I link an existing user?',
      a: 'Card → «Portal account» → «Link an existing user». One account, one card. A linked account takes its unit and position from the card.',
    },
    {
      q: 'Do colleagues see birthdays?',
      a: 'Only the day and month, and only with «To everyone» in the settings. You can keep them to HR or switch them off.',
    },
    {
      q: 'Where is the AD account?',
      a: 'With the Active Directory integration on, the card shows the «AD account» field. The AD directory module adds its own tab to the card.',
    },
    {
      q: 'Do Warehouse, Tasks, Masterplan use employees?',
      a: 'For now they work with portal accounts. The card–account link and the employee picker are in place; the modules will move to them step by step.',
    },
  ],
};
