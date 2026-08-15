# Contributing

This repository is a **starter skeleton** for new products. Contributions that keep the base secure, small, and easy to fork are welcome.

## Development

```bash
make env
make dev
```

- UI: http://127.0.0.1:3020
- API: http://127.0.0.1:3021

Do not commit `.env`, uploads, or real credentials. Use `.env.example` only.

## What to change vs. what to keep

| Keep as-is | Replace in a product fork |
|------------|---------------------------|
| Auth, sessions, IP lists, setup wizard | Branding, landing copy, color templates |
| `src/backend/middleware/*` | Domain pages and APIs for the real product |
| Cookie + CSRF assumptions (`SameSite=Lax`) | Footer link, `VERSION`, `DOCKER_NAME` |

See [docs/adapt.md](docs/adapt.md).

## Pull requests

- Prefer small, reviewable PRs.
- Security-sensitive changes (auth, uploads, setup, nginx) need a short threat note in the PR body.
- Match existing code style: ESM, parameterized SQL, no secrets in logs.
