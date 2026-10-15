import { query } from '../../config/database.js';
import { registerJob } from '../scheduler.js';

/*
 * WOPI locks, kept in the database (SMB oplocks and file-system locks are not
 * used). A lock belongs to one physical file (`lock_key`: "files:<node id>" or
 * "drive:<server>:<share>:<path>", lower case) and expires after 30 minutes
 * unless Collabora refreshes it. `saved_once` marks the first save of a lock
 * (an editing session): Files keeps the previous content once per session,
 * and only that save and the closing one are logged.
 */

export const LOCK_TTL_MS = 30 * 60 * 1000;
export const LOCK_MAX = 1024;

export async function ensureOfficeSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS office_locks (
      lock_key TEXT PRIMARY KEY,
      lock_value TEXT NOT NULL,
      file_id TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name VARCHAR(255),
      saved_once BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS office_locks_expires_idx ON office_locks (expires_at)`);
  registerJob({ name: 'office:locks', everyMs: 15 * 60 * 1000, run: purgeExpiredLocks });
}

export async function purgeExpiredLocks() {
  await query(`DELETE FROM office_locks WHERE expires_at <= NOW()`);
}

const expiry = () => new Date(Date.now() + LOCK_TTL_MS);

/** The live lock of a file, or null. */
export async function currentLock(lockKey) {
  const { rows } = await query(`SELECT * FROM office_locks WHERE lock_key = $1 AND expires_at > NOW()`, [lockKey]);
  return rows[0] || null;
}

/**
 * LOCK: takes a free (or expired) lock, or refreshes our own one.
 * → { ok: true, row } | { ok: false, current }
 */
export async function takeLock(lockKey, lockValue, { fileId, userId, userName }) {
  const { rows } = await query(
    `INSERT INTO office_locks (lock_key, lock_value, file_id, user_id, user_name, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (lock_key) DO UPDATE SET
       lock_value = EXCLUDED.lock_value,
       file_id = EXCLUDED.file_id,
       user_id = CASE WHEN office_locks.lock_value = EXCLUDED.lock_value AND office_locks.expires_at > NOW() THEN office_locks.user_id ELSE EXCLUDED.user_id END,
       user_name = CASE WHEN office_locks.lock_value = EXCLUDED.lock_value AND office_locks.expires_at > NOW() THEN office_locks.user_name ELSE EXCLUDED.user_name END,
       saved_once = CASE WHEN office_locks.lock_value = EXCLUDED.lock_value AND office_locks.expires_at > NOW() THEN office_locks.saved_once ELSE FALSE END,
       created_at = CASE WHEN office_locks.lock_value = EXCLUDED.lock_value AND office_locks.expires_at > NOW() THEN office_locks.created_at ELSE NOW() END,
       expires_at = EXCLUDED.expires_at
     WHERE office_locks.expires_at <= NOW() OR office_locks.lock_value = EXCLUDED.lock_value
     RETURNING *`,
    [lockKey, lockValue, fileId, userId || null, userName || null, expiry()]
  );
  if (rows[0]) return { ok: true, row: rows[0] };
  return { ok: false, current: await currentLock(lockKey) };
}

/** UNLOCK_AND_RELOCK: swaps `oldValue` for `newValue`. */
export async function relock(lockKey, oldValue, newValue) {
  const { rows } = await query(
    `UPDATE office_locks SET lock_value = $3, expires_at = $4 WHERE lock_key = $1 AND lock_value = $2 AND expires_at > NOW() RETURNING *`,
    [lockKey, oldValue, newValue, expiry()]
  );
  if (rows[0]) return { ok: true, row: rows[0] };
  return { ok: false, current: await currentLock(lockKey) };
}

/** REFRESH_LOCK */
export async function refreshLock(lockKey, lockValue) {
  const { rows } = await query(`UPDATE office_locks SET expires_at = $3 WHERE lock_key = $1 AND lock_value = $2 AND expires_at > NOW() RETURNING *`, [lockKey, lockValue, expiry()]);
  if (rows[0]) return { ok: true, row: rows[0] };
  return { ok: false, current: await currentLock(lockKey) };
}

/** UNLOCK */
export async function releaseLock(lockKey, lockValue) {
  const { rows } = await query(`DELETE FROM office_locks WHERE lock_key = $1 AND lock_value = $2 AND expires_at > NOW() RETURNING *`, [lockKey, lockValue]);
  if (rows[0]) return { ok: true, row: rows[0] };
  return { ok: false, current: await currentLock(lockKey) };
}

/** True for the first save under this lock (and remembers it). */
export async function firstSaveOf(lockKey, lockValue) {
  if (!lockValue) return true;
  const { rows } = await query(
    `UPDATE office_locks SET saved_once = TRUE WHERE lock_key = $1 AND lock_value = $2 AND saved_once = FALSE RETURNING lock_key`,
    [lockKey, lockValue]
  );
  return rows.length > 0;
}

/** Live locks of several files: Map(lock_key → { userId, userName, since }). */
export async function locksOf(lockKeys) {
  const keys = [...new Set(lockKeys.filter(Boolean))];
  const map = new Map();
  if (!keys.length) return map;
  const { rows } = await query(`SELECT lock_key, user_id, user_name, created_at FROM office_locks WHERE lock_key = ANY($1) AND expires_at > NOW()`, [keys]);
  for (const row of rows) map.set(row.lock_key, { userId: row.user_id, userName: row.user_name, since: row.created_at });
  return map;
}
