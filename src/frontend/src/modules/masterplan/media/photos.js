import { mpApi } from '../api';

/*
 * Photos from a phone on a construction site (spec §7.3): read the shooting
 * date and GPS from EXIF, shrink the picture in the browser (long side
 * ≤ 2560 px, JPEG) with a 480 px preview, and upload with retries so a weak
 * connection does not lose the report.
 */

const MAX_SIDE = 2560;
const THUMB_SIDE = 480;

/** DateTimeOriginal and GPS of a JPEG (null fields when absent). */
export async function readExif(file) {
  const out = { takenAt: null, lat: null, lng: null };
  try {
    if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name || '')) return out;
    const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (view.getUint16(0) !== 0xffd8) return out;
    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset);
      const size = view.getUint16(offset + 2);
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
        const tiff = offset + 10;
        const little = view.getUint16(tiff) === 0x4949;
        const u16 = (at) => view.getUint16(at, little);
        const u32 = (at) => view.getUint32(at, little);
        const ascii = (at, n) => {
          let s = '';
          for (let i = 0; i < n - 1 && at + i < view.byteLength; i += 1) s += String.fromCharCode(view.getUint8(at + i));
          return s;
        };
        const entries = (ifd) => {
          const list = new Map();
          const count = u16(tiff + ifd);
          for (let i = 0; i < count; i += 1) {
            const at = tiff + ifd + 2 + i * 12;
            list.set(u16(at), { type: u16(at + 2), count: u32(at + 4), value: at + 8 });
          }
          return list;
        };
        const rationals = (entry) => {
          const at = tiff + u32(entry.value);
          return [0, 1, 2].map((i) => u32(at + i * 8) / (u32(at + i * 8 + 4) || 1));
        };
        const ifd0 = entries(u32(tiff + 4));
        const exifPtr = ifd0.get(0x8769);
        if (exifPtr) {
          const exif = entries(u32(exifPtr.value));
          const original = exif.get(0x9003);
          if (original) {
            const text = ascii(tiff + u32(original.value), original.count);
            const m = text.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
            if (m) {
              const offsetTag = exif.get(0x9011);
              const zone = offsetTag ? ascii(offsetTag.count > 4 ? tiff + u32(offsetTag.value) : offsetTag.value, offsetTag.count) : '';
              const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${/^[+-]\d{2}:\d{2}$/.test(zone) ? zone : ''}`;
              const date = new Date(iso);
              if (!Number.isNaN(date.getTime())) out.takenAt = date.toISOString();
            }
          }
        }
        const gpsPtr = ifd0.get(0x8825);
        if (gpsPtr) {
          const gps = entries(u32(gpsPtr.value));
          const lat = gps.get(2);
          const lng = gps.get(4);
          if (lat && lng) {
            const [d1, m1, s1] = rationals(lat);
            const [d2, m2, s2] = rationals(lng);
            const latRef = String.fromCharCode(view.getUint8(gps.get(1)?.value || 0));
            const lngRef = String.fromCharCode(view.getUint8(gps.get(3)?.value || 0));
            out.lat = (d1 + m1 / 60 + s1 / 3600) * (latRef === 'S' ? -1 : 1);
            out.lng = (d2 + m2 / 60 + s2 / 3600) * (lngRef === 'W' ? -1 : 1);
          }
        }
        return out;
      }
      if ((marker & 0xff00) !== 0xff00) break;
      offset += 2 + size;
    }
  } catch {
    /* no EXIF */
  }
  return out;
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to an <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function draw(source, side, quality) {
  const w = source.width;
  const h = source.height;
  const k = Math.min(1, side / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve({ blob, width: canvas.width, height: canvas.height }), 'image/jpeg', quality));
}

/** A picture ready to upload: { file, thumb, width, height, takenAt, lat, lng }; other files pass as they are. */
export async function preparePhoto(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return { file, thumb: null };
  const exif = await readExif(file);
  try {
    const source = await decode(file);
    const main = await draw(source, MAX_SIDE, 0.85);
    const thumb = await draw(source, THUMB_SIDE, 0.75);
    source.close?.();
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return { file: new File([main.blob], name, { type: 'image/jpeg' }), thumb: thumb.blob, width: main.width, height: main.height, ...exif };
  } catch {
    return { file, thumb: null, ...exif };
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Uploads one file (prepared) with up to 4 tries on network errors and 5xx.
 * fields: { projectId, nodeId?, kind }. Returns the media record.
 */
export async function uploadMedia(prepared, fields, onProgress) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== null) form.append(key, String(value));
    for (const key of ['width', 'height', 'takenAt', 'lat', 'lng']) if (prepared[key] !== undefined && prepared[key] !== null) form.append(key, String(prepared[key]));
    form.append('file', prepared.file, prepared.file.name);
    if (prepared.thumb) form.append('thumb', prepared.thumb, 'thumb.jpg');
    try {
      const res = await mpApi.upload(form, (event) => onProgress?.(event.total ? event.loaded / event.total : 0));
      return res.data.media;
    } catch (err) {
      lastError = err;
      const status = err?.response?.status;
      if (status && status < 500) throw err;
      await wait([1000, 3000, 7000][attempt] || 7000);
    }
  }
  throw lastError;
}

/** Natural size of an image file (for plan backgrounds). */
export async function imageSize(file) {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const text = await file.text();
    const box = text.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    const w = text.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i);
    const h = text.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i);
    if (box) return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
    if (w && h) return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
    return { width: 1600, height: 1000 };
  }
  const source = await decode(file);
  const size = { width: source.width, height: source.height };
  source.close?.();
  return size;
}
