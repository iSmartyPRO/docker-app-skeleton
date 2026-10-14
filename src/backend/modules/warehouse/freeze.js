import { httpError } from './logic.js';
import { frozenHit } from './inventoryLogic.js';

/*
 * The inventory freeze (spec §6.1 «склад замораживается по выбранным
 * позициям: движения запрещены»). Every posting writes the register through
 * Register.flush(), which calls this inside the posting transaction: when a
 * changed warehouse row falls into the scope of a session with the policy
 * «block» that is counting, under review, or finished with its act not posted
 * yet, the posting is refused with 409 FROZEN. The session's own act passes.
 * Sessions with the policy «record» let movements through; the reconciliation
 * lists them (inventory.js).
 */

const ACTIVE_SQL = `
  SELECT s.id, s.number, s.warehouse_id, s.bin_ids, s.category_ids, s.doc_id, w.name AS warehouse_name
  FROM wh_inv_sessions s
  JOIN wh_warehouses w ON w.id = s.warehouse_id
  LEFT JOIN wh_docs d ON d.id = s.doc_id
  WHERE s.freeze_policy = 'block' AND s.warehouse_id = ANY($1::int[])
    AND (s.status IN ('counting', 'review') OR (s.status = 'finished' AND d.status IN ('draft', 'pending', 'approved')))
    AND (s.doc_id IS NULL OR s.doc_id <> $2)`;

export async function frozenSessions(client, warehouseIds, docId = 0) {
  if (!warehouseIds.length) return [];
  const { rows } = await client.query(ACTIVE_SQL, [warehouseIds, docId || 0]);
  return rows;
}

/** Throws 409 FROZEN when one of the changed register rows is in a frozen scope. */
export async function assertNotFrozen(client, docId, rows, items = new Map()) {
  const changed = rows.filter((r) => r.holder_type === 'warehouse');
  if (!changed.length) return;
  const sessions = await frozenSessions(client, [...new Set(changed.map((r) => Number(r.warehouse_id)))], docId);
  if (!sessions.length) return;
  const categoryOf = new Map();
  const missing = [];
  for (const r of changed) {
    const item = items.get(Number(r.item_id));
    if (item) categoryOf.set(Number(r.item_id), item.category_id ?? null);
    else missing.push(Number(r.item_id));
  }
  if (missing.length) {
    const { rows: found } = await client.query(`SELECT id, category_id FROM wh_items WHERE id = ANY($1::int[])`, [missing]);
    for (const row of found) categoryOf.set(row.id, row.category_id);
  }
  const hit = frozenHit(sessions, changed, categoryOf);
  if (!hit) return;
  const { rows: names } = await client.query(`SELECT name FROM wh_items WHERE id = $1`, [hit.itemId]);
  throw httpError(409, `${hit.session.warehouse_name}: inventory ${hit.session.number} is in progress, movements are blocked`, 'FROZEN', {
    session: { id: hit.session.id, number: hit.session.number, warehouseId: hit.session.warehouse_id, warehouse: hit.session.warehouse_name },
    itemId: hit.itemId,
    name: names[0]?.name || '',
  });
}
