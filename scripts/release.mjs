#!/usr/bin/env node
/**
 * Release: classify what changed since the last tag, bump the version everywhere,
 * close the CHANGELOG section, commit, tag and push. GitHub then publishes the
 * release from the tag (.github/workflows/release.yml).
 *
 *   node scripts/release.mjs              classify automatically (see below)
 *   node scripts/release.mjs minor        force the bump: major | minor | patch
 *   node scripts/release.mjs 1.0.0        set an exact version
 *   node scripts/release.mjs --dry-run    show what would happen, change nothing
 *   node scripts/release.mjs --no-push    commit and tag locally only
 *   node scripts/release.mjs --push-only  only push what is not on origin yet (branch, release tags)
 *
 * Classification of each commit since the last `v*` tag (the highest wins):
 *   major  "BREAKING CHANGE" in the message, or a Conventional Commit with "!" (feat!: …)
 *   minor  feat: …, or a subject that adds something (Add …, New …, … module, Добав…, Новый…)
 *   patch  everything else: fix:, perf:, refactor:, docs:, chore:, style:, test:, plain fixes
 * Release commits themselves ("chore(release): …") are ignored. With no new commits
 * since the last tag nothing is released (exit code 0, message "Nothing to release").
 *
 * A push that failed earlier (network, credentials) is never lost: every run that
 * may push first checks origin — the branch ahead of its upstream, or the last
 * release tag missing there — and pushes what is missing (`make deploy` releases
 * with --no-push and calls --push-only once the new version is up and healthy).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noPush = args.includes('--no-push');
const pushOnly = args.includes('--push-only');
const explicit = args.find((arg) => !arg.startsWith('--'));

const git = (...params) => execFileSync('git', params, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const RANK = { patch: 1, minor: 2, major: 3 };

export function classifyCommit(subject, body = '') {
  const text = `${subject}\n${body}`;
  if (/BREAKING[ -]CHANGE/.test(text) || /^[a-z]+(\([^)]*\))?!:/i.test(subject)) return 'major';
  if (/^feat(\([^)]*\))?:/i.test(subject)) return 'minor';
  if (/^(fix|perf|refactor|docs|chore|style|test|build|ci|revert)(\([^)]*\))?:/i.test(subject)) return 'patch';
  if (/^(add|adds|added|new|introduce|implement)\b/i.test(subject) || /\bmodule\b/i.test(subject) || /^(добав|нов|внедр)/i.test(subject)) return 'minor';
  return 'patch';
}

export function bump(version, level) {
  const [, major, minor, patch] = version.match(SEMVER).map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Turns "## [Unreleased]" into the released section and opens a fresh one. */
export function closeChangelog(text, version, date, commits, repoUrl) {
  const head = '## [Unreleased]';
  const at = text.indexOf(head);
  if (at < 0) return text;
  const after = at + head.length;
  const nextSection = text.indexOf('\n## [', after);
  const body = text.slice(after, nextSection < 0 ? undefined : nextSection).trim();
  const notes = body || commits.map((c) => `- ${c.subject}`).join('\n');
  let out = `${text.slice(0, at)}${head}\n\n## [${version}] - ${date}\n\n${notes}\n${nextSection < 0 ? '' : text.slice(nextSection)}`;
  if (repoUrl) {
    out = out.replace(/^\[Unreleased\]: .*$/m, `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD`);
    if (!new RegExp(`^\\[${version.replace(/\./g, '\\.')}\\]: `, 'm').test(out)) {
      out = out.replace(/^(\[Unreleased\]: .*)$/m, `$1\n[${version}]: ${repoUrl}/releases/tag/v${version}`);
    }
  }
  return out;
}

function lastTag() {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*');
  } catch {
    return null;
  }
}

function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const raw = git('log', range, '--format=%H%x1f%s%x1f%b%x1e');
  return raw
    .split('\x1e')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [hash, subject, body] = row.split('\x1f');
      return { hash, subject: subject.trim(), body: (body || '').trim() };
    })
    .filter((c) => !/^chore\(release\):/i.test(c.subject));
}

function setJsonVersion(file, version) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  // Only the top-level "version" (the first one): lock files list dependency versions below it.
  const next = text.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
  if (file.endsWith('package-lock.json')) {
    // The root package entry ("packages": { "": { "version" … } }) carries it too.
    writeFileSync(file, next.replace(/("packages":\s*{\s*"":\s*{[^}]*?"version":\s*")[^"]*(")/, `$1${version}$2`));
  } else {
    writeFileSync(file, next);
  }
}

function repoUrl() {
  try {
    const url = git('remote', 'get-url', 'origin');
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
    return m ? `https://github.com/${m[1]}` : null;
  } catch {
    return null;
  }
}

/**
 * The git pushes that bring origin up to date (pure, unit-tested):
 *   ahead       commits on the branch that origin does not have (null: unknown,
 *               e.g. no upstream yet — then the branch is pushed)
 *   tag         the last release tag (or null)
 *   tagOnRemote whether origin has that tag
 * Annotated release tags on the pushed commits go along (--follow-tags); the
 * last tag is also pushed by name when the branch itself is up to date.
 */
export function pushPlan({ branch, ahead, tag, tagOnRemote }) {
  const plan = [];
  if (!branch || branch === 'HEAD') return plan;
  if (ahead === null || ahead === undefined || ahead > 0) plan.push(['push', '--follow-tags', 'origin', branch]);
  if (tag && !tagOnRemote) plan.push(['push', 'origin', `refs/tags/${tag}`]);
  return plan;
}

/** What origin is missing: { branch, ahead, tag, tagOnRemote } (network: git ls-remote). */
export function remoteState(tag, run = git) {
  const branch = run('rev-parse', '--abbrev-ref', 'HEAD');
  let ahead = null;
  try {
    ahead = Number(run('rev-list', '--count', '@{u}..HEAD'));
  } catch {
    ahead = null; // no upstream: push the branch (it sets nothing up, origin just gets it)
  }
  let tagOnRemote = true;
  if (tag) {
    try {
      tagOnRemote = Boolean(run('ls-remote', '--tags', 'origin', `refs/tags/${tag}`));
    } catch {
      tagOnRemote = false;
    }
  }
  return { branch, ahead: Number.isFinite(ahead) ? ahead : null, tag, tagOnRemote };
}

/** Pushes whatever origin is missing; returns the number of pushes made. */
function pushPending(tag) {
  const state = remoteState(tag);
  const plan = pushPlan(state);
  for (const step of plan) git(...step);
  if (plan.length) console.log(`Pushed to origin: ${state.branch}${state.tag && !state.tagOnRemote ? ` and ${state.tag}` : ''}.`);
  return plan.length;
}

function main() {
  if (pushOnly) {
    const pushed = pushPending(lastTag());
    if (!pushed) console.log('Origin is up to date.');
    return;
  }
  if (!dryRun && git('status', '--porcelain', '--untracked-files=no')) {
    console.error('The working tree has uncommitted changes: commit them first.');
    process.exit(1);
  }
  const current = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  if (!SEMVER.test(current)) throw new Error(`VERSION is not semver: ${current}`);
  const tag = lastTag();
  const commits = commitsSince(tag);
  if (tag && !commits.length && !explicit) {
    console.log(`Nothing to release: no changes since ${tag}.`);
    // A release whose push failed earlier is pushed now (not with --no-push or --dry-run).
    if (!noPush && !dryRun) pushPending(tag);
    else if (dryRun) {
      const plan = pushPlan(remoteState(tag));
      if (plan.length) console.log(`Not on origin yet: ${plan.map((step) => step.at(-1)).join(', ')}`);
    }
    return;
  }

  let level = null;
  let version;
  if (explicit && SEMVER.test(explicit)) version = explicit;
  else if (explicit && RANK[explicit]) level = explicit;
  else if (explicit) throw new Error(`Unknown argument: ${explicit}`);
  if (!version) {
    level ||= commits.map((c) => classifyCommit(c.subject, c.body)).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'patch');
    // The first tag of a project that already carries a version releases that version.
    version = tag ? bump(current, level) : current;
  }

  const date = new Date().toISOString().slice(0, 10);
  console.log(`Last tag: ${tag || '—'} · commits: ${commits.length} · bump: ${level || 'explicit'} · ${current} → ${version}`);
  for (const c of commits.slice(0, 50)) console.log(`  [${classifyCommit(c.subject, c.body)}] ${c.subject}`);
  if (dryRun) return;

  writeFileSync(join(root, 'VERSION'), `${version}\n`);
  for (const dir of ['src/frontend', 'src/backend']) {
    setJsonVersion(join(root, dir, 'package.json'), version);
    setJsonVersion(join(root, dir, 'package-lock.json'), version);
  }
  const changelog = join(root, 'CHANGELOG.md');
  if (existsSync(changelog)) writeFileSync(changelog, closeChangelog(readFileSync(changelog, 'utf8'), version, date, commits, repoUrl()));

  git('add', 'VERSION', 'CHANGELOG.md', 'src/frontend/package.json', 'src/frontend/package-lock.json', 'src/backend/package.json', 'src/backend/package-lock.json');
  git('commit', '-m', `chore(release): v${version}`);
  git('tag', '-a', `v${version}`, '-m', `v${version}`);
  console.log(`Released v${version}.`);
  if (!noPush) pushPending(`v${version}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
