# Security policy

## Reporting a vulnerability

Do **not** open a public GitHub issue for a security flaw.

Email the maintainers or use GitHub **Private vulnerability reporting** on the repository. Include:

- affected version (`VERSION` file or `/health`)
- a short reproduction
- impact (auth bypass, data leak, RCE, etc.)

You should receive an acknowledgement within a few days. Please give us time to ship a fix before any public disclosure.

## Supported versions

This repository is a **product skeleton**. Security fixes land on the default branch. Forks must merge those fixes themselves.

| Stream | Support |
|--------|---------|
| Latest default branch | Active |
| Tagged releases | Best effort |
| Unmodified forks | Your responsibility |

## Before you expose this app to the internet

Complete the checklist in [docs/security.md](docs/security.md). The minimum:

1. `JWT_SECRET` is a long random value (`make env` generates one).
2. `FRONTEND_URL` is the public `https://` origin (session cookies become `Secure`).
3. PostgreSQL is not published on `0.0.0.0`.
4. `.env` is never committed.
5. First-run wizard is finished, then `/api/setup/*` write routes return `403`.
6. Prefer `SETUP_TOKEN` so nobody else can complete setup if the port is open too early.
7. Access mode **Closed** unless you intentionally want a public landing.
8. Change the default admin password if it was used in a screenshot or shared chat.

## Built-in controls

The skeleton ships with:

- httpOnly `SameSite=Lax` session cookie (JWT)
- bcrypt password hashes (cost 12)
- token version bump on password, role and status changes; *sign out everywhere* for users and admins
- setup wizard permanently locked after completion (`SETUP_LOCKED`)
- self-lockout and last-administrator guards
- Helmet, CORS allowlist, request size limits, API rate limits
- dedicated login rate limit + lockout after failed attempts
- IP allow-list / block-list (IPv4 CIDR)
- upload magic-byte checks (avatars/logos)
- nginx security headers and a tight CSP on `/uploads/`
- secrets stripped from public `/api/settings` and masked in admin payloads
