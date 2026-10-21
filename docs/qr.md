# QR codes

Branded QR codes for everyone in the portal. A person picks **what the code does**, a **template**
prepared by the company and, when allowed, adjusts the **design**; the live preview is checked for
scanning as they go and downloads as PNG (up to 4096 px) or SVG. Website codes can be **dynamic**:
they hold a short portal link whose target changes after printing, and scans are counted.

The module is installable (category *Work*), **off by default**: Settings → Modules → *QR codes*.

| URL | What it is |
|---|---|
| `/app/qr` | My codes: quick start by kind, search, filters, downloads |
| `/app/qr/new?type=<kind>`, `/app/qr/<id>` | Studio: content, template, design, preview |
| `/app/qr/templates`, `/app/qr/templates/<id>` | Templates (permission `qr.admin`) |
| `/admin/settings/qr` | Module settings |
| `/q/<slug>` | Redirect of a dynamic code (nginx → `/api/qr/go/<slug>`) |

## Kinds

What goes into the code is built in the browser (`src/frontend/src/modules/qr/engine/encode.js`);
the server keeps only the whitelisted fields of each kind (`src/backend/modules/qr/content.js`).

| Kind | Payload |
|---|---|
| `url` | the address; `https://` is added when missing |
| `vcard` | vCard 3.0: `N`, `FN`, `ORG`, `TITLE`, `TEL;TYPE=CELL`, `TEL;TYPE=WORK,VOICE`, `EMAIL`, `URL`, `ADR`, `NOTE` (values escaped) |
| `wifi` | `WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<password>;H:true;;` (`\ ; , : "` escaped) |
| `email` | `mailto:<to>?subject=…&body=…` |
| `phone` | `tel:<digits>` |
| `sms` | `SMSTO:<number>:<text>` |
| `whatsapp` | `https://wa.me/<digits>?text=…` |
| `telegram` | `https://t.me/<username>` |
| `geo` | `geo:<lat>,<lng>?q=<lat>,<lng>(<label>)`; the form also takes a Google / Yandex / 2GIS / OSM link |
| `event` | iCalendar `VEVENT` (local time or all-day dates) |
| `text` | as typed, up to 1,500 characters |

## Design

One JSON object per template and per code (`src/backend/modules/qr/design.js`, sanitized on every write):

```json
{
  "dots": { "style": "rounded", "color": "#0F172A", "gradient": { "type": "linear", "from": "#1D4ED8", "to": "#0E7490", "angle": 135 } },
  "eyes": { "frame": "leaf", "ball": "leaf", "frameColor": null, "ballColor": "#0E7490" },
  "background": { "color": "#FFFFFF", "transparent": false, "radius": 0 },
  "logo": { "source": "brand", "file": null, "icon": null, "size": 22, "plate": "rounded", "plateColor": "#FFFFFF", "padding": 10 },
  "frame": { "style": "card", "text": "", "color": "@brand", "textColor": "#FFFFFF" },
  "margin": 3,
  "ecl": "auto"
}
```

- Dot styles `square`, `rounded`, `fluid` (rounded with liquid joins), `dots`, `classy`, `diamond`; eye frames
  `square`, `rounded`, `circle`, `leaf`, `soft`; eye centres `square`, `rounded`, `circle`, `leaf`, `diamond`.
- A colour is `#RRGGBB` or **`@brand`** — the primary colour of the portal theme, resolved when the code is drawn,
  so brand templates follow a new theme. `null` eye colours follow the dots (and their gradient).
- Logo sources: `none`, `brand` / `brandDark` (Settings → Appearance logos), `upload` (PNG / SVG / WebP / JPEG ≤ 1 MB,
  stored in `uploads/qr/`, served by `/api/qr/assets/<file>` with a sandbox CSP), `icon` (15 icons). Size 10–30 % of the
  code; modules under the plate are cleared. Wide logos get a wider, lower box.
- Frames: `none`, `caption`, `card`, `ticket`, `badge`. An empty caption is «Наведите камеру» / «Scan me» in the viewer's language.
- `ecl: "auto"` is H with a logo, Q for short payloads, M above 600 characters.

**Renderer** — `engine/render.js` is pure (matrix + design → SVG markup) and is used for the preview, the SVG
download and the PNG (rasterized in a canvas), so what people see is what they download. Pictures are embedded as
`data:` URLs. **Scan check** — `engine/runtime.js` rasterizes the code at 520 px and decodes it with ZXing (WASM,
the same decoder as the barcode scanner) without extra effort; the badge says *scans reliably* / *hard to scan*.
The renderer also warns about low contrast (< 3:1), inverted colours and a logo covering more than 16 % of the modules.
`src/backend/test/qr.test.js` covers sanitizing, locks, encoders and the renderer; every ready-made template was checked
to decode on a short link and a dense vCard.

## Templates

`qr_templates`: `name`, `description`, `i18n` (`{ ru: { name, description }, … }`), `design`, `locks`, `is_default`,
`active`, `sort`, `preset_key`. Nine ready-made templates (`modules/qr/presets.js`) are inserted once, when the table is
empty; *Restore ready-made* inserts the missing ones by `preset_key`. «Фирменный» is the default and locks colours and
the logo.

**Locks** — `{ colors, shape, logo, frame }`. When a person (without `qr.admin`) saves a code made from a template,
the server copies the locked groups from the template over what was sent (`applyLocks`); the studio shows those tabs
read-only. With the module setting *Change the design* off, every group is locked and a template is required
(`400 TEMPLATE_REQUIRED`).

| Group | Fields |
|---|---|
| `colors` | dot colour and gradient, eye colours, background, frame and text colours |
| `shape` | dot style, eye frame and centre, quiet zone, error correction |
| `logo` | the whole `logo` object |
| `frame` | frame style and caption |

## Dynamic codes

Only website codes. The code holds `https://<portal>/q/<slug>` (7 characters, no look-alike letters); the target is
the code's `url`, which can change at any time. `active: false` pauses the link (`410`, a small page in the visitor's
language). `GET /api/qr/go/<slug>` answers `302` to an `http(s)` target, increments `qr_codes.scans` and the day row in
`qr_scan_days`; user agents of link-preview bots (Telegram, WhatsApp, Slack…) are not counted. Switching a dynamic code
back to static or deleting it breaks printed copies — the studio warns.

> The redirect is an open redirect limited to signed-in employees' own codes; the module can be switched off, or
> dynamic codes disabled in its settings.

## Settings

`app_settings.modules.qr.settings`:

| Key | Default | Meaning |
|---|---|---|
| `allowCustom` | `true` | people may change unlocked options; `false` = templates as they are |
| `allowUploads` | `true` | people may upload their own logo (administrators always can) |
| `dynamic` | `true` | dynamic website codes may be created |
| `maxCodes` | `500` | codes per person (10–10,000), `409 QR_LIMIT` above |

## API

Signed-in users, `/api/app/qr` (also `/api/v1/app/qr` for API tokens, area *QR codes*):

| Method | Path | |
|---|---|---|
| GET | `/` | templates (all for `qr.admin`, active otherwise), settings, `canManage` |
| GET / POST | `/codes` | own codes / create `{ name, type, content, templateId, design, dynamic, active }` |
| GET / PUT / DELETE | `/codes/:id` | one own code |
| GET | `/codes/:id/stats?days=30` | `{ total, lastScanAt, days: [{ day, count }] }` |
| POST | `/assets` | upload a logo (`file`), answers `{ file }` |
| GET / POST | `/admin/templates` | `qr.admin` |
| PUT / DELETE | `/admin/templates/:id` | |
| POST | `/admin/templates/:id/default` | make default |
| PUT | `/admin/templates-order` | `{ ids }` |
| POST | `/admin/templates/restore` | `{ added }` |

Public: `GET /api/qr/assets/<file>`, `GET /api/qr/go/<slug>`.

Errors: `QR_TYPE`, `QR_URL` (dynamic code without an http(s) address), `QR_LIMIT`, `DYNAMIC_OFF`, `TEMPLATE_REQUIRED`,
`QR_FILE_TYPE`, `FILE_TOO_LARGE`, `NAME_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`.

## Demo data

Five codes of the superadministrator in ready-made templates: a dynamic website code with a month of scans, a
business card, guest Wi-Fi, a WhatsApp chat and an event (`modules/qr/demo.js`).
