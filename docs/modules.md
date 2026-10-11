# Modules (apps)

The skeleton is a platform for **modules**: self-contained applications that plug into the same users, roles, settings, theme and navigation. Built in: [Knowledge Base](knowledge-base.md), [Tasks](tasks.md) and [Calendar](calendar.md). Modules notify people through the shared [notification center](notifications.md) and can schedule background work with `registerJob()`.

| URL | What it is |
|-----|------------|
| `/apps` | Launcher with every enabled module (also the 9-dot menu in the top bar) |
| `/app/<id>` | A module's UI, e.g. `/app/kb` |
| `/api/apps` | Enabled modules for the signed-in user |
| `/api/app/<id>/…` | A module's private API (signed-in users only) |
| `/api/<publicPrefix>/…` | Optional anonymous API, e.g. `/api/s/…` for public links |
| `/s/<slug>` | Public pages, when a module provides them |

## Turning modules on and off

**Admin → Settings → Modules** lists every module with a switch. The permission `settings.modules` is needed to change it.

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
├── index.js             # registry: mounts routes, runs schemas, /api/apps
└── kb/
    ├── index.js         # descriptor { id, schema, routes, publicRoutes, publicPrefix }
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

### Frontend

1. Add an entry to `src/frontend/src/modules/registry.js`. `App` and `Settings` should be `lazy()` so the module stays out of the main bundle.
2. Add a settings item to `admin/navigation.js` (group `modules`), then map it in `admin/settingsPages.js`.
3. Add i18n keys `apps.<id>.name`, `apps.<id>.desc` and the permission label in both languages. Keep EN and RU in parity.

Routing is automatic. `App.jsx` mounts `${path}/*` behind `SetupGate`, `AuthGate` and `ModuleGate`.

## Checklist for a new module

- [ ] `modules/<id>/` with descriptor, schema, routes
- [ ] Catalog entry with defaults and `sanitize`
- [ ] Added to `MODULES` in `modules/index.js`
- [ ] Frontend registry entry, settings page, navigation item
- [ ] EN + RU translations
- [ ] Unit tests for pure logic (`src/backend/test/`)
- [ ] Docs page in `docs/` and a line in the README
