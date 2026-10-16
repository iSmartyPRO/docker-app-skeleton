import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import {
  ACE_FLAGS,
  APPLIES_TO,
  _setDeps,
  accessLoss,
  addGroupsToFolder,
  appliesToFlags,
  canonicalize,
  cancelJob,
  checkGuards,
  disableInheritanceAces,
  flagsToAppliesTo,
  getAcl,
  getJob,
  guardErrors,
  guardedRights,
  includedPresets,
  listJobs,
  propagationSourceProblems,
  refuseWhileJobRuns,
  runningJob,
  inheritableChanged,
  isCanonical,
  mapAclError,
  mapGeneric,
  presetMask,
  presetOf,
  restoreAcl,
  setAcl,
  startPropagation,
  waitForJob,
  wellKnownName,
  whoLosesOnDisableInheritance,
  withGroups,
} from '../modules/drive/acl.js';
import { attachGroups } from '../modules/drive/aclHook.js';
import { finishNtfsAttach, startNtfsAttach } from '../modules/drive/access/ntfsJournal.js';

const { OI, CI, NP, IO, INHERITED } = ACE_FLAGS;
const SYSTEM = 'S-1-5-18';
const ADMINS = 'S-1-5-32-544';
const USERS = 'S-1-5-32-545';
const DOM = 'S-1-5-21-1111-2222-3333';
const HR_FULL = `${DOM}-4001`;
const HR_READ = `${DOM}-4002`;
const ALICE = `${DOM}-1105`;

const allow = (sid, mask, flags = OI | CI) => ({ type: 'allow', sid, mask, flags });
const deny = (sid, mask, flags = OI | CI) => ({ type: 'deny', sid, mask, flags });

// ── Pure helpers ────────────────────────────────────────────────────────────

test('rights presets <-> masks', () => {
  assert.equal(presetMask('full'), 0x1f01ff);
  assert.equal(presetMask('modify'), 0x1301bf);
  assert.equal(presetMask('read_execute'), 0x1200a9);
  assert.equal(presetMask('readExecute'), 0x1200a9);
  assert.equal(presetMask('read'), 0x120089);
  assert.equal(presetMask('write'), 0x100116);
  assert.throws(() => presetMask('owner'), { code: 'BAD_PRESET' });
  assert.equal(presetOf(0x1301bf, OI | CI), 'modify');
  assert.equal(presetOf(0x1200a9, CI), 'listFolder');
  assert.equal(presetOf(0x1200a9, OI | CI), 'readExecute');
  assert.equal(presetOf(0x10000000, OI | CI | IO), 'full'); // GENERIC_ALL
  assert.equal(presetOf(0x1301ff), 'special');
  assert.deepEqual(includedPresets(0x1301bf), ['modify', 'readExecute', 'read', 'write']);
  assert.deepEqual(includedPresets(0x1f01ff), ['full', 'modify', 'readExecute', 'read', 'write']);
  assert.equal(mapGeneric(0x80000000 | 0x20000000), 0x1200a9);
});

test('"applies to" <-> ACE flags', () => {
  for (const [name, flags] of Object.entries(APPLIES_TO)) {
    assert.equal(appliesToFlags(name), flags);
    assert.equal(flagsToAppliesTo(flags).appliesTo, name);
  }
  assert.equal(appliesToFlags('thisSubfoldersFiles', { noPropagate: true }), OI | CI | NP);
  assert.equal(appliesToFlags('this', { noPropagate: true }), 0);
  assert.deepEqual(flagsToAppliesTo(OI | CI | INHERITED), { appliesTo: 'thisSubfoldersFiles', noPropagate: false, inherited: true });
  assert.throws(() => appliesToFlags('everything'), { code: 'BAD_ACL' });
});

test('canonical ordering', () => {
  const inheritedAllow = allow(USERS, 0x1200a9, OI | CI | INHERITED);
  const inheritedDeny = deny(ALICE, 0x10000, INHERITED);
  const aces = [allow(HR_FULL, 0x1301bf), inheritedAllow, deny(ALICE, 0x10000), inheritedDeny, allow(SYSTEM, 0x1f01ff)];
  assert.equal(isCanonical(aces), false);
  const out = canonicalize(aces);
  assert.deepEqual(
    out.map((ace) => ace.sid),
    [ALICE, HR_FULL, SYSTEM, USERS, ALICE]
  );
  assert.equal(out[3], inheritedAllow);
  assert.equal(out[4], inheritedDeny);
  assert.equal(isCanonical(out), true);
});

test('well-known SID names', () => {
  assert.equal(wellKnownName(SYSTEM), 'SYSTEM');
  assert.equal(wellKnownName('S-1-3-0'), 'CREATOR OWNER');
  assert.equal(wellKnownName('S-1-3-1'), 'CREATOR GROUP');
  assert.equal(wellKnownName(ADMINS), 'Administrators');
  assert.equal(wellKnownName(USERS), 'Users');
  assert.equal(wellKnownName('S-1-1-0'), 'Everyone');
  assert.equal(wellKnownName('S-1-5-11'), 'Authenticated Users');
  assert.equal(wellKnownName(`${DOM}-512`), 'Domain Admins');
  assert.equal(wellKnownName(`${DOM}-513`), 'Domain Users');
  assert.equal(wellKnownName(HR_FULL), null);
});

test('guards: SYSTEM / Administrators cannot lose access, own removal is a warning', () => {
  const before = [allow(SYSTEM, 0x1f01ff), allow(ADMINS, 0x1f01ff), allow(HR_FULL, 0x1301bf), allow(ALICE, 0x1200a9)];
  const ok = checkGuards(before, [...before, allow(HR_READ, 0x1200a9)]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.loss, []);

  const noSystem = checkGuards(before, before.filter((ace) => ace.sid !== SYSTEM));
  assert.equal(noSystem.ok, false);
  assert.deepEqual(noSystem.errors.map((e) => [e.code, e.sid, e.name]), [['PROTECTED_PRINCIPAL', SYSTEM, 'SYSTEM']]);

  // A deny takes rights away too; so does narrowing "applies to" (children lose it).
  assert.equal(checkGuards(before, [deny(ADMINS, 0x10000), ...before]).ok, false);
  const thisOnly = before.map((ace) => (ace.sid === ADMINS ? { ...ace, flags: 0 } : ace));
  const narrowed = checkGuards(before, thisOnly);
  assert.equal(narrowed.ok, false);
  assert.equal(narrowed.errors[0].lost.this, 0);
  assert.equal(narrowed.errors[0].lost.files, 0x1f01ff);

  const self = checkGuards(before, before.filter((ace) => ace.sid !== ALICE), { actorSids: [ALICE, `${DOM}-513`] });
  assert.equal(self.ok, true);
  assert.deepEqual(self.warnings.map((w) => w.sid), [ALICE]);
});

test('who loses access when inheritance is disabled with "remove"', () => {
  const aces = [
    allow(HR_FULL, 0x1301bf), // explicit
    allow(SYSTEM, 0x1f01ff, OI | CI | INHERITED),
    allow(USERS, 0x1200a9, OI | CI | INHERITED),
    allow('S-1-3-0', 0x10000000, OI | CI | IO | INHERITED), // inherit-only: nothing on the folder itself
  ];
  const loss = whoLosesOnDisableInheritance(aces, { [HR_FULL]: 'sg_co_hr_full' });
  assert.deepEqual(
    loss.map((e) => [e.sid, e.name, e.losesAll]),
    [
      [SYSTEM, 'SYSTEM', true],
      [USERS, 'Users', true],
      ['S-1-3-0', 'CREATOR OWNER', false],
    ]
  );
  assert.deepEqual(accessLoss(aces, disableInheritanceAces(aces, 'convert')), []);
  const converted = disableInheritanceAces(aces, 'convert');
  assert.equal(converted.length, 4);
  assert.ok(converted.every((ace) => !(ace.flags & INHERITED)));
  assert.deepEqual(disableInheritanceAces(aces, 'remove'), [allow(HR_FULL, 0x1301bf)]);
});

test('adding a folder group pair to explicit ACEs', () => {
  const aces = [allow(SYSTEM, 0x1f01ff, OI | CI | INHERITED), allow(HR_READ, 0x120089), deny(ALICE, 0x10000, 0)];
  const { aces: next, changed } = withGroups(aces, [
    { sid: HR_FULL, preset: 'modify' },
    { sid: HR_READ, preset: 'read_execute' }, // widens Read to Read & Execute
  ]);
  assert.equal(changed, true);
  assert.deepEqual(next, [deny(ALICE, 0x10000, 0), allow(HR_READ, 0x1200a9), allow(HR_FULL, 0x1301bf)]);
  assert.equal(withGroups(next, [{ sid: HR_FULL, preset: 'modify' }]).changed, false);
  assert.throws(() => withGroups(aces, [{ sid: 'sg_co_hr_full', preset: 'modify' }]), { code: 'BAD_SID' });
  assert.equal(inheritableChanged(aces, next), true);
  assert.equal(inheritableChanged(next, [...next, allow(ALICE, 0x1200a9, 0)]), false);
});

test('gateway error codes', () => {
  assert.equal(mapAclError({ code: 'ACCESS_DENIED' }, { write: true }).code, 'ACCESS_DENIED');
  assert.match(mapAclError({ code: 'ACCESS_DENIED' }, { write: true }).message, /change permissions/);
  assert.equal(mapAclError({ code: 'STALE' }).statusCode, 409);
  assert.equal(mapAclError({ code: 'SHARE_NOT_FOUND' }).code, 'NOT_FOUND');
  const auth = mapAclError({ code: 'ACCOUNT_LOCKED' });
  assert.equal(auth.code, 'AUTH');
  assert.equal(auth.details.reason, 'ACCOUNT_LOCKED');
  assert.equal(mapAclError({ code: 'NO_PARENT' }).code, 'NO_PARENT');
});

// ── Service functions with a fake gateway ───────────────────────────────────

const SERVER = { id: 1, name: 'DC', host: '10.0.0.10', port: 445, auth: 'user', use_login: true };
const CRED = { username: 'admin.ivanov', domain: 'example.com', password: 'secret' };

function gatewayError(code, statusCode = 403) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function fakeGateway(handler, { source = 'login' } = {}) {
  const calls = [];
  const parked = [];
  const restore = _setDeps({
    loadServer: async () => SERVER,
    credentialFor: async () => ({ cred: CRED, row: { id: 7 }, source }),
    parkCredential: async (resolved, code) => parked.push([resolved.row?.id, code]),
    query: async () => ({ rows: [{ id: 3, server_id: 1, share: 'shared', root_path: '' }] }),
    gateRequest: async (op, params, options = {}) => {
      const body = options.body ? JSON.parse(options.body.toString('utf8')) : null;
      calls.push({ op, params, body });
      const out = await handler(op, params, body, options);
      if (out instanceof Readable) return out;
      return Readable.from([Buffer.from(JSON.stringify(out))]);
    },
  });
  return { calls, parked, restore };
}

const CURRENT = {
  path: '06-HR',
  isDir: true,
  owner: ADMINS,
  group: SYSTEM,
  protected: false,
  aces: [allow(HR_FULL, 0x1301bf), allow(SYSTEM, 0x1f01ff, OI | CI | INHERITED), allow(ADMINS, 0x1f01ff, OI | CI | INHERITED)],
  sddl: 'O:BAG:SYD:AI(...)',
  sd: 'AQAEgA==',
  revision: 'rev-1',
};

test('getAcl uses the actor credential and names the SIDs', async () => {
  const gw = fakeGateway(() => CURRENT);
  try {
    const acl = await getAcl(5, 1, 'shared', '06-HR', { names: { [HR_FULL]: 'sg_co_hr_full' } });
    assert.equal(gw.calls[0].op, 'acl_get');
    assert.deepEqual(gw.calls[0].params.cred, CRED);
    assert.equal(gw.calls[0].params.share, 'shared');
    assert.equal(gw.calls[0].params.path, '06-HR');
    assert.deepEqual(gw.calls[0].params.server, { host: SERVER.host, port: 445, encrypt: false });
    assert.equal(acl.aces[0].name, 'sg_co_hr_full');
    assert.equal(acl.aces[0].preset, 'modify');
    assert.equal(acl.aces[0].appliesTo, 'thisSubfoldersFiles');
    assert.equal(acl.aces[1].name, 'SYSTEM');
    assert.equal(acl.ownerName, 'Administrators');
  } finally {
    gw.restore();
  }
});

test('never the service account; explicit credentials are used as given', async () => {
  const gw = fakeGateway(() => CURRENT, { source: 'service' });
  try {
    await assert.rejects(getAcl(5, SERVER, 'shared', ''), { code: 'CREDENTIALS_REQUIRED' });
    assert.equal(gw.calls.length, 0);
    const other = { username: 'EXAMPLE\\it.admin', password: 'x' };
    await getAcl({ userId: 5, credential: other }, SERVER, 'shared', '');
    assert.deepEqual(gw.calls[0].params.cred, { ...other, domain: '' });
  } finally {
    gw.restore();
  }
});

test('auth failures park the drive credential and read as AUTH', async () => {
  const gw = fakeGateway(() => {
    throw gatewayError('AUTH_FAILED');
  });
  try {
    await assert.rejects(getAcl(5, SERVER, 'shared', '06-HR'), (err) => err.code === 'AUTH' && err.details.reason === 'AUTH_FAILED');
    assert.deepEqual(gw.parked, [[7, 'AUTH_FAILED']]);
  } finally {
    gw.restore();
  }
});

test('setAcl previews, applies guards, then writes once', async () => {
  let written = null;
  const gw = fakeGateway((op, _params, body) => {
    if (op !== 'acl_set') throw new Error(op);
    const after = { ...CURRENT, aces: [...body.aces.map((ace) => ({ ...ace })), ...CURRENT.aces.filter((ace) => ace.flags & INHERITED)] };
    if (body.dryRun) return { dryRun: true, previous: { sd: CURRENT.sd, sddl: CURRENT.sddl, revision: 'rev-1' }, before: CURRENT, acl: { ...after, revision: null } };
    written = body;
    return { previous: { sd: CURRENT.sd, sddl: CURRENT.sddl, revision: 'rev-1' }, acl: { ...after, revision: 'rev-2' } };
  });
  try {
    await assert.rejects(setAcl(5, SERVER, 'shared', '06-HR', { aces: [] }), { code: 'REVISION_REQUIRED' });
    const result = await setAcl(5, SERVER, 'shared', '06-HR', { revision: 'rev-1', aces: [allow(HR_FULL, 0x1301bf), allow(HR_READ, 0x1200a9)] });
    assert.deepEqual(
      gw.calls.map((c) => [c.op, Boolean(c.body.dryRun)]),
      [
        ['acl_set', true],
        ['acl_set', false],
      ]
    );
    assert.equal(written.revision, 'rev-1');
    assert.equal(written.protected, false);
    assert.equal(result.previous.sd, CURRENT.sd);
    assert.equal(result.acl.revision, 'rev-2');
    assert.equal(result.inheritableChanged, true);

  } finally {
    gw.restore();
  }
});

test('protected change is refused without a write', async () => {
  const gw = fakeGateway((op, _params, body) => {
    const after = body.protected ? body.aces : [...body.aces, ...CURRENT.aces.filter((ace) => ace.flags & INHERITED)];
    if (body.dryRun) return { dryRun: true, previous: {}, before: CURRENT, acl: { ...CURRENT, aces: after, revision: null } };
    throw new Error('must not write');
  });
  try {
    await assert.rejects(setAcl(5, SERVER, 'shared', '06-HR', { revision: 'rev-1', aces: [allow(HR_FULL, 0x1301bf)], protected: true }), (err) => {
      assert.equal(err.code, 'PROTECTED_PRINCIPAL');
      assert.deepEqual(err.details.errors.map((e) => e.sid).sort(), [SYSTEM, ADMINS].sort());
      return true;
    });
    await assert.rejects(
      setAcl(5, SERVER, 'shared', '06-HR', { revision: 'rev-1', aces: [] }, { actorSids: [HR_FULL] }),
      { code: 'CONFIRM_SELF_REMOVAL' }
    );
    assert.equal(gw.calls.filter((c) => !c.body.dryRun).length, 0);
  } finally {
    gw.restore();
  }
});

test('stale writes and undo', async () => {
  const gw = fakeGateway((op, _params, body) => {
    if (op === 'acl_restore' && body.revision === 'old') throw gatewayError('STALE', 409);
    if (body.dryRun) return { dryRun: true, previous: {}, before: CURRENT, acl: { ...CURRENT, revision: null } };
    return { previous: { sd: 'AAA=', sddl: 'D:', revision: 'rev-2' }, acl: { ...CURRENT, revision: 'rev-3' } };
  });
  try {
    await assert.rejects(restoreAcl(5, SERVER, 'shared', '06-HR', { sd: CURRENT.sd }, { revision: 'old' }), { code: 'STALE', statusCode: 409 });
    const done = await restoreAcl(5, SERVER, 'shared', '06-HR', { sd: CURRENT.sd }, { revision: 'rev-2' });
    assert.equal(done.acl.revision, 'rev-3');
    const last = gw.calls.at(-1);
    assert.equal(last.op, 'acl_restore');
    assert.deepEqual([last.body.sd, last.body.revision, last.body.owner], [CURRENT.sd, 'rev-2', false]);
  } finally {
    gw.restore();
  }
});

function ndjson(lines) {
  return Readable.from(lines.map((line) => Buffer.from(`${JSON.stringify(line)}\n`)));
}

test('propagation job: progress, failures, result, one job per folder', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const gw = fakeGateway((op) => {
    if (op === 'acl_get') return CURRENT;
    assert.equal(op, 'acl_propagate');
    async function* lines() {
      yield Buffer.from(`${JSON.stringify({ type: 'progress', path: '06-HR/a', done: 1, changed: 1, failed: 0 })}\n`);
      yield Buffer.from(`${JSON.stringify({ type: 'failed', path: '06-HR/locked.xlsx', code: 'ACCESS_DENIED', stage: 'write' })}\n{"type":"prot`);
      await gate;
      yield Buffer.from(`ected","path":"06-HR/private"}\n`);
      yield Buffer.from(
        JSON.stringify({
          type: 'result',
          done: 10,
          changed: 8,
          unchanged: 2,
          failed: 1,
          protected: 1,
          withExplicit: 3,
          explicitRemoved: 0,
          stopped: false,
          marker: '06-HR/z.txt',
          failedList: [{ path: '06-HR/locked.xlsx', code: 'ACCESS_DENIED', stage: 'write' }],
          protectedList: ['06-HR/private'],
        })
      );
    }
    return Readable.from(lines());
  });
  try {
    const job = await startPropagation(5, SERVER, 'shared', '06-HR');
    assert.equal(job.state, 'running');
    assert.deepEqual(gw.calls.map((c) => c.op), ['acl_get', 'acl_propagate']); // source checked first
    assert.equal(gw.calls[1].params.mode, 'inherit');
    assert.deepEqual(gw.calls[1].body, { retry: [] });
    await assert.rejects(startPropagation(5, SERVER, 'shared', '06-hr/Sub'), { code: 'JOB_RUNNING' });
    await assert.rejects(startPropagation(5, SERVER, 'shared', ''), { code: 'JOB_RUNNING' });
    release();
    const done = await waitForJob(job.id);
    assert.equal(done.state, 'done');
    assert.equal(done.progress.done, 10);
    assert.equal(done.progress.failed, 1);
    assert.equal(done.marker, '06-HR/z.txt');
    assert.deepEqual(done.failedList, [{ path: '06-HR/locked.xlsx', code: 'ACCESS_DENIED', stage: 'write' }]);
    assert.deepEqual(done.protectedList, ['06-HR/private']);
    // Finished: the folder is free again.
    const next = await startPropagation(5, SERVER, 'shared', '06-HR/Sub', { mode: 'replace', retry: [{ path: '06-HR/locked.xlsx' }] });
    assert.equal(gw.calls.at(-1).params.mode, 'replace');
    assert.deepEqual(gw.calls.at(-1).body, { retry: ['06-HR/locked.xlsx'] });
    await waitForJob(next.id);
  } finally {
    gw.restore();
  }
});

test('propagation job: cancel keeps the resume marker; gateway errors are mapped', async () => {
  const gw = fakeGateway((op, params, _body, options) => {
    if (op === 'acl_get') return CURRENT;
    if (params.path === 'broken') {
      return ndjson([{ type: 'progress', path: 'broken/a', done: 1 }, { type: 'error', code: 'ACCOUNT_LOCKED', error: 'locked', done: 1, marker: 'broken/a' }]);
    }
    async function* lines() {
      yield Buffer.from(`${JSON.stringify({ type: 'progress', path: 'big/0001', done: 1 })}\n`);
      await new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return Readable.from(lines());
  });
  try {
    const job = await startPropagation(5, SERVER, 'shared', 'big', { marker: 'big/0000' });
    assert.equal(gw.calls.find((c) => c.op === 'acl_propagate').params.marker, 'big/0000');
    await new Promise((resolve) => setTimeout(resolve, 20));
    cancelJob(job.id);
    const stopped = await waitForJob(job.id);
    assert.equal(stopped.state, 'cancelled');
    assert.equal(stopped.marker, 'big/0001');

    const broken = await waitForJob((await startPropagation(5, SERVER, 'shared', 'broken')).id);
    assert.equal(broken.state, 'failed');
    assert.equal(broken.error.code, 'AUTH');
    assert.equal(broken.marker, 'broken/a');
  } finally {
    gw.restore();
  }
});

test('addGroupsToFolder grants the pair and propagates; the access section hook adapts it', async () => {
  let acl = CURRENT;
  const gw = fakeGateway((op, _params, body) => {
    if (op === 'acl_get') return acl;
    if (op === 'acl_set') {
      const after = { ...acl, aces: [...body.aces, ...acl.aces.filter((ace) => ace.flags & INHERITED)] };
      if (body.dryRun) return { dryRun: true, previous: { sd: acl.sd }, before: acl, acl: { ...after, revision: null } };
      assert.equal(body.inherit, 'keep');
      acl = { ...after, revision: 'rev-2' };
      return { previous: { sd: CURRENT.sd, sddl: CURRENT.sddl, revision: 'rev-1' }, acl };
    }
    if (op === 'acl_propagate') return ndjson([{ type: 'result', done: 0, stopped: false, failedList: [], protectedList: [] }]);
    throw new Error(op);
  });
  try {
    const out = await addGroupsToFolder(5, SERVER, 'shared', '06-HR', [
      { sid: HR_FULL, preset: 'modify' },
      { sid: HR_READ, preset: 'readExecute' },
    ]);
    assert.equal(out.changed, true);
    assert.equal(out.previous.sd, CURRENT.sd);
    assert.deepEqual(
      acl.aces.filter((ace) => !(ace.flags & INHERITED)),
      [allow(HR_FULL, 0x1301bf), allow(HR_READ, 0x1200a9)]
    );
    assert.ok(out.job?.id);
    await waitForJob(out.job.id);
    assert.deepEqual(
      gw.calls.map((c) => c.op),
      ['acl_get', 'acl_set', 'acl_set', 'acl_propagate']
    );
    // Same pair again: nothing to do, no job.
    const again = await addGroupsToFolder(5, SERVER, 'shared', '06-HR', [{ sid: HR_READ, preset: 'readExecute' }]);
    assert.deepEqual([again.changed, again.job], [false, null]);
  } finally {
    gw.restore();
  }

  const seen = [];
  const hook = await attachGroups(
    {
      actor: { userId: 5, credential: CRED },
      folder: { shareId: 3, path: '06-HR' },
      groups: [
        { type: 'full', sid: HR_FULL },
        { type: 'read', sid: HR_READ },
      ],
      rights: { full: 'modify', read: 'read_execute' },
    },
    {
      resolve: async () => ({ server: SERVER, share: 'shared', path: '06-HR' }),
      add: async (actor, server, share, path, groups) => {
        seen.push({ actor, share, path, groups });
        return { changed: true, previous: { sd: 'X', sddl: 'D:' }, acl: { revision: 'r' }, job: { id: 'j' } };
      },
    }
  );
  assert.deepEqual(hook, { status: 'applied', changed: true, sddlBefore: 'D:', sdBefore: 'X', revisionBefore: null, sddlAfter: null, revisionAfter: 'r', jobId: 'j', propagationError: null, server: { id: 1, share: 'shared', path: '06-HR' } });
  assert.deepEqual(seen[0].actor, { userId: 5, credential: CRED });
  assert.deepEqual(seen[0].groups, [
    { sid: HR_FULL, preset: 'modify' },
    { sid: HR_READ, preset: 'read_execute' },
  ]);
  const missing = await attachGroups({ groups: [{ type: 'full' }], folder: { shareId: 3 } });
  assert.equal(missing.code, 'FA_NTFS_NO_SID');
  const refused = await attachGroups(
    { groups: [{ type: 'full', sid: HR_FULL }], folder: { shareId: 3 } },
    {
      resolve: async () => ({ server: SERVER, share: 'shared', path: '' }),
      add: async () => {
        throw Object.assign(new Error('no rights'), { code: 'ACCESS_DENIED' });
      },
    }
  );
  assert.deepEqual([refused.status, refused.code], ['failed', 'ACCESS_DENIED']);
});

// ── Review fixes: guard bypasses, unsafe propagation, job owners ────────────

const EVERYONE = 'S-1-1-0';
const AUTH_USERS = 'S-1-5-11';
const DOMAIN_USERS = `${DOM}-513`;
const BASE = [allow(SYSTEM, 0x1f01ff), allow(ADMINS, 0x1f01ff), allow(HR_FULL, 0x1301bf)];

test('guards: umbrella denies, NULL DACL before, empty DACL', () => {
  for (const sid of [EVERYONE, AUTH_USERS, USERS, DOMAIN_USERS]) {
    const g = checkGuards(BASE, [deny(sid, 0x1f01ff), ...BASE]);
    assert.equal(g.ok, false, sid);
    assert.deepEqual(g.errors.map((e) => e.sid), [SYSTEM, ADMINS], sid);
  }
  // A deny of one right is enough; generic rights are mapped.
  assert.equal(checkGuards(BASE, [deny(EVERYONE, 0x40000000), ...BASE]).ok, false);
  // Unrelated denies (or Domain Computers) are fine.
  assert.equal(checkGuards(BASE, [deny(ALICE, 0x1f01ff), deny(`${DOM}-515`, 0x1f01ff), ...BASE]).ok, true);

  // NULL DACL = Everyone: Full Control before the change.
  const fromNull = checkGuards([], [allow(HR_FULL, 0x1301bf), allow(HR_READ, 0x1200a9)], { beforeNull: true });
  assert.deepEqual(fromNull.errors.map((e) => [e.code, e.sid]), [['PROTECTED_PRINCIPAL', SYSTEM], ['PROTECTED_PRINCIPAL', ADMINS]]);
  assert.equal(checkGuards([], BASE, { beforeNull: true }).ok, true);

  // Empty DACL: always refused, even when SYSTEM / Administrators had nothing before.
  assert.deepEqual(checkGuards([allow(ALICE, 0x1301bf)], []).errors, [{ code: 'EMPTY_DACL' }]);
  assert.deepEqual(guardErrors([], []), [{ code: 'EMPTY_DACL' }]);

  // Everyone allows count for the guarded SIDs both before and after.
  const everyone = [allow(EVERYONE, 0x1f01ff)];
  assert.equal(checkGuards(everyone, [...everyone, allow(ALICE, 0x1301bf)]).ok, true);
  assert.equal(checkGuards(everyone, [allow(ALICE, 0x1301bf)]).ok, false);

  // Files: only the file itself counts.
  const flat = [allow(SYSTEM, 0x1f01ff, 0), allow(ADMINS, 0x1f01ff, 0)];
  assert.equal(checkGuards([], flat, { beforeNull: true, isDir: false }).ok, true);
  assert.equal(checkGuards([], flat, { beforeNull: true }).ok, false);
  assert.equal(guardedRights([], { nullDacl: true })[SYSTEM].files, 0x1f01ff);
});

test('propagation source checks', () => {
  assert.deepEqual(propagationSourceProblems({ aces: BASE }), []);
  assert.deepEqual(propagationSourceProblems({ nullDacl: true, aces: [] }), [{ code: 'NULL_DACL' }]);
  assert.deepEqual(
    propagationSourceProblems({ aces: [allow(SYSTEM, 0x1f01ff), allow(ADMINS, 0x1f01ff, CI)] }).map((p) => [p.sid, p.scope]),
    [
      [ADMINS, 'files'],
    ]
  );
  assert.equal(propagationSourceProblems({ aces: [allow(SYSTEM, 0x1f01ff, 0), allow(ADMINS, 0x1f01ff, 0)] }).length, 4);
});

test('setAcl refuses an empty DACL and narrowing a NULL DACL; restore is guarded too', async () => {
  let before = CURRENT;
  const gw = fakeGateway((op, _params, body) => {
    if (op === 'acl_set') {
      const after = body.protected ? body.aces : [...body.aces, ...before.aces.filter((ace) => ace.flags & INHERITED)];
      if (body.dryRun) return { dryRun: true, previous: {}, before, acl: { ...before, nullDacl: false, aces: after, revision: null } };
    }
    if (op === 'acl_restore' && body.dryRun) return { dryRun: true, previous: {}, before, acl: { ...before, aces: [deny(EVERYONE, 0x1f01ff), ...BASE] } };
    throw new Error('must not write');
  });
  try {
    await assert.rejects(setAcl(5, SERVER, 'shared', '06-HR', { revision: 'rev-1', aces: [], protected: true }), { code: 'EMPTY_DACL', statusCode: 422 });
    before = { ...CURRENT, nullDacl: true, aces: [] };
    await assert.rejects(
      setAcl(5, SERVER, 'shared', '06-HR', { revision: 'rev-1', aces: [allow(HR_FULL, 0x1301bf)], protected: true }),
      (err) => err.code === 'PROTECTED_PRINCIPAL' && err.details.errors.length === 2
    );
    before = CURRENT;
    await assert.rejects(restoreAcl(5, SERVER, 'shared', '06-HR', { sd: 'AAA=' }), { code: 'PROTECTED_PRINCIPAL' });
    assert.equal(gw.calls.filter((c) => !c.body?.dryRun).length, 0);
  } finally {
    gw.restore();
  }
});

test('propagation refuses an unsafe source; retry skips the pre-check', async () => {
  let source = { ...CURRENT, aces: [allow(HR_FULL, 0x1301bf), allow(SYSTEM, 0x1f01ff, OI | CI | INHERITED)] }; // no Administrators
  const gw = fakeGateway((op) => {
    if (op === 'acl_get') return source;
    return ndjson([{ type: 'result', done: 0, stopped: false, failedList: [], protectedList: [] }]);
  });
  try {
    await assert.rejects(startPropagation(5, SERVER, 'shared', 'unsafe'), (err) => {
      assert.equal(err.code, 'UNSAFE_SOURCE');
      assert.equal(err.statusCode, 422);
      assert.deepEqual(err.details.problems.map((p) => p.sid), [ADMINS, ADMINS]);
      return true;
    });
    source = { ...CURRENT, nullDacl: true, aces: [] };
    await assert.rejects(startPropagation(5, SERVER, 'shared', 'unsafe'), { code: 'UNSAFE_SOURCE' });
    assert.ok(gw.calls.every((c) => c.op === 'acl_get'));
    const retry = await startPropagation(5, SERVER, 'shared', 'unsafe', { retry: ['unsafe/a'] });
    await waitForJob(retry.id);
    assert.equal(gw.calls.at(-1).op, 'acl_propagate'); // the gateway checks each retry parent
  } finally {
    gw.restore();
  }
});

test('addGroupsToFolder reports a refused propagation without failing the grant', async () => {
  // SYSTEM / Administrators only on this folder: the grant passes, propagation is refused.
  let acl = { ...CURRENT, aces: [allow(SYSTEM, 0x1f01ff, 0), allow(ADMINS, 0x1f01ff, 0)] };
  const gw = fakeGateway((op, _params, body) => {
    if (op === 'acl_get') return acl;
    if (op === 'acl_set') {
      const after = { ...acl, aces: [...body.aces] };
      if (body.dryRun) return { dryRun: true, previous: { sd: acl.sd }, before: acl, acl: { ...after, revision: null } };
      acl = { ...after, revision: 'rev-2' };
      return { previous: { sd: CURRENT.sd, sddl: CURRENT.sddl, revision: 'rev-1' }, acl };
    }
    throw new Error(`unexpected ${op}`);
  });
  try {
    const out = await addGroupsToFolder(5, SERVER, 'shared', '06-HR', [{ sid: HR_FULL, preset: 'modify' }]);
    assert.equal(out.changed, true);
    assert.equal(out.job, null);
    assert.equal(out.propagationError.code, 'UNSAFE_SOURCE');
    assert.equal(out.previous.sd, CURRENT.sd);
    assert.deepEqual(gw.calls.map((c) => c.op), ['acl_get', 'acl_set', 'acl_set']);
  } finally {
    gw.restore();
  }
});

test('jobs: optional owner filter for get / list / cancel', async () => {
  const gw = fakeGateway((op, _params, _body, options) => {
    if (op === 'acl_get') return CURRENT;
    async function* lines() {
      await new Promise((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (options.signal.aborted) abort();
        else options.signal.addEventListener('abort', abort);
      });
    }
    return Readable.from(lines());
  });
  try {
    const mine = await startPropagation(5, SERVER, 'shared', 'owners/a');
    const theirs = await startPropagation({ userId: 9, credential: CRED }, SERVER, 'shared', 'owners/b');
    // Existing signatures keep working (no filter).
    assert.equal(getJob(theirs.id).id, theirs.id);
    assert.equal(getJob(theirs.id, { userId: 5 }), null);
    assert.equal(getJob(theirs.id, { userId: 5, admin: true }).id, theirs.id);
    assert.equal(getJob(mine.id, { userId: '5' }).id, mine.id);
    const listed = listJobs({ userId: 5, running: true }).map((j) => j.id);
    assert.ok(listed.includes(mine.id) && !listed.includes(theirs.id));
    assert.ok(listJobs({ userId: 5, admin: true, running: true }).some((j) => j.id === theirs.id));
    assert.throws(() => cancelJob(theirs.id, { userId: 5 }), { code: 'NOT_FOUND' });
    assert.equal(getJob(theirs.id).state, 'running');
    assert.equal(cancelJob(mine.id, { userId: 5 }).state, 'cancelling');
    cancelJob(theirs.id);
    assert.equal((await waitForJob(mine.id)).state, 'cancelled');
    assert.equal((await waitForJob(theirs.id)).state, 'cancelled');
  } finally {
    gw.restore();
  }
});

// ── review fixes ────────────────────────────────────────────────────────────

test('who loses access: a new deny is listed even for a SID without an entry before', () => {
  const DOMAIN_ADMINS = `${DOM}-512`;
  const before = [allow(SYSTEM, 0x1f01ff), allow(ADMINS, 0x1f01ff), allow(HR_FULL, 0x1301bf)];
  const loss = accessLoss(before, [deny(DOMAIN_ADMINS, 0x1f01ff), ...before], { [DOMAIN_ADMINS]: 'Domain Admins' });
  assert.deepEqual(loss.map((e) => [e.sid, e.name, e.deny, e.losesAll, e.lost.this]), [[DOMAIN_ADMINS, 'Domain Admins', true, true, 0x1f01ff]]);
  // A widened deny lists only what is newly denied.
  const widened = accessLoss([deny(HR_FULL, 0x10000), ...before], [deny(HR_FULL, 0x10000 | 0x2), ...before]);
  assert.deepEqual(widened.map((e) => [e.sid, e.deny, e.lost.this & 0x2]), [[HR_FULL, true, 0x2]]);
  // Removing a deny loses nothing.
  assert.deepEqual(accessLoss([deny(HR_FULL, 0x10000), ...before], before), []);
});

test('self-removal: the admin’s rights over all their SIDs (allows minus denies)', () => {
  const IT = `${DOM}-1600`;
  const DOMAIN_ADMINS = `${DOM}-512`;
  const before = [allow(SYSTEM, 0x1f01ff), allow(ADMINS, 0x1f01ff), allow(IT, 0x1301bf)];
  const actorSids = [ALICE, IT, DOMAIN_ADMINS, ADMINS, EVERYONE];
  // A deny for a group the admin is in, which had no entry: a warning (and it is listed).
  const denied = checkGuards(before, [deny(DOMAIN_ADMINS, 0x1f01ff), ...before], { actorSids });
  assert.equal(denied.ok, true);
  assert.deepEqual(denied.warnings.map((w) => [w.code, w.sid]), [['SELF_ACCESS_REMOVED', DOMAIN_ADMINS]]);
  // Removing one group's entry while another of their groups grants the same: no warning.
  const covered = checkGuards(before, before.filter((ace) => ace.sid !== IT), { actorSids });
  assert.deepEqual(covered.warnings, []);
  assert.deepEqual(covered.loss.map((e) => e.sid), [IT]);
  // Without Administrators the same removal is a warning.
  const alone = checkGuards(before, before.filter((ace) => ace.sid !== IT), { actorSids: [ALICE, IT] });
  assert.deepEqual(alone.warnings.map((w) => w.sid), [IT]);
});

test('setAcl / restoreAcl: onBeforeWrite runs after the guards and before the write; a throw writes nothing', async () => {
  const order = [];
  const gw = fakeGateway((op, _params, body) => {
    const inherited = body.protected ? [] : CURRENT.aces.filter((ace) => ace.flags & INHERITED);
    const after = { ...CURRENT, aces: [...(body.aces || CURRENT.aces.filter((ace) => !(ace.flags & INHERITED))), ...inherited] };
    if (body.dryRun) return { dryRun: true, previous: { sd: 'OLD=', sddl: 'D:old', revision: 'rev-1' }, before: CURRENT, acl: { ...after, revision: null } };
    order.push(['write', op, body.revision, body.inherit]);
    return { previous: { sd: 'OLD=', revision: 'rev-1' }, acl: { ...after, revision: 'rev-2' } };
  });
  try {
    const aces = [allow(HR_FULL, 0x1301bf), allow(HR_READ, 0x1200a9)];
    await setAcl(5, SERVER, 'shared', '06-HR', { revision: 'rev-1', aces }, { onBeforeWrite: async (previous) => order.push(['journal', previous.sd]) });
    assert.deepEqual(order, [['journal', 'OLD='], ['write', 'acl_set', 'rev-1', 'auto']]);
    await assert.rejects(
      setAcl(5, SERVER, 'shared', '06-HR', { revision: 'rev-1', aces }, { onBeforeWrite: async () => { throw Object.assign(new Error('down'), { code: 'FA_JOURNAL_FAILED' }); } }),
      { code: 'FA_JOURNAL_FAILED' }
    );
    // A guard refusal never reaches the callback.
    let called = false;
    await assert.rejects(setAcl(5, SERVER, 'shared', '06-HR', { revision: 'rev-1', aces: [], protected: true }, { onBeforeWrite: async () => (called = true) }), { code: 'EMPTY_DACL' });
    assert.equal(called, false);
    assert.equal(order.length, 2);
    // Restore without a revision is pinned to what its dry run read; the inherit mode goes to the gateway.
    order.length = 0;
    await restoreAcl(5, SERVER, 'shared', '06-HR', { sd: 'OLD=' }, { inherit: 'keep', onBeforeWrite: async (previous) => order.push(['journal', previous.revision]) });
    assert.deepEqual(order, [['journal', 'rev-1'], ['write', 'acl_restore', 'rev-1', 'keep']]);
  } finally {
    gw.restore();
  }
});

test('running propagation jobs block writes on the folder, above and below it', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const gw = fakeGateway((op) => {
    if (op === 'acl_get') return CURRENT;
    throw new Error(op);
  });
  const restore = _setDeps({
    gateRequest: async (op) => {
      if (op === 'acl_get') return Readable.from([Buffer.from(JSON.stringify({ ...CURRENT, aces: BASE }))]);
      return Readable.from(
        (async function* lines() {
          await gate;
          yield Buffer.from(`${JSON.stringify({ type: 'result' })}\n`);
        })()
      );
    },
  });
  try {
    const job = await startPropagation(5, SERVER, 'shared', 'Dept/Sub');
    assert.equal(runningJob(SERVER, 'shared', 'Dept/Sub/Deeper').id, job.id);
    assert.equal(runningJob(1, 'SHARED', 'Dept').id, job.id, 'by server id, share case-insensitive, ancestor');
    assert.equal(runningJob(1, 'shared', 'Other'), null);
    assert.equal(runningJob(2, 'shared', 'Dept'), null);
    assert.throws(() => refuseWhileJobRuns(1, 'shared', ''), (err) => err.code === 'JOB_RUNNING' && err.statusCode === 409 && err.details.jobId === job.id);
    const dry = await startPropagation(5, SERVER, 'shared', 'Elsewhere', { dryRun: true });
    assert.equal(runningJob(1, 'shared', 'Elsewhere'), null, 'a count (dry run) does not block writes');
    release();
    await waitForJob(job.id);
    await waitForJob(dry.id);
    assert.equal(runningJob(1, 'shared', 'Dept'), null);
  } finally {
    restore();
    gw.restore();
  }
});

test('create folder group pair: the ntfs_attach row (undo copy) is journalled before the NTFS write and completed after', async () => {
  // The same wiring as drive/access/service.js createGroupPair, with a fake gateway and a fake journal.
  const pair = [
    { type: 'full', name: 'sg_co_hr_full', sid: HR_FULL },
    { type: 'read', name: 'sg_co_hr_read', sid: HR_READ },
  ];
  const folder = { shareId: 3, path: '06-HR', display: 'W:\\06-HR' };
  const journal = { batch: 'b1', folder, groups: pair };
  const run = async (handler, { journalDown = false } = {}) => {
    const order = [];
    const rows = [];
    const completed = [];
    const record = async (_actor, entry) => {
      if (journalDown) throw new Error('database down');
      order.push(['journal', entry.outcome]);
      rows.push(entry);
      return rows.length;
    };
    const complete = async (id, patch) => completed.push([id, patch]);
    const gw = fakeGateway((op, params, body) => {
      if (op === 'acl_set' && !body.dryRun) order.push(['write']);
      return handler(op, params, body);
    });
    let pendingId = null;
    try {
      const ntfs = await attachGroups(
        {
          actor: { userId: 5, credential: CRED },
          folder,
          groups: pair,
          rights: { full: 'modify', read: 'read_execute' },
          onBeforeWrite: async (previous, _preview, where) => {
            pendingId = await startNtfsAttach({ userId: 5 }, journal, previous, where, record);
          },
        },
        { resolve: async () => ({ server: SERVER, share: 'shared', path: '06-HR' }) }
      );
      if (ntfs.jobId) await waitForJob(ntfs.jobId);
      const journalId = await finishNtfsAttach({ userId: 5 }, pendingId, { ...journal, ntfs }, { record, complete });
      return { ntfs, journalId, order, rows, completed, writes: gw.calls.filter((c) => c.op === 'acl_set' && !c.body.dryRun).length };
    } finally {
      gw.restore();
    }
  };
  const dryRun = (body) => ({ dryRun: true, previous: { sd: CURRENT.sd, sddl: CURRENT.sddl, revision: 'rev-1' }, before: CURRENT, acl: { ...CURRENT, aces: [...body.aces, ...CURRENT.aces.filter((ace) => ace.flags & INHERITED)], revision: null } });

  // Applied: pending row with the undo copy first, then the write, then the row is completed.
  const ok = await run((op, _params, body) => {
    if (op === 'acl_get') return { ...CURRENT, aces: CURRENT.aces.filter((ace) => ace.sid !== HR_FULL) };
    if (op === 'acl_set') return body.dryRun ? dryRun(body) : { previous: { sd: CURRENT.sd, sddl: CURRENT.sddl, revision: 'rev-1' }, acl: { ...CURRENT, revision: 'rev-2', sddl: 'D:new' } };
    if (op === 'acl_propagate') return ndjson([{ type: 'result', done: 0, stopped: false, failedList: [], protectedList: [] }]);
    throw new Error(op);
  });
  assert.equal(ok.ntfs.status, 'applied');
  assert.deepEqual(ok.order, [['journal', 'pending'], ['write']]);
  assert.equal(ok.rows[0].action, 'ntfs_attach');
  assert.equal(ok.rows[0].via, 'hook');
  assert.equal(ok.rows[0].batch, 'b1');
  assert.deepEqual(ok.rows[0].before, { folder: { shareId: 3, path: '06-HR', display: 'W:\\06-HR', serverId: 1, share: 'shared', serverPath: '06-HR' }, sddl: CURRENT.sddl, sd: CURRENT.sd, revision: 'rev-1' });
  assert.equal(ok.journalId, 1);
  assert.equal(ok.completed.length, 1);
  assert.deepEqual([ok.completed[0][0], ok.completed[0][1].ok, ok.completed[0][1].outcome, ok.completed[0][1].after.revision, ok.completed[0][1].after.groups], [1, true, 'changed', 'rev-2', ['sg_co_hr_full', 'sg_co_hr_read']]);

  // Journal down: nothing is written, the hook reports FA_JOURNAL_FAILED and no row is attempted afterwards.
  const down = await run((op, _params, body) => {
    if (op === 'acl_get') return { ...CURRENT, aces: CURRENT.aces.filter((ace) => ace.sid !== HR_FULL) };
    if (op === 'acl_set') return body.dryRun ? dryRun(body) : assert.fail('written without a journal row');
    throw new Error(op);
  }, { journalDown: true });
  assert.deepEqual([down.ntfs.status, down.ntfs.code, down.writes, down.journalId], ['failed', 'FA_JOURNAL_FAILED', 0, null]);

  // Windows refuses the write: the pending row becomes 'failed' (nothing was written).
  const denied = await run((op, _params, body) => {
    if (op === 'acl_get') return { ...CURRENT, aces: CURRENT.aces.filter((ace) => ace.sid !== HR_FULL) };
    if (op === 'acl_set') {
      if (body.dryRun) return dryRun(body);
      throw gatewayError('ACCESS_DENIED');
    }
    throw new Error(op);
  });
  assert.deepEqual(denied.order, [['journal', 'pending'], ['write']]);
  assert.deepEqual([denied.ntfs.status, denied.completed[0][1].ok, denied.completed[0][1].outcome, denied.completed[0][1].errorCode], ['failed', false, 'failed', 'ACCESS_DENIED']);

  // Gateway lost mid-write: unknown whether it happened → the row stays 'pending' (undo possible).
  const lost = await run((op, _params, body) => {
    if (op === 'acl_get') return { ...CURRENT, aces: CURRENT.aces.filter((ace) => ace.sid !== HR_FULL) };
    if (op === 'acl_set') {
      if (body.dryRun) return dryRun(body);
      throw gatewayError('GATEWAY_TIMEOUT', 504);
    }
    throw new Error(op);
  });
  assert.deepEqual([lost.ntfs.status, lost.completed[0][1].ok, lost.completed[0][1].outcome], ['failed', true, 'pending']);

  // Nothing to change (groups already there): no write, no pending row, journalled in one step as 'unchanged'.
  const same = await run((op) => {
    if (op === 'acl_get') return { ...CURRENT, aces: [allow(HR_FULL, 0x1301bf), allow(HR_READ, 0x1200a9), ...CURRENT.aces.filter((ace) => ace.flags & INHERITED)] };
    throw new Error(op);
  });
  assert.deepEqual([same.ntfs.status, same.writes, same.completed.length, same.rows.length, same.rows[0].outcome], ['applied', 0, 0, 1, 'unchanged']);
});
