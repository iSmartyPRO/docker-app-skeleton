# Operations

## Production

```bash
make setup          # .env + docker-lan
make up             # build + start
make rebuild        # recreate after code changes
make restart        # no rebuild
make down
make logs
make logs-tail LINES=200
make health
make ready
make shell
```

Healthcheck hits `http://127.0.0.1/health` inside the container. Host probe:

```bash
curl -fsS http://127.0.0.1:8092/health
```

## Development

```bash
make dev
make dev-logs
make dev-rebuild    # after package.json changes
make dev-down
```

## Tests

```bash
make test           # backend unit tests + frontend production build (host Node 22)
```

## Version and releases

Every update gets a version automatically: [Semantic Versioning](https://semver.org/) `MAJOR.MINOR.PATCH`, starting at **1.0.0**. One number is shown everywhere:

- **in the app:** the footer (`v 1.2.3`), read from `VERSION` at build time; `/version.json` carries it too;
- **on the server:** `/health` → `version` (the image is built with `APP_VERSION` from `VERSION`);
- **on GitHub:** the tag `v1.2.3` and a release whose notes are that section of [CHANGELOG.md](../CHANGELOG.md) (published by `.github/workflows/release.yml` when the tag is pushed).

```bash
make deploy              # release locally (if anything changed) → backup → tag image :previous → rebuild → healthy → push
make release-dry         # how the next release would be classified (and what is not on origin yet)
make release             # release only: bump, CHANGELOG, commit, tag, push
make deploy BACKUP=skip  # deploy without a database backup (only when you mean it)
make deploy BUMP=minor   # force the level (major | minor | patch) or an exact version (BUMP=2.0.0)
```

**Classification** (`scripts/release.mjs`) looks at every commit since the last `v*` tag; the highest level wins:

| Level | When |
|---|---|
| major | `BREAKING CHANGE` in the message, or a type with `!` (`feat!: …`) — incompatible changes to the API, data or configuration |
| minor | `feat: …` — new modules and features (also plain subjects starting with *Add / New …* or mentioning a *module*) |
| patch | `fix:`, `perf:`, `refactor:`, `docs:`, `chore:`, `style:`, `test:` and everything else |

Write commit subjects as [Conventional Commits](https://www.conventionalcommits.org/) (`feat(warehouse): …`, `fix(drive): …`) so the level is exact. The release then:

1. writes the new number to `VERSION`, both `package.json` and both lock files;
2. turns `## [Unreleased]` in `CHANGELOG.md` into `## [x.y.z] - date` (if the section is empty, the commit subjects are used) and opens a new empty `[Unreleased]`;
3. commits `chore(release): vx.y.z`, creates the annotated tag and pushes both (`make release`).

With no commits since the last tag, nothing is released and `make deploy` just redeploys the same version. A push that failed earlier (network, credentials) is not lost: every run that may push checks origin first (`git rev-list @{u}..HEAD`, `git ls-remote --tags`) and pushes the branch and the release tag when origin does not have them; `make release-dry` lists what is still missing there.

**`make deploy` publishes only what runs.** The order is:

1. release commit and tag **locally** (`release.mjs --no-push`);
2. `make backup` — required: when `DB_CONTAINER` (default `postgres-18`) is not running the deploy stops (`make deploy BACKUP=skip` deploys without a backup, deliberately); the dump goes to `BACKUP_DIR` (default `/root/db-backups`);
3. the running image is tagged `:previous`, then `make rebuild`;
4. `/health` must answer `ok` with the new version within 3 minutes;
5. only then the branch and the tag are pushed (`release.mjs --push-only`), and GitHub publishes the release.

### Failed deploy

A deploy that stops at step 2–4 leaves nothing published: the release commit and tag exist only locally.

- **Fix forward** (usual): fix the problem, commit, run `make deploy` again. The next release counts the new commits since the local tag; once it is healthy both tags are pushed (the failed one stays in history with its CHANGELOG section).
- **Drop the unpublished release** instead: `git tag -d vX.Y.Z && git reset --hard HEAD~1` (only while that release commit is the last commit and unpushed; it restores `VERSION`, the package files and `CHANGELOG.md`).
- **Bring the old version back** while you fix it: `docker tag <image>:previous <image> && docker compose -f docker-compose.yml up -d --no-build` (the image is `portal-app` for this checkout), or check out the previous tag and `make rebuild`.
- A deploy that failed only at the push (step 5): `make release` (or `node scripts/release.mjs --push-only`) pushes what origin is missing.

## Upgrading a running installation

Schema changes are applied automatically on start, so back up first:

```bash
set -a && . ./.env && set +a
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" postgres-18 \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > backup-$(date +%F-%H%M).dump
docker tag my-product-app:latest my-product-app:previous
git pull && make rebuild && make health
```

Upgrading from 0.0.1 creates roles and groups once: former admins become super administrators, everyone else joins the default group, and existing sessions stay valid. Set `SEED_LOCALE=ru` beforehand if the groups should be named in Russian.

Restore a dump (stop the app first):

```bash
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" postgres-18 \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < backup.dump
```

## Rollback

Tag the running image before a risky rebuild, then retag to roll back:

```bash
docker tag my-product-app:latest my-product-app:previous     # before make rebuild
docker tag my-product-app:previous my-product-app:latest     # roll back
docker compose up -d --force-recreate
```

Replace `my-product-app` with your compose project's image name (`docker compose images`).

## Backup

Minimum — all three, taken together:

1. PostgreSQL dump of `POSTGRES_DB` (users, settings, IP rules, events, module data).
2. Directory `data/uploads/` from the compose volume: avatars and logos **and the files of the modules** (Files, chat attachments, tasks, knowledge base, CRM/companies, masterplan media). The database only references these files; a dump without them restores broken links.
3. The `.env` file. It holds `JWT_SECRET` (sessions) and `ENCRYPTION_KEY` (when it is not set, the key is derived from `JWT_SECRET`), which encrypts the integration secrets stored in the database (SMB/Drive passwords, API keys, bot tokens). A dump restored with a different key cannot decrypt them — every integration has to be configured again. Keep the `.env` copy as secret as the database itself (not next to it in plain view).

4. Directory `data/modules/` (installed module packages and their table backups in `.backups/`). Without it the portal starts without those modules (their data stays in the database; install the packages again).

Restore: recreate the role/database, `psql` the dump, copy uploads and modules back, start the container with the same `.env`.

The module **signing key** (`/root/.portal-keys/modules-ed25519.pem`, see below) is not part of a portal backup, but losing it means packages can no longer be signed with the key portals trust: keep an offline copy.

## Module packages

Modules can be installed, updated and removed as signed zip files (Settings → Modules → «Установить из файла»,
superadministrators only). Engineering details: [module-packages.md](module-packages.md).

- **Volume**: `./data/modules` → `/app/data/modules` (`MODULES_DIR`). Layout: `<id>/<version>/`, `<id>/current`,
  `<id>/previous`, `.staging/` (uploads waiting for «Установить», removed after an hour), `.backups/<id>/`.
  Create it writable before the first deploy with this version: `mkdir -p data/modules`.
- **Restart**: installing, updating or removing restarts the app process inside the container (5–10 s;
  `start.sh` restarts node on exit code 75, nginx stays up). No `make restart` needed.
- **Backups of module tables**: before every update and before «Удалить данные» the app writes
  `data/modules/.backups/<id>/…` (pg_dump format when the image has `pg_dump`, else NDJSON). They are
  not rotated: delete old ones by hand when space matters. Restore a pg_dump backup:
  `docker exec -i <container> pg_restore --clean --if-exists --single-transaction -d "$POSTGRES_DB" < file.dump`
  (with the `PG*` variables of `.env`).
- **Signing key**: `make module-keygen` (once, on the build host) creates `/root/.portal-keys/modules-ed25519.pem`
  (mode 600, outside the repository; `MODULE_SIGNING_KEY_FILE` overrides) and adds the public key to
  `src/backend/platform/trusted-keys.json` — commit it and release the core; only then do portals accept
  packages signed with it. `make module ID=<id>` builds and signs `dist/modules/<id>-<version>.zip`;
  `make modules-verify FILE=…` checks a file.
- **Development**: `MODULES_DEV=1` accepts unsigned packages (never in production). `MODULE_TRUSTED_KEYS_FILE`
  points at another trusted-keys file (tests).
- **A module that fails to start** is skipped (the portal runs on) and shown as «Не запустился» with the
  error on its card; after an update the previous version is restored automatically.
- **Inventory** for the future store: `GET /api/admin/modules/inventory` (portal id, core and module versions, signed).
- **Masterplan is a package** from this core on: after deploying the core, install `masterplan-<version>.zip`
  at once (its data and settings stay in the database meanwhile) —
  [module-packages.md → upgrading a portal that had Masterplan built in](module-packages.md#upgrading-a-portal-that-had-masterplan-built-in).

## Updates from upstream skeleton

```bash
git remote add skeleton <upstream-url>   # once
git fetch skeleton
git merge skeleton/main                  # resolve branding conflicts in i18n / footer
make rebuild
```

Prefer merging security fixes in `middleware/` and `services/auth.js` even if you skip UI changes.

## System page

**Admin → Settings → System** (`settings.view` or `settings.system`; superadministrators have both) is the
operator's console. Under the runtime and database cards and the API limits it shows a **report**
(`GET /api/admin/system/report`, built in parallel and cached for 30 s; *Refresh* rebuilds it; folder sizes are
cached for 10 minutes and walking stops at 200 000 entries — then marked *approximate*):

| Block | What |
|---|---|
| Checks | HTTPS, `FRONTEND_URL`, `PUBLIC_URL`, `JWT_SECRET` strength, `ENCRYPTION_KEY`, setup wizard locked, secure cookies, time zones (server · portal · database), **last backup** — the newest file in `BACKUP_DIR` (ok ≤ 26 h, attention ≤ 7 days); without `BACKUP_DIR` it says *unknown*. Mount the host's backup folder read-only and set `BACKUP_DIR` to see it |
| Versions | core `VERSION`, frontend build id and date (`dist/version.json`), Node.js, PostgreSQL, environment, time zone |
| Resources | disk total / free of the uploads volume, uploads size, preview cache, process memory and uptime, load average, database size and the 10 largest tables |
| Counts | users (active), active sessions, files (and their size) |
| Integrations | AD, e-mail, Telegram, WhatsApp, Wazzup, Mattermost, Google, document server: *working / off / not filled in (which fields)* — no values |
| Queues | webhook deliveries (waiting, failed / delivered in 24 h), notifications in 24 h and held back by quiet hours |
| Modules | version, minimum core, on/off, the newest changelog line |
| Background jobs | every `registerJob()` job: interval, last run, duration, last error (as seen by this process; tokens and passwords are scrubbed) |

*Export report* downloads it as Markdown or JSON for support. The report never contains passwords,
tokens, keys or integration addresses (`test/platform-modules.test.js`, `test/platform-demo.db.test.js`).

## Demo data

A superadministrator fills and removes demo data in **Settings → Modules → Demo data** (per module or
«Демо всего портала»); see [extending.md](extending.md#demo-data). While any exists, administrators see a
«Демо-режим» bar. Remove demo data before a portal goes live: records added *inside* demo projects or
folders are removed with them. Fills and removals are in the activity log (`demo_data`).

## Sample users

```bash
make seed-demo      # adds five password-less demo accounts to the running database
```

Safe to run more than once; existing usernames are skipped. Delete them from **Users** when done.

## Postgres helpers (optional)

If `/dockers/postgres` exists on the host:

```bash
make postgres-up
make db-setup PASSWORD='…'
make sql SQL='SELECT id, username, role FROM users;'
```

Override path: `make postgres-up POSTGRES_DIR=/path/to/postgres`.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Container exits in production | `JWT_SECRET` empty — `make env` |
| Wizard loops on database | Hostname from **inside Docker**, not `127.0.0.1` |
| Cookies missing on HTTPS | `FRONTEND_URL` must be `https://…` or `COOKIE_SECURE=true` |
| CORS errors in dev | `FRONTEND_URL` / Vite origin mismatch |
| 403 for everyone after enabling allow-list | Clients reach Express with the proxy IP — set `TRUST_PROXY_HOPS`. Recover from the host: `curl` via `127.0.0.1` is always allowed |
| One failed login locks out everybody | Same cause: `TRUST_PROXY_HOPS` lower than the real number of proxies |
| `409 SELF_LOCKOUT` when saving IP settings | Working as intended — add your own address to the allow-list first |
| Setup 401 | `SETUP_TOKEN` set — paste it in the wizard |
| Need to re-run the wizard on purpose | Remove `SETUP_LOCKED` from `.env`, point it at an empty database, `make restart` |
| Dark-theme logo invisible | Upload a light version under Settings → General → *Dark theme* |
| A sign-in method cannot be switched on | Its integration is not enabled or incomplete — follow the link next to the method |
| Telegram widget says *Bot domain invalid* | Run `/setdomain` in @BotFather with the site's domain |
| *This Telegram account is not linked* | The user must link Telegram in Cabinet → Security first (or enable auto-provisioning) |
| Codes do not arrive | Check `make logs` for `Sign-in code delivery failed`; the user needs a phone (WhatsApp) / email / linked Telegram; a Wazzup channel must be *Active* |
| Code always rejected | Codes expire after 5 minutes and burn after 5 wrong tries; only the newest code works |
| AD users cannot sign in | *Test connection* in Integrations → Active Directory; check the base DN covers the users and the account is enabled in AD |
| `409 LAST_SUPERADMIN` | Working as intended — make another super administrator first |
| Locked out of the console completely | `make sql SQL="INSERT INTO user_roles SELECT u.id, r.id FROM users u, app_roles r WHERE u.username='name' AND r.key='superadmin' ON CONFLICT DO NOTHING"` |

## Disk space and Docker build cache

Every `make rebuild` leaves Docker build-cache layers behind (a few GB per build). Left alone they fill the disk; PostgreSQL then cannot start (`could not write lock file "postmaster.pid": No space left on device`) and the portal answers `Database is not connected` — the sign-in page falls back to the skeleton defaults. `make rebuild` (and so `make deploy`) ends with `make prune-build`: it drops build-cache entries older than 2 days, caps the rest at 6 GB and removes untagged images. The `-a` flag matters — without it Docker only removes dangling records and the cache kept growing by about 1 GB per deploy (22 GB on 2026-10-16). Check with `docker system df` and `df -h /`; `docker builder prune -a -f` frees all build cache at once (the next build is just slower).

## Startup and shutdown

- If PostgreSQL is not reachable when the container starts, the backend keeps retrying the schema bootstrap in the background (5 s, doubling up to 5 min) until it succeeds. `/health` answers as before (process alive); `/ready` answers `503` with `"schema": false` until the bootstrap has run (it also tries the bootstrap itself once the database is back).
- On `SIGTERM`/`SIGINT` the backend ends the live streams (chat), closes idle connections, gives requests in flight 3 s, closes the database pool and exits `0` (forced exit after 10 s).
- After a module package is installed, updated or removed the app stops the same way but exits `75`; `start.sh` starts node again at once (any other exit ends the container, which Docker restarts).
- Notifications have an index on `created_at`, so the retention job does not scan the whole table.

## Logs

nginx writes its access and error logs to the container output (`docker logs portal`), next to the app's own lines; health checks (`/health`, `/ready`) and static bundles (`/assets/`) are not logged. `docker-compose.yml` caps the log at 5 files × 10 MB (`logging.options`), so it can no longer fill the disk. Before this, nginx wrote to `/var/log/nginx/*.log` inside the container, which grew until the container was recreated.

## Known hardening items

- **The container runs as root.** nginx (port 80) and Node both run as `root` inside the container. Not changed yet on purpose: the files in `data/uploads/` on the host are owned by root, and the Drive module's SMB gateway (Python, `smbprotocol`) runs in the same container, so switching the user blindly could break uploads or the gateway. Plan:
  1. Create a fixed non-root user in the image (e.g. `app`, uid/gid 10001); `chown -R 10001:10001 data/uploads` on the host once, during a maintenance window, after a backup.
  2. Let nginx listen on an unprivileged port (8080, compose maps `${DOCKER_PORT}:8080`) and keep its pid/temp paths in writable dirs (`/run/nginx`, `/var/lib/nginx/tmp` owned by the user); or keep nginx as the only root process and drop Node and the SMB gateway to the user (`su-exec app node server.js` in `start.sh`).
  3. Check on a test copy: avatar/logo upload, Files and Drive upload/download, DWG preview (`dwg2dxf`), the Setup Wizard writing `.env` (the mounted file must be writable by the user), then roll out with the usual tag/rollback routine.
- **Third-party downloads are pinned.** The LibreDWG source tarball in the `Dockerfile` is checked against a SHA-256 (`LIBREDWG_SHA256`); when upgrading LibreDWG, download the new tarball once, run `sha256sum` and update both the URL and the checksum.

## Outages, error screens and incident ids

- **Technical works screen.** When the server restarts (deploys), the database is unavailable or the connection is lost, the app shows "Портал обновляется / Технические работы / Нет связи" instead of falling back to default settings. It checks `/api/status` every 5 s and disappears by itself; the page underneath keeps what was typed. Triggers: nginx answers `503 {"code":"MAINTENANCE"}` while the app server is down (`error_page 502 504`), the API answers `503 {"code":"DB_UNAVAILABLE"}`, a bare gateway error without a JSON code (`502`/`504`, or a non-JSON `503` from an outer proxy), or two network failures within 20 s. A module's own error (a registry answering 502, the Drive gateway down, an API switched off — all with their own `code`) and a timeout of an ordinary request do not count: the page shows them itself. Timeouts count only for the requests the app cannot start without (`/status`, `/settings`, `/auth/me`). During an outage the app keeps the person signed in and stays on the same address: it does not fall back to the sign-in page or to `/apps`, and asks the server again once it is back.
- **Updates and uploads.** A new build is applied automatically (on the next page change, or when the app comes back after 10 minutes away) only while nothing reload-sensitive runs. Requests with upload progress are marked busy automatically (`lib/busy.js`); other long jobs can call `markBusy(key)` / the returned unmark function. While busy the browser also asks before the tab is closed.
- **Ids a person can send.** Every request has an id (`X-Request-Id`, `R-XXXXXXXX`); each browser tab has a session id (`X-Client-Session`, `S-XXXX-XXXX`). Error screens show the code, the request id (when known), the session id and the time, with "Copy details". The app-crash screen also reports the crash to the server (`POST /api/client-errors`) and shows its incident id.
- **Finding an incident.** Admin → Activity → "Failures and errors" lists server errors (5xx) and browser crashes since the last restart (in memory, newest first, 500 kept) — search by code, request id or session id. The same lines are in the container log: `docker logs portal 2>&1 | grep R-1A2B3C4D` (or the session id).
- **Offline page.** With no network or the whole container down, the installed app shows "Портал временно недоступен" and reloads by itself once `/version.json` answers.
