# Link previews (Open Graph, messenger cards)

When a portal address is pasted into WhatsApp, Telegram, Slack, Facebook, X,
LinkedIn, Discord, Viber, VK… the messenger fetches the page and shows a card
built from its `<head>` tags. The portal fills those tags per request:

- every page carries the portal's own name, description, colour and icon
  (Settings → General / Appearance) — never the skeleton defaults;
- public links get a card about the shared resource itself:

| Address | Title | Description (examples) |
| --- | --- | --- |
| Files `/l/<token\|slug>`, Drive `/d/<token\|slug>` — a file | link title, else the file name | `PDF · 2,4 МБ · Можно скачать · Доступно до 21.10.2026 · Отправитель: Иван Петров` |
| — a folder | link title, else the folder name | `Папка · 12 файлов, 3 папки · Можно скачать · Можно загрузить файлы` (with a link title the real name comes first; a Drive note comes first too) |
| — upload-only (file request) | link title, else the folder name | `Отправьте файлы — их получит Иван Петров · Содержимое папки скрыто · Доступно до …` |
| Knowledge base `/s/<slug>`, `/s/<slug>/f/<id>`, `/s/<slug>/d/<id>` | share title / folder / article | folder description or the article's first paragraph (≈160 chars, markup stripped) · `База знаний · 5 материалов` |
| password-protected link (any module) | `🔒 Доступ по паролю` | no name, kind, size or owner — nothing about the item |
| revoked, expired, unknown, author gone, links off | `Ссылка недействительна или истекла` | one identical card for all of them: a preview never tells whether an address exists |
| Drive link for employees only | `Ссылка для сотрудников` | `Войдите в портал, чтобы открыть эту ссылку.` |
| any other page (`/`, `/login`, `/app/…`) | portal name | portal description |

Texts follow the portal's default language (Settings → General → language);
"auto" means Russian. Dates use the portal's regional settings.

Every page also gets `og:image` — a 1200×630 PNG card (portal icon and name, a
large file-type tile or folder/upload/lock icon, the title wrapped to three
lines, one or two fact lines, the portal address and the sender). An image
file that may be viewed and has no password shows its real picture in the
card (Files: the stored file up to 6 MB, Drive: the cached 640 px thumbnail);
if that makes the PNG larger than ~290 KB (WhatsApp's limit is ~300 KB) the
card is drawn without it. Link pages are marked `noindex, nofollow`.

The share dialogs of Files and Drive show the same card under the created
link, collapsed: **«Как будет выглядеть в мессенджере»**.

## How it works

```
browser / crawler ──► nginx  ── built file exists? (assets, sw.js, version.json, icons…) ──► served as is
                          └─ page address ──► @shell ──► app server: index.html + tags
                                                  └─ app down / slow / error ──► @static_shell: dist/index.html
```

- `nginx.conf`: `location /` tries the file, else `@shell`, which proxies to
  the app with `X-Portal-Shell: 1` and **without cookies or Authorization**
  (previews are computed from the public link state only), 2 s connect and
  10 s read timeouts. Any error (502/503/504/404/500) falls back to the static
  `index.html` — the SPA and its "technical works" screen keep working while
  the app restarts. HTML always has `Cache-Control: no-cache` and the same
  CSP/security headers as before; `/assets/` keeps its immutable caching and
  `/version.json` (PWA update detection) is a static file as before.
- `src/frontend/index.html` has a block between `<!-- link-preview:start -->`
  and `<!-- link-preview:end -->` (title, description, theme colour, Apple
  icon, basic OG tags). The app replaces it per request. The static defaults
  are neutral (`Портал` / `Корпоративный портал`); a build may set
  `VITE_APP_NAME` / `VITE_APP_DESCRIPTION`.
- Backend: `services/linkPreview/`
  - `meta.js` — pure: texts per state, HTML escaping, the tags, injection,
    crawler detection (`isPreviewBot`, `isBot`, `countsAsView`).
  - `card.js` — the card as SVG, rasterised by
    [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) (prebuilt for
    glibc and musl/Alpine, no system libraries). Text is drawn in the bundled
    **Inter** font (`src/backend/assets/fonts`, SIL OFL 1.1 — full Cyrillic
    incl. Kyrgyz/Kazakh letters, Turkish), with **Noto Sans SC** as the
    fallback for Chinese (`NotoSansSC-Regular/Bold.ttf`, SIL OFL 1.1, a
    subset: GB2312 — 6 763 hanzi — CJK and full-width punctuation and every
    character of the zh texts, ≈2.3 MB per weight, so ≈4.8 MB of the image;
    rebuild it with fontTools `pyftsubset` from Google Fonts' NotoSansSC[wght]
    when the zh texts gain rare characters). Characters neither font has are
    dropped. Widths are read from the fonts (`fontMetrics.js`; a character is
    measured in the first font that has it), so wrapping and ellipses are
    exact; text without spaces breaks between characters. At most two
    pictures are drawn at a time.
  - `index.js` — page routes, the shell middleware, the picture routes.
  - per module: `modules/files/preview.js`, `modules/drive/preview.js`,
    `modules/kb/preview.js` reuse each module's own link resolution
    (`resolveLink`, `openLink`, `resolveShare`) with no visitor token, so the
    preview can never show more than an anonymous visitor would get.
- Drive sizes and folder counts come from the file server, so they are asked
  for (with a 3 s cap) only for crawlers and for the picture; people opening a
  Drive link get the page at once. Responses for link pages carry
  `Vary: User-Agent`.
- Models are memoised for 60 s (the page and its picture are fetched together);
  creating, changing (title, password, permissions, address), revoking or
  deleting a Files or Drive link clears the memo at once
  (`services/linkPreview/memo.js`), so a preview never shows a link's old
  state; settings changes are picked up within the settings cache (5 s,
  dropped on every save).
- The page shell runs the IP rules itself (it is mounted before the IP guard):
  an address the allow-list or block-list refuses gets the plain `index.html`
  (as nginx would serve it) — no portal facts, no link looked up.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET/HEAD | any page address (via nginx `@shell`) | `index.html` with tags; only with `X-Portal-Shell` (set by nginx) |
| GET | `/api/og/site.png` | portal card |
| GET | `/api/og/l/<token>.png`, `/api/og/d/<token>.png`, `/api/og/s/<slug>[/f/<id>\|/d/<id>].png` | link card; `?v=<hash>` (from the page) is only a cache buster: `public, max-age=86400` when current, 300 s otherwise |
| GET | `/api/og/preview?path=/l/<token>` | `{ preview: { siteName, title, description, host, image, width, height } }` for the share dialog |

Limits: pictures and `/api/og/preview` — 60 per minute per address (plus the
general API limit); link lookups for pages — 60 per minute per address, above
that the page gets the generic portal card instead of an error. At most two
pictures are drawn at a time and 16 wait; beyond that a picture request is
answered with the app icon (`302`, `no-store`) instead of queueing.

## Caching

Pictures are stored as `uploads/.previews/og/<hash>.png`. The hash covers
everything drawn (texts, colours, portal name, icon URL, thumbnail version,
host), so a changed link, file or setting is a new file and a new `?v=`. The
host drawn on the card is the configured address (`PUBLIC_URL`, else
`FRONTEND_URL` unless it is a loopback default; none → no host on the card),
never the request's `Host` header, so a forged `Host` can neither change a
cached picture nor make the server draw new ones. The
scheduled `storage:previews` job removes pictures nobody fetched for 30 days.

Messengers cache previews on their side (Telegram: re-fetch with @WebpageBot,
Facebook: Sharing Debugger); the `?v=` hash makes them load a new picture once
they re-read the page.

## Views are not counted for crawlers

Public link views (`view_count`) are counted only for `GET` requests of people:
`HEAD` requests and known crawlers (WhatsApp, TelegramBot, facebookexternalhit,
Twitterbot, Slackbot, LinkedInBot, Discordbot, Googlebot, vkShare,
SkypeUriPreview, Viber, Bing, Yandex, Applebot, …) and generic bots/scripts
(`bot`, `crawler`, `spider`, `curl`, empty user agent) are skipped. Building a
preview never counts as a view.

## Public address

`og:url` and `og:image` must be absolute. They use `PUBLIC_URL` (falls back to an https `FRONTEND_URL`) when it is set
(recommended: `https://portal.example.com`), else the scheme and host of the
request (`X-Forwarded-Proto` from the proxy in front of the container).

## Troubleshooting

- *The preview still says the old name* — the messenger cached it; see above.
- *No picture* — the renderer is missing (`npm ci` did not install
  `@resvg/resvg-js-linux-x64-musl`): the log says `picture renderer
  unavailable`; pages then carry no `og:image` and `/api/og/*.png` redirects to
  the app icon.
- *Static defaults ("Портал") in the preview* — the app server did not answer
  the shell request within 10 s or was down; check `docker logs portal`.
