# Files (`/app/files`)

A [module](modules.md) for personal and shared files. Every user has **My files**; teams work in **shared spaces**. Any file or folder can be shared with people and groups or published as a public link (open or password-protected, with an optional expiry) that allows exactly what you choose: viewing, downloading, uploading, or full changes. The [Knowledge Base](knowledge-base.md) keeps its files here too, so one file can appear in Files and in any number of articles.

## What's inside

- **My files**: a personal tree of folders and files that only you see until you share it. You can upload with the button, by drag & drop or several files at once. Name clashes resolve automatically to `Report (2).pdf`.
- **Folder uploads**: drop a whole folder (or several, mixed with files) from your computer, or use *Upload ▾ → Upload folder*. See [Uploading folders](#uploading-folders).
- **Shared with me**: everything other people shared with you or your groups, with the owner shown.
- **Shared spaces**: team drives with their own view / edit / manage rules, e.g. *Accounting* or *Marketing*.
- **Recent**: your latest uploads and changes.
- **Search**: searches every place you can open and shows each result's folder path.
- **Trash**: deleted items stay here for 30 days (configurable). Each one can be restored or deleted forever, and the trash can be emptied.
- **Grid and list views**, thumbnails for images, multi-select (move or delete), a context menu (right-click or ⋯), and breadcrumbs. On mobile the places sit in a drawer.
- **Viewers**: the same ones as the Knowledge Base (pdf.js, image gallery, Word, Excel, Office → PDF via [document conversion](integrations.md#document-conversion-collabora--libreoffice), text, Markdown, video, audio).
- **Each file has its own page** (`/app/files/v/<id>`) by default, with ‹ › through the folder's files and a *Link* button. *Opening files* in the Files settings switches to a modal over the folder. PDFs can be viewed as slides or presented full screen.

## Folder README

A `README.md` (any letter case; `README.markdown` too) in *My files*, a space or a folder is shown **above the listing** as a collapsed, rendered preview (*Показать полностью / Свернуть*, hide for this folder, remembered per device; *⋯ → Показывать README папок* turns them off everywhere). Actions: open in the viewer, download, copy link. GitHub-flavoured Markdown is rendered and sanitized (see [Drive → Folder README](drive.md#folder-readme)); relative links and pictures (`plan.pdf`, `../Images/logo.png`) are found by walking folders by name with the person's own listing rights. The text is read through `GET /nodes/<id>/file` (view access), loaded after the listing and cached per version; over 512 KB → a note with *Open*. Public folder links that allow viewing show it too, read-only.

## Uploading folders

Drag a folder from Explorer / Finder onto a folder view, or pick one with *Upload ▾ → Upload folder* (not offered on iOS and Android, which cannot pick folders). The portal recreates the folder tree in the current place and uploads every file into its folder:

- **Folders are merged.** A folder that already exists with the same name (any case) is reused, so uploading `Photos` twice fills the same `Photos`. A *file* with that name in the way gets the new folder named `Photos (2)`.
- **Files never overwrite.** A clashing file is saved as `Report (2).pdf`, exactly like a single upload.
- **Empty folders are kept** when dropped (the folder picker of browsers skips them). `.DS_Store`, `Thumbs.db`, `desktop.ini` and `._*` files are left out.
- **The same rules as any upload apply to every file**: edit access to the target, the maximum file size, allowed file types and, in *My files*, the personal quota (checked for the whole folder before anything is created, then again per file).
- **Progress** is shown per folder: files done / total, bytes, failures with their reasons. Three files upload at a time; the batch can be cancelled (files already uploaded stay). A failed file does not stop the others. The folder view refreshes at the end.
- **Limits**: up to 10,000 files and 32 folder levels per upload; folder names up to 255 characters, no `.` / `..`, control characters or reserved device names (`CON`, `NUL`, `COM1`…).

The client first sends the folder list to `POST /folders/tree` (in chunks of 500, parents first; the server checks and cleans every path segment, takes a lock so two uploads cannot both create the same folder, and answers the folder ids in the same order), then uploads each file to `POST /upload?parentId=<id>` as usual.

## Sharing with people

Choose **Share → People** on a file or folder, then add users or groups with **View** or **Edit**:

| Level | Allows |
|-------|--------|
| **View** | Open, preview, download |
| **Edit** | View, plus upload into folders, rename, move inside the shared folder and move to the trash |

- A shared folder gives the same access to everything inside it, including files added later.
- Only the **owner** can change who has access, create public links, restore from the trash or delete forever.
- New recipients get a *"… shared "…" with you"* [notification](notifications.md) that opens the file.
- Shared items carry a people mark in the list.

## Shared spaces

Creating a space asks who gets access:

| Option | Rules created |
|--------|---------------|
| Everyone can edit (default) | *Everyone: edit*, you: *manage* |
| Everyone can view | *Everyone: view*, you: *manage* |
| Private | Only you (*manage*), then add people under **Access** |

Rules can name everyone signed in, users, groups or roles, using the same editor as the Knowledge Base. *Manage* lets someone rename the space, change its access and delete it. Files in a space belong to the space, not to whoever uploaded them. Users with `files.admin` have *manage* on every space. Personal files stay private even from them.

The *Who can create spaces* setting chooses between administrators only (`files.admin`, the default) and everyone.

## Public links (`/l/<token>` or `/l/<slug>`)

**Share → Public links** creates a link that works without signing in. A folder link opens the folder and everything inside it, and visitors cannot reach anything outside it.

The dialog is **simple by default**: one card with the four things most people need, and a big *Create and copy* button.

| Simple field | Notes |
|--------|-------|
| What the recipient can do | *View* or *View and download* (the default). Folders also show *More…*, which opens the advanced part with every preset (upload only, view and upload, full access, custom). A link that uses anything else shows *Special rights: …* here |
| Expires | *No expiry* (or *Maximum (N d)* when the administrator caps the lifetime), *1 day*, *7 days*, *30 days* or *Date…* (a calendar day; the link works until the end of that day in the person's time zone) |
| Password | Off by default; on: at least 4 characters, *Generate* makes an easy-to-dictate one (`k7mq-29xp-w4ta`). Visitors enter it once per browser tab. Unlocking is rate-limited (10 attempts per 15 minutes per IP and link). Forced on when the administrator requires passwords (for all links, or for links that allow changes) |
| Link address | `portal…/l/` + an optional custom address, see [Custom addresses](#custom-addresses-slugs). Empty means a random, unguessable address |

**Advanced settings** (collapsed; opens by itself when the link already uses any of it, and shows a one-line summary of what is customised while collapsed): the full permission picker (presets and per-action switches, see [Link permissions](#link-permissions)), upload rules (maximum file size, allowed extensions, total quota of the link, ask the visitor's name and e-mail, notify me) and the link's name (the visitor sees it as the page title).

After *Create and copy* the dialog shows the link (already on the clipboard), the password with a reminder to send it separately, a QR code and *Open as recipient*.

One item can have several links. The list shows one compact row per link: the address (custom part highlighted), permission icons, expiry (*until 21.10*), a lock when it has a password, views and uploads; *Copy* and *Edit* at hand, and under ⋯ *QR code*, *Open as recipient* (opens the page with `?preview=1`, which does not count a view), *Activity*, *Revoke / Restore* and *Delete*. With no links yet the tab opens the form directly. On phones the dialog is a full-screen sheet with large touch targets. Changing the password or revoking a link invalidates every visitor token (and so every visitor session) already issued. Links to items in the trash stop working.

### Custom addresses (slugs)

A link can have a readable address such as `/l/dogovor-keykompani` next to its random token (the token address keeps working).

- **Rules:** lowercase latin letters, digits and single hyphens inside; 3–64 characters; not a reserved word (`api`, `admin`, `login`, `s`, `l`, `d`, `assets`, `static`, `uploads`, `new`, `edit`, … — the list is in `modules/shared/linkSlug.js`). Typed Cyrillic is transliterated (*Договор КейКомпани* → `dogovor-keykompani`); *From the name* fills it from the file name.
- **Availability** is checked while typing (300 ms after the last key): *Available*, *Taken* (with clickable alternatives such as `-2`, `-2026` or a short random suffix) or the reason it is invalid. The server checks again on save; a UNIQUE index on `LOWER(slug)` makes it race-safe (`409 SLUG_TAKEN`). Uniqueness ignores case. Files links and Drive links are separate namespaces.
- **Revoked and expired links keep their slug**, so an address that was shared never opens something else.
- **Changing** a slug (the dialog asks first) or **deleting** the link makes the old address stop at once. The old slug is then held for 90 days: only the same author can take it again, nobody else. Clearing the field leaves the random token address only.
- A readable address is easier to guess: the form suggests a password when a custom address is set without one.

### Link permissions

| Key | Allows | Applies to |
|-----|--------|-----------|
| `view` | list the folder, preview files | files, folders |
| `download` | download files (needs `view`) | files, folders |
| `upload` | add new files; without `view` the link is an upload-only drop box | folders |
| `mkdir` | create folders (needs `view`); with `upload` also folder uploads | folders |
| `rename` | rename and move inside the link (needs `view`) | folders |
| `replace` | upload a new version over a file (needs `view`) | files, folders |
| `delete` | move to the owner's trash (needs `view`) | folders |

Presets in the share dialog (shared picker `components/ui/LinkPermissions.jsx`, see [extending](extending.md#public-link-permissions)):

| Preset | Keys |
|--------|------|
| View only | `view` |
| View and download (default) | `view`, `download` |
| Upload only (folders) | `upload` |
| View and upload (folders) | `view`, `download`, `upload` |
| Full access | all keys the item supports |
| Customize… | individual switches |

A key that needs `view` is dropped when `view` is missing (it is never turned into a read link): `['upload', 'download']` is the drop box `['upload']`. Files, Drive and the picker use one rule (`modules/shared/linkPermissions.js`, mirrored by `src/frontend/src/lib/linkPermissions.js`; a test checks that they agree).

Links created before permissions existed keep exactly what they did: `view` + `download`, or `view` where downloads were off (a startup migration fills `fs_links.permissions` from `allow_download`; the old `allowDownload` field is still accepted by the API and kept in step).

**Upload only.** The visitor sees a *Send files to …* page with the owner's name, a drop zone, the link's rules and the files they sent from this browser tab. They never see the folder's contents or other visitors' uploads: the listing answers only uploads of their own visitor session, files land in the shared folder itself, and file and preview routes refuse upload-only links. A file whose name is already taken is stored as `Name (2)` as usual, but the visitor is answered (and later shown) the name they sent, so a drop box never reveals what the folder holds; the owner sees the stored name (`fs_link_events.sent_name` keeps the visitor's one).

**Visitor page.** The header shows the owner, the link name and *You can: view, download, upload*. Depending on the permissions there are an upload button (files, or a folder where the browser can pick one and `mkdir` is allowed), drag & drop onto the folder, *New folder*, and per item *Download*, *Rename*, *Replace with a new version* and *Delete* (with a confirmation). Every upload shows its own progress and can be cancelled. A link that asks for the name shows a short *Introduce yourself* dialog before the first change; the name (and e-mail) is kept in the visitor session for the tab.

**Who may grant what.** By default only owners and space managers publish links (as before). With *Who publishes links → Anyone with access* others may publish too, but a link grants at most its author's own rights: view access gives `view` / `download`, edit access also the write keys. They see and manage only their own links; owners see all. The effective permissions are computed on every request (link permissions ∩ what the author may still grant ∩ module settings), so an author who loses edit access silently takes the write keys away, and one who loses all access takes the link down (`OWNER_NO_ACCESS`).

**Where changes go.** Every visitor change runs as the link's author through the usual Files code: edit access on the target, the owner's personal quota (with its lock), allowed types, magic bytes, the knowledge-base guard on deletes. Uploaded files belong to the folder's owner (or space) and count toward their quota, plus the link's own quota. Deletes go to the owner's trash. Files has no version history, so *Replace* keeps the previous content as a copy in the owner's trash (restorable; it counts toward the quota until the trash is emptied) and requires the same extension (`EXT_MISMATCH`).

**Activity.** `fs_link_events` records each visitor change (upload, replace, mkdir, rename, move, delete) with the link name, the visitor's name / e-mail, IP, bytes and session. Owners see it in the link's *Activity*, and files added or changed through a link carry a *via link · Name* mark in the lists. The per-link quota is the sum of bytes uploaded or replaced through the link (deleting does not give it back). A link without a quota of its own is limited by the module setting *Default upload limit per link* (2048 MB; 0 = unlimited), so a link into a shared space (which has no personal quota) cannot fill the disk.

**Views.** A view is the first load of the link page by a person in a browser tab: crawlers and HEAD requests never count, nor *Open as recipient* (`?preview=1`), nor reloads in the same tab (after an upload, a rename or F5 the page asks with `?repeat=1`).

**Notifications.** With *Notify me*, the `files:link-notices` job (every minute) sends the author one notice (`files.linkActivity`) per visitor burst: once the session has been quiet for 45 seconds (or after 10 minutes at most), e.g. *Anna — link "Contracts": 3 uploaded, 1 changed* with the first file names.

The module settings can switch public links off, require a password on every link, cap the lifetime (*maximum days*), switch off links that allow changes (existing ones fall back to view / download), require a password for links that allow changes (such links without one work read-only) and choose who publishes links.

## Files in the Knowledge Base

The Knowledge Base stores its files in Files:

- **A file uploaded to the Knowledge Base** lands in *My files → Knowledge base* (a system folder) of the person who uploaded it. It then shows up in both places.
- **Add from Files** (folder menu) puts existing files from My files, Shared with me or a space into a Knowledge Base folder without copying them.
- **Articles** can use files in two ways:
  - **embedded** in the text: the 📎 toolbar button inserts `![name](kbfile:42)` for images or `[📎 name](kbfile:42)` for other files;
  - **attached** below the article, in the *Files* section of the editor.
  Readers see them as a *Files · n* list and open them in the viewers.
- **Readers do not need access to the file in Files.** Knowledge Base access rules decide who can open it, and that includes Knowledge Base public links. The editor who adds a file must be able to open it in Files.
- A file used by the Knowledge Base **cannot be moved to the trash**. The dialog lists the folders and articles that use it, so they can be changed first. The same applies to folders and spaces that contain such files.
- Deleting a Knowledge Base material or folder keeps the file in Files.

Existing Knowledge Base files are moved into Files once, on the first start after the upgrade. Each lands in its uploader's *Knowledge base* folder with the same storage key, so nothing is copied. The setting `kb_files_migrated` records that the move ran.

## Module settings (Admin → Settings → Modules → Files)

| Setting | Default |
|---------|---------|
| Enabled | on |
| Maximum upload size | 200 MB (1–4096) |
| Personal quota | 0 = unlimited (MB per user, counted on My files including the trash) |
| Allowed file types | images, PDF, office, text, media, archives |
| Any other type | on (unknown types can be stored but are only downloaded, never shown inline) |
| Public links / require password / maximum days | on / off / 0 (unlimited) |
| Links that allow changes / password for them | on / off |
| Default upload limit per link (`linkQuotaMb`) | 2048 MB (0 = unlimited); applies to links without their own quota, uploads and new versions count |
| Who publishes links | owners (`owners`; or `members`: anyone with access, within their rights) |
| Who can create spaces | administrators (`files.admin`) |
| Days in the trash | 30 (1–365) |

The Knowledge Base still applies its own size limit and file types to uploads made from the Knowledge Base.

## Storage and security

- Blobs live in `UPLOAD_DIR/files/<year>/<month>/` under random names. Migrated Knowledge Base files keep `UPLOAD_DIR/kb/`. Office PDF previews are cached in `UPLOAD_DIR/.previews/` and keyed by the file's update time.
- Storage keys are resolved strictly inside `UPLOAD_DIR`. A key that escapes it is treated as missing.
- PDF and image uploads must match their magic bytes.
- Files are served only by access-checked API routes, with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. Only safe types are shown inline; everything else is an attachment.
- Hidden items return `404`, so their existence does not leak. Trashed items are visible only to their owner or a space manager.
- Link passwords are bcrypt-hashed. Visitor tokens are JWTs (12 h) bound to the link and its version, of two kinds: the **visitor session** (scope `w`, random session id, the visitor's name) travels in the `X-Link-Token` header only and is needed for every change and for renewing the session; a **read token** (scope `r`, no session) is the only kind accepted in an address (`?t=` on file and preview URLs for `<img>`, `<video>` and the PDF viewer). What reaches browser history or access logs can open files but never change anything; a read token in the header does not count as unlocked for writes or `/session`. Tokens issued before scopes existed still read from addresses and are swapped for a session token on the next page load (same session, password mark and name), so visitors notice nothing. The bundled nginx masks `t=` in its access log.
- Visitor writes are confined to the link's subtree with the same ancestor-chain check as reads; the shared item itself cannot be renamed, moved or deleted (`LINK_ROOT`).
- Public write routes are rate-limited per link (its id: the token and every letter case of its slug share one budget): uploads and replacements 600 per 15 minutes per IP and link and 3000 per hour per link (not counted by the general guest budget, so a folder upload of hundreds of files goes through); other changes 300 per 10 minutes per IP and link and 1500 per link on top of the guest budget; 30 session starts per 15 minutes and 10 wrong passwords per 15 minutes per IP and link. They pass the same Origin check as every API write. nginx allows 1024 MB bodies only on `/api(/v1)/l/<token>/upload` and `/api(/v1)/l/<token>/nodes/<id>/replace` (streamed, not buffered); the app applies the module and link limits.
- The `files:trash` scheduler job deletes expired trash every 6 hours, rows and blobs both. The daily `storage:previews` job removes cached previews (Files, Knowledge Base, Drive) nobody opened for 30 days; they are made again on the next view.
- The personal quota is checked again for every file under a per-owner lock (`pg_advisory_xact_lock`), so two parallel uploads cannot both slip past it.
- Search, *Shared with me* and *Recent* check access for all candidates in a few batched queries (same rules as opening a single item).
- Back up `UPLOAD_DIR` together with the database.

## API

All under `/api/app/files`, signed-in users only:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Spaces, personal usage, module config |
| GET | `/my`, `/folders/:id`, `/spaces/:id/files` | Folder contents with `crumbs`, `level` and `items` |
| GET | `/shared`, `/recent`, `/search?q=` | Shared with me, recent, search (with `path`) |
| GET / DELETE | `/trash` | List or empty the trash |
| POST / PUT / DELETE | `/spaces[/:id]` | Spaces CRUD (`visibility`: `teamEdit`, `team`, `private`) |
| GET / PUT | `/spaces/:id/access` | Space rules |
| GET | `/subjects` | Users, groups and roles |
| POST | `/folders` | `{ name, parentId | spaceId }` |
| POST | `/folders/tree` | Folder uploads: `{ paths: ["A", "A/B", …], parentId \| spaceId, bytes? }` → `{ folders: [id, …] }` in the order of `paths`; existing folders are reused; `bytes` is checked against the quota (`413 QUOTA_EXCEEDED`); at most 1000 paths, 32 levels (`400 INVALID_PATH`, `TOO_MANY_FOLDERS`) |
| POST | `/upload?parentId=` or `?spaceId=` | Multipart (`files[]`) |
| GET | `/nodes/:id` | Details, including Knowledge Base usage |
| PUT | `/nodes/:id` | `{ name }` renames, `{ move: { parentId } | { spaceId } | {} }` moves (`{}` is the root of My files) |
| DELETE | `/nodes/:id` | To the trash (`409 FILE_IN_USE` with `info.usage` if the Knowledge Base uses it) |
| POST | `/nodes/:id/restore` | Restore from the trash |
| DELETE | `/nodes/:id/forever` | Delete permanently |
| GET | `/nodes/:id/file[?download=1]`, `/nodes/:id/preview.pdf` | Content, Office preview |
| GET / PUT | `/nodes/:id/shares` | `{ shares: [{ subjectType: 'user' | 'group', subjectId, level: 'view' | 'edit' }] }` |
| GET / POST | `/nodes/:id/links` | `{ links, grantable, isFolder }` / create `{ permissions, title, password, expiresAt, slug, maxFileMb, extensions, quotaMb, requireName, requireEmail, notify }` (`400 SLUG_INVALID`, `409 SLUG_TAKEN` with `info.suggestions`) |
| PUT / DELETE | `/links/:id` | Edit (same fields; `slug: ''` removes the custom address), revoke (`{ revoked: true }`) or delete |
| GET | `/link-slugs/check?slug=[&linkId=]` | `{ slug, available, reason, suggestions }`; `slug` is normalized (transliterated, lowercase); `reason`: `SHORT`, `LONG`, `CHARS`, `HYPHEN`, `RESERVED`, `TAKEN`, `RECENT`; `linkId` (a link the person manages) treats its own address as free. 60 checks per minute per person (`429 RATE_LIMITED`) |
| GET | `/links/:id/activity` | What visitors did through the link |

Public API, no session (`X-Link-Token` header; file and preview URLs also take a read token in `?t=`). `:token` is the link's token or its custom address in any case (the token is tried first):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/l/:token/unlock` | `{ password }` → `{ token, readToken }` |
| GET | `/api/l/:token[?folder=][&preview=1][&repeat=1]` | `link` (permissions, owner, rules, visitor), the node and a folder's contents; upload-only links answer `mine` (the session's own uploads, under the names sent) and no items. With a visitor token in the header (never one from the address): `readToken` for file URLs, and `visitorToken` replacing a token issued before scopes. `preview=1` / `repeat=1`: not counted as a view. Refused before the password with `401 PASSWORD_REQUIRED` and no details |
| POST | `/api/l/:token/session` | `{ name?, email? }` → `{ token, readToken, visitor }`: starts, renews or names the visitor session (needed before any change); keeps the name already given |
| POST | `/api/l/:token/upload[?folder=]` | Multipart `files[]` (≤ 20 per request), needs `upload` |
| POST | `/api/l/:token/folders` | `{ parentId, name }`, needs `mkdir` |
| POST | `/api/l/:token/folders/tree` | Folder uploads (as the private route), needs `upload` + `mkdir` |
| PUT | `/api/l/:token/nodes/:id` | `{ name }` or `{ move: { parentId } }`, needs `rename` |
| POST | `/api/l/:token/nodes/:id/replace` | Multipart `file`, needs `replace` |
| DELETE | `/api/l/:token/nodes/:id` | To the owner's trash, needs `delete` |
| GET | `/api/l/:token/nodes/:id/file` | File (needs `view`; `?download=1` needs `download`) |
| GET | `/api/l/:token/nodes/:id/preview.pdf` | Office preview (needs `view`) |

Knowledge Base additions: `POST /api/app/kb/folders/:id/from-files` (`{ nodeIds }`), `GET /api/app/kb/items/:id/attachments/:nodeId[/preview.pdf]`, and the same routes under `/api/s/:slug/items/:id/attachments/…`. Article payloads accept `attachments: [nodeId…]`.

Error codes: `NOT_FOUND`, `FORBIDDEN`, `NAME_REQUIRED`, `MOVE_CYCLE`, `TRASHED`, `FILE_IN_USE`, `QUOTA_EXCEEDED`, `FILE_TYPE`, `FILE_CONTENT`, `FILE_TOO_LARGE`, `FILE_MISSING`, `PASSWORD_REQUIRED` (401), `WRONG_PASSWORD`, `RATE_LIMITED`, `EXPIRED` (410), `NO_DOWNLOAD`, `LINKS_DISABLED`, `PASSWORD_SHORT`, `EXPIRY_LIMIT`, `INVALID_DATE`, `SYSTEM_FOLDER`, `NOT_TRASHED`; links: `GRANT_EXCEEDED`, `WRITE_LINKS_DISABLED`, `LINK_FORBIDDEN`, `LINK_ROOT`, `LINK_QUOTA`, `LINK_DISABLED`, `OWNER_NO_ACCESS`, `VISITOR_SESSION`, `VISITOR_NAME`, `VISITOR_EMAIL`, `EXT_MISMATCH`.

## Demo data and tour

- `modules/files/demo.js` (after Org structure and Employees when they are seeded): a shared space «Демо: проектные документы» (the team reads it, the demo colleagues edit) with `01 Договоры` (a Word contract with «ООО «Пример»», a PDF statement), `02 Сметы и бюджеты` (two Excel sheets), `03 Фото объекта` (three generated site photos, a view-and-download public link «Фото для заказчика») and `04 Входящие от подрядчиков` (an **upload-only** public link: 20 MB per file, pdf/docx/xlsx/jpg/png, 200 MB in all, the visitor's name required), plus a `README.md` at the root that explains the space. Files are generated by `modules/shared/demoAssets.js` (`simpleDocx`, `simpleXlsx`, `simplePdf`, `sitePhoto`), authored by demo colleagues (`modules/shared/demoPeople.js`) and backdated. Everything sits in a shared space, so no personal quota is used; a type the Files settings forbid or a file over the size limit is left out, and so is a link the settings forbid (public links or write links off, a required password). Purge deletes the space with everything in it — also files people or link visitors added since — the links' activity rows and the blobs on disk; a file the knowledge base still uses is kept.
- Tour `files` (`tour/content/files.js`): places, search, upload, spaces, trash. Anchors: `files.places`, `files.search`, `files.upload`, `files.spaces`, `files.trash`.
