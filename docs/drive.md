# Drive — company file servers (`/app/drive`)

A [module](modules.md) that turns the company's Windows file servers (SMB 2/3, Samba too) into one network drive in the browser. An administrator names the drive (for example *iSmarty Drive*), adds file servers, and lists the folders (shares) people see. Together the folders work like a DFS namespace. People then browse, view, edit, upload and share files with their own domain accounts. The server's share permissions and NTFS rights, usually managed through Active Directory security groups, decide what each person can read or change.

The module is **off by default**. Turn it on under *Settings → Modules → File server*, then add a server.

## What people get

- **Overview**: the drive's name and subtitle, a tile per folder with the person's rights (*Read & write* or *Read only*) and free space, plus favourites and recent files.
  - **One folder opens directly**: when someone enters the drive and exactly one of their folders is reachable (others offline, denied or missing don't count), the drive skips the overview and opens that folder. It doesn't do this when a server is waiting for the person's sign-in, so they still see that prompt. The jump replaces the history entry, so *Back* leaves the drive. The overview is still there: the breadcrumb root, *Overview* in the menu, and `/app/drive?list=1` all show the list, and the drive only jumps on the page you first enter it on.
- **Folders**:
  - breadcrumbs and grid or list views, sorted by name, date, size or type;
  - image thumbnails;
  - search inside a folder and all its subfolders;
  - an option to show hidden files;
  - a *Copy network path* button (`\\server\share\…` or the DFS path you configure) for opening the item in Explorer.
- **Changes**:
  - upload by button or drag & drop, with a *Replace / Keep both / Skip* choice when names clash;
  - upload whole folders (drag & drop or *Upload ▾ → Upload folder*), see [Uploading folders](#uploading-folders);
  - new folder, rename, move or copy between folders of the same server, delete;
  - download a file, a folder or a selection as a ZIP.

  Write actions show only where the server grants write access.
- **Viewers**:

| Type | How it opens |
|------|--------------|
| PDF | pdf.js viewer: pages or **slides** (one page at a time; landscape documents start as slides), and a full-screen **presentation** (← → / Space, Home / End, `G` for all slides, Esc to leave) |
| Images (`png`, `jpg`, `gif`, `webp`, `bmp`, `svg`) | Lightbox gallery with the folder's other images |
| Word `docx` | Rendered in the browser, or as an exact PDF with [document conversion](integrations.md#document-conversion-collabora--libreoffice) |
| Excel `xlsx`, `csv` | Spreadsheet grid |
| `doc`, `xls`, `ppt`, `pptx`, OpenDocument | Converted to PDF (needs document conversion) |
| AutoCAD `dwg`, `dxf` | CAD viewer (WebGL): pan, zoom, layers, fit to screen. DWG is converted to DXF on the server with LibreDWG (R13–2018+) and cached |
| Markdown `md` | Rendered, and **editable in place**: write / split / preview, `Ctrl+S`. Saving refuses to overwrite a newer version unless you confirm |
| Text, JSON, XML, logs, CSV | Shown and editable as text |
| Video and audio | Native players with seeking (HTTP ranges) |

- **Each file has its own page** (`/app/drive/v/<folder>/<path>`) by default. The page has the whole window for the viewer, ‹ › through the folder's files and a link back to the folder, and its address can be bookmarked or sent. The *Opening files* setting switches back to a modal over the folder.
- **Favourites and recent files**, kept per person.
- **Public links** (see below) and **My links** with the state and permissions of each one; links can be edited later.
- **Connections**: which account opens each server, and a way to sign in or switch accounts.

## Uploading folders

Dropping a folder (or picking one with *Upload ▾ → Upload folder*; not offered on iOS / Android) recreates its tree on the share and uploads every file into place:

- The portal first checks that the person may write to the current folder (the server's own rights), then makes all folders in one gateway call. **Existing folders are reused** (merged into); empty folders are kept when dropped.
- If a dropped top-level folder already exists, the usual *Replace / Keep both / Skip* question is asked once and applies to the files inside it (*Skip* leaves files that are already there untouched and counts them as skipped).
- A file in the way of a folder fails that folder's files (`NOT_A_FOLDER`); a name the server does not accept (`: * ? " < > |`) fails only that file. Everything else goes on, and the panel lists each failure with its reason.
- Three files upload at a time, the batch can be cancelled, the size limit applies per file. Up to 10,000 files and 32 folder levels per upload. Every created folder is recorded in the activity log (*created folder*).

## Signing in to file servers

For each server, the administrator picks one of two modes.

| Mode | How it works |
|------|--------------|
| **Personal domain accounts** (recommended) | Each person works as themselves, so NTFS rights and AD security groups apply. With *Use the portal sign-in*, people who signed in with Active Directory are connected automatically. Anyone else enters a domain account once under *Connections* (or the *Sign in* button on a tile). |
| **One service account** | Everyone works as the same account. Use portal groups on each folder (*Visible to*) to limit who sees it. |

The credential used for a person is chosen in this order:

1. credentials the person saved for that server;
2. their AD sign-in, if the server allows it;
3. the server's service account.

**Password handling:**

- The AD password is captured only after a successful directory sign-in. It is sealed with AES-256-GCM (`ENCRYPTION_KEY`) and never sent back to the browser.
- An hourly job deletes the credentials of disabled or blocked users. Turning *Use the portal sign-in* off also deletes stored sign-in passwords.
- When a server rejects a stored password (it changed, expired, or the account is locked), the credential is **parked**. It is not tried again until the person signs in anew, so a stale password cannot lock the AD account.
- Parallel requests (for example a page of thumbnails) wait for a single authentication, so one bad password costs one failed logon.
- Sessions are pooled **per credential** (server, user and password), never per user name. A session is renewed after 15 minutes, so AD group changes apply as they would on a new Windows logon.

## Administration (*Settings → Modules → File server*)

| Setting | Default | Notes |
|---------|---------|-------|
| Drive name / subtitle | “File server” | Shown in the menu, launcher and on the overview |
| Use the portal sign-in | on | Reuse the AD sign-in password (sealed) |
| Hide folders without access | on | Off: such folders are shown locked |
| Opening files | Own page | *Window over the folder* opens files in a modal (images always use the lightbox there) |
| Activity log | on | Records who did what (see *Activity log* below) |
| Record opened folders | on | Off: only files, changes, links and sign-ins are recorded |
| Keep the log for | 365 days | 0 = forever; older rows are removed once a day |
| Maximum upload size | 2048 MB | Up to 10 GB |
| Public links | on | |
| Who may open links | Author decides | *Employees only* forces sign-in for every link |
| Require password / maximum days | off / 0 | Same as in Files |
| Links that allow changes | on | Off: links can only show and download; existing write links fall back to that (upload-only links close with *Uploads through links are turned off*) |
| Password for such links | off | On: links that grant uploads or changes need a password; existing ones without one stop accepting changes |

**A server:**

- name, host (DNS or IP), port 445, domain (empty = the domain from the Active Directory base DN);
- sign-in mode (see above);
- *Require SMB encryption* (SMB 3).

*Test connection* checks the account entered in the dialog, else the service account, else your own sign-in. It also lists the server's shares.

**A folder:**

- the name people see, colour and description;
- the share, picked from the server's list or typed (hidden `$` shares work too);
- an optional sub-folder, so you can publish `\\fs01\Data\Departments\Accounting` as *Accounting*;
- the path shown to people, for example a DFS path;
- portal groups that see it (empty = everyone);
- *Allow public links*.

Folders can be reordered.

**All public links** lists every link with its author, state and views, and lets you turn any of them off.

Permission: `drive.admin`. With it you manage servers and folders and see all links, and you see every folder regardless of portal groups. What you can open inside a folder is still decided by the file server.

## Public links (`/d/<token>` or `/d/<slug>`)

**Share by link** on a file or folder opens the link window: a compact list of the item's links (address with the custom part highlighted, permission icons, expiry, password lock, views, state; *Copy* and *Edit* at hand, ⋯ for QR code, *Open as recipient*, turn off / on and delete) and the same form as in Files ([files.md](files.md#public-links-ltoken-or-lslug)):

- **Simple card**: what the recipient can do (*View*, *View and download*; *More…* for folders), expiry chips (*No expiry* / *1 day* / *7 days* / *30 days* / *Date…*, end of that day in the person's zone), password (off by default, *Generate*) and the **link address** `portal…/d/<slug>` with a live availability check. *Create and copy* copies the link and shows it with the password reminder, a QR code and *Open as recipient*.
- **Advanced settings** (collapsed, with a summary; open by themselves for links that use them): every permission preset and switch (deleting is labelled *Delete permanently* — file servers have no recycle bin), upload rules, title and message for the recipient, **who can open** (*Anyone with the link* / *Employees only*) and the recipient-page preview. When a link is for employees only, the simple card says so.

Custom addresses follow the Files rules (3–64 characters, `a–z`, `0–9`, single hyphens, reserved words, Cyrillic transliterated, case-insensitive) in their own namespace: the same slug may exist once in Files and once in Drive. Revoked and expired links keep their slug; a changed or deleted slug stops at once and is held 90 days for its author. The random token address keeps working. An unknown address answers `404 NOT_FOUND` (*no such link*).

### What the recipient can do

| Preset | Permissions | Notes |
|--------|-------------|-------|
| View only | `view` | Open and preview, no downloads |
| **View and download** (default) | `view`, `download` | Exactly what links did before permissions existed |
| Upload only | `upload` | A file request: the visitor sends files and never sees the folder, only what they uploaded in this browser tab |
| View and upload | `view`, `download`, `upload` | |
| Full access | all seven | |
| Customize… | any combination | |

The seven permissions: `view` (list and open), `download` (files and ZIPs), `upload` (new files), `mkdir` (new folders, also needed to upload whole folders), `rename`, `replace` (a new version of an existing file), `delete`. Everything except `upload` needs `view` and is dropped without it (never turned into a read link: `['upload', 'download']` is the file request `['upload']`), the same rule as Files and the picker (`modules/shared/linkPermissions.js`). Lists saved by the earlier rule, which added `view` instead, are read as before. A **file** link can only grant `view`, `download` and `replace`.

**Upload rules** (shown when the link accepts files): maximum file size (within the module's limit), allowed file types (`.pdf, .jpg`), a total for the link (quota), *Ask the visitor's name* (and e-mail), *Notify me*. A **title** and a **message** for the recipient are optional; the editor shows a live preview of the page the recipient will see.

Existing links were migrated to `view` + `download` (or `view` only where downloads were off), so they behave exactly as before.

### Whose rights a link uses

A link has **no access of its own**. Reading and every change act with the **author's file-server account** — the one the drive picks for the author on that server: their saved *Connect as…* account, else their AD sign-in, else the server's service account. So:

- a link can never grant more than its author can do. When write permissions are granted (on creation or later), the author's rights on the folder are checked through the gateway: the server's *maximal access* answer, confirmed by creating and removing a hidden marker file (`~$portal-….probe`) because some servers (Samba) report file-system rights and ignore a share's read-only rules. Missing rights are refused with `GRANT_EXCEEDS` (and the editor locks those presets);
- at action time the file server decides as for the author; a refusal is shown to the visitor as *The file server did not allow this change* (`WRITE_DENIED`), the page stays;
- when the author's password expires or is revoked, visitors see *Changes are not possible right now* (`UNAVAILABLE`, `info.reason = credentials`) and the author's credential is parked like any other.

### Visitors who change files

- **Visitor session.** Changes need a visitor session: a signed token (12 h, scope `w`) bound to the link and its version, with a random session id and the name and e-mail the visitor gave. A new password, or turning the link off or on, ends every session. The token travels only in the `X-Link-Token` header — never in the address — which a page on another site cannot set; with the portal's Origin check this keeps forged cross-site requests out.
- **Read tokens in addresses.** File addresses (`/file`, `/thumb`, `/preview.pdf`, `/cad`, `/zip` in `<img>`, `<video>`, the PDF viewer, downloads) carry a separate read token in `?t=` (scope `r`, no session id) that the page gets with every load. It opens files but never changes anything, never opens a session (`/unlock` does not accept it in place of the password) and is the only kind accepted in an address, so what ends up in browser history or access logs (the bundled nginx also masks `t=`) cannot be used for changes. Tokens issued before scopes existed are swapped on the next page load (same session id and name), so open pages keep working.
- **Name and e-mail.** With *Ask the visitor's name* the page asks once before the first change; the name appears next to each change in the activity log and in notifications.
- **Clashes never overwrite silently.** An upload-only visitor's file is stored under a free name (`report (1).pdf`), but the visitor is answered — and later shown in *my uploads* — the name they sent: a file request never tells what the folder holds. The author and the activity log see the stored name. Visitors who see the folder are asked *Replace / Keep both / Skip*; *Replace* is offered only with the `replace` permission.
- **Deleting is final.** File servers have no recycle bin, so `delete` must be granted explicitly; the editor warns the author and visitors confirm with a check box (*I understand, delete for good*).
- **Paths stay inside the link** (no `..`, backslashes, `:` or Windows-forbidden characters, checked in Node and the gateway). The link's own root cannot be renamed or deleted. Hidden and system items (and names starting with `.` or `~$`) are never listed, cannot be changed and cannot be created by visitors.
- **Limits.** Per file: the link's maximum within the module's *Maximum upload size*; file types; the link's total (reserved atomically before each upload, so parallel uploads cannot overshoot it, and given back when an upload fails). Rate limits per visitor address and link: 600 uploads and 120 other changes per 15 minutes, and 3,000 changes per hour per link; wrong passwords: 10 per 15 minutes. Limits count per link (its id): the token and every letter case of the custom address share one budget.
- **Views.** A view is the first load of the link page by a person in a browser tab. Crawlers, *Open as recipient* (`?preview=1`) and reloads in the same tab (`?repeat=1`, after an upload or F5) do not count.
- **Uploads stream** through the gateway exactly like signed-in uploads (temporary file, rename at the end, dropped when the browser goes away).
- **Notifications.** With *Notify me*, the author gets one notification per visitor burst (after 2 quiet minutes, at most 10 minutes after the first change): *Ivan uploaded 5 files via your link "Documents"*, with the names. Kind `drive.linkActivity` (*Activity on my links* in notification settings). Bursts are kept in memory; a restart in the middle of one loses that digest, never a file.

### When a link stops working

| Situation | Visitor sees |
|-----------|--------------|
| The author's portal account is disabled or blocked (they left the company) | *This link is no longer active.* It was created by an employee who no longer works with the company. For security, all links created by former employees are switched off automatically. If you still need these materials, contact your company representative and they will share them again. |
| The author loses access to the item on the file server (AD group removed, NTFS rights changed) | *These files are no longer shared* |
| The author turned the link off / it expired | *This link has been turned off* / *This link has expired* |
| The file was moved or deleted on the server | *This file was moved or deleted* |
| The server is unreachable or the author's password must be renewed | *The files are temporarily unavailable* |
| An upload-only link while administrators turned write links off | *Uploads through links are turned off* |

Reactivating the author's account makes their links work again. Deleting the account deletes their links. A folder link never reaches outside its folder, because paths are confined to the link's root.

| Option | Notes |
|--------|-------|
| Who can open | *Anyone with the link*, or *Employees only* (sign-in required, then back to the link) |
| Password | Optional, at least 4 characters; unlocking is rate-limited |
| Expiry | 1 / 7 / 30 days or a date; capped by *maximum days* |

## Security

- **SMB gateway.** SMB runs in a small Python process (`modules/drive/gateway/smbgate.py`, smbprotocol) that Node starts on first use and restarts if it dies. It listens on a private Unix socket (mode `0600`) and accepts only requests that carry a random per-start key. No credentials touch the disk there.
- **Paths are validated twice** (Node and the gateway):
  - no `..`;
  - no alternate data streams (`:`);
  - no characters Windows forbids;
  - share names and hosts are checked too.
- **Content is served safely.** It is streamed with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. Only safe types are shown inline; everything else downloads.
- **Uploads are atomic.** They are written to a hidden temporary file (`~$portal-….tmp`) and renamed at the end, so an interrupted upload never leaves a broken document. When the browser goes away mid-upload the portal drops its gateway request too; the gateway also gives up on a body that stays silent for 120 s (slow but moving uploads are unaffected) and removes the temporary file. Replacing a file swaps it with rollback on failure.
- **Locked files are reported.** Files open in Word or Excel on someone's PC are still readable. Writing to them returns *The file is open in another program*.
- **Caches are checked on every use.** Thumbnails, Office PDFs and DWG conversions are cached in `UPLOAD_DIR/.previews/` by path, size and modification time. Each request first checks access on the server with the person's own credentials. Before a cached copy (or one being made for someone else) is served, the file is also opened for reading (a one-byte read), since listing a folder alone does not grant reading its files; a positive answer is remembered for 5 minutes per credential and file. Cached copies unused for 30 days are removed by the daily `storage:previews` job.
- **Moving a server drops its secrets.** When an administrator changes a server's host or port, the stored service-account password and the accounts people saved for that server ("Connect as…") are cleared; the service password has to be typed again. *Test* with a changed host or port never uses secrets saved for the old machine.
- **DWG conversions** stream the drawing to disk (never into memory), run at most two at a time, and requests for the same drawing share one conversion.

## Operations

- The container must reach the file servers on **TCP 445**, routed from the Docker host.
- NTLM is used for authentication, with NTLMv2 against AD. If NTLM is disabled in the domain, the module cannot sign in.
- Environment (optional):

| Variable | Default | Purpose |
|----------|---------|---------|
| `SMBGATE_PYTHON` | `python3` | Interpreter for the gateway |
| `SMBGATE_IDLE` | `300` | Seconds before an idle SMB session closes |
| `SMBGATE_MAX_AGE` | `900` | Seconds before sessions are renewed (AD group changes) |
| `SMBGATE_DC` | — | Domain controller for domain-based DFS (`\\corp.local\dfs`) |
| `DWG2DXF` | `dwg2dxf` | LibreDWG converter used for DWG previews |

- The production image builds LibreDWG 0.14 (`dwg2dxf`) and installs Python 3, smbprotocol and Pillow. The CAD viewer ships the DejaVu Sans font (`/fonts/cad-sans.ttf`) for Cyrillic and Latin text in drawings.
- The bundled `nginx.conf` streams `/api/app/drive/` (up to 10 GB, no buffering, 1-hour timeouts) and `/api/d/`. A reverse proxy in front needs the same settings.

## API

All under `/api/app/drive`, signed-in users only (`:id` = folder id, `path` = path inside it):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Drive name, folders with state, rights and free space, connections, config |
| GET | `/shares/:id/list?path=&hidden=1` | Folder contents, rights, network path |
| GET | `/shares/:id/stat?path=` · `/search?path=&q=` | Item details · recursive name search |
| POST | `/shares/:id/folders` | `{ path, name }` |
| POST | `/shares/:id/folders/tree` | Folder uploads: `{ path, paths: ["A", "A/B", …] }` → `{ folders: [{ path, error }] }` in the order of `paths`; existing folders are reused; `403 ACCESS_DENIED` without write access; at most 1000 paths, 32 levels |
| PUT | `/shares/:id/rename` | `{ path, name }` |
| POST | `/shares/:id/delete` | `{ paths }` |
| POST | `/shares/:id/move` | `{ paths, toShareId?, toPath, copy? }` |
| PUT | `/shares/:id/upload?path=&name=&conflict=rename\|replace\|fail` | Raw body (`application/octet-stream`) |
| PUT | `/shares/:id/text?path=&mtime=` | Save text; `409 CHANGED` if the file changed |
| GET | `/shares/:id/file?path=[&download=1]` | Content, with HTTP ranges |
| GET | `/shares/:id/thumb` · `/preview.pdf` · `/cad` · `/zip?p=…` | Thumbnail · Office → PDF · drawing as DXF · ZIP |
| GET / POST / DELETE | `/recent`, `/favorites` | Shortcuts |
| GET / PUT / DELETE | `/connections[/:serverId]` | The person's credentials (checked before saving, rate-limited) |
| GET | `/links[?shareId&path]` | My links |
| POST | `/shares/:id/links` | `{ path, audience, password?, expiresAt?, slug?, permissions?, title?, note?, maxFileMb?, allowedExts?, quotaMb?, requireName?, requireEmail?, notify? }` (`allowDownload` still accepted; `400 SLUG_INVALID`, `409 SLUG_TAKEN`) |
| PUT / DELETE | `/links/:id` | Edit (same fields; `slug: ''` removes the custom address), revoke (`{ revoked }`) or delete |
| GET | `/link-slugs/check?slug=[&linkId=]` | `{ slug, available, reason, suggestions }` (as in Files; 60 checks per minute per person) |
| `*` | `/admin/…` | Servers, folders, order, test, all links (`drive.admin`) |

Public (`X-Link-Token` header; content URLs also take the read token in `?t=`; the session cookie counts for *Employees only*). `:token` is the token or the custom address, in any case:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/d/:token/unlock` | Visitor session: `{ password?, name?, email? }` → `{ token, readToken, visitor }`; with a current session token in `X-Link-Token` it keeps the session and adds the name (a read token there counts for nothing) |
| GET | `/api/d/:token[?path=][&preview=1][&repeat=1]` | The item, or a folder's contents inside the link; `link.permissions`, `link.limits`, `visitor`; `uploadOnly: true` and no entries for file requests. With a visitor token in the header (never one from the address): `readToken` for content URLs and `visitorToken` replacing a token issued before scopes. `preview=1` / `repeat=1`: not counted as a view |
| GET | `/api/d/:token/mine` | What this visitor session uploaded (file requests: under the names sent) |
| GET | `/api/d/:token/file` · `/thumb` · `/preview.pdf` · `/cad` · `/zip` | Content (`view`; downloads need `download`) |
| PUT | `/api/d/:token/upload?path=&name=&conflict=fail\|rename\|replace` | Raw body; `upload` (`replace` for overwriting); upload-only visitors always get `rename` into the link root |
| PUT | `/api/d/:token/replace?path=` | New version of an existing file (`replace`; the file itself for a file link) |
| POST | `/api/d/:token/folders` · `/folders/tree` | `{ path, name }` · `{ path, paths }` (`mkdir`; the tree also `upload`) |
| PUT | `/api/d/:token/rename` | `{ path, name }` (`rename`) |
| POST | `/api/d/:token/delete` | `{ paths }`, up to 100 (`delete`) |

All changes need the visitor session in the `X-Link-Token` header. The bundled `nginx.conf` streams `/api/d/<token>/upload` and `/replace` like signed-in Drive uploads (10 GB, no buffering).

`PASSWORD_REQUIRED`, `SIGN_IN_REQUIRED` and `UPLOADS_DISABLED` carry no details: the link's name and kind are shown only once it opens.

Visitor error codes: `NOT_FOUND`, `REVOKED`, `EXPIRED`, `OWNER_INACTIVE`, `OWNER_NO_ACCESS`, `GONE`, `UNAVAILABLE` (`info.reason`: `credentials` or `server`), `LINKS_DISABLED`, `UPLOADS_DISABLED`, `SIGN_IN_REQUIRED`, `PASSWORD_REQUIRED`, `WRONG_PASSWORD`, `NO_DOWNLOAD`, `NO_PERMISSION`, `SESSION_REQUIRED`, `VISITOR_REQUIRED`, `NAME_REQUIRED`, `EMAIL_REQUIRED`, `EMAIL_INVALID`, `FILE_TOO_LARGE` (`info.maxMb`), `EXT_NOT_ALLOWED`, `LINK_QUOTA_EXCEEDED`, `WRITE_DENIED`, `ITEM_GONE`, `EXISTS`, `INVALID_NAME`, `INVALID_PATH`, `RATE_LIMITED`.

Author error codes when saving a link: `GRANT_EXCEEDS` (`info.missing`), `WRITE_LINKS_DISABLED`, `WRITE_PASSWORD_REQUIRED`, `PASSWORD_REQUIRED`, `PASSWORD_SHORT`.

File server error codes:

- sign-in: `CREDENTIALS_REQUIRED`, `CREDENTIALS_FAILED` (with `info.reason`), `AUTH_FAILED`, `ACCOUNT_LOCKED`, `ACCOUNT_DISABLED`, `PASSWORD_EXPIRED`, `SERVICE_AUTH_FAILED`;
- access and items: `ACCESS_DENIED`, `NOT_FOUND`, `SHARE_NOT_FOUND`, `EXISTS`, `FILE_LOCKED`, `NOT_EMPTY`;
- limits: `DISK_FULL`, `QUOTA_EXCEEDED`, `FILE_TOO_LARGE`;
- names and moves: `INVALID_PATH`, `INVALID_NAME`, `MOVE_CYCLE`, `CROSS_SERVER`, `CROSS_ACCOUNT`;
- connection: `SERVER_UNREACHABLE`, `GATEWAY_DOWN`;
- drawings: `NO_CAD_CONVERTER`, `CAD_UNREADABLE`.

## Activity log

Permission: `drive.audit` (*File server activity log*). Super administrators always have it; it can be given to other roles in the role editor. The log is at **File server → Activity log** (`/app/drive/activity`), and *Activity history* in a file's or folder's menu opens it filtered to that item.

What is recorded, with time, person (or link visitor and IP — with the name and e-mail the visitor gave, and the link's title), folder, path, size, result and browser:

| Group | Actions |
|-------|---------|
| Viewing | opened folder, searched (with the query), viewed file, opened public link |
| Downloads | downloaded file, downloaded ZIP (with the items) |
| Changes | uploaded (replaced or new), created folder, renamed, moved, copied, edited text |
| Deletion | deleted |
| Links | created, changed, deleted link; wrong link password |
| Connections | signed in to a server (including refused accounts), signed out |
| Administration | saved or deleted a server, saved or removed a folder |

- Failures are recorded too (for example *access denied* by the server), except "not connected yet" (`CREDENTIALS_REQUIRED` / `CREDENTIALS_FAILED`).
- Repeated reads are folded: the same file opened again within 10 minutes (range requests, previews), the same folder within 5 minutes and the same search within a minute count once.
- Writing happens after the response and never fails a request.
- Names of people and folders are stored with each row, so the log stays readable after an account or folder is removed.
- Filters: period (today, 7/30/90 days or any range), free-text search (file, path, person, login, folder, IP, details), people, actions or whole groups, folders, result, portal or public links, and a path (the item and everything under it). Filters live in the address, so a view can be bookmarked or sent.
- Figures for the period (events, people, downloads, changes, deletions, failures; each one is a filter), the most active people and most used files.
- **Export CSV**: everything that matches the filters, up to 100 000 rows, `;`-separated with a BOM for Excel, times in the viewer's time zone.

API (`drive.audit`): `GET /api/app/drive/admin/activity` (`from`, `to`, `q`, `users`, `actions`, `shares`, `result=ok|failed`, `via=portal|link`, `path`, `ip`, `page`, `pageSize`), `GET /api/app/drive/admin/activity/people?q=`, `GET /api/app/drive/admin/activity/export.csv` (same filters, `tz`).

