# Publish to GitHub

The skeleton is ready for a public repository if you follow this checklist. **Secrets must never land on GitHub.**

## 1. Confirm ignore rules

`.gitignore` already excludes `.env`, `data/uploads/`, keys, and logs. Before the first commit:

```bash
git init
git add -A
git status
```

`git status` must **not** list `.env`, `*.pem`, or files under `data/uploads/`. If `.env` appears, stop and fix ignore rules.

Your local `.env` contains `JWT_SECRET` and the database password. Those stay on the server only.

## 2. Rotate anything that was shared

If this copy already ran in production or a password appeared in chat:

- generate a new `JWT_SECRET` (`make env` only fills **empty** secrets — set a new value by hand)
- change `POSTGRES_PASSWORD` in Postgres and in `.env`
- change the first admin password in the cabinet

## 3. First commit

```bash
git add -A
git commit -m "Initial commit: application skeleton"
```

Create an empty GitHub repo (no README), then:

```bash
git remote add origin git@github.com:ORG/docker-app-skeleton.git
git branch -M main
git push -u origin main
```

GitHub Actions ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) installs with `npm ci`, syntax-checks and unit-tests the backend, and builds the frontend on every push and pull request.

## 4. Repository settings

- Enable **Private vulnerability reporting** (see [SECURITY.md](../SECURITY.md)).
- Description: “Production-ready product skeleton — React, Ant Design, Express, PostgreSQL, admin console, first-run wizard.”
- Topics: `react`, `express`, `postgresql`, `docker`, `admin-dashboard`, `boilerplate`, `starter-kit`, `ant-design`.
- Protect `main`: require the CI checks to pass before merging.
- Issue and pull-request templates are in `.github/`.
- Do not store `.env` in GitHub Actions secrets unless you run deploy from CI — and never print them in logs.

## 5. Forks of this skeleton

Each product should be its **own** repository (or a long-lived branch), not a pile of unrelated apps in one clone. Merge security fixes from upstream as described in [operations.md](operations.md).
