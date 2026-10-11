import { httpError } from '../shared/acl.js';

/*
 * Share-relative paths: "Reports/2026/Q1.xlsx", forward slashes, no leading
 * slash. Anything that could leave the share or reach an alternate data
 * stream is refused here (and again in the gateway).
 */

const BAD = /[\\:*?"<>|\u0000-\u001f]/;

export function cleanPath(value) {
  const parts = String(value ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '');
  for (const part of parts) {
    if (part === '.' || part === '..' || BAD.test(part) || part.length > 255) {
      throw httpError(400, 'Invalid path', 'INVALID_PATH');
    }
  }
  const path = parts.join('/');
  if (path.length > 2000) throw httpError(400, 'Path too long', 'INVALID_PATH');
  return path;
}

export function cleanName(value) {
  const name = String(value ?? '').trim();
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name) || BAD.test(name) || name.endsWith('.') || name.length > 255) {
    throw httpError(400, 'A name cannot contain \\ / : * ? " < > |', 'INVALID_NAME');
  }
  return name;
}

export function joinPath(...parts) {
  return parts.filter((part) => part !== '' && part != null).join('/');
}

export function parentOf(path) {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function nameOf(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Is `path` equal to or inside `root`? (case-insensitive, like Windows) */
export function within(root, path) {
  const a = root.toLowerCase();
  const b = path.toLowerCase();
  return !a || a === b || b.startsWith(`${a}/`);
}

export function relativeTo(root, path) {
  if (!root) return path;
  return path.length === root.length ? '' : path.slice(root.length + 1);
}
