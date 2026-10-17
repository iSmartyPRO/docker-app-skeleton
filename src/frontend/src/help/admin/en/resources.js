export default {
  id: 'resources',
  purpose: 'Online resources is a board of tiles linking to company services: mail, CRM, forms, the website and portal modules. A good home page: guests see public links, employees see theirs.',
  audience: 'Every employee and guests of an open portal; filled by the resources administrator.',
  setup: [
    {
      title: 'Add resources',
      text: 'A link or a portal module, an icon, a title and description in two languages, a category.',
    },
    {
      title: 'Set visibility',
      text: 'Guests see public resources; the rest are visible by roles and groups.',
    },
    {
      title: 'Make it the home page',
      text: 'In [site access](/admin/settings/access) choose «Online resources» as the home page.',
    },
    {
      title: 'Look',
      text: 'Heading, subtitle, tile density, search and personal layouts — in the [settings](/admin/settings/resources).',
    },
  ],
  roles: {
    'resources.admin': 'Add, edit and order resources and categories.',
  },
  scenarios: [
    {
      title: 'Office start page',
      text: 'The home page has mail, accounting, the knowledge base and IT requests; everyone arranges tiles their way.',
    },
    {
      title: 'Public links for guests',
      text: 'An open portal shows guests the website and a contact form, and employees the internal services after sign-in.',
    },
  ],
  faq: [
    {
      q: 'A module tile disappeared',
      a: 'A module tile hides while the module is off and returns when it is switched on.',
    },
    {
      q: 'Are personal layouts reset?',
      a: 'No. New resources go to the end, removed ones simply disappear.',
    },
  ],
};
