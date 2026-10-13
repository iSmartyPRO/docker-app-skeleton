/*
 * Point markers on the site plan (docs/masterplan.md "Point markers").
 * Pure geometry and colour helpers, no React: sizes, the on-screen layout of
 * markers at a zoom (shrink instead of hiding — every marker is an explicit
 * placement and stays visible), tap resolution, snapping and conversions
 * between a contour and a point. Unit-tested from the backend suite
 * (test/masterplan-markers.test.js).
 */
import { bbox, centroidOf, textWidth } from './labels.js';

/** Radius presets as a share of the plan's longer side (the same as the server, markers.js). */
export const MARKER_SIZE_SHARE = { S: 0.0055, M: 0.008, L: 0.0115 };
export const MARKER_SIZES = ['S', 'M', 'L'];
/** On-screen radius of a marker with a number: never smaller (readable), never bigger (a pin, not a blob). */
export const MARKER_MIN_PX = 11;
export const MARKER_MAX_PX = 40;
/** Radius of a marker shown as a dot (no number). */
export const MARKER_DOT_PX = 5;
/** Smallest tap target: a 24 px circle. */
export const MARKER_HIT_PX = 12;
/** Smallest readable number inside a marker. */
export const MARKER_FONT_MIN = 9;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round1 = (value) => Math.round(value * 10) / 10;

export function markerBounds(plan) {
  const side = Math.max(Number(plan?.width) || 0, Number(plan?.height) || 0, 1);
  return { min: Math.max(2, round1(side * 0.002)), max: round1(side * 0.08), side };
}

export function presetRadius(plan, size = 'M') {
  return round1(markerBounds(plan).side * (MARKER_SIZE_SHARE[size] || MARKER_SIZE_SHARE.M));
}

/** The preset nearest to a radius ('S' | 'M' | 'L'), or null when it is far from all (a custom size). */
export function sizeOf(plan, r) {
  let best = null;
  let diff = Infinity;
  for (const size of MARKER_SIZES) {
    const d = Math.abs(presetRadius(plan, size) - r);
    if (d < diff) {
      diff = d;
      best = size;
    }
  }
  return diff <= presetRadius(plan, 'S') * 0.08 ? best : null;
}

export const clampRadius = (plan, r) => {
  const { min, max } = markerBounds(plan);
  return round1(clamp(Number(r) || 0, min, max));
};

/** Font size (px) of a number inside a circle of radius rPx: the text takes ≤ 76 % of the diameter. 0 when unreadable. */
export function markerFont(text, rPx) {
  const em = textWidth(text, 1) || 0.6;
  const px = Math.min(rPx * 0.98, (rPx * 2 * 0.76) / em, 22);
  return px >= MARKER_FONT_MIN ? Math.floor(px * 2) / 2 : 0;
}

/** The smallest radius (px) whose circle holds the text at the minimal readable size. */
export function radiusForText(text) {
  const em = textWidth(text, 1) || 0.6;
  return Math.max(MARKER_FONT_MIN / 0.98, (MARKER_FONT_MIN * em) / (2 * 0.76));
}

/** Nearest neighbour distance of every point (same units), by a grid of `cell`; Infinity beyond one cell. */
function nearestDistances(points, cell) {
  const grid = new Map();
  const key = (cx, cy) => `${cx}:${cy}`;
  points.forEach((p, index) => {
    const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(index);
  });
  return points.map((p, index) => {
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of grid.get(key(cx + dx, cy + dy)) || []) {
          if (other === index) continue;
          const d = Math.hypot(points[other][0] - p[0], points[other][1] - p[1]);
          if (d < best) best = d;
        }
      }
    }
    return best;
  });
}

/**
 * Markers of a plan at zoom `k` (screen px per plan unit).
 * items: [{ id, x, y, r, text }] in plan units. mode: 'auto' | 'always' | 'hide'.
 * Returns [{ id, x, y, rPx, px, dot, hitPx }]: x, y in plan units, the rest in
 * screen px; px = 0 means no number (a dot).
 *
 * Markers are explicit placements, so none is ever hidden or moved: the size
 * follows the plan (r × k) within MARKER_MIN_PX..MARKER_MAX_PX, and when two
 * markers would touch each one shrinks to half the gap ('auto'). A marker too
 * small for a readable number becomes a dot (the number stays in the tooltip
 * and the card). 'always' keeps every number (neighbours may overlap a
 * little), 'hide' draws dots only. The tap target is never below 24 px.
 */
export function layoutMarkers(items, k, mode = 'auto') {
  const list = (items || []).filter((item) => Number.isFinite(item?.x) && Number.isFinite(item?.y));
  if (!k || !list.length) return [];
  const screen = list.map((item) => [item.x * k, item.y * k]);
  const near = mode === 'hide' ? list.map(() => Infinity) : nearestDistances(screen, MARKER_MAX_PX * 2 + 2);
  return list.map((item, index) => {
    const text = String(item.text ?? '');
    const base = clamp((Number(item.r) || 0) * k, MARKER_MIN_PX, MARKER_MAX_PX);
    const room = Number.isFinite(near[index]) ? near[index] / 2 - 1 : Infinity;
    let rPx;
    let px;
    if (mode === 'hide' || !text) {
      rPx = mode === 'hide' ? MARKER_DOT_PX + 1 : Math.min(base, Math.max(room, MARKER_DOT_PX));
      px = 0;
    } else if (mode === 'always') {
      rPx = Math.max(Math.min(base, room), radiusForText(text));
      px = markerFont(text, rPx);
    } else {
      rPx = Math.min(base, room);
      px = markerFont(text, rPx);
      if (!px) rPx = clamp(rPx, MARKER_DOT_PX, MARKER_DOT_PX + 2);
    }
    rPx = Math.round(rPx * 10) / 10;
    return { id: item.id, x: item.x, y: item.y, rPx, px, dot: !px, hitPx: Math.max(rPx, MARKER_HIT_PX) };
  });
}

/**
 * Which marker a tap at plan point (x, y) means: the one with the nearest
 * centre among those whose tap circle covers the point (neighbouring tap
 * circles overlap on a phone; the nearest centre wins, not the top-most).
 */
export function pickMarker(layout, x, y, k) {
  let best = null;
  let bestD = Infinity;
  for (const item of layout || []) {
    const d = Math.hypot(item.x - x, item.y - y) * k;
    if (d <= item.hitPx && d < bestD) {
      best = item.id;
      bestD = d;
    }
  }
  return best;
}

/** Screen boxes of laid-out markers (obstacles for the contour numbers in plan/labels.js), in px. */
export const markerBoxes = (layout, k) => (layout || []).map((item) => ({ x: item.x * k - item.rPx, y: item.y * k - item.rPx, w: item.rPx * 2, h: item.rPx * 2 }));

/**
 * Ring segments of a building with many units, by sales status: free first
 * from 12 o'clock, then the order given. counts: { status: n }. Returns
 * [{ status, from, to }] in percent of the circle (0..100), empty without units.
 */
export function ringSegments(counts, order) {
  const keys = ['free', ...(order || []).filter((key) => key !== 'free')];
  const total = keys.reduce((sum, key) => sum + (Number(counts?.[key]) || 0), 0);
  if (!total) return [];
  const out = [];
  let at = 0;
  for (const key of keys) {
    const n = Number(counts?.[key]) || 0;
    if (!n) continue;
    const share = (n / total) * 100;
    out.push({ status: key, from: round1(at), to: round1(at + share) });
    at += share;
  }
  if (out.length) out[out.length - 1].to = 100;
  return out;
}

function rgbOf(color) {
  const value = String(color || '').trim();
  const hex = value.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) return hex.split('').map((c) => parseInt(c + c, 16));
  if (/^[0-9a-f]{6}$/i.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const m = value.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Relative luminance (WCAG) of a hex / rgb() colour, null when unknown. */
export function luminance(color) {
  const rgb = rgbOf(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Text colour on a marker: white (with a soft dark outline, as the badges of
 * contours) on the saturated status colours, ink on light fills (pale grey of
 * a zero readiness, light type colours).
 */
export function readableText(fill) {
  const lum = luminance(fill);
  return lum !== null && lum > 0.55 ? '#0f172a' : '#fff';
}

/** A point marker from a contour: its centroid, a radius ≈ half its smaller side (within the plan's bounds). */
export function markerFromContour(points, plan) {
  const [x, y] = centroidOf(points);
  const box = bbox(points);
  return { x: round1(clamp(x, 0, plan.width)), y: round1(clamp(y, 0, plan.height)), r: clampRadius(plan, Math.min(box.w, box.h) * 0.45) };
}

/** A starting contour from a marker (to adjust in the contour editor): the square around the circle. */
export function contourFromMarker(marker) {
  const h = round1(marker.r * 1.15);
  const { x, y } = marker;
  return [[round1(x - h), round1(y - h)], [round1(x + h), round1(y - h)], [round1(x + h), round1(y + h)], [round1(x - h), round1(y + h)]];
}

/**
 * Snaps a dragged point to the x / y of other markers within `tol` (plan
 * units): a row of houses lines up by itself. Returns { x, y, guideX, guideY }
 * (guide = the coordinate snapped to, or null).
 */
export function snapPoint([x, y], others, tol) {
  let guideX = null;
  let guideY = null;
  let dx = tol;
  let dy = tol;
  for (const other of others || []) {
    if (Math.abs(other.x - x) <= dx) {
      dx = Math.abs(other.x - x);
      guideX = other.x;
    }
    if (Math.abs(other.y - y) <= dy) {
      dy = Math.abs(other.y - y);
      guideY = other.y;
    }
  }
  return { x: guideX ?? round1(x), y: guideY ?? round1(y), guideX, guideY };
}

/** The next object to place after `currentId` in list order (wrapping around), skipping placed ones; null when all are placed. */
export function nextUnplaced(list, placed, currentId) {
  if (!list?.length) return null;
  const start = list.findIndex((node) => node.id === currentId);
  for (let step = 1; step <= list.length; step += 1) {
    const node = list[(start + step + list.length) % list.length];
    if (!placed.has(node.id) && node.id !== currentId) return node;
  }
  return null;
}
