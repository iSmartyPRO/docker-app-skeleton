/*
 * Service worker of the installed app (PWA).
 *
 *  - Pages: network first, so a deploy is visible at once; offline → the
 *    last app shell, or offline.html.
 *  - /assets/* (content-hashed): cache first.
 *  - Icons, pdf.js data, fonts: stale-while-revalidate.
 *  - /api, /uploads, auth flows: never cached (private, always fresh).
 *  - Push: shows the notification, updates the app badge, opens the link.
 */

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
const PRECACHE = ['/offline.html', '/offline.js', '/pwa/icon-192.png', '/pwa/badge-72.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL, STATIC, RUNTIME].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isPrivate(url) {
  return /^\/(api|uploads|health|ready|auth)(\/|$)/.test(url.pathname) || url.pathname.startsWith('/s/');
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      const cache = await caches.open(SHELL);
      cache.put('/', response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL);
    return (await cache.match('/')) || (await cache.match('/offline.html')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cache, 300);
  }
  return response;
}

/** Hashed build files pile up with every deploy: keep the newest `max`. */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
      event.respondWith(staleWhileRevalidate(request));
    }
    return;
  }
  if (isPrivate(url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (/^\/(pwa|pdfjs)\//.test(url.pathname) || url.pathname === '/favicon.svg') {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// ── Push notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data?.text() || '' };
  }
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: '/pwa/icon-192.png',
    badge: '/pwa/badge-72.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
    timestamp: Date.now(),
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      data.unread && self.navigator?.setAppBadge ? self.navigator.setAppBadge(data.unread).catch(() => {}) : null,
      self.clients.matchAll({ type: 'window' }).then((clients) => clients.forEach((client) => client.postMessage({ type: 'notification' }))),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const same = clients.find((client) => client.url.startsWith(self.location.origin));
      if (same) {
        return same.focus().then(() => same.navigate?.(target).catch(() => same.postMessage({ type: 'navigate', url: target })));
      }
      return self.clients.openWindow(target);
    })
  );
});
