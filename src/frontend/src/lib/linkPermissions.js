/*
 * The permission list of a public link (Files and Drive): the same rule as
 * src/backend/modules/shared/linkPermissions.js (the backend test
 * test/link-permissions.test.js checks that both agree). Pure: no React.
 *
 * Known keys only; folder-only keys dropped for a file link; everything
 * except upload needs view and is dropped without it (['upload', 'download']
 * is a drop box, ['upload']); an empty list falls back to ['view'].
 */

export const PERMISSION_KEYS = ['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete'];
export const WRITE_KEYS = ['upload', 'mkdir', 'rename', 'replace', 'delete'];
export const FILE_KEYS = ['view', 'download', 'replace'];
export const NEEDS_VIEW = ['download', 'mkdir', 'rename', 'replace', 'delete'];

export function normalizePermissions(perms, isFolder = true) {
  const allowed = isFolder ? PERMISSION_KEYS : FILE_KEYS;
  const set = new Set((Array.isArray(perms) ? perms : []).map((key) => String(key)).filter((key) => allowed.includes(key)));
  if (!set.has('view')) NEEDS_VIEW.forEach((key) => set.delete(key));
  if (!set.size) set.add('view');
  return PERMISSION_KEYS.filter((key) => set.has(key));
}
