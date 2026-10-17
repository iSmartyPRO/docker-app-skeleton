/*
 * Link previews (Open Graph / Twitter cards / messenger unfurls): the pure
 * part — no database, no files. Turns a resolved preview model into texts
 * (title, description, card facts) in the portal language, renders the
 * <head> tags and puts them into index.html. Unit-tested on its own
 * (test/link-preview.test.js).
 *
 * A model is what a public address shows to an anonymous visitor:
 *   { state: 'site' }                         any page that is not a link
 *   { state: 'invalid' }                      unknown, revoked, expired, closed
 *   { state: 'locked' }                       password protected: no details at all
 *   { state: 'employees' }                    a Drive link for signed-in employees only
 *   { state: 'ok', module, kind, ... }        an open link (see describe())
 */

import { formatDate, REGIONAL_DEFAULTS } from '../datetime.js';
import { decimalSeparator, localeOrDefault, localeTag, sanitizeLocalization, tr, translator } from '../i18n/index.js';

// ── Text helpers ────────────────────────────────────────────────────────────

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text for HTML (element content and quoted attribute values). */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * One clean line of user text: no control or bidi-override characters,
 * collapsed whitespace, at most `max` characters (an ellipsis when cut).
 */
export function cleanText(value, max = 300) {
  const text = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?·—-]+$/, '')}…`;
}

/** Plain text of Markdown or HTML (knowledge base articles), for an excerpt. */
export function plainText(value, { html = false } = {}) {
  let text = String(value ?? '').slice(0, 20000);
  if (html || /<\/?[a-z][^>]*>/i.test(text)) {
    text = text
      .replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/h\d|\/li)[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&(amp|lt|gt|quot|#39);/g, (m, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name]);
  }
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '');
}

/**
 * The first real paragraph of an article (headings skipped when there is
 * more), cut to about `max` characters.
 */
export function excerpt(value, { html = false, max = 160, skip = '' } = {}) {
  const raw = String(value ?? '');
  const headings = new Set();
  if (!html) for (const match of raw.matchAll(/^\s{0,3}#{1,6}\s+(.+)$/gm)) headings.add(cleanText(plainText(match[1]), 500));
  for (const match of raw.matchAll(/<h\d[^>]*>([\s\S]*?)<\/h\d>/gi)) headings.add(cleanText(plainText(match[1], { html: true }), 500));
  const blocks = plainText(raw, { html })
    .split(/\n\s*\n|\n/)
    .map((block) => cleanText(block, 2000))
    .filter(Boolean);
  const skipText = cleanText(skip, 500).toLowerCase();
  const body = blocks.filter((block) => !headings.has(block) && block.toLowerCase() !== skipText);
  const pick = body.find((block) => block.length >= 40) || body[0] || '';
  if (!pick) return '';
  // Short paragraphs are joined until there is enough to read.
  let text = pick;
  for (const block of body.slice(body.indexOf(pick) + 1)) {
    if (text.length >= max) break;
    text = `${text} ${block}`;
  }
  return cleanText(text, max);
}

// ── Crawlers ────────────────────────────────────────────────────────────────

/*
 * Link unfurlers of messengers and social networks, and search engines.
 * Their fetches are not visits: they never count as link views. Some of them
 * (WhatsApp, Telegram) fetch a link the moment it is typed or sent.
 */
const PREVIEW_BOTS = /WhatsApp|TelegramBot|facebookexternalhit|Facebot|meta-externalagent|Twitterbot|Slackbot|Slack-ImgProxy|LinkedInBot|Discordbot|Googlebot|Google-InspectionTool|GoogleOther|AdsBot-Google|bingbot|BingPreview|YandexBot|YandexMetrika|vkShare|SkypeUriPreview|Viber|MicrosoftPreview|TeamsBot|Mattermost-Bot|redditbot|Pinterest|Applebot|Embedly|Iframely|ZoomBot|Snap URL Preview|Bitrix24.Links|okhttp\/.+ Odnoklassniki|OdklBot|Mail\.RU_Bot|DuckDuckBot|Yahoo! Slurp|Baiduspider|ia_archiver|Qwantify|SemrushBot|AhrefsBot/i;
const GENERIC_BOT = /\b(bot|crawler|spider|preview|unfurl|scraper|fetcher)\b|\bcurl\/|\bwget\/|python-requests|python-urllib|go-http-client|node-fetch|undici|axios\//i;

/** A messenger, social network or search engine fetching a link for its preview. */
export function isPreviewBot(userAgent) {
  const ua = String(userAgent || '').slice(0, 512);
  return PREVIEW_BOTS.test(ua);
}

/** Any automated client (preview bots, crawlers, scripts): not a person opening a link. */
export function isBot(userAgent) {
  const ua = String(userAgent || '').slice(0, 512);
  if (!ua) return true;
  return PREVIEW_BOTS.test(ua) || GENERIC_BOT.test(ua);
}

/** Whether a public-link API request counts as a view: real GET requests of people only. */
export function countsAsView(req) {
  return req.method === 'GET' && !isBot(req.get?.('user-agent') ?? req.headers?.['user-agent']);
}

// ── Facts ───────────────────────────────────────────────────────────────────

/** File categories: card colour, badge text, words. */
const TYPES = [
  { id: 'pdf', exts: ['pdf'], color: '#E5484D' },
  { id: 'doc', exts: ['doc', 'docx', 'odt', 'rtf', 'pages'], color: '#2B6CE0' },
  { id: 'xls', exts: ['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'numbers'], color: '#1F9D55' },
  { id: 'ppt', exts: ['ppt', 'pptx', 'odp', 'key'], color: '#E8590C' },
  { id: 'img', exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg', 'avif'], color: '#8E4EC6' },
  { id: 'zip', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'], color: '#B7791F' },
  { id: 'cad', exts: ['dwg', 'dxf', 'dwf', 'rvt', 'ifc', 'skp'], color: '#0E9F9A' },
  { id: 'video', exts: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv'], color: '#D6336C' },
  { id: 'audio', exts: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'], color: '#7048E8' },
  { id: 'txt', exts: ['txt', 'md', 'log', 'json', 'xml', 'yml', 'yaml'], color: '#64748B' },
];
const OTHER = { id: 'file', color: '#475569' };

export function extOf(name) {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function fileType(ext) {
  const value = String(ext || '').toLowerCase();
  return TYPES.find((type) => type.exts.includes(value)) || OTHER;
}

/** "2,4 МБ" / "2.4 MB". */
export function formatSize(bytes, locale = 'ru') {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  const units = tr(locale, 'linkPreview.units');
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 0 : 1;
  const text = value.toFixed(digits).replace(/\.0$/, '');
  return `${text.replace('.', decimalSeparator(locale))} ${units[unit]}`;
}

/** "PDF", "DOCX", "Изображение JPG", "Видео MP4"; the category word when there is no extension. */
export function typeLabel(type, ext, locale = 'ru') {
  const word = tr(locale, `linkPreview.types.${type.id}`);
  const upper = String(ext || '').toUpperCase();
  if (!upper) return word;
  if (['img', 'video', 'audio'].includes(type.id)) return `${word} ${upper}`;
  return upper;
}

const count = (n, locale, key) => tr(locale, `linkPreview.${key}`, { count: n });

/**
 * Preview texts of a language (locales/<lang>/linkPreview.js) as an object:
 * t.folder, t.until(date), t.from(owner), t.uploadTo(owner)…
 */
export function texts(locale) {
  const t = translator(locale);
  const plain = (key) => t(`linkPreview.${key}`);
  return new Proxy(
    {
      uploadTo: (owner) => (owner ? t('linkPreview.uploadTo', { owner }) : plain('uploadAny')),
      until: (date) => t('linkPreview.until', { date }),
      from: (owner) => t('linkPreview.from', { owner }),
    },
    { get: (target, key) => (key in target ? target[key] : typeof key === 'string' ? plain(key) : undefined) }
  );
}

/**
 * The portal language for previews (crawlers have no account): the default
 * language, or the fallback when the default is "browser language" — the same
 * language messages sent outside a request get for a person without one
 * (services/settings.js → recipientLocale).
 */
export function previewLocale(parsed) {
  const settings = sanitizeLocalization(parsed?.localization, parsed?.defaultLocale);
  return settings.default === 'browser' ? settings.fallback : settings.default;
}

const SKELETON_NAMES = new Set(['docker-app-skeleton', '']);
const SKELETON_DESCRIPTIONS = new Set(['Premium application skeleton on React, Express and PostgreSQL', 'Application console', '']);

/** Portal facts for previews (skeleton defaults replaced by neutral words). */
export function siteInfo(parsed, locale) {
  const t = texts(locale);
  const name = cleanText(parsed?.appName, 80);
  const description = cleanText(parsed?.appDescription, 200);
  const appearance = parsed?.appearance || {};
  return {
    name: SKELETON_NAMES.has(name) ? t.portal : name,
    description: SKELETON_DESCRIPTIONS.has(description) ? t.portalDescription : description,
    color: /^#[0-9a-f]{6}$/i.test(appearance.customColors?.colorPrimary || '') ? appearance.customColors.colorPrimary : '#1E3A6E',
    iconUrl: appearance.appIconUrl || null,
    logoUrl: appearance.logoUrl || null,
  };
}

function permissionFacts(perms, locale, kind) {
  const t = texts(locale);
  const out = [];
  if (perms.includes('view')) out.push(perms.includes('download') ? t.canDownload : t.viewOnly);
  if (kind !== 'file' && perms.includes('upload')) out.push(t.canUpload);
  if (perms.some((key) => ['mkdir', 'rename', 'delete'].includes(key))) out.push(t.canEdit);
  else if (kind === 'file' && perms.includes('replace')) out.push(t.canReplace);
  return out;
}

function folderCount(model, locale) {
  const t = texts(locale);
  const files = Number(model.files);
  const folders = Number(model.folders);
  if (!Number.isFinite(files) && !Number.isFinite(folders)) return t.folder;
  const parts = [];
  if (files > 0) parts.push(count(files, locale, 'files'));
  if (folders > 0) parts.push(count(folders, locale, 'folders'));
  return `${t.folder} · ${parts.length ? parts.join(', ') : t.empty}`;
}

/**
 * Everything a preview says, in the portal language:
 *   { title, description, alt, card: { badge, color, icon, title, lines[], footer } }
 * `site` is siteInfo(), `regional` the portal regional settings (dates).
 */
export function describe(model, { site, locale = 'ru', regional = REGIONAL_DEFAULTS } = {}) {
  const t = texts(locale);
  const siteName = site?.name || t.portal;
  const date = (value) => formatDate(value, regional, locale);
  const generic = (title, text, icon) => ({
    title,
    description: text,
    alt: `${title} — ${siteName}`,
    card: { icon, color: icon === 'site' ? null : '#64748B', title: icon === 'locked' ? t.lockedCard : title, lines: [text], footer: null },
  });

  if (!model || model.state === 'site') {
    return {
      title: siteName,
      description: site?.description || t.portalDescription,
      alt: siteName,
      card: { icon: 'site', title: siteName, lines: [site?.description || t.portalDescription], footer: null },
      site: true,
    };
  }
  if (model.state === 'locked') return generic(t.lockedTitle, t.lockedText, 'locked');
  if (model.state === 'employees') return generic(t.employeesTitle, t.employeesText, 'employees');
  if (model.state !== 'ok') return generic(t.invalidTitle, t.invalidText, 'invalid');

  const owner = cleanText(model.owner, 60);
  const expiry = model.expiresAt ? t.until(date(model.expiresAt)) : null;
  const note = cleanText(model.note, 140);
  let title = cleanText(model.title, 120) || cleanText(model.name, 160) || siteName;
  let head;
  let icon;
  let color;
  let badge = null;
  let lines = [];

  if (model.module === 'kb') {
    icon = model.kind === 'file' ? 'file' : model.kind === 'article' ? 'article' : 'kb';
    if (model.kind === 'file') {
      const type = fileType(model.ext);
      color = type.color;
      badge = (model.ext || type.en).toUpperCase().slice(0, 4);
      head = [typeLabel(type, model.ext, locale), formatSize(model.size ?? NaN, locale)].filter(Boolean).join(' · ');
    } else if (model.kind === 'article' || model.kind === 'link') {
      color = '#0F766E';
      head = `${model.kind === 'link' ? t.link : t.article} · ${t.kb}`;
    } else {
      color = '#0F766E';
      const n = Number(model.items);
      head = Number.isFinite(n) && n > 0 ? `${t.kb} · ${count(n, locale, 'materials')}` : t.kb;
    }
    const text = cleanText(model.excerpt, 170);
    lines = [head, text].filter(Boolean);
    const description = [text || head, text ? head : null, expiry].filter(Boolean).join(' · ');
    return {
      title,
      description: cleanText(description, 300),
      alt: `${title} — ${head}`,
      card: { icon, color, badge, title, lines: [head, expiry].filter(Boolean), footer: null },
    };
  }

  const perms = Array.isArray(model.perms) ? model.perms : [];
  const uploadOnly = !perms.includes('view') && perms.includes('upload');
  if (uploadOnly) {
    icon = 'upload';
    color = '#2563EB';
    head = t.uploadOnly;
    const ask = t.uploadTo(owner);
    lines = [ask, [t.hidden, expiry].filter(Boolean).join(' · ')];
    const description = [note, ask, t.hidden, expiry].filter(Boolean).join(' · ');
    return {
      title,
      description: cleanText(description, 300),
      alt: `${t.uploadOnly}: ${title}`,
      card: { icon, color, badge: null, title, lines: [ask, expiry].filter(Boolean), footer: null },
    };
  }

  if (model.kind === 'folder') {
    icon = 'folder';
    color = '#F59E0B';
    head = folderCount(model, locale);
  } else {
    const ext = model.ext || extOf(model.name);
    const type = fileType(ext);
    icon = 'file';
    color = type.color;
    badge = (ext || type.en).toUpperCase().slice(0, 4);
    head = [typeLabel(type, ext, locale), formatSize(model.size ?? NaN, locale)].filter(Boolean).join(' · ');
  }
  // The custom link title is the headline; the real name then goes into the facts.
  const named = cleanText(model.title, 120) && cleanText(model.name, 160) && cleanText(model.title, 120) !== cleanText(model.name, 160);
  if (named) head = `${cleanText(model.name, 80)} · ${head}`;
  const can = permissionFacts(perms, locale, model.kind);
  const description = [note, head, ...can, expiry, owner ? t.from(owner) : null].filter(Boolean).join(' · ');
  lines = [head, [...can.slice(0, 2), expiry].filter(Boolean).join(' · ')].filter(Boolean);
  title = title || siteName;
  return {
    title,
    description: cleanText(description, 300),
    alt: `${title} — ${head}`,
    card: { icon, color, badge, title, lines, footer: owner ? t.from(owner) : null, thumb: model.thumb || null },
  };
}

// ── <head> tags ─────────────────────────────────────────────────────────────

/** Open Graph locale: 'ru' → 'ru_RU' (en keeps en_US, what crawlers expect). */
const ogLocale = (locale) => (localeOrDefault(locale) === 'en' ? 'en_US' : localeTag(localeOrDefault(locale)).replace('-', '_'));

/**
 * The tags between the link-preview markers of index.html. `text` is
 * describe(), `site` siteInfo(), `url` the canonical page address, `image`
 * { url, width, height } (absolute URLs only), `icons` { apple } paths.
 */
export function headTags({ text, site, locale = 'ru', url, image, appleIcon, robots }) {
  const e = escapeHtml;
  const siteName = site?.name || texts(locale).portal;
  const title = text.site ? siteName : `${text.title} · ${siteName}`;
  const lines = [
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(text.description)}" />`,
    `<meta name="theme-color" content="${e(site?.color || '#1E3A6E')}" />`,
    `<meta name="apple-mobile-web-app-title" content="${e(cleanText(siteName, 30))}" />`,
    `<link rel="apple-touch-icon" href="${e(appleIcon || '/pwa/apple-touch-icon.png')}" />`,
    robots ? `<meta name="robots" content="${e(robots)}" />` : null,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${e(siteName)}" />`,
    `<meta property="og:title" content="${e(text.title)}" />`,
    `<meta property="og:description" content="${e(text.description)}" />`,
    `<meta property="og:locale" content="${ogLocale(locale)}" />`,
    url ? `<meta property="og:url" content="${e(url)}" />` : null,
    url ? `<link rel="canonical" href="${e(url)}" />` : null,
    image ? `<meta property="og:image" content="${e(image.url)}" />` : null,
    image && /^https:/i.test(image.url) ? `<meta property="og:image:secure_url" content="${e(image.url)}" />` : null,
    image ? `<meta property="og:image:type" content="image/png" />` : null,
    image ? `<meta property="og:image:width" content="${Number(image.width) || 1200}" />` : null,
    image ? `<meta property="og:image:height" content="${Number(image.height) || 630}" />` : null,
    image ? `<meta property="og:image:alt" content="${e(text.alt)}" />` : null,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${e(text.title)}" />`,
    `<meta name="twitter:description" content="${e(text.description)}" />`,
    image ? `<meta name="twitter:image" content="${e(image.url)}" />` : null,
    image ? `<meta name="twitter:image:alt" content="${e(text.alt)}" />` : null,
  ];
  return lines.filter(Boolean).join('\n    ');
}

const START = '<!-- link-preview:start -->';
const END = '<!-- link-preview:end -->';

/**
 * index.html with the preview tags in place of its defaults: between the
 * markers when the file has them, else instead of its <title> and meta
 * description, right after <head>. Sets <html lang>.
 */
export function injectHead(template, tags, locale = 'ru') {
  let html = String(template);
  const start = html.indexOf(START);
  const end = html.indexOf(END, start + 1);
  if (start !== -1 && end !== -1) {
    html = `${html.slice(0, start + START.length)}\n    ${tags}\n    ${html.slice(end)}`;
  } else {
    html = html
      .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
      .replace(/<meta\s+name="(description|theme-color|apple-mobile-web-app-title)"[^>]*>\s*/gi, '')
      .replace(/<link\s+rel="apple-touch-icon"[^>]*>\s*/gi, '')
      .replace(/<head>/i, `<head>\n    ${tags}`);
  }
  return html.replace(/<html\b[^>]*>/i, `<html lang="${localeOrDefault(locale)}">`);
}
