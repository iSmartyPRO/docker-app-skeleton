import { query } from '../../config/database.js';

/*
 * Tables of the AD directory module (docs/directory.md → Data):
 *
 *   ad_journal       one row per object changed in the directory (who, as which AD
 *                    account, what before → after, the result); demo changes are marked
 *   ad_demo_objects  the demo directory (only filled by the superadministrator's demo data
 *                    while the AD integration is not set up)
 *
 * Passwords are never stored anywhere: the acting administrator's own domain password
 * is the File server's sealed drive_credentials row (drive/access/credentials.js).
 */
export async function ensureDirectorySchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS ad_journal (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      batch VARCHAR(40),
      action VARCHAR(32) NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name VARCHAR(255),
      user_login VARCHAR(255),
      ad_account VARCHAR(255),
      ip VARCHAR(64),
      user_agent VARCHAR(300),
      target_dn TEXT,
      target_name VARCHAR(255),
      target_kind VARCHAR(16),
      details JSONB,
      ok BOOLEAN NOT NULL DEFAULT TRUE,
      outcome VARCHAR(16) NOT NULL DEFAULT 'changed',
      error_code VARCHAR(40),
      error TEXT,
      demo BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS ad_journal_at_idx ON ad_journal (at DESC, id DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS ad_journal_target_idx ON ad_journal (LOWER(target_dn))`);
  await query(`CREATE INDEX IF NOT EXISTS ad_journal_user_idx ON ad_journal (user_id, at DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS ad_demo_objects (
      id SERIAL PRIMARY KEY,
      dn TEXT NOT NULL,
      canon TEXT NOT NULL UNIQUE,
      parent_canon TEXT,
      kind VARCHAR(16) NOT NULL,
      attrs JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS ad_demo_objects_parent_idx ON ad_demo_objects (parent_canon)`);
}
