import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  README_MAX_BYTES,
  cacheReadme,
  cachedReadme,
  decodeReadme,
  folderState,
  headingSlug,
  joinRelative,
  onReadmePrefs,
  parseHref,
  pickReadme,
  readmesHidden,
  renderReadme,
  setFolderState,
  setReadmesHidden,
} from '../../frontend/src/lib/readme.js';
import { nodeResolver } from '../../frontend/src/modules/files/readmeLinks.js';

/* Folder READMEs (File server, Files and their public links): picking the file, decoding, links, rendering. */

test('readme: README.md is found case-insensitively and wins over .markdown and other spellings', () => {
  const entries = (...names) => names.map((name) => ({ name, dir: false }));
  assert.equal(pickReadme(entries('a.txt', 'readme.md', 'b.pdf'))?.name, 'readme.md');
  assert.equal(pickReadme(entries('README.markdown', 'Readme.MD'))?.name, 'Readme.MD');
  assert.equal(pickReadme(entries('readme.md', 'README.md', 'ReadMe.md'))?.name, 'README.md');
  assert.equal(pickReadme(entries('readme.markdown'))?.name, 'readme.markdown');
  assert.equal(pickReadme(entries('README', 'README.txt', 'my-readme.md', 'README.md.bak')), null);
  assert.equal(pickReadme([{ name: 'README.md', dir: true }]), null, 'a folder named README.md is not a README');
  assert.equal(pickReadme([]), null);
  assert.equal(pickReadme(undefined), null);
  // Files nodes: kind instead of dir.
  const nodes = [{ name: 'README.md', kind: 'folder' }, { name: 'readme.md', kind: 'file', id: 7 }];
  assert.equal(pickReadme(nodes, { isDir: (node) => node.kind !== 'file' })?.id, 7);
  assert.equal(README_MAX_BYTES, 512 * 1024);
});

test('readme: UTF-8 (with or without BOM), UTF-16 and Windows-1251 files decode to the same text', () => {
  const text = 'Папка «Договоры» — описание ✓';
  const utf8 = new TextEncoder().encode(text);
  assert.equal(decodeReadme(utf8), text);
  assert.equal(decodeReadme(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])), text, 'the BOM is dropped');
  assert.equal(decodeReadme(utf8.buffer), text, 'an ArrayBuffer works too');
  // "Привет, мир" in Windows-1251: not valid UTF-8.
  const cp1251 = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x2c, 0x20, 0xec, 0xe8, 0xf0]);
  assert.equal(decodeReadme(cp1251), 'Привет, мир');
  const utf16 = new Uint8Array([0xff, 0xfe, 0x1f, 0x04, 0x40, 0x04, 0x38, 0x04]);
  assert.equal(decodeReadme(utf16), 'При');
  assert.equal(decodeReadme(new Uint8Array(0)), '');
});

test('readme: link addresses are sorted into anchors, external, relative and unsafe', () => {
  assert.deepEqual(parseHref('#Установка'), { kind: 'anchor', hash: 'Установка' });
  assert.deepEqual(parseHref('https://example.com/x'), { kind: 'external', href: 'https://example.com/x' });
  assert.equal(parseHref('mailto:it@example.com').kind, 'external');
  assert.equal(parseHref('tel:+996555').kind, 'external');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', '//evil.example/x', '\\\\server\\share', 'C:\\Windows', '', '   ', '/..', '/a/../../b', 'a/%00b']) {
    assert.equal(parseHref(bad).kind, 'unsafe', bad);
  }
  assert.deepEqual(parseHref('docs/План%20работ.pdf?x=1#стр-2'), { kind: 'relative', root: false, up: 0, segments: ['docs', 'План работ.pdf'], dir: false, hash: 'стр-2' });
  assert.deepEqual(parseHref('./a/./b/../c.md'), { kind: 'relative', root: false, up: 0, segments: ['a', 'c.md'], dir: false, hash: '' });
  assert.deepEqual(parseHref('../../Шаблоны/'), { kind: 'relative', root: false, up: 2, segments: ['Шаблоны'], dir: true, hash: '' });
  assert.deepEqual(parseHref('..'), { kind: 'relative', root: false, up: 1, segments: [], dir: true, hash: '' });
  assert.deepEqual(parseHref('/Общее/readme.md'), { kind: 'relative', root: true, up: 0, segments: ['Общее', 'readme.md'], dir: false, hash: '' });
  assert.deepEqual(parseHref('sub\\file.txt').segments, ['sub', 'file.txt'], 'Windows separators');
});

test('readme: relative targets are joined to the folder and never leave the top', () => {
  assert.equal(joinRelative('a/b', parseHref('c.md')), 'a/b/c.md');
  assert.equal(joinRelative('a/b', parseHref('../c/d.md')), 'a/c/d.md');
  assert.equal(joinRelative('a/b', parseHref('../../x')), 'x');
  assert.equal(joinRelative('a/b', parseHref('../../../x')), null, 'above the share or link');
  assert.equal(joinRelative('', parseHref('../x')), null);
  assert.equal(joinRelative('a/b', parseHref('/top.md')), 'top.md');
  assert.equal(joinRelative('a', parseHref('..')), '');
  assert.equal(joinRelative('a', parseHref('https://x')), null);
});

test('readme: heading anchors follow GitHub (any script, duplicates numbered)', () => {
  assert.equal(headingSlug('Как начать работу?'), 'как-начать-работу');
  assert.equal(headingSlug('API & SDK: v2.0'), 'api--sdk-v20');
  assert.equal(headingSlug('  '), 'section');
  const seen = new Map();
  assert.deepEqual([headingSlug('Итоги', seen), headingSlug('Итоги', seen), headingSlug('Итоги', seen)], ['итоги', 'итоги-1', 'итоги-2']);
});

test('readme: GitHub-flavoured Markdown renders with anchors, task lists, scrolling tables and code bars', () => {
  const html = renderReadme([
    '# Отдел продаж',
    '## Отдел продаж',
    '- [x] Готово',
    '- [ ] В работе',
    '',
    '| Кто | Что |',
    '|---|:-:|',
    '| Иван | Договоры |',
    '',
    '```js',
    'const a = 1 < 2;',
    '```',
    '',
    '> Цитата',
    '',
    '---',
  ].join('\n'));
  assert.match(html, /<h1 id="readme-отдел-продаж"><a class="rd-anchor" href="#отдел-продаж"/);
  assert.match(html, /<h2 id="readme-отдел-продаж-1">/);
  assert.match(html, /<li class="rd-task"><input checked="" disabled="" type="checkbox"> Готово<\/li>/);
  assert.match(html, /<li class="rd-task"><input disabled="" type="checkbox"> В работе<\/li>/);
  assert.match(html, /<div class="rd-table"><table>[\s\S]*<\/table><\/div>/);
  assert.match(html, /<div class="rd-code"><div class="rd-code__bar"><span class="rd-code__lang">js<\/span><\/div><pre><code class="language-js">const a = 1 &lt; 2;<\/code><\/pre><\/div>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<hr>/);
  // A hostile language name cannot break out of the attribute.
  assert.doesNotMatch(renderReadme('```"><img src=x onerror=alert(1)>\nx\n```'), /onerror/);
  // Headings with markup: the anchor comes from the text.
  assert.match(renderReadme('## Шаг **1** — `npm i`'), /id="readme-шаг-1--npm-i"/);
});

test('readme: view state per folder and the global switch are remembered, and survive a broken storage', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  try {
    assert.equal(folderState('drive:1:a'), 'collapsed');
    setFolderState('drive:1:a', 'expanded');
    setFolderState('drive:1:b', 'hidden');
    assert.equal(folderState('drive:1:a'), 'expanded');
    assert.equal(folderState('drive:1:b'), 'hidden');
    setFolderState('drive:1:a', 'collapsed');
    assert.equal(folderState('drive:1:a'), 'collapsed');
    assert.equal(JSON.parse(store.get('readme_folders'))['drive:1:a'], undefined, 'the default is not stored');
    for (let index = 0; index < 450; index += 1) setFolderState(`f${index}`, 'expanded');
    assert.ok(Object.keys(JSON.parse(store.get('readme_folders'))).length <= 400, 'old folders are forgotten');
    assert.equal(folderState('f449'), 'expanded');

    let calls = 0;
    const stop = onReadmePrefs(() => {
      calls += 1;
    });
    assert.equal(readmesHidden(), false);
    setReadmesHidden(true);
    assert.equal(readmesHidden(), true);
    assert.equal(calls, 1);
    stop();
    setReadmesHidden(false);
    assert.equal(calls, 1);

    store.set('readme_folders', '{broken');
    assert.equal(folderState('x'), 'collapsed');
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    assert.equal(folderState('x'), 'collapsed');
    assert.doesNotThrow(() => setFolderState('x', 'hidden'));
    assert.equal(readmesHidden(), false);
  } finally {
    delete globalThis.localStorage;
  }
});

test('readme: loaded texts are cached by address and version, newest kept', () => {
  cacheReadme('u|1', { html: 'a' });
  assert.deepEqual(cachedReadme('u|1'), { html: 'a' });
  assert.equal(cachedReadme('u|2'), undefined, 'a new version is fetched again');
  for (let index = 0; index < 60; index += 1) cacheReadme(`k${index}`, { html: String(index) });
  assert.equal(cachedReadme('k0'), undefined);
  assert.deepEqual(cachedReadme('k59'), { html: '59' });
});

test('readme (Files): links walk the folders by name, only through places that can be listed', async () => {
  const space = { key: 'space:1', type: 'space', id: 1 };
  const docs = { key: 'folder:10', type: 'folder', id: 10 };
  const here = { key: 'folder:11', type: 'folder', id: 11 };
  const listings = {
    'space:1': [{ id: 10, kind: 'folder', name: 'Docs' }, { id: 20, kind: 'folder', name: 'Images' }, { id: 21, kind: 'file', name: 'top.md' }],
    'folder:10': [{ id: 11, kind: 'folder', name: 'Sales' }],
    'folder:20': [{ id: 22, kind: 'file', name: 'logo.png' }, { id: 23, kind: 'folder', name: 'Old' }],
    'folder:23': [{ id: 24, kind: 'file', name: 'a.png' }],
  };
  const asked = [];
  const items = [{ id: 30, kind: 'file', name: 'plan.pdf' }, { id: 31, kind: 'folder', name: 'Q1' }];
  const resolver = nodeResolver({
    chain: [space, docs, here],
    items,
    list: async (place) => {
      asked.push(place.key);
      if (place.key === 'folder:99') throw new Error('denied');
      return listings[place.key] || [];
    },
  });
  assert.equal(resolver.local(parseHref('plan.pdf'))?.id, 30);
  assert.equal(resolver.local(parseHref('Q1/'))?.id, 31);
  assert.equal(resolver.local(parseHref('../plan.pdf')), null);
  assert.equal((await resolver.resolve(parseHref('plan.pdf')))?.id, 30);
  assert.deepEqual(asked, [], 'this folder is not asked for again');
  assert.equal((await resolver.resolve(parseHref('../../Images/logo.png')))?.id, 22);
  assert.equal((await resolver.resolve(parseHref('/Images/Old/a.png')))?.id, 24);
  assert.equal((await resolver.resolve(parseHref('../../Images/logo.png')))?.id, 22);
  assert.equal(asked.filter((key) => key === 'space:1').length, 1, 'listings are reused');
  assert.equal(await resolver.resolve(parseHref('../../../x.md')), null, 'nothing above the top');
  assert.equal(await resolver.resolve(parseHref('../../top.md/x')), null, 'a file is not a folder');
  assert.equal(await resolver.resolve(parseHref('missing.md')), null);
  assert.equal(await resolver.resolve(parseHref('https://example.com')), null);
  assert.deepEqual(await resolver.resolve(parseHref('..')), docs, 'a folder of the chain itself');
  const failing = nodeResolver({ chain: [{ key: 'folder:99', type: 'folder', id: 99 }, here], items: [], list: async () => { throw new Error('denied'); } });
  assert.equal(await failing.resolve(parseHref('../x.md')), null, 'a refused listing finds nothing');
});
