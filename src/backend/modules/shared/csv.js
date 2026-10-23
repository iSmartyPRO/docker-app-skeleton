/* CSV export shared by modules (Procurement, Warehouse): formula-safe cells, `;` separated, with a BOM for Excel. */

/** A CSV cell: quoted, and formulas neutralised (=, +, -, @, tab, CR start a formula in Excel). */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = `'${text}`;
  return /[";\n\r,]/.test(text) || text !== String(value) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows → CSV text with a BOM (Excel opens UTF-8 right), `;` separated. */
export function toCsv(header, rows) {
  const line = (cells) => cells.map(csvCell).join(';');
  return `﻿${[line(header), ...rows.map(line)].join('\r\n')}\r\n`;
}
