# Module packages

Engineering reference for installing, updating and removing modules as signed zip files
(spec: [specs/module-packages.ru.md](specs/module-packages.ru.md), stages 2, 3, 4 and 6).
Operations (volume, keys, backups): [operations.md](operations.md#module-packages).

The portal is a **core** plus **modules**. Until a module is converted it stays *built in*
(`src/backend/modules/<id>`, listed in `modules/index.js` `MODULES`, source `bundled`). A
converted module is a **package**: a zip that a superadministrator installs in
Settings → Modules → «Установить из файла»; its code lives in the data volume and is loaded at boot.
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
| `tables` | table names or prefixes (`"mp_%"`) owned by the module, in addition to the tables its migrations create (backups, «Удалить данные») |
| `server` `{ entry }`, `web` `{ entry, css, icon, permission, page }` | entry points (written by the build) |
| `locales` `{ <lang>: [ns…] }`, `builtAt`, `sdk` | written by the build |

`platform/packages/manifestFile.js` validates and normalizes it (`normalizeManifest`).

### SIGNATURE

The signed text is the canonical listing of all files but `SIGNATURE`, sorted by UTF-8 path:
`<sha256 hex>␠␠<path>\n`. `SIGNATURE` is JSON `{ format: 1, algorithm: "ed25519", keyId, signature }`;
`keyId` = first 16 hex of SHA-256 of the raw public key. The portal trusts the public keys in
`src/backend/platform/trusted-keys.json` (released with the core). A package without `SIGNATURE` is
accepted only with `MODULES_DEV=1`; a present but wrong signature is refused always.

### Archive safety (`platform/packages/zip.js`, `archive.js`)

Own reader/writer on `node:zlib` (stored + deflate). Refused: ZIP64, multi-disk, encryption,
symlinks and special files, absolute paths / drive letters / backslashes / `..` / empty segments /
control characters, duplicates (also by case, file vs folder), > 3000 entries, entry > 50 MB,
> 300 MB unpacked, inflation beyond the declared size, CRC or header mismatches. Upload cap 100 MB.
Unpacking writes to a temporary folder and renames it to `$MODULES_DIR/<id>/<version>`.

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
| Config | `appConfig`, `APP_VERSION`, `uploadRoot` |
| Access | `requireAuth`, `optionalAuth`, `requirePermission`, `refuseImpersonation`, `hasPermission`, `getUserAccess`, `getAccessMap` |
| Settings, regional | `getSettings`, `getSettingsView`, `parseSettings`, `getSetting`, `setSetting`, `invalidateSettings`, `updateAdminSettings`, `localeFor`, `recipientLocale`, `regionalFor`, `portalRegional`, `regionalOfUser`, `requestRegional`, `requestZone`, `REGIONAL_DEFAULTS`, `formatDate`, `formatDateTime`, `formatTime`, `isValidTimeZone`, `isoDay`, `startOfDay`, `startOfWeek`, `wallToInstant`, `zoneLabel`, `zoneOffsetMinutes`, `zonedParts` |
| Languages | `tr`, `translator`, `plural`, `pick`, `localeOrDefault`, `localeTag`, `SUPPORTED`, `formatNumber`, `moneyText`, `decimalSeparator`, `exportLocale` |
| Notifications, inbox, events, jobs | `notify`, `eventAllows`, `prefsWithZone`, `quietState`, `subscribersOf`, `listNotifications`, `unreadCount`, `pushToUser`, `registerInboxProvider`, `inboxFor`, `inboxAct`, `setUrgencyRanker`, `emitEvent`, `requestAs`, `onModuleEvent`, `emitModuleEvent`, `onBeforeUserDelete`, `onDirectorySignIn`, `onDirectoryCredential`, `registerJob` |
| Journal | `recordSecurityEvent` |
| Extension points | `modules`, `events`, `registerWidget`, `registerWidgetSection`, `registerLinkProvider`, `linkProvider`, `registerObjectSource`, `objectSource`, `registerSearchProvider`, `searchAll`, `registerPreviewProvider`, `registerFollowable`, `canFollow`, `registerTokenResources`, `onHttpServer`, `onShutdown`, namespaces `widgets`, `pickers` (prefer the same functions on `ctx` inside `register()`: they are tagged with the module) |
| Other | `createUser`, `updateUser`, `assertCanManage`, `isValidPhone`, `normalizePhone`, `findUserById`, `listLegalEntities`, `getLegalEntity`, `getDefaultLegalEntity`, `seal`, `unseal`, `convertToPdf`, `registerDemo`, `decide`, `limitsByTable`, `httpError(status, message, code)`, `logger(id)`, `SDK_VERSION` |

Adding a name is a minor SDK change; removing or renaming one is a major core change.
`@portal/sdk/core/<path>` (any core file except module internals, tests and scripts) is the
transitional escape hatch the build uses for converted modules — prefer the stable names.

### Boot (`modules/index.js` → `platform/packages/loader.js`)

1. While the core loads, `modules/catalog.js` and `modules/manifest.js` append the active packages
   read synchronously from disk (`platform/packages/disk.js`: `$MODULES_DIR/<id>/current` →
   `<version>/manifest.json`), so settings, permissions, API scopes and the Modules page know them.
   A package with the id of a built-in module is ignored.
2. Schema bootstrap: built-in modules run `schema()` (or versioned `migrations`), then
   `activateModules(MODULES)` (registry + `register(ctx)`).
3. Packages, in requirement order: import `server/index.js` → check the contract and requirements →
   pending migrations → mount routes → join the registry. Then every package's `register(ctx)`.
   `ctx.onHttpServer` hooks run once both the HTTP server is up (`startModuleServer(server)` in server.js) and the modules registered; `ctx.onShutdown` hooks run on SIGTERM (`runShutdownHooks()`).
4. A package that fails is skipped; `installed_modules.state = 'failed'` with the error; the portal runs on.
   If that is the first boot after an update (`pending_check`), the previous version is put back
   (`current` ← `previous`; tables restored when the pre-update backup is a pg_dump) and the app restarts once more;
   the journal records `module_rolled_back`.
5. A `bundled` row of a module this core no longer contains (Masterplan after the upgrade) becomes `removed`
   (source `package`): data kept, shown under «Удалённые модули» until its package is installed.

Tables: `installed_modules (id, version, state installed|enabled|disabled|failed|removed, source bundled|package,
installed_at, updated_at, installed_by, error, checksum, signed_by, previous_version, pending_check, backup_file, manifest)`,
`module_migrations (module_id, migration_id, version, checksum, applied_at)`,
`module_tables (module_id, table_name, migration_id)`. The on/off switch stays in `settings.modules.<id>.enabled`;
the API reports `enabled` / `disabled` from it. Built-in modules get rows with `source = 'bundled'`.

### Migrations (`platform/packages/migrations.js`)

`NNN_name.sql` or `NNN_name.js` (`export async function up(db)`), sorted by number, each once per
module. **All pending migrations of one install / update / boot run in one transaction** with an
advisory lock: a failure leaves the database untouched. Tables created during a migration are recorded
in `module_tables`. For a module converted from `schema()`, migration `001` is its current schema with
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

`main.jsx` awaits `loadInstalledPackages()` (`src/platform/packages/loader.js`, ≤ 1.5 s) before the
first render: `GET /api/modules/installed` → translations added (`i18n/translations.js`
`addTranslationSource`, English laid under each language), CSS linked, entries of switched-on packages
imported and `register(ctx)` run, page modules pushed into `MODULE_REGISTRY` (`/app/<id>`, `icon`,
`apps.<id>.name`) with lazy `App` / `Settings`. `/admin/settings/:moduleId` renders a package's Settings
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

Package files are served by the app at `/modules/<id>/<version>/web/…` and `…/locales/…` from
`$MODULES_DIR` (immutable, a year; `text/javascript`; nothing else under `$MODULES_DIR` is reachable).
nginx proxies `/modules/`; the dev server proxies it and answers `/sdk/*` itself.

## Install, update, remove

Superadministrators in their own session (not an API token, not «sign in as»).

| | API (under `/api`) |
|---|---|
| Shell list (public) | `GET /modules/installed` → `{ bootId, modules: [{ id, version, enabled, name, web: { entry, css, icon, permission, page }, locales }] }` |
| State | `GET /admin/modules/packages` → rows with state, error, backups; `canManage`, `devMode`, `maxUploadMb` |
| Upload | `POST /admin/modules/packages/upload` (multipart `file`) → `{ token, preview, problems, unsigned }` |
| Install / update | `POST /admin/modules/packages/install { token }` → `{ id, version, action, applied, backup, restart, bootId }` |
| Remove code | `DELETE /admin/modules/packages/:id` |
| Backup now | `POST /admin/modules/packages/:id/backup` |
| Delete data | `POST /admin/modules/packages/:id/purge { confirm: "<id>" }` (removed modules only) |
| Inventory | `GET /admin/modules/inventory` |

Refusals: `{ success: false, code, error, problems: [{ code, params, message: { ru, en } }] }`.

### Checks (spec §5, `platform/packages/checks.js`)

| Code | Message (ru) |
|---|---|
| `BAD_PACKAGE` | Файл повреждён или выпущен не нами |
| `CORE_TOO_OLD` | Нужно ядро 1.6.0 или новее, у вас 1.5.1 |
| `CORE_MAJOR` | Модуль рассчитан на ядро 1.x (1.6.0 или новее), у вас 2.0.0 |
| `REQUIRES_MISSING` | Нужен модуль „CRM“ версии 1.1.0 или новее — он не установлен |
| `REQUIRES_VERSION` | Нужен модуль „CRM“ 1.1.0 или новее, у вас 1.0.0 |
| `REQUIRES_MAJOR` | Нужен модуль „CRM“ 1.x (1.1.0 или новее), у вас 2.0.0 |
| `DOWNGRADE` | Установлена 1.3.0, в файле 1.2.0 — понижение запрещено |
| `SAME_VERSION` | Версия 1.2.0 уже установлена |
| `BREAKS_DEPENDENT` | „Склад“ 1.4 работает с „Закупками“ 1.x, а в файле 2.0 — сначала обновите „Склад“ |
| `HAS_DEPENDENTS` (remove) | Сначала удалите „Склад“ — он использует „Закупки“ |
| `BUILTIN` / `BUILTIN_REMOVE` | the module is built into this core version |
| `MIGRATION_FAILED` / `MODULE_DOES_NOT_START` | the new code was checked in a child process and nothing changed |

English texts come with each problem. `installed` for the checks = built-in modules (manifest
versions) + packages on disk now (including ones waiting for the restart or failed).

### Flows (`platform/packages/installer.js`)

- **Install**: verify → checks → card → unpack to `<id>/<version>` → `prepare.mjs` in a child process
  imports the new code (contract check, side effects stay out of the running portal) and applies its
  migrations in one transaction → `installed_modules` row → `current` pointer → journal → restart.
  The module comes up **installed, switched off**.
- **Update**: the same, preceded by a backup of the module's tables; `previous` keeps the old version
  folder (older ones are pruned); the first boot confirms the new version (`pending_check`) or rolls back.
- **Remove**: refused while modules require it; the code folder and pointers are deleted, tables and
  settings stay, the row becomes `removed`. Built-in modules can only be switched off.
- **Delete data** (removed modules only, confirm by id): a fresh backup, then `DROP TABLE` of the module's
  tables, its `module_migrations` / `module_tables`, its `settings.modules.<id>` and the row.
- Every step is journaled (`security_events` kind `module_package`, codes `module_installed`,
  `module_updated`, `module_failed`, `module_rejected`, `module_removed`, `module_backup`,
  `module_data_removed`; Settings → Activity).

### Restart

The answer is sent, then `SIGTERM` → graceful shutdown → exit code **75**. `start.sh` runs node in a
loop and starts it again at once on 75 while nginx keeps serving (API calls get the maintenance JSON);
any other exit ends the container (`restart: unless-stopped`). The Modules page shows a restart screen
and polls `GET /api/modules/installed` until `bootId` changes, then reloads. In development (no
start.sh) the process just exits: start it again.

### Backups (`platform/packages/backup.js`)

`$MODULES_DIR/.backups/<id>/<id>-<version>-<UTC>-<reason>.{dump|ndjson.gz}` + `.json` description.
With `pg_dump` in the image: custom format, restores structure and data (`pg_restore --clean`); a restore also
drops the tables created by migrations the backup did not have and puts `module_migrations` / `module_tables` back.
Without it (or `MODULE_BACKUP_PGDUMP=0`): gzip NDJSON of `row_to_json` rows — restores data into tables
of the same structure (same applied migrations). Taken before every update, before «Удалить данные» and
on «Резервная копия».

## Store preparation (stage 6)

- **Portal identity** (`platform/identity.js`): UUID + Ed25519 key pair created on first use in
  `portal_identity`; the private key is sealed with the portal encryption key and never leaves the server.
- **Inventory** `GET /api/admin/modules/inventory`:
  `{ format: "portal-inventory/1", portal: { id, keyId, publicKey }, core: { version, sdk }, modules: [{ id, version, source, state }], generatedAt, digest, signature }` —
  `digest` = SHA-256 of the canonical JSON (sorted keys) without `digest`/`signature`, `signature` = Ed25519
  of `digest` by the portal key (`null` + `signatureError` when the sealed key cannot be opened).
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
- `test/module-packages.db.test.js` (`MODULES_DB_TEST=1` + a test database): install → boot → off → on →
  route; update with backup; failing update; downgrade / unsigned refused; rollback of a version that does
  not start; removal refused by a dependent; data deletion after a backup; broken package skipped; identity
  and signed inventory.
- Fixture: `test-fixtures/module-hello` (route, table, SQL + JS migration, page, translations, docs).

## Converting a module (checklist; done for Masterplan)

Masterplan was the pilot (`src/backend/modules/masterplan`, `src/frontend/src/modules/masterplan`); copy what it does.

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
   modules may keep it in `enhances`; tests and the absence check use the list); `.dockerignore` its folders.

**Browser** (`src/frontend/src/modules/<id>/`)

8. **`index.js`** (web entry): `import './register'` and `export default { id, App: () => import('./XApp'),
   Settings: () => import('./XSettings'), tour: '<tour id>' }`. A `Settings` gets an item in
   Settings → Modules (manifest `web.settings`), `tour` the «Тур» buttons.
9. **Remove it from the core**: its `modules/registry.js` entry, `'!./<id>/register.js'` in the registry's
   `import.meta.glob`, its `admin/navigation.js` item, its `MODULE_UI` entry.
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
3. **Right after the deploy**: Settings → Modules → «Установить из файла» → the zip → «Установить». Migration
   `001_init` creates nothing on this database (everything exists) and records itself; the portal restarts (5–10 s).
4. The module comes back in the state it had (switched on, with its settings and data); its settings item, tour and
   demo data button are back too. Check `/app/masterplan`, a CRM deal with linked units, a contract with an object.

Rehearsed on a copy of the test database (`audit`): the core alone boots, mp_* row counts and checksums are unchanged,
after the install the same data is shown and `module_migrations` has `001_init`. If the package cannot be installed
at once, nothing is lost — only the module is unavailable until it is.

## Limitations

- Server-side translations of a package (notifications, e-mails) still come from the core's
  `src/backend/locales`; package `locales/` are for the interface only.
- Help articles (`help/content`, `help/admin`) of a package are not loaded from the package yet (Masterplan's
  are still in the core). Demo data: `import './demo.js'` from the server entry; tours: `register()` +
  `tour` in `web/index.js`; settings: listed in Settings → Modules when `web/index.js` has `Settings`.
- No source mode for development: a converted module runs only from its zip (`make module … UNSIGNED=1`,
  `MODULES_DEV=1`); tests load it from source (`test/helpers/modules.js`).
- `app_settings` keys a module writes itself (Masterplan: `masterplan_seeded`, `masterplan_old_numbers`) are not
  removed by «Удалить данные».
- No automatic preinstall of base modules from zips in the image yet (spec stage 5).
- One install / update / remove at a time per process; the restart makes concurrent work moot.
