import tls from 'tls';

/*
 * PortalVNC client handshake — adapted from portal-vnc gateway/pvnc.js
 * (github.com/iSmartyPRO/portal-vnc, GPL-3.0). Opens a mutual-TLS connection to
 * a PortalVNC agent, performs the version/credential handshake, and resolves
 * with the raw (post-auth) TLS socket over which standard RFB then flows —
 * which the portal relays to the browser's noVNC. Mirrors protocol/src/
 * {protocol,handshake}.cpp.
 *
 * This copy takes the CA / client certificate / key as in-memory PEM (the
 * portal keeps them sealed in the database, not as files) and enforces a
 * connect timeout so a dead agent fails fast.
 */

const MAGIC = 0x50564e31; // "PVN1"
const VERSION = 1;

export const REFUSE = {
  0: 'none',
  1: 'protocol version mismatch',
  2: 'authentication failed (bad credentials)',
  3: 'access denied: not a member of Administrators',
  4: 'not allowed (TLS/cert or IP)',
  5: 'bad handshake',
};

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b; }
function field(str) {
  const s = Buffer.from(str || '', 'utf8');
  return Buffer.concat([u16(s.length), s]);
}

// Reads exactly n bytes from a socket (async).
function readN(sock, n) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let have = 0;
    const cleanup = () => {
      sock.removeListener('data', onData);
      sock.removeListener('error', onErr);
      sock.removeListener('close', onClose);
    };
    const onData = (d) => {
      chunks.push(d);
      have += d.length;
      if (have >= n) {
        cleanup();
        const all = Buffer.concat(chunks);
        if (all.length > n) sock.unshift(all.subarray(n)); // leave extra for RFB
        resolve(all.subarray(0, n));
      }
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const onClose = () => { cleanup(); reject(new Error('closed during handshake')); };
    sock.on('data', onData);
    sock.on('error', onErr);
    sock.on('close', onClose);
  });
}

function refuseErr(code) {
  const e = new Error('PortalVNC refused: ' + (REFUSE[code] || code));
  e.code = REFUSE[code] || String(code);
  e.refuse = code;
  return e;
}

/*
 * opts: { host, port, ca, cert, key, username, domain, password, timeout }
 * `ca`/`cert`/`key` are PEM strings/Buffers. Resolves to a connected TLS socket
 * positioned right before RFB. Rejects with an Error whose .code is the refuse
 * string (see REFUSE).
 */
export function connectAgent(opts) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };

    const socket = tls.connect({
      host: opts.host,
      port: opts.port,
      ca: [opts.ca],
      cert: opts.cert,
      key: opts.key,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      // The agent is authenticated by CA trust, not by hostname.
      checkServerIdentity: () => undefined,
    }, async () => {
      try {
        // ClientHello: magic(4) version(2) caps(4)
        const hello = Buffer.alloc(10);
        hello.writeUInt32BE(MAGIC, 0);
        hello.writeUInt16BE(VERSION, 4);
        hello.writeUInt32BE(0, 6);
        socket.write(hello);

        // ServerHello: magic(4) version(2) caps(4) refuse(2)
        const sh = await readN(socket, 12);
        if (sh.readUInt32BE(0) !== MAGIC) throw refuseErr(5);
        const shRefuse = sh.readUInt16BE(10);
        if (shRefuse !== 0) throw refuseErr(shRefuse);

        // Credentials: domain, user, password (each u16 len + utf8)
        socket.write(Buffer.concat([field(opts.domain), field(opts.username), field(opts.password)]));

        // Auth result: refuse(2)
        const ar = await readN(socket, 2);
        const authRefuse = ar.readUInt16BE(0);
        if (authRefuse !== 0) throw refuseErr(authRefuse);

        socket.setTimeout(0); // clear the connect/handshake timeout; RFB flows now
        done(resolve, socket);
      } catch (e) {
        socket.destroy();
        done(reject, e);
      }
    });

    socket.setTimeout(Number(opts.timeout) || 10000, () => {
      socket.destroy();
      done(reject, Object.assign(new Error('PortalVNC agent timeout'), { code: 'timeout' }));
    });
    socket.on('error', (e) => { socket.destroy(); done(reject, e); });
  });
}
