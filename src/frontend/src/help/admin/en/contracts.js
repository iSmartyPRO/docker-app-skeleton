export default {
  id: 'contracts',
  purpose: 'Contracts is the company’s contract registry: file versions, the lawyer’s risks, approval, dates and auto-prolongation with reminders, payments and deposits, links to requests, deals and objects.',
  audience: 'Lawyers, contract owners, finance and management.',
  setup: [
    {
      title: 'Switch the module on',
      text: 'It is off by default; contracts go through Approvals (a core service).',
    },
    {
      title: 'Types and numbering',
      text: 'In the [settings](/admin/settings/contracts): contract types, the number template, expiry reminder windows.',
    },
    {
      title: 'Route',
      text: 'Set stages for «Contract» in [approvals](/admin/settings/approvals): lawyer, finance, director — conditioned on amount and type.',
    },
    {
      title: 'Rights',
      text: 'Lawyers get contracts.legal, finance contracts.finance.',
    },
  ],
  roles: {
    'contracts.create': 'Create contracts.',
    'contracts.view_all': 'Every contract.',
    'contracts.legal': 'Risks, «Signed» and «Terminated».',
    'contracts.finance': 'Confirm deposits, register payments, the payments registry.',
    'contracts.admin': 'Settings and everything else.',
  },
  scenarios: [
    {
      title: 'A supply contract',
      text: 'A manager uploads the draft, the lawyer marks risks, after approval it is signed; 30 days before the end a reminder arrives.',
    },
    {
      title: 'Selling an apartment',
      text: 'A sales contract is linked to a masterplan unit: signing and payments update the unit’s status and paid amount.',
    },
  ],
  faq: [
    {
      q: 'Without Counterparties?',
      a: 'The counterparty is typed as text.',
    },
    {
      q: 'Where are versions?',
      a: 'In the card’s files tab, with «what changed».',
    },
  ],
};
