# Deployment notes

The product documentation (`docs/*.md`), code, defaults, demo data and tests describe **no particular
company**: examples use neutral names (`example.com`, «ООО «Пример»», «Объект «Северный квартал»»), and the
brand (name, logo, domain) is set only in the portal settings (spec `docs/specs/platform-2.0.ru.md` §10).

What is specific to one installation does **not** belong in the product:

- host names and public addresses (portal, Collabora, mail, the domain controller);
- container names, compose files and volumes of neighbouring stacks (e.g. where Collabora or Postgres run);
- Active Directory layout of a customer (OU names, group naming, project codes), file server paths;
- secrets of any kind, backup locations, maintenance windows, contacts.

Keep such notes **outside the repository** (the operator's wiki, a private ops repository, the server
itself), or — if a team insists on keeping them next to the code — as `docs/deployments/<name>.md` in a
private fork that is never merged back. This folder only holds this README in the product.

A deployment note usually answers:

| Topic | Example of what to write down |
|---|---|
| Addresses | `FRONTEND_URL`, `PUBLIC_URL`, reverse proxy in front (`TRUST_PROXY_HOPS`) |
| Document server | Collabora host, its `aliasgroup` / `storage.wopi.host` entries for the portal origin (see [office-editing.md](../office-editing.md)) |
| Directory | AD host, LDAPS, the service account's scope, search bases, group prefix and project codes (see [drive-access.md](../drive-access.md)) |
| Backups | where `make backup` writes (`BACKUP_DIR`), retention, restore drill — set `BACKUP_DIR` in the container to see the last backup on the System page |
| Modules | which modules are on, which roles were granted, custom fields and routes |
