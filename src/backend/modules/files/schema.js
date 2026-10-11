import { query } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';
import { ensureAclTable } from '../shared/acl.js';
import { purgeTrash } from './trash.js';

/*
 * Files: one tree of folders and files (fs_nodes). A node belongs either to a
 * person ("My files": owner_id, space_id NULL) or to a shared space (space_id).
 * Sharing grants view/edit on a node and everything below it; public links
 * open a file or folder to anyone with the link. Deleting moves to the trash.
 *
 * The Knowledge Base stores its files here too: kb_items.file_node_id points
 * at the file, kb_item_files lists files attached to (or embedded in) articles.
 */

export async function ensureFilesSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS fs_spaces (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      color VARCHAR(7) NOT NULL DEFAULT '#0EA5E9',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await ensureAclTable('fs_space_acl', 'fs_spaces');
  await query(`
    CREATE TABLE IF NOT EXISTS fs_nodes (
      id SERIAL PRIMARY KEY,
      kind VARCHAR(8) NOT NULL,
      name VARCHAR(255) NOT NULL,
      parent_id INTEGER REFERENCES fs_nodes(id) ON DELETE CASCADE,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      space_id INTEGER REFERENCES fs_spaces(id) ON DELETE CASCADE,
      storage_key TEXT,
      mime VARCHAR(160),
      size BIGINT NOT NULL DEFAULT 0,
      ext VARCHAR(12),
      system_tag VARCHAR(16),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS fs_nodes_parent_idx ON fs_nodes (parent_id)`);
  await query(`CREATE INDEX IF NOT EXISTS fs_nodes_owner_root_idx ON fs_nodes (owner_id) WHERE space_id IS NULL AND parent_id IS NULL`);
  await query(`CREATE INDEX IF NOT EXISTS fs_nodes_space_root_idx ON fs_nodes (space_id) WHERE parent_id IS NULL`);
  await query(`CREATE INDEX IF NOT EXISTS fs_nodes_deleted_idx ON fs_nodes (deleted_at) WHERE deleted_at IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS fs_nodes_name_idx ON fs_nodes (LOWER(name))`);
  await query(`
    CREATE TABLE IF NOT EXISTS fs_shares (
      id SERIAL PRIMARY KEY,
      node_id INTEGER NOT NULL REFERENCES fs_nodes(id) ON DELETE CASCADE,
      subject_type VARCHAR(8) NOT NULL,
      subject_id INTEGER NOT NULL,
      level SMALLINT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (node_id, subject_type, subject_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS fs_shares_subject_idx ON fs_shares (subject_type, subject_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS fs_links (
      id SERIAL PRIMARY KEY,
      node_id INTEGER NOT NULL REFERENCES fs_nodes(id) ON DELETE CASCADE,
      token VARCHAR(40) NOT NULL UNIQUE,
      password_hash TEXT,
      expires_at TIMESTAMPTZ,
      allow_download BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS fs_links_node_idx ON fs_links (node_id)`);

  registerJob({ name: 'files:trash', everyMs: 6 * 60 * 60 * 1000, run: purgeTrash });
}

/** Knowledge Base ↔ Files links. Runs after both schemas exist. */
export async function ensureKbFileLinks() {
  await query(`ALTER TABLE kb_items ADD COLUMN IF NOT EXISTS file_node_id INTEGER REFERENCES fs_nodes(id) ON DELETE RESTRICT`);
  await query(`CREATE INDEX IF NOT EXISTS kb_items_file_node_idx ON kb_items (file_node_id) WHERE file_node_id IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS kb_item_files (
      item_id INTEGER NOT NULL REFERENCES kb_items(id) ON DELETE CASCADE,
      node_id INTEGER NOT NULL REFERENCES fs_nodes(id) ON DELETE RESTRICT,
      inline BOOLEAN NOT NULL DEFAULT FALSE,
      sort INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (item_id, node_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS kb_item_files_node_idx ON kb_item_files (node_id)`);
}
