/**
 * Keyboard-wedge scanner detection (USB / Bluetooth scanners that "type" the code).
 *
 * A scanner sends the characters of a code a few milliseconds apart and ends
 * with Enter; a person types far slower. The detector keeps the current burst
 * of fast keystrokes and reports it as a code when Enter arrives in time.
 *
 * Pure and DOM-free: the React hook (`useScannerInput`) feeds it key events,
 * node:test feeds it synthetic ones.
 */

export const SCAN_TERMINATORS = ['Enter', 'NumpadEnter'];

/** True for a key that a scanner may type as part of a code (one printable character, no modifiers). */
export function isScanCharKey(event) {
  if (!event || typeof event.key !== 'string') return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1 && event.key >= ' ';
}

/**
 * @param {object} [options]
 * @param {number} [options.minLength=4]    shortest code that counts as a scan
 * @param {number} [options.maxInterval=35] max ms between two characters of one burst
 * @param {number} [options.enterGrace]     max ms between the last character and Enter
 *                                          (some scanners pause before the suffix); default 3 × maxInterval, at least 80
 * @returns {{ push(event: {key: string, time: number, ctrlKey?, metaKey?, altKey?}): (string|null), reset(): void, readonly length: number }}
 *   `push` returns the code when this key completes a scan, otherwise null.
 */
export function createBurstDetector({ minLength = 4, maxInterval = 35, enterGrace } = {}) {
  const grace = enterGrace ?? Math.max(maxInterval * 3, 80);
  let chars = [];
  let last = -Infinity;

  const reset = () => {
    chars = [];
    last = -Infinity;
  };

  return {
    get length() {
      return chars.length;
    },
    reset,
    push(event) {
      const time = Number(event?.time) || 0;
      if (SCAN_TERMINATORS.includes(event?.key)) {
        const code = chars.join('');
        const inTime = time - last <= grace;
        reset();
        return inTime && code.length >= minLength ? code : null;
      }
      if (!isScanCharKey(event)) {
        // Shift alone (scanners send it for capitals) does not break a burst; anything else does.
        if (event?.key !== 'Shift') reset();
        return null;
      }
      if (time - last > maxInterval) chars = [];
      chars.push(event.key);
      last = time;
      return null;
    },
  };
}

/**
 * Same-code debounce for continuous camera scanning: `accept(code, time)` is
 * false while the same code is seen again within `windowMs` of its last sighting.
 */
export function createRepeatGuard(windowMs = 1200) {
  const seen = new Map();
  return {
    accept(code, time) {
      const prev = seen.get(code);
      seen.set(code, time);
      if (seen.size > 64) seen.delete(seen.keys().next().value);
      return prev == null || time - prev > windowMs;
    },
    reset() {
      seen.clear();
    },
  };
}

const FORMAT_ALIASES = {
  ean13: 'ean_13',
  ean8: 'ean_8',
  upca: 'upc_a',
  upce: 'upc_e',
  code128: 'code_128',
  code39: 'code_39',
  code39std: 'code_39',
  code39ext: 'code_39',
  code93: 'code_93',
  codabar: 'codabar',
  itf: 'itf',
  itf14: 'itf',
  qrcode: 'qr_code',
  qrcodemodel2: 'qr_code',
  microqrcode: 'qr_code',
  datamatrix: 'data_matrix',
  pdf417: 'pdf417',
  aztec: 'aztec',
  azteccode: 'aztec',
};

/** Normalizes decoder format names ("EAN-13", "EAN13", "ean_13", "QRCode") to BarcodeDetector names ("ean_13", "qr_code"). */
export function normalizeFormat(format) {
  const key = String(format || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return FORMAT_ALIASES[key] || key || 'unknown';
}
