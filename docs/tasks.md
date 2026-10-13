# Tasks (`/app/tasks`)

The second [module](modules.md): projects with their own workflows, a kanban board and a list view, personal "My tasks" by role, a quick and a full form, checklists, results, subtasks, templates and recurring tasks, flows, time tracking and a chat per task.

## URLs

| URL | Page |
|-----|------|
| `/app/tasks` | **My tasks** by role, grouped into Awaiting my acceptance / Overdue / Today / Tomorrow / Next 7 days / Later / No due date / Deferred / Done recently |
| `/app/tasks/projects` | All projects I can see, with progress and archived ones on demand |
| `/app/tasks/HR` | Project **HR**: board or list, filters, quick add |
| `/app/tasks/HR-12` | Task **HR-12** opened in a side panel over its board (full screen on phones) |
| `/app/tasks/TSK-7` | A task without a project, opened over My tasks |

Each project has a short **key** (2–10 Latin letters or digits). The key prefixes the task numbers and the links, e.g. `HR-12`. It is suggested from the project name and checked for availability as you type: Cyrillic and Kazakh names are transliterated, so «Отдел продаж» becomes `OP`. The key cannot change after the project is created, so links stay stable.

## Projects and access

| Level | Allows |
|-------|--------|
| **View** | See tasks, write in their chats, follow |
| **Edit** | Create, edit, move and complete tasks |
| **Manage** | Edit, plus workflow, access, archive and deletion |

- Levels are granted per project to everyone, a user, a group or a role. The editor is the same one used by the Knowledge Base.
- When creating a project you pick a starting point:
  - **Everyone, can edit**;
  - **Everyone, read only**;
  - **Only me**.

  The creator always gets *manage*.
- **Task participants** have their own rights regardless of the project level (see [Roles](#roles)).
- The `tasks.admin` permission gives *manage* on every project. Other people's tasks without a project stay private to their participants, administrators included.
- Moving a task to another project (or out of one) needs *edit* on both projects; a participant role alone is not enough to take a task out of its project.
- *Settings → Modules → Tasks* decides who may create projects: everyone, or administrators only.
- A starter project **GEN** ("General" / «Общие задачи») is created once, with *everyone: edit*.

## Workflow

Each project has its own ordered statuses, and every status is one of three kinds:

- **Not started** (`todo`);
- **In progress** (`active`);
- **Done** (`done`).

A task is complete when it enters a *Done*-kind status. At that moment `completed_at` is set and the task leaves "My tasks" and the reminders. The defaults are To do → In progress → Review → Done, localised.

Editing the workflow (*⋯ → Workflow*) lets you:
- rename statuses;
- recolour them;
- reorder them;
- add new ones;
- remove them. Tasks in a removed status move to the nearest status of the same kind.

## Tasks without a project

A task does not need a project. Such tasks live in a hidden personal project with the key **TSK** («Без проекта» / "No project"): they get numbers like `TSK-12`, never appear in the project list, and are visible only to their participants. Choosing a project later moves the task and gives it a new number in that project; the old link still finds it through the chat history.

The task chat is closed while the module is off and to API tokens without the `tasks` scope (writing needs `tasks:write`). Deleting a task or a project deletes the task chats and the uploaded files nothing else uses (task files and files sent in those chats). The project board loads at most 2,000 tasks and says so when there are more.

## Roles

| Role | Can |
|------|-----|
| **Originator** (Постановщик) | Edit everything, change the deadline, delete, rate the result, delegate |
| **Assignee** (Исполнитель) | Edit, start, complete, delegate; change the deadline only if the originator allowed it |
| **Co-assignee** (Соисполнитель) | Edit and complete, like the assignee |
| **Auditor** (Наблюдатель) | View, write in the chat, follow |

Participants have these rights in addition to the project level, so a task can be shared with someone who cannot open its project. Several assignees picked at creation produce one copy of the task per person. **Delegating** hands the task to someone else; the previous assignee becomes an auditor.

## Acceptance («Принять в работу»)

A task given to someone other than its originator **waits for acceptance** by its assignee.

- The task card shows the assignee a banner with **Accept** (optionally with a comment) and **Discuss** (opens the task chat, ready to type). Everyone else sees whom the task waits for and until when.
- **Starting** the task, moving it to an *In progress*-kind status or **completing** it also accepts it — only when the assignee does it; the originator moving the card does not.
- Tasks the originator gives themselves, and tasks the person creating or reassigning them takes themselves, are accepted at once.
- **Reassigning or delegating** starts over: the new assignee has to accept the task, with a new deadline to accept.
- **Co-assignees** help the assignee and do not accept separately: the assignee's acceptance covers the task.
- The chat feed gets «Принято в работу: name · time» (with the comment, or "by starting / completing it"); the originator gets the `tasks.accepted` notification; webhooks get `task.accepted`.
- **Time to accept**: 24 h, 4 h for important tasks (module settings); a project may set its own hours (*⋯ → Edit project*). Marking a waiting task important recalculates it; moving it to another project uses that project's hours.
- **Not accepted in time**: the task turns red with «Не принята N ч» (N = hours since it was assigned) in lists, on the board, in the card and in My tasks. The `tasks:acceptance` job (every 5 minutes) sends the assignee `tasks.accept_overdue` and the originator `tasks.not_accepted` — once per assignment, through `notify()` (quiet hours and preferences apply) — and posts an event to the task chat. Deferred tasks and archived projects wait. The execution deadline keeps its own red label.
- Tasks that existed before acceptance are marked accepted once on the first start (flag `tasks_acceptance_v1`), so nothing turns red on deploy.

Stored on the task: `assigned_at`, `accepted_at`, `accepted_by`, `accept_due_at`, `accept_notified_at`; on the project `accept_hours`, `accept_hours_important` (NULL = module settings).

## Orders («Поручения»)

A task is an **order** when it carries the **Order** flag (the bookmark next to the flame; the originator or a project manager sets it) or when its originator belongs to one of the **leadership groups** chosen in the settings and someone else is the assignee. Orders carry a badge on cards and rows; the **Orders** chip in My tasks and in a project shows only them; `GET /tasks?orders=1` filters them.

## Quick filters

Above My tasks and the project board and list: chips with counters over the tasks on screen — **Urgent** (important or urgent priority, open), **Overdue**, **Not accepted**, **In progress** (open, accepted, not deferred), **Done** and **Orders**. One at a time; a second click clears it.

## «Ждёт меня» (inbox)

The module registers the inbox provider `tasks.acceptance`: the tasks waiting for **my** acceptance that I may see (`listTasks` access rules; an API token needs the tasks scope and its project limits apply). Each item has `actions: ['accept', 'open']`, `dueAt` = the deadline to accept, `overdue`, `url` and `meta.acceptPath` — `POST /api/app/tasks/tasks/:ref/accept` accepts it.

## Creating a task

**Quick form** (*＋ Создать*):
- title, with the flame toggle **Important**;
- a short description;
- assignee (me by default) and deadline (a week ahead, 19:00);
- chips **Files**, **Checklist** and **Project**;
- *Full form →* carries everything typed so far into the full form.

The arrow next to *Создать* opens the full form directly or creates a task from a template.

**Full form:** a side panel with the task on the left and its chat on the right (a placeholder until the task exists). Floating buttons close it, copy the link, open the task in a new window and print it. On phones the task and the chat are two tabs.

- **Description** uses a visual editor: bold, italic, lists, links, attachments, `@` mentions, *Checklist* (turns the selected lines into checklist items), and *Expand* for a large editing window. It is stored as sanitised HTML; older Markdown descriptions are converted when opened.
- **Main block:** originator, assignee (＋ adds more, *Invite* adds someone new), deadline with presets (today, tomorrow, end of the week, in a week, end of the month), a calendar and the time.
- **Chips** below open optional blocks. The chips you opened are remembered for the next task.

| Chip | Block |
|------|-------|
| Results | Require a result: the task cannot be closed until a result is added. Any chat message can become a result (*⋯ → Add to result*) |
| Files | From the computer, from Files, or from the file server |
| Checklists | Several lists; items can be nested, marked important, given an assignee or auditor, moved between lists, dragged, bulk-edited; *hide completed* |
| Project | All / recent projects; create one from here |
| Co-assignees, Auditors | People |
| Flow | A team queue; new tasks go to members in turn (*queue*) or to the least loaded (*least*), or stay unassigned (*manual*). The flow page shows each member's efficiency |
| Tags | Free tags |
| Reminders | Whom (me, assignee, originator, everyone), when (a date or some time before the deadline) and through which channels (portal and push, email, messenger) |
| Parent task, Subtasks | Hierarchy; loops are refused |
| Related tasks | Links in both directions |
| Recurring | Every N days, weeks, months or years, on chosen weekdays, at a time, until a count or a date; the deadline is set N hours or days after creation; weekends can be skipped |
| Gantt | Dependencies of four kinds: finish→start, start→start, finish→finish, start→finish |
| Deadline planning | Planned start and end, *deadline from subtasks*, *skip weekends*, *assignee may change the deadline* |
| Time tracking | Estimate, a start/stop timer and the time spent per person |
| Custom fields | Fields defined for all tasks: string, number, date and time, yes/no |

The footer has *Создать*, *Отмена* and **Templates** (save the form as a template or fill it from one).

## Task card

An existing task opens in the same panel:
- the ≡ menu: follow, mute the chat, copy the link, new task, subtask, copy, favourite, automate (recurring and flow), defer, delegate, delete;
- the status, the creation date and the ID; an overdue deadline is highlighted with how late it is;
- the footer: **Start**, **Complete** (or *Return to work*), **⋯** (defer, delegate, delete), **Rate** for the originator after completion, and the number of views.

Deferred tasks drop out of reminders (custom reminders that come due meanwhile are dropped, as in archived projects) and are shown in their own group in My tasks.

## Task chat

Each task has a [chat](chat.md) that replaces comments and history. It holds the discussion and an event feed: created, field changes (status, deadline, assignee, project…), files, checklist completed, result added, links, rating, and the reminders *almost overdue* and *overdue* with the buttons **Complete it** and **Change the deadline**. Comments and history of older tasks are imported into the chat the first time it is opened. The chat's participants are the task's participants; people outside the task cannot read it.

## Templates and recurring tasks

Both are stored the same way, as a saved form (`task_templates`). A template is filled in by hand; a recurring task is a template with a schedule, and the `tasks:recurring` job creates a new task from it on each occurrence.

- A recurring task made from the form creates its first copy right away; that copy stands for the first slot of the schedule. Editing the template later continues after that slot (`last_slot`), so no slot is made twice.
- Monthly and yearly schedules keep the start's day: the 31st falls on the last day of shorter months and returns to the 31st afterwards; 29 February falls on the 28th in common years.
- Reminders at a set time and planned dates in the template were written for one slot (`anchor_at`): each copy gets them moved by as much as its slot is later. Reminders "before the deadline" are kept as they are. Templates saved before this simply leave out reminders and plans that are already in the past.
- The project in a template must be one the person (and their API token) may add tasks to.

## My tasks

Tabs by role: **Doing** (I am the assignee or a co-assignee), **Helping** (co-assignee), **Assigned** (I am the originator), **Auditing**, **All**. The tab is remembered. Tasks waiting for my acceptance come first (**Awaiting my acceptance**, late ones on top), the rest is grouped by deadline, with deferred and recently completed tasks at the end. Important tasks show a flame, tasks with subtasks show a counter. The header shows how many tasks I still have to accept; the quick filters (above) narrow the tab, e.g. **Not accepted** on *Assigned* for the originator.

## Board and list

- **Board:**
  - drag cards between and within columns with the mouse, a long press on touch screens, or the keyboard;
  - the order is stored as fractional ranks, re-spread automatically when they run out;
  - quick add at the bottom of each column.
- **List:** groups by status; check a box to complete a task.

## Notifications

All go through the [notification center](notifications.md), so they reach the bell, push, email, Telegram and Mattermost according to each person's preferences. Your own actions never notify you. Events also appear in the task chat.

| Event | Who |
|-------|-----|
| Task assigned, added as co-assignee or auditor | The added people |
| Status changed | Participants |
| Chat message | Task participants, as a chat push (mentions as "mentioned you") |
| Result added | The originator |
| Priority raised to urgent | Assignee |
| Due within N hours (default 24) | Assignee, once per deadline |
| Overdue | Assignee and originator, once |
| Task accepted (`tasks.accepted`) | Originator |
| Not accepted in time (`tasks.accept_overdue` / `tasks.not_accepted`) | Assignee / originator, once per assignment |
| Custom reminder | As set in the reminder, through its channels |

Moving the deadline re-arms both deadline reminders; deferred tasks get none. The deadline job runs every 5 minutes, custom reminders every minute, in the [scheduler](notifications.md#scheduler).

## Settings (Admin → Settings → Modules → Tasks)

| Setting | Default |
|---------|---------|
| Enabled | on |
| Who creates projects | everyone (`everyone` \| `admins`) |
| Default view | board |
| Deadline reminders / hours before | on / 24 (1–168) |
| Time to accept / for important tasks | 24 / 4 hours (1–720); projects may override |
| Leadership groups (`ordersGroupIds`) | none — tasks their members give to others are orders |

## API (`/api/app/tasks`, signed-in users)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Projects with counters, my totals, module config |
| GET | `/projects[?archived=1]` | Visible projects |
| GET | `/projects/key?from=` or `?key=` | Suggest a key from a name / check one |
| POST | `/projects` | `{ name, key?, description, color, icon, visibility }` |
| GET / PUT / DELETE | `/projects/:key` | Project with statuses, members and labels / update (`archived`, `acceptHours`, `acceptHoursImportant`) / delete |
| PUT | `/projects/:key/statuses` | Replace the workflow |
| GET / PUT | `/projects/:key/access` | Access list |
| GET | `/subjects` | People who can be given a task |
| GET | `/tasks` | Filters: `project`, `role` (`doing`, `helping`, `assigned`, `auditing`, `all`), `assignee` (`me`, `none`, id), `status`, `priority`, `label`, `important`, `flow`, `parent`, `deferred`, `nodue=1` (no deadline), `q` (text or `KEY-12`), `open=1`, `dueFrom`, `dueTo`, `doneSince`, `acceptance` (`pending`, `late`, `accepted`), `orders=1`, `sort`, `limit` |
| POST | `/tasks` | Create from the form payload: `title`, `description`, `descriptionFormat`, `important`, `projectId`, `assigneeIds[]`, `originatorId`, `coassigneeIds[]`, `auditorIds[]`, `dueAt`, `checklists[]`, `fileIds[]`, `reminders[]`, `links[]`, `deps[]`, `parentId`, `flowId`, `resultRequired`, planning and time fields, `custom`; with `recurrence` creates a recurring template instead |
| GET / PUT / DELETE | `/tasks/:ref` | `ref` = `KEY-12` or id. `PUT` is partial; `complete: true` moves the task to the first *done* status; `projectId` moves it; `deferred`; `move: { beforeId, afterId }` positions it on the board |
| GET | `/tasks/:ref/form` | The task as a form payload (copy, template) |
| PUT | `/tasks/:ref/watch`, `/tasks/:ref/favorite` | `{ on }` |
| POST | `/tasks/:ref/start`, `/delegate` (`{ userId }`), `/rate` (`{ rating, comment }`), `/copy`, `/timer` (`{ action: start\|stop }`) | Actions |
| POST | `/tasks/:ref/accept` (`{ comment? }`) | Accept the task (assignee only; again → `accepted: false`) |
| POST / PUT / DELETE | `/tasks/:ref/checklists`, `/checklists/:id[/order]` | Checklists |
| POST / PUT / DELETE | `/tasks/:ref/checklist`, `/checklist/:id`, `/tasks/:ref/checklist/order`, `/checklist/bulk` | Checklist items |
| POST | `/files`, `/files/link` | Upload or link files for a task not yet created (draft) |
| POST | `/tasks/:ref/files`, `/tasks/:ref/files/link` | Upload, or link from Files (`nodeId`) or the file server (`shareId`, `path`) |
| GET / DELETE | `/files/:id` | Download / remove |
| POST / DELETE | `/tasks/:ref/results`, `/results/:id` | Results; `{ body }` or `{ messageId }` from the chat |
| POST / DELETE | `/tasks/:ref/links`, `/tasks/:ref/links/:otherId` | Related tasks |
| POST / DELETE | `/tasks/:ref/deps`, `/deps/:id` | Gantt dependencies `{ taskId \| ref, kind: FS\|SS\|FF\|SF }` |
| POST / DELETE | `/tasks/:ref/reminders`, `/reminders/:id` | Reminders |
| GET / POST / PUT / DELETE | `/templates[/:id]` | Templates and recurring tasks |
| GET / POST / PUT / DELETE | `/flows[/:id]` | Flows |
| GET / POST / DELETE | `/fields[/:id]` | Custom fields |
| GET | `/calendar?from&to&scope=doing\|participant\|all&done=0` | Tasks due in a range (used by the Calendar); `participant` (default) = any role of mine; other people's tasks without a project are never included |

Errors: `NOT_FOUND`, `FORBIDDEN`, `KEY_TAKEN`, `KEY_FORMAT`, `TITLE_REQUIRED`, `ASSIGNEE_ACCESS`, `STATUS_UNKNOWN`, `ARCHIVED`, `RESULT_REQUIRED`, `DEADLINE_LOCKED`, `PARENT_LOOP`, `NOT_DONE` (rating an open task), `SELF`, `NOT_ASSIGNEE` / `NOT_PENDING` (accepting).

A task in lists carries `acceptance: { state: 'pending'|'accepted'|'skipped', assignedAt, acceptedAt, acceptedBy, dueAt, overdue }` (null without an assignee), `order` and `orderFlag`; the full task also `acceptedByUser` and `can.accept`, `can.setOrder`. `PUT /tasks/:ref` takes `isOrder`, `POST /tasks` takes `isOrder`.
