# Dashboard

`/app/dashboard` — a personal page of widgets over the other modules: tasks, meetings, files, links, companies and figures. It can be the site's home page (**Settings → Site access → Home page**).

## For people

- **Starting set.** Until someone arranges their own, they see the starting layout: greeting, quick access, my tasks, agenda, task statistics and dynamics, notifications, month, online resources, knowledge base, recent files, file server, companies, and for administrators users/sign-ins and file server activity. Widgets of modules that are off, or that the person may not use, are left out and the grid closes the gaps.
- **Customize** turns on edit mode: drag a widget by its header, pull the bottom-right corner to resize (snaps to the 12-column grid; the size shows while dragging), ⚙ for settings, ⋯ for size presets (small, medium, large, wide, full width), duplicate, open the module, remove (with undo). Everything is saved automatically.
- **Add widget** opens a gallery by category with search and previews. The same widget can be added several times with different settings (for example tasks of two projects).
- **Settings** of each widget: an own title plus its filters — whose tasks, project, deadline, order, how many; period; chart type; calendars; link category; clock cities and format; note colour and so on.
- **Reset** returns the starting set.
- Layout: 12 columns on wide screens, 6 on tablets, one column on phones.

## Widgets

| Widget | Module | Shows |
|--------|--------|-------|
| Greeting | — | Time-of-day greeting, today's tasks and events, overdue and unread counts, the next meeting with a countdown and a *Join* button 15 minutes before |
| Quick access | — | Enabled modules as tiles (choose which) |
| Notifications | — | Latest notifications, unread marks, *Read all* |
| My tasks | Tasks | Open tasks with deadlines, priority and checklist progress; complete in one click; quick entry of a new task |
| Task statistics | Tasks | Open, overdue, done in the period, on-time rate; donut by status or bars by priority / project |
| Task dynamics | Tasks | Created vs completed per day (area, lines or columns) |
| Agenda | Calendar | Meetings and task deadlines by day; *Now* mark and *Join* for online meetings |
| Month | Calendar | Month grid with busy days; events of the chosen day |
| Recent files | Files | Latest files and used space |
| File server | File server | Folders with their state, recent or favourite files |
| File server activity | File server, `drive.audit` | Views, downloads, changes, deletions per day; most active people |
| Knowledge base | Knowledge base | Recently updated documents |
| Online resources | Online resources | Links as tiles or a list, by category, in the person's own order |
| Companies | Companies | Totals, new this month, contacts, average rating, growth over 6 months, countries, relations, newest |
| Users and sign-ins | `users.view` | Accounts, active in 30 days, new, sign-ins and failed sign-ins per day |
| World clock | — | Local time (digital or analog) and up to 6 cities with the difference |
| Note | — | A sticky note, saved as you type |

Every widget reads through the owning module with the person's own rights, so it never shows more than the module would. Data refreshes every few minutes and when the tab comes back; day boundaries follow the browser's time zone.

## For administrators

Settings → **Dashboard**: on/off, page title, *Personal dashboards* (off: everyone sees the starting layout and cannot change it).

Permission `dashboard.admin` (super administrators always): on the dashboard, **Customize → Administration → Make it the starting layout** saves the current arrangement as the starting set for everyone without their own; *Back to the built-in starting layout* undoes it.

## Technical notes

- Tables: `dash_layouts` (per person: widgets with type, size, settings, in order) and `dash_default` (one row, the administrator's starting layout). Without either the built-in layout in `modules/dashboard/widgets.js` is used.
- Widgets of modules switched off are kept in a saved layout and come back with the module. The server keeps every widget type it does not know right now too (a module that failed to register, a package not loaded yet): `cleanLayout` checks only the type's shape, the size and the settings' size, and the routes show and offer only `availableTypes()`. A save (`PUT /layout` and `PUT /default`) keeps the stored widgets whose types are not available to the person saving right now (`mergeParked`): the browser only sends the widgets it shows, so a starting layout saved while a package is not installed still holds that package's widgets.
- An API token reads a widget only with the scope of its module (`notifications` for notifications, `admin.users` for people); the welcome widget and the agenda leave out the parts the token may not read.
- API (`/api/app/dashboard`): `GET /` (layout, available widgets, rights), `PUT /layout`, `DELETE /layout`, `PUT|DELETE /default` (`dashboard.admin`), `GET /options` (projects, calendars, link categories), `GET /data/:type?settings=<json>&tz=<zone>` (widget data; `miniCalendar` also takes `from`, `to`).
- Charts are small SVG components (`platform/widgets/charts.jsx`, shared with module widgets and the developer console); no chart library.
- Module widgets are registered by their modules (backend `ctx.registerWidget` with the data provider, frontend `registerWidget` in `modules/<id>/register.js`); the dashboard imports no module.
- Adding a widget: an entry in `WIDGETS` (backend, with its module and permission), a provider in `data.js` if it needs data, and an entry in the frontend `catalog.js` with the component, sizes, preview and settings fields.
