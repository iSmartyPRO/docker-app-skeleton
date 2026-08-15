# Adapt the skeleton for a real product

Goal: a new repository that still has login, admin, wizard and Docker — with **your** name, domain logic and branding.

## 1. Identity

| File | Change |
|------|--------|
| `.env.example` / `.env` | `DOCKER_NAME`, `DOCKER_PORT`, `FRONTEND_URL`, `POSTGRES_DB`, `POSTGRES_USER` |
| `VERSION` | Start at `0.1.0` or keep `0.0.1` |
| `src/frontend/src/i18n/translations.js` | `brand`, landing, footer |
| `src/frontend/src/components/AppFooter.jsx` | Vendor link / copyright |
| `src/backend/services/settings.js` | `DEFAULTS.app_name`, `app_description` |
| `README.md` | Product name and purpose |

Keep the cookie name `da_session` or change it in `src/backend/config/app.js` **and** document that existing sessions drop.

## 2. Visual system

Already productized:

- Color templates: `src/frontend/src/theme/templates.js`
- Typography presets: `src/frontend/src/theme/typography.js`
- Menu icons: `src/frontend/src/components/icons/`

Add a template or icon there; admins pick them under **Appearance**. Do not hardcode a one-off palette in random CSS if a template can carry it.

## 3. Domain modules

Suggested pattern for each bounded context (`orders`, `devices`, …):

```
src/backend/services/orders.js
src/backend/routes/orders.routes.js   # requireAuth / requireAdmin
src/frontend/src/pages/admin/Orders.jsx
src/frontend/src/pages/account/Orders.jsx
```

Mount the router in `src/backend/routes/index.js`. Add a sidebar item in `AdminLayout.jsx` and a `MENU_SLOTS` entry so icons stay assignable.

## 4. What you should not casually rewrite

These pieces encode the security model:

- `middleware/auth.js` — cookie + `token_version`
- `services/auth.js` — JWT, bcrypt dummy hash (timing-safe failed login)
- `middleware/upload.js` — extension + magic bytes
- `middleware/ipGuard.js` + `services/security.js`
- `nginx.conf` headers and `/uploads/` CSP
- parameterized `pg` queries

If you add cookie-authenticated **state-changing GET** handlers, you break the SameSite=Lax CSRF assumption. Use POST/PUT/DELETE.

## 5. Integrations

Email, Telegram, WhatsApp and Active Directory are **stubs**: config + “test connection” in admin, disabled by default. Wire real send/receive in `src/backend/services/integrations.js` (or replace it). Do not put live tokens in git.

## 6. Access modes

| Mode | Guests |
|------|--------|
| Closed | Always login |
| Open | Landing visible; cabinet and admin still private |

Add more public pages only after checking `accessMode` in `App.jsx` (`AccessGate`).

## 7. Ship

```bash
make bump-minor    # or bump-patch
make rebuild
make health
```

Put TLS in front of `DOCKER_PORT`. Set `FRONTEND_URL=https://…`.
