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

Before pushing:

```bash
make test        # backend unit tests + frontend production build
```

How to add screens, endpoints, settings and integrations: [docs/extending.md](docs/extending.md).

## Commit messages and versions

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): …` for new features (minor), `fix(scope): …`, `perf`, `refactor`, `docs`, `chore` for the rest (patch), and `!` or a `BREAKING CHANGE:` footer for incompatible changes (major). `make release` / `make deploy` classify the commits since the last tag and bump the version everywhere — see [docs/operations.md](docs/operations.md#version-and-releases).

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
- New UI uses the shared kit (`PageHeader`, `SettingsSection`, `SaveBar`) and design tokens — no ad-hoc colors.
- Every user-facing string goes into both `en` and `ru` dictionaries.
- Add a line to [CHANGELOG.md](CHANGELOG.md) under *Unreleased*.
- Commit messages: Conventional Commits, imperative mood, ≤ 72-character subject (`feat(settings): add maintenance mode`).
