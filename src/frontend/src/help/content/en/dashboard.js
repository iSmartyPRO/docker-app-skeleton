export default {
  id: 'dashboard',
  icon: 'dashboard',
  title: 'Dashboard',
  tagline: 'Your day at a glance: tasks, meetings, files and figures on one page.',
  summary: 'The dashboard gathers what matters from the portal’s other modules as widgets. Add them from the gallery, arrange and resize them, set their filters — everything saves automatically.',
  highlights: [
    {
      icon: '🧩',
      title: 'Widgets for everything',
      text: 'Tasks, agenda, files, knowledge base, companies, clock, a note and more.',
    },
    {
      icon: '📊',
      title: 'Figures and charts',
      text: 'Task statistics and trends, activity — at a glance, for the period you choose.',
    },
    {
      icon: '🖱',
      title: 'Drag and resize',
      text: 'Drag a widget by its header, resize it by the bottom-right corner.',
    },
    {
      icon: '⚙',
      title: 'Your own filters',
      text: 'Each widget has its own title and settings: project, deadline, period, calendars.',
    },
    {
      icon: '🔒',
      title: 'Only what you may see',
      text: 'Widgets show data with your own rights — never more than the module itself.',
    },
    {
      icon: '💾',
      title: 'Saves itself',
      text: 'Changes save automatically and appear on all your devices.',
    },
  ],
  tips: [
    'Add the same widget several times — e.g. “My tasks” for two different projects.',
    'Give each copy its own title so you don’t mix them up: “Tasks · Website”, “Tasks · CRM”.',
    'Removed a widget by accident? Click “Undo” in the pop-up — you have 5 seconds.',
    'The widget’s ⋯ menu has ready sizes: small, medium, large, wide, full width.',
    'In “Agenda” the “Join” button appears 15 minutes before an online meeting.',
    'Got lost? “Customize” → “Reset” brings back the starting set.',
  ],
  sections: [
    {
      id: 'widgets',
      title: 'Widgets and their data',
      body: `A widget is a card with data from one of the portal’s modules:

- **Greeting** — today’s tasks and events, overdue items, the next meeting with a countdown;
- **My tasks** — open tasks with deadlines; complete in one click, add a new one quickly;
- **Task statistics** and **Task dynamics** — charts by status, priority, project and by day;
- **Agenda** and **Month** — meetings and task deadlines;
- **Recent files**, **File server**, **Knowledge base**, **Online resources**, **Companies**;
- **Notifications**, **Quick access**, **World clock**, **Note**.

Data refreshes every few minutes and when you return to the tab. Widgets show only what you can see in the module itself.`,
      note: 'If a module is off or not available to you, its widgets are not shown. When the module is back on, they return to their places.',
    },
    {
      id: 'gallery',
      title: 'Adding a widget from the gallery',
      body: `The gallery lists all widgets available to you by category: **Overview**, **Tasks**, **Calendar**, **Files and knowledge**, **Business**, **Tools** and more. Each has a preview and a short description; there is a search.

A new widget appears at the top of the dashboard and is briefly highlighted.`,
      steps: [
        'Click **“Add widget”** at the top of the page.',
        'Pick a category on the left or type a name in the search.',
        'Click the widget card — it is added to the dashboard.',
        'Open ⚙ on the widget to tailor it.',
      ],
      example: {
        title: 'Tasks of two projects side by side',
        body: 'A team lead adds “My tasks” twice. In the first one’s ⚙ she picks the “Website” project and titles it “Website”; in the second, the “CRM” project. Now both lists sit side by side.',
      },
    },
    {
      id: 'arrange',
      title: 'Moving and resizing',
      body: `In **“Customize”** mode:

- **move** — drag a widget by its header;
- **resize** — drag the bottom-right corner; the size snaps to the grid and is shown while dragging;
- **preset sizes** — ⋯ menu → “Size”: small, medium, large, wide, full width.

Wide screens have a 12-column grid, tablets 6. Gaps close by themselves. Click **“Done”** to leave customize mode.`,
      note: 'The status above the dashboard shows “Saving…”, “Saved ✓”. No need to press Save.',
    },
    {
      id: 'settings',
      title: 'Widget settings and filters',
      body: `The **⚙** button opens a widget’s settings. Every widget has a **Title** — your own name for the card. The rest depends on the widget:

- **My tasks** — whose tasks (mine / unassigned / all), project, deadline, order, how many, quick add;
- **Statistics** and **Dynamics** — period (7, 30, 90 days), what to show, chart type;
- **Agenda** and **Month** — days ahead, calendars, task deadlines;
- **Online resources** — category and style (tiles or list);
- **World clock** — other cities (up to 6), 24/12 h, analog clock;
- **Note** — colour.

Click **“Save”** in the settings window — the widget updates right away.`,
      example: {
        title: 'Overdue in the team',
        body: 'To see all overdue tasks of the “Logistics” project, in “My tasks” choose **Whose tasks → All**, **Project → Logistics**, **Deadline → Overdue**, **Order → By priority** and title the widget “On fire”.',
      },
    },
    {
      id: 'manage',
      title: 'Duplicate, remove, undo',
      body: `The **⋯** menu on a widget in customize mode:

- **Duplicate** — a copy with the same settings appears next to it; handy for a similar widget with another filter;
- **Open module** — go to the module the data comes from;
- **Remove** — the widget disappears and an **“Undo”** button shows for 5 seconds.

**“Reset”** replaces all your widgets, sizes and settings with the starting set — the portal asks first.`,
      note: 'A reset cannot be undone. If unsure, remove widgets one by one instead.',
    },
    {
      id: 'default',
      title: 'Starting set from the administrator',
      body: `Until you change anything, you see the **starting set**: greeting, quick access, tasks, agenda, statistics, notifications, month, resources, knowledge base, files and more. Widgets of modules you can’t use are hidden.

A dashboard administrator can make their dashboard the starting one for everyone without their own: **“Customize” → “Administration” → “Make it the starting layout”**. **“Back to the built-in starting layout”** undoes it.

If **“Personal dashboards”** is off in **Settings → Modules → Dashboard**, everyone sees the starting set and cannot change it.`,
      steps: [
        'Arrange the dashboard as everyone should see it.',
        'Click **“Customize”** → **“Administration”**.',
        'Choose **“Make it the starting layout”** and confirm.',
      ],
      example: {
        title: 'A dashboard for newcomers',
        body: 'The administrator puts “Greeting”, “Online resources” and “Knowledge base” on top, “My tasks” and “Agenda” below, and makes it the starting set. Every new employee sees the right links and guides from day one.',
      },
      note: 'People who already have their own dashboard are not affected — until they click “Reset”.',
    },
    {
      id: 'mobile',
      title: 'On a phone',
      body: `On a narrow screen widgets line up **in one column**, in the same order as on the computer. Width can’t be changed on a phone — arranging is easier on a large screen.

You have one dashboard on all devices: what you change on the computer is on your phone too.`,
    },
  ],
  faq: [
    {
      q: 'There is no “Customize” button.',
      a: 'The administrator has turned off **personal dashboards** — everyone has the same starting set.',
    },
    {
      q: 'Why is a widget missing from the gallery?',
      a: 'Its module is off or you have no access to it. For example, “Users and sign-ins” is only for people allowed to view users.',
    },
    {
      q: 'The widget doesn’t show all tasks.',
      a: 'Check the filters in ⚙: **Whose tasks**, **Project**, **Deadline** and **How many**. The widget shows only tasks you can see in Tasks.',
    },
    {
      q: 'Do colleagues see my dashboard?',
      a: 'No, the dashboard is personal. And each person’s widgets show data according to their own rights.',
    },
    {
      q: 'How do I start over?',
      a: '**“Customize” → “Reset”** brings back the starting set. Your widgets and settings will be lost.',
    },
    {
      q: 'Is the text in a “Note” saved?',
      a: 'Yes, the note saves as you type. Only you see it.',
    },
    {
      q: 'Can the dashboard open at the portal’s address?',
      a: 'Yes, if the administrator picks “Dashboard” in **Settings → Site access → Home page**.',
    },
  ],
  fields: {
    widgetTitle: {
      title: 'Title',
      text: 'Your own name for the card. Empty — the widget’s standard name. Handy when you have several of the same.',
      more: 'settings',
    },
    scope: {
      title: 'Whose tasks',
      text: '**Mine** — assigned to you; **Unassigned** — nobody’s yet; **All** — every task you can see.',
      more: 'settings',
    },
    period: {
      title: 'Period',
      text: 'How many recent days the figures and chart cover.',
      more: 'settings',
    },
    gallery: {
      title: 'Widget gallery',
      text: 'Only widgets available to you are listed. The same one can be added several times with different settings.',
      more: 'gallery',
    },
    personalize: {
      title: 'Personal dashboards',
      text: 'On — everyone builds their own dashboard. Off — everyone sees the starting set and cannot change it.',
      more: 'default',
    },
  },
  related: [
    'tasks',
    'calendar',
    'start',
  ],
};
