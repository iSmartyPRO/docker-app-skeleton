# Architecture

## Why this layout

The repo is a **skeleton**, not a monolith of business logic. The backend owns sessions, users, settings and uploads. The frontend is a Vite SPA. PostgreSQL is **external** so many apps can share one database server.

```
browser
  → nginx :80          static SPA + proxy /api /uploads /health
      → express :3001  JSON API, cookies, files
          → PostgreSQL (docker-lan or any host)
```

## Repository map

```
.
├── Makefile                 # env, build, up, dev, version
├── docker-compose.yml       # production
├── docker-compose.dev.yml   # Vite + nodemon
├── Dockerfile / Dockerfile.dev
├── nginx.conf
├── .env.example             # committed template (no secrets)
├── VERSION                  # semver baked into image + footer
├── src/frontend             # React SPA
└── src/backend              # Express API
    ├── config/              # env, postgres pool, paths
    ├── middleware/          # auth, IP guard, uploads, setup, errors
    ├── routes/              # HTTP
    └── services/            # domain: users, settings, security, setup
```

## Request flow

1. nginx serves `frontend/dist` and proxies `/api` with `X-Real-IP` / `X-Forwarded-Proto`.
2. Express `trust proxy = 1` so `req.ip` is the client behind that single proxy.
3. `ipGuard` runs on every path except `/health`, `/ready`, and `/api/setup` **while setup is unfinished**.
4. Global rate limit applies to `/api/*`. Login and setup have tighter limiters.
5. Session: cookie `da_session` (httpOnly, SameSite=Lax, Secure when HTTPS). JWT payload is `{ sub, tv }`. `tv` must match `users.token_version`.

## Data model

Tables are created on connect (`bootstrapSchema`):

| Table | Role |
|-------|------|
| `users` | Accounts, roles `admin` / `user`, flags, `token_version` |
| `app_settings` | Key/value: name, appearance JSON, integrations JSON, security JSON |
| `ip_rules` | Allow-list / block-list |
| `login_attempts` | Lockout window (purged after 7 days) |
| `security_events` | Admin history (purged after 90 days) |

Passwords are bcrypt hashes only. Integration secrets live in `app_settings.integrations` JSON and are **masked** in API responses (`passwordSet`, empty value).

## Frontend areas

| Path | Gate |
|------|------|
| `/`, `/login`, `/setup` | Public (setup redirects away when done) |
| `/account/*` | Authenticated user |
| `/admin/*` | `role === admin` |

Public settings (`GET /api/settings`) never include SMTP passwords, bot tokens, or API keys.

## Adding a feature (typical)

1. Table or settings key in `src/backend/services/`.
2. Route under `src/backend/routes/` with `requireAuth` or `requireAdmin`.
3. `src/frontend/src/services/api.js` client.
4. Page + menu slot in `AdminLayout.jsx` / `menuIcons.jsx`.
5. Copy in `i18n/translations.js` (en + ru).

Keep SQL parameterized (`$1`, `$2`). Do not concatenate user input into queries.
