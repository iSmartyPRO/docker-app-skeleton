/**
 * Barcodes and printable labels (Code 128, EAN-13, QR).
 *
 * Everything except `printLabels` / `loadQrEncoder` is pure and DOM-free, so the
 * encoders and the label markup are unit-tested with node:test
 * (src/backend/test/scan-labels.test.js).
 *
 *   renderBarcodeSVG('WH-000123', 'code128')            → '<svg …>'
 *   renderBarcodeSVG('4600000000003', 'ean13')         → '<svg …>' (checksum validated)
 *   await loadQrEncoder(); renderBarcodeSVG(url, 'qr') → '<svg …>'
 *   await printLabels([{ code, title, kind: 'qr' }], { format: '58x40', copies: 2 })
 *
 * QR uses the `qrcode` package, loaded on demand (it stays out of the main bundle).
 */

// ── Code 128 ──────────────────────────────────────────────────────────────────

/** Bar/space widths of the 107 Code 128 symbols (value 0…105, 106 = stop). */
const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
export const CODE128_PATTERNS = C128;

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

const isDigit = (ch) => ch >= '0' && ch <= '9';

function digitRun(text, from) {
  let end = from;
  while (end < text.length && isDigit(text[end])) end += 1;
  return end - from;
}

/** Error thrown for content a symbology cannot carry; `code` is a stable reason. */
export class BarcodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BarcodeError';
    this.code = code;
  }
}

/**
 * Code 128 symbol values for `text` (printable ASCII 32…126), switching between
 * subsets B and C automatically for the shortest symbol: C packs digit pairs.
 * Includes start, checksum and stop.
 */
export function code128Values(text) {
  const value = String(text ?? '');
  if (!value) throw new BarcodeError('empty', 'Nothing to encode');
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if (ch.length !== 1 || c < 32 || c > 126) throw new BarcodeError('charset', `Code 128 cannot encode «${ch}»`);
  }

  const out = [];
  let set;
  let i = 0;
  const lead = digitRun(value, 0);
  if (lead >= 4 && lead % 2 === 0) {
    set = 'C';
    out.push(START_C);
  } else if (lead === value.length && lead >= 2 && lead % 2 === 0) {
    set = 'C';
    out.push(START_C);
  } else {
    set = 'B';
    out.push(START_B);
  }

  while (i < value.length) {
    if (set === 'C') {
      if (digitRun(value, i) >= 2) {
        out.push(Number(value.slice(i, i + 2)));
        i += 2;
        continue;
      }
      out.push(CODE_B);
      set = 'B';
      continue;
    }
    // Subset B: switch to C for a long enough even stretch of digits.
    const run = digitRun(value, i);
    const atEnd = i + run === value.length;
    if (run >= 6 || (run >= 4 && atEnd)) {
      if (run % 2 === 1) {
        out.push(value.charCodeAt(i) - 32);
        i += 1;
      }
      out.push(CODE_C);
      set = 'C';
      continue;
    }
    out.push(value.charCodeAt(i) - 32);
    i += 1;
  }

  out.push(code128Checksum(out));
  out.push(STOP);
  return out;
}

/** Modulo-103 checksum over the start symbol and data symbols. */
export function code128Checksum(values) {
  let sum = values[0];
  for (let k = 1; k < values.length; k += 1) sum += values[k] * k;
  return sum % 103;
}

/** Bar/space widths (in modules) of a full Code 128 symbol, bars first. */
export function code128Widths(text) {
  return code128Values(text)
    .map((v) => C128[v])
    .join('')
    .split('')
    .map(Number);
}

// ── EAN-13 ────────────────────────────────────────────────────────────────────

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_R = EAN_L.map((p) => p.replace(/./g, (b) => (b === '0' ? '1' : '0')));
const EAN_G = EAN_R.map((p) => p.split('').reverse().join(''));
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Check digit for the first 12 digits of an EAN-13 (GS1 mod 10, weights 1/3). */
export function ean13Checksum(digits12) {
  const s = String(digits12 ?? '');
  if (!/^\d{12}$/.test(s)) throw new BarcodeError('format', 'EAN-13 needs 12 digits before the check digit');
  let sum = 0;
  for (let k = 0; k < 12; k += 1) sum += Number(s[k]) * (k % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** True for 13 digits with a correct check digit. */
export function isValidEan13(code) {
  const s = String(code ?? '');
  return /^\d{13}$/.test(s) && ean13Checksum(s.slice(0, 12)) === Number(s[12]);
}

/** 12 digits → completed with the check digit; 13 digits → returned if the check digit is right; otherwise throws. */
export function normalizeEan13(code) {
  const s = String(code ?? '').replace(/\s+/g, '');
  if (/^\d{12}$/.test(s)) return s + ean13Checksum(s);
  if (/^\d{13}$/.test(s)) {
    if (!isValidEan13(s)) throw new BarcodeError('checksum', `Wrong EAN-13 check digit: expected ${ean13Checksum(s.slice(0, 12))}`);
    return s;
  }
  throw new BarcodeError('format', 'EAN-13 is 12 or 13 digits');
}

/** The 95-module bit string of an EAN-13 ("1" = bar). */
export function ean13Bits(code) {
  const s = normalizeEan13(code);
  const parity = EAN_PARITY[Number(s[0])];
  let bits = '101';
  for (let k = 1; k <= 6; k += 1) bits += (parity[k - 1] === 'L' ? EAN_L : EAN_G)[Number(s[k])];
  bits += '01010';
  for (let k = 7; k <= 12; k += 1) bits += EAN_R[Number(s[k])];
  return bits + '101';
}

// ── QR (lazy) ─────────────────────────────────────────────────────────────────

let qrEncoder = null;

/** Registers a QR encoder: `(text) => ({ size, get(row, col) → truthy for a dark module })`. Used by tests and by loadQrEncoder. */
export function setQrEncoder(encoder) {
  qrEncoder = encoder;
}

export const hasQrEncoder = () => Boolean(qrEncoder);

/** Wraps the `qrcode` package's `create` into the encoder shape. */
export function qrEncoderFrom(QRCode) {
  const create = QRCode.create || QRCode.default?.create;
  return (text) => {
    const { modules } = create(String(text), { errorCorrectionLevel: 'M' });
    return { size: modules.size, get: (row, col) => modules.get(row, col) };
  };
}

let qrLoading = null;
/** Loads `qrcode` once (separate chunk) and registers it. Browser only. */
export function loadQrEncoder() {
  if (qrEncoder) return Promise.resolve();
  if (!qrLoading) {
    qrLoading = import('qrcode')
      .then((mod) => setQrEncoder(qrEncoderFrom(mod.default || mod)))
      .catch((err) => {
        qrLoading = null;
        throw err;
      });
  }
  return qrLoading;
}

// ── SVG ───────────────────────────────────────────────────────────────────────

export function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const fmt = (n) => String(Math.round(n * 1000) / 1000);

/** Merges runs of bars into rectangles of one path (x in modules). */
function barsPath(bits, x0, y, h) {
  let d = '';
  let k = 0;
  while (k < bits.length) {
    if (bits[k] !== '1') {
      k += 1;
      continue;
    }
    let end = k;
    while (end < bits.length && bits[end] === '1') end += 1;
    d += `M${x0 + k} ${fmt(y)}h${end - k}v${fmt(h)}h${k - end}z`;
    k = end;
  }
  return d;
}

function widthsToBits(widths) {
  let bits = '';
  widths.forEach((w, k) => {
    bits += (k % 2 === 0 ? '1' : '0').repeat(w);
  });
  return bits;
}

function svgOpen(vw, vh, width, height, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(vw)} ${fmt(vh)}" width="${fmt(width)}" height="${fmt(height)}" shape-rendering="crispEdges"${extra}>`;
}

/**
 * Barcode as standalone SVG markup (black on white, vector — crisp at any print size).
 *
 * @param {string} code
 * @param {'code128'|'ean13'|'qr'} kind
 * @param {object} [options]
 * @param {number} [options.moduleSize=2] px per module (the narrowest bar / one QR cell)
 * @param {number} [options.height]       px; 1D: total height (default 60 × moduleSize / 2), QR: side (default size × moduleSize)
 * @param {number} [options.quiet]        quiet zone in modules (code128: 10, ean13: 9 (+2 right), qr: 2)
 * @param {boolean} [options.text]        human-readable digits under the bars (default: true for ean13, false otherwise)
 * @param {boolean} [options.fluid]       1D only: stretch to the container (preserveAspectRatio="none") — for labels
 * @param {boolean} [options.background=true] white rectangle behind the symbol
 */
export function renderBarcodeSVG(code, kind, options = {}) {
  const moduleSize = Number(options.moduleSize) > 0 ? Number(options.moduleSize) : 2;
  const bg = options.background !== false;

  if (kind === 'qr') {
    if (!qrEncoder) throw new BarcodeError('qr-not-loaded', 'QR encoder is not loaded: await loadQrEncoder() first');
    const value = String(code ?? '');
    if (!value) throw new BarcodeError('empty', 'Nothing to encode');
    const m = qrEncoder(value);
    const quiet = options.quiet ?? 2;
    const side = m.size + quiet * 2;
    const px = Number(options.height) > 0 ? Number(options.height) : side * moduleSize;
    let d = '';
    for (let row = 0; row < m.size; row += 1) {
      let col = 0;
      while (col < m.size) {
        if (!m.get(row, col)) {
          col += 1;
          continue;
        }
        let end = col;
        while (end < m.size && m.get(row, end)) end += 1;
        d += `M${col + quiet} ${row + quiet}h${end - col}v1h${col - end}z`;
        col = end;
      }
    }
    return (
      svgOpen(side, side, px, px, ' role="img"') +
      (bg ? `<rect width="${side}" height="${side}" fill="#fff"/>` : '') +
      `<path d="${d}" fill="#000"/></svg>`
    );
  }

  let bits;
  let quietL;
  let quietR;
  let guards = null;
  let digits = null;
  if (kind === 'ean13') {
    const normalized = normalizeEan13(code);
    bits = ean13Bits(normalized);
    quietL = options.quiet ?? 9;
    quietR = (options.quiet ?? 9) - 2;
    guards = [[0, 3], [45, 50], [92, 95]];
    digits = normalized;
  } else if (kind === 'code128') {
    bits = widthsToBits(code128Widths(code));
    quietL = options.quiet ?? 10;
    quietR = quietL;
  } else {
    throw new BarcodeError('kind', `Unknown barcode kind: ${kind}`);
  }

  const showText = options.text ?? kind === 'ean13';
  const totalW = quietL + bits.length + quietR;
  const pxH = Number(options.height) > 0 ? Number(options.height) : 30 * moduleSize;
  const vh = pxH / moduleSize; // view-box height in modules
  const textH = showText ? 9 : 0;
  const barH = Math.max(vh - textH, 4);
  const fluid = options.fluid ? ' preserveAspectRatio="none"' : '';

  let path;
  if (guards) {
    // EAN guard bars run 5 modules lower than the data bars, into the digits line.
    const guardBits = bits.split('').map((b, k) => (guards.some(([a, z]) => k >= a && k < z) ? b : '0')).join('');
    const dataBits = bits.split('').map((b, k) => (guards.some(([a, z]) => k >= a && k < z) ? '0' : b)).join('');
    path = barsPath(dataBits, quietL, 0, barH) + barsPath(guardBits, quietL, 0, Math.min(barH + (showText ? 5 : 0), vh));
  } else {
    path = barsPath(bits, quietL, 0, barH);
  }

  let text = '';
  if (showText) {
    const y = fmt(vh - 1);
    const font = 'font-family="OCR-B, \'DejaVu Sans Mono\', Consolas, monospace" font-size="9" fill="#000"';
    if (digits) {
      const left = digits.slice(1, 7).split('').map((c, k) => `<tspan x="${quietL + 3 + 3.5 + k * 7}">${c}</tspan>`).join('');
      const right = digits.slice(7).split('').map((c, k) => `<tspan x="${quietL + 50 + 3.5 + k * 7}">${c}</tspan>`).join('');
      text =
        `<text ${font} y="${y}" text-anchor="middle"><tspan x="${quietL - 4.5}">${digits[0]}</tspan>${left}${right}</text>`;
    } else {
      text = `<text ${font} x="${fmt(totalW / 2)}" y="${y}" text-anchor="middle">${escapeXml(code)}</text>`;
    }
  }

  return (
    svgOpen(totalW, vh, totalW * moduleSize, pxH, `${fluid} role="img"`) +
    (bg ? `<rect width="${totalW}" height="${fmt(vh)}" fill="#fff"/>` : '') +
    `<path d="${path}" fill="#000"/>${text}</svg>`
  );
}

// ── Labels ────────────────────────────────────────────────────────────────────

/**
 * Label formats, sizes in mm. Thermal rolls print one label per page;
 * A4 3×8 matches 63.5 × 33.9 mm sheets (L7159 type) with their page margins.
 */
export const LABEL_FORMATS = {
  '58x40': { id: '58x40', width: 58, height: 40, pad: 2, qr: 27, title: 8.5, small: 6.5, lines: 3 },
  '80x50': { id: '80x50', width: 80, height: 50, pad: 2.5, qr: 36, title: 11, small: 8, lines: 3 },
  'a4-3x8': {
    id: 'a4-3x8',
    width: 63.5,
    height: 33.9,
    pad: 2,
    qr: 26,
    title: 8,
    small: 6.2,
    lines: 3,
    sheet: { width: 210, height: 297, cols: 3, rows: 8, top: 13.1, left: 7.25, gapX: 2.5, gapY: 0 },
  },
};
export const LABEL_FORMAT_IDS = Object.keys(LABEL_FORMATS);
export const DEFAULT_LABEL_FORMAT = '58x40';
export const MAX_LABELS = 2000;

export const labelFormat = (id) => LABEL_FORMATS[id] || LABEL_FORMATS[DEFAULT_LABEL_FORMAT];

/** Hard cap for very long strings (CSS line-clamp does the visual truncation). */
export function truncate(value, max) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…` : s;
}

const extraText = (extra) => (Array.isArray(extra) ? extra.filter(Boolean).join(' · ') : String(extra ?? ''));

/**
 * Which symbology an item will really print with: an EAN-13 that does not
 * validate falls back to Code 128 (same content, still scannable).
 * Returns { kind, code, fallback?: 'ean13' , error?: BarcodeError }.
 */
export function resolveLabelKind(item) {
  const code = String(item?.code ?? '').trim();
  const kind = ['qr', 'code128', 'ean13'].includes(item?.kind) ? item.kind : 'qr';
  if (!code) return { kind, code, error: new BarcodeError('empty', 'Nothing to encode') };
  if (kind === 'ean13') {
    try {
      return { kind, code: normalizeEan13(code) };
    } catch (error) {
      try {
        code128Values(code);
        return { kind: 'code128', code, fallback: 'ean13', error };
      } catch {
        return { kind: 'qr', code, fallback: 'ean13', error };
      }
    }
  }
  if (kind === 'code128') {
    try {
      code128Values(code);
      return { kind, code };
    } catch (error) {
      // Cyrillic or other non-ASCII content: only QR can carry it.
      return { kind: 'qr', code, fallback: 'code128', error };
    }
  }
  return { kind, code };
}

/** Inner markup of one label (no page wrapper). Needs the QR encoder for QR items. */
export function labelHtml(item) {
  const r = resolveLabelKind(item);
  const title = escapeXml(truncate(item?.title, 140));
  const subtitle = escapeXml(truncate(item?.subtitle, 100));
  const extra = escapeXml(truncate(extraText(item?.extra), 80));
  const codeText = escapeXml(truncate(r.code, 60));

  if (r.kind === 'qr') {
    const svg = r.code ? renderBarcodeSVG(r.code, 'qr', { height: 100, quiet: 1 }) : '';
    return (
      `<div class="wl-label wl-label--qr">` +
      `<div class="wl-qr">${svg}</div>` +
      `<div class="wl-text">` +
      (title ? `<div class="wl-title">${title}</div>` : '') +
      (subtitle ? `<div class="wl-sub">${subtitle}</div>` : '') +
      `<div class="wl-foot">` +
      (extra ? `<div class="wl-extra">${extra}</div>` : '') +
      `<div class="wl-num">${codeText}</div></div>` +
      `</div></div>`
    );
  }

  const bars = renderBarcodeSVG(r.code, r.kind, { height: 100, moduleSize: 1, text: false, fluid: true });
  return (
    `<div class="wl-label wl-label--bar">` +
    (title ? `<div class="wl-title wl-title--bar">${title}</div>` : '') +
    (subtitle ? `<div class="wl-sub wl-sub--bar">${subtitle}</div>` : '') +
    `<div class="wl-bars">${bars}</div>` +
    `<div class="wl-row"><div class="wl-num wl-num--bar">${codeText}</div>` +
    (extra ? `<div class="wl-extra">${extra}</div>` : '') +
    `</div></div>`
  );
}

/** Label CSS (screen preview and print). `scope` prefixes every rule, e.g. ".label-preview". */
export function labelCss(formatId, scope = '') {
  const f = labelFormat(formatId);
  const s = scope ? `${scope} ` : '';
  const lines = f.lines;
  return `
${s}.wl-label{box-sizing:border-box;width:${f.width}mm;height:${f.height}mm;padding:${f.pad}mm;overflow:hidden;background:#fff;color:#000;
font-family:'Manrope','Segoe UI','DejaVu Sans',Arial,'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;font-size:${f.small}pt;line-height:1.18;-webkit-print-color-adjust:exact;print-color-adjust:exact}
${s}.wl-label *{box-sizing:border-box}
${s}.wl-label svg{display:block}
${s}.wl-label--qr{display:flex;gap:${f.pad}mm;align-items:stretch}
${s}.wl-qr{flex:0 0 auto;width:${Math.min(f.qr, f.height - f.pad * 2)}mm;height:${Math.min(f.qr, f.height - f.pad * 2)}mm;align-self:center}
${s}.wl-qr svg{width:100%;height:100%}
${s}.wl-text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:0.6mm}
${s}.wl-title{font-size:${f.title}pt;font-weight:700;line-height:1.15;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};overflow:hidden;overflow-wrap:anywhere}
${s}.wl-sub{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}
${s}.wl-foot{margin-top:auto;display:flex;flex-direction:column;gap:0.4mm;min-width:0}
${s}.wl-extra{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
${s}.wl-num{font-family:'DejaVu Sans Mono',Consolas,'Courier New',monospace;font-size:${f.small}pt;font-weight:600;letter-spacing:0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${s}.wl-label--bar{display:flex;flex-direction:column;gap:0.5mm}
${s}.wl-title--bar{-webkit-line-clamp:2;flex:0 0 auto}
${s}.wl-sub--bar{-webkit-line-clamp:1;flex:0 0 auto}
${s}.wl-bars{flex:1 1 auto;min-height:${Math.round(f.height * 0.3)}mm;margin-top:0.5mm}
${s}.wl-bars svg{width:100%;height:100%}
${s}.wl-row{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;flex:0 0 auto;min-width:0}
${s}.wl-num--bar{flex:0 1 auto;font-size:${f.small + 1}pt;letter-spacing:0.08em}
${s}.wl-row .wl-extra{flex:0 1 auto;text-align:right}
`;
}

/** Expands copies (global or per item) into the flat list of labels to print. */
export function expandCopies(items, copies = 1) {
  const n = Math.max(1, Math.min(999, Math.floor(Number(copies) || 1)));
  const out = [];
  for (const item of items || []) {
    if (!item) continue;
    const k = item.copies != null ? Math.max(0, Math.min(999, Math.floor(Number(item.copies) || 0))) : n;
    for (let c = 0; c < k && out.length < MAX_LABELS; c += 1) out.push(item);
  }
  return out;
}

/** Pages a print job takes. */
export function pageCount(count, formatId) {
  const f = labelFormat(formatId);
  return f.sheet ? Math.ceil(count / (f.sheet.cols * f.sheet.rows)) : count;
}

/** The complete print document (HTML string). Needs the QR encoder for QR items. */
export function buildLabelsHtml(items, { format = DEFAULT_LABEL_FORMAT, copies = 1, title = 'Labels' } = {}) {
  const f = labelFormat(format);
  const list = expandCopies(items, copies);
  const labels = list.map((item) => labelHtml(item));

  let body;
  let page;
  if (f.sheet) {
    const per = f.sheet.cols * f.sheet.rows;
    const sheets = [];
    for (let k = 0; k < labels.length; k += per) sheets.push(`<section class="wl-sheet">${labels.slice(k, k + per).join('')}</section>`);
    body = sheets.join('');
    page = `@page{size:${f.sheet.width}mm ${f.sheet.height}mm;margin:0}
.wl-sheet{width:${f.sheet.width}mm;height:${f.sheet.height}mm;padding:${f.sheet.top}mm ${f.sheet.left}mm 0;display:grid;
grid-template-columns:repeat(${f.sheet.cols},${f.width}mm);grid-auto-rows:${f.height}mm;column-gap:${f.sheet.gapX}mm;row-gap:${f.sheet.gapY}mm;
align-content:start;overflow:hidden;break-after:page;page-break-after:always}
.wl-sheet:last-child{break-after:auto;page-break-after:auto}`;
  } else {
    body = labels.map((html) => `<section class="wl-page">${html}</section>`).join('');
    page = `@page{size:${f.width}mm ${f.height}mm;margin:0}
.wl-page{width:${f.width}mm;height:${f.height}mm;overflow:hidden;break-after:page;page-break-after:always}
.wl-page:last-child{break-after:auto;page-break-after:auto}`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>
html,body{margin:0;padding:0;background:#fff}
${page}
@media screen{body{background:#e5e7eb}.wl-page,.wl-sheet{background:#fff;margin:8px auto;box-shadow:0 1px 4px rgba(0,0,0,.2)}}
${labelCss(f.id)}
</style></head><body>${body}</body></html>`;
}

/**
 * Prints labels through a hidden iframe (the page itself is never reflowed).
 * Resolves once the print dialog has been opened.
 *
 * @param {Array<{code: string, title: string, subtitle?: string, kind: 'qr'|'code128'|'ean13', extra?: string|string[], copies?: number}>} items
 * @param {{ format?: '58x40'|'80x50'|'a4-3x8', copies?: number, title?: string }} [options]
 */
export async function printLabels(items, options = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return;
  if (list.some((item) => resolveLabelKind(item).kind === 'qr')) await loadQrEncoder();
  const html = buildLabelsHtml(list, options);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);

  const cleanup = () => {
    setTimeout(() => frame.remove(), 500);
  };

  await new Promise((resolve) => {
    frame.onload = resolve;
    frame.srcdoc = html;
  });
  const win = frame.contentWindow;
  // Fonts and SVGs are inline, but give webfonts a moment to settle.
  try {
    await win.document.fonts?.ready;
  } catch {
    /* ignore */
  }
  win.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => frame.isConnected && frame.remove(), 120000);
  win.focus();
  win.print();
}
