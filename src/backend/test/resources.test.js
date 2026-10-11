import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanIcon } from '../modules/resources/icons.js';
import { cleanUrl } from '../modules/resources/service.js';
import { resolveModules, sanitizeModules } from '../modules/catalog.js';

test('resource URLs: web, mail, phone or a portal path — never scripts', () => {
  assert.equal(cleanUrl('https://mail.google.com'), 'https://mail.google.com/');
  assert.equal(cleanUrl('mailto:it@corp.kg'), 'mailto:it@corp.kg');
  assert.equal(cleanUrl('tel:+996555000000'), 'tel:+996555000000');
  assert.equal(cleanUrl('/app/kb'), '/app/kb');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'ftp://x', 'not a url', 'JaVaScRiPt:alert(1)']) {
    assert.throws(() => cleanUrl(bad), { code: 'INVALID_URL' }, bad);
  }
});

test('library icons keep geometry only', () => {
  const icon = cleanIcon({
    type: 'glyph',
    color: '#ea4335',
    nodes: [
      ['path', { d: 'M2 4h20v16H2z', onclick: 'alert(1)', style: 'x' }],
      ['circle', { cx: '12', cy: '12', r: '3', fill: 'url(javascript:alert(1))' }],
    ],
  });
  assert.deepEqual(icon.nodes, [['path', { d: 'M2 4h20v16H2z' }], ['circle', { cx: '12', cy: '12', r: '3' }]]);
  assert.equal(icon.color, '#EA4335');
  assert.throws(() => cleanIcon({ type: 'glyph', nodes: [['script', {}]] }), { code: 'INVALID_ICON' });
  assert.throws(() => cleanIcon({ type: 'glyph', nodes: [['foreignObject', {}]] }), { code: 'INVALID_ICON' });
  assert.deepEqual(cleanIcon({ type: 'glyph', nodes: [['path', { d: 'M0 0"><script>' }]] }).nodes, [['path', {}]]);
});

test('uploaded icons must be our own files; letters are trimmed', () => {
  assert.throws(() => cleanIcon({ type: 'image', light: '../../etc/passwd' }), { code: 'INVALID_ICON' });
  const image = cleanIcon({ type: 'image', light: '0123456789abcdef01234567.png', dark: 'evil.svg', style: 'gradient' });
  assert.equal(image.dark, null);
  assert.equal(image.style, 'plain');
  assert.equal(cleanIcon({ type: 'letter', text: 'ABC', color: 'red' }).text, 'AB');
  assert.equal(cleanIcon({ type: 'letter', color: 'red' }).color, '#6366F1');
});

test('resources settings are sanitised', () => {
  const next = sanitizeModules(resolveModules(), { resources: { settings: { title: '<b>Links</b>', density: 'huge', personalize: 'no' } } }).resources.settings;
  assert.equal(next.title, 'bLinks/b');
  assert.equal(next.density, 'comfortable');
  assert.equal(next.personalize, true);
});

test('portal icons and module resources', () => {
  const icon = cleanIcon({ type: 'menu', name: 'building<script>', color: '#4f46e5' });
  assert.deepEqual([icon.type, icon.name, icon.color], ['menu', 'buildingscript', '#4F46E5']);
  assert.throws(() => cleanIcon({ type: 'menu', name: '' }), { code: 'INVALID_ICON' });
});
