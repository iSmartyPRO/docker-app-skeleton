# Security

This document is the go-live guide for the skeleton. Report vulnerabilities per [SECURITY.md](../SECURITY.md).

## Threat model (short)

| Asset | Risk if exposed |
|-------|-----------------|
| `JWT_SECRET` | Forge sessions |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | Read/write all app data |
| Integration tokens in `app_settings` | Mail/Telegram/WhatsApp/AD takeover |
| Unfinished `/setup` | Stranger becomes first admin |
| Upload directory | Stored XSS if SVG/HTML were served executable |
| Session cookie | Account takeover if XSS can read it — cookie is httpOnly, so XSS must call APIs as the user |

Assumptions:

- The number of reverse proxies in front of Express matches `TRUST_PROXY_HOPS` (the bundled nginx is one).
- Postgres is not on the public internet.
- You finish setup before advertising the URL, or you set `SETUP_TOKEN`.

## Controls already in the code

**Authentication**

- Passwords: bcrypt cost 12, dummy hash on unknown users (harder user enumeration by timing).
- Failed logins: same error text for bad password, disabled, and blocked accounts at the HTTP layer; events still distinguish kinds for admins.
- Lockout: separate streaks per **username** and per **IP**.
- Login limiter: 20 / 15 min / IP, plus global `/api` limiter.
- Password change increments `token_version` (other sessions die).
- Cookie: httpOnly, SameSite=Lax, Secure when `FRONTEND_URL` is `https://`, `X-Forwarded-Proto` is https, or `COOKIE_SECURE=true`. The bundled nginx passes on an outer proxy's `X-Forwarded-Proto` (http/https only) and otherwise sends its own scheme; the app trusts the header from loopback only.
- Changing one's password in the cabinet: wrong current passwords count towards the same per-username lockout as sign-in (`429 LOCKED`).

**Authorization** (full model: [access-control.md](access-control.md))

- Every admin route requires `console.access` plus its own permission; settings patches are checked per key.
- You can only grant roles and groups whose permissions you hold; users with more access than you are read-only to you.
- The last active super administrator cannot be removed by any path — changes run in a transaction and roll back with `409 LAST_SUPERADMIN`.
- Administrators cannot demote, disable, block or delete their own account.
- Role change, disabling, blocking and password reset bump `token_version` — the user is signed out everywhere.
- Sessions: the cookie is a JWT whose `sid` claim names a row in `user_sessions` (device user agent, first and last IP, `X-Client-Mode` pwa/browser, sign-in method, `impersonated_by`, expiry). A cookie only works while its row exists, is not revoked and has not expired; last activity is written at most once a minute per session. Rows ended or expired more than 30 days ago are purged by the `sessions:purge` job; a revoked `legacy` row is kept until its token expires (it is what keeps that token out).
- Users see their sessions in Account → Security (`GET /api/account/sessions`) and end one (`DELETE /api/account/sessions/:id`) or all others (`POST /api/account/sessions/revoke-others`, which also bumps `token_version` and re-issues the current cookie with the same `sid`). Administrators with `users.manage` see and end a user's sessions (`GET`/`DELETE /api/admin/users/:id/sessions[/:sid]`, `POST /api/admin/users/:id/revoke-sessions`). None of this is available while signed in as another user or to API tokens.
- Sign out ends the current row. "Sign in as" sessions are listed for the person with the administrator's name and end on "Return to my account"; they also end with the administrator's own sessions and stop working once the administrator is blocked, disabled or no longer a superadministrator (see [access-control.md](access-control.md#sign-in-as-a-user)).
- Cookies issued before sessions existed (no `sid`) keep working until they expire; on their first request they get a row (method `legacy`, id derived from the token hash) so they appear in the list and can be ended. The older `revoked_sessions` list is still honoured for them.

**Sign-in methods**

- Active Directory: service bind + escaped search + user bind; empty passwords are rejected (no anonymous bind).
- Telegram Login: HMAC-SHA256 signature with the bot token, payload younger than 24 h; redirect mode, so no `unsafe-eval` in the CSP.
- One-time codes: 6 digits, 5 minutes, single use, 5 attempts, HMAC-hashed, resend limits, identical responses for known and unknown accounts.
- Magic links: 256-bit tokens, SHA-256 hashed, 15 minutes, single use, delivered in the URL fragment.
- Break-glass: super administrators can always use their password.

**Setup**

- Write routes return `403` after an admin exists.
- Once setup finishes, `SETUP_LOCKED=true` is written to `.env`; the wizard stays closed even if PostgreSQL is unreachable (otherwise an outage would let anyone repoint the database).
- Optional `SETUP_TOKEN` (timing-safe compare). Without a valid token, status does not leak DB host/user.
- Setup limiter on write endpoints: 20 / 15 min. `GET /api/setup/status` is not throttled because the SPA reads it on every page load.

**Network**

- CORS origin is `FRONTEND_URL` with credentials (not `*`).
- IP allow/block lists; CIDR bits must be 0–32.
- Localhost is always allowed (so you cannot lock yourself out from the host). IPv4 CIDR only for ranges; IPv6 exact match.
- Security changes, new block rules and rule deletions that would deny the acting admin's own IP are rejected with `409 SELF_LOCKOUT`.
- Settings and IP rules are cached for 5 s, so per-request checks do not depend on a database round-trip.

**Uploads**

- Random filenames, size caps (1 MB avatar, 2 MB logo).
- Magic-byte check; SVG logos reject `<script`, `on*=`, `javascript:`.
- `/uploads/` CSP `default-src 'none'` and `X-Content-Type-Options: nosniff`.

**Data**

- Public settings hide integration secrets.
- Admin settings return `*Set` flags instead of secret values.
- SQL is parameterized.
- JSON body limit 1 MB.

**HTTP**

- Helmet (API). Frontend CSP is in `nginx.conf`.
- `server_tokens off`, frame and referrer policies.

## Hardening you must do in production

1. **TLS** in front of the container. Set `FRONTEND_URL=https://your.domain`.
2. **`JWT_SECRET`** ≥ 32 random bytes. Production **exits** if it is empty.
3. **`SETUP_TOKEN`** if `/setup` might be reachable before you finish the wizard. Remove or rotate it after go-live (writes already 403).
4. **Do not publish Postgres** on `0.0.0.0:5432` without a firewall.
5. **Closed access** unless the landing must be public.
6. **Allow-list** if only office IPs should reach the app. Add your IPv4/CIDR first (*Allow my IP* in Settings → IP filtering); the API refuses to enable it otherwise.
7. **Rotate** DB password and JWT if they ever appeared in chat, tickets, or screenshots — keep the old JWT secret for decryption as described in [Rotating secrets](#rotating-secrets), or stored tokens and webhook secrets stop opening.
8. **Backups** of Postgres + `data/uploads/`.
9. **Proxy count**: set `TRUST_PROXY_HOPS` to the number of proxies in front of Express (bundled nginx + any outer proxy). Too low and every client shares the proxy IP (lockouts hit everyone); too high and clients can spoof `X-Forwarded-For`.
10. Run **`make env`** on every new deploy; never copy a production `.env` into git.

## Known limits (accept or extend)

| Topic | Behaviour |
|-------|-----------|
| CSRF | Mitigated by SameSite=Lax + no cookie auth on cross-site POST from typical attackers. Do not add state-changing GET. |
| Helmet CSP | Disabled on Express (JSON API). nginx CSP covers the SPA. |
| Public links that accept changes | Files links can allow anonymous upload / rename / replace / delete ([files.md](files.md#link-permissions)). Writes run as the link's author inside the link's subtree only, need a visitor token in `X-Link-Token` (bound to the link version: password change or revoke ends every session), pass the Origin check and dedicated rate limits, and keep deletes and replaced versions in the owner's trash. Admins can switch such links off or require a password for them. A visitor's upload into a folder with a same-named file gets `Name (2)`, which tells an upload-only visitor that the name exists. |
| SVG logos | Best-effort sanitization, not a full SVG sanitizer. Prefer PNG/WebP in hostile-admin scenarios. |
| IPv6 CIDR | Not implemented. |
| Username lockout | An attacker can lock a known username by failing logins (availability, not takeover). |
| Wizard window | Until an admin exists, setup is the most sensitive surface. |
| Container user | Process runs as root inside the image to bind nginx :80. Put Docker/network policy around it. |
| Secrets at rest | Integration secrets are stored in plaintext in `app_settings`. Restrict database access; encryption is on the roadmap. |
| Telegram Login | Requires `/setdomain` in @BotFather; users must link Telegram before signing in unless auto-provisioning is on. |
| Sign-in codes | Delivered by third parties (SMTP provider, Wazzup, Telegram). Their compromise exposes codes — keep codes short-lived (5 min) as shipped. |

## Password and username policy

- Password: 10–200 characters (length only — add complexity in a fork if policy requires it).
- Username: `^[a-zA-Z0-9._-]{3,32}$`

## Secrets handling

| Secret | Store | API |
|--------|-------|-----|
| `JWT_SECRET` | `.env` | never |
| Postgres password | `.env` (wizard quotes special characters) | never |
| SMTP / Telegram / WhatsApp / AD | `app_settings` JSON | masked |
| Session JWT | httpOnly cookie | never in JSON |

`.env` is mounted writable so the wizard can persist DB settings. Restrict who can `docker exec` or read the host file.

### Rotating secrets

Some credentials are stored **encrypted** (AES-256-GCM) because the portal must use them later: Google refresh tokens (Calendar, Gmail sender), webhook signing secrets, the Web Push private key, domain passwords kept for file servers, company secrets. The key is `ENCRYPTION_KEY`, or — when it is not set — derived from `JWT_SECRET`. So rotating `JWT_SECRET` on an install without `ENCRYPTION_KEY` also changes the encryption key.

Rotate without losing anything:

| You change | Also set (comma-separated lists are fine) |
|------------|-------------------------------------------|
| `JWT_SECRET`, no `ENCRYPTION_KEY` | `JWT_SECRET_PREVIOUS=<old JWT_SECRET>` |
| `ENCRYPTION_KEY` | `ENCRYPTION_KEY_PREVIOUS=<old ENCRYPTION_KEY>` |
| Introduce `ENCRYPTION_KEY` for the first time | nothing: values sealed with the JWT-derived key still open while `JWT_SECRET` is unchanged |

New values are always sealed with the current key; old ones are opened with any listed key and re-sealed with the current one when read (Google tokens, webhook secrets, the push key). Keep the `*_PREVIOUS` entries for a while (a few weeks covers people who rarely use Calendar), then remove them.

Rotating `JWT_SECRET` signs everyone out (sessions are JWTs) — that is the point of rotating it.

If a value can be opened with **no** known key, nothing is deleted or treated as revoked:

- a **security event** *Stored secret cannot be decrypted* appears in *Activity* (and in Mattermost, as a danger event), at most once an hour per secret;
- **Google** Calendar / Gmail calls fail with `GOOGLE_KEY`; the connection and the Gmail sender stay configured — restore the old key, or reconnect;
- **webhooks** pause with *secret unreadable* (no failure counted, deliveries wait); *New secret* resumes them;
- **Web Push**: new keys are generated and old device subscriptions dropped; devices that already allowed notifications re-subscribe on their next visit without asking.
