/** «ДГ-0001»: the same rule as the server (modules/contracts/logic.js formatNumber). */
export function formatNumber(prefix, seq) {
  const head = String(prefix || '').trim();
  const digits = String(Math.max(1, Number(seq) || 1)).padStart(4, '0');
  return head ? `${head}-${digits}` : digits;
}
