# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

The admin console redesign and hardening pass. See [docs/audit.md](docs/audit.md) for the reasoning behind each change.

### Security and reliability (audit)

- Google sign-in links to an existing account by email only if the address is trusted. An address is trusted if an administrator, a directory or Google set it, or if the user proved it with an email code. Switching Google accounts drops the old token.
- Push subscriptions accept only real push services (no SSRF), and sign-out unsubscribes the device.
- Calendar recurrence is bounded: invalid rules are refused, dates are kept in a sane range, expansion is capped, and the reminder job isolates errors. All-day reminders use local time, and series edits clear stale exceptions.
- Task board moves can no longer loop. Reopened or reassigned tasks re-arm deadline reminders, and reminders go only to people who still have access.
- Bad input returns 400 instead of 500 (task filters, status ids, calendar ids, notification paging).

### Added (languages and resources)

- **Default language** (*Settings → General*): Русский, English or the browser's language.
  - It applies to guests and to people who have not chosen a language, including their emails, notifications and sign-in codes.
  - Each person chooses their own under *Account → Appearance* ("as the portal" is an option) or with the flags in the header. Signed-in people keep the choice in their profile, so it follows them to every device.
- **Online resources: portal modules and translations.**
  - *Add modules* puts Counterparties, the Knowledge Base, Files and other modules on the board. Module tiles show their name in each person's language and hide when the module is off.
  - Titles, descriptions and category names are entered in Russian and English.
  - Portal icons are available in the icon picker.

### Added (public API)

- **REST API for integrations** at `/api/v1` (the same endpoints as the interface) with **API tokens**: `Authorization: Bearer pat_…` or `X-API-Key`. A token acts on behalf of a person and never exceeds their rights; only a SHA-256 of it is stored. See [docs/public-api.md](docs/public-api.md).
- **Flexible access:**
  - access templates (8 built-in, custom ones with colour and icon), applied to every token based on them;
  - per-area levels (none / read / write) with point changes over the template;
  - allow/deny path rules (`*`, `**`);
  - limits to selected task projects, calendars or file spaces, applied in every module endpoint;
  - IP allow lists, expiry, per-token rate limits, revoke and rotate.
- **Webhooks** for tasks, chat messages, calendar events and accounts:
  - a run-as person, so only visible events go out;
  - resource limits;
  - HMAC-SHA256 signatures;
  - retries, auto-disable after repeated failures;
  - test delivery, delivery log, redeliver.
- **API console** (`/admin/api`, permission `api.admin`):
  - overview with traffic, error rate, p95, busiest endpoints and tokens, and items that need attention;
  - tokens, templates, webhooks, request log and settings;
  - a live "check a request" panel in the token and template editors.
- **Personal tokens** under *Account → API tokens* (permission `api.tokens`).
- **Developer portal** (`/developers`):
  - a guide and the reference of every endpoint (found automatically, the main ones described with parameters and examples);
  - code samples in cURL / JavaScript / Python / PHP and a "Try it" console;
  - search, RU/EN, dark theme, phones;
  - OpenAPI 3.1 download for Postman and code generators;
  - can be made public.

### Added (help, notifications, calendar)

- **WhatsApp as a notification channel** (through the configured gateway or Wazzup, to the phone in the profile): its own card, switch and column in *Profile → Notifications*; reminders *to messengers* go to Telegram, WhatsApp and Mattermost.

- **In-app help** on three levels: ⓘ hints next to form fields (about 115 across the modules), a quick guide in a side panel (*?* in the header or the **?** key), and the help center `/help` with full guides, steps, examples, Q&A and search for every module. See [docs/help.md](docs/help.md).
- **Notification preferences rebuilt** (*Profile → Notifications*):
  - channel cards with status and fixes;
  - a test through every channel with per-channel results;
  - an events × channels table with presets;
  - quiet hours and pause, in the person's time zone (reminders always come through);
  - subscriptions to task projects and shared calendars;
  - a delivery history showing where each notification went and why it did not arrive.
- **Calendar:**
  - shows every task you take part in (not only as assignee);
  - drag a task to move its deadline;
  - a "Without a deadline" list to schedule tasks by dragging;
  - create a task or an event from an empty slot;
  - a work-week view;
  - personal settings (view, hours, grid step, weekends, which tasks, defaults for new events);
  - follow a shared calendar.
- After creating a task, the note shows its deadline with an *In the calendar* link to that day.
- **Reminder time picker:**
  - quick presets, with date and time chosen separately;
  - a live "fires … — in …" line;
  - warnings when a chosen channel (push, Telegram/Mattermost, e-mail) is not connected.

### Fixed

- Background jobs no longer time out right after a start: the scheduler runs at most three jobs at once and stops waiting for a job after 5 minutes.
- **Security:**
  - API token scopes could be bypassed by changing the letter case of a path (`/api/Account/API/tokens`). Paths are now compared case-insensitively, with repeated slashes collapsed.
  - Requests that change data are refused when a browser marks them as coming from another site (`Origin` check).
  - `/uploads` serves only avatars and logos; every other file goes through its module's access check.
  - Webhooks check the resolved address at connect time and recognise every IPv6 form of private IPv4 addresses.
  - The sign-in return path rejects backslash tricks.
  - `nodemailer` upgraded to 10 and DOMPurify patched.
- **Installed app (PWA):**
  - headers, panels, dialogs, toasts and full-screen viewers leave room for the clock, the notch or Dynamic Island and the status bar;
  - a back button appears in the header.

### Added (chat)

- Chat module (`/app/chat`): direct and group conversations and conversations attached to records of other modules. Real time over Server-Sent Events, with replies, @mentions, reactions, files and images (paste or drop), editing and deleting, read receipts, typing, search, a files tab, pin/mute/hide, and a video-call link (Jitsi by default). A chat icon with the unread count sits in the header. Web push goes to people not looking at the room (one notification per room, replaced by newer ones), and mentions go through the notification center. Modules attach chats to their records with `registerChatEntity()` and post events as system messages. See [docs/chat.md](docs/chat.md).
- `notify()` accepts `channels` to limit a notification to some channels.
- nginx: a dedicated unbuffered location for the chat stream.

### Changed (tasks v2)

- **Two forms.** A quick form (title with the *Important* flame, description, assignee = me, deadline = a week ahead at 19:00, chips Files / Checklist / Project) and a full form in a side panel with the task chat beside it. *Create* has a menu: full form, from a template.
- **Visual description editor** (TipTap) with mentions, lists, attachments, *checklist from text* and an expanded mode.
- **17 optional blocks** opened by chips, remembered between tasks: results (*result required* blocks closing), files (computer, Files, file server), several nested checklists, project, co-assignees, auditors, flows, tags, reminders, parent task, subtasks, related tasks, recurring, Gantt dependencies, deadline planning, time tracking, custom fields.
- **Roles:** originator, assignee, co-assignees and auditors get rights on the task itself. Tasks may have no project (hidden project `TSK`). Several assignees create a copy per person; delegating keeps the previous assignee as an auditor.
- **Task card:** start, complete, defer, delegate, rate, favourites, views, overdue highlight, copy and print.
- **Task chat** replaces comments and history: discussion plus an event feed, with *almost overdue* / *overdue* reminders offering *Complete it* and *Change the deadline*. Existing comments and history are imported on first open.
- **Templates and recurring tasks** share one mechanism; **flows** distribute tasks among a team (in turn or to the least loaded).
- **My tasks** has role tabs: doing, helping, assigned, auditing, all.

### Added (dashboard)

- Dashboard module (`/app/dashboard`, can be the home page): 17 widgets over tasks, calendar, files, file server, knowledge base, online resources, companies, notifications and administration, with charts (donut, bars, area/line/column time series, rings, sparklines) drawn in SVG. A starting set for everyone; each person can drag, resize by the corner, add from a gallery, duplicate, remove (with undo) and set up widgets with filters; saved automatically. Administrators (`dashboard.admin`) can make their arrangement the starting set. Works on phones and in the dark theme. See [docs/dashboard.md](docs/dashboard.md).

### Added (file server activity log)

- Activity log of the file server for holders of the new `drive.audit` permission (super administrators always): views, downloads, uploads, changes, deletions, links, sign-ins to servers and administration, from the portal and public links, with failures, IP and browser. Filters for period, people, actions, folders, result, source and path, free-text search, figures for the period, most active people and files, and CSV export. Settings: on/off, folder listings, retention (365 days by default).

### Added (file pages and PDF slides)

- Files and the file server open a file on its own page by default: the viewer gets the whole window, the page has an address to bookmark or send, ‹ › steps through the folder's files, and a button leads back to the folder. The new *Opening files* setting in both modules switches back to the modal.
- PDF viewer: *Slides* view (one page at a time, fitted to the screen) and a full-screen *Presentation* with keyboard, click, wheel and swipe navigation, an all-slides overview (`G`), a progress line and controls that hide while idle. Landscape documents open as slides. Converted PowerPoint files get the same.

### Fixed

- File server: a missing or rejected SMB login now returns 403 instead of 401, and the browser signs out only when the portal session itself is gone (`SESSION_REQUIRED`). Before, a local administrator who opened "Add folder" was thrown to the sign-in page. The dialog now explains why the share list is empty and can list shares with a one-off domain account.
- PDF viewer: nginx served `.mjs` as `application/octet-stream`, so with `nosniff` the browser refused the pdf.js worker. `.mjs` (and `.ttf`) now have proper MIME types.
- Image viewer: SVG files get a thumbnail in the gallery strip.
- The language chosen in the profile was not applied (only the browser's language and the last flag clicked on that device counted).
- Signing in for the first time through Active Directory or Telegram failed with a server error when the directory had no email for the person.
- Pages could stay blank after a new version was deployed. Tabs now reload themselves once, and any other page error shows a recoverable message instead of an empty screen.

- **"Too many requests" for active users.** The general API limit used to be 100 requests per 15 minutes per IP address, shared by everyone behind the same office NAT. Now:
  - signed-in people are counted per account (5,000 per 15 minutes);
  - guests are counted per IP (300);
  - page-load reads and file streams are not counted;
  - sign-in is never blocked by a busy guest IP.

  The per-person cap is editable under *Settings → System*. When the limit is reached, the UI shows how long to wait.

### Added

- **Counterparties module** (`/app/companies`). Guide: [docs/companies.md](docs/companies.md).
  - Companies and contact people.
  - Country profiles with validated identifiers: Russian INN/OGRN check digits, KG, KZ, UZ, BY, TJ, CN, TR and others.
  - *Fill from the register* by identifier:
    - Kyrgyz Ministry of Justice, including the official PDF extract, which is parsed and attached;
    - Russia: DaData with a key, or the free EGRUL with its extract.
  - Duplicate detection and *Check with the register* with a field-by-field comparison.
  - Careers: a person leaves and moves to another company without being deleted.
  - History of every change (old → new, who, when), notes, calls and meetings.
  - Ratings with criteria; documents.
  - Relationship types, custom fields, archive.
- **Online resources module** (`/app/resources`). Guide: [docs/resources.md](docs/resources.md).
  - Company links as icon tiles with title, short description, category and *new tab / same window*.
  - Visibility: everyone (guests included), employees, or chosen users, groups and roles.
  - Personal layout: drag & drop, hide and restore, reset. It is kept on the server for employees and in the browser for guests.
  - Icon designer: 1,850 Lucide icons, 3,400+ brand logos, your own PNG/SVG/WebP with a dark-theme variant, or letters. Gradient, soft, solid or plain style, custom colours and a separate dark colour, with light and dark previews. Shapes are whitelisted and drawn without HTML.
  - Catalogue with drag-ordering, categories and on/off switches.
- **Home page choice** (*Settings → Site access*): the welcome page, the online resources board or any enabled module.
- **File server module (Drive)** (`/app/drive`). Guide: [docs/drive.md](docs/drive.md).
  - Company Windows file servers (SMB 2/3, Samba) as one network drive. The administrator names it, adds servers and publishes shares or sub-folders with titles, colours and DFS paths.
  - Effective rights come from the server (share + NTFS, i.e. AD security groups) and drive the UI: read-only folders, hidden folders without access.
  - Sign-in with the AD portal password (sealed, removed when the account is disabled) or credentials entered per server, or a service account. A rejected password is parked and never retried, which prevents AD lockouts.
  - Viewers for PDF, Word, Excel, Office via conversion, images and SVG, video, and AutoCAD DWG/DXF (LibreDWG + WebGL viewer with layers). Markdown and text are edited in place with conflict detection.
  - Upload with conflict choice, atomic writes, move or copy, delete, ZIP downloads, recursive search, favourites, recent files, copy network path.
  - Public links `/d/<token>`: anyone or employees only, password, expiry, download switch. Links act with the author's credentials and stop automatically (with a clear page) when the author leaves the company or loses access. Admin overview of all links.
  - A Python SMB gateway on a private Unix socket with sessions pooled per credential.
- Sign-in returns to the page you came from (`/login?next=…`).
- **Files module** (`/app/files`). Guide: [docs/files.md](docs/files.md).
  - My files, Shared with me, Recent, search with paths, and the trash (restore, delete forever, automatic purge after 30 days).
  - Shared spaces with view / edit / manage rules; `files.admin`; a setting for who may create spaces.
  - Sharing with users and groups (view / edit, inherited by folder contents) with a notification.
  - Public links `/l/<token>`: password, expiry, download switch, view counter, revoke.
  - Drag & drop uploads, grid and list views, multi-select move and delete, personal quota, and an allow-any-type option.
- **Knowledge Base ↔ Files**:
  - Knowledge Base uploads are stored in *My files → Knowledge base*.
  - *Add from Files* for folders.
  - Articles embed files (`kbfile:<id>`) and carry attachments, readable through Knowledge Base access and public links.
  - Files in use cannot be trashed (`409 FILE_IN_USE`).
  - Existing Knowledge Base files are migrated once.
- **Tasks module** (`/app/tasks`). Guide: [docs/tasks.md](docs/tasks.md).
  - Projects with short keys (`HR-12`), access per project and their own workflows.
  - Kanban board with drag & drop (mouse, touch, keyboard), a list view, and *My tasks* grouped by deadline.
  - Checklists, Markdown descriptions, comments with @mentions, watchers and a full history.
  - Deadline and overdue reminders.
- **Calendar module** (`/app/calendar`). Guide: [docs/calendar.md](docs/calendar.md).
  - Personal and shared calendars, month / week / day / agenda views, drag to create and move.
  - Recurring events expanded in the event's time zone, with single-occurrence edits.
  - Attendees with RSVP, reminders, task deadlines, and Google Calendar shown live.
- **Google integration**. Guide: [docs/integrations.md](docs/integrations.md#google).
  - Sign-in with Google: OIDC with PKCE and JWKS verification, a domain allow-list, auto-provisioning.
  - A connected-accounts page with Google Calendar access.
  - Gmail as the outgoing mail sender.
- **Notification center**. Guide: [docs/notifications.md](docs/notifications.md).
  - The bell with an unread counter.
  - Per-user channels: push, email (SMTP or Gmail), Telegram, Mattermost.
  - Notification and app-badge updates.
  - A scheduler with advisory locks for reminders.
- **Installable app (PWA)**. Guide: [docs/pwa.md](docs/pwa.md).
  - Manifest built from settings, a service worker, an offline page, icons, and a custom app icon.
  - Web Push, including iPhone home-screen apps.
  - The `/install` guide with illustrated steps for iPhone, Android and desktop.
- Sealed secrets (AES-256-GCM) for OAuth refresh tokens and the VAPID key; `ENCRYPTION_KEY`, `PUBLIC_URL`.

- **Motion**: pages slide in on every navigation (only the content animates in settings and the knowledge base); cards, lists and settings sections appear in a short cascade; modals and drawers glide in over a frosted backdrop; switching the theme reveals the new one as a circle growing from the button (View Transitions API); buttons respond to presses; spinners appear only for slow loads. All of it honours *prefers-reduced-motion*.
- **Module platform**: `/apps` launcher (also in the top bar), short URLs `/app/<id>`, *Settings → Modules* to switch modules on and off. A disabled module is invisible in both the UI and the API. Permissions `settings.modules` and `kb.admin`. Guide: [docs/modules.md](docs/modules.md).
- **Knowledge Base** (`/app/kb`), the first module:
  - folders of any depth with icons and colours (defaults in settings);
  - files (drag & drop), Markdown articles and links;
  - search; grid and list views; mobile drawer.
- Knowledge Base **access** at the base, folder and material level (view / edit / manage) for everyone, users, groups and roles, with inheritance and private folders.
- Knowledge Base **public links** `/s/<slug>`:
  - custom address with a live availability check and suggestions (Cyrillic and Kazakh transliterated);
  - password, expiry, download switch, view counter;
  - revoke and restore; tokens are invalidated when the password changes.
- **Viewers**:
  - pdf.js with thumbnails, zoom, fit width/page, text selection and full screen;
  - image lightbox with zoom, pan, pinch, swipe and a thumbnail strip;
  - Word (docx-preview), Excel/CSV grid, Markdown/text, video/audio.
- **Document conversion integration** (Collabora / LibreOffice `convert-to`): Word, Excel, PowerPoint and OpenDocument shown as PDF, with a cached preview. Guide: [docs/knowledge-base.md](docs/knowledge-base.md).
- nginx: `/api/app/` accepts uploads up to 1 GB, streamed; the CSP allows the pdf.js worker and WebAssembly decoders.

- **Roles, groups and permissions (RBAC)**: permission catalog, five built-in roles (Super administrator, Administrator, Moderator, Auditor, User), custom roles, groups that grant roles, a default group, escalation-proof assignment, last-super-admin protection in a transaction, read-only settings for viewers. New **Groups** and **Roles** pages.
- **Sign-in through integrations**: Active Directory / LDAP (real bind, auto-provisioning, group mapping), Telegram Login (redirect widget), 6-digit codes via WhatsApp (Wazzup), email and Telegram, and magic links. New *Settings → Sign-in methods* screen.
- **Bank-style code entry**: six cells, auto-submit on the last digit, paste and OS autofill, countdown, resend timer.
- Sign-in contacts on profiles: phone, Instagram, linked Telegram; first password for SSO accounts.
- Setup wizard seeds roles and groups in its language and can add sample users; `make seed-demo` for existing installations.
- Machine error codes for sign-in failures, translated in the UI.
- **Mattermost integration**: sign-in codes by direct message from a bot, security alerts (danger events) posted to a channel, real ping/token/channel checks; Mattermost username on profiles.
- WhatsApp Gateway (WAGW) as a WhatsApp provider for sign-in codes, on any domain, with a provider choice and fallback to Wazzup; real health and key checks in *Test connection*.
- Phone numbers validated against international numbering plans (`libphonenumber-js`); invalid stored numbers are flagged.
- Activity events *Code for unknown contact* and *Code delivery failed* to diagnose sign-in codes without revealing anything to the requester.

- **Wazzup integration** (WhatsApp, Telegram, Instagram, Avito and more via [Wazzup](https://wazzup24.com) API v3): write-only API key, channels loaded from the account and grouped by messenger, one default channel per messenger (stored as `{ transport: channelId }`), readable channel states, *test connection* that validates the selected channels.
- **Settings hub** at `/admin/settings`: every configurable option grouped into Project, Appearance, Security, Integrations and System, with search and a grouped side navigation (a select on mobile).
- **Command palette** (⌘K / Ctrl+K) across admin pages, settings screens and quick actions.
- **Floating save bar** shown only while a form has unsaved changes.
- **Overview dashboard** with user KPIs, 24-hour security counters, recent events, recent sign-ins, quick links and system status (`GET /api/admin/overview`).
- **System screen** with version, runtime, database info and API rate-limit controls (`GET /api/admin/system`).
- **User management**: search, role and status filters, last sign-in, a dedicated user page, *sign out everywhere* (`POST /api/admin/users/:id/revoke-sessions`).
- **Cabinet**: password confirmation and *sign out other devices* (`POST /api/account/sessions/revoke`).
- **Dark-theme logo** and configurable logo height.
- UI for settings that previously had no screen: session lifetime, API rate limit, SMTP SSL/TLS, Active Directory TLS.
- `TRUST_PROXY_HOPS` for deployments behind an additional reverse proxy.
- `SETUP_LOCKED`, written automatically once the wizard completes.
- Navigation registry (`src/frontend/src/admin/navigation.js`) and a UI kit (`PageHeader`, `SettingsSection`, `SettingRow`, `SaveBar`, `LoadState`, `useSettingsForm`).
- Backend unit tests (`node:test`), `make test`, and test runs in CI.
- Lock files for both packages; `npm ci` in Docker and CI.
- Favicon, `color-scheme` meta, document title from the app name.
- English documentation: README rewrite, [extending guide](docs/extending.md), architecture review, changelog, issue and pull-request templates.

### Changed

- Admin sidebar reduced to Overview, Users, Activity and Settings. Old URLs redirect to their new locations; previously chosen menu icons carry over.
- Settings and IP rules are cached for 5 seconds and invalidated on write.
- The API rate-limit cap applies without a restart.
- *Test connection* uses the values currently in the form.
- Search matches word prefixes in both English and Russian.
- Node.js 20 → 22 LTS in Docker images and CI.
- Route-level code splitting; React and Ant Design in separate vendor chunks; only the selected typeface is downloaded.
- nginx caches hashed assets for a year and revalidates `index.html`; `X-Forwarded-For` is appended instead of overwritten.
- Footer credit reads *Developed by iSmartyPro*.

### Fixed

- The setup wizard could reopen while the database was unreachable.
- Frequent page loads were rate-limited on `/api/setup/status` and redirected configured installations to the wizard.
- Saving sign-in settings re-enabled the IP block-list.
- Administrators could lock themselves out by IP, demote or block themselves, or remove the last active administrator.
- Role changes and blocking did not end the user's sessions.
- Deleting users and IP rules had no confirmation; several failures were unhandled.
- The collapsed sidebar misaligned icons and forgot its state on reload.
- The *System* theme ignored OS theme changes until reload.
- The UI version ignored the `VERSION` file.
- Malformed JSON bodies returned `500`.

### Security

- `409 SELF_LOCKOUT` guard for allow-list, block-list and rule deletion.
- Integration writes accept only known groups.
- Role change, disable and block now revoke sessions.

## [0.0.1]

- Initial skeleton: setup wizard, authentication, cabinet, admin console, theming, integrations stubs, IP lists, Docker packaging.

[Unreleased]: https://github.com/iSmartyPRO/docker-app-skeleton/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v0.0.1
