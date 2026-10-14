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

## Public links (`/l/<token>`)

**Share → Public links** creates a link that works without signing in. A folder link opens the folder and everything inside it, and visitors cannot reach anything outside it.

| Option | Notes |
|--------|-------|
| Name | Optional; the visitor sees it as the page title (e.g. *Documents for the contract*) |
| Permissions | What the visitor may do, see [Link permissions](#link-permissions) |
| Password | Optional, at least 4 characters. Visitors enter it once per browser tab. Unlocking is rate-limited (10 attempts per 15 minutes per IP and link) |
| Expiry | Presets (1 day, 7 days, 30 days) or a date. Expired links show *This link has expired* |
| Upload rules | For links with upload or replace: maximum file size, allowed extensions, total quota of the link, ask the visitor's name (and e-mail), notify me |

One item can have several links. Each link card shows its permissions as chips, views, uploads and the quota used, and has *Copy*, *QR code*, *See as the recipient* (opens the page with `?preview=1`, which does not count a view), *Edit*, *Activity*, *Revoke / Restore* and *Delete*. A new link is copied to the clipboard at once. Changing the password or revoking a link invalidates every visitor token (and so every visitor session) already issued. Links to items in the trash stop working.

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

Links created before permissions existed keep exactly what they did: `view` + `download`, or `view` where downloads were off (a startup migration fills `fs_links.permissions` from `allow_download`; the old `allowDownload` field is still accepted by the API and kept in step).

**Upload only.** The visitor sees a *Send files to …* page with the owner's name, a drop zone, the link's rules and the files they sent from this browser tab. They never see the folder's contents or other visitors' uploads: the listing answers only uploads of their own visitor session, files land in the shared folder itself, and file and preview routes refuse upload-only links.

**Visitor page.** The header shows the owner, the link name and *You can: view, download, upload*. Depending on the permissions there are an upload button (files, or a folder where the browser can pick one and `mkdir` is allowed), drag & drop onto the folder, *New folder*, and per item *Download*, *Rename*, *Replace with a new version* and *Delete* (with a confirmation). Every upload shows its own progress and can be cancelled. A link that asks for the name shows a short *Introduce yourself* dialog before the first change; the name (and e-mail) is kept in the visitor session for the tab.

**Who may grant what.** By default only owners and space managers publish links (as before). With *Who publishes links → Anyone with access* others may publish too, but a link grants at most its author's own rights: view access gives `view` / `download`, edit access also the write keys. They see and manage only their own links; owners see all. The effective permissions are computed on every request (link permissions ∩ what the author may still grant ∩ module settings), so an author who loses edit access silently takes the write keys away, and one who loses all access takes the link down (`OWNER_NO_ACCESS`).

**Where changes go.** Every visitor change runs as the link's author through the usual Files code: edit access on the target, the owner's personal quota (with its lock), allowed types, magic bytes, the knowledge-base guard on deletes. Uploaded files belong to the folder's owner (or space) and count toward their quota, plus the link's own quota. Deletes go to the owner's trash. Files has no version history, so *Replace* keeps the previous content as a copy in the owner's trash (restorable; it counts toward the quota until the trash is emptied) and requires the same extension (`EXT_MISMATCH`).

**Activity.** `fs_link_events` records each visitor change (upload, replace, mkdir, rename, move, delete) with the link name, the visitor's name / e-mail, IP, bytes and session. Owners see it in the link's *Activity*, and files added or changed through a link carry a *via link · Name* mark in the lists. The per-link quota is the sum of bytes uploaded or replaced through the link (deleting does not give it back).

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
- Link passwords are bcrypt-hashed. Visitor tokens are JWTs bound to the link and its version, carrying a random session id (and the visitor's name). Writes take the token from the `X-Link-Token` header only, never from the URL.
- Visitor writes are confined to the link's subtree with the same ancestor-chain check as reads; the shared item itself cannot be renamed, moved or deleted (`LINK_ROOT`).
- Public write routes are rate-limited (300 per 10 minutes per IP and link, 1500 per link; 30 session starts per 15 minutes per IP and link) on top of the general guest budget, and pass the same Origin check as every API write. nginx allows 1024 MB bodies only on `/api/l/<token>/upload` and `/api/l/<token>/nodes/<id>/replace` (streamed, not buffered); the app applies the module and link limits.
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
| GET / POST | `/nodes/:id/links` | `{ links, grantable, isFolder }` / create `{ permissions, title, password, expiresAt, maxFileMb, extensions, quotaMb, requireName, requireEmail, notify }` |
| PUT / DELETE | `/links/:id` | Edit (same fields), revoke (`{ revoked: true }`) or delete |
| GET | `/links/:id/activity` | What visitors did through the link |

Public API, no session (`X-Link-Token` header or `?t=`):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/l/:token/unlock` | `{ password }` → `{ token }` |
| GET | `/api/l/:token[?folder=][&preview=1]` | `link` (permissions, owner, rules, visitor), the node and a folder's contents; upload-only links answer `mine` (the session's own uploads) and no items |
| POST | `/api/l/:token/session` | `{ name?, email? }` → `{ token, visitor }`: starts or names the visitor session (needed before any change) |
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
