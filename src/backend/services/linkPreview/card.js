import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { previewDir, touchPreview } from '../../modules/shared/storage.js';
import { escapeHtml } from './meta.js';
import { loadMetrics } from './fontMetrics.js';

/*
 * The preview picture messengers show under a link: a 1200×630 PNG drawn as
 * SVG and rasterised by resvg (a Rust renderer with prebuilt binaries for
 * glibc and musl/Alpine; no system libraries). Text uses the bundled Inter
 * font (SIL OFL, assets/fonts), which covers Latin and the whole Cyrillic
 * range (Kyrgyz and Kazakh letters too) and Turkish, with Noto Sans SC as the
 * fallback for Chinese (SIL OFL; a subset: GB2312 — 6 763 hanzi — CJK and
 * full-width punctuation and every character of the zh texts, ≈2.3 MB per
 * weight). Widths come from the fonts themselves, so titles wrap and shorten
 * exactly as drawn. Text without spaces (Chinese) breaks between characters.
 *
 * Pictures are cached under uploads/.previews/og/<hash>.png, where the hash
 * covers everything drawn (texts, colours, logo, thumbnail version): a
 * changed link or portal setting is simply a new file, and the scheduled
 * preview-cache job removes pictures nobody fetched for a month.
 */

export const WIDTH = 1200;
export const HEIGHT = 630;
// WhatsApp drops preview images above ~300 KB.
export const MAX_BYTES = 290 * 1024;
const CARD_VERSION = 5;

const here = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = resolve(here, '../../assets/fonts');
const FONTS = { regular: join(FONT_DIR, 'Inter-Regular.ttf'), bold: join(FONT_DIR, 'Inter-Bold.ttf') };
// Glyphs Inter lacks (Chinese) come from here; resvg falls back along FAMILY.
const CJK_FONTS = { regular: join(FONT_DIR, 'NotoSansSC-Regular.ttf'), bold: join(FONT_DIR, 'NotoSansSC-Bold.ttf') };
const FAMILY = `Inter, 'Noto Sans SC'`;

/** Metrics of a font with its fallback: a character is measured in the first font that has it. */
export function fontStackMetrics(primary, fallback) {
  const source = (char) => (primary.has(char) || !fallback?.has(char) ? primary : fallback);
  return {
    unitsPerEm: primary.unitsPerEm,
    has: (char) => primary.has(char) || Boolean(fallback?.has(char)),
    width(text, size) {
      let total = 0;
      for (const char of String(text)) total += source(char).width(char, size);
      return total;
    },
  };
}

const optionalMetrics = (path) => {
  try {
    return loadMetrics(path);
  } catch {
    return null;
  }
};

let metrics = null;
function fonts() {
  if (!metrics) {
    metrics = {
      regular: fontStackMetrics(loadMetrics(FONTS.regular), optionalMetrics(CJK_FONTS.regular)),
      bold: fontStackMetrics(loadMetrics(FONTS.bold), optionalMetrics(CJK_FONTS.bold)),
    };
  }
  return metrics;
}

let resvg;
async function renderer() {
  if (resvg === undefined) {
    resvg = await import('@resvg/resvg-js').then((mod) => mod.Resvg || mod.default?.Resvg).catch((err) => {
      console.warn(`[link-preview] picture renderer unavailable: ${err.message}`);
      return null;
    });
  }
  return resvg;
}

export async function rendererAvailable() {
  return Boolean(await renderer());
}

// ── Text layout ─────────────────────────────────────────────────────────────

/** Only characters the font can draw (emoji and rare symbols would be empty boxes). */
export function drawable(text, font = fonts().regular) {
  return [...String(text || '')].filter((char) => char === ' ' || font.has(char)).join('').replace(/\s+/g, ' ').trim();
}

/** `text` shortened with an ellipsis to fit `width` at `size`. */
export function fitLine(text, { font, size, width }) {
  const value = String(text || '');
  if (font.width(value, size) <= width) return value;
  const chars = [...value];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.width(`${chars.slice(0, mid).join('').trimEnd()}…`, size) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join('').replace(/[\s,.;:·—-]+$/, '')}…`;
}

/**
 * Words wrapped into at most `maxLines` lines of `width`; the last line ends
 * with an ellipsis when the text does not fit. Words longer than a line are
 * broken. Returns { lines, cut }.
 */
export function wrapText(text, { font, size, width, maxLines }) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  let index = 0;
  const fits = (value) => font.width(value, size) <= width;
  while (index < words.length && lines.length < maxLines) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      index += 1;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
      continue;
    }
    // A single word wider than the line: break it.
    const chars = [...word];
    let take = chars.length;
    while (take > 1 && !fits(chars.slice(0, take).join(''))) take -= 1;
    lines.push(chars.slice(0, take).join(''));
    words[index] = chars.slice(take).join('');
  }
  if (current && lines.length < maxLines) lines.push(current);
  const cut = index < words.length;
  if (cut && lines.length) {
    const last = lines.length - 1;
    lines[last] = fitLine([lines[last], ...words.slice(index)].join(' '), { font, size, width });
  }
  return { lines, cut };
}

/** Title lines: the largest size (from `sizes`) at which it fits in `maxLines`. */
export function layoutTitle(text, { width, maxLines = 3, sizes = [64, 56, 48] }) {
  const font = fonts().bold;
  for (const size of sizes) {
    const result = wrapText(text, { font, size, width, maxLines });
    if (!result.cut) return { size, lines: result.lines };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrapText(text, { font, size, width, maxLines }).lines };
}

// ── Colours ─────────────────────────────────────────────────────────────────

function rgb(hex) {
  const value = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))?.[1] || '1E3A6E';
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
}

function mix(a, b, amount) {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}

/** A brand colour dark enough for white text on top of it. */
function background(color) {
  const [r, g, b] = rgb(color);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.45 ? mix(color, '#0B1220', 0.55) : luminance > 0.3 ? mix(color, '#0B1220', 0.3) : color;
}

// ── Icons (drawn inside a 280 × 300 box at the origin) ──────────────────────

const e = escapeHtml;

function documentIcon(color, badge) {
  const label = drawable(badge || '', fonts().bold).slice(0, 4) || 'FILE';
  const size = label.length > 3 ? 46 : 54;
  return `
    <g transform="translate(30 10)">
      <path d="M0 24 Q0 0 24 0 H156 L220 64 V256 Q220 280 196 280 H24 Q0 280 0 256 Z" fill="#FFFFFF"/>
      <path d="M156 0 V44 Q156 64 176 64 H220 Z" fill="${e(mix(color, '#FFFFFF', 0.55))}"/>
      <rect x="28" y="60" width="104" height="12" rx="6" fill="#E2E8F0"/>
      <rect x="28" y="88" width="150" height="12" rx="6" fill="#E2E8F0"/>
      <rect x="28" y="116" width="128" height="12" rx="6" fill="#E2E8F0"/>
      <rect x="-14" y="164" width="200" height="84" rx="18" fill="${e(color)}"/>
      <text x="86" y="${206 + size * 0.36}" text-anchor="middle" font-family="${FAMILY}" font-weight="700" font-size="${size}" fill="#FFFFFF">${e(label)}</text>
    </g>`;
}

function folderIcon(color) {
  return `
    <g transform="translate(0 40)">
      <path d="M0 40 Q0 16 24 16 H100 Q114 16 122 28 L136 46 H256 Q280 46 280 70 V100 H0 Z" fill="${e(mix(color, '#7C2D12', 0.18))}"/>
      <rect x="0" y="74" width="280" height="166" rx="24" fill="${e(color)}"/>
      <rect x="0" y="74" width="280" height="30" rx="12" fill="${e(mix(color, '#FFFFFF', 0.25))}" opacity="0.6"/>
    </g>`;
}

function tile(color, inner) {
  return `
    <rect x="10" y="20" width="260" height="260" rx="56" fill="${e(color)}"/>
    <g transform="translate(140 150)" fill="none" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
}

const ICONS = {
  upload: (color) => tile(color, '<path d="M0 30 V-62"/><path d="M-40 -24 L0 -64 L40 -24"/><path d="M-70 26 V58 Q-70 70 -58 70 H58 Q70 70 70 58 V26"/>'),
  locked: (color) => tile(color, '<rect x="-60" y="-14" width="120" height="96" rx="18"/><path d="M-36 -14 V-40 Q-36 -76 0 -76 Q36 -76 36 -40 V-14"/><path d="M0 22 V44"/>'),
  invalid: (color) => tile(color, '<path d="M-14 -46 L4 -64 Q30 -90 56 -64 Q82 -38 56 -12 L38 6"/><path d="M14 46 L-4 64 Q-30 90 -56 64 Q-82 38 -56 12 L-38 -6"/><path d="M-62 -62 L-40 -40"/><path d="M62 62 L40 40"/>'),
  employees: (color) => tile(color, '<circle cx="0" cy="-30" r="36"/><path d="M-70 72 Q-70 18 0 18 Q70 18 70 72"/>'),
  kb: (color) => tile(color, '<path d="M-72 -62 Q-36 -78 0 -56 Q36 -78 72 -62 V62 Q36 46 0 68 Q-36 46 -72 62 Z"/><path d="M0 -56 V68"/>'),
  article: (color) => tile(color, '<rect x="-62" y="-78" width="124" height="156" rx="16"/><path d="M-34 -40 H34"/><path d="M-34 -6 H34"/><path d="M-34 28 H10"/>'),
};

function iconFor(card) {
  const color = card.color || '#64748B';
  if (card.icon === 'folder') return folderIcon(color);
  if (card.icon === 'file') return documentIcon(color, card.badge);
  return (ICONS[card.icon] || ICONS.invalid)(color);
}

function thumbBlock(thumb, card) {
  const label = drawable(card.badge || '', fonts().bold).slice(0, 4);
  return `
    <clipPath id="thumb"><rect x="0" y="0" width="280" height="300" rx="28"/></clipPath>
    <rect x="-6" y="-6" width="292" height="312" rx="32" fill="#FFFFFF" opacity="0.9"/>
    <image href="${e(thumb.dataUrl)}" x="0" y="0" width="280" height="300" preserveAspectRatio="xMidYMid slice" clip-path="url(#thumb)"/>
    ${label ? `<rect x="16" y="236" width="${40 + fonts().bold.width(label, 28)}" height="48" rx="12" fill="${e(card.color || '#8E4EC6')}"/>
    <text x="${36}" y="270" font-family="${FAMILY}" font-weight="700" font-size="28" fill="#FFFFFF">${e(label)}</text>` : ''}`;
}

// ── The card ────────────────────────────────────────────────────────────────

function brandBadge(site, logo, x, y, size) {
  const radius = Math.round(size * 0.24);
  if (logo) {
    const pad = Math.round(size * 0.12);
    return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="#FFFFFF"/>
    <image href="${e(logo)}" x="${x + pad}" y="${y + pad}" width="${size - pad * 2}" height="${size - pad * 2}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const letter = drawable(site.name, fonts().bold).charAt(0).toUpperCase() || 'P';
  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="#FFFFFF"/>
    <text x="${x + size / 2}" y="${y + size * 0.68}" text-anchor="middle" font-family="${FAMILY}" font-weight="700" font-size="${Math.round(size * 0.5)}" fill="${e(site.color)}">${e(letter)}</text>`;
}

/**
 * The SVG of a preview card. `card` is describe().card, `site` siteInfo(),
 * `host` the portal address shown at the bottom, `logo` and `thumb.dataUrl`
 * data: URLs (or null).
 */
export function cardSvg({ card, site, host, logo = null, thumb = null }) {
  const { regular, bold } = fonts();
  const base = background(site.color);
  const deep = mix(base, '#020617', 0.45);
  const glow = mix(site.color, '#FFFFFF', 0.25);
  const siteName = fitLine(drawable(site.name, bold), { font: bold, size: 34, width: 760 });
  const hostText = fitLine(drawable(host, regular), { font: regular, size: 26, width: 520 });
  const footer = card.footer ? fitLine(drawable(card.footer, regular), { font: regular, size: 26, width: 560 }) : '';

  const head = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${e(base)}"/>
      <stop offset="1" stop-color="${e(deep)}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.6">
      <stop offset="0" stop-color="${e(glow)}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${e(glow)}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  <circle cx="1130" cy="40" r="250" fill="#FFFFFF" opacity="0.05"/>
  <circle cx="1060" cy="640" r="190" fill="#FFFFFF" opacity="0.04"/>`;

  // The portal itself: a large logo, its name and description.
  if (card.icon === 'site') {
    const title = layoutTitle(drawable(site.name, bold), { width: 1056, maxLines: 2, sizes: [84, 72, 60] });
    const lines = wrapText(drawable(card.lines?.[0] || '', regular), { font: regular, size: 36, width: 1056, maxLines: 2 }).lines;
    const titleTop = 330;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${head}
  ${brandBadge(site, logo, 72, 80, 150)}
  ${title.lines.map((line, i) => `<text x="72" y="${titleTop + i * Math.round(title.size * 1.12)}" font-family="${FAMILY}" font-weight="700" font-size="${title.size}" fill="#FFFFFF">${e(line)}</text>`).join('\n  ')}
  ${lines.map((line, i) => `<text x="72" y="${titleTop + (title.lines.length - 1) * Math.round(title.size * 1.12) + 64 + i * 46}" font-family="${FAMILY}" font-size="36" fill="#FFFFFF" fill-opacity="0.82">${e(line)}</text>`).join('\n  ')}
  <text x="72" y="574" font-family="${FAMILY}" font-size="26" fill="#FFFFFF" fill-opacity="0.7">${e(hostText)}</text>
</svg>`;
  }

  const textX = 400;
  const textWidth = WIDTH - textX - 72;
  const title = layoutTitle(drawable(card.title, bold), { width: textWidth, maxLines: 3 });
  const given = (card.lines || []).filter(Boolean).slice(0, 2);
  // A single sentence (generic cards) may take two lines.
  const facts =
    given.length === 1
      ? wrapText(drawable(given[0], regular), { font: regular, size: 30, width: textWidth, maxLines: 2 }).lines
      : given.map((line) => fitLine(drawable(line, regular), { font: regular, size: 30, width: textWidth }));
  const lineHeight = Math.round(title.size * 1.14);
  const blockHeight = title.lines.length * lineHeight + facts.length * 44 + (facts.length ? 18 : 0);
  // Vertically centred next to the icon (which spans y 166–466).
  const top = Math.max(176, Math.round(316 - blockHeight / 2)) + Math.round(title.size * 0.8);
  const titleSvg = title.lines
    .map((line, i) => `<text x="${textX}" y="${top + i * lineHeight}" font-family="${FAMILY}" font-weight="700" font-size="${title.size}" fill="#FFFFFF">${e(line)}</text>`)
    .join('\n  ');
  const factsTop = top + (title.lines.length - 1) * lineHeight + 30 + 34;
  const factsSvg = facts
    .map((line, i) => `<text x="${textX}" y="${factsTop + i * 44}" font-family="${FAMILY}" font-size="30" fill="#FFFFFF" fill-opacity="${i === 0 || given.length === 1 ? 0.9 : 0.72}">${e(line)}</text>`)
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${head}
  ${brandBadge(site, logo, 72, 56, 72)}
  <text x="164" y="104" font-family="${FAMILY}" font-weight="700" font-size="34" fill="#FFFFFF">${e(siteName)}</text>
  <g transform="translate(72 166)">${thumb ? thumbBlock(thumb, card) : iconFor(card)}</g>
  ${titleSvg}
  ${factsSvg}
  <text x="72" y="584" font-family="${FAMILY}" font-size="26" fill="#FFFFFF" fill-opacity="0.7">${e(hostText)}</text>
  ${footer ? `<text x="1128" y="584" text-anchor="end" font-family="${FAMILY}" font-size="26" fill="#FFFFFF" fill-opacity="0.7">${e(footer)}</text>` : ''}
</svg>`;
}

// ── Images to embed ─────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;

/** Width and height of a PNG, JPEG or GIF, or null. */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length > 10 && buf.toString('latin1', 0, 4) === 'GIF8') return { type: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let at = 2;
    while (at + 9 < buf.length) {
      if (buf[at] !== 0xff) return null;
      const marker = buf[at + 1];
      const length = buf.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
      }
      at += 2 + length;
    }
  }
  return null;
}

const MIME = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' };

/** A raster picture as a data: URL, when it is a sane PNG/JPEG/GIF. */
export function rasterDataUrl(buf) {
  if (!buf || buf.length > MAX_IMAGE_BYTES) return null;
  const size = imageSize(buf);
  if (!size || !size.width || !size.height || size.width * size.height > MAX_PIXELS) return null;
  return `data:${MIME[size.type]};base64,${buf.toString('base64')}`;
}

/** The portal icon or logo (uploads/logos/…) as a data: URL; SVG is embedded as SVG. */
export async function logoDataUrl(file) {
  if (!file) return null;
  const buf = await readFile(file).catch(() => null);
  if (!buf || buf.length > 2 * 1024 * 1024) return null;
  if (/\.svg$/i.test(file)) {
    // Scripts never run in resvg; external references are not fetched.
    return `data:image/svg+xml;base64,${buf.toString('base64')}`;
  }
  return rasterDataUrl(buf);
}

// ── Rendering and the cache ─────────────────────────────────────────────────

export const cacheDir = () => join(previewDir(), 'og');

/** Hash of everything a card shows: the cache file name and the og:image version. */
export function cardKey({ card, site, host, logoKey, thumbKey }) {
  return createHash('sha256')
    .update(JSON.stringify({ v: CARD_VERSION, card: { ...card, thumb: undefined }, site: { name: site.name, color: site.color }, host, logoKey: logoKey || null, thumbKey: thumbKey || null }))
    .digest('hex')
    .slice(0, 32);
}

let running = 0;
const waiting = [];
const inflight = new Map();

/** Pictures that may wait for their turn; beyond that a request is refused (RENDER_BUSY) instead of queued. */
export const MAX_WAITING = 16;

export async function renderSlot(job) {
  // At most two pictures are drawn at a time; the rest wait their turn, up to MAX_WAITING.
  if (running >= 2) {
    if (waiting.length >= MAX_WAITING) {
      const error = new Error('Too many pictures are being drawn');
      error.code = 'RENDER_BUSY';
      throw error;
    }
    await new Promise((resolveTurn) => waiting.push(resolveTurn));
  }
  running += 1;
  try {
    return await job();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/** PNG bytes of an SVG. */
export async function renderPng(svg) {
  const Resvg = await renderer();
  if (!Resvg) throw new Error('Picture renderer unavailable');
  return renderSlot(async () => {
    const instance = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
      font: { fontFiles: [FONTS.regular, FONTS.bold, CJK_FONTS.regular, CJK_FONTS.bold], loadSystemFonts: false, defaultFontFamily: 'Inter' },
      imageRendering: 0,
      shapeRendering: 2,
      textRendering: 1,
    });
    return instance.render().asPng();
  });
}

/**
 * The cached PNG for a card (made when missing). `load()` returns
 * { logo, thumb } data URLs and runs only when the picture must be drawn.
 * A picture with a photo that comes out too large for WhatsApp is drawn
 * again without it. Returns the file path.
 */
export async function cardPng(key, { card, site, host, load }) {
  const file = join(cacheDir(), `${key}.png`);
  const info = await stat(file).catch(() => null);
  if (info) {
    touchPreview(file, info);
    return file;
  }
  if (!inflight.has(file)) {
    const job = (async () => {
      const { logo = null, thumb = null } = (await load?.()) || {};
      let png = await renderPng(cardSvg({ card, site, host, logo, thumb }));
      if (thumb && png.length > MAX_BYTES) png = await renderPng(cardSvg({ card, site, host, logo, thumb: null }));
      await mkdir(cacheDir(), { recursive: true });
      const temp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
      try {
        await writeFile(temp, png);
        await rename(temp, file);
      } catch (err) {
        await unlink(temp).catch(() => {});
        throw err;
      }
      return file;
    })().finally(() => inflight.delete(file));
    inflight.set(file, job);
  }
  return inflight.get(file);
}
