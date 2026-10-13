import { query } from '../../config/database.js';
import { avatarOf } from '../shared/acl.js';
import { projectUnit, readCaps } from './rules.js';
import { crmScopeAllows } from './access.js';
import { dayString, iso, money } from './util.js';

/*
 * One SELECT for nodes with their sales data (mp_units), the manager, the
 * active timer, the CRM deal and the client, and the API shapes built from it.
 * Every list (site plan, registry, chessboard, bookings) uses these, then
 * projectUnit() removes what the viewer may not see.
 */

export const NODE_SELECT = `
  SELECT n.*, t.key AS type_key, t.name AS type_name, t.category AS type_category, t.icon AS type_icon, t.color AS type_color,
         t.sellable AS type_sellable, t.stage_set AS type_stage_set,
         u.node_id AS u_id, u.status, u.version, u.price, u.currency, u.discount_pct, u.min_price, u.area_total, u.area_living,
         u.area_plot, u.area_terrace, u.rooms, u.bedrooms, u.bathrooms, u.levels, u.ceiling, u.floor, u.number, u.riser,
         u.finishing, u.payment_forms, u.no_publish, u.manager_id, u.deal_id, u.person_id, u.company_id, u.client_name,
         u.booking_id, u.contract_number, u.contract_date, u.contract_amount, u.paid_amount, u.act_date, u.status_changed_at,
         mu.username AS m_username, COALESCE(mu.display_name, mu.username) AS m_name, mu.avatar_path AS m_avatar,
         b.id AS b_id, b.kind AS b_kind, b.ends_at AS b_ends_at, b.starts_at AS b_starts_at, b.extensions AS b_extensions, b.paid AS b_paid,
         d.title AS deal_title, d.deleted_at AS deal_deleted,
         NULLIF(CONCAT_WS(' ', pp.last_name, pp.first_name), '') AS person_name, c.name AS company_name,
         st.name AS stage_name
  FROM mp_nodes n
  LEFT JOIN mp_types t ON t.id = n.type_id
  LEFT JOIN mp_units u ON u.node_id = n.id
  LEFT JOIN users mu ON mu.id = u.manager_id
  LEFT JOIN mp_bookings b ON b.id = u.booking_id AND b.status = 'active'
  LEFT JOIN crm_deals d ON d.id = u.deal_id
  LEFT JOIN cmp_people pp ON pp.id = u.person_id
  LEFT JOIN cmp_companies c ON c.id = u.company_id
  LEFT JOIN mp_stages st ON st.id = n.current_stage_id`;

const num = (value) => (value === null || value === undefined ? null : Number(value));

export function typeShape(row) {
  if (!row.type_id) return null;
  return { id: row.type_id, key: row.type_key, name: row.type_name, category: row.type_category, icon: row.type_icon, color: row.type_color, sellable: Boolean(row.type_sellable), stageSet: row.type_stage_set };
}

/** Sales data of a node (before field hiding). */
export function unitShape(row) {
  if (!row.u_id) return null;
  const price = money(row.price);
  const area = num(row.area_total) || num(row.area_plot);
  const contractAmount = money(row.contract_amount);
  const paid = money(row.paid_amount);
  return {
    status: row.status,
    version: row.version,
    typeId: row.type_id || null,
    statusChangedAt: iso(row.status_changed_at),
    price,
    currency: (row.currency || '').trim() || null,
    pricePerM2: price && area ? Math.round((price / area) * 100) / 100 : null,
    discountPct: num(row.discount_pct),
    minPrice: money(row.min_price),
    paymentForms: row.payment_forms || [],
    areaTotal: num(row.area_total),
    areaLiving: num(row.area_living),
    areaPlot: num(row.area_plot),
    areaTerrace: num(row.area_terrace),
    rooms: row.rooms,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    levels: row.levels,
    ceiling: num(row.ceiling),
    floor: row.floor,
    number: row.number,
    riser: row.riser,
    finishing: row.finishing,
    noPublish: Boolean(row.no_publish),
    manager: row.manager_id ? { id: row.manager_id, username: row.m_username, name: row.m_name, avatarUrl: avatarOf(row.m_avatar) } : null,
    booking: row.b_id ? { id: row.b_id, kind: row.b_kind, startsAt: iso(row.b_starts_at), endsAt: iso(row.b_ends_at), extensions: row.b_extensions, paid: Boolean(row.b_paid) } : null,
    deal: row.deal_id ? { id: row.deal_id, title: row.deal_title || `#${row.deal_id}`, deleted: Boolean(row.deal_deleted) } : null,
    client: row.person_id || row.company_id || row.client_name ? { personId: row.person_id, companyId: row.company_id, name: row.person_name || row.company_name || row.client_name } : null,
    contract: row.contract_number || row.contract_date || contractAmount ? { number: row.contract_number, date: dayString(row.contract_date), amount: contractAmount, actDate: dayString(row.act_date) } : null,
    paidAmount: paid,
    remaining: contractAmount !== null ? Math.round(((contractAmount || 0) - (paid || 0)) * 100) / 100 : null,
  };
}

export function nodeShape(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    path: row.path,
    depth: row.depth,
    kind: row.kind,
    levelKey: row.level_key,
    type: typeShape(row),
    code: row.code,
    name: row.name,
    sort: row.sort,
    area: num(row.area),
    readiness: num(row.readiness),
    readinessManual: Boolean(row.readiness_manual),
    stage: row.current_stage_id ? { id: row.current_stage_id, name: row.stage_name } : null,
    lastReportAt: iso(row.last_report_at),
    planStart: dayString(row.plan_start),
    planEnd: dayString(row.plan_end),
    handover: row.handover,
    contractor: row.contractor,
    buildUserId: row.build_user_id,
    salesUserId: row.sales_user_id,
    description: row.description,
    attrs: row.attrs || {},
    updatedAt: iso(row.updated_at),
    unit: unitShape(row),
  };
}

/** A node as the viewer may see it (field hiding of its unit). */
export function visibleNode(ctx, row, { presentation = false, caps } = {}) {
  const node = nodeShape(row);
  if (node.unit) node.unit = projectUnit(node.unit, { caps: caps || readCaps(ctx, row.project_id), userId: ctx.userId, presentation });
  // A deal's title is CRM data: an API token without the CRM scope gets the id only.
  if (node.unit?.deal && !crmScopeAllows(ctx, 'read')) node.unit.deal = { id: node.unit.deal.id };
  if (presentation) {
    delete node.buildUserId;
    delete node.salesUserId;
    delete node.contractor;
  }
  return node;
}

/** Fresh rows of these nodes (any project). */
export async function loadNodes(ids, client = { query }) {
  if (!ids.length) return [];
  const { rows } = await client.query(`${NODE_SELECT} WHERE n.id = ANY($1::int[])`, [ids]);
  return rows;
}

export async function loadNodeRow(id, client = { query }) {
  const rows = await loadNodes([Number(id)], client);
  return rows[0] || null;
}

/**
 * Readiness of units and plots without their own stages: the nearest
 * construction object above them. Levels get the area-weighted average of the
 * construction objects below. Works on a whole project's rows at once.
 */
export function inheritReadiness(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const isObject = (node) => Boolean(node.type?.stageSet) && node.kind !== 'level';
  for (const node of nodes) {
    if (node.kind === 'level' || isObject(node)) continue;
    for (let i = node.path.length - 2; i >= 0; i -= 1) {
      const up = byId.get(node.path[i]);
      if (up && isObject(up)) {
        node.readiness = up.readiness;
        node.inheritedFrom = up.id;
        break;
      }
    }
  }
  const sums = new Map();
  for (const node of nodes) {
    if (!isObject(node)) continue;
    const w = node.area || 1;
    for (const id of node.path.slice(0, -1)) {
      const s = sums.get(id) || { w: 0, v: 0 };
      s.w += w;
      s.v += w * (node.readiness || 0);
      sums.set(id, s);
    }
  }
  for (const node of nodes) {
    if (node.kind !== 'level') continue;
    const s = sums.get(node.id);
    node.readiness = s ? Math.round((s.v / s.w) * 10) / 10 : null;
    // A section or floor inside an apartment building follows the building.
    if (!s) {
      for (let i = node.path.length - 2; i >= 0; i -= 1) {
        const up = byId.get(node.path[i]);
        if (up && isObject(up)) {
          node.readiness = up.readiness;
          break;
        }
      }
    }
  }
  return nodes;
}
