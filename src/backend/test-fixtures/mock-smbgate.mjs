#!/usr/bin/env node
/*
 * A stand-in for gateway/smbgate.py in tests: the same protocol (HTTP over a
 * Unix socket, X-Gate-Key, base64 JSON parameters in X-Gate), backed by a
 * local folder instead of an SMB server. Start it through gate.js with
 *
 *   SMBGATE_PYTHON=<this file>  MOCK_SMB_ROOT=<dir>  MOCK_SMB_ACL=<json file>
 *
 * gate.js runs `<SMBGATE_PYTHON> <smbgate.py> <socket>`, so the socket is the
 * second argument. Shares are folders under MOCK_SMB_ROOT. The ACL file is
 * read on every request, so a test can change rights or passwords on the fly:
 *
 *   { "known": true, "users": { "svc": { "password": "x", "write": true, "delete": true } } }
 *
 * Names starting with "." or "~$" count as hidden (like the real gateway's
 * hidden attribute and temporary names).
 */
import { createWriteStream, existsSync, readFileSync, unlinkSync } from 'fs';
import { mkdir, readdir, rename, rm, stat, unlink } from 'fs/promises';
import http from 'http';
import { join } from 'path';
import { createReadStream } from 'fs';

const socketPath = process.argv[3] || process.argv[2];
const root = process.env.MOCK_SMB_ROOT;
const KEY = process.env.SMBGATE_KEY;
const TEMP = '~$portal-';

class GateError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const acl = () => JSON.parse(readFileSync(process.env.MOCK_SMB_ACL, 'utf8'));

function account(req) {
  const user = acl().users?.[req.cred?.username];
  if (!user || user.password !== req.cred?.password) throw new GateError(401, 'AUTH_FAILED', 'Logon failure');
  return user;
}

function parts(path) {
  const list = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean);
  for (const part of list) if (part === '.' || part === '..' || /[:*?"<>|]/.test(part)) throw new GateError(400, 'INVALID_PATH', 'Invalid path');
  return list;
}

function cleanName(name) {
  const value = String(name || '').trim();
  if (!value || value === '.' || value === '..' || value.endsWith('.') || /[\\/:*?"<>|]/.test(value)) throw new GateError(400, 'INVALID_NAME', 'Invalid name');
  return value;
}

function local(req, path = req.path, extra) {
  const share = String(req.share || '');
  if (!share || /[\\/]/.test(share)) throw new GateError(400, 'INVALID_SHARE', 'Invalid share');
  const base = join(root, share);
  if (!existsSync(base)) throw new GateError(404, 'SHARE_NOT_FOUND', 'No share');
  return join(base, ...parts(path), ...(extra ? [extra] : []));
}

const hidden = (name) => name.startsWith('.') || name.startsWith('~$');

async function shape(name, file) {
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new GateError(404, 'NOT_FOUND', 'Not found');
  }
  return { name, dir: info.isDirectory(), size: info.isDirectory() ? 0 : info.size, mtime: info.mtimeMs / 1000, ctime: info.ctimeMs / 1000, hidden: hidden(name), readonly: false };
}

function rights(user) {
  if (acl().known === false) return { read: true, write: true, delete: true, known: false };
  return { read: true, write: Boolean(user.write), delete: Boolean(user.delete), known: true };
}

const needWrite = (user) => {
  if (!user.write) throw new GateError(403, 'ACCESS_DENIED', 'Access denied');
};
const needDelete = (user) => {
  if (!user.delete) throw new GateError(403, 'ACCESS_DENIED', 'Access denied');
};

async function freeName(folder, name, first = 2) {
  const taken = new Set((await readdir(folder).catch(() => [])).map((item) => item.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let index = first; index < 1000; index += 1) {
    const candidate = `${stem} (${index})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new GateError(409, 'EXISTS', 'Name taken');
}

const last = (path) => parts(path).slice(-1)[0] || '';

const OPS = {
  auth: async (req) => (account(req), { ok: true }),
  probe: async (req) => {
    const user = account(req);
    return { entry: await shape(last(req.path), local(req)), access: rights(user), volume: req.volume ? { total: 1e12, free: 5e11 } : undefined };
  },
  list: async (req) => {
    const user = account(req);
    const folder = local(req);
    const names = await readdir(folder).catch(() => {
      throw new GateError(404, 'NOT_FOUND', 'Not found');
    });
    return { entries: await Promise.all(names.map((name) => shape(name, join(folder, name)))), access: rights(user) };
  },
  stat: async (req) => {
    const user = account(req);
    return { entry: await shape(last(req.path), local(req)), access: req.access ? rights(user) : undefined };
  },
  checkwrite: async (req) => {
    const user = account(req);
    if (acl().known !== false) return rights(user);
    // Like the real gateway without "maximal access": try a marker.
    return { read: true, write: Boolean(user.write), delete: Boolean(user.write && user.delete), known: true, probed: true };
  },
  mkdir: async (req) => {
    const user = account(req);
    needWrite(user);
    const folder = local(req);
    let name = cleanName(req.name);
    if (req.unique) name = await freeName(folder, name);
    await mkdir(join(folder, name)).catch((err) => {
      throw err.code === 'EEXIST' ? new GateError(409, 'EXISTS', 'Exists') : new GateError(404, 'NOT_FOUND', err.message);
    });
    return { entry: await shape(name, join(folder, name)) };
  },
  mkdirs: async (req, body) => {
    const user = account(req);
    const dirs = JSON.parse(body.toString('utf8') || '{}').dirs || [];
    const results = [];
    for (const raw of dirs) {
      try {
        needWrite(user);
        const target = local(req, [...parts(req.path), ...parts(raw)].join('/'));
        const existed = existsSync(target);
        await mkdir(target, { recursive: true });
        results.push({ created: !existed, error: null });
      } catch (err) {
        results.push({ created: false, error: err.code || 'GATE_ERROR' });
      }
    }
    return { results };
  },
  rename: async (req) => {
    const user = account(req);
    needWrite(user);
    needDelete(user);
    const list = parts(req.path);
    const source = local(req);
    const name = cleanName(req.name);
    await shape(list.at(-1), source);
    const target = local(req, list.slice(0, -1).join('/'), name);
    if (existsSync(target) && name.toLowerCase() !== list.at(-1).toLowerCase()) throw new GateError(409, 'EXISTS', 'Exists');
    await rename(source, target);
    return { entry: await shape(name, target) };
  },
  delete: async (req) => {
    const user = account(req);
    needDelete(user);
    let removed = 0;
    for (const item of req.items || [req.path]) {
      if (!parts(item).length) throw new GateError(400, 'INVALID_PATH', 'Cannot delete the root');
      const target = local(req, item);
      await shape('', target);
      await rm(target, { recursive: true, force: true });
      removed += 1;
    }
    return { removed };
  },
};

async function readOp(req, res) {
  account(req);
  const file = local(req);
  const info = await shape(last(req.path), file);
  if (info.dir) throw new GateError(400, 'IS_A_FOLDER', 'Folder');
  const start = Number(req.start || 0);
  const end = req.end !== undefined ? Number(req.end) : Math.max(0, info.size - 1);
  const length = info.size ? end - start + 1 : 0;
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(length), 'X-Size': String(info.size), 'X-Mtime': String(Math.floor(info.mtime)) });
  if (!length) return res.end();
  createReadStream(file, { start, end }).pipe(res);
}

async function writeOp(req, httpReq, res) {
  const user = account(req);
  needWrite(user);
  const folder = local(req);
  const name = cleanName(req.name);
  const conflict = req.conflict || 'rename';
  const exists = existsSync(join(folder, name));
  let targetName = name;
  if (exists) {
    if (conflict === 'fail') throw new GateError(409, 'EXISTS', 'Exists');
    if (conflict === 'rename') targetName = await freeName(folder, name, req.renameFrom === 1 ? 1 : 2);
    if (conflict === 'replace') needDelete(user);
  }
  const temp = join(folder, `${TEMP}${Math.random().toString(16).slice(2)}.tmp`);
  const length = Number(httpReq.headers['content-length'] || 0);
  await new Promise((resolve, reject) => {
    const out = createWriteStream(temp);
    let written = 0;
    httpReq.on('data', (chunk) => {
      written += chunk.length;
    });
    httpReq.on('aborted', () => reject(new GateError(400, 'UPLOAD_ABORTED', 'Upload interrupted')));
    httpReq.on('close', () => {
      if (written < length) reject(new GateError(400, 'UPLOAD_ABORTED', 'Upload interrupted'));
    });
    out.on('finish', () => (written < length ? reject(new GateError(400, 'UPLOAD_ABORTED', 'Upload interrupted')) : resolve()));
    out.on('error', reject);
    httpReq.pipe(out);
  }).catch(async (err) => {
    await unlink(temp).catch(() => {});
    throw err;
  });
  await rename(temp, join(folder, targetName));
  return { entry: await shape(targetName, join(folder, targetName)), replaced: exists && conflict === 'replace' };
}

function body(httpReq) {
  return new Promise((resolve) => {
    const chunks = [];
    httpReq.on('data', (chunk) => chunks.push(chunk));
    httpReq.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const server = http.createServer(async (httpReq, res) => {
  const fail = (err) => {
    if (res.headersSent) return res.destroy();
    const status = err instanceof GateError ? err.status : 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message, code: err.code || 'GATE_ERROR' }));
  };
  try {
    if (httpReq.headers['x-gate-key'] !== KEY) throw new GateError(403, 'BAD_KEY', 'Bad key');
    const op = httpReq.url.slice(1);
    const req = JSON.parse(Buffer.from(String(httpReq.headers['x-gate'] || ''), 'base64').toString('utf8') || '{}');
    if (op === 'read') return await readOp(req, res);
    if (op === 'write') {
      const result = await writeOp(req, httpReq, res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }
    const handler = OPS[op];
    if (!handler) throw new GateError(404, 'UNKNOWN_OP', op);
    const result = await handler(req, await body(httpReq));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    // Drain what is left of an upload so the client sees the answer.
    httpReq.resume();
    fail(err);
  }
});

try {
  unlinkSync(socketPath);
} catch {
  /* not there */
}
server.listen(socketPath, () => {
  process.stdout.write('smbgate ready\n');
});
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
