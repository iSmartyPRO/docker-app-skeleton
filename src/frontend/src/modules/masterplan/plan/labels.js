/*
 * Numbers on the site plan (docs/masterplan.md "Numbers on the plan").
 * Pure geometry, no React: for the current zoom decide for every contour
 * whether its number fits inside as text (font 9–14 px by the contour's size
 * on screen), or becomes a round badge at its centre; in "auto" a badge that
 * would cover another label is hidden (the lower one loses). Unit-tested from
 * the backend suite (test/masterplan-plan.test.js).
 */

export const LABEL_MIN_PX = 9;
export const LABEL_MAX_PX = 14;
export const LABEL_MODES = ['auto', 'always', 'hide'];

/** Width of a bold label in px: digits ≈ 0.6 em, letters a bit wider, the rest narrow. */
export function textWidth(text, px) {
  let em = 0;
  for (const ch of String(text ?? '')) em += /[0-9]/.test(ch) ? 0.6 : /[A-ZА-ЯЁ]/.test(ch) ? 0.72 : /[a-zа-яё]/.test(ch) ? 0.6 : 0.36;
  return em * px;
}

export function polygonArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function bbox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Area-weighted centroid (the label's anchor); the box centre for degenerate polygons. */
export function centroidOf(points) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const box = bbox(points);
    return [box.x + box.w / 2, box.y + box.h / 2];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPolygon([x, y], points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is a w × h rectangle centred at (cx, cy) inside the polygon (corners and edge midpoints)? */
export function rectInside(cx, cy, w, h, points) {
  const hw = w / 2;
  const hh = h / 2;
  const probes = [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh], [cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]];
  return probes.every((p) => pointInPolygon(p, points));
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * How one contour's number is drawn at zoom `k` (screen px per plan unit):
 * { kind: 'text', px } when the text fits inside the contour on screen,
 * else { kind: 'badge', px, r } — a circle of radius r (screen px).
 * The font follows the contour's smaller on-screen side, 9..14 px.
 */
export function fitLabel(points, text, k) {
  const screen = points.map(([x, y]) => [x * k, y * k]);
  const box = bbox(screen);
  const [cx, cy] = centroidOf(screen);
  const start = clamp(Math.floor(Math.min(box.w, box.h) * 0.42), LABEL_MIN_PX, LABEL_MAX_PX);
  for (let px = start; px >= LABEL_MIN_PX; px -= 1) {
    // A little air around the glyphs: the white outline is ~3 px wide.
    if (rectInside(cx, cy, textWidth(text, px) + 2, px * 0.92, screen)) return { kind: 'text', px };
  }
  const px = LABEL_MIN_PX + 1;
  return { kind: 'badge', px, r: Math.max(px * 0.95, textWidth(text, px) / 2 + 3.5) };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Labels of a plan at zoom `k`. items: [{ id, points, text }] in drawing
 * order (later = on top). mode: 'auto' | 'always' | 'hide'.
 * Returns [{ id, kind, x, y, px, r? }] with x, y in plan coordinates (the
 * contour's centroid) and px / r in screen px.
 *
 * Text labels lie inside their own contours, so they are placed first. Badges
 * stick out of small contours: in 'auto' they are placed from the top of the
 * drawing down and a badge that would cover a placed label is dropped (the
 * lower one is hidden); in 'always' every badge stays.
 */
export function layoutLabels(items, k, mode = 'auto') {
  if (mode === 'hide' || !k) return [];
  const placed = [];
  const boxes = [];
  const fits = (items || []).filter((item) => item.text && item.points?.length >= 3).map((item, order) => {
    const fit = fitLabel(item.points, item.text, k);
    const [x, y] = centroidOf(item.points);
    return { ...fit, id: item.id, x, y, order, text: item.text };
  });
  for (const fit of fits.filter((item) => item.kind === 'text')) {
    const w = textWidth(fit.text, fit.px) + 2;
    const box = { x: fit.x * k - w / 2, y: fit.y * k - fit.px / 2, w, h: fit.px };
    if (mode === 'auto' && boxes.some((other) => overlaps(box, other))) continue;
    boxes.push(box);
    placed.push(fit);
  }
  const badges = fits.filter((item) => item.kind === 'badge').sort((a, b) => b.order - a.order);
  for (const fit of badges) {
    const box = { x: fit.x * k - fit.r, y: fit.y * k - fit.r, w: fit.r * 2, h: fit.r * 2 };
    if (mode === 'auto' && boxes.some((other) => overlaps(box, other))) continue;
    boxes.push(box);
    placed.push(fit);
  }
  return placed.map(({ order, text, ...rest }) => rest);
}

// ── Contours drawn around other contours (sectors) ──────────────────────────

/** Convex hull (monotone chain), counter-clockwise, without repeated points. */
export function convexHull(points) {
  const list = [...new Map(points.map(([x, y]) => [`${x},${y}`, [x, y]])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (list.length < 3) return list;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of list) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of [...list].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * A contour around a group of contours (e.g. a sector around its houses):
 * the convex hull of their points pushed `margin` outwards from its centre,
 * rounded to 0.1. Sectors may overlap where they meet — that is allowed.
 */
export function contourAround(contours, margin = 0) {
  const hull = convexHull(contours.flat());
  if (hull.length < 3) return null;
  const [cx, cy] = centroidOf(hull);
  return hull.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [Math.round((x + ((x - cx) / d) * margin) * 10) / 10, Math.round((y + ((y - cy) / d) * margin) * 10) / 10];
  });
}
