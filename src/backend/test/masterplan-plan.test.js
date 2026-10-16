import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingAggregate, oldNumberLabel, parseOldNumber, seriesKeyOf } from '../modules/masterplan/buildings.js';
import { capsOf, projectUnit } from '../modules/masterplan/rules.js';
// The plan's label layout is a pure frontend module; tested here with the rest of the module.
import { contourAround, fitLabel, layoutLabels, pointInPolygon, textWidth } from '../../frontend/src/modules/masterplan/plan/labels.js';

// ── Old numbers ─────────────────────────────────────────────────────────────

test('old number: parsed from the descriptions of a real site-plan import', () => {
  assert.equal(parseOldNumber('Одноэтажный дом 96,72 м². На прежнем генплане продаж — №14.'), '14');
  assert.equal(parseOldNumber('Одноэтажный дом 96,72 м². На прежнем генплане продаж — №5. На генплане продаж от 06.10.2026 — «Бронь».'), '5');
  assert.equal(parseOldNumber('Трёхэтажные апартаменты, 23 юн. На прежнем генплане продаж — блок 1. Раскладка условная.'), 'блок 1');
  assert.equal(parseOldNumber('Здание ресепшн 543,04 м², не продаётся. На прежнем генплане продаж — №73.'), '73');
  assert.equal(parseOldNumber('Было: 7'), '7');
  assert.equal(parseOldNumber('было — №12а'), '12а');
  assert.equal(parseOldNumber('На старом генплане: корпус 3'), 'корпус 3');
});

test('old number: nothing without a number', () => {
  assert.equal(parseOldNumber('Здание ресепшн 248,16 м². На прежнем генплане продаж — без номера.'), null);
  assert.equal(parseOldNumber('Дом у озера'), null);
  assert.equal(parseOldNumber(''), null);
  assert.equal(parseOldNumber(null), null);
  // "На генплане продаж от 06.10.2026 — «Бронь»" is not an old number.
  assert.equal(parseOldNumber('На генплане продаж от 06.10.2026 — «Бронь».'), null);
});

test('old number: label', () => {
  assert.equal(oldNumberLabel('14'), '№14');
  assert.equal(oldNumberLabel('блок 1'), 'блок 1');
  assert.equal(oldNumberLabel(''), null);
  assert.equal(oldNumberLabel(null), null);
});

// ── Series ──────────────────────────────────────────────────────────────────

test('series: explicit attribute first, else type · rooms · area of a unit', () => {
  assert.equal(seriesKeyOf({ attrs: { series: ' Одноэтажный дом 96,72 м² ' }, unit: { areaTotal: 96.72 }, type: { name: 'Коттедж' } }), 'Одноэтажный дом 96,72 м²');
  assert.equal(seriesKeyOf({ attrs: {}, unit: { areaTotal: 36.07, rooms: 1 }, type: { name: 'Апартаменты' } }), 'Апартаменты · 1-комн. · 36,07 м²');
  assert.equal(seriesKeyOf({ attrs: {}, unit: { areaTotal: 106.64, rooms: null }, type: { name: 'Апартаменты' } }), 'Апартаменты · 106,64 м²');
  // A building without the attribute, a unit without an area: no series.
  assert.equal(seriesKeyOf({ attrs: { floors: '3' }, unit: null, type: { name: 'Многоквартирный дом' } }), null);
  assert.equal(seriesKeyOf({ attrs: {}, unit: { areaTotal: null }, type: { name: 'Апартаменты' } }), null);
});

// ── Building aggregate ──────────────────────────────────────────────────────

const apt = (id, { rooms, area, status = 'free', price = null, floor = 1, number, finishing = null, paymentForms = [], minPrice = null, manager = null }) => ({
  id,
  code: `23-${number ?? id}`,
  type: { id: 8, name: 'Апартаменты' },
  unit: { status, price, currency: price === null ? 'USD' : 'USD', pricePerM2: price && area ? Math.round((price / area) * 100) / 100 : null, areaTotal: area, rooms, floor, number: String(number ?? id), finishing, paymentForms, minPrice, manager, version: 1 },
});

const building23 = [
  apt(1, { rooms: 3, area: 106.64, price: 213280, floor: 1, number: 101, finishing: 'whitebox', paymentForms: ['full'] }),
  apt(2, { rooms: 1, area: 36.07, price: 72140, floor: 1, number: 102, paymentForms: ['full', 'installment'] }),
  apt(3, { rooms: 1, area: 36.07, price: 70000, floor: 2, number: 202, status: 'reserve', manager: { id: 7 } }),
  apt(4, { rooms: 1, area: 36.07, price: 71000, floor: 3, number: 302 }),
  apt(5, { rooms: 3, area: 106.64, price: 220000, floor: 3, number: 301, status: 'sold' }),
  apt(6, { rooms: 3, area: 106.64, price: 215000, floor: 2, number: 201 }),
];

const visible = (nodes, caps, presentation = false) => nodes.map((node) => ({ ...node, unit: projectUnit(node.unit, { caps, userId: 1, presentation }) }));

test('building aggregate: free of total, price ranges of the free units, composition by rooms', () => {
  const caps = capsOf(new Set(['sales']));
  const agg = buildingAggregate(visible(building23, caps), caps);
  assert.equal(agg.total, 6);
  assert.equal(agg.free, 4);
  assert.deepEqual(agg.byStatus, { free: 4, reserve: 1, sold: 1 });
  assert.equal(agg.currency, 'USD');
  // Only the free ones: 71 000 … 215 000 (the reserved 70 000 and the sold 220 000 are out).
  assert.deepEqual(agg.price, { min: 71000, max: 215000 });
  assert.deepEqual(agg.ppm, { min: 1968, max: 2016 });
  assert.equal(agg.area, Math.round((106.64 * 3 + 36.07 * 3) * 100) / 100);
  assert.equal(agg.freeArea, Math.round((106.64 * 2 + 36.07 * 2) * 100) / 100);
  assert.deepEqual(agg.floors, [1, 2, 3]);
  assert.deepEqual(agg.finishing, ['whitebox']);
  assert.deepEqual(agg.paymentForms.sort(), ['full', 'installment']);
  assert.equal(agg.prices, true);
  assert.deepEqual(agg.composition.map((row) => [row.rooms, row.total, row.free, row.priceFrom]), [[1, 3, 2, 71000], [3, 3, 2, 213280]]);
  // The first free unit of a row: the lowest floor first (one-click reserve from the card).
  assert.deepEqual(agg.composition[1].freeIds, [1, 6]);
  assert.deepEqual(agg.composition[0].area, { min: 36.07, max: 36.07 });
});

test('building aggregate: hidden prices and statuses never leak', () => {
  // A foreman sees neither statuses nor prices.
  const foreman = capsOf(new Set(['foreman']));
  const agg = buildingAggregate(visible(building23, foreman), foreman);
  assert.equal(agg.total, 6);
  assert.equal(agg.free, null);
  assert.equal(agg.byStatus, null);
  assert.equal(agg.freeArea, null);
  assert.equal(agg.price, null);
  assert.equal(agg.ppm, null);
  assert.equal(agg.currency, null);
  assert.equal(agg.prices, false);
  assert.deepEqual(agg.paymentForms, []);
  for (const row of agg.composition) {
    assert.equal(row.free, null);
    assert.equal(row.freeIds, null);
    assert.equal(row.priceFrom, null);
  }
  // Head of construction: statuses yes, prices no.
  const build = capsOf(new Set(['construction_head']));
  const agg2 = buildingAggregate(visible(building23, build), build);
  assert.equal(agg2.free, 4);
  assert.equal(agg2.price, null);
  assert.ok(agg2.composition.every((row) => row.priceFrom === null));
  // Even if a caller forgot field hiding, the caps alone keep prices out.
  const agg3 = buildingAggregate(building23, build);
  assert.equal(agg3.price, null);
  assert.equal(agg3.ppm, null);
});

test('building aggregate: presentation mode keeps public prices, drops nothing else into it', () => {
  const caps = capsOf(new Set(['sales_head']));
  const agg = buildingAggregate(visible(building23, caps, true), caps);
  assert.deepEqual(agg.price, { min: 71000, max: 215000 });
  assert.equal(JSON.stringify(agg).includes('minPrice'), false);
  assert.equal(JSON.stringify(agg).includes('manager'), false);
});

test('building aggregate: no prices yet, mixed currencies, rows without rooms', () => {
  const caps = capsOf(new Set(['admin']));
  const noPrices = buildingAggregate([apt(1, { rooms: 1, area: 36 }), apt(2, { rooms: 2, area: 71 })], caps);
  assert.equal(noPrices.price, null);
  assert.equal(noPrices.prices, true);
  assert.equal(noPrices.free, 2);
  const mixed = [apt(1, { rooms: 1, area: 36, price: 100 }), apt(2, { rooms: 1, area: 36, price: 90 }), { ...apt(3, { rooms: 1, area: 36, price: 5 }), unit: { ...apt(3, { rooms: 1, area: 36, price: 5 }).unit, currency: 'KGS' } }];
  const agg = buildingAggregate(mixed, caps);
  assert.equal(agg.currency, 'USD');
  assert.deepEqual(agg.price, { min: 90, max: 100 });
  const shop = { id: 9, type: { id: 11, name: 'Коммерческое помещение' }, unit: { status: 'free', areaTotal: 50, rooms: null, floor: 1 } };
  const agg2 = buildingAggregate([apt(1, { rooms: 1, area: 36 }), shop], caps);
  assert.deepEqual(agg2.composition.map((row) => [row.rooms, row.typeName]), [[1, 'Апартаменты'], [null, 'Коммерческое помещение']]);
  assert.equal(buildingAggregate([], caps).total, 0);
});

// ── Numbers on the plan ─────────────────────────────────────────────────────

// Rotated rectangles like the houses of a cottage village (plan units), around (cx, cy).
const house = (cx, cy, w = 96, h = 54, angle = 0.14) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
};

test('labels: text width by length, point in polygon', () => {
  assert.ok(textWidth('07', 10) < textWidth('107', 10));
  assert.ok(Math.abs(textWidth('07', 11) - 13.2) < 0.01);
  assert.equal(pointInPolygon([0, 0], house(0, 0)), true);
  assert.equal(pointInPolygon([200, 0], house(0, 0)), false);
});

test('labels: fit by the text, not by a fixed 34 × 16 box; font 9–14 px by size', () => {
  // A 96.72 m² house at the overview zoom is ~30 × 17 px: "07" fits as text.
  const small = fitLabel(house(0, 0), '07', 0.31);
  assert.equal(small.kind, 'text');
  assert.equal(small.px, 9);
  // Zoomed in: bigger font, capped at 14.
  assert.equal(fitLabel(house(0, 0), '07', 3).px, 14);
  const mid = fitLabel(house(0, 0), '07', 0.6);
  assert.ok(mid.px > 9 && mid.px <= 14);
  // Too small for the text: a badge (a circle wide enough for the number).
  const tiny = fitLabel(house(0, 0), '107', 0.12);
  assert.equal(tiny.kind, 'badge');
  assert.ok(tiny.r >= textWidth('107', tiny.px) / 2);
});

test('labels: overlapping badges — the lower one is hidden in auto, kept in always', () => {
  const items = [
    { id: 1, points: house(0, 0), text: '41' },
    { id: 2, points: house(20, 0), text: '42' }, // drawn later = on top
    { id: 3, points: house(400, 0), text: '43' },
  ];
  const auto = layoutLabels(items, 0.1, 'auto');
  assert.deepEqual(auto.map((item) => item.id).sort(), [2, 3]);
  assert.ok(auto.every((item) => item.kind === 'badge'));
  assert.equal(layoutLabels(items, 0.1, 'always').length, 3);
  assert.deepEqual(layoutLabels(items, 0.1, 'hide'), []);
  // Positions in plan coordinates at the contour's centre.
  const three = auto.find((item) => item.id === 3);
  assert.ok(Math.abs(three.x - 400) < 1e-6 && Math.abs(three.y) < 1e-6);
});

test('labels: a row of houses at the overview zoom — every number shown, none overlapping', () => {
  // 20 houses 100 plan units apart (like a village street) at k = 0.31.
  const items = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, points: house(i * 100, 0, 74, 76, 0.05), text: String(i + 24) }));
  const k = 0.31;
  const out = layoutLabels(items, k, 'auto');
  assert.equal(out.length, 20);
  const boxes = out.map((item) => {
    const w = item.kind === 'text' ? textWidth(String(item.id + 23), item.px) : item.r * 2;
    const h = item.kind === 'text' ? item.px : item.r * 2;
    return { x: item.x * k - w / 2, y: item.y * k - h / 2, w, h };
  });
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `labels ${i} and ${j} overlap`);
    }
  }
});

test('contours: a sector around its houses contains them all', () => {
  const houses = [house(0, 0), house(150, 40), house(60, 200)];
  const around = contourAround(houses, 10);
  assert.ok(around.length >= 3);
  for (const points of houses) for (const point of points) assert.equal(pointInPolygon(point, around), true);
  assert.equal(contourAround([], 10), null);
});
