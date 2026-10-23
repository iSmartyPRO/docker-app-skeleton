import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

/*
 * Custom addresses of Drive public links (/d/<slug>) against a test database
 * (never production!), with the SMB gateway replaced by
 * test-fixtures/mock-smbgate.mjs:
 *
 *   DRIVE_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/drive-link-slugs.db.test.js
 *
 * Availability endpoint, case-insensitive uniqueness under concurrency,
 * public resolution by slug and token (also unlock), slug changes, held
 * addresses, revoked links, the rate limit, and that Files and Drive are
 * separate namespaces.
 */

const enabled = process.env.DRIVE_DB_TEST === '1';
const skip = enabled ? false : 'set DRIVE_DB_TEST=1 and a test database to run';

const root = enabled ? mkdtempSync(join(tmpdir(), 'drive-slugs-')) : '';
const aclFile = join(root, 'acl.json');
const PREFIX = `dsl${Date.now().toString(36)}`;

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
    await db.query(`DELETE FROM link_slug_holds WHERE slug LIKE $1`, [`${PREFIX}%`]);
    if (cleanup.users.length) {
      await db.query(`DELETE FROM drive_activity WHERE user_id = ANY($1) OR link_id IN (SELECT id FROM drive_links WHERE created_by = ANY($1))`, [cleanup.users]);
      await db.query(`DELETE FROM drive_activity WHERE via = 'link' AND link_id IS NULL AND details->>'token' LIKE $1`, [`${PREFIX.slice(0, 8)}%`]);
    }
    if (cleanup.servers.length) await db.query(`DELETE FROM drive_servers WHERE id = ANY($1)`, [cleanup.servers]);
    if (cleanup.users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [cleanup.users]);
    if (originalModules !== null) await setSetting('modules', originalModules);
    else await db.query(`DELETE FROM app_settings WHERE key = 'modules'`);
    const { stopGate } = await import('../modules/drive/gate.js');
    stopGate();
    await db.closePool();
  }
  if (root) rmSync(root, { recursive: true, force: true });
});

async function call(method, path, { as, json } = {}) {
  const init = { method, headers: {} };
  if (as) init.headers['X-Test-User'] = String(as);
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  const res = await fetch(`${base}${path}`, init);
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
}

test('database: drive link slugs', { skip, timeout: 120000 }, async () => {
  process.env.SMBGATE_PYTHON = fileURLToPath(new URL('../test-fixtures/mock-smbgate.mjs', import.meta.url));
  process.env.MOCK_SMB_ROOT = root;
  process.env.MOCK_SMB_ACL = aclFile;
  writeFileSync(aclFile, JSON.stringify({ known: true, users: { svc: { password: 'pw1', write: true, delete: true } } }));
  mkdirSync(join(root, 'Data', 'Clients'), { recursive: true });
  writeFileSync(join(root, 'Data', 'Clients', 'a.txt'), 'hello');

  db = await import('../config/database.js');
  const { getSetting, setSetting, getSettings, parseSettings } = await import('../services/settings.js');
  originalModules = await getSetting('modules', null);
  const { ensureDriveSchema } = await import('../modules/drive/schema.js');
  await ensureDriveSchema();
  const { sanitizeModules } = await import('../modules/catalog.js');
  const parsed = parseSettings(await getSettings({ fresh: true }));
  await setSetting('modules', JSON.stringify(sanitizeModules(parsed.modules, { drive: { enabled: true, settings: { publicLinks: true, linkWrite: true, linkAudience: 'any', requireLinkPassword: false, maxLinkDays: 0 } } })));
  const { seal } = await import('../services/crypto.js');
  const links = await import('../modules/drive/links.js');
  const { privateRoutes, publicRoutes } = await import('../modules/drive/routes.js');
  const { getUserAccess } = await import('../services/rbac.js');
  const express = (await import('express')).default;

  const makeUser = async (suffix) => {
    const name = `${PREFIX}${suffix}`;
    const { rows } = await db.query(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES ($1, $2, '!', 'user', $1) RETURNING id`, [name, `${name}@test.invalid`]);
    cleanup.users.push(rows[0].id);
    return rows[0].id;
  };
  const author = await makeUser('a');
  const other = await makeUser('b');
  const prober = await makeUser('c');
  const { rows: servers } = await db.query(
    `INSERT INTO drive_servers (name, host, auth, use_login, service_user, service_secret) VALUES ('Mock', 'mock.invalid', 'service', FALSE, 'svc', $1) RETURNING id`,
    [seal('pw1')]
  );
  cleanup.servers.push(servers[0].id);
  const { rows: shares } = await db.query(`INSERT INTO drive_shares (server_id, title, share, allow_links) VALUES ($1, 'Data', 'Data', TRUE) RETURNING id`, [servers[0].id]);
  const shareId = shares[0].id;
  const ctx = { userId: author, groupIds: new Set(), isAdmin: false };

  const app = express();
  app.set('trust proxy', false);
  app.use(express.json());
  app.use('/api/app/drive', async (req, res, next) => {
    const id = Number(req.get('x-test-user'));
    if (!id) return res.status(401).json({ code: 'UNAUTHORIZED' });
    req.user = { id };
    req.access = await getUserAccess(id);
    next();
  }, privateRoutes());
  app.use('/api/d', publicRoutes());
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, code: err.code, error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
  const check = (slug, as = author, linkId) => call('GET', `/app/drive/link-slugs/check?slug=${encodeURIComponent(slug)}${linkId ? `&linkId=${linkId}` : ''}`, { as });
  const create = (slug, extra = {}) => call('POST', `/app/drive/shares/${shareId}/links`, { as: author, json: { path: 'Clients', slug, ...extra } });

  const slug = `${PREFIX}-chertezhi`;
  let res = await check(`${PREFIX} Чертежи`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.available, res.body.slug], [true, slug]);
  assert.equal((await call('GET', `/app/drive/link-slugs/check?slug=${slug}`)).status, 401, 'signed-in people only');
  res = await check('login');
  assert.equal(res.body.reason, 'RESERVED');

  // Create with a slug through the route (audited), with a password.
  res = await create(slug, { password: 'secret1' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const link = res.body.link;
  assert.equal(link.slug, slug);
  res = await check(slug.toUpperCase(), other);
  assert.deepEqual([res.body.available, res.body.reason], [false, 'TAKEN']);
  assert.ok(res.body.suggestions.length > 0);
  res = await create(slug.toUpperCase());
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'SLUG_TAKEN');

  // The public page by slug (any case) and by token; the password unlock works by slug too.
  for (const address of [slug, slug.toUpperCase(), link.token]) {
    res = await call('GET', `/d/${encodeURIComponent(address)}`);
    assert.equal(res.body.code, 'PASSWORD_REQUIRED', address);
  }
  res = await call('POST', `/d/${slug}/unlock`, { json: { password: 'secret1' } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const visitor = res.body.token;
  res = await fetch(`${base}/d/${slug}`, { headers: { 'X-Link-Token': visitor } }).then((r) => r.json());
  assert.deepEqual(res.entries.map((entry) => entry.name), ['a.txt']);
  // The same visitor session also works on the token address (it is bound to the link, not the address).
  res = await fetch(`${base}/d/${link.token}`, { headers: { 'X-Link-Token': visitor } }).then((r) => r.json());
  assert.equal(res.success, true);

  // Concurrency: one of three wins.
  const raced = `${PREFIX}-race`;
  const results = await Promise.all([create(raced), create(raced), create(raced)]);
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 409, 409], JSON.stringify(results.map((item) => item.body)));

  // Files and Drive are separate namespaces.
  const { checkSlug } = await import('../modules/shared/linkSlug.js');
  assert.equal((await checkSlug('files', slug, { authorId: other })).available, true);

  // Change: the old address stops, the new one works; the old one is held for the author.
  const renamed = `${PREFIX}-plans`;
  const updated = await links.updateLink(ctx, link.id, { slug: renamed });
  assert.equal(updated.slug, renamed);
  assert.equal((await call('GET', `/d/${slug}`)).body.code, 'NOT_FOUND', 'an unknown address is "no such link", not "file moved"');
  assert.equal((await call('GET', `/d/${renamed}`)).body.code, 'PASSWORD_REQUIRED');
  assert.equal((await check(slug, other)).body.reason, 'RECENT');
  assert.equal((await check(slug, author)).body.available, true);
  assert.equal((await check(renamed, author, link.id)).body.available, true, 'its own address while editing');
  assert.equal((await check(renamed, other, link.id)).status, 404, 'someone else’s link');

  // Revoked: the slug stays with the link and shows "turned off".
  await links.updateLink(ctx, link.id, { revoked: true });
  assert.equal((await call('GET', `/d/${renamed}`)).body.code, 'REVOKED');
  assert.equal((await check(renamed, author)).body.reason, 'TAKEN');

  // Delete: held for its author only.
  await links.deleteLink(ctx, link.id);
  assert.equal((await call('GET', `/d/${renamed}`)).body.code, 'NOT_FOUND');
  assert.equal((await check(renamed, other)).body.reason, 'RECENT');
  await assert.rejects(links.createLink({ userId: other, groupIds: new Set(), isAdmin: false }, shareId, 'Clients', { slug: renamed }), (err) => err.code === 'SLUG_TAKEN');
  const again = await links.createLink(ctx, shareId, 'Clients', { slug: renamed });
  assert.equal(again.slug, renamed);

  // Rate limit per person.
  let last;
  for (let index = 0; index < 61; index += 1) last = await check(`${PREFIX}-probe-${index}`, prober);
  assert.equal(last.status, 429);
  assert.equal(last.body.code, 'RATE_LIMITED');
});
