import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FILE_CSP, contentDisposition, hasSignature, readHead, signatureMatches } from '../modules/shared/storage.js';
import { fileShape, inlineType } from '../modules/chat/files.js';
import { callData } from '../modules/chat/service.js';
import { csvCell } from '../modules/drive/activity.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

test('csv cells: formulas are neutralised, numbers and plain text are not', () => {
  for (const evil of ['=HYPERLINK("http://x")', '+1+2', '-2+3', '@SUM(A1)', '\tx', '\rx']) {
    const cell = csvCell(evil);
    assert.ok(cell.startsWith("'") || cell.startsWith(`"'`), `${JSON.stringify(evil)} → ${cell}`);
  }
  assert.equal(csvCell('=1;2'), `"'=1;2"`, 'quoting still applies after the prefix');
  assert.equal(csvCell(-5), '-5', 'numbers stay numbers');
  assert.equal(csvCell('report.pdf'), 'report.pdf');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(null), '');
});

test('content disposition: inline / attachment, ASCII fallback, no header injection', () => {
  assert.equal(contentDisposition('a.pdf', true), `inline; filename="a.pdf"; filename*=UTF-8''a.pdf`);
  const value = contentDisposition('Отчёт "1".pdf\r\nX-Evil: 1');
  assert.ok(value.startsWith('attachment; filename="'));
  assert.ok(!/[\r\n]/.test(value), 'no CR/LF');
  assert.match(value, /^attachment; filename="_____ 1\.pdf  X-Evil: 1"; filename\*=/, 'non-ASCII becomes _, quotes are dropped');
  assert.ok(value.includes(`filename*=UTF-8''${encodeURIComponent('Отчёт "1".pdf  X-Evil: 1')}`));
  for (const part of ['sandbox', "form-action 'none'", "frame-ancestors 'self'", "default-src 'none'"]) assert.ok(FILE_CSP.includes(part), part);
});

test('chat files open inline only when the name and the reported type agree', () => {
  assert.equal(inlineType('photo.png', 'image/png'), 'image/png');
  assert.equal(inlineType('photo.JPG', 'image/jpeg'), 'image/jpeg');
  assert.equal(inlineType('doc.pdf', 'application/pdf; charset=binary'), 'application/pdf');
  assert.equal(inlineType('invoice.html', 'image/png'), null, 'a page claiming to be a picture downloads');
  assert.equal(inlineType('photo.png', 'text/html'), null);
  assert.equal(inlineType('image.svg', 'image/svg+xml'), null, 'SVG never opens inline in chat');
  assert.equal(inlineType('noext', 'image/png'), null);
  assert.equal(inlineType('clip.mp4', 'video/mp4'), 'video/mp4');
  assert.equal(fileShape({ id: 1, name: 'x.html', mime: 'image/png', size: 1 }).image, false);
  assert.equal(fileShape({ id: 1, name: 'x.png', mime: 'image/png', size: 1 }).image, true);
});

test('magic bytes: header read and signature match', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-files-'));
  try {
    const png = join(dir, 'a.png');
    await writeFile(png, Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]));
    const head = await readHead(png);
    assert.equal(head.length, 16, 'only the first bytes are read');
    assert.ok(signatureMatches(head, 'png'));
    assert.ok(!signatureMatches(head, 'pdf'));
    const tiny = join(dir, 'b.pdf');
    await writeFile(tiny, '%P');
    assert.equal((await readHead(tiny)).length, 2);
    assert.ok(!signatureMatches(await readHead(tiny), 'pdf'), 'a truncated file does not pass');
    assert.ok(signatureMatches(Buffer.from('<html>'), 'txt'), 'types without a signature pass');
    assert.ok(hasSignature('jpeg') && hasSignature('webp') && !hasSignature('svg'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('call cards accept http(s) links only', () => {
  assert.deepEqual(callData({ url: 'https://meet.example.com/portal-1-abc' }), { call: { url: 'https://meet.example.com/portal-1-abc' } });
  assert.equal(callData({ url: 'javascript:alert(1)' }), null);
  assert.equal(callData({ url: 'data:text/html,x' }), null);
  assert.equal(callData({ url: 'not a url' }), null);
  assert.equal(callData(null), null);
});
