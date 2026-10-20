/*
 * Fresh SMB sessions after group changes.
 *
 * Windows builds a person's access token (their groups) when an SMB session
 * logs on, and keeps it for the life of the session. The gateway reuses a
 * session per credential for up to 15 minutes (smbgate.py pool_for), so a
 * person added to a folder access group would keep seeing «access denied»
 * until their session expired. Two remedies:
 *
 *  - markLoginsStale(): File server → Access and the AD directory call it after
 *    changing someone's groups; that person's next request logs on again.
 *  - shouldRetryDenied(): an ACCESS_DENIED on a session not refreshed in the
 *    last minute is retried once on a fresh session (groups changed directly
 *    in AD). At most one extra logon per credential per minute.
 */

const RETRY_AFTER_MS = 60 * 1000;
const MAX_ENTRIES = 5000;

const staleLogins = new Map(); // login (lower case) → when marked
let staleAllAt = 0; // a group was added to a group: anyone may be affected
const refreshedAt = new Map(); // credential key → last forced new session

function cap(map) {
  if (map.size > MAX_ENTRIES) map.clear();
}

/** «DOMAIN\login», «login@domain» or «login» → «login» (lower case). */
export function loginOf(username) {
  const name = String(username || '').trim();
  const bare = name.includes('\\') ? name.slice(name.lastIndexOf('\\') + 1) : name.split('@')[0];
  return bare.toLowerCase();
}

/** Group membership of these AD logins changed: their sessions need a new logon. */
export function markLoginsStale(logins, now = Date.now()) {
  cap(staleLogins);
  for (const login of logins || []) {
    const key = loginOf(login);
    if (key) staleLogins.set(key, now);
  }
}

/** A group became (or stopped being) a member of a group: every session may be affected. */
export function markAllStale(now = Date.now()) {
  staleAllAt = now;
}

/** True when the credential's session predates a membership change of its login. */
export function needsFreshSession(credKey, username) {
  const marked = Math.max(staleLogins.get(loginOf(username)) || 0, staleAllAt);
  return marked > 0 && (refreshedAt.get(credKey) || 0) < marked;
}

/** ACCESS_DENIED: worth one retry on a new session unless one was opened in the last minute. */
export function shouldRetryDenied(credKey, now = Date.now()) {
  return now - (refreshedAt.get(credKey) || 0) > RETRY_AFTER_MS;
}

/** Records that the credential's sessions were just dropped. */
export function noteRefreshed(credKey, now = Date.now()) {
  cap(refreshedAt);
  refreshedAt.set(credKey, now);
}

/** Test helper. */
export function resetSessionState() {
  staleLogins.clear();
  refreshedAt.clear();
  staleAllAt = 0;
}
