import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { httpError } from '../shared/acl.js';

/*
 * Client for the SMB gateway (gateway/smbgate.py).
 *
 * The gateway is a child process started on first use and restarted if it
 * dies. It listens on a private Unix socket and accepts only requests that
 * carry the random key generated here. Credentials travel with each request;
 * nothing about them is kept on disk by the gateway.
 */

const SCRIPT = fileURLToPath(new URL('./gateway/smbgate.py', import.meta.url));
const key = randomBytes(24).toString('hex');
const socketPath = join(tmpdir(), `smbgate-${process.pid}-${randomBytes(4).toString('hex')}.sock`);

let child = null;
let starting = null;

function start() {
  if (starting) return starting;
  starting = new Promise((resolve, reject) => {
    const proc = spawn(process.env.SMBGATE_PYTHON || 'python3', [SCRIPT, socketPath], {
      env: { ...process.env, SMBGATE_KEY: key, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        reject(httpError(503, 'The file server gateway did not start', 'GATEWAY_DOWN'));
      }
    }, 15000);
    proc.stdout.on('data', (chunk) => {
      if (!settled && String(chunk).includes('smbgate ready')) {
        settled = true;
        clearTimeout(timer);
        child = proc;
        resolve(proc);
      }
    });
    proc.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) console.warn(`[smbgate] ${text.slice(0, 2000)}`);
    });
    proc.on('error', (err) => {
      console.error('SMB gateway failed to start:', err.message);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(httpError(503, 'The file server gateway is not available', 'GATEWAY_DOWN'));
      }
    });
    proc.on('exit', (code) => {
      if (child === proc) child = null;
      starting = null;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(httpError(503, 'The file server gateway is not available', 'GATEWAY_DOWN'));
      } else if (code) {
        console.warn(`SMB gateway exited (${code}); it restarts on the next request`);
      }
    });
  }).catch((err) => {
    starting = null;
    throw err;
  });
  return starting;
}

async function ready() {
  if (child && child.exitCode === null) return;
  await start();
}

export function stopGate() {
  if (child) child.kill();
}
process.once('exit', stopGate);

/** Low-level request; resolves with the raw response (status 200) or rejects with a coded error. */
export async function gateRequest(op, params, { body, length, signal } = {}) {
  await ready();
  return new Promise((resolve, reject) => {
    const headers = {
      'X-Gate-Key': key,
      'X-Gate': Buffer.from(JSON.stringify(params)).toString('base64'),
      'Content-Length': String(length ?? (Buffer.isBuffer(body) ? body.length : 0)),
    };
    const req = http.request({ socketPath, path: `/${op}`, method: 'POST', headers, signal }, (res) => {
      if (res.statusCode === 200) {
        resolve(res);
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let payload = {};
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          /* keep empty */
        }
        // SMB auth failures (401 from the gateway) must not read as a portal sign-out.
        const status = res.statusCode === 401 ? 403 : res.statusCode || 502;
        const error = httpError(status, payload.error || 'File server error', payload.code || 'SMB_ERROR');
        error.smb = true;
        reject(error);
      });
    });
    req.on('error', (err) => {
      if (err.name === 'AbortError') return reject(err);
      reject(httpError(503, `The file server gateway is not available: ${err.message}`, 'GATEWAY_DOWN'));
    });
    if (body && typeof body.pipe === 'function') body.pipe(req);
    else req.end(body || undefined);
  });
}

/** JSON operation. */
export async function gateCall(op, params) {
  const res = await gateRequest(op, params);
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Whole file into memory (previews, conversions): capped. */
export async function gateReadAll(params, max = 200 * 1024 * 1024) {
  const res = await gateRequest('read', params);
  const size = Number(res.headers['x-size'] || 0);
  if (size > max) {
    res.destroy();
    throw httpError(413, 'The file is too large for a preview', 'TOO_LARGE');
  }
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return Buffer.concat(chunks);
}
