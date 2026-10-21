/**
 * The name to greet a person by. Display names often come from the directory
 * as "Surname Name", so the first word may be the surname: the account's own
 * first name (employee card / directory givenName) wins; the first word of the
 * display name is the fallback.
 */
export function firstNameOf(user) {
  if (!user) return '';
  const own = String(user.firstName || '').trim();
  if (own) return own;
  return String(user.displayName || user.username || '').trim().split(/\s+/)[0] || '';
}
