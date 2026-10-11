# HTTP API

Base path: `/api`. Session: cookie `da_session` (`credentials: include`). JSON bodies.

**Integrations** use API tokens instead of the session: `Authorization: Bearer pat_…` on `/api/v1/<path>` (the same endpoints). Tokens, access templates, webhooks and the request log are described in [public-api.md](public-api.md); the full, always-current reference is the developer portal at `/developers` and `/api/developer/openapi.json`.

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
| `POST` | `/api/auth/login` | `{ username, password }` → local password, then Active Directory. 20 / 15 min |
| `POST` | `/api/auth/telegram` | Telegram Login Widget fields (`id`, `auth_date`, `hash`, …) |
| `POST` | `/api/auth/code/request` | `{ channel: "whatsapp" \| "email" \| "telegram" \| "mattermost", identifier, mode: "code" \| "link" }` → always `{ success: true }`. 10 / 15 min |
| `POST` | `/api/auth/code/verify` | `{ channel, identifier, code }` |
| `POST` | `/api/auth/magic` | `{ token }` from `/auth/magic#token` |
| `POST` | `/api/auth/logout` | Clears cookie |
| `GET` | `/api/auth/me` | Current user |

## Account (`requireAuth`)

| Method | Path |
|--------|------|
| `GET` | `/api/account/profile` |
| `PUT` | `/api/account/profile` | `{ displayName, email, locale, theme }` |
| `PUT` | `/api/account/password` | `{ currentPassword, password }` |
| `POST` | `/api/account/sessions/revoke` | Signs out every other device |
| `POST` / `DELETE` | `/api/account/telegram` | Link (widget payload) / unlink Telegram |
| `POST` | `/api/account/avatar` | `multipart/form-data` field `avatar` |

Sign-in failures return `401` with a machine `code` (`INVALID_CREDENTIALS`, `CODE_INVALID`, `LINK_INVALID`, `TELEGRAM_NOT_LINKED`, `TELEGRAM_INVALID`, `METHOD_DISABLED`); lockouts and rate limits return `429` with `LOCKED` / `RATE_LIMITED`. Disabled and blocked accounts get the same answer as a wrong password.

## Admin (`console.access` + per-route permission)

Every route requires `console.access`; the permission in brackets is checked in addition. See [access-control.md](access-control.md).

| Method | Path |
|--------|------|
| `GET` | `/api/admin/permissions` | Permission catalog |
| `GET` / `POST` | `/api/admin/roles` | [`users.view`] / [`roles.manage`] `{ name, description, permissions[] }` |
| `PUT` / `DELETE` | `/api/admin/roles/:id` | [`roles.manage`] |
| `GET` / `POST` | `/api/admin/groups` | [`users.view`] / [`groups.manage`] `{ name, description, isDefault, roleIds[], memberIds[] }` |
| `PUT` / `DELETE` | `/api/admin/groups/:id` | [`groups.manage`] |
| `DELETE` | `/api/admin/users/:id/telegram` | [`users.manage`] unlink Telegram |
| `GET` | `/api/admin/overview` | Dashboard: user stats, recent sign-ins, 24h security summary, integrations |
| `GET` | `/api/admin/system` | Version, Node, uptime, database info, rate limit |
| `GET` / `PUT` | `/api/admin/settings` |
| `POST` / `DELETE` | `/api/admin/settings/logo` |
| `POST` | `/api/admin/integrations/:kind/test` | `email`, `telegram`, `whatsapp`, `wazzup`, `mattermost`, `activeDirectory`. Body: unsaved form values (blank secrets fall back to stored ones). `wazzup` also returns `channels` |
| `POST` | `/api/admin/integrations/wazzup/channels` | `{ apiKey? }` → account channels `{ id, transport, plainId, name, state }` |
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

## Modules

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/apps` | Enabled modules (`requireAuth`) |
| `*` | `/api/app/<id>/…` | Module API: `requireAuth` + module enabled, otherwise `404 MODULE_DISABLED` |
| `*` | `/api/s/…` | Knowledge Base public links (anonymous, token per link) |
| `*` | `/api/l/…` | Files public links (anonymous, token per link) |
| `GET` | `/api/res` | Online resources board for anyone (public tiles for guests) |
| `*` | `/api/d/…` | Drive public links (anonymous or employees, token per link) |

Full references: [Counterparties](companies.md#api), [Online resources](resources.md#api), [Drive](drive.md#api), [Files](files.md#api), [Knowledge Base](knowledge-base.md#api), [Tasks](tasks.md#api-apiapptasks-signed-in-users), [Calendar](calendar.md#api-apiappcalendar-signed-in-users).

## Notifications, push, PWA

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/notifications` | Inbox (`requireAuth`); `/unread`, `POST /read` |
| `GET` / `PUT` | `/api/account/notifications` | Channel preferences |
| `GET` | `/api/pwa/manifest.webmanifest` | Public, built from settings |
| `GET` | `/api/pwa/vapid` | VAPID public key (`requireAuth`) |
| `GET` / `POST` / `DELETE` | `/api/pwa/push` | Device subscriptions; `POST /push/test` |

## Google

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/auth/google/start?purpose=signin\|connect\|gmail&returnTo=` | Redirects to Google (connect/gmail need a session; gmail needs `settings.integrations`) |
| `GET` | `/api/auth/google/callback` | OAuth callback for every flow |
| `GET` / `DELETE` | `/api/account/google` | Connection status / disconnect |
| `GET` / `PUT` | `/api/account/google/calendars` | Google calendars and the selection shown in Calendar |
| `GET` | `/api/admin/integrations/google/info` | Redirect URI and origin for Google Cloud Console |
| `DELETE` | `/api/admin/integrations/google/gmail` | Disconnect the Gmail sender |

## Static files

`GET /uploads/avatars/…` and `GET /uploads/logos/…` — nosniff, CSP none, no directory listing.
