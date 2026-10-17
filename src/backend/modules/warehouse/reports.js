import { query } from '../../config/database.js';
import { wallToInstant } from '../../services/datetime.js';
import { requestRegional } from '../../services/regional.js';
import { decimalSeparator, exportLocale, tr } from '../../services/i18n/index.js';
import { Params, intOrNull, todayFor, whContext } from './access.js';
import { addDays, cents, day, httpError, q4, toCsv } from './logic.js';
import { holderLabels, listStock } from './stock.js';
import { listTools } from './tools.js';

/*
 * Reports (spec §8.7), built from the movement journal:
 *   stock          the stock table (as on the main screen)
 *   turnover       opening / in / out / closing per item × warehouse, qty and sum
 *   movement       one item's movements with documents and a running balance
 *   by-object      materials issued to an object or project, returned, written off, on it now
 *   tools          instances grouped by holder
 * CSV for Excel: BOM, `;`, formulas neutralised; sums only for warehouse.cost.
 */

/** A CSV header in the export's language (locales/<lang>/warehouse.js → csv). */
const L = (lang, key) => tr(lang, `warehouse.csv.${key}`);
const toolState = (lang, state) => {
  const text = tr(lang, `warehouse.toolState.${state}`);
  return text === `warehouse.toolState.${state}` ? state || '' : text;
};

/** [from, to] days → instants in the person's zone (to is inclusive). */
async function period(req, input) {
  const today = await todayFor(req);
  const to = day(input.to) || today;
  const from = day(input.from) || `${to.slice(0, 8)}01`;
  if (from > to) throw httpError(400, 'The period starts after it ends', 'BAD_PERIOD');
  const zone = (await requestRegional(req)).timeZone;
  const at = (d) => {
    const [year, month, dd] = d.split('-').map(Number);
    return wallToInstant({ year, month, day: dd }, zone);
  };
  return { from, to, start: at(from), end: at(addDays(to, 1)) };
}

function warehouseIds(ctx, value) {
  const visible = ctx.visibleIds();
  const asked = String(value || '').split(',').map(intOrNull).filter(Boolean);
  if (!asked.length) return visible;
  return visible === null ? asked : asked.filter((id) => visible.includes(id));
}

async function subtreeIds(categoryId) {
  const { rows } = await query(`WITH RECURSIVE t AS (SELECT id FROM wh_categories WHERE id = $1 UNION ALL SELECT c.id FROM wh_categories c JOIN t ON c.parent_id = t.id) SELECT id FROM t`, [categoryId]);
  return rows.map((row) => row.id);
}

/** Оборотная ведомость. */
export async function turnover(req, input = {}) {
  const ctx = await whContext(req);
  const { from, to, start, end } = await period(req, input);
  const p = new Params();
  const s = p.add(start);
  const e = p.add(end);
  const where = [`m.holder_type = 'warehouse'`, `m.moved_at < ${e}`];
  const ids = warehouseIds(ctx, input.warehouse);
  if (ids !== null) where.push(`m.warehouse_id = ANY(${p.add(ids)}::int[])`);
  const category = intOrNull(input.category);
  if (category) where.push(`i.category_id = ANY(${p.add(await subtreeIds(category))}::int[])`);
  const item = intOrNull(input.item);
  if (item) where.push(`m.item_id = ${p.add(item)}`);
  const { rows } = await query(
    `SELECT m.item_id, m.warehouse_id, i.name, i.sku, i.base_unit, w.name AS warehouse_name,
            COALESCE(SUM(m.qty) FILTER (WHERE m.moved_at < ${s}), 0) AS open_q, COALESCE(SUM(m.amount) FILTER (WHERE m.moved_at < ${s}), 0) AS open_a,
            COALESCE(SUM(m.qty) FILTER (WHERE m.moved_at >= ${s} AND m.qty > 0), 0) AS in_q, COALESCE(SUM(m.amount) FILTER (WHERE m.moved_at >= ${s} AND m.qty > 0), 0) AS in_a,
            COALESCE(-SUM(m.qty) FILTER (WHERE m.moved_at >= ${s} AND m.qty < 0), 0) AS out_q, COALESCE(-SUM(m.amount) FILTER (WHERE m.moved_at >= ${s} AND m.qty < 0), 0) AS out_a,
            COALESCE(SUM(m.amount) FILTER (WHERE m.moved_at >= ${s} AND m.qty = 0), 0) AS adj_a
     FROM wh_moves m JOIN wh_items i ON i.id = m.item_id JOIN wh_warehouses w ON w.id = m.warehouse_id
     WHERE ${where.join(' AND ')}
     GROUP BY m.item_id, m.warehouse_id, i.name, i.sku, i.base_unit, w.name, w.sort
     ORDER BY w.sort, LOWER(w.name), LOWER(i.name)`,
    p.values
  );
  const out = rows
    .map((row) => {
      const cost = ctx.can('cost', row.warehouse_id);
      const openQ = q4(row.open_q);
      const closeQ = q4(Number(row.open_q) + Number(row.in_q) - Number(row.out_q));
      return {
        item: { id: row.item_id, name: row.name, sku: row.sku || '', baseUnit: row.base_unit },
        warehouse: { id: row.warehouse_id, name: row.warehouse_name },
        openingQty: openQ,
        inQty: q4(row.in_q),
        outQty: q4(row.out_q),
        closingQty: closeQ,
        openingSum: cost ? cents(row.open_a) : null,
        sumIn: cost ? cents(Number(row.in_a) + Math.max(0, Number(row.adj_a))) : null,
        sumOut: cost ? cents(Number(row.out_a) + Math.max(0, -Number(row.adj_a))) : null,
        closingSum: cost ? cents(Number(row.open_a) + Number(row.in_a) - Number(row.out_a) + Number(row.adj_a)) : null,
      };
    })
    .filter((row) => row.openingQty || row.inQty || row.outQty || row.closingQty);
  const showSums = out.every((row) => row.openingSum !== null);
  const totals = showSums
    ? ['openingSum', 'sumIn', 'sumOut', 'closingSum'].reduce((acc, key) => ({ ...acc, [key]: cents(out.reduce((sum, row) => sum + row[key], 0)) }), {})
    : null;
  return { from, to, rows: out, totals, currency: showSums ? ctx.settings.currency : null };
}

/** Движение по позиции: documents with a running balance (warehouse holdings). */
export async function itemMovement(req, input = {}) {
  const ctx = await whContext(req);
  const item = intOrNull(input.item);
  if (!item) throw httpError(400, 'Choose the item', 'ITEM_REQUIRED');
  const { from, to, start, end } = await period(req, input);
  const p = new Params();
  const where = [`m.item_id = ${p.add(item)}`, `m.holder_type = 'warehouse'`];
  const ids = warehouseIds(ctx, input.warehouse);
  if (ids !== null) where.push(`m.warehouse_id = ANY(${p.add(ids)}::int[])`);
  const opening = (await query(`SELECT COALESCE(SUM(m.qty), 0) AS q, COALESCE(SUM(m.amount), 0) AS a FROM wh_moves m WHERE ${where.join(' AND ')} AND m.moved_at < ${p.add(start)}`, p.values)).rows[0];
  const p2 = new Params();
  const where2 = [`m.item_id = ${p2.add(item)}`, `m.holder_type = 'warehouse'`, `m.moved_at >= ${p2.add(start)}`, `m.moved_at < ${p2.add(end)}`];
  if (ids !== null) where2.push(`m.warehouse_id = ANY(${p2.add(ids)}::int[])`);
  const { rows } = await query(
    `SELECT m.doc_id, d.number, d.type, d.status, m.moved_at, m.warehouse_id, w.name AS warehouse_name, d.to_holder_label, d.from_holder_label, d.supplier_name,
            SUM(m.qty) AS qty, SUM(m.amount) AS amount
     FROM wh_moves m JOIN wh_docs d ON d.id = m.doc_id JOIN wh_warehouses w ON w.id = m.warehouse_id
     WHERE ${where2.join(' AND ')}
     GROUP BY m.doc_id, d.number, d.type, d.status, m.moved_at, m.warehouse_id, w.name, d.to_holder_label, d.from_holder_label, d.supplier_name
     HAVING SUM(m.qty) <> 0 OR SUM(m.amount) <> 0
     ORDER BY m.moved_at, m.doc_id`,
    p2.values
  );
  const { rows: info } = await query(`SELECT id, name, sku, base_unit FROM wh_items WHERE id = $1`, [item]);
  const cost = ids === null ? ctx.global.has('cost') : ids.every((id) => ctx.can('cost', id));
  let balance = Number(opening.q);
  let value = Number(opening.a);
  return {
    from,
    to,
    item: info[0] ? { id: info[0].id, name: info[0].name, sku: info[0].sku || '', baseUnit: info[0].base_unit } : null,
    openingQty: q4(opening.q),
    openingSum: cost ? cents(opening.a) : null,
    rows: rows.map((row) => {
      balance += Number(row.qty);
      value += Number(row.amount);
      return {
        document: { id: row.doc_id, number: row.number, type: row.type, status: row.status },
        date: row.moved_at,
        warehouse: { id: row.warehouse_id, name: row.warehouse_name },
        counterpart: row.to_holder_label || row.from_holder_label || row.supplier_name || '',
        qty: q4(row.qty),
        amount: cost ? cents(row.amount) : null,
        balance: q4(balance),
        balanceSum: cost ? cents(value) : null,
      };
    }),
    closingQty: q4(balance),
    closingSum: cost ? cents(value) : null,
  };
}

/** Материалы по объекту / проекту: issued, returned, written off, on it now (spec §7 Masterplan). */
export async function byObject(req, input = {}) {
  const ctx = await whContext(req);
  const type = input.holderType === 'project' ? 'project' : input.holderType === 'employee' ? 'employee' : 'object';
  const id = intOrNull(input.holderId);
  if (!id) throw httpError(400, 'Choose the object', 'HOLDER_REQUIRED');
  if (type === 'employee' && id !== ctx.userId && !ctx.canAny('operate')) throw httpError(403, 'Not your holdings', 'FORBIDDEN');
  const { from, to, start, end } = await period(req, { from: input.from || '2000-01-01', to: input.to });
  // A project includes its objects.
  const holders = [{ type, id }];
  if (type === 'project') {
    const { rows } = await query(`SELECT id FROM mp_nodes WHERE project_id = $1`, [id]).catch(() => ({ rows: [] }));
    for (const row of rows) holders.push({ type: 'object', id: row.id });
  }
  const p = new Params();
  const holderSql = holders.map((h) => `(m.holder_type = ${p.add(h.type)} AND m.holder_id = ${p.add(h.id)})`).join(' OR ');
  const s = p.add(start);
  const e = p.add(end);
  const visible = ctx.visibleIds();
  // My own holdings in full; anyone else's only from the warehouses I see.
  const whSql = visible === null || (type === 'employee' && id === ctx.userId) ? '' : ` AND m.warehouse_id = ANY(${p.add(visible)}::int[])`;
  const { rows } = await query(
    `SELECT m.item_id, i.name, i.sku, i.base_unit, array_agg(DISTINCT m.warehouse_id) AS warehouses,
            COALESCE(SUM(m.qty) FILTER (WHERE m.qty > 0 AND m.moved_at >= ${s} AND m.moved_at < ${e}), 0) AS issued_q,
            COALESCE(SUM(m.amount) FILTER (WHERE m.qty > 0 AND m.moved_at >= ${s} AND m.moved_at < ${e}), 0) AS issued_a,
            COALESCE(-SUM(m.qty) FILTER (WHERE m.qty < 0 AND d.type IN ('return', 'handover', 'storno') AND m.moved_at >= ${s} AND m.moved_at < ${e}), 0) AS returned_q,
            COALESCE(-SUM(m.amount) FILTER (WHERE m.qty < 0 AND d.type IN ('return', 'handover', 'storno') AND m.moved_at >= ${s} AND m.moved_at < ${e}), 0) AS returned_a,
            COALESCE(-SUM(m.qty) FILTER (WHERE m.qty < 0 AND d.type = 'writeoff' AND m.moved_at >= ${s} AND m.moved_at < ${e}), 0) AS written_q,
            COALESCE(-SUM(m.amount) FILTER (WHERE m.qty < 0 AND d.type = 'writeoff' AND m.moved_at >= ${s} AND m.moved_at < ${e}), 0) AS written_a,
            COALESCE(SUM(m.qty), 0) AS now_q, COALESCE(SUM(m.amount), 0) AS now_a
     FROM wh_moves m JOIN wh_docs d ON d.id = m.doc_id JOIN wh_items i ON i.id = m.item_id
     WHERE (${holderSql})${whSql}
     GROUP BY m.item_id, i.name, i.sku, i.base_unit ORDER BY LOWER(i.name)`,
    p.values
  );
  const labels = await holderLabels([{ holder_type: type, holder_id: id }]);
  const out = rows.map((row) => {
    const cost = row.warehouses.every((w) => ctx.can('cost', w));
    return {
      item: { id: row.item_id, name: row.name, sku: row.sku || '', baseUnit: row.base_unit },
      issuedQty: q4(row.issued_q),
      returnedQty: q4(row.returned_q),
      writtenOffQty: q4(row.written_q),
      onHandQty: q4(row.now_q),
      issuedSum: cost ? cents(row.issued_a) : null,
      returnedSum: cost ? cents(row.returned_a) : null,
      writtenOffSum: cost ? cents(row.written_a) : null,
      amount: cost ? cents(row.now_a) : null,
    };
  });
  const showSums = out.every((row) => row.issuedSum !== null);
  return {
    from,
    to,
    holder: { type, id, label: labels.get(`${type}:${id}`) || `#${id}` },
    rows: out,
    totals: showSums ? { issuedSum: cents(out.reduce((a, r) => a + r.issuedSum, 0)), writtenOffSum: cents(out.reduce((a, r) => a + r.writtenOffSum, 0)), amount: cents(out.reduce((a, r) => a + r.amount, 0)) } : null,
    currency: showSums ? ctx.settings.currency : null,
  };
}

/** Инструмент по держателям. */
export async function toolsByHolder(req, input = {}) {
  const { items } = await listTools(req, { ...input, chip: input.chip || undefined });
  const groups = new Map();
  for (const tool of items) {
    const key = tool.where ? `${tool.where.type}:${tool.where.id}` : 'none';
    if (!groups.has(key)) groups.set(key, { holder: tool.where ? { type: tool.where.type, id: tool.where.id, label: tool.where.label } : null, tools: [] });
    groups.get(key).tools.push(tool);
  }
  return { groups: [...groups.values()].sort((a, b) => (a.holder?.type || 'z').localeCompare(b.holder?.type || 'z') || String(a.holder?.label).localeCompare(String(b.holder?.label))) };
}

// ── CSV ─────────────────────────────────────────────────────────────────────



export async function reportCsv(req, kind, input = {}) {
  const lang = exportLocale(input.lang, req.locale);
  // Numbers with the language's decimal separator, as spreadsheets in that language expect.
  const separator = decimalSeparator(lang);
  const n = (value) => (value === null || value === undefined ? '' : String(value).replace('.', separator));
  const stamp = new Date().toISOString().slice(0, 10);
  switch (kind) {
    case 'stock': {
      const data = await listStock(req, { ...input, pageSize: 500, page: 1 });
      const all = [...data.items];
      for (let page = 2; all.length < data.total && page <= 40; page += 1) all.push(...(await listStock(req, { ...input, pageSize: 500, page })).items);
      const cost = all.some((row) => row.amount !== null);
      const header = [L(lang, 'item'), L(lang, 'sku'), L(lang, 'warehouse'), L(lang, 'onHand'), L(lang, 'reserved'), L(lang, 'available'), L(lang, 'unit'), L(lang, 'min'), ...(cost ? [L(lang, 'value')] : []), L(lang, 'lastMovement')];
      const rows = all.map((row) => [row.item.name, row.item.sku, row.warehouse?.name || row.holder?.label || '', n(row.qty), n(row.reserved), n(row.available), row.item.baseUnit, n(row.minQty), ...(cost ? [n(row.amount)] : []), row.lastMoveAt ? new Date(row.lastMoveAt).toISOString().slice(0, 10) : '']);
      return { csv: toCsv(header, rows), filename: `stock-${stamp}.csv` };
    }
    case 'turnover': {
      const data = await turnover(req, input);
      const cost = Boolean(data.totals);
      const header = [L(lang, 'warehouse'), L(lang, 'item'), L(lang, 'sku'), L(lang, 'unit'), L(lang, 'opening'), ...(cost ? [L(lang, 'openingValue')] : []), L(lang, 'in'), ...(cost ? [L(lang, 'inValue')] : []), L(lang, 'out'), ...(cost ? [L(lang, 'outValue')] : []), L(lang, 'closing'), ...(cost ? [L(lang, 'closingValue')] : [])];
      const rows = data.rows.map((row) => [row.warehouse.name, row.item.name, row.item.sku, row.item.baseUnit, n(row.openingQty), ...(cost ? [n(row.openingSum)] : []), n(row.inQty), ...(cost ? [n(row.sumIn)] : []), n(row.outQty), ...(cost ? [n(row.sumOut)] : []), n(row.closingQty), ...(cost ? [n(row.closingSum)] : [])]);
      return { csv: toCsv(header, rows), filename: `turnover-${data.from}-${data.to}.csv` };
    }
    case 'movement': {
      const data = await itemMovement(req, input);
      const cost = data.openingSum !== null;
      const header = [L(lang, 'date'), L(lang, 'document'), L(lang, 'warehouse'), L(lang, 'counterpart'), L(lang, 'quantity'), ...(cost ? [L(lang, 'value')] : []), L(lang, 'balance')];
      const rows = [[data.from, L(lang, 'openingBalance'), '', '', '', ...(cost ? [n(data.openingSum)] : []), n(data.openingQty)], ...data.rows.map((row) => [new Date(row.date).toISOString().slice(0, 10), row.document.number, row.warehouse.name, row.counterpart, n(row.qty), ...(cost ? [n(row.amount)] : []), n(row.balance)])];
      return { csv: toCsv(header, rows), filename: `movement-${data.item?.sku || data.item?.id}-${data.from}-${data.to}.csv` };
    }
    case 'by-object': {
      const data = await byObject(req, input);
      const cost = Boolean(data.totals);
      const header = [L(lang, 'item'), L(lang, 'sku'), L(lang, 'unit'), L(lang, 'issued'), ...(cost ? [L(lang, 'issuedValue')] : []), L(lang, 'returned'), L(lang, 'writtenOff'), ...(cost ? [L(lang, 'writtenOffValue')] : []), L(lang, 'onHandTools'), ...(cost ? [L(lang, 'value')] : [])];
      const rows = data.rows.map((row) => [row.item.name, row.item.sku, row.item.baseUnit, n(row.issuedQty), ...(cost ? [n(row.issuedSum)] : []), n(row.returnedQty), n(row.writtenOffQty), ...(cost ? [n(row.writtenOffSum)] : []), n(row.onHandQty), ...(cost ? [n(row.amount)] : [])]);
      return { csv: toCsv(header, rows), filename: `materials-${data.holder.type}-${data.holder.id}.csv` };
    }
    case 'tools': {
      const data = await toolsByHolder(req, input);
      const header = [L(lang, 'holder'), L(lang, 'inventoryNo'), L(lang, 'serialNo'), L(lang, 'item'), L(lang, 'state'), L(lang, 'serviceBy'), L(lang, 'since')];
      const rows = data.groups.flatMap((group) => group.tools.map((tool) => [group.holder?.label || '—', tool.inventoryNo, tool.serialNo, tool.item.name, toolState(lang, tool.state), tool.nextServiceOn || '', tool.since ? new Date(tool.since).toISOString().slice(0, 10) : '']));
      return { csv: toCsv(header, rows), filename: `tools-${stamp}.csv` };
    }
    default:
      throw httpError(404, 'Unknown report', 'NOT_FOUND');
  }
}
