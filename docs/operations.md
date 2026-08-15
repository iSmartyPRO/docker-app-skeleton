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

## Version

```bash
make version
make bump-patch     # 0.0.1 → 0.0.2
make bump-minor
make bump-major
make rebuild        # bake VERSION into the image
```

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
| 403 after enabling allow-list | Your IP not in the list; connect from localhost on the host |
| Setup 401 | `SETUP_TOKEN` set — paste it in the wizard |
