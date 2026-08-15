# docker-app-skeleton

**Application skeleton** for products that need a signed-in cabinet, an admin console, and a first-run wizard — not a demo toy.

Clone it, rename it, connect PostgreSQL, finish `/setup`, then build the real domain on top. Auth, users, appearance, integrations stubs, and IP controls are already there.

> **Security first.** Never commit `.env`. Production will not start without `JWT_SECRET`. Finish the wizard on a private network, or set `SETUP_TOKEN`. Full checklist: [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md).

## What you get

| Area | Included |
|------|----------|
| Public site | Landing, EN/RU, light/dark, login |
| Cabinet | Profile, avatar, password, personal theme |
| Admin | General, color theme, typography, menu icons, users, integrations, IP lists, security history |
| Auth | httpOnly JWT cookie, bcrypt, lockout, session revoke on password change |
| First run | Setup wizard (database → admin → open/closed access) |
| Ops | Docker production + Vite dev, Makefile, `/health` `/ready` |

Stack: React 18, Vite, Ant Design, Express, PostgreSQL, nginx, Docker Compose.

## Quick start

You need Docker and a reachable PostgreSQL (any 14+ instance the container can see).

```bash
git clone <this-repo> my-product
cd my-product

# 1. Local secrets (fills JWT_SECRET)
make env

# 2. Point .env at PostgreSQL, or leave POSTGRES_PASSWORD empty
#    and enter credentials in the wizard.
#    Set FRONTEND_URL to the URL users will open.

# 3. External network used by compose
docker network create docker-lan   # skip if it already exists

# 4. Production container
make up
make health
```

Open http://127.0.0.1:8092 — you are redirected to `/setup`.

1. Database host / database / user / password → Test → Save  
2. First administrator (username `3–32` `[A-Za-z0-9._-]`, password ≥ 10 characters)  
3. **Closed** (login wall) or **Open** (public landing; cabinet and admin stay private)

If the port might be reachable before setup finishes, set `SETUP_TOKEN` in `.env` and paste it in the wizard.

Create the Postgres role and database yourself, or use [docs/postgres.md](docs/postgres.md).

## Development

```bash
make dev
```

| URL | Role |
|-----|------|
| http://127.0.0.1:3020 | Vite UI (hot reload) |
| http://127.0.0.1:3021 | API |

Source is bind-mounted. After changing `package.json`, run `make dev-rebuild`.

## Turn this into your product

Short version (details in [docs/adapt.md](docs/adapt.md)):

1. Change `DOCKER_NAME`, `DOCKER_PORT`, `VERSION`, and names in `.env.example`.
2. Replace landing copy in `src/frontend/src/i18n/translations.js` and the footer in `AppFooter.jsx`.
3. Add routes under `src/backend/routes/` and pages under `src/frontend/src/pages/`.
4. Keep `middleware/auth.js`, cookie options, and parameterized SQL as-is unless you know the threat model.
5. `make bump-patch && make rebuild` when you ship.

## Configuration

Bootstrap lives **only in `.env`** (gitignored). Template: `.env.example`.

| Variable | Purpose |
|----------|---------|
| `DOCKER_NAME` / `DOCKER_PORT` | Container name and published HTTP port |
| `FRONTEND_URL` | CORS origin and `Secure` cookie flag when `https://` |
| `JWT_SECRET` | Signs the session cookie (**required** in production) |
| `SETUP_TOKEN` | Optional shared secret for the wizard |
| `POSTGRES_*` / `DATABASE_URL` | Database (wizard can write `POSTGRES_*`) |
| `COOKIE_SECURE` | Force `Secure` cookies behind TLS-terminating proxies |
| `UPLOAD_DIR` | Avatar/logo storage inside the container |

App name, theme, integrations and security policy are stored in PostgreSQL (`app_settings`), not in git.

See [docs/configuration.md](docs/configuration.md).

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/getting-started.md](docs/getting-started.md) | First clone → running product |
| [docs/architecture.md](docs/architecture.md) | Layout, data model, request flow |
| [docs/adapt.md](docs/adapt.md) | How to fork this skeleton for a real project |
| [docs/security.md](docs/security.md) | Threat model, controls, go-live checklist |
| [docs/configuration.md](docs/configuration.md) | Environment and admin settings |
| [docs/operations.md](docs/operations.md) | Make targets, backup, upgrades |
| [docs/api.md](docs/api.md) | HTTP API |
| [docs/postgres.md](docs/postgres.md) | PostgreSQL (generic + docker-lan helper) |
| [docs/github.md](docs/github.md) | First commit and push without leaking `.env` |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to change the skeleton |

## Make commands

```bash
make help
```

| Command | Action |
|---------|--------|
| `make setup` | `.env` from example + `docker-lan` |
| `make env` | Create `.env` and generate `JWT_SECRET` if empty |
| `make up` / `make down` / `make rebuild` | Production |
| `make health` / `make ready` / `make logs` | Probe and logs |
| `make dev` / `make dev-down` | Hot-reload stack |
| `make bump-patch` | Semver in `VERSION` + package files |

## License

[MIT](LICENSE)
