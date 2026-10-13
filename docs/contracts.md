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
| `/app/contracts/calendar` | **Expiry calendar**: twelve months as a heat strip (contracts ending ↔ refusal deadlines ↻), then each month's contracts by day |
| `/app/contracts/settings` | Settings for `contracts.admin` without console rights |

Registry chips (each with a counter under the current search): **Все** (everything but the archive), **Мои** (created, owner or lawyer), **Ждут меня** (an approval stage or a question waiting for me), **Срочные** (in approval with any urgency level but the calmest), **Просрочено** (approval stage overdue), **В работе** (draft → approved), **Действуют** (in force or expiring), **Истекают за N дней**, **Без подписанной версии** (approved / signed / in force without a version marked signed), **Отработано** (the archive: completed, terminated, rejected — spec §6.4 calls it «Архив», §9 «Отработано»).

Columns: number (and the counterparty's number), counterparty · subject, type, amount (or «Рамочный»), end date (red past or < 7 days, yellow inside the expiring window, ↻ auto-prolongation), status (with the approval urgency, ⏰ when overdue, ✍? without a signed version), owner. Default order: overdue approvals, questions, approvals by urgency, expiring, then the nearest end date.

Keyboard: `/` focuses the search; in the card ↑ / ↓ / Esc. The new-contract form is one column (subject, counterparty, amount, file first) and keeps an unfinished draft in the browser.

## The card

Header: number, status, type, direction, subject, counterparty ⇄ legal entity, amount, term, the refusal deadline, owner and lawyer. Below: the approval path (`<ApprovalPath />`) and the decision buttons (`<ApprovalActions />`) — while the contract is in approval, **open high risks are shown right above them** — then the manual status steps the server allows the person, and the tabs:

| Tab | Content |
|-----|---------|
| Обзор | The fields (edit opens the form) and the risks |
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

Fields can be changed in Проект, Нужен ответ and Отклонён by the contract's people; `contracts.legal` / `contracts.admin` also later (e.g. a new end date). In approval they are locked (`403 LOCKED`); versions, risks and links are not. The archive (Завершён, Расторгнут) is read-only except for `contracts.admin`. Only a draft (or rejected) contract can be deleted, by its creator or a lawyer.

## Approval

Type `contracts.contract` (`modules/contracts/approval.js`), adminPermission `contracts.admin`. Route conditions may test **amount** (money), **type**, **direction**, **legal entity** and **framework**. Without a saved route the approvals service falls back to "any `contracts.admin`" (spec §10: configure the «Директор» stage in Settings → Approvals). `load()` gives the title «subject · counterparty», the number, the amount (none for a framework contract), the author (the business owner, else the creator) and the card link. Urgency levels are the approvals settings'.

## Versions and files

`POST /contracts/:id/versions` (multipart `file`, `comment`, `signed` for lawyers). Blobs are stored under `UPLOAD_DIR/contracts/<year>/<month>/` with random names, PDF and image contents are checked against their extension (`FILE_CONTENT`), and they are served only by `GET /versions/:id/file` after the contract's access check, with `nosniff` and the sandbox CSP of Files (`shared/storage.js sendBlob`); only safe types open inline. Office files preview through the document conversion service (`/versions/:id/preview.pdf`). Limit: `maxUploadMb`.

## Risks and discussion

Risks have a per-contract number (#1, #2…), text, clause, importance (high / medium / low) and status (open / accepted / fixed, with who resolved it). The contract's lawyer, `contracts.legal` and `contracts.admin` manage them. A new **high** risk notifies the owner and the creator. The conversation is a chat entity (`registerChatEntity('contract')`): access is the contract's, the creator, owner and lawyer follow it; status changes, versions, risks and prolongations appear in it as system lines (`modules/contracts/chatEvents.jsx`) once the conversation exists.

## Links

- **Purchase requests**: the Procurement module links requests to a contract; the card lists them with `GET /api/app/procurement/requests?contract=<id>` (a 404 / disabled module just hides the list). Procurement's contract picker uses `GET /api/app/contracts/contracts?search=…&pageSize=20` (visible contracts with `id`, `number`, `title`, `counterparty`).
- **CRM deal** (`dealId`): set only to a deal the person may see in the CRM; `?deal=<id>` filters the registry.
- **Masterplan** (`mpProjectId`, `mpNodeId`): a project or any object of a project the person sees.
- **Counterparty**: a company of Counterparties (`companyId`; its name is copied into `counterparty`) or plain text when the module is off. **Legal entity**: the shared directory `services/legalEntities.js` (default entity preselected).

## Dates, reminders, the expiry job

`contracts:daily` (every 10 minutes, scheduler advisory lock, the portal's day):

1. **Dates** (`dateTransition`): start reached → Действует; within `expiringDays` of the end → Истекает; past the end → Завершён, or — with auto-prolongation — the **next term** of the same length (whole months stay whole months, no start date = a year), recorded as «пролонгирован до …».
2. **Reminders** (`dueReminders`), to the owner and the lawyer (the creator when neither is set): at each of `reminderDays` (30 and 7) before the **end** (contracts without auto-prolongation) and before the **refusal deadline** (`end − noticeDays`, auto-prolonged contracts). Only the smallest threshold reached is sent — a contract created 5 days before its end gets the 7-day reminder, never a late 30-day one. `(contract, kind, days, target day)` is inserted into `ctr_reminders` by the statement that decides to send, so each goes out once; a new term makes new targets.

The «Ждёт меня» inbox gets a provider `contracts.deadlines` for the owner and the lawyer: a refusal deadline within 14 days, or the end of a non-prolonging contract within 7 days.

## Access

| Who | Sees | Does |
|-----|------|------|
| `contracts.view_all` | every contract | — |
| `contracts.legal` | every contract | edits any time, risks, signed / in force / completed / terminated, marks signed versions |
| `contracts.admin` | every contract | everything of a lawyer, the archive, settings, the approval route |
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

## Notifications and webhooks

Notification kinds (group *Contracts*): `contracts.assigned` (I became the lawyer / owner), `contracts.status` (signed, in force, expiring, completed, terminated, prolonged; approved / rejected to the owner and lawyer besides the author, who hears from the approvals service), `contracts.version`, `contracts.risk` (high risks), `contracts.reminder`. Texts follow the recipient's language and date format. Approval notifications are the `approval.*` kinds.

Webhooks (area `contracts`): `contracts.created`, `contracts.updated` (`changes`), `contracts.status_changed` (`from`, `to`), `contracts.prolonged`, `contracts.version_added`, `contracts.risk_changed`, `contracts.reminder`, `contracts.deleted` — payload `{ contract: {…, lawyer, owner, createdBy as ids}, … }`, delivered only to webhooks whose person may see the contract.

## Data model

| Table | Content |
|-------|---------|
| `ctr_contracts` | `seq`, `number` (unique), `ext_number`, `title`, `type_key`, `direction`, `company_id`, `counterparty`, `legal_entity_id`, `framework`, `amount`, `currency`, `payment_terms`, `description`, `concluded_on` / `starts_on` / `ends_on` (DATE, read as text), `auto_renew`, `notice_days`, `lawyer_id`, `owner_id`, `deal_id`, `mp_project_id`, `mp_node_id`, `status`, `status_changed_at`, `current_version_id`, `signed_version_id`, `signed_at`, `signed_by`, `terminated_reason`, `created_by`, `updated_by` |
| `ctr_versions` | `no` per contract, `name`, `ext`, `mime`, `size`, `storage_key`, `comment`, `signed`, `created_by`, `created_at` |
| `ctr_risks` | `no` per contract, `text`, `clause`, `importance`, `status`, `resolved_by`, `resolved_at` |
| `ctr_events` | history: `created`, `updated` (changes), `status` (from, to, source), `prolonged`, `version`, `current`, `signed_mark`, `risk`, `risk_update`, `risk_delete` |
| `ctr_reminders` | `(contract_id, kind, days, target)` sent once |

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
| GET | `/export.csv` | The list as CSV (`;`, UTF-8 BOM), same filters and rights, ≤ 5 000 rows |
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
| POST | `/jobs/daily` | Run the expiry job now (`contracts.admin`) |

Sending to approval and decisions use the approvals API: `POST /api/app/approvals/process/contracts.contract/:id/start` etc. Errors: `NOT_FOUND`, `FORBIDDEN`, `LOCKED`, `BAD_TRANSITION`, `STALE`, `IN_APPROVAL`, `COMMENT_REQUIRED`, `VERSION_REQUIRED`, `TITLE_REQUIRED`, `BAD_TYPE`, `BAD_DATES`, `INVALID_DATE`, `BAD_AMOUNT`, `BAD_USER`, `BAD_COMPANY`, `BAD_LEGAL_ENTITY`, `BAD_DEAL`, `BAD_OBJECT`, `FILE_CONTENT`, `FILE_TOO_LARGE`, `NO_FILE`.

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
  jobs.js       contracts:daily (dates, reminders)
  chat.js       chat entity 'contract'
  messages.js   notification texts (ru / en)
  schema.js     tables + job + chat registration
src/frontend/src/modules/contracts/
  ContractsApp.jsx, ContractsContext.jsx, ContractsSettings.jsx, chatEvents.jsx, contracts.css
  pages/RegistryPage.jsx, CalendarPage.jsx, SettingsPage.jsx
  card/ContractCard.jsx, Overview.jsx, Risks.jsx, Versions.jsx, Discussion.jsx, Links.jsx, History.jsx, StatusActions.jsx
  components/ContractForm.jsx, bits.jsx
src/frontend/src/i18n/contracts.js, src/frontend/src/help/content/contracts.js
```

- `test/contracts.test.js` (always): transitions and rights, approval → status, numbering, day arithmetic, expiring / completion / prolongation, reminders (thresholds, never late), input cleaning, settings sanitizing and «off by default», webhook and notification catalogs, notification texts with the recipient's date format.
- `test/contracts.db.test.js` (`CONTRACTS_DB_TEST=1 ENV_FILE_PATH=… node --test test/contracts.db.test.js`, a test database only): numbering (also concurrent), visibility per role (stranger, same group, view_all, lawyer, owner, approver), versions (content check, current), risks (lawyer only), approval start → question → answer → approve with the status following, locked fields, enforced transitions, signing → in force, the expiry job (expiring, reminders 30 and 7 days each once, completion), auto-prolongation, termination reason, deleting a draft, history.
