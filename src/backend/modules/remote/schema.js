import { withTransaction } from '../../config/database.js';
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

/**
 * Migration 001 (index.js `migrations`, docs/module-packages.md «Migrations»): the schema Remote access
 * had while built into the core — CREATE … IF NOT EXISTS / ADD COLUMN IF NOT EXISTS and the one-time
 * apps move, all idempotent — so on a portal that already has the remote_* tables it changes nothing
 * (hosts, journal, credentials, gateways and the Portal VNC identity stay). Everything goes through
 * `db` (the migration's transaction).
 */
export async function createRemoteSchema(db) {
  const query = (text, params) => db.query(text, params);
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
  await ensureAclTable('remote_host_acl', 'remote_hosts', db);
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
  // RD Gateway (RDWeb / TS Gateway): the HTTPS entry point in front of an RDS farm.
  // Gateway credentials reuse the session credentials (credssource:0, the common case).
  await query(`ALTER TABLE remote_hosts ADD COLUMN IF NOT EXISTS gateway_host VARCHAR(255) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE remote_hosts ADD COLUMN IF NOT EXISTS gateway_port INTEGER NOT NULL DEFAULT 443`);
  await query(`ALTER TABLE remote_hosts ADD COLUMN IF NOT EXISTS gateway_domain VARCHAR(120) NOT NULL DEFAULT ''`);
  // RemoteApp load-balance-info routes the RDS Connection Broker to the right collection.
  await query(`ALTER TABLE remote_apps ADD COLUMN IF NOT EXISTS load_balance_info VARCHAR(512) NOT NULL DEFAULT ''`);

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

  /*
   * Folders: a tree to organise computers and applications (by site / office /
   * role). A connection with folder_id NULL is in the general list.
   */
  await query(`
    CREATE TABLE IF NOT EXISTS remote_folders (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      parent_id INTEGER REFERENCES remote_folders(id) ON DELETE CASCADE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /*
   * RD Gateways: named, reusable HTTPS entry points in front of RDS farms.
   * An application points at one (its own or a shared one); computers never use
   * a gateway (they are direct RDP/VNC).
   */
  await query(`
    CREATE TABLE IF NOT EXISTS remote_gateways (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL DEFAULT 443,
      domain VARCHAR(120) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS remote_gateways_host_idx ON remote_gateways (LOWER(host), port)`);

  await query(`ALTER TABLE remote_hosts ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES remote_folders(id) ON DELETE SET NULL`);

  // Applications become self-contained connections: their own target, gateway,
  // folder and credentials (no longer children of a server host).
  await query(`ALTER TABLE remote_apps ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES remote_folders(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE remote_apps ADD COLUMN IF NOT EXISTS address VARCHAR(255) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE remote_apps ADD COLUMN IF NOT EXISTS port INTEGER NOT NULL DEFAULT 3389`);
  await query(`ALTER TABLE remote_apps ADD COLUMN IF NOT EXISTS gateway_id INTEGER REFERENCES remote_gateways(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE remote_apps ADD COLUMN IF NOT EXISTS default_cred VARCHAR(80) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE remote_apps ADD COLUMN IF NOT EXISTS cred_username VARCHAR(160)`);
  await query(`ALTER TABLE remote_apps ADD COLUMN IF NOT EXISTS cred_domain VARCHAR(120)`);
  await query(`ALTER TABLE remote_apps ADD COLUMN IF NOT EXISTS cred_password TEXT`);
  await query(`ALTER TABLE remote_apps ALTER COLUMN host_id DROP NOT NULL`);

  /*
   * Portal VNC: the portal's own client identity for mutual-TLS to PortalVNC
   * agents. A single row (id = 1). The CA and client certificate are public
   * PEM; the client private key is sealed (services/crypto).
   */
  await query(`
    CREATE TABLE IF NOT EXISTS remote_pvnc (
      id INTEGER PRIMARY KEY DEFAULT 1,
      ca_cert TEXT NOT NULL DEFAULT '',
      client_cert TEXT NOT NULL DEFAULT '',
      client_key TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT remote_pvnc_singleton CHECK (id = 1)
    )
  `);

  await migrateAppsToIndependent(db);
}

/** The schema outside a package install (tests, scripts): migration 001 in its own transaction. */
export async function ensureRemoteSchema() {
  await withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('module-migrations:remote'))`);
    await createRemoteSchema({ query: (text, params) => client.query(text, params) });
  });
}

/*
 * One-time, idempotent: move apps that still depend on a server host to the
 * self-contained model — copy the host's address/port/credentials/default
 * source into the app, and turn the host's RD Gateway into a named gateway the
 * app points at. Runs only for apps that have no own address yet.
 */
async function migrateAppsToIndependent(db) {
  const query = (text, params) => db.query(text, params);
  const { rows } = await query(
    `SELECT a.id AS app_id, h.address, h.port, h.gateway_host, h.gateway_port, h.gateway_domain,
            h.cred_username, h.cred_domain, h.cred_password, h.default_cred, h.folder_id, h.name AS host_name
       FROM remote_apps a JOIN remote_hosts h ON h.id = a.host_id
      WHERE COALESCE(a.address, '') = ''`
  );
  for (const row of rows) {
    let gatewayId = null;
    if (row.gateway_host) {
      const { rows: gw } = await query(
        `INSERT INTO remote_gateways (name, host, port, domain) VALUES ($1,$2,$3,$4)
         ON CONFLICT (LOWER(host), port) DO UPDATE SET host = EXCLUDED.host RETURNING id`,
        [row.gateway_host, row.gateway_host, row.gateway_port || 443, row.gateway_domain || '']
      );
      gatewayId = gw[0].id;
    }
    await query(
      `UPDATE remote_apps SET address=$1, port=$2, gateway_id=$3, cred_username=$4, cred_domain=$5, cred_password=$6, default_cred=$7, folder_id=$8 WHERE id=$9`,
      [row.address, row.port, gatewayId, row.cred_username, row.cred_domain, row.cred_password, row.default_cred || '', row.folder_id, row.app_id]
    );
  }
}
