/*
 * Public link pages (Files /l/…, Drive /d/…) count one view per visitor tab
 * session: the first load counts, reloads in the same tab (after an upload,
 * a rename, F5) are sent with repeat=1 and do not. sessionStorage may be
 * unavailable (private mode): then the page remembers it in memory only.
 */

const memory = new Set();
const keyOf = (scope, token) => `link_seen_${scope}_${token}`;

export function viewCounted(scope, token) {
  const key = keyOf(scope, token);
  if (memory.has(key)) return true;
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function markViewCounted(scope, token) {
  const key = keyOf(scope, token);
  memory.add(key);
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* memory only */
  }
}
