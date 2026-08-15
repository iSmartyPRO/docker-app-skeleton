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

- One reverse proxy in front (`trust proxy = 1`).
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

**Authorization**

- `requireAuth` / `requireAdmin`.
- Last admin cannot be deleted.
- You cannot delete your own user.

**Setup**

- Write routes no-op with `403` after an admin exists.
- Optional `SETUP_TOKEN` (timing-safe compare). Without a valid token, status does not leak DB host/user.
- Setup limiter: 20 / 15 min.

**Network**

- CORS origin is `FRONTEND_URL` with credentials (not `*`).
- IP allow/block lists; CIDR bits must be 0–32.
- Localhost is always allowed (so you cannot lock yourself out from the host). IPv4 CIDR only for ranges; IPv6 exact match.

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
6. **Allow-list** (`whitelistEnabled`) if only office IPs should reach the app. Add your IPv4/CIDR **before** enabling it, from a session that still has access.
7. **Rotate** DB password and JWT if they ever appeared in chat, tickets, or screenshots.
8. **Backups** of Postgres + `data/uploads/`.
9. **Proxy count**: if you add another proxy, `trust proxy` must still match the number of hops you trust, or clients can spoof `X-Forwarded-For`.
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
| AD “test” | TCP connect only, not a full LDAP bind. |

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
