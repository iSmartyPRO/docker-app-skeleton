import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { LOGO_ICONS } from './icons';

/*
 * Browser side of the renderer: the brand (theme colour and logos from
 * Settings → Appearance), pictures turned into data: URLs (an SVG file and a
 * PNG made from it must carry their logo inside), the scan check and exports.
 */

export const assetUrl = (file) => `/api/qr/assets/${file}`;

const images = new Map();

/** url → { href: data URL, aspect } (cached; null when it cannot be read). */
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (!images.has(url)) {
    images.set(
      url,
      fetch(url, { credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.blob();
        })
        .then(
          (blob) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            })
        )
        .then(
          (href) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve({ href, aspect: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1 });
              img.onerror = () => resolve({ href, aspect: 1 });
              img.src = href;
            })
        )
        .catch(() => {
          images.delete(url);
          return null;
        })
    );
  }
  return images.get(url);
}

function useImage(url) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    let alive = true;
    setImage(null);
    loadImage(url).then((value) => alive && setImage(value));
    return () => {
      alive = false;
    };
  }, [url]);
  return image;
}

function cssColor(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

/** The portal brand: { color, logo, logoDark, hasLogo }. */
export function useBrand() {
  const { settings } = useSettings();
  const appearance = settings?.appearance || {};
  const logo = useImage(appearance.logoUrl || null);
  const logoDark = useImage(appearance.logoDarkUrl || null);
  const color = cssColor('--da-primary', '#2563EB');
  return useMemo(
    () => ({ color, logo, logoDark: logoDark || logo, hasLogo: Boolean(appearance.logoUrl), hasDarkLogo: Boolean(appearance.logoDarkUrl) }),
    [color, logo, logoDark, appearance.logoUrl, appearance.logoDarkUrl]
  );
}

/** What fills the logo slot of a design: { logo } (an image) or { icon }. */
export function useLogoFill(logo, brand) {
  const upload = useImage(logo?.source === 'upload' && logo.file ? assetUrl(logo.file) : null);
  return useMemo(() => {
    switch (logo?.source) {
      case 'brand':
        return { logo: brand.logo };
      case 'brandDark':
        return { logo: brand.logoDark };
      case 'upload':
        return { logo: upload };
      case 'icon':
        return { icon: LOGO_ICONS[logo.icon] || LOGO_ICONS.link };
      default:
        return {};
    }
  }, [logo?.source, logo?.icon, brand.logo, brand.logoDark, upload]);
}

/* ── Raster, scan check, exports ───────────────────────────────────────── */

/** SVG markup → canvas of `px` pixels on the long side. */
export function rasterize(svg, width, height, px) {
  return new Promise((resolve, reject) => {
    const scale = px / Math.max(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

let zxing = null;
function loadReader() {
  if (!zxing) {
    zxing = Promise.all([import('zxing-wasm/reader'), import('zxing-wasm/reader/zxing_reader.wasm?url')])
      .then(async ([reader, wasm]) => {
        await reader.prepareZXingModule({
          overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasm.default : prefix + path) },
          fireImmediately: true,
        });
        return reader;
      })
      .catch((err) => {
        zxing = null;
        throw err;
      });
  }
  return zxing;
}

/**
 * Does the drawn code read back as `expected`? Decodes a small raster (like a
 * phone camera from arm's length) on a white page, without the decoder's
 * extra effort, so a pass here means ordinary phones read it too.
 * → 'ok' | 'fail' | 'unknown' (decoder unavailable).
 */
export async function scanCheck(svg, width, height, expected) {
  let reader;
  try {
    reader = await loadReader();
  } catch {
    return 'unknown';
  }
  try {
    const canvas = await rasterize(svg, width, height, 520);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // A transparent code is scanned on a white page.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const results = await reader.readBarcodes(data, { formats: ['QRCode'], tryHarder: false, tryRotate: false, tryInvert: true, maxNumberOfSymbols: 1 });
    return results.some((result) => result.text === expected) ? 'ok' : 'fail';
  } catch {
    return 'unknown';
  }
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function pngBlob(svg, width, height, px) {
  const canvas = await rasterize(svg, width, height, px);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** A file name from the code's name: letters, digits and dashes. */
export function fileName(name, ext) {
  const base = String(name || 'qr-code').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'qr-code';
  return `${base}.${ext}`;
}

export async function copyPng(svg, width, height) {
  const blob = await pngBlob(svg, width, height, 1024);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
