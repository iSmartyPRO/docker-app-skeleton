export default {
  id: 'assistant',
  purpose: 'The robot assistant is a friendly character on every page: it offers tips on the first visit to a section, opens the short and full guide and searches the help. Fewer «where is it?» questions for the administrator.',
  audience: 'Every employee, especially newcomers.',
  setup: [
    {
      title: 'Pick the default character',
      text: 'In the [settings](/admin/settings/assistant). Allow any, selected ones, or one for everyone (e.g. a company mascot).',
    },
    {
      title: 'Turn on section tips',
      text: 'The robot offers help once in each new section.',
    },
    {
      title: 'Allow colours',
      text: 'People can recolour their character.',
    },
  ],
  scenarios: [
    {
      title: 'Portal launch',
      text: 'In the first weeks the robot helps in every section; later people hide it in Appearance.',
    },
    {
      title: 'One style',
      text: '«One for everyone» — the whole company gets the same helper.',
    },
  ],
  faq: [
    {
      q: 'The robot is in the way — how to hide it?',
      a: 'Anyone can hide it in Account → Appearance; the administrator can switch the module off.',
    },
    {
      q: 'Where do the answers come from?',
      a: 'From the portal’s built-in help, with no outside services.',
    },
  ],
};
