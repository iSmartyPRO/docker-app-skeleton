import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { countSubscriptions, pushToUser, removeSubscription, saveSubscription, vapidKeys } from '../services/push.js';
import { getSettings, parseSettings } from '../services/settings.js';

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

const SHORTCUTS = {
  tasks: { en: 'Tasks', ru: 'Задачи', url: '/app/tasks' },
  calendar: { en: 'Calendar', ru: 'Календарь', url: '/app/calendar' },
  kb: { en: 'Knowledge base', ru: 'База знаний', url: '/app/kb' },
};

function shortName(name) {
  const value = String(name || '').trim();
  if (value.length <= 14) return value;
  const words = value.split(/\s+/);
  return words[0].length <= 14 ? words[0] : value.slice(0, 14);
}

function iconType(url) {
  if (/\.svg$/i.test(url)) return 'image/svg+xml';
  if (/\.webp$/i.test(url)) return 'image/webp';
  if (/\.jpe?g$/i.test(url)) return 'image/jpeg';
  return 'image/png';
}

export function buildManifest(parsed, lang = 'en') {
  const appearance = parsed.appearance || {};
  const custom = appearance.appIconUrl;
  const icons = custom
    ? [
        { src: custom, sizes: '192x192', type: iconType(custom), purpose: 'any' },
        { src: custom, sizes: '512x512', type: iconType(custom), purpose: 'any' },
      ]
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
    lang,
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
      .map(([, item]) => ({ name: item[lang] || item.en, url: item.url })),
  };
}

router.get('/manifest.webmanifest', wrap(async (req, res) => {
  const parsed = parseSettings(await getSettings());
  const lang = /^ru\b/i.test(String(req.get('accept-language') || '')) ? 'ru' : 'en';
  res.set('Content-Type', 'application/manifest+json; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.send(JSON.stringify(buildManifest(parsed, lang)));
}));

router.get('/vapid', requireAuth, wrap(async (req, res) => {
  res.json({ success: true, publicKey: (await vapidKeys()).publicKey });
}));

router.get('/push', requireAuth, wrap(async (req, res) => {
  res.json({ success: true, devices: await countSubscriptions(req.user.id) });
}));

router.post('/push', requireAuth, wrap(async (req, res) => {
  await saveSubscription(req.user.id, req.body?.subscription, req.get('user-agent'));
  res.json({ success: true, devices: await countSubscriptions(req.user.id) });
}));

router.delete('/push', requireAuth, wrap(async (req, res) => {
  await removeSubscription(req.user.id, req.body?.endpoint || req.query.endpoint);
  res.json({ success: true, devices: await countSubscriptions(req.user.id) });
}));

router.post('/push/test', requireAuth, wrap(async (req, res) => {
  const ru = req.user.locale === 'ru';
  const delivered = await pushToUser(req.user.id, {
    title: ru ? 'Уведомления работают' : 'Notifications work',
    body: ru ? 'Так будут выглядеть уведомления на этом устройстве.' : 'This is how notifications will look on this device.',
    url: '/account/notifications',
    tag: 'test',
  });
  res.json({ success: true, delivered });
}));

export default router;
