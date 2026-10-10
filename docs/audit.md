# Architecture review

**Scope:** the full repository at `0.0.1` (initial commit) — backend, frontend, Docker/nginx, CI and documentation.
**Outcome:** the issues below were fixed in the same change set; remaining recommendations are listed at the end.

## Summary

The foundation was sound: a clean routes → services split, parameterized SQL, bcrypt, `token_version`-based JWT revocation, masked integration secrets, magic-byte upload checks and a locked-down `/uploads` CSP.

The weak spots were:

1. **Information architecture of the admin console** — twelve scattered menu entries nested up to three levels deep, with settings spread across *Project*, *Integrations* and *Security*.
2. **Missing safety rails** — an administrator could lock themselves out by IP or remove the last working administrator.
3. **A handful of real bugs**, two of them user-facing in production.
4. **Engineering hygiene** — no tests, no lock files, an end-of-life Node.js runtime.

---

## Findings

### Security

| ID | Finding | Resolution |
|----|---------|------------|
| S1 | **The setup wizard reopened during a database outage.** `getSetupStatus()` reported *needs setup* whenever PostgreSQL was unreachable, and `ipGuard` lets `/api/setup` through in that state. During an outage anyone could point the app at a database they control and create an administrator there. | Once setup completes the app writes `SETUP_LOCKED=true` to `.env`; the wizard stays closed regardless of database state. |
| S2 | **IP self-lockout.** Enabling the allow-list with no matching rule, deleting one's own allow rule, or block-listing one's own address cut the administrator off immediately. | The API simulates the change and rejects it with `409 SELF_LOCKOUT`. The UI shows the caller's IP with an *Allow my IP* shortcut. |
| S3 | **Losing the last administrator.** Deletion was guarded, but editing was not: an admin could demote, disable or block themselves or the last remaining admin. | Guards in `updateUser()` count only *active* administrators; self-modification of role and state is refused. |
| S4 | Role changes and blocking did not end the user's existing sessions. | These actions now bump `token_version`. |
| S5 | **Wrong client IP behind an extra proxy.** `trust proxy` was hard-coded to `1` and the bundled nginx overwrote `X-Forwarded-For`. Behind a host-level proxy every client had the proxy's IP, so one lockout blocked everybody and allow-lists were useless. | `TRUST_PROXY_HOPS` is configurable and nginx appends with `$proxy_add_x_forwarded_for`. |
| S6 | The API rate limit could be set to a single request, making the console unusable. | Values are clamped to 20–100 000 requests and a 1–1440 minute window. |

### Bugs

| ID | Finding | Resolution |
|----|---------|------------|
| B1 | **`GET /api/setup/status` sat behind a 20-requests-per-15-minutes limiter** while the SPA calls it on every page load. After about twenty refreshes the limiter returned `429`, which the frontend interpreted as *setup required* — sending users of a configured product into the wizard. | Only the wizard's write endpoints are throttled; a failed status check no longer implies *setup required*. |
| B2 | Saving the access policy without `blacklistEnabled` silently re-enabled the block-list. | Omitted flags keep their stored value. |
| B3 | Users and IP rules were deleted without confirmation; failures when adding rules or uploading avatars were unhandled promise rejections. | Confirmation dialogs and error handling everywhere. |
| B4 | `sessionDays`, the API rate limit, SMTP `secure` and AD `useTls` existed in the backend but had no UI. | All exposed in Settings. |
| B5 | *Test connection* used saved values, not what the admin had just typed. | Tests use the current form values. |
| B6 | `version.js` hard-coded `0.0.1`; the version injected by Vite was ignored, and `make sync-version` would have overwritten it. | The UI reads `VERSION` at build time; `sync-version` also updates lock files. |
| B7 | The *System* theme did not follow OS changes until reload. | Listens to `prefers-color-scheme`. |
| B8 | The rate-limit setting only applied on process start. | The cap is read live; the window applies after restart. |
| B9 | The collapsed sidebar misaligned icons and forgot the user's choice on reload. | Fixed sizing; breakpoint events no longer override the saved preference. |
| B10 | A single logo rendered black-on-black in dark mode. | Separate dark-theme logo with fallback, plus configurable logo height. |

### Performance

| ID | Finding | Resolution |
|----|---------|------------|
| P1 | `ipGuard` executed **two SQL queries on every HTTP request** (settings and IP rules). | 5-second in-process cache, invalidated on every write. |
| P2 | The whole SPA — admin console and Ant Design included — shipped as one bundle, even to anonymous visitors. | Route-level code splitting; React and Ant Design in separate long-lived vendor chunks. |
| P3 | `index.html` always downloaded five Google Font families while only one is used. | Only the selected typeface is loaded at runtime. |
| P4 | nginx did not cache hashed assets. | `/assets/*` are `immutable` for a year; `index.html` is `no-cache`. |
| P5 | `getSetupStatus()` ran ~15 DDL statements per call. | Short-circuits once setup is locked. |

### Engineering

| ID | Finding | Resolution |
|----|---------|------------|
| E1 | No `package-lock.json` — builds were not reproducible. | Lock files committed; Docker and CI use `npm ci`. |
| E2 | **Node.js 20 reached end-of-life in April 2026.** | Node.js 22 LTS. |
| E3 | No tests; CI only checked syntax. | `node:test` suite for IP policy and settings sanitizers, run in CI. |
| E4 | Static antd `message` (ignores theme context), deprecated `bordered` / `addonAfter`, React Router v7 warnings. | `App.useApp()`, current APIs, future flags enabled. |
| E5 | 4xx errors were logged with stack traces; malformed JSON produced `500`. | Only 5xx are logged; clear `400` responses for bad JSON and upload errors. |

---

## Admin console redesign

**Before** — five top-level sections, three levels of nesting, configuration scattered:

```
Overview · Project › (General, Appearance › (Theme, Typography, Icons))
         · Integrations › (Email, Telegram, WhatsApp, AD)
         · People › (Users) · Security › (Policy, IP lists, History)
```

**After** — four sidebar entries; everything configurable lives under one searchable hub:

```
Overview        dashboard with live data
Users           search, filters, user page
Activity        security events
Settings        hub with search
  ├─ Project        General (name, description, logos)
  ├─ Appearance     Color theme · Typography · Menu icons
  ├─ Security       Site access · Sign-in & sessions · IP filtering
  ├─ Integrations   Email · Telegram · WhatsApp · Active Directory (with on/off status)
  └─ System         Version, database, uptime, API limits
```

Design principles applied:

- **One pattern for every screen** — header with group and icon, card sections, *label left / control right* rows that stack on mobile.
- **Save only when needed** — a floating bar appears when a form is dirty, with *Discard* and *Save*.
- **Find anything** — a hub search and a ⌘K / Ctrl+K palette across pages, settings and actions.
- **Preview before applying** — appearance changes render live across the UI.
- **Structure as data** — `admin/navigation.js` drives the sidebar, hub, side-nav, palette and icon editor, so forks extend the console without touching layout code.
- **No broken bookmarks** — old URLs redirect, previously chosen menu icons carry over.

---

## Recommended next steps

In order of value:

1. **Encrypt integration secrets at rest** (currently plaintext in `app_settings`): AES-256-GCM with an `APP_ENCRYPTION_KEY`, plus a one-off migration of existing values.
2. **Versioned migrations** instead of `CREATE … IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` inside services — a `schema_migrations` table and `migrations/NNN_*.sql`. Do this before the first domain table.
3. **Admin audit trail** — who changed which setting or user, surfaced in *Activity*.
4. **Request validation with schemas** (zod) at the route boundary.
5. **Type safety** — TypeScript, or JSDoc with `checkJs`, plus ESLint and Prettier in CI.
6. **End-to-end tests** (Playwright) for setup → sign-in → settings → lockout guards.
7. **Structured logging** (pino) with request IDs.
8. **TOTP 2FA and passkeys** — one-time codes and magic links are done (see [access-control.md](access-control.md)); a second factor for password sign-in is the next step.
9. **Server-side pagination** for users (the current list is fine up to a few thousand rows).
10. **Major upgrades** — Ant Design 6 and React 19 as a separate change.
