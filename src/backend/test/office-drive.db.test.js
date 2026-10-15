import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

/*
 * Online editing of Drive files through WOPI, end to end against a test
 * database (never production!), with the SMB gateway replaced by
 * test-fixtures/mock-smbgate.mjs (a local folder behind the same protocol):
 *
 *   DRIVE_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/office-drive.db.test.js
 *
 * A WOPI client calls the portal like Collabora: CheckFileInfo → Lock →
 * GetFile → PutFile (lock + timestamp) → Unlock, with the opening person's
 * file-server credentials resolved server side. Without DRIVE_DB_TEST it is
 * skipped.
 */

const enabled = process.env.DRIVE_DB_TEST === '1';
const skip = enabled ? false : 'set DRIVE_DB_TEST=1 and a test database to run';

const root = enabled ? mkdtempSync(join(tmpdir(), 'office-drive-')) : '';
const aclFile = join(root, 'acl.json');
const ACL = { known: true, users: { svc: { password: 'pw1', write: true, delete: true } } };
const setAcl = (patch = {}) => writeFileSync(aclFile, JSON.stringify({ ...ACL, ...patch, users: { svc: { ...ACL.users.svc, ...(patch.svc || {}) } } }));
const disk = (...parts) => join(root, 'Data', ...parts);
const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('fake xlsx v1')]);

let db;
let server;
let collabora;
let base;
let shareId;
let savedModules = null;
let savedIntegrations = null;
const cleanup = { users: [], servers: [], sessions: [], groups: [] };
const cookies = {};

class WopiClient {
  constructor(session) {
    this.src = new URL(session.url).searchParams.get('WOPISrc');
    this.token = session.accessToken;
  }

  async call(method, suffix = '', { headers = {}, body } = {}) {
    const url = new URL(`${this.src}${suffix}`);
    url.searchParams.set('access_token', this.token);
    const res = await fetch(url, { method, headers, body });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), headers: res.headers };
  }

  checkFileInfo() {
    return this.call('GET');
  }

  getFile() {
    return this.call('GET', '/contents');
  }

  lockOp(override, lock) {
    return this.call('POST', '', { headers: { 'X-WOPI-Override': override, ...(lock ? { 'X-WOPI-Lock': lock } : {}) } });
  }

  putFile(body, { lock, timestamp, exit = false } = {}) {
    const headers = { 'Content-Type': 'application/octet-stream', 'X-COOL-WOPI-IsExitSave': String(exit), 'X-COOL-WOPI-IsModifiedByUser': 'true' };
    if (lock) headers['X-WOPI-Lock'] = lock;
    if (timestamp) headers['X-COOL-WOPI-Timestamp'] = timestamp;
    return this.call('POST', '/contents', { headers, body });
  }
}

async function api(who, method, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { Cookie: `da_session=${cookies[who]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
}

const openEditor = (who, path, extra = {}) => api(who, 'POST', `/app/drive/shares/${shareId}/editor`, { path, lang: 'en', ...extra });
const editRows = async (userId) => (await db.query(`SELECT * FROM drive_activity WHERE user_id = $1 AND action = 'edit' ORDER BY id`, [userId])).rows;

before(async () => {
  if (!enabled) return;
  process.env.DISABLE_SCHEDULER = 'true';
  process.env.SMBGATE_PYTHON = fileURLToPath(new URL('../test-fixtures/mock-smbgate.mjs', import.meta.url));
  process.env.MOCK_SMB_ROOT = root;
  process.env.MOCK_SMB_ACL = aclFile;
  setAcl();
  mkdirSync(disk('Reports'), { recursive: true });
  writeFileSync(disk('Reports', 'Budget.xlsx'), XLSX);
  writeFileSync(disk('Reports', 'Plan.xlsx'), XLSX);

  db = await import('../config/database.js');
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  const settings = await import('../services/settings.js');
  const { sanitizeModules } = await import('../modules/catalog.js');
  savedModules = await settings.getSetting('modules', null);
  savedIntegrations = await settings.getSetting('integrations', null);
  const parsed = settings.parseSettings(await settings.getSettings({ fresh: true }));
  await settings.setSetting('modules', JSON.stringify(sanitizeModules(parsed.modules, { drive: { enabled: true, settings: { maxUploadMb: 50, activityLog: true } } })));

  const discovery = readFileSync(new URL('../test-fixtures/collabora-discovery.xml', import.meta.url), 'utf8');
  collabora = http.createServer((req, res) => {
    res.writeHead(req.url === '/hosting/discovery' ? 200 : 404, { 'Content-Type': 'text/xml' });
    res.end(req.url === '/hosting/discovery' ? discovery : '');
  });
  await new Promise((resolve) => collabora.listen(0, '127.0.0.1', resolve));

  const express = (await import('express')).default;
  const cookieParser = (await import('cookie-parser')).default;
  const apiRoutes = (await import('../routes/index.js')).default;
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', apiRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  const raw = JSON.parse(savedIntegrations || '{}');
  raw.documents = { ...(raw.documents || {}), editing: { enabled: true, serverUrl: `http://127.0.0.1:${collabora.address().port}`, wopiBaseUrl: base, allowedTypes: ['docx', 'xlsx'] } };
  await settings.setSetting('integrations', JSON.stringify(raw));
  (await import('../services/office/discovery.js')).forgetDiscovery();

  const { seal } = await import('../services/crypto.js');
  const { issueSessionToken, verifyToken } = await import('../services/auth.js');
  for (const who of ['ann', 'ben']) {
    const name = `od${who}${Date.now().toString(36)}`;
    const { rows } = await db.query(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES ($1, $2, '!', 'user', $3) RETURNING *`, [name, `${name}@test.invalid`, who === 'ann' ? 'Ann Office' : 'Ben Office']);
    cleanup.users.push(rows[0].id);
    cookies[who] = await issueSessionToken({ headers: { 'user-agent': 'office-drive-test' }, ip: '127.0.0.1' }, rows[0], { method: 'password' });
    cleanup.sessions.push(verifyToken(cookies[who]).sid);
    cookies[`${who}Id`] = rows[0].id;
  }
  const { rows: servers } = await db.query(
    `INSERT INTO drive_servers (name, host, auth, use_login, service_user, service_secret) VALUES ('Mock', 'mock.invalid', 'service', FALSE, 'svc', $1) RETURNING id`,
    [seal('pw1')]
  );
  cleanup.servers.push(servers[0].id);
  const { rows: shares } = await db.query(`INSERT INTO drive_shares (server_id, title, share, allow_links) VALUES ($1, 'Data', 'Data', TRUE) RETURNING id`, [servers[0].id]);
  shareId = shares[0].id;
});

after(async () => {
  if (!enabled) return;
  if (server) server.close();
  if (collabora) collabora.close();
  const settings = await import('../services/settings.js');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await db.query(`DELETE FROM office_locks WHERE lock_key LIKE $1`, [`drive:${cleanup.servers[0]}:%`]);
  if (cleanup.users.length) await db.query(`DELETE FROM drive_activity WHERE user_id = ANY($1)`, [cleanup.users]);
  if (cleanup.sessions.length) await db.query(`DELETE FROM user_sessions WHERE id = ANY($1)`, [cleanup.sessions]);
  if (cleanup.servers.length) await db.query(`DELETE FROM drive_servers WHERE id = ANY($1)`, [cleanup.servers]);
  if (cleanup.groups.length) await db.query(`DELETE FROM app_groups WHERE id = ANY($1)`, [cleanup.groups]);
  if (cleanup.users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [cleanup.users]);
  if (savedModules !== null) await settings.setSetting('modules', savedModules);
  if (savedIntegrations !== null) await settings.setSetting('integrations', savedIntegrations);
  (await import('../modules/drive/gate.js')).stopGate();
  await db.closePool();
  rmSync(root, { recursive: true, force: true });
});

test('drive: open, lock, read, save, unlock with the person\'s file-server account', { skip, timeout: 60000 }, async () => {
  const opened = await openEditor('ann', 'Reports/Budget.xlsx');
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const session = opened.data;
  assert.equal(session.mode, 'edit');
  assert.equal(session.file.name, 'Budget.xlsx');
  assert.equal(session.externalLock, null);
  const wopiSrc = new URL(session.url).searchParams.get('WOPISrc');
  assert.match(wopiSrc, /\/api\/wopi\/files\/drive-[A-Za-z0-9_-]{20}$/);
  assert.ok(!wopiSrc.includes('Budget'), 'the path never reaches Collabora');
  // The same file always has the same id (people editing it together share one document).
  const again = await openEditor('ben', 'Reports/Budget.xlsx');
  assert.equal(new URL(again.data.url).searchParams.get('WOPISrc'), wopiSrc);

  const editor = new WopiClient(session);
  const info = await editor.checkFileInfo();
  assert.equal(info.status, 200);
  assert.equal(info.data.BaseFileName, 'Budget.xlsx');
  assert.equal(info.data.Size, XLSX.length);
  assert.equal(info.data.UserCanWrite, true);
  assert.equal(info.data.UserFriendlyName, 'Ann Office');
  assert.deepEqual((await editor.getFile()).data, XLSX);

  assert.equal((await editor.lockOp('LOCK', 'D1')).status, 200);
  const listing = await api('ben', 'GET', `/app/drive/shares/${shareId}/list?path=Reports`);
  assert.equal(listing.data.editing['Reports/Budget.xlsx'], 'Ann Office');
  const rival = new WopiClient(again.data);
  assert.equal((await rival.lockOp('LOCK', 'D2')).status, 409);

  const v2 = Buffer.concat([XLSX, Buffer.from(' v2')]);
  const saved = await editor.putFile(v2, { lock: 'D1', timestamp: info.data.LastModifiedTime });
  assert.equal(saved.status, 200, String(saved.data));
  assert.deepEqual(readFileSync(disk('Reports', 'Budget.xlsx')), v2, 'written to the share');
  const v3 = Buffer.concat([v2, Buffer.from(' v3')]);
  const autosave = await editor.putFile(v3, { lock: 'D1', timestamp: saved.data.LastModifiedTime });
  assert.equal(autosave.status, 200);
  assert.deepEqual(readFileSync(disk('Reports', 'Budget.xlsx')), v3);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal((await editRows(cookies.annId)).length, 1, 'one activity row per editing session, not per autosave');

  // Someone changed the file on the share (Explorer, Excel…): Collabora gets 1010.
  writeFileSync(disk('Reports', 'Budget.xlsx'), Buffer.concat([XLSX, Buffer.from(' changed on the share')]));
  utimesSync(disk('Reports', 'Budget.xlsx'), new Date(), new Date(Date.now() + 5000));
  const stale = await editor.putFile(v3, { lock: 'D1', timestamp: autosave.data.LastModifiedTime });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.COOLStatusCode, 1010);
  assert.match(readFileSync(disk('Reports', 'Budget.xlsx')).toString(), /changed on the share/, 'the other change is kept');
  // "Overwrite" in Collabora (no timestamp) and the closing save.
  const exit = await editor.putFile(v3, { lock: 'D1', exit: true });
  assert.equal(exit.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const rows = await editRows(cookies.annId);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].details.closed, true);
  assert.equal(rows[1].path, 'Reports/Budget.xlsx');
  assert.equal(rows[1].user_agent, 'Online editor (Collabora)');

  assert.equal((await editor.lockOp('UNLOCK', 'D1')).status, 200);
  const after = await api('ben', 'GET', `/app/drive/shares/${shareId}/list?path=Reports`);
  assert.deepEqual(after.data.editing, {});
});

test('drive: file-server rights, desktop locks and revoked access', { skip, timeout: 60000 }, async () => {
  // Excel has the file open on someone's PC: read-only unless "edit anyway".
  const owner = Buffer.alloc(162);
  owner[0] = 4;
  owner.write('ivan', 1, 'latin1');
  owner.writeUInt16LE(4, 54);
  owner.write('Ivan', 56, 'utf16le');
  writeFileSync(disk('Reports', '~$an.xlsx'), owner);
  const locked = await openEditor('ann', 'Reports/Plan.xlsx');
  assert.equal(locked.data.mode, 'view');
  assert.equal(locked.data.externalLock.app, 'office');
  assert.equal(locked.data.externalLock.by, 'Ivan');
  const forced = await openEditor('ann', 'Reports/Plan.xlsx', { force: true });
  assert.equal(forced.data.mode, 'edit');
  rmSync(disk('Reports', '~$an.xlsx'));

  // No write right on the server: view only, saves refused.
  const editor = new WopiClient(forced.data);
  setAcl({ svc: { write: false } });
  const ro = await openEditor('ann', 'Reports/Plan.xlsx');
  assert.equal(ro.data.mode, 'view');
  assert.equal((await editor.checkFileInfo()).data.UserCanWrite, false);
  assert.equal((await editor.putFile(XLSX, {})).status, 401);
  setAcl();
  assert.equal((await editor.checkFileInfo()).data.UserCanWrite, true);

  // The file-server account stops working: the editor loses access.
  setAcl({ svc: { password: 'changed' } });
  const { forgetProbes } = await import('../modules/drive/service.js');
  forgetProbes(cookies.annId);
  // (the gateway authentication is cached for a while; a rejected read still refuses)
  const denied = await editor.getFile();
  assert.ok([401, 403, 502, 503].includes(denied.status), String(denied.status));
  await db.query(`UPDATE drive_servers SET service_secret = $2 WHERE id = $1`, [cleanup.servers[0], (await import('../services/crypto.js')).seal('pw1')]);
  setAcl();

  // The folder entry is narrowed to a group Ann is not in: 401.
  const { rows: groups } = await db.query(`INSERT INTO app_groups (name) VALUES ($1) RETURNING id`, [`office-test-${Date.now()}`]);
  cleanup.groups.push(groups[0].id);
  await db.query(`UPDATE drive_shares SET group_ids = $2 WHERE id = $1`, [shareId, [groups[0].id]]);
  assert.equal((await editor.checkFileInfo()).status, 401);
  await db.query(`UPDATE drive_shares SET group_ids = '{}' WHERE id = $1`, [shareId]);

  // A token for one file never opens another, even on the same share.
  const other = (await openEditor('ann', 'Reports/Budget.xlsx')).data;
  const swapped = new WopiClient(other);
  swapped.src = new URL(forced.data.url).searchParams.get('WOPISrc');
  assert.equal((await swapped.checkFileInfo()).status, 401);
  // Unknown ids.
  const unknown = new WopiClient(other);
  unknown.src = `${base}/api/wopi/files/drive-AAAAAAAAAAAAAAAAAAAA`;
  assert.equal((await unknown.checkFileInfo()).status, 401);

  // Paths leaving the share are refused before anything is mapped.
  const escape = await openEditor('ann', '../Other/x.xlsx');
  assert.equal(escape.status, 400);
  // Not an editor format.
  writeFileSync(disk('Reports', 'a.txt'), 'x');
  assert.equal((await openEditor('ann', 'Reports/a.txt')).data.code, 'EDITOR_TYPE');
});
