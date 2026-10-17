export default {
  id: 'masterplan',
  icon: 'siteplan',
  title: 'Masterplan',
  tagline: 'The live site plan of a project: what is available, booked, sold, and how construction goes.',
  summary: 'Masterplan shows a development project on the site plan, in a chessboard and in a registry. Managers reserve and book units, finance and legal take them to the sale and handover, foremen send construction photo reports from their phones. Everyone sees the same picture, and a double booking is impossible.',
  highlights: [
    {
      icon: '🗺️',
      title: 'Site plan with layers',
      text: 'Sales colours, construction readiness or object types — one switch above the plan.',
    },
    {
      icon: '🔒',
      title: 'No double bookings',
      text: 'If a colleague was first you see “The unit has just been reserved by X”.',
    },
    {
      icon: '⏳',
      title: 'Bookings with a timer',
      text: 'Reminders 24 and 2 hours before; when time is up the unit is released by itself.',
    },
    {
      icon: '🏢',
      title: 'Chessboard',
      text: 'Floors × apartments with price, price per m² or area, and bulk price changes.',
    },
    {
      icon: '📷',
      title: 'Construction photo reports',
      text: 'A foreman sends a report from a phone in three taps; readiness is computed.',
    },
    {
      icon: '🤝',
      title: 'Linked with the CRM',
      text: 'A booking is linked to a deal; the deal shows the unit and its construction.',
    },
  ],
  tips: [
    'Click a status in the legend to keep only those units.',
    'The Presentation button hides clients, managers and minimum prices — safe to show a client.',
    'In a CRM deal press “Pick a unit”: on the site plan the deal is already chosen for the booking.',
    'Foremen: add the portal to the phone home screen — “+ Report” → Camera → Send.',
    'Without contours the plan shows objects as a scheme — you can work from day one.',
    'Search by the old number from the previous plan: “14” finds house 14 and the house that used to be №14.',
  ],
  sections: [
    {
      id: 'plan',
      title: 'Site plan',
      body: `On top of the background are contours of phases, sectors, plots and buildings. The mouse wheel or a pinch zooms, dragging moves the plan, ⤢ shows the whole project.

Hover an object to see its code, type, area, price, status and readiness. A click on a sector zooms in and opens its summary; a click on a plot or a house opens the card on the right without leaving the plan.

- **Sales** — colour by sales status;
- **Construction** — grey to green by readiness;
- **Types** — residential, commercial, infrastructure.

Colours change by themselves as colleagues book and sell.`,
    },
    {
      id: 'numbers',
      title: 'Numbers, search and sectors',
      body: `A number is shown when it fits its contour: the font grows from 9 to 14 px as you zoom in. If it does not fit it becomes a badge in the status colour; when badges overlap the lower one is hidden. The switch **Numbers: auto / always / hide** above the plan is remembered for you; Presentation starts with “always”.

In the search type a number, a name (“Апарт-корпус 40”) or the **old number** from the previous plan (“14”, “block 3”) — pick a line or press Enter: the plan zooms to the object and opens its card. The old number is in the tooltip (“Was №14”) and in the card; fix it with ✎ next to it.

Sector contours may overlap where they meet: a click lands on the smallest object on top, a click on a sector zooms into it. In the contour editor **Around the objects inside** draws a sector around its houses.`,
    },
    {
      id: 'points',
      title: 'Points instead of contours',
      body: `An object can stand on the plan as a **point** — a circle with its number — instead of a drawn contour. The colour is the same as for contours: the status on Sales, readiness on Construction, the type on Types. An apartment building gets a **ring of its units’ statuses** (the green part is available) and a “free / total” chip; on Construction — a readiness arc. Hover for the tooltip; click or tap to open the same card.

Points are never hidden: when neighbours crowd each other both get smaller, and very small ones become neat dots without a number — zoom in and the numbers appear. “Numbers: always” keeps every number, “hide” shows dots only.

**How to place them** (administrators): *Structure → Plans → Points*. On the left are the objects not on the plan yet and the counter “Placed X of N”. Choose an object (or ↑ ↓ and Enter in the search) and click the plan where it stands. With **Place one after another** on, the next one is chosen at once — click house after house. Click a placed point to drag it (with Align it snaps to the line of its neighbours), resize it with the handle or S / M / L, set a label, turn it **into a contour** or remove it. A contour becomes a point with **Make a point**. On one plan an object has either a contour or a point. **Undo** (Ctrl+Z) reverts the last action.`,
    },
    {
      id: 'building-card',
      title: 'The card of a house or a building',
      body: `A cottage and an apartment building share one card. On top — number, type, sector, old number and status (a building shows “X of N available” with a status bar), the price or the “from – to” range and the price per m² of the available units, payment options.

A building also has the **Composition** by rooms (area, available / total, price from) with **Reserve**, which reserves the first available unit of that row; a **mini-chessboard** (floors × units in status colours) with a picker by rooms and floor and “Open in the chessboard”. A unit opens its own card with the sale buttons and “← building”. Management can **close sales of the whole building** with one button.

Layouts and renders uploaded on a **series** (a house project, an apartment type) show in every card of that series.`,
      note: 'A free 3-room apartment in building 23 is reserved in two clicks without leaving the plan: “Reserve” in the “3-room” row → “Confirm”.',
    },
    {
      id: 'statuses',
      title: 'Statuses and who changes them',
      body: `1. **Available → Reserved** — a sales manager (the number of reserves at once is limited).
2. **Reserved → Booked** — the manager of the reserve, with a CRM deal that has a client.
3. **Booked → Deposit** — finance.
4. **Deposit → Contract** — legal or the head of sales, with the contract number and date.
5. **Contract → Sold** — finance (paid in full).
6. **Sold → Handed over** — the head of construction or legal, with the act date.

A reserve or booking is released by its manager (with a reason) or the head of sales. A manager extends once, then the head of sales. Closing sales is for management. Rolling back is for the head of sales and management, always with a reason.`,
      note: 'If two people book one unit at the same moment, only one gets it — the other sees who was first.',
    },
    {
      id: 'migration',
      title: 'Status migration',
      body: `For bookings and sales made before the portal or outside it. A Masterplan administrator presses **Migrate status…** in the card and sets any status — without the chain of statuses, a CRM deal or a timer. Give the status date, client, manager, contract number, date and amount, and always a reason.

A booking without an end date never expires. With “Reserve / booking until” it gets the usual timer.

Several units at once — in the registry: select rows and press **Migrate status…**. From Excel — the columns “Status” (reserve … handed), “Client”, “Manager”, “Status date”, “Contract number”, “Contract date”, “Contract amount”, “Booked until”; type the reason in the import window.

The history marks such a change as a **Migration**: who, when, from which status to which, with which date.`,
      note: 'Only Masterplan administrators migrate statuses; everyone else uses the normal chain.',
    },
    {
      id: 'pricing',
      title: 'Prices by payment form',
      body: `The unit price is the price for 100% payment. On **Structure → Prices** an administrator sets the grid: payment plans (e.g. 100%, an installment 50% at $2,200/m² over 12 months, 30% at $2,500/m² over 24 months) and the planned price per m² at completion. The grid applies from a chosen date; a new version never changes the old ones — they stay as the history of prices. A type of object may have its own grid.

The card and the Presentation mode show every plan: the total, the price per m², the first payment and the monthly payment, and the planned price at completion.`,
    },
    {
      id: 'chess',
      title: 'Chessboard',
      body: `Columns are sections and risers, rows are floors (top floor first). A cell shows the number, rooms, area and price; a switch shows price, price per m² or area.

**Select** turns on picking: choose several apartments and change their price by a percent or an amount, close or open their sales.`,
    },
    {
      id: 'registry',
      title: 'Registry, export and import',
      body: `A table of every unit: columns are configurable, sort by a header, the same filters as on the plan. Select rows to change prices or close sales.

**Export** — Excel or CSV, only with the columns you may see.

**Import** (administrators): download the template, fill it in, upload. Every row is checked and errors are listed; nothing is written until the file is clean.`,
    },
    {
      id: 'bookings',
      title: 'Bookings',
      body: 'Active reserves and bookings with the time left. Those ending today and tomorrow are on top. Extend from here, or open the card to release or move to a deposit.',
    },
    {
      id: 'construction',
      title: 'Construction and photo reports',
      body: `Objects with stage, readiness, schedule and the last report date. Filters: “no report for over 14 days”, “behind”, “mine”.

**+ Report**: objects (a whole line too), stage, percent, photos from the camera and a comment. Photos are shrunk on the phone and resumed on a weak connection.

With moderation on, a foreman’s report is reviewed by the head of construction first (the Review tab). A published report moves the stage, recomputes readiness and notifies managers who hold units there.

The journal is a feed by date: author, status, stage progress “before → after”, photos. Tap a photo for the full-screen viewer (swipe, zoom, shooting date and place, download).

**Edit or delete a report** (the “⋯” menu on the card): the author while it is a draft, under review or returned, and for 24 hours after publishing; the head of construction and administrators always. With moderation on, a new percent, date or added photos in a published report send it back to review (fixing the text or removing a photo does not). A single photo is deleted from the viewer (the bin icon). Deleting a published report takes the stage progress back to the previous value and recomputes readiness.`,
      steps: [
        'Press **+ Report** (on a phone — the round button at the bottom).',
        'Press **Camera** and take photos.',
        'Choose the stage and percent, press **Send**.',
      ],
      note: 'A foreman sees and picks only objects of their own zone.',
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      body: 'Sold, booked and available — in pieces, m² and money (in the base currency at the rates from the settings); sales by month and manager; price per m² over time (average list price, the price grid plans, the planned price at completion); readiness by phases and sectors; objects without fresh reports and “sold but not built”.',
    },
    {
      id: 'structure',
      title: 'Structure, site plan and team',
      body: `An administrator builds the tree: phase → sector → line → plot → building → unit (levels may be skipped, up to 8). **In bulk** creates a line “A-1-01…A-1-15” or a section’s apartments “floors × per floor”. Drag nodes to move them; to move several at once (e.g. 10 houses into another sector) press **Select several**, tick the nodes and press **Move…**.

On **Site plans** upload a background (picture or SVG), pick an object and click the background to put contour points; close and save.

On **Team** grant roles: over the whole project or only inside a sector, line or building. A role can be temporary.`,
    },
  ],
  faq: [
    {
      q: 'Why can’t I see the minimum price and clients?',
      a: 'Heads of sales and management see them; a manager sees clients of their own bookings only. This is hidden on the server, not just in the interface.',
    },
    {
      q: 'What happens when a booking expires?',
      a: 'The unit becomes available by itself, the manager and the head of sales are notified, the CRM deal gets a line.',
    },
    {
      q: 'Why can’t I report on the neighbouring sector?',
      a: 'A foreman enters data only in their zone of responsibility; an administrator sets it on the Team tab.',
    },
    {
      q: 'How does a deal stage change the unit status?',
      a: 'An administrator maps “stage → status” in the module settings. When a deal moves to such a stage, its units change status by the same rules and rights.',
    },
  ],
  related: [
    'crm',
    'companies',
    'notifications',
  ],
};
