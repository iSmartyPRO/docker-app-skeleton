# Installable app (PWA)

The portal installs on phones and computers as a Progressive Web App. There is no native app and no store: the same site gets:
- an icon on the home screen;
- full-screen launch;
- push notifications;
- an app badge;
- an offline screen.

## What is included

| Piece | Where |
|-------|-------|
| Manifest | `GET /api/pwa/manifest.webmanifest`, built from settings: product name, short name, description, theme colour, icons, shortcuts to enabled modules (Tasks, Calendar, Knowledge base) |
| Icons | `src/frontend/public/pwa/`: 192/512 "any", 512 maskable (Android adaptive icons), 180 apple-touch-icon, 72 monochrome badge, 48 favicon |
| Custom icon | *Admin → Settings → General → App on phones*: square PNG 192–4096 px (512 recommended) and the name under the icon |
| Service worker | `public/sw.js` |
| Offline page | `public/offline.html` (+ `offline.js`, because the CSP forbids inline scripts) |
| iOS meta | `apple-mobile-web-app-*`, `apple-touch-icon`; status bar colour and title follow the theme and settings |
| Safe areas | `viewport-fit=cover` + `env(safe-area-inset-*)` in standalone mode |
| Install prompt | `src/pwa/pwa.js` catches `beforeinstallprompt` (Chrome, Edge, Samsung Internet) for one-tap install |
| Install guide | `/install` — public page, see below |
| Push | [notifications.md](notifications.md#web-push) |

**Service worker strategy:**
- **Pages:** network first, so a deploy is visible at once. Offline, the last app shell is shown, or the offline page.
- **`/assets/*`:** content-hashed, so cache first.
- **Icons, pdf.js data, Google Fonts:** stale-while-revalidate.
- **Never cached:** `/api`, `/uploads`, `/s/*` and auth flows.

## Install guide (`/install`)

The guide is public and opened from the user menu (*Install the app*), the sign-in page and a dismissible banner on phones.

- **Platform:** it detects the platform and browser:
  - iPhone/iPad;
  - Android;
  - computer;
  - in-app browsers of Telegram / WhatsApp / Instagram. These cannot install, so the page asks the user to open the link in Safari or Chrome.
- **One-tap install:** shows the *Install* button where the browser supports it.
- **Steps with illustrations:**
  - **iPhone (Safari):** Share → Add to Home Screen → Add → open from the icon. Includes the iOS 26 path via ⋯.
  - **Android (Chrome):** ⋮ → Install app → Install → icon on the screen. Includes a Samsung Internet note.
  - **Computer:** the install icon in the address bar, plus a QR code that opens the guide on a phone.
- **Illustrations** are HTML/CSS phone screens. They use the real product name and icon, follow the language and theme, and highlight the button to tap with an animated ring.
- **Extras:** benefits, a tip about iOS push, and an FAQ: is it real, is it safe, how to enable notifications, missing button, offline, how to remove.

## Deployment notes

- HTTPS is required for service workers and push. `localhost` is exempt.
- `nginx.conf` serves `/sw.js` with `Cache-Control: no-cache` and `Service-Worker-Allowed: /`, so updates reach installed apps immediately.
- To change the default icons, regenerate the PNGs in `public/pwa/`, or upload a custom icon in settings. The custom icon is used for 192 and 512; the maskable default is then omitted.
- After changing `sw.js` caching rules, bump `VERSION` inside it. Old caches are deleted on activation.
