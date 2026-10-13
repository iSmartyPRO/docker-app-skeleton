# Code review — business modules and Masterplan 1.1 (2026-10-13)

**Scope:** code added on 2026-10-13.
- **Approvals:** the service and the «Ждёт меня» inbox.
- **Procurement and Contracts.**
- **Tasks:** acceptance and orders.
- **Masterplan 1.1:**
  - pricing, status migration and bulk move;
  - buildings card, point markers, construction reports.

**Method:** three read-only reviewers. Each finding below was checked by reading the code end to end. Each has a concrete failure scenario.

**Status:** all 38 findings fixed on 2026-10-13, with tests (see the *Status* column).

Severity: **H** high · **M** medium · **L** low.

## A. Approvals, Procurement, Contracts

| ID | Sev | Where | Defect | Status |
|---|---|---|---|---|
| A1 | H | `procurement/access.js` | The «same group» visibility rule counts the default group, which every user is in. As a result everyone sees everyone's requests, invoices, payments and chat. | Fixed |
| A2 | H | `approvals/ApprovalPath.jsx` | The `useApprovalProcess` hook keeps the previous document's process and accepts late responses. Pressing «Согласовать» on B can act on A. | Fixed |
| A3 | H | approvals `engine.js`, `procurement/approval.js` | Anyone who can view a document can start its approval. Start on a returned process silently opens a new round. A route with no stages approves at once, skipping the readiness checks. | Fixed (`409 NOT_RESTART`) |
| A4 | M | `procurement/logic.js` vs engine | The responsible person sees the resubmit and cancel buttons, but the engine refuses them with 403. | Fixed |
| A5 | M | procurement / contracts | Editing amount or category during approval doesn't re-plan the route, so conditional stages can be bypassed. | Fixed — not-yet-reached stages re-planned, `replanned` event |
| A6 | M | approvals routes, inbox | An API token scoped only to approvals can read and decide documents of other modules. | Fixed (`403 SCOPE_DENIED`) |
| A7 | M | `contracts/index.js` | Contracts with long notice periods never show their refusal deadline in the inbox. | Fixed |
| A8 | M | `procurement/lookups.js`, `service.js` | Pickers and stored links ignore the access rules of Masterplan, Companies and CRM. | Fixed (`400 BAD_*`) |
| A9 | M | `RequestForm.jsx` | Autosave requests aren't serialised, so an older save can overwrite a newer one. | Fixed |
| A10 | L | `procurement/files.js` | The invoice lock can be bypassed by relabelling the file as «other» and then deleting it. | Fixed |
| A11 | L | procurement, contracts uploads | Files are orphaned when the DB insert fails. Large uploads are stored before the access check. | Fixed |
| A12 | L | approvals engine | Decisions are accepted for documents of a disabled module. | Fixed (`404 MODULE_DISABLED`) |
| A13 | L | procurement list vs engine | A substitute sees a row in the list but gets 404 opening it. | Fixed |
| A14 | L | approvals engine | The inbox and «Мои на согласовании» run several queries per item, and the header badge polls this every 60 s. | Fixed (batched; count cached 20 s) |
| A15 | L | `contracts/service.js` | Dates in the CSV export ignore the person's regional format. | Fixed |

## B. Tasks acceptance and Masterplan backend

| ID | Sev | Where | Defect | Status |
|---|---|---|---|---|
| B1 | M | `masterplan/rules.js`, `construction.js` | Within 24 h of publishing, the author can change percent and date without a new review. This bypasses moderation. | Fixed — substantive author edits in moderated projects go back to review |
| B2 | M | `UnitCard.jsx`, `MpLightbox.jsx` | Escape in the photo viewer also closes the object card. | Fixed |
| B3 | L–M | `masterplan/nodes.js` | Concurrent moves can create a cycle in the tree. | Fixed (per-project tree lock) |
| B4 | L–M | `tasks/service.js` | A reopened task that was never accepted is immediately «не принята». | Fixed |
| B5 | L | `tasks/service.js` | When the acceptance deadline is recalculated, the late reminder isn't re-armed. | Fixed |
| B6 | L | `masterplan/nodes.js` | History events expose the stage and percent of internal reports. | Fixed |
| B7 | L | `construction.js` | Deleting reports leaves `last_report_at` behind, so the stale check misses the object. | Fixed |
| B8 | L | `MpLightbox.jsx` | A cached image can stay invisible. | Fixed |
| B9 | L | `ReportFeed.jsx` | An edited report isn't re-sorted, which produces duplicate day headings. | Fixed |
| B10 | L | `UnitCard.jsx` | A stale response can show the wrong object. | Fixed |
| B11 | L | `masterplan/pricing.js` | The price chart's month ends use the server time zone. | Fixed (portal zone) |
| B12 | L | Masterplan frontend | Russian text «м²» and default plan names are hard-coded. | Fixed |

## C. Masterplan plan editor and markers (frontend)

| ID | Sev | Where | Defect | Status |
|---|---|---|---|---|
| C1 | H | `PlansEditor.jsx` | A pending arrow-key nudge re-saves a point that was just deleted, or drops another point's nudge. | Fixed |
| C2 | H | `usePlacements.js` | A failed save removes the wrong undo entry. | Fixed |
| C3 | H | `PlansEditor.jsx`, `PlanCanvas.jsx` | In point mode a sector can be selected and converted to a point, which the server rejects. | Fixed |
| C4 | M | `PlanCanvas.jsx` | Labels and markers are recomputed on every pan frame and on every hover. | Fixed |
| C5 | M | `usePlacements.js`, `MpContext.jsx` | Reloads arriving out of order briefly un-place points during chain placement. | Fixed |
| C6 | M | `plan/markers.js` | Preset S falls below the minimum radius on small plans, and arrow nudges do nothing at high zoom. | Fixed |
| C7 | M | `PlanCanvas.jsx` | A pinch that starts during a drag leaves the drag stuck. | Fixed |
| C8 | M | `PlansEditor.jsx` | Unsaved contour drafts are lost on any map reload. | Fixed |
| C9 | L | `lib/errors.js` | New error codes have no Russian/English messages. | Fixed |
| C10 | L | `masterplan/lib.js` | `descendants()` is O(k²) and is repeated three times per marker. | Fixed |
| C11 | L | `MoveDialog.jsx`, `nodes.js` | Bulk move silently stops at 500 objects. | Fixed (`400 BULK_LIMIT`, UI warning) |

## What was checked and found solid

- **Approvals engine:**
  - Row locks with 409 on stale decisions.
  - First starts are protected with `ON CONFLICT`.
  - SLA reminders and escalations are sent exactly once.
- **Procurement:**
  - Payments are under the request lock with an overpay guard and cent rounding.
  - Numbering is protected by a counter row.
- **Contracts:** numbering is protected by an advisory lock.
- **Exports:** dynamic SQL is parameterised and sort keys are whitelisted. Exports are guarded against formula injection.
- **Files:** served only after the access check, with `nosniff` and a sandbox CSP.
- **Tasks acceptance:**
  - Accepting twice is harmless.
  - The overdue job is safe across several instances.
  - The migration that marks existing tasks accepted runs once.
  - The tasks inbox honours API token scope.
- **Masterplan:**
  - Status migration is admin-only, with locks and version checks, and hides fields.
  - The building aggregate is built after field hiding.
  - The markers API is admin-only and all-or-nothing.
  - Report delete and edit are serialised with publishing, and progress rollback is correct.
- **i18n:** all static keys exist in both EN and RU.

Production exposure at review time: Procurement and Contracts were deployed **off by default** and not yet enabled, so A1–A15 had no live impact.
