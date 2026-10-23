import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SIGNATURE_FILE, listingDigest, listingOf, verifyListing } from './signature.js';

/*
 * The files of an unpacked package, checked again (docs/module-packages.md «Signing»):
 * at every boot before its code is imported, and at install for the staged copy.
 *
 * The listing of the folder (sha256 + path of every file, as signed) must
 * verify against SIGNATURE with a trusted key, and — once the portal knows the
 * package (installed_modules.listing_sha256) — be exactly the listing it
 * installed. So code written into $MODULES_DIR by anything but the installer
 * (a file-write bug, write access to ./data/modules on the host, an older
 * signed version copied over a newer one) is not run. Unsigned packages are
 * accepted only in development mode (MODULES_DEV=1), also when they were
 * installed earlier in development mode.
 *
 * Cost: one read + SHA-256 of every file (a package is a few MB) and one
 * Ed25519 verification per package per boot.
 */

export class IntegrityError extends Error {
  constructor(message) {
    super(message);
    this.code = 'PACKAGE_INTEGRITY';
  }
}

/** Every regular file under `dir` as { name (relative, /-separated), sha256 }; links and special files are refused. */
export function hashFiles(dir) {
  const out = [];
  const walk = (folder, prefix) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new IntegrityError(`${name} is a symbolic link`);
      if (stat.isDirectory()) walk(path, name);
      else if (stat.isFile()) out.push({ name, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') });
      else throw new IntegrityError(`${name} is not a regular file`);
    }
  };
  walk(dir, '');
  return out;
}

/**
 * Verifies the package folder `dir`. `expected`: { listing_sha256, signed_by }
 * of its installed_modules row (null when the portal has none yet).
 * Returns { listingSha256, signed, keyId }; throws IntegrityError.
 */
export function verifyPackageDir(dir, { expected = null, devMode = false, trustedKeys } = {}) {
  let files;
  try {
    files = hashFiles(dir);
  } catch (err) {
    if (err instanceof IntegrityError) throw err;
    throw new IntegrityError(`cannot read the package files: ${err.message}`);
  }
  const listing = listingOf(files);
  const listingSha256 = listingDigest(listing);
  const signatureFile = files.find((file) => file.name === SIGNATURE_FILE) ? readFileSync(join(dir, SIGNATURE_FILE)) : null;
  const result = verifyListing(listing, signatureFile, { ...(trustedKeys ? { trustedKeys } : {}), allowUnsigned: devMode });
  if (!result.ok) {
    throw new IntegrityError(result.reason === 'unsigned' ? 'the package is not signed and development mode (MODULES_DEV=1) is off' : `the files on disk do not match the package signature (${result.reason})`);
  }
  if (!result.signed && expected?.signed_by && expected.signed_by !== 'unsigned') throw new IntegrityError('the package was installed signed, the files on disk are not');
  if (expected?.signed_by === 'unsigned' && !devMode) throw new IntegrityError('the package was installed unsigned in development mode, which is now off: install a signed package');
  if (expected?.listing_sha256 && expected.listing_sha256 !== listingSha256) throw new IntegrityError('the files on disk differ from the package that was installed');
  return { listingSha256, signed: result.signed, keyId: result.keyId || null };
}
