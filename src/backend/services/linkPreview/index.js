import { editingConfig, editorOrigin } from '../office/config.js';
import { readFile, stat } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logoDir } from '../../config/paths.js';
import { getSettings, parseSettings } from '../settings.js';
import { REGIONAL_DEFAULTS } from '../datetime.js';
import { previewProvider } from '../../platform/registry.js';
import { evaluateIpAccess } from '../security.js';
import { clientIp } from '../../middleware/ipGuard.js';
import { cardKey, cardPng, HEIGHT, logoDataUrl, rasterDataUrl, rendererAvailable, WIDTH } from './card.js';
import { describe, headTags, injectHead, isBot, previewLocale, siteInfo } from './meta.js';
import { forgetPreviews, memoGet, memoSet } from './memo.js';

/*
 * Rich link previews for every page of the app.
 *
 * nginx serves the built files itself; a page address (anything that is not
 * a file: /, /login, /l/<token>, /d/<token>, /s/<slug>/…) goes to
 * shellMiddleware(), which answers with index.html carrying the portal's
 * name, description and icon, and for public links the resource's own title,
 * facts and picture (Open Graph, Twitter cards — what WhatsApp, Telegram,
 * Slack, Facebook, X… show). When the app server is down nginx falls back
 * to the static index.html (neutral defaults).
 *
 * Previews are computed from the public state of a link only (no cookies, no
 * visitor tokens): exactly what an anonymous visitor may see. Building them
 * never counts as a link view.
 *
 *   GET /api/og/site.png             the portal card
 *   GET /api/og/<page path>.png      the card of a public link page, e.g.
 *                                    /api/og/l/<token>.png, /api/og/s/<slug>/d/<id>.png
 *   (?v=<hash> only busts messenger caches when the card changes)
 */

const TOKEN = '[A-Za-z0-9_-]{1,64}';
const ROUTES = [
  { re: new RegExp(`^/l/(${TOKEN})/?$`), module: 'files', at: (m) => ({ token: m[1] }) },
  { re: new RegExp(`^/d/(${TOKEN})/?$`), module: 'drive', at: (m) => ({ token: m[1] }) },
  { re: new RegExp(`^/s/(${TOKEN})(?:/(f|d)/(\\d{1,9}))?/?$`), module: 'kb', at: (m) => ({ token: m[1].toLowerCase(), folderId: m[2] === 'f' ? Number(m[3]) : null, itemId: m[2] === 'd' ? Number(m[3]) : null }) },
];

/** Which public link a page path is: { module, token, folderId?, itemId?, path } or null. */
export function parseRoute(pathname) {
  const path = String(pathname || '');
  for (const route of ROUTES) {
    const match = route.re.exec(path);
    if (match) {
      const at = route.at(match);
      const sub = at.folderId ? `/f/${at.folderId}` : at.itemId ? `/d/${at.itemId}` : '';
      const prefix = { files: 'l', drive: 'd', kb: 's' }[route.module];
      return { module: route.module, ...at, path: `/${prefix}/${at.token}${sub}` };
    }
  }
  return null;
}

// ── Models (memoised briefly: the page and its picture are fetched together) ─
// The memo lives in memo.js: link changes (update, revoke, delete, new slug) clear it.

async function resolveModel(route, { facts }) {
  const parsed = parseSettings(await getSettings());
  if (!parsed.modules?.[route.module]?.enabled) return { state: 'invalid' };
  // Each module that owns public links registers its preview (registerPreviewProvider).
  const provider = previewProvider(route.module);
  if (!provider) return { state: 'invalid' };
  return provider(route, { facts });
}

/** The preview model of a link page (state 'site' for any other page). */
export async function previewModel(route, { facts = false } = {}) {
  if (!route) return { state: 'site' };
  const key = `${route.path}|${facts ? 1 : 0}`;
  const hit = memoGet(key);
  if (hit) return hit.value;
  // A fact-less request may use what a crawler request found.
  const richer = !facts && memoGet(`${route.path}|1`);
  if (richer) return richer.value;
  const value = await resolveModel(route, { facts });
  memoSet(key, value);
  return value;
}

export function clearPreviewMemo() {
  forgetPreviews();
}

// ── Shared pieces ───────────────────────────────────────────────────────────

/** The public origin of the portal: PUBLIC_URL, else an https FRONTEND_URL, else the address of this request. */
export function originOf(req) {
  const configured = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^\s/]+$/i.test(configured)) return configured;
  const frontend = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (/^https:\/\/[^\s/]+$/i.test(frontend)) return frontend;
  const host = String(req.get('host') || '').trim();
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-fA-F:]+\](:\d{1,5})?$/.test(host)) return '';
  return `${req.protocol === 'https' ? 'https' : 'http'}://${host}`;
}

// The host name drawn on the card (no port: API requests reach the app with the bare host).
const hostOf = (origin) => origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)(:\d+)?$/i;

/**
 * The portal's configured address (PUBLIC_URL, else FRONTEND_URL unless it
 * is a loopback default), never the Host header of a request. It names the
 * portal on the card and is part of the picture's cache key, so a forged Host
 * can neither change a cached picture nor make the server draw new ones.
 * Without a configured address the card shows no host.
 */
export function canonicalOrigin() {
  for (const value of [process.env.PUBLIC_URL, process.env.FRONTEND_URL]) {
    const origin = String(value || '').trim().replace(/\/+$/, '');
    const match = /^https?:\/\/([^\s/]+)$/i.exec(origin);
    if (match && !LOOPBACK.test(match[1])) return origin;
  }
  return '';
}

const logoFileOf = (url) => (url ? join(logoDir, basename(url)) : null);

/** The texts and picture key of a page: everything both the page and the picture need. */
async function pagePreview(req, route, { facts }) {
  const parsed = parseSettings(await getSettings());
  const locale = previewLocale(parsed);
  const site = siteInfo(parsed, locale);
  const model = await previewModel(route, { facts });
  const text = describe(model, { site, locale, regional: parsed.regional || REGIONAL_DEFAULTS });
  const origin = originOf(req);
  const host = hostOf(canonicalOrigin());
  const logoUrl = site.iconUrl || site.logoUrl;
  const key = cardKey({ card: text.card, site, host, logoKey: logoUrl, thumbKey: model.thumb?.key });
  return { parsed, locale, site, model, text, origin, host, logoUrl, key };
}

// ── The page: index.html with the tags ──────────────────────────────────────

const distDir = () => process.env.FRONTEND_DIST || resolve(process.cwd(), '../frontend/dist');
let template = null;

/** index.html of the built frontend, re-read when the file changes (checked every 10 s). */
async function loadTemplate() {
  const file = join(distDir(), 'index.html');
  if (template && Date.now() - template.checked < 10_000) return template.html;
  const info = await stat(file).catch(() => null);
  if (!info) {
    template = null;
    return null;
  }
  if (!template || template.mtime !== info.mtimeMs) {
    template = { html: await readFile(file, 'utf8'), mtime: info.mtimeMs, checked: Date.now() };
  } else {
    template.checked = Date.now();
  }
  return template.html;
}

// Link pages look links up in the database; one address cannot make it do so without end.
const LOOKUPS_PER_MINUTE = 60;
const lookups = new Map();
function lookupAllowed(ip) {
  const now = Date.now();
  const entry = lookups.get(ip);
  if (!entry || entry.reset < now) {
    if (lookups.size > 10_000) lookups.clear();
    lookups.set(ip, { count: 1, reset: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= LOOKUPS_PER_MINUTE;
}

const SKIP = /^\/(api|uploads|assets|health|ready|pdfjs|fonts|pwa)(\/|$)/;

/**
 * index.html with preview tags for page navigations nginx hands over (it
 * marks them with X-Portal-Shell). Mounted before helmet and the IP guard:
 * the page shell carries the same headers as the static file (set by nginx).
 */
export function shellMiddleware() {
  return async (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.get('x-portal-shell') || SKIP.test(req.path)) return next();
    let html;
    try {
      html = await loadTemplate();
    } catch {
      html = null;
    }
    if (!html) return next();
    // An address the IP rules refuse gets the plain page (as nginx would serve
    // it): no portal facts, no link looked up. The API refuses it as usual.
    const verdict = await evaluateIpAccess(clientIp(req)).catch(() => ({ allowed: false }));
    if (!verdict.allowed) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(html);
    }
    let body = html;
    try {
      const ua = req.get('user-agent');
      const route = parseRoute(req.path);
      const allowed = !route || lookupAllowed(req.ip);
      const preview = await pagePreview(req, allowed ? route : null, { facts: isBot(ua) });
      const { text, site, locale, origin, key } = preview;
      const url = origin ? `${origin}${route && allowed ? route.path : req.path}` : null;
      const picture = origin && (await rendererAvailable()) ? { url: `${origin}/api/og/${route && allowed ? route.path.slice(1) : 'site'}.png?v=${key}`, width: WIDTH, height: HEIGHT } : null;
      const appleIcon = site.iconUrl && /\.png$/i.test(site.iconUrl) ? site.iconUrl : null;
      const tags = headTags({ text, site, locale, url, image: picture, appleIcon, robots: route ? 'noindex, nofollow' : null });
      body = injectHead(html, tags, locale);
      if (route) res.setHeader('Vary', 'User-Agent');
    } catch (err) {
      // No database (setup, restarts): the plain page, as nginx would serve it.
      if (err?.code !== 'ECONNREFUSED') console.warn(`[link-preview] ${req.path}: ${err.message}`);
    }
    // The online editor's server may be framed and posted to (nginx adds it to
    // the page's CSP frame-src and form-action; see nginx.conf). Every page
    // carries it: the editor opens inside the app without a page load.
    try {
      const origin = editorOrigin(await editingConfig());
      if (origin) res.setHeader('X-Portal-Frame-Src', origin);
    } catch {
      /* no database: no editor */
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(body);
  };
}

// ── The picture ─────────────────────────────────────────────────────────────

const imageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).set('Retry-After', '60').json({ success: false, code: 'RATE_LIMITED', error: 'Too many requests. Try again later.' }),
});

async function thumbData(thumb) {
  if (!thumb) return null;
  try {
    const file = thumb.kind === 'file' ? thumb.path : await thumb.load?.();
    if (!file) return null;
    const dataUrl = rasterDataUrl(await readFile(file));
    return dataUrl ? { dataUrl } : null;
  } catch {
    return null;
  }
}

export function previewImageRoutes() {
  const router = Router();

  // What a messenger will show for a page (the share dialog's "how it looks" card).
  // Public: the same facts the page itself gives any anonymous crawler.
  router.get('/preview', imageLimiter, async (req, res, next) => {
    try {
      const path = String(req.query.path || '/').slice(0, 200);
      const route = parseRoute(path);
      const { text, site, origin, host, key } = await pagePreview(req, route, { facts: true });
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        preview: {
          siteName: site.name,
          title: text.title,
          description: text.description,
          host: host || hostOf(origin),
          image: (await rendererAvailable()) ? `/api/og/${route ? route.path.slice(1) : 'site'}.png?v=${key}` : null,
          width: WIDTH,
          height: HEIGHT,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get(/^\/(.+)\.png$/, imageLimiter, async (req, res, next) => {
    try {
      const page = req.params[0];
      const route = page === 'site' ? null : parseRoute(`/${page}`);
      if (page !== 'site' && !route) return res.status(404).json({ success: false, error: 'Not found' });
      if (!(await rendererAvailable())) return res.redirect(302, '/pwa/icon-512.png');
      const { text, site, host, logoUrl, key, model } = await pagePreview(req, route, { facts: true });
      const file = await cardPng(key, {
        card: text.card,
        site,
        host,
        load: async () => ({ logo: await logoDataUrl(logoFileOf(logoUrl)), thumb: await thumbData(model.thumb) }),
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // A page shows ?v=<current key>; an older key still gets the current picture, cached briefly.
      res.setHeader('Cache-Control', req.query.v === key ? 'public, max-age=86400' : 'public, max-age=300');
      res.sendFile(file);
    } catch (err) {
      // Too many pictures waiting to be drawn: the generic icon now, the card on a later fetch.
      if (err?.code === 'RENDER_BUSY') return res.set('Cache-Control', 'no-store').redirect(302, '/pwa/icon-512.png');
      next(err);
    }
  });
  return router;
}
