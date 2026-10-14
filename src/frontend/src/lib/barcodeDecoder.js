/**
 * Picks the barcode decoder for this browser: the native BarcodeDetector when it
 * supports the requested formats (Chrome on Android / macOS / ChromeOS, Edge),
 * otherwise the lazily loaded WebAssembly ZXing (see zxingDecoder.js).
 *
 * decoder.detect(videoElement) → Promise<[{ text, format }]>, format in BarcodeDetector names.
 */
import { normalizeFormat } from './scanBurst.js';

export const DEFAULT_SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix'];

async function nativeDecoder(formats) {
  const Detector = typeof window !== 'undefined' ? window.BarcodeDetector : undefined;
  if (!Detector) return null;
  try {
    const supported = await Detector.getSupportedFormats();
    const use = formats.filter((f) => supported.includes(f));
    // Without the 1D retail formats the native detector is not good enough here.
    if (!use.includes('qr_code') || !use.includes('ean_13') || !use.includes('code_128')) return null;
    const detector = new Detector({ formats: use });
    return {
      kind: 'native',
      async detect(video) {
        const found = await detector.detect(video);
        return found.filter((r) => r.rawValue).map((r) => ({ text: r.rawValue, format: normalizeFormat(r.format) }));
      },
      dispose() {},
    };
  } catch {
    return null;
  }
}

/** @param {string[]} [formats] @param {{ preferNative?: boolean }} [options] */
export async function createBarcodeDecoder(formats = DEFAULT_SCAN_FORMATS, { preferNative = true } = {}) {
  if (preferNative) {
    const native = await nativeDecoder(formats);
    if (native) return native;
  }
  const { createZxingDecoder } = await import('./zxingDecoder.js');
  return createZxingDecoder(formats);
}
