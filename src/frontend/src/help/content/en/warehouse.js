export default {
  id: 'warehouse',
  icon: 'box',
  title: 'Warehouse',
  tagline: 'Stock in real time, every movement by a document, tools in sight. Works from the phone and a scanner.',
  summary: 'The warehouse keeps quantities, storage places, responsible people and cost. Receipts, issues, transfers and write-offs are documents made in three steps. You cannot issue more than there is, and two storekeepers never issue the same piece. Tools are tracked by instance: where each one is and when it needs service.',
  highlights: [
    {
      icon: '📷',
      title: 'Scanner everywhere',
      text: 'The phone camera or a USB/Bluetooth scanner: every scan adds an item to the document.',
    },
    {
      icon: '🧮',
      title: 'No negative stock',
      text: 'Each line shows «on hand · reserved · available»; a shortage is highlighted and ordered in Procurement.',
    },
    {
      icon: '🚚',
      title: 'Two-step transfers',
      text: 'Shipped — the goods are «in transit»; the MOL accepts, a difference becomes an act.',
    },
    {
      icon: '🔧',
      title: 'My tools',
      text: 'What is on me, hand-over to a colleague with confirmation, service reminders.',
    },
    {
      icon: '🔒',
      title: 'Sums by right',
      text: 'Storekeepers and foremen see quantities; cost only accounting and management.',
    },
  ],
  tips: [
    'The fastest way to find an item is a scan: the camera button on top of «Stock».',
    '«Like last time» takes the lines of the last document of the same kind.',
    'Enter in packs — the system converts to pieces: «2 packs = 48 pcs».',
    'A posted document is never deleted: «Storno» corrects a mistake.',
    'Print QR labels for bins and tools — then pointing the camera is enough.',
    'On the phone open «Storekeeper mode» — big tiles, one-handed work.',
  ],
  sections: [
    {
      id: 'stock',
      title: 'Stock',
      body: `The main screen. A row shows the item, warehouse, on hand, reserved, available, minimum and last movement (the sum only with the «Cost» right).

- Chips: **Below minimum**, **Out of stock**, **Expiring**, **Reserved**, **No movement 90 days**, **My warehouses**.
- Grouping: by warehouse, by category, by holder (warehouses, people, objects), by bin of the chosen warehouse.
- A click opens the item card: stock by warehouses and bins, movements, batches and instances, reserves, barcodes, norms and photos.
- With «Below minimum» on one warehouse there is «Order in Procurement» — a draft purchase request up to the reorder point.`,
    },
    {
      id: 'documents',
      title: 'Documents in three steps',
      steps: [
        'Press «New document» and choose the type: receipt, issue, transfer, return, write-off…',
        'Step 1 «From / to»: warehouse, recipient (a person or a Masterplan object), supplier, write-off reason.',
        'Step 2 «Lines»: scan, search or press «Like last time». Each line shows the stock hint; a shortage is red.',
        'Step 3 «Post»: attach a photo of the waybill, the recipient signs with a finger, press «Post».',
      ],
      note: 'A foreman without the storekeeper right creates a **requisition** and sends it to the storekeeper, who posts the issue. Statuses: Draft → (In approval) → Posted → (Reversed).',
    },
    {
      id: 'transfer',
      title: 'Transfer and acceptance',
      body: 'A transfer has two steps. The storekeeper of the source presses «Ship» — the goods leave the warehouse and are «in transit». The MOL of the destination sees it in the «Waiting for acceptance» chip and on «Waiting for me», presses «Accept» and checks the quantity of each line. A difference posts a **discrepancy act** automatically: a shortage leaves the transit, a surplus arrives.',
    },
    {
      id: 'procurement',
      title: 'Receipt from a purchase request',
      body: 'In a new receipt choose an approved request: items, supplier, prices and currency are filled in, items match by SKU or name. Posting marks the delivery in the request — partial while something is still to come. From an issue with a shortage, «Order what is missing» creates a draft purchase request.',
    },
    {
      id: 'writeoff',
      title: 'Write-off and approval',
      body: 'A reason is required: used in work, defect, damage, shortage, expired… Above the threshold ($500 by default) the document goes to approval and is posted by itself after the decision. The route is set up in «Approvals».',
    },
    {
      id: 'mobile',
      title: 'Storekeeper mode on the phone',
      steps: [
        'Open «Storekeeper mode» in the warehouse menu (/app/warehouse/m) and pick your warehouse — the phone remembers it.',
        'Tiles: Receipt, Issue, Transfer, Accept transfer, Inventory, Find an item, My tools.',
        'Scan with the camera (it stays open between scans) or a USB / Bluetooth scanner. A quantity sheet opens after a scan: «−» and «+», the «pack ↔ pcs» switch with «2 packs = 48 pcs». A repeat scan of the same item adds one. The «+1 at once» switch adds without asking.',
        'Scan a bin label — the next lines go there. In an issue each line shows «on hand · available», a shortage is red.',
        'The last step: a photo of the waybill, the recipient’s finger signature (issues), «Post» — and a result screen.',
      ],
      note: 'A receipt from a purchase request: the lines come from the request; «Count by fact» zeroes them and you count what arrived by scanning. Lines that did not arrive are left out, the request gets its delivery mark.',
    },
    {
      id: 'inventory',
      title: 'Inventory',
      steps: [
        '«Inventory» → «New»: the warehouse, optionally bins or categories (a partial count), the «blind» mode and what to do with movements — block or record separately. Choose the counters.',
        'On «Bins and counters» select bins or a zone and assign a person. Print bin labels if there are none.',
        'On the phone a counter scans the bin, then the goods, and enters the quantity; at the end — «Bin counted». Without a connection the counts wait in the phone and go out by themselves when it is back.',
        '«Reconciliation»: book, count, difference and its sum (with the «Cost» right), the «Only differences» filter. Where two people counted, the counts are summed and flagged — press «Decide». Any row can go back for a recount.',
        '«Finish and make the act»: one inventory act; above the threshold it goes to approval. Once posted the stock equals the count and the freeze ends.',
      ],
      note: 'Regular partial counts («every 30 days: electrics») are set on the «Regular» tab — a reminder comes when one is due. While an inventory blocks movements, receipts, issues and transfers of its scope are not posted — a red banner warns about it.',
    },
    {
      id: 'tools',
      title: 'Tools',
      body: 'Serial items are tracked by instance with an inventory number. The registry shows where each one is now: a warehouse and bin, a person or an object; filters «On me», «In repair», «Service soon». In «My tools» a person sees what is on them and may hand it to a colleague — it passes when the colleague confirms. Reminders come before service and when something is not returned on time.',
    },
    {
      id: 'reports',
      title: 'Reports',
      body: `- **Turnover statement**: opening, in, out, closing for the period — quantity and sum.
- **Item movement** with documents and the balance after each.
- **Materials by object**: issued, returned, written off and what is on it.
- **Tools by holder**.

Excel (CSV) exports are protected against formulas; sums only with the «Cost» right.`,
    },
    {
      id: 'warehouses',
      title: 'Warehouses, bins, rights',
      body: 'The warehouse administrator creates warehouses (main, site, transit, mobile), sets the MOL, switches bins on (zone → rack → shelf) and prints QR labels for them. «Who works here» grants rights on one warehouse: the storekeeper of A does not post documents of B, but sees its stock if allowed.',
    },
    {
      id: 'import',
      title: 'Import from Excel',
      body: 'Items and opening balances come from .xlsx or .csv. Download the template, fill it in and press «Check» — a list of errors by row appears. Opening balances create an «Opening balances» document.',
    },
  ],
  faq: [
    {
      q: 'Why can’t I see sums?',
      a: 'Cost and sums are shown only to people with «Warehouse: see costs and sums». Others see quantities.',
    },
    {
      q: 'A posted document is wrong — how to fix it?',
      a: 'Press «Storno» with a reason: an opposite document is posted. Then create the right one.',
    },
    {
      q: 'Why doesn’t the document post?',
      a: 'Most likely the stock is short: the lines are red and the hint shows what is available. Stock reserved for something else is not issued.',
    },
    {
      q: 'A document does not post: «inventory in progress»',
      a: 'The warehouse is being counted with movements blocked. Wait until its act is posted or ask the person running it to finish.',
    },
    {
      q: 'Can I post with a past date?',
      a: 'Yes, with the «Backdate documents» right and only in the open period.',
    },
  ],
  related: [
    'procurement',
    'approvals',
    'masterplan',
  ],
};
