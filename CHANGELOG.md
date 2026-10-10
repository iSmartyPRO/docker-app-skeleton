# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

The admin console redesign and hardening pass. See [docs/audit.md](docs/audit.md) for the reasoning behind each change.

### Added

- **Roles, groups and permissions (RBAC)**: permission catalog, five built-in roles (Super administrator, Administrator, Moderator, Auditor, User), custom roles, groups that grant roles, a default group, escalation-proof assignment, last-super-admin protection in a transaction, read-only settings for viewers. New **Groups** and **Roles** pages.
- **Sign-in through integrations**: Active Directory / LDAP (real bind, auto-provisioning, group mapping), Telegram Login (redirect widget), 6-digit codes via WhatsApp (Wazzup), email and Telegram, and magic links. New *Settings → Sign-in methods* screen.
- **Bank-style code entry**: six cells, auto-submit on the last digit, paste and OS autofill, countdown, resend timer.
- Sign-in contacts on profiles: phone, Instagram, linked Telegram; first password for SSO accounts.
- Setup wizard seeds roles and groups in its language and can add sample users; `make seed-demo` for existing installations.
- Machine error codes for sign-in failures, translated in the UI.

- **Wazzup integration** (WhatsApp, Telegram, Instagram, Avito and more via [Wazzup](https://wazzup24.com) API v3): write-only API key, channels loaded from the account and grouped by messenger, one default channel per messenger (stored as `{ transport: channelId }`), readable channel states, *test connection* that validates the selected channels.
- **Settings hub** at `/admin/settings`: every configurable option grouped into Project, Appearance, Security, Integrations and System, with search and a grouped side navigation (a select on mobile).
- **Command palette** (⌘K / Ctrl+K) across admin pages, settings screens and quick actions.
- **Floating save bar** shown only while a form has unsaved changes.
- **Overview dashboard** with user KPIs, 24-hour security counters, recent events, recent sign-ins, quick links and system status (`GET /api/admin/overview`).
- **System screen** with version, runtime, database info and API rate-limit controls (`GET /api/admin/system`).
- **User management**: search, role and status filters, last sign-in, a dedicated user page, *sign out everywhere* (`POST /api/admin/users/:id/revoke-sessions`).
- **Cabinet**: password confirmation and *sign out other devices* (`POST /api/account/sessions/revoke`).
- **Dark-theme logo** and configurable logo height.
- UI for settings that previously had no screen: session lifetime, API rate limit, SMTP SSL/TLS, Active Directory TLS.
- `TRUST_PROXY_HOPS` for deployments behind an additional reverse proxy.
- `SETUP_LOCKED`, written automatically once the wizard completes.
- Navigation registry (`src/frontend/src/admin/navigation.js`) and a UI kit (`PageHeader`, `SettingsSection`, `SettingRow`, `SaveBar`, `LoadState`, `useSettingsForm`).
- Backend unit tests (`node:test`), `make test`, and test runs in CI.
- Lock files for both packages; `npm ci` in Docker and CI.
- Favicon, `color-scheme` meta, document title from the app name.
- English documentation: README rewrite, [extending guide](docs/extending.md), architecture review, changelog, issue and pull-request templates.

### Changed

- Admin sidebar reduced to Overview, Users, Activity and Settings. Old URLs redirect to their new locations; previously chosen menu icons carry over.
- Settings and IP rules are cached for 5 seconds and invalidated on write.
- The API rate-limit cap applies without a restart.
- *Test connection* uses the values currently in the form.
- Search matches word prefixes in both English and Russian.
- Node.js 20 → 22 LTS in Docker images and CI.
- Route-level code splitting; React and Ant Design in separate vendor chunks; only the selected typeface is downloaded.
- nginx caches hashed assets for a year and revalidates `index.html`; `X-Forwarded-For` is appended instead of overwritten.
- Footer credit reads *Developed by iSmartyPro*.

### Fixed

- The setup wizard could reopen while the database was unreachable.
- Frequent page loads were rate-limited on `/api/setup/status` and redirected configured installations to the wizard.
- Saving sign-in settings re-enabled the IP block-list.
- Administrators could lock themselves out by IP, demote or block themselves, or remove the last active administrator.
- Role changes and blocking did not end the user's sessions.
- Deleting users and IP rules had no confirmation; several failures were unhandled.
- The collapsed sidebar misaligned icons and forgot its state on reload.
- The *System* theme ignored OS theme changes until reload.
- The UI version ignored the `VERSION` file.
- Malformed JSON bodies returned `500`.

### Security

- `409 SELF_LOCKOUT` guard for allow-list, block-list and rule deletion.
- Integration writes accept only known groups.
- Role change, disable and block now revoke sessions.

## [0.0.1]

- Initial skeleton: setup wizard, authentication, cabinet, admin console, theming, integrations stubs, IP lists, Docker packaging.

[Unreleased]: https://github.com/iSmartyPRO/docker-app-skeleton/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/iSmartyPRO/docker-app-skeleton/releases/tag/v0.0.1
