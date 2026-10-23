/*
 * HTTP clients of the package kit: a signed-in session (cookie jar), an API token, anonymous.
 */

export class Client {
  constructor(base, { token = null, name = 'anonymous' } = {}) {
    this.base = base;
    this.token = token;
    this.name = name;
    this.cookies = new Map();
  }

  headers(extra = {}) {
    const headers = { accept: 'application/json', ...extra };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    else if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    return headers;
  }

  keepCookies(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const key = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value) this.cookies.set(key, value);
        else this.cookies.delete(key);
      }
    }
  }

  /** → { status, body, text, type, ms, timeout } — never throws for HTTP errors. */
  async request(method, path, { json, form, timeoutMs = 30_000, raw = false, headers: extraHeaders = {} } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    const headers = this.headers({ ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...extraHeaders });
    try {
      const res = await fetch(`${this.base}${path}`, { method, headers, body: json !== undefined ? JSON.stringify(json) : form, signal: controller.signal, redirect: 'manual' });
      this.keepCookies(res);
      const type = res.headers.get('content-type') || '';
      let text = '';
      let body = null;
      if (type.includes('text/event-stream')) {
        controller.abort(); // a live stream: the status is the answer
      } else if (raw || !type.includes('json')) {
        const buffer = Buffer.from(await res.arrayBuffer());
        text = type.startsWith('text/') ? buffer.toString('utf8').slice(0, 2000) : `<${buffer.length} bytes ${type}>`;
      } else {
        text = await res.text();
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      return { status: res.status, body, text: text.slice(0, 2000), type, ms: Date.now() - started, timeout: false };
    } catch (err) {
      if (err.name === 'AbortError') return { status: 0, body: null, text: '', type: '', ms: Date.now() - started, timeout: true };
      return { status: 0, body: null, text: String(err.message), type: '', ms: Date.now() - started, timeout: false, error: err.message };
    } finally {
      clearTimeout(timer);
    }
  }

  get(path, options) {
    return this.request('GET', path, options);
  }
  post(path, json, options) {
    return this.request('POST', path, { ...options, json });
  }
  put(path, json, options) {
    return this.request('PUT', path, { ...options, json });
  }
  del(path, options) {
    return this.request('DELETE', path, options);
  }

  /** Multipart upload of one file (field `file`). */
  async upload(path, buffer, filename, type = 'application/zip') {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type }), filename);
    return this.request('POST', path, { form, timeoutMs: 180_000 });
  }

  /** Signs in with a password; throws when refused. */
  async login(username, password) {
    const res = await this.post('/api/auth/login', { username, password });
    if (res.status !== 200 || !res.body?.success) throw new Error(`sign-in of ${username} failed: ${res.status} ${res.text.slice(0, 200)}`);
    this.name = username;
    return res.body.user;
  }
}

/** Throws with the answer when it is not 2xx + success. */
export function expectOk(res, what) {
  if (res.status >= 200 && res.status < 300 && res.body?.success !== false) return res.body;
  const detail = res.body ? `${res.body.code || ''} ${res.body.error || ''} ${JSON.stringify(res.body.problems || '').slice(0, 300)}` : res.text.slice(0, 300);
  throw new Error(`${what}: HTTP ${res.status}${res.timeout ? ' (timeout)' : ''} ${detail}`.trim());
}

/**
 * A WebSocket upgrade request to `path` of `base` (the kit backend, plain HTTP): the status line of the answer
 * (101 = upgraded, then the socket is closed at once), 0 when the server closed the connection without one.
 * Never sends WebSocket frames: it only shows who answers the upgrade (e.g. a package's ctx.onHttpServer hook).
 */
export async function upgradeStatus(base, path, { timeoutMs = 10_000, headers = {} } = {}) {
  const { connect } = await import('node:net');
  const url = new URL(path, base);
  return new Promise((resolvePromise) => {
    const socket = connect(Number(url.port || 80), url.hostname);
    let data = '';
    let done = false;
    const finish = (status) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolvePromise(status);
    };
    const timer = setTimeout(() => finish(-1), timeoutMs);
    socket.on('connect', () => {
      const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('');
      socket.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${Buffer.from('package-kit-probe').toString('base64')}\r\n${extra}\r\n`);
    });
    socket.on('data', (chunk) => {
      data += chunk;
      const m = /^HTTP\/1\.[01] (\d{3})/.exec(data);
      if (m) finish(Number(m[1]));
    });
    socket.on('error', () => finish(0));
    socket.on('close', () => finish(0));
  });
}
