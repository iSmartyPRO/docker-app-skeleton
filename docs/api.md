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

Writes return `403` afterwards. If `SETUP_TOKEN` is set, send header `X-Setup-Token`.

| Method | Path | Body |
|--------|------|------|
| `GET` | `/api/setup/status` | Without token: `needsSetup`, `step`, `setupTokenRequired` only |
| `POST` | `/api/setup/test-db` | `{ host, port, database, user, password }` |
| `POST` | `/api/setup/database` | same — persists `.env` |
| `POST` | `/api/setup/complete` | `{ username, email, password, passwordConfirm }` |
| `POST` | `/api/setup/access` | `{ accessMode: "open" \| "closed" }` |

Limiter: 20 requests / 15 minutes / IP.

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
| `POST` | `/api/account/avatar` | `multipart/form-data` field `avatar` |

## Admin (`requireAdmin`)

| Method | Path |
|--------|------|
| `GET` / `PUT` | `/api/admin/settings` |
| `POST` / `DELETE` | `/api/admin/settings/logo` |
| `POST` | `/api/admin/integrations/:kind/test` | `email`, `telegram`, `whatsapp`, `ad` |
| `GET` / `POST` | `/api/admin/users` |
| `GET` / `PUT` / `DELETE` | `/api/admin/users/:id` |
| `POST` | `/api/admin/users/:id/avatar` |
| `GET` | `/api/admin/security/events` | query `kind`, `limit` |
| `GET` / `POST` | `/api/admin/security/ip-rules` | `{ ip, listType, reason }` |
| `DELETE` | `/api/admin/security/ip-rules/:id` |

`listType` is `whitelist` or `blacklist`. `ip` is IPv4, IPv6, or IPv4 CIDR (`0–32`).

## Static files

`GET /uploads/avatars/…` and `GET /uploads/logos/…` — nosniff, CSP none, no directory listing.
