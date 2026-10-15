import '../test-fixtures/test-env.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'fs/promises';
import jwt from 'jsonwebtoken';

/*
 * Files public links, review fixes, against a test database (never production!):
 * read tokens in addresses and session tokens in the header only (and the
 * upgrade of tokens issued before), per-link rate limits for every letter
 * case of a slug, drop boxes that never reveal what the folder holds, no
 * link details before the password, slug holds written with the change,
 * one view per visitor, previews that follow link changes and the default
 * upload limit per link.
 *
 *   FILES_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/files-links-review.db.test.js
 *
 * Needs the account plainuser (owner). Without FILES_DB_TEST it is skipped.
 */

const enabled = process.env.FILES_DB_TEST === '1';
const skip = enabled ? false : 'set FILES_DB_TEST=1 and a test database to run';

let db;
let server;
let base;
let mods;
let owner;
let root;
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
  raw.files = { ...(raw.files || {}), enabled: true, settings: { ...(raw.files?.settings || {}), ...patch } };
  await setSetting('modules', JSON.stringify(raw));
}

async function makeFile(parentId, name, content) {
  const { newStorageKey, storagePath, extOf } = mods.storage;
  const key = await newStorageKey(extOf(name));
  const body = Buffer.from(content);
  await writeFile(storagePath(key), body);
  const [row] = await mods.service.storeUploads(owner.ctx, { parentId, spaceId: null, ownerId: owner.id }, [{ originalname: name, path: storagePath(key), size: body.length, storageKey: key }]);
  return row;
}

const link = (perms, extra = {}) => mods.links.createLink(owner.ctx, extra.nodeId || root.id, { permissions: perms, ...extra });

async function call(method, path, { token, body, form, ua } = {}) {
  const headers = { 'User-Agent': ua || 'Mozilla/5.0 (X11; Linux x86_64) Chrome/129.0 Safari/537.36' };
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
  return res.data;
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
    slug: await import('../modules/shared/linkSlug.js'),
    preview: await import('../services/linkPreview/index.js'),
  };
  const { rows } = await db.query(`SELECT id FROM users WHERE username = 'plainuser'`);
  owner = { id: rows[0].id, ctx: await ctxOf(rows[0].id) };
  await patchFiles({ publicLinks: true, writeLinks: true, requireWriteLinkPassword: false, linkSharing: 'owners', requireLinkPassword: false, quotaMb: 0, linkQuotaMb: 2048 });
  root = await mods.service.createFolder(owner.ctx, { name: `flr-test-${Date.now()}` });

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
    await db.query(`DELETE FROM fs_links WHERE node_id IN (SELECT id FROM fs_nodes WHERE id = $1 OR parent_id = $1)`, [root.id]);
    await db.query(`DELETE FROM link_slug_holds WHERE module = 'files' AND slug LIKE 'flr-%'`);
    await db.query(`UPDATE fs_nodes SET deleted_at = NULL WHERE id = $1`, [root.id]);
    await mods.service.purgeSubtree(root.id).catch(() => {});
    const { rows } = await db.query(`SELECT id FROM fs_nodes WHERE owner_id = $1 AND deleted_at IS NOT NULL AND name LIKE 'flr-%'`, [owner.id]);
    for (const row of rows) await mods.service.purgeSubtree(row.id).catch(() => {});
    if (savedModules !== null) await mods.settings.setSetting('modules', savedModules);
  } finally {
    await db.closePool();
  }
});

test('files: read tokens in addresses, session tokens in the header only', { skip }, async () => {
  const file = await makeFile(root.id, 'flr-doc.txt', 'the content');
  const locked = await link(['view', 'download', 'upload'], { password: 'secret1' });

  // Nothing about a password link before the password (L7).
  const refused = await call('GET', locked.token);
  assert.equal(refused.status, 401);
  assert.equal(refused.code, 'PASSWORD_REQUIRED');
  assert.equal(refused.data.info, undefined, 'no name, no kind');
  assert.ok(!JSON.stringify(refused.data).includes(root.name));

  const unlocked = await call('POST', `${locked.token}/unlock`, { body: { password: 'secret1' } });
  assert.ok(unlocked.data.token && unlocked.data.readToken);
  const opened = await call('GET', locked.token, { token: unlocked.data.token });
  assert.equal(opened.status, 200);
  const reader = opened.data.readToken;
  assert.ok(reader, 'the page gets a read token for file addresses');
  assert.equal(opened.data.visitorToken, undefined, 'a current session token is not replaced');

  // The read token opens files from the address…
  assert.equal((await call('GET', `${locked.token}/nodes/${file.id}/file?t=${encodeURIComponent(reader)}`)).data, 'the content');
  // …the session token never does there (it belongs in the header).
  assert.equal((await call('GET', `${locked.token}/nodes/${file.id}/file?t=${encodeURIComponent(unlocked.data.token)}`)).code, 'PASSWORD_REQUIRED');
  assert.equal((await call('GET', `${locked.token}/nodes/${file.id}/file`, { token: unlocked.data.token })).data, 'the content');

  // A read token can neither start a session nor change anything, even in the header.
  assert.equal((await call('POST', `${locked.token}/session`, { token: reader, body: {} })).code, 'PASSWORD_REQUIRED');
  assert.equal((await call('POST', `${locked.token}/upload`, { token: reader, form: fileForm('flr-x.txt', 'x') })).code, 'PASSWORD_REQUIRED');
  const visitor = await session(locked.token, {}, unlocked.data.token);
  assert.ok(visitor.readToken);
  assert.equal((await call('POST', `${locked.token}/upload`, { token: visitor.token, form: fileForm('flr-ok.txt', 'ok') })).status, 201);

  // A token issued before scopes: reads keep working, the page gets a new session token, writes need it.
  const config = (await import('../config/app.js')).default;
  const { rows } = await db.query(`SELECT id, version FROM fs_links WHERE id = $1`, [locked.id]);
  const legacy = jwt.sign({ lid: rows[0].id, v: rows[0].version, sid: 'oldsession123', pw: true, n: 'Olga' }, `${config.auth.jwtSecret || 'dev-secret'}:files-link`, { expiresIn: '1h' });
  assert.equal((await call('GET', `${locked.token}/nodes/${file.id}/file?t=${encodeURIComponent(legacy)}`)).data, 'the content', 'pages opened before the upgrade keep showing files');
  assert.equal((await call('POST', `${locked.token}/upload`, { token: legacy, form: fileForm('flr-old.txt', 'o') })).code, 'VISITOR_SESSION');
  const fromAddress = await call('GET', `${locked.token}?t=${encodeURIComponent(legacy)}`);
  assert.equal(fromAddress.status, 200);
  assert.equal(fromAddress.data.visitorToken, undefined, 'a token found in an address is never renewed');
  assert.equal(fromAddress.data.readToken, undefined);
  const upgraded = await call('GET', locked.token, { token: legacy });
  assert.equal(upgraded.status, 200);
  assert.ok(upgraded.data.visitorToken, 'swapped automatically');
  const payload = jwt.decode(upgraded.data.visitorToken);
  assert.equal(payload.s, 'w');
  assert.equal(payload.sid, 'oldsession123', 'same session');
  assert.equal(payload.n, 'Olga', 'same name');
  assert.equal(payload.pw, true, 'no password again');
  assert.equal((await call('POST', `${locked.token}/upload`, { token: upgraded.data.visitorToken, form: fileForm('flr-new.txt', 'n') })).status, 201);
  // The session route also renews a legacy token (keeping the name without asking again).
  const renewed = await session(locked.token, {}, legacy);
  assert.equal(jwt.decode(renewed.token).sid, 'oldsession123');
  assert.equal(renewed.visitor.name, 'Olga');
});

test('files: rate limits count per link, whatever the letter case of the slug', { skip }, async () => {
  const slug = `flr-rate-${Date.now().toString(36)}`;
  const locked = await link(['view'], { password: 'secret1', slug });
  assert.equal(await mods.slug.linkRateKey('files', slug.toUpperCase()), `id:${locked.id}`);
  assert.equal(await mods.slug.linkRateKey('files', locked.token), `id:${locked.id}`);
  assert.equal(await mods.slug.linkRateKey('files', 'flr-no-such-Link'), 'addr:flr-no-such-link');
  const variants = [slug, slug.toUpperCase(), locked.token, `${slug[0].toUpperCase()}${slug.slice(1)}`];
  const codes = [];
  for (let i = 0; i < 11; i += 1) codes.push((await call('POST', `${variants[i % variants.length]}/unlock`, { body: { password: 'wrong' } })).code);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill('WRONG_PASSWORD'));
  assert.equal(codes[10], 'RATE_LIMITED', 'case variants and the token share one budget');
});

test('files: a drop box never reveals what the folder holds', { skip }, async () => {
  const box = await mods.service.createFolder(owner.ctx, { parentId: root.id, name: 'Box' });
  await makeFile(box.id, 'flr-report.txt', 'already there');
  const drop = await link(['upload'], { nodeId: box.id });
  const visitor = await session(drop.token);
  const sent = await call('POST', `${drop.token}/upload`, { token: visitor.token, form: fileForm('flr-report.txt', 'mine') });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.items[0].name, 'flr-report.txt', 'the name the visitor sent, not "(2)"');
  const mine = await call('GET', drop.token, { token: visitor.token });
  assert.deepEqual(mine.data.mine.map((item) => item.name), ['flr-report.txt']);
  // Stored under a free name; the owner sees the real one.
  const { rows } = await db.query(`SELECT name FROM fs_nodes WHERE parent_id = $1 AND deleted_at IS NULL ORDER BY id`, [box.id]);
  assert.deepEqual(rows.map((row) => row.name), ['flr-report.txt', 'flr-report (2).txt']);
  const activity = await mods.links.linkActivity(owner.ctx, drop.id);
  assert.equal(activity[0].name, 'flr-report (2).txt');
  // A link that shows the folder keeps showing the stored name.
  const open = await link(['view', 'upload'], { nodeId: box.id });
  const ov = await session(open.token);
  const shown = await call('POST', `${open.token}/upload`, { token: ov.token, form: fileForm('flr-report.txt', 'third') });
  assert.equal(shown.data.items[0].name, 'flr-report (3).txt');
});

test('files: a changed or deleted slug is held in the same transaction', { skip }, async () => {
  const first = `flr-hold-${Date.now().toString(36)}`;
  const created = await link(['view'], { slug: first });
  await db.query(`ALTER TABLE link_slug_holds RENAME TO link_slug_holds_off`);
  try {
    await assert.rejects(mods.links.updateLink(owner.ctx, created.id, { slug: `${first}-b` }));
    await assert.rejects(mods.links.deleteLink(owner.ctx, created.id));
  } finally {
    await db.query(`ALTER TABLE link_slug_holds_off RENAME TO link_slug_holds`);
  }
  const { rows } = await db.query(`SELECT slug FROM fs_links WHERE id = $1`, [created.id]);
  assert.equal(rows[0]?.slug, first, 'no hold, no change: the link keeps its address');
  await mods.links.updateLink(owner.ctx, created.id, { slug: `${first}-b` });
  const { rows: held } = await db.query(`SELECT author_id FROM link_slug_holds WHERE module = 'files' AND slug = $1`, [first]);
  assert.equal(held[0].author_id, owner.id);
});

test('files: one view per visitor; the author’s preview and reloads do not count', { skip }, async () => {
  const counted = await link(['view', 'upload']);
  const views = async () => (await db.query(`SELECT view_count FROM fs_links WHERE id = $1`, [counted.id])).rows[0].view_count;
  await call('GET', counted.token);
  assert.equal(await views(), 1);
  await call('GET', `${counted.token}?repeat=1`);
  await call('GET', `${counted.token}?preview=1`);
  await call('GET', counted.token, { ua: 'TelegramBot (like TwitterBot)' });
  assert.equal(await views(), 1);
});

test('files: link previews follow changes at once', { skip }, async () => {
  const shared = await link(['view'], { title: 'flr Before' });
  const route = mods.preview.parseRoute(`/l/${shared.token}`);
  assert.equal((await mods.preview.previewModel(route)).title, 'flr Before');
  await mods.links.updateLink(owner.ctx, shared.id, { title: 'flr After' });
  assert.equal((await mods.preview.previewModel(route)).title, 'flr After', 'no minute of the old title');
  await mods.links.updateLink(owner.ctx, shared.id, { revoked: true });
  assert.equal((await mods.preview.previewModel(route)).state, 'invalid', 'revoked: no details any more');
  const gone = await link(['view'], { title: 'flr Gone' });
  const goneRoute = mods.preview.parseRoute(`/l/${gone.token}`);
  assert.equal((await mods.preview.previewModel(goneRoute)).state, 'ok');
  await mods.links.deleteLink(owner.ctx, gone.id);
  assert.equal((await mods.preview.previewModel(goneRoute)).state, 'invalid');
});

test('files: links without a quota of their own take the module default', { skip }, async () => {
  await patchFiles({ linkQuotaMb: 1 });
  try {
    const drop = await link(['upload']);
    const visitor = await session(drop.token);
    assert.equal((await call('POST', `${drop.token}/upload`, { token: visitor.token, form: fileForm('flr-q1.txt', Buffer.alloc(600 * 1024, 66)) })).status, 201);
    assert.equal((await call('POST', `${drop.token}/upload`, { token: visitor.token, form: fileForm('flr-q2.txt', Buffer.alloc(600 * 1024, 66)) })).code, 'LINK_QUOTA');
    // New versions count too (each keeps the old one in the trash).
    const file = await makeFile(root.id, 'flr-v.txt', 'v1');
    const repl = await link(['view', 'replace']);
    const rv = await session(repl.token);
    assert.equal((await call('POST', `${repl.token}/nodes/${file.id}/replace`, { token: rv.token, form: fileForm('flr-v.txt', Buffer.alloc(600 * 1024, 67), 'file') })).status, 200);
    assert.equal((await call('POST', `${repl.token}/nodes/${file.id}/replace`, { token: rv.token, form: fileForm('flr-v.txt', Buffer.alloc(600 * 1024, 68), 'file') })).code, 'LINK_QUOTA');
    // A link's own quota wins over the default.
    const own = await link(['upload'], { quotaMb: 5 });
    const ov = await session(own.token);
    assert.equal((await call('POST', `${own.token}/upload`, { token: ov.token, form: fileForm('flr-o1.txt', Buffer.alloc(600 * 1024, 69)) })).status, 201);
    assert.equal((await call('POST', `${own.token}/upload`, { token: ov.token, form: fileForm('flr-o2.txt', Buffer.alloc(600 * 1024, 69)) })).status, 201);
    // 0 = unlimited.
    await patchFiles({ linkQuotaMb: 0 });
    const free = await link(['upload']);
    const fv = await session(free.token);
    for (const name of ['flr-f1.txt', 'flr-f2.txt']) {
      assert.equal((await call('POST', `${free.token}/upload`, { token: fv.token, form: fileForm(name, Buffer.alloc(600 * 1024, 70)) })).status, 201);
    }
  } finally {
    await patchFiles({ linkQuotaMb: 2048 });
  }
});
