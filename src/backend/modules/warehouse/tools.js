import { query, withTransaction } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import { Params, intOrNull, isoDayOf, logEvent, text, todayFor, usersByIds, whContext } from './access.js';
import { INSTANCE_STATES, addDays, day, httpError, num, ownCode, q4 } from './logic.js';
import { holderLabels } from './stock.js';
import { createDoc, docUrl, getDoc, insertHandoverLines, webhook } from './documents.js';
import { warehouseMessage } from './messages.js';

/*
 * Tools and equipment (spec §4.2): the registry of serial instances with
 * «где сейчас» (a warehouse and bin, a person, an object), state, warranty,
 * the next service with reminders; «Мой инструмент» — what is on me; the
 * hand-over to a colleague, confirmed by the recipient.
 */

/** Instances with where they are now (from the register: the row holding the piece). */
export async function toolsByIds(ctx, ids) {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT ins.*, i.name AS item_name, i.sku, i.base_unit,
            s.warehouse_id, s.bin_id, s.holder_type, s.holder_id, s.last_move_at, s.amount AS book_amount, w.name AS warehouse_name, bn.path AS bin_path
     FROM wh_instances ins JOIN wh_items i ON i.id = ins.item_id
     LEFT JOIN LATERAL (SELECT * FROM wh_stock st WHERE st.instance_id = ins.id AND st.qty > 0 ORDER BY st.qty DESC LIMIT 1) s ON TRUE
     LEFT JOIN wh_warehouses w ON w.id = s.warehouse_id LEFT JOIN wh_bins bn ON bn.id = s.bin_id
     WHERE ins.id = ANY($1::int[]) ORDER BY ins.inventory_no`,
    [ids]
  );
  const labels = await holderLabels(rows.filter((row) => row.holder_type && row.holder_type !== 'warehouse'));
  const today = new Date().toISOString().slice(0, 10);
  const soon = addDays(today, ctx.settings.serviceWarnDays ?? 7);
  return rows.map((row) => {
    const next = isoDayOf(row.next_service_on);
    const where = !row.holder_type
      ? null
      : row.holder_type === 'warehouse'
        ? { type: 'warehouse', id: row.warehouse_id, label: row.warehouse_name, bin: row.bin_id ? { id: row.bin_id, path: row.bin_path } : null }
        : { type: row.holder_type, id: row.holder_id, label: labels.get(`${row.holder_type}:${row.holder_id}`) || `#${row.holder_id}`, warehouse: { id: row.warehouse_id, name: row.warehouse_name } };
    return {
      id: row.id,
      inventoryNo: row.inventory_no,
      serialNo: row.serial_no || '',
      state: row.state,
      item: { id: row.item_id, name: row.item_name, sku: row.sku || '' },
      purchasedOn: isoDayOf(row.purchased_on),
      cost: ctx.can('cost', row.warehouse_id) && row.cost !== null ? Number(row.cost) : null,
      warrantyUntil: isoDayOf(row.warranty_until),
      nextServiceOn: next,
      serviceIntervalDays: row.service_interval_days,
      serviceState: !next ? 'none' : next < today ? 'overdue' : next <= soon ? 'soon' : 'ok',
      note: row.note || '',
      where,
      since: row.last_move_at,
      labelCode: ownCode('instance', row.id),
    };
  });
}

/** GET /tools: chips mine | repair | service_soon | issued | in_stock, q, warehouse, holder. */
export async function listTools(req, input = {}) {
  const ctx = await whContext(req);
  const today = await todayFor(req);
  const p = new Params();
  const where = [`ins.state <> 'written_off' OR $1::boolean`];
  p.add(input.all === '1');
  const visible = ctx.visibleIds();
  // Added only when a clause uses it: an unused bind parameter makes Postgres refuse the query.
  let meRef = null;
  const me = () => (meRef ??= p.add(ctx.userId || 0));
  if (visible !== null) where.push(`(s.warehouse_id = ANY(${p.add(visible)}::int[]) OR (s.holder_type = 'employee' AND s.holder_id = ${me()}))`);
  if (input.q) {
    const q = p.add(`%${String(input.q).trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(ins.inventory_no ILIKE ${q} OR ins.serial_no ILIKE ${q} OR i.name ILIKE ${q})`);
  }
  const item = intOrNull(input.item);
  if (item) where.push(`ins.item_id = ${p.add(item)}`);
  const wh = intOrNull(input.warehouse);
  if (wh) where.push(`s.warehouse_id = ${p.add(wh)}`);
  if (['employee', 'object', 'project'].includes(input.holderType) && intOrNull(input.holderId)) where.push(`s.holder_type = ${p.add(input.holderType)} AND s.holder_id = ${p.add(intOrNull(input.holderId))}`);
  switch (input.chip) {
    case 'mine':
      where.push(`s.holder_type = 'employee' AND s.holder_id = ${me()}`);
      break;
    case 'repair':
      where.push(`ins.state = 'repair'`);
      break;
    case 'service_soon':
      where.push(`ins.next_service_on IS NOT NULL AND ins.next_service_on <= ${p.add(addDays(today, ctx.settings.serviceWarnDays ?? 7))}::date`);
      break;
    case 'issued':
      where.push(`s.holder_type IN ('employee', 'object', 'project')`);
      break;
    case 'in_stock':
      where.push(`s.holder_type = 'warehouse'`);
      break;
    default:
  }
  const { rows } = await query(
    `SELECT ins.id FROM wh_instances ins JOIN wh_items i ON i.id = ins.item_id
     LEFT JOIN LATERAL (SELECT * FROM wh_stock st WHERE st.instance_id = ins.id AND st.qty > 0 ORDER BY st.qty DESC LIMIT 1) s ON TRUE
     WHERE ${where.map((w) => `(${w})`).join(' AND ')} ORDER BY i.name, ins.inventory_no LIMIT 1000`,
    p.values
  );
  const items = await toolsByIds(ctx, rows.map((row) => row.id));
  return { items, total: items.length };
}

/** GET /tools/mine: «Мой инструмент» — instances and quantities on me, hand-overs waiting. */
export async function myTools(req) {
  const ctx = await whContext(req);
  const me = ctx.userId;
  const { rows: inst } = await query(`SELECT DISTINCT instance_id FROM wh_stock WHERE holder_type = 'employee' AND holder_id = $1 AND qty > 0 AND instance_id IS NOT NULL`, [me]);
  const tools = await toolsByIds(ctx, inst.map((row) => row.instance_id));
  const { rows: qty } = await query(
    `SELECT s.item_id, i.name, i.sku, i.base_unit, SUM(s.qty) AS qty, MAX(s.last_move_at) AS since
     FROM wh_stock s JOIN wh_items i ON i.id = s.item_id WHERE s.holder_type = 'employee' AND s.holder_id = $1 AND s.instance_id IS NULL AND s.qty <> 0
     GROUP BY s.item_id, i.name, i.sku, i.base_unit ORDER BY LOWER(i.name)`,
    [me]
  );
  const { rows: pending } = await query(
    `SELECT d.id, d.number, d.from_holder_id, d.to_holder_id, d.created_at, d.comment FROM wh_docs d
     WHERE d.type = 'handover' AND d.status = 'pending' AND ((d.to_holder_type = 'employee' AND d.to_holder_id = $1) OR (d.from_holder_type = 'employee' AND d.from_holder_id = $1)) ORDER BY d.id DESC`,
    [me]
  );
  const people = await usersByIds(pending.flatMap((d) => [d.from_holder_id, d.to_holder_id]));
  const { rows: due } = await query(
    `SELECT id, number, return_by FROM wh_docs WHERE type = 'issue' AND status = 'posted' AND to_holder_type = 'employee' AND to_holder_id = $1 AND return_by IS NOT NULL ORDER BY return_by`,
    [me]
  );
  return {
    tools,
    items: qty.map((row) => ({ item: { id: row.item_id, name: row.name, sku: row.sku || '', baseUnit: row.base_unit }, qty: q4(row.qty), since: row.since })),
    incoming: pending.filter((d) => d.to_holder_id === me).map((d) => ({ id: d.id, number: d.number, from: people.get(d.from_holder_id) || null, at: d.created_at, comment: d.comment || '', url: docUrl(d.id) })),
    outgoing: pending.filter((d) => d.from_holder_id === me).map((d) => ({ id: d.id, number: d.number, to: people.get(d.to_holder_id) || null, at: d.created_at, url: docUrl(d.id) })),
    returnBy: due.map((d) => ({ id: d.id, number: d.number, returnBy: isoDayOf(d.return_by) })),
  };
}

/** GET /tools/:id: the instance with its whole history of movements. */
export async function getTool(req, id) {
  const ctx = await whContext(req);
  const [tool] = await toolsByIds(ctx, [intOrNull(id) || 0]);
  if (!tool) throw httpError(404, 'Instance not found', 'NOT_FOUND');
  const mine = tool.where?.type === 'employee' && tool.where.id === ctx.userId;
  const visibleWh = tool.where?.type === 'warehouse' ? tool.where.id : tool.where?.warehouse?.id;
  if (!mine && !(visibleWh && ctx.sees(visibleWh)) && ctx.visibleIds() !== null) throw httpError(404, 'Instance not found', 'NOT_FOUND');
  const { rows } = await query(
    `SELECT m.*, d.number, d.type, d.status, w.name AS warehouse_name FROM wh_moves m JOIN wh_docs d ON d.id = m.doc_id JOIN wh_warehouses w ON w.id = m.warehouse_id
     WHERE m.instance_id = $1 AND m.qty > 0 ORDER BY m.moved_at DESC, m.id DESC LIMIT 200`,
    [tool.id]
  );
  const labels = await holderLabels(rows.filter((row) => row.holder_type !== 'warehouse'));
  const { rows: files } = await query(`SELECT id, kind, name FROM wh_files WHERE owner_type = 'instance' AND owner_id = $1 ORDER BY id`, [tool.id]);
  return {
    tool,
    history: rows.map((row) => ({ id: row.id, docId: row.doc_id, number: row.number, type: row.type, at: row.moved_at, to: row.holder_type === 'warehouse' ? { type: 'warehouse', id: row.warehouse_id, label: row.warehouse_name } : { type: row.holder_type, id: row.holder_id, label: labels.get(`${row.holder_type}:${row.holder_id}`) || row.number } })),
    files: files.map((f) => ({ id: f.id, kind: f.kind, name: f.name, url: `/api/app/warehouse/files/${f.id}/file` })),
    my: { canEdit: Boolean(visibleWh && ctx.can('operate', visibleWh)), canHandover: mine },
  };
}

/** PUT /tools/:id: state (ok / repair), service dates, warranty, serial number, note. */
export async function updateTool(req, id, input = {}) {
  const ctx = await whContext(req);
  const { tool } = await getTool(req, id);
  const wid = tool.where?.type === 'warehouse' ? tool.where.id : tool.where?.warehouse?.id;
  if (!(wid && ctx.can('operate', wid)) && !ctx.isAdmin) throw httpError(403, 'Storekeepers of its warehouse change the instance', 'FORBIDDEN');
  const set = {};
  if (input.state !== undefined) {
    if (!INSTANCE_STATES.includes(input.state) || input.state === 'written_off') throw httpError(400, 'Write tools off with a write-off document', 'BAD_STATE');
    set.state = input.state;
  }
  for (const [key, column] of [['nextServiceOn', 'next_service_on'], ['warrantyUntil', 'warranty_until']]) {
    if (input[key] === undefined) continue;
    const value = input[key] ? day(input[key]) : null;
    if (input[key] && !value) throw httpError(400, 'Invalid date', 'BAD_DATE');
    set[column] = value;
  }
  if (input.serviceIntervalDays !== undefined) {
    const n = Math.round(Number(input.serviceIntervalDays));
    set.service_interval_days = Number.isFinite(n) && n > 0 && n <= 3650 ? n : null;
  }
  if (input.serialNo !== undefined) set.serial_no = text(input.serialNo, 120);
  if (input.note !== undefined) set.note = text(input.note, 1000);
  if (input.serviced) {
    // «ТО проведено»: the next date moves by the interval from today.
    const today = await todayFor(req);
    const interval = set.service_interval_days ?? tool.serviceIntervalDays;
    set.next_service_on = interval ? addDays(today, interval) : null;
  }
  const keys = Object.keys(set);
  if (keys.length) {
    await withTransaction(async (client) => {
      await client.query(`UPDATE wh_instances SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [tool.id, ...keys.map((key) => set[key])]);
      await logEvent(client, 'instance', tool.id, ctx.userId, input.serviced ? 'serviced' : 'updated', { fields: keys });
    });
  }
  return getTool(req, tool.id);
}

/**
 * POST /tools/handover { toUserId, instanceIds: [], items: [{ itemId, qty }], comment }
 * — a hand-over to a colleague: a «ПД» document waiting for the recipient's
 * confirmation; the tools stay on me until then.
 */
export async function handover(req, input = {}) {
  const ctx = await whContext(req);
  const to = intOrNull(input.toUserId);
  if (!to || to === ctx.userId) throw httpError(400, 'Choose the colleague', 'BAD_USER');
  const { rows: user } = await query(`SELECT id FROM users WHERE id = $1 AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [to]);
  if (!user.length) throw httpError(400, 'Unknown person', 'BAD_USER');
  const instanceIds = [...new Set((Array.isArray(input.instanceIds) ? input.instanceIds : []).map(intOrNull).filter(Boolean))];
  const items = (Array.isArray(input.items) ? input.items : []).map((raw) => ({ itemId: intOrNull(raw?.itemId), qty: num(raw?.qty) })).filter((l) => l.itemId && l.qty > 0);
  if (!instanceIds.length && !items.length) throw httpError(400, 'Choose what you hand over', 'NO_LINES');
  // Only what is on me now.
  const { rows: held } = await query(`SELECT instance_id, item_id FROM wh_stock WHERE holder_type = 'employee' AND holder_id = $1 AND qty > 0 AND instance_id = ANY($2::int[])`, [ctx.userId, instanceIds]);
  if (held.length !== instanceIds.length) throw httpError(409, 'Some of these tools are not on you', 'NOT_HELD');
  const { rows: busy } = await query(
    `SELECT l.instance_id FROM wh_doc_lines l JOIN wh_docs d ON d.id = l.doc_id WHERE d.type = 'handover' AND d.status = 'pending' AND l.instance_id = ANY($1::int[])`,
    [instanceIds]
  );
  if (busy.length) throw httpError(409, 'A hand-over of this tool already waits for confirmation', 'HANDOVER_PENDING');
  const lines = [...held.map((row) => ({ itemId: row.item_id, instanceId: row.instance_id, qty: 1 })), ...items];
  const doc = await withTransaction(async (client) => {
    const created = await createDoc(req, { type: 'handover', fromHolderType: 'employee', fromHolderId: ctx.userId, toHolderType: 'employee', toHolderId: to, comment: text(input.comment, 2000) }, { client });
    await insertHandoverLines(client, ctx, created, lines);
    await client.query(`UPDATE wh_docs SET status = 'pending', requested_at = NOW() WHERE id = $1`, [created.id]);
    await logEvent(client, 'doc', created.id, ctx.userId, 'handover_sent', { to });
    return created;
  });
  const names = (await query(`SELECT i.name, ins.inventory_no FROM wh_doc_lines l JOIN wh_items i ON i.id = l.item_id LEFT JOIN wh_instances ins ON ins.id = l.instance_id WHERE l.doc_id = $1`, [doc.id])).rows.map((r) => `• ${r.name}${r.inventory_no ? ` (${r.inventory_no})` : ''}`).join('\n');
  const actor = (await usersByIds([ctx.userId])).get(ctx.userId)?.name || '';
  notify({ userIds: [to], kind: 'warehouse.handover', module: 'warehouse', link: docUrl(doc.id), actorId: ctx.userId, render: warehouseMessage('handover', { doc: { number: doc.number }, actor, items: names }) }).catch(() => {});
  webhook('warehouse.tool.handover', { ...doc, status: 'pending' }, ctx.userId, { accepted: null });
  return getDoc(req, doc.id);
}
