/*
 * The permission list of a public link, one rule for Files (/l/…) and Drive
 * (/d/…). The frontend picker (components/ui/LinkPermissions.jsx) uses the
 * same rule from src/frontend/src/lib/linkPermissions.js; the backend test
 * test/link-permissions.test.js checks that both agree on every list.
 *
 *   view      see the folder's contents and open files
 *   download  download files (and ZIPs)
 *   upload    add new files (folders only)
 *   mkdir     create folders (folders only)
 *   rename    rename (and move) inside the link (folders only)
 *   replace   upload a new version of an existing file
 *   delete    delete files and folders (folders only)
 *
 * Rules: known keys only; folder-only keys are dropped for a file link;
 * everything except upload needs view, and without view it is dropped (it is
 * never "upgraded" to a read link: ['upload', 'download'] is a drop box,
 * ['upload']); an empty list falls back to ['view'].
 */

export const LINK_PERMISSIONS = ['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete'];
export const LINK_WRITE_PERMISSIONS = ['upload', 'mkdir', 'rename', 'replace', 'delete'];
export const LINK_FILE_PERMISSIONS = ['view', 'download', 'replace'];
export const LINK_NEEDS_VIEW = ['download', 'mkdir', 'rename', 'replace', 'delete'];

/** A clean, ordered permission list for a folder link (`isFolder`) or a file link. */
export function normalizeLinkPermissions(perms, isFolder = true) {
  const allowed = isFolder ? LINK_PERMISSIONS : LINK_FILE_PERMISSIONS;
  const set = new Set((Array.isArray(perms) ? perms : []).map((key) => String(key)).filter((key) => allowed.includes(key)));
  if (!set.has('view')) LINK_NEEDS_VIEW.forEach((key) => set.delete(key));
  if (!set.size) set.add('view');
  return LINK_PERMISSIONS.filter((key) => set.has(key));
}
