import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Database checks for Files, Chat and Knowledge base fixes. Needs a test
 * database (never production!):
 *
 *   CONTENT_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/content.db.test.js
 *
 * Without CONTENT_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.CONTENT_DB_TEST === '1';
const skip = enabled ? false : 'set CONTENT_DB_TEST=1 and a test database to run';

let db = null;
const cleanup = [];

after(async () => {
  if (!db) return;
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  await db.closePool();
});

async function setup() {
  db = await import('../config/database.js');
  const { bootstrapSchema } = await import('../services/schema.js');
  process.env.DISABLE_SCHEDULER = 'true';
  await bootstrapSchema();
}

async function ctxOf(userId, limits = null) {
  const { getUserAccess } = await import('../services/rbac.js');
  const { contextFromRequest } = await import('../modules/shared/acl.js');
  const access = await getUserAccess(userId);
  return contextFromRequest({ user: { id: userId }, access, apiLimits: limits }, 'files.admin');
}

test('batched node access decides exactly like nodeAccess', { skip }, async () => {
  await setup();
  const { nodeAccess, nodeAccessMany } = await import('../modules/files/access.js');
  const { rows: users } = await db.query(`SELECT id FROM users ORDER BY id LIMIT 5`);
  const { rows: nodes } = await db.query(`SELECT id, space_id FROM fs_nodes ORDER BY id DESC LIMIT 300`);
  const spaceId = nodes.find((node) => node.space_id)?.space_id;
  const contexts = [];
  for (const user of users) {
    contexts.push(await ctxOf(user.id));
    if (spaceId) contexts.push(await ctxOf(user.id, { fs_space_acl: new Set([spaceId]) }));
  }
  for (const ctx of contexts) {
    const many = await nodeAccessMany(ctx, nodes.map((node) => node.id));
    for (const node of nodes) {
      const one = await nodeAccess(ctx, node.id);
      const batched = many.get(node.id);
      const pick = (a) => ({ level: a.level, base: a.base, trashed: a.trashed, owner: a.owner, visible: a.visibleChain.map((row) => row.id), chain: a.chain.map((row) => row.id) });
      assert.deepEqual(pick(batched), pick(one), `user ${ctx.userId} node ${node.id}`);
    }
  }
});

test('the last message of a room never goes backwards', { skip }, async () => {
  if (!db) await setup();
  const { ROOM_LAST_MESSAGE_SQL } = await import('../modules/chat/service.js');
  const { rows } = await db.query(`INSERT INTO chat_rooms (kind, title) VALUES ('group', 'content-db-test') RETURNING id`);
  const roomId = rows[0].id;
  cleanup.push(() => db.query(`DELETE FROM chat_rooms WHERE id = $1`, [roomId]));
  const later = new Date();
  const earlier = new Date(later.getTime() - 1000);
  await db.query(ROOM_LAST_MESSAGE_SQL, [roomId, 20, later]);
  await db.query(ROOM_LAST_MESSAGE_SQL, [roomId, 19, earlier]); // committed late
  const { rows: room } = await db.query(`SELECT last_message_id, last_message_at FROM chat_rooms WHERE id = $1`, [roomId]);
  assert.equal(Number(room[0].last_message_id), 20);
  assert.equal(new Date(room[0].last_message_at).getTime(), later.getTime());
});

test('two parallel uploads cannot both pass the personal quota', { skip }, async () => {
  if (!db) await setup();
  const { lockQuota } = await import('../modules/files/service.js');
  const { rows: users } = await db.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
  const ownerId = users[0].id;
  const { rows: used } = await db.query(`SELECT COALESCE(SUM(size), 0)::bigint AS used FROM fs_nodes WHERE owner_id = $1 AND space_id IS NULL AND kind = 'file'`, [ownerId]);
  const quota = Number(used[0].used) + 150;
  const ids = [];
  cleanup.push(() => db.query(`DELETE FROM fs_nodes WHERE id = ANY($1)`, [ids]));
  const attempt = () =>
    db.withTransaction(async (client) => {
      await lockQuota(client, ownerId);
      const { rows } = await client.query(`SELECT COALESCE(SUM(size), 0)::bigint AS used FROM fs_nodes WHERE owner_id = $1 AND space_id IS NULL AND kind = 'file'`, [ownerId]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (Number(rows[0].used) + 100 > quota) throw Object.assign(new Error('full'), { code: 'QUOTA_EXCEEDED' });
      const inserted = await client.query(
        `INSERT INTO fs_nodes (kind, name, owner_id, storage_key, mime, size, ext, created_by, updated_by)
         VALUES ('file', $1, $2, 'files/none', 'text/plain', 100, 'txt', $2, $2) RETURNING id`,
        [`quota-test-${Date.now()}-${Math.random()}.txt`, ownerId]
      );
      ids.push(inserted.rows[0].id);
    });
  const results = await Promise.allSettled([attempt(), attempt()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'QUOTA_EXCEEDED');
});
