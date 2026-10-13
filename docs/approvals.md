# Approvals and «Ждёт меня»

Approvals are a **core service**: always on, used by modules such as Procurement and Contracts (spec: [specs/business-processes.ru.md](specs/business-processes.ru.md), §4). A module registers a document type and starts processes. People decide on the **«Ждёт меня»** page (`/app/approvals`, short address `/inbox`), in the dashboard widget, and in the module's own card through `<ApprovalActions />`.

- [Concepts](#concepts)
- [Architecture](#architecture)
- [Module API](#module-api)
- [Inbox providers](#inbox-providers)
- [Frontend components](#frontend-components)
- [Data model](#data-model)
- [Permissions](#permissions)
- [SLA: deadlines, reminders, escalation](#sla-deadlines-reminders-escalation)
- [Notifications and webhooks](#notifications-and-webhooks)
- [HTTP API](#http-api)
- [Tests](#tests)

## Concepts

| Term | Meaning |
|------|---------|
| **Route** | One per document type: ordered **stages**, `restartFrom` (`first` / `current`) and escalation people. Edited in the route builder. |
| **Stage** | Name, approvers, mode `all` or `any`, and **conditions** on document fields. A stage whose conditions fail is skipped. |
| **Approver (seat)** | A person, a role or a group (`permission` is used internally for defaults, e.g. "any `procurement.admin`"). A role or group is **one seat**: any of its members decides for it. `all` = every seat must approve; `any` = the first approval closes the stage. |
| **Process** | The route applied to one document (`type` + `docId`). A new start after a finish is a new **round** of the same row. |
| **Substitute** | "From … to … X decides my approvals" (calendar days, portal zone). The substitute sees and decides the person's seats; history records `on behalf of`. |

"Author's manager" is **not supported**: the portal has no manager relation between people. Use a role or group per department instead (noted for v2).

Statuses passed to modules: `pending` (на согласовании) · `question` (нужен ответ) · `approved` · `rejected` · `returned` (на доработке) · `withdrawn`.

| Decision | Effect |
|----------|--------|
| approve | The person's open seats on the current stage are approved; the stage closes per its mode; after the last stage → `approved`. |
| reject | Comment required → `rejected` (final). |
| question | Text required; `to` = the author by default or any person → `question`. The **stage deadline pauses**. An answer (by the asked person, the author or a manager) returns the process to `pending` on the **same stage**, the deadline moved by the waiting time. |
| return | Comment required → `returned`. The author edits and calls `restart` → a new round from the first stage, or from the stage that returned it (`restartFrom: 'current'`). |
| delegate | `to` required: the person's seats now belong to `to` only. |
| withdraw | The author (or a manager) while `pending` / `question` / `returned` → `withdrawn`. |

A person eligible for several seats of one stage (e.g. by name and by role) decides all of them at once.

## Architecture

```
src/backend/services/inbox.js          registerInboxProvider / inboxFor / inboxAct (generic, any module)
src/backend/modules/approvals/
  api.js          public API for modules (import only this)
  registry.js     registerApprovalType, the type registry (in memory)
  engine.js       start / decide / answer / withdraw / restart, reading, lists, routes
  logic.js        pure: route cleaning, conditions, stage closing, SLA arithmetic (unit-tested)
  people.js       who may decide a seat (roles, groups, substitutes, delegation), recipients
  sla.js          approvals:sla job (reminders, escalation)
  substitutes.js  substitute periods
  messages.js     notification texts (ru / en)
  routes.js       /api/app/approvals
  schema.js       tables + job registration
  index.js        module descriptor + the 'approvals' inbox provider
src/frontend/src/modules/approvals/
  ApprovalsApp.jsx, InboxPage.jsx         /app/approvals, /app/approvals/settings
  ApprovalPath.jsx, ApprovalActions.jsx   reusable in module cards
  InboxButton.jsx, InboxWidget.jsx        header entry with counter, dashboard widget
  settings/RouteBuilder.jsx, UrgencyEditor.jsx, SubstitutesPanel.jsx, ApprovalsAdmin.jsx
  MySubstitute.jsx                        /account/substitute
```

It is a module of the platform (`modules/catalog.js`: `core: true`) so it gets the usual pieces for free — `/api/app/approvals`, the API token area `approvals`, the permission group, settings in `app_settings.modules.approvals.settings` — while it can never be switched off (`resolveModules` forces `enabled`, Settings → Modules shows *Always on*). It is first in `MODULES` so its tables exist before modules that use it.

**Atomicity.** Every change runs in one transaction that locks the process row (`SELECT … FOR UPDATE`) and the stage's seats. Two people pressing *Approve* together: one counts, the other gets `409` (`NOT_PENDING`, `STALE`, `ALREADY_DECIDED`). Decisions may carry the `round` and `stage` the person saw; a mismatch is `409 STALE`. The module's `onStatus` runs **inside** that transaction (see below); notifications and webhooks run after the commit.

## Module API

```js
import {
  registerApprovalType, startApproval, withdraw, restart, decide, answer,
  getProcess, refreshApproval, isParticipant,
} from '../approvals/api.js';
```

`ctx` everywhere is a request-like object: the Express `req` (it has `user` and `access`), or `requestAs(userId)` from `api/events.js` in jobs. `{ system: true, user: { id } }` skips the checks (use sparingly).

### `registerApprovalType(definition) → unregister()`

Call at import time of the module (e.g. in its `index.js`).

```js
registerApprovalType({
  key: 'procurement.request',                     // '<module>.<doc>', unique
  module: 'procurement',                          // module id: hidden while the module is off
  title: { ru: 'Заявка на закупку', en: 'Purchase request' },
  fields: [                                       // what route conditions may test
    { key: 'amount', type: 'money', label: { ru: 'Сумма', en: 'Amount' } },
    { key: 'category', type: 'select', label: { ru: 'Категория', en: 'Category' }, options: async (ctx) => [{ value: 3, label: 'Оборудование' }] },
    { key: 'project', type: 'ref', label: { ru: 'Проект', en: 'Project' }, options: [{ value: 12, label: 'Ала-Тоо' }] },
    { key: 'legalEntity', type: 'select', label: { ru: 'Юрлицо', en: 'Legal entity' }, options: [...] },
  ],
  canView: async (ctx, docId) => boolean,         // module access check (approvers see it anyway)
  load: async (docId) => ({                       // summary; null = not found
    title: 'Ноутбуки', number: 'ЗК-0001', amount: 5000, currency: 'USD',
    urgency: 'urgent',                            // optional default urgency
    author: { id: 11 },                           // the author (default: who starts it)
    dueAt: null,                                  // the document's own deadline, optional
    url: '/app/procurement/requests/1',           // where «Открыть» leads
    fields: { category: 3, project: 12, legalEntity: 1 },  // condition values (amount/currency come from above)
  }),
  onStatus: async (docId, status, info) => {      // inside the decision's transaction
    // info: { client, action, actorId, comment, to, process }
    await info.client.query('UPDATE proc_requests SET status = $2 WHERE id = $1', [docId, map[status]]);
    // throw to abort the decision
  },
  defaultRoute: {                                 // optional: until an administrator saves one
    stages: [{ id: 'director', name: 'Директор', mode: 'any', approvers: [{ kind: 'role', id: directorRoleId }] }],
  },
  adminPermission: 'procurement.admin',           // default '<module>.admin': edits the route, gets escalations
});
```

Field types: `money` (number, conditions may name a currency — then a document in another currency does not match), `number`, `select`, `ref`, `text`, `bool`. Operators: `gt gte lt lte eq neq in nin empty filled`. Without a saved route and without `defaultRoute` the route is one stage "any holder of `adminPermission`".

### Functions

| Signature | Returns / notes |
|-----------|-----------------|
| `startApproval(ctx, type, docId, { urgency?, comment? })` | The process view. Plans the route against `load()`; no applicable stage → approved at once. `409 ALREADY_RUNNING` while pending / question; `409 NOT_RESTART` over a returned process (send it again with `restart`, which checks the author). An approved, rejected or withdrawn process starts a new round. Needs `canView` (or a manager); the module's `onStatus` may refuse more (e.g. only the document's people send it, readiness — also for a route where no stage applies and the start approves at once). |
| `withdraw(ctx, type, docId, { comment? })` | Author or manager; from pending / question / returned. |
| `restart(ctx, type, docId, { urgency?, comment? })` | After `returned`; re-plans (the document may have changed). |
| `decide(ctx, processId \| { type, docId }, { action, comment?, to?, round?, stage? })` | `action`: `approve` / `reject` / `question` / `return` / `delegate`. |
| `answer(ctx, processId \| { type, docId }, { comment })` | Answer to the open question. |
| `getProcess(type, docId, ctx?)` | `null` if never sent; else the view below. No access check — check before exposing it. |
| `refreshApproval(type, docId, { actorId? })` | Re-reads title, number, amount, link after the document was edited (the inbox shows a cached copy). While the process runs it also **re-plans** the stages not reached yet (see below). |
| `isParticipant(ctx, type, docId)` | Author, approver (now or before, incl. substitutes), question target, delegate — use it in the module's own visibility rule ("those where they are approvers"). |

<a id="replanning"></a>**Re-planning.** A document edited during approval (a lawyer correcting a contract, an author changing the amount while answering a question) must not slip past a conditional stage. `refreshApproval` plans the route (the current one) against the new field values: the stages up to the current one stay as they were reached; the rest become the planned stages not reached yet, in route order — a stage whose condition now holds is added after the current stage, a stage nobody reached whose condition no longer holds is dropped. A change is logged as the history event `replanned` (`data: { added, removed }`). Modules call it after every edit of a document in approval (Procurement, Contracts), so normal work needs no extra step.

Process view (`getProcess`, `GET /process/:type/:docId`):

```js
{ id, type, typeTitle, module, docId, status, round, urgency, urgencyLevel: { key, label, color, hours, icon },
  title, number, amount, currency, url, author: { id, name, avatarUrl },
  startedAt, finishedAt, currentStage, stageStartedAt, dueAt, overdue, sla: { state: 'ok'|'soon'|'overdue'|'none', dueAt },
  question: { text, by, to, at } | null,
  stages: [{ index, id, name, mode, state: 'done'|'current'|'question'|'upcoming'|'rejected'|'returned'|'withdrawn',
             startedAt, finishedAt, approvers: [{ seatId, kind, id, name, avatarUrl, decision, decidedBy, onBehalfOf,
             delegatedTo, decidedAt, comment, responseMs }] }],
  skipped: [{ id, name }], history: [{ action, actor, onBehalfOf, target, comment, at, round, stage, stageName }],
  my: { isAuthor, canDecide, seatIds, canAnswer, canWithdraw, canRestart, canStart, canManage } }
```

## Inbox providers

`src/backend/services/inbox.js` collects «Ждёт меня» from any module:

```js
import { registerInboxProvider } from '../../services/inbox.js';

registerInboxProvider('tasks.acceptance', async (ctx) => items, { module: 'tasks', act: async (ctx, id, action, payload) => {} });
```

- `ctx` = `{ user, req, access, apiLimits, apiToken }`. From the HTTP route `req` is the request (an API token's scope and limits apply); from other callers `req` may be null — build a context with `requestAs(user.id)`.
- `module`: the provider is skipped while that module is off. Each provider has 5 s; a failing one is logged and listed in `failed`, the others still show.
- `act` (optional) handles inline actions: `POST /api/app/approvals/inbox/act { provider, id, action, comment, to }`. Alternatively an item may carry `meta.acceptPath` (`/api/app/…`): the page POSTs it for the `accept` action with `{ comment? }` (Tasks does this).
- `inboxFor(ctx, { module? }) → { items, failed }`, sorted: overdue first, then urgency (configured levels; `urgencyRank` overrides), then the nearest `dueAt`, items without a deadline last.

Item shape:

```js
{
  key: 'tasks:42',            // unique in the inbox (default '<provider>:<id>')
  module: 'tasks',            // module id: filter chip, icon
  kind: 'acceptance',         // approvals use 'approval' | 'question' | 'returned'
  id: 42,
  title: 'Проверить смету',
  number: 'ORD-5',            // optional
  amount: 5000, currency: 'USD',   // optional
  urgency: 'urgent',          // urgency level key, optional
  author: { id, name, avatarUrl },  // optional
  dueAt: '2026-10-14T09:00:00Z',    // optional; red when overdue, yellow when soon
  overdue: false,             // computed from dueAt when omitted
  url: '/app/tasks/ORD-5',    // «Открыть»
  actions: ['accept', 'open'],      // approvals: ['approve','question','reject','return','delegate'] / ['answer'] / ['restart']
  meta: { … },                // free-form; approvals put type, docId, processId, round, stage, stageName, question…
}
```

The page groups items into **Просрочено / Сегодня** (the person's zone) **/ Остальные** and shows *Approve*, *Question* (popover with text and target), *Answer*, *Accept*, *Open*. Only approval items can be selected for bulk approval.

## Frontend components

```jsx
import ApprovalPath, { useApprovalProcess } from '../approvals/ApprovalPath';
import ApprovalActions from '../approvals/ApprovalActions';

const { process, setProcess } = useApprovalProcess('procurement.request', id);
<ApprovalPath process={process} />                 // or <ApprovalPath type="procurement.request" docId={id} />
<ApprovalActions type="procurement.request" docId={id} process={process} onChange={setProcess} allowStart />
```

- `ApprovalPath`: status, urgency, round, skipped stages; the strip with avatars, ticks (✓ ✕ ↩), response times, the current stage pulsing in its SLA colour, the deadline. Vertical on phones.
- `ApprovalActions`: what the viewer may do (`process.my`): approve / question / more (return, delegate, reject with required comment), answer an open question, withdraw, send again; with `allowStart` an urgency picker and *Send to approval*.
- After any decision the components fire `window` event `approvals:changed`; the header counter, the page and the widget refresh.
- Dates use `lib/datetime` (`fmtSmart`, `fmtDateTime`); money uses `formatMoney` in `modules/approvals/lib.js`.

## Data model

| Table | Content |
|-------|---------|
| `approval_routes` | `type` (unique), `name`, `stages` JSONB `[{ id, name, mode, approvers: [{kind, id\|key}], conditions: [{field, op, value, currency?}] }]`, `restart_from`, `escalate_to` JSONB, `updated_by` |
| `approval_processes` | one row per `(type, doc_id)`: `round`, `status`, `stages` (snapshot of the planned stages — editing a route never changes running processes), `skipped`, `restart_from`, `escalate_to`, `current_stage`, `urgency`, `author_id`, cached summary (`title`, `number`, `amount`, `currency`, `url`, `doc_due_at`), `started_at`, `stage_started_at`, `due_at`, `remind_at`, `reminded_at`, `escalated_at`, `paused_at`, `question_to`, `question_by`, `finished_at` |
| `approval_seats` | the approvers of each activated stage of each round: `kind`, `ref_id` / `ref_key`, `delegated_to/by`, `decision`, `decided_by`, `on_behalf_of`, `decided_at`, `comment`, `activated_at` (response time = `decided_at − activated_at`) |
| `approval_events` | history: `started`, `approve`, `reject`, `return`, `question`, `answer`, `delegate`, `withdraw`, `restart`, `stage_done`, `approved`, `reminder`, `escalated` |
| `approval_substitutes` | `user_id`, `substitute_id`, `starts_on`, `ends_on` (DATE, inclusive), `note`, `created_by` |

Settings (`app_settings.modules.approvals.settings`, sanitized by `sanitizeApprovals` in `modules/catalog.js`):

| Key | Default |
|-----|---------|
| `urgencies` | `[{ key: 'critical', hours: 4, color, icon: 'flame' }, { key: 'urgent', hours: 24, … 'bolt' }, { key: 'normal', hours: 72, … 'clock' }]` — ordered from the most urgent; empty `label` = translated stock name; up to 8 levels |
| `defaultUrgency` | `normal` |
| `soonHours` | 24 — a deadline closer than this is yellow |
| `reminderPercent` | 75 — the reminder after this share of the reaction time |
| `escalation` | `true` |

## Permissions

| Who | May |
|-----|-----|
| Anyone signed in | Their inbox, their documents, decide their seats (and those of the people they substitute), answer questions addressed to them, set their own substitute |
| Author | Withdraw, send again, answer questions on their document |
| `approvals.admin` | Every route, urgency levels and SLA settings, everyone's substitutes; sees and manages every process |
| `<module>.admin` (the type's `adminPermission`) | The routes of that module's types, manage its processes; default escalation target |

A process is visible to its participants (a substitute of the person a question is addressed to included), to managers and to whoever the module's `canView` allows; otherwise `404`. API tokens need the `approvals` area **and** the area of the document's module: `read` to see its processes (inbox, `/mine`, `/decided`, process views), `write` to decide, answer, start, withdraw or send again (`403 SCOPE_DENIED`); session users are not affected. Decisions, answers, starts and restarts of a type whose module is switched off are refused (`404 MODULE_DISABLED`), as its items are hidden from the inbox.

## SLA: deadlines, reminders, escalation

- A stage's reaction time = the hours of the process urgency (working hours are not counted yet). `due_at` and `remind_at` are set when the stage opens; a question pauses them, the answer shifts both.
- `approvals:sla` (every minute, under the scheduler's advisory lock): `UPDATE … SET reminded_at = now() WHERE reminded_at IS NULL AND remind_at <= now() … RETURNING` → reminder to the open seats' people; `UPDATE … SET escalated_at … WHERE due_at <= now()` → "overdue" to them and the escalation notice to the route's `escalateTo` (default: holders of the type's `adminPermission`). The markers are set by the same statement that selects, so nothing is sent twice; a new stage resets them.
- Overdue rows are red everywhere (inbox, path strip, widget, header counter).

## Notifications and webhooks

Notification kinds (group *Approvals* in the preferences, `services/notificationCatalog.js`): `approval.request`, `approval.question`, `approval.answer`, `approval.approved`, `approval.rejected`, `approval.returned`, `approval.progress` (off outside the bell by default), `approval.reminder`, `approval.escalation`, `approval.withdrawn`. Links lead to the document's `url` (or the inbox).

Webhook events (area `approvals`, `approval.*`): `approval.started`, `approval.decision`, `approval.approved`, `approval.rejected`, `approval.returned`, `approval.question`, `approval.answered`, `approval.delegated`, `approval.withdrawn`, `approval.overdue`. Payload `{ approval: { id, type, module, docId, status, round, urgency, stage, stagesTotal, title, number, amount, currency, url, authorId, startedAt, dueAt, finishedAt }, … }`, delivered only to webhooks whose person may see the process.

## HTTP API

`/api/app/approvals` (signed-in; tokens need the `approvals` area):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/meta` | Urgency levels and SLA settings, registered types (fields, `manageable`), `canAdmin`, `canManageRoutes` |
| GET | `/inbox[?module=]` | `{ items, failed, counts: { total, overdue, today, byModule } }` |
| GET | `/inbox/count[?fresh=1]` | `{ total, overdue, today }` for the header badge; cached per person for 20 s (the badge polls every minute and on focus), `fresh=1` after the person's own decision skips the cache |
| POST | `/inbox/act` | `{ provider, id, action, comment?, to?, round?, stage? }` |
| POST | `/inbox/bulk` | `{ items: [{ id, round, stage }] }` → per-item results |
| GET | `/mine`, `/decided?before=` | «Мои на согласовании», «Решённые мной» |
| GET | `/processes/:id`, `/process/:type/:docId` | Process view |
| POST | `/processes/:id/decide`, `/processes/:id/answer` | Decision / answer |
| POST | `/process/:type/:docId/start`, `…/withdraw`, `…/restart` | Author actions |
| GET | `/subjects` | People, roles, groups for pickers |
| GET / PUT / DELETE | `/routes[/:type]` | Route list / read / save / back to default |
| POST | `/routes/:type/preview` | `{ values, draft? }` → stages that apply |
| GET | `/routes/:type/fields/:field/options` | Options of a field |
| PUT | `/settings` | Urgency levels, `reminderPercent`, `soonHours`, `escalation` (`approvals.admin`) |
| GET / POST / DELETE | `/substitutes[/:id]` | `?all=1` for administrators |

## Tests

- `test/approvals.test.js` (always): route cleaning, conditions (amount with currency, category, project, legal entity), planning, all / any, restart index, SLA arithmetic, required comments, settings sanitizing and the always-on rule, inbox sorting, notification texts.
- `test/workflows-review.test.js` (always): re-planning rules, API token scope per document module.
- `test/approvals-review.db.test.js` (`APPROVALS_DB_TEST=1`): re-planning on `refreshApproval`, no fresh start over a returned process, token scopes in the inbox / visibility / decisions, decisions refused while the module is off, a substitute of the question's addressee.
- `test/approvals.db.test.js` (`APPROVALS_DB_TEST=1 ENV_FILE_PATH=… node --test test/approvals.db.test.js`, a test database only): a test-only document type `test.doc` drives routing with conditions, all / any, question → answer to the same stage, reject, return → restart (first / current), delegate, substitutes, concurrent decisions, the SLA job (one reminder, one escalation), inbox aggregation with a failing provider, inline actions and permissions.
