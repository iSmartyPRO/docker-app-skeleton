# Files (`/app/files`)

A [module](modules.md) for personal and shared files. Every user has **My files**; teams work in **shared spaces**. Any file or folder can be shared with people and groups or published as a public link (open or password-protected, with an optional expiry). The [Knowledge Base](knowledge-base.md) keeps its files here too, so one file can appear in Files and in any number of articles.

## What's inside

- **My files**: a personal tree of folders and files that only you see until you share it. You can upload with the button, by drag & drop or several files at once. Name clashes resolve automatically to `Report (2).pdf`.
- **Shared with me**: everything other people shared with you or your groups, with the owner shown.
- **Shared spaces**: team drives with their own view / edit / manage rules, e.g. *Accounting* or *Marketing*.
- **Recent**: your latest uploads and changes.
- **Search**: searches every place you can open and shows each result's folder path.
- **Trash**: deleted items stay here for 30 days (configurable). Each one can be restored or deleted forever, and the trash can be emptied.
- **Grid and list views**, thumbnails for images, multi-select (move or delete), a context menu (right-click or ⋯), and breadcrumbs. On mobile the places sit in a drawer.
- **Viewers**: the same ones as the Knowledge Base (pdf.js, image gallery, Word, Excel, Office → PDF via [document conversion](integrations.md#document-conversion-collabora--libreoffice), text, Markdown, video, audio).
- **Each file has its own page** (`/app/files/v/<id>`) by default, with ‹ › through the folder's files and a *Link* button. *Opening files* in the Files settings switches to a modal over the folder. PDFs can be viewed as slides or presented full screen.

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

**Share → Links** creates a link that works without signing in. A folder link opens the folder and everything inside it, and visitors cannot reach anything outside it.

| Option | Notes |
|--------|-------|
| Password | Optional, at least 4 characters. Visitors enter it once per browser tab. Unlocking is rate-limited (10 attempts per 15 minutes per IP and link) |
| Expiry | Presets (1 day, 7 days, 30 days) or a date. Expired links show *This link has expired* |
| Downloads | Can be disabled, which leaves viewing only |

One item can have several links. Each link shows its view count and can be copied, revoked, restored or deleted. Changing the password or revoking a link invalidates every visitor token that was already issued. Links to items in the trash stop working.

The module settings can switch public links off, require a password on every link, and cap the lifetime (*maximum days*).

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
| Who can create spaces | administrators (`files.admin`) |
| Days in the trash | 30 (1–365) |

The Knowledge Base still applies its own size limit and file types to uploads made from the Knowledge Base.

## Storage and security

- Blobs live in `UPLOAD_DIR/files/<year>/<month>/` under random names. Migrated Knowledge Base files keep `UPLOAD_DIR/kb/`. Office PDF previews are cached in `UPLOAD_DIR/.previews/` and keyed by the file's update time.
- Storage keys are resolved strictly inside `UPLOAD_DIR`. A key that escapes it is treated as missing.
- PDF and image uploads must match their magic bytes.
- Files are served only by access-checked API routes, with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. Only safe types are shown inline; everything else is an attachment.
- Hidden items return `404`, so their existence does not leak. Trashed items are visible only to their owner or a space manager.
- Link passwords are bcrypt-hashed. Visitor tokens are JWTs bound to the link and its version.
- The `files:trash` scheduler job deletes expired trash every 6 hours, rows and blobs both.
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
| POST | `/upload?parentId=` or `?spaceId=` | Multipart (`files[]`) |
| GET | `/nodes/:id` | Details, including Knowledge Base usage |
| PUT | `/nodes/:id` | `{ name }` renames, `{ move: { parentId } | { spaceId } | {} }` moves (`{}` is the root of My files) |
| DELETE | `/nodes/:id` | To the trash (`409 FILE_IN_USE` with `info.usage` if the Knowledge Base uses it) |
| POST | `/nodes/:id/restore` | Restore from the trash |
| DELETE | `/nodes/:id/forever` | Delete permanently |
| GET | `/nodes/:id/file[?download=1]`, `/nodes/:id/preview.pdf` | Content, Office preview |
| GET / PUT | `/nodes/:id/shares` | `{ shares: [{ subjectType: 'user' | 'group', subjectId, level: 'view' | 'edit' }] }` |
| GET / POST | `/nodes/:id/links` | Public links |
| PUT / DELETE | `/links/:id` | Edit, revoke (`{ revoked: true }`) or delete |

Public API, no session (`X-Link-Token` header or `?t=`):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/l/:token/unlock` | `{ password }` → `{ token }` |
| GET | `/api/l/:token[?folder=]` | The shared node, or a folder's contents inside it |
| GET | `/api/l/:token/nodes/:id/file` | File (downloads only if allowed) |
| GET | `/api/l/:token/nodes/:id/preview.pdf` | Office preview |

Knowledge Base additions: `POST /api/app/kb/folders/:id/from-files` (`{ nodeIds }`), `GET /api/app/kb/items/:id/attachments/:nodeId[/preview.pdf]`, and the same routes under `/api/s/:slug/items/:id/attachments/…`. Article payloads accept `attachments: [nodeId…]`.

Error codes: `NOT_FOUND`, `FORBIDDEN`, `NAME_REQUIRED`, `MOVE_CYCLE`, `TRASHED`, `FILE_IN_USE`, `QUOTA_EXCEEDED`, `FILE_TYPE`, `FILE_CONTENT`, `FILE_TOO_LARGE`, `FILE_MISSING`, `PASSWORD_REQUIRED` (401), `WRONG_PASSWORD`, `RATE_LIMITED`, `EXPIRED` (410), `NO_DOWNLOAD`, `LINKS_DISABLED`, `PASSWORD_SHORT`, `EXPIRY_LIMIT`, `INVALID_DATE`, `SYSTEM_FOLDER`, `NOT_TRASHED`.
