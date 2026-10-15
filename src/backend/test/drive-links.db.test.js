import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

/*
 * Permissions of public drive links, end to end through the public routes:
 * every permission is enforced per route, file requests cannot list, a link
 * never grants more than its author's file-server rights, clashes are renamed
 * for upload-only visitors, limits and quotas hold, turning a link off ends
 * visitor sessions, existing links keep their behaviour and paths stay inside
 * the link. The SMB gateway is replaced by test-fixtures/mock-smbgate.mjs (a
 * local folder behind the same protocol). Needs a test database (never
 * production!):
 *
 *   DRIVE_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/drive-links.db.test.js
 *
 * Without DRIVE_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.DRIVE_DB_TEST === '1';
const skip = enabled ? false : 'set DRIVE_DB_TEST=1 and a test database to run';

const root = enabled ? mkdtempSync(join(tmpdir(), 'drive-links-')) : '';
const aclFile = join(root, 'acl.json');
const ACL = { known: true, users: { svc: { password: 'pw1', write: true, delete: true } } };
const setAcl = (patch) => writeFileSync(aclFile, JSON.stringify({ ...ACL, ...patch, users: { svc: { ...ACL.users.svc, ...(patch.svc || {}) } } }));

let db = null;
let server = null;
let base = '';
let originalModules = null;
const cleanup = { users: [], servers: [] };

after(async () => {
  if (server) server.close();
  if (db) {
    const { setSetting } = await import('../services/settings.js');
    // Activity rows are written after each response: give the last ones a moment.
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (cleanup.users.length) {
      // Refused visits (a turned-off link) carry the start of the token instead of the link id.
      const { rows } = await db.query(`SELECT LEFT(token, 8) AS token FROM drive_links WHERE created_by = ANY($1)`, [cleanup.users]);
      await db.query(
        `DELETE FROM drive_activity WHERE user_id = ANY($1) OR link_id IN (SELECT id FROM drive_links WHERE created_by = ANY($1))
           OR (via = 'link' AND link_id IS NULL AND details->>'token' = ANY($2))`,
        [cleanup.users, rows.map((row) => row.token)]
      );
    }
    if (cleanup.servers.length) await db.query(`DELETE FROM drive_servers WHERE id = ANY($1)`, [cleanup.servers]);
    if (cleanup.users.length) {
      await db.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [cleanup.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [cleanup.users]);
    }
    if (originalModules !== null) await setSetting('modules', originalModules);
    else await db.query(`DELETE FROM app_settings WHERE key = 'modules'`);
    const { stopGate } = await import('../modules/drive/gate.js');
    stopGate();
    await db.closePool();
  }
  if (root) rmSync(root, { recursive: true, force: true });
});

async function setDrive(settings = {}) {
  const { setSetting, getSettings, parseSettings } = await import('../services/settings.js');
  const { sanitizeModules } = await import('../modules/catalog.js');
  const parsed = parseSettings(await getSettings({ fresh: true }));
  await setSetting('modules', JSON.stringify(sanitizeModules(parsed.modules, { drive: { enabled: true, settings: { publicLinks: true, linkWrite: true, requireWritePassword: false, linkAudience: 'any', requireLinkPassword: false, maxLinkDays: 0, ...settings } } })));
}

/** A visitor request: { status, body } (JSON) or the raw response. */
async function call(method, path, { token, query = {}, json, bytes, headers = {} } = {}) {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const init = { method, headers: { ...headers } };
  if (token) init.headers['X-Link-Token'] = token;
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (bytes !== undefined) {
    init.headers['Content-Type'] = 'application/octet-stream';
    init.body = bytes;
  }
  const res = await fetch(url, init);
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}

const share = (...parts) => join(root, 'Data', ...parts);

test('database: public drive link permissions', { skip, timeout: 120000 }, async () => {
  process.env.SMBGATE_PYTHON = fileURLToPath(new URL('../test-fixtures/mock-smbgate.mjs', import.meta.url));
  process.env.MOCK_SMB_ROOT = root;
  process.env.MOCK_SMB_ACL = aclFile;
  setAcl({});
  mkdirSync(share('Clients', 'Acme'), { recursive: true });
  mkdirSync(share('Other'), { recursive: true });
  writeFileSync(share('Clients', 'a.txt'), 'hello');
  writeFileSync(share('Clients', '.secret'), 'hidden');
  writeFileSync(share('Clients', 'Acme', 'plan.pdf'), '%PDF-1.4 plan');
  writeFileSync(share('Other', 'salaries.xlsx'), 'secret');

  db = await import('../config/database.js');
  const { getSetting } = await import('../services/settings.js');
  originalModules = await getSetting('modules', null);
  const { ensureDriveSchema } = await import('../modules/drive/schema.js');
  await ensureDriveSchema();
  await setDrive();
  const { seal } = await import('../services/crypto.js');
  const links = await import('../modules/drive/links.js');
  const { publicRoutes } = await import('../modules/drive/routes.js');
  const express = (await import('express')).default;

  const name = `dl${Date.now().toString(36)}`;
  const { rows: users } = await db.query(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES ($1, $2, '!', 'user', $1) RETURNING id`, [name, `${name}@test.invalid`]);
  const userId = users[0].id;
  cleanup.users.push(userId);
  const { rows: servers } = await db.query(
    `INSERT INTO drive_servers (name, host, auth, use_login, service_user, service_secret) VALUES ('Mock', 'mock.invalid', 'service', FALSE, 'svc', $1) RETURNING id`,
    [seal('pw1')]
  );
  cleanup.servers.push(servers[0].id);
  const { rows: shares } = await db.query(`INSERT INTO drive_shares (server_id, title, share, allow_links) VALUES ($1, 'Data', 'Data', TRUE) RETURNING id`, [servers[0].id]);
  const shareId = shares[0].id;
  const ctx = { userId, groupIds: new Set(), isAdmin: false };

  const app = express();
  app.set('trust proxy', false);
  app.use(express.json());
  app.use('/api/d', publicRoutes());
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, code: err.code, error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/d`;

  const session = async (token, body = {}, current) => {
    const res = await call('POST', `/${token}/unlock`, { json: body, token: current });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.token;
  };

  // ── Existing links keep their behaviour (migration defaults) ──
  const legacyToken = `legacy${Date.now().toString(36)}`;
  await db.query(
    `INSERT INTO drive_links (token, share_id, path, kind, name, created_by, allow_download, permissions) VALUES ($1, $2, 'Clients', 'dir', 'Clients', $3, FALSE, NULL)`,
    [legacyToken, shareId, userId]
  );
  await ensureDriveSchema();
  const { rows: legacyRows } = await db.query(`SELECT permissions FROM drive_links WHERE token = $1`, [legacyToken]);
  assert.deepEqual(legacyRows[0].permissions, ['view'], 'migrated from allow_download = false');
  let res = await call('GET', `/${legacyToken}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.link.permissions, ['view']);
  assert.deepEqual(res.body.entries.map((entry) => entry.name), ['Acme', 'a.txt'], 'hidden files never show');
  assert.equal((await call('GET', `/${legacyToken}/zip`)).body.code, 'NO_DOWNLOAD');
  assert.equal((await call('GET', `/${legacyToken}/file`, { query: { path: 'a.txt', download: '1' } })).body.code, 'NO_DOWNLOAD');
  assert.equal((await call('GET', `/${legacyToken}/file`, { query: { path: 'a.txt' } })).body.toString(), 'hello', 'viewing works as before');
  let visitor = await session(legacyToken);
  res = await call('PUT', `/${legacyToken}/upload`, { token: visitor, query: { name: 'x.txt' }, bytes: 'x' });
  assert.equal(res.body.code, 'NO_PERMISSION');

  const viewDownload = await links.createLink(ctx, shareId, 'Clients', {});
  assert.deepEqual(viewDownload.permissions, ['view', 'download'], 'the default is view and download');
  assert.equal(viewDownload.allowDownload, true);

  // ── File request (upload only): no listing, auto-rename, my uploads ──
  const request = await links.createLink(ctx, shareId, 'Clients', { permissions: ['upload'], title: 'Documents for Acme', notify: true });
  assert.deepEqual(request.permissions, ['upload']);
  res = await call('GET', `/${request.token}`, { query: { path: 'Acme' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.uploadOnly, true);
  assert.deepEqual(res.body.entries, [], 'a file request never lists the folder');
  assert.equal(res.body.path, '');
  for (const route of ['file', 'thumb', 'preview.pdf', 'cad']) {
    assert.equal((await call('GET', `/${request.token}/${route}`, { query: { path: 'a.txt' } })).body.code, 'NO_PERMISSION', route);
  }
  assert.equal((await call('GET', `/${request.token}/zip`)).body.code, 'NO_DOWNLOAD');
  res = await call('PUT', `/${request.token}/upload`, { query: { name: 'a.txt' }, bytes: 'mine' });
  assert.equal(res.body.code, 'SESSION_REQUIRED', 'no visitor session');
  visitor = await session(request.token);
  res = await call('PUT', `/${request.token}/upload`, { query: { name: 'a.txt', t: visitor }, bytes: 'mine' });
  assert.equal(res.body.code, 'SESSION_REQUIRED', 'the session must come in the header, not the address');
  res = await call('PUT', `/${request.token}/upload`, { token: visitor, query: { name: 'a.txt', conflict: 'replace', path: 'Acme' }, bytes: 'mine' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  // Stored as "a (1).txt" (a clash is renamed, never overwritten), but the visitor gets back the
  // name they sent: "a (1)" would tell them that the folder they cannot see holds "a.txt".
  assert.equal(res.body.entry.name, 'a.txt', 'the name the visitor sent');
  assert.equal(res.body.entry.path, 'a.txt', 'path and conflict are ignored for file requests');
  assert.equal(res.body.replaced, false);
  assert.equal(readFileSync(share('Clients', 'a.txt'), 'utf8'), 'hello');
  assert.equal(readFileSync(share('Clients', 'a (1).txt'), 'utf8'), 'mine');
  res = await call('GET', `/${request.token}/mine`, { token: visitor });
  assert.deepEqual(res.body.uploads.map((item) => item.name), ['a.txt']);
  assert.deepEqual(res.body.uploads.map((item) => item.path), ['a.txt'], 'no stored path either');
  const otherVisitor = await session(request.token);
  assert.deepEqual((await call('GET', `/${request.token}/mine`, { token: otherVisitor })).body.uploads, [], 'another browser sees nothing');
  for (const [method, route, json] of [['POST', 'folders', { name: 'New' }], ['PUT', 'rename', { path: 'a.txt', name: 'b.txt' }], ['POST', 'delete', { paths: ['a.txt'] }]]) {
    assert.equal((await call(method, `/${request.token}/${route}`, { token: visitor, json })).body.code, 'NO_PERMISSION', route);
  }
  assert.equal((await call('PUT', `/${request.token}/replace`, { token: visitor, query: { path: 'a.txt' }, bytes: 'x' })).body.code, 'NO_PERMISSION');
  const { rows: logged } = await db.query(`SELECT action, path, details FROM drive_activity WHERE link_id = $1 AND action = 'upload' AND ok`, [request.id]);
  assert.equal(logged[0].path, 'Clients/a (1).txt');
  assert.equal(logged[0].details.link, 'Documents for Acme');

  // ── Visitor name and e-mail ──
  const named = await links.createLink(ctx, shareId, 'Clients', { permissions: ['upload'], requireEmail: true });
  assert.equal(named.requireName, true);
  visitor = await session(named.token);
  assert.equal((await call('PUT', `/${named.token}/upload`, { token: visitor, query: { name: 'n.txt' }, bytes: 'n' })).body.code, 'VISITOR_REQUIRED');
  assert.equal((await call('POST', `/${named.token}/unlock`, { json: { name: 'Ivan' }, token: visitor })).body.code, 'EMAIL_REQUIRED');
  const introduced = await session(named.token, { name: 'Ivan Petrov', email: 'ivan@example.com' }, visitor);
  assert.equal((await call('PUT', `/${named.token}/upload`, { token: introduced, query: { name: 'n.txt' }, bytes: 'n' })).status, 200);
  assert.deepEqual((await call('GET', `/${named.token}/mine`, { token: introduced })).body.uploads.map((item) => item.name), ['n.txt'], 'adding a name keeps the session');
  const { rows: namedLog } = await db.query(`SELECT details FROM drive_activity WHERE link_id = $1 AND action = 'upload' AND ok`, [named.id]);
  assert.equal(namedLog[0].details.visitor, 'Ivan Petrov');
  assert.equal(namedLog[0].details.visitorEmail, 'ivan@example.com');

  // ── Limits: size, extensions, quota ──
  const limited = await links.createLink(ctx, shareId, 'Clients/Acme', { permissions: ['upload'], maxFileMb: 1, allowedExts: 'pdf', quotaMb: 1 });
  visitor = await session(limited.token);
  const big = Buffer.alloc(1024 * 1024 + 10, 1);
  res = await call('PUT', `/${limited.token}/upload`, { token: visitor, query: { name: 'big.pdf' }, bytes: big });
  assert.equal(res.body.code, 'FILE_TOO_LARGE');
  assert.equal(res.body.info.maxMb, 1);
  assert.equal((await call('PUT', `/${limited.token}/upload`, { token: visitor, query: { name: 'notes.txt' }, bytes: 'x' })).body.code, 'EXT_NOT_ALLOWED');
  const part = Buffer.alloc(600 * 1024, 2);
  assert.equal((await call('PUT', `/${limited.token}/upload`, { token: visitor, query: { name: 'one.PDF' }, bytes: part })).status, 200);
  res = await call('PUT', `/${limited.token}/upload`, { token: visitor, query: { name: 'two.pdf' }, bytes: part });
  assert.equal(res.body.code, 'LINK_QUOTA_EXCEEDED');
  const { rows: used } = await db.query(`SELECT uploaded_bytes FROM drive_links WHERE id = $1`, [limited.id]);
  assert.equal(Number(used[0].uploaded_bytes), part.length, 'a refused upload does not count');
  assert.equal(existsSync(share('Clients', 'Acme', 'two.pdf')), false);

  // ── View + upload: clashes are asked about, replace needs its own right ──
  const viewUpload = await links.createLink(ctx, shareId, 'Clients', { permissions: ['view', 'download', 'upload'] });
  visitor = await session(viewUpload.token);
  res = await call('PUT', `/${viewUpload.token}/upload`, { token: visitor, query: { name: 'a.txt' }, bytes: 'again' });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'EXISTS', 'the default never overwrites');
  assert.equal((await call('PUT', `/${viewUpload.token}/upload`, { token: visitor, query: { name: 'a.txt', conflict: 'replace' }, bytes: 'again' })).body.code, 'NO_PERMISSION');
  res = await call('PUT', `/${viewUpload.token}/upload`, { token: visitor, query: { name: 'a.txt', conflict: 'rename', path: 'Acme' }, bytes: 'again' });
  assert.equal(res.body.entry.path, 'Acme/a.txt');
  assert.equal((await call('PUT', `/${viewUpload.token}/upload`, { token: visitor, query: { name: 'x.txt', path: '../Other' }, bytes: 'x' })).body.code, 'INVALID_PATH');
  assert.equal((await call('PUT', `/${viewUpload.token}/upload`, { token: visitor, query: { name: '..\\x.txt' }, bytes: 'x' })).body.code, 'INVALID_NAME');
  assert.equal((await call('PUT', `/${viewUpload.token}/upload`, { token: visitor, query: { name: 'a:stream' }, bytes: 'x' })).body.code, 'INVALID_NAME');
  assert.equal((await call('PUT', `/${viewUpload.token}/upload`, { token: visitor, query: { name: '~$lock.txt' }, bytes: 'x' })).body.code, 'INVALID_NAME');
  assert.equal((await call('PUT', `/${viewUpload.token}/upload`, { token: visitor, query: { name: 'x.txt', path: '.git' }, bytes: 'x' })).body.code, 'INVALID_NAME');
  assert.equal((await call('GET', `/${viewUpload.token}`, { query: { path: '../Other' } })).body.code, 'INVALID_PATH');
  assert.equal((await call('GET', `/${viewUpload.token}/file`, { query: { path: '..\\Other\\salaries.xlsx' } })).body.code, 'INVALID_PATH');

  // ── Full access: rename, replace, new folder, delete; hidden items stay out of reach ──
  const full = await links.createLink(ctx, shareId, 'Clients', { permissions: ['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete'], notify: true });
  visitor = await session(full.token, { name: 'Anna' });
  res = await call('PUT', `/${full.token}/replace`, { token: visitor, query: { path: 'a.txt' }, bytes: 'v2' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(readFileSync(share('Clients', 'a.txt'), 'utf8'), 'v2');
  res = await call('POST', `/${full.token}/folders`, { token: visitor, json: { path: 'Acme', name: 'Scans' } });
  assert.equal(res.body.entry.path, 'Acme/Scans');
  res = await call('PUT', `/${full.token}/rename`, { token: visitor, json: { path: 'Acme/Scans', name: 'Scans 2026' } });
  assert.equal(res.body.entry.path, 'Acme/Scans 2026');
  assert.equal((await call('PUT', `/${full.token}/rename`, { token: visitor, json: { path: 'a.txt', name: 'a (1).txt' } })).status, 409, 'rename never overwrites');
  assert.equal((await call('PUT', `/${full.token}/rename`, { token: visitor, json: { path: '.secret', name: 'open.txt' } })).body.code, 'ITEM_GONE');
  assert.equal((await call('PUT', `/${full.token}/rename`, { token: visitor, json: { path: '', name: 'Root' } })).body.code, 'INVALID_PATH');
  assert.equal((await call('POST', `/${full.token}/delete`, { token: visitor, json: { paths: ['.secret'] } })).body.code, 'ITEM_GONE');
  assert.equal((await call('POST', `/${full.token}/delete`, { token: visitor, json: { paths: [''] } })).body.code, 'INVALID_PATH');
  assert.equal((await call('POST', `/${full.token}/delete`, { token: visitor, json: { paths: ['../Other/salaries.xlsx'] } })).body.code, 'INVALID_PATH');
  res = await call('POST', `/${full.token}/delete`, { token: visitor, json: { paths: ['Acme/Scans 2026', 'a (1).txt'] } });
  assert.equal(res.body.removed, 2);
  assert.equal(existsSync(share('Clients', 'a (1).txt')), false);
  assert.equal(existsSync(share('Other', 'salaries.xlsx')), true);
  res = await call('POST', `/${full.token}/folders/tree`, { token: visitor, json: { path: '', paths: ['Drop', 'Drop/Inner'] } });
  assert.deepEqual(res.body.folders.map((item) => item.path), ['Drop', 'Drop/Inner']);
  const { rows: deleted } = await db.query(`SELECT path, details FROM drive_activity WHERE link_id = $1 AND action = 'delete' AND ok ORDER BY path`, [full.id]);
  assert.deepEqual(deleted.map((row) => row.path), ['Clients/Acme/Scans 2026', 'Clients/a (1).txt']);
  assert.equal(deleted[0].details.visitor, 'Anna');

  // Permissions per route: a view-only link refuses every change.
  visitor = await session(viewDownload.token);
  for (const [method, route, options] of [
    ['PUT', 'upload', { query: { name: 'z.txt' }, bytes: 'z' }],
    ['PUT', 'replace', { query: { path: 'a.txt' }, bytes: 'z' }],
    ['POST', 'folders', { json: { name: 'Z' } }],
    ['POST', 'folders/tree', { json: { paths: ['Z'] } }],
    ['PUT', 'rename', { json: { path: 'a.txt', name: 'z.txt' } }],
    ['POST', 'delete', { json: { paths: ['a.txt'] } }],
  ]) {
    assert.equal((await call(method, `/${viewDownload.token}/${route}`, { token: visitor, ...options })).body.code, 'NO_PERMISSION', route);
  }

  // ── File links: view, download and replace only ──
  const fileLink = await links.createLink(ctx, shareId, 'Clients/a.txt', { permissions: ['view', 'upload', 'delete', 'replace'] });
  assert.deepEqual(fileLink.permissions, ['view', 'replace']);
  visitor = await session(fileLink.token);
  assert.equal((await call('PUT', `/${fileLink.token}/replace`, { token: visitor, bytes: 'v3' })).status, 200);
  assert.equal(readFileSync(share('Clients', 'a.txt'), 'utf8'), 'v3');
  assert.equal((await call('PUT', `/${fileLink.token}/upload`, { token: visitor, query: { name: 'q.txt' }, bytes: 'q' })).body.code, 'NO_PERMISSION');
  assert.equal((await call('GET', `/${fileLink.token}/file`, { query: { path: 'x' } })).body.code, 'GONE', 'nothing below a file link');

  // ── A link never grants more than its author has ──
  setAcl({ svc: { write: false, delete: false } });
  await assert.rejects(links.createLink(ctx, shareId, 'Clients', { permissions: ['upload'] }), { code: 'GRANT_EXCEEDS' });
  setAcl({ svc: { write: true, delete: false } });
  await assert.rejects(links.createLink(ctx, shareId, 'Clients', { permissions: ['view', 'delete'] }), (err) => err.code === 'GRANT_EXCEEDS' && err.details.missing.includes('delete'));
  await assert.rejects(links.updateLink(ctx, viewUpload.id, { permissions: ['view', 'upload', 'rename'] }), { code: 'GRANT_EXCEEDS' });
  setAcl({ known: false, svc: { write: false } });
  await assert.rejects(links.createLink(ctx, shareId, 'Clients', { permissions: ['upload'] }), { code: 'GRANT_EXCEEDS' }, 'probed with a marker when rights are not reported');
  // Rights taken away after the link was made: the server refuses, the page stays.
  setAcl({ svc: { write: false, delete: false } });
  visitor = await session(full.token);
  res = await call('PUT', `/${full.token}/upload`, { token: visitor, query: { name: 'late.txt' }, bytes: 'x' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'WRITE_DENIED');
  setAcl({});

  // ── Turning a link off (or a new password) ends visitor sessions ──
  visitor = await session(full.token);
  await links.updateLink(ctx, full.id, { revoked: true });
  assert.equal((await call('GET', `/${full.token}`, { token: visitor })).body.code, 'REVOKED');
  await links.updateLink(ctx, full.id, { revoked: false });
  assert.equal((await call('PUT', `/${full.token}/upload`, { token: visitor, query: { name: 'r.txt' }, bytes: 'r' })).body.code, 'SESSION_REQUIRED');
  const locked = await links.createLink(ctx, shareId, 'Clients', { permissions: ['upload'], password: 'open-sesame' });
  assert.equal((await call('POST', `/${locked.token}/unlock`, { json: { password: 'wrong' } })).body.code, 'WRONG_PASSWORD');
  visitor = await session(locked.token, { password: 'open-sesame' });
  assert.equal((await call('GET', `/${locked.token}`, { token: visitor })).status, 200);
  await links.updateLink(ctx, locked.id, { password: 'new-secret' });
  assert.equal((await call('GET', `/${locked.token}`, { token: visitor })).body.code, 'PASSWORD_REQUIRED');

  // ── Administrators: write links off, or only with a password ──
  await setDrive({ linkWrite: false });
  await assert.rejects(links.createLink(ctx, shareId, 'Clients', { permissions: ['upload'] }), { code: 'WRITE_LINKS_DISABLED' });
  assert.equal((await call('GET', `/${request.token}`)).body.code, 'UPLOADS_DISABLED');
  res = await call('GET', `/${full.token}`);
  assert.deepEqual(res.body.link.permissions, ['view', 'download'], 'a full link falls back to reading');
  visitor = await session(full.token);
  assert.equal((await call('PUT', `/${full.token}/upload`, { token: visitor, query: { name: 'w.txt' }, bytes: 'w' })).body.code, 'NO_PERMISSION');
  await setDrive({ requireWritePassword: true });
  await assert.rejects(links.createLink(ctx, shareId, 'Clients', { permissions: ['upload'] }), { code: 'WRITE_PASSWORD_REQUIRED' });
  assert.ok(await links.createLink(ctx, shareId, 'Clients', { permissions: ['upload'], password: 'pass1234' }));
  assert.equal((await call('GET', `/${request.token}`)).body.code, 'UPLOADS_DISABLED', 'old upload links without a password close');
  await assert.rejects(links.updateLink(ctx, locked.id, { password: '' }), { code: 'WRITE_PASSWORD_REQUIRED' });
  await setDrive({});

  // ── The author's account stops working: a clear "temporarily unavailable" ──
  visitor = await session(viewUpload.token);
  setAcl({ svc: { password: 'changed' } });
  res = await call('PUT', `/${viewUpload.token}/upload`, { token: visitor, query: { name: 'late.txt' }, bytes: 'x' });
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'UNAVAILABLE');
  assert.equal(res.body.info.reason, 'credentials');
  setAcl({});

  // No temporary leftovers in the share.
  const leftovers = [];
  const walk = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.name.startsWith('~$')) leftovers.push(join(dir, item.name));
      if (item.isDirectory()) walk(join(dir, item.name));
    }
  };
  walk(share());
  assert.deepEqual(leftovers, []);
});
