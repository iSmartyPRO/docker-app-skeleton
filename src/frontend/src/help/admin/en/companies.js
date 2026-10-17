export default {
  id: 'companies',
  purpose: 'Counterparties is one directory of companies and people: details from public registers by tax id, employees and their careers, change history and rating. CRM, procurement, contracts, warehouse and masterplan use it.',
  audience: 'Sales, purchasing, legal and accounting.',
  setup: [
    {
      title: 'Countries',
      text: 'In the [settings](/admin/settings/companies) choose the default country and the list — each has its own ids and register.',
    },
    {
      title: 'Company roles',
      text: 'Client, supplier, partner… — rename them or add your own with a colour.',
    },
    {
      title: 'Custom fields',
      text: 'Extra fields for companies and people, optionally for some countries only.',
    },
    {
      title: 'Who may edit',
      text: '«Everyone» or «Owners» (the responsible person, the author and administrators).',
    },
  ],
  roles: {
    'companies.admin': 'Edit and permanently delete any card, module settings.',
  },
  scenarios: [
    {
      title: 'A new supplier',
      text: 'A buyer enters the tax id — the card fills from the register and duplicates are found automatically.',
    },
    {
      title: 'A contact changed jobs',
      text: 'The person gets a new position — the history at the old company is kept.',
    },
  ],
  faq: [
    {
      q: 'What happens to CRM without Counterparties?',
      a: 'CRM keeps working, but clients cannot be picked from the directory.',
    },
    {
      q: 'Are cards deleted?',
      a: 'Usually they are archived; only the module administrator can delete for good.',
    },
  ],
};
