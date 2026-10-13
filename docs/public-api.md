# Public API

Other systems can work with the portal through a REST API: tasks, chats, calendar, counterparties, files, users and the rest. Every call runs **on behalf of a person** and never goes beyond that person's rights. Administrators decide in detail what each token may do, and webhooks push events out as they happen.

| Where | What |
|-------|------|
| `/developers` | **Developer portal**: guide, full reference with examples in cURL / JavaScript / Python / PHP, a live "Try it" console, search (⌘K). Bilingual (RU/EN), works in the dark theme and on phones |
| `/admin/api` | **API console** (`api.admin`): overview, tokens, access templates, webhooks, request log, settings |
| `/account/api` | **Personal tokens** (`api.tokens`) |
| `/api/developer/openapi.json` | OpenAPI 3.1, generated from the running portal (`?lang=ru`, `?download=1`) |

Contents: [Quick start](#quick-start) · [Authentication](#authentication) · [Access model](#access-model) · [Templates](#access-templates) · [Resources and rules](#resource-limits-and-rules) · [Rate limits and log](#rate-limits-and-the-request-log) · [Errors](#errors) · [Webhooks](#webhooks) · [Settings](#settings) · [Management API](#management-api) · [For module authors](#for-module-authors) · [Security notes](#security-notes)

## Quick start

1. Create a token: *Account → API tokens → New token* (or *Admin → API & integrations → New token*). Pick a template, for example **Task integration**, and copy the token. It is shown only once.
2. Check it:

   ```bash
   curl https://portal.example.com/api/v1/auth/me -H "Authorization: Bearer $PORTAL_TOKEN"
   ```

3. Create a task:

   ```bash
   curl -X POST https://portal.example.com/api/v1/app/tasks/tasks \
     -H "Authorization: Bearer $PORTAL_TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"Prepare the report","dueAt":"2026-10-18T13:00:00Z","important":true}'
   ```

## Authentication

- **Base URL:** `https://<portal>/api/v1`. `/api/v1/<path>` runs the same handlers as the `/api/<path>` the interface uses, so the whole API is available, versioned.
- **Header:** `Authorization: Bearer pat_…` or `X-API-Key: pat_…`.
- **Token format:** `pat_<8 chars>_<32 chars>`. The first part (the prefix, e.g. `pat_k3Jd9xQe`) is shown in the console and the log. Only a SHA-256 of the token is stored. A lost token cannot be shown again; *New secret* replaces it, and the old one stops working at once.
- **Identity:** the request runs as the token owner, exactly as if they were signed in. Their roles, groups, module permissions, notifications and history all apply. Session cookies on a token request are ignored.
- **Never available to tokens** (`403 ROUTE_NOT_AVAILABLE`):
  - sign-in and sign-out (`/auth/*` except `GET /auth/me`);
  - setup;
  - passwords, sessions, Telegram and Google linking;
  - push subscriptions;
  - revoking another user's sessions;
  - "sign in as" another user (`/admin/users/:id/impersonate`: it answers with a session cookie);
  - token management itself (`/account/api`, `/admin/api`).
- **Owners:**
  - People with `api.tokens` create tokens for themselves.
  - `api.admin` can also issue a token *on behalf of* another account.
  - For integrations, create a dedicated technical account (e.g. "1C integration") with exactly the groups it needs, then issue the token for that account.

## Access model

A request passes when **all** of these allow it:

```
owner's own rights  ∩  token areas  ∩  token rules  ∩  resource limits  ∩  IP list, expiry, rate limit
```

### Areas and levels

The API is divided into areas; a token holds one level per area:

| Level | Methods |
|-------|---------|
| `none` | nothing |
| `read` | `GET`, `HEAD` |
| `write` | every method |

| Area | Paths |
|------|-------|
| `account` | `/auth/me`, `/account/**` |
| `notifications` | `/notifications/**` |
| `tasks`, `chat`, `calendar`, `companies`, `files`, `kb`, `drive`, `resources`, `dashboard` | `/app/<module>/**` (one area per module) |
| `admin.users` | `/admin/users`, `/admin/groups`, `/admin/roles`, `/admin/permissions` |
| `admin.security` | `/admin/security/**` |
| `admin.settings` | every other `/admin/**` path |

`/apps`, `/status`, `/settings` and `/developer/**` are open to any valid token. Disabled modules answer `404 MODULE_DISABLED` as usual.

The decision is implemented once in `src/backend/api/scopes.js` (`decide()`); the console repeats it in the browser (`src/frontend/src/developer/policy.js`) for the live "Check a request" panel. Keep the two in step.

## Access templates

A template is a named set of area levels plus rules. A token refers to a template and stores only **its own changes** on top of it. Changing a template therefore changes every token built on it. The console marks a token's changes and can reset each one to the template value.

Built-in templates (refreshed on every start, read-only, can be duplicated):

| Template | Gives |
|----------|-------|
| Read only | `read` on every user area |
| Full user access | `write` on every user area, no administration |
| Task integration | tasks and chat `write`, calendar and profile `read` |
| Calendar sync | calendar `write`, profile `read` |
| Chat bot | chat `write`, notifications and profile `read`; rule: deny `DELETE /app/chat/**` |
| HR directory sync | `admin.users` `write`, profile `read`; rule: deny `DELETE /admin/users/*` |
| Monitoring and audit | `admin.security`, `admin.settings`, dashboard, profile `read` |
| Full access | `write` everywhere including administration |

Custom templates have a name, description, colour, icon, levels and rules. A template used by active tokens cannot be deleted.

## Resource limits and rules

### Resource limits

A token (or a webhook) can be narrowed to some:

| Limit | Applies to |
|-------|------------|
| `tasks.projects` | Tasks: lists, search, cards, creation, the dashboard task widgets, the task chat. "No project" (`TSK`) is one of the choices |
| `calendar.calendars` | Calendar: calendars and their events |
| `files.spaces` | Files: shared spaces only. A narrowed token does not reach the owner's personal files (`403 TOKEN_LIMITED`) |
| `crm.pipelines` | CRM: deals, boards, lists, counters, export and calendar of those pipelines only (CRM has no access lists: the module checks this limit itself) |

The limit is applied inside the shared access lists of the modules (`modules/shared/acl.js`: `contextFromRequest`, `levelMap`, `levelOn`), so every endpoint honours it. A narrowed token never gets a module administrator's bypass, even if the owner holds `tasks.admin`.

### Rules

A rule is `{ effect: allow | deny, methods: [...], path }`. The path is written relative to `/api/v1`: `*` matches one segment, `**` the rest of the path, and `:name` also matches one segment. An empty method list means any method. Evaluation order:

1. Path never available to tokens → `403 ROUTE_NOT_AVAILABLE`.
2. A **deny** rule matches → `403 SCOPE_DENIED` (with `rule`).
3. An **allow** rule matches → passes the token check.
4. Otherwise the area level decides → `403 SCOPE_DENIED` (with `scope`, e.g. `calendar:write`).
5. The owner's own rights and resource limits then apply inside the module.

Examples:
- deny `DELETE /app/**`: the token never deletes anything;
- allow `POST /app/chat/rooms/*/messages`: posting is allowed for a chat area set to `read`;
- deny any `/admin/users/*/avatar`.

### Other limits

| Setting | Effect |
|---------|--------|
| Expiry | The token stops working at the end of that day (`401 TOKEN_EXPIRED`). Presets: 30 / 90 / 365 days, a date, or none (unless the portal sets a maximum lifetime) |
| IP allow list | Addresses or IPv4 networks (`10.0.0.0/8`); other addresses get `403 IP_NOT_ALLOWED` |
| Rate limit | Requests per minute for this token; empty = the portal default |
| Revoke | Immediate, `401 TOKEN_REVOKED`; a revoked token can then be deleted with its log |

## Rate limits and the request log

- Every token response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (seconds) and `X-Request-Id`.
- Over the limit: `429 RATE_LIMITED` with `Retry-After`.
- Token requests are counted per token and do not use the per-user limiter of the interface.
- Every token request is written to `api_requests`: time, token, owner, method, path, area, status, error code, duration, IP, User-Agent. The log is kept for *Log retention* days.
- The console shows:
  - traffic per hour;
  - error rate;
  - p95 latency;
  - the busiest endpoints and tokens;
  - the response mix;
  - expiring and idle tokens;
  - failing webhooks.

  The log tab filters by token, result, method, area and path. People see the log of their own tokens on their tokens page.

## Errors

```json
{ "success": false, "code": "SCOPE_DENIED", "error": "The token lacks the calendar:write scope", "scope": "calendar:write" }
```

| Status | Code | Meaning |
|--------|------|---------|
| 401 | `TOKEN_INVALID` / `TOKEN_EXPIRED` / `TOKEN_REVOKED` | Unknown, expired or revoked token |
| 403 | `SCOPE_DENIED` | Missing `scope`, or a `rule` denies |
| 403 | `ROUTE_NOT_AVAILABLE` | Never available to tokens |
| 403 | `IP_NOT_ALLOWED` | Address not in the token's list |
| 403 | `OWNER_INACTIVE` | The owner's account is disabled or blocked |
| 403 | `FORBIDDEN` / `TOKEN_LIMITED` | The owner may not do this / outside the token's resources |
| 404 | `NOT_FOUND` / `MODULE_DISABLED` | Missing, no access, or module off |
| 429 | `RATE_LIMITED` | Wait `retryAfter` seconds |
| 503 | `API_DISABLED` | The API is switched off |

Module errors (`TITLE_REQUIRED`, `RESULT_REQUIRED`, `DUPLICATE`…) are listed in each module's document.

## Webhooks

Administrators create webhooks in the console. A webhook has:
- a name and a URL;
- events: single events, a whole group (`task.*`), or `*` for all;
- **a person it runs as**: it receives only events about things that person may see, checked with the module's normal access rules;
- optional resource limits, the same as for tokens.

| Event | When |
|-------|------|
| `task.created`, `task.updated`, `task.completed`, `task.deleted` | Task lifecycle (`task.updated` carries the list of `changes`) |
| `task.comment`, `task.result` | A message in the task chat, a result added |
| `task.due_soon`, `task.overdue` | Deadline reminders |
| `task.accepted` | The assignee accepted the task (button, start or completion); `acceptance: { acceptedAt, via, comment }` |
| `chat.message` | A message in any conversation |
| `deal.created`, `deal.updated`, `deal.stage_changed`, `deal.won`, `deal.lost`, `deal.deleted` | CRM deals (`deal.updated` carries `changes`, `deal.stage_changed` `from`/`to`); only deals the run-as person may see |
| `contracts.created`, `.updated`, `.status_changed`, `.prolonged`, `.version_added`, `.risk_changed`, `.reminder`, `.deleted` | Contracts ([contracts.md](contracts.md#notifications-and-webhooks)); only contracts the run-as person may see |
| `calendar.event.created`, `.updated`, `.deleted` | Calendar events |
| `user.created`, `.updated`, `.deleted` | Accounts changed in the console or through the API (needs `users.view` for the run-as person) |

Payload:

```json
{
  "id": "6b0f8a8e-5f3c-4c9e-9a51-2f8d0c7c1e11",
  "type": "task.completed",
  "createdAt": "2026-10-11T09:31:00.000Z",
  "data": { "task": { "id": 128, "ref": "WEB-12", "title": "…", "url": "https://portal/app/tasks/WEB-12" }, "actor": { "id": 7, "name": "Aida Bekova" } }
}
```

Delivery:
- **Request:** `POST`, `Content-Type: application/json`, `User-Agent: Portal-Webhooks/1.0`.
- **Headers:**
  - `X-Portal-Event`;
  - `X-Portal-Delivery`;
  - `X-Portal-Signature: t=<unix>,v1=<hex>`, where `v1 = HMAC-SHA256(secret, "<t>.<raw body>")`;
  - `X-Portal-Redelivery: 1` — only when an administrator pressed *Send again* (see below).
- **Success:** any 2xx answer within 10 s.
- **Retries:** after 1 min, 5 min, 30 min, 2 h and 6 h; then the delivery is marked failed. After 20 failed deliveries in a row the webhook switches itself off.
- **Duplicates:** an event may arrive twice (a retry after a timeout). Use the event `id` to process it once.
- **Send again keeps the event id.** It is the same event, so a receiver that dedupes on `id` will skip it. If a resend should be processed again (the first attempt reached you but your processing failed), honour `X-Portal-Redelivery: 1`: it is set only on deliveries an administrator resent by hand, never on automatic retries.
- **Secret:** shown once, as `whsec_…`; *New secret* replaces it. It is stored encrypted, because the portal needs it to sign. If it can no longer be decrypted (the server's encryption key changed without keeping the old one — see [security.md](security.md#rotating-secrets)), the webhook pauses with *secret unreadable* instead of counting failures; its pending deliveries wait. *New secret* resumes it (give the receiver the new secret); restoring the old key and resuming works too.
- **Run-as person deleted:** the webhook is kept, paused (*person deleted*). Choose whom it runs as and resume it; resuming without a choice runs it as you.
- **Console tools:**
  - *Send a test* (a `ping` event) shows the answer at once;
  - each delivery shows its payload, response and attempts;
  - *Send again* repeats a delivery (same event id, with `X-Portal-Redelivery: 1`).
- **Private addresses:**
  - Webhooks to private addresses (10.x, 172.16–31.x, 192.168.x, 100.64/10, localhost, link-local) are refused unless *Private network addresses* is on. The address is checked again before every delivery.
  - Redirects are not followed.

Verify a signature (Node.js):

```js
import crypto from 'node:crypto';
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=', 2)));
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(String(v1 || ''), 'hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  // timingSafeEqual throws when the lengths differ, so a malformed header must be rejected first.
  return fresh && given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

The developer portal has the same in Python and PHP.

## Settings

*Admin → API & integrations → Settings* (stored as `api_config`):

| Setting | Default |
|---------|---------|
| API is on | on (off: every token request gets `503 API_DISABLED`; the interface keeps working) |
| Personal tokens | on (people with `api.tokens` create their own) |
| Longest token lifetime, days | 0 = no limit |
| Default rate limit, per minute | 120 |
| Keep the request log, days | 30 |
| Public documentation (`/developers` without signing in) | off |
| Webhooks | on |
| Private network addresses for webhooks | off |

Neither permission is in a built-in role except the super administrator's `*`. Grant `api.tokens` or `api.admin` through a role.

## Management API

Used by the console and the tokens page. Tokens cannot call it.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/api/` | Config, base URL, 24 h statistics, counters |
| GET | `/api/admin/api/meta` | Areas, resources for limits, events, people |
| PUT | `/api/admin/api/config` | Settings |
| GET / POST | `/api/admin/api/tokens` | List (`state`, `userId`, `q`) / create `{ name, description, userId, templateId, scopes, rules, limits, ipAllow, rateLimit, expiresAt }` → `{ token, secret }` |
| GET / PUT / DELETE | `/api/admin/api/tokens/:id` | Read / change / delete a revoked token |
| POST | `/api/admin/api/tokens/:id/revoke`, `/rotate` | Revoke / new secret → `{ token, secret }` |
| GET / POST / PUT / DELETE | `/api/admin/api/templates[/:id]` | Access templates |
| GET / POST / PUT / DELETE | `/api/admin/api/webhooks[/:id]` | Webhooks (create → `{ webhook, secret }`) |
| POST | `/api/admin/api/webhooks/:id/ping`, `/secret` | Test delivery / new signing secret |
| GET | `/api/admin/api/deliveries` | `webhookId`, `status`, `event`, `before`, `limit` |
| POST | `/api/admin/api/deliveries/:id/redeliver` | Send again |
| GET | `/api/admin/api/requests`, `/stats` | Request log (`tokenId`, `userId`, `method`, `area`, `status` = ok/error/code, `q`, `from`, `to`, `before`) / figures (`tokenId`, `days`) |
| GET, POST, PUT, DELETE | `/api/account/api/…` | The same for one's own tokens: `/`, `/tokens`, `/tokens/:id`, `/tokens/:id/revoke`, `/tokens/:id/rotate`, `/requests` |
| GET | `/api/developer/reference`, `/api/developer/openapi.json` | The reference (signed-in, or anyone when public) |

## For module authors

- **The reference finds every route itself**:
  - `api/introspect.js` reads the mounted Express routers;
  - modules register theirs in `MOUNTED` (`modules/index.js`);
  - core routers are imported directly.

  To describe an endpoint, add it to `DOCS` in `src/backend/api/reference.js`: the key is `"METHOD /path"` exactly as declared, the texts are `{ ru, en }`. Describe the module in `SECTIONS`. Undocumented routes are still listed, with their scope.
- **A new module** gets its own area automatically, from `MODULE_CATALOG`. Add its title and description to `api.areas.<id>` in `i18n/api.js`.
- **Events:**

  ```js
  emitEvent('thing.created', { data: { thing }, visible: async (req) => canSee(req, thing) })
  ```

  - `req` is a request-like object of the webhook's person, with `apiLimits`;
  - add the type to `EVENT_CATALOG` in `api/events.js`, and its labels to `api.events` in i18n.
- **Resource limits** come for free when a module uses `contextFromRequest` / `levelMap` / `levelOn` from `modules/shared/acl.js`. To add a kind, list it in `RESOURCE_KINDS` (`api/scopes.js`) and in `resourceOptions()` (`api/templates.js`).

## Security notes

- Tokens are bearer secrets: keep them in a secret store or environment variables, never in front-end code or in a repository.
- Prefer narrow templates, resource limits, an IP list and an expiry date for every integration token; watch *Needs attention* in the console for idle and expiring tokens.
- Revoking a token, disabling its owner or switching the API off takes effect within seconds: token lookups are cached for 15 s.
- The developer portal's "Try it" console keeps a pasted token only in the browser tab (`sessionStorage`); with a session it acts as the signed-in person.
