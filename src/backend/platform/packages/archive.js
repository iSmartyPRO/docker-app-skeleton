import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { readZip } from './zip.js';
import { SIGNATURE_FILE, verifyFiles } from './signature.js';
import { normalizeManifest } from './manifestFile.js';
import { badPackage } from './checks.js';
import { moduleRoot, versionDir } from './paths.js';

/*
 * Opening a package file: the archive is read with the safety limits of
 * zip.js, the signature is checked, manifest.json is read and the layout of
 * spec §4 is enforced. Any failure is the one message the administrator sees,
 * «Файл повреждён или выпущен не нами» (the technical reason goes to the log).
 */

export const PACKAGE_LIMITS = Object.freeze({
  maxUploadBytes: 100 * 1024 * 1024,
  maxFiles: 3000,
  maxEntryBytes: 50 * 1024 * 1024,
  maxTotalBytes: 300 * 1024 * 1024,
});

const TOP_LEVEL = new Set(['manifest.json', SIGNATURE_FILE, 'README.md', 'CHANGELOG.md', 'LICENSE']);
const FOLDERS = new Set(['server', 'web', 'migrations', 'locales', 'docs']);
export const MIGRATION_FILE = /^(\d{3})_[a-z0-9_]{1,60}\.(sql|js)$/;

export class PackageError extends Error {
  constructor(problem) {
    super(problem.message.en);
    this.problem = problem;
    this.statusCode = 422;
    this.code = problem.code;
  }
}

const bad = (reason) => new PackageError(badPackage(reason));

/**
 * { manifest, files: [{ name, data }], signed, keyId, checksum } of a package
 * buffer, or throws PackageError (BAD_PACKAGE). `allowUnsigned` (MODULES_DEV=1)
 * accepts a package without SIGNATURE.
 */
export function openPackage(buffer, { allowUnsigned = false, trustedKeys, categories, integrations } = {}) {
  if (!Buffer.isBuffer(buffer)) throw bad('no file');
  if (buffer.length > PACKAGE_LIMITS.maxUploadBytes) throw bad('file too large');
  let files;
  try {
    files = readZip(buffer, PACKAGE_LIMITS);
  } catch (err) {
    throw bad(err.message);
  }
  for (const { name } of files) {
    const [head, ...rest] = name.split('/');
    if (rest.length ? !FOLDERS.has(head) : !TOP_LEVEL.has(head)) throw bad(`unexpected file ${name}`);
    if (head === 'migrations' && (rest.length !== 1 || !MIGRATION_FILE.test(rest[0]))) throw bad(`migration ${name} must be migrations/NNN_name.sql or .js`);
  }
  const signature = verifyFiles(files, { ...(trustedKeys ? { trustedKeys } : {}), allowUnsigned });
  if (!signature.ok) throw bad(`signature: ${signature.reason}`);
  const manifestFile = files.find((file) => file.name === 'manifest.json');
  if (!manifestFile) throw bad('manifest.json is missing');
  let raw;
  try {
    raw = JSON.parse(manifestFile.data.toString('utf8'));
  } catch {
    throw bad('manifest.json is not valid JSON');
  }
  const { manifest, problems } = normalizeManifest(raw, { categories, integrations });
  if (problems.length) throw bad(`manifest.json: ${problems.join('; ')}`);
  const names = new Set(files.map((file) => file.name));
  if (manifest.server && !names.has(manifest.server.entry)) throw bad(`${manifest.server.entry} is missing`);
  if (manifest.web && !names.has(manifest.web.entry)) throw bad(`${manifest.web.entry} is missing`);
  for (const css of manifest.web?.css || []) if (!names.has(css)) throw bad(`${css} is missing`);
  const numbers = new Set();
  for (const { name } of files.filter((file) => file.name.startsWith('migrations/'))) {
    const number = name.slice('migrations/'.length, 'migrations/'.length + 3);
    if (numbers.has(number)) throw bad(`two migrations numbered ${number}`);
    numbers.add(number);
  }
  return { manifest, files, signed: signature.signed, keyId: signature.keyId || null, checksum: createHash('sha256').update(buffer).digest('hex') };
}

/** Writes the files of a package into $MODULES_DIR/<id>/<version> (atomically: a temporary folder renamed into place). */
export function unpackPackage({ manifest, files }) {
  const root = moduleRoot(manifest.id);
  const target = versionDir(manifest.id, manifest.version);
  mkdirSync(root, { recursive: true });
  const temp = resolve(root, `.${manifest.version}.tmp-${randomBytes(4).toString('hex')}`);
  try {
    for (const file of files) {
      const path = resolve(temp, file.name);
      if (!path.startsWith(temp + sep)) throw bad(`unsafe path ${file.name}`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.data, { mode: 0o644 });
    }
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    renameSync(temp, target);
  } catch (err) {
    rmSync(temp, { recursive: true, force: true });
    throw err;
  }
  return target;
}
