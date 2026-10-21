/*
 * The look of a QR code, as stored in templates and codes (docs/qr.md).
 *
 *   dots        modules of the code: style, colour or a two-stop gradient
 *   eyes        the three finder patterns: frame and centre shapes, own colours
 *   background  colour or transparent, rounded corners
 *   logo        none, the portal logo (light / dark), an uploaded image or an
 *               icon of the type; size in % of the code, a plate behind it
 *   frame       a caption around the code («Наведите камеру»)
 *   margin      quiet zone in modules; ecl error correction (auto: H with a logo)
 *
 * A colour is #RRGGBB or "@brand" — the portal's primary colour, resolved when
 * the code is drawn, so brand templates follow a new theme by themselves.
 * Everything is whitelisted: unknown keys are dropped, numbers clamped.
 */

export const DOT_STYLES = ['square', 'rounded', 'dots', 'classy', 'diamond', 'fluid'];
export const EYE_FRAMES = ['square', 'rounded', 'circle', 'leaf', 'soft'];
export const EYE_BALLS = ['square', 'rounded', 'circle', 'leaf', 'diamond'];
export const LOGO_SOURCES = ['none', 'brand', 'brandDark', 'upload', 'icon'];
export const PLATE_SHAPES = ['none', 'square', 'rounded', 'circle'];
export const FRAME_STYLES = ['none', 'caption', 'card', 'ticket', 'badge'];
export const ECL = ['auto', 'L', 'M', 'Q', 'H'];
export const LOCK_KEYS = ['colors', 'shape', 'logo', 'frame'];
export const ICONS = ['link', 'globe', 'user', 'wifi', 'mail', 'phone', 'message', 'map', 'calendar', 'whatsapp', 'telegram', 'instagram', 'star', 'heart', 'cart'];

const HEX = /^#[0-9a-f]{6}$/i;
const FILE = /^[a-f0-9]{24}\.(png|svg|webp|jpg)$/;

export const DEFAULT_DESIGN = Object.freeze({
  dots: { style: 'rounded', color: '#0F172A', gradient: null },
  eyes: { frame: 'rounded', ball: 'rounded', frameColor: null, ballColor: null },
  background: { color: '#FFFFFF', transparent: false, radius: 0 },
  logo: { source: 'none', file: null, icon: null, size: 22, plate: 'rounded', plateColor: '#FFFFFF', padding: 10 },
  frame: { style: 'none', text: '', color: '#0F172A', textColor: '#FFFFFF' },
  margin: 3,
  ecl: 'auto',
});

const pick = (value, list, fallback) => (list.includes(value) ? value : fallback);
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

/** #RRGGBB (upper case) or @brand; `nullable` keeps null for «same as the dots». */
export function cleanColor(value, fallback, nullable = false) {
  if (value === '@brand') return '@brand';
  if (typeof value === 'string' && HEX.test(value)) return value.toUpperCase();
  if (nullable && (value === null || value === '')) return null;
  return fallback;
}

function cleanGradient(input, base) {
  if (!input || typeof input !== 'object') return null;
  return {
    type: input.type === 'radial' ? 'radial' : 'linear',
    from: cleanColor(input.from, base),
    to: cleanColor(input.to, base),
    angle: clamp(input.angle, 0, 360, 45),
  };
}

/** A complete, safe design from any input; missing parts come from `base` (the default). */
export function cleanDesign(input = {}, base = DEFAULT_DESIGN) {
  const source = input && typeof input === 'object' ? input : {};
  const dots = source.dots || {};
  const eyes = source.eyes || {};
  const background = source.background || {};
  const logo = source.logo || {};
  const frame = source.frame || {};
  const dotColor = cleanColor(dots.color, base.dots.color);
  const logoSource = pick(logo.source, LOGO_SOURCES, base.logo.source);
  return {
    dots: {
      style: pick(dots.style, DOT_STYLES, base.dots.style),
      color: dotColor,
      gradient: cleanGradient(dots.gradient, dotColor),
    },
    eyes: {
      frame: pick(eyes.frame, EYE_FRAMES, base.eyes.frame),
      ball: pick(eyes.ball, EYE_BALLS, base.eyes.ball),
      frameColor: cleanColor(eyes.frameColor, null, true),
      ballColor: cleanColor(eyes.ballColor, null, true),
    },
    background: {
      color: cleanColor(background.color, base.background.color),
      transparent: Boolean(background.transparent),
      radius: clamp(background.radius, 0, 30, base.background.radius),
    },
    logo: {
      source: logoSource,
      file: logoSource === 'upload' && FILE.test(logo.file || '') ? logo.file : null,
      icon: logoSource === 'icon' ? pick(logo.icon, ICONS, 'link') : null,
      size: clamp(logo.size, 10, 30, base.logo.size),
      plate: pick(logo.plate, PLATE_SHAPES, base.logo.plate),
      plateColor: cleanColor(logo.plateColor, base.logo.plateColor),
      padding: clamp(logo.padding, 0, 30, base.logo.padding),
    },
    frame: {
      style: pick(frame.style, FRAME_STYLES, base.frame.style),
      text: String(frame.text ?? base.frame.text ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40),
      color: cleanColor(frame.color, base.frame.color),
      textColor: cleanColor(frame.textColor, base.frame.textColor),
    },
    margin: clamp(source.margin, 0, 8, base.margin),
    ecl: pick(source.ecl, ECL, base.ecl),
  };
}

/** Which groups of options people may change in a template ({ colors: true } = locked). */
export function cleanLocks(input = {}) {
  const out = {};
  for (const key of LOCK_KEYS) out[key] = Boolean(input?.[key]);
  return out;
}

/** The uploaded logo files a design points at (to keep them when cleaning up). */
export function designFiles(design) {
  return design?.logo?.source === 'upload' && design.logo.file ? [design.logo.file] : [];
}

/*
 * Locked groups of a template win over what a person sent: the server copies
 * them from the template, so a brand template stays on brand whatever the
 * browser does. `all` (module setting «only templates») locks every group.
 */
const LOCKED_PARTS = {
  colors: (to, from) => {
    to.dots.color = from.dots.color;
    to.dots.gradient = from.dots.gradient;
    to.eyes.frameColor = from.eyes.frameColor;
    to.eyes.ballColor = from.eyes.ballColor;
    to.background = { ...from.background };
    to.frame.color = from.frame.color;
    to.frame.textColor = from.frame.textColor;
  },
  shape: (to, from) => {
    to.dots.style = from.dots.style;
    to.eyes.frame = from.eyes.frame;
    to.eyes.ball = from.eyes.ball;
    to.margin = from.margin;
    to.ecl = from.ecl;
  },
  logo: (to, from) => {
    to.logo = { ...from.logo };
  },
  frame: (to, from) => {
    to.frame.style = from.frame.style;
    to.frame.text = from.frame.text;
  },
};

export function applyLocks(design, templateDesign, locks = {}, all = false) {
  const out = cleanDesign(design);
  const from = cleanDesign(templateDesign);
  for (const key of LOCK_KEYS) if (all || locks[key]) LOCKED_PARTS[key](out, from);
  return out;
}
