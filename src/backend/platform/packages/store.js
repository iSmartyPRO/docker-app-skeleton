import { query } from '../../config/database.js';

/*
 * Database side of installed modules (docs/module-packages.md «Tables»):
 *
 *   installed_modules  one row per module: version, state, where it came from,
 *                      who installed it, the last error, the package checksum
 *   module_migrations  every migration applied, once per module
 *   module_tables      tables a module's migrations created (backups, data removal)
 *
 * state: installed (code present; the on/off switch stays in settings.modules),
 * failed (the package did not load — `error` says why), removed (code deleted,
 * data kept). enabled / disabled are accepted for compatibility; the API
 * reports the switch from the settings.
 */

export async function ensurePackageTables(db = { query }) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS installed_modules (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'installed' CHECK (state IN ('installed', 'enabled', 'disabled', 'failed', 'removed')),
      source TEXT NOT NULL DEFAULT 'package' CHECK (source IN ('bundled', 'package')),
      installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      installed_by TEXT,
      error TEXT,
      checksum TEXT,
      signed_by TEXT,
      previous_version TEXT,
      pending_check BOOLEAN NOT NULL DEFAULT FALSE,
      backup_file TEXT,
      manifest JSONB
    );
    CREATE TABLE IF NOT EXISTS module_migrations (
      module_id TEXT NOT NULL,
      migration_id TEXT NOT NULL,
      version TEXT,
      checksum TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (module_id, migration_id)
    );
    CREATE TABLE IF NOT EXISTS module_tables (
      module_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      migration_id TEXT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (module_id, table_name)
    );
  `);
}

export async function getModuleRow(id, db = { query }) {
  return (await db.query(`SELECT * FROM installed_modules WHERE id = $1`, [id])).rows[0] || null;
}

export async function listModuleRows(db = { query }) {
  return (await db.query(`SELECT * FROM installed_modules ORDER BY id`)).rows;
}

/** Inserts or updates a row; only the given fields change on update. */
export async function saveModuleRow(row, db = { query }) {
  const fields = ['version', 'state', 'source', 'installed_by', 'error', 'checksum', 'signed_by', 'previous_version', 'pending_check', 'backup_file', 'manifest'];
  const given = fields.filter((field) => row[field] !== undefined);
  const values = given.map((field) => (field === 'manifest' && row[field] != null ? JSON.stringify(row[field]) : row[field]));
  const insertCols = ['id', ...given];
  const placeholders = insertCols.map((_, index) => `$${index + 1}`);
  const updates = given.map((field) => `${field} = EXCLUDED.${field}`);
  if (row.touchInstalledAt) updates.push('installed_at = NOW()');
  updates.push('updated_at = NOW()');
  const sql = `INSERT INTO installed_modules (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})
    ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')} RETURNING *`;
  return (await db.query(sql, [row.id, ...values])).rows[0];
}

export async function appliedMigrations(id, db = { query }) {
  return (await db.query(`SELECT migration_id, checksum, version, applied_at FROM module_migrations WHERE module_id = $1 ORDER BY migration_id`, [id])).rows;
}

export async function recordedTables(id, db = { query }) {
  return (await db.query(`SELECT table_name FROM module_tables WHERE module_id = $1 ORDER BY table_name`, [id])).rows.map((row) => row.table_name);
}
