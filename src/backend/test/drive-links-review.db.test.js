import '../test-fixtures/test-env.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

/*
 * Drive public links, review fixes, end to end through the public routes and
 * the mock SMB gateway (test-fixtures/mock-smbgate.mjs): read tokens in
 * addresses and session tokens in the header only (and the upgrade of tokens
 * issued before), per-link rate limits for every letter case of a slug, no
 * link details before the password or the sign-in, slug holds written with
 * the change, one view per visitor (and none for the author's preview), and
 * previews that follow link changes. Needs a test database (never production!):
 *
 *   DRIVE_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/drive-links-review.db.test.js
 */

const enabled = process.env.DRIVE_DB_TEST === '1';
const skip = enabled ? false : 'set DRIVE_DB_TEST=1 and a test database to run';

const root = enabled ? mkdtempSync(join(tmpdir(), 'drive-review-')) : '';
const aclFile = join(root, 'acl.json');

let db = null;
let server = null;
let base = '';
let originalModules = null;
const cleanup = { users: [], servers: [] };

after(async () => {
  if (server) server.close();
  if (db) {
    const { setSetting } = await import('../services/settings.js');
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (cleanup.users.length) {
      const { rows } = await db.query(`SELECT LEFT(token, 8) AS token FROM drive_links WHERE created_by = ANY($1)`, [cleanup.users]);
      await db.query(
        `DELETE FROM drive_activity WHERE user_id = ANY($1) OR link_id IN (SELECT id FROM drive_links WHERE created_by = ANY($1))
           OR (via = 'link' AND link_id IS NULL AND details->>'token' = ANY($2))`,
        [cleanup.users, rows.map((row) => row.token)]
      );
      await db.query(`DELETE FROM link_slug_holds WHERE module = 'drive' AND author_id = ANY($1)`, [cleanup.users]);
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

async function call(method, path, { token, query = {}, json, bytes, ua } = {}) {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const init = { method, headers: { 'User-Agent': ua || 'Mozilla/5.0 (X11; Linux x86_64) Chrome/129.0 Safari/537.36' } };
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

test('database: drive link review fixes', { skip, timeout: 120000 }, async () => {
  process.env.SMBGATE_PYTHON = fileURLToPath(new URL('../test-fixtures/mock-smbgate.mjs', import.meta.url));
  process.env.MOCK_SMB_ROOT = root;
  process.env.MOCK_SMB_ACL = aclFile;
  writeFileSync(aclFile, JSON.stringify({ known: true, users: { svc: { password: 'pw1', write: true, delete: true } } }));
  mkdirSync(share('Clients'), { recursive: true });
  writeFileSync(share('Clients', 'a.txt'), 'hello');

  db = await import('../config/database.js');
  const settings = await import('../services/settings.js');
  originalModules = await settings.getSetting('modules', null);
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  const { sanitizeModules } = await import('../modules/catalog.js');
  const parsed = settings.parseSettings(await settings.getSettings({ fresh: true }));
  await settings.setSetting('modules', JSON.stringify(sanitizeModules(parsed.modules, { drive: { enabled: true, settings: { publicLinks: true, linkWrite: true, requireWritePassword: false, linkAudience: 'any', requireLinkPassword: false, maxLinkDays: 0 } } })));
  const { seal } = await import('../services/crypto.js');
  const links = await import('../modules/drive/links.js');
  const { linkRateKey } = await import('../modules/shared/linkSlug.js');
  const preview = await import('../services/linkPreview/index.js');
  const { publicRoutes } = await import('../modules/drive/routes.js');
  const config = (await import('../config/app.js')).default;
  const express = (await import('express')).default;

  const name = `dr${Date.now().toString(36)}`;
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

  // ── Password link: nothing before the password; read tokens in addresses, sessions in the header ──
  const locked = await links.createLink(ctx, shareId, 'Clients', { permissions: ['view', 'download', 'upload'], password: 'open-sesame', title: 'Secret plans' });
  let res = await call('GET', `/${locked.token}`);
  assert.equal(res.body.code, 'PASSWORD_REQUIRED');
  assert.equal(res.body.info, undefined, 'no name, no kind before the password (L7)');
  const unlocked = (await call('POST', `/${locked.token}/unlock`, { json: { password: 'open-sesame' } })).body;
  assert.ok(unlocked.token && unlocked.readToken);
  res = await call('GET', `/${locked.token}`, { token: unlocked.token });
  assert.equal(res.status, 200);
  const reader = res.body.readToken;
  assert.ok(reader);
  assert.equal(res.body.visitorToken, undefined);
  assert.equal((await call('GET', `/${locked.token}/file`, { query: { path: 'a.txt', t: reader } })).body.toString(), 'hello', 'the read token opens files from the address');
  assert.equal((await call('GET', `/${locked.token}/file`, { query: { path: 'a.txt', t: unlocked.token } })).body.code, 'PASSWORD_REQUIRED', 'a session token is refused in the address');
  assert.equal((await call('POST', `/${locked.token}/unlock`, { json: {}, token: reader })).body.code, 'WRONG_PASSWORD', 'a read token never becomes a session');
  assert.equal((await call('PUT', `/${locked.token}/upload`, { token: reader, query: { name: 'r.txt' }, bytes: 'r' })).body.code, 'PASSWORD_REQUIRED', 'nor changes anything (it does not even count as unlocked)');
  assert.equal((await call('PUT', `/${locked.token}/upload`, { token: unlocked.token, query: { name: 'ok.txt' }, bytes: 'ok' })).status, 200);

  // A token issued before scopes: reads keep working, the page gets a fresh session token, changes need it.
  const { rows: lockedRows } = await db.query(`SELECT id, version FROM drive_links WHERE id = $1`, [locked.id]);
  const legacy = jwt.sign({ lid: lockedRows[0].id, v: lockedRows[0].version, sid: 'oldsid', n: 'Olga' }, `${config.auth.jwtSecret || 'dev-secret'}:drive-link`, { expiresIn: '1h' });
  assert.equal((await call('GET', `/${locked.token}/file`, { query: { path: 'a.txt', t: legacy } })).body.toString(), 'hello', 'pages opened before the upgrade keep showing files');
  assert.equal((await call('PUT', `/${locked.token}/upload`, { token: legacy, query: { name: 'old.txt' }, bytes: 'o' })).body.code, 'SESSION_REQUIRED');
  res = await call('GET', `/${locked.token}`, { query: { t: legacy } });
  assert.equal(res.status, 200);
  assert.equal(res.body.visitorToken, undefined, 'a token found in an address is never renewed');
  assert.equal(res.body.readToken, undefined);
  res = await call('GET', `/${locked.token}`, { token: legacy });
  assert.equal(res.status, 200);
  const fresh = jwt.decode(res.body.visitorToken);
  assert.equal(fresh.s, 'w');
  assert.equal(fresh.sid, 'oldsid', 'same session');
  assert.equal(fresh.n, 'Olga', 'same name');
  assert.equal((await call('PUT', `/${locked.token}/upload`, { token: res.body.visitorToken, query: { name: 'new.txt' }, bytes: 'n' })).status, 200);

  // ── Employees-only link: no name before the sign-in ──
  const staff = await links.createLink(ctx, shareId, 'Clients', { permissions: ['view'], audience: 'employees' });
  res = await call('GET', `/${staff.token}`);
  assert.equal(res.body.code, 'SIGN_IN_REQUIRED');
  assert.equal(res.body.info, undefined);

  // ── Rate limits per link, whatever the letter case ──
  const slug = `dr-rate-${Date.now().toString(36)}`;
  const limited = await links.createLink(ctx, shareId, 'Clients', { permissions: ['view'], password: 'secret1', slug });
  assert.equal(await linkRateKey('drive', slug.toUpperCase()), `id:${limited.id}`);
  assert.equal(await linkRateKey('drive', limited.token), `id:${limited.id}`);
  const variants = [slug, slug.toUpperCase(), limited.token];
  const codes = [];
  for (let i = 0; i < 11; i += 1) codes.push((await call('POST', `/${variants[i % variants.length]}/unlock`, { json: { password: 'wrong' } })).body.code);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill('WRONG_PASSWORD'));
  assert.equal(codes[10], 'RATE_LIMITED');

  // ── Views: first load of a person only; not the author's preview, not reloads ──
  const counted = await links.createLink(ctx, shareId, 'Clients', { permissions: ['view'] });
  const views = async () => (await db.query(`SELECT view_count FROM drive_links WHERE id = $1`, [counted.id])).rows[0].view_count;
  await call('GET', `/${counted.token}`);
  assert.equal(await views(), 1);
  await call('GET', `/${counted.token}`, { query: { preview: '1' } });
  await call('GET', `/${counted.token}`, { query: { repeat: '1' } });
  assert.equal(await views(), 1);

  // ── Slug holds commit with the change ──
  const held = `dr-hold-${Date.now().toString(36)}`;
  const holdLink = await links.createLink(ctx, shareId, 'Clients', { permissions: ['view'], slug: held });
  await db.query(`ALTER TABLE link_slug_holds RENAME TO link_slug_holds_off`);
  try {
    await assert.rejects(links.updateLink(ctx, holdLink.id, { slug: `${held}-b` }));
    await assert.rejects(links.deleteLink(ctx, holdLink.id));
  } finally {
    await db.query(`ALTER TABLE link_slug_holds_off RENAME TO link_slug_holds`);
  }
  const { rows: kept } = await db.query(`SELECT slug FROM drive_links WHERE id = $1`, [holdLink.id]);
  assert.equal(kept[0]?.slug, held);
  await links.deleteLink(ctx, holdLink.id);
  const { rows: holds } = await db.query(`SELECT author_id FROM link_slug_holds WHERE module = 'drive' AND slug = $1`, [held]);
  assert.equal(holds[0].author_id, userId);

  // ── Previews follow changes at once ──
  const shown = await links.createLink(ctx, shareId, 'Clients', { permissions: ['view'], title: 'dr Before' });
  const route = preview.parseRoute(`/d/${shown.token}`);
  assert.equal((await preview.previewModel(route)).title, 'dr Before');
  await links.updateLink(ctx, shown.id, { title: 'dr After' });
  assert.equal((await preview.previewModel(route)).title, 'dr After');
  await links.updateLink(ctx, shown.id, { revoked: true });
  assert.equal((await preview.previewModel(route)).state, 'invalid');
});
