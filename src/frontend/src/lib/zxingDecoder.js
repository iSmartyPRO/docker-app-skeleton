/**
 * WebAssembly ZXing decoder — the fallback for browsers without the native
 * BarcodeDetector (iOS Safari, Firefox, desktop Chrome on Linux/Windows).
 * Loaded only through `import()` from barcodeDecoder.js: the JS glue and the
 * ~1 MB .wasm are separate assets, served from our own origin (no CDN; CSP-safe).
 */
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { normalizeFormat } from './scanBurst.js';

const ZXING_FORMATS = {
  ean_13: 'EAN13',
  ean_8: 'EAN8',
  upc_a: 'UPCA',
  upc_e: 'UPCE',
  code_128: 'Code128',
  code_39: 'Code39',
  code_93: 'Code93',
  codabar: 'Codabar',
  itf: 'ITF',
  qr_code: 'QRCode',
  data_matrix: 'DataMatrix',
  pdf417: 'PDF417',
  aztec: 'Aztec',
};

let ready = null;
function prepare() {
  if (!ready) {
    ready = prepareZXingModule({
      overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
      fireImmediately: true,
    }).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

/** Longest side of the frame handed to the decoder: enough for dense codes, fast on phones. */
const MAX_SIDE = 1024;

export async function createZxingDecoder(formats) {
  await prepare();
  const wanted = [...new Set(formats.map((f) => ZXING_FORMATS[f]).filter(Boolean))];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const options = { formats: wanted, tryHarder: true, tryRotate: true, maxNumberOfSymbols: 1 };

  return {
    kind: 'zxing',
    async detect(video) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return [];
      const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const results = await readBarcodes(ctx.getImageData(0, 0, w, h), options);
      return results.filter((r) => r.isValid && r.text).map((r) => ({ text: r.text, format: normalizeFormat(r.format) }));
    },
    dispose() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
