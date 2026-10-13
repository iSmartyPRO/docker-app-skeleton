# Masterplan

A development project (a residential complex, a cottage village) as one live picture: the **site plan** with clickable contours, the **chessboard** of apartment buildings, the **registry** of units, **sales statuses** with reserves and bookings on a timer, **prices** with history, and **construction progress** with photo reports from the site. Built from the specification «ТЗ: модуль „Мастерплан“ v1.0» (written for a standalone app on top of Bitrix24) and adapted to the portal: the portal's CRM instead of Bitrix24, portal users, roles and permissions instead of SSO, the notification center, the scheduler, the portal's file storage.

Module id `masterplan`, app `/app/masterplan`, API `/api/app/masterplan`. **Off by default** — an administrator turns it on in *Settings → Modules*, then grants roles (below).

- [What was built](#what-was-built)
- [Adaptation decisions](#adaptation-decisions)
- [Roles and zones](#roles-and-zones)
- [Sales statuses](#sales-statuses)
- [Construction](#construction)
- [Site plan: numbers, search, sectors](#site-plan-numbers-search-sectors)
- [Point markers](#point-markers)
- [Unified card of a building](#unified-card-of-a-building)
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
| Point markers: an object placed as a numbered circle instead of a contour (click-by-click placement, drag, size, label, contour ↔ point, undo) | — | extra |
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
| Status migration by an administrator («Перенести статус»: card, registry bulk, import columns) | WH ТЗ 1 | done |
| Price grid by payment form (100 % / installments, first payment, term, monthly payment) with dated versions; variants in the card and the presentation | WH ТЗ 2 | done |
| Planned price per m² at completion; price per m² over time on the dashboard | WH ТЗ 3 | done |
| Bulk move of nodes in the tree (select several → move under another parent) | WH ТЗ 5 | done |

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

### Status migration

For bookings and sales made before the portal (or outside it). **Who**: Masterplan administrators of the project (`masterplan.admin`, or an `admin` assignment on the whole project — not a zone); everyone else gets `403`. **What**: any status from any status, bypassing the transition chain of §6.2, the CRM-deal requirement and the timers. A **reason is mandatory**. Optional data: status date (`date`, default today — becomes `status_changed_at` and the month on the dashboard), client name, manager (a portal user), CRM deal (`dealId`, checked with the person's CRM rights, closed deals allowed), contract number / date / amount, paid amount, act date, and for a reserve / booking an end date (`endsAt`). **Timers**: without `endsAt` a migrated reserve / booking has no timer row and never expires (it is not in *Bookings*, which lists running timers); with `endsAt` (end of that day, UTC; must be in the future) it gets a normal timer. A running timer of the unit is closed (`released`, reason `migration: …`). Contract / sold / handed get the contract date = status date and the amount = price unless given; sold / handed are paid in full unless `paidAmount` is given; handed gets the act date = status date. Moving to free clears the client, deal and contract (kept in the event as `cleared`), as a normal return to sale. The row is locked and `version` checked (`409 VERSION_CONFLICT`). No notifications and no CRM side effects (the deal timeline and amount are not touched). History: a `migration` event `{ from, to, date, reason, manager, client, deal, contract, amount, paid, actDate, endsAt | noTimer, cleared, source }` — shown with the same field hiding as status events.

Where: the unit card (**Перенести статус…**, `actions.migrate`), the registry bulk bar (selected units, same data for all; skipped units with a reason), and the **import**: a row whose «Статус» is a held status (Резерв … Передано) is a migration, with the columns «Клиент», «Менеджер» (login or display name), «Дата статуса», «Номер договора», «Дата договора», «Сумма договора», «Бронь до» (dates `YYYY-MM-DD` or `ДД.ММ.ГГГГ`); one reason for the whole file is required (`reason`). Free / not for sale of a held unit through the import is still refused (`UNIT_HELD`) — use the card for that.

### Prices by payment form

A project has **versions of a price grid**, each effective from a date (`mp_price_grids`); a version may be for one object type (overrides the project's for units of that type). A version holds up to 8 **payment plans** `{ key, name, mode, ppm | markupPct, firstPct, months }`: `base` — the unit's own price (the 100 % price; the unit price stays the base of everything: registry, exports, minimum price, bulk changes), `ppm` — price per m² × the unit's area (total area, else plot area; only in the grid's currency), `markup` — the unit price ± %. The **schedule**: first payment = total × firstPct (whole currency units), the rest in `months` equal payments, the last one takes the rounding difference (`paymentSchedule`, unit-tested; the client repeats the same arithmetic in `modules/masterplan/pricing.js`). A version also holds the **planned price per m² at completion** (`planned_ppm`), shown as an argument with the planned total and the growth against today's price per m². The version in force = the latest with `effective_from ≤ today` (portal time zone); later ones are scheduled; old ones are the history. Versions that were in force cannot be deleted (`409 GRID_IN_HISTORY`) unless added within the last day (a mistake).

Edited on *Structure → Prices* (project administrators) with a live preview on a sample unit. The project shape carries `pricing: { today, grids: [versions in force], upcoming }` for people with `price.view` (also in presentation mode); `components/PaymentOptions.jsx` (`{ unit, project, presentation, node? }`) renders the variants in the card and the presentation and renders nothing without a grid, a price or the right to see prices. The unit shape carries `typeId` to pick a type's own grid.

**Dashboard**: «Цена за м² во времени» (`dashboard.prices`, `price.view`): the area-weighted average list price per m² in the base currency at the end of each of the last 12 months and today, reconstructed from `mp_price_history` (a unit counts from its creation), the per-m² plans of the project-wide grid versions as steps, and the planned price at completion (dashed, to the project's finish date). Inline SVG, no chart library.

### Bulk move

*Structure → Дерево → Выбрать несколько*: tick nodes, **Перенести…**, choose the new parent (or the project root). `POST /nodes/bulk-move { ids, parentId }` — project administrators, nodes of one project, each with the checks of a single move (not into itself or its subtree, depth ≤ 8), in one transaction: all or nothing. A node whose ancestor is also chosen travels with it. Each moved node gets a `moved` event with `bulk: n`; order = the order chosen.

## Construction

- **Stage sets** (`lowrise`, `apartment`, `infra`, seeded from §7.1 with weights summing to 100) — a type points at a set. Removing a stage archives it.
- **Object stages** (`mp_node_stages`): plan / fact dates, percent, state (`not_started`, `in_progress`, `done`, `paused` + reason). Fact start / end and the state follow the percent unless given.
- **Readiness** = Σ(weight × percent) / Σ weights, or entered by hand (per node, or the whole project in `readinessMode: 'manual'`). Units without own stages (apartments) inherit their building's; levels show the area-weighted average of construction objects below.
- **Schedule state**: `behind` (an unfinished stage past its planned end — the worst delay in days), `ahead`, `on_track`, `no_plan`; red over `delayAlertDays`.
- **Journal**: a report has objects (a level means every construction object inside), a stage and percent, the date of the state, a comment and up to 30 photos / videos. Publishing moves the stage percent of every target of that stage set (unless a report with a later date is already published for that object and stage: a late or backdated report never moves progress back), recomputes readiness and sets "last report". The author needs `build.edit` on every chosen object and every object the report moves (e.g. the building above a chosen apartment). A report is reviewed once (a second publish / return gets `409 ALREADY_PUBLISHED`). With project `moderation` a foreman's report goes to `review`; heads of construction publish or return it. Visible to sales once published (unless `visibility: internal`); drafts and reviews only to the author and moderators.
- **Correcting and deleting reports** (rules in `rules.js → reportRights`, enforced on the server on the locked row):
  - *Moderators* — `build.moderate` on every object of the report (heads of construction in their zone, project and module administrators): edit and delete any report, any status, at any time.
  - *The author* — only while still holding `build.edit` on every object of the report (zone): drafts, reports under review and returned ones; a **published** report for **24 hours** after publishing (`REPORT_AUTHOR_HOURS`) — enough to fix a typo or a wrong photo; after that the report is part of the record and only a moderator changes it (`403 REPORT_LOCKED`). The feed shows the author "you can edit or delete it until …" and, later, why the menu is gone.
  - Everyone else (another foreman of the zone, sales, a head of another sector): never (`403`).
  - *Edit* (`PUT /reports/:id`): comment, date of the state, percent, removing / adding photos (own uploads not yet attached; ≤ 30). Objects and stage do not change — delete and report again. `submit: true` sends a draft / returned report to review again (published at once for a moderator or without moderation). History: `report_edited` with what changed (percent from → to, date, photos removed / added, status).
  - *Delete one photo* (`DELETE /reports/:id/media/:mediaId`, or the generic `DELETE /media/:id`, which delegates for report files): same rights as editing; the row and the file + preview leave the disk.
  - *Delete a report* (`DELETE /reports/:id`): a hard delete with a `report_deleted` history event on each object (status, stage, percent, date, author, number of photos, progress taken back); every photo / video file is removed from disk (each upload belongs to one report only).
  - **Progress after delete / correction.** Applying a report records, for each object it moves, the stage percent before it and the moment (`mp_report_nodes.prev_percent`, `applied_at`). The reports applied to one object and stage form a chain in application order. Removing a link (`unapplyReport`): if a later report was applied after it, that report inherits its "before" and the stage keeps its value (the newer fact stands); if it was the last one, the stage goes back to its "before" — or to the newest remaining report that had been skipped because of it (a late, older-dated report). The stage is changed only while it still shows this report's percent, so a correction by hand in the stage editor is never overwritten. Reports published before this bookkeeping (no `applied_at`) fall back to dates: when it was the newest report, the stage goes back to the newest remaining report's percent, or to 0 when nothing else (no report, no edit by hand) ever set that stage. A corrected percent or date of a published report = take back + apply again by the same newest-fact rule (a correction does not count as a new visit for "last report"). Readiness is recomputed for every object moved; the live map refreshes.
  - The feed shows "40 % → 55 %": the recorded "before" of a published report; for a report not yet published, the stage as it is now (what publishing would change).
- Job `masterplan:daily` (every 6 h): objects without a report for `staleReportDays` → one summary per person and project (foremen responsible, heads of construction); delays over `delayAlertDays` → heads of construction and management (again every further week; an object back on schedule starts from the threshold again); removes uploads never attached to a report after 2 days.

## Site plan: numbers, search, sectors

**Numbers on the plan** (`plan/labels.js`, pure, tested). For every contour at the current zoom: the number is drawn inside when the *text itself* fits — a rectangle of the label's width (≈ 0.6 em per digit) × its height, centred at the contour's centroid, must lie inside the polygon (corners and edge midpoints) — not when the contour's box is wider than a fixed 34 × 16 px. The font follows the contour's smaller side on screen, 9 to 14 px, with a white outline (`paint-order: stroke`, outline width kept constant on screen). A number that does not fit becomes a **round badge** in the contour's colour (status on the Sales layer) at its centre, as on the printed plan. In **auto** mode badges are placed from the top of the drawing down, and a badge that would cover a label already placed is hidden (the lower one loses); **always** shows every badge; **hide** shows no numbers (sector names stay). The switch «Номера: авто / всегда / скрыть» sits above the plan and is remembered per person in the browser (`mp_labels_<userId>`; the module has no server-side preferences); presentation mode has its own memory and starts with **always**. On White Hills (82 contours, 3350 × 2000 plan) every number fits as text from zoom ≈ 0.28 — the fit button (⤢) on a 1440 px screen gives ≈ 0.32, so all 82 are readable and none overlaps.

**Search** (`components/PlanSearch.jsx`). The text still dims what does not match, now also through ancestors (an apartment matches its building's name) and by the old number. Under the field a list offers buildings, levels and units by code, name, apartment number or old number (exact code / name first, then exact old number, then prefixes; buildings before the units inside). Picking one — or Enter for the first — zooms the plan to its contour (or the nearest ancestor drawn: an apartment shows its building), keeping it clear of the side card, and opens its card. The registry search (`GET /units?q=`) also matches the old number and the name / code of the building a unit is in («Апарт-корпус 40» → its 42 apartments).

**Old numbers** (transition from the previous sales plan). Stored in `attrs.oldNumber` ("14", "блок 1"). A one-time backfill at startup (`buildings.js → ensureBuildingSchema`, flag `app_settings.masterplan_old_numbers`) parses descriptions such as «На прежнем генплане продаж — №14.» / «… — блок 1.» / «Было: 7» (`parseOldNumber`, tested); nodes that already have the attribute are left alone and a number removed later is not brought back. Shown in the hover tooltip («Было №14»), as a chip in the card header (edited right there with ✎ by those who may edit attributes: configure, `unit.edit`, `build.edit`), and in the structure editor's attributes.

**Sectors and overlapping contours.** Contours may overlap (sectors meet on a narrow strip). Levels are drawn under objects and, within each group, bigger contours under smaller ones, so a click always lands on the smallest, top-most object; a click on a sector outside its houses zooms into the sector. In the contour editor **Контур по объектам** draws the chosen node's contour around the contours of the objects inside it (convex hull pushed out by 0.8 % of the plan), ready to adjust and save.

**Sales colour of a building** with several units: by the share of free units — from the colour of the furthest status of the others (none free) to «free» (all free); one free unit already reads green-ish.

## Point markers

An object can stand on a plan as a **point** — a circle with its number in the layer's colour — instead of a drawn contour. Drawing 82 house outlines takes an afternoon; placing 82 points takes a few minutes, and the plan reads the same.

**Data** (`modules/masterplan/markers.js`, table `mp_markers (plan_id, node_id, x, y, r, label, updated_at)`, PK `(plan_id, node_id)`, created idempotently with the other tables). `x, y` — the centre in plan coordinates, inside the plan (0..width × 0..height); `r` — the radius in plan units, between 0.2 % and 8 % of the plan's longer side; the editor offers presets **S / M / L** = 0.55 / 0.8 / 1.15 % (on White Hills, 3350 × 2000: 18.4 / 26.8 / 38.5 units; a house is ≈ 90 × 55); `label` — optional text up to 12 characters that replaces the code on the plan (the card and search keep the code). Levels (sectors, phases) are areas and stay contours (`400 INVALID_MARKER`).

**One placement per object per plan.** An object has either a contour or a point on a given plan, never both: saving a point removes the object's contour on that plan and saving a contour removes its point, in the same transaction. So the number is never drawn twice, a click and the search always land on one shape, and switching is a single action. Other plans (a close-up, a second project plan) are independent. Deleting the plan or the node deletes its points.

**API.** `PUT /plans/:id/markers { markers: [{ nodeId, x, y, r?, label? } | { nodeId, remove: true }] }` — project administrators only (`masterplan.admin` or an `admin` assignment on the project; `403` otherwise), up to 2000 at once, all or nothing; `r` is a number or `"S" | "M" | "L"` (default M); a node twice in one call → `400 DUPLICATE`; a node of another project → `400 INVALID_FIELD`. History: a `contours` event with `{ planId, markers, removed }`. `GET /projects/:id/map` adds `markers: [{ planId, nodeId, x, y, r, label }]` for everyone who sees the plan.

**On the plan** (`plan/MarkerLayer.jsx`, layout in `plan/markers.js`, pure and tested). A marker is a disc in the node's colour on the current layer — the same rule as contours (`nodeFill`): sales status, readiness (construction) or the type's colour — with a soft gradient, a white rim and a drop shadow; the number is centred, white with a soft outline (ink on light fills), its size fitted to the circle. Sales layer: a **building with several units** gets a **ring of its statuses** around the disc (free first from 12 o'clock, then by status order) and a «free / total» chip below once it is big enough; construction layer: every object with a known readiness gets a **readiness arc**. Hover lifts the disc and shows the usual tooltip (with «Свободно X из N» for buildings); the selected object gets a blue halo; markers are focusable (Tab, Enter / Space opens the card; focus shows the tooltip). Filtered-out objects dim like contours. A click or a tap opens the same card.

Sizes on screen: the radius follows the plan (`r × zoom`) but never below **11 px** (readable) or above **40 px** (a pin, not a blob); the tap target is never below **24 px**, and where neighbouring targets overlap the **nearest centre** wins, not the top-most shape. **Collisions:** points are explicit placements, so none is ever hidden or moved. In **auto** two points that would touch both shrink to half the gap; a point too small for a readable number (9 px) becomes a small **dot** (the number stays in the tooltip and the card) — at the fit zoom of White Hills (≈ 0.32) houses 30 units apart are dots at first and get their numbers as you zoom in. **always** keeps every number (neighbours may overlap a little; lower ones are drawn on top, the hovered and the selected above all); **hide** draws dots only. Contour numbers and badges give way to points in auto. Search, deep links and «zoom to object» use the point's circle; a sector without its own contour zooms to everything placed inside it. With several project plans the plan bar shows a plan picker (`?plan=`).

**Editor** (*Structure → Генпланы*, switch **Контуры / Точки**, remembered per person). On the left: «Размещено X из N» with a progress bar (contours and points counted together; apartments live on the chessboard and are not counted), a search by number / name / old number, filters by sector and type, «Показывать размещённые», and the list of objects **without a placement** in tree order. Choose one (click, or ↑ ↓ / Enter from the search field) and click the plan: the point appears at once (optimistic, saved in the background; the map reloads once nothing is in flight) and, with **«Ставить подряд»** on, the next unplaced object is chosen — a street of houses is placed click by click. «Пропустить» skips one, Esc cancels. Size of new points: S / M / L. Click a placed point to choose it: drag to move (with **«Выравнивать»** it snaps to the x / y of other points within 6 px and shows a guide), drag the handle to resize, arrows nudge it 1 px (Shift — 10), S / M / L, a label, **«В контур»** (the contour editor opens with a square around the point; saving the contour replaces the point), **«Убрать точку»** (Delete). A contour becomes a point with **«В точку»** (its centroid, a radius ≈ half its smaller side). **Undo** («Отменить», Ctrl+Z) reverts the last action of the session, contours included (up to 50 steps).

## Unified card of a building

One frame for every building (`components/UnitCard.jsx` + `BuildingCard.jsx`): a cottage is a building with one unit, an apartment building one with many.

| Block | Cottage (1 unit) | Building (N units) |
|---|---|---|
| Header | number, type, sector chip, old number chip, status | number, type, sector chip, old number chip, «Свободно X из N» with the status bar |
| Price | price, $/m², payment options (`PaymentOptions`) | «от – до» and $/m² range of the **free** units |
| Key figures | areas, plot, bedrooms, floors, finishing, payment forms | floors, units in total, sellable and free area, finishing, payment forms |
| Composition | — | by rooms: type · area · free / total · price from, with **Резерв** (the first free unit of the row, lowest floor first) |
| Units | — | mini-chessboard (floors × units, status colours, rooms in the corner), picker by rooms and floor, «Открыть в шахматке»; a unit opens its card with sale buttons and «← корпус» |
| Actions | reserve and the other moves, close sales, + Отчёт | reserve from the composition, **Закрыть продажу корпуса** (bulk close, held units skipped with the reason), + Отчёт |
| Construction | stage, readiness, schedule, photos | the same (readiness by floors / sections when it is kept) |
| Plan tooltip | №, type, area, price, status, «Было №…» | №, type, «Свободно X из N», «от …», readiness |

Reserving a free 3-room apartment of building 23 takes two clicks without leaving the plan: **Резерв** in the «3-комн.» row → **Подтвердить** in the dialog (deal and manager optional).

**Server aggregate** (`buildings.js → buildingAggregate`, tested). `GET /nodes/:id` of an object with units below adds `building: { total, free, byStatus, area, freeArea, floors, finishing, paymentForms, prices, currency, price {min,max}, ppm {min,max}, composition: [{ rooms, typeName, area, total, free, freeIds, priceFrom }] }`. It is built from the units **after field hiding** (`visibleNode`) and checks the viewer's capabilities again: statuses, free counts and free ids only with `status.view`; prices, $/m², «price from» and payment forms only with `price.view` (ranges also need `status.view`, since they are of the free units); presentation mode keeps public prices only. Actions add `reserveUnits` (`status.reserve` in the zone) and `closeAll` (`status.not_for_sale`). The card reloads when a unit of the building changes in the live map.

**Series media.** Plans and renders uploaded on a **series** are shown in the card of every object of that series. The series of a node is its attribute `series` (White Hills houses already have it: «Одноэтажный дом 96,72 м²», «… 156,76 м²», «… 200,53 м²»), else for a unit its type · rooms · area («Апартаменты · 1-комн. · 36,07 м²» — the three apartment types). Files go to `mp_media.series` (no node); uploading needs a project-wide role with `media.edit` or the configurator (`actions.seriesMedia`); everyone who sees the project sees them; the orphan cleanup never touches them. The card also lets those with `media.edit` (or the configurator) add layouts and renders to the object itself.

## Data model

| Table | Columns |
|---|---|
| `mp_projects` | `id, name, code, address, lat, lng, description, class, currency, status, start_date, finish_date, manager_id, settings JSONB {moderation, readinessMode, levels}, sort, archived_at, created_by, created_at, updated_at` |
| `mp_types` | `id, key (seeded), name, category, node_kind ('object'|'plot'|'unit'), sellable, stage_set, icon, color, sort, archived_at` |
| `mp_stages` | `id, set_key, name, weight, sort, archived_at` |
| `mp_nodes` | `id, project_id, parent_id, path INT[], depth, kind ('level'|'plot'|'object'|'unit'), level_key, type_id, code (unique per project, case-insensitive), name, sort, description, area, build_user_id, sales_user_id, contractor, plan_start, plan_end, handover, readiness, readiness_manual, current_stage_id, last_report_at, stale_notified_at, delay_notified_days, attrs JSONB (free attributes; `series`, `oldNumber`…), created/updated by/at` |
| `mp_units` | 1:1 with sellable nodes: `node_id, project_id, status, version, price, currency, discount_pct, min_price, area_total, area_living, area_plot, area_terrace, rooms, bedrooms, bathrooms, levels, ceiling, floor, number, riser, finishing, payment_forms TEXT[], no_publish, manager_id, deal_id → crm_deals, person_id → cmp_people, company_id → cmp_companies, client_name, booking_id, contract_number, contract_date, contract_amount, paid_amount, act_date, status_changed_at, status_by, updated_by, updated_at` |
| `mp_bookings` | `id, unit_id, project_id, kind ('reserve'|'booking'), manager_id, deal_id, person_id, company_id, client_name, paid, amount, price (fixed at booking), currency, starts_at, ends_at, status ('active'|'released'|'expired'|'converted'), extensions, extended_by, release_reason, warned_hours, created_by, created_at, closed_at, closed_by` |
| `mp_price_history` | `id, unit_id, old_price, new_price, currency, reason, author_id, created_at` |
| `mp_node_stages` | `node_id, stage_id, plan_start, plan_end, fact_start, fact_end, percent, state, pause_reason, updated_by, updated_at` |
| `mp_reports`, `mp_report_nodes` | `id, project_id, stage_id, percent, fact_date, body, status, visibility, author_id, reviewer_id, reviewed_at, review_note, published_at, edited_at, edited_by, …` / `(report_id, node_id, prev_percent, applied_at)` — what the report changed on each object it moved |
| `mp_media` | `id, project_id, node_id, report_id, kind ('photo'|'video'|'render'|'layout'|'doc'|'plan'), name, mime, size, storage_key, thumb_key, width, height, taken_at, lat, lng, series (shared by a series, no node), created_by, created_at` |
| `mp_plans`, `mp_contours` | `id, project_id, node_id (close-up of a node), media_id, name, width, height` / `(plan_id, node_id) points JSONB [[x,y]…]` in plan coordinates |
| `mp_markers` | `(plan_id, node_id) x, y, r REAL` (plan coordinates), `label VARCHAR(12), updated_at` — a point instead of a contour; one placement per object per plan |
| `mp_assignments` | `id, project_id, node_id (zone), subject_type ('user'|'group'), subject_id, role, until, created_by` |
| `mp_price_grids` | `id, project_id, type_id (null = whole project), effective_from DATE, currency, plans JSONB [{ key, name, mode: base|ppm|markup, ppm, markupPct, firstPct, months }], planned_ppm, note, created_by, created_at` |
| `mp_events` | `id, project_id, node_id, kind, data JSONB, author_id, created_at` — kinds: `created, fields, price, status, migration, expired, extend, manager, report, report_edited, report_deleted, stage, readiness, moved, bulk, import, plan, contours, team, project, pricing, crm_stage, deleted` |

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
| PUT | `/plans/:id/markers` | point markers `{ markers: [{ nodeId, x, y, r?, label? } \| { nodeId, remove: true }] }` (see [Point markers](#point-markers)) |
| GET | `/stream?project=` | SSE: `hello`, `units {ids}`, `tree` |
| POST | `/nodes` · `/nodes/bulk` | create one / a line (`prefix, from, count, pad, suffix, nameTemplate`) or apartments (`grid: { floorFrom, floorTo, perFloor, startNumber, numbering }`) |
| GET / PUT / DELETE | `/nodes/:id` | card `{ node, breadcrumbs, summary, building, series, seriesMedia, stages, reports, reportsCursor, media, priceHistory, responsible, caps, actions }` (`reports`: the latest 8 on and around the object the person may see, drafts only to their author and moderators) / update (groups of fields by right; `version` for sales fields) / delete (`409 NODE_HAS_SALES`) |
| POST | `/nodes/:id/move` | `{ parentId, sort? }` |
| POST | `/nodes/bulk-move` | `{ ids, parentId }` → `{ moved, ids }` (all or nothing) |
| GET | `/nodes/:id/events?before=` | history |
| PUT | `/nodes/:id/stages/:stageId` · `/nodes/:id/readiness` | stage plan / fact / percent; manual readiness (`null` = computed) |
| GET | `/units?project&node&ids&q&status&types&priceMin…&sort&order&page&pageSize&presentation` | registry |
| GET | `/units/export.csv` | CSV (BOM, `;`), only visible columns |
| POST | `/units/import` | `{ projectId, rows, dryRun, reason? }` → `{ ok, created, updated, migrated, errors: [{ row, field, code, message }] }` |
| POST | `/units/:id/migrate` · `/units/migrate` | status migration `{ to, version?, reason, date, clientName, managerId, dealId, endsAt, contractNumber, contractDate, contractAmount, paidAmount, actDate }` / the same with `ids` → `{ affected, skipped }` |
| GET / POST | `/projects/:id/price-grids` | grid versions (`price.view`) / a new version `{ typeId?, effectiveFrom, plans, plannedPpm?, note? }` (administrators) |
| DELETE | `/price-grids/:id` | a version not in force yet (or added within a day) |
| POST | `/units/bulk-price` · `/units/bulk-status` | `{ ids, mode, value, reason }` / `{ ids, to: 'not_for_sale'|'free', reason }` → `{ affected, skipped }` |
| GET | `/units/:id` | one node with its unit |
| POST | `/units/:id/status` | `{ to, version, reason, dealId, client, managerId, contractNumber, contractDate, contractAmount, paidAmount, actDate, paid, amount }` |
| POST | `/units/:id/extend` · `/units/:id/manager` | extend the timer / reassign the manager |
| GET | `/bookings?project&scope=mine|all&kind` | active timers with `canExtend / canRelease / canBook / canDeposit` |
| GET | `/deals/:dealId/units` | units linked to a CRM deal (with CRM rights) |
| GET / POST | `/reports` | journal `?project&node&status&mine&limit&cursor` → `{ reports, hasMore, nextCursor }` (newest state first; each report has `prevPercent`, `canEdit`, `canDelete`, `canReview`, `canSubmit`, `editUntil`, `editedAt`, author with avatar) / new report `{ projectId, nodeIds, stageId, percent, factDate, body, mediaIds, submit }` |
| GET / PUT / DELETE | `/reports/:id` | report / correct `{ body, factDate, percent, removeMediaIds, addMediaIds, submit }` / delete → `{ restored: [{ nodeId, from, to }] }` (see Construction) |
| POST | `/reports/:id/review` | `{ action: 'publish'|'reject', note }` |
| DELETE | `/reports/:id/media/:mediaId` | one photo / video of a report → `{ report }` |
| POST / GET / DELETE | `/media` (multipart `file`, `thumb`, `projectId`, `nodeId?` or `series?` (render / layout / doc), `kind`, `takenAt`, `lat`, `lng`, `width`, `height`) · `/media/:id?thumb=1&download=1` | uploads and access-checked downloads (uploads refused before anything is written unless the person has `media.edit` or `build.edit` somewhere) |

Error codes: `VERSION_CONFLICT, SAME_STATUS, INVALID_TRANSITION, FORBIDDEN, NOT_OWN, REASON_REQUIRED, DEAL_REQUIRED, CLIENT_REQUIRED, CONTRACT_REQUIRED, ACT_DATE_REQUIRED, RESERVE_LIMIT, EXTEND_LIMIT, NOT_HELD, DEAL_LOCKED, DEAL_CLOSED, CRM_DISABLED, PRICE_FIXED, PRICE_LIMIT, OUT_OF_ZONE, ALREADY_PUBLISHED, SCOPE_DENIED, CODE_TAKEN (node codes only; other duplicates `DUPLICATE`), TOO_DEEP, INVALID_TYPE, INVALID_PARENT, NODE_HAS_SALES, PROJECT_HAS_SALES, TYPE_IN_USE, INVALID_CONTOUR, FILE_TYPE, FILE_CONTENT, MEDIA_IN_USE`. The API reference (`/developers`) has the Masterplan section; API tokens get the `masterplan` area automatically.

## Integrations

- **Notifications** (`notificationCatalog.js`, group `masterplan`): `masterplan.expiring`, `masterplan.expired`, `masterplan.status` (booked / deposit / contract / sold / handed, rollbacks, closing — to heads of sales and management in the zone; also when a CRM stage could not be applied), `masterplan.report` (managers holding units under the report's objects + the sales responsible), `masterplan.review`, `masterplan.construction` (stale, delays), `masterplan.access`. Texts in the recipient's language, moments in their zone and formats.
- **Scheduler**: `masterplan:bookings` (1 min), `masterplan:daily` (6 h).
- **CRM**: see [Adaptation decisions](#adaptation-decisions). The deal block appears in the deal panel under the fields; «Подобрать объект» opens the plan with `?deal=` so the reserve / booking dialog already has the deal. When `syncDealAmount`, booking or contracting a unit writes its price / contract amount into the deal amount (a `field` event in the deal history).
- **Counterparties**: clients come from the deal (person / company); a client name is stored for display only (spec §13.2).

## Frontend

`src/frontend/src/modules/masterplan`: `MasterplanApp.jsx` (the `mod-shell` with sidebar + mobile drawer; routes `/app/masterplan`, `/projects`, `/bookings`, `/settings`, `/p/:projectId/plan|chess|registry|construction|dashboard|structure`), `MpContext.jsx` (module meta; `ProjectProvider` with the map and the SSE stream), `pages/*`, `components/*` (status pill, filters & legend, unit card, status dialog, deal picker, report dialog, bulk dialogs, import dialog, history; the journal feed `ReportFeed.jsx` — reports grouped by date with avatar, status badge, stage progress «before → after», photo grid `ReportPhotos.jsx` (1 / 2 / 3 / 4 / 5+ layouts with «+N», lazy previews with shimmer), full-screen viewer `MpLightbox.jsx` (patterned on the KB image viewer, which lives in kb.css and has no video / caption / actions: zoom, pan, pinch, swipe, ←/→, EXIF time and place, download, video, delete), inline moderation, edit via `ReportDialog` in edit mode, skeleton and empty states; styles in `mp-reports.css`, strings in `i18n/masterplanReports.js`), `plan/*` (SVG canvas with zoom / pan / pinch and the editor, tiles; point markers `MarkerLayer.jsx` + `markers.js`, styles `mp-markers.css`, strings `i18n/masterplanMarkers.js`), `structure/*` (tree editor, node editor, plans & contours & points — `PlansEditor.jsx`, `MarkerPicker.jsx`, `usePlacements.js` — team, project form), `media/*` (photo compression and EXIF, Excel via exceljs on demand), `integrations/DealUnitsBlock.jsx`, `MasterplanSettings.jsx` (console). Strings in `i18n/masterplan.js` (RU + EN), help in `help/content/masterplan.js`, app icon `siteplan`. Dates use `lib/datetime.js` and `DateField`.

## Tests

- `src/backend/test/masterplan.test.js` (node:test, no database): catalog and sanitizer, permissions and notification kinds, directories, global roles and zones, field hiding incl. presentation mode, every transition of §6.2 with its requirements, reserve limit, extensions, deal lock and conflict text, prices (modes, head-of-sales limit), readiness weights, schedule states, inheritance up and down the tree, bulk codes and apartment grids, timer warnings, input cleaning (unit fields, attributes, contours, SVG, CSV, currencies).
- `src/backend/test/masterplan-markers.test.js` (no database): marker validation (centre on the plan, radius bounds and presets, label), client / server presets in parity, the on-screen layout (11–40 px, 24 px tap target, shrinking neighbours, dots, always / hide), nearest-centre tap, contour numbers giving way, status ring, text colour, contour ↔ point, snapping, «place next». `masterplan-markers.db.test.js` (`MASTERPLAN_DB_TEST=1`): administrators only, validation all or nothing, one marker per object per plan, a point replaces a contour and back, removal, the map, history, cascade.
- `src/backend/test/masterplan-plan.test.js` (node:test, no database): old-number parsing and label, series keys, the building aggregate (counts, free-unit price ranges, composition, hiding for foreman / head of construction / presentation, mixed currencies), and the plan's pure label layout imported from the frontend (`plan/labels.js`: fit by text, 9–14 px, badges, hiding the lower badge, a street of houses with no overlaps, contours around contours).
- `src/backend/test/masterplan-pricing.test.js` (no database): plan cleaning, the payment schedule (first payment, monthly, rounding), totals by mode, the White Hills variants of a 96.72 m² house, the version in force by date / type, prices at a moment from the history, migration rules (administrators only, bypass, no timer, dates, clearing).
- `src/backend/test/masterplan-sales.db.test.js` — test database only (`MASTERPLAN_DB_TEST=1`): the White Hills migration (7 bookings + 1 sale dated 06.10.2026, no expiry a year later, `migration` history), version check, import with migration columns, bulk move of 10 houses (rights, all or nothing, order, history), price grid versions in the project shape and the dashboard trend.
- `src/backend/test/masterplan.db.test.js` — against a **test** database only: a real double-booking race, zones on the journal, the expiry job, expiry vs a concurrent extension, the reserve-limit race, rights before the version check, closing a sold unit, backdated reports, double review. Skipped unless `MASTERPLAN_DB_TEST=1` (so `npm test` needs no database).
- `src/backend/test/masterplan-reports.test.js` — who may correct / delete a report (author window, moderators, zones); `masterplan-reports.db.test.js` (same switch) — rights on real rows, photo files leaving the disk, stage progress and readiness after deleting / correcting reports (previous report, late older report, correction by hand stands, legacy reports, date change).
- End-to-end (scratch scripts, not in the repo): the whole API flow with nine accounts and the browser screenshots on desktop and phone, light and dark.

## Deferred to v2 / v3 and open questions

Deferred: payment schedules per client (plan / fact; the grid gives the offer schedule only), price-change approval queue, saved registry presets and the PDF price list, «responsibles» layer and minimap on the plan, Gantt plan / fact, before / after photo comparison, monthly PDF report, watermarks, report comments by technical supervision, external agent and investor roles (the capabilities model is ready: add a role in `ROLE_CAPS` and a permission), contour import / export (SVG / GeoJSON), currency display switch, public showcase and buyer cabinet (v3), offline upload queue surviving a page reload (today retries happen while the page is open).

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
