import { query } from '../../config/database.js';
import { pickerLookup } from '../../platform/pickers.js';
import { whContext } from './access.js';
import { httpError, q4 } from './logic.js';
import { deliverableRequests } from './procurement.js';
import { listDocs } from './documents.js';
import { myTools } from './tools.js';

/*
 * Pickers for links to other modules — the core pickers (platform/pickers.js)
 * the Procurement form uses too (Counterparties, Masterplan projects and objects, CRM deals), each
 * answering only while its module is on and with that module's access
 * rules — plus approved purchase requests waiting for goods.
 */
export async function lookup(req, kind, input = {}) {
  if (kind === 'requests') return deliverableRequests(req, input);
  if (['companies', 'projects', 'objects', 'deals'].includes(kind)) return pickerLookup(req, kind, input);
  throw httpError(404, 'Unknown lookup', 'NOT_FOUND');
}

/** Dashboard widgets: below minimum, transfers waiting for me, tools on me. */
export async function widget(req) {
  const ctx = await whContext(req);
  const visible = ctx.visibleIds();
  const { rows: low } = await query(
    `SELECT n.item_id, n.warehouse_id, i.name, i.base_unit, w.name AS warehouse_name, n.min_qty,
            (SELECT COALESCE(SUM(s.qty), 0) FROM wh_stock s WHERE s.item_id = n.item_id AND s.warehouse_id = n.warehouse_id AND s.holder_type = 'warehouse') AS qty
     FROM wh_norms n JOIN wh_items i ON i.id = n.item_id AND i.archived_at IS NULL JOIN wh_warehouses w ON w.id = n.warehouse_id AND w.archived_at IS NULL
     WHERE n.min_qty > 0 AND ($1::int[] IS NULL OR n.warehouse_id = ANY($1::int[]))`,
    [visible]
  );
  const below = low.filter((row) => Number(row.qty) < Number(row.min_qty)).sort((a, b) => Number(a.qty) / Number(a.min_qty) - Number(b.qty) / Number(b.min_qty));
  const incoming = await listDocs(req, { chip: 'awaiting_receipt', pageSize: 6 });
  const mine = await myTools(req);
  return {
    belowMin: { count: below.length, items: below.slice(0, 6).map((row) => ({ item: { id: row.item_id, name: row.name, baseUnit: row.base_unit }, warehouse: { id: row.warehouse_id, name: row.warehouse_name }, qty: q4(row.qty), minQty: Number(row.min_qty) })) },
    awaitingReceipt: { count: incoming.total, items: incoming.items },
    myTools: { count: mine.tools.length + mine.items.length, tools: mine.tools.slice(0, 6), items: mine.items.slice(0, 6), incoming: mine.incoming },
  };
}
