# Contracts (`/app/contracts`)

A [module](modules.md) with the company's **contracts registry** (spec: [specs/business-processes.ru.md](specs/business-processes.ru.md), §6). Each contract is a card with the counterparty, legal entity, money, dates, auto-prolongation and the people in charge; it keeps **file versions** with «что изменено», the lawyer's **risks** («На что обратить внимание»), a **discussion** (chat), **links** to purchase requests, a CRM deal and a Masterplan object, and a full **history**. Contracts go through the always-on [Approvals](approvals.md) service; the dates move them to «Действует», «Истекает» and «Завершён» by themselves, and reminders reach the owner and the lawyer before the end and before the refusal deadline.

The module is **off by default** (Settings → Modules → Contracts).

- [Screens](#screens)
- [The card](#the-card)
- [Statuses](#statuses)
- [Approval](#approval)
- [Versions and files](#versions-and-files)
- [Risks and discussion](#risks-and-discussion)
- [Links](#links)
- [Deposit and payments](#deposit-and-payments)
- [Payments registry](#payments-registry)
- [Masterplan](#masterplan)
- [Dates, reminders, the expiry job](#dates-reminders-the-expiry-job)
- [Access](#access)
- [Settings](#settings)
- [Notifications and webhooks](#notifications-and-webhooks)
- [Data model](#data-model)
- [API](#api)
- [Code map and tests](#code-map-and-tests)

## Screens

| URL | What it is |
|-----|------------|
| `/app/contracts` | **Registry**: chips with counters, search, the table (cards on phones), server paging and sorting, CSV export |
| `/app/contracts/:id` | The **card** opens on the right over the registry; ↑ / ↓ go to the previous / next contract, Esc closes |
| `/app/contracts/payments` | **Payments registry** for `contracts.finance` and those who see every contract ([below](#payments-registry)) |
| `/app/contracts/calendar` | **Expiry calendar**: twelve months as a heat strip (contracts ending ↔ refusal deadlines ↻), then each month's contracts by day |
| `/app/contracts/settings` | Settings for `contracts.admin` without console rights |

Registry chips (each with a counter under the current search): **Все** (everything but the archive), **Мои** (created, owner or lawyer), **Ждут меня** (an approval stage or a question waiting for me), **Срочные** (in approval with any urgency level but the calmest), **Просрочено** (approval stage overdue), **В работе** (draft → approved), **Действуют** (in force or expiring), **Истекают за N дней**, **Без подписанной версии** (approved / signed / in force without a version marked signed), the money chips **Ждут задаток** (a deposit is expected), **Просрочены платежи** (a schedule row due before the person's day is not paid in full), **Оплачены** (the schedule is paid in full) — these three only appear when they count something or are picked, so a company without sales sees no clutter — and **Отработано** (the archive: completed, terminated, rejected — spec §6.4 calls it «Архив», §9 «Отработано»).

Columns: number (and the counterparty's number), counterparty · subject, type, amount (or «Рамочный»), end date (red past or < 7 days, yellow inside the expiring window, ↻ auto-prolongation), status (with the approval urgency, ⏰ when overdue, ✍? without a signed version), owner. Default order: overdue approvals, questions, approvals by urgency, expiring, then the nearest end date.

Keyboard: `/` focuses the search; in the card ↑ / ↓ / Esc. The new-contract form is one column (subject, counterparty, amount, file first) and keeps an unfinished draft in the browser.

## The card

Header: number, status, type, direction, subject, counterparty ⇄ legal entity, amount, term, the refusal deadline, owner and lawyer. Below: the approval path (`<ApprovalPath />`) and the decision buttons (`<ApprovalActions />`) — while the contract is in approval, **open high risks are shown right above them** — then the manual status steps the server allows the person, and the tabs:

| Tab | Content |
|-----|---------|
| Обзор | The fields (edit opens the form) and the risks |
| Оплаты | Only on contracts with a client, of the types «Купли-продажи» / «Продажа объекта», or already tracking money: the deposit, the payment schedule (plan / fact), payments received ([below](#deposit-and-payments)); the header's amount shows «оплачено N %» |
| Версии | Upload a new version with «что изменено» (the newest is current), the feed with author, time, comment, current and signed marks; open (pdf.js / images / Office through the conversion service) or download any version |
| Обсуждение | The contract's conversation (chat entity `contract`); open risks as chips above it — picking one posts «↪ Риск #N · § clause — …» with a link back to the risk (`/app/contracts/:id?risk=N` highlights it) |
| Связи | Purchase requests pointing at the contract (Procurement), the CRM deal, the Masterplan project / object — each only while its module is on; «нет доступа» when that module hides it from the person |
| История | Contract events (fields old → new, statuses with the source: by hand / by the approval / by the dates, versions, risks, prolongation) merged with the approval's history |

## Statuses

**Проект** → **На согласовании** (↔ **Нужен ответ**) → **Согласован** → **Подписан** → **Действует** → **Истекает** → **Завершён**; side: **Отклонён**, **Расторгнут**. Every transition is checked on the server (`modules/contracts/logic.js`):

| Transition | Who / what |
|------------|------------|
| Проект / Отклонён → На согласовании | The approvals service (`start` / `restart`), only with at least one file version, by the creator, owner, lawyer or `contracts.legal` |
| На согласовании ↔ Нужен ответ, → Согласован / Отклонён | The approvals service (`onStatus`, inside the decision's transaction) |
| returned / withdrawn | Back to Проект |
| Согласован → Подписан | `contracts.legal`: picks the signed version (default: current) and the signing date (fills «Заключён» when empty) |
| Подписан → Действует | `contracts.legal` by hand, or the job from the start date (no start date: at once) |
| Действует → Истекает | The job, `expiringDays` before the end; a later end date takes it back |
| Подписан / Действует / Истекает → Завершён | `contracts.legal`, or the job after the end (without auto-prolongation) |
| Подписан / Действует / Истекает → Расторгнут | `contracts.legal`, reason required |
| Согласован / Отклонён → Проект | The contract's people or a lawyer (rework) |

Fields can be changed in Проект, Нужен ответ and Отклонён by the contract's people; `contracts.legal` / `contracts.admin` also later (e.g. a new end date). In approval they are locked for the contract's people (`403 LOCKED`); versions, risks and links are not. `contracts.legal` / `contracts.admin` may still correct fields in approval — the approval then re-plans the stages not reached yet against the new amount, type, direction or legal entity ([approvals.md#replanning](approvals.md#replanning)), so a correction cannot slip past a conditional stage. The archive (Завершён, Расторгнут) is read-only except for `contracts.admin`. Only a draft (or rejected) contract can be deleted, by its creator or a lawyer.

## Approval

Type `contracts.contract` (`modules/contracts/approval.js`), adminPermission `contracts.admin`. Route conditions may test **amount** (money), **type**, **direction**, **legal entity** and **framework**. Without a saved route the approvals service falls back to "any `contracts.admin`" (spec §10: configure the «Директор» stage in Settings → Approvals). `load()` gives the title «subject · counterparty», the number, the amount (none for a framework contract), the author (the business owner, else the creator) and the card link. Urgency levels are the approvals settings'.

## Versions and files

`POST /contracts/:id/versions` (multipart `file`, `comment`, `signed` for lawyers). Blobs are stored under `UPLOAD_DIR/contracts/<year>/<month>/` with random names, PDF and image contents are checked against their extension (`FILE_CONTENT`), and they are served only by `GET /versions/:id/file` after the contract's access check, with `nosniff` and the sandbox CSP of Files (`shared/storage.js sendBlob`); only safe types open inline. Office files preview through the document conversion service (`/versions/:id/preview.pdf`). Limit: `maxUploadMb`. The access check runs before the file is received; a blob whose version row could not be written is removed.

## Risks and discussion

Risks have a per-contract number (#1, #2…), text, clause, importance (high / medium / low) and status (open / accepted / fixed, with who resolved it). The contract's lawyer, `contracts.legal` and `contracts.admin` manage them. A new **high** risk notifies the owner and the creator. The conversation is a chat entity (`registerChatEntity('contract')`): access is the contract's, the creator, owner and lawyer follow it; status changes, versions, risks and prolongations appear in it as system lines (`modules/contracts/chatEvents.jsx`) once the conversation exists.

## Links

- **Purchase requests**: the Procurement module links requests to a contract; the card lists them with `GET /api/app/procurement/requests?contract=<id>` (a 404 / disabled module just hides the list). Procurement's contract picker uses `GET /api/app/contracts/contracts?search=…&pageSize=20` (visible contracts with `id`, `number`, `title`, `counterparty`).
- **CRM deal** (`dealId`): set only to a deal the person may see in the CRM; `?deal=<id>` filters the registry.
- **Masterplan** (`mpProjectId`, `mpNodeId`): a project or any object of a project the person sees.
- **Counterparty**: a company of Counterparties (`companyId`; its name is copied into `counterparty`) or plain text when the module is off. **Legal entity**: the shared directory `services/legalEntities.js` (default entity preselected).

## Deposit and payments

Everything here is optional: a contract without a deposit, a schedule or payments shows none of it. The «Оплаты» tab appears for contracts `direction = client`, of the types `sale` / `property_sale` (new stock type «Продажа объекта»; added once to type lists saved before it, `typesRev`), and for any contract that already tracks money (`pay_tracked`). Code: `payLogic.js` (pure), `payments.js` (service), `mpSync.js` (Masterplan).

**Deposit** (`ctr_deposits`, one per contract). `kind`: **Задаток** (`deposit`) — secures the deal: forfeited if the buyer refuses, returned double if the seller refuses (Civil Code of the KR / RF) — or **Аванс** (`advance`) — a prepayment, always refundable; the card shows this as a one-line hint. Amount + currency (the contract's by default), due day, refund / forfeit terms, method, document number, a document (file), status:

| Status | Meaning | Who |
|--------|---------|-----|
| `expected` — ожидается | planned | created / edited by the people who plan the money (below); removable while expected |
| `received` — получен | the money came: `received_on`, method, number, file; `confirmed_by` / `confirmed_at` | `contracts.finance` |
| `credited` — зачтён в оплату | part of the price now | finance |
| `returned` — возвращён | `settled_amount` (default the amount; «Вдвойне» for a задаток), `settled_on` | finance |
| `forfeited` — удержан | the buyer refused, the company keeps it | finance |

Finance may also put it back to `expected` (a mistake). Only finance changes the amount of a received deposit; a contract with payments or a received deposit cannot be deleted (`409 HAS_PAYMENTS`).

**Schedule** (`ctr_schedule`: day, amount, purpose `deposit` / `first` / `monthly` / `rest` / `full`, note, `paid`). Built by `buildSchedule(total, plan)` from the contract amount: `full` — one row; `installments` — the first payment = total × `firstPct` in whole currency units, then `months` monthly payments in whole units from `startOn` (default a month after `firstOn`) on `day` (clamped to short months), **the last payment absorbs the rounding difference** (the same arithmetic as Masterplan's `paymentSchedule`). With a deposit (not returned / forfeited, same currency) and `offset` (default), the deposit is its own «Задаток» row on its due day and is **counted toward the first payment** (a deposit larger than the first payment reduces the next rows); with 100 % the rest is «Остаток». The builder previews rows live (`POST …/schedule/preview`), prefills `firstPct` / `months` from the linked Masterplan object's price grid (`GET …/payment-plans`: the grid version in force for the unit's type, only for people with `price.view` there; the plan's own price is shown next to the contract amount), and the rows stay editable (date, purpose, amount, add / delete) before saving. A schedule that does not add up to the contract amount shows the difference. Saving keeps rows by `id`, so reminders already sent for them are not repeated. `pay_plan` keeps what it was built from.

**Payments** (`ctr_payments`: day, amount, method `bank` / `cash` / `card` / `other`, number, note, file, author) — registered and deleted (mistakes) by finance. After every change (`recompute`, in the transaction that holds the contract row lock) the money is **allocated to the rows oldest first** (`allocate`): a partial payment covers a row partly; a `received` deposit covers only «Задаток» rows, a `credited` one counts toward any row; returned / forfeited ones count nothing. Totals land on the contract (`pay_tracked`, `pay_total`, `pay_paid`, `deposit_status`) for the chips and «оплачено N %».

**Row state** (`rowState`) on the person's calendar day (their time zone, `datetime.isoDay`): `paid`; `overdue` (due before today, not fully paid — red); `soon` (within `paymentSoonDays`, default 7, today included — amber); `planned`.

**Who**: the deposit's terms and the schedule — the people who may edit the contract (`canEdit`) or finance; confirming, settling, payments — `contracts.finance` (and `contracts.admin`). Finance sees every contract that tracks money (`pay_tracked`), not the others; everyone else sees amounts exactly as they see the contract.

**Reminders** (job `contracts:payments`, every 15 minutes, the portal's day): before a row's day at the smallest reached threshold of `paymentReminderDays` (default 3 days and the day itself) to the business owner (the creator without one) — `contracts.payment_due`; once when it becomes overdue to the owner and finance — `contracts.payment_overdue` and the webhook `contracts.payment.overdue`. `(row, kind, days, due day)` goes into `ctr_pay_reminders` by the statement that decides to send, so each is sent once; a moved day makes a new reminder. The «Ждёт меня» provider `contracts.payments` gives finance one item per contract with overdue payments (kind `payment_overdue`, «Платёж просрочен», the overdue sum).

## Payments registry

`/app/contracts/payments` (`contracts.finance`; read-only for `contracts.view_all` / legal / admin, `403` for others): unpaid schedule rows and expected deposits of live contracts (not completed / terminated / rejected) the person may see, grouped **Просрочено / Сегодня / На неделе / Позже** by the person's day, totals of what is left per currency (overdue separately). «Позже» shows one row per contract (its nearest payment, «ещё N далее»); totals and the CSV count every row. «Отметить поступление» opens the payment dialog with the row's remainder; «Подтвердить» confirms an expected deposit; a row opens the contract on its «Оплаты» tab. **CSV** (`payments-registry.csv`): `;`, UTF-8 BOM, dates in the person's format, cells starting with `= + - @` are escaped. The dashboard widget **«Поступления по договорам»** (`contractsPayments`, for finance / view_all / legal / admin) shows overdue and this week's sums per currency and the nearest payments.

## Masterplan

Only while both modules are on and the contract is linked to a sellable Masterplan object (`mp_node_id` with an `mp_units` row) — `mpSync.js`:

| Contracts | Masterplan | How |
|-----------|-----------|-----|
| deposit `expected → received` | «Резерв» / «Бронь» → **«Задаток»** (paid = the deposit and payments) | `sales.changeStatus` with the confirming person's Masterplan rights |
| contract signed | «Задаток» → **«Договор»**: number (counterparty's number, else ours), date (concluded / signed), amount | the signer's rights; a unit already in «Договор» gets the three fields copied (needs `status.contract`) |
| payments change | the unit's **paid amount** = payments + the deposit while held | derived data, written without a Masterplan right |
| paid in full | «Договор» → **«Продано»** (paid stays what really came) | the finance person's rights |

Masterplan's own rules decide (transition chain, zones, roles, field hiding, its notifications and the CRM deal line, the deal amount as today). A refused move (`INVALID_TRANSITION` from «Резерв», `FORBIDDEN`, `NOT_FOUND` without access, `NOT_HELD` for a free unit…) **never fails** the contract action: it is written as `ctr_events.mp_sync` and `mp_events.contract` (shown in both histories, with Masterplan's field hiding — the amounts need `amounts.*`) and the card shows an amber note with what to do by hand until a later attempt succeeds. Applied moves carry the reason «Договор ДГ-…: …» in the unit's status history. Responses of the deposit / payment / signing calls carry `masterplanSync`.

## Dates, reminders, the expiry job

`contracts:daily` (every 10 minutes, scheduler advisory lock, the portal's day):

1. **Dates** (`dateTransition`): start reached → Действует; within `expiringDays` of the end → Истекает; past the end → Завершён, or — with auto-prolongation — the **next term** of the same length (whole months stay whole months, no start date = a year), recorded as «пролонгирован до …».
2. **Reminders** (`dueReminders`), to the owner and the lawyer (the creator when neither is set): at each of `reminderDays` (30 and 7) before the **end** (contracts without auto-prolongation) and before the **refusal deadline** (`end − noticeDays`, auto-prolonged contracts). Only the smallest threshold reached is sent — a contract created 5 days before its end gets the 7-day reminder, never a late 30-day one. `(contract, kind, days, target day)` is inserted into `ctr_reminders` by the statement that decides to send, so each goes out once; a new term makes new targets.

The «Ждёт меня» inbox gets a provider `contracts.deadlines` for the owner and the lawyer: a refusal deadline (`end − noticeDays`, however long the notice period) within 14 days, or the end of a non-prolonging contract within 7 days. The SQL filters on these deadlines themselves, not on the end date.

## Access

| Who | Sees | Does |
|-----|------|------|
| `contracts.view_all` | every contract | — |
| `contracts.legal` | every contract | edits any time, risks, signed / in force / completed / terminated, marks signed versions |
| `contracts.admin` | every contract | everything of a lawyer, the archive, settings, the approval route |
| `contracts.finance` | contracts with a deposit, schedule or payments | confirms / settles deposits, registers payments, the payments registry |
| `contracts.create` | own | creates contracts |
| creator, owner, lawyer | their contracts | edit while draft / question / rejected, versions, links, send to approval, back to draft |
| people sharing a **non-default** group with the creator, owner or lawyer | those contracts | read, discuss |
| approval participants (`isParticipant`) | those contracts | read, decide, discuss |

Everything else answers `404`. Lists filter in SQL with the same rule (approval participants through `participantDocIds()` of the approvals API). API tokens need the `contracts` area; a token narrowed by resource limits never gets the legal / admin bypass.

## Settings

`app_settings.modules.contracts.settings` (sanitized by `sanitizeContracts` in `modules/catalog.js`):

| Key | Default |
|-----|---------|
| `prefix` | `ДГ` → numbers `ДГ-0001` (new contracts only) |
| `types` | supply, services, lease, works, employment, sale, agency, loan, NDA, other — empty label = translated stock name; custom types need a label |
| `currencies` / `defaultCurrency` | USD, KGS, RUB / KGS |
| `reminderDays` | `[30, 7]` |
| `expiringDays` | 30 |
| `maxUploadMb` | 50 |
| `paymentSoonDays` | 7 — a payment is amber this many days before its day |
| `paymentReminderDays` | `[3, 0]` — payment reminders before the day |

## Notifications and webhooks

Notification kinds (group *Contracts*): `contracts.assigned` (I became the lawyer / owner), `contracts.status` (signed, in force, expiring, completed, terminated, prolonged; approved / rejected to the owner and lawyer besides the author, who hears from the approvals service), `contracts.version`, `contracts.risk` (high risks), `contracts.reminder`, and for the money side `contracts.payment` (a deposit confirmed / settled, a payment received — to the owner, the lawyer and the creator), `contracts.payment_due`, `contracts.payment_overdue`. Texts follow the recipient's language and date format. Approval notifications are the `approval.*` kinds.

Webhooks (area `contracts`): `contracts.created`, `contracts.updated` (`changes`), `contracts.status_changed` (`from`, `to`), `contracts.prolonged`, `contracts.version_added`, `contracts.risk_changed`, `contracts.reminder`, `contracts.deleted`, `contracts.deposit.received` (`deposit`), `contracts.payment.received` (`payment`, `totals`), `contracts.payment.overdue` (`row`) — payload `{ contract: {…, lawyer, owner, createdBy as ids}, … }`, delivered only to webhooks whose person may see the contract.

## Data model

| Table | Content |
|-------|---------|
| `ctr_contracts` | `seq`, `number` (unique), `ext_number`, `title`, `type_key`, `direction`, `company_id`, `counterparty`, `legal_entity_id`, `framework`, `amount`, `currency`, `payment_terms`, `description`, `concluded_on` / `starts_on` / `ends_on` (DATE, read as text), `auto_renew`, `notice_days`, `lawyer_id`, `owner_id`, `deal_id`, `mp_project_id`, `mp_node_id`, `status`, `status_changed_at`, `current_version_id`, `signed_version_id`, `signed_at`, `signed_by`, `terminated_reason`, `created_by`, `updated_by` |
| `ctr_versions` | `no` per contract, `name`, `ext`, `mime`, `size`, `storage_key`, `comment`, `signed`, `created_by`, `created_at` |
| `ctr_risks` | `no` per contract, `text`, `clause`, `importance`, `status`, `resolved_by`, `resolved_at` |
| `ctr_events` | history: `created`, `updated` (changes), `status` (from, to, source), `prolonged`, `version`, `current`, `signed_mark`, `risk`, `risk_update`, `risk_delete` |
| `ctr_reminders` | `(contract_id, kind, days, target)` sent once |
| `ctr_contracts` (money) | `pay_tracked`, `pay_total`, `pay_paid`, `deposit_status`, `pay_plan` (JSONB) — totals kept by `recompute` |
| `ctr_deposits` | `contract_id` (PK), `kind`, `amount`, `currency`, `due_on`, `received_on`, `method`, `reference`, `status`, `terms`, `settled_on`, `settled_amount`, `note`, `file_*`, `confirmed_by`, `confirmed_at` |
| `ctr_schedule` | `contract_id`, `no`, `due_on`, `amount`, `purpose`, `note`, `paid` (allocated) |
| `ctr_payments` | `contract_id`, `paid_on`, `amount`, `method`, `reference`, `note`, `file_*`, `created_by` |
| `ctr_pay_reminders` | `(row_id, kind, days, due_on)` sent once |

Numbers are taken under `pg_advisory_xact_lock`, so two contracts created at once get consecutive numbers.

## API

`/api/app/contracts` (signed in; tokens need the `contracts` area). Dates are `YYYY-MM-DD`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/meta` | Settings, my rights, enabled modules, legal entities, today |
| GET | `/users` | People for pickers |
| PUT | `/settings` | Module settings (`contracts.admin`) |
| GET | `/contracts` | Registry: `search`, `view`, `status`, `type`, `direction`, `owner`, `lawyer`, `company`, `deal`, `legalEntity`, `sort`, `order`, `page`, `pageSize` (≤ 200) |
| GET | `/counters` | Chip counters under the same filters |
| GET | `/export.csv` | The list as CSV (`;`, UTF-8 BOM), same filters and rights, ≤ 5 000 rows; dates in the person's regional format |
| GET | `/calendar` | `from=YYYY-MM`, `months` (≤ 24): contracts ending or with a refusal deadline |
| POST | `/contracts` | Create (`contracts.create`) |
| GET / PUT / DELETE | `/contracts/:id` | Card (fields, versions, risks, links, `can`) / change fields / delete a draft |
| POST | `/contracts/:id/status` | `{ to: signed \| active \| completed \| terminated \| draft, comment?, signedVersionId?, signedOn? }` |
| GET | `/contracts/:id/events` | History, `before` for paging |
| POST | `/contracts/:id/versions` | Upload a version (multipart) |
| PUT | `/versions/:id` | `{ current: true }` / `{ signed: bool }` |
| GET | `/versions/:id/file[?download=1]`, `/versions/:id/preview.pdf` | File, Office preview |
| POST | `/contracts/:id/risks`; PUT / DELETE `/risks/:id` | Risks |
| GET | `/link-options/deals?search=`, `/link-options/masterplan?search=` | Pickers of the Links tab |
| GET | `/contracts/:id/payments` | The «Оплаты» tab: deposit, schedule rows with `paid` / `left` / `state`, payments, totals, rights, the Masterplan unit and notes |
| GET | `/contracts/:id/payment-plans` | Plans of the linked object's price grid |
| PUT / DELETE | `/contracts/:id/deposit` | Deposit terms / remove an expected one |
| POST | `/contracts/:id/deposit/status` | `{ status, receivedOn, method, reference, settledAmount, settledOn, note }` (+ multipart `file`) — finance |
| POST | `/contracts/:id/deposit/file` | The deposit's document (multipart) |
| POST | `/contracts/:id/schedule/preview` | Rows a plan gives (nothing saved) |
| PUT | `/contracts/:id/schedule` | `{ rows: [{ id?, dueOn, amount, purpose, note? }], plan }` (empty rows remove it) |
| POST | `/contracts/:id/payments` · DELETE `/payments/:id` | Register (JSON or multipart with `file`) / delete a payment — finance |
| GET | `/payfiles/deposit/:contractId`, `/payfiles/payment/:id` | Documents, after the contract's access check |
| GET | `/payments-registry`, `/payments-registry.csv`, `/payments-widget` | Payments registry, its CSV, the dashboard numbers |
| POST | `/jobs/daily`, `/jobs/payments` | Run the expiry job / the payment reminders now (`contracts.admin`) |

Sending to approval and decisions use the approvals API: `POST /api/app/approvals/process/contracts.contract/:id/start` etc. Errors: `NOT_FOUND`, `FORBIDDEN`, `LOCKED`, `BAD_TRANSITION`, `STALE`, `IN_APPROVAL`, `COMMENT_REQUIRED`, `VERSION_REQUIRED`, `TITLE_REQUIRED`, `BAD_TYPE`, `BAD_DATES`, `INVALID_DATE`, `BAD_AMOUNT`, `BAD_USER`, `BAD_COMPANY`, `BAD_LEGAL_ENTITY`, `BAD_DEAL`, `BAD_OBJECT`, `FILE_CONTENT`, `FILE_TOO_LARGE`, `NO_FILE`; money: `AMOUNT_REQUIRED`, `BAD_KIND`, `BAD_METHOD`, `BAD_ROWS`, `SAME_STATUS`, `DEPOSIT_RECEIVED`, `HAS_PAYMENTS`.

## Code map and tests

```
src/backend/modules/contracts/
  index.js      descriptor, approval type, «Ждёт меня» provider
  logic.js      pure: transitions, approval → status, numbering, day arithmetic, prolongation, reminders, input
  access.js     visibility and rights, list SQL condition
  service.js    registry, card, create / update / status / delete, history, chat lines, webhooks, CSV
  approval.js   registerApprovalType('contracts.contract'), onStatus
  versions.js   uploads and file serving
  risks.js      risks
  links.js      CRM deal, Masterplan object, pickers
  jobs.js       contracts:daily (dates, reminders), contracts:payments (payment reminders)
  payLogic.js   pure: schedule building, allocation, row states, totals, payment reminders, input
  payments.js   deposit, schedule, payments, files, payments registry + CSV, widget, inbox, reminders
  mpSync.js     Masterplan: deposit → «Задаток», signed → «Договор», paid amount, 100 % → «Продано»
  chat.js       chat entity 'contract'
  messages.js   notification texts (ru / en)
  schema.js     tables + job + chat registration
src/frontend/src/modules/contracts/
  ContractsApp.jsx, ContractsContext.jsx, ContractsSettings.jsx, chatEvents.jsx, contracts.css
  pages/RegistryPage.jsx, CalendarPage.jsx, SettingsPage.jsx
  pages/PaymentsPage.jsx, PaymentsWidget.jsx, contracts-pay.css
  card/Payments.jsx, payDialogs.jsx (deposit, deposit status, payment, schedule builder)
  card/ContractCard.jsx, Overview.jsx, Risks.jsx, Versions.jsx, Discussion.jsx, Links.jsx, History.jsx, StatusActions.jsx
  components/ContractForm.jsx, bits.jsx
src/frontend/src/i18n/contracts.js, i18n/contractsPayments.js, src/frontend/src/help/content/contracts.js
```

- `test/contracts.test.js` (always): transitions and rights, approval → status, numbering, day arithmetic, expiring / completion / prolongation, reminders (thresholds, never late), input cleaning, settings sanitizing and «off by default», webhook and notification catalogs, notification texts with the recipient's date format.
- `test/contracts-review.db.test.js` (`CONTRACTS_DB_TEST=1`): a refusal deadline with a long notice period in «Ждёт меня», a lawyer's correction in approval re-planning the stages (the contract's people locked out), CSV dates in the regional format.
- `test/contracts.db.test.js` (`CONTRACTS_DB_TEST=1 ENV_FILE_PATH=… node --test test/contracts.db.test.js`, a test database only): numbering (also concurrent), visibility per role (stranger, same group, view_all, lawyer, owner, approver), versions (content check, current), risks (lawyer only), approval start → question → answer → approve with the status following, locked fields, enforced transitions, signing → in force, the expiry job (expiring, reminders 30 and 7 days each once, completion), auto-prolongation, termination reason, deleting a draft, history.
- `test/contracts-payments.test.js` (always): installments (parity with Masterplan's grid arithmetic, cents in the last payment), schedule building by day of month, the deposit offset, allocation of partial payments oldest first and by deposit status, overdue / soon by the regional day (a moment that is already tomorrow in Bishkek), totals, registry groups, reminders (smallest threshold, once overdue), input cleaning, `contracts.finance` rights, the CSV formula guard, catalogs (permission, webhooks, notifications, widget, settings, the `property_sale` upgrade), notification texts.
- `test/contracts-payments.db.test.js` (`CONTRACTS_DB_TEST=1`; the Masterplan part also `MASTERPLAN_DB_TEST=1`): deposit planned by the seller and confirmed only by finance, finance seeing only contracts with money, schedule with the deposit offset, partial payments and their deletion, chips, registry / inbox / CSV guard, reminders sent once, paid in full; with Masterplan: deposit → «Задаток», signed → «Договор» (number, date, amount), payments → paid amount, 100 % → «Продано», a unit in «Резерв» or a person without Masterplan rights → a note, not a failure, history on both sides.
