# Org structure

The company's map in the portal (spec [platform-2.0](specs/platform-2.0.ru.md) §3): the legal entity, the head office, branches, departments and sites, with heads, purposes and time zones. It is a **core service** — always on, like Approvals — so modules can rely on it, and it works **without** the Employees module.

- [What it gives](#what-it-gives)
- [Data model](#data-model)
- [Core API for modules](#core-api-for-modules)
- [managerOf rules](#managerof-rules)
- [People without the Employees module](#people-without-the-employees-module)
- [Approvals: «head of the author's unit»](#approvals-head-of-the-authors-unit)
- [HTTP API](#http-api)
- [Permissions](#permissions)
- [Settings screen](#settings-screen)
- [Demo data and tour](#demo-data-and-tour)
- [Tests](#tests)

## What it gives

| Piece | Where |
|---|---|
| Tree editor with drag and drop, details panel, history, «Undo» after a move | Settings → **Org structure** (`/admin/settings/org`), tab «Структура» |
| Org chart (heads, headcount; chart or list, zoom, phone layout) | tab «Оргсхема»; also `/app/employees/chart` |
| Unit types (name, icon, colour, «legal entity», «site») and purposes | tab «Типы и назначения» |
| The unit and position of an account | Users → a person → «Оргструктура»; the unit card → «Люди подразделения» |
| `orgUnits()`, `unitOf()`, `managerOf()`, `descendants()`, `unitsByPurpose()`, `colleaguesOf()` | `src/backend/modules/org/api.js` |
| Approver kind «Руководитель подразделения автора» | Approvals route builder |
| Pickers for other modules | `modules/org/UnitSelect.jsx`, `modules/org/OrgChart.jsx` |

Default unit types: **Компания** (links to a legal entity of Settings → Legal entities), **Центральный офис**, **Филиал / Представительство**, **Департамент / Отдел / Группа**, **Объект / Площадка** (`site: true` — offered as an employee's site). Default purposes: `warehouse`, `construction`, `sales`, `production`, `office`. Both lists are settings (`app_settings.modules.org.settings`, sanitized by `sanitizeOrg` in `modules/catalog.js`); an empty label shows the translated stock name (`org.types.<key>`, `org.purposes.<key>`). A type used by a unit cannot be removed (`409 TYPE_IN_USE`).

## Data model

| Table / column | Content |
|---|---|
| `org_units` | `id`, `parent_id` (→ `org_units`, `ON DELETE RESTRICT`), `type`, `name`, `code` (unique, case-insensitive), `legal_entity_id` (→ `legal_entities`), `head_user_id` (→ `users`) or `head_employee_id` (an employee card, Employees module), `address`, `time_zone` (IANA; empty = inherited), `status` `active`/`closed`, `closed_at`, `purposes TEXT[]` (GIN index), `note`, `sort`, `created_by`, timestamps |
| `org_unit_events` | history per unit: `created`, `updated` (with `changes: { field: { from, to } }`), `moved`, `reordered`, `closed`, `reopened`, `deleted`; `actor_id`, `data` |
| `users.org_unit_id`, `users.position_title` | the light «подразделение / должность» of a portal account. With the Employees module on, a linked card keeps them in sync |

Rules enforced by the service (`modules/org/service.js`, pure parts in `logic.js`):

- no loops: a unit cannot move under itself or one of its descendants (`409 ORG_CYCLE`; the move takes an advisory lock on the tree);
- a move takes `{ parentId, index }` and renumbers the new siblings (`sort` 10, 20, …);
- moves and deletions also go to the activity log (`security_events.kind = 'org_structure'`);
- only an empty unit (no subunits, no accounts, no employees) can be deleted (`409 UNIT_IN_USE` with counts) — otherwise close it;
- the effective time zone is the unit's own, else the nearest ancestor's, else the portal's (Settings → General);
- a unit type without `legal` drops the legal entity link.

## Core API for modules

Import only `src/backend/modules/org/api.js`:

```js
import { orgUnits, unitOf, managerOf, descendants, unitsByPurpose, colleaguesOf, ancestors } from '../org/api.js';

await orgUnits();                                // active units, flat: [{ id, parentId, type, name, code, status, purposes, path: ['…', '…'], … }]
await orgUnits({ includeClosed: true, tree: true }); // nested: [{ …unit, children }]
await unitOf({ userId: 7 });                     // the account's unit (users.org_unit_id) | null
await unitOf({ employeeId: 12 });                // the employee's unit (Employees on) | null
await managerOf(7);                              // user id of the person's manager | null
await managerOf(7, { level: 2 });                // the manager's manager
await managerOf(7, { detail: true });            // { userId, unitId, explicit }
await descendants(3);                            // unit ids below 3; { includeSelf: true } adds 3
await unitsByPurpose('warehouse');               // active units with that purpose
await colleaguesOf(7, { subtree: true });        // account ids in the same unit (and below) — «моё подразделение»
```

«Моё подразделение» visibility for a module: `colleaguesOf(req.user.id, { subtree: true })` gives the account ids whose records the person may see; or compare `unitOf(...)` with `descendants(...)` of the viewer's unit.

The browser side: `useOrg()` (cached units + meta) and `orgApi` in `modules/org/api.js`, `<UnitSelect value onChange purpose types multiple />`, `<OrgChart tree meta onSelect />`.

## managerOf rules

1. **Explicit manager** — when the Employees module is on and the person's employee card names a manager who has an active portal account, that account.
2. Otherwise the **head of the person's unit**.
3. When the person **is** that head, or the unit has no head, or the head's account is blocked / inactive, the head of the **parent** unit — and so on up to the root.
4. A head is `head_user_id`, or `head_employee_id` through the employee's portal account (Employees on; an employee head without an account is skipped).
5. `null` when nobody fits; the caller decides the fallback.

The walk is a pure function (`walkManager` in `logic.js`) and is unit-tested.

## People without the Employees module

The core never needs employee cards. Every portal account has an optional unit and position (`users.org_unit_id`, `users.position_title`), set:

- in Users → a person → «Оргструктура» (`users.manage` or `org.manage`);
- in the unit card → «Люди подразделения» (place / remove);
- by `PUT /api/app/org/users/:id { unitId, position }`.

With the Employees module on, an account linked to an employee card **follows the card**: the card's unit and position are copied to the account on every change, and the account's own field is read-only (`409 MANAGED_BY_EMPLOYEE`).

The Employees module lends the core what only it knows through one provider (`modules/org/providers.js`, registered in `modules/employees/index.js`): employee heads' accounts, explicit managers, headcount, employee names for the chart and the head picker. While the module is off the provider is ignored.

## Approvals: «head of the author's unit»

A route stage may have the approver `{ kind: 'manager', level: 1 }` («Руководитель подразделения автора») or `level: 2` («Вышестоящий руководитель»). See [approvals.md → Manager of the author](approvals.md#manager-of-the-author).

## HTTP API

`/api/app/org` (signed in; API tokens need the `org` area):

| Method | Path | Purpose |
|---|---|---|
| GET | `/meta` | types, purposes, `canManage`, `canAssign`, `portalTimeZone`, legal entities (for managers) |
| GET | `/units[?closed=0]` | flat list with `path`, `depth`, `effectiveTimeZone`, `timeZoneInherited`, `head { kind, id, name, avatarUrl, position }`, `legalEntity`, `counts { children, users, employees }` |
| GET | `/chart[?closed=1]` | nested tree with `total` (people in the subtree) |
| GET | `/units/:id`, `/units/:id/history`, `/units/:id/members[?subtree=1]` | one unit, its history, its accounts |
| POST | `/units` | create (`org.manage`) |
| PUT | `/units/:id` | change (partial; `org.manage`) |
| POST | `/units/:id/move` | `{ parentId, index }` (`org.manage`) |
| DELETE | `/units/:id` | delete an empty unit (`org.manage`) |
| PUT | `/settings` | `{ types, purposes }` (`org.manage`) |
| GET | `/people[?q=]` | accounts (and employees, when the module is on) for pickers |
| GET / PUT | `/users/:id` | the unit and position of an account (`users.view` / `users.manage` or `org.manage`; anyone for themselves to read) |
| GET | `/manager/:userId[?level=2]` | who is the person's manager now |

## Permissions

| Who | May |
|---|---|
| Anyone signed in | read the structure and the chart |
| `org.manage` | edit units, move them, types and purposes, place accounts |
| `users.manage` | place accounts in units (Users page) |

The settings screen is listed under Settings → Project for holders of `org.manage` (and read-only with `settings.view`).

## Settings screen

`src/frontend/src/modules/org/`: `OrgSettings.jsx` (tabs), `OrgStructure.jsx` (antd `Tree` with `draggable`, search, «closed» switch, details panel / drawer on phones, undo), `UnitForm.jsx`, `HeadSelect.jsx`, `UnitMembers.jsx`, `TypesEditor.jsx`, `OrgChart.jsx` (CSS connectors, zoom, list mode below 640 px), `UserPlacement.jsx` (Users page), `org.css` (theme tokens only).

## Demo data and tour

- `modules/org/demo.js`: «ООО «Пример»» (linked to a demo legal entity) → central office with Finance, HR, IT, Procurement; branches «Север» (sales, site «Северный квартал» with `construction` + `warehouse`) and «Юг» (sales, yard «Южная» with `warehouse` + `production`); heads are demo colleagues placed in their units. A code a real unit already uses is dropped instead of failing. Purge removes units newest first (children before parents).
- Tour `org` (`modules/org/tour.js`, texts `tour.org.*` in `locales/<lang>/tour.js`), started by the «Тур» button of the settings screen; registered in `modules/people/tours.js`.

## Tests

- `test/org.test.js`: tree helpers, loops, sibling order, time zone inheritance, the managerOf walk, input cleaning, settings sanitizing, manifest; the approvals manager kind and seat planning.
- `test/org.db.test.js` (`ORG_DB_TEST=1 ENV_FILE_PATH=…`): create / move / loops refused / history / delete only empty; managerOf (head, head's head, level 2, blocked head skipped, no unit); the manager stage of a route, the head's own document, the fallback with a history note, escalation people as the fallback, preview with a sample author.
