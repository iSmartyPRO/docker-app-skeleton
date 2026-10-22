import net from 'net';
import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { seal, unseal } from '../../services/crypto.js';
import { contextFromRequest, httpError, intId } from '../shared/acl.js';
import { buildToken, connectionFor, parseRdp, TUNNEL_PATH } from './tunnel.js';
import { resolveVault } from './credentials.js';
import { resolvePassbolt } from './passbolt.js';

/*
 * Remote access & assistance. Transparency is enforced here, not left to the
 * UI: startSession() ALWAYS writes an audit row and ALWAYS notifies the
 * watched employee. There is no covert path and no setting to disable either.
 */

const PROTOCOLS = { rdp: 3389, vnc: 5900 };
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
    gatewayHost: row.gateway_host || '',
    gatewayPort: row.gateway_port || 443,
    gatewayDomain: row.gateway_domain || '',
    appCount: row.app_count != null ? Number(row.app_count) : undefined,
  };
}

function appShape(row) {
  return { id: row.id, hostId: row.host_id, hostName: row.host_name, name: row.name, alias: row.alias, args: row.args, workDir: row.work_dir, loadBalanceInfo: row.load_balance_info || '', icon: row.icon, active: row.active, sort: row.sort };
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
  const gatewayHost = input.gatewayHost === undefined ? current?.gateway_host ?? '' : text(input.gatewayHost, 255);
  const gatewayPort = input.gatewayPort === undefined ? current?.gateway_port ?? 443 : Math.min(65535, Math.max(1, Number(input.gatewayPort) || 443));
  const gatewayDomain = input.gatewayDomain === undefined ? current?.gateway_domain ?? '' : text(input.gatewayDomain, 120);
  const values = [name, address, protocol, port, kind, ownerId, monitored, text(input.note ?? current?.note, 300), input.active === undefined ? current?.active ?? true : Boolean(input.active), credUsername, credDomain, credPassword, defaultCred, gatewayHost, gatewayPort, gatewayDomain];
  let row;
  try {
    if (current) {
      ({ rows: [row] } = await query(
        `UPDATE remote_hosts SET name=$1, address=$2, protocol=$3, port=$4, kind=$5, owner_user_id=$6, monitored=$7, note=$8, active=$9, cred_username=$10, cred_domain=$11, cred_password=$12, default_cred=$13, gateway_host=$14, gateway_port=$15, gateway_domain=$16, updated_at=NOW()
         WHERE id=$17 RETURNING *`,
        [...values, current.id]
      ));
    } else {
      ({ rows: [row] } = await query(
        `INSERT INTO remote_hosts (name, address, protocol, port, kind, owner_user_id, monitored, note, active, cred_username, cred_domain, cred_password, default_cred, gateway_host, gateway_port, gateway_domain, source, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'manual',$17) RETURNING *`,
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

/* ── RemoteApp (published applications) ─────────────────────────────────── */

const appText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

async function appById(id) {
  const { rows } = await query(
    `SELECT a.*, h.name AS host_name FROM remote_apps a JOIN remote_hosts h ON h.id = a.host_id WHERE a.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** Published apps of active servers (for the launcher), or of one host (admin). */
export async function listApps(ctx, { hostId = null, all = false } = {}) {
  const { rows } = await query(
    `SELECT a.*, h.name AS host_name FROM remote_apps a JOIN remote_hosts h ON h.id = a.host_id
      WHERE ${hostId ? 'a.host_id = $1' : 'TRUE'} ${all ? '' : 'AND a.active AND h.active'}
      ORDER BY h.name, a.sort, a.id`,
    hostId ? [intId(hostId)] : []
  );
  return rows.map(appShape);
}

export async function saveApp(ctx, input = {}, id = null) {
  requireAdmin(ctx);
  const current = id ? await appById(intId(id)) : null;
  if (id && !current) throw httpError(404, 'Application not found', 'APP_NOT_FOUND');
  const hostId = current?.host_id ?? intId(input.hostId);
  const host = await hostById(hostId);
  if (!host) throw httpError(404, 'Computer not found', 'NOT_FOUND');
  const name = appText(input.name ?? current?.name, 120);
  const alias = appText(input.alias ?? current?.alias, 255);
  if (!name || !alias) throw httpError(400, 'Name and program are required', 'NAME_REQUIRED');
  const lbi = appText(input.loadBalanceInfo ?? current?.load_balance_info, 512);
  const values = [name, alias, appText(input.args ?? current?.args, 500), appText(input.workDir ?? current?.work_dir, 300), appText(input.icon ?? current?.icon, 40) || 'app', input.active === undefined ? current?.active ?? true : Boolean(input.active), lbi];
  let row;
  if (current) {
    ({ rows: [row] } = await query(`UPDATE remote_apps SET name=$1, alias=$2, args=$3, work_dir=$4, icon=$5, active=$6, load_balance_info=$7 WHERE id=$8 RETURNING *`, [...values, current.id]));
  } else {
    ({ rows: [row] } = await query(
      `INSERT INTO remote_apps (host_id, name, alias, args, work_dir, icon, active, load_balance_info, sort)
       VALUES ($8,$1,$2,$3,$4,$5,$6,$7, (SELECT COALESCE(MAX(sort),-1)+1 FROM remote_apps WHERE host_id=$8)) RETURNING *`,
      [...values, hostId]
    ));
  }
  return appShape(await appById(row.id));
}

/**
 * Imports an RDWeb .rdp file: creates (or reuses by address) the RDS server with
 * its RD Gateway, and adds the RemoteApp with its load-balance info. Returns the
 * host and app. The signature in the file is ignored — we only read the fields.
 */
export async function importRdp(ctx, text) {
  requireAdmin(ctx);
  const parsed = parseRdp(text);
  if (!parsed) throw httpError(400, 'This is not a valid .rdp file', 'RDP_INVALID');

  // Reuse a host with the same address/port, else create it (carrying the gateway).
  const { rows } = await query(`SELECT * FROM remote_hosts WHERE LOWER(address) = LOWER($1) AND port = $2`, [parsed.host.address, parsed.host.port]);
  let host = rows[0] ? hostShape(rows[0]) : null;
  if (!host) {
    host = await saveHost(ctx, { ...parsed.host });
  } else if (parsed.host.gatewayHost && !host.gatewayHost) {
    host = await saveHost(ctx, { gatewayHost: parsed.host.gatewayHost, gatewayPort: parsed.host.gatewayPort }, host.id);
  }

  let app = null;
  if (parsed.app) app = await saveApp(ctx, { hostId: host.id, ...parsed.app });
  return { host, app };
}

export async function deleteApp(ctx, id) {
  requireAdmin(ctx);
  const { rowCount } = await query(`DELETE FROM remote_apps WHERE id = $1`, [intId(id)]);
  if (!rowCount) throw httpError(404, 'Application not found', 'APP_NOT_FOUND');
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
  const host = await hostById(intId(input.hostId));
  if (!host || !host.active) throw httpError(404, 'Computer not found', 'NOT_FOUND');
  const mode = MODES.includes(input.mode) ? input.mode : 'assist';
  const wantsControl = Boolean(input.control);

  if (mode === 'monitor') {
    if (!ctx.canMonitor) throw httpError(403, 'Monitoring is not allowed for you', 'FORBIDDEN');
    if (!host.monitored) throw httpError(400, 'This computer is not in the monitoring scope', 'NOT_MONITORED');
    const settings = await remoteSettings();
    if (!settings.policyAckAt) throw httpError(409, 'Confirm the monitoring policy first', 'POLICY_NOT_ACKED');
  } else if (!ctx.canConnect) {
    throw httpError(403, 'You cannot connect', 'FORBIDDEN');
  }

  // Control in monitor mode may require the employee's consent (default on).
  // A server has no person behind it, so there is nobody to consent — it is an
  // unattended admin connection.
  const settings = await remoteSettings();
  const server = host.kind === 'server';
  const needsConsent = !server && (mode === 'assist' || (wantsControl && settings.requireConsentForControl !== false));
  const consent = server ? 'unattended' : needsConsent ? 'requested' : 'announced';

  const { rows: [session] } = await query(
    `INSERT INTO remote_sessions (host_id, host_name, operator_id, watched_user_id, mode, control, consent, recorded)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [host.id, host.name, ctx.userId, host.owner_user_id, mode, wantsControl, consent, Boolean(settings.recording)]
  );

  // Transparency: always tell the watched employee, in their own language.
  if (host.owner_user_id) {
    await notify({
      userIds: [host.owner_user_id],
      kind: 'remote.connected',
      module: 'remote',
      actorId: ctx.userId,
      link: '/app/remote/my',
      render: (locale, regional) => ({
        title: tr(locale, mode === 'monitor' ? 'monitorTitle' : 'assistTitle'),
        body: tr(locale, wantsControl ? 'bodyControl' : 'bodyView', { host: host.name }),
      }),
    });
  }

  // When guacd is configured, mint the live-connection token for the browser.
  if (!settings.guacdHost) {
    return { session: sessionShape(session), token: null, tunnel: 'GUACD_OFF', path: TUNNEL_PATH, protocol: host.protocol, readOnly: !wantsControl };
  }
  // Fast pre-flight: the portal is on the same network as guacd, so this is what
  // a session would do. Fail in a few seconds with a clear message instead of
  // letting the RDP handshake hang. Behind an RD Gateway only the gateway (443)
  // is reachable — the RDP port is not — so probe the gateway in that case.
  const probeHost = host.gateway_host || host.address;
  const probePort = host.gateway_host ? host.gateway_port || 443 : host.port;
  const reach = await tcpProbe(probeHost, probePort, 4000);
  if (!reach.ok) {
    await query(`UPDATE remote_sessions SET ended_at = NOW(), note = $2 WHERE id = $1`, [session.id, `unreachable: ${reach.reason}`]);
    const error = httpError(409, 'The computer is not reachable on the network', 'HOST_UNREACHABLE');
    error.details = { address: `${probeHost}:${probePort}`, reason: reach.reason, ms: reach.ms };
    throw error;
  }
  // RemoteApp: launch one published application instead of the whole desktop.
  let app = null;
  if (input.appId) {
    app = await appById(intId(input.appId));
    if (!app || app.host_id !== host.id || !app.active) throw httpError(404, 'Application not found', 'APP_NOT_FOUND');
  }

  const creds = await resolveCredentials(ctx, host, input);
  const size = {
    width: Math.min(3840, Math.max(640, Number(input.width) || 1280)),
    height: Math.min(2160, Math.max(480, Number(input.height) || 720)),
    dpi: Math.min(192, Math.max(72, Number(input.dpi) || 96)),
    app: app ? { alias: app.alias, workDir: app.work_dir, args: app.args, loadBalanceInfo: app.load_balance_info } : null,
  };
  const connection = connectionFor(host, creds, size);
  // «Only view» is enforced by guacd itself (read-only), not just hidden in the UI.
  if (!wantsControl) connection.settings['read-only'] = 'true';
  const token = buildToken(connection);
  return { session: sessionShape(session), token, tunnel: 'READY', path: TUNNEL_PATH, protocol: host.protocol, readOnly: !wantsControl, app: app ? app.name : null };
}

/*
 * Resolves the credentials for a session from the chosen source:
 *   manual   — typed in for this session, nothing stored
 *   host     — the computer's own stored credentials
 *   vault    — an entry of the portal password manager
 *   passbolt — an entry of the person's own Passbolt
 * When no source is given, the host's default is used, then its own credentials.
 */
export async function resolveCredentials(ctx, host, input = {}) {
  const auth = input.auth && typeof input.auth === 'object' ? input.auth : null;
  let source = auth?.source || '';
  let id = auth?.id;

  // Legacy manual fields (connect dialog) without an explicit source.
  if (!source && (input.username != null || input.password != null)) source = 'manual';
  // No choice at all → the host's default, then its own credentials.
  if (!source) {
    const def = host.default_cred || (host.cred_password ? 'host' : '');
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
        username: host.cred_username || '',
        domain: host.cred_domain || '',
        password: unseal(host.cred_password, { label: `remote host ${host.id} password` }) || '',
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
  const [hosts, apps] = await Promise.all([listHosts(ctx), listApps(ctx)]);
  return {
    hosts,
    apps,
    settings: {
      guacdConfigured: Boolean(settings.guacdHost),
      requireConsentForControl: settings.requireConsentForControl !== false,
      recording: Boolean(settings.recording),
      monitoringReady: Boolean(settings.policyAckAt),
      passbolt: Boolean(settings.passbolt),
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
