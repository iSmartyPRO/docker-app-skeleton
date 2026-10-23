import net from 'net';
import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { seal, unseal } from '../../services/secrets.js';
import { contextFromRequest, httpError, intId } from '../shared/acl.js';
import { buildToken, connectionFor, parseRdp, TUNNEL_PATH } from './tunnel.js';
import { buildPvncToken, PVNC_PATH } from './pvncTunnel.js';
import { pvncConfigured } from './pvnc.js';
import { resolveVault } from './credentials.js';
import { resolvePassbolt } from './passbolt.js';

/*
 * Remote access & assistance. Transparency is enforced here, not left to the
 * UI: startSession() ALWAYS writes an audit row and ALWAYS notifies the
 * watched employee. There is no covert path and no setting to disable either.
 */

const PROTOCOLS = { rdp: 3389, vnc: 5900, pvnc: 7654 };
const MODES = ['assist', 'monitor'];

/** A quick TCP reachability check from the portal (same network as guacd). */
export function tcpProbe(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    const done = (ok, reason) => {
      socket.destroy();
      resolve({ ok, reason: reason || '', ms: Date.now() - started });
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false, 'timeout'));
    socket.once('error', (err) => done(false, err.code === 'ECONNREFUSED' ? 'refused' : err.code || 'error'));
    socket.connect(Number(port), String(host));
  });
}
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export function remoteContext(req) {
  const ctx = contextFromRequest(req, 'remote.admin');
  const perms = req.access?.permissions || [];
  ctx.canConnect = ctx.isAdmin || perms.includes('remote.connect');
  ctx.canMonitor = ctx.isAdmin || perms.includes('remote.monitor');
  return ctx;
}

export function requireAdmin(ctx) {
  if (!ctx.isAdmin) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
}

export async function remoteSettings() {
  const parsed = parseSettings(await getSettings());
  return parsed.modules.remote?.settings || {};
}

function hostShape(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    protocol: row.protocol,
    port: row.port,
    kind: row.kind || 'workstation',
    source: row.source,
    adDn: row.ad_dn,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || null,
    monitored: row.monitored,
    note: row.note,
    active: row.active,
    // The password itself is never sent out, only whether one is stored.
    credUsername: row.cred_username || '',
    credDomain: row.cred_domain || '',
    hasCredentials: Boolean(row.cred_password),
    defaultCred: row.default_cred || '',
    folderId: row.folder_id || null,
  };
}

function appShape(row) {
  return {
    id: row.id,
    name: row.name,
    alias: row.alias,
    address: row.address || '',
    port: row.port || 3389,
    gatewayId: row.gateway_id || null,
    gatewayName: row.gateway_name || null,
    folderId: row.folder_id || null,
    args: row.args || '',
    workDir: row.work_dir || '',
    loadBalanceInfo: row.load_balance_info || '',
    icon: row.icon || 'app',
    active: row.active,
    sort: row.sort,
    credUsername: row.cred_username || '',
    credDomain: row.cred_domain || '',
    hasCredentials: Boolean(row.cred_password),
    defaultCred: row.default_cred || '',
  };
}

function sessionShape(row) {
  return {
    id: row.id,
    hostId: row.host_id,
    hostName: row.host_name,
    operatorId: row.operator_id,
    operatorName: row.operator_name || null,
    watchedUserId: row.watched_user_id,
    watchedName: row.watched_name || null,
    mode: row.mode,
    control: row.control,
    consent: row.consent,
    recorded: row.recorded,
    note: row.note,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

/* ── Hosts ─────────────────────────────────────────────────────────────── */

export async function listHosts(ctx) {
  // Everyone with remote.view sees the catalogue; the ACL narrows who may connect (checked at start).
  const { rows } = await query(
    `SELECT h.*, COALESCE(u.display_name, u.username) AS owner_name
       FROM remote_hosts h LEFT JOIN users u ON u.id = h.owner_user_id
      WHERE h.active ORDER BY LOWER(h.name)`
  );
  return rows.map(hostShape);
}

async function hostById(id) {
  const { rows } = await query(
    `SELECT h.*, COALESCE(u.display_name, u.username) AS owner_name
       FROM remote_hosts h LEFT JOIN users u ON u.id = h.owner_user_id WHERE h.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function saveHost(ctx, input = {}, id = null) {
  requireAdmin(ctx);
  const current = id ? await hostById(intId(id)) : null;
  if (id && !current) throw httpError(404, 'Computer not found', 'NOT_FOUND');
  const name = text(input.name ?? current?.name, 120);
  const address = text(input.address ?? current?.address, 255);
  if (!name || !address) throw httpError(400, 'Name and address are required', 'NAME_REQUIRED');
  const protocol = PROTOCOLS[input.protocol] ? input.protocol : current?.protocol || 'rdp';
  const port = Number.isInteger(Number(input.port)) ? Math.min(65535, Math.max(1, Number(input.port))) : current?.port || PROTOCOLS[protocol];
  const kind = ['workstation', 'server'].includes(input.kind) ? input.kind : current?.kind || 'workstation';
  // A server has no person behind it, so it is never a monitoring target.
  const monitored = kind === 'server' ? false : input.monitored === undefined ? current?.monitored ?? false : Boolean(input.monitored);
  const ownerId = kind === 'server' ? null : input.ownerUserId === undefined ? current?.owner_user_id ?? null : input.ownerUserId ? intId(input.ownerUserId) : null;
  // Credentials: username/domain are plain, the password is sealed and write-only
  // ('' clears it, undefined keeps the stored one).
  const credUsername = input.credUsername === undefined ? current?.cred_username ?? null : text(input.credUsername, 120) || null;
  const credDomain = input.credDomain === undefined ? current?.cred_domain ?? null : text(input.credDomain, 120) || null;
  const credPassword =
    input.credPassword === undefined ? current?.cred_password ?? null : input.credPassword ? seal(String(input.credPassword)) : null;
  const defaultCred = input.defaultCred === undefined ? current?.default_cred ?? '' : String(input.defaultCred || '').replace(/[^a-z0-9:_-]/gi, '').slice(0, 80);
  const folderId = input.folderId === undefined ? current?.folder_id ?? null : input.folderId ? intId(input.folderId) : null;
  const values = [name, address, protocol, port, kind, ownerId, monitored, text(input.note ?? current?.note, 300), input.active === undefined ? current?.active ?? true : Boolean(input.active), credUsername, credDomain, credPassword, defaultCred, folderId];
  let row;
  try {
    if (current) {
      ({ rows: [row] } = await query(
        `UPDATE remote_hosts SET name=$1, address=$2, protocol=$3, port=$4, kind=$5, owner_user_id=$6, monitored=$7, note=$8, active=$9, cred_username=$10, cred_domain=$11, cred_password=$12, default_cred=$13, folder_id=$14, updated_at=NOW()
         WHERE id=$15 RETURNING *`,
        [...values, current.id]
      ));
    } else {
      ({ rows: [row] } = await query(
        `INSERT INTO remote_hosts (name, address, protocol, port, kind, owner_user_id, monitored, note, active, cred_username, cred_domain, cred_password, default_cred, folder_id, source, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'manual',$15) RETURNING *`,
        [...values, ctx.userId]
      ));
    }
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'A computer with this address and port already exists', 'HOST_EXISTS');
    throw err;
  }
  return hostShape(await hostById(row.id));
}

export async function deleteHost(ctx, id) {
  requireAdmin(ctx);
  const { rowCount } = await query(`DELETE FROM remote_hosts WHERE id = $1`, [intId(id)]);
  if (!rowCount) throw httpError(404, 'Computer not found', 'NOT_FOUND');
}

/* ── Folders ────────────────────────────────────────────────────────────── */

const folderText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

export async function listFolders() {
  const { rows } = await query(`SELECT * FROM remote_folders ORDER BY sort, LOWER(name)`);
  return rows.map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id }));
}

export async function saveFolder(ctx, input = {}, id = null) {
  requireAdmin(ctx);
  const name = folderText(input.name, 120);
  if (!name) throw httpError(400, 'Name is required', 'NAME_REQUIRED');
  const parentId = input.parentId ? intId(input.parentId) : null;
  let row;
  if (id) {
    ({ rows: [row] } = await query(`UPDATE remote_folders SET name=$1, parent_id=$2 WHERE id=$3 RETURNING *`, [name, parentId, intId(id)]));
    if (!row) throw httpError(404, 'Folder not found', 'NOT_FOUND');
  } else {
    ({ rows: [row] } = await query(`INSERT INTO remote_folders (name, parent_id, sort) VALUES ($1,$2,(SELECT COALESCE(MAX(sort),-1)+1 FROM remote_folders)) RETURNING *`, [name, parentId]));
  }
  return { id: row.id, name: row.name, parentId: row.parent_id };
}

export async function deleteFolder(ctx, id) {
  requireAdmin(ctx);
  // Items in the folder fall back to the general list (ON DELETE SET NULL).
  const { rowCount } = await query(`DELETE FROM remote_folders WHERE id = $1`, [intId(id)]);
  if (!rowCount) throw httpError(404, 'Folder not found', 'NOT_FOUND');
}

/** Moves a computer or an application to a folder (null = the general list). */
export async function moveToFolder(ctx, { kind, id, folderId }) {
  requireAdmin(ctx);
  const table = kind === 'app' ? 'remote_apps' : 'remote_hosts';
  const fid = folderId ? intId(folderId) : null;
  const { rowCount } = await query(`UPDATE ${table} SET folder_id = $1 WHERE id = $2`, [fid, intId(id)]);
  if (!rowCount) throw httpError(404, 'Not found', 'NOT_FOUND');
}

/* ── Gateways (named RD Gateways) ──────────────────────────────────────────── */

export async function listGateways() {
  const { rows } = await query(`SELECT * FROM remote_gateways ORDER BY LOWER(name)`);
  return rows.map((r) => ({ id: r.id, name: r.name, host: r.host, port: r.port, domain: r.domain }));
}

async function gatewayById(id) {
  const { rows } = await query(`SELECT * FROM remote_gateways WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function saveGateway(ctx, input = {}, id = null) {
  requireAdmin(ctx);
  const host = folderText(input.host, 255);
  if (!host) throw httpError(400, 'Gateway host is required', 'NAME_REQUIRED');
  const name = folderText(input.name, 120) || host;
  const port = Math.min(65535, Math.max(1, Number(input.port) || 443));
  const domain = folderText(input.domain, 120);
  let row;
  try {
    if (id) {
      ({ rows: [row] } = await query(`UPDATE remote_gateways SET name=$1, host=$2, port=$3, domain=$4 WHERE id=$5 RETURNING *`, [name, host, port, domain, intId(id)]));
      if (!row) throw httpError(404, 'Gateway not found', 'NOT_FOUND');
    } else {
      ({ rows: [row] } = await query(`INSERT INTO remote_gateways (name, host, port, domain) VALUES ($1,$2,$3,$4) RETURNING *`, [name, host, port, domain]));
    }
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'A gateway with this address already exists', 'GATEWAY_EXISTS');
    throw err;
  }
  return { id: row.id, name: row.name, host: row.host, port: row.port, domain: row.domain };
}

export async function deleteGateway(ctx, id) {
  requireAdmin(ctx);
  const { rowCount } = await query(`DELETE FROM remote_gateways WHERE id = $1`, [intId(id)]);
  if (!rowCount) throw httpError(404, 'Gateway not found', 'NOT_FOUND');
}

/** Finds a gateway by host:port, creating it if missing (for .rdp import). */
async function gatewayByHost(host, port, domain = '') {
  if (!host) return null;
  const { rows } = await query(
    `INSERT INTO remote_gateways (name, host, port, domain) VALUES ($1,$2,$3,$4)
     ON CONFLICT (LOWER(host), port) DO UPDATE SET host = EXCLUDED.host RETURNING *`,
    [host, host, port || 443, domain]
  );
  return rows[0];
}

/* ── Applications (self-contained RemoteApp connections) ───────────────────── */

const appText = folderText;

async function appById(id) {
  const { rows } = await query(
    `SELECT a.*, g.name AS gateway_name, g.host AS gateway_host, g.port AS gateway_port, g.domain AS gateway_domain
       FROM remote_apps a LEFT JOIN remote_gateways g ON g.id = a.gateway_id WHERE a.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** Applications (launcher: active ones; admin: all). */
export async function listApps(ctx, { all = false } = {}) {
  const { rows } = await query(
    `SELECT a.*, g.name AS gateway_name, g.host AS gateway_host, g.port AS gateway_port, g.domain AS gateway_domain
       FROM remote_apps a LEFT JOIN remote_gateways g ON g.id = a.gateway_id
      ${all ? '' : 'WHERE a.active'} ORDER BY a.sort, LOWER(a.name)`
  );
  return rows.map(appShape);
}

export async function saveApp(ctx, input = {}, id = null) {
  requireAdmin(ctx);
  const current = id ? await appById(intId(id)) : null;
  if (id && !current) throw httpError(404, 'Application not found', 'APP_NOT_FOUND');
  const name = appText(input.name ?? current?.name, 120);
  const alias = appText(input.alias ?? current?.alias, 255);
  const address = appText(input.address ?? current?.address, 255);
  if (!name || !alias || !address) throw httpError(400, 'Name, program and server address are required', 'NAME_REQUIRED');
  const port = input.port === undefined ? current?.port ?? 3389 : Math.min(65535, Math.max(1, Number(input.port) || 3389));
  const gatewayId = input.gatewayId === undefined ? current?.gateway_id ?? null : input.gatewayId ? intId(input.gatewayId) : null;
  const folderId = input.folderId === undefined ? current?.folder_id ?? null : input.folderId ? intId(input.folderId) : null;
  const defaultCred = input.defaultCred === undefined ? current?.default_cred ?? '' : String(input.defaultCred || '').replace(/[^a-z0-9:_-]/gi, '').slice(0, 80);
  const credUsername = input.credUsername === undefined ? current?.cred_username ?? null : appText(input.credUsername, 160) || null;
  const credDomain = input.credDomain === undefined ? current?.cred_domain ?? null : appText(input.credDomain, 120) || null;
  const credPassword = input.credPassword === undefined ? current?.cred_password ?? null : input.credPassword ? seal(String(input.credPassword)) : null;
  const values = [
    name, alias, address, port, gatewayId, folderId,
    appText(input.args ?? current?.args, 500), appText(input.workDir ?? current?.work_dir, 300),
    appText(input.loadBalanceInfo ?? current?.load_balance_info, 512), appText(input.icon ?? current?.icon, 40) || 'app',
    input.active === undefined ? current?.active ?? true : Boolean(input.active),
    defaultCred, credUsername, credDomain, credPassword,
  ];
  let row;
  if (current) {
    ({ rows: [row] } = await query(
      `UPDATE remote_apps SET name=$1, alias=$2, address=$3, port=$4, gateway_id=$5, folder_id=$6, args=$7, work_dir=$8, load_balance_info=$9, icon=$10, active=$11, default_cred=$12, cred_username=$13, cred_domain=$14, cred_password=$15 WHERE id=$16 RETURNING *`,
      [...values, current.id]
    ));
  } else {
    ({ rows: [row] } = await query(
      `INSERT INTO remote_apps (name, alias, address, port, gateway_id, folder_id, args, work_dir, load_balance_info, icon, active, default_cred, cred_username, cred_domain, cred_password, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, (SELECT COALESCE(MAX(sort),-1)+1 FROM remote_apps)) RETURNING *`,
      values
    ));
  }
  return appShape(await appById(row.id));
}

export async function deleteApp(ctx, id) {
  requireAdmin(ctx);
  const { rowCount } = await query(`DELETE FROM remote_apps WHERE id = $1`, [intId(id)]);
  if (!rowCount) throw httpError(404, 'Application not found', 'APP_NOT_FOUND');
}

/**
 * Imports an RDWeb .rdp file into a self-contained application: finds/creates the
 * RD Gateway (by host) and creates the RemoteApp with its address, alias and
 * load-balance info. No server computer is created. The file signature is ignored.
 */
export async function importRdp(ctx, text) {
  requireAdmin(ctx);
  const parsed = parseRdp(text);
  if (!parsed || !parsed.app) throw httpError(400, 'This .rdp file has no RemoteApp to import', 'RDP_INVALID');
  const gw = parsed.host.gatewayHost ? await gatewayByHost(parsed.host.gatewayHost, parsed.host.gatewayPort) : null;
  const app = await saveApp(ctx, {
    name: parsed.app.name,
    alias: parsed.app.alias,
    args: parsed.app.args,
    loadBalanceInfo: parsed.app.loadBalanceInfo,
    address: parsed.host.address,
    port: parsed.host.port,
    gatewayId: gw?.id || null,
  });
  return { app, gateway: gw ? { id: gw.id, name: gw.name, host: gw.host } : null };
}

/* ── Sessions (the audit trail) ────────────────────────────────────────── */

/**
 * Starts a remote session. This is the only path to a connection and it is
 * deliberately not silent: it records the session and notifies the watched
 * employee before returning. `mode: 'monitor'` needs remote.monitor and a host
 * in the monitoring scope; `assist` needs remote.connect. The returned token
 * is what the browser hands to the tunnel; the tunnel to guacd is a later
 * phase (docs/specs/remote-access.ru.md §Этапы) and answers GUACD_OFF until then.
 */
export async function startSession(ctx, input = {}) {
  const isApp = Boolean(input.appId);
  const wantsControl = isApp ? true : Boolean(input.control);
  let mode = isApp ? 'assist' : MODES.includes(input.mode) ? input.mode : 'assist';
  const settings = await remoteSettings();

  // Build the connection target (a computer, or an application with its gateway).
  let target;
  let appMeta = null;
  let appName = null;
  if (isApp) {
    const app = await appById(intId(input.appId));
    if (!app || !app.active) throw httpError(404, 'Application not found', 'APP_NOT_FOUND');
    if (!ctx.canConnect) throw httpError(403, 'You cannot connect', 'FORBIDDEN');
    appName = app.name;
    appMeta = { alias: app.alias, workDir: app.work_dir, args: app.args, loadBalanceInfo: app.load_balance_info };
    target = {
      id: null, name: app.name, address: app.address, port: app.port, protocol: 'rdp', ownerId: null, kind: 'app',
      gateway_host: app.gateway_host || '', gateway_port: app.gateway_port || 443, gateway_domain: app.gateway_domain || '',
      cred_username: app.cred_username, cred_domain: app.cred_domain, cred_password: app.cred_password, default_cred: app.default_cred,
    };
  } else {
    const host = await hostById(intId(input.hostId));
    if (!host || !host.active) throw httpError(404, 'Computer not found', 'NOT_FOUND');
    if (mode === 'monitor') {
      if (!ctx.canMonitor) throw httpError(403, 'Monitoring is not allowed for you', 'FORBIDDEN');
      if (!host.monitored) throw httpError(400, 'This computer is not in the monitoring scope', 'NOT_MONITORED');
      if (!settings.policyAckAt) throw httpError(409, 'Confirm the monitoring policy first', 'POLICY_NOT_ACKED');
    } else if (!ctx.canConnect) {
      throw httpError(403, 'You cannot connect', 'FORBIDDEN');
    }
    target = {
      id: host.id, name: host.name, address: host.address, port: host.port, protocol: host.protocol, ownerId: host.owner_user_id, kind: host.kind,
      gateway_host: '', gateway_port: 443, gateway_domain: '', // computers are direct
      cred_username: host.cred_username, cred_domain: host.cred_domain, cred_password: host.cred_password, default_cred: host.default_cred,
    };
  }

  // A server / application has no person behind it → unattended. A workstation in
  // assist/monitor asks consent (control) and notifies its owner.
  const unattended = target.kind === 'app' || target.kind === 'server';
  const needsConsent = !unattended && (mode === 'assist' || (wantsControl && settings.requireConsentForControl !== false));
  const consent = unattended ? 'unattended' : needsConsent ? 'requested' : 'announced';

  const { rows: [session] } = await query(
    `INSERT INTO remote_sessions (host_id, host_name, operator_id, watched_user_id, mode, control, consent, recorded)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [target.id, appName ? `${appName}` : target.name, ctx.userId, target.ownerId, mode, wantsControl, consent, Boolean(settings.recording)]
  );

  // Transparency: always tell the watched employee.
  if (target.ownerId) {
    await notify({
      userIds: [target.ownerId], kind: 'remote.connected', module: 'remote', actorId: ctx.userId, link: '/app/remote/my',
      render: (locale) => ({ title: tr(locale, mode === 'monitor' ? 'monitorTitle' : 'assistTitle'), body: tr(locale, wantsControl ? 'bodyControl' : 'bodyView', { host: target.name }) }),
    });
  }

  // Portal VNC bypasses guacd: its own mTLS bridge (pvncTunnel.js). The browser
  // runs noVNC, not guacamole-common-js.
  if (target.protocol === 'pvnc') {
    if (!(await pvncConfigured())) {
      return { session: sessionShape(session), token: null, tunnel: 'PVNC_OFF', path: PVNC_PATH, viewer: 'pvnc', protocol: 'pvnc', readOnly: !wantsControl, app: appName };
    }
    const reach = await tcpProbe(target.address, target.port, 4000);
    if (!reach.ok) {
      await query(`UPDATE remote_sessions SET ended_at = NOW(), note = $2 WHERE id = $1`, [session.id, `unreachable: ${reach.reason}`]);
      const error = httpError(409, 'The computer is not reachable on the network', 'HOST_UNREACHABLE');
      error.details = { address: `${target.address}:${target.port}`, reason: reach.reason, ms: reach.ms };
      throw error;
    }
    const creds = await resolveCredentials(ctx, target, input);
    const token = buildPvncToken({ host: target.address, port: target.port, username: creds.username, domain: creds.domain, password: creds.password });
    return { session: sessionShape(session), token, tunnel: 'READY', path: PVNC_PATH, viewer: 'pvnc', protocol: 'pvnc', readOnly: !wantsControl, app: appName };
  }

  if (!settings.guacdHost) {
    return { session: sessionShape(session), token: null, tunnel: 'GUACD_OFF', path: TUNNEL_PATH, protocol: target.protocol, readOnly: !wantsControl, app: appName };
  }

  // Fast pre-flight. Behind an RD Gateway only the gateway (443) is reachable.
  const probeHost = target.gateway_host || target.address;
  const probePort = target.gateway_host ? target.gateway_port || 443 : target.port;
  const reach = await tcpProbe(probeHost, probePort, 4000);
  if (!reach.ok) {
    await query(`UPDATE remote_sessions SET ended_at = NOW(), note = $2 WHERE id = $1`, [session.id, `unreachable: ${reach.reason}`]);
    const error = httpError(409, 'The computer is not reachable on the network', 'HOST_UNREACHABLE');
    error.details = { address: `${probeHost}:${probePort}`, reason: reach.reason, ms: reach.ms };
    throw error;
  }

  const creds = await resolveCredentials(ctx, target, input);
  const size = {
    width: Math.min(3840, Math.max(640, Number(input.width) || 1280)),
    height: Math.min(2160, Math.max(480, Number(input.height) || 720)),
    dpi: Math.min(192, Math.max(72, Number(input.dpi) || 96)),
    app: appMeta,
  };
  const connection = connectionFor(target, creds, size);
  if (!wantsControl) connection.settings['read-only'] = 'true';
  const token = buildToken(connection);
  return { session: sessionShape(session), token, tunnel: 'READY', path: TUNNEL_PATH, protocol: target.protocol, readOnly: !wantsControl, app: appName };
}

/*
 * Resolves the credentials from the chosen source for a credential holder (a
 * computer or an application, both carrying cred_* and default_cred):
 *   manual · host (the holder's own) · vault (password manager) · passbolt.
 */
export async function resolveCredentials(ctx, holder, input = {}) {
  const auth = input.auth && typeof input.auth === 'object' ? input.auth : null;
  let source = auth?.source || '';
  let id = auth?.id;
  if (!source && (input.username != null || input.password != null)) source = 'manual';
  if (!source) {
    const def = holder.default_cred || (holder.cred_password ? 'host' : '');
    if (def.includes(':')) { [source, id] = def.split(':'); } else source = def;
  }
  switch (source) {
    case 'manual':
      return { username: text(input.username, 160), domain: text(input.domain, 120), password: input.password ? String(input.password) : '' };
    case 'vault':
      return resolveVault(ctx, id);
    case 'passbolt':
      return resolvePassbolt(ctx, id);
    case 'host':
    default:
      return {
        username: holder.cred_username || '',
        domain: holder.cred_domain || '',
        password: unseal(holder.cred_password, { label: `remote cred ${holder.id || 'app'}` }) || '',
      };
  }
}

export async function endSession(ctx, id, input = {}) {
  const { rows } = await query(
    `UPDATE remote_sessions SET ended_at = COALESCE(ended_at, NOW()), note = $2
       WHERE id = $1 AND operator_id = $3 AND ended_at IS NULL RETURNING *`,
    [intId(id), text(input.note, 300), ctx.userId]
  );
  if (!rows[0]) return null;
  return sessionShape(rows[0]);
}

/** The journal. Admins see everything; others see only sessions where they were watched. */
export async function listSessions(ctx, { scope = 'mine', limit = 200 } = {}) {
  const mine = scope !== 'all' || !ctx.isAdmin;
  const { rows } = await query(
    `SELECT s.*, COALESCE(o.display_name, o.username) AS operator_name, COALESCE(w.display_name, w.username) AS watched_name
       FROM remote_sessions s
       LEFT JOIN users o ON o.id = s.operator_id
       LEFT JOIN users w ON w.id = s.watched_user_id
      ${mine ? 'WHERE s.watched_user_id = $2' : ''}
      ORDER BY s.started_at DESC LIMIT $1`,
    mine ? [Math.min(1000, limit), ctx.userId] : [Math.min(1000, limit)]
  );
  return rows.map(sessionShape);
}

/* ── Bootstrap ─────────────────────────────────────────────────────────── */

export async function bootstrap(ctx) {
  const settings = await remoteSettings();
  const [hosts, apps, folders, gateways] = await Promise.all([listHosts(ctx), listApps(ctx), listFolders(), ctx.isAdmin ? listGateways() : Promise.resolve([])]);
  return {
    hosts,
    apps,
    folders,
    gateways,
    settings: {
      guacdConfigured: Boolean(settings.guacdHost),
      requireConsentForControl: settings.requireConsentForControl !== false,
      recording: Boolean(settings.recording),
      monitoringReady: Boolean(settings.policyAckAt),
      passbolt: Boolean(settings.passbolt),
      pvncReady: await pvncConfigured().catch(() => false),
    },
    can: { connect: ctx.canConnect, monitor: ctx.canMonitor, admin: ctx.isAdmin },
  };
}

/* ── Notification texts (ru/en; other languages fall back to English) ──── */

const TEXTS = {
  en: {
    assistTitle: 'Support connected to your computer',
    monitorTitle: 'Your computer is being viewed',
    bodyView: 'An administrator is viewing «{host}».',
    bodyControl: 'An administrator is controlling «{host}».',
  },
  ru: {
    assistTitle: 'Поддержка подключилась к вашему компьютеру',
    monitorTitle: 'За вашим компьютером ведётся наблюдение',
    bodyView: 'Администратор просматривает «{host}».',
    bodyControl: 'Администратор управляет компьютером «{host}».',
  },
};

function tr(locale, key, params = {}) {
  const dict = TEXTS[locale] || TEXTS.en;
  return String(dict[key] || TEXTS.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '');
}
