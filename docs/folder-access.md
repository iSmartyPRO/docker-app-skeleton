# Folder access

«Доступ к папкам» shows and changes who can open which folder on the company file server. Access to a folder is given by a pair of Active Directory security groups; the module lists them, explains them in plain words and changes their membership. Off by default (*Settings → Modules → Folder access*).

- [How folders map to groups](#how-folders-map-to-groups)
- [Roles](#roles)
- [Whose account makes the changes](#whose-account-makes-the-changes)
- [Delegation in Active Directory](#delegation-in-active-directory)
- [Screens](#screens)
- [Journal and undo](#journal-and-undo)
- [Settings](#settings)
- [API](#api)
- [NTFS permissions mode](#ntfs-permissions-mode)
- [Mismatch report](#mismatch-report)
- [Group pair and NTFS](#group-pair-and-ntfs)

## How folders map to groups

```
sg_co_hr_full   description  W:\06-HR;Full Access
sg_co_hr_read   description  W:\06-HR;Read Only
```

| Part | Meaning |
|------|---------|
| `sg_` | Prefix of folder groups (*security group*), a setting |
| `co` | Organisation code. New groups use the configured code; existing names may use any accepted code (`co`, and the old `wh`) |
| `hr` | Folder name part; may contain `_` (`sg_co_project_alpha_full`) |
| `_full` / `_read` | Full access / read only |
| `W:\06-HR` | Folder: drive letter and path. The letter is mapped to a File server folder in the settings (`W:` → `\\10.0.0.10\shared`) |
| `Full Access` / `Read Only` | Access type, must match the name |

Groups whose name or description does not fit are shown with **Needs review** and the reasons: name without `_full`/`_read`, unknown organisation code, no description or not `path;type`, unknown access type, path without a drive letter, name and description giving different types, unmapped drive letter, only one group of a pair, the two groups pointing at different folders.

Groups without the prefix that match *Other groups* (default `nextcloud_*`) are listed for superadministrators only.

A membership change takes effect after the person's next Windows logon (or when the network drive reconnects); the module says so after every change.

## Roles

| Who | How | Can |
|-----|-----|-----|
| Superadministrator | portal permission `*` | Everything: both modes (*Access groups*, *NTFS permissions*), all groups including protected and other ones, any kind of member (people, groups, computers), create a group pair, edit descriptions, delete groups, undo any membership change, the full journal |
| System administrator | portal permission `folderaccess.groups` (a role with it, through portal roles/groups) | *Access groups* only: see `sg_` groups and their members; add / remove people; move a person between `_full` and `_read`; person card; copy access from another person; revoke all. Undo **their own** membership changes; the journal of membership changes |
| Anyone else | — | The section answers "no access" |

System administrators are refused on the server (not only hidden in the UI): protected groups (*Protected groups*, default `sg_*_root_*`, and any group whose description points at a drive root such as `W:`), groups without the prefix, `sg_` groups that do not fully parse (`FA_GROUP_NEEDS_REVIEW`: no `_full`/`_read` type in the name, an organisation code that is not accepted, a missing or malformed description, name and description types that differ — e.g. `sg_vpn_users`), groups outside the managed OU (*Where groups are searched*, or when that is empty the *OU for new groups*, if set), members that are not user objects (groups, computers, contacts), creating / describing / deleting groups, the NTFS mode, other people's undo.

"Sign in as" (impersonation) sessions only read. API tokens get nothing (`403 FA_NO_TOKENS`).

## Whose account makes the changes

**All changes run with the acting administrator's own AD account**, never with the portal's service account. Active Directory decides whether they may change a group; the portal roles above are an extra layer. A refusal by AD shows as "Active Directory refused: your AD account has no rights to change this group" (`FA_AD_DENIED`).

The service account (Settings → Integrations → Active Directory) is used only for reading: listing groups, members and people.

Credentials:

1. The portal account must be linked to an AD account (signed in with AD, or linked in *Users → the person → Domain account*). Not linked → the section is read-only. Before each change the account is looked up fresh with the service account — by its objectGUID (`users.directory_guid`), else by the stored DN — so a person moved to another OU, or who signs in with a code or Google, still binds as themselves. The journal's *AD account* is the account that actually bound.
2. The password is the person's domain password that the File server module keeps (`drive_credentials`, `server_id NULL`): remembered at AD sign-in (when the File server's "remember the sign-in password" is on) or set by a superadministrator. Its user name must name the same AD account (login, `DOMAIN\login` or UPN); a password saved for another account is not used and the person is asked for their own (`FA_CREDENTIALS_REQUIRED`, reason `OTHER_ACCOUNT`). When the service account cannot find the account but its objectGUID is known, the bind uses the saved user name (UPN / `DOMAIN\login`) and the account is then checked by objectGUID with the person's own connection; without an objectGUID the answer is `FA_ACCOUNT_NOT_FOUND`.
3. When there is none, it cannot be decrypted, or AD rejected it before, the section asks for the password, checks it with an LDAP bind as the person's own DN and saves it sealed (`source = 'self'`; a password set by a superadministrator keeps `source = 'admin'`). The File server uses the same row, so the person does not have to enter it twice.
4. A password AD rejects is parked (`status` = `AUTH_FAILED`, `ACCOUNT_LOCKED`, `PASSWORD_EXPIRED`…) and not retried, so a stale password never locks the account. The File server honours the same status. AD answers "data 52e" both for a wrong password and for a name that does not exist, so a plain `AUTH_FAILED` parks the password only when the bind used a DN the service account has just found.

The password is never shown, returned or logged. Checking it is limited to 3 attempts in 15 minutes per person (each wrong one is a real bad-password bind and counts toward the AD lockout threshold).

## Delegation in Active Directory

Because changes run as the administrator, their AD account needs the rights:

| Action | Right in AD |
|--------|-------------|
| Add / remove members | *Write Members* (the `member` attribute) on the `sg_` groups — e.g. delegate on `OU=Groups,OU=CO,OU=Accounts,…`: *Descendant Group objects → Write Members* to a group of IT administrators |
| Create a group pair | *Create Group objects* on the OU for new groups (superadministrators) |
| Edit a description | *Write description* on the groups |
| Delete a group | *Delete Group objects* / *Delete* on the groups |

Do not give system administrators rights on the protected root groups in AD either: the portal refuses them, AD should too.

LDAP on port 389 without TLS is accepted (protected DC network); LDAPS works with the integration's TLS and CA settings.

## Screens

- **Folders** — every folder (a `_full`/`_read` pair), its path, the File server folder, member counts, flags (protected, needs review, old organisation code). Search by folder, path or group; filter *Needs review*; superadministrators also see *Other groups* and **New folder group**.
- **Folder card** — the two groups side by side with their members: name, login, department, active / disabled. Add people (search by name, login or e-mail), remove, move to the other group (one action: add to the new group, then remove from the old; if the removal fails the addition is rolled back). Superadministrators: edit description, delete group (type its name).
- **People / person card** — every folder group the person is in, with change type and remove; *Give access to a folder*; **Copy access from…** (adds every folder group of the colleague, nothing is taken away; groups the administrator may not change are skipped and listed); **Revoke all access** (confirm; protected groups stay for system administrators).
- **Journal** — see below.
- **NTFS permissions** (superadministrators) — see [NTFS permissions mode](#ntfs-permissions-mode).
- **Mismatch report** (superadministrators) — see [Mismatch report](#mismatch-report).
- **Password prompt** — appears when a change needs the domain password; the change is repeated once after it is saved.

Group lists are cached for 60 seconds and re-read after every change; *Refresh* reads AD again. Groups with more than 1500 members are read with ranged retrieval; searches are paged.

## Journal and undo

Table `fa_journal`, one row per object changed:

| Column | Meaning |
|--------|---------|
| `at`, `batch` | When; rows of one request share a batch id |
| `kind`, `action` | `membership` (`member_add`, `member_remove`, `member_move`), `group` (`group_create`, `group_describe`, `group_delete`) or `ntfs` (`ntfs_set`, `ntfs_restore`, `ntfs_attach`, `ntfs_propagate`) |
| `via` | `single`, `copy`, `revoke_all`, `undo`; NTFS rows also `fix` (from the report), `hook` (group pair), `retry`, `resume` |
| `user_id`, `user_name`, `user_login`, `ad_account`, `ip`, `user_agent` | Who: the portal person and the AD account the change ran as |
| `group_*`, `to_group_*`, `member_*` | The group(s) and the member. NTFS rows: `group_name` = the folder's display path (`W:\06-HR`), so the group filter finds it |
| `before`, `after` | JSON: membership flags, descriptions; a deleted group keeps its description, SID and up to 500 member DNs. NTFS writes: `before = { folder: { shareId, path, display, serverId, share, serverPath }, sddl, sd (base64 descriptor — the undo blob), revision }`, `after = { sddl, revision, protected, summary: { added, removed, inheritedAdded, inheritedRemoved, protectedBefore, protectedAfter } }`; propagation: counters, up to 50 failed objects, marker, `before.confirmCount` for a confirmed *replace*. NTFS writes from the editor and undos are journalled in two steps: the row with the undo copy is inserted (outcome `pending`) right before the write — if that insert fails nothing is written (`503 FA_JOURNAL_FAILED`) — and completed after it (`changed` / `unchanged`; a refusal at write time drops the row, `ACCESS_DENIED` marks it failed, an unclear error such as a timeout leaves it `pending`). When completing fails the answer carries `journalWarning: true` and the UI says so; a `pending` row can still be undone (through the difference). The `sd` blob is never sent to the browser or the CSV |
| `ok`, `outcome`, `error_code`, `error` | `changed`, `unchanged` (already so), `failed`, `rolled_back` |
| `undo_of`, `undone_by` | Links between a change and its undo |

Filters: period, action, who, result, "only mine", text (person, group, account, IP); CSV export (Excel-friendly, formula-guarded, times in the viewer's zone). System administrators see membership rows only, and only of groups they see (with the prefix, not matching *Protected groups*); superadministrators see everything. A failed journal write after a successful AD change does not turn it into a failure: the result still says "changed" (the server log has the database error).

**Undo** applies the inverse operation of a membership change that changed something (add ↔ remove; a move goes back, or only the part it changed). System administrators undo only their own changes; superadministrators any. When a later successful membership change of the same person in the same group exists (A adds X, B removes X, C adds X again — undoing A's would revert C's), the answer is `409 FA_UNDO_SUPERSEDED` with `info.later` (journal ids); the UI asks and repeats with `confirm: true`. Group creation, descriptions and deletions are not undone here.

**NTFS undo** (superadministrators, `ntfs_set`, `ntfs_restore`, `ntfs_attach` rows that changed something, or are still `pending`): writes back the saved descriptor (`before.sd`) with `restoreAcl`, guarded by the revision the folder had right after the change. A saved DACL with inheritance disabled is written as it was; one that inherits gets back its explicit entries and protection, while the inherited part stays the folder's current one (recomputed from the parent when the folder has inheritance disabled now) — the saved inherited copies may be out of date. If the folder changed since, the answer is `409 STALE` with the difference (current → restored, explicit and inherited entries, who loses access) and the current `revision`; the UI shows it and *Restore anyway* repeats with `force` and that `revision`, so a change made after the difference was shown is refused again (`STALE`). Guards apply as for any write (SYSTEM / Administrators keep access; own access → type the folder name). Undo is refused with `409 JOB_RUNNING` while a propagation runs on the folder, above or below it (e.g. the one started by a group pair). When the restored folder passes other entries down, the server starts an `inherit` propagation right away (journalled `ntfs_propagate`, `via = undo`) and the dialog shows its progress; if it cannot start, the dialog says so. The undo is itself an `ntfs_restore` row and can be undone. Propagations are journalled (`ntfs_propagate`) but not undone.

Every request that changes AD also records a security event (*Admin → Activity*): `folder_access_changed`, `folder_group_changed`, `folder_access_password` when the domain password is saved or rejected, and `folder_ntfs_changed` for NTFS writes, undos and propagations.

## Settings

*Settings → Modules → Folder access* (module settings in `modules/catalog.js`, `FOLDERACCESS_DEFAULTS`):

| Setting | Default | Meaning |
|---------|---------|---------|
| `prefix` | `sg_` | Prefix of folder groups |
| `orgCode` / `orgCodes` | `co` / `co, wh` | Code for new groups / codes accepted in names |
| `nameTemplate` | `{prefix}{org}_{name}_{type}` | Names of new groups |
| `groupsBase` | AD base DN | Where groups are searched; system administrators may change only groups under it (when empty: under `newGroupOu`, if set) |
| `newGroupOu` | empty (creation off) | Where new pairs are created, e.g. `OU=Groups,OU=CO,OU=Accounts,DC=whitehills,DC=kg` |
| `subjectsBase` | domain root from the base DN | Where people (and NTFS subjects) are searched |
| `driveMap` | — | Drive letter → File server folder, e.g. `W` → «ЦО» (`\\10.0.0.10\shared`) |
| `typeMap` | full → Modify, read → Read & execute | NTFS rights per access type: used when a group pair is added to its folder and as the expected rights in the mismatch report |
| `protectedGroups` | `sg_*_root_*` | Groups system administrators cannot change |
| `otherGroups` | `nextcloud_*` | Groups without the prefix shown to superadministrators |

## API

`/api/app/folderaccess` (signed in; module enabled; `*` or `folderaccess.groups`; no API tokens). Every change is `POST`/`PUT` and runs as the caller's AD account; it answers `403 FA_CREDENTIALS_REQUIRED` / `FA_CREDENTIALS_FAILED` when the password is needed, `403 FA_NOT_LINKED` for accounts without AD.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/` | Role, `canWrite`, `readOnly` reason, credential state (never the password), settings summary |
| `GET` | `/folders?q=&refresh=1` | Folders the role sees, with groups, flags and `editable` |
| `GET` | `/folders/:key` | Folder with members of each group |
| `GET` | `/people?q=&kind=all` | Directory search (`kind=all`: also groups and computers, superadministrators) |
| `GET` | `/person?dn=` | Person and their folder groups |
| `PUT` | `/password` | `{ password }` — check with a bind and save |
| `POST` | `/members` | `{ groupDn, members: [dn], action: 'add' | 'remove' }` (≤ 100) |
| `POST` | `/members/move` | `{ fromDn, toDn, members: [dn] }` |
| `POST` | `/members/copy` | `{ fromDn, toDn }` |
| `POST` | `/members/revoke-all` | `{ memberDn, confirm: true }` |
| `POST` | `/groups` | Superadministrators: `{ name, path }` → `{ groups, ntfs }` |
| `PUT` | `/groups/description` | Superadministrators: `{ dn, description }` |
| `POST` | `/groups/delete` | Superadministrators: `{ dn, confirm: <group name> }` |
| `GET` | `/journal`, `/journal/people`, `/journal/export.csv` | Filters: `from`, `to`, `actions`, `user`, `mine`, `result`, `group`, `member`, `q`, `page`, `pageSize`, `tz` |
| `POST` | `/journal/:id/undo` | `{ confirm? }` — inverse membership operation; `409 FA_UNDO_SUPERSEDED` with `info.later` when a later change touched the same person and group |
| `GET` | `/ntfs` | Superadministrators (all `/ntfs*`; system administrators get `403 FA_SUPERADMIN_ONLY`): File server folders with drive letters, presets, "applies to" values, the type mapping |
| `GET` | `/ntfs/tree?shareId=&path=` | Subfolders (read with the admin's account) |
| `GET` | `/ntfs/acl?shareId=&path=&sources=0` | Owner, entries with names (`subject`: name, kind, `unknown`, `unavailable`, sg_ group → `folderKey`), `inheritedFrom`, `revision`, `sddl`; the folder's own sg_ groups with expected preset and presence; `confirmName`; `namesUnavailable` when the directory could not be asked |
| `GET` | `/ntfs/subjects?q=` | Users, groups (incl. Builtin), computers and well-known principals with SIDs, from *Where people are searched* |
| `POST` | `/ntfs/preview` | `{ shareId, path, revision, aces: explicit, protected, inherit }` → `{ before, after, summary, guards, selfRemoval, confirmName, inheritableChanged, stale }`; writes nothing |
| `POST` | `/ntfs/apply` | Same body + `confirmName` (own access), `via: 'fix'` → `{ acl, summary, inheritableChanged, journalId, journalWarning }`; `409 STALE`, `409 CONFIRM_SELF_REMOVAL`, `409 JOB_RUNNING` (a propagation runs on the folder, above or below it), `422 PROTECTED_PRINCIPAL` / `EMPTY_DACL`, `503 FA_JOURNAL_FAILED` |
| `POST` | `/ntfs/journal/:id/undo` | `{ force?, revision? (required with force: the one from the STALE answer), confirmName?, propagate? (default true) }` → `{ acl, summary, inheritableChanged, job, propagationError, journalId, journalWarning }`; `409 STALE` with `info: { current, restored, revision, summary, guards, inheritableChanged }`, `409 JOB_RUNNING` |
| `POST` | `/ntfs/propagate` | `{ shareId, path, mode: 'inherit' \| 'replace', dryRun?, confirm + confirmCount (replace: the number of objects with own entries the dry run showed), marker?, retry?: [paths] }` → `202 { job }`; `400 FA_CONFIRM`, `422 UNSAFE_SOURCE`, `409 JOB_RUNNING` |
| `GET` / `POST` | `/ntfs/jobs`, `/ntfs/jobs/:id`, `/ntfs/jobs/:id/cancel` | Job progress (`done`, `changed`, `unchanged`, `failed`, `protected`, `withExplicit`, `explicitRemoved`), `failedList`, `protectedList`, `marker` |
| `POST` / `GET` | `/ntfs/report`, `/ntfs/report?id=`, `/ntfs/report/:id/cancel` | Mismatch report job (one at a time), `{ state, progress: { done, total }, rows }` |

NTFS errors from the file server are passed on: `ACCESS_DENIED` (no *Read / Change permissions* right), `NOT_FOUND`, `SERVER_UNREACHABLE`…; a password the file server rejects is parked and answered as `FA_CREDENTIALS_FAILED` (the UI asks for it again).

Membership results: `{ results: [{ ok, outcome, code, error, rolledBack, group, member }], changed, unchanged, failed, notice: 'logon' }`.

## NTFS permissions mode

Superadministrators only (enforced on the server). Every read and write of permissions goes to the file server with the administrator's **own** domain account (the password above), through the Drive module's SMB gateway (`drive/acl.js`, [ntfs-permissions.md](ntfs-permissions.md)). The service account only resolves SIDs to names. A "sign in as" session can look but not preview, apply, undo, propagate, run or stop the report, and a password the file server rejects during such a session is not parked (the other person's saved password stays as it is); API tokens get nothing.

- **Tree** — the File server folders (*File server → Settings*), labelled with their drive letter from *Drive letters*; subfolders are listed with the admin's account.
- **Folder** — owner, then the entries as in the Windows *Advanced Security Settings*: type (allow / deny), principal, access (*Full control*, *Modify*, *Read & execute*, *List folder contents*, *Read*, *Write*, *Special*), *Inherited from* (the nearest folder above inside the File server folder with a matching explicit entry; else "Parent object"), *Applies to*. Principals are resolved by SID (service account, cached 10 min) and a built-in table of well-known SIDs; unknown SIDs are shown raw with *Unknown account*; when the directory cannot be asked (not set up, LDAP error) nothing is called unknown and a notice says the names are unavailable; `sg_` groups link to their folder card. The folder's own `sg_` groups (from their descriptions) are listed with the expected rights and whether they are present (*Add to draft* when not).
- **Draft** — add / edit / remove explicit entries (principal search over users, groups incl. Builtin, computers, well-known), *Disable inheritance* (Windows' *Block Inheritance* dialog: convert or remove; remove shows who loses access from a server preview), *Enable inheritance*. Nothing is written until **Review and apply**: the server previews before → after, refuses changes that take access from SYSTEM / Administrators or empty the list, lists who loses access, and asks to type the folder name when the admin loses rights: their rights are counted over their own SID and all their groups (tokenGroups, plus Everyone and Authenticated Users) together — everything allowed minus everything denied — so a new deny for one of their groups counts, and removing one group's entry does not when another of their groups still grants the same. A new or widened deny is listed under *who loses access* as "members of X lose …" even when X had no entry before. Apply is refused (`JOB_RUNNING`) while a propagation runs on the folder, above or below it. Apply re-reads the folder and refuses with `STALE` when it changed since it was opened (reload; the draft is discarded).
- **Subfolders and files** — after a change that reaches the children, *Apply* offers to update them (an `inherit` propagation job). *Apply to subfolders and files…* runs one by hand: *Update inherited entries only* or Windows' *Replace all child object permission entries…* (the subfolders' own entries are removed: a dry run first counts how many objects have them, then a confirmation; the confirmation stays disabled until a count finished, and the server refuses *replace* without the confirmed count). Progress, *Stop*, *Resume* (from the marker), *Retry failed*; folders with inheritance disabled are skipped with their contents. Jobs live in memory (a restart loses them).

## Mismatch report

*NTFS permissions → Mismatch report* (superadministrators). For each `sg_` folder pair, the folder from the description is read (with the admin's account, two folders at a time, as a background job with progress and *Stop*) and compared with the type mapping:

| Problem | Meaning | *Fix* drafts |
|---------|---------|--------------|
| Group not in the permissions | No allow entry for the group | Add the group with the expected rights, this folder, subfolders and files |
| Rights too wide / too narrow | e.g. `_full` with Full Control, `_read` with write rights; or not reaching subfolders and files | Replace the group's explicit allow entries with the expected rights. Too wide: only when the explicit entries alone give the excess (no fix when it is inherited) |
| Deny entry for the group | A deny entry names the group | Remove the group's explicit deny entries (no fix when a deny is inherited) |
| User directly in the permissions | An explicit entry for a user account | Remove the entry |
| Unknown SID | An explicit entry for a SID the directory does not know. Not reported when the directory could not be asked (the report says the names were unavailable; direct user entries are not listed either) | Remove the entry — only when *Search base for subjects* is the whole domain (`DC=…` only); otherwise the SID may simply live outside the search base and gets no fix |
| Folder not found / permissions not readable / drive letter not mapped / group SID unknown | — | — |

*Fix* opens the NTFS editor on that folder with the change in the draft; nothing is applied automatically. Applying it is journalled with `via = fix`. The comparison is a pure function (`ntfsLogic.computeMismatches`).

## Group pair and NTFS

Creating a group pair makes the two AD groups (the duplicate check compares names case-insensitively; the new groups' SIDs are read back with the administrator's own connection, so an OU outside *Where groups are searched* or a template without the prefix still works) and then calls `attachGroupsToNtfs()` (`folderaccess/ntfsHook.js`), which the NTFS engine registers (`drive/aclHook.js`): the groups get explicit allow entries with the *NTFS rights per access type* on the folder of the description (drive letter → File server folder), then an `inherit` propagation updates the children. The folder change is journalled as `ntfs_attach` (kind `ntfs`, same batch as the group rows, previous descriptor in `before.sd`, revision after), so it can be undone from the journal; the propagation is journalled as `ntfs_propagate` when it finishes. When the folder is changed but propagation is refused (e.g. `UNSAFE_SOURCE`), the row keeps the folder change and carries the error, and the dialog says so. When the letter is not mapped or the engine is off, the result is `pending` and the groups have to be added in the NTFS mode.

Code: `src/backend/modules/folderaccess/` — `naming.js` (parsing, pure), `policy.js` (roles and refusals, pure), `directory.js` (LDAP reads and writes, replaceable client for tests), `credentials.js`, `journal.js`, `service.js`, `routes.js`; NTFS mode: `ntfs.js` (service, replaceable dependencies for tests), `ntfsLogic.js` (draft checks, change summary, undo rules, mismatch report — pure), `ntfsDirectory.js` (SID lookup, subject search, the admin's SIDs), `ntfsJournal.js`, `ntfsRoutes.js`; tests in `src/backend/test/folderaccess.test.js` and `folderaccess-ntfs.test.js`. UI: `src/frontend/src/modules/folderaccess/`.
