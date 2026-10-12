import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOLDER_UPLOAD, folderTree, splitRelativePath } from '../modules/shared/relpath.js';

const bad = (value, options) => assert.throws(() => splitRelativePath(value, options), { code: 'INVALID_PATH' }, JSON.stringify(value));

test('folder upload paths: plain relative paths are split into segments', () => {
  assert.deepEqual(splitRelativePath('Photos/2026/May'), ['Photos', '2026', 'May']);
  assert.deepEqual(splitRelativePath('Отчёты\\Q1'), ['Отчёты', 'Q1'], 'backslashes are separators');
  assert.deepEqual(splitRelativePath('a//b/'), ['a', 'b'], 'repeated and trailing separators collapse');
  assert.deepEqual(splitRelativePath(''), []);
  assert.deepEqual(splitRelativePath(undefined), []);
  assert.deepEqual(splitRelativePath('.hidden/..dots.txt.d'), ['.hidden', '..dots.txt.d'], 'dots inside names are fine');
  assert.deepEqual(splitRelativePath('Report (2)/v1.0'), ['Report (2)', 'v1.0']);
});

test('folder upload paths: traversal and absolute paths are refused', () => {
  for (const value of ['..', '../x', 'a/../b', 'a/..', './a', 'a/./b', '...', 'a/ .. /b', '/etc', '\\\\server\\share', 'C:\\Windows', 'c:x', '~/x']) bad(value);
});

test('folder upload paths: control characters, reserved and over-long names are refused', () => {
  for (const value of ['a\u0000b', 'a/b\nc', 'tab\there', 'x\u007f']) bad(value);
  for (const value of ['CON', 'a/nul', 'Com1', 'lpt9.txt', 'aux.tar.gz']) bad(value);
  assert.deepEqual(splitRelativePath('console/nullable'), ['console', 'nullable'], 'only exact device names are reserved');
  bad('x'.repeat(FOLDER_UPLOAD.maxSegment + 1));
  assert.equal(splitRelativePath('x'.repeat(FOLDER_UPLOAD.maxSegment))[0].length, FOLDER_UPLOAD.maxSegment);
  bad(`${'abcdefgh/'.repeat(500)}`, { maxDepth: 1000 });
  bad(123);
  bad({ toString: () => 'a' });
});

test('folder upload paths: depth is limited', () => {
  const deep = Array.from({ length: FOLDER_UPLOAD.maxDepth }, (_, index) => `d${index}`).join('/');
  assert.equal(splitRelativePath(deep).length, FOLDER_UPLOAD.maxDepth);
  bad(`${deep}/one-more`);
  bad('a/b/c', { maxDepth: 2 });
});

test('folder tree: every prefix once, parents first, case-insensitive', () => {
  const { list, keys } = folderTree(['Photos/2026/May', 'Photos/2025', 'photos/2026', 'Docs']);
  assert.deepEqual(
    list.map((item) => item.parts.join('/')),
    ['Photos', 'Docs', 'Photos/2026', 'Photos/2025', 'Photos/2026/May']
  );
  assert.deepEqual(keys, ['photos/2026/may', 'photos/2025', 'photos/2026', 'docs'], 'one key per input, in input order');
  for (const [index, item] of list.entries()) {
    if (item.parts.length > 1) {
      const parent = item.parts.slice(0, -1).join('/').toLowerCase();
      assert.ok(list.slice(0, index).some((other) => other.key === parent), `${item.key} comes after its parent`);
    }
  }
});

test('folder tree: bad input is refused as a whole', () => {
  assert.throws(() => folderTree('a/b'), { code: 'INVALID_PATH' });
  assert.throws(() => folderTree(['ok', '../escape']), { code: 'INVALID_PATH' });
  assert.throws(() => folderTree(['']), { code: 'INVALID_PATH' }, 'an empty path is not a folder');
  assert.throws(() => folderTree(Array.from({ length: FOLDER_UPLOAD.maxFolders + 1 }, (_, index) => `f${index}`)), { code: 'TOO_MANY_FOLDERS' });
  assert.equal(folderTree(Array.from({ length: FOLDER_UPLOAD.maxFolders }, (_, index) => `f${index}`)).list.length, FOLDER_UPLOAD.maxFolders);
});
