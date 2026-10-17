export default {
  id: 'procurement',
  purpose: 'Procurement takes a request from invoice to delivery: an employee files it with the invoice, it is approved, lands in accounting’s payments registry, is paid (in parts or in full) and closed after delivery.',
  audience: 'Requesters, approvers, accounting and supply.',
  setup: [
    {
      title: 'Switch the module on',
      text: 'It is off by default. It needs Approvals (a core service, always on).',
    },
    {
      title: 'Directories',
      text: 'Purchase categories, paying legal entities and currencies — in the [settings](/admin/settings/procurement).',
    },
    {
      title: 'Approval route',
      text: 'Set stages for «Purchase request» in [approvals](/admin/settings/approvals), e.g. by amount.',
    },
    {
      title: 'Rights',
      text: 'Accounting gets procurement.pay, management procurement.view_all.',
    },
    {
      title: 'Links',
      text: 'Switch on Counterparties, Masterplan, CRM and Contracts to pick the supplier, object, deal and contract from directories.',
    },
  ],
  roles: {
    'procurement.create': 'Filing requests when «Anyone may file» is off.',
    'procurement.view_all': 'Every request, not only own and approved ones.',
    'procurement.pay': 'The payments registry and marking payments.',
    'procurement.admin': 'Directories, settings, routes and every request.',
  },
  scenarios: [
    {
      title: 'Buying equipment',
      text: 'A foreman files a request with an invoice for the «North Quarter» site, the manager approves, accounting pays in two parts, the warehouse receives the goods.',
    },
    {
      title: 'Returned for changes',
      text: 'An approver returns the request with a comment; the author attaches a new invoice and resubmits.',
    },
  ],
  faq: [
    {
      q: 'Are Counterparties required?',
      a: 'No. Without it the supplier is typed as text.',
    },
    {
      q: 'Who sees a request?',
      a: 'The author, the responsible person, approvers and holders of view_all/pay/admin.',
    },
  ],
};
