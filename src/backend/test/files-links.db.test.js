import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'fs/promises';

/*
 * Public link permissions against a test database (never production!):
 *
 *   FILES_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/files-links.db.test.js
 *
 * Needs the accounts plainuser (owner), buh and foreman. Without
 * FILES_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.FILES_DB_TEST === '1';
const skip = enabled ? false : 'set FILES_DB_TEST=1 and a test database to run';

let db;
let server;
let base;
let mods;
let users;
let owner;
let root;
let sub;
let outside;
const linkIds = [];
let savedModules = null;

async function ctxOf(userId) {
  const { getUserAccess } = await import('../services/rbac.js');
  const { contextFromRequest } = await import('../modules/shared/acl.js');
  return contextFromRequest({ user: { id: userId }, access: await getUserAccess(userId) }, 'files.admin');
}

async function patchFiles(patch) {
  const { getSetting, setSetting } = mods.settings;
  const raw = JSON.parse((await getSetting('modules')) || '{}');
  if (savedModules === null) savedModules = JSON.stringify(raw);
  raw.files = { ...(raw.files || {}), settings: { ...(raw.files?.settings || {}), ...patch } };
  await setSetting('modules', JSON.stringify(raw));
}

/** A file in a folder, stored like an upload. */
async function makeFile(ctx, parentId, name, content) {
  const { newStorageKey, storagePath, extOf } = mods.storage;
  const key = await newStorageKey(extOf(name));
  const body = Buffer.from(content);
  await writeFile(storagePath(key), body);
  const [row] = await mods.service.storeUploads(ctx, { parentId, spaceId: null, ownerId: owner.id }, [{ originalname: name, path: storagePath(key), size: body.length, storageKey: key }]);
  return row;
}

async function link(perms, extra = {}) {
  const created = await mods.links.createLink(owner.ctx, extra.nodeId || root.id, { permissions: perms, ...extra });
  linkIds.push(created.id);
  return created;
}

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers['X-Link-Token'] = token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}/l/${path}`, { method, headers, body: payload });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, code: data?.code };
}

const fileForm = (name, content, field = 'files') => {
  const form = new FormData();
  form.append(field, new Blob([content]), name);
  return form;
};

async function session(token, body = {}, visitor) {
  const res = await call('POST', `${token}/session`, { body, token: visitor });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.token;
}

before(async () => {
  if (!enabled) return;
  db = await import('../config/database.js');
  process.env.DISABLE_SCHEDULER = 'true';
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  mods = {
    settings: await import('../services/settings.js'),
    storage: await import('../modules/shared/storage.js'),
    service: await import('../modules/files/service.js'),
    links: await import('../modules/files/links.js'),
    writes: await import('../modules/files/linkWrites.js'),
  };
  const { rows } = await db.query(`SELECT id, username FROM users WHERE username = ANY($1)`, [['plainuser', 'buh', 'foreman']]);
  users = Object.fromEntries(rows.map((row) => [row.username, row.id]));
  owner = { id: users.plainuser, ctx: await ctxOf(users.plainuser) };
  await patchFiles({ publicLinks: true, writeLinks: true, requireWriteLinkPassword: false, linkSharing: 'owners', requireLinkPassword: false, quotaMb: 0 });
  root = await mods.service.createFolder(owner.ctx, { name: `fl-test-${Date.now()}` });
  sub = await mods.service.createFolder(owner.ctx, { parentId: root.id, name: 'Inside' });
  outside = await mods.service.createFolder(owner.ctx, { name: `fl-outside-${Date.now()}` });
  await mods.service.setShares(owner.ctx, root.id, [
    { subjectType: 'user', subjectId: users.buh, level: 'view' },
    { subjectType: 'user', subjectId: users.foreman, level: 'edit' },
  ]);

  const express = (await import('express')).default;
  const { publicRoutes } = await import('../modules/files/routes.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(express.json());
  app.use('/l', publicRoutes());
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!enabled) return;
  server?.close();
  try {
    if (linkIds.length) await db.query(`DELETE FROM notifications WHERE kind = 'files.linkActivity' AND user_id = $1`, [owner.id]);
    for (const id of [root?.id, outside?.id].filter(Boolean)) {
      await db.query(`UPDATE fs_nodes SET deleted_at = NULL WHERE id = $1`, [id]);
      await mods.service.purgeSubtree(id).catch(() => {});
    }
    // Copies kept in the trash by "replace" and anything else this test left.
    const { rows } = await db.query(`SELECT id FROM fs_nodes WHERE owner_id = $1 AND deleted_at IS NOT NULL AND name IN ('a.txt', 'r.txt')`, [owner.id]);
    for (const row of rows) await mods.service.purgeSubtree(row.id).catch(() => {});
    if (savedModules !== null) await mods.settings.setSetting('modules', savedModules);
  } finally {
    await db.closePool();
  }
});

test('existing links keep view + download (view only where downloads were off)', { skip }, async () => {
  const plain = await db.query(`INSERT INTO fs_links (node_id, token, created_by) VALUES ($1, $2, $3) RETURNING id`, [root.id, `fl-old-a-${Date.now()}`, owner.id]);
  const noDl = await db.query(`INSERT INTO fs_links (node_id, token, allow_download, created_by) VALUES ($1, $2, FALSE, $3) RETURNING id`, [root.id, `fl-old-b-${Date.now()}`, owner.id]);
  linkIds.push(plain.rows[0].id, noDl.rows[0].id);
  const { ensureFilesSchema } = await import('../modules/files/schema.js');
  await ensureFilesSchema();
  const { rows } = await db.query(`SELECT id, permissions FROM fs_links WHERE id = ANY($1) ORDER BY id`, [[plain.rows[0].id, noDl.rows[0].id]]);
  assert.deepEqual(rows[0].permissions, ['view', 'download']);
  assert.deepEqual(rows[1].permissions, ['view']);
  const created = await link(undefined);
  assert.deepEqual(created.permissions, ['view', 'download']);
  const legacy = await mods.links.createLink(owner.ctx, root.id, { allowDownload: false });
  linkIds.push(legacy.id);
  assert.deepEqual(legacy.permissions, ['view']);
});

test('a link grants at most what its author can do', { skip }, async () => {
  const buh = await ctxOf(users.buh);
  const foreman = await ctxOf(users.foreman);
  await assert.rejects(mods.links.createLink(buh, root.id, { permissions: ['view'] }), { code: 'FORBIDDEN' });
  await patchFiles({ linkSharing: 'members' });
  const viewLink = await mods.links.createLink(buh, root.id, { permissions: ['view', 'download'] });
  linkIds.push(viewLink.id);
  await assert.rejects(mods.links.createLink(buh, root.id, { permissions: ['view', 'upload'] }), { code: 'GRANT_EXCEEDED' });
  await assert.rejects(mods.links.createLink(buh, root.id, { permissions: ['upload'] }), { code: 'GRANT_EXCEEDED' });
  await assert.rejects(mods.links.updateLink(buh, viewLink.id, { permissions: ['view', 'delete'] }), { code: 'GRANT_EXCEEDED' });
  const full = await mods.links.createLink(foreman, root.id, { permissions: ['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete'] });
  linkIds.push(full.id);
  // Others see only their own links; the owner sees all of them.
  const listed = await mods.links.listLinks(buh, root.id);
  assert.deepEqual(listed.links.map((item) => item.id), [viewLink.id]);
  assert.deepEqual(listed.grantable, ['view', 'download']);
  assert.ok((await mods.links.listLinks(owner.ctx, root.id)).links.some((item) => item.id === full.id));
  await assert.rejects(mods.links.updateLink(buh, full.id, { revoked: true }), { code: 'NOT_FOUND' });

  // The author is downgraded to view: the link keeps reading, loses writing.
  await mods.service.setShares(owner.ctx, root.id, [
    { subjectType: 'user', subjectId: users.buh, level: 'view' },
    { subjectType: 'user', subjectId: users.foreman, level: 'view' },
  ]);
  const visitor = await session(full.token);
  const opened = await call('GET', full.token);
  assert.deepEqual(opened.data.link.permissions, ['view', 'download']);
  const refused = await call('POST', `${full.token}/folders`, { token: visitor, body: { name: 'x' } });
  assert.equal(refused.code, 'LINK_FORBIDDEN');
  // Access gone entirely: the link stops working.
  await mods.service.setShares(owner.ctx, root.id, [{ subjectType: 'user', subjectId: users.buh, level: 'view' }]);
  assert.equal((await call('GET', full.token)).code, 'OWNER_NO_ACCESS');
  await mods.service.setShares(owner.ctx, root.id, [
    { subjectType: 'user', subjectId: users.buh, level: 'view' },
    { subjectType: 'user', subjectId: users.foreman, level: 'edit' },
  ]);
  await patchFiles({ linkSharing: 'owners' });
  // Back to owners-only: links of non-owners stop working.
  assert.equal((await call('GET', full.token)).code, 'OWNER_NO_ACCESS');
});

test('admins can switch write links off or demand a password for them', { skip }, async () => {
  const full = await link(['view', 'download', 'upload', 'mkdir']);
  const visitor = await session(full.token);
  await patchFiles({ writeLinks: false });
  await assert.rejects(link(['view', 'upload']), { code: 'WRITE_LINKS_DISABLED' });
  assert.equal((await call('POST', `${full.token}/folders`, { token: visitor, body: { name: 'x' } })).code, 'LINK_FORBIDDEN');
  await patchFiles({ writeLinks: true, requireWriteLinkPassword: true });
  await assert.rejects(link(['view', 'upload']), { code: 'PASSWORD_REQUIRED' });
  assert.equal((await call('POST', `${full.token}/folders`, { token: visitor, body: { name: 'x' } })).code, 'LINK_FORBIDDEN');
  const locked = await link(['view', 'upload'], { password: 'secret1' });
  await assert.rejects(mods.links.updateLink(owner.ctx, locked.id, { password: '' }), { code: 'PASSWORD_REQUIRED' });
  await patchFiles({ requireWriteLinkPassword: false });
  const ok = await call('POST', `${full.token}/folders`, { token: visitor, body: { name: 'Allowed again' } });
  assert.equal(ok.status, 201);
});

test('every permission is enforced on every route', { skip }, async () => {
  const target = await makeFile(owner.ctx, root.id, 'perm-target.txt', 'hello');
  const routes = {
    upload: (t, v) => call('POST', `${t}/upload`, { token: v, form: fileForm('p.txt', 'x') }),
    mkdir: (t, v) => call('POST', `${t}/folders`, { token: v, body: { name: 'P' } }),
    tree: (t, v) => call('POST', `${t}/folders/tree`, { token: v, body: { paths: ['T'] } }),
    rename: (t, v) => call('PUT', `${t}/nodes/${target.id}`, { token: v, body: { name: 'perm-target.txt' } }),
    move: (t, v) => call('PUT', `${t}/nodes/${target.id}`, { token: v, body: { move: { parentId: root.id } } }),
    replace: (t, v) => call('POST', `${t}/nodes/${target.id}/replace`, { token: v, form: fileForm('perm-target.txt', 'hello', 'file') }),
    delete: (t, v) => call('DELETE', `${t}/nodes/${target.id}`, { token: v }),
  };
  const needs = { upload: ['upload'], mkdir: ['mkdir'], tree: ['upload', 'mkdir'], rename: ['rename'], move: ['rename'], replace: ['replace'], delete: ['delete'] };
  for (const granted of [[], ['upload'], ['mkdir'], ['rename'], ['replace']]) {
    const created = await link(['view', ...granted]);
    const visitor = await session(created.token);
    for (const [route, run] of Object.entries(routes)) {
      const res = await run(created.token, visitor);
      const allowed = needs[route].every((key) => granted.includes(key));
      if (allowed) assert.ok(res.status < 300, `${granted} ${route}: ${res.status} ${JSON.stringify(res.data)}`);
      else assert.equal(res.code, 'LINK_FORBIDDEN', `${granted} ${route}`);
    }
  }
  // Delete last (it moves the target away).
  const deleter = await link(['view', 'delete']);
  assert.equal((await routes.delete(deleter.token, await session(deleter.token))).status, 200);
  const { rows } = await db.query(`SELECT deleted_at FROM fs_nodes WHERE id = $1`, [target.id]);
  assert.ok(rows[0].deleted_at, 'deleted items go to the trash');

  // Downloads and previews.
  const file = await makeFile(owner.ctx, root.id, 'read.txt', 'read me');
  const viewOnly = await link(['view']);
  assert.equal((await call('GET', `${viewOnly.token}/nodes/${file.id}/file`)).status, 200);
  assert.equal((await call('GET', `${viewOnly.token}/nodes/${file.id}/file?download=1`)).code, 'NO_DOWNLOAD');
  const withDl = await link(['view', 'download']);
  assert.equal((await call('GET', `${withDl.token}/nodes/${file.id}/file?download=1`)).status, 200);
  // Writes without a visitor session are refused.
  const full = await link(['view', 'upload']);
  assert.equal((await call('POST', `${full.token}/folders`, { body: { name: 'x' } })).code, 'LINK_FORBIDDEN');
  assert.equal((await call('POST', `${full.token}/upload`, { form: fileForm('x.txt', 'x') })).code, 'VISITOR_SESSION');
  // A token in the URL does not count for writes.
  const visitor = await session(full.token);
  const res = await fetch(`${base}/l/${full.token}/upload?t=${visitor}`, { method: 'POST', body: fileForm('x.txt', 'x') });
  assert.equal((await res.json()).code, 'VISITOR_SESSION');
});

test('the zone is the shared subtree; the shared item itself cannot be renamed or deleted', { skip }, async () => {
  const full = await link(['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete']);
  const visitor = await session(full.token);
  const away = await makeFile(owner.ctx, outside.id, 'away.txt', 'away');
  assert.equal((await call('PUT', `${full.token}/nodes/${away.id}`, { token: visitor, body: { name: 'pwned.txt' } })).status, 404);
  assert.equal((await call('DELETE', `${full.token}/nodes/${away.id}`, { token: visitor })).status, 404);
  assert.equal((await call('POST', `${full.token}/nodes/${away.id}/replace`, { token: visitor, form: fileForm('away.txt', 'x', 'file') })).status, 404);
  const mine = await makeFile(owner.ctx, root.id, 'mine.txt', 'mine');
  assert.equal((await call('PUT', `${full.token}/nodes/${mine.id}`, { token: visitor, body: { move: { parentId: outside.id } } })).status, 404);
  assert.equal((await call('POST', `${full.token}/folders`, { token: visitor, body: { parentId: outside.id, name: 'x' } })).status, 404);
  assert.equal((await call('POST', `${full.token}/upload?folder=${outside.id}`, { token: visitor, form: fileForm('x.txt', 'x') })).status, 404);
  assert.equal((await call('PUT', `${full.token}/nodes/${root.id}`, { token: visitor, body: { name: 'x' } })).code, 'LINK_ROOT');
  assert.equal((await call('DELETE', `${full.token}/nodes/${root.id}`, { token: visitor })).code, 'LINK_ROOT');
  assert.equal((await call('GET', `${full.token}?folder=${outside.id}`)).status, 404);
  // Moving inside the link works.
  const moved = await call('PUT', `${full.token}/nodes/${mine.id}`, { token: visitor, body: { move: { parentId: sub.id } } });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.node.parentId, sub.id);
});

test('upload-only visitors see their own uploads and never anyone else’s', { skip }, async () => {
  await makeFile(owner.ctx, root.id, 'secret.txt', 'secret');
  const drop = await link(['upload'], { requireName: true });
  const anna = await session(drop.token, { name: 'Anna' });
  const boris = await session(drop.token, { name: 'Boris' });
  assert.equal((await call('POST', `${drop.token}/upload`, { token: await session(drop.token, {}).catch(() => null), form: fileForm('n.txt', 'x') })).status >= 400, true);
  assert.equal((await call('POST', `${drop.token}/upload?folder=${sub.id}`, { token: anna, form: fileForm('anna.txt', 'from anna') })).status, 201);
  assert.equal((await call('POST', `${drop.token}/upload`, { token: boris, form: fileForm('boris.txt', 'from boris') })).status, 201);
  const asAnna = await call('GET', drop.token, { token: anna });
  assert.deepEqual(asAnna.data.items, []);
  assert.deepEqual(asAnna.data.mine.map((item) => item.name), ['anna.txt']);
  assert.deepEqual(asAnna.data.link.permissions, ['upload']);
  assert.deepEqual((await call('GET', drop.token)).data.mine, []);
  assert.equal((await call('GET', `${drop.token}?folder=${sub.id}`, { token: anna })).data.items.length, 0);
  const borisFile = (await call('GET', drop.token, { token: boris })).data.mine[0];
  assert.equal((await call('GET', `${drop.token}/nodes/${borisFile.id}/file`, { token: anna })).code, 'LINK_FORBIDDEN');
  // The ?folder= of an upload-only visitor is ignored: files land in the shared folder.
  const { rows } = await db.query(`SELECT parent_id FROM fs_nodes WHERE name = 'anna.txt' AND parent_id = ANY($1)`, [[root.id, sub.id]]);
  assert.equal(rows[0].parent_id, root.id);
  // The owner sees who sent it.
  const listing = await mods.service.listPlace(owner.ctx, { folderId: root.id });
  const anyAnna = listing.items.find((item) => item.name === 'anna.txt');
  assert.equal(anyAnna.via.name, 'Anna');
  assert.equal(anyAnna.via.action, 'upload');
});

test('name, size, type and quota limits of a link', { skip }, async () => {
  const named = await link(['view', 'upload'], { requireName: true, requireEmail: true });
  assert.equal((await call('POST', `${named.token}/session`, { body: {} })).code, 'VISITOR_NAME');
  assert.equal((await call('POST', `${named.token}/session`, { body: { name: 'Vera' } })).code, 'VISITOR_EMAIL');
  assert.equal((await call('POST', `${named.token}/session`, { body: { name: 'Vera', email: 'nope' } })).code, 'VISITOR_EMAIL');
  const vera = await session(named.token, { name: 'Vera', email: 'vera@example.com' });
  assert.equal((await call('POST', `${named.token}/upload`, { token: vera, form: fileForm('vera.txt', 'v') })).status, 201);
  const { rows: events } = await db.query(`SELECT visitor_name, visitor_email FROM fs_link_events WHERE link_id = $1`, [named.id]);
  assert.deepEqual(events[0], { visitor_name: 'Vera', visitor_email: 'vera@example.com' });

  const small = await link(['view', 'upload'], { maxFileMb: 1, extensions: '.txt, .pdf' });
  const visitor = await session(small.token);
  assert.equal((await call('POST', `${small.token}/upload`, { token: visitor, form: fileForm('big.txt', Buffer.alloc(1.5 * 1024 * 1024, 65)) })).code, 'FILE_TOO_LARGE');
  assert.equal((await call('POST', `${small.token}/upload`, { token: visitor, form: fileForm('x.docx', 'x') })).code, 'FILE_TYPE');
  assert.equal((await call('POST', `${small.token}/upload`, { token: visitor, form: fileForm('fake.pdf', 'not a pdf') })).code, 'FILE_CONTENT');
  assert.equal((await call('POST', `${small.token}/upload`, { token: visitor, form: fileForm('ok.txt', 'fine') })).status, 201);

  const capped = await link(['view', 'upload'], { quotaMb: 1 });
  const cv = await session(capped.token);
  assert.equal((await call('POST', `${capped.token}/upload`, { token: cv, form: fileForm('q1.txt', Buffer.alloc(600 * 1024, 66)) })).status, 201);
  assert.equal((await call('POST', `${capped.token}/upload`, { token: cv, form: fileForm('q2.txt', Buffer.alloc(600 * 1024, 66)) })).code, 'LINK_QUOTA');

  // The owner's personal quota counts uploads through links too.
  const { used } = await mods.service.usageOf(owner.id);
  await patchFiles({ quotaMb: Math.ceil(used / (1024 * 1024)) + 1 });
  const open = await link(['view', 'upload']);
  const ov = await session(open.token);
  assert.equal((await call('POST', `${open.token}/upload`, { token: ov, form: fileForm('quota.txt', Buffer.alloc(1.6 * 1024 * 1024, 67)) })).code, 'QUOTA_EXCEEDED');
  await patchFiles({ quotaMb: 0 });
});

test('replace keeps the old content in the trash', { skip }, async () => {
  const file = await makeFile(owner.ctx, root.id, 'r.txt', 'version one');
  const repl = await link(['view', 'replace']);
  const visitor = await session(repl.token);
  assert.equal((await call('POST', `${repl.token}/nodes/${file.id}/replace`, { token: visitor, form: fileForm('r.pdf', '%PDF-1.4', 'file') })).code, 'EXT_MISMATCH');
  const res = await call('POST', `${repl.token}/nodes/${file.id}/replace`, { token: visitor, form: fileForm('r.txt', 'version two!', 'file') });
  assert.equal(res.status, 200);
  assert.equal(res.data.node.id, file.id);
  assert.equal(await (await fetch(`${base}/l/${repl.token}/nodes/${file.id}/file`)).text(), 'version two!');
  const trash = await mods.service.listTrash(owner.ctx);
  assert.ok(trash.some((item) => item.name === 'r.txt' && item.file.size === 'version one'.length));
  // A file link can be replaced but offers nothing else.
  const fileLink = await link(['view', 'download', 'upload', 'delete', 'replace'], { nodeId: file.id });
  assert.deepEqual(fileLink.permissions, ['view', 'download', 'replace']);
});

test('changing the password or revoking ends every visitor session', { skip }, async () => {
  const locked = await link(['view', 'upload'], { password: 'secret1' });
  assert.equal((await call('POST', `${locked.token}/session`, { body: {} })).code, 'PASSWORD_REQUIRED');
  const unlocked = await call('POST', `${locked.token}/unlock`, { body: { password: 'secret1' } });
  const visitor = await session(locked.token, { name: 'Gleb' }, unlocked.data.token);
  assert.equal((await call('POST', `${locked.token}/upload`, { token: visitor, form: fileForm('g.txt', 'g') })).status, 201);
  await mods.links.updateLink(owner.ctx, locked.id, { password: 'secret2' });
  assert.equal((await call('POST', `${locked.token}/upload`, { token: visitor, form: fileForm('g2.txt', 'g') })).code, 'PASSWORD_REQUIRED');

  const openLink = await link(['view', 'upload']);
  const ov = await session(openLink.token);
  await mods.links.updateLink(owner.ctx, openLink.id, { revoked: true });
  assert.equal((await call('POST', `${openLink.token}/upload`, { token: ov, form: fileForm('r1.txt', 'r') })).status, 404);
  await mods.links.updateLink(owner.ctx, openLink.id, { revoked: false });
  assert.equal((await call('POST', `${openLink.token}/upload`, { token: ov, form: fileForm('r2.txt', 'r') })).code, 'VISITOR_SESSION');
});

test('owners get one notice per visitor burst', { skip }, async () => {
  const watched = await link(['view', 'upload', 'mkdir'], { notify: true, title: 'Contracts' });
  const visitor = await session(watched.token, { name: 'Dana' });
  for (const name of ['d1.txt', 'd2.txt']) assert.equal((await call('POST', `${watched.token}/upload`, { token: visitor, form: fileForm(name, 'd') })).status, 201);
  assert.equal((await call('POST', `${watched.token}/folders`, { token: visitor, body: { name: 'Dana folder' } })).status, 201);
  // Still inside the burst: nothing yet.
  assert.equal(await mods.writes.flushLinkNotices(), 0);
  await db.query(`UPDATE fs_link_events SET created_at = NOW() - INTERVAL '2 minutes' WHERE link_id = $1`, [watched.id]);
  assert.equal(await mods.writes.flushLinkNotices(), 1);
  assert.equal(await mods.writes.flushLinkNotices(), 0);
  const { rows } = await db.query(`SELECT title, body FROM notifications WHERE user_id = $1 AND kind = 'files.linkActivity' ORDER BY id DESC LIMIT 1`, [owner.id]);
  assert.match(rows[0].title, /Dana/);
  assert.match(rows[0].title, /Contracts/);
  assert.match(rows[0].body, /d1\.txt/);
  const activity = await mods.links.linkActivity(owner.ctx, watched.id);
  assert.equal(activity.length, 3);
  assert.equal(activity[0].visitor.name, 'Dana');
});
