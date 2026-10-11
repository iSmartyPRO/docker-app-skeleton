import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { resolveModules, sanitizeModules } from '../modules/catalog.js';
import { extOf, mimeOf, storagePath } from '../modules/shared/storage.js';
import { parseExpiry } from '../modules/files/links.js';
import { uploadRoot } from '../config/paths.js';

const DAY = 24 * 60 * 60 * 1000;

test('storage keys cannot escape the upload directory', () => {
  assert.equal(storagePath('files/2026/10/a.pdf'), join(uploadRoot, 'files/2026/10/a.pdf'));
  assert.equal(storagePath('/kb/x.png'), join(uploadRoot, 'kb/x.png'), 'leading slashes are stripped');
  assert.equal(storagePath('/../secret'), join(uploadRoot, 'secret'), 'absolute .. collapses at the root');
  for (const bad of ['', '.', '..', '../etc/passwd', 'files/../../etc/passwd', 'a/../..']) {
    assert.throws(() => storagePath(bad), { code: 'FILE_MISSING' }, bad);
  }
});

test('extensions and mime types', () => {
  assert.equal(extOf('Report.Final.PDF'), 'pdf');
  assert.equal(extOf('noext'), '');
  assert.equal(mimeOf('png'), 'image/png');
  assert.equal(mimeOf('exe'), 'application/octet-stream');
});

test('link expiry: optional, future-only, capped by maxLinkDays', () => {
  assert.equal(parseExpiry(null, 0), null);
  const capped = parseExpiry('', 7);
  assert.ok(Math.abs(capped.getTime() - (Date.now() + 7 * DAY)) < 5000, 'a cap gives links a default expiry');

  const soon = new Date(Date.now() + DAY).toISOString();
  assert.equal(parseExpiry(soon, 0).toISOString(), soon);
  assert.throws(() => parseExpiry('not a date', 0), { code: 'INVALID_DATE' });
  assert.throws(() => parseExpiry(new Date(Date.now() - 1000).toISOString(), 0), { code: 'INVALID_DATE' });
  assert.throws(() => parseExpiry(new Date(Date.now() + 30 * DAY).toISOString(), 7), { code: 'EXPIRY_LIMIT' });
});

test('files settings are sanitised', () => {
  const next = sanitizeModules(resolveModules(), {
    files: { settings: { maxUploadMb: 999999, quotaMb: -1, fileGroups: ['pdf', 'exe'], allowAny: 'yes', trashDays: 0, spaceCreation: 'root' } },
  });
  const files = next.files.settings;
  assert.equal(files.maxUploadMb, 4096);
  assert.equal(files.quotaMb, 0);
  assert.deepEqual(files.fileGroups.includes('exe'), false);
  assert.equal(files.allowAny, true, 'non-boolean flags are ignored');
  assert.equal(files.trashDays, 1);
  assert.equal(files.spaceCreation, 'admins');
});
