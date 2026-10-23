import '../test-fixtures/test-env.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, openSync, closeSync, ftruncateSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// The journal of a refused package must not reach any real database: a closed port.
process.env.POSTGRES_HOST = '127.0.0.1';
process.env.POSTGRES_PORT = '9';
process.env.POSTGRES_PASSWORD = 'none';
const { writeZip } = await import('../platform/packages/zip.js');
const { PACKAGE_LIMITS } = await import('../platform/packages/archive.js');
const { normalizeManifest } = await import('../platform/packages/manifestFile.js');
const { requestRestart, resetRestart, setRestartHandler } = await import('../platform/packages/restart.js');

/*
 * «Пакеты на сервере» (docs/module-packages.md «Packages on the server»): the
 * list of $MODULES_DIR/incoming (plain *.zip files only), reading a file
 * safely, staging it through the upload's path (same refusals), the move to
 * incoming/installed/ and who may do it. No database:
 * module-packages.db.test.js installs a signed package from incoming/.
 */

let root;
let incoming;
const manifest = { id: 'hello', name: { en: 'Hello', ru: 'Привет' }, version: '1.2.3', core: '1.0.0', category: 'work' };
// Not signed: listed with its name and version, refused at «Установить» like the same file uploaded.
const zipBytes = writeZip([{ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) }]);

before(() => {
  root = mkdtempSync(join(tmpdir(), 'portal-pkg-incoming-'));
  process.env.MODULES_DIR = join(root, 'modules');
  delete process.env.MODULES_DEV;
  incoming = join(root, 'modules', 'incoming');
  mkdirSync(join(incoming, 'sub'), { recursive: true });
  writeFileSync(join(incoming, 'hello-1.2.3.zip'), zipBytes);
  writeFileSync(join(incoming, 'garbage.zip'), 'not a zip at all');
  writeFileSync(join(incoming, 'notes.txt'), 'x');
  writeFileSync(join(incoming, '.hidden.zip'), zipBytes);
  writeFileSync(join(incoming, 'empty.zip'), '');
  writeFileSync(join(incoming, 'sub', 'nested.zip'), zipBytes);
  mkdirSync(join(incoming, 'folder.zip'));
  symlinkSync(join(incoming, 'hello-1.2.3.zip'), join(incoming, 'link.zip'));
  writeFileSync(join(root, 'outside.zip'), zipBytes);
  symlinkSync(join(root, 'outside.zip'), join(incoming, 'outside.zip'));
  // Sparse: one byte above the upload cap without writing 50 MB.
  const fd = openSync(join(incoming, 'big.zip'), 'w');
  ftruncateSync(fd, PACKAGE_LIMITS.maxUploadBytes + 1);
  closeSync(fd);
});

after(async () => {
  resetRestart();
  await (await import('../config/database.js')).closePool().catch(() => {});
  rmSync(root, { recursive: true, force: true });
});

test('list: plain *.zip files directly in incoming/ only — links, folders, sub-folders, hidden, empty and oversize files are left out', async () => {
  const { listIncoming } = await import('../platform/packages/incoming.js');
  const files = listIncoming();
  assert.deepEqual(files.map((item) => item.file).sort(), ['garbage.zip', 'hello-1.2.3.zip']);
  const hello = files.find((item) => item.file === 'hello-1.2.3.zip');
  assert.equal(hello.bytes, zipBytes.length);
  assert.equal(hello.id, 'hello');
  assert.equal(hello.version, '1.2.3');
  assert.deepEqual(hello.name, { en: 'Hello', ru: 'Привет' });
  assert.ok(!Number.isNaN(Date.parse(hello.modifiedAt)));
  const garbage = files.find((item) => item.file === 'garbage.zip');
  assert.equal(garbage.version, null, 'not readable: listed without a version, refused at «Установить»');
});

test('list: incoming/ that is a link, or missing, gives an empty list', async () => {
  const { listIncoming } = await import('../platform/packages/incoming.js');
  const saved = process.env.MODULES_DIR;
  const other = join(root, 'other');
  mkdirSync(other);
  symlinkSync(incoming, join(other, 'incoming'));
  try {
    process.env.MODULES_DIR = other;
    assert.deepEqual(listIncoming(), []);
    process.env.MODULES_DIR = join(root, 'nothing-here');
    assert.deepEqual(listIncoming(), []);
  } finally {
    process.env.MODULES_DIR = saved;
  }
});

test('read: refuses links, folders, paths, other names and files above the upload cap', async () => {
  const { readIncoming } = await import('../platform/packages/incoming.js');
  const { buffer, sha256 } = readIncoming('hello-1.2.3.zip');
  assert.deepEqual(buffer, zipBytes);
  assert.equal(sha256, createHash('sha256').update(zipBytes).digest('hex'));
  for (const name of ['link.zip', 'outside.zip', 'folder.zip', 'sub/nested.zip', '../outside.zip', 'notes.txt', '.hidden.zip', 'missing.zip', '', null, 42, { file: 'x' }]) {
    assert.throws(() => readIncoming(name), (err) => err.statusCode === 404 && err.code === 'INCOMING_NOT_FOUND', String(name));
  }
  assert.throws(() => readIncoming('big.zip'), (err) => err.statusCode === 413 && err.code === 'FILE_TOO_LARGE');
});

test('after an install the file moves to incoming/installed/ — only while it holds the installed bytes', async () => {
  const { archiveIncoming, listIncoming } = await import('../platform/packages/incoming.js');
  writeFileSync(join(incoming, 'move-me.zip'), zipBytes);
  const sha = createHash('sha256').update(zipBytes).digest('hex');
  assert.equal(archiveIncoming('move-me.zip', 'f'.repeat(64)), null, 'replaced since the check: stays');
  assert.ok(existsSync(join(incoming, 'move-me.zip')));
  const moved = archiveIncoming('move-me.zip', sha);
  assert.equal(moved, join(incoming, 'installed', 'move-me.zip'));
  assert.ok(!existsSync(join(incoming, 'move-me.zip')));
  assert.deepEqual(readFileSync(moved), zipBytes);
  assert.ok(!listIncoming().some((item) => item.file === 'move-me.zip'), 'installed/ is not listed');
  assert.equal(archiveIncoming('gone.zip', sha), null, 'a missing file is not an error');
});

test('the id «incoming» is reserved: no package may take the folder’s name', () => {
  const { problems } = normalizeManifest({ ...manifest, id: 'incoming' });
  assert.ok(problems.some((item) => /reserved/.test(item)));
});

// ── HTTP: superadmin only, same path as an upload ──────────────────────────

async function http(path, { as = {}, ...init } = {}) {
  const express = (await import('express')).default;
  const { packageRoutes } = await import('../platform/packages/routes.js');
  const app = express();
  app.use(express.json());
  // What the session middleware resolves; requireAuth takes an already resolved user.
  app.use((req, _res, next) => {
    req.userRow = { id: 1, username: 'tester', is_active: true };
    req.access = { permissions: new Set(as.permissions || ['*']) };
    if (as.apiToken) req.apiToken = { id: 1 };
    if (as.imp) req.auth = { imp: 2 };
    next();
  });
  app.use('/api', packageRoutes());
  const server = createServer(app);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const stage = (file, as) => http('/api/admin/modules/incoming/stage', { as, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }) });

test('http: superadmin lists the folder; settings admins and others are refused', async () => {
  const ok = await http('/api/admin/modules/incoming');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.files.map((item) => item.file).sort(), ['garbage.zip', 'hello-1.2.3.zip']);
  assert.equal(ok.body.maxUploadMb, PACKAGE_LIMITS.maxUploadBytes / 1024 / 1024);
  for (const permissions of [['settings.view', 'settings.modules', 'console.access'], []]) {
    const refused = await http('/api/admin/modules/incoming', { as: { permissions } });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, 'SUPERADMIN_ONLY');
    assert.equal((await stage('hello-1.2.3.zip', { permissions })).body.code, 'SUPERADMIN_ONLY');
  }
});

test('http: staging needs the superadmin’s own session (no API token, no «sign in as»)', async () => {
  assert.equal((await stage('hello-1.2.3.zip', { apiToken: true })).body.code, 'SESSION_REQUIRED');
  assert.equal((await stage('hello-1.2.3.zip', { imp: true })).status, 403);
});

test('http: staging a server file gives the upload’s answers — the same refusal for the same bytes', async () => {
  const fromServer = await stage('hello-1.2.3.zip');
  assert.equal(fromServer.status, 422);
  assert.equal(fromServer.body.code, 'BAD_PACKAGE');
  assert.equal(fromServer.body.problems[0].message.ru, 'Файл повреждён или выпущен не нами');
  const form = new FormData();
  form.append('file', new Blob([zipBytes]), 'hello-1.2.3.zip');
  const uploaded = await http('/api/admin/modules/packages/upload', { method: 'POST', body: form });
  assert.equal(uploaded.status, fromServer.status);
  assert.deepEqual(uploaded.body.problems, fromServer.body.problems);
  assert.equal((await stage('garbage.zip')).body.code, 'BAD_PACKAGE');
  // Not in the folder / not a plain file / too large.
  assert.equal((await stage('link.zip')).status, 404);
  assert.equal((await stage('../outside.zip')).status, 404);
  assert.equal((await stage('big.zip')).body.code, 'FILE_TOO_LARGE');
});

test('http: refused (409) while a restart is pending, like an upload', async () => {
  setRestartHandler(null);
  resetRestart();
  try {
    requestRestart('install hello 1.0.0', { delayMs: 2_000_000_000 });
    const res = await stage('hello-1.2.3.zip');
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'RESTART_PENDING');
  } finally {
    resetRestart();
  }
});
