# Procurement (`/app/procurement`)

A [module](modules.md) for purchase requests: an employee files a request with the invoice, it goes through [approval](approvals.md), lands in the accounting **payments registry** by itself, is paid (in one or several payments) and delivered. Spec: [specs/business-processes.ru.md](specs/business-processes.ru.md) §5. The module is **off by default**; turn it on in *Settings → Modules*.

- [Screens](#screens)
- [Statuses and transitions](#statuses-and-transitions)
- [Permissions and visibility](#permissions-and-visibility)
- [Approval integration](#approval-integration)
- [Links to other modules](#links-to-other-modules)
- [Legal entities (shared directory)](#legal-entities-shared-directory)
- [Notifications, reminders, webhooks](#notifications-reminders-webhooks)
- [Settings](#settings)
- [Data model](#data-model)
- [HTTP API](#http-api)
- [Code map](#code-map)
- [Tests](#tests)

## Screens

| Screen | Address | What it does |
|--------|---------|--------------|
| Requests | `/app/procurement/requests` | Table (sortable, column chooser, server paging) or kanban by status. Chips with counters: *Мои, Ждут меня, Срочные, Просрочено, К оплате, В работе, Отработано*. Search by number, title, supplier. Filters (status, category, urgency, currency, responsible, legal entity), saved views, CSV export of the visible columns. Default order: urgency, then the nearest deadline. Overdue rows have a red edge. On phones the table becomes cards. |
| Card | `/app/procurement/requests/:id` | A side drawer over the list (↑/↓ move through the list, Esc closes): number, status, urgency, amount; the approval path (`<ApprovalPath>`); decision buttons (`<ApprovalActions>`) and the module's own actions (send, mark payment, confirm delivery, close, edit, duplicate, cancel, delete draft). Tabs *Детали*, *Документы* (PDF / picture preview, upload, camera, «from Files»), *Обсуждение* (chat), *Оплаты* (payments and deliveries), *История* (the request's events merged with the approval history). |
| Form | `/app/procurement/new`, `/requests/:id/edit` | One column: the essence and the amount (one total or line items), the invoice (drag & drop, file, phone camera, Files), urgency, pay-by, category, supplier, payer and terms; «more» opens the description, deliver-by, responsible and links. The draft is created on the first change and autosaves; *Отправить на согласование* at the bottom shows what is missing. |
| Payments registry | `/app/procurement/payments` | `procurement.pay`: approved requests grouped *Просрочено / Сегодня / На неделе / Позже* (the person's day), totals per currency (what is left to pay), «Отметить оплату» in the row, CSV export. |
| Summary | `/app/procurement/summary` | Sums by status, category and month per currency, average / median approval time, overdue requests (last 12 months, over what the person may see). |
| Settings | `/app/procurement/settings` | `procurement.admin`: module settings and the legal entities directory (also *Settings → Modules → Procurement* and *Settings → Legal entities* in the console). |
| Dashboard widget | «Закупки» | Waiting for me / overdue / to pay counters, what is left to pay per currency, the first requests. |

Dates are calendar days (`YYYY-MM-DD`) shown with `lib/datetime`; money uses `formatMoney` of the approvals module (separators, `сом` for KGS).

## Statuses and transitions

```
draft ──submit──► pending ◄──► question
  ▲                 │ approve           (approvals service)
  │ withdraw        ├──────────► to_pay ──payment──► partially_paid ──payment──► paid ──delivery──► delivered ──close──► closed
  │                 │ reject                │ (post-payment: delivery before payment is allowed; status follows the money)
returned ◄─return───┤           rejected    └─cancel (no payments)──► cancelled
                    └─withdraw──► draft
```

| Status | Meaning |
|--------|---------|
| `draft` | Being written; private to the author (and administrators) |
| `pending` / `question` | In approval / an approver asked a question (the author may edit while answering) |
| `returned` | Returned for rework; editable; *Отправить заново* starts a new round |
| `to_pay` | Set **automatically** when the approval finishes (spec §5.2) |
| `partially_paid` / `paid` | Payments sum below / equal to the amount |
| `delivered` | Paid and fully delivered |
| `closed` | Closed by the author, responsible or an administrator (from `paid` / `delivered`) |
| `rejected`, `cancelled` | Side statuses; `rejected` is final (make a copy) |

Rules live in `modules/procurement/logic.js` and are enforced on the server:

- **Approval → request** (`APPROVAL_MAP`, used by `onStatus` inside the decision transaction): `pending`, `question`, `approved → to_pay`, `rejected`, `returned`, `withdrawn → draft`, each only from the listed statuses — anything else throws `409 BAD_TRANSITION` and the decision is rolled back. So a rejected or cancelled request cannot be restarted through the approvals API either.
- **Manual actions** (`ACTIONS`): `submit` (draft, returned; author / responsible / admin), `withdraw`, `cancel` (draft, returned, in approval — withdrawn first —, `to_pay` without payments), `close`, `reopen` (admin; the status is derived again), `pay` (`procurement.pay`), `deliver` (author / responsible / admin), `delete` (a draft never sent).
- **After payments / deliveries** the status is recomputed in one transaction holding the request row lock (`deriveStatus`): paid ≥ amount → `paid` (or `delivered` when fully delivered), > 0 → `partially_paid`, else `to_pay`. A payment above what is left is `400 OVERPAID`.
- **Editing**: every field in `draft`, `returned`, `question`; afterwards only the description, deliver-by, supplier contacts, links and the responsible person. The amount after approval is `409 LOCKED`. Edits during approval refresh the inbox copy and **re-plan** the stages not reached yet (`refreshApproval`, [approvals.md#replanning](approvals.md#replanning)): raising the amount (or changing the category, project, legal entity) while answering a question adds the stage the route now requires; nothing is locked for the author. An invoice cannot be removed or relabelled to another kind while the request is in approval (`409 LOCKED`).
- **Who sends**: the author (or creator), the responsible person or `procurement.admin` — through the card and through the approvals API alike (`onStatus` checks the sender, `403 FORBIDDEN`). The responsible person may also send a returned request again and cancel one in approval: the module checks its own rule (`ACTIONS`) and then calls the engine's `restart` / `withdraw` on the module's behalf, in the person's name.
- **Sending** requires the title, an amount > 0, an allowed currency and — with *invoice required* — a document of kind `invoice` (`readyErrors`). Checked both by `POST …/submit` and inside `onStatus` (also when no stage of the route applies and the start would approve at once), so `POST /app/approvals/process/procurement.request/:id/start` cannot bypass it. A returned request is sent again (`restart`), never started afresh (`409 NOT_RESTART`).

## Permissions and visibility

| Permission | Who |
|------------|-----|
| `procurement.create` | Files requests — needed only when *anyone may file requests* is off |
| `procurement.view_all` | Management: sees every request and the summary over all |
| `procurement.pay` | Accounting: payments registry, marks payments, sees requests from `to_pay` on |
| `procurement.admin` | Settings, categories, legal entities (module copy), the approval route; manages every request; default approver and escalation contact |

A person sees a request when they are its author, responsible or creator; or a colleague from one of the author's groups (setting *groupVisibility*, never drafts; the default group everyone is in does not count); or a participant of its approval (approver now or before, substitute, delegate, question target — the same rule as `isParticipant()`, applied in SQL for lists); or hold `procurement.pay` and the request is approved; or `view_all` / `admin`. One SQL condition (`access.js → visibleSql`) serves lists, counters, kanban, exports, the summary and the contract filter, so they always agree. Hidden requests and their documents answer `404`.

## Approval integration

`approval.js` registers the type `procurement.request`:

- **fields** for route conditions: `amount` (money, currency-aware), `category`, `legalEntity`, `project` (Masterplan), `paymentTerms`;
- **load** returns title, number, amount, currency, urgency, author, link;
- **onStatus** moves the request (see above) and, after the commit, notifies accounting and emits webhooks (`whenCommitted` re-reads the row so nothing is sent for a rolled-back decision);
- **defaultRoute**: one stage «Директор» = any holder of `procurement.admin` (spec §10), until an administrator saves a route in the [route builder](approvals.md);
- **urgency** levels are the approvals service's (no own list).

Approval notifications (sent to me, question, approved, rejected…) come from the approvals service (`approval.*`). An inbox provider `procurement.pay` adds approved, unpaid requests to the «Ждёт меня» of `procurement.pay` holders (kind `payment`, due at the end of the pay-by day, overdue after it; *Open* leads to the registry with the card open).

## Links to other modules

A link is not a dependency (spec §3): each field shows only while its module is on. Pickers follow the target module's access (Masterplan: only projects the person sees there; an API token also needs that module's area). Saving a link that **changes** checks the same (`400 BAD_PROJECT` / `BAD_OBJECT` / `BAD_DEAL` / `BAD_CONTRACT` / `BAD_SUPPLIER`), and the stored label is taken from the target; a free-text label without an id stays as typed, and a link that does not change is not re-checked. *Duplicate* quietly leaves out links the person cannot open.

| Link | Picker | Stored |
|------|--------|--------|
| Supplier | `GET /lookup/companies` (Counterparties) or free text + contacts | `supplier_company_id`, `supplier_name` (snapshot), `supplier_contact` |
| Project / object | `GET /lookup/projects`, `/lookup/objects?project=` (Masterplan: projects, levels, plots, objects) | id + label |
| CRM deal | `GET /lookup/deals` (CRM visibility rules) | id + label |
| Contract | `GET /api/app/contracts/contracts?search=` (Contracts module; the field hides on 404) | id + label |
| Documents | upload, or a **copy** of a Files node the person can open | own storage |
| Discussion | `registerChatEntity('procurement')` — access is the request's own; author and responsible follow it | chat module |

The Contracts module lists requests linked to a contract with `GET /api/app/procurement/requests?contract=<id>` (same visibility).

## Legal entities (shared directory)

`src/backend/services/legalEntities.js` — a core service (table `legal_entities`, created before module schemas) used by Procurement and Contracts:

```js
import { listLegalEntities, getLegalEntity, getDefaultLegalEntity } from '../../services/legalEntities.js';
await listLegalEntities();            // active, default first: [{ id, name, shortName, label, taxId, address, bankDetails, note, isDefault, archived, sort }]
await getLegalEntity(id);             // one (archived included), or null
```

Entities are archived, never deleted; one entity is the default (a partial unique index). When the table is created it is seeded with one entity named after the portal. Edited in *Settings → Project → Legal entities* (`/api/admin/legal-entities`, `settings.general`) and by procurement administrators in the module (`/api/app/procurement/legal-entities`).

## Notifications, reminders, webhooks

Notification kinds (group *Procurement*, `services/notificationCatalog.js`): `procurement.to_pay` (accounting), `procurement.paid` (author and responsible, every payment), `procurement.delivered`, `procurement.assigned` (made responsible), `procurement.due_soon`, `procurement.overdue`. Texts (`messages.js`) use the recipient's language, date format and number separators.

Job `procurement:deadlines` (every 10 minutes): *pay by* — `reminderDays` before (default 1) to accounting and the responsible person, the day after to them and the author; *deliver by* — to the responsible person and the author. Each goes **once**: the marker (`pay_soon_at`, `pay_overdue_at`, `deliver_soon_at`, `deliver_overdue_at`) is set by the `UPDATE … RETURNING` that picks the rows; changing the date clears it. Days are the portal's.

Webhooks (area `procurement`): `procurement.created`, `.updated`, `.submitted`, `.status_changed`, `.approved`, `.rejected`, `.payment`, `.paid`, `.delivered`, `.overdue`, `.closed`, `.cancelled`, `.deleted`. Payload `{ request: { id, number, title, status, amount, currency, paid, remaining, urgency, payBy, deliverBy, supplier, legalEntity, author, responsible, project, object, deal, contract, deliveryState, approval, url, … }, … }`, delivered only to webhooks whose person may see the request.

## Settings

`app_settings.modules.procurement.settings` (sanitized by `sanitizeProcurement` in `modules/catalog.js`):

| Key | Default |
|-----|---------|
| `categories` | Оборудование, Материалы, Услуги, IT и связь, Канцелярия, Транспорт, Прочее — `[{ key, name, color, archived? }]`; keys are stable (route conditions test them) |
| `currencies` / `currency` | `['USD', 'KGS', 'RUB']` / `USD` |
| `numberPrefix` / `numberDigits` | `ЗК` / 4 → `ЗК-0001` |
| `invoiceRequired` | `true` |
| `anyoneCanCreate` | `true` (off: `procurement.create` needed) |
| `groupVisibility` | `true` |
| `reminderDays` | 1 (0–30) |
| `units` | шт, кг, м, м², м³, л, компл, усл, ч |

## Data model

| Table | Content |
|-------|---------|
| `proc_requests` | number (`seq` + formatted `number`, unique), title, description, category, `has_items`, amount, currency, legal entity, payment terms (+ advance %), urgency, `pay_by` / `deliver_by` (DATE), supplier, links (id + label), author, responsible, creator, status, `paid_amount`, `delivery_state`, milestones (`submitted_at`, `approved_at`, `paid_at`, `delivered_at`, `closed_at`, `cancelled_at`), reminder markers |
| `proc_items` | line items: name, qty, unit, price, amount |
| `proc_documents` | kind (`invoice`, `quote`, `spec`, `photo`, `waybill`, `act`, `payment`, `other`), name, size, storage key (`UPLOAD_DIR/procurement/…`), source (`upload` / `files`), payment / delivery it belongs to |
| `proc_payments` | `paid_on`, amount, method (`bank`, `cash`, `card`, `other`), reference, note, author |
| `proc_deliveries` | `delivered_on`, `partial`, note, author |
| `proc_events` | history: created, updated (fields), document added / removed, payment added / removed, delivered, closed, cancelled, reopened, status |
| `proc_views` | saved list views per person |
| `proc_counters` | the number sequence, incremented under a row lock (no duplicates under concurrency) |

Documents are served only through `GET /documents/:id/file` after the request's access check, with `nosniff` and `Content-Security-Policy: sandbox`; PDFs and pictures are checked by their magic bytes; a file from Files is copied, so the request keeps it.

## HTTP API

`/api/app/procurement` (signed-in; API tokens need the `procurement` area). Details and examples are in the API reference (*Developers*).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/meta` | Settings subset, legal entities, rights, linked modules, statuses, kinds |
| GET | `/requests` | Page of requests: `chip`, `q`, `status`, `category`, `currency`, `urgency`, `legalEntity`, `responsible` (`me`), `author`, `contract`, `project`, `deal`, `sort`, `order`, `page`, `pageSize` (≤ 200) |
| GET | `/counters`, `/board`, `/export.csv` | Chip counters, kanban, CSV of the list (`columns=`) |
| POST | `/requests` | New draft |
| GET / PUT / DELETE | `/requests/:id` | Card / update / delete a never-sent draft |
| GET | `/requests/:id/history` | Request events + approval history |
| POST | `/requests/:id/submit` · `withdraw` · `cancel` · `close` · `reopen` · `duplicate` | Actions |
| POST | `/requests/:id/documents` (multipart `files[]`, `kind`) · `/documents/link` (`nodeId`, `kind`) | Documents |
| GET / PUT / DELETE | `/documents/:id/file[?download=1]` · `/documents/:id` | File · change kind · remove |
| POST / DELETE | `/requests/:id/payments` · `/payments/:id` | Payments (`amount`, `paidOn`, `method`, `reference`, `note`, `files[]`) |
| POST / DELETE | `/requests/:id/deliveries` · `/deliveries/:id` | Deliveries (`deliveredOn`, `partial`, `note`, `files[]`) |
| GET | `/registry`, `/registry.csv` | Payments registry |
| GET | `/summary`, `/widget` | Summary, dashboard widget |
| GET | `/lookup/:kind` | `companies`, `projects`, `objects`, `deals` |
| GET / POST / DELETE | `/views[/:id]` | Saved views |
| GET / PUT | `/settings` | Module settings (`procurement.admin`) |
| GET / POST / PUT / DELETE | `/legal-entities[/:id]` | Legal entities (write: `procurement.admin`) |

Error codes: `NOT_FOUND`, `FORBIDDEN`, `BAD_TRANSITION`, `HAS_PAYMENTS`, `LOCKED`, `STALE`, `TITLE_REQUIRED`, `AMOUNT_REQUIRED`, `INVOICE_REQUIRED` (with `info.missing`), `CURRENCY`, `OVERPAID`, `BAD_DATE`, `BAD_CATEGORY`, `BAD_LEGAL_ENTITY`, `FILE_TYPE`, `FILE_CONTENT`, `FILE_TOO_LARGE`, `MODULE_DISABLED`.

CSV exports start with a BOM, use `;`, and neutralise formulas: a cell starting with `=`, `+`, `-`, `@`, tab or CR (except plain numbers) gets a leading `'`.

## Code map

```
src/backend/services/legalEntities.js       shared legal entities directory
src/backend/modules/procurement/
  index.js       descriptor; registers the approval type, the inbox provider, the chat entity
  logic.js       pure rules: statuses, transitions, money, numbering, CSV, registry groups (unit-tested)
  access.js      context, visibility (SQL and per row)
  service.js     lists, counters, kanban, card, create / update / actions, history, webhooks
  money.js       payments and deliveries
  files.js       documents (upload, copy from Files, serve)
  approval.js    registerApprovalType + «Ждёт меня» provider for accounting
  reports.js     registry, CSV, summary, widget
  lookups.js     pickers for Counterparties, Masterplan, CRM
  reminders.js   procurement:deadlines job
  chat.js        request conversations
  messages.js    notification texts
  routes.js, schema.js
src/frontend/src/modules/procurement/
  ProcurementApp.jsx, ProcContext.jsx, api.js, lib.js, procurement.css
  pages/  RequestsPage, RequestForm, PaymentsPage, SummaryPage, SettingsPage
  card/   RequestCard, DetailsTab, DocumentsTab, MoneyTab, HistoryTab
  components/  bits, DropZone, pickers;  settings/  SettingsForm, LegalEntitiesEditor
  ProcurementSettings.jsx (console), ProcurementWidget.jsx (dashboard)
src/frontend/src/pages/admin/settings/LegalEntities.jsx
src/frontend/src/i18n/procurement.js, help/content/procurement.js
```

## Tests

- `test/procurement.test.js` (always): line items and money, status derivation, approval mapping and refused transitions, manual action rules, readiness, numbering, registry groups and totals, CSV formula guard, settings sanitizing (off by default), catalogued notifications and webhooks, message texts, legal entity validation.
- `test/procurement-review.db.test.js` (`PROCUREMENT_DB_TEST=1`): the default group does not open requests, only the request's people send it (also via the approvals API, also with a route where no stage applies), the responsible person resends a returned request and cancels one in approval, the amount raised while answering a question adds a stage, link checks, the invoice's kind locked in approval.
- `test/procurement.db.test.js` (`PROCUREMENT_DB_TEST=1 ENV_FILE_PATH=… node --test test/procurement.db.test.js`, a test database only): numbering under concurrency, the invoice guard through both entry points, submit → question → answer → approve → `to_pay` (accounting inbox item and notification), payments (forbidden for the author, partial, overpaid, full, removed), delivery and closing, reject (final), return → resubmit (round 2, refreshed amount), withdraw, cancel with withdrawal, draft deletion, visibility per role (stranger, colleague, approver, accountant, view_all), the contract filter, deadline reminders sent once and re-armed by a new date.
