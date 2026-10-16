# Online editing of office documents

Files and the File server (Drive) can open office documents in **Collabora Online** right in the portal. Supported formats are docx, xlsx and pptx, plus odt, ods and odp by default; more can be allowed in the settings. The portal acts as a **WOPI host**: Collabora downloads and saves the document through the portal, and the portal checks the person's access on every call.

## How it works

1. The person picks «Редактировать онлайн» (or «Открыть в редакторе» when read-only).
   - With *Open office files in the editor* on, a click on the document starts the editor.
   - Files: `/app/files/e/:id`; Drive: `/app/drive/e/:shareId/<path>`.
2. The page asks the module for an editor session:
   - `POST /api/app/files/nodes/:id/editor` or `POST /api/app/drive/shares/:id/editor { path }`.
   - The answer contains the Collabora action URL (from `/hosting/discovery`), a WOPI **access token** and its TTL.
3. The frame is loaded by a hidden form post (`access_token`, `access_token_ttl`), so the token never appears in an address bar.
4. Collabora calls the portal back, server to server:

| Call | Endpoint |
|---|---|
| CheckFileInfo | `GET /api/wopi/files/:fileId` |
| GetFile | `GET /api/wopi/files/:fileId/contents` |
| PutFile | `POST /api/wopi/files/:fileId/contents` (lock and `X-COOL-WOPI-Timestamp` checked; a file changed elsewhere → 409 `COOLStatusCode 1010`) |
| Lock / Unlock / RefreshLock / GetLock | `POST /api/wopi/files/:fileId` (`X-WOPI-Override`) |
| Health | `GET /api/wopi/ping` |

## Access tokens

- A JWT signed with a key derived from `JWT_SECRET` for this purpose only, with its own audience and `pur: 'wopi'`. It can't be used as a session or an API token, and a session cookie is never accepted as a WOPI token.
- It carries the file id, the user, the portal session, the token version and `edit|view`. Lifetime is *Session length* (default 10 h).
- **Every** WOPI call re-checks the portal session and the person's current access to the file. Signing out, a password change or a withdrawn share ends editing at once.
- `?access_token=` is masked in the nginx access log and the dev request log.

## Locks and conflicts

- Locks live in the database (`office_locks`, 30 min, refreshed by Collabora); SMB oplocks are not used.
- Lists show «Редактирует: Имя» for files open in the editor.
- Several people editing at once share one Collabora session, so changes are live.

## Where changes are saved

- **Files:** the new content replaces the file, within the owner's quota and file-type checks. The previous content is kept once per editing session as a copy in the trash. Only the first and the closing save are logged.
- **File server:**
  - The file is written with the person's own file-server account (the same rules as uploads), through a temporary file and an atomic replace.
  - SMB has no versions.
  - If the file was changed on the share meanwhile, the save is refused as a conflict and Collabora offers to keep both.
  - A file open in Microsoft Office or LibreOffice on a computer (owner-lock file `~$name` / `.~lock.name#`) opens read-only, with «Всё равно редактировать».
- **Public share links:** not editable in the editor yet.

## Settings

**Settings → Document conversion → «Онлайн-редактор»:**

- **Online editing** — on/off.
- **Collabora address** — the public address people's browsers open, e.g. `https://collabora.example.com`. Empty: the conversion server.
- **Internal address** — optional; how the portal reaches Collabora, e.g. `http://collabora:9980` in Docker.
- **Portal address for Collabora** — how Collabora reaches the portal (WOPI host). Empty: `PUBLIC_URL` / `FRONTEND_URL`.
- **Formats, open by default, session length.**

«Проверить подключение» reads `/hosting/discovery` and shows:

- the formats the server edits;
- whether the portal answers on its WOPI address;
- the values Collabora must be configured with.

### Collabora side

Collabora accepts WOPI calls only from hosts it trusts. For a Collabora CODE container, add the portal as another alias group and WOPI host, then restart it:

```
aliasgroup2=https://portal.example.com:443
extra_params=… --o:storage.wopi.host[1]=portal.example.com
```

Recent Collabora versions allow framing by trusted WOPI hosts. Otherwise add the portal origin to `net.frame_ancestors`.

The portal's own CSP adds the configured Collabora origin to `frame-src` and `form-action`. The app sends it to nginx in `X-Portal-Frame-Src`.

Deployment-specific values (which Collabora host, aliases, compose wiring) are not part of the product documentation: keep them in your deployment notes — see [deployments/README.md](deployments/README.md).

## Code map

| Piece | Where |
|---|---|
| Settings, discovery, tokens, locks, WOPI router | `src/backend/services/office/` |
| Module adapters (`openEditor`, read/write, locks, «Редактирует») | `src/backend/modules/files/office.js`, `src/backend/modules/drive/office.js` |
| Editor page | `src/frontend/src/modules/office/OfficeEditor.jsx`; routes in `files/pages/EditPage.jsx`, `drive/pages/EditPage.jsx` |
| Settings UI | `src/frontend/src/pages/admin/settings/EditorSettings.jsx` |
| Tests | `test/office.test.js`, `test/office-files.db.test.js` (FILES_DB_TEST=1), `test/office-drive.db.test.js` (DRIVE_DB_TEST=1, mock gateway) |
