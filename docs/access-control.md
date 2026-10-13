# Access control and sign-in

How people get into the product and what they may do once inside.

- [Model](#model)
- [Built-in roles](#built-in-roles)
- [Permission catalog](#permission-catalog)
- [Safety rules](#safety-rules)
- [Groups](#groups)
- [Initial data](#initial-data)
- [Sign-in methods](#sign-in-methods)
- [One-time codes and magic links](#one-time-codes-and-magic-links)
- [Setting up each method](#setting-up-each-method)
- [Adding a permission](#adding-a-permission)

---

## Model

```
user ──► direct roles ─────────────┐
  │                                ├──► effective permissions
  └──► groups ──► roles of group ──┘
```

- **Permissions** are fixed in code (`src/backend/services/permissions.js`). Routes check them with `requirePermission(...)`.
- **Roles** are named sets of permissions. Built-in roles ship with the product; administrators can add their own.
- **Groups** are teams or departments. Every member receives all roles of the group. Prefer groups over direct roles — access then follows org structure.
- A user's **effective permissions** are the union of their direct roles and their groups' roles. `*` means everything.

Access is re-evaluated on every request. Changing someone's roles, groups or status also bumps their `token_version`, so their existing sessions end immediately.

## Built-in roles

| Role | Key | Permissions |
|------|-----|-------------|
| Super administrator | `superadmin` | `*` — everything. Locked: cannot be edited or deleted. |
| Administrator | `admin` | Console, view/manage/delete users, manage groups, activity, view settings, branding, integrations |
| Moderator | `moderator` | Console, view/manage users, activity |
| Auditor | `auditor` | Console, view users, activity, view settings (read-only everywhere) |
| User | `user` | None — personal cabinet only |

Built-in roles are inserted once by key and never overwritten, so permission changes made in **Roles** survive upgrades. Their names are translated in the UI.

## Permission catalog

| Permission | Allows |
|------------|--------|
| `console.access` | Opening `/admin` at all |
| `users.view` | Seeing users, groups and roles |
| `users.manage` | Creating users, editing profiles, resetting passwords, blocking, assigning groups and roles |
| `users.delete` | Deleting users |
| `groups.manage` | Creating groups, setting their roles and members |
| `roles.manage` | Creating roles and changing their permissions |
| `activity.view` | Security events |
| `settings.view` | Reading every settings screen (controls are disabled) |
| `settings.general` | Name, logos, theme, typography, icons |
| `settings.security` | Site access, lockouts, sessions, IP filtering |
| `settings.auth` | Sign-in methods |
| `settings.integrations` | Email, Telegram, WhatsApp, Wazzup, Mattermost, document conversion, Active Directory |
| `settings.system` | API rate limit |
| `api.tokens` | Creating personal API tokens under *Account → API tokens*; a token never has more rights than its owner. See [Public API](public-api.md) |
| `api.admin` | The API console (`/admin/api`): tokens of anyone (including on behalf of other accounts), access templates, webhooks, request log, API settings |
| `settings.modules` | Turning modules on and off and their settings |
| `companies.admin` | Change any company or contact card, delete for good, configure the Counterparties module and its DaData key |
| `resources.admin` | Add, edit and order online resources and choose who sees each one |
| `drive.admin` | Manage file servers and drive folders, see every folder regardless of portal groups and every public link. Content rights stay with the file server |
| `files.admin` | Create shared spaces (when restricted to administrators) and *manage* every space. Personal files stay private |
| `kb.admin` | *Manage* on everything in the Knowledge Base, whatever its access rules |
| `tasks.admin` | *Manage* on every task project |
| `calendar.admin` | *Manage* on every shared calendar (personal calendars stay private) |

Modules add their own permissions from `modules/catalog.js`, grouped under *Module: <name>* in the role editor. Inside the Knowledge Base, access to content is governed by its own [view / edit / manage rules](knowledge-base.md#access).

`PUT /api/admin/settings` checks each top-level key of the patch against the matching permission, so an administrator can save branding but not, say, the IP policy.

## Safety rules

Enforced by the API (the UI only mirrors them):

1. **No escalation.** You can grant — or take away — only roles and groups whose permissions you hold yourself. An administrator cannot create a super administrator or a role with `roles.manage`.
2. **Stronger accounts are read-only to you.** You cannot edit, block, delete or change the sessions of a user who holds permissions you do not.
3. **Not yourself.** Nobody can change their own roles, groups, active or blocked state, or delete their own account.
4. **Always a super administrator.** Every change runs in a transaction and is rolled back with `409 LAST_SUPERADMIN` if no active super administrator would remain — whether through user edits, group edits, role edits or deletion.
5. **Break-glass password.** If password sign-in is turned off, super administrators can still use it, so a broken directory or messenger integration never locks everyone out.

## Groups

- One group is the **default**. New accounts — created by an administrator without explicit groups, or auto-created by Active Directory or Telegram — join it.
- The default group cannot be deleted; make another group the default first.
- Active Directory group mapping adds members to portal groups on every sign-in (see below). Manual memberships are kept.

## Initial data

| When | What is created |
|------|-----------------|
| Every start | Missing built-in roles |
| Setup wizard (fresh install) | Super administrator; groups *Administrators*, *Support*, *Auditors*, *Employees (default)* in the wizard's language; optionally five sample users |
| First start after upgrading from 0.0.1 | The same groups; former `admin` users become super administrators, everyone else joins the default group |

Sample users (`olivia.martin`, `daniel.kim`, `sofia.rossi`, `liam.novak`, `emma.schulz`) have **no password** and cannot sign in until an administrator sets one. The wizard's checkbox is off by default. While a sample account keeps its seeded `@example.com` address, an Active Directory sign-in with the same username never takes it over. Add them to an existing installation with `make seed-demo`.

Group names on upgrade use `SEED_LOCALE` (`en` / `ru`) if set, otherwise the first user's language.

## Sign-in methods

Configured in **Settings → Security → Sign-in methods**. Each method beyond the password needs its integration enabled and configured; the screen shows the status and links to it.

| Method | Integration | How the account is found |
|--------|-------------|--------------------------|
| Username + password | — | username |
| Active Directory / LDAP | Active Directory | `sAMAccountName`, `userPrincipalName`, `uid` or `mail` in the directory |
| Telegram Login | Telegram (token + bot username) | linked Telegram account |
| Code in WhatsApp | WhatsApp Gateway and/or Wazzup (with fallback) | phone number in the profile |
| Code by email | Email (SMTP) | email in the profile |
| Code in Telegram | Telegram | linked Telegram account (`@username`) |
| Code in Mattermost | Mattermost (server URL + bot token) | Mattermost username in the profile |
| Magic link | any code channel | as above |

The sign-in page shows only the methods that are both enabled and ready. User profiles carry the identifiers these methods need: **phone**, **email**, **Mattermost username**, **Instagram** and a **linked Telegram** account.

## One-time codes and magic links

| Property | Codes | Links |
|----------|-------|-------|
| Format | 6 digits | 256-bit random token |
| Lifetime | 5 minutes | 15 minutes |
| Use | single | single |
| Storage | HMAC-SHA256 hash | SHA-256 hash |
| Wrong guesses | 5, then the code is burned | — |
| Resend | not within 60 s, at most 5 per hour per account and channel | same |

- Requesting a code always returns the same response, so the endpoint cannot be used to discover accounts. Delivery failures are logged server-side, never returned.
- A new request invalidates older codes and links for that channel.
- Link tokens travel in the URL fragment (`/auth/magic#token`), which browsers never send to servers, proxies or `Referer` headers. The page reads it and removes it from history immediately.
- Failed attempts count towards the username/IP lockout and appear in **Activity**.
- The code UI auto-submits on the sixth digit and supports paste and OS one-time-code autofill.

## Setting up each method

### Active Directory / LDAP

1. **Settings → Integrations → Active Directory**: host, port (389, or 636 with TLS), service account bind DN and password, base DN. *Test connection* performs a real bind and a search.
2. **Settings → Sign-in methods**: enable *Active Directory*. Optionally enable *Create accounts automatically* and add **group mappings** (`Portal Admins` → *Administrators*). Match by group CN or full DN. Deleting a portal group removes the mappings that point at it; a mapping to a group that no longer exists is skipped at sign-in (logged), never failing it.
3. Users sign in on the *Password* tab with their domain login (`ivan`, `ivan@corp.local`) and domain password. Disabled AD accounts are rejected by the directory.

An admin can pre-create an account without a password; the first directory sign-in with the same username links to it. A person moved to another OU keeps their account (matched by `objectGUID` / `entryUUID` when the DN changed). For LDAPS with an internal CA, see the *CA certificate* field in [integrations.md](integrations.md#active-directory--ldap).

### Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather); paste the token in **Integrations → Telegram** and press *Test connection* — the bot username is filled in.
2. In BotFather run `/setdomain` and enter your site's domain. Without it Telegram shows *Bot domain invalid*.
3. Enable *Telegram Login* and/or *Code in Telegram*.
4. Users link Telegram in **Cabinet → Security**. Linked users can then sign in with one tap or receive codes from the bot.
5. The stored `@username` is refreshed on every Telegram sign-in and link (Telegram usernames change hands). If one username is still stored on several accounts, *Code in Telegram* sends nothing for it (logged) until the right person signs in with Telegram again.

The widget uses redirect mode (`/auth/telegram`), so the CSP does not need `unsafe-eval`. nginx allows `https://telegram.org` scripts and `https://oauth.telegram.org` frames for it.

### WhatsApp (Gateway or Wazzup)

1. Configure **Integrations → WhatsApp Gateway** (URL + API key) and/or **Integrations → Wazzup** (API key + WhatsApp channel).
2. Enable *Code in WhatsApp*, choose the main provider and, if both are set up, turn on fallback. The method appears on the sign-in page only when the chosen provider (or, with fallback, the other) is configured.
3. Users need a valid phone number in their profile — it is validated against international numbering plans on save.

### Mattermost

1. Configure **Integrations → Mattermost** (server URL + bot token) — see [integrations.md](integrations.md#mattermost).
2. Enable *Code in Mattermost*. Users need their Mattermost username in the profile; the code arrives as a direct message from the bot.

### Email

1. **Integrations → Email (SMTP)**: host, port, credentials, sender.
2. Enable *Code by email*. Users need an email address in their profile (unique across accounts).

### Magic links

Enable *Sign-in links* once at least one code channel works. `FRONTEND_URL` must be the public origin — it is used to build the link.

## Adding a permission

1. Add the key to `PERMISSION_CATALOG` in `src/backend/services/permissions.js` (and to built-in roles if they should have it).
2. Protect the route: `router.post('/reports', requirePermission('reports.manage'), …)`.
3. Add `permissions.reports_manage.title/.desc` and, for a new area, `permissions.groups.<group>` to both locales. Dots in permission names become underscores in i18n keys.
4. Use `useAuth().can('reports.manage')` to hide UI the user cannot use, and set `permission` on the navigation entry.

Existing installations keep their built-in roles' permissions; grant the new permission through **Roles** or a one-off SQL update.

## Links to integrations (Users → a person)

- **Active Directory.** A manually created person can be linked to a directory account: *Link* searches the directory (login, name or e-mail; service bind, escaped filters) and stores the DN (`users.external_id`, `auth_source = 'ldap'`). The person then signs in with the domain login and password; at each directory sign-in their name, e-mail and mapped groups follow the directory. A DN can belong to one portal account only (`DIRECTORY_TAKEN`). *Unlink* returns the account to local sign-in (codes, Telegram, portal password).
- **Domain password** (superadministrators only). *Check* binds with the login and password; *Save* checks again, links the account if it was not linked (refusing a login of another account — `DIRECTORY_MISMATCH`), and stores the password sealed for file servers (`drive_credentials`, `server_id NULL`, `source = 'admin'`). It is used for servers with "use the portal sign-in", even when "remember the sign-in password" is off — so a person signing in with a WhatsApp/e-mail code still reaches the shares. 10 checks a minute per administrator. Events: `directory_linked/unlinked`, `directory_password(_removed)`.
- **Telegram** can be linked by the numeric Telegram id or unlinked; **Google** can be disconnected; WhatsApp phone and Mattermost name are edited in Contacts.

| Method | Path | Permission |
|--------|------|-----------|
| GET | `/api/admin/users/:id/links` | `users.view` |
| GET | `/api/admin/directory/search?q=&forUser=` | `users.manage` |
| PUT / DELETE | `/api/admin/users/:id/directory` `{ dn }` | `users.manage` |
| POST | `/api/admin/users/:id/directory/test` `{ login, password }` | superadministrator |
| PUT / DELETE | `/api/admin/users/:id/directory/password` `{ login, password }` | superadministrator |
| PUT / DELETE | `/api/admin/users/:id/telegram` `{ telegramId, username }` | `users.manage` |
| DELETE | `/api/admin/users/:id/google` | `users.manage` |

## Sign in as a user

A superadministrator can open the portal as another person (*Users → the person → Sign in as*). The administrator's own session is kept in the `da_impersonator` cookie; the borrowed session (`imp` claim, at most a day) shows a banner with *Back to my account* (`POST /api/auth/impersonate/stop`, which revokes the borrowed session and restores the original only if it is still valid and belongs to that administrator). While acting as someone, changing their password, sessions, Telegram/Google links, API tokens, push devices and the sign-in contacts of the profile (e-mail, phone, Mattermost — other profile fields can be edited) is refused (`IMPERSONATION_LIMIT`), as are the API console and starting another impersonation. Paths are compared case-insensitively with repeated slashes collapsed, as Express routes them. Another superadministrator cannot be signed in as (`SUPERADMIN_TARGET`), and the route is never available to API tokens. The borrowed session ends as soon as the administrator is blocked, disabled or no longer a superadministrator, and when the administrator's own sessions are ended (sign out everywhere, password change, revoke sessions). Start and end are security events (`impersonation_start/end`).
