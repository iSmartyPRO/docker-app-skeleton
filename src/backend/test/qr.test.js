import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLocks, cleanDesign, cleanLocks, DEFAULT_DESIGN } from '../modules/qr/design.js';
import { cleanContent, targetUrl } from '../modules/qr/content.js';
import { presetRows } from '../modules/qr/presets.js';

/*
 * QR codes (docs/qr.md): the design sanitizer and template locks, the content
 * whitelist, the payload encoders of the browser and the renderer.
 */

const encode = await import('../../frontend/src/modules/qr/engine/encode.js');
const render = await import('../../frontend/src/modules/qr/engine/render.js');

test('design: unknown keys go, values are whitelisted and clamped', () => {
  const design = cleanDesign({
    dots: { style: 'evil', color: 'red', gradient: { type: 'conic', from: '#00ff00', to: 'x', angle: 999 } },
    eyes: { frame: 'leaf', ball: 'nope', frameColor: '', ballColor: '@brand' },
    background: { color: '#abcdef', transparent: 1, radius: 90 },
    logo: { source: 'upload', file: '../../etc/passwd', size: 80, plate: 'circle', padding: -4 },
    frame: { style: 'card', text: '<script>Scan</script>\u0000 me', color: '#123456' },
    margin: 40,
    ecl: 'Z',
    extra: { x: 1 },
  });
  assert.equal(design.dots.style, DEFAULT_DESIGN.dots.style);
  assert.equal(design.dots.color, DEFAULT_DESIGN.dots.color);
  assert.deepEqual(design.dots.gradient, { type: 'linear', from: '#00FF00', to: DEFAULT_DESIGN.dots.color, angle: 360 });
  assert.equal(design.eyes.frame, 'leaf');
  assert.equal(design.eyes.ball, DEFAULT_DESIGN.eyes.ball);
  assert.equal(design.eyes.frameColor, null);
  assert.equal(design.eyes.ballColor, '@brand');
  assert.deepEqual(design.background, { color: '#ABCDEF', transparent: true, radius: 30 });
  assert.equal(design.logo.file, null, 'only random upload names');
  assert.equal(design.logo.size, 30);
  assert.equal(design.logo.padding, 0);
  assert.equal(design.frame.text, 'scriptScan/script me');
  assert.equal(design.margin, 8);
  assert.equal(design.ecl, 'auto');
  assert.equal(design.extra, undefined);
});

test('locks: locked groups come from the template, the rest stays', () => {
  const template = cleanDesign({ dots: { style: 'rounded', color: '@brand' }, logo: { source: 'brand' }, frame: { style: 'card', text: '' } });
  const mine = cleanDesign({ dots: { style: 'dots', color: '#FF0000' }, logo: { source: 'none' }, frame: { style: 'none' }, background: { color: '#000000' } });
  const locked = applyLocks(mine, template, cleanLocks({ colors: true, logo: true }));
  assert.equal(locked.dots.color, '@brand');
  assert.equal(locked.background.color, '#FFFFFF');
  assert.equal(locked.logo.source, 'brand');
  assert.equal(locked.dots.style, 'dots', 'shape is free');
  assert.equal(locked.frame.style, 'none', 'frame is free');
  const all = applyLocks(mine, template, {}, true);
  assert.deepEqual(all, template);
});

test('presets: valid designs, exactly one default, five languages', () => {
  const rows = presetRows();
  assert.ok(rows.length >= 8);
  assert.equal(rows.filter((row) => row.isDefault).length, 1);
  for (const row of rows) {
    assert.deepEqual(row.design, cleanDesign(row.design), row.key);
    for (const lang of ['ru', 'en', 'ky', 'tr', 'zh']) assert.ok(row.i18n[lang]?.name && row.i18n[lang]?.description, `${row.key} ${lang}`);
  }
});

test('content: fields of the type only, clipped; dynamic targets are http(s)', () => {
  assert.deepEqual(cleanContent('wifi', { ssid: 'Office', password: 'p', security: 'X', admin: true }), { ssid: 'Office', password: 'p', security: 'WPA', hidden: false });
  assert.equal(cleanContent('nope', {}), null);
  assert.equal(cleanContent('text', { text: 'a'.repeat(5000) }).text.length, 1500);
  assert.equal(targetUrl({ url: 'example.com/a' }), 'https://example.com/a');
  assert.equal(targetUrl({ url: 'javascript:alert(1)' }), null);
  assert.equal(targetUrl({ url: 'mailto:a@b.c' }), null);
});

test('encode: payloads phones understand', () => {
  assert.equal(encode.encodeContent('url', { url: 'example.com' }), 'https://example.com');
  assert.equal(encode.encodeContent('wifi', { ssid: 'My;Net', password: 'a:b"c', security: 'WPA', hidden: true }), 'WIFI:T:WPA;S:My\\;Net;P:a\\:b\\"c;H:true;;');
  assert.equal(encode.encodeContent('wifi', { ssid: 'Open', password: 'ignored', security: 'nopass' }), 'WIFI:T:nopass;S:Open;;');
  assert.equal(encode.encodeContent('phone', { phone: '+996 (555) 12-34' }), 'tel:+9965551234');
  assert.equal(encode.encodeContent('whatsapp', { phone: '+996 555 123', message: 'Hi there' }), 'https://wa.me/996555123?text=Hi%20there');
  assert.equal(encode.encodeContent('telegram', { username: '@example' }), 'https://t.me/example');
  assert.equal(encode.encodeContent('email', { to: 'a@b.c', subject: 'Hi' }), 'mailto:a@b.c?subject=Hi');
  assert.equal(encode.encodeContent('geo', { lat: '42.87', lng: '74.59' }), 'geo:42.87,74.59');
  assert.equal(encode.encodeContent('geo', { lat: '142', lng: '74' }), '');
  const card = encode.encodeContent('vcard', { firstName: 'Aida', lastName: 'Bekova', org: 'Example, LLC', mobile: '+996 555' });
  assert.match(card, /^BEGIN:VCARD\nVERSION:3\.0\nN:Bekova;Aida;;;\nFN:Aida Bekova\nORG:Example\\, LLC\nTEL;TYPE=CELL:\+996 555\nEND:VCARD$/);
  const event = encode.encodeContent('event', { title: 'Offsite', start: '2026-10-21', end: '2026-10-22', allDay: true });
  assert.match(event, /DTSTART;VALUE=DATE:20261021\nDTEND;VALUE=DATE:20261023/);
  assert.match(encode.encodeContent('event', { title: 'Call', start: '2026-10-21T18:30' }), /DTSTART:20261021T183000/);
  assert.equal(encode.encodeContent('vcard', {}), '');
  assert.equal(encode.payloadFor({ type: 'url', dynamic: true, slug: 'Ab3', content: { url: 'x.com' } }, 'https://p.kg'), 'https://p.kg/q/Ab3');
});

test('render: finder patterns stay, the logo clears modules, warnings fire', () => {
  const size = 25;
  const matrix = { size, get: () => 1 };
  const plain = render.renderSvg(matrix, { design: {} });
  assert.match(plain.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.equal(plain.width, (size + 2 * DEFAULT_DESIGN.margin) * render.U);
  assert.deepEqual(plain.warnings, []);
  const withLogo = render.renderSvg(matrix, { design: { logo: { source: 'brand', size: 30, padding: 30 } }, logo: { href: 'data:image/png;base64,AA==', aspect: 1 } });
  assert.ok(withLogo.svg.length < plain.svg.length, 'modules under the plate are not drawn');
  assert.ok(withLogo.warnings.includes('largeLogo'));
  assert.ok(render.renderSvg(matrix, { design: { dots: { color: '#F5F5F5' } } }).warnings.includes('lowContrast'));
  assert.ok(render.renderSvg(matrix, { design: { dots: { color: '#FFFFFF' }, background: { color: '#000000' } } }).warnings.includes('inverted'));
  const caption = render.renderSvg(matrix, { design: { frame: { style: 'card', text: '<b>&' } } });
  assert.ok(caption.svg.includes('&lt;b&gt;&amp;'), 'caption is escaped');
  assert.ok(caption.height > caption.width);
  assert.equal(render.effectiveEcl({ logo: { source: 'icon' }, ecl: 'auto' }), 'H');
  assert.equal(render.effectiveEcl({ logo: { source: 'none' }, ecl: 'L' }), 'L');
});
