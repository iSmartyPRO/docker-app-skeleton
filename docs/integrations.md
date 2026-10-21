# Integrations

External services the product talks to. All are **off by default**, configured in **Admin → Settings → Integrations**, and require the `settings.integrations` permission.

| Integration | Used for | Test connection does |
|-------------|----------|----------------------|
| [Email (SMTP)](#email-smtp) | Sign-in codes and links by email | SMTP handshake and login |
| [Telegram bot](#telegram-bot) | Telegram Login, sign-in codes in Telegram | `getMe`; fills in the bot username |
| [WhatsApp Gateway](#whatsapp-gateway-wagw) | Sign-in codes in WhatsApp (main or fallback provider) | `GET /api/health`, then a read-only key check |
| [Wazzup](#wazzup) | Sign-in codes in WhatsApp; channel per messenger | Lists the account's channels, validates the selected ones |
| [Mattermost](#mattermost) | Sign-in codes by direct message; security alerts to a channel | `GET /system/ping`, `GET /users/me`, alert channel access |
| [iSMS Server](#isms-server-sms) | Sign-in codes and links by SMS; sending SMS through your own Android phones (`sendSms` in `services/integrations.js`) | `GET /devices` with the token; lists phones and SIMs, checks the chosen SIM |
| [Google](#google) | Sign-in with Google, Google Calendar per user, Gmail as the mail sender | Validates the OAuth client with Google's token endpoint; checks the Gmail sender if connected |
| [Document conversion](#document-conversion-collabora--libreoffice) | Office previews in the Knowledge Base (`.doc`, `.docx`, `.ppt`, `.pptx`, `.xls`, OpenDocument, `.rtf`) | Converts a tiny document to PDF and reports the time |
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

Timeouts: 8 s to connect, 15 s for the server greeting and for any stalled step, so a hanging server cannot hold a send. A failed send is not retried automatically (sign-in codes can be requested again; the failure is in *Activity*).

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

## WhatsApp Gateway (WAGW)

A self-hosted WhatsApp gateway. The address is **not tied to any domain** — enter wherever your gateway runs (`https://wagw.example.com`, `http://10.0.0.5:8080`); a trailing `/` or `/api` is ignored.

| Field | Notes |
|-------|-------|
| Gateway URL | Base address of the gateway |
| API key | `wagw_…`, created in the gateway admin. **Each key is tied to one WhatsApp number** — messages are sent from that number |

Requests (all relative to `{Gateway URL}/api`):

| Purpose | Request |
|---------|---------|
| Test: reachability | `GET /health` (no key) |
| Test: key check | `GET /inbox/external/chats` with `X-API-Key` (read-only) |
| Send a code | `POST /messages/external/send` with `X-API-Key`, body `{ "to": "996700123456", "message": "…" }` |

`to` is the phone from the user's profile, digits only. A `401` means the key was rejected.

## Wazzup

[Wazzup](https://wazzup24.com) connects WhatsApp, Telegram, Instagram, Avito, VK and other channels to one API (v3).

1. In Wazzup open **Integrations → API** and copy the API key.
2. Paste it and press **Load channels** (or **Test connection**). Channels are read from the account and grouped by messenger, with their state (*Active*, *Unpaid*, *Scan QR*, …).
3. For each messenger pick the channel to use, e.g. *WhatsApp → +996 700 …*, *Instagram → company_account*. Save.

Stored as `{ transport: channelId }`, so several channels per account are fine. *Test connection* warns if a selected channel was deleted in Wazzup.

When Wazzup is the WhatsApp provider for sign-in codes, codes go through the channel chosen for **WhatsApp** to the phone number in the user's profile (`POST /v3/message`, `chatType: "whatsapp"`).

### Choosing the WhatsApp provider

With both WhatsApp Gateway and Wazzup configured, **Settings → Sign-in methods → Code in WhatsApp** lets you pick the main provider and turn on **fallback**: if the main provider fails, the code is sent through the other one. The method is offered on the sign-in page only when the chosen provider is configured, or fallback is on and the other one is; saving a choice that cannot deliver (e.g. *Gateway* without fallback while only Wazzup is set up) is refused. Delivery failures (with the provider's error) appear in **Activity** as *Code delivery failed*.

`WAZZUP_API_URL` overrides the API base URL (tests, egress proxies).

## Mattermost

Works with any Mattermost server (self-hosted or cloud) through REST API v4. The address is not tied to a domain; a trailing `/` or `/api/v4` is ignored.

1. In Mattermost: **System Console → Integrations → Bot Accounts** → enable bot accounts, then **Integrations → Bot Accounts → Add Bot Account**. Copy the **access token**.
2. Paste the server URL and token here and press **Test connection** — it reports the bot name and server version.
3. *(Optional)* Security alerts: add the bot to a channel, copy the channel ID (channel menu → **View Info**), paste it in **Alert channel ID** and turn on **Post security alerts**.

| Field | Notes |
|-------|-------|
| Server URL | `https://chat.company.com` |
| Bot access token | Secret; sent as `Authorization: Bearer …` |
| Alert channel ID | 26-character channel ID, not the display name |
| Post security alerts | Danger-level events (lockouts, blocked accounts, IP blocks, delivery failures) are posted with user, IP and detail |

**Sign-in codes:** enable *Code in Mattermost* in **Sign-in methods**. Users need their **Mattermost username** in the profile. The bot opens a direct channel (`POST /channels/direct`) and posts the code (`POST /posts`).

Alerts are best-effort: a Mattermost outage never blocks sign-in, it is only logged.

## iSMS Server (SMS)

[iSMS Server](https://github.com/iSmartyPRO/isms-gw-server) turns Android phones with the iSMS GW app into an SMS gateway. Each portal (each company) points at **its own** server with **its own** token — the address is not tied to a domain; a trailing `/` or the `/api/v1/app/sms` path copied from the server's API page is ignored.

1. On the iSMS server open **SMS → API** and create an API token (`pat_…`) with `sms:read` and `sms:write`. It may be limited to one phone and SIM.
2. Paste the server URL and token and press **Test connection** (or **Load phones**). The phones the token can use are listed with their SIMs and online state.
3. *(Optional)* Pick **SIM to send from**. *Automatic* lets the server choose (or use the token's SIM). Save.
4. **Test SMS** sends one message with the values on screen — the whole path to the phone.

| Field | Notes |
|-------|-------|
| Server URL | `https://sms.example.com` |
| API token | Secret; sent as `Authorization: Bearer …`; reused only for the saved server |
| SIM to send from | `simId` of the SIM row on the server; `0` = automatic. A token tied to another SIM answers `SIM_NOT_ALLOWED` |

Requests (relative to `{Server URL}/api/v1/app/sms`):

| Purpose | Request |
|---------|---------|
| Test, SIM picker | `GET /devices` |
| Send | `POST /messages`, body `{ "to": ["+996555123456"], "text": "…", "simId": 43, "ref": "…" }` |
| Status | `GET /messages/:id` — `queued → dispatched → accepted → sent → delivered`, or `failed` / `cancelled` / `expired` |

Errors of the iSMS API (`TOKEN_INVALID`, `SCOPE_DENIED`, `SIM_NOT_ALLOWED`, `IP_NOT_ALLOWED`, `SIM_LIMIT`, `RATE_LIMITED`, …) are shown as a sentence with the code. In code: `sendSms({ phone, text, ref })` queues one SMS and returns `{ id, status }`; `smsStatus(id)` reads its status.

## Google

One OAuth 2.0 client (OpenID Connect, no Google SDK) powers three features. Each can be switched separately.

| Feature | Where it is turned on | Scopes |
|---------|----------------------|--------|
| **Sign-in with Google** | *Settings → Sign-in methods → Google* (optional auto-provisioning) | `openid email profile` |
| **Google Calendar for users** | *Integrations → Google → Google Calendar for users*; each person connects in *Profile → Connected accounts* | `calendar.events`, `calendar.calendarlist.readonly` (offline) |
| **Send email through Gmail** | *Integrations → Google → Connect sender account*, then *Send email through Gmail* | `gmail.send` (offline) |

**Setup in Google Cloud Console** (the settings screen shows the exact values with copy buttons):

1. APIs & Services → **OAuth consent screen**: *Internal* for Google Workspace, otherwise *External*. Add the app name and support email.
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origin: `https://portal.example.com`;
   - Authorized redirect URI: `https://portal.example.com/api/auth/google/callback`. The base is `PUBLIC_URL`, or `FRONTEND_URL` when that is not set.
3. **Library**: enable *Google Calendar API* and/or *Gmail API* if you use them.
4. Paste the Client ID and secret, press **Test connection** and save.

**Behaviour and security**

- **One callback** serves every flow: `/api/auth/google/callback`.
- **State:**
  - a signed, httpOnly state cookie (10 minutes) carries a nonce and a **PKCE** verifier;
  - Connect and Gmail flows must finish in the same signed-in session that started them.
- **ID tokens** are verified against Google's JWKS: signature, issuer, audience, expiry and nonce.
- **Sign-in lookup order:**
  1. a linked Google account (`google_accounts.sub`);
  2. the single user with the same **verified** email, who is then linked;
  3. a new account, if auto-provisioning is on.

  Step 2 applies only to a **trusted** address (`users.email_trusted`). Trusted means:
  - set by an administrator, including re-saving it on the user page;
  - or coming from Active Directory or Google;
  - or proven by signing in with an email code or link.

  A self-typed profile email never captures someone's Google sign-in. Such users connect Google once in *Profile → Connected accounts*.
- **Switching accounts:** *connecting* a different Google account (Profile → Connected accounts) drops the previous account's refresh token and calendar selection. A plain *sign-in* with another Google account never does: a Calendar connected to one Google account stays connected, and a revoked connection stays revoked until the person connects again.

  Lockouts, login attempts and security events work as for other methods.
- **Allowed domains** (comma-separated) restrict sign-in and connections to Google Workspace / email domains. With exactly one domain, Google's account chooser is pre-filtered (`hd`).
- **Tokens:**
  - refresh tokens (users' and the Gmail sender's) are **sealed with AES-256-GCM** ([notifications.md](notifications.md#sealed-secrets));
  - access tokens live only in memory;
  - a revoked grant (`invalid_grant`) marks the connection as revoked and asks the user to reconnect;
  - a token that cannot be decrypted (the server's encryption key changed) is **not** treated as revoked: calls fail with `GOOGLE_KEY`, the connection and the Gmail sender stay, and administrators get a security event — see [security.md](security.md#rotating-secrets);
  - disconnecting revokes the token at Google.
- **Gmail:** the sender is used for every outgoing email (notifications, sign-in codes and links) when *Send email through Gmail* is on. Otherwise SMTP is used.
- **CSP:** profile pictures from `*.googleusercontent.com` are allowed in `img-src`.

## Document conversion (Collabora / LibreOffice)

Turns Office documents into PDF so the [Knowledge Base](knowledge-base.md) can show them in its PDF viewer exactly as they were laid out. The portal calls the converter's `convert-to` endpoint:

```
POST {serverUrl}/cool/convert-to/pdf   (multipart field "data")
```

| Field | Notes |
|-------|-------|
| Server URL | Address reachable **from the portal container**, e.g. `http://collabora:9980` on a shared Docker network. Any host or domain works |

Works with Collabora Online / CODE (`collabora/code`) or any service that exposes the same endpoint. In Collabora, allow the portal's address in `coolwsd.xml` → `net.post_allow` if conversion requests are refused.

- Previews are generated on first open and cached on disk, so later opens are instant. A new upload invalidates the cache.
- Without conversion, `.docx` and `.xlsx` are still rendered in the browser. The other formats offer a download.
- Documents never leave your infrastructure. The converter only receives the file, and it is not stored there.

## Active Directory / LDAP

| Field | Notes |
|-------|-------|
| Host / Port | Domain controller; `389`, or `636` with TLS |
| Use TLS | `ldaps://` |
| CA certificate (PEM) | Optional. For a domain controller whose certificate comes from an internal CA: paste the CA certificate(s) (`-----BEGIN CERTIFICATE-----`). Used only with TLS. Alternative for the whole server: mount the CA file and set `NODE_EXTRA_CA_CERTS=/path/ca.pem` in `.env` (read at start-up; affects every outgoing TLS connection) |
| Bind DN / Password | Service account that can search users, e.g. `CN=svc-portal,OU=Service,DC=corp,DC=local` |
| Base DN | Where users live, e.g. `DC=corp,DC=local` |

**Test connection** binds with the service account and performs a search, so it catches wrong credentials and wrong base DNs — not just an open port.

At sign-in the user is found by `sAMAccountName`, `userPrincipalName`, `uid` or `mail` (filters are built from escaped objects, never string concatenation), then the directory verifies the password with a bind as that user. Empty passwords are rejected to rule out anonymous binds. Profile fields (display name, email) are refreshed on every sign-in.

The portal account is matched by DN, then by the directory object id (AD `objectGUID`, OpenLDAP `entryUUID`; `users.directory_guid`), so a person moved to another OU keeps their account; the stored DN is updated. Existing links pick up the object id at their next sign-in. Parallel first sign-ins of one person create one account (a lock per person, re-checked inside it).

Turn on the sign-in method and group mapping in **Settings → Sign-in methods** — see [access-control.md](access-control.md#active-directory--ldap).

Managing accounts (users, groups, OUs, password resets) is the [AD directory](directory.md) module; password operations there need *Use TLS* (LDAPS) or its StartTLS option.

---

## Adding an integration

Step-by-step recipe in [extending.md → Add an integration](extending.md#add-an-integration). New integration groups are merged into existing installations automatically.
