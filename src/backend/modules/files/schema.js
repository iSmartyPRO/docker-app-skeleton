import { query, withTransaction } from '../../config/database.js';
import { onBeforeUserDelete } from '../../services/hooks.js';
import { registerJob } from '../../services/scheduler.js';
import { ensureAclTable } from '../shared/acl.js';
import { ensureSlugSchema } from '../shared/linkSlug.js';
import { prunePreviewCaches } from '../shared/storage.js';
import { flushLinkNotices } from './linkWrites.js';
import { beforeUserDelete, purgeTrash } from './trash.js';

/*
 * Files: one tree of folders and files (fs_nodes). A node belongs either to a
 * person ("My files": owner_id, space_id NULL) or to a shared space (space_id).
 * Sharing grants view/edit on a node and everything below it; public links
 * open a file or folder to anyone with the link. Deleting moves to the trash.
 *
 * The Knowledge Base stores its files here too: kb_items.file_node_id points
 * at the file, kb_item_files lists files attached to (or embedded in) articles.
 *
 * Deleting a person never deletes nodes through the foreign key: space nodes
 * they made stay (owner_id NULL), their own files become ownerless and are
 * purged by the trash job (see trash.js), except files the KB still uses.
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
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
  await ownerSetNull();
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
  // Fine-grained link permissions (see links.js). Existing links keep exactly
  // what they did: view + download, or view only where downloads were off.
  await query(`
    ALTER TABLE fs_links
      ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{view,download}',
      ADD COLUMN IF NOT EXISTS title VARCHAR(120),
      ADD COLUMN IF NOT EXISTS max_file_mb INTEGER,
      ADD COLUMN IF NOT EXISTS extensions TEXT,
      ADD COLUMN IF NOT EXISTS quota_mb INTEGER,
      ADD COLUMN IF NOT EXISTS require_name BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS require_email BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS notify BOOLEAN NOT NULL DEFAULT FALSE
  `);
  // Custom addresses /l/<slug> (shared/linkSlug.js).
  await ensureSlugSchema('files');
  // allow_download is kept in step with permissions on every write, so this only ever touches old rows.
  await query(`UPDATE fs_links SET permissions = array_remove(permissions, 'download') WHERE allow_download = FALSE AND 'download' = ANY(permissions)`);
  // What visitors did through a link: the activity log, the per-link quota,
  // "my uploads" of upload-only visitors and batched owner notices.
  await query(`
    CREATE TABLE IF NOT EXISTS fs_link_events (
      id BIGSERIAL PRIMARY KEY,
      link_id INTEGER REFERENCES fs_links(id) ON DELETE SET NULL,
      link_title VARCHAR(255),
      node_id INTEGER REFERENCES fs_nodes(id) ON DELETE SET NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(12) NOT NULL,
      name VARCHAR(255),
      bytes BIGINT NOT NULL DEFAULT 0,
      session_id VARCHAR(40),
      visitor_name VARCHAR(120),
      visitor_email VARCHAR(160),
      ip VARCHAR(64),
      notified BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // The name an upload-only visitor sent, when the stored one differs ("x (2).pdf"): shown back to them only.
  await query(`ALTER TABLE fs_link_events ADD COLUMN IF NOT EXISTS sent_name VARCHAR(255)`);
  await query(`CREATE INDEX IF NOT EXISTS fs_link_events_link_idx ON fs_link_events (link_id, session_id)`);
  await query(`CREATE INDEX IF NOT EXISTS fs_link_events_node_idx ON fs_link_events (node_id) WHERE node_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS fs_link_events_pending_idx ON fs_link_events (created_at) WHERE notified = FALSE`);

  registerJob({ name: 'files:trash', everyMs: 6 * 60 * 60 * 1000, run: purgeTrash });
  // One notice per visitor burst on links with "notify me" (see links.js).
  registerJob({ name: 'files:link-notices', everyMs: 60 * 1000, run: () => flushLinkNotices() });
  // Cached PDF previews, drive thumbnails and drawings (Files, Knowledge base, Drive)
  // unused for 30 days; they are made again on the next view.
  registerJob({
    name: 'storage:previews',
    everyMs: 24 * 60 * 60 * 1000,
    timeoutMs: 30 * 60 * 1000,
    run: async () => {
      const removed = await prunePreviewCaches();
      if (removed) console.log(`Preview caches: ${removed} unused file(s) removed`);
    },
  });
  onBeforeUserDelete(beforeUserDelete);
}

/**
 * Older installs created fs_nodes.owner_id with ON DELETE CASCADE, so deleting
 * a person deleted every folder they had made in shared spaces (with other
 * people's files inside). Swap it for ON DELETE SET NULL once: drop and add in
 * one short transaction (NOT VALID, so no table scan under the lock), then
 * validate without blocking writers. Idempotent; a busy table just retries on
 * the next start.
 */
async function ownerSetNull() {
  const { rows } = await query(
    `SELECT c.conname, c.confdeltype, c.convalidated FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.conrelid = 'fs_nodes'::regclass AND c.contype = 'f' AND c.confrelid = 'users'::regclass
       AND array_length(c.conkey, 1) = 1 AND a.attname = 'owner_id'`
  );
  if (rows.length === 1 && rows[0].confdeltype === 'n') {
    if (!rows[0].convalidated) await query(`ALTER TABLE fs_nodes VALIDATE CONSTRAINT "${rows[0].conname.replace(/"/g, '""')}"`).catch(() => {});
    return;
  }
  try {
    await withTransaction(async (client) => {
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      for (const row of rows) await client.query(`ALTER TABLE fs_nodes DROP CONSTRAINT "${row.conname.replace(/"/g, '""')}"`);
      await client.query(
        `ALTER TABLE fs_nodes ADD CONSTRAINT fs_nodes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID`
      );
    });
    await query(`ALTER TABLE fs_nodes VALIDATE CONSTRAINT fs_nodes_owner_id_fkey`);
    console.log('Files: fs_nodes.owner_id now ON DELETE SET NULL');
  } catch (err) {
    console.warn('Files: could not change fs_nodes.owner_id to ON DELETE SET NULL (will retry on next start):', err.message);
  }
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
