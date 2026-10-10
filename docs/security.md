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
- Cookie: httpOnly, SameSite=Lax, Secure when `FRONTEND_URL` is `https://`, `X-Forwarded-Proto` is https, or `COOKIE_SECURE=true`.

**Authorization** (full model: [access-control.md](access-control.md))

- Every admin route requires `console.access` plus its own permission; settings patches are checked per key.
- You can only grant roles and groups whose permissions you hold; users with more access than you are read-only to you.
- The last active super administrator cannot be removed by any path — changes run in a transaction and roll back with `409 LAST_SUPERADMIN`.
- Administrators cannot demote, disable, block or delete their own account.
- Role change, disabling, blocking and password reset bump `token_version` — the user is signed out everywhere.
- Users can sign out all other devices; admins can revoke any user's sessions.

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
7. **Rotate** DB password and JWT if they ever appeared in chat, tickets, or screenshots.
8. **Backups** of Postgres + `data/uploads/`.
9. **Proxy count**: set `TRUST_PROXY_HOPS` to the number of proxies in front of Express (bundled nginx + any outer proxy). Too low and every client shares the proxy IP (lockouts hit everyone); too high and clients can spoof `X-Forwarded-For`.
10. Run **`make env`** on every new deploy; never copy a production `.env` into git.

## Known limits (accept or extend)

| Topic | Behaviour |
|-------|-----------|
| CSRF | Mitigated by SameSite=Lax + no cookie auth on cross-site POST from typical attackers. Do not add state-changing GET. |
| Helmet CSP | Disabled on Express (JSON API). nginx CSP covers the SPA. |
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
