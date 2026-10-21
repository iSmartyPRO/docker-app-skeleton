# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.9.0] - 2026-10-21

### Added

- **Code by SMS** sign-in method ([docs/access-control.md](docs/access-control.md#sms-isms-server)): a one-time 6-digit code — or a sign-in link — by SMS through the iSMS Server integration to the phone number in the profile. Settings → Sign-in methods → *Code by SMS*; the sign-in page gets an *SMS* tab. Same protection as the other code channels (5 minutes, single use, 5 attempts, send limits, no account enumeration).

## [1.8.0] - 2026-10-21

### Added

- **iSMS Server** integration ([docs/integrations.md](docs/integrations.md#isms-server-sms)): SMS through your own [iSMS Server](https://github.com/iSmartyPRO/isms-gw-server) — any server address and its own API token per portal. *Test connection* lists the phones and SIMs the token can use; the SIM to send from can be chosen or left to the server; a test SMS checks the whole path to the phone. The token is stored write-only and is sent only to the saved server.

## [1.7.0] - 2026-10-21

### Added

- **QR codes** module ([docs/qr.md](docs/qr.md), off by default): branded codes for a website, vCard business card, Wi-Fi, e-mail, phone, SMS, WhatsApp, Telegram, location, event and text. A studio with the kind and its fields, a gallery of templates drawn with the person's own content, and the design in tabs — six dot styles, five corner frames and centres, solid / linear / radial colours, the portal brand colour that follows the theme, the company logo (light or dark), an uploaded logo or an icon on a plate, caption frames (caption, card, ticket, badge), quiet zone and error correction. The live preview is checked for scanning by a built-in decoder as you design, with warnings for low contrast, inverted colours and an oversized logo. Downloads: PNG 512–4096 px, SVG, copy as picture.
- **QR templates** (permission `qr.admin`): nine ready-made templates (two follow the brand), a default one, order, show / hide, names per language and locks (colours, shape, logo, frame) that the server enforces in people's codes; deleted ready-made templates can be restored.
- **Dynamic QR codes**: a website code may hold a short portal link `/q/<slug>` (nginx → `/api/qr/go/<slug>`), so its target changes after printing; the link can be paused; scans are counted per day (link-preview bots are not). Module settings: own design, own logos, dynamic codes, codes per person.

## [1.6.2] - 2026-10-20

### Fixed

- **Org chart**: each unit is centred between its first and last child, not over its whole subtree, so a parent no longer drifts sideways when its children's branches have different widths. The connectors follow.

## [1.6.1] - 2026-10-20

### Fixed

- **File server**: access granted by adding someone to a folder access group now works at once. Their file-server sessions are refreshed after a group change in File server → Access or in the AD directory, and an «access denied» on an older session is retried once on a new session. Before, it took up to 15 minutes. See [docs/drive.md](docs/drive.md#group-changes-take-effect-at-once).

## [1.6.0] - 2026-10-17

### Added

- **Localization infrastructure** ([docs/i18n.md](docs/i18n.md)): five interface languages — Russian, English, Kyrgyz, Turkish, Simplified Chinese — from one language registry shared by frontend and backend (Intl tag, dayjs and antd locale, direction). English is the reference and fallback. Kyrgyz, Turkish and Chinese are prepared (empty files fall back to English) for translation.
- **Settings → Languages** (superadministrators only, enforced by the API): enabled languages and their order (drag and drop), default language or «browser language» with a fallback, translation coverage per language. Existing portals keep Russian + English and their old default. Language switchers (header, sign-in, profile, public pages) show only enabled languages by native name; a disabled personal language falls back to the portal default, for notifications and e-mails too.
- Per-language **lazy bundles**: each language is one chunk already merged over English at build time (Vite plugin), only the active one is downloaded, switching needs no reload; dayjs, antd and FullCalendar locales load with it. Help articles and admin docs are per language and per article. The main bundle no longer carries any dictionary.
- CLDR **plurals** (`key_one` / `key_few` / `key_many` / `key_other` with `Intl.PluralRules`) on both sides; Russian plural helpers replaced.
- Server dictionaries `src/backend/locales/<lang>/` with `tr()`, `pick()`, `plural()`, `moneyText()`: notifications of every module, e-mails, sign-in codes, push test, PWA manifest, link previews, CSV exports (contracts, payments, procurement, warehouse, employees, CRM, masterplan), task statuses and starter content.
- `npm run i18n:check` (frontend) and `test/i18n.test.js` (backend): coverage, missing / extra keys, placeholder and plural checks; Russian and English must be complete. Glossary for translators: [docs/i18n-glossary.md](docs/i18n-glossary.md).
- Font stacks get Kyrgyz (Cyrillic Extended) and CJK fallbacks in every typography preset.

### Fixed

- **File server**: the per-session read limit (`SMBGATE_READS`) now covers each SMB call (stat, open, one chunk) instead of a whole download, so slow clients or a few long streams on a shared service-account pool no longer make everyone else wait and get `503 SMB_BUSY`.
- **CRM**: stock sources and lost reasons are stored, never relabelled by the portal language — existing portals that never saved CRM settings keep the Russian lists their deals hold (start-up migration); a brand-new portal gets them in the installer's language.
- **Masterplan import**: type and status names are matched in the person's language, then English, then the others (Turkish dotted / dotless i folded); ambiguous names are refused (`AMBIGUOUS_TYPE`, `AMBIGUOUS_STATUS`). Turkish «Villa» is the villa now, the cottage is «Müstakil ev». `test/import-vocabulary.test.js` keeps every import vocabulary unique per language.
- **Languages**: saving Account → Appearance keeps a personal language that is disabled for now; a language that failed to download is retried (once by itself, and on choosing it again); messages sent outside a request (notifications, e-mails, chat pushes) use the language of the person's last request in browser mode (`users.last_locale`); link previews use the fallback in browser mode; an unchanged `defaultLocale` from an older General form is ignored instead of refusing the save (403).
- **Settings cache**: the parsed hot-path view can no longer keep an older snapshot after a save, and freezing it no longer freezes module defaults.
- **Updates**: only a page that fails to load reloads after a deploy; other failed background imports show the update banner instead of reloading under someone typing.
- **Sign-in limits**: AD spellings of an account (`ivan`, `CORP\ivan`, `ivan@corp`) and phone shapes share one rate-limit bucket; sign-in code requests are capped at 20 per address again (10 per account).
- **Languages (QA of the five-language release)**: Kyrgyz dates, relative times, numbers and lists in Chromium browsers (they ship no Kyrgyz Intl data; a CLDR-based fallback fills it in, FullCalendar included); a full Kyrgyz antd locale (date pickers, pager, tables, dialogs, forms…); FullCalendar texts and screen-reader hints in every language; no spaces inside Chinese two-character buttons; file sizes with the language's decimal separator everywhere; procurement CSV urgency, warehouse tool state and masterplan finishing exported as words, not codes; English plurals instead of "(s)" and proper Russian plural forms; translated screen-reader labels (help menu, image and slide viewers, folder tree, one-time code, segmented controls); long menu and side-rail names wrap instead of being cut, phone fixes for segmented tabs, the time-zone field and long buttons; the help center loads only the open article and a small index after a language switch; core activity-log entries show in the reader's language.

## [1.5.1] - 2026-10-16

- fix(chat): redesign the header chats popover

## [1.5.0] - 2026-10-16

### Added

- **Org structure** (core service, spec platform-2.0 §3, [docs/org-structure.md](docs/org-structure.md)): a tree of units with configurable types (Компания linked to a legal entity, Центральный офис, Филиал, Отдел, Объект), code, head (employee or portal account), address, time zone inherited from above, status, order and purposes (`warehouse`, `construction`, `sales`…). Settings → Org structure: tree editor with drag and drop, undo, history of every move (also in the activity log), loops refused; org chart with heads and headcount (zoom, list mode on phones); types and purposes. Core API for modules `orgUnits()`, `unitOf()`, `managerOf()`, `descendants()`, `unitsByPurpose()`, `colleaguesOf()` (`modules/org/api.js`); `UnitSelect` and `OrgChart` for any module. Portal accounts get an optional unit and position (Users → a person → «Оргструктура»), so it works without the Employees module. Permission `org.manage`. Demo «ООО «Пример»» and a tour.
- **Approvals: «Руководитель подразделения автора»** approver (and «Вышестоящий руководитель»), resolved through the org structure when the stage opens; without a head the route's escalation people, else the module administrators approve (noted in the history). Route builder option and preview with a sample author. See [docs/approvals.md](docs/approvals.md#manager-of-the-author).
- **Employees** module (category People, off by default, [docs/employees.md](docs/employees.md)): registry (table and cards, filters by unit, site, position, status, «без доступа к порталу», «допуск истекает», search, CSV export with the formula guard), employee card (photo, position directory, unit and site, manager, personnel number, dates, status, employment type, work and personal contacts, HR notes, documents, skills and clearances), server-side visibility (`employees.view` directory / `employees.hr` everything / `employees.admin` directories and settings; the person sees their own card), portal account from the card in one step (password, one-time code or Active Directory; the Users rules apply), link / unlink, termination offers to block the account, clearance reminders once per threshold (`employees.clearance`), Excel / CSV import with a validation report, org chart, birthdays and anniversaries widget with a privacy setting, extension hooks for the AD directory module (`registerEmployeeExtension`, `registerEmployeeTab`), `EmployeePicker` for other modules. Demo: 25 people, some without portal access, clearances expiring. Tour, admin docs and user help.
- **Module manifests and versions** (spec platform-2.0 §1.2, §1.4): every module has a manifest in `modules/manifest.js` — version (1.0.0), category, minimum core, `requires`, `enhances`, docs and a short changelog — checked at start-up (unknown ids, requirement cycles, bad versions). `GET /api/admin/modules` returns them with each module's state. Client parts (tour, admin docs) in `frontend/src/modules/manifest.js`. See [docs/extending.md](docs/extending.md#module-manifest).
- **Switching modules with requirements** (§1.3): the server refuses to switch on a module whose required module is off (`409 MODULE_REQUIRES`, `info.missing`) or to switch off one others need (`409 MODULE_REQUIRED_BY`, `info.dependents`); `alsoEnable: true` switches the chain on. Dialogs «Для X нужны Y — включить вместе?» / «Нельзя выключить». `<ModuleHint>` shows inside modules which module to switch on for a hidden feature (Procurement supplier, Contracts counterparty, task chat).
- **Settings → Modules redesigned**: the core services, modules by category, version badges, statuses (On / Off / Needs X / Always on), needs and links, search and filters, buttons Documentation / Settings / Demo data / Tour.
- **«О модуле»** — administrator docs for every module at `/admin/modules/<id>/docs`: what it does and for whom, setup steps, roles and permissions (from the catalog), dependencies and links, scenarios, FAQ, changelog, the user guide. Content in `help/admin/<id>.js` (ru + en, all 16 modules); linked from the cards, each module's settings header and ⌘K.
- **Demo data framework** (§8): `registerDemo({ module, seed, purge })` in `modules/<id>/demo.js`, rows tracked in `demo_records` (works with foreign keys, real data never touched), demo users `demo.*@example.com` without sign-in; per module and «Демо всего портала» / «Удалить все демо-данные» for superadministrators; a «Демо-режим» bar for administrators. Seeds for Tasks, Calendar, Counterparties, Knowledge base and the Dashboard starting layout.
- **System report** (§9) on Settings → System: checks (HTTPS, URLs, secrets set, time zones, last backup from `BACKUP_DIR`), versions and build, modules table, disk / uploads / previews / memory / load / database and largest tables, counts, background jobs with last run and error, integrations status, webhook and notification queues; export as Markdown or JSON without secrets. The scheduler keeps per-job statistics.
- **Guided tours** (spec platform-2.0 §6): a tour engine anchored by `data-tour` attributes — dimmed page with a spotlight, popover with «2 из 7», Далее / Назад / Пропустить / Готово, ← / → / Esc, focus trap and screen-reader announcements, a bottom sheet on phones, every theme, reduced motion. It waits for lazy pages, scrolls anchors into view and skips steps whose anchor is not rendered (permissions, switched-off modules, phone layout), so tours stay within the person's access; the robot assistant steps aside while a tour runs. The portal tour starts on the first sign-in (never on public pages or while «signed in as»), a module tour on the first visit to it, never two at once. Tours for the portal, Dashboard, Tasks, Files, File server and Chat; «Тур» buttons next to module names (side rail), on the dashboard and in the chat list, «Пройти тур» in the help drawer and Account → Appearance. Progress per person on the server (`user_tours`, `GET/PUT /api/account/tours`), «Не показывать туры» in Account → Appearance, **«Сбросить туры всем»** in Settings → Theme (`POST /api/admin/tours/reset`, `settings.general`). Adding a tour: docs/extending.md → «Guided tours».
- **Themes** (§7): besides light and dark, ready-made themes **Графит, Океан, Лес, Песок, Полночь, Лаванда, Высокий контраст** and living themes **Рассвет** (drifting gradient), **Сияние** (aurora) and **Созвездие** (star grid) — low-resolution canvases repainted 2–3 times a second that stop on a hidden tab, after a minute without input, under reduced motion, on weak devices, with «Без анимации» or when the administrator turns animation off. **Своя тема**: a background picture and an accent colour with a live preview; the server checks the type by magic bytes, ≤ 8 MB and ≤ 4096 × 4096 (read from the header before decoding), and Pillow re-encodes it to WebP (2560 px, a 1280 px phone version and a blurred placeholder; `POST /api/account/background`, served only to its owner). Settings → Theme: the portal's default theme, which themes employees may choose, custom backgrounds and animation on/off. Every theme passes WCAG AA: tokens are corrected automatically (primary, status colours, secondary text, primary-button label) and `src/frontend/scripts/check-theme-contrast.mjs` checks every pair.

- **AD directory module** («Каталог AD», spec platform-2.0 §5, [docs/directory.md](docs/directory.md); off by default): Active Directory users, groups and computers inside a **managed root** OU — a lazy OU tree with counters, lists with search across the root and filters (disabled, locked, password expired, never signed in, inactive N days), configurable columns, a card (photo, status, password expiry, last sign-in, groups with their type, members, history, linked portal user and employee). Create users with a wizard (sAMAccountName from a template with transliteration and collision suffixes, OU, UPN / mail, initial password, groups), edit allowed attributes, move, enable / disable, unlock, reset passwords with «must change at next logon», group membership, bulk disable / move / offboard with a server preview. **Every write runs as the acting administrator's own AD account** (the File server's credential mechanism; the service account only reads), needs a confirmation and is journalled (`ad_journal`, Activity events `ad_changed`, `ad_password_reset`, `ad_credential`). Excluded OUs (DNs or name patterns) and hidden accounts are never listed nor writable, DNs are compared RDN by RDN (crafted escaped DNs and `<GUID=…>` forms refused), filters are escaped per RFC 4515. Password operations need LDAPS or the new StartTLS option — without a secure channel the UI explains why reset is unavailable; passwords are never stored. Folder access groups (`sg_…`) stay in File server → Access (read-only with a link). Links to portal users («Create portal user») and, with the Employees module, the «Учётная запись AD» tab of employee cards («Create AD user for the employee»). Without AD the page explains the setup, and a superadministrator can fill a neutral **demo directory**. Permissions `ad.view`, `ad.manage`, `ad.passwords`, `ad.admin`; guided tour; admin and user docs. A manifest requirement may now say `demo: true` (switching on is not blocked; the status still shows what is missing); `withActor` accepts `{ startTls }`; registry entries may list several permissions.

- **Demo data and tours of the business modules** (spec platform-2.0 §6, §8): coherent demo data for **CRM** (two pipelines, 20 deals in every stage with clients from Counterparties, calls / meetings / tasks — overdue and due today), **Masterplan** (project «Посёлок «Пример»»: 20 cottages and a 24-flat building, a generated site plan with contours, every sales status with running booking timers, price grids, construction stages and photo reports), **Contracts** (8 contracts: cottage sales with deposit, schedule, payments and an overdue instalment that move the Masterplan units, a supply contract with risks and versions, one expiring, one in approval, a draft, a completed one; generated .docx / .pdf), **Procurement** (11 requests in every status incl. one waiting for the director, partial and overdue payments, generated invoices) and **Warehouse** (2 warehouses with bins, 30 items by quantity / batch / serial, receipt, issue, requisition, transfer in transit, write-off in approval, stock below minimum, an inventory count). Seeds follow the dependency order (`after`), reuse the demo colleagues of Org / Employees, go through the modules' own services and the approvals engine; a demo approval route is added only when none is saved (an edited one is kept); purge removes rows, processes, chats, notifications and files on disk (the append-only warehouse journal only for demo documents). Shared helpers `modules/shared/demoAssets.js` (tiny PNG / PDF / DOCX generators) and `demoApprovals.js`. **Tours** for CRM, Masterplan, Procurement, Contracts, Warehouse and «Ждёт меня» (`modules/<id>/tour.js`, texts in `i18n/businessTours.js`, registered by `modules/shared/businessTours.js`) with `data-tour` anchors on their pages. Tests: `test/business-demo.db.test.js` (`DEMO_DB_TEST=1`), `test/business-tours.test.js`.

- **Demo data and tours of the remaining modules** (spec platform-2.0 §6, §8): demo **Files** — a shared space «Демо: проектные документы» with folders of generated Word / Excel / PDF files, site photos and a README.md, a view-only public link and an **upload-only** link for contractors (shared space, so no personal quota; types and links the settings forbid are left out; purge removes the blobs on disk); **Chat** — three group chats and three direct conversations with demo colleagues, a photo and a PDF, @mentions, unread messages (written directly, no notifications); **Online resources** — three categories and 11 tiles on `example.com`, portal modules and a public tile; **Calendar** extended — a second (site) calendar, next week's meetings, demo colleagues as attendees; **Knowledge base** extended — a visual-editor article with a picture, a table and a checklist. **Drive** registers only an explanation (`seedable: false`: it needs a real SMB server) — no «fill» button, «Демо всего портала» passes over it. Helpers `simpleXlsx` (`modules/shared/demoAssets.js`) and `demoColleagues` (`modules/shared/demoPeople.js`). **Tours** for Calendar, Knowledge base, Counterparties, Online resources and Account → Notifications (texts in `i18n/coreTours.js`, `data-tour` anchors on their pages, «Тур» buttons on the knowledge base, resources and notifications pages). Tests: `test/core-demo.db.test.js` (`DEMO_DB_TEST=1`), `test/tours-coverage.test.js` (every module has a tour or a reason not to, every anchor exists, texts in both languages).

### Changed

- **Contrast of the brand palettes**: the base light/dark themes now pass WCAG AA too — primary buttons in dark mode get a dark label where white was unreadable, secondary text (`--da-muted`, antd secondary/description text) is a solid colour of at least 4.5:1, and a brand primary that is too light for text is darkened slightly (Aurora Gold light `#B8863B → #85612B`, Graphite Copper light `#9A5B34 → #965933`).
- **De-branding** (§10): customer names and domains removed from code comments, defaults, placeholders, tests and docs (neutral `example.com`, «Пример», «Северный квартал»); deployment-specific notes moved out of the product ([docs/deployments/README.md](docs/deployments/README.md)).
- **Linking accounts in Employees** now needs `users.manage` besides `employees.hr`. Neither the Employees nor the Org structure screens can link, unlink or move an account with more access than your own.

### Security

- Code review of Platform 2.0 ([docs/reviews/2026-10-16-platform-2.md](docs/reviews/2026-10-16-platform-2.md)) found 30 defects, all fixed before release. The main ones:
  - **AD directory:** relinking an AD login to a superadmin account; adding users to protected groups through the wizard; the acting admin's password sent without StartTLS on ordinary writes; folder-access groups editable outside File server.
  - **Demo seeds:** they could run approvals and notifications through real routes and real people.
  - **Theme background converter:** it had no rate limits.

## [1.4.2] - 2026-10-16

### Fixed

- `make prune-build` (run after every rebuild/deploy) really trims the Docker build cache now: entries older than 2 days go and the rest is capped at 6 GB. Before, it removed only dangling records and the cache grew by about 1 GB per deploy.

## [1.4.1] - 2026-10-16

### Changed

- **Folder access is now part of the File server** («Доступ»). The separate «Доступ к папкам» app is gone: in the File server every folder has a **«Доступ»** button (toolbar, and a subfolder's menu) that opens a side panel for that folder — *Группы доступа* (every group pair that opens it, members with add / remove / move, inherited access from the folders above, «Создать пару групп») and *Права NTFS* (superadministrators, the existing ACL editor). The sidebar gets a «Доступ» section: folders and groups **by project**, person card, access journal, mismatch report. Its settings are a block «Управление доступом» with its own switch in the File server settings; the permission is `drive.access` (was `folderaccess.groups`); the API moved to `/api/app/drive/access/…`. See [docs/drive-access.md](docs/drive-access.md).
- **Any company's AD layout**: any project code after `sg_` (optional allow-list instead of the fixed `co`/`wh`), folder name parts with underscores (`sg_obj2_qaqc_styajka_full`), the group description decides the folder and access type (spaces, commas, Cyrillic), groups searched in every project OU under the base (or a list of OUs), the project shown is the first OU below the search base, `OU=Groups` skipped (`ОБЪЕКТ-2`; a group right in the base has none), `sgManager_*`, `adm_*` and distribution lists ignored. Several pairs may open one folder.
- **Path prefixes per File server folder** replace the drive-letter map: a folder's descriptions are matched by the longest prefix (`G:\ОБЪЕКТ-2\_DocArch`, `W:`), set in the folder's editor. New group pairs go to the Groups OU of the folder's project (fallback: the configured OU).

### Migration

- At start-up (idempotent, non-destructive): the old block is copied to the settings key `legacy_folderaccess`, then converted into `modules.drive.settings.access` in one locked transaction (switch carried over; drive letters become path prefixes of their folders, e.g. `W` → «ЦО» gets `W:`; extra org codes become aliases, `wh` → `co`); `modules.folderaccess` is kept for a rollback; roles with `folderaccess.groups` also get `drive.access`; the journal table `fa_journal` is renamed `drive_access_journal` with its rows, indexes and sequence in one transaction.
- **Project code aliases** (`wh=co`): new group pairs next to `sg_wh_*` groups are named `sg_co_*`; the create dialog shows the OU, the project and where they come from.
- The «Доступ» panel also opens on a folder the File server cannot list (button on the error page); File server folders without access stay listed for people with «Доступ» when *Hide folders without access* is on. The standalone NTFS editor's endpoints `GET /ntfs` and `GET /ntfs/tree` are removed.
- The API reference lists nested routers, so every `/app/drive/access/…` route is in it.

### Fixed

- The person column of the access tables showed nothing (a duplicate translation key).

## [1.4.0] - 2026-10-16

### Added

- **Folder README** in the File server and Files (and their public folder links): a `README.md` in a folder is shown rendered above the listing — a collapsed preview with a soft fade and «Показать полностью / Свернуть», hide per folder or everywhere (⋯ → «Показывать README папок»), open / edit (File server Markdown) / download / copy link. GitHub-flavoured Markdown (anchors, task lists, scrolling tables, code with «Копировать»), strictly sanitized; relative links and pictures stay inside the share or link and use the normal read rights. Loaded after the listing, cached per version, UTF-8 or Windows-1251, up to 512 KB. See [docs/drive.md](docs/drive.md#folder-readme).

## [1.3.0] - 2026-10-15

### Added

- **Folder access («Доступ к папкам»)** — who can open which folder on the file server, through the Active Directory security groups `sg_<org>_<name>_full|read` (org codes `co` and the old `wh`). Folders list with search and «Требует проверки» for names and descriptions that do not match; folder card with both groups' members (name, login, department, active / disabled); person card with every folder; add and remove, move between full and read access in one step, copy access from a colleague, revoke all. Every change runs with the acting administrator's own AD account (domain password reused from the File server or asked for and checked), is journalled (who, AD account, IP, before → after, result; filters, CSV, undo) and recorded as a security event. New permission `folderaccess.groups` for system administrators (no protected root groups, people only); superadministrators also create group pairs, edit descriptions and delete groups. NTFS permissions come in the next stage. See [docs/drive-access.md](docs/drive-access.md).
- Modules can name a permission in the frontend registry: the launcher, «Все приложения» and the quick-actions widget list Folder access only for people with `folderaccess.groups` (or `*`).

## [1.2.0] - 2026-10-15

### Added

- **Contracts: deposit, payment schedule and payments** for companies that sell (cottages and apartments). A contract with a client (or of the «Купли-продажи» / new «Продажа объекта» type, or any contract that already has one) gets the «Оплаты» tab: the deposit — «Задаток» or «Аванс» with a one-line legal hint, amount and currency, due day, refund / forfeit terms, document; finance confirms the receipt (who and when), credits it to the price, returns (double for a задаток) or retains it. A payment schedule from the amount — 100 % or installments (first payment %, months, first day, day of month), prefilled from the linked Masterplan object's price grid, whole amounts with the last payment absorbing the difference, the deposit as its own row counted toward the first payment, rows editable before saving. Payments received are allocated to the oldest rows first (partial payments too) with «оплачено N %», remaining, overdue (red) and upcoming (amber) by the person's day. See [docs/contracts.md](docs/contracts.md#deposit-and-payments).
- **Contracts: payments registry** (`/app/contracts/payments`) for the new `contracts.finance` permission and those who see every contract: Просрочено / Сегодня / На неделе / Позже, totals per currency, «Отметить поступление» and «Подтвердить» a deposit in the row, CSV export (formula-guarded). Registry chips «Ждут задаток», «Просрочены платежи», «Оплачены» (shown when they count something), «оплачено N %» under the amount, a dashboard widget «Поступления по договорам», payment reminders before the day and once when overdue (owner, then finance), «Ждёт меня» items «Платёж просрочен» for finance, notifications `contracts.payment`, `contracts.payment_due`, `contracts.payment_overdue`, webhooks `contracts.deposit.received`, `contracts.payment.received`, `contracts.payment.overdue`.
- **Contracts → Masterplan**: a contract linked to an object moves it with the person's Masterplan rights — deposit confirmed → «Задаток», signed → «Договор» (number, date, amount), payments update «оплачено», 100 % → «Продано». A move Masterplan refuses never fails the contract action: both histories record it and the card shows what to do by hand. See [docs/masterplan.md](docs/masterplan.md#integrations).

### Fixed

- Contracts registry: the header uses the shared module header (actions never run off the right edge, the create button moves to the bottom dock on phones), and the chips scroll inside the page width with fading edges and ‹ › buttons instead of being cut off.

## [1.1.0] - 2026-10-15

### Added

- **Online editing of office documents** in Files and the File server with Collabora Online (WOPI) — «Редактировать онлайн» / «Открыть в редакторе» in lists, menus and the file page, a full-window editor with save status, co-editing, «Редактирует: Имя» locks, conflict detection on the file server and desktop-lock awareness; Files keeps the previous content in the trash once per editing session. Settings → Document conversion → «Онлайн-редактор» with a connection check and the Collabora values to configure. See [docs/office-editing.md](docs/office-editing.md).

## [1.0.3] - 2026-10-15

### Changed

- Dashboard «Быстрый доступ»: app tiles use the launcher's colour icons; columns follow the card's width (4 on most phones, 3 on narrow ones), labels take at most two lines, and apps that do not fit go behind an «Ещё N» tile that opens the rest with a link to all apps. Nothing is cut off at the card's edge any more; a card too low for tiles shows a list.
- Dashboard on phones: list-like widgets (quick access, tasks, notifications, agenda, files, links, month, warehouse, procurement…) are as tall as their content, with no inner scrolling and no empty space under a short empty state; tighter paddings and gaps; the title row keeps «+» and «Настроить» as icon buttons next to the title; room at the bottom so the assistant does not cover the last card. In edit mode the actions fit on one row («Администрирование» becomes an icon) and the resize corner, which phones cannot use, is gone.
- Dashboard widgets: header actions use the app's icons instead of «⚙ ⋯» characters; on phones, touch screens and narrow cards only «⋯» is shown (settings is its first item); the «⋯» menu items have icons; empty states use the widget's icon in its colour instead of emoji. A card whose content does not fit shows soft shadows at the edge it scrolls to.
- Header on phones: a wide logo shrinks with its proportions and no longer runs under the buttons; the header keeps chat, inbox, notifications, apps and the account button, while help, theme, language and the admin console move into the account menu.

## [1.0.2] - 2026-10-15

### Fixed

- Warehouse: two people scanning one tool count it once; a tool found in another bin is moved by the inventory act instead of being in two places; a tool counted in two bins stops the finish until the manager decides; serial items are counted per tool label on the phone (a counted piece can be removed one by one); batch surpluses go into an existing batch; tools not found become «Не найден» and come back with a storno.
- Warehouse: the phone's inventory queue keeps counts when the session expired or a request was refused for a moment and sends them after signing in (only closed or deleted inventories drop them).
- Warehouse: the inventory act is built under the session lock (no count lost to a last-second sync); deleting a failed act lets the session be reopened.
- Warehouse: storno keeps the closed period, never leaves value on empty stock (a recorded cost adjustment), gives back consumed reserves and takes the delivery mark back in Procurement; a hand-over decline can no longer cancel a confirmed one.
- Warehouse: old drafts are dated when posted (a chosen past date stays); the closed period and «today» follow the portal's time zone; an emptied «received» field means 0, not «all arrived»; a barcode scanned into a quantity field is taken as a scan.
- Warehouse: a write-off from an employee takes only what came from the document's warehouse; the «not enough stock» safety-net error names the item and quantities; about 20 error codes got Russian and English texts.
- Public links (Files, Drive): a drop box answers and lists a visitor's upload under the name they sent, even when the folder already had that name (the owner sees the stored «Name (2)»).
- Public links: views count once per visitor tab — not reloads after an upload, not F5, not «Open as recipient» (Drive now supports `?preview=1` too).
- Public links: Files and Drive read a permission list by one rule (`['upload', 'download']` is a drop box in both; stored Drive lists keep their meaning); the picker uses the same rule.
- Files: folder uploads of hundreds of files through a public link are no longer stopped by the general guest limit (uploads have their own per-link budget, like Drive); nginx accepts `/api/v1/l/…/upload` like `/api/l/…`.
- Files: Russian and English texts for the public-link errors TOO_MANY_FILES, NOT_FOLDER, NOT_FILE, FILE_MISSING, MOVE_CYCLE, SYSTEM_FOLDER, TRASHED, LINK_DISABLED, NAME_REQUIRED.
- Link previews: a changed, revoked or deleted link (or a new address) shows its new state at once, not after a minute.
- Phones: the bottom action bar of Files and Drive no longer covers the end of the list.
- Releases: a push that failed is retried by the next `make release` / `make deploy` (also when there is nothing new to release); `make deploy` pushes the release only after the new version is up and healthy, and stops when the database backup cannot be made (`BACKUP=skip` to deploy without one). See docs/operations.md, «Failed deploy».

### Security

- Warehouse: posted sums no longer leak through document history or approval processes to people without the cost right; the item card, scanned codes, holder hints and the «by holder» report show only places the person may see; code lookup needs a warehouse right, a running count or held goods.
- Public links (Files, Drive): file addresses (`?t=`) carry a separate read-only token; the visitor session that allows changes travels only in the `X-Link-Token` header, and the bundled nginx masks `t=` in its access log. Sessions issued before are swapped on the next page load without asking anything again.
- Public links: rate limits count per link, so letter-case variants of a custom address no longer get extra password attempts or uploads.
- Public links: a password-protected or employees-only link no longer tells its name or kind before it is opened; link previews follow the IP allow-list (a refused address gets the plain page, no link lookup); a forged `Host` header can no longer make the server draw new preview pictures, and the drawing queue is bounded.
- Public links: changing or deleting a custom address writes its 90-day hold in the same transaction.
- Files: links that accept files and have no quota of their own are limited by a new module setting «Максимальный объём загрузок по ссылке по умолчанию» (2 GB by default; uploads and new versions count).

## [1.0.1] - 2026-10-15

### Fixed

- CI: backend unit tests no longer need a `.env` (`JWT_SECRET` is set by a test fixture), so GitHub checks pass again.

## [1.0.0] - 2026-10-15

### Versions and releases

- Every deploy is versioned automatically: `make deploy` classifies the commits since the last tag (major / minor / patch, Conventional Commits), bumps `VERSION`, both `package.json` and lock files, closes the CHANGELOG section, tags `vX.Y.Z`, pushes, backs up the database and rebuilds. The tag becomes a GitHub release with the CHANGELOG notes (`.github/workflows/release.yml`). The version shows in the app footer, `/version.json`, `/health` and on GitHub. The project starts at **1.0.0**.

### Module switch on settings pages

- Warehouse and Procurement settings pages get the «Модуль включён» switch (shared `ModuleEnableSwitch`), like the other modules; before, they could only be switched on from Settings → Modules.

### Simpler sharing and responsive headers

- **Share dialog (Files and File server):** simple by default — what the recipient can do (view / view and download), expiry, password and a **custom link address** with a live availability check, transliteration and suggestions; «Создать и скопировать» with QR and «Открыть как получатель»; all fine-grained settings moved under «Расширенные настройки». Slugs are unique per module (case-insensitive, race-safe), revoked links keep theirs, a changed slug is held 90 days for its author; token addresses keep working.
- **Page headers:** Drive and Files use a new `ModuleHeader` (title, one-line action cluster, toolbar row, compact and phone modes); every other module's header and toolbar was audited at 390–1920 px and fixed — no ragged button rows, no horizontal scroll, consistent control heights, icon components instead of unicode glyphs.

### Link previews in messengers

Docs: [docs/link-previews.md](docs/link-previews.md).

- Every page now carries the portal's name, description, colour and icon (no more «docker-app-skeleton» / «Application console» in WhatsApp/Telegram previews); nginx hands page addresses to the app server and falls back to the static `index.html` (neutral «Портал» defaults) when it is down.
- Public links (`/l`, `/d`, `/s`) get resource-aware Open Graph / Twitter cards: file name, type and size, folder item counts, what the recipient can do, expiry and sender; upload-only links invite to send files; password-protected and refused links show only generic cards.
- Branded 1200×630 preview pictures (resvg + bundled Inter font), cached under `uploads/.previews/og`; crawler fetches and `HEAD` requests no longer count as link views; «Как будет выглядеть в мессенджере» in the share dialogs.

### File server — public link permissions

- Drive links get the same per-action permissions as Files (view, download, upload, folders, rename/move, replace, delete) with presets and «Настроить…», per-link size/type/total limits, visitor name/e-mail and batched notifications; existing links keep view + download.
- Writes run as the link creator's file-server account; rights are probed through the gateway when the link is saved (`GRANT_EXCEEDS`), name clashes never overwrite silently («file (1).pdf» for upload-only, Replace / Keep both / Skip otherwise), deletes need explicit permission and a confirmation (no recycle bin on SMB) and are logged with the visitor's name.
- Visitor sessions bound to the link version, per-link and per-IP rate limits, path confinement, admin switches for write links and required passwords; premium visitor page with drag-and-drop/folder upload and an upload-only drop box.

### Files — public link permissions

Docs: [docs/files.md](docs/files.md#link-permissions).

- **Per-link permissions:** view, download, upload, create folders, rename/move, replace, delete. Presets «Только просмотр», «Просмотр и скачивание» (default; existing links keep exactly what they had), «Только загрузка», «Просмотр и загрузка», «Полный доступ» and «Настроить…».
- **Upload rules per link:** maximum file size, allowed extensions, total quota, ask the visitor's name (and e-mail), notify me (one notice per visit).
- **Visitor page:** owner and link name, «Вы можете: …», drag & drop and folder uploads with per-file progress and cancel, new folder, rename, replace, delete with confirmation; a «Отправьте файлы для …» drop-box page for upload-only links that shows only the visitor's own uploads.
- **Share dialog:** link cards with permission chips, edit, QR code, «как это увидит получатель», activity log; files added through a link show «через ссылку · имя».
- **Security:** a link grants at most its author's rights (checked on every request); admins can switch off links that allow changes, require a password for them and choose who publishes links; changes run inside the link's subtree only, need a visitor token bound to the link version, are rate-limited and go to the owner's trash (replaced versions too). nginx accepts large bodies on the two public upload routes only.
- **Shared UI:** `components/ui/LinkPermissions.jsx` permission picker (also for Drive).

### Warehouse module

Spec: [docs/specs/warehouse.ru.md](docs/specs/warehouse.ru.md) · docs: [docs/warehouse.md](docs/warehouse.md). Off by default.

- **Items:** quantity, batch (expiry) and serial tracking, units with factors («уп. = 24 шт»), barcodes, categories, per-warehouse minimum and reorder point; import of items and opening balances.
- **Warehouses** (main, site, transit, mobile) with a MOL and optional **bins**; per-warehouse rights; sums hidden on the server without `warehouse.cost`.
- **Documents:** receipt (also from a purchase request — marks delivery), return to supplier, two-step transfer with a discrepancy act, issue to an employee or a Masterplan object with on-screen signature, return, write-off (approval above 500 USD), opening balances, correction, storno. No negative stock, atomic posting, reserves, moving-average cost, «Заказать недостающее» → procurement draft.
- **Tools:** where each instance is, «Мой инструмент», hand-over with confirmation, maintenance reminders.
- **Storekeeper mobile mode** (`/app/warehouse/m`): tiles, continuous camera/USB scanning, quantity sheet with pack ↔ base units, waybill photo, signature, accepting transfers, «Найти позицию», label printing.
- **Inventory sessions:** blind mode, frozen scope, counters by bins in parallel from phones (offline queue), reconciliation, one act with approval.
- **Reports:** stock, turnover statement, item movement, materials by object, tools by holder; dashboard widgets; «Ждёт меня» items for incoming transfers and hand-overs.
- **Shared UI:** `BarcodeScanner` (camera + keyboard-wedge scanners), label printing (Code 128, EAN-13, QR; 58×40, 80×50, A4 3×8). nginx now allows the camera on the portal's own origin.
- Chat list no longer scrolls sideways on phones.

### Code review fixes — business modules and Masterplan 1.1

Review: [docs/reviews/2026-10-13-business-modules.md](docs/reviews/2026-10-13-business-modules.md) — 38 findings, all fixed.

- **Procurement:** requests are no longer visible through the default group; only the author, responsible or admin starts approval; the responsible person can resend and cancel; links and pickers respect other modules' access; autosave keeps the newest edits; invoice lock can't be bypassed.
- **Approvals:** decision buttons always act on the open document; editing amounts or categories during approval re-plans the remaining stages; API tokens need the document module's scope; disabled modules accept no decisions; substitutes see questions consistently; faster inbox.
- **Contracts:** refusal deadlines with long notice periods reach the inbox; CSV dates follow regional settings.
- **Masterplan:** in moderated projects, substantive edits of a published report go back to review; report history respects report visibility; concurrent moves can't create cycles; Escape in the photo viewer keeps the card open; plan editor — deleted points stay deleted, undo removes the right step, sectors can't become points, smoother panning, contour drafts survive reloads, bulk move limited to 500 with a warning; «м²» translated.
- **Tasks:** reopening a never-accepted task restarts the time to accept; re-armed «не принята» notices when the deadline changes.

### Business processes: approvals, procurement, contracts, orders

Spec: [docs/specs/business-processes.ru.md](docs/specs/business-processes.ru.md).

- **Approvals** ([docs/approvals.md](docs/approvals.md)), an always-on core service: routes with stages (people, roles, groups; all / any) and conditions (amount, category, project, legal entity) built in a drag-and-drop builder with a preview; decisions approve / reject / question / return / delegate / withdraw; urgency levels with reaction times, reminders at 75 %, escalation; substitutes; `approval.*` notifications and webhooks.
- **«Ждёт меня»** inbox (`/app/approvals`): everything waiting for the person across modules — grouped by overdue / today / the rest, inline approve, question and accept, bulk approve, side card with ↑/↓; header counter and a dashboard widget. Modules add items through `registerInboxProvider()`.
- **Procurement** ([docs/procurement.md](docs/procurement.md)), off by default: requests with items, invoice (also from the phone camera or Files), urgency, pay-by and deliver-by; approval → «К оплате» → partial/full payments with payment orders → delivery → closed; payments registry for accountants with totals per currency; summary and dashboard widget; shared legal entities directory (Settings → Project).
- **Contracts** ([docs/contracts.md](docs/contracts.md)), off by default: contract cards with file versions («что изменено»), the lawyer's risk list next to approval decisions, discussion, links to procurement, CRM and Masterplan; statuses by date (in force, expiring, finished, auto-prolongation), reminders 30 / 7 days before the end and before the refusal deadline; expiry calendar.
- **Orders in Tasks:** «Принять в работу» for tasks assigned to someone else, acceptance deadline (24 h, 4 h for important) with red «Не принята N ч», reminders; «Поручение» flag and leadership groups; chips Срочные / Просрочено / Не приняты / В работе / Отработано / Поручения; existing tasks are treated as accepted.

### Masterplan: point markers and construction reports

- **Point markers:** place an object on the site plan as a circle with its number instead of a contour — editor mode «Точки» with «Размещено X из N», chain placement («Ставить подряд»), drag with alignment, S/M/L size, labels, contour ↔ point, undo; markers follow the layers (status, readiness arc, type), apartment buildings get a ring of unit statuses and a «free/total» chip; numbers shrink to dots where markers would touch; works in presentation, search and on phones. Projects with several plans get a plan picker.
- **Construction reports:** edit and delete reports and single photos (author while not published and 24 h after publishing; head of construction and admins always), progress rolls back correctly and files leave the disk; a redesigned feed grouped by day with stage change «40% → 55%», status badges and inline moderation; a full-screen photo/video viewer with zoom, filmstrip, download, delete and shooting date/place.

### Masterplan 1.1 (first production project)

- **Status migration** («Перенести статус») for project administrators — any status with client, manager, date and contract data, bypassing the chain, the CRM deal requirement and the timer; per unit, in bulk from the registry and through import columns; history event «Миграция».
- **Prices by payment form:** dated price grids per project (or object type) — 100 % / installments with first payment, term and monthly payment — shown in the unit card and presentation; **planned price at completion** and a «price per m² over time» dashboard chart.
- **Bulk move** of several tree nodes in one action.
- **Plan labels:** numbers fit by text length with 9–14 px font and outline, status-coloured badges without overlaps, «Номера: авто / всегда / скрыть»; plan search by building, sector, unit and old number zooms and opens the card; zoom buttons fixed.
- **One card for any building:** apartment buildings show «свободно X из N», price ranges, composition by rooms with one-click reserve, a mini-chessboard, bulk close, and are coloured by share of free units.
- **Sector contours** may overlap (smallest object wins the click, «Контур по объектам»); **old numbers** («Было №…») in tooltip, card and search; **series media** (plans and renders shared by all objects of a series).

### Code review fixes (October 2026)

- **Masterplan:** expiry never releases a booking extended a moment ago and no longer deadlocks with manual actions; rights are checked before version conflicts; presentation mode stays redacted on live updates and CSV; history, status filter/sort and readiness follow field visibility; backdated reports can't lower progress; zone checks cover every object a report moves; import locks and re-validates units; one summary notification per bulk action; API tokens need the CRM scope to touch linked deals.
- **Calendar and tasks:** editing "all events" from one occurrence keeps the series history; single-occurrence changes notify attendees; editing keeps the event's own time zone; recurring task templates no longer duplicate, drift (31st → 28th) or fire past reminders; deferred tasks get no reminders; admins no longer see others' personal tasks; deleting tasks/projects removes their files and chats.
- **CRM and companies:** deal lines in company history only for people who see the deal; rapid inline edits in the deal panel no longer conflict; numeric custom fields stay numbers in CSV; dashboard widgets, entity chats and client lists respect API token scopes and disabled modules.
- **Files, Drive, KB, chat:** a cancelled Drive upload no longer hangs the gateway; cached previews require read access to the file; drive server secrets are cleared when the host changes; DWG conversions are shared and capped; faster Files search; atomic KB saves and quotas; preview caches pruned after 30 days; chat streams close after sign-out/revocation and reload missed messages after a reconnect; KB public links stop when their author loses access.
- **Platform:** the app retries schema bootstrap when the database is late at start (`/ready` reports it) and shuts down cleanly; a short outage no longer sends people to the sign-in page, module errors no longer open the maintenance screen, and automatic updates wait for uploads to finish; outer error boundary; Docker logs rotate, nginx logs to the container output, the image excludes nested `node_modules`, LibreDWG is checksum-pinned.
- **Integrations and core:** `.env` values with `$`, quotes or backslashes are saved exactly; previous encryption keys (`ENCRYPTION_KEY_PREVIOUS` / `JWT_SECRET_PREVIOUS`) still decrypt, and unreadable secrets no longer wipe Gmail or disable webhooks; push re-subscribes after key changes; AD accounts keep their link after an OU move (objectGUID), no duplicate first sign-ins, optional LDAPS CA certificate; Google sign-in no longer replaces a connected calendar account; webhooks of deleted users are kept paused; SMTP timeouts; WhatsApp code readiness follows the configured provider.
- **Security:** "sign in as" is unavailable to API tokens and for superadmin targets, its locks can't be bypassed by letter case and also cover sign-in contacts, push and the API console; it ends when the admin is blocked or demoted; start/end are logged; wrong current passwords count toward lockout; demo users are off by default and never linked to AD.

### Masterplan module

- **Masterplan** ([docs/masterplan.md](docs/masterplan.md)), off by default: development projects as a configurable tree (up to 8 levels, bulk lines «A-1-01…A-1-15» and apartments «floors × per floor», drag & drop moves), an object types directory and construction stage sets seeded from the spec; the **interactive site plan** (image/SVG background, contours, zoom/pan/pinch, hover tooltips, side card, layers Sales / Construction / Types, legend with counters, filters, breadcrumbs, contour editor, a tiles scheme while contours are missing, presentation mode); the **chessboard** with bulk price changes; the **registry** with Excel/CSV export and a validated Excel/CSV **import**; **sales statuses** with the transition rules enforced on the server, optimistic locking («Объект только что забронирован менеджером X»), reserves and bookings with 24 h / 2 h warnings, automatic release, extension and per-manager limits, price history and limits; the **construction journal** (stage plan / fact, readiness by weights, delays, photo reports from phones with in-browser compression, optional moderation); a simple **dashboard**; module roles as portal permissions plus project assignments with **zones of responsibility** and server-side field hiding; CRM link (deal ↔ units, deal history lines and amount, stage → status mapping, a Masterplan block in the deal panel through a new extension point); notifications and live updates over SSE.

The admin console redesign and hardening pass. See [docs/audit.md](docs/audit.md) for the reasoning behind each change.

### Security and reliability (audit)

- **Time zones and date/time formats** ([docs/datetime.md](docs/datetime.md)): Settings → General → *Region and time* sets the portal's time zone, date format (`DD.MM.YYYY`, `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `D MMM YYYY`), 12/24-hour time and first day of the week; each person may override any of them in Account → Appearance → *Date and time* (zone also “as on this device”). Every module shows dates and times, counts “today”, “this week” and “overdue”, offers pickers and presets, and the server writes reminders, notifications, quiet hours and CSV exports in the person's zone and formats; calendars run in the person's zone (FullCalendar luxon3) and start the week on their day; calendar days (`YYYY-MM-DD`) never shift.
- Module sidebars (CRM, Tasks, Calendar, Files, File server, Counterparties) collapse to an icon rail on desktop — chevron on the edge or `[`; remembered per module.
- Users → a person → *Links to integrations*: link a manually created person to an Active Directory account (directory search), store and check their domain password for file servers (superadministrators; works for people signing in with codes), link Telegram by id, disconnect Google. Superadministrators can *Sign in as* a user, with a banner to return; sensitive account changes are locked meanwhile and both ends are logged.
- Outages no longer fall back to a bare skeleton (default name, no logo): a “technical works” screen shows while the server restarts, the database is down or the connection is lost, checks the server every 5 s and continues by itself; it shows the error code, request id and the tab’s session id with “Copy details”. Requests carry ids (`X-Request-Id`, `X-Client-Session`); server errors and browser crashes are listed under Admin → Activity → Failures and errors, searchable by those ids; nginx answers JSON `MAINTENANCE` while the app server is down.
- Robot assistant: superheroes redrawn as Superbot and Supergirl (athletic bodies, the “S” shield, big fluttering capes); the owl gave way to Ryzhik, a lively fox cub; new Builder, Asel the builder, Architect, Girl and Boy. Administrators choose who picks the character — any, selected only, or one for everyone — and whether colours may change.
- Robot assistant: whole bodies for every robot (arms, legs, feet instead of a cut-off torso); seven new characters — Classic (retro), Pro (business suit), Boltik (chatty), superheroes Volt and Nova with capes, and two animals, Barsik the snow-leopard cub and Ükü the owl; each character can be recoloured per person; the cast is grouped (robots, Kyrgyz style, superheroes, animals).
- Robot assistant: two robots in Kyrgyz style — Ermek (white ak-kalpak with black brims and a tassel, red chapan with the koshkor-muyuz ornament) and Aichurok (red velvet topu with an owl-feather plume, braids with silver chach uchtuk, turquoise vest).
- The portal notices a new deploy (build id vs `/version.json`) when the app returns to the screen, on focus and every 5 minutes: a “New version” banner, an automatic update after a long absence or on the next page change — installed apps (PWA) no longer stay on an old version. On phones a row of tabs wider than the screen scrolls instead of widening the page; the assistant and the banner render in `<body>`.
- **Robot assistant** module: three animated robots (Pixel, Orbi, Kiko) with moods, draggable anywhere, offering help once per section and answering from the help (tips, guides, FAQ, search); on by default, each person can change or turn it off, administrators pick the default robot. See [docs/assistant.md](docs/assistant.md).
- The browser tab icon follows *App icon* (`/api/pwa/icon`, `/favicon.ico` redirect, runtime `<link rel=icon>` update, versioned manifest); SVG app icons are accepted.
- Knowledge base app icon is a graduation cap.
- File server: when exactly one share is online it opens straight away (`?list=1` shows the list).
- Files and File server: upload whole folders (drag and drop or *Upload folder*); the tree is recreated with existing folders reused, files go up three at a time with the usual checks, progress, cancel and per-file errors. Fixed a crash of the backend on Drive paths with invalid characters.
- Knowledge base visual editor: pictures can be resized (handles and S/M/L/100%/Auto), placed left/center/right or wrapped by text, captioned, given alt text, linked, replaced, opened or downloaded from a floating toolbar; readers open pictures in a lightbox.
- Knowledge base: a **visual article editor** next to Markdown — headings, marks, highlight, lists, checklists, alignment, links, tables, pictures and files pasted, dropped, uploaded or chosen from Files, full screen; new articles start visual, and an article can switch format at any time (`kb_items.content_format`).
- Code review fixes:
  - **Access**: tasks no longer reveal linked, dependent, parent or template items the viewer cannot see; a subtask can be attached only to a task you can edit; reminders to other people need edit rights; entity chats drop people who lost access to the task; a view-only file cannot be put into the KB; calendar-limited API tokens no longer see invitations from other calendars.
  - **Sign-in**: AD never links to accounts created through Telegram or Google; lockouts use a normalised login and count IP failures in the window; magic-link failures lock the IP, not everyone; code requests answer without waiting for delivery; code attempts are counted atomically; a new code no longer voids the previous one, and sends are capped per IP; logout ends the session on the server; forwarded addresses are trusted only from the container's own nginx.
  - **Secrets and admin**: integration passwords, keys and tokens are not reused when the server address changes (`SECRET_REQUIRED`); every settings key needs its permission; recent logins, security events and duplicate contacts need `users.view` / `activity.view`; role and group edits cannot strip access from people the editor cannot manage; administrators change their own password in their account; test notifications are rate-limited; contact uniqueness is serialised with advisory locks.
  - **API**: tokens and webhooks can run only as users with no more access than the creator (`TARGET_TOO_POWERFUL`); tokens cannot change e-mail, phone or Mattermost; absolute-form request lines and HEAD are classified correctly; public link paths run anonymously; failed token checks are rate-limited and not cached.
  - **Webhooks**: delivery to host names works on Node 22; a hard deadline per request keeps one slow receiver from stalling the queue; switching webhooks or the API off holds pending deliveries.
  - **Files and chat**: chat, task, KB and Drive files are served inline only when name, type and signature agree, under a sandboxed CSP; chat uploads check the room before writing; call cards come only from the call action; moving into personal storage respects the quota; rename re-checks allowed types; public file links stop when their author is disabled or lost access; deleting a user keeps their files in shared spaces; Drive CSV export is safe from formulas.
  - **Notifications and reminders**: quiet hours and the pause now delay external notifications instead of dropping them; "before deadline" reminders re-arm when the deadline moves; "remind me" works for project members; all-day reminders show the right date; editing one occurrence keeps attendees' answers; a recurring task no longer creates an extra copy; the scheduler holds a job's slot until it really ends.
  - **Interface**: safe links in Word documents; stale answers no longer replace newer ones in tasks, folders and the bell; event duration is kept when moving the start; the chat draft survives editing a message; own messages don't count as unread; "On Monday" on Sunday means tomorrow.
- A phone, e-mail, Mattermost or Instagram name can belong to one account only: saving one another account already has is refused (`409 CONTACT_TAKEN`), directory sign-in does not copy a taken e-mail, and *Settings → Integrations → Notifications* lists contacts still shared by several accounts (code sign-in to them fails until resolved).
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

- **Notification delivery settings** (*Settings → Integrations → Notifications*): channels used for notifications with how many people each reaches, the WhatsApp provider for notifications separately from sign-in codes (gateway, Wazzup, fallback), and a test message to any recipient. People connect a missing channel in place (phone for WhatsApp, Mattermost name, e-mail) with an instant test; reminders suggest only the channels the portal offers. The profile now saves the Mattermost name.
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

[Unreleased]: https://github.com/iSmartyPRO/docker-app-skeleton/compare/v1.9.0...HEAD
[1.9.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.9.0
[1.8.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.8.0
[1.7.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.7.0
[1.6.2]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.6.2
[1.6.1]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.6.1
[1.6.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.6.0
[1.5.1]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.5.1
[1.5.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.5.0
[1.4.2]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.4.2
[1.4.1]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.4.1
[1.4.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.4.0
[1.3.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.3.0
[1.2.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.2.0
[1.1.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.1.0
[1.0.3]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.0.3
[1.0.2]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.0.2
[1.0.1]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.0.1
[1.0.0]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v1.0.0
[0.0.1]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v0.0.1
