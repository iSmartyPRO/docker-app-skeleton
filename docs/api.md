# HTTP API

Base path: `/api`. Session: cookie `da_session` (`credentials: include`). JSON bodies.

Unless noted, errors look like `{ "success": false, "error": "…" }`.

## Public

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/health` | Liveness, `{ status, version, timestamp }` |
| `GET` | `/ready` | `503` if Postgres is down |
| `GET` | `/api/status` | API + DB flag + app name |
| `GET` | `/api/settings` | Public settings (no secrets) |

## Setup (until first admin exists)

Writes return `403` afterwards, and once setup has finished `SETUP_LOCKED=true` is written to `.env` so the wizard never reopens (not even while the database is down). If `SETUP_TOKEN` is set, send header `X-Setup-Token`.

| Method | Path | Body |
|--------|------|------|
| `GET` | `/api/setup/status` | Without token: `needsSetup`, `step`, `setupTokenRequired` only |
| `POST` | `/api/setup/test-db` | `{ host, port, database, user, password }` |
| `POST` | `/api/setup/database` | same — persists `.env` |
| `POST` | `/api/setup/complete` | `{ username, email, password, passwordConfirm }` |
| `POST` | `/api/setup/access` | `{ accessMode: "open" \| "closed" }` |

Limiter: 20 requests / 15 minutes / IP on the `POST` endpoints. `GET /status` is not throttled — the SPA calls it on page load.

## Auth

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/auth/login` | `{ username, password }` → sets cookie. 20 / 15 min |
| `POST` | `/api/auth/logout` | Clears cookie |
| `GET` | `/api/auth/me` | Current user |

## Account (`requireAuth`)

| Method | Path |
|--------|------|
| `GET` | `/api/account/profile` |
| `PUT` | `/api/account/profile` | `{ displayName, email, locale, theme }` |
| `PUT` | `/api/account/password` | `{ currentPassword, password }` |
| `POST` | `/api/account/sessions/revoke` | Signs out every other device |
| `POST` | `/api/account/avatar` | `multipart/form-data` field `avatar` |

## Admin (`requireAdmin`)

| Method | Path |
|--------|------|
| `GET` | `/api/admin/overview` | Dashboard: user stats, recent sign-ins, 24h security summary, integrations |
| `GET` | `/api/admin/system` | Version, Node, uptime, database info, rate limit |
| `GET` / `PUT` | `/api/admin/settings` |
| `POST` / `DELETE` | `/api/admin/settings/logo` |
| `POST` | `/api/admin/integrations/:kind/test` | `email`, `telegram`, `whatsapp`, `ad` |
| `GET` / `POST` | `/api/admin/users` |
| `GET` / `PUT` / `DELETE` | `/api/admin/users/:id` |
| `POST` | `/api/admin/users/:id/revoke-sessions` |
| `POST` | `/api/admin/users/:id/avatar` |
| `GET` | `/api/admin/security/events` | query `kind`, `limit` |
| `GET` / `POST` | `/api/admin/security/ip-rules` | `{ ip, listType, reason }` |
| `DELETE` | `/api/admin/security/ip-rules/:id` |

`listType` is `whitelist` or `blacklist`. `ip` is IPv4, IPv6, or IPv4 CIDR (`0–32`). `GET` also returns `yourIp`.

Safety rails (all return `400`/`409` with a readable `error`):

- Changes to `security`, new block rules and rule deletions are rejected with `409 SELF_LOCKOUT` if they would deny the acting admin's own IP.
- An admin cannot demote, disable, block or delete their own account, and the last active administrator cannot be removed by any route.
- Role changes, disabling, blocking and password resets bump `token_version`, signing the user out everywhere.

## Static files

`GET /uploads/avatars/…` and `GET /uploads/logos/…` — nosniff, CSP none, no directory listing.
