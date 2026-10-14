import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanExts,
  cleanVisitor,
  effectivePerms,
  extAllowed,
  fileLimitBytes,
  legacyPerms,
  linkOptions,
  normalizePerms,
  quotaBytes,
  requirePerm,
  ungrantable,
  visitorName,
} from '../modules/drive/linkPerms.js';
import { digest, flushLinkNotifications, noteLinkChange, renderDigest, setLinkNotifySender } from '../modules/drive/linkNotify.js';

test('drive link permissions: normalised per kind, dependencies added', () => {
  assert.deepEqual(normalizePerms(['download']), ['view', 'download']);
  assert.deepEqual(normalizePerms(['upload']), ['upload'], 'a file request does not see the folder');
  assert.deepEqual(normalizePerms(['upload', 'mkdir']), ['view', 'upload', 'mkdir']);
  assert.deepEqual(normalizePerms(['delete']), ['view', 'delete']);
  assert.deepEqual(normalizePerms(['rename', 'bogus', 'upload']), ['view', 'upload', 'rename']);
  assert.deepEqual(normalizePerms([]), ['view']);
  assert.deepEqual(normalizePerms('view'), ['view'], 'not an array');
  // File links: view, download and replace only.
  assert.deepEqual(normalizePerms(['upload', 'mkdir', 'rename', 'delete', 'replace'], 'file'), ['view', 'replace']);
  assert.deepEqual(normalizePerms(['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete']), ['view', 'download', 'upload', 'mkdir', 'rename', 'replace', 'delete']);
});

test('drive link permissions: existing links keep exactly what they had', () => {
  assert.deepEqual(legacyPerms(true), ['view', 'download']);
  assert.deepEqual(legacyPerms(false), ['view']);
  assert.deepEqual(effectivePerms({ kind: 'dir', allow_download: true, permissions: null }), ['view', 'download']);
  assert.deepEqual(effectivePerms({ kind: 'file', allow_download: false, permissions: null }), ['view']);
});

test('drive link permissions: administrators can switch write links off', () => {
  const full = { kind: 'dir', permissions: ['view', 'download', 'upload', 'delete'], password_hash: 'x' };
  assert.deepEqual(effectivePerms(full, { linkWrite: true }), ['view', 'download', 'upload', 'delete']);
  assert.deepEqual(effectivePerms(full, { linkWrite: false }), ['view', 'download']);
  assert.deepEqual(effectivePerms({ ...full, password_hash: null }, { requireWritePassword: true }), ['view', 'download'], 'no password: writes off');
  assert.deepEqual(effectivePerms(full, { requireWritePassword: true }), ['view', 'download', 'upload', 'delete']);
  // An upload-only link does not turn into a view link: it closes.
  assert.deepEqual(effectivePerms({ kind: 'dir', permissions: ['upload'] }, { linkWrite: false }), []);
});

test('drive link permissions: a link never grants more than its author has', () => {
  const perms = ['view', 'upload', 'mkdir', 'rename', 'replace', 'delete'];
  assert.deepEqual(ungrantable(perms, { read: true, write: true, delete: true, known: true }), []);
  assert.deepEqual(ungrantable(perms, { read: true, write: false, delete: false, known: true }), ['upload', 'mkdir', 'rename', 'replace', 'delete']);
  assert.deepEqual(ungrantable(perms, { read: true, write: true, delete: false, known: true }), ['rename', 'delete']);
  assert.deepEqual(ungrantable(perms, { known: false }), [], 'unknown rights: the server decides at action time');
  assert.throws(() => requirePerm(['view'], 'upload'), { code: 'NO_PERMISSION' });
  requirePerm(['view', 'upload'], 'upload');
});

test('drive link limits: extensions, sizes and quota', () => {
  assert.deepEqual(cleanExts('pdf, .DOCX; *.jpg  jpg bad/ext toolongextension1'), ['pdf', 'docx', 'jpg']);
  assert.equal(extAllowed('Contract.PDF', ['pdf']), true);
  assert.equal(extAllowed('photo.jpg', ['pdf']), false);
  assert.equal(extAllowed('README', ['pdf']), false);
  assert.equal(extAllowed('anything.exe', []), true);
  assert.equal(fileLimitBytes({ max_file_mb: 10 }, { maxUploadMb: 2048 }), 10 * 1048576);
  assert.equal(fileLimitBytes({ max_file_mb: 5000 }, { maxUploadMb: 100 }), 100 * 1048576, 'never above the module limit');
  assert.equal(fileLimitBytes({}, { maxUploadMb: 50 }), 50 * 1048576);
  assert.equal(quotaBytes({ quota_mb: 2 }), 2 * 1048576);
  assert.equal(quotaBytes({ quota_mb: null }), null);
});

test('drive link options and visitors', () => {
  assert.deepEqual(linkOptions({ maxFileMb: '25', quotaMb: 0, allowedExts: 'pdf docx', requireEmail: true, title: ' Documents <b> ', notify: 1 }), {
    max_file_mb: 25,
    quota_mb: null,
    allowed_exts: ['pdf', 'docx'],
    require_email: true,
    require_name: true,
    notify: true,
    title: 'Documents b',
  });
  assert.deepEqual(linkOptions({}), {});
  assert.deepEqual(cleanVisitor({ name: '  Иван   Петров ' }, { require_name: true }), { name: 'Иван Петров', email: null });
  assert.throws(() => cleanVisitor({ name: '' }, { require_name: true }), { code: 'NAME_REQUIRED' });
  assert.throws(() => cleanVisitor({ name: 'Ivan', email: 'nope' }, {}), { code: 'EMAIL_INVALID' });
  assert.throws(() => cleanVisitor({ name: 'Ivan' }, { require_email: true }), { code: 'EMAIL_REQUIRED' });
  assert.equal(visitorName('Report.pdf'), 'Report.pdf');
  for (const bad of ['~$lock.docx', '.htaccess', '~$portal-x.tmp']) assert.throws(() => visitorName(bad), { code: 'INVALID_NAME' }, bad);
});

test('drive link notifications: one digest per visitor burst', async () => {
  const sent = [];
  setLinkNotifySender(async (payload) => sent.push(payload), { quietMs: 30, maxMs: 1000 });
  const link = { id: 7, share_id: 3, kind: 'dir', path: 'Clients/Acme', name: 'Acme', title: 'Documents for Acme', created_by: 42, notify: true };
  noteLinkChange(link, { sid: 'a', name: 'Ivan' }, { action: 'upload', name: 'a.pdf' });
  noteLinkChange(link, { sid: 'a', name: 'Ivan' }, { action: 'upload', name: 'b.pdf' });
  noteLinkChange(link, { sid: 'a', name: 'Ivan' }, { action: 'mkdir', name: 'Scans' });
  noteLinkChange(link, { sid: 'b', name: null }, { action: 'delete', name: 'old.txt' });
  noteLinkChange({ ...link, notify: false }, { sid: 'c' }, { action: 'upload', name: 'x' });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await flushLinkNotifications();
  assert.equal(sent.length, 2, 'two visitors, two digests; a link without notify sends nothing');
  const ivan = sent.find((item) => item.render('en').title.startsWith('Ivan'));
  assert.equal(ivan.kind, 'drive.linkActivity');
  assert.deepEqual(ivan.userIds, [42]);
  assert.equal(ivan.link, '/app/drive/s/3/Clients/Acme');
  assert.equal(ivan.render('en').title, 'Ivan uploaded 2 files, created 1 folder via your link “Documents for Acme”');
  assert.equal(ivan.render('ru').title, 'Ivan загрузил(а) 2 файла, создал(а) 1 папку по ссылке «Documents for Acme»');
  assert.match(ivan.render('ru').body, /a\.pdf, b\.pdf, Scans/);
  const other = sent.find((item) => item !== ivan);
  assert.equal(other.render('ru').title, 'Посетитель удалил(а) 1 объект по ссылке «Documents for Acme»');
  assert.deepEqual(digest([{ action: 'upload', name: 'a' }, { action: 'upload', name: 'a' }]).names, ['a']);
  assert.equal(renderDigest('en', { link, visitor: { name: 'Ann', email: 'ann@example.com' }, changes: [{ action: 'replace', name: 'c.docx' }] }).body, 'c.docx\nann@example.com');
  setLinkNotifySender(null, { quietMs: 120000, maxMs: 600000 });
});
