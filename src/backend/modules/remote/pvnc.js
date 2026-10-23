import { query } from '../../config/database.js';
import { seal, unseal } from '../../services/crypto.js';
import { httpError } from '../shared/acl.js';
import { requireAdmin } from './service.js';

/*
 * Portal VNC — the portal's mutual-TLS client identity used to connect to
 * PortalVNC agents. A single row (id = 1): the CA that signed the agents, the
 * portal's client certificate, and its (sealed) private key. Admins set these
 * once; the pvnc tunnel reads them to open connections.
 */

const PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;
const PEM_KEY = /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]+-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/;

async function row() {
  const { rows } = await query(`SELECT * FROM remote_pvnc WHERE id = 1`);
  return rows[0] || null;
}

/** Admin view: which parts are set (never returns the private key material). */
export async function getPvnc(ctx) {
  requireAdmin(ctx);
  const r = await row();
  return {
    caCert: r?.ca_cert || '',
    clientCert: r?.client_cert || '',
    hasKey: Boolean(r?.client_key),
    configured: Boolean(r?.ca_cert && r?.client_cert && r?.client_key),
    updatedAt: r?.updated_at || null,
  };
}

/** Admin: store the CA, client certificate and (sealed) client key. */
export async function savePvnc(ctx, input = {}) {
  requireAdmin(ctx);
  const current = await row();
  const caCert = input.caCert === undefined ? current?.ca_cert || '' : String(input.caCert || '').trim();
  const clientCert = input.clientCert === undefined ? current?.client_cert || '' : String(input.clientCert || '').trim();
  if (caCert && !PEM_CERT.test(caCert)) throw httpError(400, 'CA is not a PEM certificate', 'PVNC_BAD_CA');
  if (clientCert && !PEM_CERT.test(clientCert)) throw httpError(400, 'Client certificate is not PEM', 'PVNC_BAD_CERT');
  // The key is write-only: a non-empty value replaces it, '' clears it, undefined keeps it.
  let clientKey;
  if (input.clientKey === undefined) clientKey = current?.client_key || '';
  else if (!input.clientKey) clientKey = '';
  else {
    const key = String(input.clientKey).trim();
    if (!PEM_KEY.test(key)) throw httpError(400, 'Client key is not a PEM private key', 'PVNC_BAD_KEY');
    clientKey = seal(key);
  }
  await query(
    `INSERT INTO remote_pvnc (id, ca_cert, client_cert, client_key, updated_at)
     VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET ca_cert = $1, client_cert = $2, client_key = $3, updated_at = NOW()`,
    [caCert, clientCert, clientKey]
  );
  return getPvnc(ctx);
}

/** True when the portal has a complete client identity for PortalVNC. */
export async function pvncConfigured() {
  const r = await row();
  return Boolean(r?.ca_cert && r?.client_cert && r?.client_key);
}

/** The unsealed { ca, cert, key } PEM for the tunnel. Null when not configured. */
export async function pvncIdentity() {
  const r = await row();
  if (!r?.ca_cert || !r?.client_cert || !r?.client_key) return null;
  const key = unseal(r.client_key, { label: 'portal vnc client key' });
  if (!key) return null;
  return { ca: r.ca_cert, cert: r.client_cert, key };
}
