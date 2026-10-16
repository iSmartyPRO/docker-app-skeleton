/*
 * Colour maths for the theme system (WCAG 2.x contrast). Pure functions with
 * no browser or React dependency: the theme engine, the contrast check script
 * (scripts/check-theme-contrast.mjs) and the backend unit tests import it.
 */

/** "#abc" / "#aabbcc" / "#aabbccdd" → { r, g, b, a } (0–255, alpha 0–1); null when not a hex colour. */
export function parseHex(value) {
  const text = String(value || '').trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return null;
  const full = text.length === 3 ? text.split('').map((ch) => ch + ch).join('') : text;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
  };
}

const clamp255 = (value) => Math.max(0, Math.min(255, Math.round(value)));

export function toHex({ r, g, b }) {
  return `#${[r, g, b].map((part) => clamp255(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

/** `weight` of `a` over `b` (0 = all b, 1 = all a), like CSS color-mix(in srgb, a weight, b). */
export function mix(a, b, weight) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a || b;
  const w = Math.max(0, Math.min(1, weight));
  return toHex({ r: ca.r * w + cb.r * (1 - w), g: ca.g * w + cb.g * (1 - w), b: ca.b * w + cb.b * (1 - w) });
}

const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a hex colour (0 = black, 1 = white). */
export function luminance(hex) {
  const c = parseHex(hex);
  if (!c) return 0;
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio of two hex colours, 1–21. A translucent foreground is blended over the background first. */
export function contrastRatio(fg, bg) {
  const front = parseHex(fg);
  const back = parseHex(bg);
  if (!front || !back) return 1;
  const solid = front.a < 1 ? mix(toHex(front), toHex(back), front.a) : toHex(front);
  const l1 = luminance(solid);
  const l2 = luminance(toHex(back));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const isDark = (hex) => luminance(hex) < 0.18;

/**
 * Text colour for `bg` (e.g. a button label): the first candidate that reaches
 * `min`, in order of preference; else the one that reads best.
 */
export function bestOn(bg, candidates = ['#FFFFFF', '#000000'], min = 4.5) {
  const first = candidates.find((item) => contrastRatio(item, bg) >= min);
  if (first) return first;
  return candidates.reduce((best, item) => (contrastRatio(item, bg) > contrastRatio(best, bg) ? item : best), candidates[0]);
}

/**
 * The colour nearest to `color` that reaches `ratio` against every one of
 * `backgrounds`: moved step by step towards black or white (whichever helps),
 * keeping its hue. Used for a person's accent colour and for derived text.
 */
export function ensureContrast(color, backgrounds, ratio = 4.5) {
  const list = (Array.isArray(backgrounds) ? backgrounds : [backgrounds]).filter(Boolean);
  if (!parseHex(color) || !list.length) return color;
  const worst = (candidate) => Math.min(...list.map((bg) => contrastRatio(candidate, bg)));
  if (worst(color) >= ratio) return toHex(parseHex(color));
  const darkBg = list.every((bg) => isDark(bg));
  const lightBg = list.every((bg) => !isDark(bg));
  const targets = darkBg ? ['#FFFFFF'] : lightBg ? ['#000000'] : ['#000000', '#FFFFFF'];
  let best = color;
  let bestScore = worst(color);
  for (const target of targets) {
    for (let step = 1; step <= 40; step += 1) {
      const candidate = mix(target, color, step / 40);
      const score = worst(candidate);
      if (score >= ratio) return candidate;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return best;
}

/**
 * Smallest share of `text` mixed over the first of `backgrounds` (like the
 * CSS `--da-muted` colour-mix) whose solid result still reaches `ratio`
 * against every one of them; never below `min`.
 */
export function mutedShare(text, backgrounds, ratio = 4.5, min = 0.58) {
  const list = Array.isArray(backgrounds) ? backgrounds : [backgrounds];
  for (let share = min; share < 1; share += 0.02) {
    const solid = mix(text, list[0], share);
    if (list.every((bg) => contrastRatio(solid, bg) >= ratio)) return Math.round(share * 100) / 100;
  }
  return 1;
}

/** WCAG levels a check uses: body text, large text / UI parts. */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

/**
 * Contrast pairs every theme must pass. `colors` are the resolved tokens of
 * one theme (see theme/themes.js → themeTokens). Returns the list of results;
 * `ok` is false when a pair is below its minimum.
 */
export function checkThemeContrast(colors) {
  const surfaces = [
    ['container', colors.colorBgContainer],
    ['layout', colors.colorBgLayout],
    ['elevated', colors.colorBgElevated || colors.colorBgContainer],
  ];
  const pairs = [];
  const add = (name, fg, bg, min) => {
    const ratio = contrastRatio(fg, bg);
    pairs.push({ name, fg, bg, min, ratio: Math.round(ratio * 100) / 100, ok: ratio >= min });
  };
  for (const [surface, bg] of surfaces) {
    add(`text / ${surface}`, colors.colorTextBase, bg, AA_TEXT);
    add(`secondary text / ${surface}`, colors.colorTextSecondary, bg, AA_TEXT);
  }
  add('link (primary) / container', colors.colorPrimary, colors.colorBgContainer, AA_TEXT);
  add('primary button label', colors.onPrimary, colors.colorPrimary, AA_TEXT);
  add('error text / container', colors.colorError, colors.colorBgContainer, AA_TEXT);
  add('success / container', colors.colorSuccess, colors.colorBgContainer, AA_UI);
  add('warning / container', colors.colorWarning, colors.colorBgContainer, AA_UI);
  add('tertiary text / container', colors.colorTextTertiary, colors.colorBgContainer, AA_UI);
  add('focus ring / layout', colors.colorPrimary, colors.colorBgLayout, AA_UI);
  return pairs;
}
