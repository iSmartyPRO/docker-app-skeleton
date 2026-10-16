# NTFS permissions engine

The File server's [access management](drive-access.md) (superadministrators, the folder panel's "NTFS permissions" tab) reads and changes the NTFS permissions of folders on the file servers. The work runs in the Drive module's SMB gateway:

- `modules/drive/gateway/ntacl.py` handles security descriptors, SDDL, inheritance and the propagation walk. It contains no SMB code.
- `modules/drive/gateway/smbgate.py` adds the `acl_*` operations.
- `modules/drive/acl.js` is the Node API. It provides pure helpers, the gateway calls and the propagation jobs.
- `modules/drive/aclHook.js` registers the engine with `drive/access/ntfsHook.js`, which is used for "create folder group pair".

**Identity.** Every call uses the acting administrator's **own** domain credential:

- either their drive credential (`credentialFor`);
- or an explicit `{ userId, credential }` passed by the access section.

The engine never falls back to a server's service account; it answers `CREDENTIALS_REQUIRED` instead. Windows enforces the rights. A credential the server rejects is parked, the same as in Drive.

**Share permissions are never touched.** Only the DACL is written, plus the owner when it is asked for. The SACL is never written.

## Gateway operations

All operations take the usual `server`, `cred`, `share` and `path` parameters, where `path` is relative to the share. Bodies are JSON.

| Op | Input | Output |
|----|-------|--------|
| `acl_get` | — | `{ path, isDir, owner, group, control, protected, autoInherited, nullDacl, canonical, aces[], sddl, sd, revision }`. Each ACE is `{ type: allow\|deny\|other, sid, mask, flags, flagNames: [OI,CI,NP,IO,INHERITED], inherited }`. `sd` is the raw descriptor in base64. `revision` is a hash of the raw descriptor. |
| `acl_set` (body) | `{ revision, aces: explicit ACEs, protected, owner?, inherit?: auto\|keep\|parent, dryRun? }` | `{ previous: { sd, sddl, revision }, acl }`. With `dryRun`, it returns `{ dryRun, previous, before, acl: predicted, guard: [problems] }`. |
| `acl_restore` (body) | `{ sd: base64 \| sddl, revision?, owner?: bool, inherit?: auto\|keep\|parent, dryRun? }` | Same as `acl_set`. A protected saved DACL is written as it was. One that inherits gets its explicit entries and protection back; the inherited part is the folder's current one, or recomputed from the parent (`parent`, and with `auto` when the folder is protected now; at the share root the saved inherited part is used). |
| `acl_propagate` (stream) | Params: `mode: inherit\|replace`, `dryRun`, `marker`. Body: `{ retry: [paths] }`. | NDJSON lines. See [Propagation](#propagation). |

How `acl_set` works:

1. It opens the object with `READ_CONTROL|WRITE_DAC`. `WRITE_OWNER` is added only when the requested owner differs from the current one, which is read first. A restore with `owner: true` and an unchanged owner therefore works with just "Change permissions". If the owner changes between that read and the write, the answer is `STALE`. A dry run opens with `READ_CONTROL` only.
2. It re-reads the descriptor on the same handle. If the revision differs from the one passed in, it answers `STALE` (409).
3. The caller sends only the **explicit** ACEs. An ACE marked `INHERITED` is refused with `BAD_ACL`. The inherited part depends on protection:
   - **Protected:** there is no inherited part. To "convert" when disabling inheritance, pass the inherited ACEs as explicit ones (`disableInheritanceAces(aces, 'convert')`).
   - **Not protected, `keep`:** the current inherited ACEs are kept.
   - **Not protected, `parent`:** the inherited ACEs are recomputed from the parent folder. `auto` does this when protection is being turned off. On the share root this answers `NO_PARENT`.
4. The new DACL is written in canonical order: explicit deny, then explicit allow, then inherited. The control flags are `AI`, plus `P` when protected.
5. Before writing, the gateway runs the [guards](#guards) on the full new DACL (explicit and inherited) against the current one. It refuses with `PROTECTED_PRINCIPAL` or `EMPTY_DACL` (422). `acl_restore` goes through the same check.

Gateway error codes:

- `ACCESS_DENIED` (403)
- `STALE` (409)
- `NOT_FOUND` / `SHARE_NOT_FOUND` (404)
- `AUTH_FAILED`, `ACCOUNT_LOCKED`, … (401 from the gateway, 403 in Node)
- `BAD_ACL` (400): a malformed ACL or SID, or unsupported SDDL
- `INVALID_OWNER` (400)
- `NO_PARENT` (409)
- `PROTECTED_PRINCIPAL`, `EMPTY_DACL` (422): see [Guards](#guards)
- `UNSAFE_SOURCE` (422): `acl_propagate` refused, see [Propagation](#propagation)
- `SERVER_UNREACHABLE` (502)

## Guards

SYSTEM (`S-1-5-18`) and Administrators (`S-1-5-32-544`) must keep their access. Node (`checkGuards`, `guardErrors`) and the gateway (`ntacl.guard_problems`) apply the same rule, so a caller that skips Node is still refused.

- **Rights of a guarded SID** are worked out per scope: this folder, subfolders and files. For a file, only the file itself counts.
  - **Allow** ACEs count when they name the SID itself, Everyone (`S-1-1-0`) or Authenticated Users (`S-1-5-11`). SYSTEM and every administrator are always in those two groups.
  - **Deny** ACEs count when they name the SID itself or an umbrella group an administrator may be in: Everyone, Authenticated Users, Users (`S-1-5-32-545`) or Domain Users (domain RID 513). A `deny Everyone` therefore locks SYSTEM and Administrators out, and is refused.
  - Generic rights are mapped. Other group membership is not expanded.
- **NULL DACL.** A folder with a NULL DACL (no DACL at all) counts as Everyone: Full Control before the change. Replacing it with a DACL that grants SYSTEM and Administrators less than Full Control is refused.
- **Refused changes:**
  - `PROTECTED_PRINCIPAL`: the new DACL takes away any right SYSTEM or Administrators had, in any scope.
  - `EMPTY_DACL`: the new DACL has no entries. This is always refused, whatever the DACL was before.
- **Restore (undo)** has no bypass. Restoring a saved descriptor, even one this module saved, is checked the same way as any change against the current DACL. In practice this means:
  - An undo that would take SYSTEM or Administrators access away (for example, undoing a change that added them) is refused.
  - A saved descriptor with an empty DACL is never written back.
  - A saved descriptor without a DACL is refused with `BAD_ACL`.
- **Self-removal.** Losing the actor's own access is a separate warning, `CONFIRM_SELF_REMOVAL` (Node only). The actor's rights are counted over all `actorSids` together (allows minus denies, per scope) before and after; a loss in any scope is the warning. Membership beyond `actorSids` is not expanded.
- **Who loses access** (`accessLoss`) lists every SID whose effective rights shrink, and every SID with a new or widened deny (`deny: true`), even one with no entry before: its members lose those rights whatever else grants them.

## Node API (`modules/drive/acl.js`)

`actor` is either a `userId` or `{ userId, credential }`. `server` is a `drive_servers` row or its id. `share` is the share name on the server, e.g. `shared`. `resolveDriveFolder(shareId, path)` maps a drive entry and a path inside it to `{ server, share, path }`.

**Reading and writing:**

- `getAcl(actor, server, share, path, { names })` returns the ACL with SID names, presets and "applies to" for each ACE.
- `previewAcl(actor, server, share, path, change, { actorSids })` returns `{ before, after, guards, inheritableChanged }`. It writes nothing.
- `setAcl(actor, server, share, path, { revision, aces, protected, owner?, inherit? }, { actorSids, confirmSelfRemoval, onBeforeWrite })` returns `{ previous, acl, guards, inheritableChanged }`. `onBeforeWrite(previous)` runs after the guards passed, right before the write (pinned to that revision); if it throws, nothing is written. Folder access journals the undo copy there.
- `restoreAcl(actor, server, share, path, { sd } | { sddl }, { revision, owner, inherit, onBeforeWrite })` is undo. Without `revision` the write is pinned to the revision its own dry run read.
- `runningJob(server, share, path)` / `refuseWhileJobRuns(…)`: the unfinished propagation (not a dry run) on the folder, above or below it on the same share / `409 JOB_RUNNING`. The access section refuses apply and undo with it.

**Propagation jobs:**

- `startPropagation(actor, server, share, path, { mode, dryRun, marker, retry, onFinish })` starts a job.
- `startPropagation` refuses with `UNSAFE_SOURCE` (422) when the folder has a NULL DACL, or when its DACL passes no access down to SYSTEM and Administrators for both child folders and files. The check reads the folder first; pass `sourceAcl` to skip the read when the ACL was just read or written. Retry jobs skip this check, because the gateway checks each retry parent.
- `getJob(id, { userId, admin })`, `listJobs({ userId, running, admin })`, `cancelJob(id, { userId, admin })` and `waitForJob(id)` manage jobs. With `userId` and without `admin: true`, only jobs that user started are visible. Another user's job reads as `null` or `NOT_FOUND`. Without the options there is no filter (internal callers). Routes must pass the acting user, or `admin: true` for superadministrators.

**Granting groups:**

- `addGroupsToFolder(actor, server, share, path, [{ sid, preset: 'modify' | 'readExecute' | … }], { propagate = true })` returns `{ changed, previous, acl, job, propagationError }`. `propagationError` (`{ code, message }`, e.g. `UNSAFE_SOURCE` or `JOB_RUNNING`) means the folder itself was changed but its children were not. The undo blob in `previous` is still valid. The Folder access hook passes it on as `propagationError`.

**Pure helpers:**

| Helper | What it does |
|--------|--------------|
| `PRESETS`, `presetMask`, `presetOf`, `includedPresets`, `mapGeneric` | Rights presets: Full Control `0x1F01FF`, Modify `0x1301BF`, Read & Execute `0x1200A9`, List folder contents (`0x1200A9`, folders only: `CI`), Read `0x120089`, Write `0x100116`. |
| `APPLIES_TO`, `appliesToFlags`, `flagsToAppliesTo` | Convert between "applies to" choices and ACE flags. |
| `canonicalize`, `isCanonical` | Canonical ACE order. |
| `effectiveRights`, `accessLoss`, `losesAccess`, `checkGuards` | Rights and loss per scope: this folder, subfolders, files. |
| `guardedRights`, `guardErrors`, `propagationSourceProblems` | The [guards](#guards) and the propagation source check. |
| `disableInheritanceAces`, `whoLosesOnDisableInheritance` | What "Disable inheritance" leaves and who loses access. |
| `withGroups`, `inheritableChanged` | Add groups to explicit ACEs; check whether the change reaches children. |
| `wellKnownName`, `sidName` | Names for SYSTEM, CREATOR OWNER/GROUP, Administrators, Users, Everyone, Authenticated Users, and Domain Admins/Users by RID. |

Node error codes:

- `ACCESS_DENIED`: no `WRITE_DAC` (the NTFS "Change permissions" right), or no `READ_CONTROL` for reads.
- `STALE`
- `NOT_FOUND`
- `AUTH`: the server rejected the credential. `details.reason` holds the gateway code.
- `CREDENTIALS_REQUIRED`
- `PROTECTED_PRINCIPAL` (422): SYSTEM `S-1-5-18` or Administrators `S-1-5-32-544` would lose any right in any scope, umbrella denies and a NULL DACL included (see [Guards](#guards)). Always refused.
- `EMPTY_DACL` (422): the new DACL would be empty. Always refused.
- `UNSAFE_SOURCE` (422): propagation refused for the source folder.
- `CONFIRM_SELF_REMOVAL` (409): one of `actorSids` loses rights. Pass `confirmSelfRemoval` after the person types the folder name.
- `JOB_RUNNING` (409)
- `REVISION_REQUIRED`

Group membership is not expanded in the loss checks, apart from the umbrella groups in [Guards](#guards). A user who keeps access through another group still counts as losing it.

## Propagation

SMB servers do not propagate inheritance; the Windows client (Explorer, icacls) does. `acl_propagate` does the same work. It walks the tree below the folder in pre-order, with names sorted case-insensitively. For every child it rebuilds the DACL as follows:

- **Explicit ACEs** stay as they are, put in canonical order. In `replace` mode they are removed, which is the "Replace all child object permission entries…" checkbox.
- **Inherited ACEs** are recomputed from the parent's new DACL the way Windows does it:
  - A child folder gets `CI` ACEs as effective ACEs. Unless `NP` is set, they keep `OI`/`CI` for further levels.
  - A child folder gets `OI`-only ACEs (without `NP`) as inherit-only `OI|IO` copies.
  - A file gets `OI` ACEs with no inheritance flags.
  - `NP` stops an ACE after one level.
  - `CREATOR OWNER` and `CREATOR GROUP` become the child's owner and group in the effective ACE. Generic rights become specific file rights. When the ACE also passes further down, an inherit-only copy keeps the original SID and mask.
  - Every inherited ACE carries `INHERITED` and keeps the parent's order.

**Safety.** Propagation must never lock SYSTEM or Administrators out of a tree:

- **Unsafe source.** The walk does not start when the source folder has a NULL DACL, or does not pass an allow to SYSTEM and to Administrators for both child folders and files. This is checked in Node, by the gateway before it answers 200, and by `Propagation.run`. The refusal is `UNSAFE_SOURCE` (422).
- **Unsafe child DACL.** A computed child DACL is not written if it is empty (`EMPTY_DACL`), or if it takes access away from SYSTEM or Administrators compared with the child's current DACL (`PROTECTED_PRINCIPAL`). `NP` on the source can cause the first, and `replace` mode the second. Such a child goes to `failedList` with `stage: compute`, and its subtree is skipped. Dry runs report these too.
- **Unsafe parent on disk.** A retry whose parent, or a resume ancestor whose DACL on disk, fails the source check is skipped as `UNSAFE_SOURCE`.

The walk follows these rules:

- **Protected objects** (`P`) and everything below them are not changed. They are reported in `protectedList`. Windows' checkbox would also reset them; this engine deliberately does not.
- **Unchanged objects** are not written: `unchanged` counts them.
- **Per-object errors** (access denied, locked, unreadable) go to `failedList` as `{ path, code, stage: read|list|write|compute }`, and the walk continues. A folder that fails is not descended into, because its children would otherwise get ACEs from a DACL that is not on disk. A failed object never becomes the resume `marker`, so a resumed walk processes it and its subtree again instead of treating its stale DACL on disk as finished.
- **Fatal errors** stop the walk with an `error` line: rejected credentials, an unreachable server, or a missing share.
- **Reparse points** (junctions) are updated but not followed.

The NDJSON lines are:

- `progress`: at most two per second. Carries `path` and the counters `done`, `changed`, `unchanged`, `failed`, `protected`, `withExplicit` and `explicitRemoved`.
- `failed` and `protected`: one per object.
- `result`: the final line. Carries the counters plus `stopped`, `marker`, `failedList` and `protectedList`.
- `error`: replaces `result` when the walk stops on a fatal error. It carries the same fields plus `code`.

You can control the walk in these ways:

- **Dry run.** `dryRun` writes nothing. Its `withExplicit` is the number of objects whose explicit entries `replace` would remove; show it for confirmation.
- **Cancel.** Node closes the connection and the gateway stops before the next object.
- **Long walks.** The walk holds its session pool for its whole duration. Every read, write and listing refreshes the pool's last-used time. The idle reaper (`SMBGATE_IDLE`, 300 s), retired-pool expiry and `logout` leave a held pool alone, and close it after the walk ends.
- **Resume.** Pass `marker`, the last path reported. Objects up to and including the marker in walk order are skipped. Their DACLs on disk serve as parents. Re-processing is idempotent, so a marker that lags behind is harmless.
- **Retry.** `retry` re-runs the listed paths and their subtrees, using each parent's DACL on disk.

Node runs this as an in-memory job. There is one job per folder; overlapping folders on the same share are refused. The job keeps live progress and `marker`, and can be cancelled. Finished jobs are kept for 6 hours. Jobs do not survive a restart: persist `job.marker` (for example in the journal) to resume later.

## Undo format

`acl_set` and `acl_restore` return `previous = { sd, sddl, revision }`:

- `sd` is the **exact binary descriptor** (owner, group, DACL) in base64. It is the authoritative undo blob and is lossless, including ACE types the SDDL subset cannot express ("other" ACEs are kept byte for byte).
- `sddl` is a rendering for people and for the journal, e.g. `O:BAG:SYD:PAI(A;OICI;FA;;;SY)(A;OICI;0x1301bf;;;S-1-5-21-…-4001)`. `acl_restore` also accepts SDDL in this subset: `O:`, `G:`, `D:` with `P`/`AI`/`AR` and `(A|D;flags;rights;;;sid)` ACEs. It does not accept SACLs, object ACEs or NULL DACLs.
- Undo calls `restoreAcl(…, { sd }, { revision: <revision right after the change> })`. If the folder changed since, the answer is `STALE`. Show the difference, then call again with the revision the difference was made on to force the restore (a change after that is `STALE` again).

## Limitations / to verify on a test folder

- Writes have only been tested against a simulated file system (`gateway/test_acl.py`; run it with `cd src/backend/modules/drive/gateway && PYTHONDONTWRITEBYTECODE=1 python3 test_acl.py`: the gateway's `__pycache__` is tracked in git and must not be rewritten by test runs). Before using them on real folders, check them with a test folder on the real server, in particular that Windows stores the `P` and `AI` control bits sent with `DACL_SECURITY_INFORMATION`.
- Descriptors larger than 64 KB (the QUERY_INFO output buffer) are not read.
- Owner changes need the right to take ownership, or `SeRestorePrivilege` to set another owner.
- Propagation through very large trees runs at SMB round-trip speed: one read and, if the DACL changed, one write per object.
