# Employees

The registry of everyone who works for the company — with or without access to the portal (spec [platform-2.0](specs/platform-2.0.ru.md) §4). Module id `employees`, category **People**, **off by default**. It requires the core [org structure](org-structure.md) (units and sites) and lends it heads, explicit managers and headcount. A module package (docs/module-packages.md, `make module ID=employees`), not built into the core; other modules reach it through its `api.js` (the AD directory: the «AD» section of cards and the cards' AD logins).

- [Screens](#screens)
- [Permissions and visibility](#permissions-and-visibility)
- [Data model](#data-model)
- [Portal accounts](#portal-accounts)
- [Skills, clearances and reminders](#skills-clearances-and-reminders)
- [Import and export](#import-and-export)
- [Birthdays widget](#birthdays-widget)
- [Settings](#settings)
- [Hooks for other modules (the AD directory module)](#hooks-for-other-modules-the-ad-directory-module)
- [Employee picker](#employee-picker)
- [Moving Warehouse, Tasks, Masterplan to employees later](#moving-warehouse-tasks-masterplan-to-employees-later)
- [HTTP API](#http-api)
- [Demo data and tour](#demo-data-and-tour)
- [Tests](#tests)

## Screens

| URL | What |
|---|---|
| `/app/employees` | **Registry**: table or cards (remembered per device), search (name, position, e-mail, phone; HR also personnel number), filters — unit (with subunits), site, position, status; HR chips «Без доступа к порталу», «Допуск истекает» with counters; export CSV; pagination by 50 |
| `/app/employees/:id` | **Card**: photo, names, position, unit path, status, employment; tabs Overview · Skills and clearances · Documents · Portal account · extension tabs · History. HR edits everything, «Уволить», deletes; the person edits their own contacts |
| `/app/employees/chart` | **Org chart** with heads and headcount; a click opens the unit's people |
| `/app/employees/import` | **Import** from Excel / CSV with a check report |
| `/app/employees/positions` | Positions directory (`employees.admin`) |
| `/app/employees/settings` | Module settings for `employees.admin` (also Settings → Modules → Employees) |
| Dashboard | Widget «Дни рождения и годовщины» |

Code: `src/frontend/src/modules/employees/` (`EmployeesApp.jsx`, `EmpContext.jsx`, `pages/*`, `components/AccountPanel.jsx`, `SkillsPanel.jsx`, `DocumentsPanel.jsx`, `EmployeeForm.jsx`, `EmployeePicker.jsx`, `CelebrationsWidget.jsx`, `extensions.js`, `employees.css`); server `src/backend/modules/employees/`.

## Permissions and visibility

The server shapes every answer for the viewer (`logic.js → levelFor / shapeEmployee`); hidden fields are never sent.

| Level | Who | Sees |
|---|---|---|
| `view` | `employees.view` (or everyone signed in with «Справочник для всех») | working people only (status `active`, `vacation`): names, photo, position, unit, site, manager, status, work contacts |
| `self` | the person whose card is linked to their account | the directory part + own personal contacts, birth date, skills and clearances; may edit own phones, workplace and personal contacts — never HR fields |
| `hr` | `employees.hr` | everything: every status (terminated, candidates), personnel number, dates, employment type, personal data, HR notes, documents, clearances, the account, history; creates and edits cards; links accounts together with `users.manage` |
| — | `employees.admin` | positions directory and settings (combine with `employees.hr` for data) |

A card the viewer may not see answers `404`. Creating or blocking a portal account also needs `users.manage` (the Users rules apply: nobody grants more than they hold). Account changes from a «sign in as» session are refused.

## Data model

| Table | Content |
|---|---|
| `emp_positions` | `name` (unique, case-insensitive), `sort`, `archived_at` (a position in use is archived, not deleted) |
| `employees` | `last_name`, `first_name`, `middle_name`, `photo_key`, `position_id`, `unit_id` and `site_id` (→ `org_units`), `manager_id` (→ `employees`, loops refused), `personnel_no` (unique), `hire_date`, `termination_date`, `birth_date`, `status` `active`/`vacation`/`terminated`/`candidate`, `employment` `staff`/`part_time`/`contractor`/`seasonal`, `work_email`, `work_phone`, `work_mobile`, `work_location`, `personal_email`, `personal_phone`, `personal_address`, `emergency_contact`, `hr_notes`, **`user_id`** (unique, optional), **`ad_account`** (placeholder for the AD module), `created_by`, timestamps |
| `emp_skills` | `kind` `skill`/`clearance`, `name`, `number`, `level`, `issued_on`, `expires_on`, `note` |
| `emp_files` | documents of a card (`UPLOAD_DIR/employees/…`, served by the access-checked route with `nosniff` and a sandbox CSP, like other modules) |
| `emp_events` | history: `created`, `updated`, `status_<status>`, `imported`, `photo`, `skill_*`, `documents_added`, `document_removed`, `account_created/linked/unlinked/blocked/unblocked` |
| `emp_notices` | clearance reminders already sent (`clr:<skill>:<expires_on>:<days>`) |

Photos: PNG / JPEG / WebP ≤ 5 MB, checked by magic bytes; documents: images, PDF, Office, text ≤ 25 MB, 10 per upload.

## Portal accounts

The link is optional (a builder on a site has none). On the card → «Учётная запись»:

- **Создать пользователя** (`employees.hr` + `users.manage`): `POST /employees/:id/account { username, method, password?, email?, phone?, roleIds?, groupIds? }` calls the same `createUser()` as Users (password rules, unique contacts, «not more than you hold»), sets the display name from the card and links it. Sign-in methods: `password` (set now), `code` (one-time codes by e-mail / phone — one of them required), `directory` (no password; the first Active Directory sign-in with this login takes the account over). A phone copied from the card that is not a valid number is left out. If linking fails, the fresh account is deleted again.
- **Связать с существующим** (`employees.hr` + `users.manage`, and not an account with more access than yours — the card sets its unit and position, which decide its approvers): an account without a card (`PUT /employees/:id/account { userId }`); one card per account (`409 USER_LINKED`).
- **Отвязать** (the same rights): both stay.
- **Заблокировать / разблокировать** (`users.manage`).
- **Termination** (`POST /employees/:id/terminate { date, blockUser }`) sets the status and date; the dialog offers to block the linked account (checked by default). Setting the status to «Уволен» in the form answers `offerBlock: true` and the UI asks the same.

A linked account **follows the card**: its `org_unit_id` and `position_title` are synced on every change of unit or position, and Users → a person shows the employee (`GET /api/app/org/users/:id → placement.employee`). Account events go to the activity log (`employee_account`) and `user.created` webhooks.

## Skills, clearances and reminders

Clearances have a «valid until» date; the card and the registry show them as expired / expiring (≤ 30 days) / valid.

`employees:clearances` (every 30 min, under the scheduler's advisory lock, «today» in the portal zone): for every clearance of a working employee (or candidate) whose threshold of `clearanceWarnDays` (default 30, 7, 0) is reached, **one** notification `employees.clearance` goes to holders of `employees.hr`, the manager from the card (`notifyManager`) and the employee (`notifyEmployee`, when linked). Each threshold fires once per clearance and expiry date (`INSERT … ON CONFLICT DO NOTHING` in `emp_notices` decides); a clearance first seen late gets only the closest notice; a renewed date starts again; blocked accounts get nothing.

## Import and export

**Import** (`POST /employees/import { rows, dryRun, createPositions }`, HR): the browser reads `.xlsx` / `.csv` (exceljs, headers in Russian or English — «Фамилия», «Табельный номер», «Подразделение»…) and posts rows. The server validates every row and answers `{ ok, created, updated, errors: [{ row, field, code, message }], warnings, written }`. Units are matched by code, name or full path («Компания / Юг / Отдел продаж»; an ambiguous name is an error), statuses and employment types accept Russian words, dates `YYYY-MM-DD` or `DD.MM.YYYY`. A known personnel number updates that card (empty cells keep what it has); unknown positions are added with a warning (or refused without `createPositions`). Writing is all or nothing.

**Export** (`GET /employees/export.csv` with the registry filters): UTF-8 with BOM, `;`, formulas neutralised (a cell starting with `= + - @` gets a leading `'`); HR columns only for HR.

## Birthdays widget

`GET /widget/celebrations?days=14` → birthdays (day and month only) and work anniversaries (years since hire, from the first year) of working people, nearest first. The setting `birthdays` decides: `all` (everyone who sees the directory), `hr` (HR only), `off`; `anniversaries` switches the second list. Widget `employeesCelebrations` (dashboard catalog, module `employees`).

## Settings

`app_settings.modules.employees.settings` (sanitized by `sanitizeEmployees` in `modules/catalog.js`):

| Key | Default | |
|---|---|---|
| `everyoneCanView` | `false` | the directory for everyone signed in |
| `birthdays` | `'all'` | `all` / `hr` / `off` |
| `anniversaries` | `true` | |
| `clearanceWarnDays` | `[30, 7, 0]` | up to 5 values, 0–365 |
| `notifyEmployee`, `notifyManager` | `true` | who else gets clearance reminders |

Saved by `PUT /api/app/employees/settings` (`employees.admin`) or Settings → Modules.

## Hooks for other modules (the AD directory module)

The card is extensible without touching the module:

**Server** — `src/backend/modules/employees/extensions.js`:

```js
import { registerEmployeeExtension } from '../employees/extensions.js';

registerEmployeeExtension({
  id: 'ad',
  module: 'ad',                                   // hidden while that module is off
  visible: (rights, employee) => rights.hr,       // default: HR only
  load: async (req, employee, rights) => ({ account: employee.adAccount, enabled: true }),
});
```

`GET /employees/:id` then answers `extensions: { ad: {...} }` (5 s per extension; a failure is `{ error }` and never breaks the card).

**Browser** — `src/frontend/src/modules/employees/extensions.js`:

```js
import { lazy } from 'react';
import { registerEmployeeTab } from '../employees/extensions';

registerEmployeeTab({
  id: 'ad',                    // same id: the server data arrives as `data`
  labelKey: 'ad.employeeTab',
  order: 50,
  when: ({ employee, meta, data }) => Boolean(data),
  Component: lazy(() => import('../ad/EmployeeAdTab')),   // props { employee, data, reload, can }
});
```

Until the AD module exists, the card has the plain field «Учётная запись AD» (`employees.ad_account`), shown while the Active Directory integration is on (`meta.ad`). The AD module can read and write it, and use `PUT /employees/:id/account` to link the portal account it creates.

**Implemented by** the [AD directory](directory.md) module (`modules/directory/employeeSection.js`, `frontend/src/modules/directory/register.js` → `EmployeeAdTab`): the «Учётная запись AD» tab (HR) shows the account found by `ad_account` (sAMAccountName) or by the linked portal user's DN, «Create AD user for the employee» (the wizard pre-filled from the card; the new login is written to `ad_account`) and «Link an existing account».

## Employee picker

```jsx
import EmployeePicker from '../employees/EmployeePicker';

<EmployeePicker value={id} onChange={(id, employee) => …} />   // employee: { id, name, position, unit, userId, … }
<EmployeePicker multiple unitId={5} />                          // one unit and its subunits
<EmployeePicker withAccount />                                  // only people with a portal account
```

It searches the server as the person types and shows only what the viewer may see. Render it only while `settings.modules.employees.enabled`; otherwise keep the module's user picker (and a `<ModuleHint module="employees" … />`).

## Moving Warehouse, Tasks, Masterplan to employees later

They keep using portal accounts for now. To switch a «person» field to employees later:

1. Store `employee_id` next to the existing `user_id` (keep `user_id` for notifications and access — it is `employees.user_id` of the chosen card).
2. In the UI use `<EmployeePicker withAccount />` when the person must act in the portal (an assignee, a MOL), or without `withAccount` for people who only appear on paper (a recipient of tools on a site).
3. Read names and units through `GET /api/app/employees/employees/:id` (visibility applies) or, on the server, the `employees` table joined with `org_units`.
4. For «my unit» rules use `colleaguesOf()` / `descendants()` of the [org API](org-structure.md#core-api-for-modules), which already follow the employee cards.

## HTTP API

`/api/app/employees` (signed in, module on; tokens need the `employees` area):

| Method | Path | Purpose |
|---|---|---|
| GET | `/meta`, `/counters` | rights, settings, statuses, employment types, `ad`, `myEmployeeId`; chip counters |
| GET | `/employees` | registry: `q, unitId, subtree, siteId, positionId, status (…|all), employment, noAccess, expiring, sort, page, limit` → `{ items, total, page, limit }` |
| GET | `/employees/export.csv` | the same filters as CSV |
| POST | `/employees` | create (HR) |
| GET / PUT / DELETE | `/employees/:id` | card (`{ employee, can, history?, extensions }`), change (`{ employee, offerBlock }`), delete (HR) |
| POST | `/employees/:id/terminate` | `{ date, blockUser }` |
| GET / POST / DELETE | `/employees/:id/photo` | photo |
| POST | `/employees/:id/documents` | multipart `files[]`, `note` |
| GET / DELETE | `/files/:fileId[?download=1]` | a document (HR) |
| POST / PUT / DELETE | `/employees/:id/skills[/:skillId]` | skills and clearances (HR) |
| POST / PUT / DELETE | `/employees/:id/account` | create / link / unlink the portal account |
| POST | `/employees/:id/account/block` | `{ blocked }` |
| GET | `/employees/:id/account/suggest`, `/accounts/unlinked?q=` | login suggestion, accounts without a card |
| POST | `/employees/import` | `{ rows, dryRun, createPositions }` |
| GET / POST / PUT / DELETE | `/positions[/:id]` | positions directory |
| GET | `/widget/celebrations?days=` | birthdays and anniversaries |
| GET / PUT | `/settings` | module settings (`employees.admin`) |

## Demo data and tour

- `modules/employees/demo.js` (seeds the org demo first when needed): 25 people of «ООО «Пример»» — heads and office staff with demo accounts (they cannot sign in), site workers without portal access, a candidate, a person on vacation, a terminated one, a part-timer, a contractor and a seasonal worker; clearances expiring in 5, 7, 20 and 25 days and one expired; birthdays and anniversaries in the coming days; personnel numbers `DEMO-001…`. Purge deletes exactly the tracked rows; seeding twice does nothing.
- Tour `employees` (`modules/employees/tour.js`, texts `tour.employees.*` in `locales/<lang>/tour.js`): registry, filters, «Добавить сотрудника», export, org chart, import — steps without their button (no right) are skipped. Registered in `modules/employees/register.js`; auto-starts on the first visit to `/app/employees`.

## Tests

- `test/employees.test.js`: what each level sees, levels, input and date cleaning, CSV formula guard, import planning (units by code / path, ambiguous names, duplicates, new positions), clearance thresholds, birthdays and anniversaries, settings sanitizing, notification kind, login suggestion.
- `test/employees.db.test.js` (`EMPLOYEES_DB_TEST=1 ENV_FILE_PATH=…`): visibility (view vs HR vs self vs stranger), personnel number and manager loop checks, account create (users.manage, password, sync) / link / unlink, the card-managed unit of an account, explicit manager vs unit head in `managerOf`, termination with the block offer and blocking, import dry run and write, clearance reminders once per threshold, demo seed / purge idempotent.
- `test/people-tours.test.js`: tours and admin docs of both modules, translated permissions and texts.
