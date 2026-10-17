import { query, withTransaction } from '../../config/database.js';
import { ensureKbFileLinks } from '../files/schema.js';
import { migrateKbFiles } from '../files/kb.js';
import { localeOrDefault, tr } from '../../services/i18n/index.js';

/*
 * Knowledge base storage.
 *
 *   kb_folders  tree of folders (parent_id), icon/colour, access inheritance
 *   kb_items    materials in a folder: uploaded files, articles, links
 *   kb_acl      access entries for the whole base (root), a folder or an item
 *   kb_shares   public links to a folder (custom slug, password, expiry)
 */

export async function ensureKbSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS kb_folders (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER REFERENCES kb_folders(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      icon VARCHAR(40),
      color VARCHAR(16),
      inherit_access BOOLEAN NOT NULL DEFAULT TRUE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS kb_folders_parent_idx ON kb_folders (parent_id, sort, name)`);

  await query(`
    CREATE TABLE IF NOT EXISTS kb_items (
      id SERIAL PRIMARY KEY,
      folder_id INTEGER NOT NULL REFERENCES kb_folders(id) ON DELETE CASCADE,
      kind VARCHAR(12) NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      content TEXT,
      url TEXT,
      file_name TEXT,
      file_original TEXT,
      file_mime VARCHAR(160),
      file_size BIGINT,
      file_ext VARCHAR(12),
      inherit_access BOOLEAN NOT NULL DEFAULT TRUE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Articles are Markdown ('md') or HTML from the visual editor ('html').
  await query(`ALTER TABLE kb_items ADD COLUMN IF NOT EXISTS content_format VARCHAR(8) NOT NULL DEFAULT 'md'`);
  await query(`CREATE INDEX IF NOT EXISTS kb_items_folder_idx ON kb_items (folder_id, sort, title)`);
  await query(`CREATE INDEX IF NOT EXISTS kb_items_updated_idx ON kb_items (updated_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS kb_acl (
      id SERIAL PRIMARY KEY,
      resource_type VARCHAR(8) NOT NULL,
      resource_id INTEGER NOT NULL DEFAULT 0,
      subject_type VARCHAR(8) NOT NULL,
      subject_id INTEGER,
      level SMALLINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS kb_acl_unique
    ON kb_acl (resource_type, resource_id, subject_type, COALESCE(subject_id, 0))
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS kb_shares (
      id SERIAL PRIMARY KEY,
      folder_id INTEGER NOT NULL REFERENCES kb_folders(id) ON DELETE CASCADE,
      slug VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(120),
      password_hash TEXT,
      expires_at TIMESTAMPTZ,
      allow_download BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      last_viewed_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS kb_shares_folder_idx ON kb_shares (folder_id)`);

  // Files are kept in the Files module; link tables, then move legacy uploads.
  await ensureKbFileLinks();
  await migrateKbFiles();
  await seedKb();
}

/**
 * Once per database: everyone can read, the Administrators group can edit,
 * and a "Getting started" folder explains the module.
 */
async function seedKb() {
  const flag = await query(`SELECT value FROM app_settings WHERE key = 'kb_seeded'`);
  if (flag.rows[0]?.value === 'true') return;
  const anyUser = await query(`SELECT locale FROM users ORDER BY id LIMIT 1`);
  if (!anyUser.rows.length) return; // fresh install: wait for the wizard

  const locale = localeOrDefault(process.env.SEED_LOCALE || anyUser.rows[0].locale);
  const text = tr(locale, 'kb.starter');
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO kb_acl (resource_type, resource_id, subject_type, subject_id, level)
       VALUES ('root', 0, 'everyone', NULL, 1) ON CONFLICT DO NOTHING`
    );
    await client.query(
      `INSERT INTO kb_acl (resource_type, resource_id, subject_type, subject_id, level)
       SELECT 'root', 0, 'group', id, 2 FROM app_groups WHERE key = 'administrators'
       ON CONFLICT DO NOTHING`
    );
    const existing = await client.query(`SELECT 1 FROM kb_folders LIMIT 1`);
    if (!existing.rows.length) {
      const folder = await client.query(
        `INSERT INTO kb_folders (name, description, icon, color) VALUES ($1, $2, 'rocket', '#4F46E5') RETURNING id`,
        [text.folder, text.description]
      );
      await client.query(
        `INSERT INTO kb_items (folder_id, kind, title, content) VALUES ($1, 'article', $2, $3)`,
        [folder.rows[0].id, text.title, text.content]
      );
    }
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('kb_seeded', 'true')
       ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`
    );
  });
}
