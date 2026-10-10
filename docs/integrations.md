# Integrations

External services the product talks to. All are **off by default**, configured in **Admin → Settings → Integrations**, and require the `settings.integrations` permission.

| Integration | Used for | Test connection does |
|-------------|----------|----------------------|
| [Email (SMTP)](#email-smtp) | Sign-in codes and links by email | SMTP handshake and login |
| [Telegram bot](#telegram-bot) | Telegram Login, sign-in codes in Telegram | `getMe`; fills in the bot username |
| [WhatsApp API](#whatsapp-api-gateway) | Your own WhatsApp gateway (reserved for product features) | `GET /api/instance` with the API key |
| [Wazzup](#wazzup) | Sign-in codes in WhatsApp; channel per messenger | Lists the account's channels, validates the selected ones |
| [Active Directory](#active-directory--ldap) | Domain sign-in, auto-provisioning, group mapping | Service-account bind and a search under the base DN |

Common behaviour:

- **Secrets are write-only.** Passwords, tokens and API keys are stored server-side and never returned; the form shows *Saved — type to replace*. Leave a secret empty to keep the stored value.
- **Test uses the form.** *Test connection* checks the values currently on screen, including unsaved ones, falling back to stored secrets.
- **Status everywhere.** Enabled integrations show a green dot in the settings navigation, a badge in the hub and a counter on the dashboard.
- **Sign-in depends on them.** A sign-in method can be switched on only when its integration is enabled and configured — see [access-control.md](access-control.md#sign-in-methods).

Integration secrets are currently stored in plaintext in `app_settings`; restrict database access (encryption at rest is on the roadmap).

---

## Email (SMTP)

| Field | Notes |
|-------|-------|
| Host / Port | e.g. `smtp.office365.com` / `587`, or `smtp.gmail.com` / `465` |
| Use SSL/TLS | On for implicit TLS (port 465). Off for STARTTLS (587) |
| User / Password | SMTP account. Many providers need an app password |
| From address | `Product <no-reply@company.com>`; defaults to the user |

Sign-in codes go to the email in the user's profile. An address shared by several accounts is treated as unknown, so keep emails unique.

## Telegram bot

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy the token.
2. Paste it, press **Test connection** — the **bot username** is filled in automatically. Save.
3. In BotFather run **`/setdomain`**, choose the bot and enter your site's domain (for example `portal.example.com`). Without this the login widget shows *Bot domain invalid*.

| Field | Notes |
|-------|-------|
| Bot token | `123456789:AA…` — secret |
| Bot username | Without `@`; required for Telegram Login |
| Default chat ID | Optional; reserved for notifications |

Users link Telegram in **Cabinet → Security**. The widget asks for permission to receive messages, which is what lets the bot deliver sign-in codes.

## WhatsApp API (gateway)

For a self-hosted WhatsApp gateway that exposes `GET /api/instance` with an `X-API-Key` header. It is configured and tested but not used by sign-in — use [Wazzup](#wazzup) for WhatsApp codes, or wire this gateway into your own features in `services/integrations.js`.

## Wazzup

[Wazzup](https://wazzup24.com) connects WhatsApp, Telegram, Instagram, Avito, VK and other channels to one API (v3).

1. In Wazzup open **Integrations → API** and copy the API key.
2. Paste it and press **Load channels** (or **Test connection**). Channels are read from the account and grouped by messenger, with their state (*Active*, *Unpaid*, *Scan QR*, …).
3. For each messenger pick the channel to use, e.g. *WhatsApp → +996 700 …*, *Instagram → company_account*. Save.

Stored as `{ transport: channelId }`, so several channels per account are fine. *Test connection* warns if a selected channel was deleted in Wazzup.

Sign-in codes in WhatsApp are sent through the channel chosen for **WhatsApp** to the phone number in the user's profile (`POST /v3/message`, `chatType: "whatsapp"`).

`WAZZUP_API_URL` overrides the API base URL (tests, egress proxies).

## Active Directory / LDAP

| Field | Notes |
|-------|-------|
| Host / Port | Domain controller; `389`, or `636` with TLS |
| Use TLS | `ldaps://` |
| Bind DN / Password | Service account that can search users, e.g. `CN=svc-portal,OU=Service,DC=corp,DC=local` |
| Base DN | Where users live, e.g. `DC=corp,DC=local` |

**Test connection** binds with the service account and performs a search, so it catches wrong credentials and wrong base DNs — not just an open port.

At sign-in the user is found by `sAMAccountName`, `userPrincipalName`, `uid` or `mail` (filters are built from escaped objects, never string concatenation), then the directory verifies the password with a bind as that user. Empty passwords are rejected to rule out anonymous binds. Profile fields (display name, email) are refreshed on every sign-in.

Turn on the sign-in method and group mapping in **Settings → Sign-in methods** — see [access-control.md](access-control.md#active-directory--ldap).

---

## Adding an integration

Step-by-step recipe in [extending.md → Add an integration](extending.md#add-an-integration). New integration groups are merged into existing installations automatically.
