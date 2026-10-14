import { query, withTransaction } from '../../config/database.js';
import { avatarOf } from '../shared/acl.js';
import { intOrNull, logEvent, text, usersByIds, whContext } from './access.js';
import { BIN_KINDS, RIGHTS, WAREHOUSE_KINDS, day, httpError, ownCode } from './logic.js';

/*
 * Warehouses (spec §3): main / site / transit / mobile, with the MOL; the
 * optional bin tree zone → rack → shelf (switched on per warehouse); the
 * zone of responsibility — who holds which rights on one warehouse.
 */

export function warehouseShape(row, { people = new Map(), ctx = null } = {}) {
  return {
    id: row.id,
    code: row.code || '',
    name: row.name,
    kind: row.kind,
    mol: row.mol_id ? people.get(row.mol_id) || { id: row.mol_id, name: '' } : null,
    address: row.address || '',
    project: row.project_id || row.project_label ? { id: row.project_id, label: row.project_label || '' } : null,
    binsEnabled: row.bins_enabled,
    allowNegative: row.allow_negative,
    note: row.note || '',
    sort: row.sort,
    archived: Boolean(row.archived_at),
    labelCode: ownCode('warehouse', row.id),
    rights: ctx ? [...ctx.rights(row.id)] : undefined,
  };
}

export async function listWarehouses(req, { archived = false } = {}) {
  const ctx = await whContext(req);
  const visible = ctx.visibleIds();
  const { rows } = await query(
    `SELECT * FROM wh_warehouses WHERE ($1::boolean OR archived_at IS NULL) AND ($2::int[] IS NULL OR id = ANY($2::int[])) ORDER BY archived_at NULLS FIRST, sort, LOWER(name)`,
    [archived, visible]
  );
  const people = await usersByIds(rows.map((row) => row.mol_id));
  return rows.map((row) => warehouseShape(row, { people, ctx }));
}

export async function loadWarehouse(id, client = { query }) {
  const n = intOrNull(id);
  if (!n) return null;
  const { rows } = await client.query(`SELECT * FROM wh_warehouses WHERE id = $1`, [n]);
  return rows[0] || null;
}

/** A warehouse the person sees, or 404. */
export async function visibleWarehouse(ctx, id) {
  const row = await loadWarehouse(id);
  if (!row || !ctx.sees(row.id)) throw httpError(404, 'Warehouse not found', 'NOT_FOUND');
  return row;
}

async function cleanWarehouse(input) {
  const out = {};
  const has = (key) => input[key] !== undefined;
  if (has('name')) {
    out.name = text(input.name, 160);
    if (!out.name) throw httpError(400, 'Enter the name', 'NAME_REQUIRED');
  }
  if (has('code')) out.code = text(input.code, 20);
  if (has('kind')) {
    if (!WAREHOUSE_KINDS.includes(input.kind)) throw httpError(400, 'Unknown warehouse type', 'BAD_KIND');
    out.kind = input.kind;
  }
  if (has('molId')) {
    const id = intOrNull(input.molId);
    if (id && !(await query(`SELECT 1 FROM users WHERE id = $1 AND is_active IS NOT FALSE`, [id])).rows.length) throw httpError(400, 'Unknown person', 'BAD_USER');
    out.mol_id = id;
  }
  if (has('address')) out.address = text(input.address, 300);
  if (has('projectId')) out.project_id = intOrNull(input.projectId);
  if (has('projectLabel')) out.project_label = text(input.projectLabel, 200);
  if (has('binsEnabled')) out.bins_enabled = Boolean(input.binsEnabled);
  if (has('allowNegative')) out.allow_negative = Boolean(input.allowNegative);
  if (has('note')) out.note = text(input.note, 1000);
  if (has('sort')) out.sort = Number.isFinite(Number(input.sort)) ? Math.round(Number(input.sort)) : 0;
  return out;
}

const codeConflict = (err) => {
  if (err?.code === '23505') throw httpError(409, 'This code is already used by another warehouse', 'CODE_TAKEN');
  throw err;
};

export async function createWarehouse(req, input = {}) {
  const ctx = await whContext(req);
  if (!ctx.isAdmin) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  const values = await cleanWarehouse({ kind: 'main', ...input });
  if (!values.name) throw httpError(400, 'Enter the name', 'NAME_REQUIRED');
  const row = await withTransaction(async (client) => {
    const keys = Object.keys(values);
    const { rows } = await client.query(`INSERT INTO wh_warehouses (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, keys.map((key) => values[key])).catch(codeConflict);
    await logEvent(client, 'warehouse', rows[0].id, ctx.userId, 'created', { name: rows[0].name });
    return rows[0];
  });
  req.wh = null;
  return (await listWarehouses(req, { archived: true })).find((item) => item.id === row.id);
}

export async function updateWarehouse(req, id, input = {}) {
  const ctx = await whContext(req);
  const current = await loadWarehouse(id);
  if (!current) throw httpError(404, 'Warehouse not found', 'NOT_FOUND');
  if (!ctx.can('admin', current.id)) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  const values = await cleanWarehouse(input);
  if (input.archived !== undefined) values.archived_at = input.archived ? new Date() : null;
  await withTransaction(async (client) => {
    const keys = Object.keys(values);
    if (keys.length) await client.query(`UPDATE wh_warehouses SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')} WHERE id = $1`, [current.id, ...keys.map((key) => values[key])]).catch(codeConflict);
    await logEvent(client, 'warehouse', current.id, ctx.userId, 'updated', { fields: keys });
  });
  req.wh = null;
  return (await listWarehouses(req, { archived: true })).find((item) => item.id === current.id);
}

// ── Bins ────────────────────────────────────────────────────────────────────

export async function listBins(req, warehouseId, { archived = false } = {}) {
  const ctx = await whContext(req);
  const wh = await visibleWarehouse(ctx, warehouseId);
  const { rows } = await query(
    `SELECT b.*, (SELECT COALESCE(SUM(s.qty), 0) FROM wh_stock s WHERE s.bin_id = b.id AND s.holder_type = 'warehouse') AS stock
     FROM wh_bins b WHERE b.warehouse_id = $1 AND ($2::boolean OR b.archived_at IS NULL) ORDER BY b.path`,
    [wh.id, archived]
  );
  return rows.map((row) => ({ id: row.id, parentId: row.parent_id, kind: row.kind, code: row.code, name: row.name || '', path: row.path, sort: row.sort, archived: Boolean(row.archived_at), stock: Number(row.stock), labelCode: ownCode('bin', row.id) }));
}

async function binPath(client, warehouseId, parentId, code) {
  if (!parentId) return code;
  const { rows } = await client.query(`SELECT path FROM wh_bins WHERE id = $1 AND warehouse_id = $2`, [parentId, warehouseId]);
  if (!rows[0]) throw httpError(400, 'Unknown parent bin', 'BAD_PARENT');
  return `${rows[0].path}-${code}`;
}

/** POST bins: one bin, or a series «rack A, shelves 1–5» via { codes: [...] }. */
export async function createBins(req, warehouseId, input = {}) {
  const ctx = await whContext(req);
  const wh = await loadWarehouse(warehouseId);
  if (!wh) throw httpError(404, 'Warehouse not found', 'NOT_FOUND');
  if (!ctx.can('admin', wh.id)) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  const kind = BIN_KINDS.includes(input.kind) ? input.kind : 'shelf';
  const parentId = intOrNull(input.parentId);
  const codes = (Array.isArray(input.codes) ? input.codes : [input.code]).map((c) => String(c ?? '').trim().replace(/[\s/\\]+/g, '').slice(0, 40)).filter(Boolean).slice(0, 200);
  if (!codes.length) throw httpError(400, 'Enter the bin code', 'CODE_REQUIRED');
  await withTransaction(async (client) => {
    for (const code of codes) {
      const path = await binPath(client, wh.id, parentId, code);
      await client
        .query(`INSERT INTO wh_bins (warehouse_id, parent_id, kind, code, name, path) VALUES ($1, $2, $3, $4, $5, $6)`, [wh.id, parentId, kind, code, text(input.name, 120), path])
        .catch((err) => {
          if (err?.code === '23505') throw httpError(409, `Bin ${path} already exists`, 'BIN_TAKEN', { path });
          throw err;
        });
    }
    if (!wh.bins_enabled) await client.query(`UPDATE wh_warehouses SET bins_enabled = TRUE WHERE id = $1`, [wh.id]);
  });
  return listBins(req, wh.id);
}

export async function updateBin(req, binId, input = {}) {
  const ctx = await whContext(req);
  const { rows } = await query(`SELECT * FROM wh_bins WHERE id = $1`, [intOrNull(binId) || 0]);
  const bin = rows[0];
  if (!bin) throw httpError(404, 'Bin not found', 'NOT_FOUND');
  if (!ctx.can('admin', bin.warehouse_id)) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  const name = input.name !== undefined ? text(input.name, 120) : bin.name;
  const archived = input.archived === undefined ? bin.archived_at : input.archived ? bin.archived_at || new Date() : null;
  if (archived && !bin.archived_at) {
    const { rows: stock } = await query(`SELECT 1 FROM wh_stock WHERE bin_id = ANY(SELECT id FROM wh_bins WHERE path = $1 OR path LIKE $2) AND qty <> 0 LIMIT 1`, [bin.path, `${bin.path}-%`]);
    if (stock.length) throw httpError(409, 'The bin still holds stock', 'BIN_NOT_EMPTY');
  }
  await query(`UPDATE wh_bins SET name = $2, archived_at = $3 WHERE id = $1`, [bin.id, name, archived]);
  return listBins(req, bin.warehouse_id, { archived: true });
}

// ── Zone of responsibility ──────────────────────────────────────────────────

export async function getAccess(req, warehouseId) {
  const ctx = await whContext(req);
  const wh = await loadWarehouse(warehouseId);
  if (!wh) throw httpError(404, 'Warehouse not found', 'NOT_FOUND');
  if (!ctx.can('admin', wh.id)) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  const { rows } = await query(
    `SELECT a.*, COALESCE(u.display_name, u.username) AS user_name, u.avatar_path, g.name AS group_name
     FROM wh_assignments a LEFT JOIN users u ON a.subject_type = 'user' AND u.id = a.subject_id LEFT JOIN app_groups g ON a.subject_type = 'group' AND g.id = a.subject_id
     WHERE a.warehouse_id = $1 ORDER BY a.subject_type DESC, LOWER(COALESCE(u.display_name, u.username, g.name))`,
    [wh.id]
  );
  return rows.map((row) => ({
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    name: row.subject_type === 'user' ? row.user_name : row.group_name,
    avatarUrl: row.subject_type === 'user' ? avatarOf(row.avatar_path) : null,
    rights: row.rights,
    until: row.until ? String(row.until instanceof Date ? row.until.toISOString() : row.until).slice(0, 10) : null,
  }));
}

/** PUT access: the whole list [{ subjectType, subjectId, rights, until }]. */
export async function saveAccess(req, warehouseId, entries) {
  const ctx = await whContext(req);
  const wh = await loadWarehouse(warehouseId);
  if (!wh) throw httpError(404, 'Warehouse not found', 'NOT_FOUND');
  if (!ctx.can('admin', wh.id)) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  const clean = [];
  const seen = new Set();
  for (const raw of (Array.isArray(entries) ? entries : []).slice(0, 200)) {
    const type = raw?.subjectType === 'group' ? 'group' : raw?.subjectType === 'user' ? 'user' : null;
    const id = intOrNull(raw?.subjectId);
    if (!type || !id || seen.has(`${type}:${id}`)) continue;
    const rights = [...new Set((Array.isArray(raw.rights) ? raw.rights : []).filter((right) => RIGHTS.includes(right)))];
    // Nobody grants more than they hold: `admin` / `cost` / `backdate` only by those who have them.
    for (const right of rights) if (!ctx.can(right, wh.id)) throw httpError(403, `You cannot grant «${right}»`, 'NO_ESCALATION', { right });
    if (!rights.length) continue;
    seen.add(`${type}:${id}`);
    clean.push({ type, id, rights, until: day(raw.until) });
  }
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM wh_assignments WHERE warehouse_id = $1`, [wh.id]);
    for (const entry of clean) {
      await client.query(`INSERT INTO wh_assignments (warehouse_id, subject_type, subject_id, rights, until, created_by) VALUES ($1, $2, $3, $4, $5, $6)`, [wh.id, entry.type, entry.id, entry.rights, entry.until, ctx.userId]);
    }
    await logEvent(client, 'warehouse', wh.id, ctx.userId, 'access', { entries: clean.length });
  });
  return getAccess(req, wh.id);
}

/** People who act for a warehouse: its MOL, else those assigned `operate` there (for notifications). */
export async function warehouseKeepers(warehouseId) {
  const { rows } = await query(`SELECT mol_id FROM wh_warehouses WHERE id = $1`, [warehouseId]);
  if (rows[0]?.mol_id) return [rows[0].mol_id];
  const { rows: assigned } = await query(
    `SELECT DISTINCT u.id FROM wh_assignments a
     JOIN users u ON (a.subject_type = 'user' AND u.id = a.subject_id) OR (a.subject_type = 'group' AND u.id IN (SELECT user_id FROM user_group_members WHERE group_id = a.subject_id))
     WHERE a.warehouse_id = $1 AND ('operate' = ANY(a.rights) OR 'admin' = ANY(a.rights)) AND (a.until IS NULL OR a.until >= CURRENT_DATE) AND u.is_active IS NOT FALSE LIMIT 20`,
    [warehouseId]
  );
  return assigned.map((row) => row.id);
}
