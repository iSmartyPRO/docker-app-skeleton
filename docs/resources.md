# Online resources (`/app/resources`)

A [module](modules.md) for the company's links: mail, CRM, the wiki, HR forms, the website. Each one is an icon tile. It is built to be the **home page**: guests see the public resources, employees see the ones meant for them, and everybody can arrange the board their own way.

## Home page

*Settings → Site access → Home page* chooses what the site's address shows:

| Choice | Result |
|--------|--------|
| Welcome page | The built-in landing (project name and description) |
| Online resources | The resource board at `/`. Guests see public resources when the site is **open**. When it is **closed**, guests sign in first |
| Any other module (Files, Tasks, Calendar, Knowledge Base, File server) | Signed-in people go straight to the module. Guests sign in first and are brought back to it |

Only enabled modules can be chosen. *Site access → Access mode* (open / closed) works as before.

## The board

- **Tiles** show the icon, title, a short description and the address (↗ marks links that open in a new tab). Portal paths such as `/app/kb` open inside the portal.
- **Search** covers titles, descriptions and addresses. **Category chips** filter the board.
- **Customize** lets each person:
  - drag tiles into their own order (mouse, touch with a short press, keyboard);
  - hide tiles they do not need, and bring them back from *Hidden*;
  - use *Reset to default* to return to the administrator's order.
- **The layout is remembered.**
  - Signed-in people keep it on the server (`res_layouts`), so it follows them to every device.
  - Guests keep it in their browser (`localStorage`).
  - New resources appear at the end of a personal layout. Removed ones simply disappear.
- The greeting follows the time of day. Heading, subtitle, tile size, descriptions, search and personal layouts are set in the module settings.

## Portal modules as tiles

A resource is either a **link** (an address) or a **portal module**:

- **Catalogue → Add modules** adds Counterparties, the Knowledge Base, Files, Tasks, Calendar or the file server in one click. Each tile gets the module's icon and colour.
- In the editor, choose *Portal module* and pick it from the list. No address is needed: the tile opens `/app/<module>` in the same window.
- A module tile without its own title shows **the module's name and description in each person's language**, including a custom name such as *Company Drive*. You can also override the texts.
- If a module is switched off, its tile disappears from everyone's board and comes back when the module is switched on again.

## Translations

- **Resources:** the title and description are entered per language (Русский / English tabs; a ✓ marks the filled ones). Each person sees their own language. If a language is empty, the other one is shown.
- **Categories** have a name in both languages too.
- Existing resources keep their text as the portal's default language.

## Visibility

| Who sees it | Meaning |
|-------------|---------|
| **Everyone** | Including guests who are not signed in |
| **Employees** | Everyone signed in |
| **Selected** | The chosen users, groups and roles |

The *Show* switch hides a resource from everyone without deleting it. People with `resources.admin` see all resources.

## Icons

The editor shows the tile live and previews the icon on a light and a dark background.

| Source | Notes |
|--------|-------|
| **Icons** | 1,850 Lucide line icons with keyword search (mail, chart, truck…) and a hand-picked popular set |
| **Brands** | 3,400+ brand logos from Simple Icons (Gmail, Google Drive, Jira, Telegram…) in their brand colours. Some trademarks (Slack, Microsoft…) are not in the set; upload their logos instead |
| **Your own** | PNG, SVG, WebP or JPEG up to 1 MB, plus an optional separate file for the dark theme |
| **Portal** | The portal's own menu and module icons |
| **Letter** | One or two characters on a coloured tile |

**Styles:**

- *Gradient*: colour or two-colour gradient, white glyph;
- *Soft*: tinted background, coloured glyph;
- *Solid*;
- *Plain*: no background.

Pick from a curated palette or any colour, optionally with a separate colour for the dark theme.

**Security:**

- Library icons are stored as a whitelist of shapes and drawn with React elements, never injected as HTML. Allowed are `path`, `circle`, `rect`, `line`, `polyline`, `polygon` and `ellipse`, with geometry attributes only.
- Uploaded files are checked by their content (magic bytes / SVG root) and stored under random names in `UPLOAD_DIR/resources/`. They are served only as images, with `nosniff` and a sandbox CSP.
- Addresses must be `http(s):`, `mailto:`, `tel:` or a portal path; `javascript:` and `data:` are refused.

## Administration

- **Catalogue** (`/app/resources/manage`, *Manage* on the board):
  - drag rows to set the default order;
  - switch resources on and off;
  - edit resources;
  - manage categories (name and colour).
- **Settings → Modules → Online resources**: on/off, heading and subtitle, tile size (comfortable / compact), descriptions, search and categories, personal layouts.
- Permission `resources.admin` (super administrators have it).

## API

Public, no session needed (`/api/res`, the session is used when present):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/res` | Resources visible to the requester, categories in use, the signed-in person's layout, board settings |
| GET | `/api/res/icons/:file` | Uploaded icon (immutable cache) |

Signed-in (`/api/app/resources`):

| Method | Path | Purpose |
|--------|------|---------|
| PUT / DELETE | `/layout` | Save `{ order, hidden }` or reset |
| GET | `/admin` | All resources with access lists, categories (`resources.admin`) |
| POST / PUT / DELETE | `/admin/items[/:id]` | `{ kind: link\|module, module, i18n: { ru: { title, description }, en: {…} }, title, url, description, categoryId, icon, target: blank\|self, visibility: public\|signed\|custom, access, active }` |
| PUT | `/admin/order`, `/admin/categories-order` | `{ ids }` |
| POST / PUT / DELETE | `/admin/categories[/:id]` | `{ name, i18n: { ru, en }, color }` |
| POST | `/admin/icons` | Multipart `file` → `{ file }` |
| GET | `/admin/subjects` | Users, groups and roles for *Selected* |

Errors: `INVALID_URL`, `INVALID_ICON`, `FILE_TYPE`, `FILE_TOO_LARGE`, `NAME_REQUIRED`, `PERSONALIZE_OFF`, `FORBIDDEN`, `NOT_FOUND`.

## Demo data and tour

- `modules/resources/demo.js`: three categories («Работа», «Документы и справка», «Офис») and 11 tiles — services on `example.com` (mail, video meetings, accounting, templates, visitor passes, meeting rooms, a `mailto:` help desk), two portal modules (Tasks, Files) and a **public** «Сайт компании» tile that guests see on the home page; titles in both languages, portal icons and letter tiles (no uploaded icon files). Saved through the module's own `saveItem` / `saveCategory`; purge is a plain delete.
- Tour `resources` (`tour/content/resources.js`, texts `tour.resources.*` in `locales/<lang>/tour.js`): the board, tiles, search and categories, «Настроить», then for administrators the catalogue — «Добавить», «Модули портала», categories (steps with `route: '/app/resources/manage'` and `when: can('resources.admin')`). Anchors: `rs.head`, `rs.grid`, `rs.filters`, `rs.categories`, `rs.customize`, `rs.manage`, `rs.add`, `rs.modules`, `rs.cats`. The board has its own «Тур» button (no side rail).
