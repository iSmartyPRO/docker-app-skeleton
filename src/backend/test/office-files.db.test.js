import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { readFileSync } from 'fs';
import { writeFile } from 'fs/promises';

/*
 * Online editing of Files through WOPI, end to end against a test database
 * (never production!):
 *
 *   FILES_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/office-files.db.test.js
 *
 * A fake Collabora answers /hosting/discovery; a small WOPI client
 * (WopiClient below) then calls the portal exactly like Collabora does:
 * CheckFileInfo → Lock → GetFile → PutFile (lock + timestamp headers) →
 * Unlock. Needs the accounts plainuser (owner), foreman (edit share) and buh
 * (view share). Without FILES_DB_TEST it is skipped.
 */

const enabled = process.env.FILES_DB_TEST === '1';
const skip = enabled ? false : 'set FILES_DB_TEST=1 and a test database to run';

const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('fake docx v1')]);

let db;
let mods;
let server;
let collabora;
let base;
let users;
let owner;
let root;
let file;
let other;
const cookies = {};
const sessionIds = [];
let savedIntegrations = null;
let savedModules = null;

/** Talks to the portal the way Collabora does (server to server, token in the query). */
class WopiClient {
  constructor(session) {
    const url = new URL(session.url);
    this.src = url.searchParams.get('WOPISrc');
    this.token = session.accessToken;
  }

  async call(method, suffix = '', { headers = {}, body } = {}) {
    const url = new URL(`${this.src}${suffix}`);
    url.searchParams.set('access_token', this.token);
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${this.token}`, ...headers }, body });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }

  checkFileInfo() {
    return this.call('GET');
  }

  getFile() {
    return this.call('GET', '/contents');
  }

  lockOp(override, lock, extra = {}) {
    return this.call('POST', '', { headers: { 'X-WOPI-Override': override, ...(lock ? { 'X-WOPI-Lock': lock } : {}), ...extra } });
  }

  putFile(body, { lock, timestamp, exit = false, autosave = false } = {}) {
    const headers = {
      'X-WOPI-Override': 'PUT',
      'Content-Type': 'application/octet-stream',
      'X-COOL-WOPI-IsModifiedByUser': 'true',
      'X-COOL-WOPI-IsAutosave': String(autosave),
      'X-COOL-WOPI-IsExitSave': String(exit),
    };
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

const openEditor = (who, id, body = {}) => api(who, 'POST', `/app/files/nodes/${id}/editor`, { lang: 'ru', ...body });

async function setEditing(patch) {
  const { getSetting, setSetting } = mods.settings;
  const raw = JSON.parse((await getSetting('integrations')) || '{}');
  if (savedIntegrations === null) savedIntegrations = JSON.stringify(raw);
  raw.documents = { ...(raw.documents || {}), editing: { ...(raw.documents?.editing || {}), ...patch } };
  await setSetting('integrations', JSON.stringify(raw));
  (await import('../services/office/discovery.js')).forgetDiscovery();
}

async function patchFiles(patch) {
  const { getSetting, setSetting } = mods.settings;
  const raw = JSON.parse((await getSetting('modules')) || '{}');
  if (savedModules === null) savedModules = JSON.stringify(raw);
  raw.files = { ...(raw.files || {}), enabled: true, settings: { ...(raw.files?.settings || {}), ...patch } };
  await setSetting('modules', JSON.stringify(raw));
}

async function ctxOf(userId) {
  const { getUserAccess } = await import('../services/rbac.js');
  const { contextFromRequest } = await import('../modules/shared/acl.js');
  return contextFromRequest({ user: { id: userId }, access: await getUserAccess(userId) }, 'files.admin');
}

async function makeFile(ctx, parentId, name, content) {
  const { newStorageKey, storagePath, extOf } = mods.storage;
  const key = await newStorageKey(extOf(name));
  await writeFile(storagePath(key), content);
  const [row] = await mods.service.storeUploads(ctx, { parentId, spaceId: null, ownerId: owner.id }, [{ originalname: name, path: storagePath(key), size: content.length, storageKey: key }]);
  return row;
}

async function signIn(username) {
  const { rows } = await db.query(`SELECT * FROM users WHERE id = $1`, [users[username]]);
  const { issueSessionToken } = await import('../services/auth.js');
  const token = await issueSessionToken({ headers: { 'user-agent': 'office-test' }, ip: '127.0.0.1' }, rows[0], { method: 'password' });
  const { verifyToken } = await import('../services/auth.js');
  sessionIds.push(verifyToken(token).sid);
  cookies[username] = token;
}

const trashCopies = async (id) =>
  Number((await db.query(`SELECT COUNT(*)::int AS n FROM fs_nodes c JOIN fs_nodes n ON n.id = $1 WHERE c.id <> n.id AND c.deleted_at IS NOT NULL AND c.name = n.name AND c.parent_id = n.parent_id`, [id])).rows[0].n);

before(async () => {
  if (!enabled) return;
  process.env.DISABLE_SCHEDULER = 'true';
  db = await import('../config/database.js');
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  mods = {
    settings: await import('../services/settings.js'),
    storage: await import('../modules/shared/storage.js'),
    service: await import('../modules/files/service.js'),
  };
  const { rows } = await db.query(`SELECT id, username FROM users WHERE username = ANY($1)`, [['plainuser', 'buh', 'foreman']]);
  users = Object.fromEntries(rows.map((row) => [row.username, row.id]));
  owner = { id: users.plainuser, ctx: await ctxOf(users.plainuser) };
  await patchFiles({ quotaMb: 0, maxUploadMb: 200 });

  const discovery = readFileSync(new URL('../test-fixtures/collabora-discovery.xml', import.meta.url), 'utf8');
  collabora = http.createServer((req, res) => {
    if (req.url === '/hosting/discovery') {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(discovery);
    } else if (req.url === '/hosting/capabilities') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ productName: 'Collabora Online Development Edition', productVersion: '26.04.3.1' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => collabora.listen(0, '127.0.0.1', resolve));

  const express = (await import('express')).default;
  const cookieParser = (await import('cookie-parser')).default;
  const apiRoutes = (await import('../routes/index.js')).default;
  const { tokenGate } = await import('../api/gate.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', (req, res, next) => (req.path.startsWith('/wopi/') ? next() : tokenGate(req, res, next)));
  app.use('/api', apiRoutes);
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  await setEditing({ enabled: true, serverUrl: `http://127.0.0.1:${collabora.address().port}`, discoveryUrl: '', wopiBaseUrl: base, allowedTypes: ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'] });

  root = await mods.service.createFolder(owner.ctx, { name: `office-test-${Date.now()}` });
  file = await makeFile(owner.ctx, root.id, 'Plan.docx', DOCX);
  other = await makeFile(owner.ctx, root.id, 'Other.docx', DOCX);
  await makeFile(owner.ctx, root.id, 'notes.txt', Buffer.from('plain'));
  await mods.service.setShares(owner.ctx, root.id, [
    { subjectType: 'user', subjectId: users.buh, level: 'view' },
    { subjectType: 'user', subjectId: users.foreman, level: 'edit' },
  ]);
  for (const name of ['plainuser', 'foreman', 'buh']) await signIn(name);
});

after(async () => {
  if (!enabled) return;
  if (server) server.close();
  if (collabora) collabora.close();
  if (root) {
    const { rows } = await db.query(`SELECT id FROM fs_nodes WHERE parent_id = $1 OR id = $1`, [root.id]);
    await db.query(`DELETE FROM office_locks WHERE lock_key = ANY($1)`, [rows.map((row) => `files:${row.id}`)]);
    await db.query(`UPDATE fs_nodes SET deleted_at = NOW() WHERE id = $1`, [root.id]);
    await mods.service.purgeSubtree(root.id).catch((err) => console.warn('cleanup', err.message));
  }
  if (sessionIds.length) await db.query(`DELETE FROM user_sessions WHERE id = ANY($1)`, [sessionIds]);
  if (savedIntegrations !== null) await mods.settings.setSetting('integrations', savedIntegrations);
  if (savedModules !== null) await mods.settings.setSetting('modules', savedModules);
  await db.closePool();
});

test('files: open, lock, read, save, unlock like Collabora', { skip, timeout: 60000 }, async () => {
  // The frame for the owner: edit mode, the public server address, our WOPISrc.
  const opened = await openEditor('plainuser', file.id);
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const session = opened.data;
  assert.equal(session.mode, 'edit');
  assert.equal(session.file.name, 'Plan.docx');
  const frame = new URL(session.url);
  assert.equal(frame.origin, `http://127.0.0.1:${collabora.address().port}`);
  assert.equal(frame.pathname, '/browser/f4a9c1b/cool.html');
  assert.equal(frame.searchParams.get('WOPISrc'), `${base}/api/wopi/files/files-${file.id}`);
  assert.equal(frame.searchParams.get('lang'), 'ru');
  assert.ok(session.accessTokenTtl > Date.now() + 3600 * 1000);
  assert.ok(!session.url.includes(session.accessToken), 'the token travels in the form, not the address');

  const editor = new WopiClient(session);
  const info = await editor.checkFileInfo();
  assert.equal(info.status, 200);
  assert.equal(info.data.BaseFileName, 'Plan.docx');
  assert.equal(info.data.Size, DOCX.length);
  assert.equal(info.data.UserCanWrite, true);
  assert.equal(info.data.UserId, String(users.plainuser));
  assert.equal(info.data.SupportsLocks, true);
  assert.equal(info.data.UserCanNotWriteRelative, true);

  const content = await editor.getFile();
  assert.equal(content.status, 200);
  assert.deepEqual(content.data, DOCX);

  assert.equal((await editor.lockOp('LOCK', 'L1')).status, 200);
  assert.equal((await editor.lockOp('LOCK', 'L1')).status, 200, 'locking again with the same id refreshes');
  assert.equal((await editor.lockOp('GET_LOCK')).headers.get('x-wopi-lock'), 'L1');
  assert.equal((await editor.lockOp('REFRESH_LOCK', 'L1')).status, 200);

  // Someone else with edit rights sees who is editing, and cannot take the lock.
  const ownerName = (await db.query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [users.plainuser])).rows[0].name;
  const listing = await api('foreman', 'GET', `/app/files/folders/${root.id}`);
  assert.equal(listing.data.items.find((item) => item.id === file.id)?.editingBy, ownerName);
  const second = await openEditor('foreman', file.id);
  assert.equal(second.data.mode, 'edit');
  assert.equal(second.data.lockedBy?.name, ownerName);
  const rival = new WopiClient(second.data);
  const stolen = await rival.lockOp('LOCK', 'L2');
  assert.equal(stolen.status, 409);
  assert.equal(stolen.headers.get('x-wopi-lock'), 'L1');
  assert.equal((await rival.lockOp('UNLOCK', 'L2')).status, 409);

  // First save: the previous content is kept once (trash copy).
  const before = await trashCopies(file.id);
  const v2 = Buffer.concat([DOCX, Buffer.from(' v2 edited')]);
  const saved = await editor.putFile(v2, { lock: 'L1', timestamp: info.data.LastModifiedTime });
  assert.equal(saved.status, 200, String(saved.data));
  assert.ok(saved.data.LastModifiedTime);
  assert.notEqual(saved.data.LastModifiedTime, info.data.LastModifiedTime);
  assert.equal(await trashCopies(file.id), before + 1);
  let row = (await db.query(`SELECT * FROM fs_nodes WHERE id = $1`, [file.id])).rows[0];
  assert.equal(Number(row.size), v2.length);
  assert.equal(row.updated_by, users.plainuser);
  const firstKey = row.storage_key;

  // Autosave in the same session: no new copy, the superseded blob is removed.
  const v3 = Buffer.concat([v2, Buffer.from(' v3')]);
  const autosave = await editor.putFile(v3, { lock: 'L1', timestamp: saved.data.LastModifiedTime, autosave: true });
  assert.equal(autosave.status, 200);
  assert.equal(await trashCopies(file.id), before + 1, 'one copy per editing session');
  row = (await db.query(`SELECT * FROM fs_nodes WHERE id = $1`, [file.id])).rows[0];
  assert.notEqual(row.storage_key, firstKey);
  assert.equal(readFileSync(mods.storage.storagePath(row.storage_key)).toString(), v3.toString());
  assert.throws(() => readFileSync(mods.storage.storagePath(firstKey)), /ENOENT/);
  const reread = await editor.getFile();
  assert.deepEqual(reread.data, v3);

  // Changed elsewhere since it was loaded: 409 with COOLStatusCode 1010.
  const stale = await editor.putFile(v3, { lock: 'L1', timestamp: info.data.LastModifiedTime });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.COOLStatusCode, 1010);
  // Wrong lock: 409 naming the current lock.
  const wrongLock = await editor.putFile(v3, { lock: 'L9', timestamp: autosave.data.LastModifiedTime });
  assert.equal(wrongLock.status, 409);
  assert.equal(wrongLock.headers.get('x-wopi-lock'), 'L1');
  // Not an office file.
  const junk = await editor.putFile(Buffer.from('<html>oops</html>'), { lock: 'L1', timestamp: autosave.data.LastModifiedTime });
  assert.equal(junk.status, 400);
  // Collabora's "overwrite" (no timestamp) and the closing save.
  const exit = await editor.putFile(v3, { lock: 'L1', exit: true });
  assert.equal(exit.status, 200);

  assert.equal((await editor.lockOp('UNLOCK', 'L1')).status, 200);
  assert.equal((await editor.lockOp('GET_LOCK')).headers.get('x-wopi-lock'), '');
  assert.equal((await editor.lockOp('PUT_RELATIVE')).status, 501);
  const relisted = await api('foreman', 'GET', `/app/files/folders/${root.id}`);
  assert.equal(relisted.data.items.find((item) => item.id === file.id)?.editingBy, undefined);

  // Saving without a lock (the lock expired) still works; a new session keeps a new copy.
  const unlocked = await editor.putFile(Buffer.concat([v3, Buffer.from(' v4')]), {});
  assert.equal(unlocked.status, 200);
  assert.equal(await trashCopies(file.id), before + 2);
});

test('files: view-only people get a read-only editor', { skip, timeout: 30000 }, async () => {
  const opened = await openEditor('buh', file.id);
  assert.equal(opened.status, 200);
  assert.equal(opened.data.mode, 'view');
  assert.equal(new URL(opened.data.url).searchParams.get('permission'), 'readonly');
  const viewer = new WopiClient(opened.data);
  const info = await viewer.checkFileInfo();
  assert.equal(info.status, 200);
  assert.equal(info.data.UserCanWrite, false);
  assert.equal((await viewer.getFile()).status, 200);
  assert.equal((await viewer.putFile(DOCX, {})).status, 401);
  assert.equal((await viewer.lockOp('LOCK', 'V1')).status, 401);
  // Asking for view on purpose, with edit rights.
  const asked = await openEditor('foreman', file.id, { mode: 'view' });
  assert.equal(asked.data.mode, 'view');
  assert.equal((await new WopiClient(asked.data).putFile(DOCX, {})).status, 401, 'a view token never saves');
  // Not an editor format.
  const txt = (await db.query(`SELECT id FROM fs_nodes WHERE parent_id = $1 AND name = 'notes.txt'`, [root.id])).rows[0];
  const refused = await openEditor('plainuser', txt.id);
  assert.equal(refused.status, 400);
  assert.equal(refused.data.code, 'EDITOR_TYPE');
});

test('files: tokens are bound to the file, the session and current access', { skip, timeout: 30000 }, async () => {
  const mine = (await openEditor('foreman', file.id)).data;
  const client = new WopiClient(mine);
  assert.equal((await client.checkFileInfo()).status, 200);

  // Another file with this token.
  const elsewhere = new WopiClient(mine);
  elsewhere.src = mine.url && new URL(mine.url).searchParams.get('WOPISrc').replace(`files-${file.id}`, `files-${other.id}`);
  assert.equal((await elsewhere.checkFileInfo()).status, 401);

  // A WOPI token is not a session cookie, nor an API token.
  const asCookie = await fetch(`${base}/api/app/files`, { headers: { Cookie: `da_session=${mine.accessToken}` } });
  assert.equal(asCookie.status, 401);
  const asBearer = await fetch(`${base}/api/app/files`, { headers: { Authorization: `Bearer ${mine.accessToken}` } });
  assert.equal(asBearer.status, 401);

  // Garbage and expired tokens.
  const fake = new WopiClient(mine);
  fake.token = 'not-a-token';
  assert.equal((await fake.checkFileInfo()).status, 401);
  const { signWopiToken } = await import('../services/office/tokens.js');
  const { verifyToken } = await import('../services/auth.js');
  const expired = new WopiClient(mine);
  expired.token = signWopiToken({ fileId: `files-${file.id}`, userId: users.foreman, sessionId: verifyToken(cookies.foreman).sid, permission: 'edit', hours: 0.0003 }).token;
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert.equal((await expired.checkFileInfo()).status, 401);

  // The share is withdrawn: the open editor loses access at once.
  await mods.service.setShares(owner.ctx, root.id, [{ subjectType: 'user', subjectId: users.buh, level: 'view' }]);
  assert.equal((await client.checkFileInfo()).status, 401);
  assert.equal((await client.putFile(DOCX, {})).status, 401);
  await mods.service.setShares(owner.ctx, root.id, [
    { subjectType: 'user', subjectId: users.buh, level: 'view' },
    { subjectType: 'user', subjectId: users.foreman, level: 'edit' },
  ]);
  assert.equal((await client.checkFileInfo()).status, 200);

  // Downgraded to view: reads go on, saves stop.
  await mods.service.setShares(owner.ctx, root.id, [
    { subjectType: 'user', subjectId: users.buh, level: 'view' },
    { subjectType: 'user', subjectId: users.foreman, level: 'view' },
  ]);
  const info = await client.checkFileInfo();
  assert.equal(info.data.UserCanWrite, false);
  assert.equal((await client.putFile(DOCX, {})).status, 401);

  // Signing out of the portal session ends its editor tokens.
  const { verifyToken: verify } = await import('../services/auth.js');
  await db.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1`, [verify(cookies.foreman).sid]);
  assert.equal((await client.checkFileInfo()).status, 401);

  // The editor turned off: every token stops working, no new sessions.
  const ownerSession = (await openEditor('plainuser', file.id)).data;
  await setEditing({ enabled: false });
  assert.equal((await new WopiClient(ownerSession).checkFileInfo()).status, 401);
  const disabled = await openEditor('plainuser', file.id);
  assert.equal(disabled.status, 409);
  assert.equal(disabled.data.code, 'EDITOR_DISABLED');
  await setEditing({ enabled: true });
});

test('files: quota and size limits apply to saves', { skip, timeout: 30000 }, async () => {
  const session = (await openEditor('plainuser', other.id)).data;
  const editor = new WopiClient(session);
  await patchFiles({ maxUploadMb: 1 });
  const big = Buffer.concat([DOCX, Buffer.alloc(1024 * 1024 + 10)]);
  assert.equal((await editor.putFile(big, {})).status, 413);
  await patchFiles({ maxUploadMb: 200, quotaMb: 1 });
  const { rows } = await db.query(`SELECT COALESCE(SUM(size),0)::bigint AS used FROM fs_nodes WHERE owner_id = $1 AND space_id IS NULL AND kind = 'file'`, [users.plainuser]);
  const room = 1024 * 1024 - Number(rows[0].used);
  if (room > 0) {
    const tooBig = Buffer.concat([DOCX, Buffer.alloc(room + 100)]);
    assert.equal((await editor.putFile(tooBig, {})).status, 413);
  }
  await patchFiles({ quotaMb: 0 });
  assert.equal((await editor.putFile(DOCX, {})).status, 200);
});

test('files: settings check reads discovery and finds the callback', { skip, timeout: 30000 }, async () => {
  const { testEditor } = await import('../services/office/session.js');
  const result = await testEditor({});
  assert.ok(result.editable.includes('docx'));
  assert.ok(result.viewOnly.includes('pdf'));
  assert.equal(result.product.version, '26.04.3.1');
  assert.equal(result.callback.ok, true, JSON.stringify(result.callback));
  assert.equal(result.collabora.wopiHost, '127.0.0.1');
  await assert.rejects(testEditor({ editing: { serverUrl: 'http://127.0.0.1:1' } }), (err) => err.code === 'EDITOR_UNREACHABLE');
});
