/** Every query word must be the start of some word in the entry. */
export function matchesQuery(text, query) {
  const needles = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!needles.length) return true;
  const words = String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return needles.every((needle) => words.some((word) => word.startsWith(needle)));
}
