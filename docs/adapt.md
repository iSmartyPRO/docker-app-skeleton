# Adapt the skeleton for a real product

Goal: a new repository that still has login, admin, wizard and Docker — with **your** name, domain logic and branding.

## 1. Identity

| File | Change |
|------|--------|
| `.env.example` / `.env` | `DOCKER_NAME`, `DOCKER_PORT`, `FRONTEND_URL`, `POSTGRES_DB`, `POSTGRES_USER` |
| `VERSION` | Start at `0.1.0` or keep `0.0.1` |
| `src/frontend/src/locales/<lang>/_root.js`, `landing.js` | `brand`, `footer` label, landing copy |
| `src/frontend/src/components/AppFooter.jsx` | Vendor link / copyright |
| `src/frontend/public/favicon.svg` / `index.html` | Favicon, default `<title>` and description |
| Admin → Settings → General (runtime) | Product name, description, primary and dark-theme logos |
| `src/backend/services/settings.js` | `DEFAULTS.app_name`, `app_description` |
| `README.md` | Product name and purpose |

Keep the cookie name `da_session` or change it in `src/backend/config/app.js` **and** document that existing sessions drop.

## 2. Visual system

Already productized:

- Color templates: `src/frontend/src/theme/templates.js`
- Typography presets: `src/frontend/src/theme/typography.js`
- Menu icons: `src/frontend/src/components/icons/`

Add a template or icon there; admins pick them under **Settings → Appearance**. Do not hard-code a one-off palette in CSS — use the design tokens in `index.css` (`--da-primary`, `--da-surface`, `--da-muted`, …) so every template and dark mode keep working.

## 3. Domain modules

Suggested pattern for each bounded context (`orders`, `devices`, …):

```
src/backend/services/orders.js
src/backend/routes/orders.routes.js   # requireAuth / requirePermission('orders.manage')
src/frontend/src/pages/admin/Orders.jsx
src/frontend/src/pages/account/Orders.jsx
```

Add the module's permissions to the catalog and grant them to roles (see [access-control.md](access-control.md#adding-a-permission)). Mount the router in `src/backend/routes/index.js`. Add the admin page to `ADMIN_PAGES` in `src/frontend/src/admin/navigation.js` (sidebar, ⌘K palette and icon slot follow automatically) and a route in `App.jsx`. Configuration for the module goes under **Settings** as a registry item — step-by-step recipes in [extending.md](extending.md).

## 4. What you should not casually rewrite

These pieces encode the security model:

- `middleware/auth.js` — cookie, `token_version`, `requirePermission`
- `services/rbac.js` / `services/permissions.js` — escalation rules and last-super-admin guard
- `services/signin.js` / `services/ldap.js` — code hashing, limits, Telegram signature, LDAP binds
- `services/auth.js` — JWT and session cookie
- `middleware/upload.js` — extension + magic bytes
- `middleware/ipGuard.js` + `services/security.js`
- `nginx.conf` headers and `/uploads/` CSP
- parameterized `pg` queries

If you add cookie-authenticated **state-changing GET** handlers, you break the SameSite=Lax CSRF assumption. Use POST/PUT/DELETE.

## 5. Integrations

Email, Telegram, WhatsApp and Active Directory are **stubs**: configuration plus *test connection* under **Settings → Integrations**, disabled by default. Wire real send/receive in `src/backend/services/integrations.js` (or replace it). Do not put live tokens in git. Adding a new integration: [extending.md](extending.md#add-an-integration).

## 6. Roles and sign-in

Rename or extend the built-in roles in **Admin → Roles**, rename the default groups in **Admin → Groups**, and choose sign-in methods in **Settings → Sign-in methods**. Keep at least two super administrators. Full model: [access-control.md](access-control.md).

## 7. Access modes

| Mode | Guests |
|------|--------|
| Closed | Always login |
| Open | Landing visible; cabinet and admin still private |

Add more public pages only after checking `accessMode` in `App.jsx` (`AccessGate`).

## 8. Ship

```bash
make bump-minor    # or bump-patch
make rebuild
make health
```

Put TLS in front of `DOCKER_PORT`. Set `FRONTEND_URL=https://…`.
