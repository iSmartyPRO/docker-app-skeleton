import { query, withTransaction } from '../../config/database.js';
import { httpError } from '../shared/acl.js';
import { NODE_KINDS, STAGE_SETS, TYPE_CATEGORIES } from './constants.js';
import { requireAdmin } from './access.js';
import { intOr, text } from './util.js';

/*
 * Object types directory (§4.3): sellable or not, category, node kind, icon,
 * colour on the plan, construction stage set. Seeded once; administrators
 * edit it. Types in use cannot change their kind or sellable flag.
 */

const HEX = /^#[0-9a-f]{6}$/i;
const ICONS = ['house', 'townhouse', 'villa', 'building', 'apartment', 'land', 'shop', 'office', 'restaurant', 'fitness', 'admin', 'gate', 'boiler', 'road', 'network', 'playground', 'park', 'water', 'parking', 'car', 'storage', 'flag'];

export function typeRow(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    category: row.category,
    nodeKind: row.node_kind,
    sellable: row.sellable,
    stageSet: row.stage_set,
    icon: row.icon,
    color: row.color,
    sort: row.sort,
    archived: Boolean(row.archived_at),
    used: Number(row.used || 0),
  };
}

export async function listTypes({ archived = false } = {}) {
  const { rows } = await query(
    `SELECT t.*, (SELECT COUNT(*) FROM mp_nodes n WHERE n.type_id = t.id) AS used FROM mp_types t ${archived ? '' : 'WHERE t.archived_at IS NULL'} ORDER BY t.sort, t.id`
  );
  return rows.map(typeRow);
}

/** Replaces the directory: [{ id?, name, category, nodeKind, sellable, stageSet, icon, color, archived }] in order. */
export async function saveTypes(ctx, items) {
  requireAdmin(ctx);
  const list = (Array.isArray(items) ? items : []).slice(0, 200);
  const { rows: current } = await query(`SELECT t.*, (SELECT COUNT(*) FROM mp_nodes n WHERE n.type_id = t.id) AS used FROM mp_types t`);
  const byId = new Map(current.map((row) => [row.id, row]));
  const clean = list.map((item, index) => {
    const name = text(item?.name, 120);
    if (!name) throw httpError(400, 'Each type needs a name', 'INVALID_FIELD');
    const nodeKind = NODE_KINDS.includes(item?.nodeKind) && item.nodeKind !== 'level' ? item.nodeKind : 'object';
    return {
      id: intOr(item?.id),
      name,
      category: TYPE_CATEGORIES.includes(item?.category) ? item.category : 'residential',
      nodeKind,
      sellable: item?.sellable === true,
      stageSet: STAGE_SETS.includes(item?.stageSet) ? item.stageSet : null,
      icon: ICONS.includes(item?.icon) ? item.icon : 'flag',
      color: HEX.test(item?.color || '') ? item.color.toUpperCase() : '#64748B',
      archived: item?.archived === true,
      sort: index,
    };
  });
  await withTransaction(async (client) => {
    for (const item of clean) {
      const existing = item.id ? byId.get(item.id) : null;
      if (existing) {
        if (Number(existing.used) && (existing.node_kind !== item.nodeKind || existing.sellable !== item.sellable)) {
          throw httpError(409, `“${existing.name}” is in use: its kind and “for sale” flag stay`, 'TYPE_IN_USE');
        }
        await client.query(
          `UPDATE mp_types SET name = $2, category = $3, node_kind = $4, sellable = $5, stage_set = $6, icon = $7, color = $8, sort = $9, archived_at = CASE WHEN $10 THEN COALESCE(archived_at, NOW()) ELSE NULL END WHERE id = $1`,
          [item.id, item.name, item.category, item.nodeKind, item.sellable, item.stageSet, item.icon, item.color, item.sort, item.archived]
        );
      } else {
        await client.query(
          `INSERT INTO mp_types (name, category, node_kind, sellable, stage_set, icon, color, sort, archived_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9 THEN NOW() ELSE NULL END)`,
          [item.name, item.category, item.nodeKind, item.sellable, item.stageSet, item.icon, item.color, item.sort, item.archived]
        );
      }
    }
    // Types left out of the list are archived (kept for the objects that use them).
    const kept = new Set(clean.map((item) => item.id).filter(Boolean));
    for (const row of current) if (!kept.has(row.id) && !row.archived_at) await client.query(`UPDATE mp_types SET archived_at = NOW() WHERE id = $1`, [row.id]);
  });
  return listTypes({ archived: true });
}

export { ICONS };
