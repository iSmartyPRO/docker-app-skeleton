import { query } from '../../config/database.js';
import { regionalFor } from '../../services/settings.js';
import { isoDay } from '../../services/datetime.js';
import { forbidden, requireProject } from './access.js';
import { has, readCaps, scheduleState } from './rules.js';
import { dayString, money } from './util.js';

/*
 * Dashboard (spec §9.8, simple MVP): sales by status (pieces, m², sums in
 * the base currency), sold per month, by managers, readiness of the top
 * levels, delays, objects without fresh reports, "sold but not built".
 */

/** An amount in the base currency (settings.rates: units of a currency per 1 base). */
export function toBase(amount, currency, settings) {
  if (!amount) return 0;
  if (!currency || currency === settings.currency) return Number(amount);
  const rate = Number(settings.rates?.[currency]);
  return rate > 0 ? Number(amount) / rate : 0;
}

export async function dashboard(ctx, projectId) {
  const project = await requireProject(ctx, projectId);
  const caps = readCaps(ctx, project.id);
  if (!has(caps, 'dashboard')) throw forbidden();
  const settings = ctx.settings;
  const out = { currency: settings.currency, sales: null, months: [], managers: [], construction: null, risks: [] };

  const { rows: units } = await query(
    `SELECT u.status, u.price, u.currency, u.contract_amount, u.paid_amount, COALESCE(u.area_total, u.area_plot) AS area, u.manager_id,
            COALESCE(m.display_name, m.username) AS manager_name, n.id, n.code, n.name, n.readiness, n.path
     FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id LEFT JOIN users m ON m.id = u.manager_id WHERE u.project_id = $1`,
    [project.id]
  );
  if (has(caps, 'status.view')) {
    const byStatus = {};
    for (const row of units) {
      const s = (byStatus[row.status] ||= { count: 0, area: 0, sum: 0 });
      s.count += 1;
      s.area += Number(row.area) || 0;
      if (has(caps, 'price.view')) s.sum += toBase(row.status === 'contract' || row.status === 'sold' || row.status === 'handed' ? row.contract_amount ?? row.price : row.price, (row.currency || '').trim(), settings);
    }
    for (const s of Object.values(byStatus)) {
      s.area = Math.round(s.area * 100) / 100;
      s.sum = has(caps, 'price.view') ? money(s.sum) : null;
    }
    const soldRows = units.filter((row) => ['contract', 'sold', 'handed'].includes(row.status));
    const soldArea = soldRows.reduce((sum, row) => sum + (Number(row.area) || 0), 0);
    const soldSum = soldRows.reduce((sum, row) => sum + toBase(row.contract_amount ?? row.price, (row.currency || '').trim(), settings), 0);
    out.sales = {
      total: units.length,
      byStatus,
      avgPricePerM2Sold: has(caps, 'price.view') && soldArea ? money(soldSum / soldArea) : null,
      paid: has(caps, 'amounts.all') ? money(units.reduce((sum, row) => sum + toBase(row.paid_amount, (row.currency || '').trim(), settings), 0)) : null,
    };
    // Contracts and sales per month (last 12), from the history; months of the portal's time zone.
    const zone = (await regionalFor(null)).timeZone || 'UTC';
    const { rows: months } = await query(
      `SELECT to_char(date_trunc('month', e.created_at AT TIME ZONE $2), 'YYYY-MM') AS month, e.data->>'to' AS status, COUNT(*)::int AS n
       FROM mp_events e WHERE e.project_id = $1 AND e.kind = 'status' AND e.data->>'to' IN ('booking', 'contract', 'sold') AND e.created_at > NOW() - INTERVAL '12 months'
       GROUP BY 1, 2 ORDER BY 1`,
      [project.id, zone]
    );
    const map = new Map();
    for (const row of months) {
      const m = map.get(row.month) || { month: row.month, booking: 0, contract: 0, sold: 0 };
      m[row.status] = row.n;
      map.set(row.month, m);
    }
    out.months = [...map.values()];
    if (has(caps, 'booking.view')) {
      const managers = new Map();
      for (const row of units) {
        if (!row.manager_id || ['free', 'not_for_sale'].includes(row.status)) continue;
        const m = managers.get(row.manager_id) || { id: row.manager_id, name: row.manager_name, reserve: 0, booking: 0, deal: 0 };
        if (row.status === 'reserve') m.reserve += 1;
        else if (row.status === 'booking') m.booking += 1;
        else m.deal += 1;
        managers.set(row.manager_id, m);
      }
      out.managers = [...managers.values()].sort((a, b) => b.deal + b.booking - (a.deal + a.booking));
    }
    // Conversion booking → contract over the history.
    const { rows: conv } = await query(
      `SELECT COUNT(DISTINCT node_id) FILTER (WHERE data->>'to' = 'booking')::int AS booked, COUNT(DISTINCT node_id) FILTER (WHERE data->>'to' = 'contract')::int AS contracted
       FROM mp_events WHERE project_id = $1 AND kind = 'status'`,
      [project.id]
    );
    out.sales.conversion = conv[0].booked ? Math.round((conv[0].contracted / conv[0].booked) * 1000) / 10 : null;
  }

  if (has(caps, 'build.view')) {
    const today = isoDay(new Date(), (await regionalFor(null)).timeZone);
    const { rows: objects } = await query(
      `SELECT n.id, n.code, n.name, n.path, n.area, n.readiness, n.last_report_at, n.created_at FROM mp_nodes n JOIN mp_types t ON t.id = n.type_id
       WHERE n.project_id = $1 AND t.stage_set IS NOT NULL AND n.kind <> 'level'`,
      [project.id]
    );
    const { rows: stages } = await query(`SELECT ns.node_id, ns.plan_end, ns.fact_end, ns.percent FROM mp_node_stages ns JOIN mp_nodes n ON n.id = ns.node_id WHERE n.project_id = $1`, [project.id]);
    const stagesOf = new Map();
    for (const row of stages) {
      if (!stagesOf.has(row.node_id)) stagesOf.set(row.node_id, []);
      stagesOf.get(row.node_id).push({ planEnd: dayString(row.plan_end), factEnd: dayString(row.fact_end), percent: Number(row.percent) });
    }
    const { rows: tops } = await query(`SELECT id, code, name, level_key FROM mp_nodes WHERE project_id = $1 AND kind = 'level' AND depth <= 2 ORDER BY depth, sort, id`, [project.id]);
    const staleCut = Date.now() - settings.staleReportDays * 86400000;
    let behind = 0;
    const stale = [];
    let w = 0;
    let v = 0;
    for (const obj of objects) {
      const weight = Number(obj.area) || 1;
      w += weight;
      v += weight * Number(obj.readiness);
      const schedule = scheduleState(stagesOf.get(obj.id) || [], today);
      obj.schedule = schedule;
      if (schedule.state === 'behind') behind += 1;
      const last = obj.last_report_at ? new Date(obj.last_report_at).getTime() : new Date(obj.created_at).getTime();
      if (Number(obj.readiness) < 100 && last < staleCut) stale.push({ id: obj.id, code: obj.code, name: obj.name, lastReportAt: obj.last_report_at ? new Date(obj.last_report_at).toISOString() : null });
    }
    out.construction = {
      objects: objects.length,
      readiness: w ? Math.round((v / w) * 10) / 10 : 0,
      behind,
      stale: stale.slice(0, 20),
      staleCount: stale.length,
      staleDays: settings.staleReportDays,
      byLevel: tops
        .map((top) => {
          const inside = objects.filter((obj) => obj.path.includes(top.id));
          let tw = 0;
          let tv = 0;
          for (const obj of inside) {
            const weight = Number(obj.area) || 1;
            tw += weight;
            tv += weight * Number(obj.readiness);
          }
          return { id: top.id, code: top.code, name: top.name, levelKey: top.level_key, objects: inside.length, readiness: tw ? Math.round((tv / tw) * 10) / 10 : null, behind: inside.filter((obj) => obj.schedule.state === 'behind').length };
        })
        .filter((item) => item.objects),
    };
    // "Продано, но не построено": held units whose building is not ready, the least ready first.
    if (has(caps, 'status.view')) {
      const byId = new Map(objects.map((obj) => [obj.id, obj]));
      out.risks = units
        .filter((row) => ['deposit', 'contract', 'sold'].includes(row.status))
        .map((row) => {
          const owner = [...row.path].reverse().map((id) => byId.get(id)).find(Boolean);
          return owner ? { id: row.id, code: row.code, name: row.name, status: row.status, readiness: Number(owner.readiness), delayDays: owner.schedule.state === 'behind' ? owner.schedule.delayDays : 0 } : null;
        })
        .filter((item) => item && item.readiness < 100)
        .sort((a, b) => b.delayDays - a.delayDays || a.readiness - b.readiness)
        .slice(0, 15);
    }
  }
  return out;
}
