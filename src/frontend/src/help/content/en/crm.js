export default {
  id: 'crm',
  icon: 'target',
  title: 'CRM',
  tagline: 'Deals from the first contact to the result — on a kanban, in a list, by activities and in a calendar.',
  summary: 'The CRM moves deals through the stages of a pipeline. Drag cards between stages, plan calls and meetings so no deal stalls without a next step, and close deals as won or lost. Clients are the companies and contacts of Counterparties, so the whole client history stays in one place.',
  highlights: [
    {
      icon: '🗂',
      title: 'Kanban by stages',
      text: 'Every stage is a column with the number of deals and their total; drag a card with the mouse or a finger.',
    },
    {
      icon: '📌',
      title: 'Activities on deals',
      text: 'Calls, meetings, tasks and e-mails with a date, a person and a reminder.',
    },
    {
      icon: '🔎',
      title: 'One filter for every view',
      text: 'Kanban, list, activities and calendar show the same deals; a good filter can be saved.',
    },
    {
      icon: '🏆',
      title: 'Won or lost',
      text: 'Close deals with one button; for lost ones the portal asks why.',
    },
    {
      icon: '🏢',
      title: 'Clients from Counterparties',
      text: 'A deal is linked to a company and a contact; their cards show created and closed deals.',
    },
    {
      icon: '💬',
      title: 'Discuss with colleagues',
      text: 'Each deal can have its own chat for the responsible person, watchers and the author.',
    },
  ],
  tips: [
    'Keep a next activity on every deal — the «No activities» counter shows forgotten deals.',
    'Start the day with the Activities view: «Overdue» and «Today» are your plan.',
    'A quick deal in the first kanban column takes three fields: name, amount, client.',
    'Esc closes the deal card and brings you back to the view you were in.',
    'Click the «Overdue» counter above the board to keep only deals with overdue activities.',
    'Save the filter you use every day — it appears in the list of filters on the left.',
  ],
  sections: [
    {
      id: 'kanban',
      title: 'Kanban',
      body: `Columns are the stages of the chosen pipeline. A stage header shows its colour, the number of deals and the total per currency.

A card shows the name, amount, client, the next activity (red when overdue), the number of open activities and the responsible person. The **+ Activity** button on a card plans a call or meeting without opening the deal.

Drag a card to another column to change the stage. While you drag, **Won** and **Lost** zones appear at the bottom — drop the card there to close the deal. Long columns get a **More** button at the bottom.`,
      steps: [
        'Press **+ Quick deal** in the first column.',
        'Enter the name, amount and pick the client — or create one right in the list.',
        'Press **Create**: the deal goes to the top of the column.',
      ],
      note: 'On a phone, hold the card for a moment before dragging — this way scrolling the board does not interfere.',
    },
    {
      id: 'list',
      title: 'List',
      body: `A table of deals sorted by a click on a column header. The columns button on the right chooses what to show, including custom fields; the choice is remembered.

The stage bar in the «Stage» column is clickable: click a segment to move the deal, or the last one to close it.

Tick rows and an action bar appears at the bottom: **Change stage**, **Responsible**, **Move to pipeline**, **Watchers**, **Delete**. **For all by the filter** applies the action to every deal of the filter (up to 1000).`,
      note: 'To keep the list fast, the total is counted on demand with **Show count**.',
    },
    {
      id: 'activities',
      title: 'Activities',
      body: `Deals are sorted by their nearest open activity: **Overdue**, **Today**, **This week**, **Next week**, **Later** and **No activities**.

Drag a card to another column and the nearest activity of the deal moves to that day (the time stays). You cannot drop into «No activities»: to remove an activity, mark it done in the deal card.

**My activities** in the sidebar lists all your open activities across deals with «done» checkboxes.`,
    },
    {
      id: 'calendar',
      title: 'Calendar',
      body: 'Deals on a month or week grid by the close date — or by any custom «Date» field (chosen above the calendar on the right). Drag a deal to another day to change that date. A click opens the deal.',
    },
    {
      id: 'filter',
      title: 'Filter and counters',
      body: `The filter field above the board searches the deal name, the client and the comment. A click opens the panel: ready filters on the left — **In progress**, **My deals**, **Closed** and your saved ones; fields on the right: responsible, amount, stages, stage group, dates, source, client and custom list fields.

The **Overdue**, **Today**, **Planned**, **No activities** counters count the deals of the current filter by their activities; a click keeps only those deals.

The view (kanban, list, activities, calendar), the pipeline and the filter are remembered — next time the CRM opens the same way.`,
      steps: [
        'Open the filter and choose the fields.',
        'Press **+ Save filter** and name it.',
        'The filter appears in the list on the left — only you see it.',
      ],
    },
    {
      id: 'deal',
      title: 'The deal card',
      body: `A deal opens as a panel over the current view. At the top: the pipeline, the name (edited in place), the amount, the responsible person and the stage arrows: click an arrow to move the deal, **Close deal** finishes it as **Won** or **Lost**.

On the left — section cards with fields. Empty fields read «not filled in»; click a value to change it. The «Client» block shows the company and the contact with call and e-mail buttons and a link to their Counterparties card.

On the right — the timeline: the **Activity** tab plans a call, meeting, task or e-mail, the **Comment** tab leaves a note for colleagues. Below is the pinned **To do** list of open activities: the checkbox marks one done, overdue ones are red. Then the whole history of the deal by day.

**Discuss with colleagues** opens the deal chat. On a phone, fields and the timeline are separate tabs.`,
      example: {
        title: 'A call after a meeting',
        body: 'The meeting went well and the client wants a proposal. Mark the meeting done, move the deal to «Proposal» and plan a call for the day after tomorrow with a 15-minute reminder — the CRM reminds you and the deal is not lost.',
      },
      note: 'If a colleague changes the deal while you have it open, the portal shows the fresh version and warns you — nobody overwrites anyone.',
    },
    {
      id: 'pipelines',
      title: 'Pipelines and stages',
      body: `A CRM administrator sets up pipelines under **Pipelines**: the name, colour, stages and their order (by dragging). The **Won** and **Lost** stages always come last and can be renamed.

If a removed stage still has deals, the portal asks where to move them. A pipeline with deals can be deleted only by choosing another pipeline for them.`,
    },
    {
      id: 'settings',
      title: 'Settings',
      body: `CRM **Settings** hold the default currency and the list of currencies, the visibility of deals (everyone sees everything or only their own), sources, lost reasons, activity reminders, card sections and custom fields.

Custom fields can be text, long text, number, money, date, list, several from a list, yes/no, link and employee. **In the list** adds the field as a column of the List view.`,
    },
    {
      id: 'trash',
      title: 'Trash',
      body: 'Deleted deals go to the **Trash** with their activities and history. The responsible person, the author and CRM administrators can restore them.',
    },
  ],
  faq: [
    {
      q: 'Why can’t I see my colleagues’ deals?',
      a: 'The administrator turned on «Only their own deals». You see deals where you are responsible, a watcher or the author. Ask to be added as a watcher.',
    },
    {
      q: 'How do I reopen a closed deal?',
      a: 'Open the deal and press **Back to work** on the result banner, then choose a stage. The **Closed** filter helps to find closed deals.',
    },
    {
      q: 'Where do activity reminders arrive?',
      a: 'Where the other portal notifications go: the bell, push, Telegram or e-mail — as set in your [Notifications](/account/notifications), group «CRM».',
    },
    {
      q: 'Can I move a deal to another pipeline?',
      a: 'Yes: in the deal card click the pipeline name above the title and choose another. The deal starts at its first stage. For several deals use **Move to pipeline** in the list.',
    },
    {
      q: 'How do I export deals to Excel?',
      a: 'In the List view press **Export CSV** — the deals of the current filter with the chosen columns are exported. The file opens in Excel.',
    },
    {
      q: 'Where can I see a client’s deals?',
      a: 'In the company or contact card in Counterparties, on the «History» tab: created, won and lost deals with links. In the CRM — filter by «Client».',
    },
  ],
  fields: {
    lostReasons: {
      title: 'Lost reasons',
      text: 'When a deal is closed as lost, the portal asks for a reason. Later they show why clients leave.',
      more: 'settings',
    },
    customFields: {
      title: 'Custom fields',
      text: 'Extra deal fields in the card sections. «In the list» adds a List column, «Required» means a deal cannot be created without a value.',
      more: 'settings',
    },
  },
  related: [
    'companies',
    'tasks',
    'notifications',
    'chat',
  ],
};
