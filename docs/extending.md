# Extending the skeleton

Recipes for the changes you will make in almost every product built on this repository. Each recipe lists the files to touch, in order, with a minimal working example.

- [Mental model](#mental-model)
- [Add a settings screen](#add-a-settings-screen)
- [Add a stored setting](#add-a-stored-setting)
- [Add an API endpoint and a table](#add-an-api-endpoint-and-a-table)
- [Add a top-level admin page](#add-a-top-level-admin-page)
- [Add a cabinet page](#add-a-cabinet-page)
- [Add a public page](#add-a-public-page)
- [Add translations](#add-translations)
- [Add a color template, typeface or icon](#add-a-color-template-typeface-or-icon)
- [Add an integration](#add-an-integration)
- [Write a backend test](#write-a-backend-test)
- [Conventions checklist](#conventions-checklist)

---

## Mental model

```
browser ──► nginx ──► /api/* ──► routes/*.routes.js ──► services/*.js ──► PostgreSQL
                └──► SPA (React) ── services/api.js ──────────┘
```

- **Routes** are thin: parse input, call a service, return `{ success, ... }`, pass errors to `next(err)`.
- **Services** hold all logic and SQL. They throw `Error` objects with `statusCode` for client errors.
- **The admin console structure is data** — [`src/frontend/src/admin/navigation.js`](../src/frontend/src/admin/navigation.js). The sidebar, settings hub, settings side-nav, ⌘K palette and menu-icon editor read from it.
- **Settings screens** are built from the same five pieces:

| Piece | Responsibility |
|-------|----------------|
| `SettingsPageHeader` | Group eyebrow, icon, title and description from the registry |
| `SettingsSection` / `SettingRow` | Card with *label left, control right* rows (stack on mobile) |
| `useAdminSettings()` | Loads admin settings (secrets masked) and exposes `save(patch)` |
| `useSettingsForm(initial, onSave)` | antd form wiring, dirty tracking, reset, toasts |
| `SaveBar` | Floating *unsaved changes* bar bound to `dirty` |

---

## Add a settings screen

Example: a **Maintenance** screen under *System* with a toggle and a banner message.

**1. Register it** — `src/frontend/src/admin/navigation.js`

```js
{
  id: 'system',
  labelKey: 'settings.groups.system',
  items: [
    { id: 'system', defaultIcon: 'server', keywords: '…' },
    {
      id: 'maintenance',
      defaultIcon: 'bolt',
      keywords: 'maintenance downtime banner обслуживание',
    },
  ],
},
```

The item automatically gets the path `/admin/settings/maintenance`, a card in the hub, an entry in the side-nav and the ⌘K palette, and an icon slot in *Menu icons*.

**2. Map the component** — `src/frontend/src/admin/settingsPages.js`

```js
maintenance: lazy(() => import('../pages/admin/settings/Maintenance')),
```

**3. Add copy** — `src/frontend/src/i18n/translations.js`, in **both** `en` and `ru` under `settings`:

```js
maintenance: {
  title: 'Maintenance',
  desc: 'Take the product offline with a banner',
  enabled: 'Maintenance mode',
  enabledDesc: 'Non-admins see the banner instead of the app.',
  message: 'Banner text',
},
```

**4. Build the screen** — `src/frontend/src/pages/admin/settings/Maintenance.jsx`

```jsx
import { useMemo } from 'react';
import { Form, Input, Switch } from 'antd';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import SettingsPageHeader from './SettingsPageHeader';

function MaintenanceForm({ settings, save }) {
  const { t } = useLocale();
  const current = settings.maintenance || {};
  const initial = useMemo(
    () => ({ enabled: Boolean(current.enabled), message: current.message || '' }),
    [current.enabled, current.message]
  );
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, (values) =>
    save({ maintenance: values })
  );

  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('settings.maintenance.enabled')} description={t('settings.maintenance.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('settings.maintenance.message')} stacked>
          <Form.Item name="message" noStyle>
            <Input.TextArea rows={2} maxLength={300} showCount />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function MaintenanceSettings() {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id="maintenance" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <MaintenanceForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
```

Rules that keep screens consistent:

- `initial` must be memoized; the hook compares the form against it to decide whether the save bar shows.
- Render the form only after data is loaded (`LoadState`), so antd never sees an unmounted form instance.
- Secrets are write-only: initialise them to `''`, and clear them after a successful save (see `Integration.jsx`).
- For appearance-like settings that should preview live, use `useThemeMode().setPreview()` instead of `useSettingsForm` (see `Theme.jsx`).

**5. Persist it on the server** — continue with [Add a stored setting](#add-a-stored-setting).

---

## Add a stored setting

Settings are key/value rows in `app_settings`. Structured groups are stored as JSON.

All of the following is in `src/backend/services/settings.js`.

**1. Default** — add the key to `DEFAULTS` (inserted on boot if missing):

```js
maintenance: JSON.stringify({ enabled: false, message: '' }),
```

**2. Parse** — expose it from `parseSettings()`:

```js
maintenance: parseJson(raw.maintenance, JSON.parse(DEFAULTS.maintenance)),
```

**3. Decide visibility.** `toAdminSettings()` is what the console receives. `toPublicSettings()` is what **everyone** receives, so never put secrets there:

```js
// toPublicSettings — needed by the SPA to show the banner to visitors
maintenance: parsed.maintenance,
```

**4. Sanitize writes** in `updateAdminSettings()`. Whitelist fields and clamp values; never store the raw body:

```js
if (patch.maintenance) {
  await setSetting(
    'maintenance',
    JSON.stringify({
      enabled: Boolean(patch.maintenance.enabled),
      message: String(patch.maintenance.message || '').slice(0, 300),
    })
  );
}
```

`setSetting()` invalidates the in-process cache, so the new value is visible on the next request.

**5. Test the sanitizer** — see [Write a backend test](#write-a-backend-test).

---

## Add an API endpoint and a table

Example: a `notes` resource that each signed-in user owns.

**1. Schema** — `src/backend/services/notes.js`

```js
import { query } from '../config/database.js';

export async function ensureNotesTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS notes_user_idx ON notes (user_id, created_at DESC)`);
}

export async function listNotes(userId) {
  const result = await query(
    `SELECT id, body, created_at FROM notes WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function createNote(userId, body) {
  const text = String(body || '').trim();
  if (!text || text.length > 2000) {
    const error = new Error('Note must be 1–2000 characters');
    error.statusCode = 400;
    throw error;
  }
  const result = await query(
    `INSERT INTO notes (user_id, body) VALUES ($1, $2) RETURNING id, body, created_at`,
    [userId, text]
  );
  return result.rows[0];
}
```

Register the table in `src/backend/services/schema.js` → `bootstrapSchema()`.

> Tables are created idempotently on boot. For anything beyond a handful of tables, introduce versioned migrations (see the roadmap) before shipping.

**2. Route** — `src/backend/routes/notes.routes.js`

```js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createNote, listNotes } from '../services/notes.js';

const router = Router();
router.use(requireAuth);           // or requireAdmin

router.get('/', async (req, res, next) => {
  try {
    res.json({ success: true, notes: await listNotes(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json({ success: true, note: await createNote(req.user.id, req.body?.body) });
  } catch (err) {
    next(err);
  }
});

export default router;
```

Mount it in `src/backend/routes/index.js`: `router.use('/notes', notesRoutes);`

**3. Client** — `src/frontend/src/services/api.js`

```js
export const listNotes = () => api.get('/notes');
export const createNote = (body) => api.post('/notes', { body });
```

**4. Document it** in [`docs/api.md`](api.md).

Endpoint rules:

- Every state change is `POST` / `PUT` / `DELETE`. Never mutate on `GET` — the CSRF model relies on `SameSite=Lax`.
- Always parameterize SQL (`$1`, `$2`). Never interpolate request data into SQL.
- Scope queries by `req.user.id` for user-owned data.
- Throw `Error` with `statusCode` 4xx for client mistakes; let unexpected errors become 500 (logged, message hidden from clients).

---

## Add a top-level admin page

Use this for operational screens (orders, devices, reports). Configuration belongs under Settings.

1. Add an entry to `ADMIN_PAGES` in `admin/navigation.js`:

   ```js
   { key: '/admin/orders', labelKey: 'nav.orders', descKey: 'nav.ordersDesc',
     defaultIcon: 'box', keywords: 'orders sales заказы' },
   ```

2. Add a lazy route inside the `/admin` route in `src/frontend/src/App.jsx`:

   ```jsx
   const AdminOrders = lazy(() => import('./pages/admin/Orders'));
   // …
   <Route path="orders" element={<AdminOrders />} />
   ```

3. Add `nav.orders` / `nav.ordersDesc` to both locales.
4. Start the page with `<PageHeader title=… description=… extra=… />` and put tables inside `<section className="panel">`. See `pages/admin/Users.jsx` for search, filters and a clickable table.

The sidebar item, palette entry and icon slot appear automatically.

---

## Add a cabinet page

1. Add the item to `ITEMS` in `src/frontend/src/layouts/AccountLayout.jsx`.
2. Add a child route under `/account` in `App.jsx`.
3. Wrap the page in `<div className="narrow-page">` and use the same `PageHeader` / `SettingsSection` / `useSettingsForm` pieces.

---

## Add a public page

Public routes live outside `/admin` and `/account` in `App.jsx`. Wrap them in `<SetupGate>` and, if the page should respect the *Closed* access mode, in `<AccessGate>`:

```jsx
<Route path="/pricing" element={<SetupGate><AccessGate><Pricing /></AccessGate></SetupGate>} />
```

Render content inside `<PublicLayout>` to get the header and footer.

---

## Add translations

`src/frontend/src/i18n/translations.js` holds one dictionary per locale.

```js
const { t } = useLocale();
t('dashboard.greeting', { name: user.displayName }); // "Welcome back, {name}"
```

- Missing keys fall back to English, then to the key itself — a raw key on screen means a missing translation.
- Add every key to **both** `en` and `ru`.
- To add a language: add a dictionary, register it in `dictionaries`, add a flag button in `components/LanguageSwitch.jsx`, add the antd locale in `App.jsx`, and allow the code in `updateUser()` (`services/users.js`).

---

## Add a color template, typeface or icon

| What | Where | Notes |
|------|-------|-------|
| Color template | `src/frontend/src/theme/templates.js` | Define both `light` and `dark` palettes with every token. It appears in *Color theme* automatically. |
| Typeface preset | `src/frontend/src/theme/typography.js` | Provide `google` font specs (with Cyrillic coverage if you ship RU) and a system fallback stack. |
| Icon | `src/frontend/src/components/icons/premiumIcons.jsx` or `AdminIcons.jsx` | Add to `PREMIUM_ICONS` / `ICON_CATALOG`; it becomes selectable in *Menu icons*. Mark tinted shapes with `data-accent` so monochrome mode works. |

Avoid hard-coded colors in CSS. Use the tokens from `index.css` (`--da-primary`, `--da-surface`, `--da-muted`, `--da-hairline`, …) so every template and dark mode work for free.

---

## Add an integration

1. **Defaults** — add a group to `DEFAULTS.integrations` in `services/settings.js`.
2. **Secrets** — list secret fields in `SECRET_PATHS`. They are masked (`<field>Set: true`) in responses and kept when a blank value is submitted. Add the group to `INTEGRATION_GROUPS` so writes are accepted.
3. **Public flag** — add `{ enabled }` for the group in `toPublicSettings()`.
4. **Test** — implement `testX(override)` in `services/integrations.js` and dispatch it from `testIntegration()`. Use timeouts on every network call.
5. **UI** — add a settings item with `integration: '<group>'` in `navigation.js`, map it to the shared `Integration` component in `settingsPages.js`, and describe its fields in `FIELDS` inside `pages/admin/settings/Integration.jsx`.
6. **Copy** — `settings.<id>.title/.desc` and any new field labels under `integrations.*`.

---

## Write a backend test

Tests use the built-in `node:test` runner and live in `src/backend/test/*.test.js`. Test pure functions — sanitizers, policy decisions, parsers — so the suite needs no database.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRateLimit } from '../services/settings.js';

test('rate limit cannot be set low enough to lock the API', () => {
  assert.equal(sanitizeRateLimit({}, { max: 1 }).max, 20);
});
```

Run with `npm test` in `src/backend`, or `make test` from the root. CI runs the same command.

---

## Conventions checklist

Before opening a pull request:

- [ ] Inputs are validated and clamped in the **service**, not only in the UI.
- [ ] SQL is parameterized; user-owned rows are scoped by `user_id`.
- [ ] No state change on `GET`.
- [ ] Secrets never appear in `toPublicSettings()`, logs or error messages.
- [ ] New screens use `PageHeader` / `SettingsSection` / `SaveBar`; no ad-hoc layouts or colors.
- [ ] Every string is translated in `en` and `ru`.
- [ ] `npm test` and `npm run build` pass; `docs/api.md` is updated for new endpoints.
