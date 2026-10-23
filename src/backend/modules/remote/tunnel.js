import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import GuacamoleLite from 'guacamole-lite';
import { getSettings, parseSettings } from '../../services/settings.js';
import { routeUpgrade } from './upgrade.js';

/*
 * The WebSocket bridge between the browser and guacd (docs/specs/remote-access.ru.md).
 *
 *   browser (guacamole-common-js)  ──wss /api/app/remote/tunnel?token=…──►  portal
 *   portal (guacamole-lite)        ──tcp guacd:4822──►  guacd  ──RDP/VNC──►  computer
 *
 * The browser never receives the host address or credentials: they travel inside
 * an AES-256-CBC token that only the portal and guacd-lite can open (the key is
 * derived from JWT_SECRET). The token is minted per session by startSession().
 */

export const TUNNEL_PATH = '/api/app/remote/tunnel';
const CYPHER = 'AES-256-CBC';

/** A stable 32-byte key for the tunnel token, derived from the portal secret. */
export function tunnelKey() {
  const secret = process.env.JWT_SECRET || 'insecure-dev-secret';
  // 32 ascii chars = 32 bytes for AES-256.
  return createHash('sha256').update(`${secret}|guacd-tunnel`).digest('base64').slice(0, 32);
}

/** Encrypts the connection settings into a guacamole-lite token (its exact format). */
export function buildToken(connection) {
  const key = tunnelKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(CYPHER, key, iv);
  let value = cipher.update(JSON.stringify({ connection }), 'utf8', 'binary');
  value += cipher.final('binary');
  const data = {
    iv: Buffer.from(iv).toString('base64'),
    value: Buffer.from(value, 'binary').toString('base64'),
  };
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Opens a token of buildToken (guacamole-lite's format) → its settings, or null when it is not one
 * of ours. Checked before the upgrade: guacamole-lite itself fails on a forged token with an
 * unhandled rejection instead of a refusal.
 */
export function openToken(token) {
  try {
    const data = JSON.parse(Buffer.from(String(token || ''), 'base64').toString('utf8'));
    const decipher = createDecipheriv(CYPHER, tunnelKey(), Buffer.from(data.iv, 'base64'));
    const text = decipher.update(Buffer.from(data.value, 'base64'), undefined, 'utf8') + decipher.final('utf8');
    const settings = JSON.parse(text);
    return settings?.connection?.type ? settings : null;
  } catch {
    return null;
  }
}

const tokenOf = (req) => new URL(req.url || '/', 'http://localhost').searchParams.get('token');

/** Builds the RDP/VNC/SSH settings guacd understands for a host + resolved credentials. */
export function connectionFor(host, creds = {}, { width, height, dpi, app } = {}) {
  const base = {
    hostname: host.address,
    port: String(host.port),
    width: width ? String(width) : undefined,
    height: height ? String(height) : undefined,
    dpi: dpi ? String(dpi) : undefined,
  };
  if (host.protocol === 'vnc') {
    return { type: 'vnc', settings: clean({ ...base, password: creds.password }) };
  }
  // RDP (default): take credentials when we have them, tolerate self-signed certs,
  // and let the desktop follow the browser window size.
  const settings = clean({
    ...base,
    username: creds.username,
    password: creds.password,
    domain: creds.domain,
    security: 'any',
    'ignore-cert': 'true',
    'resize-method': 'display-update',
    'enable-wallpaper': 'true',
    'enable-font-smoothing': 'true',
  });
  // RemoteApp (RAIL): launch a single published application instead of the desktop.
  // `alias` is «||<name>» for an RDS-published app or a full path to an executable.
  if (app?.alias) {
    settings['remote-app'] = app.alias;
    if (app.workDir) settings['remote-app-dir'] = app.workDir;
    if (app.args) settings['remote-app-args'] = app.args;
    // The RDS Connection Broker uses this to route to the right collection (RDWeb).
    if (app.loadBalanceInfo) settings['load-balance-info'] = app.loadBalanceInfo;
  }
  // RD Gateway (RDWeb / TS Gateway): connect through the HTTPS gateway in front of
  // the farm. Gateway credentials reuse the session credentials (credssource:0).
  if (host.gateway_host) {
    settings['gateway-hostname'] = host.gateway_host;
    settings['gateway-port'] = String(host.gateway_port || 443);
    settings['gateway-domain'] = host.gateway_domain || creds.domain || '';
    settings['gateway-username'] = creds.username || '';
    settings['gateway-password'] = creds.password || '';
  }
  return { type: 'rdp', settings };
}

/*
 * Parses an RDWeb-exported .rdp file into a host + app for the module.
 * Lines are «key:type:value» (i int, s string, b binary). We read only the
 * fields we map to guacd; the signature and device-redirection flags are ignored.
 */
export function parseRdp(text) {
  const fields = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^([^:]+):([isb]):(.*)$/.exec(line.trim());
    if (match) fields[match[1].toLowerCase()] = match[3];
  }
  const address = (fields['full address'] || fields['alternate full address'] || '').trim();
  if (!address) return null;
  const isApp = fields['remoteapplicationmode'] === '1';
  const alias = (fields['remoteapplicationprogram'] || fields['alternate shell'] || '').trim();
  const gatewayMethod = fields['gatewayusagemethod'];
  const useGateway = gatewayMethod === '1' || gatewayMethod === '2';
  return {
    host: {
      name: (fields['remoteapplicationname'] ? `RDS ${address}` : address).slice(0, 120),
      address,
      port: Number(fields['server port']) || 3389,
      kind: 'server',
      gatewayHost: useGateway ? (fields['gatewayhostname'] || '').trim() : '',
      gatewayPort: 443,
    },
    app: isApp && alias
      ? {
          name: (fields['remoteapplicationname'] || alias).replace(/^\|\|/, '').slice(0, 120),
          alias,
          args: (fields['remoteapplicationcmdline'] || '').trim(),
          loadBalanceInfo: (fields['loadbalanceinfo'] || '').trim(),
        }
      : null,
  };
}

function clean(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

let started = false;

/**
 * Attaches guacd-lite to the portal's HTTP server on TUNNEL_PATH. Called once at
 * boot. guacd's address comes from the module settings (falling back to the
 * GUACD_HOST / GUACD_PORT env, then guacd:4822). Changing the address needs a
 * restart. Never throws into boot — a broken tunnel must not stop the portal.
 */
export async function initRemoteTunnel(server) {
  if (started) return;
  started = true;
  try {
    let host = process.env.GUACD_HOST || 'guacd';
    let port = Number(process.env.GUACD_PORT) || 4822;
    try {
      const parsed = parseSettings(await getSettings());
      const s = parsed.modules.remote?.settings || {};
      if (s.guacdHost) host = s.guacdHost;
      if (s.guacdPort) port = Number(s.guacdPort) || port;
    } catch {
      /* settings not ready — use env/defaults */
    }

    const guac = new GuacamoleLite(
      // noServer: upgrades of TUNNEL_PATH come through routeUpgrade (one listener for both tunnels, upgrade.js).
      { server: undefined, noServer: true },
      { host, port },
      {
        crypt: { cypher: CYPHER, key: tunnelKey() },
        log: { level: process.env.NODE_ENV === 'production' ? 10 : 20 },
        // The browser may set only the screen size; everything else is in the token.
        allowedUnencryptedConnectionSettings: { rdp: ['width', 'height', 'dpi'], vnc: ['width', 'height', 'dpi'] },
      }
    );
    routeUpgrade(server, TUNNEL_PATH, guac.webSocketServer, { accept: (req) => Boolean(openToken(tokenOf(req))) });
    console.log(`Remote tunnel ready on ${TUNNEL_PATH} → guacd ${host}:${port}`);
  } catch (error) {
    console.warn('Remote tunnel not started:', error.message);
  }
}
