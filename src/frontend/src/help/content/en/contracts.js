export default {
  id: 'contracts',
  icon: 'clipboard',
  title: 'Contracts',
  tagline: 'The company’s contracts registry: versions, the lawyer’s risks, approval and deadlines under control.',
  summary: 'Each contract is a card with the counterparty, amount, dates and people. The lawyer notes what to watch for, colleagues upload new versions saying what changed, the contract goes through approval, and reminders arrive 30 and 7 days before the end.',
  highlights: [
    {
      icon: '🗂',
      title: 'File versions',
      text: 'Each version has its author, date and “what changed”; any one opens or downloads.',
    },
    {
      icon: '⚠️',
      title: 'What to watch for',
      text: 'The lawyer’s risks with the clause and importance; serious ones sit next to the approver’s buttons.',
    },
    {
      icon: '✅',
      title: 'Approval',
      text: 'A route of stages, questions and answers right in the card.',
    },
    {
      icon: '⏳',
      title: 'Deadlines under control',
      text: '«Expiring» is set automatically, reminders go to the owner and the lawyer.',
    },
    {
      icon: '📅',
      title: 'Expiry calendar',
      text: 'Twelve months ahead: what ends and when to refuse a prolongation.',
    },
    {
      icon: '💬',
      title: 'Discussion',
      text: 'The contract’s chat; a message can point at a risk.',
    },
    {
      icon: '💳',
      title: 'Deposit and payments',
      text: 'For sales: the deposit, a payment schedule from the amount or the object’s price grid, payments and what is overdue.',
    },
  ],
  tips: [
    'The card opens on the right over the registry; ↑ and ↓ move between contracts, Esc closes.',
    'The / key puts the cursor into the registry search.',
    'An unfinished new-contract form is saved by itself — close it and come back later.',
    'The «No signed version» chip shows signed contracts whose scan is not uploaded yet.',
    'The «⤓ CSV» button exports the current list to Excel with the filters and rights applied.',
  ],
  sections: [
    {
      id: 'registry',
      title: 'The registry',
      body: `Above the list are chips with counters: **All**, **Mine**, **Waiting for me**, **Urgent**, **Overdue**, **In work**, **In force**, **Expiring in N days**, **No signed version** and **Done** (the archive: completed, terminated, rejected).

Search by number, subject, counterparty and the counterparty’s number. Columns: number, counterparty and subject, type, amount, end date, status, owner. The end date is red when less than a week is left or it has passed, yellow inside the «Expiring» window; ↻ marks auto-prolongation.

By default what needs attention is on top: overdue approvals, questions, contracts in approval by urgency, then expiring ones.`,
    },
    {
      id: 'card',
      title: 'The contract card',
      body: `The header shows the number, status, type, subject, counterparty and legal entity, amount (or «Framework»), term, the refusal deadline and the people. Below are the approval path and the decision buttons, then the tabs:

- **Overview** — every field and the risks;
- **Versions** — the file feed;
- **Discussion** — the contract’s chat;
- **Links** — purchase requests, the CRM deal, the Masterplan object (when those modules are on);
- **History** — who changed what, approval decisions included.`,
      steps: [
        'Press «New contract». The subject, the counterparty and the file are enough — the rest can follow.',
        'The lawyer adds risks on the Overview tab.',
        'After changes, upload a new version saying what changed.',
        'Choose the urgency and press «Send to approval».',
        'Once approved, the lawyer marks the contract signed and picks the signed version.',
      ],
    },
    {
      id: 'statuses',
      title: 'Statuses',
      body: `**Draft** → **In approval** (↔ **Answer needed**) → **Approved** → **Signed** → **In force** → **Expiring** → **Completed**. Side ones: **Rejected** and **Terminated**.

- Approval statuses come from the approvals service; returning a document for rework puts it back into «Draft».
- «Signed», «In force», «Completed» and «Terminated» are set by a lawyer; termination needs a reason.
- «In force» comes by itself from the start date, «Expiring» N days before the end, «Completed» after the end. An auto-prolonged contract gets the next term of the same length instead.
- Fields can be edited in «Draft», «Answer needed» and «Rejected»; in approval they are locked, versions and risks are not. A lawyer may still correct fields in approval; the stages not reached yet are then re-planned by the route conditions.`,
    },
    {
      id: 'risks',
      title: 'What to watch for',
      body: `The lawyer’s checklist: the text, the clause, the importance (high, medium, low) and the status (open, accepted, fixed). While the contract is in approval, open high risks are shown to the approver right above the decision buttons.

The 💬 button of a risk writes a «Risk #N» message into the discussion with a link back to it, so the conversation keeps its context.`,
    },
    {
      id: 'calendar',
      title: 'Expiry calendar and reminders',
      body: `The calendar shows twelve months: each cell says how many contracts end and how many refusal deadlines (↻) fall in it. Below, the months as lists: the day, what happens, the counterparty, the amount.

Reminders reach the owner and the lawyer 30 and 7 days (configurable) before the end, and for auto-prolonged contracts before the last day to refuse. Each reminder comes once.`,
    },
    {
      id: 'payments',
      title: 'Deposit, payment schedule, payments',
      body: `The **Payments** tab shows on contracts with a client, on the «Sale» and «Property sale» types and on any contract that already has a deposit or a schedule.

**Deposit or advance.** A deposit secures the deal: if the buyer backs out it stays with the seller, if the seller backs out it is returned double (Civil Code of the KR / RF). An advance is always refundable. Enter the amount, the due day and the refund terms; finance (the «Finance (contracts)» right) confirms the receipt with the date, method, number and document. Later the deposit is **credited to the price**, **returned** or **retained**.

**Payment schedule.** «Build a schedule»: 100 % or installments — the first payment in %, months, the first day and the day of month. When the contract is linked to a Masterplan object, its price-grid plans are on top: click one and the numbers fill in. The first and monthly payments are whole amounts, the last one takes the difference. The deposit is its own row and reduces the first payment. Rows can be edited before saving.

**Payments.** Finance registers every payment: it covers the oldest unpaid rows first, a partial payment covers a row partly. On top: «paid N %», what is left, overdue and the next payment. Overdue rows are red, upcoming ones (7 days, configurable) amber.

**Masterplan.** When the contract is linked to an object and both modules are on: a confirmed deposit moves the object from reserve / booking to «Deposit», signing to «Contract» (number, date, amount), payments update «paid», 100 % makes it «Sold». The moves use your Masterplan rights; when one is not allowed the money is recorded anyway and the card shows an amber note with what to do by hand.`,
    },
    {
      id: 'payments-registry',
      title: 'Payments registry',
      body: `**Payments** in the module menu is for finance and those who see every contract: unpaid payments and expected deposits grouped **Overdue**, **Today**, **This week**, **Later**, with totals per currency. «Mark received» and «Confirm» a deposit right in the row; the contract opens on the right on its «Payments» tab. «Export CSV» saves the list for Excel.

The contracts registry has the chips **Awaiting deposit**, **Payments overdue** and **Paid** — they show up when they have something to show. The «Contract payments» widget can be added to the home page.`,
    },
    {
      id: 'access',
      title: 'Who sees what',
      body: `- **Every contract** is visible to management (the «See every contract» right), lawyers and contracts administrators.
- Others see their own contracts (created, owner, lawyer), their group’s and those they approve.
- Contracts are created by people with the «Create contracts» right.
- Files open only for people who see the contract.
- **Finance (contracts)** sees the contracts with a deposit or a schedule, confirms deposits and registers payments; the contract’s people plan the deposit and the schedule.`,
    },
  ],
  faq: [
    {
      q: 'Why can’t I send it to approval?',
      a: 'It needs at least one file, and the contract must be a draft or rejected.',
    },
    {
      q: 'Who approves contracts?',
      a: 'The route is set in «Settings → Approvals», type «Contract». Until it is saved, contracts administrators approve.',
    },
    {
      q: 'How do I extend a contract?',
      a: 'A lawyer changes the end date and the contract is «In force» again. With auto-prolongation the term extends by itself.',
    },
    {
      q: 'What does «No signed version» mean?',
      a: 'The contract is approved or signed, but no version is marked as signed. Upload the scan with «This is the signed version» ticked.',
    },
  ],
  fields: {
    framework: {
      title: 'Framework contract',
      text: 'No fixed amount: volumes and prices come with orders or specifications.',
    },
    autoRenew: {
      title: 'Auto-prolongation',
      text: 'The contract renews by itself unless a side refuses. After the end the portal sets the next term of the same length.',
      more: 'statuses',
    },
    noticeDays: {
      title: 'Refusal notice',
      text: 'How many days before the end a refusal must be sent. The portal reminds you in advance.',
      more: 'calendar',
    },
    risks: {
      title: 'Risks',
      text: 'The lawyer’s checklist. Approvers see open high risks next to their decision buttons.',
      more: 'risks',
    },
  },
  related: [
    'approvals',
    'procurement',
    'companies',
    'chat',
  ],
};
