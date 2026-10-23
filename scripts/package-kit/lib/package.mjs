/*
 * Package files of the kit: the real build (scripts/build-module.mjs, unsigned and signed with a
 * throw-away Ed25519 key), its verification (make modules-verify), and variants made from the
 * signed build — a patch update with an extra migration, an update whose migration fails, a
 * tampered file, a package signed by a key the portal does not trust.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bumpPatch, nextMigrationName } from './pure.mjs';
import { run } from './proc.mjs';

const lib = (backendDir, path) => import(pathToFileURL(join(backendDir, path)).href);

/** A throw-away signing key and a trusted-keys file that trusts only it. */
export async function makeKeys(backendDir, dir) {
  const { generateSigningKey } = await lib(backendDir, 'platform/packages/signature.js');
  const key = generateSigningKey();
  const other = generateSigningKey();
  const keyFile = join(dir, 'kit-signing-key.pem');
  const otherFile = join(dir, 'untrusted-key.pem');
  const trustedFile = join(dir, 'trusted-keys.json');
  writeFileSync(keyFile, key.privateKey, { mode: 0o600 });
  writeFileSync(otherFile, other.privateKey, { mode: 0o600 });
  writeFileSync(trustedFile, `${JSON.stringify({ keys: [{ id: key.keyId, publicKey: key.publicKey, comment: 'package kit, throw-away' }] }, null, 2)}\n`);
  return { keyFile, otherFile, trustedFile, keyId: key.keyId, otherKeyId: other.keyId };
}

/**
 * Builds the module with the repository's build script (version kept, module.json not written).
 * Returns the zip path.
 */
export async function buildPackage({ root, id, outDir, keyFile = null, trustedFile, env, log }) {
  const args = [join(root, 'scripts/build-module.mjs'), id, '--keep', '--no-write', '--out', outDir];
  if (keyFile) args.push('--key', keyFile);
  else args.push('--unsigned');
  await run(`build ${id}${keyFile ? ' signed' : ' unsigned'}`, process.execPath, args, {
    cwd: root,
    env: { ...env, MODULE_TRUSTED_KEYS_FILE: trustedFile, NODE_OPTIONS: '--max-old-space-size=2048' },
    log,
    timeoutMs: 15 * 60_000,
  });
  const text = readFileSync(log, 'utf8');
  const built = [...text.matchAll(/^Built (\S+\.zip):/gm)].pop();
  if (!built) throw new Error(`the build did not report a zip (log ${log})`);
  return resolve(root, built[1]);
}

/** make modules-verify: → { ok, output }. */
export async function verifyPackage({ root, file, trustedFile, allowUnsigned = false, env, log }) {
  const args = [join(root, 'scripts/build-module.mjs'), 'verify', file];
  if (allowUnsigned) args.push('--allow-unsigned');
  try {
    await run('verify', process.execPath, args, { cwd: root, env: { ...env, MODULE_TRUSTED_KEYS_FILE: trustedFile }, log, timeoutMs: 120_000 });
    return { ok: true, output: lastLines(log) };
  } catch {
    return { ok: false, output: lastLines(log) };
  }
}

const lastLines = (log) => readFileSync(log, 'utf8').trim().split('\n').filter((line) => /^(OK|REJECTED|  requires)/.test(line)).slice(-2).join(' / ');

/** Files of a zip. */
export async function readPackage(backendDir, file) {
  const { readZip } = await lib(backendDir, 'platform/packages/zip.js');
  const files = readZip(readFileSync(file));
  const manifest = JSON.parse(files.find((f) => f.name === 'manifest.json').data.toString('utf8'));
  return { files, manifest };
}

async function writeSigned(backendDir, files, keyFile, target) {
  const { writeZip } = await lib(backendDir, 'platform/packages/zip.js');
  const { signFiles } = await lib(backendDir, 'platform/packages/signature.js');
  const plain = files.filter((f) => f.name !== 'SIGNATURE');
  const out = keyFile ? [...plain, { name: 'SIGNATURE', data: signFiles(plain, readFileSync(keyFile, 'utf8')) }] : plain;
  out.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  writeFileSync(target, writeZip(out));
  return target;
}

/**
 * A new version of the signed package: version + `by` (patch), one more migration `sql`
 * (numbered after the package's own files and `taken` migration ids), re-signed with `keyFile`.
 */
export async function variant(backendDir, signedFile, { by = 1, label, sql, keyFile, outDir, taken = [] }) {
  const { files, manifest } = await readPackage(backendDir, signedFile);
  const version = bumpPatch(manifest.version, by);
  const next = { ...manifest, version, changelog: [{ version, date: new Date().toISOString().slice(0, 10), changes: { en: [`package kit: ${label}`], ru: [`package kit: ${label}`] } }, ...(manifest.changelog || [])].slice(0, 5) };
  // Numbered after the package's files and the migrations the database recorded (inline ones too, e.g. 001_init).
  const migration = sql ? nextMigrationName([...files.map((f) => f.name).filter((n) => n.startsWith('migrations/')), ...taken], label) : null;
  const out = files.filter((f) => f.name !== 'manifest.json' && f.name !== 'SIGNATURE').concat({ name: 'manifest.json', data: Buffer.from(`${JSON.stringify(next, null, 2)}\n`) });
  if (migration) out.push({ name: `migrations/${migration}`, data: Buffer.from(sql) });
  const target = join(outDir, `${manifest.id}-${version}-${label}.zip`);
  await writeSigned(backendDir, out, keyFile, target);
  return { file: target, version, migration: migration ? migration.replace(/\.sql$/, '') : null };
}

/** The signed package with one byte of a file changed after signing (the signature must fail). */
export async function tampered(backendDir, signedFile, outDir) {
  const { writeZip } = await lib(backendDir, 'platform/packages/zip.js');
  const { files, manifest } = await readPackage(backendDir, signedFile);
  const victim = files.find((f) => f.name === manifest.server?.entry) || files.find((f) => f.name === 'manifest.json');
  const out = files.map((f) => (f === victim ? { name: f.name, data: Buffer.concat([f.data, Buffer.from('\n// tampered\n')]) } : f));
  const target = join(outDir, `${manifest.id}-${manifest.version}-tampered.zip`);
  writeFileSync(target, writeZip(out));
  return target;
}

/** The same files signed by a key nobody trusts. */
export async function untrusted(backendDir, signedFile, otherKeyFile, outDir) {
  const { files, manifest } = await readPackage(backendDir, signedFile);
  return writeSigned(backendDir, files, otherKeyFile, join(outDir, `${manifest.id}-${manifest.version}-untrusted.zip`));
}
