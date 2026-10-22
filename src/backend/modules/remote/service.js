import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { seal, unseal } from '../../services/crypto.js';
import { contextFromRequest, httpError, intId } from '../shared/acl.js';
import { buildToken, connectionFor, TUNNEL_PATH } from './tunnel.js';

/*
 * Remote access & assistance. Transparency is enforced here, not left to the
 * UI: startSession() ALWAYS writes an audit row and ALWAYS notifies the
 * watched employee. There is no covert path and no setting to disable either.
 */

const PROTOCOLS = { rdp: 3389, vnc: 5900 };
const MODES = ['assist', 'monitor'];
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
  const values = [name, address, protocol, port, kind, ownerId, monitored, text(input.note ?? current?.note, 300), input.active === undefined ? current?.active ?? true : Boolean(input.active), credUsername, credDomain, credPassword];
  let row;
  try {
    if (current) {
      ({ rows: [row] } = await query(
        `UPDATE remote_hosts SET name=$1, address=$2, protocol=$3, port=$4, kind=$5, owner_user_id=$6, monitored=$7, note=$8, active=$9, cred_username=$10, cred_domain=$11, cred_password=$12, updated_at=NOW()
         WHERE id=$13 RETURNING *`,
        [...values, current.id]
      ));
    } else {
      ({ rows: [row] } = await query(
        `INSERT INTO remote_hosts (name, address, protocol, port, kind, owner_user_id, monitored, note, active, cred_username, cred_domain, cred_password, source, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual',$13) RETURNING *`,
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
  const creds = {
    username: text(input.username, 120) || host.cred_username || '',
    domain: text(input.domain, 120) || host.cred_domain || '',
    password: input.password ? String(input.password) : unseal(host.cred_password, { label: `remote host ${host.id} password` }) || '',
  };
  const size = {
    width: Math.min(3840, Math.max(640, Number(input.width) || 1280)),
    height: Math.min(2160, Math.max(480, Number(input.height) || 720)),
    dpi: Math.min(192, Math.max(72, Number(input.dpi) || 96)),
  };
  const connection = connectionFor(host, creds, size);
  // «Only view» is enforced by guacd itself (read-only), not just hidden in the UI.
  if (!wantsControl) connection.settings['read-only'] = 'true';
  const token = buildToken(connection);
  return { session: sessionShape(session), token, tunnel: 'READY', path: TUNNEL_PATH, protocol: host.protocol, readOnly: !wantsControl };
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
  return {
    hosts: await listHosts(ctx),
    settings: {
      guacdConfigured: Boolean(settings.guacdHost),
      requireConsentForControl: settings.requireConsentForControl !== false,
      recording: Boolean(settings.recording),
      monitoringReady: Boolean(settings.policyAckAt),
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
