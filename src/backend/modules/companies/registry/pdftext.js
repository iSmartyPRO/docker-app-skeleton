/** Plain text lines of a PDF (text layer), page by page — for registry extracts. */
export async function pdfLines(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false, useSystemFonts: false }).promise;
  const pages = [];
  for (let number = 1; number <= Math.min(doc.numPages, 20); number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const lines = [];
    let line = '';
    let lastY = null;
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line);
        line = '';
      }
      line += item.str;
      lastY = y;
    }
    lines.push(line);
    pages.push(lines.map((text) => text.trim()).filter(Boolean));
  }
  await doc.loadingTask?.destroy?.();
  return pages;
}
