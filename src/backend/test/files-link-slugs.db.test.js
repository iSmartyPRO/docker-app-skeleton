import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Custom addresses of Files public links against a test database (never
 * production!):
 *
 *   FILES_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/files-link-slugs.db.test.js
 *
 * Availability endpoint, case-insensitive uniqueness, the unique index under
 * concurrency, public resolution by slug and token, slug changes (the old
 * address stops), held addresses after a change, revoke or delete, and the
 * rate limit. Needs the accounts plainuser, buh and foreman.
 */

const enabled = process.env.FILES_DB_TEST === '1';
const skip = enabled ? false : 'set FILES_DB_TEST=1 and a test database to run';

const PREFIX = `slt${Date.now().toString(36)}`;
let db;
let mods;
let server;
let base;
let users;
let root;
let savedModules = null;

async function patchFiles(patch) {
  const { getSetting, setSetting } = mods.settings;
  const raw = JSON.parse((await getSetting('modules')) || '{}');
  if (savedModules === null) savedModules = JSON.stringify(raw);
  raw.files = { ...(raw.files || {}), settings: { ...(raw.files?.settings || {}), ...patch } };
  await setSetting('modules', JSON.stringify(raw));
}

/** A request as a signed-in user (`as`: username) or anonymously. */
async function call(method, path, { as, body } = {}) {
  const headers = {};
  if (as) headers['X-Test-User'] = String(users[as]);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, code: data?.code };
}

const check = (slug, as = 'plainuser', linkId) => call('GET', `/app/files/link-slugs/check?slug=${encodeURIComponent(slug)}${linkId ? `&linkId=${linkId}` : ''}`, { as });
const create = (slug, extra = {}) => call('POST', `/app/files/nodes/${root.id}/links`, { as: 'plainuser', body: { slug, ...extra } });

before(async () => {
  if (!enabled) return;
  process.env.DISABLE_SCHEDULER = 'true';
  db = await import('../config/database.js');
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  mods = {
    settings: await import('../services/settings.js'),
    service: await import('../modules/files/service.js'),
    rbac: await import('../services/rbac.js'),
  };
  const { rows } = await db.query(`SELECT id, username FROM users WHERE username = ANY($1)`, [['plainuser', 'buh', 'foreman']]);
  users = Object.fromEntries(rows.map((row) => [row.username, row.id]));
  await patchFiles({ publicLinks: true, linkSharing: 'owners', requireLinkPassword: false, maxLinkDays: 0 });
  const { contextFromRequest } = await import('../modules/shared/acl.js');
  const ownerCtx = contextFromRequest({ user: { id: users.plainuser }, access: await mods.rbac.getUserAccess(users.plainuser) }, 'files.admin');
  root = await mods.service.createFolder(ownerCtx, { name: `${PREFIX}-folder` });

  const express = (await import('express')).default;
  const { privateRoutes, publicRoutes } = await import('../modules/files/routes.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(express.json());
  // Stand-in for the portal's authentication: the user named in a header.
  app.use('/app/files', async (req, res, next) => {
    const id = Number(req.get('x-test-user'));
    if (!id) return res.status(401).json({ code: 'UNAUTHORIZED' });
    req.user = { id };
    req.access = await mods.rbac.getUserAccess(id);
    next();
  }, privateRoutes());
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
    await db.query(`DELETE FROM link_slug_holds WHERE module = 'files' AND slug LIKE $1`, [`${PREFIX}%`]);
    if (root) {
      await db.query(`DELETE FROM fs_links WHERE node_id = $1`, [root.id]);
      await mods.service.purgeSubtree(root.id).catch(() => {});
    }
    if (savedModules !== null) await mods.settings.setSetting('modules', savedModules);
  } finally {
    await db.closePool();
  }
});

test('files slugs: availability, uniqueness, resolution, changes and holds', { skip }, async () => {
  const slug = `${PREFIX}-dogovor`;

  // Free, normalized (Cyrillic and case), and only for signed-in people.
  let res = await check(slug);
  assert.equal(res.status, 200);
  assert.deepEqual([res.data.available, res.data.slug, res.data.reason], [true, slug, null]);
  res = await check(`${PREFIX.toUpperCase()} Договор`);
  assert.equal(res.data.slug, `${PREFIX}-dogovor`);
  assert.equal((await call('GET', `/app/files/link-slugs/check?slug=${slug}`)).status, 401);

  // Invalid and reserved addresses.
  res = await check('ab');
  assert.deepEqual([res.data.available, res.data.reason], [false, 'SHORT']);
  res = await check('admin');
  assert.deepEqual([res.data.available, res.data.reason], [false, 'RESERVED']);
  assert.ok(res.data.suggestions.includes('admin-2'));
  res = await create('admin');
  assert.equal(res.status, 400);
  assert.equal(res.code, 'SLUG_INVALID');

  // Create with a slug: it is taken now, in any case, with free suggestions.
  res = await create(slug, { permissions: ['view'] });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  const first = res.data.link;
  assert.equal(first.slug, slug);
  assert.ok(first.token);
  res = await check(slug.toUpperCase());
  assert.deepEqual([res.data.available, res.data.reason], [false, 'TAKEN']);
  assert.ok(res.data.suggestions.length >= 2 && res.data.suggestions.every((item) => item.startsWith(`${slug}-`)));
  res = await create(slug.toUpperCase());
  assert.equal(res.status, 409);
  assert.equal(res.code, 'SLUG_TAKEN');
  // The own link's address counts as free while editing it.
  res = await check(slug, 'plainuser', first.id);
  assert.equal(res.data.available, true);
  // Somebody else's link id is not a way in.
  assert.equal((await check(slug, 'buh', first.id)).status, 404);

  // Public: by slug (any case) and by token.
  for (const address of [slug, slug.toUpperCase(), first.token]) {
    res = await call('GET', `/l/${encodeURIComponent(address)}`);
    assert.equal(res.status, 200, `${address}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.node.id, root.id);
  }

  // Two creates with the same slug at once: the unique index lets exactly one win.
  const raced = `${PREFIX}-race`;
  const results = await Promise.all([create(raced), create(raced), create(raced)]);
  const statuses = results.map((item) => item.status).sort();
  assert.deepEqual(statuses, [201, 409, 409], JSON.stringify(results.map((item) => item.data)));
  assert.ok(results.filter((item) => item.status === 409).every((item) => item.code === 'SLUG_TAKEN'));

  // A slug equal to another link's token is taken too (tokens resolve first).
  await db.query(`UPDATE fs_links SET token = $2 WHERE id = $1`, [first.id, `${PREFIX}tok`]);
  res = await check(`${PREFIX}tok`);
  assert.deepEqual([res.data.available, res.data.reason], [false, 'TAKEN']);

  // Changing the slug: the old address stops at once, the new one works.
  const renamed = `${PREFIX}-akt`;
  res = await call('PUT', `/app/files/links/${first.id}`, { as: 'plainuser', body: { slug: renamed } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.link.slug, renamed);
  assert.equal((await call('GET', `/l/${slug}`)).status, 404);
  assert.equal((await call('GET', `/l/${renamed}`)).status, 200);
  assert.equal((await call('GET', `/l/${PREFIX}tok`)).status, 200);
  // The old address is held: others cannot take it, its author can.
  res = await check(slug, 'buh');
  assert.deepEqual([res.data.available, res.data.reason], [false, 'RECENT']);
  res = await check(slug, 'plainuser');
  assert.equal(res.data.available, true);
  // Changing to a taken slug is refused and leaves the link as it was.
  res = await call('PUT', `/app/files/links/${first.id}`, { as: 'plainuser', body: { slug: raced } });
  assert.equal(res.status, 409);
  assert.equal((await call('GET', `/l/${renamed}`)).status, 200);
  // Clearing the slug leaves the token only.
  res = await call('PUT', `/app/files/links/${first.id}`, { as: 'plainuser', body: { slug: '' } });
  assert.equal(res.data.link.slug, null);
  assert.equal((await call('GET', `/l/${renamed}`)).status, 404);

  // Revoked links keep their slug (a shared address never opens something else).
  const kept = `${PREFIX}-kept`;
  const second = (await create(kept)).data.link;
  res = await call('PUT', `/app/files/links/${second.id}`, { as: 'plainuser', body: { revoked: true } });
  assert.equal(res.data.link.revoked, true);
  assert.equal((await call('GET', `/l/${kept}`)).status, 404);
  res = await check(kept, 'plainuser');
  assert.deepEqual([res.data.available, res.data.reason], [false, 'TAKEN']);

  // Deleting the link releases the slug only to its author.
  assert.equal((await call('DELETE', `/app/files/links/${second.id}`, { as: 'plainuser' })).status, 200);
  assert.equal((await check(kept, 'buh')).data.reason, 'RECENT');
  res = await create(kept);
  assert.equal(res.status, 201, JSON.stringify(res.data));
  const { rows: holds } = await db.query(`SELECT 1 FROM link_slug_holds WHERE module = 'files' AND slug = $1`, [kept]);
  assert.equal(holds.length, 0, 'a reclaimed slug is no longer held');
});

test('files slugs: the availability check is rate limited per person', { skip }, async () => {
  let last;
  for (let index = 0; index < 61; index += 1) last = await check(`${PREFIX}-probe-${index}`, 'foreman');
  assert.equal(last.status, 429);
  assert.equal(last.code, 'RATE_LIMITED');
  // Another person has their own budget.
  assert.equal((await check(`${PREFIX}-probe-x`, 'buh')).status, 200);
});
