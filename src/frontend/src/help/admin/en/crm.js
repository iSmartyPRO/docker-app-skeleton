export default {
  id: 'crm',
  purpose: 'CRM moves deals through pipeline stages: kanban, list, activities and calendar, custom fields and several pipelines. Clients are the companies and people of Counterparties, with no separate copy.',
  audience: 'The sales team and its head.',
  setup: [
    {
      title: 'Pipelines and stages',
      text: 'Create a pipeline and stages; the last two are «Won» and «Lost».',
    },
    {
      title: 'Currencies and fields',
      text: 'In the [settings](/admin/settings/crm): default currency, currency list, custom deal fields and their sections.',
    },
    {
      title: 'Visibility',
      text: 'Whether managers see only their own deals or all.',
    },
    {
      title: 'Switch on Counterparties',
      text: 'To pick clients from the directory and see deals on the company card.',
    },
  ],
  roles: {
    'crm.admin': 'Settings, pipelines and every deal.',
    'crm.all': 'Sees and edits every deal — for the head of sales.',
  },
  scenarios: [
    {
      title: 'An incoming lead',
      text: 'A manager creates a deal, picks the company, schedules a call — the activity shows in the calendar.',
    },
    {
      title: 'Report for the head',
      text: 'With crm.all the head sees the whole team’s kanban and sums per stage.',
    },
  ],
  faq: [
    {
      q: 'Several pipelines?',
      a: 'Yes, each with its own stages; one is the default.',
    },
    {
      q: 'Required fields?',
      a: 'A field can be required in the form; the API does not refuse such deals.',
    },
  ],
};
