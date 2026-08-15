# Getting started

This skeleton is meant to become **your** product: copy the repo, connect PostgreSQL, finish the wizard, then add domain features.

## Requirements

- Docker Engine + Compose v2
- PostgreSQL 14+ reachable from the app container
- A Docker network named `docker-lan` (compose uses it as `external`)

Optional: the helper Makefile at `/dockers/postgres` if you run the shared iSmarty PostgreSQL stack. It is **not** required. Any Postgres host works.

## 1. Clone and name the project

```bash
git clone <repo-url> my-product
cd my-product
```

Edit `.env.example` (and later `.env`):

- `DOCKER_NAME` — container name (`my-product`)
- `DOCKER_PORT` — host port (default `8092`)
- `FRONTEND_URL` — URL users type in the browser

## 2. Secrets

```bash
make env
```

This copies `.env.example` → `.env` if missing and fills an empty `JWT_SECRET`.

**Do not commit `.env`.** It is gitignored. Treat `JWT_SECRET` and `POSTGRES_PASSWORD` as production secrets.

Recommended extras before the first `make up`:

```env
FRONTEND_URL=https://app.example.com
SETUP_TOKEN=a-long-random-string
```

`SETUP_TOKEN` locks the wizard: without it, anyone who can open `/setup` while setup is unfinished can create the first admin.

## 3. Database

Create a role and database, then either:

- put `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` in `.env`, or
- leave the password empty and enter it in `/setup`

The hostname inside Docker is often the Postgres **container name** (for example `postgres-18`), not `localhost`.

Details: [postgres.md](postgres.md).

## 4. Network and start

```bash
docker network create docker-lan   # once per host
make up
make health
```

Production: http://127.0.0.1:8092 (or `DOCKER_PORT`).

Behind a reverse proxy, set `FRONTEND_URL` to the public HTTPS origin and terminate TLS on the proxy. The app container listens on HTTP internally.

## 5. Wizard

| Step | What happens |
|------|----------------|
| Database | Tests credentials, writes `POSTGRES_*` into `.env`, creates tables |
| Administrator | First `admin` user (bcrypt). After this, setup writes are `403`. |
| Access | **Closed** = guests hit login. **Open** = public landing; `/account` and `/admin` still need a session. |

Password policy: **10–200** characters. Username: **3–32**, `[A-Za-z0-9._-]`.

## 6. Daily development

```bash
make dev
```

Vite on `:3020`, API on `:3021`, source mounted. Production image is rebuilt with `make rebuild` (frontend is compiled in Docker; bind mounts are not used in prod).

## 7. Verify

```bash
make health          # process up
make ready           # PostgreSQL
make setup-status    # wizard state
make api-status      # app name + DB
```

Next: [adapt.md](adapt.md) to replace branding and add modules, [security.md](security.md) before go-live.
