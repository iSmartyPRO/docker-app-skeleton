import { test } from 'node:test';
import assert from 'node:assert/strict';
// Pure frontend modules (no DOM): barcode encoders, label markup, wedge-scanner burst detection.
import {
  CODE128_PATTERNS,
  BarcodeError,
  buildLabelsHtml,
  code128Checksum,
  code128Values,
  code128Widths,
  ean13Bits,
  ean13Checksum,
  expandCopies,
  isValidEan13,
  labelHtml,
  normalizeEan13,
  pageCount,
  renderBarcodeSVG,
  resolveLabelKind,
  setQrEncoder,
  truncate,
} from '../../frontend/src/lib/labels.js';
import { createBurstDetector, createRepeatGuard, isScanCharKey, normalizeFormat } from '../../frontend/src/lib/scanBurst.js';

// ── Code 128 ────────────────────────────────────────────────────────────────

test('code128: pattern table — 106 symbols of 11 modules, stop of 13', () => {
  assert.equal(CODE128_PATTERNS.length, 107);
  CODE128_PATTERNS.forEach((p, k) => {
    const sum = p.split('').reduce((a, b) => a + Number(b), 0);
    assert.equal(sum, k === 106 ? 13 : 11, `symbol ${k}`);
  });
  assert.equal(new Set(CODE128_PATTERNS).size, 107, 'patterns are unique');
});

test('code128: all digits, even length → subset C from the start', () => {
  // 105 + 12·1 + 34·2 + 56·3 = 353 → 353 mod 103 = 44
  assert.deepEqual(code128Values('123456'), [105, 12, 34, 56, 44, 106]);
  assert.deepEqual(code128Values('00'), [105, 0, 105 % 103, 106]);
});

test('code128: text → subset B', () => {
  // 104 + 33 + 34·2 + 35·3 = 310 → 1
  assert.deepEqual(code128Values('ABC'), [104, 33, 34, 35, 1, 106]);
  assert.deepEqual(code128Values('a b').slice(0, 4), [104, 65, 0, 66]);
});

test('code128: switches to C for a digit run at the end (odd run: one digit stays in B)', () => {
  const v = code128Values('AB1234567');
  assert.deepEqual(v.slice(0, -2), [104, 33, 34, 17, 99, 23, 45, 67]);
  assert.equal(v.at(-2), code128Checksum(v.slice(0, -2)));
  assert.equal(v.at(-1), 106);
});

test('code128: switches to C in the middle for 6+ digits and back to B', () => {
  const v = code128Values('X123456Y');
  assert.deepEqual(v.slice(0, -2), [104, 56, 99, 12, 34, 56, 100, 57]);
  // 4 digits in the middle stay in B (switching would not save anything).
  assert.deepEqual(code128Values('X1234Y').slice(0, -2), [104, 56, 17, 18, 19, 20, 57]);
});

test('code128: leading even digit run then text', () => {
  const v = code128Values('0012AB');
  assert.deepEqual(v.slice(0, -2), [105, 0, 12, 100, 33, 34]);
});

test('code128: odd number of digits only', () => {
  const v = code128Values('12345');
  // 5 digits: B for the first, C for the last four.
  assert.deepEqual(v.slice(0, -2), [104, 17, 99, 23, 45]);
});

test('code128: widths cover the whole symbol', () => {
  const values = code128Values('WH-000123');
  const widths = code128Widths('WH-000123');
  assert.equal(widths.reduce((a, b) => a + b, 0), (values.length - 1) * 11 + 13);
  assert.equal(widths.length % 2, 1, 'starts and ends with a bar');
});

test('code128: rejects what it cannot encode', () => {
  assert.throws(() => code128Values(''), (e) => e instanceof BarcodeError && e.code === 'empty');
  assert.throws(() => code128Values('Цемент'), (e) => e instanceof BarcodeError && e.code === 'charset');
  assert.throws(() => code128Values('a\nb'), (e) => e.code === 'charset');
});

// ── EAN-13 ──────────────────────────────────────────────────────────────────

test('ean13: check digit', () => {
  assert.equal(ean13Checksum('400638133393'), 1);
  assert.equal(ean13Checksum('590123412345'), 7);
  assert.equal(ean13Checksum('460000000000'), 8);
  assert.equal(ean13Checksum('000000000000'), 0);
  assert.throws(() => ean13Checksum('12345'), BarcodeError);
});

test('ean13: validation and normalization', () => {
  assert.equal(isValidEan13('4006381333931'), true);
  assert.equal(isValidEan13('4006381333932'), false);
  assert.equal(isValidEan13('400638133393'), false);
  assert.equal(normalizeEan13('590123412345'), '5901234123457');
  assert.equal(normalizeEan13('5901234123457'), '5901234123457');
  assert.equal(normalizeEan13(' 5901234 123457 '), '5901234123457');
  assert.throws(() => normalizeEan13('5901234123458'), (e) => e.code === 'checksum');
  assert.throws(() => normalizeEan13('ABC'), (e) => e.code === 'format');
});

test('ean13: 95 modules with guards; first digit sets the parity', () => {
  const bits = ean13Bits('4006381333931');
  assert.equal(bits.length, 95);
  assert.equal(bits.slice(0, 3), '101');
  assert.equal(bits.slice(45, 50), '01010');
  assert.equal(bits.slice(92), '101');
  // First digit 0 → all six left digits in odd parity (L): "0" = 0001101.
  assert.equal(ean13Bits('0000000000000').slice(3, 10), '0001101');
  // First digit 4 → LGLLGG: the 2nd left digit is G-coded ("0" in G = 0100111).
  assert.equal(bits.slice(10, 17), '0100111');
});

// ── SVG ─────────────────────────────────────────────────────────────────────

test('svg: code128 and ean13 render as crisp vector markup', () => {
  const svg = renderBarcodeSVG('WH-000123', 'code128', { height: 50, moduleSize: 2 });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 \d+ [\d.]+" width="\d+" height="50" shape-rendering="crispEdges"/);
  assert.match(svg, /<path d="M10 0h2v[\d.]+h-2z/, 'first bar after the 10-module quiet zone');
  const ean = renderBarcodeSVG('5901234123457', 'ean13');
  assert.match(ean, /<text /, 'digits under the bars');
  assert.ok(ean.includes('>5</tspan>') && ean.includes('>7</tspan>'));
  assert.throws(() => renderBarcodeSVG('5901234123458', 'ean13'), (e) => e.code === 'checksum');
  assert.throws(() => renderBarcodeSVG('x', 'pdf417'), (e) => e.code === 'kind');
  assert.ok(renderBarcodeSVG('ABC', 'code128', { fluid: true }).includes('preserveAspectRatio="none"'));
});

test('svg: code128 text is escaped', () => {
  const svg = renderBarcodeSVG('<a&b>', 'code128', { text: true });
  assert.ok(svg.includes('&lt;a&amp;b&gt;'));
  assert.ok(!svg.includes('<a&b>'));
});

test('svg: qr needs an encoder, then renders its modules', () => {
  setQrEncoder(null);
  assert.throws(() => renderBarcodeSVG('x', 'qr'), (e) => e.code === 'qr-not-loaded');
  // A 3×3 fake symbol: diagonal.
  setQrEncoder(() => ({ size: 3, get: (r, c) => r === c }));
  const svg = renderBarcodeSVG('x', 'qr', { moduleSize: 4, quiet: 1 });
  assert.match(svg, /viewBox="0 0 5 5" width="20" height="20"/);
  assert.ok(svg.includes('M1 1h1v1h-1z') && svg.includes('M3 3h1v1h-1z'));
});

// ── Labels ──────────────────────────────────────────────────────────────────

test('labels: kind resolution and fallbacks', () => {
  assert.deepEqual(resolveLabelKind({ code: '590123412345', kind: 'ean13' }), { kind: 'ean13', code: '5901234123457' });
  const bad = resolveLabelKind({ code: '5901234123458', kind: 'ean13' });
  assert.equal(bad.kind, 'code128');
  assert.equal(bad.fallback, 'ean13');
  const cyr = resolveLabelKind({ code: 'Ячейка-А1', kind: 'code128' });
  assert.equal(cyr.kind, 'qr');
  assert.equal(resolveLabelKind({ code: 'X', kind: 'nope' }).kind, 'qr');
});

test('labels: copies, pages, truncation', () => {
  const items = [{ code: 'A1' }, { code: 'B2', copies: 3 }];
  assert.equal(expandCopies(items, 2).length, 5);
  assert.equal(expandCopies(items).length, 4);
  assert.equal(pageCount(25, 'a4-3x8'), 2);
  assert.equal(pageCount(24, 'a4-3x8'), 1);
  assert.equal(pageCount(5, '58x40'), 5);
  assert.equal(truncate('  a   b  ', 10), 'a b');
  assert.equal(truncate('abcdefghij', 5), 'abcd…');
});

test('labels: print document — @page per format, escaping, A4 sheets of 24', () => {
  setQrEncoder(() => ({ size: 21, get: (r, c) => (r + c) % 2 === 0 }));
  const items = [
    { code: 'WH-1', title: '<script>alert(1)</script>', subtitle: 'Склад №1', kind: 'qr', extra: ['A-01', '12 шт.'] },
    { code: '4006381333931', title: 'Цемент М500', kind: 'ean13' },
    { code: 'TOOL-77', title: 'Перфоратор', kind: 'code128' },
  ];
  const thermal = buildLabelsHtml(items, { format: '58x40', copies: 2 });
  assert.ok(thermal.includes('@page{size:58mm 40mm;margin:0}'));
  assert.equal(thermal.match(/class="wl-page"/g).length, 6);
  assert.ok(!thermal.includes('<script>alert'));
  assert.ok(thermal.includes('&lt;script&gt;'));
  assert.ok(thermal.includes('A-01 · 12 шт.'));

  const big = buildLabelsHtml(items, { format: '80x50' });
  assert.ok(big.includes('@page{size:80mm 50mm;margin:0}'));

  const sheet = buildLabelsHtml(items, { format: 'a4-3x8', copies: 9 });
  assert.ok(sheet.includes('@page{size:210mm 297mm;margin:0}'));
  assert.equal(sheet.match(/class="wl-sheet"/g).length, 2, '27 labels → 2 sheets');
  assert.equal(sheet.match(/class="wl-label /g).length, 27);
  assert.ok(sheet.includes('grid-template-columns:repeat(3,63.5mm)'));

  const one = labelHtml({ code: 'X'.repeat(500), title: 'T'.repeat(500), kind: 'qr' });
  assert.ok(one.length < 20000);
  assert.ok(one.includes('…'));
});

// ── Keyboard-wedge burst detection ──────────────────────────────────────────

const typeAll = (detector, text, start, gap) => {
  let t = start;
  let out = null;
  for (const ch of text) {
    out = detector.push({ key: ch, time: t }) ?? out;
    t += gap;
  }
  return { out, t };
};

test('wedge: fast burst ended by Enter is a scan', () => {
  const d = createBurstDetector({ minLength: 4, maxInterval: 35 });
  const { t } = typeAll(d, '4006381333931', 1000, 8);
  assert.equal(d.push({ key: 'Enter', time: t + 5 }), '4006381333931');
  assert.equal(d.length, 0);
});

test('wedge: normal typing is not a scan', () => {
  const d = createBurstDetector({ minLength: 4, maxInterval: 35 });
  const { t } = typeAll(d, 'hello', 0, 140);
  assert.equal(d.push({ key: 'Enter', time: t }), null);
});

test('wedge: too short, too late Enter, modifier keys', () => {
  const d = createBurstDetector({ minLength: 4, maxInterval: 35 });
  let r = typeAll(d, 'abc', 0, 5);
  assert.equal(d.push({ key: 'Enter', time: r.t }), null, 'shorter than minLength');

  r = typeAll(d, 'abcdef', 1000, 5);
  assert.equal(d.push({ key: 'Enter', time: r.t + 1000 }), null, 'Enter long after the burst');

  r = typeAll(d, 'abcdef', 5000, 5);
  d.push({ key: 'c', time: r.t, ctrlKey: true });
  assert.equal(d.push({ key: 'Enter', time: r.t + 5 }), null, 'Ctrl+key breaks the burst');
});

test('wedge: a slow prefix is dropped, the fast tail counts; Shift does not break', () => {
  const d = createBurstDetector({ minLength: 4, maxInterval: 35 });
  d.push({ key: 'x', time: 0 });
  d.push({ key: 'y', time: 300 });
  let t = 900;
  for (const ch of 'WH-12') {
    if (ch >= 'A' && ch <= 'Z') d.push({ key: 'Shift', time: t });
    d.push({ key: ch, time: t });
    t += 10;
  }
  assert.equal(d.push({ key: 'NumpadEnter', time: t }), 'WH-12');
});

test('wedge: char keys, repeat guard, format names', () => {
  assert.equal(isScanCharKey({ key: 'a' }), true);
  assert.equal(isScanCharKey({ key: 'Enter' }), false);
  assert.equal(isScanCharKey({ key: 'a', metaKey: true }), false);

  const g = createRepeatGuard(1200);
  assert.equal(g.accept('A', 0), true);
  assert.equal(g.accept('A', 800), false);
  assert.equal(g.accept('A', 1900), false, 'still in view: the window slides');
  assert.equal(g.accept('B', 1950), true);
  assert.equal(g.accept('A', 3500), true);

  assert.equal(normalizeFormat('EAN-13'), 'ean_13');
  assert.equal(normalizeFormat('EAN13'), 'ean_13');
  assert.equal(normalizeFormat('QRCode'), 'qr_code');
  assert.equal(normalizeFormat('Data Matrix'), 'data_matrix');
  assert.equal(normalizeFormat('code_128'), 'code_128');
  assert.equal(normalizeFormat('Code 39'), 'code_39');
});
