import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import express from 'express';
import { ACE_FLAGS, _setDeps as setEngineDeps, listJobs as listEngineJobs, waitForJob } from '../modules/drive/acl.js';
import { DRIVE_ACCESS_DEFAULTS } from '../modules/catalog.js';
import { describeGroup, buildPairs as buildFolders } from '../modules/drive/access/naming.js';
import { _setNtfsDeps, _waitForReport, cancelReport, isDomainRoot, startReport } from '../modules/drive/access/ntfs.js';
import {
  applyFix,
  checkGroupAces,
  cleanChange,
  computeMismatches,
  confirmMatches,
  diffAces,
  folderDisplay,
  folderTargetKey,
  ntfsUndoRefusal,
  withoutBlob,
} from '../modules/drive/access/ntfsLogic.js';
import { completeChange, recordNtfsAttach, recordPropagation } from '../modules/drive/access/ntfsJournal.js';
import * as model from '../../frontend/src/modules/drive/access/ntfsModel.js';
import { kindOf } from '../modules/drive/access/journal.js';
import { sidToBuffer } from '../modules/drive/access/ntfsDirectory.js';
import { sidToString } from '../modules/drive/access/naming.js';
import { accessRoutes } from '../modules/drive/access/routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

const { OI, CI, NP, IO, INHERITED } = ACE_FLAGS;
const SYSTEM = 'S-1-5-18';
const ADMINS = 'S-1-5-32-544';
const DOM = 'S-1-5-21-1111-2222-3333';
const HR_FULL = `${DOM}-4001`;
const HR_READ = `${DOM}-4002`;
const ME = `${DOM}-1500`;
const IT = `${DOM}-1600`;
const ALICE = `${DOM}-1105`;
const GHOST = `${DOM}-9999`;
const MODIFY = 0x1301bf;
const RX = 0x1200a9;
const FULL = 0x1f01ff;

const allow = (sid, mask, flags = OI | CI) => ({ type: 'allow', sid, mask, flags, inherited: Boolean(flags & INHERITED) });
const deny = (sid, mask, flags = OI | CI) => ({ type: 'deny', sid, mask, flags, inherited: false });
const SETTINGS = { ...DRIVE_ACCESS_DEFAULTS, defaultProject: 'co', shareMap: [{ shareId: 1, prefix: 'W:' }] };
const SERVER = { id: 1, name: 'DC', host: '10.0.0.10', port: 445, auth: 'user', use_login: true };

// ── pure ─────────────────────────────────────────────────────────────────────

test('a draft is cleaned: no inherited entries, valid SIDs and masks', () => {
  const change = cleanChange({ revision: 'r1', aces: [allow(HR_FULL, MODIFY)], protected: 1, inherit: 'weird' });
  assert.deepEqual(change, { revision: 'r1', aces: [{ type: 'allow', sid: HR_FULL, mask: MODIFY, flags: OI | CI }], protected: true, inherit: 'auto' });
  assert.throws(() => cleanChange({ aces: [allow(SYSTEM, FULL, OI | CI | INHERITED)] }), { code: 'BAD_ACL' });
  assert.throws(() => cleanChange({ aces: [allow('S-1-x', FULL)] }), { code: 'BAD_SID' });
  assert.throws(() => cleanChange({ aces: [allow(HR_FULL, 0)] }), { code: 'BAD_ACL' });
  assert.throws(() => cleanChange({ aces: 'x' }), { code: 'BAD_ACL' });
});

test('folder names, display paths, the self-removal confirmation', () => {
  assert.equal(folderDisplay({ letter: 'W', path: '06-HR/Archive' }), 'W:\\06-HR\\Archive');
  assert.equal(folderDisplay({ letter: 'W', path: '' }), 'W:');
  assert.equal(folderDisplay({ prefix: 'G:\\ОБЪЕКТ-2\\_DocArch\\', path: '3-QA,QC/СТЯЖКА' }), 'G:\\ОБЪЕКТ-2\\_DocArch\\3-QA,QC\\СТЯЖКА');
  assert.equal(folderDisplay({ prefix: 'W:', path: '' }), 'W:');
  assert.equal(folderDisplay({ host: 'fs', share: 'shared', rootPath: 'CO', path: 'HR' }), '\\\\fs\\shared\\CO\\HR');
  assert.ok(confirmMatches({ path: '06-HR/Archive' }, ' archive '));
  assert.ok(!confirmMatches({ path: '06-HR/Archive' }, '06-HR'));
  assert.ok(confirmMatches({ path: '', title: 'ЦО' }, 'цо'));
  assert.ok(!confirmMatches({ path: '' }, ''));
});

test('a change in words: added, removed, inheritance', () => {
  const before = { protected: false, aces: [allow(HR_FULL, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED)] };
  const after = { protected: true, aces: [allow(HR_READ, RX), allow(SYSTEM, FULL)] };
  const diff = diffAces(before, after, { [HR_READ]: 'sg_co_hr_read' });
  assert.deepEqual(diff.added.map((a) => [a.sid, a.preset, a.name]), [[HR_READ, 'readExecute', 'sg_co_hr_read'], [SYSTEM, 'full', 'SYSTEM']]);
  assert.deepEqual(diff.removed.map((a) => a.sid), [HR_FULL]);
  assert.equal(diff.protectedAfter, true);
  assert.equal(diff.changed, true);
  assert.equal(diffAces(before, before).changed, false);
});

test('ntfs journal rows: kind, undo rules, no blob in lists', () => {
  assert.equal(kindOf('ntfs_set'), 'ntfs');
  assert.equal(kindOf('ntfs_propagate'), 'ntfs');
  const row = { action: 'ntfs_set', ok: true, outcome: 'changed', undone_by: null, before: { folder: { serverId: 1 }, sd: 'AAA=' } };
  assert.equal(ntfsUndoRefusal('superadmin', row), null);
  assert.equal(ntfsUndoRefusal('sysadmin', row), 'FORBIDDEN');
  assert.equal(ntfsUndoRefusal('superadmin', { ...row, undone_by: 9 }), 'FA_UNDO_DONE');
  assert.equal(ntfsUndoRefusal('superadmin', { ...row, ok: false }), 'FA_UNDO_NOTHING');
  assert.equal(ntfsUndoRefusal('superadmin', { ...row, action: 'ntfs_propagate' }), 'FA_UNDO_UNSUPPORTED');
  assert.equal(ntfsUndoRefusal('superadmin', { ...row, before: { folder: {} } }), 'FA_UNDO_UNSUPPORTED');
  assert.equal(ntfsUndoRefusal('superadmin', null), 'NOT_FOUND');
  assert.deepEqual(withoutBlob({ sd: 'AAA=', sddl: 'D:' }), { sddl: 'D:', hasSd: true });
});

test('SIDs to binary and back', () => {
  for (const sid of [HR_FULL, SYSTEM, ADMINS, 'S-1-1-0']) assert.equal(sidToString(sidToBuffer(sid)), sid);
  assert.equal(sidToBuffer('nope'), null);
});

// ── mismatch report (pure) ───────────────────────────────────────────────────

function group(name, description, sid) {
  return { ...describeGroup({ dn: `CN=${name},OU=Groups`, name, description, sid, members: [] }, SETTINGS), members: [] };
}

test('group entries vs the configured type mapping', () => {
  assert.equal(checkGroupAces([allow(HR_FULL, MODIFY)], HR_FULL, 'modify'), null);
  assert.equal(checkGroupAces([allow(HR_FULL, FULL)], HR_FULL, 'modify').issue, 'rights_too_high');
  assert.equal(checkGroupAces([allow(HR_READ, MODIFY)], HR_READ, 'readExecute').issue, 'rights_too_high');
  assert.equal(checkGroupAces([allow(HR_READ, RX, CI)], HR_READ, 'readExecute').issue, 'rights_too_low');
  assert.equal(checkGroupAces([allow(HR_READ, RX, OI | CI | INHERITED)], HR_READ, 'readExecute'), null);
  assert.equal(checkGroupAces([], HR_READ, 'readExecute').issue, 'missing_ace');
  assert.equal(checkGroupAces([allow(HR_READ, RX), deny(HR_READ, 0x116)], HR_READ, 'readExecute').issue, 'deny_ace');
  // Folder itself + an inherit-only entry for the children: still a match.
  assert.equal(checkGroupAces([allow(HR_FULL, MODIFY, 0), allow(HR_FULL, MODIFY, OI | CI | IO)], HR_FULL, 'modify'), null);
});

test('the mismatch report: missing, wrong rights, not found, users and unknown SIDs; fixes are drafts', () => {
  const groups = [
    group('sg_co_hr_full', 'W:\\06-HR;Full Access', HR_FULL),
    group('sg_co_hr_read', 'W:\\06-HR;Read Only', HR_READ),
    group('sg_co_fin_full', 'W:\\07-FIN;Full Access', `${DOM}-5001`),
    group('sg_co_fin_read', 'W:\\07-FIN;Read Only', `${DOM}-5002`),
    group('sg_co_gone_full', 'W:\\99-GONE;Full Access', `${DOM}-6001`),
    group('sg_co_gone_read', 'W:\\99-GONE;Read Only', `${DOM}-6002`),
    group('sg_co_x_full', 'X:\\Other;Full Access', `${DOM}-7001`),
  ];
  const folders = buildFolders(groups);
  const results = new Map([
    [folderTargetKey(1, '06-HR'), { acl: { aces: [allow(HR_FULL, FULL), allow(ALICE, MODIFY), allow(GHOST, RX), allow(SYSTEM, FULL, OI | CI | INHERITED)] } }],
    [folderTargetKey(1, '07-FIN'), { acl: { aces: [allow(`${DOM}-5001`, MODIFY), allow(`${DOM}-5002`, RX)] } }],
    [folderTargetKey(1, '99-GONE'), { error: { code: 'NOT_FOUND' } }],
  ]);
  const sidInfo = new Map([
    [ALICE, { name: 'Alice', kind: 'user', login: 'alice' }],
    [HR_FULL, { name: 'sg_co_hr_full', kind: 'group' }],
  ]);
  const rows = computeMismatches({ folders, results, sidInfo, typeMap: SETTINGS.typeMap });
  const brief = rows.map((row) => [row.folder.display, row.issue, row.group?.name || row.subject?.sid]);
  assert.deepEqual(brief, [
    ['W:\\06-HR', 'missing_ace', 'sg_co_hr_read'],
    ['W:\\06-HR', 'rights_too_high', 'sg_co_hr_full'],
    ['W:\\06-HR', 'user_ace', ALICE],
    ['W:\\06-HR', 'unknown_sid', GHOST],
    ['W:\\99-GONE', 'folder_not_found', undefined],
    ['X:\\Other', 'path_unmapped', undefined],
  ]);
  const high = rows.find((row) => row.issue === 'rights_too_high');
  assert.equal(high.actual, 'full');
  assert.equal(high.expected, 'modify');
  assert.deepEqual(high.fix, { op: 'set', sid: HR_FULL, preset: 'modify', name: 'sg_co_hr_full' });
  assert.deepEqual(rows[0].fix, { op: 'add', sid: HR_READ, preset: 'readExecute', appliesTo: 'thisSubfoldersFiles', name: 'sg_co_hr_read' });
  assert.equal(rows.find((row) => row.issue === 'user_ace').fix.op, 'remove');
  assert.equal(rows.find((row) => row.issue === 'folder_not_found').fix, undefined);

  // The fixes as the editor applies them.
  const explicit = results.get(folderTargetKey(1, '06-HR')).acl.aces;
  assert.deepEqual(applyFix(explicit, high.fix).find((ace) => ace.sid === HR_FULL), { type: 'allow', sid: HR_FULL, mask: MODIFY, flags: OI | CI });
  assert.equal(applyFix(explicit, rows[0].fix).at(-1).sid, HR_READ);
  assert.equal(applyFix(explicit, { op: 'remove', sid: ALICE }).some((ace) => ace.sid === ALICE), false);
  assert.equal(applyFix(explicit, { op: 'remove', sid: ALICE }).some((ace) => ace.flags & INHERITED), false);
});

test('read groups with Full Control are reported with the type mapping from the settings', () => {
  const folders = buildFolders([group('sg_co_hr_full', 'W:\\06-HR;Full Access', HR_FULL), group('sg_co_hr_read', 'W:\\06-HR;Read Only', HR_READ)]);
  const results = new Map([[folderTargetKey(1, '06-HR'), { acl: { aces: [allow(HR_FULL, FULL), allow(HR_READ, RX)] } }]]);
  assert.equal(computeMismatches({ folders, results, typeMap: { full: 'full_control', read: 'read_execute' } }).length, 0);
  assert.equal(computeMismatches({ folders, results, typeMap: { full: 'modify', read: 'read' } }).length, 2);
});

// ── journal helpers ──────────────────────────────────────────────────────────

test('the NTFS hook result of a new group pair is journalled with the undo blob', async () => {
  const rows = [];
  const record = async (actor, entry) => rows.push({ actor, ...entry });
  const ntfs = { status: 'applied', changed: true, sddlBefore: 'D:AI(old)', sdBefore: 'T0xE', revisionBefore: 'r1', sddlAfter: 'D:AI(new)', revisionAfter: 'r2', jobId: 'j1', server: { id: 1, share: 'shared', path: '06-HR' } };
  await recordNtfsAttach({ userId: 1 }, { batch: 'b', folder: { shareId: 1, path: '06-HR', display: 'W:\\06-HR' }, ntfs, groups: [{ name: 'sg_co_hr_full' }] }, record);
  assert.equal(rows[0].action, 'ntfs_attach');
  assert.equal(rows[0].via, 'hook');
  assert.equal(rows[0].group.name, 'W:\\06-HR');
  assert.deepEqual(rows[0].before, { folder: { shareId: 1, path: '06-HR', display: 'W:\\06-HR', serverId: 1, share: 'shared', serverPath: '06-HR' }, sddl: 'D:AI(old)', sd: 'T0xE', revision: 'r1' });
  assert.equal(rows[0].after.revision, 'r2');
  assert.equal(ntfsUndoRefusal('superadmin', { ...rows[0], ok: true, outcome: 'changed' }), null);
  await recordNtfsAttach({}, { folder: {}, ntfs: { status: 'failed', code: 'ACCESS_DENIED', message: 'no' } }, record);
  assert.equal(rows[1].ok, false);
  assert.equal(rows[1].errorCode, 'ACCESS_DENIED');
  assert.equal(await recordNtfsAttach({}, { folder: {}, ntfs: { status: 'pending' } }, record), null);
  await recordPropagation({}, { display: 'W:\\06-HR' }, { id: 'j', state: 'done', mode: 'inherit', progress: { changed: 3, failed: 1 }, failedList: [{ path: 'a' }] }, {}, record);
  assert.deepEqual([rows[2].action, rows[2].outcome, rows[2].errorCode, rows[2].after.failedCount], ['ntfs_propagate', 'changed', 'PARTIAL', 1]);
});

// ── service with a fake file server ──────────────────────────────────────────

/** A folder on a fake file server: acl_get / acl_set / acl_restore with revisions and saved descriptors. */
function fakeServer(initial, { holdJobs = false } = {}) {
  let n = 1;
  let release = null;
  const held = holdJobs ? new Promise((resolve) => (release = resolve)) : null;
  const jobs = [];
  const history = new Map();
  const state = { owner: ADMINS, protected: false, ...initial };
  const snapshot = () => ({ path: '06-HR', isDir: true, owner: state.owner, protected: state.protected, aces: state.aces.map((ace) => ({ ...ace })), sddl: `D:${n}`, sd: `SD${n}`, revision: `r${n}` });
  history.set(`SD${n}`, snapshot());
  const writes = [];
  const restoreEngine = setEngineDeps({
    loadServer: async () => SERVER,
    gateRequest: async (op, _params, options = {}) => {
      const body = options.body ? JSON.parse(options.body.toString('utf8')) : null;
      const current = snapshot();
      const fail = (code, statusCode) => Object.assign(new Error(code), { code, statusCode });
      let out;
      if (op === 'acl_get') out = current;
      else if (op === 'acl_propagate') {
        jobs.push({ params: _params, body });
        return Readable.from(
          (async function* lines() {
            if (held) await held;
            yield Buffer.from(`${JSON.stringify({ type: 'result', done: 3, changed: 2 })}\n`);
          })()
        );
      } else if (op === 'acl_set' || op === 'acl_restore') {
        let next;
        if (op === 'acl_set') {
          const inherited = body.protected ? [] : current.aces.filter((ace) => ace.flags & INHERITED);
          next = { ...current, protected: body.protected, aces: [...body.aces.map((ace) => ({ ...ace, inherited: false })), ...inherited] };
        } else {
          next = { ...history.get(body.sd) };
        }
        if (!body.dryRun && body.revision && body.revision !== current.revision) throw fail('STALE', 409);
        if (body.dryRun) out = { dryRun: true, previous: { sd: current.sd, sddl: current.sddl, revision: current.revision }, before: current, acl: { ...next, revision: null } };
        else {
          // What the journal holds at the moment of the write (the undo copy must be there first).
          writes.push({ op, body, journalled: journal.map((row) => ({ ...row })) });
          n += 1;
          state.aces = next.aces;
          state.protected = next.protected;
          const saved = snapshot();
          history.set(saved.sd, saved);
          out = { previous: { sd: current.sd, sddl: current.sddl, revision: current.revision }, acl: saved };
        }
      } else throw new Error(`unexpected ${op}`);
      return Readable.from([Buffer.from(JSON.stringify(out))]);
    },
  });
  const journal = [];
  const parked = [];
  const restoreNtfs = _setNtfsDeps({
    acl: { resolveDriveFolder: async (shareId, path) => ({ server: SERVER, share: 'shared', path }) },
    loadShares: async () => [{ id: 1, title: 'ЦО', share: 'shared', root_path: '', server_id: 1, path_prefixes: ['W:'], server_name: 'DC', host: SERVER.host }],
    accessSettings: async () => SETTINGS,
    adConfig: async () => ({ host: 'dc', baseDn: 'OU=Accounts,DC=example,DC=com' }),
    loadGroups: async () => [group('sg_co_hr_full', 'W:\\06-HR;Full Access', HR_FULL), group('sg_co_hr_read', 'W:\\06-HR;Read Only', HR_READ)],
    lookupSids: async (_cfg, _base, sids) => new Map(sids.filter((sid) => sid === ALICE).map((sid) => [sid, { sid, name: 'Alice', kind: 'user' }])),
    actorSidsOf: async () => [ME, IT],
    actorCredential: async () => ({ dn: 'CN=Me,OU=IT', password: 'pw', login: 'me', row: { id: 3 } }),
    // As credentials.parkCredential: a "sign in as" session never parks.
    parkCredential: async (credential, reason, { impersonating = false } = {}) => !impersonating && parked.push([credential.row.id, reason]),
    directoryDomain: async () => 'example.com',
    recordChange: async (actor, entry) => {
      if (fake.journalDown) throw new Error('database down');
      const id = journal.length + 1;
      journal.push({ id, actor, ...entry, action: entry.action, ok: entry.ok !== false, outcome: entry.outcome, before: entry.before, after: entry.after, undone_by: null, undo_of: entry.undoOf || null });
      if (entry.undoOf && entry.ok !== false) journal[entry.undoOf - 1].undone_by = id;
      return id;
    },
    completeChange: async (id, patch) => {
      if (fake.completeDown) throw new Error('database down');
      const row = journal[id - 1];
      if (!patch) {
        row.deleted = true;
        return;
      }
      Object.assign(row, { after: patch.after, ok: patch.ok !== false, outcome: patch.outcome, errorCode: patch.errorCode || null, error: patch.error || null, undo_of: patch.undoOf || null });
      if (patch.undoOf && patch.ok !== false) journal[patch.undoOf - 1].undone_by = id;
    },
    journalEntry: async (id) => journal[id - 1] || null,
    securityEvent: () => {},
  });
  const fake = {
    state,
    writes,
    journal,
    parked,
    jobs,
    journalDown: false,
    completeDown: false,
    release: () => release?.(),
    async restore() {
      release?.();
      for (const job of listEngineJobs({ running: true })) await waitForJob(job.id);
      restoreEngine();
      restoreNtfs();
    },
  };
  return fake;
}

const SUPER = { role: 'superadmin', canWrite: true, readOnly: null };
const req = (id = 7) => ({ user: { id, username: 'me', displayName: 'Me' }, ip: '10.0.0.1', get: () => 'test' });

test('draft → preview → apply → undo, journalled with the previous descriptor', async () => {
  const { aclView, previewChange, applyChange, undoNtfs } = await import('../modules/drive/access/ntfs.js');
  const fs = fakeServer({ aces: [allow(HR_FULL, FULL), allow(ALICE, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED), allow(ADMINS, FULL, OI | CI | INHERITED)] });
  try {
    const view = await aclView(req(), SUPER, { shareId: 1, path: '06-HR', sources: false });
    assert.equal(view.folder.display, 'W:\\06-HR');
    assert.equal(view.acl.sd, undefined, 'no raw descriptor to the browser');
    assert.equal(view.acl.aces[0].subject.group.folderKey, 'p:w:\\06-hr');
    assert.equal(view.acl.aces[1].subject.name, 'Alice');
    assert.deepEqual(view.groups.map((g) => [g.name, g.expected, g.present]), [['sg_co_hr_full', 'modify', true], ['sg_co_hr_read', 'readExecute', false]]);

    // Fix: _full gets Modify, _read is added, Alice's direct entry goes.
    const draft = [allow(HR_FULL, MODIFY), allow(HR_READ, RX)];
    const preview = await previewChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: draft });
    assert.equal(fs.writes.length, 0, 'a preview writes nothing');
    assert.deepEqual(preview.summary.removed.map((a) => a.sid).sort(), [ALICE, HR_FULL].sort());
    assert.deepEqual(preview.guards.loss.map((l) => l.name).sort(), ['Alice', 'sg_co_hr_full'].sort());
    assert.equal(preview.selfRemoval, false);

    await assert.rejects(applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: 'r0', aces: draft }), { code: 'STALE' });
    await assert.rejects(applyChange(req(), SUPER, { shareId: 1, path: '06-HR', aces: draft }), { code: 'REVISION_REQUIRED' });
    const applied = await applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: draft });
    assert.equal(fs.writes.length, 1);
    assert.equal(fs.journal.length, 1);
    const row = fs.journal[0];
    assert.deepEqual([row.action, row.outcome, row.group.name, row.actor.adAccount], ['ntfs_set', 'changed', 'W:\\06-HR', 'me']);
    assert.deepEqual([row.before.sd, row.before.sddl, row.before.revision, row.after.revision], ['SD1', 'D:1', 'r1', 'r2']);
    assert.deepEqual(row.before.folder, { shareId: 1, path: '06-HR', display: 'W:\\06-HR', serverId: 1, share: 'shared', serverPath: '06-HR' });
    assert.equal(applied.journalId, 1);

    // Undo while nothing changed since: the old descriptor is written back.
    const undone = await undoNtfs(req(), SUPER, 1);
    assert.equal(fs.writes.at(-1).op, 'acl_restore');
    assert.equal(fs.writes.at(-1).body.sd, 'SD1');
    assert.equal(fs.writes.at(-1).body.revision, 'r2');
    assert.ok(fs.state.aces.some((ace) => ace.sid === ALICE));
    assert.equal(fs.journal[0].undone_by, 2);
    assert.equal(fs.journal[1].action, 'ntfs_restore');
    assert.equal(fs.journal[1].undo_of, 1);
    assert.equal(undone.journalId, 2);
    await assert.rejects(undoNtfs(req(), SUPER, 1), { code: 'FA_UNDO_DONE' });
  } finally {
    await fs.restore();
  }
});

test('undo after a later change: STALE with the difference, then forced', async () => {
  const { applyChange, undoNtfs, aclView } = await import('../modules/drive/access/ntfs.js');
  const fs = fakeServer({ aces: [allow(HR_FULL, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED), allow(ADMINS, FULL, OI | CI | INHERITED)] });
  try {
    let view = await aclView(req(), SUPER, { shareId: 1, path: '06-HR', sources: false });
    await applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX)] });
    view = await aclView(req(), SUPER, { shareId: 1, path: '06-HR', sources: false });
    await applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX), allow(ALICE, RX)] });
    const writes = fs.writes.length;
    let shown = null;
    await assert.rejects(undoNtfs(req(), SUPER, 1), (err) => {
      assert.equal(err.code, 'STALE');
      assert.deepEqual(err.details.summary.removed.map((a) => a.sid).sort(), [ALICE, HR_READ].sort());
      shown = err.details.revision;
      return true;
    });
    assert.equal(shown, 'r3');
    assert.equal(fs.writes.length, writes, 'nothing written on STALE');
    // Forced: only with the revision the difference was made on, and refused again when it moved on.
    await assert.rejects(undoNtfs(req(), SUPER, 1, { force: true }), { code: 'REVISION_REQUIRED' });
    await assert.rejects(undoNtfs(req(), SUPER, 1, { force: true, revision: 'r2' }), (err) => err.code === 'STALE' && err.details.revision === 'r3');
    assert.equal(fs.writes.length, writes);
    await undoNtfs(req(), SUPER, 1, { force: true, revision: shown, propagate: false });
    assert.equal(fs.writes.at(-1).body.revision, 'r3');
    assert.deepEqual(fs.state.aces.filter((ace) => !ace.inherited).map((ace) => ace.sid), [HR_FULL]);
  } finally {
    await fs.restore();
  }
});

test('guards: SYSTEM / Administrators refused, own access needs the folder name', async () => {
  const { applyChange, aclView } = await import('../modules/drive/access/ntfs.js');
  const fs = fakeServer({ aces: [allow(IT, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED), allow(ADMINS, FULL, OI | CI | INHERITED)] });
  try {
    const view = await aclView(req(), SUPER, { shareId: 1, path: '06-HR', sources: false });
    await assert.rejects(applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: [allow(IT, MODIFY)], protected: true }), { code: 'PROTECTED_PRINCIPAL' });
    await assert.rejects(applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: [] }), { code: 'CONFIRM_SELF_REMOVAL' });
    await assert.rejects(applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: [], confirmName: 'wrong' }), { code: 'CONFIRM_SELF_REMOVAL' });
    assert.equal(fs.writes.length, 0);
    assert.equal(fs.journal.length, 0, 'refusals are not journalled');
    await applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: [], confirmName: '06-hr' });
    assert.equal(fs.writes.length, 1);
  } finally {
    await fs.restore();
  }
});

test('a rejected password is parked and asked for again; denied writes are journalled', async () => {
  const { aclView, applyChange } = await import('../modules/drive/access/ntfs.js');
  const fs = fakeServer({ aces: [allow(HR_FULL, MODIFY)] });
  const restore = setEngineDeps({
    gateRequest: async (op) => {
      if (op === 'acl_get') throw Object.assign(new Error('x'), { code: 'ACCOUNT_LOCKED', statusCode: 401 });
      throw new Error('no');
    },
  });
  try {
    await assert.rejects(aclView(req(), SUPER, { shareId: 1, path: '06-HR' }), (err) => err.code === 'FA_CREDENTIALS_FAILED' && err.details.reason === 'ACCOUNT_LOCKED');
    assert.deepEqual(fs.parked, [[3, 'ACCOUNT_LOCKED']]);
  } finally {
    restore();
  }
  const restore2 = setEngineDeps({
    gateRequest: async (op, _p, options = {}) => {
      const body = options.body ? JSON.parse(options.body.toString('utf8')) : null;
      const current = { owner: ADMINS, protected: false, aces: [allow(HR_FULL, MODIFY)], sddl: 'D:', sd: 'SD', revision: 'r1' };
      if (op === 'acl_get') return Readable.from([Buffer.from(JSON.stringify(current))]);
      if (body.dryRun) return Readable.from([Buffer.from(JSON.stringify({ dryRun: true, previous: {}, before: current, acl: { ...current, aces: body.aces } }))]);
      throw Object.assign(new Error('denied'), { code: 'ACCESS_DENIED', statusCode: 403 });
    },
  });
  try {
    await assert.rejects(applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: 'r1', aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX)] }), { code: 'ACCESS_DENIED' });
    assert.deepEqual([fs.journal[0].action, fs.journal[0].ok, fs.journal[0].errorCode], ['ntfs_set', false, 'ACCESS_DENIED']);
  } finally {
    restore2();
    await fs.restore();
  }
});

test('the mismatch report job reads every group folder with the admin account', async () => {
  const fs = fakeServer({ aces: [allow(HR_FULL, FULL), allow(ALICE, MODIFY)] });
  try {
    const started = await startReport(req(), SUPER);
    assert.equal(started.progress.total, 1);
    const done = await _waitForReport(started.id);
    assert.equal(done.state, 'done');
    assert.deepEqual(done.rows.map((row) => row.issue), ['missing_ace', 'rights_too_high', 'user_ace']);
    await assert.rejects(startReport(req(), { role: 'sysadmin', canWrite: true }), { code: 'FA_SUPERADMIN_ONLY' });
  } finally {
    await fs.restore();
  }
});

// ── routes: who may call them ────────────────────────────────────────────────

async function withApp(who, fn, { enabled = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 7, username: 'me', displayName: 'Me' };
    req.access = { permissions: who.permissions };
    if (who.token) req.apiToken = { id: 1 };
    if (who.imp) req.auth = { imp: 1 };
    next();
  });
  app.use('/fa', accessRoutes({ isEnabled: async () => enabled }));
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/fa`;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    return { status: res.status, body: parsed };
  };
  try {
    await fn(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const WRITES = [
  ['POST', '/ntfs/preview', { shareId: 1, path: '06-HR', revision: 'r1', aces: [] }],
  ['POST', '/ntfs/apply', { shareId: 1, path: '06-HR', revision: 'r1', aces: [] }],
  ['POST', '/ntfs/journal/1/undo', {}],
  ['POST', '/ntfs/propagate', { shareId: 1, path: '06-HR' }],
  ['POST', '/ntfs/report', {}],
];

test('routes: system administrators are refused every NTFS call', async () => {
  await withApp({ permissions: ['drive.access'] }, async (call) => {
    for (const [method, path, body] of [['GET', '/ntfs/acl?shareId=1&path=06-HR'], ['GET', '/ntfs/subjects?q=ab'], ['GET', '/ntfs/jobs'], ['GET', '/ntfs/report'], ...WRITES]) {
      const res = await call(method, path, body);
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.body.code, 'FA_SUPERADMIN_ONLY', `${method} ${path}`);
    }
  });
});

test('routes: the access block switched off answers 404; without * or drive.access nothing but the role', async () => {
  await withApp({ permissions: ['*'] }, async (call) => {
    for (const path of ['/', '/folders', '/at?shareId=1&path=', '/ntfs/acl?shareId=1', '/journal']) {
      const res = await call('GET', path);
      assert.equal(res.status, 404, path);
      assert.equal(res.body.code, 'DRIVE_ACCESS_DISABLED', path);
    }
  }, { enabled: false });
  await withApp({ permissions: ['drive.admin', 'drive.audit'] }, async (call) => {
    for (const path of ['/folders', '/at?shareId=1&path=', '/journal', '/person?dn=x']) {
      const res = await call('GET', path);
      assert.equal(res.status, 403, path);
    }
  });
});

test('routes: API tokens are refused, even a superadministrator’s', async () => {
  await withApp({ permissions: ['*'], token: true }, async (call) => {
    for (const [method, path, body] of [['GET', '/ntfs/acl?shareId=1'], ...WRITES]) {
      const res = await call(method, path, body);
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'FA_NO_TOKENS');
    }
  });
});

test('routes: "sign in as" reads, never writes', async () => {
  const fs = fakeServer({ aces: [allow(HR_FULL, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED)] });
  try {
    await withApp({ permissions: ['*'], imp: true }, async (call) => {
      const view = await call('GET', '/ntfs/acl?shareId=1&path=06-HR&sources=0');
      assert.equal(view.status, 200);
      assert.equal(view.body.acl.revision, 'r1');
      for (const [method, path, body] of WRITES) {
        const res = await call(method, path, body);
        assert.equal(res.status, 403, `${method} ${path}`);
        assert.equal(res.body.code, 'IMPERSONATION_LIMIT', `${method} ${path}`);
      }
      assert.equal(fs.writes.length, 0);
    });
    await withApp({ permissions: ['*'] }, async (call) => {
      // The old standalone editor's start and tree are gone (the editor lives in the folder's «Доступ» panel).
      assert.equal((await call('GET', '/ntfs')).status, 404);
      assert.equal((await call('GET', '/ntfs/tree?shareId=1')).status, 404);
      const view = await call('GET', '/ntfs/acl?shareId=1&path=06-HR&sources=0');
      const applied = await call('POST', '/ntfs/apply', { shareId: 1, path: '06-HR', revision: view.body.acl.revision, aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX)] });
      assert.equal(applied.status, 200);
      assert.equal(fs.writes.length, 1);
      const bad = await call('GET', '/ntfs/acl?shareId=1&path=..%2Fx');
      assert.equal(bad.status, 400);
    });
  } finally {
    await fs.restore();
  }
});

// ── review fixes ─────────────────────────────────────────────────────────────

test('a change in words also lists inherited entries that come and go', () => {
  const OLD = `${DOM}-7777`;
  const before = { aces: [allow(HR_FULL, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED), allow(OLD, RX, OI | CI | INHERITED)] };
  const after = { aces: [allow(HR_FULL, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED)] };
  const diff = diffAces(before, after);
  assert.deepEqual([diff.added, diff.removed], [[], []]);
  assert.deepEqual(diff.inheritedRemoved.map((a) => a.sid), [OLD]);
  assert.deepEqual(diff.inheritedAdded, []);
  assert.equal(diff.changed, true);
});

test('report fixes: only drafts that make the row right', () => {
  // An explicit deny: the fix removes it (a "set" would leave it).
  const denied = checkGroupAces([allow(HR_READ, RX), deny(HR_READ, 0x116)], HR_READ, 'readExecute');
  assert.equal(denied.explicitDenyOnly, true);
  const folders = buildFolders([group('sg_co_hr_full', 'W:\\06-HR;Full Access', HR_FULL), group('sg_co_hr_read', 'W:\\06-HR;Read Only', HR_READ)]);
  const run = (aces) => computeMismatches({ folders, results: new Map([[folderTargetKey(1, '06-HR'), { acl: { aces } }]]), typeMap: SETTINGS.typeMap });
  const deniedRow = run([allow(HR_FULL, MODIFY), allow(HR_READ, RX), deny(HR_READ, 0x116)]).find((row) => row.issue === 'deny_ace');
  assert.deepEqual(deniedRow.fix, { op: 'removeDeny', sid: HR_READ, name: 'sg_co_hr_read' });
  const draft = applyFix([allow(HR_READ, RX), deny(HR_READ, 0x116)], deniedRow.fix);
  assert.deepEqual(draft.map((ace) => ace.type), ['allow']);
  assert.deepEqual(model.applyFix([allow(HR_READ, RX), deny(HR_READ, 0x116)], deniedRow.fix).map((ace) => ace.type), ['allow']);
  // An inherited deny: no draft step fixes it here.
  assert.equal(run([allow(HR_FULL, MODIFY), allow(HR_READ, RX), deny(HR_READ, 0x116, OI | CI | INHERITED)]).find((row) => row.issue === 'deny_ace').fix, null);
  // Too high through an inherited entry, while an explicit one exists too: "set" would not help.
  const inheritedHigh = run([allow(HR_FULL, MODIFY), allow(HR_FULL, FULL, OI | CI | INHERITED), allow(HR_READ, RX)]).find((row) => row.issue === 'rights_too_high');
  assert.equal(inheritedHigh.fix, null);
  // Too high through the explicit entry only: "set" fixes it.
  const explicitHigh = run([allow(HR_FULL, FULL), allow(HR_FULL, MODIFY, OI | CI | INHERITED), allow(HR_READ, RX)]).find((row) => row.issue === 'rights_too_high');
  assert.equal(explicitHigh.fix.op, 'set');
  // Too low through inherited entries only: an explicit entry with the preset fixes it.
  const low = run([allow(HR_FULL, MODIFY), allow(HR_READ, RX, CI | INHERITED)]).find((row) => row.issue === 'rights_too_low');
  assert.equal(low.fix.op, 'set');
});

test('report: a failed SID lookup is never "unknown"; outside a whole-domain search no remove fix', () => {
  const folders = buildFolders([group('sg_co_hr_full', 'W:\\06-HR;Full Access', HR_FULL), group('sg_co_hr_read', 'W:\\06-HR;Read Only', HR_READ)]);
  const results = new Map([[folderTargetKey(1, '06-HR'), { acl: { aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX), allow(GHOST, RX), allow(`${DOM}-512`, FULL)] } }]]);
  const issues = (lookup) => computeMismatches({ folders, results, typeMap: SETTINGS.typeMap, lookup }).filter((row) => row.issue === 'unknown_sid');
  assert.deepEqual(issues({ ok: false, wholeDomain: false }), []);
  const partial = issues({ ok: true, wholeDomain: false });
  assert.deepEqual([partial.length, partial[0].subject.sid, partial[0].fix], [1, GHOST, null]);
  assert.equal(issues({ ok: true, wholeDomain: true })[0].fix.op, 'remove');
  assert.ok(isDomainRoot('DC=example,DC=com'));
  assert.ok(isDomainRoot(' dc=example, dc=com '));
  assert.ok(!isDomainRoot('OU=Accounts,DC=example,DC=com'));
});

test('ACL view and report when the directory fails: names unavailable, nothing "unknown"', async () => {
  const { aclView } = await import('../modules/drive/access/ntfs.js');
  const fs = fakeServer({ aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX), allow(GHOST, RX), allow(SYSTEM, FULL, OI | CI | INHERITED)] });
  const restore = _setNtfsDeps({
    lookupSids: async () => {
      throw new Error('LDAP down');
    },
  });
  try {
    const view = await aclView(req(), SUPER, { shareId: 1, path: '06-HR', sources: false });
    assert.equal(view.namesUnavailable, true);
    const ghost = view.acl.aces.find((ace) => ace.sid === GHOST);
    assert.equal(ghost.subject.unknown, false);
    assert.equal(ghost.subject.unavailable, true);
    const started = await startReport(req(), SUPER);
    const done = await _waitForReport(started.id);
    assert.equal(done.namesUnavailable, true);
    assert.deepEqual(done.rows.filter((row) => row.issue === 'unknown_sid'), []);
  } finally {
    restore();
    await fs.restore();
  }
  // The directory answers, but the search base is one OU: unknown without a "remove" fix.
  const fs2 = fakeServer({ aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX), allow(GHOST, RX)] });
  const restoreBase = _setNtfsDeps({ accessSettings: async () => ({ ...SETTINGS, subjectsBase: 'OU=Accounts,DC=example,DC=com' }) });
  try {
    const done = await _waitForReport((await startReport(req(), SUPER)).id);
    const row = done.rows.find((item) => item.issue === 'unknown_sid');
    assert.equal(done.partialLookup, true);
    assert.equal(row.fix, null);
  } finally {
    restoreBase();
    await fs2.restore();
  }
});

test('apply: the undo copy is journalled before the write; no journal, no write; completion failure is reported', async () => {
  const { aclView, applyChange } = await import('../modules/drive/access/ntfs.js');
  const fs = fakeServer({ aces: [allow(HR_FULL, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED), allow(ADMINS, FULL, OI | CI | INHERITED)] });
  try {
    let view = await aclView(req(), SUPER, { shareId: 1, path: '06-HR', sources: false });
    const draft = { shareId: 1, path: '06-HR', aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX)] };
    fs.journalDown = true;
    await assert.rejects(applyChange(req(), SUPER, { ...draft, revision: view.acl.revision }), { code: 'FA_JOURNAL_FAILED', statusCode: 503 });
    assert.equal(fs.writes.length, 0, 'nothing written without the undo copy');
    fs.journalDown = false;
    const applied = await applyChange(req(), SUPER, { ...draft, revision: view.acl.revision });
    const atWrite = fs.writes[0].journalled;
    assert.deepEqual([atWrite.length, atWrite[0].outcome, atWrite[0].before.sd, atWrite[0].before.revision], [1, 'pending', 'SD1', 'r1']);
    assert.deepEqual([fs.journal[0].outcome, fs.journal[0].after.revision], ['changed', 'r2']);
    assert.equal(applied.journalWarning, false);
    view = await aclView(req(), SUPER, { shareId: 1, path: '06-HR', sources: false });
    fs.completeDown = true;
    const second = await applyChange(req(), SUPER, { ...draft, aces: [allow(HR_FULL, MODIFY)], revision: view.acl.revision });
    assert.equal(second.journalWarning, true);
    assert.equal(fs.journal[1].outcome, 'pending');
    // The pending row still has its undo copy and can be undone (through the "changed since" diff).
    assert.equal(ntfsUndoRefusal('superadmin', fs.journal[1]), null);
  } finally {
    await fs.restore();
  }
});

test('apply and undo are refused while a propagation runs on the folder, above or below it', async () => {
  const { aclView, applyChange, startPropagationJob, undoNtfs } = await import('../modules/drive/access/ntfs.js');
  const fs = fakeServer({ aces: [allow(HR_FULL, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED), allow(ADMINS, FULL, OI | CI | INHERITED)] }, { holdJobs: true });
  try {
    const view = await aclView(req(), SUPER, { shareId: 1, path: '06-HR', sources: false });
    const applied = await applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX)] });
    const job = await startPropagationJob(req(), SUPER, { shareId: 1, path: '' });
    assert.equal(job.state, 'running');
    const writes = fs.writes.length;
    await assert.rejects(applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: applied.acl.revision, aces: [allow(HR_FULL, MODIFY)] }), (err) => err.code === 'JOB_RUNNING' && err.details.jobId === job.id);
    await assert.rejects(undoNtfs(req(), SUPER, 1), { code: 'JOB_RUNNING' });
    assert.equal(fs.writes.length, writes);
    assert.equal(fs.journal.filter((row) => row.action !== 'ntfs_propagate').length, 1, 'refusals are not journalled');
    fs.release();
    await waitForJob(job.id);
    await undoNtfs(req(), SUPER, 1, { propagate: false });
  } finally {
    await fs.restore();
  }
});

test('undo starts an "inherit" propagation when the restored folder passes other entries down', async () => {
  const { aclView, applyChange, undoNtfs } = await import('../modules/drive/access/ntfs.js');
  const fs = fakeServer({ aces: [allow(HR_FULL, MODIFY), allow(SYSTEM, FULL, OI | CI | INHERITED), allow(ADMINS, FULL, OI | CI | INHERITED)] });
  try {
    const view = await aclView(req(), SUPER, { shareId: 1, path: '06-HR', sources: false });
    await applyChange(req(), SUPER, { shareId: 1, path: '06-HR', revision: view.acl.revision, aces: [allow(HR_FULL, MODIFY), allow(HR_READ, RX)] });
    const undone = await undoNtfs(req(), SUPER, 1);
    assert.equal(undone.inheritableChanged, true);
    assert.equal(undone.job.mode, 'inherit');
    assert.deepEqual(undone.job.folder, { shareId: 1, path: '06-HR', display: 'W:\\06-HR' });
    assert.equal(fs.jobs.length, 1);
    assert.equal(fs.jobs[0].params.path, '06-HR');
    await waitForJob(undone.job.id);
    const row = fs.journal.find((item) => item.action === 'ntfs_propagate');
    assert.deepEqual([row.via, row.before.mode, row.outcome], ['undo', 'inherit', 'changed']);
  } finally {
    await fs.restore();
  }
});

test('"replace" propagation needs the confirmed count; report cancel and password parking are writes', async () => {
  const { startPropagationJob, aclView } = await import('../modules/drive/access/ntfs.js');
  const fs = fakeServer({ aces: [allow(HR_FULL, MODIFY), allow(SYSTEM, FULL), allow(ADMINS, FULL)] });
  try {
    await assert.rejects(startPropagationJob(req(), SUPER, { shareId: 1, path: '06-HR', mode: 'replace', confirm: true }), { code: 'FA_CONFIRM' });
    await assert.rejects(startPropagationJob(req(), SUPER, { shareId: 1, path: '06-HR', mode: 'replace', confirm: true, confirmCount: '3' }), { code: 'FA_CONFIRM' });
    const job = await startPropagationJob(req(), SUPER, { shareId: 1, path: '06-HR', mode: 'replace', confirm: true, confirmCount: 3 });
    await waitForJob(job.id);
    assert.equal(fs.journal.find((row) => row.action === 'ntfs_propagate').before.confirmCount, 3);

    const report = await startReport(req(), SUPER);
    const IMP = { role: 'superadmin', canWrite: false, readOnly: 'impersonation' };
    assert.throws(() => cancelReport(IMP, report.id), { code: 'IMPERSONATION_LIMIT' });
    await _waitForReport(report.id);
  } finally {
    await fs.restore();
  }
  // "Sign in as": a rejected password is not parked.
  const fs2 = fakeServer({ aces: [allow(HR_FULL, MODIFY)] });
  const restore = setEngineDeps({
    gateRequest: async () => {
      throw Object.assign(new Error('x'), { code: 'AUTH_FAILED', statusCode: 401 });
    },
  });
  try {
    await assert.rejects(aclView({ ...req(), auth: { imp: 1 } }, { role: 'superadmin', canWrite: false, readOnly: 'impersonation' }, { shareId: 1, path: '06-HR' }), { code: 'FA_CREDENTIALS_FAILED' });
    assert.deepEqual(fs2.parked, []);
  } finally {
    restore();
    await fs2.restore();
  }
});

test('journal completion helper: complete, drop, undo link', async () => {
  const calls = [];
  const run = async (sql, params) => calls.push([sql.replace(/\s+/g, ' ').trim(), params]);
  await completeChange(5, { after: { revision: 'r2' }, ok: true, outcome: 'changed', undoOf: 2 }, run);
  assert.match(calls[0][0], /^UPDATE drive_access_journal SET after = \$2/);
  assert.deepEqual(calls[0][1], [5, '{"revision":"r2"}', true, 'changed', null, null, 2]);
  assert.deepEqual(calls[1][1], [2, 5]);
  await completeChange(6, null, run);
  assert.match(calls[2][0], /^DELETE FROM drive_access_journal WHERE id = \$1 AND outcome = 'pending'/);
});

test('editor model: "List folder contents" keeps inherit-only / NP; convert keeps unknown ACE types', () => {
  // Read & execute for "Subfolders only" opens as List folder contents and must stay off the folder itself.
  const ace = { type: 'allow', sid: HR_READ, mask: RX, flags: CI | IO };
  const form = { sid: ace.sid, type: 'deny', preset: model.presetOf(ace.mask, ace.flags), appliesTo: model.appliesToOf(ace.flags), noPropagate: false };
  assert.equal(form.preset, 'listFolder');
  assert.deepEqual(model.aceFromDialog(form), { type: 'deny', sid: HR_READ, mask: RX, flags: CI | IO });
  assert.equal(model.aceFromDialog({ ...form, appliesTo: 'subfolders', noPropagate: true }).flags, CI | IO | NP);
  // Picked for a new entry ("this folder, subfolders and files"): folders only.
  assert.equal(model.aceFromDialog({ sid: HR_READ, type: 'allow', preset: 'listFolder', appliesTo: 'thisSubfoldersFiles', noPropagate: false }).flags, CI);
  const other = { type: 'other', aceType: 0x11, flags: OI | CI | INHERITED, raw: '0100000001010000000000050b000000', inherited: true };
  const out = model.disableInheritance({ aces: [allow(SYSTEM, FULL, OI | CI | INHERITED), other] }, [], 'convert');
  assert.deepEqual(out.aces.find((item) => item.type === 'other'), { type: 'other', aceType: 0x11, flags: OI | CI, raw: other.raw });
  // The server takes it as an explicit entry.
  assert.equal(cleanChange({ aces: out.aces }).aces.length, 2);
});

test('routes: an outage keeps its code instead of the generic server error', async () => {
  const fs = fakeServer({ aces: [allow(HR_FULL, MODIFY)] });
  const restore = setEngineDeps({
    gateRequest: async () => {
      throw Object.assign(new Error('The file server gateway is not available'), { code: 'GATEWAY_DOWN', statusCode: 503 });
    },
  });
  try {
    await withApp({ permissions: ['*'] }, async (call) => {
      const res = await call('GET', '/ntfs/acl?shareId=1&path=06-HR&sources=0');
      assert.equal(res.status, 503);
      assert.equal(res.body.code, 'GATEWAY_DOWN');
      assert.equal(res.body.error, 'The file server gateway is not available');
    });
  } finally {
    restore();
    await fs.restore();
  }
});
