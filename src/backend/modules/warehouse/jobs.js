import { query } from '../../config/database.js';
import { emitEvent } from '../../api/events.js';
import { notify } from '../../services/notifications.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { portalToday } from './access.js';
import { addDays, q4 } from './logic.js';
import { warehouseMessage } from './messages.js';
import { warehouseKeepers } from './warehouses.js';

/*
 * warehouse:daily (every 30 minutes, under the scheduler's advisory lock;
 * «today» is the portal's day). Each notice goes once: its key is stored in
 * wh_notices by the same INSERT … ON CONFLICT DO NOTHING that decides to send it.
 *   1. reserves past their date expire;
 *   2. «ниже минимума» — a digest per warehouse per day to the MOL and the buyers (spec §10);
 *   3. batches expiring within expiryWarnDays — once per batch and date;
 *   4. tool service / calibration due within serviceWarnDays, and overdue — once per due date;
 *   5. issued items not returned by «return by» — once per document.
 */

async function once(key) {
  const { rows } = await query(`INSERT INTO wh_notices (key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key`, [key.slice(0, 160)]);
  return rows.length > 0;
}

export async function runDaily({ today: forcedToday, settings: forcedSettings } = {}) {
  let settings = forcedSettings;
  if (!settings) {
    const module = parseSettings(await getSettings()).modules.warehouse;
    if (!module?.enabled) return { skipped: true };
    settings = module.settings;
  }
  const today = forcedToday || (await portalToday());
  const out = { expiredReserves: 0, lowStock: 0, expiring: 0, service: 0, overdue: 0 };

  // 1. Reserves past their date.
  const expired = await query(`UPDATE wh_reserves SET status = 'expired', closed_at = NOW() WHERE status = 'active' AND expires_on < $1::date RETURNING id`, [today]);
  out.expiredReserves = expired.rowCount;

  // 2. Below minimum, a digest per warehouse.
  if (settings.lowStockDigest !== false) {
    const { rows } = await query(
      `SELECT n.warehouse_id, w.name AS warehouse_name, i.id AS item_id, i.name, i.base_unit, n.min_qty,
              (SELECT COALESCE(SUM(s.qty), 0) FROM wh_stock s WHERE s.item_id = n.item_id AND s.warehouse_id = n.warehouse_id AND s.holder_type = 'warehouse') AS qty
       FROM wh_norms n JOIN wh_items i ON i.id = n.item_id AND i.archived_at IS NULL JOIN wh_warehouses w ON w.id = n.warehouse_id AND w.archived_at IS NULL
       WHERE n.min_qty > 0 ORDER BY w.id, LOWER(i.name)`
    );
    const byWarehouse = new Map();
    for (const row of rows) {
      if (Number(row.qty) >= Number(row.min_qty)) continue;
      if (!byWarehouse.has(row.warehouse_id)) byWarehouse.set(row.warehouse_id, { name: row.warehouse_name, rows: [] });
      byWarehouse.get(row.warehouse_id).rows.push({ itemId: row.item_id, name: row.name, qty: q4(row.qty), min: Number(row.min_qty), unit: row.base_unit });
    }
    for (const [warehouseId, group] of byWarehouse) {
      if (!(await once(`low:${today}:${warehouseId}`))) continue;
      const people = [...new Set([...(await warehouseKeepers(warehouseId)), ...(settings.lowStockRecipients || [])])];
      await notify({ userIds: people, kind: 'warehouse.stock_low', module: 'warehouse', link: `/app/warehouse/stock?chip=below_min&warehouse=${warehouseId}`, render: warehouseMessage('lowStock', { warehouse: group.name, rows: group.rows }) }).catch(() => {});
      out.lowStock += 1;
    }
  }

  // 3. Batches expiring soon.
  if (settings.expiryWarnDays > 0) {
    const { rows } = await query(
      `SELECT s.warehouse_id, w.name AS warehouse_name, b.id AS batch_id, b.number, b.expires_on::text AS expires_on, i.name, SUM(s.qty) AS qty
       FROM wh_stock s JOIN wh_batches b ON b.id = s.batch_id JOIN wh_items i ON i.id = s.item_id JOIN wh_warehouses w ON w.id = s.warehouse_id
       WHERE s.holder_type = 'warehouse' AND s.qty > 0 AND b.expires_on IS NOT NULL AND b.expires_on <= $1::date
       GROUP BY s.warehouse_id, w.name, b.id, b.number, b.expires_on, i.name`,
      [addDays(today, settings.expiryWarnDays)]
    );
    const byWarehouse = new Map();
    for (const row of rows) {
      if (!(await once(`exp:${row.batch_id}:${row.warehouse_id}:${row.expires_on}`))) continue;
      if (!byWarehouse.has(row.warehouse_id)) byWarehouse.set(row.warehouse_id, { name: row.warehouse_name, rows: [] });
      byWarehouse.get(row.warehouse_id).rows.push({ name: row.name, batch: row.number, expiresOn: row.expires_on });
    }
    for (const [warehouseId, group] of byWarehouse) {
      await notify({ userIds: await warehouseKeepers(warehouseId), kind: 'warehouse.expiring', module: 'warehouse', link: `/app/warehouse/stock?chip=expiring&warehouse=${warehouseId}`, render: warehouseMessage('expiring', { warehouse: group.name, rows: group.rows }) }).catch(() => {});
      out.expiring += group.rows.length;
    }
  }

  // 4. Tool service and calibration.
  const { rows: tools } = await query(
    `SELECT ins.id, ins.inventory_no, ins.next_service_on::text AS due, i.name, s.holder_type, s.holder_id, s.warehouse_id
     FROM wh_instances ins JOIN wh_items i ON i.id = ins.item_id
     LEFT JOIN LATERAL (SELECT * FROM wh_stock st WHERE st.instance_id = ins.id AND st.qty > 0 LIMIT 1) s ON TRUE
     WHERE ins.state <> 'written_off' AND ins.next_service_on IS NOT NULL AND ins.next_service_on <= $1::date`,
    [addDays(today, settings.serviceWarnDays ?? 7)]
  );
  for (const tool of tools) {
    const overdue = tool.due < today;
    if (!(await once(`svc:${tool.id}:${tool.due}:${overdue ? 'over' : 'soon'}`))) continue;
    const people = [...new Set([...(tool.holder_type === 'employee' ? [tool.holder_id] : []), ...(tool.warehouse_id ? await warehouseKeepers(tool.warehouse_id) : [])])];
    await notify({ userIds: people, kind: 'warehouse.service', module: 'warehouse', link: `/app/warehouse/tools/${tool.id}`, render: warehouseMessage('service', { tool: `${tool.name} (${tool.inventory_no})`, due: tool.due, overdue }) }).catch(() => {});
    emitEvent('warehouse.tool.service_due', { data: { tool: { id: tool.id, inventoryNo: tool.inventory_no, name: tool.name, nextServiceOn: tool.due, overdue } } }).catch(() => {});
    out.service += 1;
  }

  // 5. Not returned by the date of the issue.
  const { rows: late } = await query(
    `UPDATE wh_docs d SET overdue_notified_at = NOW()
     WHERE d.type = 'issue' AND d.status = 'posted' AND d.return_by < $1::date AND d.overdue_notified_at IS NULL
       AND EXISTS (SELECT 1 FROM wh_moves m JOIN wh_stock s ON s.item_id = m.item_id AND s.holder_type = m.holder_type AND s.holder_id = m.holder_id
                   AND COALESCE(s.instance_id, 0) = COALESCE(m.instance_id, 0) AND s.qty > 0
                   WHERE m.doc_id = d.id AND m.qty > 0 AND m.holder_type <> 'warehouse')
     RETURNING d.id, d.number, d.return_by::text AS return_by, d.to_holder_type, d.to_holder_id, d.warehouse_id`,
    [today]
  );
  for (const doc of late) {
    const { rows: names } = await query(`SELECT i.name, ins.inventory_no FROM wh_doc_lines l JOIN wh_items i ON i.id = l.item_id LEFT JOIN wh_instances ins ON ins.id = l.instance_id WHERE l.doc_id = $1 LIMIT 10`, [doc.id]);
    const people = [...new Set([...(doc.to_holder_type === 'employee' ? [doc.to_holder_id] : []), ...(await warehouseKeepers(doc.warehouse_id))])];
    await notify({ userIds: people, kind: 'warehouse.tool_overdue', module: 'warehouse', link: `/app/warehouse/documents/${doc.id}`, render: warehouseMessage('toolOverdue', { doc: { number: doc.number }, due: doc.return_by, items: names.map((n) => `• ${n.name}${n.inventory_no ? ` (${n.inventory_no})` : ''}`).join('\n') }) }).catch(() => {});
    out.overdue += 1;
  }
  return out;
}
