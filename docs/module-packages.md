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
  `locales`, `docFiles`, `nameForms`, `settings`, `icon`, `web: false`, …). `requires` without a version
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
  does importing a name the core does not export. CSS of the module (and core CSS it imports) goes into
  `web/style.css`.
- **migrations/**: `src/backend/modules/<id>/migrations/NNN_name.sql|js` (JS ones bundled like server/).
- **locales/**: frontend namespaces named `<id>*.js` (or module.json `locales`) and `apps.<id>`.
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
   (`current` ← `previous`; tables restored when the pre-update backup is a pg_dump) and the app restarts once more.

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
  Settings: () => import('./HelloSettings.jsx'),  // /admin/settings/<id> (optional)
  register(ctx) {},                               // ctx = { id, version, base }
};
```

`main.jsx` awaits `loadInstalledPackages()` (`src/platform/packages/loader.js`, ≤ 1.5 s) before the
first render: `GET /api/modules/installed` → translations added (`i18n/translations.js`
`addTranslationSource`, English laid under each language), CSS linked, entries of switched-on packages
imported and `register(ctx)` run, page modules pushed into `MODULE_REGISTRY` (`/app/<id>`, `icon`,
`apps.<id>.name`) with lazy `App` / `Settings`. `/admin/settings/:moduleId` renders a package's Settings
(`platform/packages/PackageSettings.jsx`).

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
With `pg_dump` in the image: custom format, restores structure and data (`pg_restore --clean`).
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
  scan, contract checks, static serving, inventory format, build of the fixture (server part; web with
  `MODULE_BUILD_WEB=1`).
- `test/module-packages.db.test.js` (`MODULES_DB_TEST=1` + a test database): install → boot → off → on →
  route; update with backup; failing update; downgrade / unsigned refused; rollback of a version that does
  not start; removal refused by a dependent; data deletion after a backup; broken package skipped; identity
  and signed inventory.
- Fixture: `test-fixtures/module-hello` (route, table, SQL + JS migration, page, translations, docs).

## Converting a module (pilot: Masterplan)

1. Make the module self-contained (spec stage 1): no imports of other modules' internals
   (`scripts/check-module-boundaries.mjs`), core reached through extension points.
2. Add `src/backend/modules/<id>/module.json`: `tables` (existing tables, e.g. `["mp_%"]`), `core`,
   `requiresVersions`, `locales` if namespaces are not named `<id>*`.
3. Replace `schema()` with `migrations/001_init.sql|js` (current schema, `IF NOT EXISTS`), or keep
   `schema()` for the first package (the loader calls it when there are no migrations).
4. If the module has catalog settings with a sanitizer, export it as `sanitizeSettings` from index.js.
5. Remove the module from the core: `modules/index.js` `MODULES`, `modules/manifest.js`,
   `modules/catalog.js`, frontend `modules/registry.js`, `admin/settingsPages.js`, `admin/navigation.js`.
   Keep the frontend code where the build finds it (`src/frontend/src/modules/<id>`).
6. `make module ID=<id>`, install on a test portal, then update, remove, reinstall.
7. Existing installations: install the package right after deploying the core without the module
   (its data and settings are kept; migrations `IF NOT EXISTS` adopt the tables).

## Limitations

- Server-side translations of a package (notifications, e-mails) still come from the core's
  `src/backend/locales`; package `locales/` are for the interface only.
- Demo data (`demo.js`), guided tours and help articles of packages are not loaded yet.
- Package settings screens are reachable at `/admin/settings/<id>` (Modules card «Settings»), not listed
  in the settings navigation.
- No automatic preinstall of base modules from zips in the image yet (spec stage 5).
- One install / update / remove at a time per process; the restart makes concurrent work moot.
