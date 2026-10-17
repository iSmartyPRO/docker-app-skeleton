export default {
  id: 'approvals',
  purpose: 'Approvals is a core service: approval routes for documents (requests, contracts, warehouse documents) with conditions, deadlines, urgency and substitutes, and one «Waiting for me» inbox for every decision.',
  audience: 'Everyone who approves; the administrator sets routes per document type.',
  setup: [
    {
      title: 'Routes',
      text: 'In the [settings](/admin/settings/approvals) set stages per document type: who approves, in sequence or in parallel, and conditions (amount, type, legal entity).',
    },
    {
      title: 'Urgency and deadlines',
      text: 'Urgency levels with their deadlines, reminders and escalation.',
    },
    {
      title: 'Substitutes',
      text: 'During a holiday a person names a substitute in Account → Substitute.',
    },
  ],
  roles: {
    'approvals.admin': 'Routes, urgency and service settings.',
  },
  scenarios: [
    {
      title: 'A large purchase',
      text: 'A request above the threshold goes to the manager and then the CFO; below it — to the manager only.',
    },
    {
      title: 'An approver on holiday',
      text: 'The substitute gets the documents in «Waiting for me» during the holiday; history shows who decided.',
    },
  ],
  faq: [
    {
      q: 'Why can’t approvals be switched off?',
      a: 'It is a core service: procurement, contract and warehouse documents go through it.',
    },
    {
      q: 'What if no route is set?',
      a: 'The module uses its default route (usually the author’s manager).',
    },
  ],
};
