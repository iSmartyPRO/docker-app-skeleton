// Copies pdf.js runtime assets (WASM image decoders, CMaps, standard fonts)
// into public/pdfjs so the PDF viewer can load them from the same origin.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../node_modules/pdfjs-dist');
const target = resolve(here, '../public/pdfjs');

if (!existsSync(source)) process.exit(0);
mkdirSync(target, { recursive: true });
for (const dir of ['wasm', 'cmaps', 'standard_fonts']) {
  if (existsSync(resolve(source, dir))) cpSync(resolve(source, dir), resolve(target, dir), { recursive: true });
}
console.log('pdf.js assets copied to public/pdfjs');
