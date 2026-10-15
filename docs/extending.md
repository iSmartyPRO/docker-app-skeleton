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

## Scanning and labels

Shared building blocks for barcodes (used by the Warehouse module; usable anywhere).

| What | Where |
|------|-------|
| Camera scanner, keyboard-wedge hook, scan button | `components/ui/BarcodeScanner.jsx` |
| Label preview and print dialog | `components/ui/Labels.jsx` |
| Encoders (Code 128, EAN-13, QR → SVG), print document | `lib/labels.js` (pure, unit-tested) |
| Wedge burst detection, repeat guard | `lib/scanBurst.js` (pure, unit-tested) |
| Strings | `i18n/scan.js` (`scanner.*`, `labelPrint.*`) |

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

`components/ui/LinkPermissions.jsx` is the shared picker for what a public share link allows (used by Files, reusable by Drive). It is presentational: the server must enforce every key on every route. Strings live in `i18n/linkPerms.js` (`linkPerms.*`). The normalisation rule (`normalizePermissions`: everything except `upload` needs `view` and is dropped without it) lives in `src/frontend/src/lib/linkPermissions.js` and mirrors the server's `modules/shared/linkPermissions.js`, which Files and Drive both use; `test/link-review.test.js` checks that all three agree.

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
