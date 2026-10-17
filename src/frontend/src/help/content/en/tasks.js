export default {
  id: 'tasks',
  icon: 'tasks',
  title: 'Tasks',
  tagline: 'Assignments, deadlines and results in one place, with a chat for every task.',
  summary: 'Assign tasks to yourself and your colleagues, keep track of deadlines and get reminders. Every task has checklists, files, a result and its own chat with the full history. Tasks can be grouped into projects with a board, repeated on a schedule and shared out to a team through flows.',
  highlights: [
    {
      icon: '⚡',
      title: 'Quick or detailed',
      text: 'A quick form takes five seconds; the «Full form» adds checklists, auditors, reminders and everything else.',
    },
    {
      icon: '👥',
      title: 'Clear roles',
      text: 'Originator, assignee, co-assignees and auditors: each person sees their share of the work in the My tasks tabs.',
    },
    {
      icon: '⏰',
      title: 'Deadlines and reminders',
      text: 'The portal reminds you of deadlines itself, and your own reminders can go to the app, e-mail, Telegram, WhatsApp or Mattermost.',
    },
    {
      icon: '🏁',
      title: 'A result, not just a tick',
      text: 'Turn on «A result is required» and the task cannot be closed until the assignee shows what was done.',
    },
    {
      icon: '💬',
      title: 'A chat in every task',
      text: 'Discussion, files and every change to the task in one feed, with no e-mail threads.',
    },
    {
      icon: '🤝',
      title: 'Accept the task',
      text: 'The assignee confirms they have taken the task; one not accepted in time turns red, and the originator hears about it.',
    },
    {
      icon: '🔁',
      title: 'Templates and repeats',
      text: 'Routine tasks are created from a template in one click, and recurring ones appear by themselves on schedule.',
    },
  ],
  tips: [
    'Click the arrow next to «＋ Create» to open the full form straight away or create a task from a template.',
    'Select lines in the description and click «Checklist» to turn them into checklist items.',
    'Any message in the task chat can become the result: «⋯ → Add to result».',
    'A task with a deadline shows up in the Calendar on its date; drag it to another day to move the deadline.',
    'Running late? Do not let it go overdue silently: move the deadline or write to the originator in the task chat.',
    'A task link such as HR-12 can be pasted into any chat, and a colleague opens it in one click.',
  ],
  sections: [
    {
      id: 'create',
      title: 'Creating a task: quick and full form',
      body: `The **«＋ Create»** button opens the quick form: title, a short description, assignee and deadline. By default you are the assignee and the deadline is a week ahead at 19:00. Below are the **Files**, **Checklist** and **Project** buttons.

If the task needs co-assignees, auditors, reminders or a result, click **«Full form →»**: everything you typed is carried over. The arrow next to «Create» opens the full form directly or creates a task **from a template**.

In the full form, extra blocks are switched on with the buttons under the main fields: «Results», «Checklists», «Co-assignees», «Reminders» and others. The form remembers which blocks you opened and shows them next time.

The **flame** next to the title marks the task as **important**: it stands out in lists and is easier to spot among the others.`,
      steps: [
        'Click «＋ Create» and write what needs to be done.',
        'Choose the assignee and the deadline, or leave them as they are.',
        'If needed, open «Full form →» and switch on the blocks you need.',
        'Click «Create» or press Enter. The task gets a number such as HR-12.',
      ],
      example: {
        title: 'Example: «Agree the contract with the legal team»',
        body: 'A manager creates the task in the quick form, picks a lawyer as the assignee and the deadline «End of the week». Then they open the full form, attach the draft contract and add the head of department as an auditor.',
      },
      note: 'If you choose several assignees (the «＋» next to the assignee), each of them gets **their own copy** of the task, which is handy for giving the same assignment to several people.',
    },
    {
      id: 'roles',
      title: 'Roles: who is responsible for what',
      body: `- **Originator**: the person who assigns. Can change anything in the task, including the deadline, accepts and rates the result, and can delete the task.
- **Assignee**: the person responsible for doing it. Starts and completes the task and can delegate it. Can change the deadline only if the originator allows it.
- **Co-assignees**: help the assignee and can edit and complete the task in the same way.
- **Auditors**: follow the progress. They see the task, write in its chat and get notifications, but change nothing.

Task participants see the task even without access to its project.

**Delegate** (the «⋯» menu at the bottom of the task) hands the task to another person. The previous assignee becomes an auditor and keeps seeing what happens.`,
      example: {
        title: 'Example: a report for management',
        body: 'The CFO is the originator of «Quarterly report». The chief accountant is the assignee, an economist who gathers the figures is a co-assignee, and the CEO is added as an auditor to see the progress without asking.',
      },
    },
    {
      id: 'acceptance',
      title: 'Accepting a task',
      body: `A task given to **someone else** first **waits for acceptance**. The assignee sees a banner on top of the task with two buttons:
- **«Accept»** confirms the task is clear and taken on. You can add a short comment for the originator;
- **«Discuss»** opens the task chat to clear things up before taking it on.

**Starting** the task, moving it to an «In progress» status or **completing** it straight away also accepts it. The chat keeps an «Accepted by name · time» mark, and the originator gets a notification.

Tasks you give **yourself** are accepted automatically. When a task is **delegated** or gets another assignee, the new assignee accepts it again. Co-assignees help the assignee and do not accept it separately.

**Time to accept** is 24 hours, 4 hours for important tasks (with the flame). An administrator changes it in the module settings, a project manager for their project (project menu → «Edit»). A task not accepted in time **turns red** with a «Not accepted N h» label in lists, on the board, in the task and in My tasks; the assignee gets a reminder and the originator a notification (once each). A missed deadline is a separate red label at the deadline.`,
      steps: [
        'Open the task from the notification, from My tasks (the «Awaiting my acceptance» group) or from the «Waiting for me» page.',
        'Read the description. If something is unclear, click «Discuss» and ask in the chat.',
        'Click «Accept» (or «Add a comment» first).',
      ],
      example: {
        title: 'Example: «Find an administrator, 5 days»',
        body: 'The director gives an order to the HR officer. 24 hours later it is still not accepted: it turns red with «Not accepted 24 h», the HR officer gets a reminder and the director a notification. The HR officer clicks «Discuss», clarifies the requirements and accepts the task.',
      },
    },
    {
      id: 'orders',
      title: 'Orders',
      body: `An **order** («поручение») is a task given by the management. A task is an order when:
- its originator belongs to one of the «Leadership» groups (an administrator chooses them in the module settings) and someone else is the assignee;
- or the **«Order»** flag is on (the bookmark icon next to the flame; set by the originator or a project manager).

Orders carry a badge on cards and in lists. The **«Orders»** chip above the list in My tasks and in a project shows only them.

Above the lists there are **quick filters with counters**: «Urgent», «Overdue», «Not accepted», «In progress», «Done» and «Orders». Click a chip again to clear it.`,
    },
    {
      id: 'deadlines',
      title: 'Deadlines and planning',
      body: `The deadline takes one click: **Today**, **Tomorrow**, **End of the week**, **In a week**, **End of the month**, or any date in the calendar and an exact time. «No deadline» removes it.

An overdue task is highlighted, with how late it is next to it. In My tasks, tasks are grouped by deadline: overdue, today, tomorrow, next 7 days and later.

The **«Planning»** block (the 🗓 button next to the deadline) is for longer tasks:
- planned **Start** and **Finish** dates and their duration;
- **Allow the assignee to change the planned dates**: when off, only the originator can move the deadline;
- **Skip weekends**;
- **The deadline depends on subtasks**: the task's deadline becomes the latest deadline of its subtasks.

If a task is not relevant for now, you can **defer** it (the «⋯» menu at the bottom of the task): deferred tasks send no reminders and are shown in a separate group.`,
      note: 'When the deadline moves, its reminders are armed again for the new date.',
    },
    {
      id: 'reminders',
      title: 'Reminders',
      body: `The portal reminds you of deadlines itself: the assignee is notified a day before the deadline, and the assignee and the originator when the task is overdue. These reminders also appear in the task chat with the buttons **«Complete it»** and **«Change the deadline»**.

Your own reminders are added in the **«Reminders»** block of the full form. You choose:
- **Whom to remind**: yourself, the assignee, the originator or the co-assignees;
- **When**: at a specific date and time, or some time **before the deadline**;
- **How**: **In the app** (the bell and push), **E-mail**, **Messengers** (Telegram, WhatsApp and Mattermost).

**For a reminder to arrive, the channel must be connected:**
- for messengers, link Telegram in [Profile → Security](/account/security) or enter your Mattermost name in the [Profile](/account);
- for push, allow notifications in the browser or app on the device you use ([notification settings](/account/notifications));
- for e-mail, your profile must have an address.

If a channel is not connected, the reminder form shows a warning with a «Fix» link.`,
      steps: [
        'Open the task and switch on the «Reminders» block.',
        'Click «＋ Add a reminder».',
        'Tick whom to remind, choose the time and the channels.',
        'Click «Remind». A sent reminder is marked «sent».',
      ],
      example: {
        title: 'Example: do not forget the signing',
        body: 'For «Agree the contract with the legal team», the originator sets a reminder for the assignee «1 day before the deadline» in the app and Telegram, and one for themselves on the meeting day at 10:00.',
      },
      note: 'Reminders are not sent for completed tasks. A «before the deadline» reminder is available only when the task has a deadline.',
    },
    {
      id: 'checklists',
      title: 'Checklists',
      body: `A checklist breaks the task into steps and shows progress: «3/5 done». A task can have several checklists, for example «Preparation» and «Review».

- **Enter** adds an item; you can paste several lines at once.
- Items can be dragged, moved right to nest them, and moved to another checklist.
- Each item has a «⋯» menu: mark it important, attach a file, give it a co-assignee or an auditor.
- **Group actions** tick or move several items at once, and **Hide completed** removes the clutter.

When every item of a checklist is ticked, the task chat shows «Checklist is complete».`,
      example: {
        title: 'Example: a new employee starts',
        body: 'In «New manager starts on 1 March», HR keeps a checklist: prepare the contract, order a pass, hand out a laptop, create an account. The «hand out a laptop» item is assigned to someone from IT.',
      },
    },
    {
      id: 'results',
      title: 'Completing a task and its result',
      body: `The assignee clicks **«Start»** when they take the task up and **«Complete»** when it is done. A completed task can be sent **«Back to work»**.

**A result is required**: the originator turns this on in the «Results» block (the «⋯ → Require a result» menu). The task then cannot be completed until the assignee describes what was done: conclusions, links, the final document.

A result is added with «Add a result» or straight from the chat: on any message choose **«⋯ → Add to result»**. The originator is notified about a new result.

Once the task is complete, the originator can **rate it** «Good» or «Poor».`,
      example: {
        title: 'Example: a competitor price review',
        body: 'The head of sales sets the task with «A result is required». The analyst cannot close it until they attach the spreadsheet and a short conclusion, and the manager sees the outcome right in the task card.',
      },
    },
    {
      id: 'chat',
      title: 'Files and the task chat',
      body: `To the right of the task is its **chat**. People discuss the work there, call each other, share files and mention colleagues with **@**. Every change is logged there automatically: deadline, assignee and status changes, added files, the result and reminders. No separate comments or history: everything is in one feed.

Only task participants see the chat. You can mute it from the task's ≡ menu → «Mute the task chat».

**Files** are attached in the «Files» block: **from the computer**, **from Files** or **from the file server**. You can also drop files onto the block. On a phone, the task and its chat are two tabs.`,
    },
    {
      id: 'subtasks',
      title: 'Subtasks, links and Gantt',
      body: `A big task is easier to handle as **subtasks**: choose «Create a subtask» in the task's ≡ menu or click «＋ Subtask» in the «Subtasks» block. A subtask has its own assignee and deadline, and its card links back to the parent task.

The **«Parent task»** block makes the current task a subtask of another one. **«Related tasks»** simply link tasks to each other both ways, for example a request and its invoice.

The **«Gantt»** block sets the order of work between tasks:
- **Finish → Start**: this task starts when the linked one is finished (the most common case);
- **Start → Start**: they start together;
- **Finish → Finish**: they finish together;
- **Start → Finish**: this task finishes when the linked one starts.`,
      example: {
        title: 'Example: an office move',
        body: '«Office move» has the subtasks «Lease agreement», «Furniture» and «Network and phones». «Furniture» has a Gantt link «Finish → Start» to «Lease agreement»: furniture is ordered only after the lease is signed.',
      },
      note: 'Subtasks can be added once the task has been created.',
    },
    {
      id: 'recurring',
      title: 'Templates and recurring tasks',
      body: `A **template** is a saved task form: title, description, people, checklists. In the full form click **«📄 Templates» → «Save as template»**, then create such tasks with the arrow next to «＋ Create» → «Task from a template».

A **recurring task** is created by itself on a schedule. Switch on the «Recurring» block and set:
- **Repeat every** N days, weeks, months or years, and the weekdays for weeks;
- **Start on** a date and the time to **create** each copy;
- **End**: manually, after N times or on a date;
- **Deadline of each copy**: how long after creation it is due;
- what to do when the day falls on **weekends and holidays**.

For an existing task, use the ≡ menu → «Automate tasks» → «Make it recurring». Schedule changes apply to every future copy.`,
      example: {
        title: 'Example: a monthly reconciliation',
        body: 'Accounting sets up the recurring task «Supplier reconciliation»: every month on the 1st at 9:00, due 3 days later, moved to Monday when it falls on a weekend.',
      },
    },
    {
      id: 'flows',
      title: 'Flows: tasks for a team',
      body: `A **flow** is a team's shared task queue, such as «IT requests» or «Contracts to review». You put a task into the flow instead of assigning a specific person, and it goes to one of the members:
- **In turn**: members one after another;
- **Least loaded**: whoever has fewer open tasks;
- **Manually**: someone assigns tasks by hand.

A flow is created right in the «Flow» block → «Create a flow». Below the chosen flow you see how many tasks are open and overdue, and the share done on time.`,
      example: {
        title: 'Example: IT requests',
        body: 'The office manager puts «The 3rd-floor printer is broken» into the «IT requests» flow set to «Least loaded»: the request goes to whoever is free, and nobody has to pick an assignee.',
      },
    },
    {
      id: 'time',
      title: 'Time tracking',
      body: `Switch on the **«Time tracking»** block and the **«Track time»** toggle to see how long the task really took.

- **Planned time**: how many hours and minutes you allow.
- **Timer**: ▶ starts counting, ⏸ pauses it. The timer is shown right in the task header.
- Time is counted per participant and shown next to the estimate.`,
    },
    {
      id: 'my-tasks',
      title: 'My tasks',
      body: `**My tasks** is your personal to-do list. The tabs follow your role:
- **Doing**: you are the assignee or a co-assignee;
- **Helping**: you are a co-assignee;
- **Assigned**: you are the originator and others do the work;
- **Following**: you are an auditor;
- **All**: everything together.

Tasks are grouped by deadline: **Overdue**, **Today**, **Tomorrow**, **Next 7 days**, **Later**, **No due date**, then **Deferred** and **Done recently**. A flame marks important tasks, a counter shows subtasks. The chosen tab is remembered.`,
      note: 'Start your day with «Doing» and the «Today» group, and check «Assigned» once a week so nothing slips.',
    },
    {
      id: 'projects',
      title: 'Projects, board and access',
      body: `A **project** gathers the tasks of a department or a line of work. Every project has a **key**: a short code of 2–10 Latin letters or digits used in task numbers and links, such as HR-12. It is suggested from the name («Sales department» → SD) and **cannot change** after creation, so links never break.

A project's tasks are shown on a **board** (columns by stage, cards are dragged) or as a **list**. Stages are set in the project menu → «Workflow»: each one is of the kind «Not started», «In progress» or «Done». A task is complete when it enters a «Done» stage.

**Who can access it** is chosen at creation: «Everyone, can edit», «Everyone, read only» or «Only me». Later, access is fine-tuned in the project menu → «Access» for people, groups or roles:
- **View**: see tasks and write in their chats;
- **Edit**: create, change and move tasks;
- **Manage**: also stages, access, archiving and deleting the project.

A task can also have **no project**: then only its participants see it.`,
      example: {
        title: 'Example: an HR project',
        body: 'HR creates the project «Personnel» with the key HR and «Only me» access, then in «Access» gives the HR group «Edit» and managers «View».',
      },
    },
    {
      id: 'calendar',
      title: 'Tasks in the calendar',
      body: `Every task you take part in (assignee, co-assignee, originator or auditor) that has a **deadline** appears in the [Calendar](/app/calendar) on its date and time. Overdue tasks are marked red, completed ones are crossed out. Click a task to open it.

- **Drag** a task to another day or hour to move its deadline.
- The calendar sidebar lists tasks **«Without a deadline»**: drag one onto a day to give it a deadline.
- Create a task right in the calendar: click an empty slot and choose «Task».
- After you create a task, a note shows its deadline with an **«In the calendar»** button that opens that day.

Which tasks to show (the ones you do, all yours, or all you can see) and whether to show completed ones is set in the calendar settings (⚙).`,
      example: {
        title: 'A deadline "in a week"',
        body: 'You create a task on Monday; the default deadline is a week ahead at 19:00. It is not in this week of the calendar — it is next Monday. Click «In the calendar» in the note after creating it, or go to next week.',
      },
    },
  ],
  faq: [
    {
      q: 'Why is a task red with «Not accepted»?',
      a: 'The assignee has not accepted it within the time to accept (24 h by default, 4 h for important tasks). Click «Accept» in the task or start it and the label goes away. The deadline itself does not change.',
    },
    {
      q: 'Do I accept a task I gave myself?',
      a: 'No, those are accepted automatically. Only tasks someone else gave you need accepting.',
    },
    {
      q: 'Why is my task not in the calendar?',
      a: `A task appears **on its deadline date**. Check that:
- the task has a deadline (otherwise it is in «Without a deadline» in the calendar sidebar);
- the right week is shown — the default deadline is "in a week", i.e. next week;
- «My tasks» is on in the calendar sidebar, and «Show tasks» in the settings (⚙).`,
    },
    {
      q: 'Why did a reminder not arrive?',
      a: `Check in order:
1. The reminder's date and time, and that the task has a deadline if the reminder is «before the deadline».
2. The task is not completed or deferred.
3. Channels: Telegram linked in [Profile → Security](/account/security), Mattermost entered in the [Profile](/account), push enabled on the device, an e-mail in your profile.
4. Messengers are not switched off in [notification settings](/account/notifications).
5. [Notification settings](/account/notifications) show «Recent notifications» at the bottom: where each one went and why it did not arrive. «Send a test» checks every channel.

The reminder is always in the portal's bell.`,
    },
    {
      q: 'I cannot change the deadline. Why?',
      a: 'The assignee can change the deadline only if the originator allows it («Planning» → «Allow the assignee to change the planned dates»). Write to the originator in the task chat: they can move the deadline or allow it.',
    },
    {
      q: 'The «Complete» button shows an error. What should I do?',
      a: 'Most likely the task has «A result is required» on. Open the «Results» block, describe what was done and save it; then the task can be completed.',
    },
    {
      q: 'What is the difference between a co-assignee and an auditor?',
      a: 'A co-assignee works on the task together with the assignee and can edit and complete it. An auditor only follows: sees the task, writes in the chat and gets notifications.',
    },
    {
      q: 'I chose three assignees: why are there three tasks?',
      a: 'That is by design: each assignee gets their own copy and answers for their part. If you need one shared task, pick one assignee and add the others as co-assignees.',
    },
    {
      q: 'A colleague cannot open the task link',
      a: 'A task is visible to its participants and to people with access to its project. Add the colleague as an auditor or co-assignee, or ask the project manager to grant access in the project menu → «Access».',
    },
    {
      q: 'Can I change a project key?',
      a: 'No. The key is part of every task number and link in the project, so it is set once at creation. The project name, description and colour can be changed.',
    },
  ],
  fields: {
    important: {
      title: 'Important task',
      text: 'The flame highlights the task in lists and on the board so nobody misses it. It does not change the deadline, but an important task has to be accepted sooner — within 4 h by default.',
      more: 'create',
    },
    originator: {
      title: 'Originator',
      text: 'The person who assigns the task: changes the deadline, accepts and rates the result. Usually that is you.',
      more: 'roles',
    },
    assignee: {
      title: 'Assignee',
      text: 'The person mainly responsible for doing it. If you pick several assignees, each gets their own copy of the task.',
      more: 'roles',
    },
    deadline: {
      title: 'Deadline',
      text: 'When the task must be done. A reminder comes in advance, and the task appears in the assignee\'s Calendar on that day.',
      more: 'deadlines',
    },
    coassignees: {
      title: 'Co-assignees',
      text: 'They help the assignee and can edit and complete the task. It shows up in their «Helping» tab.',
      more: 'roles',
    },
    auditors: {
      title: 'Auditors',
      text: 'They follow the task: see it, write in the chat and get notifications, but change nothing.',
      more: 'roles',
    },
    results: {
      title: 'Results',
      text: 'What was done. With «A result is required», the task cannot be completed until a result is added (the «⋯» menu).',
      more: 'results',
    },
    flow: {
      title: 'Flow',
      text: 'A team task queue: the task goes to a member in turn or to the least loaded one.',
      more: 'flows',
    },
    reminders: {
      title: 'Reminders',
      text: 'Whom, when and where to remind about the task. Link Telegram in «Profile → Security» and enter Mattermost in «Profile».',
      more: 'reminders',
    },
    reminderChannels: {
      title: 'Reminder channels',
      text: '«In the app» means the bell and push (push must be allowed on the device). «Messengers» works if Telegram is linked (Profile → Security) or Mattermost is set in the Profile.',
      more: 'reminders',
    },
    recurring: {
      title: 'Recurring task',
      text: 'The task is created by itself on a schedule (daily, weekly, monthly or yearly), with its own deadline for each copy.',
      more: 'recurring',
    },
    planning: {
      title: 'Planning',
      text: 'Planned start and finish, skipping weekends and the deadline from subtasks. This is also where you decide whether the assignee may move the deadline.',
      more: 'deadlines',
    },
    timeTracking: {
      title: 'Time tracking',
      text: 'Planned time and a timer: you see how long the task really took for each participant.',
      more: 'time',
    },
    gantt: {
      title: 'Gantt links',
      text: 'The order of work between tasks. Most often you need «Finish → Start»: this task starts after the linked one.',
      more: 'subtasks',
    },
    acceptHours: {
      title: 'Time to accept',
      text: 'How many hours the assignee has to accept a task of this project. Empty means as in the module settings.',
      more: 'acceptance',
    },
    projectKey: {
      title: 'Project key',
      text: 'A short code of Latin letters and digits for task numbers and links, such as HR-12. It cannot be changed after creation.',
      more: 'projects',
    },
    projectAccess: {
      title: 'Who can access it',
      text: 'The starting access to the project. Later you can fine-tune it for people, groups and roles in the project menu → «Access».',
      more: 'projects',
    },
  },
  related: [
    'calendar',
    'chat',
    'notifications',
  ],
};
