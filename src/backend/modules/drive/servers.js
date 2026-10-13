import { query, withTransaction } from '../../config/database.js';
import { seal } from '../../services/crypto.js';
import { HEX, clean, httpError, intId } from '../shared/acl.js';
import { credentialFor, directoryDomain, serverParams } from './credentials.js';
import { gateCall } from './gate.js';
import { cleanPath } from './paths.js';

/*
 * Administration of file servers and the folders ("shares") people see.
 * A share entry points at \\host\share\optional\sub\path and has its own
 * title, colour and description; together they form the network drive.
 */

const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$|^\[?[0-9a-f:]+\]?$/i;
const SHARE = /^[^\\/:*?"<>|\u0000-\u001f]{1,80}$/;

export function shareShape(row) {
  return {
    id: row.id,
    serverId: row.server_id,
    title: row.title,
    share: row.share,
    rootPath: row.root_path,
    description: row.description || '',
    color: row.color,
    uncDisplay: row.unc_display || '',
    groupIds: row.group_ids || [],
    allowLinks: row.allow_links,
    sort: row.sort,
  };
}

export function serverShape(row) {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    domain: row.domain || '',
    auth: row.auth,
    useLogin: row.use_login,
    serviceUser: row.service_user || '',
    hasServiceSecret: Boolean(row.service_secret),
    encrypt: row.encrypt,
    sort: row.sort,
  };
}

export async function loadServers() {
  const { rows } = await query(`SELECT * FROM drive_servers ORDER BY sort, id`);
  return rows;
}

export async function loadServer(id) {
  const { rows } = await query(`SELECT * FROM drive_servers WHERE id = $1`, [intId(id)]);
  if (!rows[0]) throw httpError(404, 'Server not found', 'NOT_FOUND');
  return rows[0];
}

export async function loadShares() {
  const { rows } = await query(
    `SELECT sh.* FROM drive_shares sh JOIN drive_servers s ON s.id = sh.server_id ORDER BY sh.sort, sh.id`
  );
  return rows;
}

export async function adminOverview() {
  const [servers, shares] = await Promise.all([loadServers(), loadShares()]);
  return {
    servers: servers.map((server) => ({
      ...serverShape(server),
      shares: shares.filter((share) => share.server_id === server.id).map(shareShape),
    })),
    defaultDomain: await directoryDomain(),
  };
}

/** True when an edit points an existing server at another machine (host or port). */
export function endpointChanged(current, host, port) {
  if (!current?.id) return false;
  return String(current.host || '').toLowerCase() !== String(host || '').toLowerCase() || Number(current.port || 445) !== Number(port || 445);
}

/**
 * Validated server fields. Saved secrets belong to the machine they were
 * entered for: when the host or port changes, the stored service password is
 * not carried over (the administrator types it again), so it is never sent to
 * a different machine.
 */
export function serverInput(input, current = {}, { requireSecret = true } = {}) {
  const name = clean(input.name ?? current.name, 120);
  const host = String(input.host ?? current.host ?? '').trim().replace(/^\\+|\\+$/g, '').slice(0, 255);
  if (!name) throw httpError(400, 'Enter a name', 'NAME_REQUIRED');
  if (!HOST.test(host)) throw httpError(400, 'Enter a host name or IP address', 'INVALID_HOST');
  const port = Number(input.port ?? current.port ?? 445);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw httpError(400, 'Invalid port', 'INVALID_PORT');
  const auth = ['user', 'service'].includes(input.auth) ? input.auth : current.auth || 'user';
  const serviceUser = clean(input.serviceUser ?? current.service_user ?? '', 255) || null;
  if (auth === 'service' && !serviceUser) throw httpError(400, 'Enter the service account', 'SERVICE_REQUIRED');
  const moved = endpointChanged(current, host, port);
  let secret = moved ? null : current.service_secret || null;
  if (typeof input.servicePassword === 'string' && input.servicePassword) secret = seal(input.servicePassword);
  if (auth === 'service' && !secret && requireSecret) throw httpError(400, 'Enter the service account password', 'SERVICE_REQUIRED');
  return {
    name,
    host,
    port,
    domain: clean(input.domain ?? current.domain ?? '', 120) || null,
    auth,
    useLogin: typeof input.useLogin === 'boolean' ? input.useLogin : current.use_login ?? true,
    serviceUser,
    secret: auth === 'service' ? secret : null,
    encrypt: typeof input.encrypt === 'boolean' ? input.encrypt : current.encrypt ?? false,
    moved,
  };
}

export async function saveServer(input = {}, id = null) {
  const current = id ? await loadServer(id) : {};
  const value = serverInput(input, current);
  const params = [value.name, value.host, value.port, value.domain, value.auth, value.useLogin, value.serviceUser, value.secret, value.encrypt];
  const { rows } = id
    ? await withTransaction(async (client) => {
        const result = await client.query(
          `UPDATE drive_servers SET name = $1, host = $2, port = $3, domain = $4, auth = $5, use_login = $6,
             service_user = $7, service_secret = $8, encrypt = $9, updated_at = NOW() WHERE id = $10 RETURNING *`,
          [...params, current.id]
        );
        // Accounts people saved for this server ("Connect as…") were meant for the old machine.
        if (value.moved) await client.query(`DELETE FROM drive_credentials WHERE server_id = $1`, [current.id]);
        return result;
      })
    : await query(
        `INSERT INTO drive_servers (name, host, port, domain, auth, use_login, service_user, service_secret, encrypt, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT COALESCE(MAX(sort), 0) + 1 FROM drive_servers)) RETURNING *`,
        params
      );
  return serverShape(rows[0]);
}

export async function deleteServer(id) {
  const server = await loadServer(id);
  await query(`DELETE FROM drive_servers WHERE id = $1`, [server.id]);
}

function shareInput(input, current = {}) {
  const title = clean(input.title ?? current.title, 120);
  const share = String(input.share ?? current.share ?? '').trim().replace(/^[\\/]+|[\\/]+$/g, '');
  if (!title) throw httpError(400, 'Enter a name', 'NAME_REQUIRED');
  if (!SHARE.test(share)) throw httpError(400, 'Choose or enter a share', 'INVALID_SHARE');
  const groupIds = Array.isArray(input.groupIds)
    ? [...new Set(input.groupIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100)
    : current.group_ids || [];
  return {
    title,
    share,
    rootPath: cleanPath(input.rootPath ?? current.root_path ?? ''),
    description: clean(input.description ?? current.description ?? '', 500) || null,
    color: HEX.test(input.color || '') ? input.color.toUpperCase() : current.color || '#2563EB',
    uncDisplay: clean(input.uncDisplay ?? current.unc_display ?? '', 400) || null,
    groupIds,
    allowLinks: typeof input.allowLinks === 'boolean' ? input.allowLinks : current.allow_links ?? true,
  };
}

export async function saveShare(serverId, input = {}, id = null) {
  const server = await loadServer(serverId);
  let current = {};
  if (id) {
    const { rows } = await query(`SELECT * FROM drive_shares WHERE id = $1 AND server_id = $2`, [intId(id), server.id]);
    if (!rows[0]) throw httpError(404, 'Folder not found', 'NOT_FOUND');
    current = rows[0];
  }
  const v = shareInput(input, current);
  const params = [v.title, v.share, v.rootPath, v.description, v.color, v.uncDisplay, v.groupIds, v.allowLinks];
  const { rows } = id
    ? await query(
        `UPDATE drive_shares SET title = $1, share = $2, root_path = $3, description = $4, color = $5, unc_display = $6,
           group_ids = $7, allow_links = $8, updated_at = NOW() WHERE id = $9 RETURNING *`,
        [...params, current.id]
      )
    : await query(
        `INSERT INTO drive_shares (title, share, root_path, description, color, unc_display, group_ids, allow_links, server_id, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT COALESCE(MAX(sort), 0) + 1 FROM drive_shares)) RETURNING *`,
        [...params, server.id]
      );
  return shareShape(rows[0]);
}

export async function deleteShare(id) {
  const { rowCount } = await query(`DELETE FROM drive_shares WHERE id = $1`, [intId(id)]);
  if (!rowCount) throw httpError(404, 'Folder not found', 'NOT_FOUND');
}

/** New order of the folders on the drive: `ids` top to bottom. */
export async function reorderShares(ids = []) {
  const list = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  await withTransaction(async (client) => {
    for (const [index, id] of list.entries()) {
      await client.query(`UPDATE drive_shares SET sort = $1 WHERE id = $2`, [index + 1, id]);
    }
  });
}

/**
 * "Test connection" / "Browse shares" for an administrator: with the account
 * typed into the dialog, else the service account, else the admin's own.
 */
export async function testServer(adminId, input = {}) {
  const base = input.id ? await loadServer(input.id) : {};
  const typed = Boolean(input.username && input.password);
  const draft = serverInput({ ...input, name: input.name || base.name || 'test' }, base, { requireSecret: !typed });
  // Another host or port is tested like a new server: no secrets saved for the
  // old one (service password, the administrator's "Connect as…") go there.
  const server = { ...base, ...draft, id: draft.moved ? 0 : base.id || 0, use_login: draft.useLogin, service_user: draft.serviceUser, service_secret: draft.secret };
  let cred;
  if (typed) {
    cred = { username: String(input.username), password: String(input.password), domain: draft.domain || (await directoryDomain()) };
  } else {
    cred = (await credentialFor(adminId, server)).cred;
  }
  const started = Date.now();
  await gateCall('auth', { server: serverParams(server), cred });
  let shares = [];
  let sharesError = null;
  try {
    shares = (await gateCall('shares', { server: serverParams(server), cred })).shares.filter((share) => share.disk);
  } catch (err) {
    sharesError = err.code || 'SMB_ERROR';
  }
  return { ok: true, ms: Date.now() - started, account: cred.username, shares, sharesError };
}
