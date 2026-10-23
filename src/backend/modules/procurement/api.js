/*
 * Public API of Procurement for other modules (docs/procurement.md). Warehouse
 * uses it at run time (Procurement is an optional link: `modules.loaded('procurement')?.api`):
 * receipts from purchase requests, delivery marks, drafts for missing goods.
 * Everything else in this folder is internal.
 */

export { listRequests, getRequest, createRequest } from './service.js';
export { recordExternalDelivery, revertExternalDelivery } from './money.js';

import { query } from '../../config/database.js';

/**
 * The ordered quantity of each line of a request, [{ id, qty }] (no access check: the caller —
 * Warehouse posting or reversing a receipt of that request — already holds the request's id).
 * Warehouse uses it instead of reading proc_items (another package's table).
 */
export async function requestLineQuantities(requestId) {
  const id = Number(requestId);
  if (!Number.isInteger(id) || id < 1) return [];
  const { rows } = await query(`SELECT id, qty FROM proc_items WHERE request_id = $1 ORDER BY sort, id`, [id]);
  return rows.map((row) => ({ id: row.id, qty: Number(row.qty) }));
}
