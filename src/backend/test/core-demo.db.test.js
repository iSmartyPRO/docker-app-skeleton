import '../test-fixtures/test-env.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'fs/promises';
import { resolve } from 'path';

/*
 * Demo data of Files, Chat, Online resources, Calendar and the Knowledge base
 * (and the explanation-only entry of Drive) against a real database: each
 * seeds once (a second seed is a no-op), the stored files really are on
 * disk, and the purge leaves nothing — rows, public links, uploaded blobs.
 * Needs a test database (never production!) with a superadministrator:
 *
 *   DEMO_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/core-demo.db.test.js
 *
 * Without DEMO_DB_TEST it is skipped, so `npm test` stays database-free.
 * Only these modules' demo data is touched (other modules' demo stays).
 */

const enabled = process.env.DEMO_DB_TEST === '1';
const skip = enabled ? false : 'set DEMO_DB_TEST=1 and a test database to run';

const MODULES = ['files', 'chat', 'resources', 'calendar', 'kb'];

let db = null;
let demo = null;
let req = null;
let uploadRoot = null;

async function setup() {
  if (db) return;
  db = await import('../config/database.js');
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  demo = await import('../services/demo.js');
  ({ uploadRoot } = await import('../config/paths.js'));
  const { requestAs } = await import('../api/events.js');
  const { rows } = await db.query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN app_roles r ON r.id = ur.role_id WHERE r.key = 'superadmin' AND u.is_active ORDER BY u.id LIMIT 1`);
  assert.ok(rows[0], 'the test database needs a superadministrator');
  req = { ...(await requestAs(rows[0].id)), locale: 'ru' };
  const { updateAdminSettings } = await import('../services/settings.js');
  await updateAdminSettings({ modules: Object.fromEntries([...MODULES, 'drive'].map((id) => [id, { enabled: true }])) });
  for (const module of [...MODULES].reverse()) await demo.purgeModule(module, req);
}

const tracked = async (module, table) => (await db.query(`SELECT record_key FROM demo_records WHERE module = $1 AND table_name = $2`, [module, table])).rows.map((row) => Number(row.record_key));
const count = async (sql, params) => Number((await db.query(sql, params)).rows[0].n);
const exists = (path) => access(path).then(() => true, () => false);

after(async () => {
  if (!db) return;
  for (const module of [...MODULES].reverse()) await demo.purgeModule(module, req).catch(() => {});
  await new Promise((done) => setTimeout(done, 500));
  await db.closePool();
});

test('core demo: seeds once, files on disk, purge leaves nothing', { skip }, async () => {
  await setup();
  for (const module of MODULES) {
    const first = await demo.seedModule(module, req);
    assert.equal(first.already, false, `${module} seeds`);
    const again = await demo.seedModule(module, req);
    assert.equal(again.already, true, `${module}: a second seed adds nothing`);
  }

  // Files: a space, folders, five kinds of files, two public links (one upload-only).
  const spaces = await tracked('files', 'fs_spaces');
  assert.equal(spaces.length, 1);
  const files = (await db.query(`SELECT name, ext, storage_key FROM fs_nodes WHERE space_id = $1 AND kind = 'file'`, [spaces[0]])).rows;
  assert.deepEqual([...new Set(files.map((row) => row.ext))].sort(), ['docx', 'md', 'pdf', 'png', 'xlsx']);
  for (const row of files) assert.ok(await exists(resolve(uploadRoot, row.storage_key)), `${row.name} on disk`);
  const links = (await db.query(`SELECT permissions FROM fs_links WHERE id = ANY($1)`, [await tracked('files', 'fs_links')])).rows;
  assert.ok(links.some((row) => row.permissions.join() === 'upload'), 'an upload-only link');

  // Chat: three groups and up to three direct rooms, a file, mentions, unread for the administrator.
  const rooms = await tracked('chat', 'chat_rooms');
  assert.ok(rooms.length >= 3);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM chat_rooms WHERE id = ANY($1) AND kind = 'group'`, [rooms]), 3);
  const chatFiles = (await db.query(`SELECT storage_key FROM chat_files WHERE room_id = ANY($1)`, [rooms])).rows;
  assert.equal(chatFiles.length, 2);
  for (const row of chatFiles) assert.ok(await exists(resolve(uploadRoot, 'chat', row.storage_key)), 'chat file on disk');
  assert.ok((await count(`SELECT COUNT(*)::int AS n FROM chat_messages WHERE room_id = ANY($1) AND body LIKE '%@demo.%'`, [rooms])) >= 3, 'mentions');
  const { unreadTotal } = await import('../modules/chat/service.js');
  assert.ok((await unreadTotal(req.user.id)) >= 1, 'unread messages for the administrator');

  // Resources, calendar, the visual KB article with its picture.
  assert.equal((await tracked('resources', 'res_categories')).length, 3);
  assert.equal((await tracked('resources', 'res_items')).length, 11);
  assert.equal((await tracked('calendar', 'cal_calendars')).length, 2);
  const visual = (await db.query(`SELECT id, content FROM kb_items WHERE id = ANY($1) AND content_format = 'html'`, [await tracked('kb', 'kb_items')])).rows[0];
  assert.ok(visual, 'a visual article');
  const picture = Number(/kbfile:(\d+)/.exec(visual.content)?.[1]);
  assert.ok(picture, 'with a picture');
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM kb_item_files WHERE item_id = $1 AND node_id = $2 AND inline`, [visual.id, picture]), 1);
  const pictureKey = (await db.query(`SELECT storage_key FROM fs_nodes WHERE id = $1`, [picture])).rows[0].storage_key;
  assert.ok(await exists(resolve(uploadRoot, pictureKey)));

  // Drive: an explanation only — no fill, «the whole portal» passes over it.
  const overview = await demo.demoOverview(['drive']);
  assert.equal(overview.modules[0].seedable, false);
  assert.ok(overview.modules[0].describe.ru);
  assert.equal((await demo.seedModule('drive', req)).skipped, true);
  assert.deepEqual(demo.seedOrder(['drive', 'files']).includes('drive'), true);
  const all = await demo.seedAll(['drive', ...MODULES], req);
  assert.ok(!all.some((result) => result.module === 'drive'), 'seedAll skips drive');
  assert.ok(all.every((result) => result.already), 'the rest were seeded already');

  // Purge: everything goes, blobs included.
  for (const module of [...MODULES].reverse()) await demo.purgeModule(module, req);
  for (const module of MODULES) assert.equal(await count(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = $1`, [module]), 0, `${module} untracked`);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM fs_spaces WHERE id = $1`, [spaces[0]]), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM chat_rooms WHERE id = ANY($1)`, [rooms]), 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM fs_nodes WHERE id = $1`, [picture]), 0);
  for (const row of files) assert.equal(await exists(resolve(uploadRoot, row.storage_key)), false, `${row.name} removed from disk`);
  for (const row of chatFiles) assert.equal(await exists(resolve(uploadRoot, 'chat', row.storage_key)), false, 'chat file removed from disk');
  assert.equal(await exists(resolve(uploadRoot, pictureKey)), false, 'KB picture removed from disk');
});

test('core demo: a failed seed takes back its files too', { skip }, async () => {
  await setup();
  const { demoRegistry } = demo;
  const files = demoRegistry().get('files');
  const original = files.seed;
  let keys = [];
  files.seed = async (ctx) => {
    await original(ctx);
    const nodes = await ctx.records('fs_nodes');
    keys = (await ctx.query(`SELECT storage_key FROM fs_nodes WHERE id = ANY($1::int[]) AND kind = 'file'`, [nodes])).rows.map((row) => row.storage_key);
    throw new Error('boom');
  };
  try {
    await assert.rejects(demo.seedModule('files', req), /boom/);
  } finally {
    files.seed = original;
  }
  assert.ok(keys.length > 0);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM demo_records WHERE module = 'files'`, []), 0);
  for (const key of keys) assert.equal(await exists(resolve(uploadRoot, key)), false, 'blob taken back');
});
