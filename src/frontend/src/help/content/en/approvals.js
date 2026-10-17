export default {
  id: 'approvals',
  icon: 'inbox',
  title: 'Approvals and «Waiting for me»',
  tagline: 'Everything waiting for your decision on one page. Approve or ask a question in one or two clicks.',
  summary: 'Approvals are a shared service of the portal. Purchase requests, contracts and other documents go through a route of stages, and each approver sees their documents on the «Waiting for me» page — together with questions to you, documents returned to you and tasks waiting for acceptance.',
  highlights: [
    {
      icon: '📥',
      title: 'One place',
      text: 'The Inbox icon in the header with a counter, the «Waiting for me» page and a dashboard widget.',
    },
    {
      icon: '⚡',
      title: 'Decide in 1–2 clicks',
      text: '«Approve», «Question» and «Open» right in the row; several documents in one action.',
    },
    {
      icon: '🚦',
      title: 'Colour means deadline',
      text: 'Red is overdue, yellow is due soon. Urgent items are always on top.',
    },
    {
      icon: '🧭',
      title: 'A clear path',
      text: 'See who sent it, who approved it, where it is now and how long it has waited.',
    },
    {
      icon: '💬',
      title: 'Questions next to the document',
      text: 'An answer returns the document to the same stage — nothing gets lost in messengers.',
    },
    {
      icon: '🏖',
      title: 'A substitute',
      text: 'While you are on vacation, your substitute decides your approvals.',
    },
  ],
  tips: [
    'Click a row to open the side card; ↑ and ↓ move between documents.',
    'In the question box, Ctrl+Enter sends.',
    'Tick several rows and press «Approve selected» — the portal asks for confirmation.',
    'The module filter above the list shows how many documents wait in each module.',
    'Going away? «Account → My substitute» — choose a person and the dates.',
  ],
  sections: [
    {
      id: 'inbox',
      title: 'The «Waiting for me» page',
      body: `Open it with the Inbox icon in the header or from the app menu. Tabs:

- **Waiting for me** — documents on your stage, questions to you, documents returned to you for rework, and tasks waiting for acceptance;
- **Mine in approval** — your documents: their stage, whom they wait for and until when;
- **Decided by me** — what you approved, rejected, returned or passed on.

The list is grouped into **Overdue**, **Today** and **Others**, sorted by urgency and deadline. A row shows the module, number, title, amount, author, deadline and urgency.`,
    },
    {
      id: 'decisions',
      title: 'Decisions',
      body: `- **Approve** — the stage closes when everyone (or any one — as the route says) approved; the document moves on. After the last stage it is «Approved».
- **Question** — the text is required. The document goes to «Needs an answer» for the author or the person you chose. The answer returns it to the same stage, and the waiting time is added to the deadline.
- **Return for rework** — with a comment. The author edits the document and sends it again.
- **Delegate** — pass the decision to someone else.
- **Reject** — the comment is required; the approval ends.

The author can **withdraw** a document until it is approved.`,
    },
    {
      id: 'deadlines',
      title: 'Deadlines, reminders and escalation',
      body: `A stage’s reaction time depends on urgency: by default **Critical — 4 h**, **Urgent — 24 h**, **Normal — 72 h**. Working hours are not taken into account yet.

When 75 % of the time has passed, the approvers get a reminder. When the deadline passes, the document turns red and the route’s escalation people (the module’s administrators by default) are notified. The reminder and the escalation come once per stage.`,
    },
    {
      id: 'substitutes',
      title: 'Substitute',
      body: 'In **Account → My substitute** choose a person and a period (both dates inclusive). During the period the substitute sees your stages on their «Waiting for me» page and can decide them. History marks such decisions as made “for you”. An approvals administrator can set substitutes for anyone.',
    },
    {
      id: 'routes',
      title: 'Routes (for administrators)',
      body: `A route is set for each document type: **Inbox → ⚙ Settings** or **Settings → Modules → Approvals**.

- Drag stages to reorder; a stage has a name, approvers (people, roles, groups) and the mode «all» or «any of». A role or group is one approver: any of its members decides.
- A stage’s **conditions** check the document’s fields: amount above X (optionally in a currency), category, project, legal entity. When a condition fails, the stage is skipped.
- **After rework** the document goes from the first stage or from the stage that returned it.
- **Escalation** — whom to tell when a stage is overdue.
- The **preview** on the right shows the route, e.g. for a $5 000 request in «Equipment».

Routes are changed by approvals administrators and by the module’s own administrators (e.g. Procurement). Urgency levels, the reminder and escalation are set by an approvals administrator.`,
      example: {
        title: 'An example purchase route',
        body: `1. «Head of department» — a role, any of.
2. «CFO» — if the amount ≥ 5 000 USD.
3. «IT» — a group, if the category is «Equipment».

A 300 USD «Services» request passes only the first stage; a 5 000 USD «Equipment» one — all three.`,
      },
    },
  ],
  faq: [
    {
      q: 'Why do I not see a document although I am in the approvers’ group?',
      a: 'The stage may not have started yet (the document is on an earlier stage), another member already approved it in «any of» mode, or the stage was skipped by a condition.',
    },
    {
      q: 'I pressed «Approve» and the portal says the process has moved on.',
      a: 'Someone decided before you — e.g. another member of the role. Refresh: the document is already on the next stage or finished.',
    },
    {
      q: 'How long does a question wait?',
      a: 'While the answer is pending the stage deadline is paused; after the answer it continues where it stopped.',
    },
    {
      q: 'Can approvals be switched off?',
      a: 'No, it is a core service. The modules that use it (Procurement, Contracts) can be switched off.',
    },
  ],
  fields: {
    restartFrom: {
      title: 'After rework',
      text: 'Where the document starts when the author sends it again.',
      more: 'routes',
    },
    escalateTo: {
      title: 'Escalation',
      text: 'Who is told that a stage is overdue. Empty — the module’s administrators.',
      more: 'deadlines',
    },
  },
  related: [
    'dashboard',
    'tasks',
    'notifications',
  ],
};
