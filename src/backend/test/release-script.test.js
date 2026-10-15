import test from 'node:test';
import assert from 'node:assert/strict';
import { bump, classifyCommit, closeChangelog, pushPlan, remoteState } from '../../../scripts/release.mjs';

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

test('release: a push that failed earlier is retried (pushPlan)', () => {
  // Everything on origin: nothing to do.
  assert.deepEqual(pushPlan({ branch: 'main', ahead: 0, tag: 'v1.0.1', tagOnRemote: true }), []);
  // The release commit and tag never reached origin (e.g. the network failed).
  assert.deepEqual(pushPlan({ branch: 'main', ahead: 1, tag: 'v1.0.1', tagOnRemote: false }), [
    ['push', '--follow-tags', 'origin', 'main'],
    ['push', 'origin', 'refs/tags/v1.0.1'],
  ]);
  // The branch went up but the tag push failed.
  assert.deepEqual(pushPlan({ branch: 'main', ahead: 0, tag: 'v1.0.1', tagOnRemote: false }), [['push', 'origin', 'refs/tags/v1.0.1']]);
  // No upstream known: push the branch.
  assert.deepEqual(pushPlan({ branch: 'main', ahead: null, tag: null, tagOnRemote: true }), [['push', '--follow-tags', 'origin', 'main']]);
  // A detached HEAD is never pushed.
  assert.deepEqual(pushPlan({ branch: 'HEAD', ahead: 3, tag: 'v1.0.1', tagOnRemote: false }), []);
});

test('release: remoteState reads the branch, its lead and the remote tag', () => {
  const fake = (answers) => (...args) => {
    const key = args.join(' ');
    if (!(key in answers)) throw new Error(`unexpected git ${key}`);
    const value = answers[key];
    if (value instanceof Error) throw value;
    return value;
  };
  assert.deepEqual(
    remoteState('v1.0.1', fake({ 'rev-parse --abbrev-ref HEAD': 'main', 'rev-list --count @{u}..HEAD': '2', 'ls-remote --tags origin refs/tags/v1.0.1': '' })),
    { branch: 'main', ahead: 2, tag: 'v1.0.1', tagOnRemote: false }
  );
  assert.deepEqual(
    remoteState('v1.0.1', fake({ 'rev-parse --abbrev-ref HEAD': 'main', 'rev-list --count @{u}..HEAD': new Error('no upstream'), 'ls-remote --tags origin refs/tags/v1.0.1': 'abc\trefs/tags/v1.0.1' })),
    { branch: 'main', ahead: null, tag: 'v1.0.1', tagOnRemote: true }
  );
  assert.deepEqual(
    remoteState('v1.0.1', fake({ 'rev-parse --abbrev-ref HEAD': 'main', 'rev-list --count @{u}..HEAD': '0', 'ls-remote --tags origin refs/tags/v1.0.1': new Error('offline') })),
    { branch: 'main', ahead: 0, tag: 'v1.0.1', tagOnRemote: false },
    'origin unreachable: the tag counts as missing (the push then reports the problem)'
  );
});
