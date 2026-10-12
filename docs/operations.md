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

## Version

Keep [CHANGELOG.md](../CHANGELOG.md) up to date, then:

```bash
make version
make bump-patch     # 0.0.1 → 0.0.2
make bump-minor
make bump-major
make rebuild        # bake VERSION into the image
git tag v$(cat VERSION) && git push --tags
```

`make bump-*` updates `VERSION`, both `package.json` files and both lock files. The UI reads `VERSION` at build time.

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

Minimum:

1. PostgreSQL dump of `POSTGRES_DB` (users, settings, IP rules, events).
2. Directory `data/uploads/` (avatars, logos) from the compose volume.

Restore: recreate the role/database, `psql` the dump, copy uploads back, start the container with the same `.env`.

## Updates from upstream skeleton

```bash
git remote add skeleton <upstream-url>   # once
git fetch skeleton
git merge skeleton/main                  # resolve branding conflicts in i18n / footer
make rebuild
```

Prefer merging security fixes in `middleware/` and `services/auth.js` even if you skip UI changes.

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

Every `make rebuild` leaves Docker build-cache layers behind (a few GB per build). Left alone they fill the disk; PostgreSQL then cannot start (`could not write lock file "postmaster.pid": No space left on device`) and the portal answers `Database is not connected` — the sign-in page falls back to the skeleton defaults. `make rebuild` now ends with `make prune-build`, which trims the build cache to 4 GB and removes untagged images. Check with `docker system df` and `df -h /`; `docker builder prune -a -f` frees all build cache at once (the next build is just slower).
