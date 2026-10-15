/*
 * The short-lived memo of link-preview models (services/linkPreview/index.js):
 * a page and its picture are fetched together, so a model is kept for a
 * minute. A link that is changed, revoked, deleted or given a new address
 * clears it (Files and Drive call forgetPreviews()), so a preview never shows
 * a link's old state after its author changed it.
 *
 * Its own module (no database, no imports) so the link modules can clear it
 * without importing the preview service, which imports them.
 */

export const MEMO_MS = 60 * 1000;
export const MEMO_MAX = 2000;

const memo = new Map();

export function memoGet(key) {
  const hit = memo.get(key);
  if (!hit) return null;
  if (hit.until <= Date.now()) {
    memo.delete(key);
    return null;
  }
  return hit;
}

export function memoSet(key, value) {
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(key, { value, until: Date.now() + MEMO_MS });
}

/** Drops every memoised preview (a link changed somewhere). */
export function forgetPreviews() {
  memo.clear();
}

export const memoSize = () => memo.size;
