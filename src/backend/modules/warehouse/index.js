import { query } from '../../config/database.js';
import { decide } from '../../api/scopes.js';
import { registerInboxProvider } from '../../services/inbox.js';
import { ensureWarehouseSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { registerWarehouseApproval } from './approval.js';
import { usersByIds, whContext, warehouseSettings } from './access.js';
import { confirmHandover, docUrl } from './documents.js';
import { httpError } from './logic.js';

/*
 * Warehouse (spec: docs/specs/warehouse.ru.md, docs/warehouse.md): the
 * nomenclature, warehouses with bins, the stock register with reserves and
 * moving-average costs, documents (receipt, issue, transfer, return,
 * write-off, opening balances, correction, hand-over of tools, storno), tools
 * with «Мой инструмент», reports, imports. Off by default.
 *
 * At import time it registers the approval type 'warehouse.document' and the
 * «Ждёт меня» providers: incoming transfers to accept, requisitions to issue,
 * tool hand-overs to confirm.
 */

registerWarehouseApproval();

/** An API token sees these only with the warehouse area in its scope. */
function tokenAllows(ctx, method = 'GET') {
  const policy = ctx.apiToken?.policy || ctx.req?.apiToken?.policy;
  return !policy || decide(policy, method, '/app/warehouse/documents').ok;
}

/** A request-like object for the module's access checks from an inbox context. */
const asReq = (ctx) => ctx.req || { user: ctx.user, access: ctx.access, apiLimits: ctx.apiLimits || null, headers: {}, cookies: {} };

/** Warehouse ids where the person may do `right` (null = all). */
function idsWith(wh, right) {
  if (wh.global.has(right) || wh.global.has('admin')) return null;
  return [...new Set([...wh.assignments.keys(), ...wh.molOf])].filter((id) => wh.can(right, id));
}

registerInboxProvider(
  'warehouse.receipts',
  async (ctx) => {
    if (!ctx.user?.id || !tokenAllows(ctx)) return [];
    const wh = await whContext(asReq(ctx), await warehouseSettings());
    const receive = idsWith(wh, 'operate');
    const issue = idsWith(wh, 'operate');
    if ((receive && !receive.length) && (issue && !issue.length)) return [];
    const { rows } = await query(
      `SELECT d.id, d.type, d.number, d.status, d.shipped_at, d.requested_at, d.to_holder_label, d.author_id, d.shipped_by, w.name AS from_name, tw.name AS to_name,
              (SELECT COUNT(*)::int FROM wh_doc_lines l WHERE l.doc_id = d.id) AS lines
       FROM wh_docs d LEFT JOIN wh_warehouses w ON w.id = d.warehouse_id LEFT JOIN wh_warehouses tw ON tw.id = d.to_warehouse_id
       WHERE (d.type = 'transfer' AND d.status = 'shipped' AND ($1::int[] IS NULL OR d.to_warehouse_id = ANY($1::int[])))
          OR (d.type = 'issue' AND d.status = 'requested' AND ($2::int[] IS NULL OR d.warehouse_id = ANY($2::int[])))
       ORDER BY COALESCE(d.shipped_at, d.requested_at) LIMIT 100`,
      [receive, issue]
    );
    const people = await usersByIds(rows.map((row) => row.shipped_by || row.author_id));
    return rows.map((row) => ({
      key: `warehouse:${row.type}:${row.id}`,
      module: 'warehouse',
      kind: row.type === 'transfer' ? 'receipt' : 'requisition',
      id: row.id,
      title: row.type === 'transfer' ? `${row.from_name} → ${row.to_name} · ${row.lines}` : `${row.from_name} → ${row.to_holder_label || ''} · ${row.lines}`,
      number: row.number,
      author: people.get(row.shipped_by || row.author_id) || null,
      urgency: 'normal',
      url: docUrl(row.id),
      actions: ['open'],
      meta: { type: row.type, lines: row.lines, since: row.shipped_at || row.requested_at },
    }));
  },
  { module: 'warehouse' }
);

registerInboxProvider(
  'warehouse.handovers',
  async (ctx) => {
    if (!ctx.user?.id || !tokenAllows(ctx)) return [];
    const { rows } = await query(
      `SELECT d.id, d.number, d.from_holder_id, d.created_at, d.comment,
              (SELECT string_agg(i.name || COALESCE(' (' || ins.inventory_no || ')', ''), ', ') FROM wh_doc_lines l JOIN wh_items i ON i.id = l.item_id LEFT JOIN wh_instances ins ON ins.id = l.instance_id WHERE l.doc_id = d.id) AS names
       FROM wh_docs d WHERE d.type = 'handover' AND d.status = 'pending' AND d.to_holder_type = 'employee' AND d.to_holder_id = $1 ORDER BY d.id`,
      [ctx.user.id]
    );
    const people = await usersByIds(rows.map((row) => row.from_holder_id));
    return rows.map((row) => ({
      key: `warehouse:handover:${row.id}`,
      module: 'warehouse',
      kind: 'handover',
      id: row.id,
      title: String(row.names || '').slice(0, 200),
      number: row.number,
      author: people.get(row.from_holder_id) || null,
      urgency: 'normal',
      url: docUrl(row.id),
      actions: ['accept', 'open'],
      meta: { comment: row.comment || '' },
    }));
  },
  {
    module: 'warehouse',
    act: async (ctx, id, action) => {
      if (action !== 'accept') throw httpError(400, 'Unknown action', 'BAD_ACTION');
      if (!tokenAllows(ctx, 'POST')) throw httpError(403, 'The token cannot change warehouse documents', 'SCOPE_DENIED');
      const result = await confirmHandover(asReq(ctx), id);
      return { ok: true, document: { id: result.document.id, status: result.document.status } };
    },
  }
);

export default {
  id: 'warehouse',
  schema: ensureWarehouseSchema,
  routes: privateRoutes,
  register(ctx) {
    // Dashboard widgets (they read the module's own API): below minimum, transfers waiting for me, tools on me.
    for (const type of ['warehouseLow', 'warehouseIncoming', 'warehouseMyTools']) ctx.registerWidget({ type });
  },
};
