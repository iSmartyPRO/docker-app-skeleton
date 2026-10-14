import { httpError } from '../shared/acl.js';

/*
 * What a public link lets its visitors do. Pure helpers (no database, no SMB)
 * shared by links.js and routes.js, and unit-tested on their own.
 *
 *   view      see the folder's contents and open files
 *   download  download files and ZIPs
 *   upload    add new files (never overwrites; a clash gets "name (1).ext")
 *   mkdir     create folders (also needed for folder uploads)
 *   rename    rename files and folders
 *   replace   overwrite an existing file with a new version
 *   delete    delete files and folders (file servers have no recycle bin)
 *
 * A file link can only grant view, download and replace. Everything except
 * upload needs view (one must see what one changes); the shared picker
 * (components/ui/LinkPermissions.jsx) follows the same rules.
 * "Upload" without "view" is a file request: visitors never see the folder,
 * only what they uploaded themselves in this browser session.
 */

export const PERMS = ['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete'];
export const WRITE_PERMS = ['upload', 'mkdir', 'rename', 'replace', 'delete'];
export const FILE_PERMS = ['view', 'download', 'replace'];

/** Links created before permissions existed: view, plus download when it was allowed. */
export function legacyPerms(allowDownload) {
  return allowDownload === false ? ['view'] : ['view', 'download'];
}

/** A clean, ordered permission list for a link of `kind` ('file' | 'dir'). */
export function normalizePerms(input, kind = 'dir') {
  const allowed = kind === 'file' ? FILE_PERMS : PERMS;
  const set = new Set((Array.isArray(input) ? input : []).map((item) => String(item)).filter((item) => allowed.includes(item)));
  if (['download', 'mkdir', 'rename', 'replace', 'delete'].some((perm) => set.has(perm))) set.add('view');
  // A link that grants nothing would be useless: it shows the item at least.
  if (!set.size) set.add('view');
  return PERMS.filter((perm) => set.has(perm));
}

export const hasWrite = (perms) => perms.some((perm) => WRITE_PERMS.includes(perm));

/**
 * The permissions a link has right now. Write permissions fall away while an
 * administrator has switched write links off, or demands a password for them
 * and this link has none.
 */
export function effectivePerms(row, settings = {}) {
  const stored = Array.isArray(row.permissions) && row.permissions.length ? row.permissions : legacyPerms(row.allow_download);
  let perms = normalizePerms(stored, row.kind);
  const writesOff = settings.linkWrite === false || (settings.requireWritePassword && !row.password_hash);
  if (writesOff) perms = perms.filter((perm) => !WRITE_PERMS.includes(perm));
  if (!perms.length) perms = ['view'];
  // A link that was upload-only stays closed instead of turning into a view link.
  if (writesOff && !(stored.includes('view') || stored.includes('download'))) return [];
  return perms;
}

/**
 * Which file-server rights the author needs for `perms`: write (add files and
 * folders, change a file) and delete (delete, and rename, which removes the
 * old name). `access` is the gateway's answer for the link root.
 * Returns the permissions the author cannot grant.
 */
export function ungrantable(perms, access) {
  if (!access || access.known === false) return [];
  const missing = [];
  for (const perm of perms) {
    if (['upload', 'mkdir', 'replace'].includes(perm) && !access.write) missing.push(perm);
    if (perm === 'rename' && !(access.write && access.delete)) missing.push(perm);
    if (perm === 'delete' && !access.delete) missing.push(perm);
  }
  return missing;
}

export function requirePerm(perms, perm) {
  if (!perms.includes(perm)) throw httpError(403, 'This link does not allow that', 'NO_PERMISSION');
}

// ── Limits ──────────────────────────────────────────────────────────────────

/** "pdf, .DOCX; jpg" → ['pdf', 'docx', 'jpg'] (at most 50, letters and digits only). */
export function cleanExts(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/);
  const out = [];
  for (const raw of list) {
    const ext = String(raw || '').trim().toLowerCase().replace(/^\*?\./, '');
    if (/^[a-z0-9]{1,12}$/.test(ext) && !out.includes(ext)) out.push(ext);
    if (out.length >= 50) break;
  }
  return out;
}

export function extAllowed(name, exts) {
  if (!exts || !exts.length) return true;
  const index = name.lastIndexOf('.');
  const ext = index > 0 ? name.slice(index + 1).toLowerCase() : '';
  return Boolean(ext) && exts.includes(ext);
}

/** Bytes one file may have: the link's own limit within the module's. */
export function fileLimitBytes(row, settings) {
  const moduleMb = Number(settings.maxUploadMb) || 2048;
  const own = Number(row.max_file_mb) || 0;
  return (own > 0 ? Math.min(own, moduleMb) : moduleMb) * 1024 * 1024;
}

export function quotaBytes(row) {
  const mb = Number(row.quota_mb) || 0;
  return mb > 0 ? mb * 1024 * 1024 : null;
}

const optionalInt = (value, max) => {
  if (value === null || value === '' || value === undefined) return null;
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.min(number, max);
};

/**
 * The options of a link besides its permissions, from the author's input.
 * Only keys present in `input` are returned (for updates).
 */
export function linkOptions(input = {}) {
  const out = {};
  if (input.maxFileMb !== undefined) out.max_file_mb = optionalInt(input.maxFileMb, 10240);
  if (input.quotaMb !== undefined) out.quota_mb = optionalInt(input.quotaMb, 1024 * 1024);
  if (input.allowedExts !== undefined) {
    const exts = cleanExts(input.allowedExts);
    out.allowed_exts = exts.length ? exts : null;
  }
  if (input.requireName !== undefined) out.require_name = Boolean(input.requireName);
  if (input.requireEmail !== undefined) out.require_email = Boolean(input.requireEmail);
  if (input.notify !== undefined) out.notify = Boolean(input.notify);
  if (input.title !== undefined) out.title = String(input.title || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120) || null;
  if (input.note !== undefined) out.note = String(input.note || '').replace(/[\u0000-\u0008\u000b-\u001f<>]/g, '').trim().slice(0, 500) || null;
  if (out.require_email) out.require_name = true;
  return out;
}

// ── Visitors ────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,190}\.[a-z]{2,24}$/i;

/** Name and e-mail a visitor gives (checked against what the link asks for). */
export function cleanVisitor(input = {}, row = {}) {
  const name = String(input.name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const email = String(input.email || '').trim().slice(0, 254);
  if ((row.require_name || row.require_email) && name.length < 2) throw httpError(400, 'Please enter your name', 'NAME_REQUIRED');
  if (email && !EMAIL.test(email)) throw httpError(400, 'Please enter a valid e-mail', 'EMAIL_INVALID');
  if (row.require_email && !email) throw httpError(400, 'Please enter your e-mail', 'EMAIL_REQUIRED');
  return { name: name || null, email: email || null };
}

/** Names visitors may not use: hidden or the portal's own temporary files. */
export function visitorName(name) {
  if (name.startsWith('~$') || name.startsWith('.')) throw httpError(400, 'This name is not allowed here', 'INVALID_NAME');
  return name;
}
