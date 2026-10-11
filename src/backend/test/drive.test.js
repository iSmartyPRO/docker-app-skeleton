import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModules, sanitizeModules } from '../modules/catalog.js';
import { cleanName, cleanPath, joinPath, parentOf, relativeTo, within } from '../modules/drive/paths.js';
import { uncOf } from '../modules/drive/service.js';

test('drive paths stay inside the share', () => {
  assert.equal(cleanPath('Reports\\2026//Q1.xlsx'), 'Reports/2026/Q1.xlsx');
  assert.equal(cleanPath('/Отчёты/'), 'Отчёты');
  assert.equal(cleanPath(''), '');
  for (const bad of ['..', 'a/../b', './a', 'file.txt:secret', 'a/b*c', 'x\u0000y']) {
    assert.throws(() => cleanPath(bad), { code: 'INVALID_PATH' }, bad);
  }
});

test('drive names follow Windows rules', () => {
  assert.equal(cleanName(' План этажа.dwg '), 'План этажа.dwg');
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'what?', 'trailing.', 'pipe|name']) {
    assert.throws(() => cleanName(bad), { code: 'INVALID_NAME' }, bad);
  }
});

test('path helpers', () => {
  assert.equal(joinPath('Dept', '', 'a.txt'), 'Dept/a.txt');
  assert.equal(parentOf('a/b/c.txt'), 'a/b');
  assert.equal(parentOf('c.txt'), '');
  assert.equal(within('Finance', 'finance/Q1'), true);
  assert.equal(within('Finance', 'Finance2'), false);
  assert.equal(relativeTo('Dept/Acc', 'Dept/Acc/x.pdf'), 'x.pdf');
});

test('network paths for people (UNC or DFS)', () => {
  const server = { host: 'fs01.corp.local' };
  assert.equal(uncOf({ share: 'Finance', root_path: 'Dept/Acc' }, server, 'Q1/a.xlsx'), '\\\\fs01.corp.local\\Finance\\Dept\\Acc\\Q1\\a.xlsx');
  assert.equal(uncOf({ share: 'Finance', root_path: '', unc_display: '\\\\corp.local\\dfs\\Бухгалтерия\\' }, server, 'a.pdf'), '\\\\corp.local\\dfs\\Бухгалтерия\\a.pdf');
});

test('drive settings are sanitised', () => {
  const next = sanitizeModules(resolveModules(), {
    drive: { enabled: true, settings: { title: '  iSmarty <Drive>  ', linkAudience: 'world', maxUploadMb: 0, rememberLogin: 'no' } },
  }).drive;
  assert.equal(next.enabled, true);
  assert.equal(next.settings.title, 'iSmarty Drive');
  assert.equal(next.settings.linkAudience, 'any');
  assert.equal(next.settings.maxUploadMb, 1);
  assert.equal(next.settings.rememberLogin, true);
  assert.equal(resolveModules().drive.enabled, false, 'off until configured');
});
