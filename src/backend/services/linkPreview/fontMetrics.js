import { readFileSync } from 'fs';

/*
 * Advance widths of a TrueType font, read straight from its tables (cmap
 * formats 4 and 12, hmtx), so the preview card can wrap and shorten text
 * exactly as the renderer will draw it. No kerning: wrapping keeps a small
 * safety margin instead.
 */

function tableDirectory(buf) {
  const count = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    tables[buf.toString('latin1', at, at + 4)] = { offset: buf.readUInt32BE(at + 8), length: buf.readUInt32BE(at + 12) };
  }
  return tables;
}

function readCmap(buf, cmap) {
  const map = new Map();
  const count = buf.readUInt16BE(cmap.offset + 2);
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const at = cmap.offset + 4 + i * 8;
    const platform = buf.readUInt16BE(at);
    const encoding = buf.readUInt16BE(at + 2);
    const offset = cmap.offset + buf.readUInt32BE(at + 4);
    const format = buf.readUInt16BE(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12) best = { format, offset };
    else if (format === 4 && !best) best = { format, offset };
  }
  if (!best) return map;
  const { format, offset } = best;
  if (format === 12) {
    const groups = buf.readUInt32BE(offset + 12);
    for (let g = 0; g < groups; g += 1) {
      const at = offset + 16 + g * 12;
      const start = buf.readUInt32BE(at);
      const end = Math.min(buf.readUInt32BE(at + 4), start + 0xffff);
      const glyph = buf.readUInt32BE(at + 8);
      for (let c = start; c <= end; c += 1) map.set(c, glyph + (c - start));
    }
    return map;
  }
  const segX2 = buf.readUInt16BE(offset + 6);
  const ends = offset + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s += 1) {
    const end = buf.readUInt16BE(ends + s * 2);
    const start = buf.readUInt16BE(starts + s * 2);
    const delta = buf.readInt16BE(deltas + s * 2);
    const rangeAt = ranges + s * 2;
    const range = buf.readUInt16BE(rangeAt);
    for (let c = start; c <= end && c !== 0xffff; c += 1) {
      let glyph;
      if (range === 0) glyph = (c + delta) & 0xffff;
      else {
        const at = rangeAt + range + (c - start) * 2;
        glyph = buf.readUInt16BE(at);
        if (glyph) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph) map.set(c, glyph);
    }
  }
  return map;
}

/** { width(text, size), has(char) } for a TTF file. */
export function loadMetrics(path) {
  const buf = readFileSync(path);
  const tables = tableDirectory(buf);
  const unitsPerEm = buf.readUInt16BE(tables.head.offset + 18);
  const metricsCount = buf.readUInt16BE(tables.hhea.offset + 34);
  const advances = [];
  for (let i = 0; i < metricsCount; i += 1) advances.push(buf.readUInt16BE(tables.hmtx.offset + i * 4));
  const cmap = readCmap(buf, tables.cmap);
  const fallback = advances[cmap.get(0x6f) || 0] || unitsPerEm / 2; // "o"
  const advance = (code) => {
    const glyph = cmap.get(code);
    if (glyph === undefined) return fallback;
    return advances[Math.min(glyph, advances.length - 1)];
  };
  return {
    unitsPerEm,
    has: (char) => cmap.has(char.codePointAt(0)),
    width(text, size) {
      let units = 0;
      for (const char of String(text)) units += advance(char.codePointAt(0));
      return (units / unitsPerEm) * size;
    },
  };
}
