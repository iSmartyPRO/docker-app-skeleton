import { query } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';
import { onDirectoryCredential, onDirectorySignIn } from '../../services/hooks.js';
import { cleanupCredentials, rememberLoginCredential, storeDirectoryCredential } from './credentials.js';
import { pruneActivity } from './activity.js';
import { ensureSlugSchema } from '../shared/linkSlug.js';
import { ensureJournalTable } from './access/journal.js';
import { migrateFolderAccess } from './access/migrate.js';

/*
 * Drive: the company's file servers (SMB) as one network drive.
 *
 *   drive_servers      a Windows / Samba server: host, domain, how people sign in
 *   drive_shares       a folder people see: a share (and optional sub-path) on a server
 *   drive_credentials  per-user credentials, sealed: the AD sign-in password
 *                      (server_id NULL) or credentials a user entered for a server
 *   drive_links        public links; they act with their author's credentials
 *   drive_recent / drive_favorites   per-user shortcuts
 *   drive_activity     who did what (activity log, read with drive.audit)
 *   drive_access_journal  changes made in «Доступ» (AD groups, NTFS; access/journal.js)
 *
 * Access to content is decided by the file server (share permissions and NTFS
 * ACLs, i.e. Active Directory security groups); the portal only chooses which
 * folders a person sees.
 */

export async function ensureDriveSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS drive_servers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL DEFAULT 445,
      domain VARCHAR(120),
      auth VARCHAR(12) NOT NULL DEFAULT 'user',
      use_login BOOLEAN NOT NULL DEFAULT TRUE,
      service_user VARCHAR(255),
      service_secret TEXT,
      encrypt BOOLEAN NOT NULL DEFAULT FALSE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS drive_shares (
      id SERIAL PRIMARY KEY,
      server_id INTEGER NOT NULL REFERENCES drive_servers(id) ON DELETE CASCADE,
      title VARCHAR(120) NOT NULL,
      share VARCHAR(255) NOT NULL,
      root_path TEXT NOT NULL DEFAULT '',
      description TEXT,
      color VARCHAR(7) NOT NULL DEFAULT '#2563EB',
      unc_display TEXT,
      group_ids INTEGER[] NOT NULL DEFAULT '{}',
      allow_links BOOLEAN NOT NULL DEFAULT TRUE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS drive_credentials (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER REFERENCES drive_servers(id) ON DELETE CASCADE,
      username VARCHAR(255) NOT NULL,
      domain VARCHAR(120),
      secret TEXT NOT NULL,
      source VARCHAR(8) NOT NULL DEFAULT 'manual',
      status VARCHAR(24) NOT NULL DEFAULT 'ok',
      verified_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS drive_credentials_uidx ON drive_credentials (user_id, COALESCE(server_id, 0))`);
  await query(`
    CREATE TABLE IF NOT EXISTS drive_links (
      id SERIAL PRIMARY KEY,
      token VARCHAR(40) NOT NULL UNIQUE,
      share_id INTEGER NOT NULL REFERENCES drive_shares(id) ON DELETE CASCADE,
      path TEXT NOT NULL DEFAULT '',
      kind VARCHAR(8) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      audience VARCHAR(12) NOT NULL DEFAULT 'anyone',
      password_hash TEXT,
      expires_at TIMESTAMPTZ,
      allow_download BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1,
      view_count INTEGER NOT NULL DEFAULT 0,
      last_viewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS drive_links_owner_idx ON drive_links (created_by)`);
  // What visitors may do (see linkPerms.js). Links made before this keep
  // exactly what they had: view, plus download when it was allowed.
  await query(`
    ALTER TABLE drive_links
      ADD COLUMN IF NOT EXISTS permissions TEXT[],
      ADD COLUMN IF NOT EXISTS title VARCHAR(120),
      ADD COLUMN IF NOT EXISTS note VARCHAR(500),
      ADD COLUMN IF NOT EXISTS max_file_mb INTEGER,
      ADD COLUMN IF NOT EXISTS allowed_exts TEXT[],
      ADD COLUMN IF NOT EXISTS quota_mb INTEGER,
      ADD COLUMN IF NOT EXISTS uploaded_bytes BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS require_name BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS require_email BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS notify BOOLEAN NOT NULL DEFAULT FALSE
  `);
  // Custom addresses /d/<slug> (shared/linkSlug.js).
  await ensureSlugSchema('drive');
  await query(`UPDATE drive_links SET permissions = CASE WHEN allow_download THEN '{view,download}'::text[] ELSE '{view}'::text[] END WHERE permissions IS NULL`);
  // Files visitors uploaded through a link: their "my uploads" list (per
  // browser session) and the author's overview.
  await query(`
    CREATE TABLE IF NOT EXISTS drive_link_uploads (
      id BIGSERIAL PRIMARY KEY,
      link_id INTEGER NOT NULL REFERENCES drive_links(id) ON DELETE CASCADE,
      session_id VARCHAR(40) NOT NULL,
      path TEXT NOT NULL,
      name VARCHAR(255) NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      visitor_name VARCHAR(80),
      visitor_email VARCHAR(254),
      ip VARCHAR(64),
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS drive_link_uploads_session_idx ON drive_link_uploads (link_id, session_id, at DESC)`);
  for (const table of ['drive_recent', 'drive_favorites']) {
    await query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        share_id INTEGER NOT NULL REFERENCES drive_shares(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_dir BOOLEAN NOT NULL DEFAULT FALSE,
        size BIGINT NOT NULL DEFAULT 0,
        at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, share_id, path)
      )
    `);
  }

  // Snapshots of names and titles keep rows readable after users or folders are removed.
  await query(`
    CREATE TABLE IF NOT EXISTS drive_activity (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name VARCHAR(255),
      user_login VARCHAR(255),
      action VARCHAR(32) NOT NULL,
      via VARCHAR(8) NOT NULL DEFAULT 'portal',
      share_id INTEGER,
      share_title VARCHAR(120),
      path TEXT NOT NULL DEFAULT '',
      to_share_id INTEGER,
      to_path TEXT,
      is_dir BOOLEAN,
      size BIGINT,
      item_count INTEGER,
      ok BOOLEAN NOT NULL DEFAULT TRUE,
      error_code VARCHAR(40),
      ip VARCHAR(64),
      user_agent VARCHAR(300),
      link_id INTEGER,
      details JSONB
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS drive_activity_at_idx ON drive_activity (at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS drive_activity_user_idx ON drive_activity (user_id, at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS drive_activity_share_idx ON drive_activity (share_id, at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS drive_activity_action_idx ON drive_activity (action, at DESC)`);

  // Online editor: opaque WOPI file ids for files on a folder entry. The id
  // stands for (entry, path); Collabora only ever sees the id, never a path.
  await query(`
    CREATE TABLE IF NOT EXISTS drive_office_files (
      id VARCHAR(32) PRIMARY KEY,
      share_id INTEGER NOT NULL REFERENCES drive_shares(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      path_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (share_id, path_key)
    )
  `);

  // «Доступ»: how people write this folder's path in AD group descriptions ("G:\ОБЪЕКТ-2\_DocArch", "W:").
  await query(`ALTER TABLE drive_shares ADD COLUMN IF NOT EXISTS path_prefixes TEXT[] NOT NULL DEFAULT '{}'`);
  // The former «Доступ к папкам» module: journal, settings and permission move here (idempotent).
  await migrateFolderAccess();
  await ensureJournalTable();

  onDirectorySignIn(rememberLoginCredential);
  onDirectoryCredential(storeDirectoryCredential);
  registerJob({ name: 'drive:activity', everyMs: 24 * 60 * 60 * 1000, run: pruneActivity });
  registerJob({ name: 'drive:credentials', everyMs: 60 * 60 * 1000, run: cleanupCredentials });
}
