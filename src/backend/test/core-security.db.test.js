import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Database part of the core security fixes: "sign in as" sessions end with the
 * administrator's sessions, revoked legacy rows outlive the purge, and
 * guessing the current password is locked out. Needs a test database (never
 * production!):
 *
 *   CORE_SECURITY_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/core-security.db.test.js
 *
 * Without CORE_SECURITY_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.CORE_SECURITY_DB_TEST === '1';
const skip = enabled ? false : 'set CORE_SECURITY_DB_TEST=1 and a test database to run';

let db = null;
const sessionIds = [];
const userIds = [];

after(async () => {
  if (!db) return;
  if (sessionIds.length) await db.query(`DELETE FROM user_sessions WHERE id = ANY($1)`, [sessionIds]);
  if (userIds.length) {
    const names = (await db.query(`SELECT username FROM users WHERE id = ANY($1)`, [userIds])).rows.map((row) => row.username);
    await db.query(`DELETE FROM login_attempts WHERE username = ANY($1)`, [names]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
  }
  await db.closePool();
});

async function makeUser(prefix, passwordHash = '!') {
  const name = `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const { rows } = await db.query(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES ($1, $2, $3, 'user', $1) RETURNING id, username`, [name, `${name}@test.invalid`, passwordHash]);
  userIds.push(rows[0].id);
  return rows[0];
}

test('database: impersonation sessions, legacy purge, password lockout', { skip }, async () => {
  db = await import('../config/database.js');
  const sessions = await import('../services/sessions.js');
  const users = await import('../services/users.js');
  const bcrypt = (await import('bcryptjs')).default;

  const admin = await makeUser('csadm');
  const target = await makeUser('cstgt');
  const day = new Date(Date.now() + 86400000);

  // 3. Ending the administrator's sessions also ends the "sign in as" ones.
  const own = await sessions.createSession({ userId: admin.id, expiresAt: day, method: 'password' });
  const borrowed = await sessions.createSession({ userId: target.id, expiresAt: day, method: 'impersonation', impersonatedBy: admin.id });
  const targetOwn = await sessions.createSession({ userId: target.id, expiresAt: day, method: 'password' });
  sessionIds.push(own.id, borrowed.id, targetOwn.id);
  await sessions.revokeUserSessions(admin.id, { exceptId: own.id });
  assert.equal(sessions.sessionState(await sessions.getSession(own.id)), 'active', 'the current session is kept');
  assert.equal(sessions.sessionState(await sessions.getSession(borrowed.id)), 'revoked');
  assert.equal(sessions.sessionState(await sessions.getSession(targetOwn.id)), 'active', "the person's own sessions are untouched");

  // …and so does blocking the administrator (token_version bump in updateUser).
  const borrowed2 = await sessions.createSession({ userId: target.id, expiresAt: day, method: 'impersonation', impersonatedBy: admin.id });
  sessionIds.push(borrowed2.id);
  await users.updateUser(admin.id, { isBlocked: true }, { actor: { id: 0, permissions: new Set(['*']) } });
  assert.equal(sessions.sessionState(await sessions.getSession(borrowed2.id)), 'revoked');
  const borrowed3 = await sessions.createSession({ userId: target.id, expiresAt: day, method: 'impersonation', impersonatedBy: admin.id });
  sessionIds.push(borrowed3.id);
  await users.revokeSessions(admin.id);
  assert.equal(sessions.sessionState(await sessions.getSession(borrowed3.id)), 'revoked');

  // 5. A revoked legacy row stays until its token expires; a sid row goes after 30 days.
  const legacyId = sessions.legacySessionId(`token-${Date.now()}`);
  const sidId = sessions.newSessionId();
  sessionIds.push(legacyId, sidId);
  for (const id of [legacyId, sidId]) {
    await sessions.createSession({ id, userId: target.id, expiresAt: new Date(Date.now() + 60 * 86400000), method: id === legacyId ? 'legacy' : 'password' });
    await db.query(`UPDATE user_sessions SET revoked_at = NOW() - INTERVAL '40 days' WHERE id = $1`, [id]);
  }
  await sessions.purgeSessions();
  assert.ok(await sessions.getSession(legacyId), 'revoked legacy row kept while the token is valid');
  assert.equal(await sessions.getSession(sidId), null, 'ordinary revoked row purged');
  await db.query(`UPDATE user_sessions SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [legacyId]);
  await sessions.purgeSessions();
  assert.equal(await sessions.getSession(legacyId), null, 'gone once the token has expired');

  // 6. Wrong current passwords lock out like sign-in; the right one resets it.
  const person = await makeUser('cspwd', await bcrypt.hash('right-password-1', 4));
  const { getSettings, parseSettings } = await import('../services/settings.js');
  const max = Number(parseSettings(await getSettings()).security?.maxLoginAttempts) || 8;
  for (let i = 0; i < max; i += 1) {
    await assert.rejects(users.changePassword(person.id, 'wrong', 'new-password-123'), (err) => err.statusCode === 400);
  }
  await assert.rejects(users.changePassword(person.id, 'right-password-1', 'new-password-123'), (err) => err.statusCode === 429 && err.code === 'LOCKED');
  await db.query(`DELETE FROM login_attempts WHERE username = $1`, [person.username]);
  await assert.rejects(users.changePassword(person.id, 'wrong', 'new-password-123'), (err) => err.statusCode === 400);
  await users.changePassword(person.id, 'right-password-1', 'new-password-123');
  const { rows } = await db.query(`SELECT success FROM login_attempts WHERE username = $1 ORDER BY id DESC LIMIT 1`, [person.username]);
  assert.equal(rows[0].success, true);
});
