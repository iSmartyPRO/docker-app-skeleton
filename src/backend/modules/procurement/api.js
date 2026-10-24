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

const ids = (list) => [...new Set((list || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];

/**
 * Requests forget contracts that are going away (the Contracts demo data being removed): their link and
 * label are cleared. → the number of requests changed. Contracts calls it instead of writing proc_requests.
 */
export async function forgetContracts(contractIds) {
  const list = ids(contractIds);
  if (!list.length) return 0;
  const { rowCount } = await query(`UPDATE proc_requests SET contract_id = NULL, contract_label = NULL WHERE contract_id = ANY($1::int[])`, [list]);
  return rowCount;
}

/**
 * Requests forget «objects» projects that are going away (the Masterplan demo data being removed): project and
 * object links and labels are cleared. → the number of requests changed.
 */
export async function forgetProjects(projectIds) {
  const list = ids(projectIds);
  if (!list.length) return 0;
  const { rowCount } = await query(`UPDATE proc_requests SET project_id = NULL, project_label = NULL, object_id = NULL, object_label = NULL WHERE project_id = ANY($1::int[])`, [list]);
  return rowCount;
}
