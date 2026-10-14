import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectivePermissions,
  grantable,
  hasWrites,
  issueVisitor,
  normalizePermissions,
  parseExtensions,
  permissionsFromInput,
  readVisitor,
} from '../modules/files/links.js';
import { LEVEL } from '../modules/shared/acl.js';

const ON = { writeLinks: true, requireWriteLinkPassword: false };

test('permissions: unknown keys dropped, everything but upload needs view, never empty', () => {
  assert.deepEqual(normalizePermissions(['download', 'hack', 'delete']), ['view']);
  assert.deepEqual(normalizePermissions(['upload']), ['upload']);
  assert.deepEqual(normalizePermissions(['upload', 'delete']), ['upload']);
  assert.deepEqual(normalizePermissions(['delete', 'view', 'download']), ['view', 'download', 'delete']);
  assert.deepEqual(normalizePermissions([]), ['view']);
  assert.deepEqual(normalizePermissions(null), ['view']);
});

test('permissions: a file link supports view, download and replace only', () => {
  assert.deepEqual(normalizePermissions(['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete'], false), ['view', 'download', 'replace']);
  assert.deepEqual(normalizePermissions(['upload'], false), ['view']);
});

test('old clients: allowDownload maps to view(+download)', () => {
  assert.deepEqual(permissionsFromInput({}, true), ['view', 'download']);
  assert.deepEqual(permissionsFromInput({ allowDownload: false }, true), ['view']);
  assert.deepEqual(permissionsFromInput({ permissions: ['upload'] }, true), ['upload']);
});

test('grant at most your own rights: view → read keys, edit → writes too', () => {
  assert.deepEqual(grantable(LEVEL.none, ON), []);
  assert.deepEqual(grantable(LEVEL.view, ON), ['view', 'download']);
  assert.deepEqual(grantable(LEVEL.edit, ON), ['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete']);
  assert.deepEqual(grantable(LEVEL.manage, ON, false), ['view', 'download', 'replace']);
  assert.deepEqual(grantable(LEVEL.manage, { writeLinks: false }), ['view', 'download']);
});

test('effective permissions follow the author and the settings on every request', () => {
  const full = { kind: 'folder', permissions: ['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete'], password_hash: null };
  assert.deepEqual(effectivePermissions(full, LEVEL.manage, ON), full.permissions);
  // The author lost edit rights: reading stays, writing goes.
  assert.deepEqual(effectivePermissions(full, LEVEL.view, ON), ['view', 'download']);
  // Admin switched write links off, or demands a password for them.
  assert.deepEqual(effectivePermissions(full, LEVEL.manage, { writeLinks: false }), ['view', 'download']);
  assert.deepEqual(effectivePermissions(full, LEVEL.manage, { writeLinks: true, requireWriteLinkPassword: true }), ['view', 'download']);
  assert.deepEqual(effectivePermissions({ ...full, password_hash: 'x' }, LEVEL.manage, { writeLinks: true, requireWriteLinkPassword: true }), full.permissions);
  // Upload-only never turns into a read link; with uploads off it allows nothing.
  const drop = { kind: 'folder', permissions: ['upload'], password_hash: null };
  assert.deepEqual(effectivePermissions(drop, LEVEL.manage, ON), ['upload']);
  assert.deepEqual(effectivePermissions(drop, LEVEL.view, ON), []);
  assert.equal(hasWrites(['view', 'download']), false);
  assert.equal(hasWrites(['upload']), true);
});

test('extension lists are cleaned', () => {
  assert.deepEqual(parseExtensions('.pdf, JPG; *.docx  ../etc, toolongextension1, pdf'), ['pdf', 'jpg', 'docx']);
  assert.deepEqual(parseExtensions(''), []);
});

test('visitor tokens are bound to the link id and version', () => {
  const link = { id: 7, version: 3 };
  const token = issueVisitor(link, { pw: true, name: 'Anna' });
  const payload = readVisitor(link, token);
  assert.equal(payload.pw, true);
  assert.equal(payload.n, 'Anna');
  assert.ok(payload.sid);
  assert.equal(readVisitor({ id: 7, version: 4 }, token), null);
  assert.equal(readVisitor({ id: 8, version: 3 }, token), null);
  assert.equal(readVisitor(link, 'garbage'), null);
});
