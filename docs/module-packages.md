# Module packages

Engineering reference for installing, updating and removing modules as signed zip files
(spec: [specs/module-packages.ru.md](specs/module-packages.ru.md), stages 2, 3, 4 and 6).
Operations (volume, keys, backups): [operations.md](operations.md#module-packages).

The portal is a **core** plus **modules**. Until a module is converted it stays *built in*
(`src/backend/modules/<id>`, listed in `modules/index.js` `MODULES`, source `bundled`). A
converted module is a **package**: a zip that a superadministrator installs in
Settings → Modules → «Установить из файла» (or «Пакеты на сервере», a zip the host operator put into
`data/modules/incoming/`); its code lives in the data volume and is loaded at boot.
Both kinds use the same module contract, catalog, manifest, on/off switch and registry.

## Package format

```
hello-1.0.0.zip
  manifest.json
  server/index.js        server code: one ES module bundle (esbuild), plus copied non-JS files
  web/index.js           browser code: ES modules (vite library build), web/chunks/*, web/*.css
  migrations/            001_init.sql, 002_seed.js … (NNN unique, each runs once)
  locales/<lang>/<ns>.js interface texts: `export default { … }` (namespaces; apps.js holds apps.<id>.name/desc)
  docs/                  administrator docs, help
  SIGNATURE              Ed25519 signature of every other file
```

Anything else at the top level (except `README.md`, `CHANGELOG.md`, `LICENSE`) is refused.

### manifest.json

| Field | Meaning |
|---|---|
| `id` | `^[a-z][a-z0-9_]{1,31}$`; URLs `/app/<id>`, `/api/app/<id>`; must not be a built-in module |
| `name` `{ ru, en, … }` | name; `nameForms.ru.ins` — instrumental case for messages («работает с „Закупками“») |
| `version` | `x.y.z` of the module |
| `core` | lowest core version, **same first number** («X or newer»; a new major is incompatible) |
| `requires` | `[{ id, version, name?, reason? }]` modules (installed, same major, ≥ version) or `[{ integration, reason, demo? }]` |
| `enhances` | `["id"]` or `[{ id, what }]` — optional links |
| `category` | one of `modules/manifest.js` `CATEGORIES` |
| `permissions` | `["<id>.<right>"]` — added to the roles editor |
| `description`, `changelog`, `docs` | the card before install, the Modules page |
| `settings` | `{ defaultEnabled (false), defaults {…}, public [keys] }` — the module's `settings.modules.<id>`; sanitized by the server export `sanitizeSettings(current, incoming)`, else by type against `defaults` |
| `tables` | table names or prefixes (`"hello_%"`) owned by the module, in addition to the tables its migrations create (backups, rollback restore, «Удалить данные»). Each must start with `<id>_` — or a legacy prefix the core declares for that module (`platform/packages/tableOwnership.js`: masterplan → `mp_`) — and may not match a core table or overlap another module's tables; the same rules filter the tables at run time |
| `server` `{ entry }`, `web` `{ entry, css, icon, permission, page }` | entry points (written by the build) |
| `locales` `{ <lang>: [ns…] }`, `builtAt`, `sdk` | written by the build |

`platform/packages/manifestFile.js` validates and normalizes it (`normalizeManifest`).

### SIGNATURE

The signed text is the canonical listing of all files but `SIGNATURE`, sorted by UTF-8 path:
`<sha256 hex>␠␠<path>\n`. `SIGNATURE` is JSON `{ format: 1, algorithm: "ed25519", keyId, signature }`;
`keyId` = first 16 hex of SHA-256 of the raw public key. The portal trusts the public keys in
`src/backend/platform/trusted-keys.json` (released with the core). A package without `SIGNATURE` is
accepted only with `MODULES_DEV=1`; a present but wrong signature is refused always.

**The signature is the whole trust model.** A signed package runs inside the portal process with full
privileges: it can read `/app/.env`, use `node:fs`, open any core file by a relative or `file:` import. The
`@portal/sdk` import rules (below) are a build-time convention that keeps honest code on the SDK, not a sandbox.
Sign and install only code you would put into the core. In particular a package can read the **portal identity
private key** (`portal_identity`, sealed with the portal encryption key derived from `.env`, which a package can read
too) and so sign inventories as this portal: the identity proves which portal speaks only as long as every
installed package is trusted. The SDK does not hand out `appConfig` or `seal` / `unseal`, but that is
convenience, not protection.

**Checked again at every boot** (`platform/packages/integrity.js`): the files of `$MODULES_DIR/<id>/<version>`
are hashed, the listing must verify against `SIGNATURE` with a trusted key and equal the listing recorded at
install (`installed_modules.listing_sha256`, plus `signature`). Code written into the folder by anything but the
installer (a file-write bug, host access to `./data/modules`, an older signed version copied over a newer one) is
not imported. A package installed unsigned in development mode is refused once `MODULES_DEV` is off.

### Archive safety (`platform/packages/zip.js`, `archive.js`)

Own reader/writer on `node:zlib` (stored + deflate). Refused: ZIP64, multi-disk, encryption,
symlinks and special files, absolute paths / drive letters / backslashes / `..` / empty segments /
control characters, duplicates (also by case, file vs folder), > 3000 entries, entry > 32 MB,
> 128 MB unpacked, inflation beyond the declared size, CRC or header mismatches. Upload cap 50 MB.
The archive is inflated once, at upload: its files go to `.staging/<token>/` (verified listing in
`<token>.json`); «Установить» re-verifies that folder from disk and renames it to `$MODULES_DIR/<id>/<version>`.

## Building: `make module`

```bash
make module ID=masterplan                 # version by Conventional Commits, signed
make module ID=masterplan BUMP=minor      # or MODULE_VERSION=1.3.0, or KEEP=1
make module SOURCE=path/to/module         # a module outside the core tree
make module ID=hello UNSIGNED=1           # development (installs only with MODULES_DEV=1)
make modules-verify FILE=dist/modules/masterplan-1.3.0.zip
make module-keygen                        # once: private key outside the repo, public key trusted
```

`scripts/build-module.mjs` (no extra dependencies: esbuild and vite from `src/frontend/node_modules`):

- **manifest.json** from `modules/manifest.js` + `modules/catalog.js`, overridden by the optional
  `src/backend/modules/<id>/module.json` (`version`, `core`, `requires`, `requiresVersions`, `tables`,
  `locales`, `localeKeys`, `docFiles`, `docsInfo`, `nameForms`, `settings`, `icon`, `web: false`, …). A module that
  is no longer in the core lists takes everything from module.json; settings defaults (`defaults`,
  `defaultEnabled`, `publicSettings`) may come from the module's `settings.js`. `requires` without a version
  get the required module's current version. `core` defaults to the core `VERSION`.
- **Version**: the module's own (module.json, else the manifest). Without options it grows like the
  core's (`scripts/release.mjs` classification) from commits touching the module's folders since the
  tag `<id>/v<version>`; without such a tag the current version is packaged. A new version is written
  to module.json; commit it and `git tag <id>/v<version>`.
- **server/**: esbuild bundle of `src/backend/modules/<id>/index.js` (ESM, node20). External: node
  built-ins, `@portal/sdk`, the backend `dependencies` (pg, express, multer, …: the core's copies are
  used). Relative imports of core files become `@portal/sdk/core/<path>`; imports of another module's
  internals fail the build (allowed: `modules/<other>/api.js`, `modules/shared/*`, `modules/catalog.js`,
  `modules/manifest.js`, `modules/dependencies.js`). Non-JS files of the folder are copied next to
  `server/index.js` (code that reads files via `import.meta.url` from sub-folders must be checked).
- **web/**: vite library build; entry `src/frontend/src/modules/<id>/index.js(x)`, or one generated from
  the module's entry in `modules/registry.js` (`App`, `Settings`, `register.js`). Shared names become
  `/sdk/<name>.js` imports (below); importing a core file that is not shared fails the build, and so
  does importing a name the core does not export (`/sdk/…` stay absolute URLs: `makeAbsoluteExternalsRelative: false`).
  CSS of the module (and core CSS it imports) goes into `web/assets/style-<hash>.css` (manifest `web.css`).
  `web.settings` is set when the entry has a `Settings`.
- **migrations/**: `src/backend/modules/<id>/migrations/NNN_name.sql|js` (JS ones bundled like server/).
- **locales/**: the module's own folder `src/frontend/src/modules/<id>/locales/<lang>/<ns>.js` (namespaces that are
  not in the core dictionaries), else core namespaces named `<id>*.js` (or module.json `locales`); plus its keys
  in shared core namespaces — `apps.<id>` always, others from `localeKeys` (`{ "<ns>": ["a.b", "prefix_*"] }`).
- The zip is checked with the portal's own `openPackage` before it is written to `dist/modules/`.

## Server side

### Module contract

`server/index.js` default-exports the same object as a built-in module:

```js
export default {
  id: 'hello',
  migrations: [{ id: '003_x', up: async (db) => {} }], // optional, merged with migrations/ files
  schema: async () => {},           // legacy: only when there are no migrations
  routes(ctx) { return router; },    // mounted at /api/app/<id> behind enabledOnly + requireAuth
  publicRoutes() {}, publicPrefix: '/hello-public', // optional anonymous routes
  api: { … },                         // public surface: ctx.modules.get('hello')?.api
  sanitizeSettings(current, incoming) {}, // optional
  register(ctx) {},                   // extension points (platform/registry.js)
};
```

`ctx` = the core registry context (`modules`, `events`, `registerWidget`, `registerLinkProvider`,
`registerObjectSource`, `registerSearchProvider`, …, see platform/registry.js) plus `version`,
`source`, `dir`, `manifest`, `db { query, withTransaction }`, `log`.

### Server SDK (`@portal/sdk` → `src/backend/platform/sdk/server.js`)

Resolved at run time by the hook in `platform/sdkLoader.mjs` (`module.registerHooks`), which also
resolves bare names imported from package code against the core's `node_modules`.

| Group | Names |
|---|---|
| Database | `query`, `withTransaction`, `getPool` |
| Config, secrets | `APP_VERSION`, `uploadRoot`, `seal`, `unseal` (SDK 1.1.0: the core's sealing of stored secrets, `services/secrets.js`, no key material) |
| Access | `requireAuth`, `optionalAuth`, `requirePermission`, `refuseImpersonation`, `hasPermission`, `getUserAccess`, `getAccessMap` |
| Settings, regional | `getSettings`, `getSettingsView`, `parseSettings`, `getSetting`, `setSetting`, `invalidateSettings`, `updateAdminSettings`, `localeFor`, `recipientLocale`, `regionalFor`, `portalRegional`, `regionalOfUser`, `requestRegional`, `requestZone`, `REGIONAL_DEFAULTS`, `formatDate`, `formatDateTime`, `formatTime`, `isValidTimeZone`, `isoDay`, `startOfDay`, `startOfWeek`, `wallToInstant`, `zoneLabel`, `zoneOffsetMinutes`, `zonedParts` |
| Languages | `tr`, `translator`, `plural`, `pick`, `localeOrDefault`, `localeTag`, `SUPPORTED`, `formatNumber`, `moneyText`, `decimalSeparator`, `exportLocale` |
| Notifications, inbox, events, jobs | `notify`, `eventAllows`, `prefsWithZone`, `quietState`, `subscribersOf`, `listNotifications`, `unreadCount`, `pushToUser`, `registerInboxProvider`, `inboxFor`, `inboxAct`, `setUrgencyRanker`, `emitEvent`, `requestAs`, `onModuleEvent`, `emitModuleEvent`, `onBeforeUserDelete`, `onDirectorySignIn`, `onDirectoryCredential`, `registerJob` |
| Journal | `recordSecurityEvent` |
| Extension points | `modules`, `events`, `registerWidget`, `registerWidgetSection`, `registerLinkProvider`, `linkProvider`, `registerObjectSource`, `objectSource`, `registerSearchProvider`, `searchAll`, `registerPreviewProvider`, `registerFollowable`, `canFollow`, `registerTokenResources`, `onHttpServer`, `onShutdown`, namespaces `widgets`, `pickers` (prefer the same functions on `ctx` inside `register()`: they are tagged with the module) |
| Other | `createUser`, `updateUser`, `assertCanManage`, `isValidPhone`, `normalizePhone`, `findUserById`, `listLegalEntities`, `getLegalEntity`, `getDefaultLegalEntity`, `convertToPdf`, `registerDemo`, `decide`, `limitsByTable`, `httpError(status, message, code)`, `logger(id)`, `SDK_VERSION` |

`appConfig` (database password, JWT secret) was dropped before SDK 1.0 shipped. `seal` / `unseal` came back in **SDK 1.1.0**
(`services/secrets.js`, the same AES-256-GCM sealing as the core's, without `decryptionKeys` or other key material): Remote
access keeps the passwords of computers, Passbolt keys and the Portal VNC client key sealed, and values sealed while it was
built in must open unchanged from the package (a package can read `.env` anyway, see «SIGNATURE» — this keeps honest code
off the keys). Packages built against 1.1.0 record `sdk: 1.1.0` and are refused by a core with SDK 1.0.0 (`SDK_TOO_OLD`);
Masterplan 1.1.0 (`sdk: 1.0.0`) keeps loading.
Adding a name is a minor SDK change; removing or renaming one is a major core change (bump `SDK_VERSION` in
`platform/sdk/version.js` and the browser's `src/platform/sdk/version.js` together; packages record it as `sdk`).
`@portal/sdk/core/<path>` (any core file except module internals, tests, scripts and the sensitive files —
`config/app.js`, `services/crypto.js`, `platform/identity.js`, `platform/packages/*`, `platform/sdkLoader.mjs`) is the
transitional escape hatch the build uses for converted modules — prefer the stable names. Not a security
boundary (see «SIGNATURE»).

### Boot (`modules/index.js` → `platform/packages/loader.js`)

1. While the core loads, `modules/catalog.js` and `modules/manifest.js` append the active packages
   read synchronously from disk (`platform/packages/disk.js`: `$MODULES_DIR/<id>/current` →
   `<version>/manifest.json`), so settings, permissions, API scopes and the Modules page know them.
   A package with the id of a built-in module is ignored.
2. Schema bootstrap: built-in modules run `schema()` (or versioned `migrations`), then
   `activateModules(MODULES)` (registry + `register(ctx)`).
3. Packages, in requirement order: core / SDK compatibility (`manifest.core` same major and not newer than the
   core, `manifest.sdk` same major and not newer than `SDK_VERSION`; otherwise failed with the §5 message, not
   imported, listed in the start-up log and on Settings → Modules as «needs an update») → files re-verified
   (above) → import `server/index.js` → check the contract and requirements → pending migrations → mount routes →
   join the registry. Then every package's `register(ctx)`. Import + migrations and `register()` each have
   `MODULE_BOOT_TIMEOUT_MS` (120 s).
   `ctx.onHttpServer` hooks run once both the HTTP server is up (`startModuleServer(server)` in server.js) and the modules registered; a hook registered after that runs at once on the running server. `ctx.onShutdown` hooks run on SIGTERM (`runShutdownHooks()`).
   Several WebSocket servers on the one HTTP server must not each take `{ server, path }` (`ws` answers 400 to every
   upgrade of another path and ends its socket): use `noServer` and one `upgrade` listener that dispatches by path (Remote: `modules/remote/upgrade.js`).
4. A package that fails is skipped; `installed_modules.state = 'failed'` with the error (journaled
   `module_failed` when it is news); the portal runs on.
   If that is the first boot after an update (`pending_check`), the previous version is put back
   (`current` ← `previous`; tables restored when the pre-update backup is a pg_dump) and the app restarts once more;
   the journal records `module_rolled_back` and `installed_modules.last_rollback` keeps `{ at, from, to, reason,
   tables, ok, backup }` — a later good boot does not clear it (the next install does); the module card shows it.
5. **Crashes and hangs — unfinished boots.** Before a package is imported, `$MODULES_DIR/<id>/.boot-attempt` is
   written (`disk.js`: `{ version, status, attempts, bootId, reason }`); it is removed once the package loaded and
   registered. The first boot after an update stays on probation for `MODULE_BOOT_SETTLE_MS` (30 s) after
   `register()`: marker and `pending_check` stay; a graceful shutdown (SIGTERM) confirms it early. A start that
   finds a marker never finished with that package, and what it does depends on whether the stop is the
   package's fault (`unfinishedBootDecision` in `loader.js`):

   | marker `status` | meaning | an update (`pending_check`) | a package already running |
   |---|---|---|---|
   | `crashed` | the crash guard found the package's code in the stack of the uncaught exception that ended the boot | rolled back at once, **before** its code is imported again | blocked at once |
   | `timeout` | its import + migrations or `register()` took longer than `MODULE_BOOT_TIMEOUT_MS` (120 s) | rolled back at once | loaded once more; blocked after the second timeout in a row |
   | `loading` | the process stopped for a reason nobody could attribute: OOM kill, power loss, `docker kill`, the watchdog, a crash of the core or of another package | loaded once more (`attempts` 2); rolled back after the second unfinished boot in a row | loaded once more; blocked after the second in a row |
   | `blocked` | decided earlier | — | stays blocked |

   «Blocked» packages are skipped (the card says so) until a new version is installed or the package is removed
   and installed again. A **timeout always asks for a restart** at once: the hung work cannot be stopped in the
   process (it could still commit migrations or register things while the module shows as failed), so it runs
   out in a fresh process, which then decides as above. A deliberate restart before the server listens
   (`exitForRestart`, e.g. a rollback asked for during the boot) first clears the markers of the packages still
   loading — that stop is nobody's fault. So an innocent package is never blocked by one unclean exit, and a
   broken one can never crash the portal in a loop.
   **After the window** (`platform/packages/crashGuard.js`, installed by `services/processGuards.js`): an uncaught
   exception whose stack has a frame in `$MODULES_DIR/<id>/<version>/` is attributed to that package before the
   process ends (exit 1, the container restarts it): during its boot or probation the marker becomes `crashed`;
   later the crash is counted in `$MODULES_DIR/<id>/.crashes`, and the third crash of the same version within
   10 minutes writes a `blocked` marker (the next start skips it, `installed_modules.error` and the journal —
   `module_crashed`, then `module_failed` — say why). The count is cleared after 10 minutes of uptime with the
   package loaded. A crash without a package frame ends the process as before.
   **Watchdog** (`start.sh` + `services/heartbeat.js`): a synchronous hang (a busy loop, `execSync`,
   `Atomics.wait` in an import or `register()`) stops the event loop, so no timeout can fire. node touches
   `PORTAL_HEARTBEAT_FILE` every 5 s while its event loop runs; `start.sh` kills it (`kill -9`) when the file is
   older than `PORTAL_WATCHDOG_SECONDS` (180; `0` = off) **and** `/health` does not answer, and starts it again.
   The marker of the hung package is then `loading` (not attributable), so the second such hang in a row blocks it
   (or rolls the update back). A slow but working start (the database late — the server listens in setup mode
   meanwhile —, a long migration) keeps the event loop free and beating, so it is never killed.
6. A `bundled` row of a module this core no longer contains (Masterplan after the upgrade) becomes `removed`
   (source `package`): data kept, shown under «Удалённые модули» with the hint to install its package. A portal
   upgraded straight from a core without the package platform (v1.18.0 and older: no `installed_modules` table,
   so no row at all) gets the same `removed` row for each module of `CONVERTED_MODULES` (`loader.js`; Masterplan,
   last built-in version 1.0.0) whose tables or stored settings exist.
7. **Data of modules this core does not know** (a package not installed yet, removed, or failed to load) is never
   rewritten away by an edit: a save of any module settings (`updateAdminSettings`, also through Contracts,
   Procurement… settings) keeps the stored `settings.modules.<id>` entries of unknown ids as they are
   (`keepUnknownModules`), a role edit keeps the role's unknown permissions (`keepUnknownPermissions`), an API
   token / template edit keeps scopes of unknown areas (`keepUnknownScopes`), and a dashboard layout save (personal
   or the starting layout) keeps the stored widgets whose types are not available now (`mergeParked`). They come
   back intact with the package. (The drive/access migration of the old `folderaccess` block relies on the same:
   the block stays in `settings.modules`.)

Tables: `installed_modules (id, version, state installed|enabled|disabled|failed|removed, source bundled|package,
installed_at, updated_at, installed_by, error, checksum, signed_by, previous_version, pending_check, backup_file, manifest,
listing_sha256, signature, last_rollback)`,
`module_migrations (module_id, migration_id, version, checksum, applied_at)`,
`module_tables (module_id, table_name, migration_id)`. The on/off switch stays in `settings.modules.<id>.enabled`;
the API reports `enabled` / `disabled` from it. Built-in modules get rows with `source = 'bundled'`.

### Migrations (`platform/packages/migrations.js`)

`NNN_name.sql` or `NNN_name.js` (`export async function up(db)`), sorted by number, each once per
module. **All pending migrations of one install / update / boot run in one transaction** with an
advisory lock: a failure leaves the database untouched. Tables created during a migration are recorded
in `module_tables` — the tables whose catalog row this transaction wrote (`pg_class.xmin` = its transaction id) and
that did not exist when it began, so a table the live portal commits meanwhile is never attributed to the module.
A table created in a subtransaction (`DO … EXCEPTION`, a `SAVEPOINT` in a JS migration) carries the
subtransaction's id instead; it is still found by a snapshot of `pg_tables` taken before each migration (under the
advisory lock) when its name has the module's own prefix (`<id>_`, or a legacy prefix the core declares, `mp_`).
Independently of the records, a module's tables for backups, restores and «Удалить данные» always include every
existing table with those prefixes (`ownPatterns` in `backup.js`).
A migration that cannot be loaded, has no `up` or fails is `MIGRATION_FAILED`. At install / update (the prepare
child, `strict`) a package is refused when the database has applied migrations it does not contain
(`SCHEMA_NEWER`: older than the schema, even under a higher version number) or when the text of an applied SQL
migration changed (`MIGRATION_CHANGED`; JS migrations are bundled, so their checksum is recorded but not compared).
At boot both are only logged (a rollback runs the previous code on purpose). For a module converted from `schema()`, migration `001` is its current schema with
`CREATE … IF NOT EXISTS` (safe on existing databases) and `tables` in module.json names its existing tables.
Not possible inside a transaction: `CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE` used in the same batch.

## Browser side

### Web contract

```js
// web/index.js — imported at start-up when the module is on (keep it small)
export default {
  id: 'hello',
  App: () => import('./HelloApp.jsx'),            // page at /app/<id> (optional)
  Settings: () => import('./HelloSettings.jsx'),  // /admin/settings/<id> + an item in Settings → Modules (optional)
  register(ctx) {},                               // ctx = { id, version, base }
  tour: 'hello',                                  // its guided tour (registered by register / register.js; optional)
};
```

`main.jsx` awaits `loadInstalledPackages()` (`src/platform/packages/loader.js`, ≤ 1.5 s, short retries on a
lost connection or a 5xx within that time; afterwards retried in the background with backoff and the page reloads
once when packages arrive late) before the first render: `GET /api/modules/installed` (signed in; anonymous
visitors get no list — after a sign-in, `auth:signed-in` from AuthContext fetches it again and reloads once when
there are packages) → translations added (`i18n/translations.js`
`addTranslationSource`, English laid under each language), CSS of switched-on packages linked, entries of switched-on packages
imported and `register(ctx)` run, page modules pushed into `MODULE_REGISTRY` (`/app/<id>`, `icon`,
`apps.<id>.name`) with lazy `App` / `Settings`; a package without a page (manifest `web.page: false`, module.json
`"web": { "page": false }` — the robot assistant) goes into `FEATURE_MODULES` instead and is an `overlay` in the server
catalog (not in `/api/apps`). `/admin/settings/:moduleId` renders a package's Settings
(`platform/packages/PackageSettings.jsx`); a package with `web.settings` gets its item in the settings navigation
(`admin/navigation.js` `addPackageSettingsItem`, icon slot `menuIcons.jsx` `addMenuSlot`; label `settings.<id>.title`
when the package ships a `settings` namespace, else `apps.<id>.name`). A `tour` goes into `MODULE_UI`.

### Web SDK and shared libraries

A package does not bundle React, antd or the core: `src/frontend/src/platform/sdk/exposed.js` lists
the shared names — `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react-router-dom`,
`antd`, `dayjs`, `@portal/sdk` (`src/platform/sdk/index.js`: `api`, `useAuth`,
`useSettings`, `useLocale`, `useThemeMode`, `t`, `translate`, `pick`, `localeTag`, `LANGUAGES`, `can`,
`canAny`, `errorMessage`, format and date helpers, `lazyPage`, `useAdminSettings`, `useSettingsForm`,
`SettingsPageHeader`, `SettingsSection`, `SettingRow`, `SaveBar`, `LoadState`, `PageHeader`,
`PageTransition`, `Segmented`, `Chrome`, `MenuIcon`, `DateField`/`DateTimeField`/`TimeField`, `Hint`,
`HintLabel`, `HelpButton`, `ModuleHeader`, `SideRail`, `UserAvatar`, `Person`, `userOptions`,
`ColorSwatches`, and the interface extension points: `contribute`, `contributions`, `subscribe`, `useContributions`, `provideModule`, `providedModules`, `useModuleUi`, `registerWidget`, `lazyWidget`, `WIDGET_REGISTRY`, `registerLinkBlock`, `LinkBlocks`, `registerSearchProvider`, `searchEverywhere`, `optionalComponent`, `optionalApi`) and core files (`EXPOSED_CORE`, plus every file under `src/platform/`).

The core build (`scripts/vite-plugin-portal-sdk.mjs`) emits `dist/sdk/<name>.js` per name:

```js
const m = await window.__PORTAL_SHARED__.load("antd");
export default m.default;
export const Button = m.Button; …        // names enumerated at build time
```

and `window.__PORTAL_SHARED__.load(name)` (`src/platform/packages/shared.js`) lazily imports the core's
own copy — one chunk per name, fetched only when a package needs it — so packages share the core's
React, antd theme and contexts. `dist/sdk/manifest.json` lists every name with its exports.
`@ant-design/icons` is deliberately not shared (its namespace is every icon, ~670 KB and a lot of
build memory): a package bundles the icons it uses, tree-shaken.

**Why no import map:** the CSP is `script-src 'self'` without `'unsafe-inline'`, and an import map is an
inline script (browsers do not load it from a URL). The package build therefore writes the shim URLs
(`/sdk/antd.js`) directly into the package's imports; the effect is the same.

Package files are served by the app at `/modules/<id>/<version>-<digest>/web/…` and `…/locales/…` from
`$MODULES_DIR`; `<digest>` is the first 12 hex of the files' listing digest, so a package reinstalled with other
bytes under the same version gets new URLs (immutable, a year; a digest other than the loaded package's is 404;
the old `/modules/<id>/<version>/…` form is served with `no-cache`; `text/javascript`; nothing else under
`$MODULES_DIR` is reachable). Both forms serve **only the version this process loaded** (verified against its signed
listing at boot): a previous, failed, blocked or never-verified version folder on disk is 404.
The shell's decisions (retries within the start-up budget, at most one reload per server boot and reason, late
and after-sign-in answers) are in `src/platform/packages/loaderLogic.js`, tested by
`test/frontend-package-loader.test.js`.
nginx proxies `/modules/`; the dev server proxies it and answers `/sdk/*` itself.

## Install, update, remove

Superadministrators in their own session (not an API token, not «sign in as»).

| | API (under `/api`) |
|---|---|
| Shell list (signed in) | `GET /modules/installed` → `{ bootId, signedIn, modules: [{ id, version, enabled, name, base, web: { entry, css, icon, permission, page }, locales }] }`; anonymous: `{ bootId, signedIn: false, modules: [] }` |
| State | `GET /admin/modules/packages` → rows with state, error, `incompatible`, `blocked`, `lastRollback`, `pendingCheck`, backups; `canManage`, `devMode`, `maxUploadMb`, `restartPending` |
| Upload | `POST /admin/modules/packages/upload` (multipart `file`) → `{ token, preview, problems, unsigned }` |
| Packages on the server | `GET /admin/modules/incoming` → `{ files: [{ file, bytes, modifiedAt, id, name, version }], maxUploadMb }` |
| Stage a server file | `POST /admin/modules/incoming/stage { file }` → the upload's answer `{ token, preview, problems, unsigned }` (+ `file`) |
| Install / update | `POST /admin/modules/packages/install { token }` → `{ id, version, action, applied, backup, restart, bootId }` |
| Remove code | `DELETE /admin/modules/packages/:id` |
| Backup now | `POST /admin/modules/packages/:id/backup` |
| Delete data | `POST /admin/modules/packages/:id/purge { confirm: "<id>" }` (removed modules only) |
| Inventory | `GET /admin/modules/inventory[?challenge=<8–128 of A-Za-z0-9_->]` (the challenge is signed with it) |

Refusals: `{ success: false, code, error, problems: [{ code, params, message: { ru, en } }] }`.

### Packages on the server (`platform/packages/incoming.js`)

For a superadministrator whose browser cannot receive the zip (the file is handed to the server operator instead):
the operator copies it into `$MODULES_DIR/incoming/` (production: `./data/modules/incoming` on the host,
`mkdir -p data/modules/incoming && cp masterplan-x.zip data/modules/incoming/`), and Settings → Modules →
«Пакеты на сервере» lists it with the module's name, version, size and date. «Установить» reads the file on the
server and hands its bytes to the same `stagePackage()` as an upload: the same size cap (`maxUploadBytes`),
signature verification, §5 checks, module card, `POST /admin/modules/packages/install`, restart, superadmin-only
own session, `exclusive()` (`MODULES_BUSY`) and `RESTART_PENDING` refusals.

- **What is listed / accepted**: plain regular files named `*.zip` directly in `incoming/` — no symbolic links
  (`lstat`; the file is opened with `O_NOFOLLOW` and re-checked on the descriptor), no folders or files in
  sub-folders, no hidden names, no empty files, nothing above the upload cap (a file that grows past it while being
  read is refused, `FILE_TOO_LARGE`). `incoming/` must be a real folder, not a link. The name / version on the list
  come from `manifest.json` without the signature check (display only; the full check runs at «Установить»).
  A file that is not there (any more) or not a plain file: 404 `INCOMING_NOT_FOUND`.
- **After a successful install the file is moved** to `incoming/installed/<name>` (an older file of that name
  there is replaced) — chosen over deleting it so the operator keeps the exact file that went in; delete it by hand
  when no longer needed. It is moved only if it still holds the checked bytes (sha256 recorded at staging); a
  failed move is logged and does not undo the install. A failed or refused install leaves it in `incoming/`.
- **Journal**: like uploads — `module_rejected` (a refused file, with `server file <name>`), `module_installed` /
  `module_updated` with «from server file <name>» (and «file not moved» when the move failed); `params.file`.
- The id `incoming` is reserved (no package may take the folder's name).

### Checks (spec §5, `platform/packages/checks.js`)

| Code | Message (ru) |
|---|---|
| `BAD_PACKAGE` | Файл повреждён или выпущен не нами |
| `CORE_TOO_OLD` | Нужно ядро 1.6.0 или новее, у вас 1.5.1 |
| `CORE_MAJOR` | Модуль рассчитан на ядро 1.x (1.6.0 или новее), у вас 2.0.0 |
| `REQUIRES_MISSING` | Нужен модуль „CRM“ версии 1.1.0 или новее — он не установлен |
| `REQUIRES_VERSION` | Нужен модуль „CRM“ 1.1.0 или новее, у вас 1.0.0 |
| `REQUIRES_MAJOR` | Нужен модуль „CRM“ 1.x (1.1.0 или новее), у вас 2.0.0 |
| `DOWNGRADE` | Установлена 1.3.0, в файле 1.2.0 — понижение запрещено (removed, data kept: «Была установлена 1.3.0 (её данные сохранены), в файле 1.2.0 — понижение запрещено») |
| `SAME_VERSION` | Версия 1.2.0 уже установлена |
| `BREAKS_DEPENDENT` | „Склад“ 1.4 работает с „Закупками“ 1.x, а в файле 2.0 — сначала обновите „Склад“ |
| `HAS_DEPENDENTS` (remove) | Сначала удалите „Склад“ — он использует „Закупки“ |
| `BUILTIN` / `BUILTIN_REMOVE` | the module is built into this core version |
| `MIGRATION_FAILED` / `MODULE_DOES_NOT_START` | the new code was checked in a child process and nothing changed |
| `SDK_MAJOR` / `SDK_TOO_OLD` | built for another SDK major / a newer SDK than this core's |
| `SCHEMA_NEWER` / `MIGRATION_CHANGED` | the database has migrations the file lacks / an applied SQL migration was edited |
| `FOREIGN_KEYS` | other tables reference the module's tables: a restore (update) or «Удалить данные» could not run without CASCADE |
| `RESTART_PENDING` | install / remove / delete data while the portal restarts |

English texts come with each problem. `installed` for the checks = built-in modules (manifest
versions) + packages on disk now (including ones waiting for the restart or failed) + removed packages whose data
is kept (they count only for downgrades).

### Flows (`platform/packages/installer.js`)

- **Install**: verify → checks → card → unpack to `<id>/<version>` → `prepare.mjs` in a child process
  imports the new code (contract check, side effects stay out of the running portal) and applies its
  migrations in one transaction → `installed_modules` row → `current` pointer → journal → restart.
  The module comes up **installed, switched off**.
- **Update**: the same, preceded by a refusal when other tables have foreign keys into the module's tables and a
  backup of the module's tables; `previous` keeps the old version folder (older ones are pruned); the first boot
  confirms the new version (`pending_check`, after the probation above) or rolls back. Writes the old version made
  between the backup and the restart are lost when a pg_dump rollback restores the tables.
- **While a restart is pending** upload, install, remove, «Резервная копия» and «Удалить данные» answer 409
  `RESTART_PENDING`; one of them at a time (`MODULES_BUSY` otherwise: an upload holds the file and its inflated
  files in memory); at shutdown a running prepare child is killed (its transaction rolls back with its connection).
- **Dependencies**: an update and «Удалить данные» are refused (`FOREIGN_KEYS`) when objects outside the module
  depend on its tables — foreign keys of other tables, views / materialized views (`pg_depend` through their rewrite
  rules), constraint triggers of other tables and SQL-standard (`BEGIN ATOMIC`) functions. A plpgsql function body
  is not tracked by PostgreSQL and cannot be found.
- **Remove**: refused while modules require it; the code folder and pointers are deleted, tables and
  settings stay, the row becomes `removed`. Built-in modules can only be switched off.
- **Delete data** (removed modules only, confirm by id): a fresh backup, then `DROP TABLE` of the module's
  tables, its `module_migrations` / `module_tables`, its `settings.modules.<id>` and the row.
- Every step is journaled (`security_events` kind `module_package`, codes `module_installed`,
  `module_updated`, `module_failed`, `module_rejected`, `module_removed`, `module_backup`,
  `module_data_removed`; Settings → Activity).

### Restart

The answer is sent, then `SIGTERM` → graceful shutdown → exit code **75**. A restart asked for during the boot
(a rollback) waits until `server.js` installed its SIGTERM handler (`restartReady()`), or exits 75 directly when
the server has not started after 30 s. `start.sh` runs node in a
loop and starts it again at once on 75 while nginx keeps serving (API calls get the maintenance JSON);
any other exit ends the container (`restart: unless-stopped`). The Modules page shows a restart screen
and polls `GET /api/modules/installed` until `bootId` changes, then reloads. In development (no
start.sh) the process just exits: start it again.

### Backups (`platform/packages/backup.js`)

`$MODULES_DIR/.backups/<id>/<id>-<version>-<UTC>-<reason>.{dump|ndjson.gz}` + `.json` description (files 0600,
folders 0700). With `pg_dump` able to dump this database (probed once with a real connection — a client older
than the server counts as missing; the image installs `postgresql18-client`): custom format, restores structure and
data. A restore first drops the tables created by migrations the backup did not have (they may reference the
restored tables), then `pg_restore --clean --single-transaction`, then puts `module_migrations` back.
The probe runs asynchronously (20 s limit); `pg_dump` / `pg_restore` are killed after `MODULE_BACKUP_TIMEOUT_MS`
(30 min). Credentials go through the environment, never argv.
Without it, when a dump fails, or with `MODULE_BACKUP_PGDUMP=0`: gzip NDJSON of `row_to_json` rows — one consistent
snapshot (REPEATABLE READ, read only), each table streamed through a cursor 1000 rows at a time — restores data
into tables of the same structure (same applied migrations): generated columns are left out, identity columns are
written with `OVERRIDING SYSTEM VALUE`, and every serial / identity sequence is set past the restored values
(`setval`). A rollback does not restore it automatically (`last_rollback.ok = false`). For restoring a pg_dump
backup by hand see operations.md «Module packages». Taken before every update, before «Удалить данные» and on «Резервная копия».
The backup before «Удалить данные» also holds the module's **upload folder** `uploads/<id>` (every module keeps its
files there: Masterplan `uploads/masterplan`, QR `uploads/qr`) as `<file>.uploads.tar.gz` next to it (0600; `uploads`
in the `.json` description: archive, file count, bytes); when the folder cannot be archived nothing is deleted.
After the tables are dropped the folder is removed; the answer of `POST …/purge` reports `files` and
`backup.uploads`. `restoreBackup()` extracts the archive back over `uploads/` when a backup has one (entries outside
`<id>/` refuse the whole archive). Update backups have no archive: an update and its rollback leave the folder
where it is (migrations change tables, not files), so a rollback has nothing to put back. Retention counts the
archive with its backup and removes them together.
Retention after each backup: `MODULE_BACKUP_KEEP` (5) per module, `MODULE_BACKUP_MAX_MB` (2048) in all; the newest
of each module and the ones `installed_modules.backup_file` points at stay. Staging uploads expire after an hour
(cleaned at boot and every 15 minutes).

## Core updates

`make check-core-upgrade [CORE=x.y.z]` (`scripts/check-core-upgrade.mjs`) reads the active packages in
`./data/modules` and checks each `core` / `sdk` against this checkout's `VERSION` and `SDK_VERSION`; exit 1 lists
the modules that would not load. `make deploy` runs it **before** the release step, against the version about to be
released (`scripts/release.mjs --next-version`), so a refusal leaves no local release commit or tag behind
(`MODULES_CHECK=skip` deploys anyway). After the release it backs up the database and `data/modules`
(`make backup-modules`). On the portal the same check runs at every boot: such packages are failed with the §5 message, logged at
start-up and listed on Settings → Modules («These modules need an update for core …»).

## Store preparation (stage 6)

- **Portal identity** (`platform/identity.js`): UUID + Ed25519 key pair created on first use in
  `portal_identity`; the private key is sealed with the portal encryption key and never leaves the server.
- **Inventory** `GET /api/admin/modules/inventory`:
  `{ format: "portal-inventory/1", portal: { id, keyId, publicKey }, core: { version, sdk }, modules: [{ id, version, source, state }], generatedAt, digest, signature }` —
  `digest` = SHA-256 of the canonical JSON (sorted keys) without `digest`/`signature`, `signature` = Ed25519
  of `digest` by the portal key (`null` + `signatureError` when the sealed key cannot be opened). Without a
  challenge a signed inventory can be replayed by anyone who once fetched it (`settings.view`); the store sends a
  fresh nonce as `?challenge=` and gets it back inside the signed body (`challenge`), so an answer is good for that
  request only. Anyone with an installed package can also sign as the portal (see «SIGNATURE»).
- **Updates answer** (to be served by the store; `validateUpdatesAnswer` checks the shape):
  `{ format: "portal-updates/1", portal, checkedAt, updates: [{ id, installed, latest, compatible, core, requires, changelog { ru, en }, download { url (https), sha256, bytes } }], notices: [{ level, message { ru, en } }] }`.
  A downloaded zip goes through exactly the same install path (signature, checks, card).

## Tests

- `test/module-packages.test.js` (no database): zip round trip and hostile archives, signatures,
  manifest, every §5 message, migrations runner, SDK resolver (real import from outside the tree), disk
  scan, contract checks, static serving, inventory format, build of the fixture and of Masterplan (server part;
  web with `MODULE_BUILD_WEB=1`).
- `test/module-boot.test.js`: the core alone, with each built-in module, and with each package module from source.
- `test/masterplan.db.test.js` (`MASTERPLAN_DB_TEST=1`): migration 001 on an existing schema changes nothing.
- `test/packages-qr-assistant-remote.test.js` (no database): QR codes, the assistant and Remote access are out of every
  core list, their module.json / settings.js, overlay packages, `seal` / `unseal`, late `onHttpServer` hooks, their builds
  (web with `MODULE_BUILD_WEB=1`). `test/packages-qr-assistant-remote.db.test.js` (`PACKAGES2_DB_TEST=1`): the upgrade above.
- `test/module-packages-hardening.test.js` (no database): table ownership (and that its lists cover every
  `CREATE TABLE` of the tree), migration attribution and conflicts, downgrade after removal, core / SDK checks,
  `check-core-upgrade`, files re-verified, boot markers, limits, staging cleanup, backup retention, the deferred
  restart, refusals while a restart is pending, SDK resolver refusals.
- `test/module-packages.db.test.js` (`MODULES_DB_TEST=1` + a test database): install → boot → off → on →
  route (anonymous shell list empty, digest URLs); update with backup; failing update; downgrade / unsigned refused;
  rollback of a version that does not start (`last_rollback` kept after a good boot); a crash during boot (marker →
  rollback before import), the probation window, a running package blocked after a crash, a hang (timeout →
  rollback at the next start); files changed on disk refused; foreign keys / `SCHEMA_NEWER` / `MIGRATION_CHANGED`
  refused; the prepare child killed; private backups and the NDJSON fallback when pg_dump fails; with
  `MODULES_PGDUMP_TEST=1` a pg_dump rollback that drops the failed version's tables first; removal refused by a
  dependent, downgrade after removal; data deletion after a backup; broken package skipped; identity and signed
  inventory.
- `test/module-packages-review3.test.js` (no database): shutdown hooks with their own timeout, crash attribution
  (also in a real child process), unfinished-boot decisions, the restart before listen clearing markers, table
  ownership (exact entries win), own prefixes, the inventory challenge, the SDK surface, passphrase keys.
- `test/module-packages-incoming.test.js` (no database): «Пакеты на сервере» — the list (links, folders,
  sub-folders, hidden, empty and oversize files left out; `incoming/` as a link), reading, the move to
  `installed/`, superadmin-only / own session, the same refusal as an upload of the same bytes, `RESTART_PENDING`.
  `module-packages.db.test.js` installs a signed zip from `incoming/` end to end.
- `test/start-watchdog.test.js`: runs `start.sh` (dash and busybox sh) with a hung and a slow fake node.
- `test/unknown-module-ids.test.js`: stored settings, role permissions, API scopes and dashboard widgets of modules
  this core does not know survive an edit.
- `test/frontend-package-loader.test.js`: the browser loader's decisions (`loaderLogic.js`).
- Fixture: `test-fixtures/module-hello` (route, table, SQL + JS migration, page, translations, docs).

## Converting a module (checklist; done for Masterplan, QR codes, Robot assistant, Remote access)

Masterplan was the pilot (`src/backend/modules/masterplan`, `src/frontend/src/modules/masterplan`); copy what it does.
QR codes (anonymous routes), the robot assistant (no page: `web.page: false`, contributions only) and Remote access
(HTTP upgrade hooks, sealed secrets, npm libraries of its own) followed — see their module.json / index.js.

**Server** (`src/backend/modules/<id>/`)

1. **Boundaries**: `npm run check:modules` is 0 — no imports of other modules' internals; other modules reach it only
   through the registry (`ctx.modules.get(id)?.api`, events, object sources, link providers), never by import.
   Raw SQL of other modules on its tables is a smell (today: warehouse / procurement demo and stock read `mp_*`
   with a `.catch` fallback) — move it behind its `api` when converting the next consumer.
2. **`module.json`** (the manifest facts that lived in `modules/manifest.js` + `modules/catalog.js`): `name`,
   `nameForms.ru.ins`, `description`, `version` (first package: a minor bump, Masterplan 1.0.0 → 1.1.0), `category`,
   `requires` / `enhances` (copy them), `permissions` (the catalog list), `tables` (prefix of its existing tables,
   `["mp_%"]`), `icon`, `docsInfo`, `changelog`, `localeKeys` (below). `core` is left out: the build writes the
   core `VERSION` it is built with — build release packages after the core release they need.
3. **`settings.js`**: move its defaults and sanitizer out of `catalog.js`; export `defaults`, `defaultEnabled`,
   `publicSettings` (optional) and `sanitizeSettings`. Plain data, no imports (the build imports it). `index.js`
   exports `sanitizeSettings` (the loader puts it in place of the generic one).
4. **Migrations**: the current `schema()` becomes migration `001_init` — `index.js`
   `migrations: [{ id: '001_init', up: createSchema }]` where `createSchema(db)` runs **every** statement through
   `db.query` (the migration's transaction; a query on another connection can deadlock on the locks the
   transaction holds), keeps `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, and seeds its directories in the same
   transaction. Flags in `app_settings` survive «Удалить данные»: check the table too (Masterplan seeds again
   when `mp_types` is empty). Keep `ensure…Schema()` for tests as `withTransaction` + the same advisory lock
   (`module-migrations:<id>`). Later changes: `migrations/NNN_name.sql|js` files, never edit 001.
5. **`register(ctx)`**: everything that `schema()` did besides DDL — `registerJob`, hooks (`onModuleEvent`),
   event listeners, object sources. No database access in `register` (boot tests run without one).
6. **Demo data**: `import './demo.js'` from `index.js` (`registerDemo` at import; `loadModuleDemos` loads only
   built-in modules' demo files).
7. **Remove it from the core**: `modules/index.js` `MODULES`, its `modules/manifest.js` entry, its
   `modules/catalog.js` entry and settings; add its id to `PACKAGE_MODULE_IDS` (`modules/manifest.js`: built-in
   modules may keep it in `enhances`; tests and the absence check use the list) and to `CONVERTED_MODULES`
   (`platform/packages/loader.js`, with its last built-in version); `.dockerignore` its folders. Backend npm
   dependencies only it uses stay in the core's `package.json` (the bundle keeps them external: Remote's `ws`,
   `guacamole-lite`, `openpgp`); browser libraries only it uses are bundled into its `web/` (Remote's noVNC and
   guacamole-common-js, in lazy chunks).

**Browser** (`src/frontend/src/modules/<id>/`)

8. **`index.js`** (web entry): `import './register'` and `export default { id, App: () => import('./XApp'),
   Settings: () => import('./XSettings'), tour: '<tour id>' }`. A `Settings` gets an item in
   Settings → Modules (manifest `web.settings`), `tour` the «Тур» buttons.
9. **Remove it from the core**: its `modules/registry.js` entry (or `FEATURE_MODULES` entry), `'!./<id>/register.js'` in the registry's
   `import.meta.glob`, its `admin/navigation.js` item, its `MODULE_UI` entry; a tour of `tour/content` moves to
   `modules/<id>/tour.js`, registered by its `register.js`.
10. **Texts**: namespaces only it uses move to `src/frontend/src/modules/<id>/locales/<lang>/<ns>.js` (out of the
    core dictionaries; `i18n:check` still checks them). Its keys in shared namespaces (`apps.<id>`,
    `settings.<id>`, `permissions.<id>_*`, `notifyPrefs.events.<id>_*`, `tour.<id>`) stay in the core files for
    now (the core's roles editor, notification preferences and the removed-module card read them) and are copied
    into the package by `module.json` `localeKeys` (`{ "permissions": ["groups.module_<id>", "<id>_*"] }`), so
    the package is complete when the core drops them.
11. **Shared core files** the browser part imports must be in `src/platform/sdk/exposed.js` (the build fails
    otherwise); adding one needs a core release.

**Tests and checks**

12. Unit tests that imported its catalog entry read `module.json` / `settings.js`; DB tests get the module through
    `test/helpers/modules.js` (`activateAll()` activates `PACKAGE_MODULE_IDS` from source; `sourcePackage(id)` for
    tests that boot with `bootstrapSchema`). `test/module-boot.test.js` boots the core with each package alone.
13. `npm test`, `npm run check:modules`, `node scripts/check-module-absence.mjs` (frontend), `npm run i18n:check`,
    the core `vite build`, `make module ID=<id> UNSIGNED=1`, then on a test portal: install, switch on, pages,
    links with other modules, update (`BUMP=patch` with a new migration), a failing update, remove, reinstall,
    «Удалить данные». Also on a copy of a database where the module was built in (the upgrade below).

What is left in the core for QR codes, the assistant and Remote access (all work while they are absent): their help
articles and `HELP_ORDER` entries, the API reference sections and area icons (`api/reference.js`, `developer/components.jsx`),
Remote's notification kind `remote.connected` (`services/notificationCatalog.js`), nginx's `/q/<slug>` → `/api/qr/go/<slug>`
(404 while QR is absent), menu icons, their texts in shared namespaces (`apps`, `settings`, `permissions`, `notifyPrefs`,
`tour`; copied into the packages by `localeKeys`), name forms in `checks.js`, `ensureAclTable(…, db)` in `modules/shared/acl.js`.

What is left in the core for Masterplan (works when it is absent, fine to keep until the store): help articles
(`help/content|admin/<lang>/masterplan.js`, `help/registry.jsx` order), its notification kinds
(`services/notificationCatalog.js`, hidden while absent), the API reference section (`api/reference.js`),
server-side texts (`src/backend/locales/<lang>/masterplan.js`), the category icon and name forms in `checks.js`.

## Upgrading a portal that had Masterplan built in

The core of this version no longer contains Masterplan; its tables (`mp_*`), files (`uploads/masterplan`), settings
(`settings.modules.masterplan`) and roles stay untouched. Until the package is installed the module is listed under
«Удалённые модули» (data kept) and `/app/masterplan` is not there.

1. Build the package with the release core: `make module ID=masterplan` (signed; the public key must be in the
   released `trusted-keys.json`) → `dist/modules/masterplan-1.1.0.zip`; `make modules-verify FILE=…`.
2. Usual deploy routine of the core (backup of the database first; `mkdir -p data/modules` once).
3. **Right after the deploy**: Settings → Modules → «Установить из файла» → the zip → «Установить» (or, when the
   administrator's browser cannot get the file: `mkdir -p data/modules/incoming && cp dist/modules/masterplan-1.1.0.zip data/modules/incoming/`
   on the host, then «Пакеты на сервере» → «Установить»). Migration
   `001_init` creates nothing on this database (everything exists) and records itself; the portal restarts (5–10 s).
4. The module comes back in the state it had (switched on, with its settings and data — saves of other settings in
   the meantime keep them, «Data of modules this core does not know» above); its settings item, tour and demo data
   button are back too. Check `/app/masterplan`, a CRM deal with linked units, a contract with an object.
5. Contract events of the window (a deposit received, a contract signed or paid before the install) went to
   nobody. About 20 s after the first start after the install Masterplan catches up once by itself: units linked
   from contracts (`ctr_contracts.mp_node_id`) follow the contracts' current state (docs/masterplan.md «Catching up
   with Contracts»); Settings → Masterplan → «Сверить с договорами» runs it again on demand.

Rehearsed on a restored production dump (v1.18.0, no `installed_modules` table; 2026-10-23, outgoing integrations
switched off in the copy, scheduler off): the new core boots and lists Masterplan under «Удалённые модули» with the
reinstall hint; a save of another module's settings in the window keeps `settings.modules.masterplan`; the zip, signed
with a key the portal trusts and `MODULES_DEV` off, installs as a new module, the app restarts, `module_migrations`
has `001_init`, the automatic catch-up runs once (and not again at the next restart); counts and checksums of every
`mp_*` table, of the Masterplan settings and roles are identical before the deploy, with the core alone, after the
install and after another restart; the plan, chessboard, registry, dashboard and settings pages show the data.
If the package cannot be installed at once, nothing is lost — only the module is unavailable until it is.

## Upgrading a portal that had QR codes, the assistant or Remote access built in

The core after 1.20.0 no longer contains QR codes (last built-in 1.0.0), the robot assistant (1.0.0) or Remote access
(1.3.0). Their tables (`qr_*`, `assistant_prefs`, `remote_*`), files (`uploads/qr` — logos), settings
(`settings.modules.qr|assistant|remote`, including the guacd address and the monitoring policy acknowledgement), roles
and the sealed secrets (computer passwords, saved credentials, Passbolt keys, the Portal VNC CA / client certificate /
key) stay untouched. Until the packages are installed they are listed under «Удалённые модули» (data kept):
`/app/qr` and `/app/remote` are not there, dynamic QR links `/q/<slug>` answer 404 (printed codes stop redirecting for
that window), the robot is not drawn, and no remote session can start (both WebSocket tunnels belong to the package).

1. Build the packages with the release core: `make module ID=qr`, `make module ID=assistant`, `make module ID=remote`
   (signed) → `qr-1.1.0.zip`, `assistant-1.1.0.zip`, `remote-1.4.0.zip`; `make modules-verify FILE=…` each. They need a
   core with SDK 1.1.0 (`seal` / `unseal`), i.e. the core they are built with or newer.
2. Usual deploy routine of the core (database backup first).
3. **Right after the deploy**, install all three (Settings → Modules → «Установить из файла», or «Пакеты на сервере»
   with the zips in `data/modules/incoming/`); each restart takes 5–10 s, QR first (printed codes). Migration `001_init`
   creates nothing on this database and records itself.
4. They come back as they were: QR switched on with its templates, codes, scan counts and logos; the robot on where it
   was on (it stays on by default, as before), with each person's character, colours and greetings and the
   organisation's rules; Remote with its computers, applications, folders, gateways, saved credentials, journal, guacd
   address, policy acknowledgement and Portal VNC identity. Check `/q/<slug>` of a dynamic code (302), `/app/qr`,
   the robot on any page and in Account → Appearance, `/app/remote` (catalogue, a session through guacd and one
   through Portal VNC), Settings → Remote access.
5. Remote's tunnels (`/api/app/remote/tunnel`, `/api/app/remote/pvnc`) are attached through one upgrade listener now
   (`modules/remote/upgrade.js`): with the built-in module of 1.20.0 and older, the server attached second (guacd)
   answered every upgrade 400 — sessions through guacd (and Portal VNC ones, whose sockets the other server ended)
   could fail. A guacd token that is not the portal's is refused with 401 before guacamole-lite.

Tested by `test/packages-qr-assistant-remote.db.test.js` on a copy of a database created by 1.20.0 with the three built
in: 001 changes no table, column, index, constraint, row count or checksum; the «bundled» rows become «removed»; a save
of other settings keeps theirs; the signed zips install (001 recorded, data untouched), load at the next boot with their
settings, their own sanitizers; QR's anonymous redirect works through the package router; both Remote tunnels upgrade;
a password sealed while built in opens; Remote's link to Directory is active only while Directory is on.

## Limitations

- Server-side translations of a package (notifications, e-mails) still come from the core's
  `src/backend/locales`; package `locales/` are for the interface only.
- Help articles (`help/content`, `help/admin`) of a package are not loaded from the package yet (Masterplan's
  are still in the core). Demo data: `import './demo.js'` from the server entry; tours: `register()` +
  `tour` in `web/index.js`; settings: listed in Settings → Modules when `web/index.js` has `Settings`.
- No source mode for development: a converted module runs only from its zip (`make module … UNSIGNED=1`,
  `MODULES_DEV=1`); tests load it from source (`test/helpers/modules.js`).
- `app_settings` keys a module writes itself (Masterplan: `masterplan_seeded`, `masterplan_old_numbers`) are not
  removed by «Удалить данные» (its upload folder `uploads/<id>` is: archived into the backup first). Files a module
  keeps outside `uploads/<id>` stay.
- No automatic preinstall of base modules from zips in the image yet (spec stage 5).
- One install / update / remove at a time per process; the restart makes concurrent work moot.
- A package that crashes the process later than the probation window is not rolled back automatically: its
  crashes are counted and it is blocked after three within 10 minutes (crash guard). A crash whose stack has no
  frame in the package (a callback the core calls later without the package on the stack) cannot be attributed.
- A synchronous endless loop cannot be timed out inside the process; the start.sh watchdog kills it after
  `PORTAL_WATCHDOG_SECONDS` (not outside the container: dev, tests).
