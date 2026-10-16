import { writeFile } from 'fs/promises';
import { crc32, deflateSync } from 'zlib';
import { newStorageKey, removeBlob, storagePath } from './storage.js';

/*
 * Tiny generated files for demo data (docs/extending.md «Demo data»): a
 * placeholder picture (PNG), a one-page PDF, a minimal Word document and a
 * one-sheet spreadsheet (XLSX).
 * No dependencies and no network: everything is drawn here, a few kilobytes
 * each, so a demo never ships real photos or documents.
 */

// ── PNG ─────────────────────────────────────────────────────────────────────

const hex = (value) => {
  const n = parseInt(String(value).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** RGB pixels (Uint8Array, width × height × 3) → PNG bytes. */
export function encodePng(width, height, pixels) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    pixels.subarray(y * width * 3, (y + 1) * width * 3).forEach((value, i) => {
      raw[y * (width * 3 + 1) + 1 + i] = value;
    });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * A construction-site placeholder: sky, ground and a house whose walls rise
 * with `progress` (0..1). `seed` varies the colours a little.
 */
export function sitePhoto({ width = 480, height = 320, progress = 0.5, seed = 1, wall = '#C08457' } = {}) {
  const px = new Uint8Array(width * height * 3);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };
  const horizon = Math.round(height * 0.62);
  const tint = (seed * 37) % 40;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (y < horizon) set(x, y, [120 + Math.round((y / horizon) * 80) - tint / 2, 170 + Math.round((y / horizon) * 50), 230]);
      else set(x, y, [110 + tint, 96 + ((x * 7 + y * 3) % 9), 70]);
    }
  }
  // The house: a slab, walls up to `progress`, a roof when nearly done.
  const left = Math.round(width * 0.28);
  const right = Math.round(width * 0.72);
  const base = horizon + Math.round(height * 0.08);
  const full = Math.round(height * 0.34);
  for (let x = left - 12; x <= right + 12; x += 1) for (let y = base; y < base + 8; y += 1) set(x, y, [150, 150, 150]);
  const top = base - Math.round(full * Math.max(0, Math.min(1, progress)));
  const color = hex(wall);
  for (let x = left; x <= right; x += 1) {
    for (let y = top; y < base; y += 1) {
      const mortar = (y - top) % 10 === 0 || ((x + (Math.floor((y - top) / 10) % 2) * 10) % 20 === 0);
      set(x, y, mortar ? [color[0] - 40, color[1] - 40, color[2] - 40] : color);
    }
  }
  if (progress >= 0.8) {
    const peak = top - Math.round(full * 0.4);
    for (let y = peak; y < top; y += 1) {
      const half = Math.round(((y - peak) / (top - peak)) * ((right - left) / 2 + 14));
      const mid = Math.round((left + right) / 2);
      for (let x = mid - half; x <= mid + half; x += 1) set(x, y, [120, 50, 40]);
    }
  }
  // A crane while building.
  if (progress < 0.8) {
    const mast = right + 40;
    for (let y = horizon - Math.round(height * 0.45); y < base; y += 1) for (let x = mast; x < mast + 4; x += 1) set(x, y, [230, 180, 30]);
    const jib = horizon - Math.round(height * 0.45);
    for (let x = mast - 140; x < mast + 30; x += 1) for (let y = jib; y < jib + 4; y += 1) set(x, y, [230, 180, 30]);
  }
  return encodePng(width, height, px);
}

// ── PDF ─────────────────────────────────────────────────────────────────────

const pdfText = (value) => String(value).replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');

/** A one-page PDF with a few lines of Latin text (Helvetica; non-Latin letters become «?»). */
export function simplePdf(lines = []) {
  const body = ['BT', '/F1 16 Tf', '56 780 Td', '20 TL'];
  lines.forEach((line, index) => {
    if (index === 1) body.push('/F1 11 Tf');
    body.push(`(${pdfText(line)}) Tj`, 'T*');
  });
  body.push('ET');
  const stream = body.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(out));
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ── DOCX (a stored ZIP with three parts) ────────────────────────────────────

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A minimal Word document: a bold title and paragraphs. */
export function simpleDocx(title, paragraphs = []) {
  const para = (text, bold = false) => `<w:p><w:r>${bold ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${para(title, true)}${paragraphs.map((text) => para(text)).join('')}</w:body></w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(types, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
  ]);
}

// ── XLSX (a stored ZIP: one sheet of inline strings and numbers) ────────────

const column = (index) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

/** A minimal spreadsheet: `rows` is an array of arrays (numbers stay numbers, the first row is bold-free headers). */
export function simpleXlsx(sheetName, rows = []) {
  const cells = rows
    .map((row, r) => {
      const values = row
        .map((value, c) => {
          const ref = `${column(c)}${r + 1}`;
          if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value ?? '')}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${values}</row>`;
    })
    .join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(String(sheetName || 'Sheet1').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(types, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet, 'utf8') },
  ]);
}

// ── Storage ─────────────────────────────────────────────────────────────────

/** Writes bytes under UPLOAD_DIR/<prefix>/<y>/<m>/… → { key, size }. */
export async function storeDemoBlob(prefix, ext, bytes) {
  const key = await newStorageKey(ext, prefix);
  await writeFile(storagePath(key), bytes);
  return { key, size: bytes.length };
}

/** Removes stored blobs (missing ones are fine). */
export async function removeDemoBlobs(keys) {
  for (const key of keys) if (key) await removeBlob(key);
}

/** Notifications that point at removed demo records (by link prefix) go with them. */
export async function dropNotifications(query, links) {
  const list = [...new Set(links.filter(Boolean))];
  if (!list.length) return;
  await query(`DELETE FROM notifications WHERE link = ANY($1::text[]) OR split_part(link, '?', 1) = ANY($1::text[])`, [list]).catch(() => {});
}

/** Entity conversations of removed demo records (chat module). */
export async function dropEntityChats(query, type, ids) {
  if (!ids.length) return;
  await query(`DELETE FROM chat_rooms WHERE entity_type = $1 AND entity_id = ANY($2::int[])`, [type, ids.map(Number)]).catch(() => {});
}

/** Amounts in demo data are written in US dollars; other currencies are scaled to look plausible. */
const RATES = { USD: 1, EUR: 1, GBP: 1, CHF: 1, KGS: 87, RUB: 90, KZT: 480, UZS: 12500, UAH: 41, BYN: 3.3, AED: 3.7, CNY: 7.2, TRY: 34, GEL: 2.7, AMD: 390, AZN: 1.7, TJS: 11 };

export function demoMoney(usd, currency) {
  const rate = RATES[String(currency || 'USD').trim().toUpperCase()] || 1;
  const value = usd * rate;
  const step = value >= 100000 ? 1000 : value >= 1000 ? 10 : 1;
  return Math.round(value / step) * step;
}

/** 'YYYY-MM-DD' of a Date (server zone). */
export const isoDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
