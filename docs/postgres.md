# PostgreSQL

The app **does not** start its own database container. Point it at any PostgreSQL 14+ that the app container can reach (same Docker network, or a hosted instance).

## Generic setup

```sql
CREATE USER my_app WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE my_app OWNER my_app;
```

`.env`:

```env
POSTGRES_HOST=postgres-18
POSTGRES_PORT=5432
POSTGRES_DB=my_app
POSTGRES_USER=my_app
POSTGRES_PASSWORD=choose-a-strong-password
```

`POSTGRES_HOST` is resolved **inside the app container**. For a Compose service named `postgres-18` on `docker-lan`, use that name — not `localhost` (that would be the app container itself).

Alternatively leave the password out of `.env` and type it in `/setup`. The wizard writes `POSTGRES_*` and comments out `DATABASE_URL` if it was set.

Tables (`users`, `app_settings`, `ip_rules`, `login_attempts`, `security_events`) are created automatically on a successful connection.

## docker-lan helper (optional)

If this host uses the shared stack at `/dockers/postgres`:

```bash
docker network create docker-lan
make postgres-up
make db-setup PASSWORD='your-strong-password'
```

Hostname from the app: **`postgres-18`** (or whatever `POSTGRES_HOST` is in that stack).

```bash
make psql
make sql SQL="SELECT id, username, role FROM users;"
```

Override: `make postgres-up POSTGRES_DIR=/absolute/path/to/postgres`.

## Network

Both the app compose files attach to external network `docker-lan`. Create it once:

```bash
docker network inspect docker-lan || docker network create docker-lan
```

Put Postgres on the same network so the hostname resolves.

## Backup

```bash
pg_dump -h 127.0.0.1 -U my_app my_app > backup.sql
```

Keep `data/uploads/` next to the dump.
