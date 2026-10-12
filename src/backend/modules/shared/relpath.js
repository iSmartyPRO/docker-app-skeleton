import { httpError } from './acl.js';

/*
 * Relative paths of folder uploads ("Photos/2026/May"), as browsers report
 * them (webkitRelativePath, FileSystemEntry.fullPath). Used by Files and
 * Drive to recreate a dropped folder tree. Every segment is checked here;
 * each module then applies its own name rules on top.
 */

export const FOLDER_UPLOAD = {
  /** Folder levels below the upload target. */
  maxDepth: 32,
  /** Characters in one folder name. */
  maxSegment: 255,
  /** Characters in a whole relative path. */
  maxPath: 4096,
  /** Folder paths per tree request (the client splits bigger trees). */
  maxFolders: 1000,
};

// Windows device names: such a folder cannot be opened (or even created) on a Windows share.
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

function refuse(message) {
  return httpError(400, message, 'INVALID_PATH');
}

/**
 * "a/b/c" → ['a', 'b', 'c']. Backslashes count as separators and repeated
 * separators collapse; anything absolute, any "." / ".." segment, control
 * characters, reserved device names, over-long names or paths deeper than
 * `maxDepth` are refused (400 INVALID_PATH). An empty path gives [].
 */
export function splitRelativePath(value, { maxDepth = FOLDER_UPLOAD.maxDepth } = {}) {
  if (value !== undefined && value !== null && typeof value !== 'string') throw refuse('Invalid path');
  const text = String(value ?? '');
  if (text.length > FOLDER_UPLOAD.maxPath) throw refuse('Path too long');
  if (/^[\\/]/.test(text) || /^[a-zA-Z]:/.test(text) || /^~/.test(text)) throw refuse('Absolute paths are not allowed');
  const parts = text.split(/[\\/]+/).filter((part) => part !== '');
  if (parts.length > maxDepth) throw refuse(`Folders can be nested at most ${maxDepth} levels deep`);
  return parts.map((raw) => {
    const part = raw.normalize('NFC');
    const bare = part.trim();
    if (!bare || bare === '.' || bare === '..' || /^\.+$/.test(bare)) throw refuse('Invalid folder name');
    if (CONTROL.test(part)) throw refuse('Invalid folder name');
    if (part.length > FOLDER_UPLOAD.maxSegment) throw refuse('Folder name too long');
    if (RESERVED.test(bare)) throw refuse(`“${bare}” is a reserved name`);
    return part;
  });
}

/**
 * A list of folder paths (from one upload) → unique segment lists, parents
 * before children. Every prefix is included, so "a/b" also yields "a".
 * Returns { list: [{ key, parts }], indexOf: input index → key }.
 */
export function folderTree(paths, { maxFolders = FOLDER_UPLOAD.maxFolders, maxDepth = FOLDER_UPLOAD.maxDepth } = {}) {
  if (!Array.isArray(paths)) throw refuse('Send a list of folder paths');
  if (paths.length > maxFolders) throw httpError(400, `At most ${maxFolders} folders per request`, 'TOO_MANY_FOLDERS');
  const seen = new Map();
  const keys = paths.map((path) => {
    const parts = splitRelativePath(path, { maxDepth });
    if (!parts.length) throw refuse('Empty folder path');
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const sub = parts.slice(0, depth);
      const key = sub.join('/').toLowerCase();
      if (!seen.has(key)) seen.set(key, sub);
    }
    return parts.join('/').toLowerCase();
  });
  if (seen.size > maxFolders * 4) throw httpError(400, 'Too many folders', 'TOO_MANY_FOLDERS');
  const list = [...seen.entries()].map(([key, parts]) => ({ key, parts })).sort((a, b) => a.parts.length - b.parts.length);
  return { list, keys };
}
