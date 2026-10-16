# Modules (apps)

The skeleton is a platform for **modules**: self-contained applications that plug into the same users, roles, settings, theme and navigation. Built in: [Dashboard](dashboard.md), [Counterparties](companies.md), [Online resources](resources.md), [File server (Drive)](drive.md) (with [access management](drive-access.md): AD security groups and NTFS permissions of its folders, a settings block off by default), [Files](files.md), [Knowledge Base](knowledge-base.md), [Tasks](tasks.md), [Chat](chat.md), [Calendar](calendar.md), [CRM](crm.md) and [Masterplan](masterplan.md) (development projects: site plan, chessboard, bookings, construction) and [Contracts](contracts.md) (registry with versions, risks, approval and expiry reminders; off by default), [Procurement](procurement.md) (purchase requests, approval, payments registry, delivery; off by default), [Warehouse](warehouse.md) (stock, receipts and issues, transfers, tools, barcodes; off by default), [AD directory](directory.md) (Active Directory accounts inside a managed root, changes as the administrator's own AD account; needs the AD integration or shows its setup and a demo directory; off by default). Modules notify people through the shared [notification center](notifications.md) and can schedule background work with `registerJob()`. A module gives its records a conversation with `registerChatEntity()` (see [Chat](chat.md#chats-for-other-modules)), and publishes webhook events with `emitEvent()` (see [Public API](public-api.md#for-module-authors)). Its endpoints appear in the API reference and get their own token area automatically. Documents that need sign-off go through the always-on [Approvals](approvals.md) service (`registerApprovalType()`, `startApproval()`), and anything waiting for a person's decision can join the «Ждёт меня» inbox with `registerInboxProvider()`.

People: the core [Org structure](org-structure.md) (units, heads, `managerOf()`; always on, like Approvals) and the [Employees](employees.md) module (people with or without portal access, clearances, org chart; off by default).

| URL | What it is |
|-----|------------|
| `/apps` | Launcher with every enabled module (also the 9-dot menu in the top bar) |
| `/app/<id>` | A module's UI, e.g. `/app/kb` |
| `/api/apps` | Enabled modules for the signed-in user |
| `/api/app/<id>/…` | A module's private API (signed-in users only) |
| `/api/<publicPrefix>/…` | Optional anonymous API, e.g. `/api/s/…` for public links |
| `/s/<slug>` | Public pages, when a module provides them |

## Turning modules on and off

**Admin → Settings → Modules** shows the **core** services (always on) and every module **by category** (Work, Documents, Sales, Warehouse and procurement, Construction, People, Infrastructure). Each card has the module's icon, name, **version**, status (*On* / *Off* / *Needs X* / *Always on*), what it **needs** and what it **works with**, a switch, and the buttons *Documentation* («О модуле», `/admin/modules/<id>/docs`), *Settings*, *Demo data* (superadministrators) and *Tour* (when the module has one). A search field and *All / On / Off* filter the list. The permission `settings.modules` is needed to switch modules.

**Requirements** (`requires` in the [manifest](extending.md#module-manifest)) are enforced by the server:

- switching on a module whose required module is off answers `409 MODULE_REQUIRES` with `info.missing` — the page asks «Для X нужны Y. Включить вместе?» and repeats the request with `alsoEnable: true`, which switches the whole chain on;
- a required **integration** that is off cannot be switched on from here (`canAlsoEnable: false`; the dialog points to the integration);
- switching off a module that switched-on modules require answers `409 MODULE_REQUIRED_BY` with `info.dependents` («Нельзя выключить X: от него зависят …»).

Optional links (`enhances`) never block anything: the feature simply hides, and `<ModuleHint>` tells people inside the module which module to switch on.

Today only core services are required — Approvals (by Contracts, Procurement and Warehouse) and the Org structure (by Employees); every other link between modules is optional:

| Module | Needs | Works with (optional) |
|---|---|---|
| Contracts | Approvals (core) | Counterparties, Chats, CRM, Masterplan, Procurement |
| Procurement | Approvals (core) | Counterparties, Masterplan, CRM, Contracts, Files, Chats |
| Warehouse | Approvals (core) | Procurement, Masterplan, Counterparties |
| Employees | Org structure (core) | Dashboard (birthdays widget), Active Directory (integration: AD account field) |
| Masterplan | — | CRM, Counterparties |
| CRM | — | Counterparties, Chats |
| Counterparties | — | CRM |
| Tasks | — | Chats, Files, File server, Calendar |
| Calendar | — | Tasks, Google (integration) |
| Knowledge base | — | Files, document server (integration) |
| Files | — | document server (integration) |
| File server | — | Active Directory (folder access), document server (integrations) |
| Dashboard | — | every module with widgets |

- **Enabled** modules appear in `/apps`, in the launcher and in the top bar.
- **Disabled** modules are invisible: the UI redirects to `/apps`, and every API route, public links included, answers `404 MODULE_DISABLED`. Data is kept, so turning a module back on restores everything.

Each module can add its own settings screen under *Settings → Modules* (for example *Knowledge base*).

Module state is stored in `app_settings` under the key `modules`:

```json
{ "kb": { "enabled": true, "settings": { "defaultColor": "#3B82F6", "maxUploadMb": 50 } } }
```

Public settings (`GET /api/settings`) expose only `{ "<id>": { "enabled": true } }`. The module settings themselves are admin-only.

## Anatomy of a module

```
src/backend/modules/
├── catalog.js           # static facts: id, default settings, sanitize(), permissions
├── manifest.js          # version, category, requires, enhances, minCore, changelog
├── dependencies.js      # switching on/off with requirements (409 rules)
├── index.js             # registry: mounts routes, runs schemas, validates manifests, loads <id>/demo.js
└── kb/
    ├── index.js         # descriptor { id, schema, routes, publicRoutes, publicPrefix }
    ├── demo.js          # optional: registerDemo({ module, seed, purge }) — demo data
    ├── schema.js        # tables (idempotent) + one-time seed
    ├── routes.js        # Express routers
    └── …                # services

src/frontend/src/modules/
├── registry.js          # { id, path, icon, labelKey, descKey, App, Settings }
└── kb/
    ├── KbApp.jsx        # routes under /app/kb/*
    ├── KbSettings.jsx   # settings screen under /admin/settings/kb
    └── …
```

### Backend contract

```js
// src/backend/modules/<id>/index.js
export default {
  id: 'tasks',                 // URL id: /app/tasks, /api/app/tasks
  schema: ensureTasksSchema,   // async, idempotent; runs on every start
  routes: privateRoutes,       // () => Router, mounted behind requireAuth
  publicRoutes,                // optional () => Router for anonymous visitors
  publicPrefix: '/t',          // where publicRoutes live under /api
};
```

The registry wraps every router with `enabledOnly(id)`, and wraps the private router with `requireAuth` as well. Inside the routes, check permissions or the module's own access model. The `req.user` object carries `permissions`, `roleIds` and `groupIds`.

### Catalog entry

`modules/catalog.js` holds static data with **no imports**, so the core settings and permission services can read it without loading module code:

```js
{
  id: 'tasks',
  defaultEnabled: false,
  permissions: ['tasks.admin'],          // added to the permission catalog (group module_tasks)
  defaults: { boardsPerUser: 10 },
  sanitize(current, incoming) { … },     // pure; returns the next settings object
}
```

Unknown keys in a settings patch are ignored. Each field is validated by `sanitize`.

`core: true` marks a module that can never be switched off (Approvals): it is always enabled and Settings → Modules shows *Always on* instead of a switch.

### Frontend

1. Add an entry to `src/frontend/src/modules/registry.js`. `App` and `Settings` should be `lazy()` so the module stays out of the main bundle.
2. Add a settings item to `admin/navigation.js` (group `modules`), then map it in `admin/settingsPages.js`.
3. Add i18n keys `apps.<id>.name`, `apps.<id>.desc` and the permission label in both languages. Keep EN and RU in parity.

Routing is automatic. `App.jsx` mounts `${path}/*` behind `SetupGate`, `AuthGate` and `ModuleGate`.

## Checklist for a new module

- [ ] `modules/<id>/` with descriptor, schema, routes
- [ ] Catalog entry with defaults and `sanitize`
- [ ] Manifest entry (`modules/manifest.js`): version 1.0.0, category, requires / enhances, minCore, changelog
- [ ] Admin docs `help/admin/<id>.js` and user help `help/content/<id>.js`
- [ ] Demo data `modules/<id>/demo.js` (optional, recommended)
- [ ] Added to `MODULES` in `modules/index.js`
- [ ] Frontend registry entry, settings page, navigation item
- [ ] EN + RU translations
- [ ] Unit tests for pure logic (`src/backend/test/`)
- [ ] Docs page in `docs/` and a line in the README
