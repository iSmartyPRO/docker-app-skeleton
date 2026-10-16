# Warehouse (`/app/warehouse`)

A [module](modules.md) for operational stock accounting: items with units and barcodes, warehouses with bins, the stock register with reserves and moving-average cost, documents for every movement, tools by instance, reports and imports. Spec: [specs/warehouse.ru.md](specs/warehouse.ru.md) (MVP of §12). The module is **off by default**; turn it on in *Settings → Modules*.

It is not accounting: it keeps quantities, places, responsible people and cost by movement. Bookkeeping stays in the accounting system (CSV exports and the API feed it).

- [Screens](#screens)
- [Concepts and data model](#concepts-and-data-model)
- [Documents and statuses](#documents-and-statuses)
- [Posting rules](#posting-rules)
- [Costing and currencies](#costing-and-currencies)
- [Permissions and zones](#permissions-and-zones)
- [Links to other modules](#links-to-other-modules)
- [Tools](#tools)
- [Notifications, jobs, webhooks, inbox](#notifications-jobs-webhooks-inbox)
- [Settings](#settings)
- [Storekeeper mobile mode](#storekeeper-mobile-mode)
- [Inventory sessions](#inventory-sessions)
- [HTTP API](#http-api)
- [API for the mobile / inventory stage](#api-for-the-mobile--inventory-stage)
- [Code map](#code-map)
- [Demo data and tour](#demo-data-and-tour)
- [Tests](#tests)
- [Limits and next steps](#limits-and-next-steps)

## Screens

| Screen | Address | What it does |
|--------|---------|--------------|
| Stock (main) | `/app/warehouse/stock` | Item × warehouse with on hand, reserved, available, minimum, sum (by right), last movement, flags. Chips with counters: *Ниже минимума, Нет в наличии, Истекает срок, Есть резерв, Без движения 90 дней, Мои склады*. Grouping: by warehouse, category, holder (warehouses, people, objects, transfers in transit) or bin. Scan to find, CSV, «Заказать в Закупках» for the items below minimum of one warehouse. A click opens the item card. |
| Item card | drawer over Stock / Items | Stock by warehouse, bin, batch, instance and holder; movements; batches or instances; reserves (create, release); barcodes (add by scanner); norms per warehouse; photos; label printing; issue / receive shortcuts; archive. |
| Items | `/app/warehouse/items[/:id]` | Nomenclature list (search by name, SKU, brand, barcode; category; tracking; archive), item form (units with factors and live «2 уп = 48 шт» preview, receipt / issue units, barcodes with the camera, supplier, prices by right, service interval, category attributes), category tree with attributes. |
| Documents | `/app/warehouse/documents[/:id]` | Chips *Мои черновики, Ждут приёмки, Ждут согласования, Требования, Сегодня, Передачи*; filters by type, status, warehouse; «+» with the types the person may create. The card (drawer, ↑/↓): route, lines with the stock hint «на складе · резерв · доступно» and the shortage highlight, «Заказать недостающее», approval path and actions, post / ship / receive (quantity check dialog) / send to storekeeper / confirm / sign / storno, attachments, history (incl. approval). |
| Document form | `/documents/new/:type`, `/documents/:id/edit?step=` | Three steps (spec §2): «Откуда / Куда» (warehouses, recipient — person / Masterplan object / project —, supplier, reason, return date, currency and rate, backdate by right; for a receipt the «from a purchase request» picker) → lines (camera scanner in continuous mode, USB / Bluetooth wedge scanners anywhere on the page, item search, «Как в прошлый раз», units, bins, batches and expiry, inventory numbers of serial items, write-only price for people without cost) → «Провести» (attachments — waybill, photos —, the recipient signature on the screen, the action). The draft is saved on the server after step 1; every line change is saved at once. |
| Tools | `/app/warehouse/tools[/:id]` | Instances with «где сейчас»; chips *У меня, Выдан, На складе, В ремонте, ТО скоро*; list or «where now» board; the instance card (state, service dates, warranty, history, photos, label). |
| My tools | `/app/warehouse/my-tools` | What is on me (instances and quantities), hand-overs to confirm / waiting for a colleague, return dates; «Передать коллеге». |
| Reports | `/app/warehouse/reports?tab=` | Turnover statement, item movement, materials by object / project / person, tools by holder; CSV and Excel. |
| Warehouses and bins | `/app/warehouse/warehouses` | `warehouse.admin` (any warehouse): warehouses (type, MOL, address, bins on/off, negative allowed), bin tree with series («01-10») and QR labels, the zone of responsibility (rights per person / group, until a date). |
| Import | `/app/warehouse/import` | Items and opening balances from .xlsx / .csv with a template, a check and an error report by row. |
| Settings | `/app/warehouse/settings` | Global `warehouse.admin`; also *Settings → Modules → Warehouse* in the console. |
| Storekeeper mode | `/app/warehouse/m[/…]` | Phone first: big tiles *Приход, Выдать, Переместить, Принять перемещение, Инвентаризация, Найти позицию, Мой инструмент*; the warehouse remembered on the device; three-step flows with continuous scanning ([below](#storekeeper-mobile-mode)). |
| Inventory | `/app/warehouse/inventory[/:id]` | Sessions (chips *Активные, Подсчёт, Сверка, Завершённые*), the session card (bins and counters, reconciliation, finish), regular partial counts ([below](#inventory-sessions)). Counting itself is on the phone: `/app/warehouse/m/inventory/:id`. |
| Dashboard widgets | «Ниже минимума», «Ждут приёмки», «Инструмент у меня» | |

Dates follow the person's regional settings (`lib/datetime`); sums use `formatMoney` of the approvals module. Light / dark themes and phones are supported everywhere (tables become cards, the form stacks, no sideways scrolling).

## Concepts and data model

| Table | Content |
|-------|---------|
| `wh_categories` | Category tree (`parent_id`) with attribute definitions `attrs: [{ key, label, type: text\|number\|select, options }]` |
| `wh_items` | Nomenclature: SKU (unique, case-insensitive), name, category, brand, kind `goods`/`service`, tracking `quantity`/`batch`/`serial`, `track_expiry`, `base_unit`, `units` JSONB `[{ code, factor }]` (factor = base units in one), receipt / issue units, purchase multiple, default supplier, `last_price`, `plan_price`, `attrs`, service interval (serial), `archived_at` |
| `wh_barcodes` | Several per item, unique; `unit` = the pack this barcode stands for (scanning it adds one pack) |
| `wh_warehouses` | Code, name, kind `main`/`site`/`transit`/`mobile`, MOL, address, Masterplan project link, `bins_enabled`, `allow_negative`, archive |
| `wh_bins` | Zone → rack → shelf tree per warehouse; `path` like `A-01-3` (unique per warehouse) |
| `wh_assignments` | Rights on one warehouse: person or group, `rights[]`, optional `until` |
| `wh_norms` | Minimum and reorder point per item × warehouse |
| `wh_batches` | Batch number (unique per item), expiry, production date, supplier, unit cost, the receipt |
| `wh_instances` | Serial instances: inventory no. (unique), serial no., state `ok`/`repair`/`written_off`, purchase date, cost, warranty, next service, interval, note |
| `wh_stock` | **The register**: one row per item × warehouse × bin × batch × instance × holder (`warehouse` with id 0, `employee`, `object`, `project`, `transit` = the transfer document) with `qty` (base units) and `amount` (base currency). Updated incrementally by posting. |
| `wh_moves` | **The journal** (append-only; a trigger refuses UPDATE / DELETE): every change of the register with document, line, key, signed qty and amount, `moved_at` = document date. Reports read it. |
| `wh_costs` | Last moving average per item × warehouse (used when the pool is empty or negative) |
| `wh_reserves` | Reserves of an item × warehouse for an object, project, deal, request or person; `active`/`consumed`/`released`/`expired`; optional expiry date |
| `wh_docs`, `wh_doc_lines` | Documents and lines (qty in the line unit, `factor`, `base_qty`, price, amount, bins, batch, instance, serials to create, reserve, counted / book qty, received qty, procurement line) |
| `wh_files` | Photos of items and instances, document attachments, signatures (own storage `UPLOAD_DIR/warehouse/…`, served after access checks with `nosniff` and a sandbox CSP) |
| `wh_events` | Audit trail: created / posted / reversed / signed / received… for documents; card, barcode and norm changes for items; access changes of warehouses |
| `wh_counters`, `wh_notices` | Number sequences per type (row-locked); «sent once» markers of notifications |
| `wh_inv_sessions` | Inventory sessions: number `ИНВ-00001`, warehouse, status, blind mode, freeze policy, scope (`bin_roots` / `category_roots` as chosen and `bin_ids` / `category_ids` expanded to subtrees), schedule, the act (`doc_id`) |
| `wh_inv_areas`, `wh_inv_people` | Areas = bins in scope (+ «без ячейки») with assignee and status `todo`/`counting`/`done`/`recount`; counters taking part |
| `wh_inv_counts`, `wh_inv_ops` | Counts per counter × bin × item (× instance) in base units; the applied phone operations by client id (unique per session — idempotent sync) |
| `wh_inv_finals`, `wh_inv_recounts` | The manager's decision for a row (overrides the sum of counters); recount requests (a bin or one item in it) |
| `wh_inv_schedules` | Regular partial counts: warehouse, categories / bins, every N days, next date, blind, enabled |

**Holders** (spec §3): stock at a warehouse has holder `warehouse`; issued goods move to `employee` / `object` / `project` rows that keep the issuing warehouse, so «materials on object 23» and «tools on Ivanov» come from the same register; a shipped transfer sits on the `transit` holder of the transfer until it is accepted.

**Units**: lines keep the entered quantity and unit plus the factor at that moment; posting works in base units. «2 уп = 48 шт» is shown in the form and the card.

## Documents and statuses

| Type | From → to | Notes |
|------|-----------|-------|
| `receipt` | supplier → warehouse | Prices in the document currency (rate from settings or typed); creates batches and serial instances; «from a purchase request» |
| `supplier_return` | warehouse → supplier | |
| `transfer` | warehouse → warehouse | Two steps: `ship` (→ transit, status `shipped`) and `receive` with quantities; a difference posts a `discrepancy` act |
| `issue` | warehouse → person / object / project | Requisition flow for `warehouse.request`; reserves consumed by line; signature; «return by» |
| `return` | holder → warehouse | Taken from the holder's rows (the destination warehouse first) |
| `writeoff` | warehouse (or holder) → expense | Reason required; approval above the threshold; serial instances become `written_off`; from a holder only what came from the document's warehouse (where the write-off right is checked) |
| `opening` | → warehouse | Opening balances (admin), also by import |
| `correction` | in place | Admin, reason; signed quantities, or counted quantities |
| `inventory` | in place | Lines with `countedQty`: posting sets the book to the count; approval above the threshold (by the gross difference) |
| `discrepancy` | in place | System: the act of a received transfer |
| `handover` | person → person | Tools to a colleague; `pending` until the recipient confirms; a decline locks the document and cancels only a hand-over still waiting (`409 STALE` after the confirmation) |
| `storno` | — | System: the opposite of a posted document |

Statuses: `draft` → (`requested` for requisitions) → (`pending` in approval → `approved`) → `posted` → (`reversed`); transfers `draft` → `shipped` → `posted`; side statuses `rejected`, `cancelled`. Drafts are edited and deleted; posted documents are reversed only.

## Posting rules

`modules/warehouse/posting.js` — every posting runs in one transaction:

1. The document row is locked (`FOR UPDATE`, status re-checked → `409 STALE`).
2. The register rows of all items of the document in its warehouses (and the holder's rows) are locked with one `SELECT … ORDER BY id FOR UPDATE` — always in id order, so postings never deadlock. Two storekeepers issuing the last 5 pcs queue on the same rows; the second sees 0 and gets `409 INSUFFICIENT`.
3. Movements are computed in memory: FEFO for batches (earliest expiry first), the line's bin / batch / instance when given, a preferred warehouse for holder returns; cost per portion (below).
4. **No negative stock** (spec §5.1): the free quantity is `on hand − active reserves` (reserves past their date do not count). A line may consume its own reserve. All shortages of all lines are collected into one `409 INSUFFICIENT` with `info.shortages: [{ itemId, name, need, available, short, unit, warehouseId }]`; nothing is written. A warehouse with `allow_negative` may go below zero at the last known average. A final check refuses any negative row anyway (the same `INSUFFICIENT` with name, need and available).
5. Deltas are written to `wh_stock` (upserts for new keys), every change appended to `wh_moves`, `wh_costs` refreshed, line amounts and the document total stored.

**Dates**: a document is dated now by default; an earlier date needs `warehouse.backdate` on its warehouse; nothing on or before `closedUntil` (setting) is created, posted or reversed (`409 PERIOD_CLOSED`; also a storno of a document — or of a transfer's discrepancy act — dated in the closed period); no future dates. The closed period and «today» are calendar days in the portal's time zone (`services/datetime.js`), not UTC. A draft whose date nobody chose (`wh_docs.date_fixed = false`) is **dated when it is posted** (also shipped, confirmed, posted by an approval): an old draft does not put its movements into the day it was created; a date chosen in the form (which needs `backdate` when it is in the past) stays. Backdated movements are journaled at their date, so reports by period are right; the register is a running total and costs are not recomputed retroactively (see [limits](#limits-and-next-steps)).

**Storno**: a `storno` document applies the exact opposite of every journal row of the original at the same keys and at the same cost; if something was used since (the place would go negative) it is refused with `INSUFFICIENT`. When goods of the document were used meanwhile at the moving average, the exact reversal could leave value without goods (a pool at 0 pcs worth −50) or negative value on positive stock: the storno then adds a **cost adjustment** — a journal row with quantity 0 that brings that place's value to zero — so the register never holds money without goods (the adjustment is the storno's own movement and shows in its journal). A received transfer is reversed together with its discrepancy act. Reversing a write-off returns serial instances to `ok`, reversing an inventory act returns the instances it marked `lost`; reversing a receipt retires the instances it created. Reversing an issue gives back the reserves its lines consumed (`wh_doc_lines.reserve_taken`; a reserve released or expired meanwhile stays so). Reversing a receipt made from a purchase request takes its delivery mark back in Procurement (see [links](#links-to-other-modules)).

**Reserves**: `POST /reserves` takes only from the free stock under the same row locks; an issue line with `reserveId` consumes it (status `consumed` when used up); the daily job expires reserves past their date; release by the storekeeper or the creator.

## Costing and currencies

- **Moving average per item × warehouse** for quantity items: an outgoing portion costs `qty × pool amount / pool qty`; taking the whole pool takes its whole amount (no rounding residue). Empty / negative pool → the last average (`wh_costs`) or the item's last price.
- **Batch and serial items**: always the batch's / instance's own cost (row average). A serial instance is one piece: a count or correction that would put an instance in two places (or above 1) is refused (`409 INSTANCE_QTY`).
- Issued goods carry their cost to the holder rows, so returns come back at the issue cost and «materials by object» has sums.
- **Base currency** (setting `currency`); a receipt in another currency is converted by the document rate (default `rates[currency]` — units per 1 base, the same convention as Masterplan; `409 NO_RATE` without one). The portal has no dated rate table; the rate is fixed in the document.
- **Cost hiding** (spec §9): without `warehouse.cost` on any warehouse the routes strip every money key (`price, amount, sum, cost, lastPrice, …, currency, totals`) from the whole JSON answer (`logic.stripCost`); services also hide sums per warehouse for people who see costs only on some; the document history drops the posted sum of its events (`data.total`, `logic.stripEventCost` — `total` is not a global money key because lists use it for the row count) unless the person sees sums on the document's warehouses; the approval process publishes no sum (below); CSV exports drop sum columns; webhook payloads never carry sums. People without cost may still type a price from an invoice (write-only) and see only «цена указана».

## Permissions and zones

Permissions (module group *Warehouse*):

| Permission | Allows |
|------------|--------|
| `warehouse.view` | Stock and availability (no sums), «my tools», own documents |
| `warehouse.request` | Requisitions (issue drafts sent to the storekeeper) |
| `warehouse.operate` | Storekeeper: receipts, issues, transfers (ship / receive), returns, reserves |
| `warehouse.writeoff` | Write-offs |
| `warehouse.inventory` | Inventory acts |
| `warehouse.cost` | Costs and sums everywhere |
| `warehouse.backdate` | Backdated documents in the open period |
| `warehouse.admin` | Everything: warehouses, bins, norms, corrections, opening balances, settings, imports |

A permission grants the right on **every** warehouse. The **zone of responsibility** grants rights on one warehouse: `wh_assignments` (a person or a group, a list of rights, optionally until a date) and the **MOL** (view, request, operate, writeoff, inventory on their warehouse). `admin` on a warehouse implies every right there. With the setting *everyoneCanView* (default on) every signed-in person views stock and files requisitions. Rights are computed in `access.js → whContext` / `logic.rightsOn` (unit-tested) and checked on the server for every action; `GET /meta` sends each warehouse with the person's rights so the UI shows only what works. A person sees a document when they see one of its warehouses, authored it, are its employee holder, or take part in its approval.

API tokens use the `warehouse` area; a token narrowed by resource limits never gets the administrator's bypass.

## Links to other modules

Not dependencies: each link answers `404 MODULE_DISABLED` (or hides) while its module is off.

| Module | Link |
|--------|------|
| **Procurement** | Receipt from an approved request (`POST /documents/from-procurement`): lines (matched to items by SKU or name, unmatched lines keep the name and ask for an item), supplier, prices, currency, contract. Posting marks the delivery through the procurement service function `recordExternalDelivery()` (added to `modules/procurement/money.js`; the delivery keeps `source = 'warehouse'` and `reference` = the receipt number, dated the portal's today): partial while some request line is not fully received (posted receipts, reversed ones excluded), full otherwise; status, history, notification and webhook follow as for a manual delivery. A **storno** of such a receipt calls `revertExternalDelivery()`: the delivery with that reference is removed (older ones are matched by the note «Склад: <number>»), the remaining warehouse deliveries become partial while something is still to come, the status is recomputed (a «delivered» request goes back to «paid», so the next receipt is marked again); closed / cancelled requests and Procurement switched off are left alone (history `procurement_revert_skipped`). «Заказать недостающее» (`POST /documents/:id/order-shortage`) and «ниже минимума → заявка» (`POST /procurement/order`) create a draft request through `createRequest()` as the person (their procurement rights apply), rounded up to the purchase multiple. |
| **Masterplan** | Objects and projects are holders of issues and returns (picker = the Procurement lookups, which follow Masterplan access); the report «materials by object» (a project includes its objects). |
| **Approvals** | Type `warehouse.document` (fields amount, docType, reason, warehouse); default route «any `warehouse.admin`». The approvals service shows a process's `amount` to every participant (inbox, card, notifications) and has no per-viewer hook, so the warehouse publishes **no sum** there (`amount: null`); route conditions still get it as the field `amount` (with `currency`), and the document card shows it to those with `warehouse.cost` (older processes that stored a sum are cleared at startup and hidden on the card). Write-offs (and corrections / inventory acts, setting `approvalTypes`) above `approvalThreshold` (default 500 `USD`, converted from the base currency by `rates`) go to approval when posted; the approved document is posted inside the decision's transaction (a savepoint: if the stock is gone it stays `approved` and the author is notified). |
| **Counterparties** | Supplier picker on items and receipts (free text works too). |
| **CRM / Contracts** | Reserve target `deal`; contract id / label on receipts from requests. |
| **Files / Dashboard** | Own storage for attachments; three dashboard widgets. |

## Tools

Serial items (`tracking = serial`) are received with inventory numbers (typed or numbered automatically `<doc>-<line>-<n>`); each instance is a register row of qty 1. «Где сейчас» is read from the register (`tools.toolsByIds`): a warehouse and bin, a person, an object, or in transit. States `ok`/`repair` are set on the card; `written_off` only by a write-off; `lost` when an inventory or correction took the piece off the books (not found), back to `ok` when a count finds it or the act is reversed. The item card and a scanned code show where a tool is only when the person sees that warehouse (also when the tool is issued from it) or holds it; `GET /resolve` needs a warehouse right, a running inventory the person counts in, or goods held by the person. «ТО проведено» moves the next service date by the interval. **Hand-over**: `POST /tools/handover` creates a `handover` document in `pending` with the tools that are on me (`409 NOT_HELD` otherwise; one pending hand-over per tool); the recipient confirms (`POST /documents/:id/confirm`, also the «Принять» button in «Ждёт меня») and only then the tools move; either side may decline.

## Notifications, jobs, webhooks, inbox

Notification kinds (group *Warehouse*): `warehouse.inventory_assigned` (I count or recount in an inventory), `warehouse.inventory_due` (a regular count is due), `warehouse.transfer_incoming` (MOL of the destination; else those assigned `operate`), `warehouse.requested` (storekeepers of the warehouse), `warehouse.issued` (author and recipient), `warehouse.discrepancy` (both MOLs, the shipper, the author), `warehouse.handover`, `warehouse.stock_low`, `warehouse.expiring`, `warehouse.service`, `warehouse.tool_overdue`, `warehouse.post_failed`. Texts carry no sums (`messages.js`).

Job `warehouse:inventory` (hourly): reminders of regular partial counts ([inventory sessions](#inventory-sessions)).

Job `warehouse:daily` (every 30 minutes, only while the module is on; each notice once, by a key in `wh_notices` inserted by the same statement that decides to send): expires reserves; «ниже минимума» digest per warehouse per day to the MOL and `lowStockRecipients`; batches expiring within `expiryWarnDays`; tool service within `serviceWarnDays` and overdue (to the holder and the MOL); issued items not returned by «return by».

Webhooks (area `warehouse`): `warehouse.document.posted`, `.reversed`, `.requested`, `.deleted`, `warehouse.transfer.shipped`, `warehouse.transfer.received` (with the discrepancy), `warehouse.discrepancy`, `warehouse.stock.low` (item below its minimum after an outgoing document), `warehouse.tool.handover`, `warehouse.tool.service_due`. Payload `{ document: { id, type, number, status, date, warehouseId, toWarehouseId, from, to, supplier, procurementRequestId, baseDocId, transferState, postedAt, url, lines: [{ itemId, name, sku, qty, unit, baseQty, baseUnit }] }, … }` — no sums; delivered only to webhooks whose person may see the document.

«Ждёт меня» providers: `warehouse.receipts` — shipped transfers to warehouses where I operate (kind `receipt`) and requisitions to issue (kind `requisition`); `warehouse.handovers` — tools handed over to me (kind `handover`, inline action `accept`).

## Settings

`app_settings.modules.warehouse.settings` (sanitized by `sanitizeWarehouse` in `modules/catalog.js`):

| Key | Default |
|-----|---------|
| `currency` / `currencies` / `rates` | `USD` / `USD, KGS, RUB` / `{ KGS: 87.5, RUB: 81 }` (units per 1 base) |
| `approvalThreshold` / `approvalThresholdCurrency` / `approvalTypes` | `500` / `USD` / `writeoff, correction, inventory` |
| `units` | шт, кг, г, т, м, м², м³, л, компл, уп, мешок, рулон, паллета |
| `numberPrefixes` / `numberDigits` | ПР, ВП, ПМ, ТР, ВЗ, СП, ВО, КР, ИН, АР, ПД, СТ / 5 → `ПР-00001` |
| `everyoneCanView` | `true` |
| `closedUntil` | `null` (YYYY-MM-DD: the simple period close) |
| `expiryWarnDays` / `serviceWarnDays` / `staleDays` | 30 / 7 / 90 |
| `lowStockDigest` / `lowStockRecipients` | `true` / `[]` |

## Storekeeper mobile mode

`/app/warehouse/m` (`mobile/` in the frontend module; a link «Режим кладовщика» in the module menu). It renders without the side rail, one column up to 640 px, the main action in a sticky bottom bar (52 px buttons, every target ≥ 44 px), no sideways scrolling, light and dark from the theme tokens. It works on a desktop too: USB / Bluetooth scanners are keyboard wedges and are heard on every screen (`useScannerInput`; the search field is a `data-scan-target`). A scanner aimed at a focused quantity field (the quantity sheet, the received quantity) is recognised by its burst (`useQtyScanGuard`, `lib/scanBurst.js`): the field keeps its value and the code is handled as a scan.

| Screen | Address | What it does |
|--------|---------|--------------|
| Home | `/m` | The warehouse chip (remembered in `localStorage` `wh.m.warehouse`; default: the warehouse I am the MOL of, else the first I operate), tiles shown by my rights there, counters (transfers waiting, requisitions, my active inventories, my tools), the freeze banner. |
| Receipt / Issue / Transfer | `/m/doc/:type[/:id]` | Step 1 «Откуда / Куда» (receipt: a purchase request as a list of rows, supplier; issue: recipient — person / object / project — and «return by»; transfer: the destination). «Далее» creates the draft (`POST /documents`) and the URL carries its id, so a reload continues. Step 2: the camera scanner in continuous mode, wedge scanners, search; a scan resolves the code (`GET /resolve`): an item opens the **quantity sheet** (− / +, +5 / +10 / +50, the unit switch base ↔ packs with «3 уп = 600 шт», the stock hint), a repeat scan of the same item adds one in the open sheet, another item commits the sheet and opens the next; «+1 сразу» (remembered) adds without the sheet; a tool label adds the instance; a **bin label** sets the bin for the next lines (receipt: `toBinId`, issue / transfer: `binId`). The running list shows quantity, unit, «2 уп = 48 шт», the stock hint and the red shortage with «Заказать недостающее». From a purchase request the request lines are kept (the delivery mark follows `proc_item_id`): «Считать по факту» zeroes them and scans add to them; lines left at zero are removed before posting. Step 3: summary, the waybill photo straight from the camera (`<input capture>` → `POST /documents/:id/files`, kind `waybill`), the recipient's signature for issues, «Провести» / «Отгрузить» → a success screen (posted, shipped or sent to approval) with «Ещё …», «На главную», «Открыть документ». |
| Accept transfer | `/m/accept[/:id]` | Transfers shipped to the chosen warehouse; scanning a transfer number opens it. Per line: shipped quantity, received quantity (stepper, default = shipped; an emptied field is sent as 0 — the server refuses an empty `receivedQty` with `QTY_REQUIRED`, a line without the key arrived as shipped), the destination bin; «Проверка сканом» starts from zero and every scan adds (a pack barcode converts to the line unit); a difference turns the button into «Принять с актом» and the result shows the discrepancy act. |
| Find an item | `/m/find` | The camera opens at once; any code: an item (stock by warehouses / bins / holders, the pack «уп = 24 шт»), a tool («где сейчас», state, service), a bin (its contents), a warehouse, a document (a shipped transfer → «Принять»). «Печать этикетки» opens `PrintLabelsDialog` with the item / tool / bin label. |
| Inventory | `/m/inventory[/:id[/area/:bin]]` | See [counting from the phone](#counting-from-the-phone). |
| My tools | `/app/warehouse/my-tools` | The existing page (phone layout). |

## Inventory sessions

Spec §6, §8.6. Service `modules/warehouse/inventory.js`, pure rules `inventoryLogic.js` (unit-tested), the freeze `freeze.js`.

**Lifecycle**: `draft` → `counting` → `review` (counting closed; only recounts accepted) → `finished` (the act made) or `cancelled`. Created with «start now» by default. One active session per scope: a second one over overlapping bins / categories of the same warehouse is refused (`409 SESSION_ACTIVE`). A session made from a schedule copies its scope; finishing it moves the schedule's next date by N days.

**Scope and areas**: the warehouse, optionally bins (a zone includes its subtree) and categories (with subcategories). Areas are the bins of the scope that can hold stock — leaves of the bin tree and any bin with stock (also archived ones) — plus «без ячейки» when the scope is not limited by bins (or the warehouse has no bins: one area). Progress = areas marked done / all.

**Freeze** (spec §6.1): policy `block` (default) or `record`. With `block`, while the session is counting / under review / finished with its act not posted yet (draft, pending approval, approved), `Register.flush()` refuses every posting that changes a warehouse row in the scope (`409 FROZEN` with the session number and item) — receipts, issues, transfers (ship and receive), write-offs, returns, corrections, discrepancy acts, storno; holders' rows (employees, objects, transit) are not frozen. The session's own act passes. Banners: `FreezeBanner` on the mobile home and flows, the document form and card (`GET /inventory/active`). With `record` movements go through; the reconciliation lists them («Движения во время подсчёта»).

**Assignment**: `PUT /inventory/:id/assign { binIds, userId }` — zones expand to their bins, `0` is «без ячейки», `userId: null` unassigns; the person joins the session and gets `warehouse.inventory_assigned`. Counters may also be added without areas. Who may count: everyone taking part (assigned or added) and those with `inventory` on the warehouse; assignment is guidance, anyone taking part may count any area (overlaps become conflicts).

### Counting from the phone

`/m/inventory/:id`: the progress ring, «Мои ячейки / Все» with colours by status, a scan of a bin label (or a tap) opens the bin. In the bin: scan items → the quantity sheet → «Добавить» (an **add** operation; a tap on a counted row corrects it with a **set**), a tool label counts the instance, «Ячейка посчитана» (**done**). **Serial items are counted per instance**: the item's own code asks for the tool's label; a tap on a counted serial row lists its pieces with «Убрать» (a **set 0** with the instance); the server refuses a quantity of a serial item without an instance (`SERIAL_SCAN_INSTANCE`) and a quantity other than 0 / 1 on an instance (`INSTANCE_QTY`). Not in blind mode the book of the bin is listed («По учёту здесь») and ticks off as items are counted. A bin under recount is marked; a new count of a recounted item replaces everyone's earlier rows.

**Offline**: every operation gets a client id (`crypto.randomUUID`) and goes to a queue in `localStorage` (`wh.inv.queue.<session>`, memory when storage is blocked); the queue is sent in order (`POST /inventory/:id/sync`, 100 per request) at once, every 15 s, on the `online` event and when the tab gets focus again. Answers per op: `applied`, `duplicate` (that id was applied before — re-sending after a lost answer changes nothing, also for two parallel requests), `rejected` (with the code: `NOT_IN_SCOPE`, `SESSION_CLOSED`, `BAD_OP`…) — only these per-op rejections leave the queue. A request refused as a whole drops its ops only for `SESSION_CLOSED` / `NOT_FOUND` (the session is closed or gone); signed out (401), refused (403), rate-limited (429), timed out (408), a server error or no network keep everything and the badge says «Войдите снова / Отправка приостановлена · N сохранено на телефоне»; after signing in the queue goes on. A batch too large (413) is halved (`mobile/offlineStore.js`, unit-tested). The phone's `recount` flag is ignored: a count replaces other counters' rows only when the manager opened a recount for that item. The screen shows «Сохранено / К отправке: N / Нет сети · ждут N» and merges the queue into «Посчитано мной». Codes resolved before (and the items of the bin) are remembered on the device, so scanning goes on without a connection; area views and the session card are cached too. Posting the act stays online.

**Two counters in one bin**: each has own rows; the reconciliation sums them and flags a **conflict** with the breakdown («Нурлан 7 + Айбек 5»); the manager may take one counter's figure, the sum or an own figure (`PUT /final`), or send the row to recount. An **instance** scanned by two counters counts once (the maximum, never above 1; no conflict when they agree); one found in two bins stops the finish with `409 INSTANCE_TWICE` (its inventory number) until the manager decides one of them (`PUT /final … qty 0`).

**Reconciliation** (`GET /inventory/:id/reconcile?onlyDiff=1`, `warehouse.inventory` on the warehouse): rows per bin × item (serial items scanned by instance: per instance; an instance the register holds elsewhere is marked and left out of the act) with book, counted, difference, status (`match`, `surplus`, `shortage`, `pending` for bins not counted), the sum of the difference (unit cost = the warehouse pool's average, else the last average, else the last price) only with `warehouse.cost` there; summary (matches, surplus, shortage, conflicts, gross / net sums by right); «the act goes to approval» when the gross difference is above the threshold. **Blind mode**: counting endpoints never send the book; the reconciliation is refused (`403 BLIND`) to a counter of the session (who is not its creator or an admin) until counting is closed.

**Finish** (`POST /finish { force }`): the session row is locked first and the counts are read after the lock inside the same transaction (a phone's sync holds the session `FOR SHARE`, so the act includes every op committed before it and later ops get `SESSION_CLOSED`). Bins not marked done are refused (`409 AREAS_NOT_DONE`) unless `force` — then they are left out and their stock does not change; but an instance found in a counted bin while the book keeps it in an uncounted bin of the scope is **moved by the act** (a line «0» for its booked bin, shortages are posted before surpluses and the instance keeps its own cost), so it is never in two bins. ONE `inventory` document is created with a line per compared row of the counted bins (matches included; `counted_qty`, the bin, the instance) and posted at once through `postDoc`: above `approvalThreshold` (gross difference, setting `approvalTypes` includes `inventory`) it goes to approval and is posted by the decision. Posting makes the book equal to the count **per bin**: for an act of a session a line without a bin means the stock without a bin only (the posting engine's `exactBin`), so uncounted bins are never touched. The act links back to the session (`document.inventorySession`). A rejected / reversed act — or a deleted one (a draft act that failed to post, returned by an approver; the session keeps `doc_id = NULL`) — lets the session be reopened for review (we chose reopening over forbidding the delete: no new step for the manager). **Batch and serial items in the act**: a surplus of a batch item counted without a batch arrives into the newest batch at that place (else at the warehouse, else a new batch named after the act) — no stock row without a batch; a serial item is never «found» by quantity (`409 SERIAL_INSTANCE_REQUIRED` at the finish, `400` at posting a manual act), a serial line without an instance covers only the stock without an instance when the act lists instances of that item in the bin, and pieces the act takes off the books become `lost`.

**Regular partial counts**: `wh_inv_schedules` — warehouse, categories and / or bins, every N days, the next date, blind. Job `warehouse:inventory` (hourly, module on): a due schedule without a running session notifies the MOL and those with `inventory` / `admin` assigned there (`warehouse.inventory_due`, link «start from the schedule») — once on the due day, then once a week while overdue (keys `invdue:*` in `wh_notices`).

**Permissions**: create, assign, review, recount, decide, finish, cancel — `warehouse.inventory` on the warehouse (the MOL has it; a global permission covers all). Counting — those taking part or with the right. Sums only with `warehouse.cost` on that warehouse; the route strips money keys for people without cost anywhere.

## HTTP API

`/api/app/warehouse` (signed-in; API tokens need the `warehouse` area). Details and examples are in the API reference (*Developers*).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/meta` | Settings subset, warehouses with my rights, categories, rights summary, linked modules, enums |
| GET | `/people`, `/groups` | Pickers |
| GET | `/resolve?code=&warehouse=` | What a scanned code is |
| GET / POST | `/items` | List (`q`, `category`, `tracking`, `archived`, `page`, `pageSize`) / create |
| GET / PUT | `/items/:id` | Card / update (also `barcodes`, `norms`) |
| POST | `/items/:id/archive`, `/restore`, `/barcodes` · DELETE `/barcodes/:id` · PUT `/items/:id/norms` | |
| GET / POST / PUT / DELETE | `/categories[/:id]` | Category tree |
| GET / POST / PUT | `/warehouses[/:id]` | Warehouses |
| GET / POST | `/warehouses/:id/bins` · PUT `/bins/:id` | Bins (`codes[]` for a series) |
| GET / PUT | `/warehouses/:id/access` | Zone of responsibility |
| GET | `/stock` | Stock (`chip`, `group`, `warehouse`, `q`, `category`, `item`, `page`, `pageSize`) |
| GET | `/stock/hints?warehouse=&items=` (or `holderType`, `holderId`) | Line hints |
| GET / POST | `/reserves` · POST `/reserves/:id/release` | Reserves |
| GET / POST | `/documents` · GET `/documents/counters` | List and chips / new draft |
| POST | `/documents/from-procurement` | Receipt draft from a purchase request |
| GET / PUT / DELETE | `/documents/:id` · GET `/documents/:id/history` | Card / header + lines / delete a draft / history |
| POST / PUT / DELETE | `/documents/:id/lines[/:lineId]` | Incremental lines |
| POST | `/documents/:id/post` · `request` · `ship` · `receive` · `storno` · `confirm` · `decline` · `signature` · `order-shortage` | Actions |
| POST | `/procurement/order` | Purchase draft for a warehouse (`belowMin` or `items`) |
| POST / GET / DELETE | `/(items\|documents\|tools)/:id/files` · `/files/:id/file` · `/files/:id` | Attachments |
| GET | `/tools`, `/tools/mine`, `/tools/:id` · PUT `/tools/:id` · POST `/tools/handover` | Tools |
| GET | `/reports/turnover`, `/reports/movement`, `/reports/by-object`, `/reports/tools`, `/reports/:kind.csv` | Reports |
| POST | `/import/items`, `/import/opening` | Imports (`dryRun`) |
| GET | `/lookup/:kind` (`companies`, `projects`, `objects`, `deals`, `requests`), `/widget` | Pickers, dashboard |
| GET / PUT | `/settings` | Module settings (`warehouse.admin`) |
| GET / POST | `/inventory` (`status`, `active`, `warehouse`, `mine`, `q`) | Inventory sessions with progress and counters / create (`warehouseId, title, binIds, categoryIds, blind, freezePolicy, counters, start, scheduleId`) |
| GET | `/inventory/active?warehouse=` | Running inventories (banners) |
| GET | `/inventory/:id` · `/inventory/:id/area?bin=` | The card (areas, people, recounts, actions) / one bin for a counter |
| POST | `/inventory/:id/start` · `close` · `reopen` · `cancel` · `finish` · `recount` · `people` | Actions |
| PUT | `/inventory/:id/assign` · `/inventory/:id/final` | Areas to a counter / the manager's decision of a row |
| POST | `/inventory/:id/sync` | Counting operations from phones (idempotent by `clientId`) |
| GET | `/inventory/:id/reconcile?onlyDiff=1` | Reconciliation |
| GET / POST / PUT / DELETE | `/inventory/schedules[/:id]` | Regular partial counts |

Error codes: `INSUFFICIENT` (with `info.shortages`), `FROZEN` (with `info.session`), `SESSION_ACTIVE`, `SESSION_CLOSED`, `NOT_IN_SCOPE`, `AREAS_NOT_DONE`, `NOTHING_COUNTED`, `BLIND`, `BAD_OP`, `NO_AREAS`, `FORBIDDEN`, `NOT_FOUND`, `LOCKED`, `STALE`, `BAD_TRANSITION`, `USE_SHIP`, `USE_CONFIRM`, `NO_LINES`, `LINE_ITEM_REQUIRED`, `LINE_QTY_REQUIRED`, `WAREHOUSE_REQUIRED`, `HOLDER_REQUIRED`, `SAME_WAREHOUSE`, `REASON_REQUIRED`, `PERIOD_CLOSED`, `BACKDATE_FORBIDDEN`, `FUTURE_DATE`, `BAD_UNIT`, `ITEM_ARCHIVED`, `SERIAL_WHOLE`, `DUPLICATE_INSTANCE`, `INVENTORY_NO_TAKEN`, `BARCODE_TAKEN`, `SKU_TAKEN`, `UNKNOWN_CODE`, `NOT_HELD`, `HANDOVER_PENDING`, `NO_RATE`, `MODULE_DISABLED`, `REQUEST_NOT_APPROVED`, `NOTHING_TO_ORDER`, `NO_ESCALATION`, file errors. CSV exports start with a BOM, use `;` and neutralise formulas (as in Procurement); Excel files are built in the browser from the same (already cost-filtered) data.

## API for the mobile / inventory stage

The mobile «кладовщик» mode and inventory counting screens are a later stage built on these endpoints:

- **Scan → what is it**: `GET /resolve?code=<scanned>&warehouse=<id>` → `kind` `item` (with `unit` / `factor` of a pack barcode), `instance` (with «где сейчас»), `batch`, `bin`, `warehouse`, `document` (e.g. scanning a transfer number to accept it), `ambiguous` (`matches`). Labels printed by the module carry `WI-<item>`, `WB-<bin>`, `WT-<instance>`, `WW-<warehouse>`; tools also their inventory number.
- **Documents line by line**: `POST /documents` (`{ type, warehouseId, toWarehouseId, toHolderType, toHolderId, … }`) then `POST /documents/:id/lines` with `{ code }` or `{ itemId, qty, unit, binId, toBinId, batchId, instanceId }` per scan (merges into the same line; `merge: false` forces a new one), `PUT/DELETE /documents/:id/lines/:lineId`, then `POST /documents/:id/post` (or `ship`; `receive` with `{ lines: [{ lineId, receivedQty, toBinId }] }`). Every answer is the whole card with `hint` per line, `short` flags and `my` (allowed actions). Attach photos with `POST /documents/:id/files` (multipart `files[]`, `kind`), the signature with `POST /documents/:id/signature`.
- **Stock where I stand**: `GET /stock?group=bin&warehouse=&bin=` (by bin), `GET /stock/hints?warehouse=&items=` (quick hints), `GET /items/:id` (bins, batches, instances).
- **Inventory**: the document type `inventory` — lines with `countedQty` (and optional `binId` / `batchId` / `instanceId`); posting stores `book_qty`, makes the book equal to the count (surplus at the current average, shortage at cost), and goes to approval when the gross difference is above the threshold. Inventory **sessions** (built on it) are described [above](#inventory-sessions): counts from phones (`POST /inventory/:id/sync` with client ids), reconciliation, one act per session.

## Code map

```
src/backend/modules/warehouse/
  index.js       descriptor; approval type, «Ждёт меня» providers
  schema.js      tables, the journal trigger, the daily job
  logic.js       pure rules: types, statuses, rights, units, costing, currencies, threshold, codes, cost stripping, card actions (unit-tested)
  access.js      context and rights per warehouse, document visibility, helpers
  posting.js     the posting engine (Register), discrepancy acts, storno
  freeze.js      the inventory freeze checked by Register.flush()
  inventory.js   inventory sessions: scope, areas, counting sync, reconciliation, the act, schedules, reminders
  inventoryLogic.js  pure rules of sessions: freeze, scope, count ops, reconcile, act lines, schedules (unit-tested)
  documents.js   documents: lists, chips, card, lines, create / update, post, request, ship, receive, storno, hand-over, signature, webhooks
  items.js       nomenclature, categories, barcodes, norms, resolve
  warehouses.js  warehouses, bins, zones of responsibility, keepers
  stock.js       stock table, hints, holders, reserves
  tools.js       instances, «где сейчас», «мой инструмент», hand-over
  reports.js     turnover, movement, by object, tools by holder, CSV
  importer.js    Excel / CSV import of items and opening balances
  procurement.js link with Procurement (receipt from request, delivery mark, purchase drafts)
  approval.js    registerApprovalType('warehouse.document')
  jobs.js        warehouse:daily
  files.js       attachments and signatures
  lookups.js     pickers, dashboard widget data
  messages.js    notification texts
  routes.js      /api/app/warehouse (cost stripping of every answer)
src/backend/modules/procurement/money.js   + recordExternalDelivery() (the delivery hook)
src/frontend/src/modules/warehouse/
  WarehouseApp.jsx, WhContext.jsx, api.js, lib.js, xlsx.js, warehouse.css
  pages/  StockPage, ItemsPage, DocumentsPage, DocForm, ToolsPage, MyToolsPage, ReportsPage, WarehousesPage, ImportPage, SettingsPage, InventoryPage
  mobile/ MobileApp (routes /m), MobileHome, MobileDocFlow, MobileAccept, MobileFind, MobileInventory, parts (sheet, quantity sheet, scan bar, success screen…), offlineQueue, codes, mobile.css
  card/   ItemCard, DocCard
  components/  bits (pills, pickers, hints, files, signature pad), ItemForm, CategoriesDialog, createMenu
  settings/SettingsForm.jsx, WarehouseSettings.jsx (console), WarehouseWidgets.jsx (dashboard)
  components/FreezeBanner.jsx  «идёт инвентаризация» on documents and in the mobile mode
src/frontend/src/i18n/warehouse.js, i18n/warehouseMobile.js (whm.*), help/content/warehouse.js
```

Shared UI used: `components/ui/BarcodeScanner.jsx` (camera scanner, `useScannerInput` for wedge scanners, `ScanButton`) and `components/ui/Labels.jsx` (`PrintLabelsDialog`) with `lib/labels.js`.

## Demo data and tour

- `modules/warehouse/demo.js` (after Procurement, Masterplan, Counterparties, Org, Employees): «Демо: центральный склад» with zones and racks and «Демо: склад объекта «Северный квартал»», 30 items in seven categories (by quantity, by batch with expiry dates, serial tools `DEMO-INV-001…`), posted opening balances, a receipt from the supplier, an issue of tools to the foreman, a requisition waiting for the storekeeper, a transfer in transit, a write-off above the threshold in approval, a reserve for the demo building, three items below the minimum, a tool due for service and a site inventory half counted. Everything goes through the module's documents and posting. The journal is append-only: the purge removes the demo documents' movements in one transaction with `wh.purge` on, never real ones; an item or a warehouse real documents use is kept.
- Tour `warehouse` (`modules/warehouse/tour.js`, texts `tour.warehouse.*`): stock chips, search and grouping, «Создать» documents, the document journal, tools, inventory, the mobile mode. Anchors `wh.chips`, `wh.toolbar`, `wh.create`, `wh.nav.documents`, `wh.nav.tools`, `wh.nav.inventory`, `wh.nav.mobile`.

## Tests

- `test/warehouse.test.js` (always): catalog and defaults (off by default, the $500 threshold), settings sanitizing, units and conversion, moving average, currencies and the threshold with a non-USD base, rights per warehouse (global, assignment, MOL, admin), card actions per status and rights, shortages and stock flags, cost stripping, scan codes and EAN-13, the CSV formula guard, catalogued notifications / webhooks and texts without sums.
- `test/warehouse.db.test.js` (`WAREHOUSE_DB_TEST=1 ENV_FILE_PATH=… node --test test/warehouse.db.test.js`, a test database only): unit conversion and the moving average (also a receipt in KGS), the pack barcode, no negative stock with the shortage list, two concurrent issues of the last 5 pcs (one wins), reserves, the two-step transfer with a discrepancy act and the MOL's inbox, storno (and refusal after use; the append-only journal), write-off below / above the threshold with approval, serial tools with issue, «my tools» and the confirmed hand-over (inbox), cost hiding in every answer and CSV, rights per warehouse (assignment, visibility without «everyone views»), receipt from a purchase request with partial then full delivery, «order what is missing», Procurement switched off, FEFO with batch cost, the inventory act, the daily digest and service reminders sent once, turnover and «by holder» reports against the register.

- `test/warehouse-inventory.test.js` (always): freeze states and scope, frozen-row detection, count operations and their validation, reconciliation with two counters and the manager's decision, sums only with costs, serial items per instance and instances held elsewhere, act lines, areas from the bin tree, schedules and reminder keys, session actions, money keys and notification texts, catalogued notification kinds.
- `test/warehouse-review.db.test.js` (`WAREHOUSE_DB_TEST=1`; it switches «everyone views» off for a moment — run the warehouse DB files with `--test-concurrency=1`): sums out of history and approvals without cost rights, a decline racing the confirmation, storno in a closed period, the storno cost adjustment, the procurement delivery taken back by a storno (dated the portal's today), batches / lost instances / one-piece instances in counts, serial counts per instance and instances counted once, the client's recount flag ignored, the forced finish moving an instance and racing a sync, `INSTANCE_TWICE`, reopening after a deleted act, the bulk session list, the holder write-off limited to its warehouse, old drafts dated at posting, empty received quantities, visibility of tools / codes / hints / reports, reserves given back by a storno.
- `test/warehouse-offline-queue.test.js` (always): what the phone's queue keeps (401 / 403 / 408 / 429 / 5xx / no network) and drops (per-op rejections, `SESSION_CLOSED`, `NOT_FOUND`), smaller batches after 413.
- `test/warehouse-inventory.db.test.js` (`WAREHOUSE_DB_TEST=1`): permissions (create, visibility, counters cannot review or finish), the freeze refusing write-offs and receipts with `FROZEN` and the active list, two counters in parallel summed with the conflict, the offline queue re-sent twice in parallel (all `duplicate`), bad ops and bins outside the scope rejected, refusing to finish with bins not counted, the manager's decision, cost hiding, one act above the threshold → approval → posted with the book equal to the count bin by bin (also the stock without a bin and instances), the freeze holding until posted, a partial session by category with «record» (other goods move, movements listed, out-of-scope items rejected), recount and review, blind mode, schedules with a reminder once and the next date moved.

## Limits and next steps

- Backdated documents are journaled at their date and checked against the closed period, but the shortage check uses the current balance and costs are not recomputed retroactively (spec §5.1 «пересчёт от даты» — v2 together with FIFO and a full period close).
- Exchange rates are module settings (units per 1 base), fixed in each receipt; the portal has no dated rate table yet.
- Inventory: batch items are counted per bin × item (shortages leave by FEFO, surpluses arrive into the newest batch of the place); serial items are counted per instance (a bin where no instance was scanned compares by quantity: missing pieces leave, none can be «found» without its label). Resolving a code offline works only for codes seen before on the device. Kits, printable forms by templates, ABC and slow-movers reports, the 1С exchange are v2 / v3 (spec §12).
- Hints and the «materials by holder» report for someone else's holdings count only what came from the warehouses the person sees (own holdings in full).
