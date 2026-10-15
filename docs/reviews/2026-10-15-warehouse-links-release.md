# Code review — Warehouse, share links, link previews, releases (2026-10-15)

**Scope:** code added after the [2026-10-13 review](2026-10-13-business-modules.md):

- **Warehouse:**
  - posting, documents and storno;
  - transfers and inventory sessions;
  - the storekeeper mobile mode and its offline queue;
  - tools.
- **Shared scanner and label components.**
- **Public share links in Files and Drive:**
  - per-action permissions and visitor writes;
  - custom slugs;
  - the simple share dialog.
- **Link previews:** Open Graph, the nginx `@shell` location, preview cards.
- **Release automation:** `scripts/release.mjs`, `make deploy`, the GitHub release workflow.
- **`ModuleHeader`.**

**Method:** two read-only reviewers. Every finding was checked by reading the code end to end, with a concrete failure scenario.

**Status:** all 41 findings fixed on 2026-10-15, with tests (see the *Status* column).

**Severity:** **H** high · **M** medium · **L** low.

Production exposure at review time: Warehouse was deployed **off by default** and not yet enabled, so W1–W24 had no live impact. L-findings apply to links already in use.

## W. Warehouse

| ID | Sev | Where | Defect | Status |
|---|---|---|---|---|
| W1 | H | `warehouse/documents.js`, `logic.js` | Document history events carry `total`, which the cost filter misses. The history shows sums to people without cost rights. | Fixed — sums stripped from history without cost rights |
| W2 | H | `inventoryLogic.js` → `posting.js` | Parallel counters add up serial instance rows. One tool can be posted with qty 2. | Fixed (`INSTANCE_TWICE`, `INSTANCE_QTY`) |
| W3 | H | `mobile/offlineQueue.js` | Any response below 500 deletes the whole sync batch. An expired login loses the offline counts. | Fixed — drops only per-op rejections; 413 splits batch |
| W4 | H | `mobile/MobileInventory.jsx`, `inventory.js` | Correcting a serial line adds a quantity row without an instance. Phantom pieces are posted. | Fixed |
| W5 | M | `documents.js` | A tool hand-over decline has no lock or status guard. It can cancel a hand-over that was just confirmed. | Fixed |
| W6 | M | `documents.js` | Storno ignores the closed period of the base document. | Fixed |
| W7 | M | `posting.js` | Reversing a receipt after partial issues leaves a negative amount on zero quantity. That skews the moving average. | Fixed — zero-qty cost adjustment |
| W8 | M | `documents.js`, `procurement/money.js` | Reversing a receipt does not undo the delivery mark on the purchase request. | Fixed (`revertExternalDelivery`) |
| W9 | M | `posting.js`, `inventoryLogic.js` | Inventory acts for batch or serial items counted by quantity create stock with no batch or instance. Shortages leave instances shown as «ok». | Fixed — serial needs the tool; shortages mark tools `lost`; batch surplus to newest batch |
| W10 | M | `inventory.js` | After a forced finish, a tool booked in an uncounted bin but scanned elsewhere ends up in two bins. | Fixed |
| W11 | M | `inventory.js` | The client-supplied `recount` flag is trusted. A late op wipes other counters' rows. | Fixed |
| W12 | M | `posting.js` | A write-off from an employee holder ignores which warehouse the goods came from. This bypasses per-warehouse rights. | Fixed |
| W13 | M | `posting.js`, `documents.js` | Posting an old draft silently backdates its movements to the day the draft was created. | Fixed (`date_fixed`) |
| W14 | M | `approval.js` | The approval amount reaches people without cost rights: in the document and in the Approvals inbox. | Fixed — amount only in routing fields; card hides it |
| W15 | M | `mobile/parts.jsx` | A hardware scanner typing into a focused quantity field records the barcode as the quantity. | Fixed |
| W16 | M | `documents.js`, `MobileAccept.jsx` | A blank «received» field is accepted as fully received. No discrepancy act is created. | Fixed |
| W17 | M | `inventory.js` | The act is built from counts read before the session is locked. Late counts are lost. | Fixed |
| W18 | M | `inventory.js` | Deleting a failed act leaves the session stuck in «finished». | Fixed — reopen allowed when the act was deleted |
| W19 | L | `items.js` | The item card and `/resolve` show every tool's location and holder across warehouses. | Fixed |
| W20 | L | `stock.js`, `reports.js` | Holder quantities can be read across warehouses: hints for objects and the by-employee report. | Fixed |
| W21 | L | `documents.js`, `procurement/money.js`, tools | The closed-period check, delivery dates and «today» for tools use UTC days. | Fixed |
| W22 | L | `posting.js` | Reversing an issue does not restore the reserve it consumed. | Fixed |
| W23 | L | `inventory.js` | The session list runs about 7 queries per session. | Fixed |
| W24 | L | i18n | About 14 error codes are untranslated. The safety-net shortage error has no item details. | Fixed |

## L. Share links, previews, releases, header

| ID | Sev | Where | Defect | Status |
|---|---|---|---|---|
| L1 | M–H | Files/Drive `api.js`, routes, nginx logs | The visitor write token is also put in URLs (`?t=`), so it ends up in logs. A replayed token allows changes behind a password. | Fixed — separate read-only URL token; write token header-only; nginx masks `t=` |
| L2 | M | `server.js`, `linkPreview` | The preview runs before the IP guard. Link meta leaks to blocked addresses. | Fixed |
| L3 | M | Files/Drive routes, `linkSlug.js` | Rate-limit keys use the raw address. Changing the letter case of a slug bypasses them. | Fixed |
| L4 | M | `smbgate.py`, Drive routes, `files/linkWrites.js` | Upload-only links reveal existing file names through the «(1)» renaming. | Fixed — visitor sees the name they sent |
| L5 | M–L | `scripts/release.mjs` | After a failed push, re-running never pushes the tag or branch. | Fixed — pushes missing branch/tag (`--push-only`) |
| L6 | L–M | `linkPreview`, `card.js` | A forged Host header forces a new preview render and cached file on each request. | Fixed |
| L7 | L–M | `files/links.js`, `drive/links.js` | 401 and 403 answers name password-protected and employees-only links. | Fixed |
| L8 | L | `files/links.js`, `drive/links.js`, `linkSlug.js` | The slug hold is written after the change commits. Another user can claim the old address in between. | Fixed |
| L9 | L | Public pages, routes | View counts rise on reloads after visitor writes. Drive counts the author's own preview. | Fixed |
| L10 | L | `Makefile` | `make deploy` continues without a backup if the DB container is missing. The release is published before the build succeeds. | Fixed — release locally → backup (hard fail) → rebuild → health → push |
| L11 | L | `linkPreview` | A revoked link's preview stays cached for up to 60 s. | Fixed |
| L12 | L | `server.js` | Files public folder uploads of more than about 300 files hit the guest limiter. | Fixed |
| L13 | L | `files/linkWrites.js` | Write links into spaces have no default total limit. | Fixed — module setting, default 2 GB per link |
| L14 | L | `nginx.conf` | `/api/v1/l/…/upload` falls under the 2 MB limit. | Fixed |
| L15 | L | `module.css` | On phones the bottom action bar covers the end of the list. | Fixed |
| L16 | L | `drive/linkPerms.js`, `files/links.js` | The two modules normalise the same permission list differently. A drop box in Files is browsable in Drive. | Fixed — one shared rule (`modules/shared/linkPermissions.js`) |
| L17 | L | i18n | Nine Files public error codes have no Russian text. | Fixed |

## What was checked and found solid

- **Warehouse posting:**
  - Locks are taken in a consistent id order, so no deadlock cycle.
  - Shortages are collected before any write, with a negative-stock safety net in `flush`.
  - Storno can't run twice, a storno can't be reversed, and a storno that would make stock negative is refused.
  - Transfers hold in-transit stock and can't be received twice. The discrepancy act is reversed together with its transfer.
- **Freeze:** every stock write goes through `flush` and the freeze check.
- **Offline sync and reserves:** each op is applied once even when sent again. Reserves and issues lock the same rows. The moving average is consistent for issue, return and transfer.
- **Approvals:** the currency conversion for the threshold is correct, and a document can't be posted twice.
- **Files and exports:** CSV exports neutralise formulas. Uploads are checked by content, and signatures are checked as real PNGs.
- **Scanner:** camera and listeners are released.
- **Link rights and confinement:** Files narrows a link to its author's current rights on every request. Drive probes write rights on the file server. Writes are confined to the link: the root can't be renamed, moved or deleted, and `..` or alternate data streams are rejected.
- **Link quotas and sessions:** quotas are atomic. Visitor sessions are tied to the link version. Cross-site writes are blocked by the Origin check.
- **Slugs:** limited to ASCII (no homoglyphs), with a case-insensitive unique index, and random tokens never collide with slugs.
- **Previews:** meta values are HTML-escaped, and password links show only «locked». The nginx `@shell` location strips cookies and falls back to the static page.
- **Release tooling:** lockfile and CHANGELOG edits are valid, and the workflow extracts the notes correctly.
- **`ModuleHeader`:** actions respect `canEdit`, and controls have aria labels.
