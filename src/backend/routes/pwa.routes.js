import { Router } from 'express';
import { refuseImpersonation, requireAuth } from '../middleware/auth.js';
import { countSubscriptions, pushToUser, removeSubscription, saveSubscription, vapidKeys } from '../services/push.js';
import { getSettings, parseSettings, recipientLocale } from '../services/settings.js';
import { acceptLanguages, localeTag, tr } from '../services/i18n/index.js';

/*
 * Progressive Web App: the manifest is built from settings, so the installed
 * app carries the product's name, colour and icon. Push subscriptions are
 * per device and per user.
 */
const router = Router();

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

// Names: locales/<lang>/core.js → pwa.shortcuts.
const SHORTCUTS = {
  tasks: { url: '/app/tasks' },
  calendar: { url: '/app/calendar' },
  kb: { url: '/app/kb' },
};

function shortName(name) {
  const value = String(name || '').trim();
  if (value.length <= 14) return value;
  const words = value.split(/\s+/);
  return words[0].length <= 14 ? words[0] : value.slice(0, 14);
}

export function iconType(url) {
  if (/\.svg$/i.test(url)) return 'image/svg+xml';
  if (/\.ico$/i.test(url)) return 'image/x-icon';
  if (/\.webp$/i.test(url)) return 'image/webp';
  if (/\.jpe?g$/i.test(url)) return 'image/jpeg';
  return 'image/png';
}

export function buildManifest(parsed, lang = 'en') {
  const appearance = parsed.appearance || {};
  const custom = appearance.appIconUrl;
  // Uploaded icons get a fresh random file name on every upload, so the URL
  // itself is the version: a changed icon is a new URL for every cache.
  // An SVG scales to any size, which is how the manifest spells it.
  const customIcons = () =>
    iconType(custom) === 'image/svg+xml'
      ? [{ src: custom, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      : [
          { src: custom, sizes: '192x192', type: iconType(custom), purpose: 'any' },
          { src: custom, sizes: '512x512', type: iconType(custom), purpose: 'any' },
        ];
  const icons = custom
    ? customIcons()
    : [
        { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ];
  const primary = appearance.customColors?.colorPrimary || '#1E3A6E';
  return {
    id: '/',
    name: parsed.appName,
    short_name: shortName(appearance.shortName || parsed.appName),
    description: parsed.appDescription,
    lang: localeTag(lang),
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#F1F5F9',
    theme_color: primary,
    categories: ['business', 'productivity'],
    icons,
    shortcuts: Object.entries(SHORTCUTS)
      .filter(([id]) => parsed.modules?.[id]?.enabled)
      .map(([id, item]) => ({ name: tr(lang, `core.pwa.shortcuts.${id}`), url: item.url })),
  };
}

router.get('/manifest.webmanifest', wrap(async (req, res) => {
  const parsed = parseSettings(await getSettings());
  // The language a guest's interface would open in: portal default, or the browser's among the enabled ones.
  const lang = recipientLocale(null, parsed.localization, acceptLanguages(req.get('accept-language')));
  res.set('Content-Type', 'application/manifest+json; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.send(JSON.stringify(buildManifest(parsed, lang)));
}));

/** Bundled tab icon used while no app icon is configured. */
export const DEFAULT_FAVICON = '/favicon.svg';

export function faviconUrl(parsed) {
  return parsed?.appearance?.appIconUrl || DEFAULT_FAVICON;
}

/*
 * Browser tab icon (index.html's <link rel="icon">, and /favicon.ico via
 * nginx for clients that never read the page). A redirect rather than the
 * bytes: the icon file keeps its own validators, and since an uploaded icon
 * gets a new file name, only this tiny hop has to be revalidated — no-cache
 * makes a changed icon reach everyone on their next page load.
 */
router.get('/icon', async (req, res) => {
  let target = DEFAULT_FAVICON;
  try {
    target = faviconUrl(parseSettings(await getSettings()));
  } catch {
    /* no database yet (setup mode): the bundled icon */
  }
  res.set('Cache-Control', 'no-cache');
  res.redirect(302, target);
});

router.get('/vapid', requireAuth, wrap(async (req, res) => {
  res.json({ success: true, publicKey: (await vapidKeys()).publicKey });
}));

router.get('/push', requireAuth, wrap(async (req, res) => {
  res.json({ success: true, devices: await countSubscriptions(req.user.id) });
}));

router.post('/push', requireAuth, refuseImpersonation, wrap(async (req, res) => {
  await saveSubscription(req.user.id, req.body?.subscription, req.get('user-agent'));
  res.json({ success: true, devices: await countSubscriptions(req.user.id) });
}));

router.delete('/push', requireAuth, refuseImpersonation, wrap(async (req, res) => {
  await removeSubscription(req.user.id, req.body?.endpoint || req.query.endpoint);
  res.json({ success: true, devices: await countSubscriptions(req.user.id) });
}));

router.post('/push/test', requireAuth, refuseImpersonation, wrap(async (req, res) => {
  const delivered = await pushToUser(req.user.id, {
    title: tr(req.locale, 'core.pwa.pushTest.title'),
    body: tr(req.locale, 'core.pwa.pushTest.body'),
    url: '/account/notifications',
    tag: 'test',
  });
  res.json({ success: true, delivered });
}));

export default router;
