# Masterplan

A development project (a residential complex, a cottage village) as one live picture: the **site plan** with clickable contours, the **chessboard** of apartment buildings, the **registry** of units, **sales statuses** with reserves and bookings on a timer, **prices** with history, and **construction progress** with photo reports from the site. Built from the specification «ТЗ: модуль „Мастерплан“ v1.0» (written for a standalone app on top of Bitrix24) and adapted to the portal: the portal's CRM instead of Bitrix24, portal users, roles and permissions instead of SSO, the notification center, the scheduler, the portal's file storage.

Module id `masterplan`, app `/app/masterplan`, API `/api/app/masterplan`. **Off by default** — an administrator turns it on in *Settings → Modules*, then grants roles (below).

- [What was built](#what-was-built)
- [Adaptation decisions](#adaptation-decisions)
- [Roles and zones](#roles-and-zones)
- [Sales statuses](#sales-statuses)
- [Construction](#construction)
- [Data model](#data-model)
- [Settings](#settings)
- [API](#api)
- [Integrations](#integrations)
- [Frontend](#frontend)
- [Tests](#tests)
- [Deferred to v2 / v3 and open questions](#deferred-to-v2--v3-and-open-questions)

## What was built

The MVP of the spec (§15, stage 1) plus the parts the customer called core:

| Area | Spec | Status |
|------|------|--------|
| Configurable tree: project → up to 8 levels (skippable), level types per project, plots, objects, units; drag & drop moves with history; bulk «A-1-01 … A-1-15» and apartments «floors × per floor» | §4 | done |
| Object types directory (seeded per §4.3: sellable, category, node kind, icon, colour, stage set), editable | §4.3 | done |
| Unit card: characteristics, commerce, statuses, deal, contract, payments summary; extensible attributes (`attrs` JSONB) | §5.5, §9.4 | done (payment schedule → v2) |
| Interactive site plan: image/SVG background, polygons, zoom/pan/pinch, fit, hover tooltip, side card, layers Sales / Construction / Types, legend with counters, filters, breadcrumbs, drill into sectors, plans per node (close-ups) | §9.1 | done (minimap, "responsibles" layer → v2) |
| Contour editor for administrators (draw, drag, delete points, bind to a node) | §9.1 | done |
| Scheme view: the same data as tiles when no contours exist yet | — | extra |
| Chessboard: sections × risers × floors, price / price per m² / area, filters, multi-select → bulk price / close / open | §9.2 | done |
| Registry: columns, sort, filters, bulk price change (%, amount, set), Excel (.xlsx) and CSV export by visible fields | §9.3 | done (saved presets, PDF price list → v2) |
| Excel / CSV import of units with a validation report (dry run, all or nothing) | §9.10 | done |
| Sales statuses with the transition rules of §6.2 enforced on the server; optimistic locking; «Объект только что забронирован менеджером X» | §6 | done |
| Reserve / booking with auto-expiry, 24 h / 2 h warnings, extension limits, per-manager reserve limit | §6.2, §10.1 | done |
| Bookings list with countdown, today / tomorrow highlight, actions | §9.7 | done |
| Price history, head-of-sales price-cut limit, fixed price of held units | §5.5, §10.3 | done (approval workflow → v2) |
| Construction: stage directory with weights per stage set, plan / fact / percent per stage, readiness by weights or by hand, aggregation up the tree, delay indicator, journal with photos, moderation as a project setting | §7 | done (Gantt, before/after → v2) |
| Mobile foreman flow: «+ Отчёт» → Camera → Send; photos shrunk in the browser with EXIF date / GPS, uploaded with retries | §7.3, §13.3 | done |
| Dashboard: counts / m² / sums by status, months, managers, conversion booking → contract, readiness by levels, stale objects, «sold but not built» | §9.8 | simple version |
| Settings: booking rules, prices, currencies and rates, status colours, construction thresholds, CRM stage mapping, types, stages | §9.9 | done |
| Presentation mode (no clients, managers, minimum prices, amounts, timers — on the server) | §13.3 | done |
| CRM: unit ↔ deal, deal timeline lines, deal amount sync, stage → status mapping, «Masterplan» block in the deal panel with «Подобрать объект» | §11 | done |
| Live colours (SSE), polling fallback | §13.1 | done |
| History of every change (audit trail) with the same field hiding | §8.1.4 | done |

## Adaptation decisions

| Spec (Bitrix24 app) | Portal |
|---|---|
| SSO via `user.current`, JWT in an iframe, «Войти через Битрикс24» | The portal's own sign-in and session. A person without any Masterplan role sees «Доступ ещё не выдан» with **Запросить доступ**, which notifies the module's administrators (`masterplan.access`). |
| Users screen, B24 employee binding, deactivation | Portal users; access ends when the portal account is blocked / deactivated (every request is re-checked). |
| Roles with checkboxes (v2) | Module roles are **portal permissions** `masterplan.<role>` (editable in Administration → Roles, so custom roles are possible now) plus **project assignments** with a zone. |
| Deal / contact in Bitrix24 | CRM deals (`crm_deals`) and Counterparties people / companies; checked with the person's CRM visibility (`crm/access.js`). |
| `CRM_DEAL_DETAIL_TAB` | A block in the CRM deal panel, through a new generic extension point `crm/panel/extensions.jsx` (lazy, shown only when the module is on). |
| B24 user field «Объект» on the deal | The link lives in `mp_units.deal_id`; the deal shows it through the block and a history line (`crm_events.kind = 'masterplan'`). |
| `onCrmDealUpdate` events | An in-process module event `crm.deal.stage` (`services/hooks.js` → `onModuleEvent` / `emitModuleEvent`), emitted by `crm/integrations.js` after a stage move. |
| `im.notify`, e-mail, Telegram | The notification center: bell + push / e-mail / messengers by each person's preferences; texts rendered per recipient language and region (`formatDateTime`). |
| Redis timers / locks | Postgres: row locks (`SELECT … FOR UPDATE`) + version column; timers by the scheduler (`registerJob`, advisory-locked). |
| WebSocket | Server-Sent Events (`GET /stream?project=`), the same technique as the chat; events carry ids only and the page fetches the changed units, so field hiding stays on the server. If the stream cannot stay open the page polls every minute. |
| S3 / MinIO, worker thumbnails | The portal's upload directory (`UPLOAD_DIR/masterplan/YYYY/MM`, never public), served through access-checked routes with the shared defensive headers (`shared/storage.js`). Pictures are compressed and thumbnailed **in the browser** (no image library on the server); SVG backgrounds are refused when they contain scripts or event handlers. |
| `ltree` / closure table | `path INTEGER[]` (ancestors + self) with a GIN index; subtree = `path @> ARRAY[id]`. |
| Approval of deep price cuts | MVP: a limit for heads of sales (`salesHeadMaxCutPct`), management unlimited; an approval queue is v2. |
| Bitrix24 robots | Not in the portal; the CRM stage mapping covers the main case. |

## Roles and zones

A person's roles in a project = **global roles** (portal permissions `masterplan.<role>`, valid in every project; a super administrator's `*` counts as `admin` only) **+ assignments** of the project (`mp_assignments`: a person or a group, a role, optionally a node — the zone is that node's subtree — and an optional end date for temporary access). Roles add up.

- **Reading** uses every role the person has anywhere in the project (a foreman of sector A sees the whole project).
- **Acting** uses only roles whose zone contains the node acted on (that foreman reports only in sector A → `403 OUT_OF_ZONE` elsewhere).
- Nobody with no role in a project sees it (404).

| Role (spec §8.2) | Permission | Key capabilities |
|---|---|---|
| Administrator | `masterplan.admin` | everything; projects, tree, plans and contours, team, directories, settings |
| Management | `masterplan.executive` | sees everything incl. minimum prices and money; closes / opens sales; rollbacks; prices without limit; release / extend any |
| Head of sales (РОП) | `masterplan.sales_head` | reserve, book, contract, rollback, release / extend any, prices within the limit, reassign managers, minimum prices, edit characteristics |
| Sales manager | `masterplan.sales` | reserve, book own reserve, release own (with reason), extend own once; clients and amounts of own bookings only |
| Finance | `masterplan.finance` | booking → deposit, contract → sold; amounts and clients |
| Legal | `masterplan.legal` | deposit → contract (number + date), sold → handed (act date) |
| Head of construction | `masterplan.construction_head` | stages, journal, moderation, handover; sees statuses without clients or amounts |
| Foreman | `masterplan.foreman` | reports and stage progress in the zone; no sales data at all |
| Marketing | `masterplan.marketing` | media and characteristics; statuses and prices without clients |

Capabilities are defined in `modules/masterplan/constants.js` (`ROLE_CAPS`); the checks are pure functions in `rules.js`.

**Field hiding** (server side, `projectUnit()`): status — `status.view`; price, price per m², discount — `price.view`; manager and timer — `booking.view`; minimum price — `minprice.view`; client and deal — `clients.all` or own booking with `clients.own`; contract amount, paid, remaining — `amounts.all` or own with `amounts.own`. The same rules apply to the map, lists, registry, CSV / Excel export, bookings list, the deal block and the history (status events lose client / deal / amount / contract, and manager / expiry without `booking.view`; manager changes need `booking.view`; CRM-stage events need `status.view` and lose the deal id without client rights; minimum-price changes disappear). Across several projects (registry without `project`) a status filter or status sort counts only in projects where the person has `status.view`. Registry readiness (filter, sort, CSV) is the inherited one, as on the plan. **API tokens**: deal titles, linking a deal and status changes of a unit linked to a deal (which write the deal timeline / amount) also need the token's `crm` scope (`403 SCOPE_DENIED`); signed-in users are not affected. **Presentation mode** (`?presentation=1`) drops clients, managers, minimum prices, amounts and timers for everyone.

## Sales statuses

`not_for_sale` (grey) · `free` (green) · `reserve` (yellow) · `booking` (orange) · `deposit` (violet) · `contract` (blue) · `sold` (red) · `handed` (dark red). Colours are settings.

| Move | Who | Requires |
|---|---|---|
| free → reserve | sales, sales_head, admin | reserve limit per manager (heads / admins not limited); optional deal; heads may reserve for another manager |
| reserve → booking | the reserve's manager; sales_head, admin for anyone's | a CRM deal with a client when the CRM is on and `requireDeal` (otherwise a client name) |
| reserve / booking → free | its manager, sales_head, executive, admin | a reason; also automatic on expiry |
| booking → deposit | finance, admin | — |
| deposit → contract | legal, sales_head, admin | contract number and date (amount defaults to the price) |
| contract → sold | finance, admin | marks paid = contract amount |
| sold → handed | construction_head, legal, admin | act date |
| any → not_for_sale | executive, admin | a reason when the unit is held |
| not_for_sale → free | executive, admin | — |
| any other move back (rollback) | sales_head, executive, admin | a reason |

Skipping steps forward is refused (`INVALID_TRANSITION`). A held unit cannot be linked to another deal (`DEAL_LOCKED`). Returning a unit to sale (`free`, or closing it from free / reserve / booking) clears its client, deal and contract, and the history keeps what was cleared; closing sales of a unit at deposit / contract / sold / handed keeps them. Bulk closing / opening sends one summary notification per project.

**Double sale protection.** Every change locks the unit row (`SELECT … FOR UPDATE`) inside one transaction, checks the `version` the person saw and the rules, then bumps `version`. Two managers reserving one unit at once: one wins, the other gets `409 VERSION_CONFLICT` with `error: "Объект только что забронирован менеджером X"` and `info.holder = { status, manager, version }` — the status only with `status.view`, names only with `booking.view`; people with no right to change statuses (or to extend) get `403` before any lock or version check. The reserve limit is counted under a per-manager advisory lock, so parallel reserves cannot exceed it. Without a version the second request fails the rules (`SAME_STATUS`) on the locked row.

**Timers.** A reserve lasts `reserveHours`, a booking `bookingDays`. The manager extends once (`managerExtensions`), then heads of sales. Job `masterplan:bookings` (every minute) warns the manager `warnHours` before the end (default 24 h and 2 h; a timer shorter than a threshold skips it) and releases expired timers: it locks the unit, then the timer (the same order as status changes and extensions), re-checks the end under the lock (a timer extended a moment ago is kept), and the unit becomes free only if that timer still holds it; the manager and heads of sales of the zone are notified; the CRM deal gets a line.

**Prices.** Changes are written to `mp_price_history` (old, new, currency, author, reason) and the history. With `fixPriceOnBooking` held units keep their price (single changes `409 PRICE_FIXED`, bulk changes skip them). Heads of sales cannot cut more than `salesHeadMaxCutPct` at once (`403 PRICE_LIMIT`); management can.

## Construction

- **Stage sets** (`lowrise`, `apartment`, `infra`, seeded from §7.1 with weights summing to 100) — a type points at a set. Removing a stage archives it.
- **Object stages** (`mp_node_stages`): plan / fact dates, percent, state (`not_started`, `in_progress`, `done`, `paused` + reason). Fact start / end and the state follow the percent unless given.
- **Readiness** = Σ(weight × percent) / Σ weights, or entered by hand (per node, or the whole project in `readinessMode: 'manual'`). Units without own stages (apartments) inherit their building's; levels show the area-weighted average of construction objects below.
- **Schedule state**: `behind` (an unfinished stage past its planned end — the worst delay in days), `ahead`, `on_track`, `no_plan`; red over `delayAlertDays`.
- **Journal**: a report has objects (a level means every construction object inside), a stage and percent, the date of the state, a comment and up to 30 photos / videos. Publishing moves the stage percent of every target of that stage set (unless a report with a later date is already published for that object and stage: a late or backdated report never moves progress back), recomputes readiness and sets "last report". The author needs `build.edit` on every chosen object and every object the report moves (e.g. the building above a chosen apartment). A report is reviewed once (a second publish / return gets `409 ALREADY_PUBLISHED`). With project `moderation` a foreman's report goes to `review`; heads of construction publish or return it. Visible to sales once published (unless `visibility: internal`); drafts and reviews only to the author and moderators.
- Job `masterplan:daily` (every 6 h): objects without a report for `staleReportDays` → one summary per person and project (foremen responsible, heads of construction); delays over `delayAlertDays` → heads of construction and management (again every further week; an object back on schedule starts from the threshold again); removes uploads never attached to a report after 2 days.

## Data model

| Table | Columns |
|---|---|
| `mp_projects` | `id, name, code, address, lat, lng, description, class, currency, status, start_date, finish_date, manager_id, settings JSONB {moderation, readinessMode, levels}, sort, archived_at, created_by, created_at, updated_at` |
| `mp_types` | `id, key (seeded), name, category, node_kind ('object'|'plot'|'unit'), sellable, stage_set, icon, color, sort, archived_at` |
| `mp_stages` | `id, set_key, name, weight, sort, archived_at` |
| `mp_nodes` | `id, project_id, parent_id, path INT[], depth, kind ('level'|'plot'|'object'|'unit'), level_key, type_id, code (unique per project, case-insensitive), name, sort, description, area, build_user_id, sales_user_id, contractor, plan_start, plan_end, handover, readiness, readiness_manual, current_stage_id, last_report_at, stale_notified_at, delay_notified_days, attrs JSONB, created/updated by/at` |
| `mp_units` | 1:1 with sellable nodes: `node_id, project_id, status, version, price, currency, discount_pct, min_price, area_total, area_living, area_plot, area_terrace, rooms, bedrooms, bathrooms, levels, ceiling, floor, number, riser, finishing, payment_forms TEXT[], no_publish, manager_id, deal_id → crm_deals, person_id → cmp_people, company_id → cmp_companies, client_name, booking_id, contract_number, contract_date, contract_amount, paid_amount, act_date, status_changed_at, status_by, updated_by, updated_at` |
| `mp_bookings` | `id, unit_id, project_id, kind ('reserve'|'booking'), manager_id, deal_id, person_id, company_id, client_name, paid, amount, price (fixed at booking), currency, starts_at, ends_at, status ('active'|'released'|'expired'|'converted'), extensions, extended_by, release_reason, warned_hours, created_by, created_at, closed_at, closed_by` |
| `mp_price_history` | `id, unit_id, old_price, new_price, currency, reason, author_id, created_at` |
| `mp_node_stages` | `node_id, stage_id, plan_start, plan_end, fact_start, fact_end, percent, state, pause_reason, updated_by, updated_at` |
| `mp_reports`, `mp_report_nodes` | `id, project_id, stage_id, percent, fact_date, body, status, visibility, author_id, reviewer_id, reviewed_at, review_note, published_at, …` / `(report_id, node_id)` |
| `mp_media` | `id, project_id, node_id, report_id, kind ('photo'|'video'|'render'|'layout'|'doc'|'plan'), name, mime, size, storage_key, thumb_key, width, height, taken_at, lat, lng, created_by, created_at` |
| `mp_plans`, `mp_contours` | `id, project_id, node_id (close-up of a node), media_id, name, width, height` / `(plan_id, node_id) points JSONB [[x,y]…]` in plan coordinates |
| `mp_assignments` | `id, project_id, node_id (zone), subject_type ('user'|'group'), subject_id, role, until, created_by` |
| `mp_events` | `id, project_id, node_id, kind, data JSONB, author_id, created_at` — kinds: `created, fields, price, status, expired, extend, manager, report, report_deleted, stage, readiness, moved, bulk, import, plan, contours, team, project, crm_stage, deleted` |

All tables are created idempotently at startup (`schema.js`); the directories (types, stages) are seeded **once** (`app_settings.masterplan_seeded`). No project data is ever seeded; the demo project in the screenshots comes from the end-to-end test script.

## Settings

`modules.masterplan.settings` (catalog.js `MASTERPLAN_DEFAULTS`, sanitized by `sanitizeMasterplan`):

```js
{
  currency: 'USD', currencies: ['USD', 'KGS', 'RUB'], rates: { KGS: 87.5, RUB: 81 },   // units per 1 base
  statusColors: { not_for_sale, free, reserve, booking, deposit, contract, sold, handed },
  reserveHours: 48, bookingDays: 10, managerExtensions: 1, reserveLimit: 5, warnHours: [24, 2],
  requireDeal: true, fixPriceOnBooking: true, salesHeadMaxCutPct: 10,
  staleReportDays: 14, delayAlertDays: 7, maxUploadMb: 50,
  stageMap: { '<crm stage id>': 'booking' | 'deposit' | 'contract' | 'sold' | 'free' },
  syncDealAmount: true,
}
```

Edited in *Settings → Modules → Masterplan* (console, `settings.modules`) or inside the app by `masterplan.admin` (`/app/masterplan/settings`, also the types and stages directories). Project settings (moderation, readiness mode, level types) are on the project's *Structure → Project* tab.

## API

`/api/app/masterplan` — JSON, errors `{ success: false, code, error, info? }`. Every route checks the project / node rights above.

| Method | Path | Purpose |
|---|---|---|
| GET | `/meta` | public settings, statuses, roles, directories (types, stages), projects with my roles and capabilities, CRM / Counterparties enabled |
| GET / PUT | `/settings` | module settings (`masterplan.admin`) |
| GET | `/users`, `/groups` | pickers |
| POST | `/access-request` | `{ note }` → notifies administrators (at most once per person per 10 minutes; repeats answer OK silently) |
| GET / PUT | `/types` | object types / replace (admin) |
| GET / PUT | `/stages`, `/stages/:set` | stage sets / replace one set (admin) |
| GET / POST | `/projects` | visible projects (with counts by status) / create (admin) |
| GET / PUT / DELETE | `/projects/:id` | project; update (configure); delete (admin, only without held units → `409 PROJECT_HAS_SALES`) |
| GET | `/projects/:id/map?presentation=1` | `{ project, nodes: [Node], plans, contours, caps }` — everything for the plan, chessboard and filters |
| GET / PUT | `/projects/:id/team` | assignments `[{ subjectType, subjectId, role, nodeId?, until? }]` |
| GET | `/projects/:id/construction?filter=stale|behind|mine` | objects with readiness, stage, schedule, last report, `canReport`; `review` = reports waiting |
| GET | `/projects/:id/dashboard` | `dashboard` capability |
| POST | `/projects/:id/plans` · PUT/DELETE `/plans/:id` · PUT `/plans/:id/contours` | plans and `{ contours: [{ nodeId, points \| null }] }` |
| GET | `/stream?project=` | SSE: `hello`, `units {ids}`, `tree` |
| POST | `/nodes` · `/nodes/bulk` | create one / a line (`prefix, from, count, pad, suffix, nameTemplate`) or apartments (`grid: { floorFrom, floorTo, perFloor, startNumber, numbering }`) |
| GET / PUT / DELETE | `/nodes/:id` | card `{ node, breadcrumbs, summary, stages, reports, media, priceHistory, responsible, caps, actions }` / update (groups of fields by right; `version` for sales fields) / delete (`409 NODE_HAS_SALES`) |
| POST | `/nodes/:id/move` | `{ parentId, sort? }` |
| GET | `/nodes/:id/events?before=` | history |
| PUT | `/nodes/:id/stages/:stageId` · `/nodes/:id/readiness` | stage plan / fact / percent; manual readiness (`null` = computed) |
| GET | `/units?project&node&ids&q&status&types&priceMin…&sort&order&page&pageSize&presentation` | registry |
| GET | `/units/export.csv` | CSV (BOM, `;`), only visible columns |
| POST | `/units/import` | `{ projectId, rows, dryRun }` → `{ ok, created, updated, errors: [{ row, field, code, message }] }` |
| POST | `/units/bulk-price` · `/units/bulk-status` | `{ ids, mode, value, reason }` / `{ ids, to: 'not_for_sale'|'free', reason }` → `{ affected, skipped }` |
| GET | `/units/:id` | one node with its unit |
| POST | `/units/:id/status` | `{ to, version, reason, dealId, client, managerId, contractNumber, contractDate, contractAmount, paidAmount, actDate, paid, amount }` |
| POST | `/units/:id/extend` · `/units/:id/manager` | extend the timer / reassign the manager |
| GET | `/bookings?project&scope=mine|all&kind` | active timers with `canExtend / canRelease / canBook / canDeposit` |
| GET | `/deals/:dealId/units` | units linked to a CRM deal (with CRM rights) |
| GET / POST | `/reports` | journal / new report `{ projectId, nodeIds, stageId, percent, factDate, body, mediaIds, submit }` |
| GET / DELETE | `/reports/:id` · POST `/reports/:id/review` | `{ action: 'publish'|'reject', note }` |
| POST / GET / DELETE | `/media` (multipart `file`, `thumb`, `projectId`, `nodeId?`, `kind`, `takenAt`, `lat`, `lng`, `width`, `height`) · `/media/:id?thumb=1&download=1` | uploads and access-checked downloads (uploads refused before anything is written unless the person has `media.edit` or `build.edit` somewhere) |

Error codes: `VERSION_CONFLICT, SAME_STATUS, INVALID_TRANSITION, FORBIDDEN, NOT_OWN, REASON_REQUIRED, DEAL_REQUIRED, CLIENT_REQUIRED, CONTRACT_REQUIRED, ACT_DATE_REQUIRED, RESERVE_LIMIT, EXTEND_LIMIT, NOT_HELD, DEAL_LOCKED, DEAL_CLOSED, CRM_DISABLED, PRICE_FIXED, PRICE_LIMIT, OUT_OF_ZONE, ALREADY_PUBLISHED, SCOPE_DENIED, CODE_TAKEN (node codes only; other duplicates `DUPLICATE`), TOO_DEEP, INVALID_TYPE, INVALID_PARENT, NODE_HAS_SALES, PROJECT_HAS_SALES, TYPE_IN_USE, INVALID_CONTOUR, FILE_TYPE, FILE_CONTENT, MEDIA_IN_USE`. The API reference (`/developers`) has the Masterplan section; API tokens get the `masterplan` area automatically.

## Integrations

- **Notifications** (`notificationCatalog.js`, group `masterplan`): `masterplan.expiring`, `masterplan.expired`, `masterplan.status` (booked / deposit / contract / sold / handed, rollbacks, closing — to heads of sales and management in the zone; also when a CRM stage could not be applied), `masterplan.report` (managers holding units under the report's objects + the sales responsible), `masterplan.review`, `masterplan.construction` (stale, delays), `masterplan.access`. Texts in the recipient's language, moments in their zone and formats.
- **Scheduler**: `masterplan:bookings` (1 min), `masterplan:daily` (6 h).
- **CRM**: see [Adaptation decisions](#adaptation-decisions). The deal block appears in the deal panel under the fields; «Подобрать объект» opens the plan with `?deal=` so the reserve / booking dialog already has the deal. When `syncDealAmount`, booking or contracting a unit writes its price / contract amount into the deal amount (a `field` event in the deal history).
- **Counterparties**: clients come from the deal (person / company); a client name is stored for display only (spec §13.2).

## Frontend

`src/frontend/src/modules/masterplan`: `MasterplanApp.jsx` (the `mod-shell` with sidebar + mobile drawer; routes `/app/masterplan`, `/projects`, `/bookings`, `/settings`, `/p/:projectId/plan|chess|registry|construction|dashboard|structure`), `MpContext.jsx` (module meta; `ProjectProvider` with the map and the SSE stream), `pages/*`, `components/*` (status pill, filters & legend, unit card, status dialog, deal picker, report dialog, bulk dialogs, import dialog, feed, history), `plan/*` (SVG canvas with zoom / pan / pinch and the editor, tiles), `structure/*` (tree editor, node editor, plans & contours, team, project form), `media/*` (photo compression and EXIF, Excel via exceljs on demand), `integrations/DealUnitsBlock.jsx`, `MasterplanSettings.jsx` (console). Strings in `i18n/masterplan.js` (RU + EN), help in `help/content/masterplan.js`, app icon `siteplan`. Dates use `lib/datetime.js` and `DateField`.

## Tests

- `src/backend/test/masterplan.test.js` (node:test, no database): catalog and sanitizer, permissions and notification kinds, directories, global roles and zones, field hiding incl. presentation mode, every transition of §6.2 with its requirements, reserve limit, extensions, deal lock and conflict text, prices (modes, head-of-sales limit), readiness weights, schedule states, inheritance up and down the tree, bulk codes and apartment grids, timer warnings, input cleaning (unit fields, attributes, contours, SVG, CSV, currencies).
- `src/backend/test/masterplan.db.test.js` — against a **test** database only: a real double-booking race, zones on the journal, the expiry job, expiry vs a concurrent extension, the reserve-limit race, rights before the version check, closing a sold unit, backdated reports, double review. Skipped unless `MASTERPLAN_DB_TEST=1` (so `npm test` needs no database).
- End-to-end (scratch scripts, not in the repo): the whole API flow with nine accounts and the browser screenshots on desktop and phone, light and dark.

## Deferred to v2 / v3 and open questions

Deferred: payment schedules (plan / fact), price-change approval queue, saved registry presets and the PDF price list, «responsibles» layer and minimap on the plan, Gantt plan / fact, before / after photo comparison, monthly PDF report, watermarks, report comments by technical supervision, external agent and investor roles (the capabilities model is ready: add a role in `ROLE_CAPS` and a permission), contour import / export (SVG / GeoJSON), currency display switch, public showcase and buyer cabinet (v3), offline upload queue surviving a page reload (today retries happen while the page is open).

Open questions of the spec (§18) that change behaviour, and where the answer goes:

1. Hierarchy per project and a vector plan — level types per project are configurable; SVG backgrounds are supported.
2. Full list of types and what is sold — the types directory.
3. Booking regulations — `reserveHours`, `bookingDays`, `managerExtensions`, `reserveLimit`, `requireDeal`, paid booking flag.
4. Payment schedule in Masterplan or 1C — not built yet (only contract amount / paid / remaining).
5. Report moderation — a per-project switch.
6. Finishing options — fixed list `pso, rough, whitebox, turnkey, furnished` (translations), extend in `constants.js`.
7. Deal stages → unit statuses per pipeline — `stageMap` in the settings.
8. Who administers — grant `masterplan.admin` through a portal role.
9. Showcase / buyer cabinet — v3; the API is ready for read-only use.
10. Hosting and data jurisdiction — the portal's own server and database.
