# AD directory («Каталог AD»)

Module `directory` (category *Infrastructure*, off by default). It shows and changes Active Directory users, groups and computers **inside one OU — the managed root** (spec `docs/specs/platform-2.0.ru.md` §5). Without the AD integration the rest of the portal works as usual; the module page then explains the setup, and a superadministrator can fill a **demo directory**. A module package (docs/module-packages.md, `make module ID=directory`); it reaches the File server (AD connection, stored passwords; real AD only — 409 `DRIVE_MISSING` without it) and Employees (card links) through their public APIs.

- [Concepts](#concepts)
- [Credential model](#credential-model)
- [Security rules](#security-rules)
- [Passwords and the secure channel](#passwords-and-the-secure-channel)
- [Settings](#settings)
- [Permissions](#permissions)
- [Screens](#screens)
- [Links to the portal and employees](#links-to-the-portal-and-employees)
- [Journal and Activity](#journal-and-activity)
- [Demo directory](#demo-directory)
- [API](#api)
- [Code and tests](#code-and-tests)

## Concepts

```
DC=example,DC=local
├── CN=Users                          ← outside the root: never shown or changed
└── OU=Accounts                       ← managed root (setting)
    ├── OU=HQ
    │   ├── OU=Users      users of the head office
    │   ├── OU=Groups     groups (sg_… folder groups are File server → Access)
    │   └── OU=Computers
    ├── OU=North-Quarter  a project / site with the same sub-OUs
    ├── OU=Disabled       where «Offboard» moves accounts (setting)
    ├── OU=Service        excluded (DN in the settings): hidden, never changed
    └── OU=Admins         excluded (name pattern «Admins»)
```

| Term | Meaning |
|------|---------|
| Managed root | The OU the module works in. Nothing above it is listed, searched or changed. Empty = the module shows nothing (setup page) |
| Excluded OU | A full DN (that OU and everything below) or a name pattern with `*` / `?` (`Service*`, `OU=Admins`) matching an OU at any depth below the root. Hidden in the tree, lists, search, counters and cards; every write into or out of it is refused |
| Hidden account | Login or name pattern (`svc_*`, `adm-*`) — hidden and unchangeable even inside the root |
| Protected account | `adminCount = 1` (AdminSDHolder) — read-only for everyone without `ad.admin` |
| Folder access group | A group whose name starts with the File server's access prefix (`sg_` by default). Shown read-only with a link to *File server → Access*; every write is refused here (`AD_DRIVE_GROUP`): its members, its own group memberships, its attributes, moving it, adding it in the wizard |

## Credential model

The module reuses the File server's access-management credentials ([drive-access.md → Whose account makes the changes](drive-access.md#whose-account-makes-the-changes)) — there is no second mechanism:

- **Reads** (tree, lists, cards, login availability) bind with the integration's **service account**. It needs *read* on the root (and the domain, for login uniqueness checks). It never writes.
- **Every write** binds as the **acting administrator's own AD account** (`drive/access/directory.js → withActor`): the portal account must be linked to AD (signed in with AD, or *Users → Domain account*); the password is the sealed `drive_credentials` row (`server_id NULL`) that the File server also uses. Missing / rejected → `403 FA_CREDENTIALS_REQUIRED` / `FA_CREDENTIALS_FAILED`; the UI asks for the domain password, checks it with a bind (`PUT /credential`, 3 attempts per 15 minutes) and repeats the change once. A password AD rejects is parked so it never locks the account.
- Active Directory decides whether the administrator may make the change (`AD_DENIED` → "ask for delegation on this OU"); portal permissions are an extra layer.
- «Sign in as» sessions only read (`IMPERSONATION_LIMIT`); API tokens never reach the module (`/app/directory` is blocked for tokens, `AD_NO_TOKENS`).

## Security rules

- **Scope by parsed DNs.** `dn.js` parses RFC 4514 names (escapes, hex-UTF-8, multi-valued and BER values refused) and compares them RDN by RDN (case and outer spaces ignored, inner spaces significant: `OU=Corp  HQ` is not `OU=Corp HQ`) — `CN=x\,OU=Accounts,DC=…` is *not* inside `OU=Accounts`; `<GUID=…>` / `<SID=…>` forms are not names (`AD_BAD_DN`). Every request DN is checked, the object is re-read with the service account and the **server's spelling** of its DN is checked again before any write.
- **Excluded OUs are invisible and unwritable**: tree children, list results (also a search across the root), card, move target, create target, group and member of a membership change.
- **Nothing above the root is shown by its DN**: in a card, groups and the manager outside the root, in an excluded OU or hidden are listed by name only (`dn: null`); login availability (`/login`, `/login/check`) needs `ad.manage`.
- **Protected (`adminCount`) accounts and groups** need `ad.admin` for every change, including being added to or removed from a group and being a wizard group.
- **Filters are objects, not strings**: list and search filters are ldapts filter objects, which escape every value per RFC 4515 (`*)(cn=*` is searched literally); new DNs escape the RDN value per RFC 4514 (`CN=Smith\, John,…`).
- **Only allowed attributes**: edits are limited to the settings' list (never `unicodePwd`, `userAccountControl`, `sAMAccountName`…); values are length-checked, mail and manager DN validated.
- **Bulk operations** (≤ 200) answer a preview first (`dryRun`) listing what changes and what is refused; nothing is written until the confirmed second call.
- **Passwords** are never stored or logged (journal rows carry flags only) — see below.

## Passwords and the secure channel

AD accepts `unicodePwd` only over an encrypted connection. The module refuses **before** contacting AD (`400 AD_SECURE_REQUIRED`) unless:

| Channel | How |
|---------|-----|
| `ldaps` | The integration's *Use TLS* (port 636, optional CA certificate) |
| `starttls` | Module setting *StartTLS for passwords*: **every** session that binds as the acting administrator upgrades a plain `ldap://` connection before the bind (`withActor(..., { startTls })`, the integration's CA) — attribute edits, moves, membership, user creation, passwords — and so does the check bind when an administrator saves their domain password (`verifyBind(..., { startTls })`). The DC needs a certificate; a refusal is `FA_STARTTLS_FAILED` (never a fallback to plain LDAP) |

Without LDAPS or StartTLS, the module refuses password operations, but other changes still bind as the administrator over plain LDAP (389): their domain password then travels in clear, so configure one of the two in production. The UI shows the state everywhere: a «LDAPS / StartTLS / Без TLS» badge, the password dialog's channel note, disabled «Reset password» with the reason, the wizard (accounts are created disabled without a password). *Settings → Check* binds the service account over the channel. If AD itself rejects a password over plain LDAP (`53 … 5003 WILL_NOT_PERFORM`) the answer is `AD_SECURE_CHANNEL`; a domain policy rejection (`0000052D`) is `AD_PASSWORD_POLICY`.

Reset: `unicodePwd` (UTF-16LE, quoted) → optional `pwdLastSet = 0` (must change at next logon) → optional `lockoutTime = 0`. The two steps are reported apart: when the password is set but the flags fail, the answer is `outcome: 'partial'` with `steps` and `warnings: ['flags_failed']`, the journal row is `ok` with outcome `partial`, and the dialog says the password **was** changed. Policy hints (length, 3 of 4 classes, not containing the login or name) are checked in the dialog and on the server; the domain policy still decides.

## Settings

*Settings → Modules → AD directory* (`modules.directory.settings`, defaults `DIRECTORY_DEFAULTS` in `modules/catalog.js`, sanitised by `sanitizeDirectory`):

| Setting | Default | Meaning |
|---------|---------|---------|
| `rootDn` | empty | Managed root (picker browses from the integration's base DN) |
| `excluded` | `[]` | DNs or OU name patterns |
| `hiddenAccounts` | `[]` | Login / name patterns |
| `editableAttributes` | displayName, givenName, sn, title, department, company, mail, telephoneNumber, mobile, physicalDeliveryOfficeName, description, manager | Subset of `DIRECTORY_ATTRIBUTES` (+ initials, employeeID, l) |
| `allowCreate` | on | The wizard and «Create AD user for the employee» |
| `loginTemplate` | `{f}.{last}` | `{first} {last} {middle}`, `{f} {l} {m}` first letters; transliterated (Russian, Kazakh, Kyrgyz, Ukrainian… → Latin), ≤ 20 chars. Collisions (checked in the whole domain) get `2`, `3`… with the base shortened to fit |
| `upnSuffixes` | `[]` | Empty: the DNS domain of the base DN |
| `mailTemplate` | empty | `{login}@example.com` etc.; empty: no mail |
| `defaultUserOu` | empty | Pre-selected OU in the wizard |
| `unitOus` | `[]` | `[{ unitId, ou }]`: OU per org unit (nearest mapped ancestor) |
| `disabledOu` | empty | Target of «Offboard»; empty hides the action |
| `passwordMinLength`, `passwordComplexity`, `passwordHint` | 12, on, empty | Hints in dialogs |
| `mustChangeDefault` | on | «Must change at next logon» pre-ticked |
| `startTls` | off | See above |
| `inactiveDays` | 90 | The «Inactive» filter |

## Permissions

| Permission | Can |
|------------|-----|
| `ad.view` | Tree, lists, cards, journal |
| `ad.manage` | Create users, edit attributes, move, enable / disable, unlock, group membership, bulk actions |
| `ad.passwords` | Reset passwords, unlock |
| `ad.admin` | All of the above, plus protected (`adminCount`) accounts |
| `users.manage` (core) | «Create portal user» / link a portal account |
| `employees.hr` | Link an AD account to an employee card |

The launcher lists the module for anyone with one of the `ad.*` permissions.

## Screens

- **Directory** (`/app/directory?ou=&q=&kind=&flags=&sub=1&open=`): the OU tree (lazy, subtree counts, excluded OUs never come from the server) next to the objects of the selected OU; search across the whole root; filters *users / groups / computers* and *disabled, locked, password expired, never signed in, inactive N days*; configurable columns (remembered per browser); multi-select with *Disable / Enable / Move / Offboard* (preview first). Phones: the tree in a drawer, cards instead of the table.
- **Card** (drawer): photo (`thumbnailPhoto`) or initials, status chips, login / UPN / mail / title / department / company / manager / phones / OU path / DN, password set / expires (`msDS-UserPasswordExpiryTimeComputed`, else `maxPwdAge` of the domain), last sign-in (`lastLogonTimestamp`), created; groups with security / distribution and scope (folder groups and groups outside the root read-only); members of a group; history; chips of the linked portal user and employee; actions with reasons when disabled.
- **New user** wizard: names → login (template, checked free, suggestion on collision) → OU → UPN / mail → password (secure channel only; generator; must change; enable now) → groups → review. Steps after the creation report separately (`create`, `password`, `enable`, `group …`); without a password the account stays disabled (`created_disabled`).
- **Journal** (`/app/directory/journal`): filters by action, result, «only mine», text.
- **Setup page** when AD is not configured or no root is set, with the demo button for superadministrators.
- **Guided tour** `directory` (`modules/directory/tour.js`, anchors `data-tour="directory.*"`).

## Links to the portal and employees

- **Portal user**: the existing AD link (`users.auth_source = 'ldap'`, `external_id` = DN, `directory_guid`). The card and list show the linked account; «Create portal user» runs the core `createUser()` and links it (sign-in with the domain login follows), «Link an existing one» / «Unlink». Not available in the demo directory.
- **Employee** (module «Сотрудники», when on): the card's `ad_account` holds the sAMAccountName. The directory card shows the linked employee (by `ad_account` or the linked portal user) and «Link to an employee». In the employee card the **«Учётная запись AD» tab** (registered through `registerEmployeeExtension` / `registerEmployeeTab`, HR only) shows the account, «Create AD user for the employee» (the wizard pre-filled from the card, the OU from *OU by org unit*; the new login is written to the card) and «Link an existing account».

## Journal and Activity

Table `ad_journal`: `at, batch, action, user_*, ad_account` (who the change ran as), `ip, user_agent, target_dn/name/kind, details` (JSON: changed attributes before → after, from / to OU, group, flags — never a password), `ok, outcome, error_code, error, demo`. Actions: `user_create, attributes, move, enable, disable, unlock, password_reset, member_add, member_remove, portal_user, portal_link, portal_unlink, employee_link, employee_unlink`. A failed journal write never turns a done AD change into a failure. Every request that changed AD also records a security event: `ad_changed`, `ad_password_reset` (warning), `ad_credential`; links use the core `directory_linked` / `directory_unlinked`.

## Demo directory

*Settings → Modules → Demo data* (or the module's setup page): while the AD integration is **not** configured, a superadministrator can fill `ad_demo_objects` with a neutral directory (`DC=example,DC=local`, root `OU=Accounts`: head office, site «North Quarter», branch «East», `OU=Disabled`, excluded `OU=Service` and `Admins`; 15 users in every state, groups incl. folder and distribution groups, computers). The module then runs in **demo mode**: badged «Демо-каталог», the same scope rules, writes go to the table (no credentials, no LDAP call, passwords never stored — only `pwdLastSet` moves), journal rows `demo = true`. Two demo portal users are linked to demo accounts; with the Employees demo, three demo employees get AD accounts. *Remove demo data* deletes it all (and restores those links); employee cards linked or unlinked by hand in demo mode (card links, the wizard's «link to employee») are put back from the demo journal rows (`details.before`), newest first. With AD configured, seeding does nothing and the real directory is shown.

The module may be switched on without AD (manifest `requires: [{ integration: 'activeDirectory', demo: true }]` — a soft requirement: `planModuleChanges` does not block it, the Modules page shows «Нужна интеграция AD»).

## API

`/api/app/directory` (signed in, module on; not for API tokens):

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/` | Mode (`ldap` / `demo` / `off`), rights, setup state, root, channel, `passwordsAvailable`, settings summary, credential state |
| `GET` | `/tree?dn=` | Children OUs of `dn` (default the root) with `counts`, `truncated` and `hasChildren`; `node.self` / `total`. The subtree is never read whole: each child is counted with a bounded search (at most 2000 objects, `truncated` → «2000+»), `hasChildren` from a one-level search of a few entries; one service bind, at most 4 searches in flight |
| `GET` | `/objects?ou=&q=&kinds=&flags=&inactiveDays=&scope=one\|sub&page=&pageSize=` | `q` searches the whole root (`within=1` keeps the OU). At most 5000 visible objects are read (excluded / hidden ones are dropped before the cut); past it `truncated: true, limit` and the page shows a warning to narrow the search |
| `GET` | `/object?dn=` | The card: `object, groups, members, manager, portalUser, employee, history, actions` |
| `GET` | `/groups?q=`, `/find?q=&kinds=` | Pickers (in scope; no folder groups) |
| `GET` | `/login?first=&last=`, `/login/check?login=&upn=` | Template login, the first free one; availability in the domain (`ad.manage`: it reveals logins outside the root) |
| `POST` | `/users` | Create (wizard body); `409 AD_LOGIN_TAKEN` with `info.suggestion` |
| `PUT` | `/object/attributes` | `{ dn, changes: { attr: value } }` |
| `POST` | `/bulk` | `{ action: enable \| disable \| move \| offboard, dns, targetOu?, dryRun? }` |
| `POST` | `/unlock`, `/password` | `{ dn }`, `{ dn, password, mustChange, unlock }` |
| `POST` | `/members` | `{ groups: [dn], members: [dn], action: add \| remove }` (≤ 100 pairs) |
| `PUT` | `/credential` | The administrator's own domain password (rate limited) |
| `GET` / `POST` | `/browse?dn=`, `/secure-check` | Settings helpers (`ad.admin` or `settings.modules`) |
| `GET` | `/journal` | `q, actions, result=failed, mine=1, dn, page` |
| `POST` | `/portal-user`, `/portal-link`, `/portal-unlink` | `users.manage`; link / unlink also `assertCanManage` on the target portal account (never one with more access than the caller, `AD_LINK_FORBIDDEN`) and a superadministrator's account only by a superadministrator (`AD_LINK_SUPERADMIN`); refusals are journalled |
| `GET` / `POST` | `/employees?q=`, `/employee-link`, `/employee-unlink` | `employees.hr` |

Errors carry codes (`AD_OUTSIDE_ROOT`, `AD_EXCLUDED`, `AD_BAD_DN`, `AD_PROTECTED`, `AD_DRIVE_GROUP`, `AD_SECURE_REQUIRED`, `AD_SECURE_CHANNEL`, `AD_PASSWORD_WEAK` with `info.issues`, `AD_PASSWORD_POLICY`, `AD_DENIED`, `AD_EXISTS`, `AD_UNAVAILABLE`…) that the UI explains in the person's language.

## Code and tests

`src/backend/modules/directory/` — `dn.js` (RFC 4514 parsing / escaping, pure), `logic.js` (scope, statuses, filters, login template, password hints — pure), `ldap.js` (provider: service-account reads, writes through `withActor`), `demoDirectory.js` (the demo provider), `service.js` (rules, journal, links), `routes.js`, `schema.js`, `demo.js`, `employeeSection.js`. UI: `src/frontend/src/modules/directory/` (`DirectoryApp`, `pages/Browser|Journal|Setup`, `components/OuTree|ObjectCard|CreateUserWizard|Dialogs|Bits`, `DirectorySettings`, `EmployeeAdTab`, `register.js`, `tour.js`), strings `locales/<lang>/directory.js`, docs `help/admin/<lang>/directory.js`, `help/content/<lang>/directory.js`.

Tests: `test/directory.test.js` (no database: DN parsing and crafted DNs, scope, RFC 4515 escaping, statuses, login template and collisions, password hints, error mapping, and the LDAP provider against `test-fixtures/ldap-fake.mjs` — reads as the service account, writes as the administrator, the service account refused, unicodePwd refused without TLS and accepted after StartTLS, no password in any call, bounded tree counts, StartTLS for the saved-password check, the CN length, browser/server password-rule parity), `test/directory.db.test.js` (`DIRECTORY_DB_TEST=1`: tree within the root, excluded OUs unreachable, card group types, secure channel refusal before any write, StartTLS reset journalled without the password, wizard collisions and OU scope, bulk preview/offboard, sg_ refusal, rights and impersonation, missing credential, protected members / wizard groups, sg_ writes refused, batched target reads, StartTLS on every administrator bind, partial password reset, DNs outside the root hidden, portal-link guard, reach-error codes, demo directory seed → use → employee links reverted on purge).
