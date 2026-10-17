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
- [Module manifest](#module-manifest)
- [Module versions](#module-versions)
- [Demo data](#demo-data)
- [Admin docs](#admin-docs)
- [Optional links inside a module (ModuleHint)](#optional-links-inside-a-module-modulehint)
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

**3. Add copy** — `src/frontend/src/locales/en/settings.js` and `locales/ru/settings.js` (see [i18n.md](i18n.md)):

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
router.use(requireAuth);           // or requirePermission('notes.manage')

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

Guard admin routes with a permission instead of a role:

```js
import { requirePermission } from '../middleware/auth.js';
router.get('/reports', requirePermission('reports.view'), handler);
```

New permissions: [access-control.md → Adding a permission](access-control.md#adding-a-permission).

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

## Module page header

Module screens with a sidebar (`mod-shell`) start with `ModuleHeader`
(`src/frontend/src/modules/shared/ModuleHeader.jsx`, styles in `modules/shared/module.css`, `.mh-*`).
Drive and Files use it; other modules can adopt it. Admin and cabinet pages keep `PageHeader`.

```jsx
import ModuleHeader, { PathChip, SelectionBar, SortButton, ViewToggle } from '../../shared/ModuleHeader';

<ModuleHeader
  crumbs={[{ key: 'root', label: 'Drive', to: '/app/drive' }, { key: 'cur', label: 'Reports' }]}
  icon={<span className="mod-dot" />}
  title="Reports"
  titleExtra={<StarButton />}
  meta={<PathChip value={unc} onCopy={copy} />}
  description="Lead text"
  actions={[
    { key: 'upload', primary: true, icon: <UploadOutlined />, label: t('files.upload'), onClick: pick, menu: [/* antd menu items → split button */] },
    { key: 'folder', icon: <FolderAddOutlined />, label: t('files.newFolder'), onClick: create },
  ]}
  more={[/* antd menu items for the ⋯ button */]}
  search={{ value, onChange, onSearch, loading, placeholder }}
  status={t('files.itemsN', { n })}
  selection={selected.length > 0 && <SelectionBar label={…} actions={[…]} onClear={clear} />}
  tools={<><SortButton … /><ViewToggle value={view} onChange={setView} /></>}
/>
```

| Prop | Meaning |
| --- | --- |
| `crumbs` | `[{ key, label, to? }]`, the last item is the current page. Long trails collapse into a `…` menu (wide: first + last 3; compact: first + last 2; phone: `… / parent / current`). |
| `title`, `icon`, `titleExtra` | One-line title (ellipsis, full text in `title`); `null` shows a skeleton. `icon` sits before it (colour dot), `titleExtra` after it (favourite star). |
| `meta`, `description` | Row under the title (chips, `PathChip`, usage bar) and a muted lead paragraph. |
| `actions` | Action objects: `{ key, label, icon, onClick, href, primary, danger, loading, disabled, tooltip, menu }`. `menu` makes a split button. `{ key, node }` renders a hidden helper element (e.g. the folder `<input>` from `useUploadActions`). Hide write actions by leaving them out (`canWrite && {…}` — falsy entries are skipped). |
| `more`, `moreLabel` | antd menu items for the `⋯` overflow button and its accessible name. |
| `search` | `{ value, onChange(text), onSearch(text), loading, placeholder }`: a growing field; an icon that expands on phones. |
| `filters`, `status` | Extra controls / muted text after the search (e.g. a `Segmented` filter, "Items: 12"). |
| `selection` | Replaces search + filters while items are selected; use `SelectionBar` (`label`, `actions`, `onClear`) — its buttons turn into icons with tooltips below the wide mode. |
| `tools` | Right side of the toolbar: `SortButton` (`options=[{key,label}]`, `value`, `desc`, `onChange(key)`), `ViewToggle` (`value`, `onChange`), or anything else. |
| `dock` | Default `true`: on phones the actions (with a `primary` one) move into a bottom dock. Pass `false` for pages where a dock would be in the way. |
| `className`, `style` | On the `<header>`; `style={{ '--c': color }}` tints the path chip hover. |

Layout modes follow the header's own width (`data-size` on `.mh`): **wide** ≥ 640px (icon + text buttons),
**compact** ≥ 480px (secondary actions become icon buttons with tooltips), **phone** < 480px (bottom dock,
search icon, short crumbs). The action cluster never wraps; the title block shrinks with an ellipsis.
`useHeaderMode()` returns the mode inside the header. All controls are 32px high; use `@ant-design/icons`
for icons, not Unicode glyphs.

---

## Add a public page

Public routes live outside `/admin` and `/account` in `App.jsx`. Wrap them in `<SetupGate>` and, if the page should respect the *Closed* access mode, in `<AccessGate>`:

```jsx
<Route path="/pricing" element={<SetupGate><AccessGate><Pricing /></AccessGate></SetupGate>} />
```

Render content inside `<PublicLayout>` to get the header and footer.

---

## Add translations

Texts live in `src/frontend/src/locales/<lang>/<namespace>.js` (one file per top-level key) and, for the server, in `src/backend/locales/<lang>/<area>.js`. The full guide — adding a key, a namespace or a language, plurals, help articles, the check — is [i18n.md](i18n.md).

```js
const { t } = useLocale();
t('dashboard.greeting', { name: user.displayName }); // "Welcome back, {name}"
t('files.selected', { count: 3 });                    // files.selected_one / _few / _many / _other
```

- Missing keys fall back to English (already merged into every language bundle), then to the key itself — a raw key on screen means a missing English text.
- Add every key to **both** `en` and `ru`; `npm run i18n:check` fails otherwise.

---

## Add a color template, typeface or icon

| What | Where | Notes |
|------|-------|-------|
| Color template | `src/frontend/src/theme/templates.js` | Define both `light` and `dark` palettes with every token. It appears in *Color theme* automatically. |
| Typeface preset | `src/frontend/src/theme/typography.js` | Provide `google` font specs (with Cyrillic coverage if you ship RU) and a system fallback stack. |
| Icon | `src/frontend/src/components/icons/premiumIcons.jsx` or `AdminIcons.jsx` | Add to `PREMIUM_ICONS` / `ICON_CATALOG`; it becomes selectable in *Menu icons*. Mark tinted shapes with `data-accent` so monochrome mode works. |

Avoid hard-coded colors in CSS. Use the tokens from `index.css` (`--da-primary`, `--da-surface`, `--da-muted`, `--da-hairline`, …) so every template and dark mode work for free.

---

## Themes

A person picks a theme in **Account → Appearance**; the administrator sets the portal default, which themes are offered, whether custom backgrounds and animated backgrounds are allowed (**Settings → Theme**, stored in `settings.appearance.defaultTheme` / `settings.appearance.themes`).

| Kind | Themes | Colours from |
|------|--------|--------------|
| base | `light`, `dark`, `system` | the brand template above (+ admin overrides) |
| palette | `graphite`, `ocean`, `forest`, `sand`, `midnight`, `lavender`, `contrast` | `theme/themes.js` |
| dynamic | `dawn` (gradient drift), `borealis` (aurora), `constellation` (star grid) | `theme/themes.js` + a moving layer (`theme/Backdrop.jsx`) |
| custom | `custom` | brand palette + the person's accent colour and picture |

How it fits together:

- `theme/themes.js` → `themeTokens(theme, scheme, brand, custom)` resolves **one token set** per theme. `context/ThemeContext.jsx` feeds it to antd (`ConfigProvider` tokens, `Button.primaryColor`) and to the CSS variables of `index.css` (`--da-primary`, `--da-on-primary`, `--da-bg`, `--da-elevated`, `--da-layout`, `--da-text`, `--da-muted`, …). Never hard-code colours: use the variables and every theme works.
- `<html data-theme>` stays `light` / `dark` (the scheme), so existing `[data-theme='dark']` rules apply to every dark theme. `<html data-skin>` names the theme (`contrast`, `ocean`, …) for theme-specific touches; `<html data-backdrop>` is set while a background layer is shown (page grounds turn transparent, panels stay solid).
- **Contrast is enforced, not hoped for.** `themeTokens` moves the primary/error/success/warning colours until they reach WCAG AA on every surface, derives secondary text at ≥ 4.5:1, and picks the primary-button label (white or dark ink). Run `node scripts/check-theme-contrast.mjs [--all]` in `src/frontend` after touching a palette; `test/themes.test.js` fails the build when a pair drops below AA.
- **Add a theme:** an entry in `THEMES` (`theme/themes.js`) with `scheme` and the colour tokens, its id in `THEME_IDS` of `src/backend/services/themeCatalog.js` (a test compares the lists; ids ≤ 16 characters), then run the contrast script. A dynamic theme adds `motion` (`gradient` | `aurora` | `particles`) and `backdrop: { colors, opacity }` — text on the moving layer is checked too.
- **Motion budget:** layers move with CSS `transform` only (compositor, no repaint) or a canvas at ~15 fps and device-pixel ratio 1. Everything stops when the tab is hidden or after 60 s without input, and never moves under `prefers-reduced-motion`, «Без анимации» (`users.ui.motion`), the admin switch, data saver, or on devices with ≤ 2 cores / ≤ 2 GB memory.
- **Custom backgrounds** (`POST /api/account/background`, multipart `image`): type by magic bytes (JPEG/PNG/WebP/GIF), ≤ 8 MB, ≤ 4096 × 4096 read from the header before decoding; Pillow (already in the production image) re-encodes to WebP — long side 2560, a 1280 px phone version and a blurred 32 px placeholder — and strips metadata (`services/themeImage.js` + `themeImage.py`; `IMAGE_PYTHON` points at another Python). Files live in `uploads/backgrounds/<userId>/` and are served only to their owner. A veil of the ground colour (60–92 %) keeps text on the page ground readable.
- Personal preferences live in `users.ui` (`{ motion, toursOff, custom: { image, accent, scheme, dim, blur } }`, `PUT /api/account/ui`); the theme id in `users.theme`.

---

## Guided tours

Tours are anchored to the page with `data-tour="…"` attributes. The engine dims the page, cuts a spotlight around the anchor and shows a popover (a bottom sheet on phones) with «2 из 7», **Далее / Назад / Пропустить / Готово**, ← / → / Esc, focus trapping and screen-reader announcements. It waits for anchors of lazy pages, scrolls them into view and **skips steps whose anchor is not rendered** — a button hidden by permissions, a switched-off module, a phone layout — so a tour always stays within the person's access without repeating permission checks. The robot assistant hides while a tour runs.

**Add a tour to a module** (wave-3 pattern):

1. Mark the elements: `data-tour="crm.pipeline"`. Module header actions take `tour: 'crm.create'` (`modules/shared/ModuleHeader.jsx`).
2. Describe the tour in `src/frontend/src/tour/content/crm.js` and add it to `content/index.js`:

   ```js
   export default {
     id: 'crm',              // progress is remembered per id
     module: 'crm',          // auto-starts on the first visit to /app/crm
     version: 1,             // bump to show a changed tour once more
     route: '/app/crm',      // opened first when started from elsewhere
     title: 'tour.crm.title',
     steps: [
       { id: 'intro', title: 'tour.crm.intro.title', text: 'tour.crm.intro.text' },              // centred
       { id: 'pipeline', target: 'crm.pipeline', placement: 'bottom', title: '…', text: '…' },
       { id: 'admin', target: 'crm.settings', when: ({ can }) => can('crm.admin'), title: '…', text: '…' },
     ],
   };
   ```

   `placement`: `top | bottom | left | right | auto`; `route` per step opens another page; `when(ctx)` (`{ can, canAny, user, settings, phone }`) hides a step whose anchor exists for everyone. Texts may use `{app}` (the portal name).
3. Texts in `src/frontend/src/locales/<lang>/tour.js` under `tour.<id>.*`, Russian and English (`test/tours.test.js` checks both).
4. Nothing else: modules in a `SideRail` get a «Тур» button next to their name automatically; elsewhere put `<TourButton module="crm" />` (renders only when the module has a tour). The help drawer offers the tour of its section, and the Modules page («Тур») finds it through the manifest bridge.

**API** (`src/frontend/src/tour`): `registerTour(def)`, `hasTour(moduleId)`, `tourForModule(moduleId)`, `startTour(idOrModuleId)` (works outside React), `useTour()` → `{ startTour, hasTour, running, state, setDisabled }`, `<TourButton module iconOnly />`, `registerManifestTours(manifests)`. The provider installs itself as the runner of `modules/manifest.js` (`setTourRunner`), accepting a tour id, a tour object or a loader in a manifest's `tour`.

**Every module has a tour** or is listed with a reason in `WITHOUT_TOUR` of `test/tours-coverage.test.js` (today only the assistant); the same test checks that every anchor a tour names is marked somewhere in the frontend source and that every tour has texts in both languages. Tours of pages that are not modules (Account → Notifications) work the same way, with a `<TourButton module="notifications" />` on the page.

**Rules:** the portal tour starts on the first sign-in once the app shell is on screen; a module tour on the first visit to that module; never two at once (the module tour waits for the next visit after the portal tour), never on public pages and never while «signed in as» someone else. Progress is stored per person on the server (`user_tours`; `GET/PUT /api/account/tours`), «Не показывать туры» in Account → Appearance turns auto-start off, and **Settings → Theme → «Сбросить туры всем»** (`POST /api/admin/tours/reset`, `settings.general`) shows them to everyone again.

---

## Add an integration

1. **Defaults** — add a group to `DEFAULTS.integrations` in `services/settings.js`.
2. **Secrets** — list secret fields in `SECRET_PATHS`. They are masked (`<field>Set: true`) in responses and kept when a blank value is submitted. Add the group to `INTEGRATION_GROUPS` so writes are accepted.
3. **Public flag** — add `{ enabled }` for the group in `toPublicSettings()`.
4. **Test** — implement `testX(override)` in `services/integrations.js` and dispatch it from `testIntegration()`. Use timeouts on every network call.
5. **UI** — add a settings item with `integration: '<group>'` in `navigation.js`, map it to the shared `Integration` component in `settingsPages.js`, and describe its fields in `FIELDS` inside `pages/admin/settings/Integration.jsx`.
6. **Copy** — `settings.<id>.title/.desc` and any new field labels under `integrations.*`.

---

## Scanning and labels

Shared building blocks for barcodes (used by the Warehouse module; usable anywhere).

| What | Where |
|------|-------|
| Camera scanner, keyboard-wedge hook, scan button | `components/ui/BarcodeScanner.jsx` |
| Label preview and print dialog | `components/ui/Labels.jsx` |
| Encoders (Code 128, EAN-13, QR → SVG), print document | `lib/labels.js` (pure, unit-tested) |
| Wedge burst detection, repeat guard | `lib/scanBurst.js` (pure, unit-tested) |
| Strings | `locales/<lang>/scanner.js`, `labelPrint.js` (`scanner.*`, `labelPrint.*`) |

**Camera scanner.** Full screen on phones, a dialog on larger screens. Uses the native `BarcodeDetector` where it exists and otherwise loads WebAssembly ZXing (`zxing-wasm`) on first use, as a separate chunk + `.wasm` served from our origin. It reads EAN-13/8, UPC-A/E, Code 128, Code 39, QR and DataMatrix.

```jsx
import BarcodeScanner, { ScanButton, useScannerInput } from '../components/ui/BarcodeScanner';

// Receipt: keep scanning; the same code is ignored for 1.2 s, each hit beeps, vibrates and flashes.
<BarcodeScanner
  open={open}
  continuous
  title="Приход"
  onScan={(code, { format }) => addLine(code)} // format: 'ean_13' | 'qr_code' | … | 'manual' | 'keyboard'
  onClose={() => setOpen(false)}
/>

// A form field: the button opens the scanner, the first code fills the field and the dialog closes.
<Input addonAfter={<ScanButton onScan={(code) => form.setFieldValue('barcode', code)} />} />

// USB / Bluetooth scanners in keyboard mode: a fast burst of keys ending with Enter.
useScannerInput((code) => addLine(code), { enabled: !drawerOpen, minLength: 4, maxInterval: 35 });
```

- Typing in ordinary inputs is never taken for a scan. To scan into a field, mark it `data-scan-target`: the code goes to `onScan` and the field is cleared (`data-scan-target="keep"` keeps the text).
- Only the most recently enabled `useScannerInput` gets scans, so an open scanner dialog takes them from the page underneath.
- The scanner explains each problem state: no HTTPS, permission denied (with how-to for Android, iPhone and desktop), no camera, camera busy. Manual entry is always available. The camera stops on close, on unmount and while the tab is hidden.
- Production needs `Permissions-Policy: camera=(self)` (set in `nginx.conf`) and `'wasm-unsafe-eval'` in the CSP (already there).

**Labels.** Formats: `58x40` and `80x50` (thermal, one label per page) and `a4-3x8` (A4 sheets of 24 labels, 63.5 × 33.9 mm). The preview renders the exact markup that is printed.

```jsx
import { LabelPreview, PrintLabelsDialog } from '../components/ui/Labels';
import { printLabels, renderBarcodeSVG, loadQrEncoder } from '../lib/labels';

const items = [
  { code: 'WH-000123', title: 'Цемент М500', subtitle: 'Основной склад', kind: 'qr', extra: ['A-01-03', 'мешок'] },
  { code: '4600000000008', title: 'Саморез 4,2×75', kind: 'ean13' },  // 12 digits get their check digit
  { code: 'TOOL-0001', title: 'Перфоратор', kind: 'code128', copies: 2 }, // per-item copies
];

<LabelPreview item={items[0]} format="58x40" />
<PrintLabelsDialog open={open} items={items} onClose={() => setOpen(false)} /> // remembers format and copies on the device

await printLabels(items, { format: 'a4-3x8', copies: 1 }); // hidden iframe → print dialog

const svg = renderBarcodeSVG('TOOL-0001', 'code128', { height: 60, moduleSize: 2 }); // SVG markup string
await loadQrEncoder(); // QR needs the lazily loaded `qrcode` package first
const qr = renderBarcodeSVG('https://…', 'qr', { moduleSize: 4 });
```

- An EAN-13 with a wrong check digit prints as Code 128, and Code 128 content that is not ASCII (Cyrillic) prints as QR. The dialog warns about both.
- `renderBarcodeSVG` throws a `BarcodeError` with `code` set to `empty`, `charset`, `format`, `checksum`, `kind` or `qr-not-loaded`.
- In the browser's print dialog choose the label printer, 100 % scale and no margins.

---

## Public link permissions

`components/ui/LinkPermissions.jsx` is the shared picker for what a public share link allows (used by Files, reusable by Drive). It is presentational: the server must enforce every key on every route. Strings live in `locales/<lang>/linkPerms.js` (`linkPerms.*`). The normalisation rule (`normalizePermissions`: everything except `upload` needs `view` and is dropped without it) lives in `src/frontend/src/lib/linkPermissions.js` and mirrors the server's `modules/shared/linkPermissions.js`, which Files and Drive both use; `test/link-review.test.js` checks that all three agree.

Keys: `view` (list + preview), `download`, `upload` (new files), `mkdir`, `rename` (rename and move), `replace` (new version of a file), `delete` (to the trash). Everything except `upload` needs `view`; `upload` without `view` is an upload-only drop box. File links support `view`, `download` and `replace` only.

```jsx
import { LinkPermissionsPicker, PERMISSION_PRESETS, PermissionChips, permissionChips, normalizePermissions } from '../components/ui/LinkPermissions';

<LinkPermissionsPicker
  value={perms}                 // ['view', 'download']
  onChange={setPerms}
  allowed={grantable}           // keys this person may grant; others are shown locked
  isFolder={node.kind === 'folder'}
  extras={{ maxSize: null, extensions: '', quota: null, requireName: false, requireEmail: false, notify: true }} // only keys present are rendered
  onExtrasChange={setExtras}
  maxUploadMb={config.maxUploadMb}
/>

<PermissionChips perms={link.permissions} />              // pills for a link list (compact = icons with tooltips)
permissionChips(perms) // [{ key, labelKey, icon, write }] — translate labelKey with t()
```

`PERMISSION_PRESETS`: `view`, `viewDownload` (default), `uploadOnly` and `viewUpload` (folders only), `full`, `custom`. `presetOf(perms, isFolder)` names the preset of a list, `permissionSentence(perms, t)` gives “view, download, upload” for visitor pages. The extras are shown only when the selection includes `upload` or `replace`.

---

## Module manifest

Every module describes itself in **one object**, readable by the server and the client
(spec `docs/specs/platform-2.0.ru.md` §1.2). The facts live on the server, the browser adds its UI parts.

**Server** — `src/backend/modules/manifest.js` (no imports; validated when the platform loads and by `test/platform-modules.test.js`):

```js
export const MODULE_MANIFEST = {
  procurement: {
    name: { en: 'Procurement', ru: 'Закупки' },     // fallback name; the UI uses i18n apps.<id>.name
    version: '1.0.0',                               // semver of the module (see Module versions)
    category: 'supply',                             // work | documents | sales | supply | construction | people | infrastructure
    minCore: '1.4.0',                               // lowest core VERSION it runs on
    requires: [                                     // hard: the module is not switched on without them
      { id: 'approvals', reason: { en: 'Documents go through approval routes', ru: '…' } },
      // { integration: 'activeDirectory', reason: { … } }   // an integration that must be on
      // { integration: 'activeDirectory', reason, demo: true } // soft: may be switched on without it (setup page / demo data)
    ],
    enhances: [                                     // optional: without it the feature hides
      { id: 'companies', what: { en: 'Pick suppliers from the directory', ru: '…' } },
    ],
    docs: { user: 'procurement', guide: 'docs/procurement.md' },
    changelog: [{ version: '1.0.0', date: '2026-10-16', changes: { en: ['…'], ru: ['…'] } }],
  },
};
```

Permissions, defaults and `sanitize` stay in `catalog.js`. Integrations a manifest may name:
`email, telegram, whatsapp, wazzup, mattermost, google, documents, activeDirectory`.
Startup (`modules/index.js`) refuses unknown ids, self links, bad semver or categories, missing texts,
requirement **cycles** (`enhances` may go both ways) and a core module requiring an optional one; a
`minCore` above the running core only warns and marks the module *incompatible*.

`GET /api/admin/modules` (any settings permission) returns the manifests merged with the state:
`{ coreVersion, categories, core: [core services], modules: [{ id, version, category, minCore, compatible,
requires, enhances (+active), enhancedBy, dependents, requiredBy, changelog, docs, permissions, core, enabled,
status: on|off|needs, missing, demo }], demo: { active, users, canManage } }`.

**Client** — `src/frontend/src/modules/manifest.js`:

```js
export const MODULE_UI = {
  procurement: { tour: null },    // the module's guided tour (tours workstream fills it)
};
```

- `tour` is whatever the tour runner understands (an id, a tour object or `() => import('../tours/x')`).
  The tours framework installs its runner once with `setTourRunner((tour, { moduleId }) => …)`;
  `useModuleTour(id)` → `{ available, start }` drives the *Tour* buttons (Modules page, «О модуле»).
- Derived automatically: `hasAdminDocs(id)` (`help/admin/<lang>/<id>.js`), `hasUserHelp(id)` (`help/content/<lang>/<id>.js`),
  `moduleUi(id)` (icon, labelKey, descKey, Settings, path from `registry.js`), `useModulesCatalog()` (the API above).

Switching modules goes through `PUT /api/admin/settings { modules: { id: { enabled, alsoEnable } } }`;
the rules are in `modules/dependencies.js` (`planModuleChanges`) — see [modules.md](modules.md#turning-modules-on-and-off).
In the UI use `useModuleSwitch(save)` (`modules/platformUi.jsx`): it turns the 409 answers into the dialogs.

## Module versions

Each module has its own semver `version`, independent of the core `VERSION`. All modules ship in the
core image, so the UI notes «updated with core vX» next to the number; `minCore` prepares separate
module updates later.

| Bump | When |
|---|---|
| patch `1.0.1` | fixes, texts, performance |
| minor `1.1.0` | new features, new settings with defaults, new optional links |
| major `2.0.0` | needs an administrator's attention: removed settings, an irreversible data migration, an API change, a new `requires` |

With every bump add an entry at the **top** of `changelog` (its `version` must equal `version`, the test checks it);
keep the last five. Raise `minCore` when the module starts using a core API that older cores lack.
The System page shows version, minCore, state and the newest changelog line of every module.

## Demo data

Neutral sample records per module, filled and removed by a superadministrator (spec §8):
Settings → Modules → *Demo data* (one module, or «Демо всего портала» / «Удалить все демо-данные»),
and the module's «О модуле» page. While any exists, administrators see the «Демо-режим» bar.

Add `src/backend/modules/<id>/demo.js` — it is loaded automatically at start:

```js
import { registerDemo } from '../../services/demo.js';
import { contextFromRequest } from '../shared/acl.js';
import { createProject, createTask } from './service.js';

registerDemo({
  module: 'tasks',
  describe: { ru: 'Проект «Демо: запуск офиса» с восемью задачами', en: 'A «Demo: office launch» project with eight tasks' },
  after: ['companies'],                       // optional: seed after these when they are seeded too
  async seed(ctx) {
    const tasks = contextFromRequest(ctx.request, 'tasks.admin');      // the superadmin's request
    const project = await createProject(tasks, { name: ctx.t({ ru: 'Демо: запуск офиса', en: 'Demo: office launch' }) }, { locale: ctx.locale, allowed: true });
    await ctx.track('task_projects', project.id);                       // every created row is tracked
    const anna = await ctx.demoUser('anna', { displayName: ctx.t({ ru: 'Анна Демова', en: 'Anna Demo' }) });
    const task = await createTask(tasks, { projectId: project.id, title: '…', assigneeId: anna, dueAt: ctx.day(2, '18:00').toISOString() });
    await ctx.track('tasks', task.id);
  },
  async purge(ctx) { /* optional: e.g. call the module's own delete for ctx.records('cmp_companies') */ },
});
```

| `ctx` | |
|---|---|
| `request`, `userId`, `locale` | the superadministrator's request (module services build their context from it) and the language |
| `t({ ru, en })` | the text in that language |
| `track(table, key, keyColumn = 'id')` / `untrack(table, key)` | list a row as demo / stop listing it |
| `records(table, module?)` | tracked keys of a table (this module's or another's) |
| `demoUser(key, { displayName })` | a demo colleague `demo.<key>@example.com`, no password (cannot sign in); shared by modules |
| `day(offset, 'HH:MM')` | a Date relative to today |
| `query` | the pool's query, for tables without a service |

**How it is tracked.** Nothing is added to module tables: `demo_records (seq, module, table_name,
record_key, key_column)` lists every demo row. This works with any existing table and foreign keys.
Purge deletes the tracked rows **newest first** (children before parents; `ON DELETE CASCADE` children
go with their parent). A row that real data still points at with a restricting foreign key is
**kept** and stays tracked (reported as `kept`) — never forced. Records people add *inside* a demo
container that cascades (a real task in a demo project) go with it; purge before real use.
Seeding a module twice does nothing (`already: true`); a seed that throws takes back what it made.
Demo users (`_users`) are removed with the last module's demo data. Use neutral content only:
«ООО «Пример»», «Объект «Северный квартал»», `example.com`.

API (superadministrators, own session — no API token, no «sign in as»): `GET /api/admin/demo`,
`POST /api/admin/demo/<module>/seed|purge`, `POST /api/admin/demo/seed-all` (enabled modules in
dependency order), `POST /api/admin/demo/purge-all`. Each is written to the activity log (`demo_data`).
Reference seeds: `tasks`, `calendar`, `companies`, `kb` (also a visual article with a picture stored in Files), `dashboard` (starting layout only when none is set), `files` (a space of generated documents and public links; purge removes the blobs), `chat` (backdated history written directly, no notifications), `resources`; a linked set across modules: `crm` → `masterplan` → `contracts` → `procurement` → `warehouse` (each reads the others' tracked records with `ctx.records(table, module)`). Helpers: `modules/shared/demoAssets.js` (tiny PNG / PDF / DOCX / XLSX files, `storeDemoBlob`, `removeDemoBlobs`, `dropNotifications`, `dropEntityChats`), `modules/shared/demoPeople.js` (`demoColleagues(ctx, roles)` — the Org structure / Employees demo people by role, made when missing) and `modules/shared/demoApprovals.js` (a demo route only when none is saved, walking documents through the real engine, tracked processes; when a real route is in force the documents stay drafts, and no decision is ever made in a real colleague's name). While a seed runs, `notify()` reaches only demo people, in the app only (`services/demoScope.js`); seeds and purges of one module are serialized by an advisory lock.

A module that cannot have demo data registers only the explanation: `registerDemo({ module: 'drive', describe, seedable: false, seed() {} })` — the Modules page shows the text without a «fill» button and «Демо всего портала» passes over it.

## Admin docs

Each module has an administrator page «О модуле» at `/admin/modules/<id>/docs`, linked from its card in
Settings → Modules, the «О модуле» button in its settings header (`SettingsPageHeader` adds it for every
item of the `modules` group) and the ⌘K palette. Write `src/frontend/src/help/admin/<lang>/<id>.js`
(schema: [`help/ADMIN_SCHEMA.md`](../src/frontend/src/help/ADMIN_SCHEMA.md)):

```js
export default {
  id: 'tasks',
  purpose: { ru, en }, audience: { ru, en },
  setup: [{ title: { ru, en }, text: { ru, en } }],          // 3–7 steps
  roles: { 'tasks.admin': { ru, en } },                      // optional notes per permission
  access: { ru, en },                                        // optional
  scenarios: [{ title: { ru, en }, text: { ru, en } }],      // 2–4
  faq: [{ q: { ru, en }, a: { ru, en } }],
};
```

The page adds by itself: version, status, category and changelog (manifest), **every permission** of the
module with its i18n title and description, requirements and links (with their on/off state, and the
modules this one enhances), the highlights and section links of the user guide `help/content/<lang>/<id>.js`.

## Optional links inside a module (ModuleHint)

Where a feature hides because an `enhances` module is off, show a quiet hint instead of nothing:

```jsx
import ModuleHint from '../../../components/ModuleHint';

<ModuleHint module="companies" what={t('platform.hintWhat.procurementSupplier')} />
// «Включите «Контрагенты», чтобы выбирать поставщиков из справочника.»  [Включить]
```

It renders nothing while the module is on; people with `settings.modules` get a link to the module's
card. `what` completes «… to …» (lower case, no full stop). Used in the Procurement request form, the
Contracts form and the task chat.

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
- [ ] A changed module bumps its manifest `version` and adds a `changelog` entry.
- [ ] No customer names or domains in code, defaults, demo data, tests or docs ([deployments](deployments/README.md)).
