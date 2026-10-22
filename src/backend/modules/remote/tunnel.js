import { createCipheriv, createHash, randomBytes } from 'crypto';
import GuacamoleLite from 'guacamole-lite';
import { getSettings, parseSettings } from '../../services/settings.js';

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
  }
  return { type: 'rdp', settings };
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

    // eslint-disable-next-line no-new
    new GuacamoleLite(
      { server, path: TUNNEL_PATH },
      { host, port },
      {
        crypt: { cypher: CYPHER, key: tunnelKey() },
        log: { level: process.env.NODE_ENV === 'production' ? 10 : 20 },
        // The browser may set only the screen size; everything else is in the token.
        allowedUnencryptedConnectionSettings: { rdp: ['width', 'height', 'dpi'], vnc: ['width', 'height', 'dpi'] },
      }
    );
    console.log(`Remote tunnel ready on ${TUNNEL_PATH} → guacd ${host}:${port}`);
  } catch (error) {
    console.warn('Remote tunnel not started:', error.message);
  }
}
