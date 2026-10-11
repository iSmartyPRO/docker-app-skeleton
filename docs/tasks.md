# Tasks (`/app/tasks`)

The second [module](modules.md): projects with their own workflows, a kanban board and a list view, personal "My tasks", deadlines, checklists, comments with @mentions, watchers, history and notifications.

## URLs

| URL | Page |
|-----|------|
| `/app/tasks` | **My tasks**: everything assigned to me, grouped into Overdue / Today / Tomorrow / Next 7 days / Later / No due date / Done recently |
| `/app/tasks/projects` | All projects I can see, with progress and archived ones on demand |
| `/app/tasks/HR` | Project **HR**: board or list, filters, quick add |
| `/app/tasks/HR-12` | Task **HR-12** opened in a side panel over its board (full screen on phones) |

Each project has a short **key** (2–10 Latin letters or digits). The key prefixes the task numbers and the links, e.g. `HR-12`. It is suggested from the project name and checked for availability as you type: Cyrillic and Kazakh names are transliterated, so «Отдел продаж» becomes `OP`. The key cannot change after the project is created, so links stay stable.

## Projects and access

| Level | Allows |
|-------|--------|
| **View** | See tasks, comment, follow |
| **Edit** | Create, edit, move and complete tasks |
| **Manage** | Edit, plus workflow, access, archive and deletion |

- Levels are granted per project to everyone, a user, a group or a role. The editor is the same one used by the Knowledge Base.
- When creating a project you pick a starting point:
  - **Everyone, can edit**;
  - **Everyone, read only**;
  - **Only me**.

  The creator always gets *manage*.
- **The assignee may work on their task** (status, checklist, fields) even with view-only access to the project.
- The `tasks.admin` permission gives *manage* on every project.
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

## Tasks

| Field | Notes |
|-------|-------|
| Title, description | Description in Markdown, rendered and sanitised |
| Status, priority | Priority: low, normal, high, urgent |
| Assignee | Any user with access to the project |
| Due | Date, or date and time. A date-only due is stored as the end of that day in the user's time zone |
| Start | Optional date |
| Labels | Free tags (up to 10), coloured consistently by name |
| Checklist | Items with progress shown on cards and in lists |
| Watchers | Author, assignee and commenters follow automatically; anyone can follow or unfollow |

- **Board:**
  - drag cards between and within columns with the mouse, a long press on touch screens, or the keyboard;
  - the order is stored as fractional ranks, re-spread automatically when they run out;
  - quick add at the bottom of each column.
- **List:** groups by status; check a box to complete a task.
- **Comments:**
  - type `@` to mention someone with access; they get a notification;
  - authors can edit or delete their own comments;
  - managers can delete any comment.
- **History:** every change is recorded with who and when, e.g. status A → B, assignee, priority, due date, title, description, labels.

## Notifications

All go through the [notification center](notifications.md), so they reach the bell, push, email, Telegram and Mattermost according to each person's preferences. Your own actions never notify you.

| Event | Who |
|-------|-----|
| Task assigned | The new assignee |
| Status changed | Watchers, assignee and author |
| Comment | Watchers, assignee and author (mentioned people get a "mentioned you" instead) |
| Priority raised to urgent | Assignee |
| Due within N hours (default 24) | Assignee, once per due date |
| Overdue | Assignee and author, once |

Moving the due date re-arms both reminders. The reminder job runs every 5 minutes in the [scheduler](notifications.md#scheduler).

## Settings (Admin → Settings → Modules → Tasks)

| Setting | Default |
|---------|---------|
| Enabled | on |
| Who creates projects | everyone (`everyone` \| `admins`) |
| Default view | board |
| Deadline reminders / hours before | on / 24 (1–168) |

## API (`/api/app/tasks`, signed-in users)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Projects with counters, my totals, module config |
| GET | `/projects[?archived=1]` | Visible projects |
| GET | `/projects/key?from=` or `?key=` | Suggest a key from a name / check one |
| POST | `/projects` | `{ name, key?, description, color, icon, visibility }` |
| GET / PUT / DELETE | `/projects/:key` | Project with statuses, members and labels / update (`archived`) / delete |
| PUT | `/projects/:key/statuses` | Replace the workflow |
| GET / PUT | `/projects/:key/access` | Access list |
| GET | `/tasks` | Filters: `project`, `assignee` (`me`, `none`, id), `status`, `priority`, `label`, `q` (text or `KEY-12`), `open=1`, `dueFrom`, `dueTo`, `doneSince`, `sort` |
| POST | `/tasks` | Create a task (`projectId` = key or id, optional `checklist[]`, `position: 'top'`) |
| GET / PUT / DELETE | `/tasks/:ref` | `ref` = `KEY-12` or id. `PUT` is partial; `complete: true` moves the task to the first *done* status; `move: { beforeId, afterId }` positions it on the board |
| PUT | `/tasks/:ref/watch` | `{ on }` |
| POST / PUT / DELETE | `/tasks/:ref/checklist`, `/checklist/:id`, `/tasks/:ref/checklist/order` | Checklist |
| POST / PUT / DELETE | `/tasks/:ref/comments`, `/comments/:id` | Comments |
| GET | `/calendar?from&to&mine=1` | Tasks due in a range (used by the Calendar) |

Errors: `NOT_FOUND`, `FORBIDDEN`, `KEY_TAKEN`, `KEY_FORMAT`, `TITLE_REQUIRED`, `ASSIGNEE_ACCESS`, `STATUS_UNKNOWN`, `ARCHIVED`.
