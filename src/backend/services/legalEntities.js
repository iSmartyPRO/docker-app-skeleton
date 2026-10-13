/**
 * Legal entities: a small shared directory of the companies of the group
 * ("юрлица"). Business modules use it as the payer of a purchase request
 * (Procurement) or the party of a contract (Contracts).
 *
 * Read with listLegalEntities() / getLegalEntity(id); administrators edit it in
 * Settings → Legal entities (/api/admin/legal-entities). Rows are archived, not
 * deleted, so old documents keep their link.
 */

import { query } from '../config/database.js';

const MAX_ENTITIES = 200;

function fail(message, statusCode = 400, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

const text = (value, max) => {
  const out = String(value ?? '').trim().slice(0, max);
  return out || null;
};

export async function ensureLegalEntitiesTable() {
  const existed = (await query(`SELECT to_regclass('public.legal_entities') AS t`)).rows[0]?.t;
  await query(`
    CREATE TABLE IF NOT EXISTS legal_entities (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      short_name VARCHAR(80),
      tax_id VARCHAR(40),
      address VARCHAR(400),
      bank_details TEXT,
      note VARCHAR(400),
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      sort INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS legal_entities_one_default ON legal_entities ((1)) WHERE is_default AND archived_at IS NULL`);
  // Spec: "one legal entity by default". Seeded only when the table is new,
  // so an administrator who archives it does not get it back on restart.
  if (!existed) {
    const name = (await query(`SELECT value FROM app_settings WHERE key = 'app_name'`).catch(() => ({ rows: [] }))).rows[0]?.value;
    await query(`INSERT INTO legal_entities (name, is_default) VALUES ($1, TRUE)`, [String(name || 'Main company').slice(0, 200)]);
  }
}

function toEntity(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name || '',
    label: row.short_name || row.name,
    taxId: row.tax_id || '',
    address: row.address || '',
    bankDetails: row.bank_details || '',
    note: row.note || '',
    isDefault: row.is_default,
    archived: Boolean(row.archived_at),
    sort: row.sort,
  };
}

/** Active entities (default first). `{ includeArchived: true }` for admin screens. */
export async function listLegalEntities({ includeArchived = false } = {}) {
  const result = await query(
    `SELECT * FROM legal_entities ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
      ORDER BY archived_at IS NOT NULL, is_default DESC, sort, name, id`
  );
  return result.rows.map(toEntity);
}

/** One entity by id (archived included, so old documents still show the name), or null. */
export async function getLegalEntity(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const result = await query(`SELECT * FROM legal_entities WHERE id = $1`, [n]);
  return toEntity(result.rows[0]);
}

/** The default entity (or the first active one), or null. */
export async function getDefaultLegalEntity() {
  const list = await listLegalEntities();
  return list.find((e) => e.isDefault) || list[0] || null;
}

/** Pure: validates an input object. Exported for tests. */
export function cleanLegalEntity(input = {}) {
  const name = text(input.name, 200);
  if (!name) throw fail('Name is required', 400, 'NAME_REQUIRED');
  return {
    name,
    shortName: text(input.shortName, 80),
    taxId: text(input.taxId, 40),
    address: text(input.address, 400),
    bankDetails: text(input.bankDetails, 2000),
    note: text(input.note, 400),
    isDefault: Boolean(input.isDefault),
    sort: Number.isInteger(Number(input.sort)) ? Math.max(-9999, Math.min(9999, Number(input.sort))) : 0,
  };
}

async function clearDefault(exceptId) {
  await query(`UPDATE legal_entities SET is_default = FALSE WHERE is_default AND id <> $1`, [exceptId || 0]);
}

export async function createLegalEntity(input) {
  const data = cleanLegalEntity(input);
  const count = Number((await query(`SELECT COUNT(*)::int AS n FROM legal_entities`)).rows[0].n);
  if (count >= MAX_ENTITIES) throw fail('Too many legal entities', 400, 'LIMIT');
  if (data.isDefault) await clearDefault(0);
  const result = await query(
    `INSERT INTO legal_entities (name, short_name, tax_id, address, bank_details, note, is_default, sort)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.name, data.shortName, data.taxId, data.address, data.bankDetails, data.note, data.isDefault, data.sort]
  );
  return toEntity(result.rows[0]);
}

export async function updateLegalEntity(id, input) {
  const current = await getLegalEntity(id);
  if (!current) throw fail('Legal entity not found', 404, 'NOT_FOUND');
  const data = cleanLegalEntity({ ...current, ...input });
  if (data.isDefault) await clearDefault(current.id);
  const archived = input.archived === undefined ? current.archived : Boolean(input.archived);
  const result = await query(
    `UPDATE legal_entities SET name = $2, short_name = $3, tax_id = $4, address = $5, bank_details = $6, note = $7,
            is_default = $8 AND NOT $10, sort = $9,
            archived_at = CASE WHEN $10 THEN COALESCE(archived_at, NOW()) ELSE NULL END, updated_at = NOW()
      WHERE id = $1 RETURNING *`,
    [current.id, data.name, data.shortName, data.taxId, data.address, data.bankDetails, data.note, data.isDefault, data.sort, archived]
  );
  return toEntity(result.rows[0]);
}

/** Archives (soft delete): documents that point to it keep working. */
export async function archiveLegalEntity(id) {
  return updateLegalEntity(id, { archived: true });
}
