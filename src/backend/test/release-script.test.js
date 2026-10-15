import test from 'node:test';
import assert from 'node:assert/strict';
import { bump, classifyCommit, closeChangelog } from '../../../scripts/release.mjs';

test('release: commits are classified as major / minor / patch', () => {
  assert.equal(classifyCommit('feat!: drop the old API'), 'major');
  assert.equal(classifyCommit('fix: x', 'BREAKING CHANGE: tokens re-issued'), 'major');
  assert.equal(classifyCommit('feat(warehouse): bins'), 'minor');
  assert.equal(classifyCommit('Add the CRM module: deals, pipelines'), 'minor');
  assert.equal(classifyCommit('Warehouse module: items and documents'), 'minor');
  assert.equal(classifyCommit('fix(drive): cancel hangs'), 'patch');
  assert.equal(classifyCommit('docs: release notes'), 'patch');
  assert.equal(classifyCommit('Show the administrator the default robot'), 'patch');
});

test('release: semver bump', () => {
  assert.equal(bump('1.0.0', 'patch'), '1.0.1');
  assert.equal(bump('1.4.9', 'minor'), '1.5.0');
  assert.equal(bump('1.4.9', 'major'), '2.0.0');
});

test('release: CHANGELOG [Unreleased] becomes the released section', () => {
  const text = '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A thing\n\n## [0.0.1]\n\n- Initial\n\n[Unreleased]: https://github.com/o/r/compare/v0.0.1...HEAD\n[0.0.1]: https://github.com/o/r/releases/tag/v0.0.1\n';
  const out = closeChangelog(text, '1.0.0', '2026-10-15', [], 'https://github.com/o/r');
  assert.match(out, /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-15\n\n### Added\n\n- A thing\n\n## \[0\.0\.1\]/);
  assert.match(out, /\[Unreleased\]: https:\/\/github\.com\/o\/r\/compare\/v1\.0\.0\.\.\.HEAD/);
  assert.match(out, /\[1\.0\.0\]: https:\/\/github\.com\/o\/r\/releases\/tag\/v1\.0\.0/);
  // With an empty section the commit subjects become the notes.
  const empty = closeChangelog('## [Unreleased]\n\n## [1.0.0] - x\n', '1.0.1', '2026-10-16', [{ subject: 'fix: a' }], null);
  assert.match(empty, /## \[1\.0\.1\] - 2026-10-16\n\n- fix: a\n/);
});
