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
2. Express `trust proxy = TRUST_PROXY_HOPS` (default `1`, the bundled nginx). Add one per extra proxy in front, otherwise `req.ip` is the proxy.
3. `ipGuard` runs on every path except `/health`, `/ready`, and `/api/setup` **while setup is unfinished**.
4. Global rate limit applies to `/api/*` (cap read live from settings). Login and setup writes have tighter limiters.
5. Session: cookie `da_session` (httpOnly, SameSite=Lax, Secure when HTTPS). JWT payload is `{ sub, tv }`. `tv` must match `users.token_version`.
6. Settings and IP rules are cached in-process for 5 s and invalidated on write, so the per-request guards do not hit PostgreSQL every time.

## Data model

Tables are created on connect (`bootstrapSchema`):

| Table | Role |
|-------|------|
| `users` | Accounts, flags, `token_version`, sign-in identifiers (phone, Instagram, Telegram, `auth_source`, `external_id`) |
| `app_roles` / `app_groups` | Roles (permission arrays) and groups; one group is the default |
| `user_roles` / `group_roles` / `user_group_members` | Direct roles, roles granted by groups, memberships |
| `auth_codes` | Hashed one-time codes and magic-link tokens |
| `app_settings` | Key/value: name, appearance JSON, integrations JSON, security JSON |
| `ip_rules` | Allow-list / block-list |
| `login_attempts` | Lockout window (purged after 7 days) |
| `security_events` | Admin history (purged after 90 days) |

Passwords are bcrypt hashes only. Integration secrets live in `app_settings.integrations` JSON and are **masked** in API responses (`passwordSet`, empty value).

## Frontend areas

| Path | Gate |
|------|------|
| `/`, `/login`, `/setup` | Public (setup redirects away when done) |
| `/account/*` | Authenticated user — profile, appearance, security |
| `/admin` | Overview dashboard |
| `/admin/users`, `/admin/users/:id` | User management |
| `/admin/activity` | Security event log |
| `/admin/settings` | Settings hub (search) → `/admin/settings/<id>` screens |

Old URLs (`/admin/general`, `/admin/security/ip`, …) redirect to their new homes.

Public settings (`GET /api/settings`) never include SMTP passwords, bot tokens, or API keys.

### Admin structure is data

`src/frontend/src/admin/navigation.js` is the single source of truth. The sidebar,
the settings hub, the settings side-nav, the ⌘K command palette and the menu-icon
editor are all generated from it:

```
ADMIN_PAGES        → sidebar (Overview, Users, Activity, Settings)
SETTINGS_GROUPS    → Project · Appearance · Security · Integrations · System
  └─ items         → /admin/settings/<id>, icon slot, search keywords
```

### UI kit

| Piece | Use |
|-------|-----|
| `components/ui/PageHeader` | Title, lead, eyebrow/back link, actions |
| `components/ui/SettingsSection` + `SettingRow` | Card with "label left, control right" rows |
| `components/ui/SaveBar` | Floating bar shown only while a form is dirty |
| `hooks/useSettingsForm` | antd form + dirty tracking + save/reset + toasts |
| `hooks/useAdminSettings` | Admin settings with `save(patch)` that refreshes the whole UI |
| `components/ui/LoadState` | Spinner / retryable error / content |
| `components/CommandPalette` | ⌘K / Ctrl+K launcher |

## Adding a feature (typical)

1. Table or settings key in `src/backend/services/`.
2. Route under `src/backend/routes/` with `requireAuth` or `requirePermission(...)`.
3. `src/frontend/src/services/api.js` client.
4. **A settings screen:** add an item to a group in `admin/navigation.js`, register the
   component in `admin/settingsPages.js`, add `settings.<id>.title/.desc` to i18n.
   Build it from `SettingsPageHeader` + `SettingsSection` + `useSettingsForm` + `SaveBar`.
   **A top-level page:** add it to `ADMIN_PAGES` and a `<Route>` in `App.jsx`.
5. Copy in `locales/en/<namespace>.js` and `locales/ru/<namespace>.js` ([i18n.md](i18n.md)). `t('key', { name })` interpolates `{name}`.
6. Backend unit tests live in `src/backend/test/*.test.js` (`npm test`).

Keep SQL parameterized (`$1`, `$2`). Do not concatenate user input into queries.
