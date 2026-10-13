import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKER_SIZE_SHARE as SERVER_SHARE, cleanMarker, markerBounds, presetRadius } from '../modules/masterplan/markers.js';
// The plan's marker helpers are a pure frontend module; tested here with the rest of the module.
import {
  MARKER_DOT_PX,
  MARKER_HIT_PX,
  MARKER_MAX_PX,
  MARKER_MIN_PX,
  MARKER_SIZE_SHARE as CLIENT_SHARE,
  clampRadius,
  contourFromMarker,
  layoutMarkers,
  markerBoxes,
  markerFont,
  markerFromContour,
  nextUnplaced,
  pickMarker,
  presetRadius as clientPreset,
  readableText,
  ringSegments,
  sizeOf,
  snapPoint,
} from '../../frontend/src/modules/masterplan/plan/markers.js';
import { layoutLabels } from '../../frontend/src/modules/masterplan/plan/labels.js';

const WH = { width: 3350, height: 2000 };

// ── Server validation ───────────────────────────────────────────────────────

test('marker: a centre on the plan, rounded to 0.1; default size M', () => {
  assert.deepEqual(cleanMarker({ x: 100.04, y: 200.06 }, WH), { x: 100, y: 200.1, r: 26.8, label: null });
  assert.deepEqual(cleanMarker({ x: 0, y: 0, r: 30 }, WH), { x: 0, y: 0, r: 30, label: null });
  assert.deepEqual(cleanMarker({ x: 3350, y: 2000, r: 30 }, WH), { x: 3350, y: 2000, r: 30, label: null });
  assert.equal(cleanMarker({ x: -0.1, y: 10 }, WH), null);
  assert.equal(cleanMarker({ x: 10, y: 2000.1 }, WH), null);
  assert.equal(cleanMarker({ x: 3351, y: 10 }, WH), null);
  assert.equal(cleanMarker({ x: 'a', y: 10 }, WH), null);
  assert.equal(cleanMarker({ x: null, y: 10 }, WH), null);
  assert.equal(cleanMarker({ x: '', y: 10 }, WH), null);
  assert.equal(cleanMarker({ y: 10 }, WH), null);
  assert.equal(cleanMarker({ x: Infinity, y: 10 }, WH), null);
  assert.equal(cleanMarker(null, WH), null);
  assert.equal(cleanMarker({ x: 1, y: 1 }, null), null);
});

test('marker: radius within the plan bounds or a preset name', () => {
  const bounds = markerBounds(WH);
  assert.deepEqual(bounds, { min: 6.7, max: 268, side: 3350 });
  assert.equal(cleanMarker({ x: 10, y: 10, r: 6.6 }, WH), null);
  assert.equal(cleanMarker({ x: 10, y: 10, r: 268.1 }, WH), null);
  assert.equal(cleanMarker({ x: 10, y: 10, r: 268 }, WH).r, 268);
  assert.equal(cleanMarker({ x: 10, y: 10, r: -5 }, WH), null);
  assert.equal(cleanMarker({ x: 10, y: 10, r: 'huge' }, WH), null);
  assert.equal(cleanMarker({ x: 10, y: 10, r: 'S' }, WH).r, 18.4);
  assert.equal(cleanMarker({ x: 10, y: 10, r: 'L' }, WH).r, 38.5);
  assert.equal(cleanMarker({ x: 10, y: 10, size: 'L' }, WH).r, 38.5);
  assert.equal(presetRadius(WH, 'M'), 26.8);
  // A small plan still allows a 2-unit point.
  assert.equal(markerBounds({ width: 400, height: 300 }).min, 2);
});

test('marker: optional label up to 12 characters', () => {
  assert.equal(cleanMarker({ x: 1, y: 1, label: '  14а ' }, WH).label, '14а');
  assert.equal(cleanMarker({ x: 1, y: 1, label: '' }, WH).label, null);
  assert.equal(cleanMarker({ x: 1, y: 1, label: 7 }, WH).label, '7');
  assert.equal(cleanMarker({ x: 1, y: 1, label: 'Апарт-корпус 40' }, WH).label, 'Апарт-корпус');
  assert.equal(cleanMarker({ x: 1, y: 1, label: { evil: 1 } }, WH), null);
  assert.equal(cleanMarker({ x: 1, y: 1, label: 'a\u0000b' }, WH).label, 'ab');
});

test('marker sizes: the client presets are the server presets', () => {
  assert.deepEqual(CLIENT_SHARE, SERVER_SHARE);
  for (const size of ['S', 'M', 'L']) assert.equal(clientPreset(WH, size), presetRadius(WH, size));
  assert.equal(sizeOf(WH, 26.8), 'M');
  assert.equal(sizeOf(WH, 18.4), 'S');
  assert.equal(sizeOf(WH, 22.6), null, 'between presets — a custom size');
  assert.equal(clampRadius(WH, 1), 6.7);
  assert.equal(clampRadius(WH, 9999), 268);
});

// ── Layout on screen ────────────────────────────────────────────────────────

test('layout: size follows the plan within readable bounds; tap target ≥ 24 px', () => {
  const [far] = layoutMarkers([{ id: 1, x: 100, y: 100, r: 26.8, text: '23' }], 0.32);
  assert.equal(far.rPx, MARKER_MIN_PX, 'at the fit zoom a point is not smaller than 11 px');
  assert.ok(far.px >= 9);
  assert.equal(far.dot, false);
  assert.equal(far.hitPx, MARKER_HIT_PX);
  const [mid] = layoutMarkers([{ id: 1, x: 100, y: 100, r: 26.8, text: '23' }], 1);
  assert.equal(mid.rPx, 26.8);
  assert.ok(mid.hitPx >= 24 / 2);
  const [near] = layoutMarkers([{ id: 1, x: 100, y: 100, r: 26.8, text: '23' }], 10);
  assert.equal(near.rPx, MARKER_MAX_PX, 'a pin, not a blob');
});

test('layout: touching neighbours shrink to half the gap, too small → a dot; never hidden', () => {
  // A street of houses 30 plan units apart, at the fit zoom (0.32): 9.6 px between centres.
  const street = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, x: 100 + i * 30, y: 500, r: 26.8, text: String(i + 1).padStart(2, '0') }));
  const auto = layoutMarkers(street, 0.32);
  assert.equal(auto.length, 10, 'every point stays');
  for (const item of auto) {
    assert.equal(item.dot, true);
    assert.ok(item.rPx >= MARKER_DOT_PX && item.rPx <= MARKER_DOT_PX + 2);
  }
  // Zoomed in (k = 1): 30 px between centres → each gets 14 px, enough for the number; no overlap.
  const closer = layoutMarkers(street, 1);
  for (const item of closer) {
    assert.equal(item.dot, false);
    assert.equal(item.rPx, 14);
  }
  for (let i = 1; i < closer.length; i += 1) assert.ok(closer[i].x - closer[i - 1].x >= closer[i].rPx + closer[i - 1].rPx);
  // 'always' keeps the numbers (may overlap), 'hide' draws dots only.
  for (const item of layoutMarkers(street, 0.32, 'always')) assert.ok(item.px >= 9);
  for (const item of layoutMarkers(street, 5, 'hide')) assert.deepEqual([item.dot, item.px, item.rPx], [true, 0, MARKER_DOT_PX + 1]);
  assert.deepEqual(layoutMarkers([], 1), []);
  assert.deepEqual(layoutMarkers(street, 0), []);
});

test('layout: font fits the circle; long labels get smaller', () => {
  assert.equal(markerFont('7', 11), 10.5);
  assert.ok(markerFont('123', 14) < markerFont('12', 14));
  assert.equal(markerFont('Блок 12', 11), 0, 'unreadable → no text');
  assert.ok(markerFont('Блок 12', 30) >= 9);
});

test('tap: the nearest centre wins among overlapping tap circles', () => {
  const layout = layoutMarkers([{ id: 1, x: 100, y: 100, r: 10, text: '1' }, { id: 2, x: 110, y: 100, r: 10, text: '2' }], 1);
  assert.equal(pickMarker(layout, 103, 100, 1), 1);
  assert.equal(pickMarker(layout, 108, 101, 1), 2);
  assert.equal(pickMarker(layout, 160, 100, 1), null);
  // On a phone at a small zoom the 24 px target is bigger than the dot.
  const small = layoutMarkers([{ id: 5, x: 100, y: 100, r: 10, text: '5' }], 0.2);
  assert.equal(pickMarker(small, 100 + 11 / 0.2, 100, 0.2), 5);
});

test('contour numbers give way to points (obstacles)', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const items = [{ id: 1, points: square, text: '1' }];
  assert.equal(layoutLabels(items, 1, 'auto').length, 1);
  const layout = layoutMarkers([{ id: 2, x: 5, y: 5, r: 10, text: '2' }], 1);
  assert.equal(layoutLabels(items, 1, 'auto', markerBoxes(layout, 1)).length, 0);
  assert.equal(layoutLabels(items, 1, 'always', markerBoxes(layout, 1)).length, 1);
});

// ── Colours and shapes ──────────────────────────────────────────────────────

test('ring of a building: free first, then by status order, sums to 100 %', () => {
  const order = ['not_for_sale', 'free', 'reserve', 'booking', 'deposit', 'contract', 'sold', 'handed'];
  const ring = ringSegments({ free: 30, reserve: 6, sold: 6, not_for_sale: 0 }, order);
  assert.deepEqual(ring, [
    { status: 'free', from: 0, to: 71.4 },
    { status: 'reserve', from: 71.4, to: 85.7 },
    { status: 'sold', from: 85.7, to: 100 },
  ]);
  assert.deepEqual(ringSegments({}, order), []);
  assert.deepEqual(ringSegments({ sold: 3 }, order), [{ status: 'sold', from: 0, to: 100 }]);
});

test('number colour: white on status colours, ink on light fills', () => {
  for (const color of ['#22C55E', '#EAB308', '#F97316', '#8B5CF6', '#3B82F6', '#EF4444', '#7F1D1D', '#94A3B8', 'rgb(22, 163, 74)']) assert.equal(readableText(color), '#fff', color);
  for (const color of ['#CBD5E1', '#fff', 'rgb(250, 250, 210)']) assert.equal(readableText(color), '#0f172a', color);
  assert.equal(readableText('transparent'), '#fff');
});

test('contour ↔ point', () => {
  const house = [[2895.1, 1618.5], [2803.8, 1605.4], [2811.2, 1553.1], [2902.6, 1566.2]];
  const marker = markerFromContour(house, WH);
  assert.ok(Math.abs(marker.x - 2853.2) < 1 && Math.abs(marker.y - 1585.8) < 1);
  assert.ok(marker.r >= 20 && marker.r <= 30, `r ${marker.r}`);
  const square = contourFromMarker({ x: 100, y: 100, r: 20 });
  assert.deepEqual(square, [[77, 77], [123, 77], [123, 123], [77, 123]]);
  // Near the edge the point stays on the plan.
  const edge = markerFromContour([[-10, -10], [10, -10], [10, 10], [-10, 10]], WH);
  assert.ok(edge.x >= 0 && edge.y >= 0);
});

test('snapping to the line of neighbours', () => {
  const others = [{ x: 100, y: 500 }, { x: 300, y: 200 }];
  assert.deepEqual(snapPoint([103, 300], others, 5), { x: 100, y: 300, guideX: 100, guideY: null });
  assert.deepEqual(snapPoint([200, 498], others, 5), { x: 200, y: 500, guideX: null, guideY: 500 });
  assert.deepEqual(snapPoint([150.04, 350], others, 5), { x: 150, y: 350, guideX: null, guideY: null });
});

test('place next: the next unplaced object in list order, wrapping around', () => {
  const list = [1, 2, 3, 4, 5].map((id) => ({ id }));
  assert.equal(nextUnplaced(list, new Set([1, 2]), 2).id, 3);
  assert.equal(nextUnplaced(list, new Set([1, 2, 3, 5]), 5).id, 4);
  assert.equal(nextUnplaced(list, new Set([1, 2, 3, 4, 5]), 5), null);
  assert.equal(nextUnplaced(list, new Set(), null).id, 1);
  assert.equal(nextUnplaced([], new Set(), null), null);
});
