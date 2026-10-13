import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { streamAllowed } from '../modules/chat/realtime.js';
import { endpointChanged, serverInput } from '../modules/drive/servers.js';
import { prunePreviewCaches } from '../modules/shared/storage.js';
import { lockQuota } from '../modules/files/service.js';
import { ROOM_LAST_MESSAGE_SQL } from '../modules/chat/service.js';

const future = new Date(Date.now() + 3600_000);
const past = new Date(Date.now() - 1000);

test('chat streams close when the session or account changes', () => {
  const entry = { userId: 7, sid: 's1', tokenId: null, tv: 2 };
  const ok = { user_id: 7, revoked_at: null, expires_at: future, is_active: true, is_blocked: false, token_version: 2 };
  assert.equal(streamAllowed(entry, ok), true);
  assert.equal(streamAllowed(entry, null), false, 'session row gone');
  assert.equal(streamAllowed(entry, { ...ok, revoked_at: new Date() }), false, 'signed out / revoked');
  assert.equal(streamAllowed(entry, { ...ok, expires_at: past }), false, 'expired');
  assert.equal(streamAllowed(entry, { ...ok, is_blocked: true }), false, 'blocked');
  assert.equal(streamAllowed(entry, { ...ok, is_active: false }), false, 'deactivated');
  assert.equal(streamAllowed(entry, { ...ok, token_version: 3 }), false, 'password changed');
  assert.equal(streamAllowed(entry, { ...ok, user_id: 8 }), false, 'another person');
});

test('chat streams of API tokens close when the token is revoked or narrowed', () => {
  const entry = { userId: 7, sid: null, tokenId: 3, tv: 0 };
  const ok = { user_id: 7, revoked_at: null, expires_at: null, limits: {}, is_active: true, is_blocked: false };
  assert.equal(streamAllowed(entry, ok), true);
  assert.equal(streamAllowed(entry, { ...ok, revoked_at: new Date() }), false);
  assert.equal(streamAllowed(entry, { ...ok, expires_at: past }), false);
  assert.equal(streamAllowed(entry, { ...ok, limits: { 'files.spaces': [1] } }), false);
});

test('a drive server moved to another host or port loses its stored service password', () => {
  const current = { id: 4, name: 'FS', host: 'fs01.corp.local', port: 445, auth: 'service', service_user: 'svc', service_secret: 'sealed', use_login: true, encrypt: false };
  assert.equal(endpointChanged(current, 'FS01.corp.local', 445), false, 'host case does not matter');
  assert.equal(endpointChanged(current, 'fs02.corp.local', 445), true);
  assert.equal(endpointChanged(current, 'fs01.corp.local', 1445), true);
  assert.equal(endpointChanged({}, 'anything', 445), false, 'a new server');

  const same = serverInput({ name: 'File server' }, current);
  assert.equal(same.secret, 'sealed');
  assert.equal(same.moved, false);
  assert.throws(() => serverInput({ host: 'evil.example.com' }, current), { code: 'SERVICE_REQUIRED' });
  const testDraft = serverInput({ host: 'evil.example.com' }, current, { requireSecret: false });
  assert.equal(testDraft.secret, null);
  assert.equal(testDraft.moved, true);

  const userAuth = serverInput({ port: 1445 }, { ...current, auth: 'user', service_secret: null });
  assert.equal(userAuth.moved, true, 'per-server saved accounts are dropped by saveServer');
});

test('preview caches drop files nobody used for 30 days', async () => {
  const root = await mkdtemp(join(tmpdir(), 'previews-'));
  try {
    await mkdir(join(root, 'thumbs'), { recursive: true });
    const old = new Date(Date.now() - 40 * 86400_000);
    const recent = new Date(Date.now() - 2 * 86400_000);
    const files = {
      'old.pdf': old,
      'recent.pdf': recent,
      'thumbs/old.jpg': old,
      'thumbs/new.jpg': new Date(),
      'stale.pdf.abcd.tmp': recent,
    };
    for (const [name, time] of Object.entries(files)) {
      await writeFile(join(root, name), 'x');
      await utimes(join(root, name), time, time);
    }
    const removed = await prunePreviewCaches({ dirs: [root, join(root, 'missing')] });
    assert.equal(removed, 3);
    assert.deepEqual((await readdir(root)).sort(), ['recent.pdf', 'thumbs']);
    assert.deepEqual(await readdir(join(root, 'thumbs')), ['new.jpg']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('quota checks of one person are serialised by an advisory lock', async () => {
  const calls = [];
  await lockQuota({ query: async (sql, params) => calls.push({ sql, params }) }, 42);
  assert.match(calls[0].sql, /pg_advisory_xact_lock/);
  assert.deepEqual(calls[0].params, ['fs-quota:42']);
});

test('a room keeps its newest message as the last one', () => {
  assert.match(ROOM_LAST_MESSAGE_SQL, /GREATEST\(COALESCE\(last_message_id, 0\), \$2\)/);
});
