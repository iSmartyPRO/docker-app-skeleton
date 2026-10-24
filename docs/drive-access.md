# File server: access management («Доступ»)

Part of the [File server](drive.md): who can open which folder, through Active Directory security groups, and the folders' NTFS permissions. Until v1.4 this was a separate module «Доступ к папкам» (`folderaccess`); it was moved into the File server — see [Migration](#migration-from-the-folder-access-module).

It is a block of the File server settings with its own switch (*Settings → Modules → File server → Управление доступом*, off by default). When the File server module **and** the block are on, people with the permission see:

- **«Доступ» on every folder** — a button in the folder's toolbar and an item in a subfolder's menu. It opens a side panel for that folder with two tabs: *Access groups* (every group pair that opens the folder, members, inherited access from folders above) and *NTFS permissions* (superadministrators, the ACL editor).
- **«Доступ» in the File server's sidebar** — *Folders and groups* (overview by project, folder cards), *People* (person card), *Access journal*, *Mismatch report* (superadministrators).

- [How folders map to groups](#how-folders-map-to-groups)
- [Roles](#roles)
- [The folder panel](#the-folder-panel)
- [Whose account makes the changes](#whose-account-makes-the-changes)
- [Delegation in Active Directory](#delegation-in-active-directory)
- [Journal and undo](#journal-and-undo)
- [Settings](#settings)
- [API](#api)
- [NTFS permissions tab](#ntfs-permissions-tab)
- [Mismatch report](#mismatch-report)
- [Creating a group pair](#creating-a-group-pair)
- [Migration from the Folder access module](#migration-from-the-folder-access-module)
- [Code](#code)

## How folders map to groups

```
OU=Groups,OU=ОБЪЕКТ-2,OU=Accounts,DC=corp,DC=example
  sg_obj2_buh_full              G:\ОБЪЕКТ-2\_DocArch\10-BUH;Full Access
  sg_obj2_buh_read              G:\ОБЪЕКТ-2\_DocArch\10-BUH;Read Only
  sg_obj2_qaqc_styajka_full     G:\ОБЪЕКТ-2\_DocArch\3-QA,QC\СТЯЖКА;Full Access
  sg_obj2_specification_full    G:\ОБЪЕКТ-2\_DocArch\3-QA,QC;Full Access
  sg_obj2_root_full             G:\ОБЪЕКТ-2;Full Access
OU=Groups,OU=CO,OU=Accounts,DC=example,DC=com
  sg_co_hr_full                 W:\06-HR;Full Access
```

| Part | Meaning |
|------|---------|
| `sg_` | Prefix of access groups (*security group*), a setting. `sgManager_obj2`, `adm_obj2`, `nextcloud_…` and distribution lists are **not** access groups |
| `obj2`, `co` | Project code: the first token after the prefix. Any code is accepted unless *Accepted project codes* is set |
| `buh`, `qaqc_styajka` | Folder name part: everything up to the final `_full` / `_read`; may contain `_` |
| `_full` / `_read` | Full access / read only — checked against the description |
| `G:\ОБЪЕКТ-2\_DocArch\10-BUH` | The folder: drive letter + path, or `\\server\share\path`. **The description is authoritative** for the folder and the access type; spaces, commas and Cyrillic are fine (the type follows the last `;`) |
| `Full Access` / `Read Only` | The access type |

**Project.** The project shown for a group is the **first OU below the search base** it was found in (the broadest of *Only these OUs* / *Where groups are searched* / the AD base DN that holds it; a bare domain root `DC=…` does not count), an `OU=Groups` skipped: with the base `OU=Accounts,…`, `CN=…,OU=Groups,OU=ОБЪЕКТ-2,OU=Accounts,…` and `CN=…,OU=Sec,OU=Groups,OU=ОБЪЕКТ-2,OU=Accounts,…` are both «ОБЪЕКТ-2», `CN=…,OU=IT,OU=Accounts,…` is «IT», and a group right in `OU=Accounts` (or in `OU=Groups,OU=Accounts`) has **no project** («Без проекта»). When the only base holding the group is a project's Groups OU itself, the OU above it is the project. Without such a base (searched from the domain root) the OU that holds the nearest `OU=Groups` is the project, else the group's own OU. The overview groups folders by project.

**Folder → File server folder.** Each File server folder (*share* in the settings) can have one or more **path prefixes**: how the descriptions write its root, e.g. «ОБЪЕКТ-2 DocArch» = `G:\ОБЪЕКТ-2\_DocArch`, «G» = `G:\`, «ЦО» = `W:`. A description path belongs to the folder with the **longest** matching prefix (whole path parts, case-insensitive, `\` or `/`); the rest is the path inside it. A path no prefix covers is listed as *Not on the File server* (`path_unmapped`) and has no folder panel. The panel of a File server folder finds its groups by the folder's own user paths (every prefix + the path), so overlapping folders (`G:\` and `G:\ОБЪЕКТ-2\_DocArch`) both find them.

**Folders and pairs.** Groups pair up by name (`sg_obj2_buh_full` + `sg_obj2_buh_read`); pairs are grouped into folders by the path their descriptions name, so **several pairs can open one folder** (`sg_obj2_qaqc_…` and `sg_obj2_specification_…` on `3-QA,QC`) — the folder card and panel show all of them. **Inherited access**: groups of folders above (`sg_obj2_root_full` on `G:\ОБЪЕКТ-2`) are shown read-only on every folder below as "inherited from G:\ОБЪЕКТ-2" (NTFS inheritance may still be disabled on the way; the NTFS tab shows the real entries).

Groups whose name or description does not fit are shown with **Needs review** and the reasons: name without `_full`/`_read`, project code not accepted, no description or not `path;type`, unknown access type, path that is neither a drive letter nor a UNC path, name and description giving different types, path not on the File server, only one group of a pair, the two groups of a pair pointing at different folders.

Groups without the prefix that match *Other groups* (default `nextcloud_*`) are listed for superadministrators only.

A membership change takes effect after the person's next Windows logon (or when the network drive reconnects); the panel says so after every change.

## Roles

| Who | How | Can |
|-----|-----|-----|
| Superadministrator | portal permission `*` | Everything: both tabs (*Access groups*, *NTFS permissions*), all groups including protected and other ones, any kind of member (people, groups, computers), create a group pair, edit descriptions, delete groups, undo any membership change, the full journal, the mismatch report |
| System administrator | File server permission `drive.access` (*File server: folder access groups*, through portal roles/groups) | *Access groups* only: see `sg_` groups and their members; add / remove people; move a person between `_full` and `_read`; person card; copy access from another person; revoke all. Undo **their own** membership changes; the journal of membership changes |
| Anyone else | — | No «Доступ» button or sidebar section; the API answers `403` |

`drive.admin` alone does **not** give «Доступ» (it manages servers and folders); a role needs `drive.access` (or `*`).

System administrators are refused on the server (not only hidden in the UI): protected groups (*Protected groups*, default `sg_*_root_*`, and any group whose description points at a drive root such as `W:`), groups without the prefix, `sg_` groups that do not fully parse (`FA_GROUP_NEEDS_REVIEW`: no `_full`/`_read` type in the name, a project code not accepted, a missing or malformed description, name and description types that differ — e.g. `sg_vpn_users`), groups outside the managed OUs (*Only these OUs*, else *Where groups are searched* when set), members that are not user objects (groups, computers, contacts), creating / describing / deleting groups, the NTFS tab, other people's undo.

"Sign in as" (impersonation) sessions only read. API tokens get nothing (`403 FA_NO_TOKENS`).

## The folder panel

*File server → a folder → «Доступ»* (or a subfolder's menu → «Доступ»). The link `…/s/<id>/<path>?access=groups` (or `=ntfs`) opens a folder with the panel.

- **Header** — the folder's user paths (`G:\ОБЪЕКТ-2\_DocArch\10-BUH`), its project, a link to the folder card.
- **Access groups** — for each pair that opens this folder: the `_full` and `_read` member lists side by side (name, login, department, active / disabled); add people (search by name, login or e-mail), remove, move to the other group in one step, select several. Superadministrators: edit description, delete group (type its name).
- **Inherited access** — the folders above with groups, nearest first, with their groups, types and member counts (read-only; their cards are one click away).
- **No groups** — "No access groups for this folder"; when the access comes from above, it says so. Superadministrators get **Create group pair** (see [Creating a group pair](#creating-a-group-pair)) when the project's Groups OU is known.
- **No path prefix** — a File server folder without prefixes cannot be matched with descriptions: the panel says so (superadministrators get a link to the settings).
- **NTFS permissions** (superadministrators) — the ACL editor for the folder, see [NTFS permissions tab](#ntfs-permissions-tab).

The sidebar section:

- **Folders and groups** — every folder with access groups, **grouped by project** (OU), with path, groups, member counts per type, the File server folder (a click opens it), flags; search by folder, path, project or group; filters *Needs review*, *Not on the File server*, *Other groups* (superadministrators). A folder card shows every pair of the folder and the inherited access; buttons *Open in the File server* and *NTFS permissions*.
- **People / person card** — every access group the person is in (folder, project, type) with change type and remove; *Give access to a folder* (one choice per pair); **Copy access from…** (adds every group of the colleague, nothing is taken away; groups the administrator may not change are skipped and listed); **Revoke all access** (confirm; protected groups stay for system administrators).
- **Access journal** and **Mismatch report** — below.
- **Password prompt** — appears when a change needs the domain password; the change is repeated once after it is saved.

Group lists are cached for 60 seconds and re-read after every change; *Refresh* reads AD again. Groups with more than 1500 members are read with ranged retrieval; searches are paged.

**Visibility of File server folders.** The panel and the sidebar section do not check whether the administrator may open the File server folder itself (the folder's *Groups* in the File server settings): superadministrators and system administrators manage every `sg_` group of every project by design, and the overview's settings summary lists every File server folder's title and path prefixes. Group names and members are not more exposed than the folders list already shows them. This is intended; restrict `drive.access` accordingly.

**Folders the administrator cannot open.** The panel does not need the folder to be listable: when the File server refuses the listing (no rights on `06-HR`, no saved password, the folder is gone), the error page has a «Доступ» button and `?access=groups|ntfs` opens the panel over it (mismatch report *Fix* links and the folder card's *Open in the File server* land there too). With *Hide folders without access* on, File server folders the person cannot open stay listed (dimmed, with a «Доступ» button on the home tile) for people who get «Доступ»; everyone else still does not see them. Subfolders are listed as the file server lists them (with access-based enumeration on the server, denied ones are not returned to anybody); a listed subfolder's menu has «Доступ».

## Whose account makes the changes

**All changes run with the acting administrator's own AD account**, never with the portal's service account. Active Directory decides whether they may change a group; the portal roles above are an extra layer. A refusal by AD shows as "Active Directory refused: your AD account has no rights to change this group" (`FA_AD_DENIED`).

The service account (Settings → Integrations → Active Directory) is used only for reading: listing groups, members and people, SID → name.

Credentials:

1. The portal account must be linked to an AD account (signed in with AD, or linked in *Users → the person → Domain account*). Not linked → the section is read-only. Before each change the account is looked up fresh with the service account — by its objectGUID (`users.directory_guid`), else by the stored DN — so a person moved to another OU, or who signs in with a code or Google, still binds as themselves. The journal's *AD account* is the account that actually bound.
2. The password is the person's domain password that the File server module keeps (`drive_credentials`, `server_id NULL`): remembered at AD sign-in (when the File server's "remember the sign-in password" is on) or set by a superadministrator. Its user name must name the same AD account (login, `DOMAIN\login` or UPN); a password saved for another account is not used and the person is asked for their own (`FA_CREDENTIALS_REQUIRED`, reason `OTHER_ACCOUNT`). When the service account cannot find the account but its objectGUID is known, the bind uses the saved user name (UPN / `DOMAIN\login`) and the account is then checked by objectGUID with the person's own connection; without an objectGUID the answer is `FA_ACCOUNT_NOT_FOUND`.
3. When there is none, it cannot be decrypted, or AD rejected it before, the section asks for the password, checks it with an LDAP bind as the person's own DN and saves it sealed (`source = 'self'`; a password set by a superadministrator keeps `source = 'admin'`). The File server uses the same row, so the person does not have to enter it twice.
4. A password AD rejects is parked (`status` = `AUTH_FAILED`, `ACCOUNT_LOCKED`, `PASSWORD_EXPIRED`…) and not retried, so a stale password never locks the account. The File server honours the same status. AD answers "data 52e" both for a wrong password and for a name that does not exist, so a plain `AUTH_FAILED` parks the password only when the bind used a DN the service account has just found.

The [AD directory](directory.md) module uses the same credential (and the same `withActor`, with StartTLS for password operations when configured): one saved domain password serves both.

The password is never shown, returned or logged. Checking it is limited to 3 attempts in 15 minutes per person (each wrong one is a real bad-password bind and counts toward the AD lockout threshold).

## Delegation in Active Directory

Because changes run as the administrator, their AD account needs the rights:

| Action | Right in AD |
|--------|-------------|
| Add / remove members | *Write Members* (the `member` attribute) on the `sg_` groups — e.g. delegate on each project's `OU=Groups,OU=<project>,OU=Accounts,…` (or on `OU=Accounts` for all): *Descendant Group objects → Write Members* to a group of IT administrators |
| Create a group pair | *Create Group objects* on the project's Groups OU (superadministrators) |
| Edit a description | *Write description* on the groups |
| Delete a group | *Delete Group objects* / *Delete* on the groups |

Do not give system administrators rights on the protected root groups in AD either: the portal refuses them, AD should too.

LDAP on port 389 without TLS is accepted (protected DC network); LDAPS works with the integration's TLS and CA settings.

## Journal and undo

Table `drive_access_journal` (until v1.4 `fa_journal`; renamed at start-up with its rows), one row per object changed:

| Column | Meaning |
|--------|---------|
| `at`, `batch` | When; rows of one request share a batch id |
| `kind`, `action` | `membership` (`member_add`, `member_remove`, `member_move`), `group` (`group_create`, `group_describe`, `group_delete`) or `ntfs` (`ntfs_set`, `ntfs_restore`, `ntfs_attach`, `ntfs_propagate`) |
| `via` | `single`, `copy`, `revoke_all`, `undo`; NTFS rows also `fix` (from the report), `hook` (group pair), `retry`, `resume` |
| `user_id`, `user_name`, `user_login`, `ad_account`, `ip`, `user_agent` | Who: the portal person and the AD account the change ran as |
| `group_*`, `to_group_*`, `member_*` | The group(s) and the member. NTFS rows: `group_name` = the folder's display path (`W:\06-HR`, `G:\ОБЪЕКТ-2\_DocArch\10-BUH`), so the group filter finds it |
| `before`, `after` | JSON: membership flags, descriptions; a deleted group keeps its description, SID and up to 500 member DNs. NTFS writes: `before = { folder: { shareId, path, display, serverId, share, serverPath }, sddl, sd (base64 descriptor — the undo blob), revision }`, `after = { sddl, revision, protected, summary: { added, removed, inheritedAdded, inheritedRemoved, protectedBefore, protectedAfter } }`; propagation: counters, up to 50 failed objects, marker, `before.confirmCount` for a confirmed *replace*. NTFS writes from the editor and undos are journalled in two steps: the row with the undo copy is inserted (outcome `pending`) right before the write — if that insert fails nothing is written (`503 FA_JOURNAL_FAILED`) — and completed after it (`changed` / `unchanged`; a refusal at write time drops the row, `ACCESS_DENIED` marks it failed, an unclear error such as a timeout leaves it `pending`). When completing fails the answer carries `journalWarning: true` and the UI says so; a `pending` row can still be undone (through the difference). The `sd` blob is never sent to the browser or the CSV |
| `ok`, `outcome`, `error_code`, `error` | `changed`, `unchanged` (already so), `failed`, `rolled_back` |
| `undo_of`, `undone_by` | Links between a change and its undo |

Filters: period, action, who, result, "only mine", text (person, group, account, IP); CSV export (Excel-friendly, formula-guarded, times in the viewer's zone). System administrators see membership rows only, and only of groups they see (with the prefix, not matching *Protected groups*); superadministrators see everything. A failed journal write after a successful AD change does not turn it into a failure: the result still says "changed" (the server log has the database error).

**Undo** applies the inverse operation of a membership change that changed something (add ↔ remove; a move goes back, or only the part it changed). System administrators undo only their own changes; superadministrators any. When a later successful membership change of the same person in the same group exists (A adds X, B removes X, C adds X again — undoing A's would revert C's), the answer is `409 FA_UNDO_SUPERSEDED` with `info.later` (journal ids); the UI asks and repeats with `confirm: true`. Group creation, descriptions and deletions are not undone here.

**NTFS undo** (superadministrators, `ntfs_set`, `ntfs_restore`, `ntfs_attach` rows that changed something, or are still `pending`): writes back the saved descriptor (`before.sd`) with `restoreAcl`, guarded by the revision the folder had right after the change. A saved DACL with inheritance disabled is written as it was; one that inherits gets back its explicit entries and protection, while the inherited part stays the folder's current one (recomputed from the parent when the folder has inheritance disabled now) — the saved inherited copies may be out of date. If the folder changed since, the answer is `409 STALE` with the difference (current → restored, explicit and inherited entries, who loses access) and the current `revision`; the UI shows it and *Restore anyway* repeats with `force` and that `revision`, so a change made after the difference was shown is refused again (`STALE`). Guards apply as for any write (SYSTEM / Administrators keep access; own access → type the folder name). Undo is refused with `409 JOB_RUNNING` while a propagation runs on the folder, above or below it (e.g. the one started by a group pair). When the restored folder passes other entries down, the server starts an `inherit` propagation right away (journalled `ntfs_propagate`, `via = undo`) and the dialog shows its progress; if it cannot start, the dialog says so. The undo is itself an `ntfs_restore` row and can be undone. Propagations are journalled (`ntfs_propagate`) but not undone.

Every request that changes AD also records a security event (*Admin → Activity*, kinds kept from the former module): `folder_access_changed`, `folder_group_changed`, `folder_access_password` when the domain password is saved or rejected, and `folder_ntfs_changed` for NTFS writes, undos and propagations.

## Settings

*Settings → Modules → File server → Управление доступом* (`modules.drive.settings.access`, defaults `DRIVE_ACCESS_DEFAULTS` in `modules/catalog.js`; saved with the File server settings):

| Setting | Default | Meaning |
|---------|---------|---------|
| `enabled` | off | The block's switch («Доступ» appears only when the File server module is on too) |
| `prefix` | `sg_` | Prefix of access groups |
| `projects` | empty (any) | Accepted project codes (`obj2`, `co`, `wh`…) |
| `defaultProject` | empty | Project code for new groups when the folder's project has no groups yet |
| `projectAliases` | empty | Old code → new code for new groups (`{ "wh": "co" }`, entered as `wh=co`): while groups are being renamed, a pair created next to `sg_wh_*` groups gets `co`. Existing groups keep their names and are still recognised |
| `nameTemplate` | `{prefix}{project}_{name}_{type}` | Names of new groups (`{org}` still means `{project}`) |
| `groupsBase` | AD base DN | Where groups are searched (all projects). When set, system administrators may change only groups under it |
| `groupOus` | empty | Optional: only these OUs instead of the base (each with its subtree); also the managed OUs for system administrators |
| `newGroupOu` | empty | Fallback OU for new pairs when the project's Groups OU is not known (empty: then creating is off) |
| `subjectsBase` | domain root from the base DN | Where people (and NTFS subjects) are searched |
| `typeMap` | full → Modify, read → Read & execute | NTFS rights per access type: used when a new pair is added to its folder and as the expected rights in the mismatch report |
| `protectedGroups` | `sg_*_root_*` | Groups system administrators cannot change |
| `otherGroups` | `nextcloud_*` | Groups without the prefix shown to superadministrators |

**Path prefixes** are set per File server folder: *File servers and folders → a folder → Path in AD group descriptions* (`drive_shares.path_prefixes`, e.g. `W:`, `G:\ОБЪЕКТ-2\_DocArch`; up to 10, cleaned to `X:\a\b`). They are shown as tags in the folders list.

## API

`/api/app/drive/access` (signed in; the File server module **and** the access block on — else `404 DRIVE_ACCESS_DISABLED`; `*` or `drive.access`; no API tokens). Every change is `POST`/`PUT` and runs as the caller's AD account; it answers `403 FA_CREDENTIALS_REQUIRED` / `FA_CREDENTIALS_FAILED` when the password is needed, `403 FA_NOT_LINKED` for accounts without AD. `GET /api/app/drive` carries `config.access = { role, canWrite }` for people who get the section (else `null`).

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/` | Role, `canWrite`, `readOnly` reason, credential state (never the password), settings summary (`prefix`, `projects`, `defaultProject`, `nameTemplate`, `shares` with their prefixes) |
| `GET` | `/folders?q=&refresh=1` | Folders the role sees: `{ key, kind, path, project, shareId, relPath, mapped, pairs: [{ key, code, name, groups: { full, read }, … }], issues, editable }` |
| `GET` | `/folders/:key` | A folder (`p:<path key>`, `n:<pair key>`, `~<name>`) with `members` (by group DN) and `inherited` folders |
| `GET` | `/at?shareId=&path=` | The panel of a File server folder: `{ share, paths, mapped, folders, members, inherited, create? }`; `create` (superadministrators) = `{ path, code, project, ou, suggestedName, available }` |
| `GET` | `/people?q=&kind=all` | Directory search (`kind=all`: also groups and computers, superadministrators) |
| `GET` | `/person?dn=` | Person and their access groups (folder, project, type) |
| `PUT` | `/password` | `{ password }` — check with a bind and save |
| `POST` | `/members` | `{ groupDn, members: [dn], action: 'add' \| 'remove' }` (≤ 100) |
| `POST` | `/members/move` | `{ fromDn, toDn, members: [dn] }` |
| `POST` | `/members/copy` | `{ fromDn, toDn }` |
| `POST` | `/members/revoke-all` | `{ memberDn, confirm: true }` |
| `POST` | `/groups` | Superadministrators: `{ name, path, project?, ou? }` → `{ groups, ou, ntfs }`; `400 FA_PROJECT`, `FA_NO_OU`, `FA_GROUP_NAME`, `FA_PATH`; `409 FA_AD_EXISTS` |
| `PUT` | `/groups/description` | Superadministrators: `{ dn, description }` |
| `POST` | `/groups/delete` | Superadministrators: `{ dn, confirm: <group name> }` |
| `GET` | `/journal`, `/journal/people`, `/journal/export.csv` | Filters: `from`, `to`, `actions`, `user`, `mine`, `result`, `group`, `member`, `q`, `page`, `pageSize`, `tz` |
| `POST` | `/journal/:id/undo` | `{ confirm? }` — inverse membership operation; `409 FA_UNDO_SUPERSEDED` with `info.later` when a later change touched the same person and group |
| `GET` | `/ntfs/acl?shareId=&path=&sources=0` | Superadministrators (all `/ntfs*`; system administrators get `403 FA_SUPERADMIN_ONLY`). Owner, entries with names (`subject`: name, kind, `unknown`, `unavailable`, sg_ group → `folderKey`), `inheritedFrom`, `revision`, `sddl`; the folder's own sg_ groups with expected preset and presence; `confirmName`; `namesUnavailable` when the directory could not be asked |
| `GET` | `/ntfs/subjects?q=` | Users, groups (incl. Builtin), computers and well-known principals with SIDs, from *Where people are searched* |
| `POST` | `/ntfs/preview` | `{ shareId, path, revision, aces: explicit, protected, inherit }` → `{ before, after, summary, guards, selfRemoval, confirmName, inheritableChanged, stale }`; writes nothing |
| `POST` | `/ntfs/apply` | Same body + `confirmName` (own access), `via: 'fix'` → `{ acl, summary, inheritableChanged, journalId, journalWarning }`; `409 STALE`, `409 CONFIRM_SELF_REMOVAL`, `409 JOB_RUNNING`, `422 PROTECTED_PRINCIPAL` / `EMPTY_DACL`, `503 FA_JOURNAL_FAILED` |
| `POST` | `/ntfs/journal/:id/undo` | `{ force?, revision? (required with force: the one from the STALE answer), confirmName?, propagate? (default true) }` → `{ acl, summary, inheritableChanged, job, propagationError, journalId, journalWarning }`; `409 STALE` with `info: { current, restored, revision, summary, guards, inheritableChanged }`, `409 JOB_RUNNING` |
| `POST` | `/ntfs/propagate` | `{ shareId, path, mode: 'inherit' \| 'replace', dryRun?, confirm + confirmCount (replace), marker?, retry?: [paths] }` → `202 { job }`; `400 FA_CONFIRM`, `422 UNSAFE_SOURCE`, `409 JOB_RUNNING` |
| `GET` / `POST` | `/ntfs/jobs`, `/ntfs/jobs/:id`, `/ntfs/jobs/:id/cancel` | Job progress (`done`, `changed`, `unchanged`, `failed`, `protected`, `withExplicit`, `explicitRemoved`), `failedList`, `protectedList`, `marker` |
| `POST` / `GET` | `/ntfs/report`, `/ntfs/report?id=`, `/ntfs/report/:id/cancel` | Mismatch report job (one at a time), `{ state, progress: { done, total }, rows }`; each row's `folder` has `key` (folder card), `shareId`, `path`, `display`, `project` |

NTFS errors from the file server are passed on: `ACCESS_DENIED` (no *Read / Change permissions* right), `NOT_FOUND`, `SERVER_UNREACHABLE`…; a password the file server rejects is parked and answered as `FA_CREDENTIALS_FAILED` (the UI asks for it again).

Membership results: `{ results: [{ ok, outcome, code, error, rolledBack, group, member }], changed, unchanged, failed, notice: 'logon' }`.

## NTFS permissions tab

Superadministrators only (enforced on the server). Every read and write of permissions goes to the file server with the administrator's **own** domain account (the password above), through the Drive module's SMB gateway (`drive/acl.js`, [ntfs-permissions.md](ntfs-permissions.md)). The service account only resolves SIDs to names. A "sign in as" session can look but not preview, apply, undo, propagate, run or stop the report, and a password the file server rejects during such a session is not parked (the other person's saved password stays as it is); API tokens get nothing.

- **Where** — the folder open in the File server (the panel's *NTFS permissions* tab). The mismatch report's *Fix* and the folder card's *NTFS permissions* button open the folder with the tab and the draft ready (`/app/drive/s/<id>/<path>?access=ntfs&fix=…`).
- **Folder** — owner, then the entries as in the Windows *Advanced Security Settings*: type (allow / deny), principal, access (*Full control*, *Modify*, *Read & execute*, *List folder contents*, *Read*, *Write*, *Special*), *Inherited from* (the nearest folder above inside the File server folder with a matching explicit entry; else "Parent object"), *Applies to*. Principals are resolved by SID (service account, cached 10 min) and a built-in table of well-known SIDs; unknown SIDs are shown raw with *Unknown account*; when the directory cannot be asked (not set up, LDAP error) nothing is called unknown and a notice says the names are unavailable; `sg_` groups link to their folder card. The folder's own `sg_` groups (descriptions naming one of the folder's user paths — any path prefix of its File server folder) are listed with the expected rights and whether they are present (*Add to draft* when not).
- **Draft** — add / edit / remove explicit entries (principal search over users, groups incl. Builtin, computers, well-known), *Disable inheritance* (Windows' *Block Inheritance* dialog: convert or remove; remove shows who loses access from a server preview), *Enable inheritance*. Nothing is written until **Review and apply**: the server previews before → after, refuses changes that take access from SYSTEM / Administrators or empty the list, lists who loses access, and asks to type the folder name when the admin loses rights: their rights are counted over their own SID and all their groups (tokenGroups, plus Everyone and Authenticated Users) together — everything allowed minus everything denied — so a new deny for one of their groups counts, and removing one group's entry does not when another of their groups still grants the same. A new or widened deny is listed under *who loses access* as "members of X lose …" even when X had no entry before. Apply is refused (`JOB_RUNNING`) while a propagation runs on the folder, above or below it. Apply re-reads the folder and refuses with `STALE` when it changed since it was opened (reload; the draft is discarded).
- **Subfolders and files** — after a change that reaches the children, *Apply* offers to update them (an `inherit` propagation job). *Apply to subfolders and files…* runs one by hand: *Update inherited entries only* or Windows' *Replace all child object permission entries…* (the subfolders' own entries are removed: a dry run first counts how many objects have them, then a confirmation; the confirmation stays disabled until a count finished, and the server refuses *replace* without the confirmed count). Progress, *Stop*, *Resume* (from the marker), *Retry failed*; folders with inheritance disabled are skipped with their contents. Jobs live in memory (a restart loses them).

## Mismatch report

*File server → Доступ → Mismatch report* (superadministrators). For each `sg_` group pair, the folder from the description is read (with the admin's account, two folders at a time, as a background job with progress and *Stop*) and compared with the type mapping:

| Problem | Meaning | *Fix* drafts |
|---------|---------|--------------|
| Group not in the permissions | No allow entry for the group | Add the group with the expected rights, this folder, subfolders and files |
| Rights too wide / too narrow | e.g. `_full` with Full Control, `_read` with write rights; or not reaching subfolders and files | Replace the group's explicit allow entries with the expected rights. Too wide: only when the explicit entries alone give the excess (no fix when it is inherited) |
| Deny entry for the group | A deny entry names the group | Remove the group's explicit deny entries (no fix when a deny is inherited) |
| User directly in the permissions | An explicit entry for a user account | Remove the entry |
| Unknown SID | An explicit entry for a SID the directory does not know. Not reported when the directory could not be asked (the report says the names were unavailable; direct user entries are not listed either) | Remove the entry — only when *Search base for subjects* is the whole domain (`DC=…` only); otherwise the SID may simply live outside the search base and gets no fix |
| Folder not found / permissions not readable / path not on the File server / group SID unknown | — | — |

*Fix* opens the folder in the File server with the NTFS tab with the change in the draft; nothing is applied automatically. Applying it is journalled with `via = fix`. The comparison is a pure function (`ntfsLogic.computeMismatches`).

## Creating a group pair

From a folder's panel (superadministrators): *Create group pair* when no group names the folder, *Another group pair* otherwise. The **project code and OU** come from the folder's own groups or the nearest folder above with groups (`sg_obj2_root_full` on `G:\ОБЪЕКТ-2` → code `obj2`, OU `OU=Groups,OU=ОБЪЕКТ-2,…`); without such groups, from *Default project code* and *OU for new groups*. The code goes through *Project code aliases* (`wh=co`: the nearest groups are `sg_wh_*`, the new pair is `sg_co_*`). The dialog shows where the groups will be made: the OU, the project and whether it comes from the groups of a folder (which one) or from the settings, and the alias when one was applied; the code can still be changed there. The dialog suggests the name part from the folder name (Latin, transliterated) and shows both names and descriptions before anything is made; the server accepts only an OU where folder groups already live or the configured one.

The server makes the two AD groups (the duplicate check compares names case-insensitively; the new groups' SIDs are read back with the administrator's own connection, so an OU outside *Where groups are searched* or a template without the prefix still works) and then calls `attachGroupsToNtfs()` (`drive/access/ntfsHook.js`), which the NTFS engine registers (`drive/aclHook.js`): the groups get explicit allow entries with the *NTFS rights per access type* on the folder of the description (path → File server folder by the longest path prefix), then an `inherit` propagation updates the children. The folder change is journalled as `ntfs_attach` (kind `ntfs`, same batch as the group rows, previous descriptor in `before.sd`, revision after), so it can be undone from the journal; the propagation is journalled as `ntfs_propagate` when it finishes. When the folder is changed but propagation is refused (e.g. `UNSAFE_SOURCE`), the row keeps the folder change and carries the error, and the dialog says so. When no File server folder covers the path (`FA_NTFS_UNMAPPED`) or the engine is off, the result is `pending` and the groups have to be added on the NTFS tab.

## Migration from the Folder access module

Up to v1.4 «Доступ к папкам» was a module of its own (`/app/folderaccess`, `/api/app/folderaccess`, *Settings → Modules → Folder access*). At every start the File server's schema step (`drive/access/migrate.js`, idempotent, every step under one advisory lock) moves it:

0. **Copy**: the stored `modules.folderaccess` block is copied once to its own settings key `legacy_folderaccess` (`{ savedAt, migratedAt, folderaccess }`). A save of *Settings → Modules* rewrites `modules` from the catalog and drops unknown ids, so this copy is what a retry reads if step 2 failed and an administrator saved the modules page before the next start.
1. **Journal**: in one transaction, `fa_journal` is renamed to `drive_access_journal` with its rows, ids, undo links, its indexes and its sequence (if both exist and the new one is still empty, the new one gives way; one with rows is never dropped). A failure rolls the whole rename back and it is retried at the next start.
2. **Settings**: in one transaction (`modules` and `legacy_folderaccess` read `FOR UPDATE`), unless the copy is already marked `migratedAt`: the old block (from `modules`, else from the copy) is converted — the old *enabled* becomes the block's switch, `orgCodes` → *Accepted project codes*, `orgCode` → *Default project code*, the other accepted codes → *Project code aliases* of it (`co` + `wh` → `{ wh: co }`), `{org}` → `{project}` in the template, the OUs, type map and group patterns carried over; every drive letter of `driveMap` becomes a **path prefix of its File server folder** (`W` → share 2 gets `W:`). An access block that was already set up is left as it is (one holding only the defaults counts as not set up). The copy is then marked `migratedAt`. `modules.folderaccess` itself is **not** deleted.
3. **Roles**, **once**: every role with `folderaccess.groups` gets `drive.access` instead (the old permission is removed: a role save keeps permissions the core does not know, so a left-over `folderaccess.groups` would have handed `drive.access` back on every run), then `legacy_folderaccess.rolesMigratedAt` is set; after that no run — restart, package install, the daily `drive:folderaccess` job — touches roles again, so an administrator who takes `drive.access` away from a role keeps it away.

Since the File server became a package these steps run in its migration 001 (each in a savepoint) and again in the daily `drive:folderaccess` job, which only retries a step that has not succeeded yet. A rollback to v1.4 finds its settings and its (empty in production) `fa_journal` again, but not `folderaccess.groups` in roles (grant it by hand there) — v1.4 is long gone everywhere. A v1.4 started on this database creates a new empty `fa_journal`; entries written by this version stay in `drive_access_journal`. Creating group pairs is on in this version even though v1.4's empty *OU for new groups* meant "off": the OU now comes from the folder's project groups.

The old module is gone from the launcher, *Settings → Modules* and the admin navigation; old links to `/app/folderaccess` land on the apps list. The security event kinds (`folder_access_changed`, …) are kept, so earlier events stay readable.

## Code

`src/backend/modules/drive/access/` — `naming.js` (names, descriptions, paths, prefixes, projects, pairs and folders; pure), `policy.js` (roles and refusals, pure), `directory.js` (LDAP reads and writes, replaceable client for tests), `credentials.js`, `journal.js`, `service.js`, `routes.js` (mounted by `drive/routes.js` at `/access`), `migrate.js`; NTFS: `ntfs.js` (service, replaceable dependencies for tests), `ntfsLogic.js` (draft checks, change summary, undo rules, mismatch report — pure), `ntfsDirectory.js` (SID lookup, subject search, the admin's SIDs), `ntfsJournal.js`, `ntfsRoutes.js`, `ntfsHook.js`; the engine is `drive/acl.js` + the gateway ([NTFS permissions engine](ntfs-permissions.md)). Tests: `src/backend/test/drive-access.test.js`, `drive-access-fixes.test.js`, `drive-access-ntfs.test.js`, `drive-access-migrate.test.js`. UI: `src/frontend/src/modules/drive/access/` (`AccessDrawer.jsx` — the folder panel, `AccessSection.jsx` — the sidebar pages, `AccessSettings.jsx` — the settings block).
