import { query } from '../../config/database.js';
import { ensureAclTable } from '../shared/acl.js';

/*
 * Remote access & assistance (docs/specs/remote-access.ru.md).
 *
 *   remote_hosts      computers reachable for remote control: name, address,
 *                     protocol (rdp|vnc), port, source (manual|ad), AD DN, the
 *                     employee the machine belongs to, whether it is in the
 *                     monitoring scope
 *   remote_host_acl   who may connect to a host (portal ACL: users/groups/roles)
 *   remote_sessions   the audit trail: every connection, its mode, whether the
 *                     operator took control, the employee's consent and how long
 *                     it lasted. Written for EVERY connection — transparency.
 */

export async function ensureRemoteSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS remote_hosts (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      address VARCHAR(255) NOT NULL,
      protocol VARCHAR(4) NOT NULL DEFAULT 'rdp',
      port INTEGER NOT NULL DEFAULT 3389,
      source VARCHAR(8) NOT NULL DEFAULT 'manual',
      ad_dn TEXT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      monitored BOOLEAN NOT NULL DEFAULT FALSE,
      note VARCHAR(300) NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS remote_hosts_address_idx ON remote_hosts (LOWER(address), port)`);
  // kind: 'workstation' (a person's machine — owner is notified) or 'server' (infrastructure,
  // no person behind it — a plain admin connection). Credentials are sealed (services/crypto).
  await query(`ALTER TABLE remote_hosts ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'workstation'`);
  await query(`ALTER TABLE remote_hosts ADD COLUMN IF NOT EXISTS cred_username VARCHAR(120)`);
  await query(`ALTER TABLE remote_hosts ADD COLUMN IF NOT EXISTS cred_domain VARCHAR(120)`);
  await query(`ALTER TABLE remote_hosts ADD COLUMN IF NOT EXISTS cred_password TEXT`);
  await ensureAclTable('remote_host_acl', 'remote_hosts');
  await query(`
    CREATE TABLE IF NOT EXISTS remote_sessions (
      id SERIAL PRIMARY KEY,
      host_id INTEGER REFERENCES remote_hosts(id) ON DELETE SET NULL,
      host_name VARCHAR(120) NOT NULL,
      operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      watched_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      mode VARCHAR(8) NOT NULL DEFAULT 'assist',
      control BOOLEAN NOT NULL DEFAULT FALSE,
      consent VARCHAR(12) NOT NULL DEFAULT 'announced',
      recorded BOOLEAN NOT NULL DEFAULT FALSE,
      recording_path TEXT,
      note VARCHAR(300) NOT NULL DEFAULT '',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS remote_sessions_host_idx ON remote_sessions (host_id, started_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS remote_sessions_watched_idx ON remote_sessions (watched_user_id, started_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS remote_sessions_operator_idx ON remote_sessions (operator_id, started_at DESC)`);

  /*
   * RemoteApp: a single published Windows application launched instead of the
   * whole desktop (RAIL). `alias` is «||<name>» for an RDS-published app, or a
   * full path to an executable (the registry/allow-list variant).
   */
  await query(`
    CREATE TABLE IF NOT EXISTS remote_apps (
      id SERIAL PRIMARY KEY,
      host_id INTEGER NOT NULL REFERENCES remote_hosts(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      alias VARCHAR(255) NOT NULL,
      args VARCHAR(500) NOT NULL DEFAULT '',
      work_dir VARCHAR(300) NOT NULL DEFAULT '',
      icon VARCHAR(40) NOT NULL DEFAULT 'app',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS remote_apps_host_idx ON remote_apps (host_id, sort)`);

  /*
   * Password manager (portal credential store). A credential is either personal
   * (owner_id set — only its owner may use it) or shared (owner_id NULL — any
   * operator with remote access). The password is sealed (services/crypto).
   */
  await query(`
    CREATE TABLE IF NOT EXISTS remote_credentials (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      username VARCHAR(160) NOT NULL DEFAULT '',
      domain VARCHAR(120) NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS remote_credentials_owner_idx ON remote_credentials (owner_id)`);

  // A host's preferred credential source: 'host' | 'vault:<id>' | 'passbolt:<resId>' | '' (ask each time).
  await query(`ALTER TABLE remote_hosts ADD COLUMN IF NOT EXISTS default_cred VARCHAR(80) NOT NULL DEFAULT ''`);

  /*
   * Passbolt integration: each person connects their own Passbolt (GPGAuth with
   * their private key). URL, armored private key and passphrase are sealed.
   */
  await query(`
    CREATE TABLE IF NOT EXISTS remote_passbolt (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      url VARCHAR(255) NOT NULL,
      fingerprint VARCHAR(80) NOT NULL DEFAULT '',
      private_key TEXT NOT NULL,
      passphrase TEXT NOT NULL DEFAULT '',
      verified_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
