import QRCode from 'qrcode';
import { effectiveEcl, renderSvg } from './render';

/** The modules of `text` at error correction `ecl`: { size, version, get(x, y) }. Throws TOO_LONG. */
export function buildMatrix(text, ecl = 'M') {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: ecl });
    const { size, data } = qr.modules;
    return { size, version: qr.version, ecl, get: (x, y) => data[y * size + x] };
  } catch (err) {
    const error = new Error('Too much data for a QR code');
    error.code = 'TOO_LONG';
    throw error;
  }
}

/**
 * Text + design → { svg, width, height, warnings, version, ecl }, or
 * { error: 'EMPTY' | 'TOO_LONG' } without throwing (the preview shows why).
 */
export function drawCode(text, options = {}) {
  if (!text) return { error: 'EMPTY' };
  const ecl = effectiveEcl(options.design || {}, text);
  try {
    const matrix = buildMatrix(text, ecl);
    return { ...renderSvg(matrix, options), version: matrix.version, ecl };
  } catch (err) {
    return { error: err.code || 'TOO_LONG' };
  }
}
