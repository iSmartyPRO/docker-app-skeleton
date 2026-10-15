import '../test-fixtures/test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LINK_PERMISSIONS, normalizeLinkPermissions } from '../modules/shared/linkPermissions.js';
import { normalizePermissions as filesNormalize } from '../modules/files/links.js';
import { normalizePerms as driveNormalize } from '../modules/drive/linkPerms.js';
import { linkQuotaBytes } from '../modules/files/linkWrites.js';
import { resolveModules, sanitizeModules } from '../modules/catalog.js';
import { canonicalOrigin } from '../services/linkPreview/index.js';
import { MAX_WAITING, renderSlot } from '../services/linkPreview/card.js';
import { forgetPreviews, memoGet, memoSet } from '../services/linkPreview/memo.js';

/*
 * Pure parts of the public-link review fixes: one permission rule for Files,
 * Drive and the picker, the default upload limit per link, the canonical
 * host of preview cards, the bounded render queue and the preview memo.
 */

/** Every subset of the permission keys (and a few junk entries). */
function* subsets() {
  for (let mask = 0; mask < 1 << LINK_PERMISSIONS.length; mask += 1) {
    yield LINK_PERMISSIONS.filter((key, index) => mask & (1 << index));
  }
}

test('link permissions: Files, Drive and the frontend picker follow one rule', async () => {
  const web = await import('../../frontend/src/lib/linkPermissions.js');
  for (const list of subsets()) {
    for (const isFolder of [true, false]) {
      const expected = normalizeLinkPermissions(list, isFolder);
      assert.deepEqual(filesNormalize(list, isFolder), expected, `files ${list} ${isFolder}`);
      assert.deepEqual(driveNormalize(list, isFolder ? 'dir' : 'file'), expected, `drive ${list} ${isFolder}`);
      assert.deepEqual(web.normalizePermissions(list, isFolder), expected, `frontend ${list} ${isFolder}`);
    }
  }
  // The cases the rules used to disagree on: a drop box stays a drop box.
  assert.deepEqual(normalizeLinkPermissions(['upload', 'download']), ['upload']);
  assert.deepEqual(normalizeLinkPermissions(['download']), ['view']);
  assert.deepEqual(normalizeLinkPermissions(['view', 'download', 'bogus']), ['view', 'download']);
  assert.deepEqual(normalizeLinkPermissions(['upload', 'mkdir', 'replace'], false), ['view']);
  assert.deepEqual(normalizeLinkPermissions(null), ['view']);
  assert.deepEqual(web.PERMISSION_KEYS, LINK_PERMISSIONS);
});

test('files links: the module default limits links without a quota of their own', () => {
  const MB = 1024 * 1024;
  assert.equal(linkQuotaBytes({ quota_mb: 5 }, { linkQuotaMb: 2048 }), 5 * MB, 'the link’s own quota wins');
  assert.equal(linkQuotaBytes({ quota_mb: null }, { linkQuotaMb: 2048 }), 2048 * MB);
  assert.equal(linkQuotaBytes({ quota_mb: null }, { linkQuotaMb: 0 }), 0, '0 = unlimited');
  assert.equal(linkQuotaBytes({}, {}), 0);
  const current = resolveModules({});
  assert.equal(current.files.settings.linkQuotaMb, 2048, 'default 2 GB');
  assert.equal(sanitizeModules(current, { files: { settings: { linkQuotaMb: '512' } } }).files.settings.linkQuotaMb, 512);
  assert.equal(sanitizeModules(current, { files: { settings: { linkQuotaMb: -5 } } }).files.settings.linkQuotaMb, 0);
});

test('link previews: the card host is the configured address, never the Host header', () => {
  const saved = { PUBLIC_URL: process.env.PUBLIC_URL, FRONTEND_URL: process.env.FRONTEND_URL };
  try {
    process.env.PUBLIC_URL = 'https://portal.example.com/';
    process.env.FRONTEND_URL = 'http://localhost:8092';
    assert.equal(canonicalOrigin(), 'https://portal.example.com');
    delete process.env.PUBLIC_URL;
    assert.equal(canonicalOrigin(), '', 'a loopback default names nothing');
    process.env.FRONTEND_URL = 'http://10.0.0.5:8092';
    assert.equal(canonicalOrigin(), 'http://10.0.0.5:8092');
    process.env.FRONTEND_URL = 'not a url';
    assert.equal(canonicalOrigin(), '');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('link previews: the render queue is bounded', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const jobs = [];
  // Two run, MAX_WAITING wait; the next one is refused instead of queued.
  for (let i = 0; i < 2 + MAX_WAITING; i += 1) jobs.push(renderSlot(() => gate));
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(renderSlot(async () => 'never'), { code: 'RENDER_BUSY' });
  release('done');
  assert.deepEqual(new Set(await Promise.all(jobs)), new Set(['done']));
  assert.equal(await renderSlot(async () => 'after'), 'after', 'free again once the queue drains');
});

test('link previews: the memo is cleared by link changes', () => {
  memoSet('/l/abc|0', { state: 'ok', title: 'Old' });
  assert.equal(memoGet('/l/abc|0').value.title, 'Old');
  forgetPreviews();
  assert.equal(memoGet('/l/abc|0'), null);
});
