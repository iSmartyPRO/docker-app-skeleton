import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import { actionUrl, parseDiscovery } from '../services/office/discovery.js';
import { maskToken, signWopiToken, verifyWopiToken } from '../services/office/tokens.js';
import { editingFrom, editorOrigin } from '../services/office/config.js';
import { EDITING_DEFAULTS, sanitizeEditing } from '../services/office/editing.js';
import { officeSignatureOk } from '../services/office/content.js';
import { checkFileInfo, providerOf, registerProvider, wopiTime } from '../services/office/wopi.js';
import { verifyToken, signToken } from '../services/auth.js';
import { ownerFileCandidates, ownerName } from '../modules/drive/office.js';

/*
 * Online editing (Collabora / WOPI) without a database: discovery parsing,
 * access tokens, settings cleaning, content checks, CheckFileInfo shape and
 * desktop lock files. The WOPI flows themselves run against a test database
 * in office-files.db.test.js and office-drive.db.test.js.
 */

const xml = readFileSync(new URL('../test-fixtures/collabora-discovery.xml', import.meta.url), 'utf8');

test('discovery: edit and view actions per extension', () => {
  const discovery = parseDiscovery(xml);
  for (const ext of ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'doc', 'csv']) assert.ok(discovery.extensions[ext]?.edit, ext);
  assert.equal(discovery.extensions.docx.app, 'writer');
  assert.equal(discovery.extensions.xlsx.app, 'calc');
  assert.ok(discovery.extensions.pdf.view && !discovery.extensions.pdf.edit);
  assert.ok(discovery.extensions.vsdx.view, 'view_comment counts as view');
  assert.equal(discovery.extensions[''], undefined, 'mime-type apps without an extension are skipped');
  assert.equal(discovery.capabilitiesUrl, 'http://collabora:9980/hosting/capabilities');
  assert.ok(discovery.proofKey?.modulus);
  assert.throws(() => parseDiscovery('<html>nginx error</html>'), /discovery/);
});

test('discovery: the editor page moves to the public server address', () => {
  const discovery = parseDiscovery(xml);
  const url = actionUrl(discovery, 'DOCX', { serverUrl: 'https://collabora.example.com' });
  assert.equal(url, 'https://collabora.example.com/browser/f4a9c1b/cool.html?');
  assert.equal(actionUrl(discovery, 'pdf', { serverUrl: 'https://c.example.com', mode: 'edit' }), 'https://c.example.com/browser/f4a9c1b/cool.html?', 'falls back to view');
  assert.equal(actionUrl(discovery, 'exe', { serverUrl: 'https://c.example.com' }), null);
  const ms = parseDiscovery('<wopi-discovery><net-zone><app name="Word"><action name="edit" ext="docx" urlsrc="https://x.example/we/wordeditorframe.aspx?&lt;ui=UI_LLCC&amp;&gt;"/></app></net-zone></wopi-discovery>');
  assert.equal(actionUrl(ms, 'docx'), 'https://x.example/we/wordeditorframe.aspx?');
});

test('tokens: bound to file, purpose and expiry; never a session cookie', () => {
  const { token, expiresAt } = signWopiToken({ fileId: 'files-12', userId: 5, sessionId: 'abc', tokenVersion: 2, permission: 'edit', origin: 'https://portal.example.com', hours: 10 });
  assert.ok(expiresAt > Date.now() + 9.9 * 3600 * 1000 && expiresAt <= Date.now() + 10 * 3600 * 1000 + 1000, 'access_token_ttl is an absolute time in ms');
  const claims = verifyWopiToken(token, 'files-12');
  assert.equal(claims.sub, '5');
  assert.equal(claims.perm, 'edit');
  assert.equal(claims.sid, 'abc');
  assert.equal(claims.tv, 2);
  assert.equal(claims.o, 'https://portal.example.com');
  assert.throws(() => verifyWopiToken(token, 'files-13'), /another file/);
  assert.throws(() => verifyWopiToken(token, 'drive-12'), /another file/);
  // A WOPI token is not a session, and a session is not a WOPI token.
  assert.throws(() => verifyToken(token));
  const cookie = signToken({ id: 5, token_version: 2 }, { claims: { sid: 'abc' } });
  assert.throws(() => verifyWopiToken(cookie, 'files-12'));
  // Same key, wrong purpose or audience.
  const forged = jwt.sign({ pur: 'other', fid: 'files-12', perm: 'edit' }, 'test-secret-for-unit-tests-1234567890', { audience: 'portal-wopi', issuer: 'portal', subject: '5' });
  assert.throws(() => verifyWopiToken(forged, 'files-12'));
  const view = signWopiToken({ fileId: 'files-12', userId: 5, sessionId: 'abc', permission: 'anything' });
  assert.equal(verifyWopiToken(view.token).perm, 'view', 'unknown permissions become view');
});

test('tokens: an expired token is refused', async () => {
  const { token } = signWopiToken({ fileId: 'files-1', userId: 1, sessionId: 's', permission: 'edit', hours: 0.0003 });
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert.throws(() => verifyWopiToken(token, 'files-1'), /expired/);
});

test('tokens never reach logs', () => {
  assert.equal(maskToken('/api/wopi/files/files-1/contents?access_token=eyJabc.def&access_token_ttl=0'), '/api/wopi/files/files-1/contents?access_token=***&access_token_ttl=0');
  assert.equal(maskToken('/api/l/x/nodes/1/file?t=secret'), '/api/l/x/nodes/1/file?t=***');
  assert.equal(maskToken('/api/app/files'), '/api/app/files');
});

test('settings: editing block is cleaned and defaults are sane', () => {
  assert.deepEqual(sanitizeEditing({}, undefined), EDITING_DEFAULTS);
  const next = sanitizeEditing({}, { enabled: true, serverUrl: 'https://collabora.example.com/', wopiBaseUrl: 'https://portal.example.com', allowedTypes: ['DOCX', 'exe', 'xlsx', 'xlsx'], tokenHours: 99 });
  assert.equal(next.serverUrl, 'https://collabora.example.com');
  assert.deepEqual(next.allowedTypes, ['docx', 'xlsx']);
  assert.equal(next.tokenHours, 24);
  assert.throws(() => sanitizeEditing({}, { serverUrl: 'javascript:alert(1)' }), /http/);
  assert.throws(() => sanitizeEditing({}, { wopiBaseUrl: 'https://user:pw@portal.example.com' }), /http/);
  const effective = editingFrom({ integrations: { documents: { enabled: true, serverUrl: 'http://collabora:9980', editing: { enabled: true, serverUrl: '', wopiBaseUrl: '' } } } });
  assert.equal(effective.enabled, true);
  assert.equal(effective.serverUrl, 'http://collabora:9980', 'falls back to the conversion server');
  assert.equal(effective.discoveryUrl, 'http://collabora:9980');
  assert.ok(effective.wopiBaseUrl, 'callback defaults to PUBLIC_URL / FRONTEND_URL');
  assert.equal(editorOrigin(effective), 'http://collabora:9980');
  assert.equal(editingFrom({ integrations: { documents: { editing: { enabled: true } } } }).enabled, false, 'no server, no editor');
  assert.equal(editorOrigin({ enabled: false, serverUrl: 'https://x' }), null);
});

test('saved content must look like the format', () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
  assert.ok(officeSignatureOk(zip, 'docx'));
  assert.ok(officeSignatureOk(zip, 'ods'));
  assert.ok(!officeSignatureOk(Buffer.from('<html>'), 'xlsx'));
  assert.ok(officeSignatureOk(ole, 'xls'));
  assert.ok(!officeSignatureOk(zip, 'doc'));
  assert.ok(officeSignatureOk(Buffer.from('{\\rtf1'), 'rtf'));
  assert.ok(officeSignatureOk(Buffer.from('a;b'), 'csv'));
});

test('CheckFileInfo: what Collabora needs, permission from token and access', () => {
  const handle = { name: 'Plan.docx', size: 1234, version: '1-1234', lastModified: new Date('2026-10-15T10:00:00.123Z'), ownerId: 'u1', canWrite: true };
  const row = { id: 7, username: 'ann', display_name: 'Ann Lee' };
  const edit = checkFileInfo({ handle, row, claims: { o: 'https://portal.example.com' }, canWrite: true, user: { avatarUrl: null } });
  assert.equal(edit.BaseFileName, 'Plan.docx');
  assert.equal(edit.Size, 1234);
  assert.equal(edit.UserId, '7');
  assert.equal(edit.UserFriendlyName, 'Ann Lee');
  assert.equal(edit.UserCanWrite, true);
  assert.equal(edit.UserCanNotWriteRelative, true);
  assert.equal(edit.SupportsLocks, true);
  assert.equal(edit.SupportsUpdate, true);
  assert.equal(edit.PostMessageOrigin, 'https://portal.example.com');
  assert.equal(edit.LastModifiedTime, '2026-10-15T10:00:00.123Z');
  assert.equal(edit.HideSaveOption, false);
  const view = checkFileInfo({ handle, row, claims: {}, canWrite: false, user: {} });
  assert.equal(view.UserCanWrite, false);
  assert.equal(view.ReadOnly, true);
  assert.equal(wopiTime('2026-10-15T10:00:00.123Z'), '2026-10-15T10:00:00.123Z');
});

test('file ids name a registered provider', () => {
  registerProvider({ prefix: 'unit', module: 'files', resolve: async () => null });
  assert.equal(providerOf('unit-42').localId, '42');
  assert.equal(providerOf('nope-1'), null);
  assert.equal(providerOf('unit-../../etc'), null);
  assert.equal(providerOf(''), null);
});

test('desktop lock files: Office and LibreOffice owners', () => {
  assert.deepEqual(ownerFileCandidates('Budget.xlsx'), ['~$Budget.xlsx', '~$udget.xlsx', '~$dget.xlsx', '.~lock.Budget.xlsx#']);
  // Office owner file: [len][ANSI name padded to 54][uint16 len][UTF-16LE name]
  const office = Buffer.alloc(162);
  office[0] = 4;
  office.write('ivan', 1, 'latin1');
  office.writeUInt16LE(10, 54);
  office.write('Иван Петров'.slice(0, 10), 56, 'utf16le');
  assert.equal(ownerName(office, 'office'), 'Иван Петро');
  const ansiOnly = Buffer.alloc(60);
  ansiOnly[0] = 5;
  ansiOnly.write('maria', 1, 'latin1');
  assert.equal(ownerName(ansiOnly, 'office'), 'maria');
  assert.equal(ownerName(Buffer.from('Anna Smith,PC-12,anna,15.10.2026 10:00,file:///home'), 'libreoffice'), 'Anna Smith');
  assert.equal(ownerName(null, 'office'), null);
});
