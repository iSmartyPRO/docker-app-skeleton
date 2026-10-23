import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { WebSocketServer } from 'ws';
import { connectAgent } from './pvncClient.js';
import { pvncIdentity } from './pvnc.js';

/*
 * The WebSocket bridge between the browser (noVNC) and a PortalVNC agent — the
 * PortalVNC counterpart of the guacd tunnel (tunnel.js). PortalVNC bypasses
 * guacd: the agent speaks RFB inside mutual TLS with its own handshake, so the
 * portal terminates the browser WebSocket, opens a mTLS PortalVNC connection
 * with its client identity (modules/remote/pvnc.js), and relays raw RFB.
 *
 *   browser (noVNC)  ──wss /api/app/remote/pvnc?token=…──►  portal
 *   portal           ──mTLS + PortalVNC handshake──►  agent:7654  ──RFB──►  desktop
 *
 * The browser never sees the host address or the Windows credentials: they
 * travel inside an AES-256-CBC token minted per session by startSession() and
 * opened only here. The token carries a short expiry so it cannot be replayed.
 */

export const PVNC_PATH = '/api/app/remote/pvnc';
const CYPHER = 'AES-256-CBC';
const TOKEN_TTL_MS = 60 * 1000; // the browser must connect within a minute

function pvncKey() {
  const secret = process.env.JWT_SECRET || 'insecure-dev-secret';
  return createHash('sha256').update(`${secret}|pvnc-tunnel`).digest('base64').slice(0, 32);
}

/** Encrypts the target + credentials into an opaque token for the browser. */
export function buildPvncToken(target) {
  const iv = randomBytes(16);
  const cipher = createCipheriv(CYPHER, pvncKey(), iv);
  const payload = JSON.stringify({ ...target, exp: Date.now() + TOKEN_TTL_MS });
  const value = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const data = { iv: iv.toString('base64'), value: value.toString('base64') };
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

function openPvncToken(token) {
  try {
    const { iv, value } = JSON.parse(Buffer.from(String(token), 'base64').toString('utf8'));
    const decipher = createDecipheriv(CYPHER, pvncKey(), Buffer.from(iv, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(value, 'base64')), decipher.final()]);
    const parsed = JSON.parse(out.toString('utf8'));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

let started = false;

/** Attaches the PortalVNC WebSocket bridge to the portal HTTP server. */
export function initPvncTunnel(server) {
  if (started) return;
  started = true;
  const wss = new WebSocketServer({ server, path: PVNC_PATH });

  wss.on('connection', async (ws, req) => {
    const token = new URL(req.url, 'http://localhost').searchParams.get('token');
    const target = openPvncToken(token);
    if (!target) { try { ws.close(1008, 'invalid token'); } catch { /* ignore */ } return; }

    const identity = await pvncIdentity().catch(() => null);
    if (!identity) { try { ws.close(1011, 'portal vnc not configured'); } catch { /* ignore */ } return; }

    let agent;
    try {
      agent = await connectAgent({
        host: target.host,
        port: target.port,
        username: target.username,
        domain: target.domain,
        password: target.password,
        ca: identity.ca,
        cert: identity.cert,
        key: identity.key,
        timeout: 10000,
      });
    } catch (e) {
      try { ws.close(1011, String(e.code || e.message).slice(0, 120)); } catch { /* ignore */ }
      return;
    }

    // Relay: browser WS (binary RFB) <-> agent TLS (raw RFB), with backpressure.
    ws.on('message', (data) => { if (agent.writable) agent.write(data); });

    const HIGH = 8 * 1024 * 1024, LOW = 1 * 1024 * 1024;
    let drainTimer = null;
    agent.on('data', (chunk) => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(chunk);
      if (ws.bufferedAmount > HIGH && !drainTimer) {
        agent.pause();
        drainTimer = setInterval(() => {
          if (ws.readyState !== ws.OPEN || ws.bufferedAmount < LOW) {
            clearInterval(drainTimer); drainTimer = null; agent.resume();
          }
        }, 50);
      }
    });

    const shutdown = () => {
      if (drainTimer) { clearInterval(drainTimer); drainTimer = null; }
      try { agent.destroy(); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
    };
    ws.on('close', shutdown);
    ws.on('error', shutdown);
    agent.on('close', shutdown);
    agent.on('error', shutdown);
  });

  console.log(`PortalVNC tunnel ready on ${PVNC_PATH}`);
}
