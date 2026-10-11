import { randomBytes } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { uploadRoot } from '../../config/paths.js';
import { HEX, httpError } from '../shared/acl.js';

/*
 * Resource icons. Three kinds:
 *   glyph   vector shapes from the icon library (Lucide line icons or brand
 *           logos), stored as a whitelisted list of [tag, attrs] and drawn
 *           by React — never as HTML, so nothing executable can slip in
 *   image   an uploaded PNG / SVG / WebP / JPEG, with an optional dark-theme
 *           variant; served as <img> with a sandbox CSP
 *   letter  one or two characters on a coloured tile
 * Every kind has a tile style (gradient, soft, solid, plain) and colours.
 */

export const ICON_DIR = () => join(uploadRoot, 'resources');
const STYLES = ['gradient', 'soft', 'solid', 'plain'];
const TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const NUMERIC = new Set(['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2']);
const NUMBER = /^-?\d*\.?\d+(e-?\d+)?$/i;
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+\-eE]*$/;
const POINTS = /^[0-9.,\s+\-eE]*$/;
const FILE = /^[a-f0-9]{24}\.(png|svg|webp|jpg)$/;

function cleanNodes(nodes) {
  if (!Array.isArray(nodes) || !nodes.length || nodes.length > 80) throw httpError(400, 'Invalid icon', 'INVALID_ICON');
  let size = 0;
  const clean = nodes.map((node) => {
    const [tag, attrs] = Array.isArray(node) ? node : [];
    if (!TAGS.has(tag) || !attrs || typeof attrs !== 'object') throw httpError(400, 'Invalid icon', 'INVALID_ICON');
    const out = {};
    for (const [key, raw] of Object.entries(attrs)) {
      const value = String(raw);
      size += value.length;
      if (key === 'd' && PATH.test(value)) out.d = value;
      else if (key === 'points' && POINTS.test(value)) out.points = value;
      else if (NUMERIC.has(key) && NUMBER.test(value)) out[key] = value;
      else if ((key === 'fill-rule' || key === 'clip-rule') && ['evenodd', 'nonzero'].includes(value)) out[key] = value;
    }
    return [tag, out];
  });
  if (size > 40_000) throw httpError(400, 'Icon is too complex', 'INVALID_ICON');
  return clean;
}

const color = (value, fallback) => (HEX.test(value || '') ? value.toUpperCase() : fallback);

/** Validates an icon coming from the editor. */
export function cleanIcon(input = {}) {
  const style = STYLES.includes(input.style) ? input.style : 'gradient';
  const base = {
    style,
    color: color(input.color, '#6366F1'),
    color2: color(input.color2, null),
    colorDark: color(input.colorDark, null),
  };
  if (input.type === 'glyph') {
    return {
      type: 'glyph',
      ...base,
      set: input.set === 'brand' ? 'brand' : 'lucide',
      name: String(input.name || '').replace(/[^a-z0-9._-]/gi, '').slice(0, 80),
      mode: input.mode === 'fill' ? 'fill' : 'stroke',
      nodes: cleanNodes(input.nodes),
    };
  }
  if (input.type === 'menu') {
    // An icon from the portal's own set (the module icons), drawn by the frontend.
    const name = String(input.name || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
    if (!name) throw httpError(400, 'Invalid icon', 'INVALID_ICON');
    return { type: 'menu', ...base, name };
  }
  if (input.type === 'image') {
    if (!FILE.test(input.light || '')) throw httpError(400, 'Upload an icon', 'INVALID_ICON');
    return {
      type: 'image',
      ...base,
      style: ['plain', 'soft', 'solid'].includes(style) ? style : 'plain',
      light: input.light,
      dark: FILE.test(input.dark || '') ? input.dark : null,
    };
  }
  const text = String(input.text || '').trim().slice(0, 2);
  return { type: 'letter', ...base, text: text || '•' };
}

export function iconFiles(icon) {
  return icon?.type === 'image' ? [icon.light, icon.dark].filter(Boolean) : [];
}

const SIGNATURES = {
  png: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  svg: (b) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(b.toString('utf8', 0, 4096)),
};

/** Saves an uploaded icon after checking its real type. Returns the stored file name. */
export async function storeIcon(file) {
  if (!file?.buffer?.length) throw httpError(400, 'Choose a file', 'NO_FILE');
  if (file.buffer.length > 1024 * 1024) throw httpError(413, 'Icons are limited to 1 MB', 'FILE_TOO_LARGE');
  const ext = Object.keys(SIGNATURES).find((key) => SIGNATURES[key](file.buffer));
  if (!ext) throw httpError(400, 'Use PNG, SVG, WebP or JPEG', 'FILE_TYPE');
  const name = `${randomBytes(12).toString('hex')}.${ext}`;
  await mkdir(ICON_DIR(), { recursive: true });
  await writeFile(join(ICON_DIR(), name), file.buffer);
  return name;
}

export async function removeIconFiles(names) {
  for (const name of names) {
    if (FILE.test(name)) await unlink(join(ICON_DIR(), name)).catch(() => {});
  }
}

export async function readIcon(name) {
  if (!FILE.test(name || '')) return null;
  try {
    return { data: await readFile(join(ICON_DIR(), name)), ext: name.split('.').pop() };
  } catch {
    return null;
  }
}
