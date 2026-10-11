import { randomBytes } from 'crypto';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { uploadRoot } from '../../config/paths.js';
import { httpError } from '../shared/acl.js';

/*
 * Company documents live under UPLOAD_DIR/companies/. A registry extract
 * fetched during a lookup waits in companies/tmp/ (an hour at most) until the
 * card is saved, then it is attached to the company.
 */

const DIR = () => join(uploadRoot, 'companies');
const TMP = () => join(DIR(), 'tmp');
const TEMP_ID = /^[a-f0-9]{24}$/;
const KEY = /^[a-f0-9]{24}\.[a-z0-9]{1,8}$/;

export async function stashDocument(buffer, ext = 'pdf') {
  await mkdir(TMP(), { recursive: true });
  const id = randomBytes(12).toString('hex');
  await writeFile(join(TMP(), `${id}.${ext}`), buffer);
  return id;
}

/** Moves a stashed document into permanent storage; returns { key, size } or null. */
export async function claimDocument(id, ext = 'pdf') {
  if (!TEMP_ID.test(id || '')) return null;
  const from = join(TMP(), `${id}.${ext}`);
  const info = await stat(from).catch(() => null);
  if (!info) return null;
  const key = `${randomBytes(12).toString('hex')}.${ext}`;
  await mkdir(DIR(), { recursive: true });
  await rename(from, join(DIR(), key));
  return { key, size: info.size };
}

export async function storeFile(buffer, ext) {
  const clean = String(ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  const key = `${randomBytes(12).toString('hex')}.${clean}`;
  await mkdir(DIR(), { recursive: true });
  await writeFile(join(DIR(), key), buffer);
  return { key, size: buffer.length };
}

export function filePath(key) {
  if (!KEY.test(key || '')) throw httpError(404, 'File not found', 'NOT_FOUND');
  return join(DIR(), key);
}

export async function removeFile(key) {
  if (KEY.test(key || '')) await unlink(join(DIR(), key)).catch(() => {});
}

export async function purgeTempDocuments() {
  const files = await readdir(TMP()).catch(() => []);
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const name of files) {
    const info = await stat(join(TMP(), name)).catch(() => null);
    if (info && info.mtimeMs < cutoff) await unlink(join(TMP(), name)).catch(() => {});
  }
}
