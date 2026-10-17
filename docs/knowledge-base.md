# Knowledge Base (`/app/kb`)

The first [module](modules.md). It is a structured library of folders and materials, with per-folder access rules, public links, and in-browser viewers for PDF, images and Microsoft Office documents. It works on desktop and mobile.

## What's inside

- **Folders of any depth**, each with an icon and a colour. Folders without their own icon or colour use the defaults from the module settings. A tree in the sidebar (a drawer on mobile), breadcrumbs, grid and list views, and search across folders and materials.
- **Materials** come in three kinds:
  - **Files**, uploaded with the button or by drag & drop, several at once, or picked with **Add from Files**. They are stored in the [Files](files.md) module (see [Files from the Files module](#files-from-the-files-module)).
  - **Articles**, written in the **visual editor** (HTML: headings, marks, highlight, lists, checklists, alignment, links, tables, pictures and files pasted, dropped, uploaded or chosen from Files; full screen) or in **Markdown** with a toolbar and write / split / preview modes. New articles start visual; an article can switch format at any time (Markdown → HTML with `marked`, HTML → Markdown with `turndown`, keeping tables as HTML). An article can embed files and carry attachments.
  - **Links**, to external pages (http/https only).
- **Viewers:**

| Type | Viewer |
|------|--------|
| PDF | pdf.js: lazy page rendering, selectable text, thumbnails, fit width / fit page, zoom, page jump, keyboard, full screen |
| Images | Lightbox gallery: zoom, pan, pinch and swipe, keyboard, thumbnail strip |
| Word `.docx` | Rendered in the browser (docx-preview), or as an exact PDF when conversion is configured |
| Excel `.xlsx`, `.csv` | Spreadsheet grid with sheets, merged cells and basic styles (first 3,000 rows) |
| `.doc`, `.ppt`, `.pptx`, `.xls`, `.odt`, `.ods`, `.odp`, `.rtf` | Converted to PDF by the [document conversion](integrations.md#document-conversion-collabora--libreoffice) integration, then shown in the PDF viewer |
| Text, Markdown, JSON, XML, logs | Text or rendered Markdown (sanitised with DOMPurify) |
| Video and audio | Native players |

Anything else gets a file card with a download button.

## Access

Access is set separately for the whole base, for each folder and for each material. There are three levels, and each one includes the ones below it:

| Level | Allows |
|-------|--------|
| **View** | Open folders and materials |
| **Edit** | Create, upload, edit, move and delete content |
| **Manage** | Edit, plus change access and create public links |

Rules can be granted to **everyone signed in**, a **user**, a **group** or a **role**.

- **The base** (*Access to base* on the home page) holds the root rules. The defaults are *Everyone: view* and *Administrators group: edit*.
- **A folder** inherits its parent's rules. You can add rules to a folder or turn inheritance off, which makes it private to the listed people. Subfolders inherit from it.
- **A material** inherits from its folder or gets its own list.
- Users with the `kb.admin` permission (super administrators by default) have *manage* everywhere.
- Hidden content stays hidden: it does not show up in the tree, search or counts, and a direct URL returns `404`.
- Nobody can lock themselves out. When someone saves rules that would remove their own *manage*, they keep it.

## Public links (`/s/<slug>`)

**Share** on a folder creates a link that opens the folder and everything that **inherits** from it, without signing in. Private subfolders and materials are never exposed.

| Option | Notes |
|--------|-------|
| Title | Shown to visitors instead of the folder name |
| Address | Custom slug, e.g. `/s/onboarding`. Availability is checked as you type. If the slug is taken, the next free one is suggested (`onboarding-2`). Cyrillic and Kazakh titles are transliterated. Reserved words (`admin`, `api`, `app` …) are refused |
| Password | Optional. Visitors enter it once per browser tab. Unlocking is rate-limited (10 attempts per 15 minutes per IP and link) |
| Expiry | Presets or a date. Expired links show *This link has expired* |
| Downloads | Can be disabled, which leaves viewing only |

You can keep several links per folder with different settings. Each link shows its view count. Links can be **revoked** (and restored) or deleted. Changing the password or revoking a link invalidates every visitor token that was already issued.

Module settings can switch public links off entirely, require a password on every link, and cap the lifetime (*maximum days*).

A link lives only while its author does (as in Files): when the author is deleted, deactivated or blocked, or no longer manages the folder, visitors see *This link no longer works* (`OWNER_INACTIVE` / `OWNER_NO_ACCESS`).

## Files from the Files module

With the [Files](files.md) module enabled:

- Uploads are stored in the uploader's *My files → Knowledge base* folder, so they show up in Files as well.
- **Add from Files** (folder menu) adds files from My files, Shared with me or a shared space without copying them.
- Both editors keep files as `kbfile:<id>`: in HTML as `<img src="kbfile:42">` / `<a href="kbfile:42">`, while editing they point at real URLs with `data-kbfile` and are turned back on save. Pictures pasted or dropped into the visual editor are uploaded with `POST /folders/:id/media` (new article) or `POST /items/:id/media` (edit rights required) into the author's *My files → Knowledge base* and attached when the article is saved.
- Pictures in the visual editor have a floating toolbar (size presets S/M/L/100%/Auto, corner drag handles snapping to 5 %, layout centre / left / right / wrap-left / wrap-right, caption, alt text, link, replace, open, download, delete). A picture with any of these is stored as `<figure class="kb-figure" data-width="50" data-align="wrap-left"><a href="…"><img src="kbfile:42" alt="…"></a><figcaption>…</figcaption></figure>` (`data-width` = % of the text column, 10–100 step 5; link and caption optional); a plain picture stays `<img src="kbfile:42">`. The `.kb-prose .kb-figure` rules lay them out in the editor, the article view and public links; wrapped pictures become full-width blocks below 640 px. Converting to Markdown keeps such figures as HTML, plain pictures become `![alt](kbfile:42)`. In the article view a click on a picture (not a linked one) opens the lightbox with all pictures of the article.
- In the Markdown editor, **📎 File** embeds a file in the text: images are shown inline (`![name](kbfile:42)`), other files become a link (`[📎 name](kbfile:42)`). The *Files* section adds attachments below the article.
- Readers open these files through Knowledge Base access, including public links. They do not need access in Files.
- A file used by the Knowledge Base cannot be moved to the trash in Files until it is removed from the materials that use it. Deleting a material keeps the file in Files.

## Module settings (Admin → Settings → Modules → Knowledge base)

| Setting | Default |
|---------|---------|
| Enabled | on |
| Default folder colour and icon | `#3B82F6`, `folder` |
| Maximum upload size | 50 MB (1–1024) |
| Allowed file types | images, PDF, office, text, media, archives |
| Public links / require password / maximum days | on / off / 0 (unlimited) |

Office conversion shows its status here. Its URL is configured under **Integrations → Document conversion**.

## Storage and security

- Files are stored by the [Files](files.md#storage-and-security) module: `UPLOAD_DIR/files/…`, plus `UPLOAD_DIR/kb/` for files uploaded before Files existed (moved into Files once, `kb_files_migrated`). PDF previews are cached in `UPLOAD_DIR/.previews/`.
- Uploads are checked against the allowed extensions and the size limit. PDF and image files must also match their magic bytes, so a renamed executable is rejected.
- Files are served by the API rather than as static files, with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. Only safe types are shown inline; everything else is sent as an attachment.
- Article Markdown and HTML are sanitised with DOMPurify before rendering (HTML articles use their own instance: scripts, handlers, style sheets and forms are removed, checklist boxes are shown read-only), and links open with `rel="noopener noreferrer"`.
- Saving an article checks its attached and embedded files first; the text and the file list are then written in one transaction, so a rejected file leaves the article unchanged.
- API tokens limited to selected Files spaces reach Files through the Knowledge Base only inside those spaces: uploads into *My files* and files outside the spaces answer `403 TOKEN_LIMITED`.
- Back up `UPLOAD_DIR` together with the database.

### Reverse proxy

Uploads go to `/api/app/`, which has its own body limit in `nginx.conf` (`client_max_body_size 1024m`, streamed with `proxy_request_buffering off`). If another proxy sits in front, give `/api/app/` the same limit there. The PDF viewer needs `'wasm-unsafe-eval'` in `script-src` and `worker-src 'self' blob:` in the CSP. The bundled config already sets both.

## API

All under `/api/app/kb`, signed-in users only:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Home: root folders, recent materials, module config |
| GET | `/tree` | Visible folders with levels and counts |
| GET | `/search?q=` | Folders and materials |
| GET / POST / PUT / DELETE | `/folders[/:id]` | Folder CRUD; `PUT` with `parentId` moves |
| POST | `/folders/:id/files` | Multipart upload (`files[]`), stored in Files |
| POST | `/folders/:id/from-files` | `{ nodeIds }` from Files |
| POST / GET / PUT / DELETE | `/items[/:id]` | Articles (`format: md\|html`, `attachments: [nodeId…]`, `kbfile:<id>` embeds) and links; file metadata |
| POST | `/folders/:id/media`, `/items/:id/media` | Upload pictures / files for an article being written (multipart `files`) → `{ files: [{ id, name, file }] }` |
| GET | `/items/:id/attachments/:nodeId[/preview.pdf]` | An article's embedded or attached file |
| GET | `/items/:id/file[?download=1]` | File content |
| GET | `/items/:id/preview.pdf` | Office → PDF preview (cached) |
| GET | `/subjects` | Users, groups and roles for access rules |
| GET / PUT | `/access/:type/:id` | Rules for `root`, `folder` or `item` |
| GET | `/shares/check?slug=` or `?from=` | Slug availability and suggestion |
| GET / POST | `/folders/:id/shares` | Folder links |
| PUT / DELETE | `/shares/:id` | Edit, revoke or delete a link |

Public API, no session (`X-Share-Token` header or `?t=`):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/s/:slug/unlock` | `{ password }` → `{ token }` |
| GET | `/api/s/:slug[?folder=]` | Shared folder contents |
| GET | `/api/s/:slug/items/:id` | Material |
| GET | `/api/s/:slug/items/:id/file` | File (downloads only if allowed) |
| GET | `/api/s/:slug/items/:id/preview.pdf` | Office preview |
| GET | `/api/s/:slug/items/:id/attachments/:nodeId[/preview.pdf]` | Article files |

Error codes: `NOT_FOUND`, `FORBIDDEN`, `MODULE_DISABLED`, `PASSWORD_REQUIRED` (401), `WRONG_PASSWORD`, `RATE_LIMITED`, `EXPIRED` (410), `NO_DOWNLOAD`, `SHARING_DISABLED`, `EXPIRY_LIMIT`, `FILE_TYPE`, `FILE_CONTENT`, `FILE_TOO_LARGE`, `FILE_MISSING`, `NO_PREVIEW`, `NO_CONVERTER`. Slug checks return `available: false` with `reason` `TAKEN`, `RESERVED` or `FORMAT`.

## Demo data and tour

- `modules/kb/demo.js`: a folder «Демо: регламенты» with three Markdown articles and one **visual-editor** article «Охрана труда на объекте» (HTML: a centred picture with a caption, a table and a checklist). The picture is a generated PNG stored as a Files node in the administrator's «My files / База знаний» folder — where an upload from the editor goes — and embedded as `kbfile:<id>`; it is left out when that personal storage is full. Purge deletes the articles, then the picture and its blob (and the «База знаний» folder if the demo made it and it is empty).
- Tour `kb` (`tour/content/kb.js`, texts `tour.kb.*` in `locales/<lang>/tour.js`): the start page, search, the folder tree, sections, recently updated, «Новый раздел» and access (both only for those who see the buttons). Anchors: `kb.hero`, `kb.search`, `kb.tree`, `kb.folders`, `kb.recent`, `kb.newFolder`, `kb.access`. The start page has its own «Тур» button.
