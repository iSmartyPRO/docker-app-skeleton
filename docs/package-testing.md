# Package conversion test kit

`make package-check` tests one module package end to end, the same way for every module converted into a
package (the «definition of done», items 2–6: build and signature, migration 001 on existing data, the
fresh-database flow, the upgrade from a core where the module was built in, links with other modules).
Engineering reference of the packages themselves: [module-packages.md](module-packages.md).

```bash
make package-check ID=masterplan KIT_ENV=/path/to/test.env                       # MODE=all, SOURCE_REF=main
make package-check ID=qr MODE=fresh KIT_ENV=…
make package-check ID=masterplan MODE=upgrade SOURCE_REF=v1.19.0 KIT_ENV=…
make package-check ID=crm KIT_ENV=… KIT_OUT=/tmp/kit KEEP=1 NO_BROWSER=1

node scripts/package-kit/run.mjs --id <id> [--mode fresh|upgrade|all] [--source-ref <ref>] --env FILE \
  [--out DIR] [--keep] [--no-browser] [--front-dist DIR]
```

| Option | Meaning |
|---|---|
| `ID` | the module id (`--id`) |
| `MODE` | `fresh`, `upgrade` or `all` (default) |
| `SOURCE_REF` | git ref of a core that still has the module **built in** (default `main`; Masterplan: `v1.19.0`) |
| `KIT_ENV` | env file with `POSTGRES_HOST/PORT/DB/USER/PASSWORD` of the test server (or `$PACKAGE_KIT_ENV`) |
| `KIT_OUT` | where runs, reports and the cache go (default `$TMPDIR/portal-package-kit`, or `$PACKAGE_KIT_OUT`) |
| `KEEP=1` | leave the databases and folders of the run for inspection (they are listed at the end) |
| `NO_BROWSER=1` | skip the frontend build and Playwright (API and data checks only, ~1 minute) |
| `--front-dist DIR` | use an existing core frontend build instead of building one |
| `$PACKAGE_KIT_PW_MODULES` | a `node_modules` folder holding `playwright-core` (else installed once into the cache) |

Exit code 0 = PASS (warnings allowed), 1 = a check failed, 2 = the kit could not start (bad arguments, env).
A full `MODE=all` run of Masterplan takes about 9 minutes (6 of them Playwright), plus ~1 minute for a frontend
build when `src/frontend` changed since the last run.

## Safety

- **Only the test PostgreSQL `wh-test-pg` at `127.0.0.1:55432`** is accepted: any other host or port in the env
  file, or a `DATABASE_URL`, stops the kit before it connects. It creates its own databases (`pkgkit_<id>_<tag>_<random>`)
  and drops only those, at the end.
- Child processes get a clean environment (PATH, HOME, locale + what the kit sets), so a `.env` the Makefile
  exports (production `POSTGRES_*`) never reaches them. `pg_dump` / `pg_restore` of module backups go through
  `scripts/package-kit/pgbin/`, which runs them inside the `wh-test-pg` container and refuses any other server.
- Processes are stopped by the PIDs the kit started (never a pattern kill); the Playwright container has a unique
  name and is removed only by that name. `Ctrl+C` cleans up too.
- Signing uses a throw-away Ed25519 key made per run; the portal trusts it through `MODULE_TRUSTED_KEYS_FILE` (the
  platform's test override). The real key (`/root/.portal-keys`) is never read. `MODULES_DEV` stays off.
- One vite build and one Playwright run at a time on the host: the kit waits for a lock shared by kit runs and for
  any other `vite build` / Playwright container (it only looks, it never stops them). Node memory is capped
  (backend 1 GB, builds 2 GB).
- The `SOURCE_REF` checkout is a temporary `git worktree` in the run folder (its `node_modules` are links to this
  checkout's), removed at the end with `git worktree prune`.

## What it checks

### package

1. A throw-away key + a trusted-keys file that trusts only it.
2. `scripts/build-module.mjs <id> --keep --no-write` **unsigned** → `verify --allow-unsigned` OK, plain `verify` refused.
3. The same build **signed** → `verify` OK, signed by the kit key.
4. Manifest facts: `x.y.z` version, `core`, `sdk`, permissions all `<id>.*`, every `tables` pattern accepted by
   `tableOwnership.js` and a non-`<id>_` prefix declared there for the module (Masterplan `mp_`), a migration 001
   (`migrations/001_*` or an inline `migrations` list).
5. A copy with one file changed after signing and a copy signed by an untrusted key are both refused.

### fresh (this checkout's core, a new database)

1. Backend of this checkout on a free port, supervised like `start.sh` (a new process at once on exit 75, one log
   file per boot), `MODULES_DIR` in the run folder, the setup wizard over HTTP (superadministrator, closed access),
   the general API rate limit raised (the kit sends hundreds of requests).
2. A plain user with **no** roles and no groups (checked: no `<id>.*`, no `*`).
3. Uploads refused while dev mode is off: unsigned, tampered, untrusted.
4. Install over HTTP: upload → card (`install`, signed) → install → restart → **installed, switched off** →
   switched on (with `enableAlso` of the kit file).
5. With linked `packages` in the kit file: the module first on a portal that never had them (their tables do not
   exist) — its own demo data, every GET route as the superadministrator, the `alone` link probes, the demo data removed
   again — then the linked packages installed and switched on.
   The module's own demo data (`POST /api/admin/demo/<id>/seed`, after the `seed` list of the kit file), then the
   `seedRequests` of the kit file; a module with neither is a warning — the data checks then cover what its
   migrations create.
6. Two API tokens: one with `account: read` only, one with `<id>: read`.
7. **Every GET route the package mounts**, read from its own router stack (`lib/introspect.mjs` imports the
   installed `server/index.js` as the loader does and walks `routes(ctx)`). The API reference
   (`/api/developer/reference`) and `openapi.json` must list every one of them (all methods). Parameters come from `apiParams` of the kit file (SQL against the run's
   database), else `1`. Called as:

   | caller | passes when |
   |---|---|
   | superadmin | no 5xx, no 401/403 (404/400 for a placeholder id are fine) |
   | token with `<id>: read` | no 5xx, no 401/403 — a `403 SCOPE_DENIED` of a route that also needs another area (declare it in `needsOtherScopes`) |
   | plain user | 403/404; or 2xx that is **filtered**: less data than the superadmin's answer (longest array / CSV lines; `0 of N` passes, the same `N` fails); routes declared in `openToUsers` may answer |
   | token without the scope | 403/404 |
   | anonymous (public routes) | no 5xx |

   No answer within 25 s fails; event streams count by their status.
8. Link probes of the kit file (`links`, «both installed»).
9. **Pages in Playwright** (`browser/pages.mjs` in `mcr.microsoft.com/playwright:v1.48.2-jammy --network host`):
   the core frontend of this checkout built once (`vite build` into the cache, keyed by HEAD + uncommitted changes
   of `src/frontend`), served by `vite preview`, whose proxy sends `/api` and `/modules` to the kit backend. Pages:
   `/app/<id>`, every `<Route path>` of the module's `App` (from `src/frontend/src/modules/<id>/index.js` →
   its App file; `:params` from `pageParams`, a page without a value is listed as skipped), `/admin/settings/<id>`
   when the package has `Settings`, plus `pages` of the kit file. A page **fails** on: a page error, a console error
   (not the logo 404), «Extension … failed to render» (a crashed contribution), the error boundary (`.app-error`
   or the root one), an HTTP 5xx, a 4xx of package files (`/modules/…`), a redirect away from the page (an
   unregistered route falls back to `/`). API 4xx are listed and make the step a warning. Screenshots of every page
   are kept. The module page is also opened as the plain user (no crash; a redirect is fine).
10. **The module alone**: what it links to (`enhances` + `enableAlso`) switched off → superadmin sweep and pages
    again → switched back on.
11. **Update**: the signed build re-signed as version +1 with one more migration `NNN_kit_probe.sql` (numbered after
    the package's files and the migrations the database recorded, inline ones too) that creates
    `<id>_kit_probe` with one row → card `update`, restart, `previous` = the old version, no rollback, the
    migration in `module_migrations`, the probe row there; the snapshot (below) identical apart from the probe table.
12. **Failing update**: +1 again with `NNN_kit_broken.sql` (creates a table, then divides by zero) → refused
    (`MIGRATION_FAILED`), no restart, still the previous version, no `<id>_kit_broken`, snapshot identical, the
    module still answers.
13. **Uninstall** keeps data: restart, listed as `removed`, its routes 404, snapshot identical; link probes
    «module removed»; core pages (`/`, Settings → Modules, `/app/<id>` → redirect) render.
14. **Reinstall** the same version: loaded again, snapshot identical.
15. **Remove again, then «Удалить данные»**: the tables dropped are exactly the module's tables (the list of all
    tables before/after), a backup file exists in `.backups/<id>/`, no `installed_modules` row, no
    `module_migrations`, no settings block; when `uploads/<id>` held files, the backup has their archive
    (`backup.uploads`, same file count) and the folder is gone. What stays behind by design (app_settings keys the
    module writes itself, files in other `uploadFolders` of the kit file) makes it a warning.
16. Boot logs scanned for `TypeError` / `ReferenceError` / uncaught errors (warning).

**Snapshot** (`lib/db.mjs snapshot`): for each table of the module (the platform's own rule: `<id>_*`, legacy
prefixes of `tableOwnership.js`, the manifest `tables`, `module_tables` records) the row count and an
order-independent checksum (`md5` of the sorted row hashes); the stored `settings.modules.<id>` block;
`app_settings` keys `<id>_…` (a key may appear later — e.g. Masterplan's contract catch-up — but none may change or
go); per role its `<id>.*` permissions; personal dashboards and the starting layout as stored (widgets compared by
id: a save puts parked widgets after the visible ones); files of `uploads/<id>` (count + digest of path, size,
sha256; other folders with `uploadFolders` in the kit file).

### upgrade (SOURCE_REF → this core)

1. `git worktree add --detach <run>/tmp/source-<ref> <ref>`; fails when the module is not imported in that
   ref's `src/backend/modules/index.js`.
2. That core on a new database: setup, the module (+ `enableAlso`) switched on, demo data (`seed`), a role with all
   the module's permissions given to a new user, the superadmin's dashboard and the starting layout with every
   widget type available (≤ 40), link probes «old core» → **snapshot A**. Stop.
3. This core (module absent) on the same database **and the same uploads folder**, an empty `MODULES_DIR`:
   snapshot = A; the module listed as `removed` (data kept), `/api/app/<id>` 404; widget types that disappeared
   are recorded as the module's; a save of another module's settings and of the dashboard in this window keeps
   everything (snapshot = A); link probes «module absent»; core pages render.
4. Install the signed package over HTTP → loaded, migrations recorded (001 runs on the existing tables) →
   snapshot = A; the linked `packages` installed / updated to this checkout's builds → snapshot = A again; the module's widget types available again, the API reference lists its routes, GET sweep as
   superadmin and as the user holding the kept role, link probes «package installed», all module pages in Playwright.
5. Restart → snapshot = A.

## Reading the report

The console ends with one line per step, grouped by phase:

```
Package check masterplan (all) — PASS: 73 passed, 0 failed, 2 warnings, 0 skipped
  [package]
    PASS build signed with the throw-away key — masterplan-1.1.0.zip (20.5 s)
  [fresh]
    PASS API GET ×24 as user — 200×11 403×1 404×12 (0.2 s)
    warn pages with the linked modules off — 12 pages render; API 4xx to look at: api 404 /api/app/crm/pipelines
  …
  JSON report: <KIT_OUT>/runs/<id>-<mode>-<time>/report.json
```

- **FAIL** — a check did not hold; a failed step that the rest depends on stops its phase («phase stopped»), the
  next phase still runs (except after a failed package build).
- **warn** — worth a look, does not fail the run (inconclusive permission checks, API 4xx on pages, data the
  module leaves behind by design, a module without demo data).
- `<run>/report.json`: `{ id, mode, status, steps: [{ phase, name, status, note, details, ms }], facts: { manifest,
  routes, pages, freshSnapshot, upgradeSnapshot }, cleanup }`. `details` hold the full lists: every failing route
  with its status, every page with `finalPath`, `errors`, `notes`, `shot`, every snapshot difference
  `{ path, before, after }`. `<KIT_OUT>/last-<id>.json` is a copy of the latest report.
- `<run>/logs/`: numbered logs of every step — builds, verifications, `backend-<tag>-boot-NN.log` (one per node
  start: an install's restart is the next number), `vite-build`, `preview-<tag>`, `playwright`, `introspect`.
- `<run>/browser/NN-<step>/shots/*.png`: a screenshot per page; `result.json` there is the raw browser result.
- `<run>/dist/`: the built zips and the update variants (signed by the run's key, which is deleted at the end).

## Module kit file

`scripts/package-kit/modules/<id>.json` (optional) tells the kit what it cannot guess:

| Key | Meaning |
|---|---|
| `enableAlso` | built-in modules to switch on with it (the ones its links need) |
| `packages` | other **module packages** its links need (`["masterplan", "contracts"]` for the CRM): built from this checkout and signed with the kit key (package phase); fresh: installed after the module was checked alone (below), then switched on; upgrade: when `SOURCE_REF` has them built in, installed after the module (their «removed» rows → `install`), when they are packages there too, built from `SOURCE_REF`, installed on the old core and updated to this checkout's build after the module (`update`); the old core's `MODULES_DIR` is kept for the new core |
| `seed` | demo data order (`["crm", "masterplan"]`: CRM deals first, Masterplan links its units to them) |
| `seedRequests` | records made through the module's own API after the demo data, as the superadministrator (both phases; a module without demo data then needs no warning): `[{ method (POST), path, body, save, upload: { name, type, base64 }, expectStatus }]` — `save` keeps the answer, `"@name.key.path"` in a later body or path uses a value of it (`"@folder.folder.id"`) |
| `apiParams` / `pageParams` | `{ name: "SELECT …" | value }` for `:name` in API routes / page routes |
| `openToUsers` | `["GET /api/app/<id>/meta", …]` readable by everyone signed in (reference lists); give reasons next to it |
| `needsOtherScopes` | routes that also need another area's token scope |
| `skipApi` | routes the sweep must not call (`*` one segment, `**` the rest) |
| `links` | `[{ name, path, present: { status, nonEmpty }, absent: { maxStatus, empty } }]` — probes of the links with other modules (or of the module's public side), called with both installed and with this module missing; `alone` (same keys) is checked in the fresh phase before the linked `packages` are installed (probes without it are not run then); `oldCore` (same keys) replaces `present` on the `SOURCE_REF` core when the built-in module answered differently there (give the reason in `oldCoreWhy`). `has` / `lacks` check that a value at a path of the answer is (not) there; `websocket: true` sends a WebSocket upgrade instead (raw HTTP, no frames) and compares the status line: `{ status }` or `{ not }` (Remote's tunnels); `anonymous: true` calls it without a session (a public page of the package, the shell list a visitor gets) |
| `pages`, `replacePages` | extra pages (`"/app/crm"` or `{ path, expectPrefix, name?, anonymous?, delay?, waitMs?, expectText? }`); `replacePages: true` uses only these; `expectText`: text the page must show. `anonymous: true` opens the page in a fresh context without signing in (a visitor of a public link) and fails it when it passes through any address outside `expectPrefix` while loading (a detour to the sign-in page); `delay: [{ match, ms, times? }]` holds back the requests whose URL matches the regexp `match` for `ms` (the first `times`, or all) — a slow first visit (the File server's `/d/<token>` with its web entry or the package list held back past the shell's 1.5 s budget) |
| `ignoreBrowser` | regular expressions of browser messages to ignore |
| `uploadFolders` | folders under `uploads/` that hold the module's files (default `[<id>]`) |
| `waitMs` | wait per page (default 4500; pages with live streams never reach network idle) |
| `sessionsOnly` | `true`: the module's area is never open to API tokens (`api/scopes.js` BLOCKED: the AD directory); or route patterns (`["GET /api/app/drive/access/**"]`: the File server's «Доступ», 403 `FA_NO_TOKENS`): the token with the module's scope then expects a 403 there, and with `true` the API reference must *not* list the routes (it documents what tokens may call); give the reason in `sessionsOnlyWhy`. Anonymous callers of public routes may answer any 4xx (a placeholder parameter), never 5xx |
| `appendOnly` | log tables the kit's own requests add rows to (the File server's `drive_activity`): in snapshot comparisons their rows may only grow; give the reason in `appendOnlyWhy` |
| `backendEnv` | extra environment of the kit's backends for the module's fakes — only `SMBGATE_*`; a value `@kit/fakes/<file>` is a file of `scripts/package-kit/fakes/` (`{ "SMBGATE_PYTHON": "@kit/fakes/python-smbgate" }`, see «Fakes») |

## Fakes

`scripts/package-kit/fakes/` holds stand-ins for what a module reaches outside the portal, so the kit never touches a real
server:

- `python-smbgate` + `smbgate-fake.py` — the File server's SMB gateway. The package starts `$SMBGATE_PYTHON <its
  gateway/smbgate.py> <socket>`; the kit file's `backendEnv` points `SMBGATE_PYTHON` at `python-smbgate`, which runs the fake on
  that socket instead (`python3 -I`, standard library only). Same protocol (key header, `X-Gate` parameters, JSON answers, raw
  file bodies), one small in-memory read-only folder tree for every server and share; no network connection is ever made.
  Writes answer 403 `ACCESS_DENIED`, thumbnails 415, unknown operations 404, like the real gateway. Used by `drive.json` and by
  `directory.json` (the File server as a linked package), on the old core of the upgrade phase too.

The AD directory needs no fake: with the Active Directory integration not set up it works on its demo directory (database
rows), and the File server's «Доступ» stays off (404 `DRIVE_ACCESS_DISABLED`).

## Files

| Path | Role |
|---|---|
| `scripts/package-kit/run.mjs` | the phases and the report |
| `scripts/package-kit/lib/pure.mjs` | pure helpers: arguments, the test-database guard, snapshot diff, route walk, verdicts, pages (tested by `src/backend/test/package-kit.test.js`, part of `npm test`) |
| `lib/proc.mjs` | free ports, child processes with logs, own-PID stops, host locks |
| `lib/backend.mjs` | the supervised backend (restart on 75, boot ids) |
| `lib/http.mjs` | session / token clients, multipart upload |
| `lib/db.mjs` | databases, module tables, snapshots |
| `lib/package.mjs` | build, verify, update / failing / tampered / untrusted variants |
| `lib/introspect.mjs` | the routes of an installed package |
| `lib/frontend.mjs`, `lib/browser.mjs`, `browser/pages.mjs` | frontend build + preview, Playwright |
| `pgbin/pg_dump`, `pgbin/pg_restore` | backups through the test container |

## Platform notes found with the kit (Masterplan, 2026-10-23)

- `/admin/settings/<id>` of every package with `Settings` crashed (APP_CRASH): `admin/navigation.js`
  `addPackageSettingsItem()` builds the item without `section`, so `sectionForPath()` returns `undefined` and
  `AdminLayout.jsx` reads `SECTIONS[undefined].path`. Built-in items get `section: group.section || 'settings'`.
  The Masterplan run passes with that one line added (checked with `--front-dist` on a patched build).
- Package routes were missing from the API reference (`/api/developer/reference`, `openapi.json`):
  `api/introspect.js` walked `MOUNTED` (built-in modules) only. Fixed: it also walks the routers of the loaded
  packages (`loader.js packageMounts()`); a package without a hand-written section gets one named after its
  manifest. The kit checks it (fresh step 7, upgrade step 4).
- «Удалить данные» left the module's upload folder (`uploads/masterplan`, 6 demo files). Fixed: the purge backup
  archives `uploads/<id>` (`<file>.uploads.tar.gz`) and the folder is removed (module-packages.md «Backups»); the
  `app_settings` keys the module writes itself still stay (documented).
- Masterplan's own settings page (`/app/masterplan/settings`) asks `/api/app/crm/pipelines` with CRM switched off (404, handled by the page — a warning).
- Remote on v1.20.0 (built in): the guacd tunnel never gets its WebSocket upgrades — the Portal VNC `ws` server, attached with `{ server, path }` too, answers 400 to every upgrade outside its path. The package routes both tunnels through one `upgrade` listener (`remote/upgrade.js`); the kit's old-core probe expects only an answer below 500 (`oldCore`).
