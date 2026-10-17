export default {
  id: 'procurement',
  icon: 'cart',
  title: 'Procurement',
  tagline: 'A purchase request in a minute: what, how much and the invoice. Then approval, payment and delivery without e-mails or messengers.',
  summary: 'An employee files a request with the invoice. It goes through approval and then lands in the accounting payments registry by itself. Accounting marks the payment with the payment order, the responsible person confirms delivery. Everyone involved sees the path and the deadlines.',
  highlights: [
    {
      icon: '📱',
      title: 'From the phone in a minute',
      text: 'Take a photo of the invoice — the form saves itself.',
    },
    {
      icon: '🧭',
      title: 'A clear path',
      text: 'Who filed it, who approved it, where it is now and for how long.',
    },
    {
      icon: '💳',
      title: 'Payments registry',
      text: 'Accounting sees what to pay today and what is overdue, with totals per currency.',
    },
    {
      icon: '🚦',
      title: 'Colour means deadline',
      text: 'Red is overdue, yellow is due soon. Reminders go out by themselves.',
    },
    {
      icon: '💬',
      title: 'Discussion in the card',
      text: 'Questions and answers right in the request; nothing gets lost.',
    },
  ],
  tips: [
    'The chips above the list show counters: «Waiting for me», «Urgent», «Overdue», «To pay».',
    'Save a set of filters as a view — it appears in the «Views» menu.',
    'With a card open, ↑ and ↓ move through the list.',
    'Line items add up the amount; one total amount works too.',
    'A similar request? «More → Duplicate» — without documents and payments.',
  ],
  sections: [
    {
      id: 'create',
      title: 'File a request',
      steps: [
        'Press «New request».',
        'Describe what you buy and enter the amount — one total or line items (name, quantity, price).',
        'Drop the invoice into the frame, choose a file, take it from Files or photograph it with the phone camera.',
        'Set the urgency, «pay by», the supplier and anything else you need. The draft saves itself.',
        'Press «Send to approval».',
      ],
      note: 'Only the essence, the amount and the invoice are required (unless the administrator switched the invoice rule off). Everything else can be added later.',
    },
    {
      id: 'statuses',
      title: 'Request statuses',
      body: `**Draft** → **In approval** (↔ **Needs an answer**) → **To pay** → **Partly paid** / **Paid** → **Delivered** → **Closed**. Side statuses: **Rejected**, **Cancelled**, **Returned for rework**.

- After approval the request becomes «To pay» by itself and appears in the payments registry.
- «Paid» is set when the payments add up to the amount.
- A rejected request is not sent again — make a copy.
- You can cancel a draft, a request in approval (it is withdrawn) and «To pay» without payments.`,
    },
    {
      id: 'approval',
      title: 'Approval',
      body: 'The request follows the approval route: one stage «Director» by default. An administrator can add stages and conditions (e.g. from $5,000 — the CFO). Approvers see it on the [«Waiting for me»](/app/approvals) page and decide in 1–2 clicks. If you are asked a question, change the request if needed and answer in its card — it returns to the same stage.',
    },
    {
      id: 'payments',
      title: 'Payments registry',
      body: 'For accounting (the «Accounting: payments» permission). Approved requests are grouped: **Overdue**, **Today**, **This week**, **Later** — with totals per currency. «Mark payment» right in the row: the date, the amount (what is left by default), the method, the payment order number and file. Several partial payments are fine. «Export to Excel» saves the registry as CSV.',
    },
    {
      id: 'delivery',
      title: 'Delivery and closing',
      body: 'The responsible person or the author confirms delivery: the date, «delivered partly», the waybill or act. With post-payment, delivery can be confirmed before payment. When everything is paid and delivered, press «Close».',
    },
    {
      id: 'summary',
      title: 'Summary for management',
      body: 'Sums by status, category and month (per currency), the average approval time and overdue requests — for the last 12 months, over the requests you may see.',
    },
    {
      id: 'access',
      title: 'Who sees what',
      body: `- Your own requests (author or responsible) — always.
- Requests of colleagues from your groups — if configured (drafts stay private).
- Requests you approve or were asked about.
- **See every request** — management.
- **Accounting** sees approved requests.
- **Procurement administrator** manages the directories and any request.`,
    },
  ],
  faq: [
    {
      q: 'Why is «Send to approval» disabled?',
      a: 'The title, the amount or the invoice is missing. The hint under the button says which.',
    },
    {
      q: 'Can the amount change after approval?',
      a: 'No. Cancel the request and file a new one (or duplicate it). The description, deliver-by date, responsible person and links can still change.',
    },
    {
      q: 'Accounting made a mistake in a payment — what now?',
      a: 'On the «Payments» tab accounting removes the wrong record; the status is recalculated.',
    },
    {
      q: 'Where do I choose the paying legal entity?',
      a: 'In the «Payer and terms» block. An administrator keeps the list of legal entities (shared with Contracts).',
    },
  ],
  fields: {
    invoice: {
      title: 'Invoice',
      text: 'Without an invoice the request cannot be sent, if so configured. The first file you upload becomes the invoice; change the document type in the card.',
      more: 'create',
    },
    paymentTerms: {
      title: 'Payment terms',
      text: '100 % — full prepayment, advance — part before delivery, post-payment — after delivery. The paying legal entity is who pays the invoice.',
      more: 'payments',
    },
    responsible: {
      title: 'Responsible',
      text: 'The author by default. Assign a buyer: they handle the purchase and confirm delivery.',
      more: 'delivery',
    },
    links: {
      title: 'Links',
      text: 'A Masterplan project or object, a CRM deal, a contract — shown only when these modules are on.',
      more: 'create',
    },
  },
  related: [
    'approvals',
    'companies',
    'files',
  ],
};
