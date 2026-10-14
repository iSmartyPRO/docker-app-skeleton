/*
 * Excel in the browser (exceljs, loaded on demand like the Masterplan import):
 * report exports and reading import files (.xlsx or .csv) into rows. Report
 * data comes from the server already without sums for people without
 * warehouse.cost. Strings are written as text cells, never as formulas; a
 * leading = + - @ is still escaped with an apostrophe as in the CSV exports.
 */

async function excel() {
  const { default: ExcelJS } = await import('exceljs');
  return ExcelJS;
}

function download(buffer, name) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const guard = (value) => (typeof value === 'string' && /^[=+\-@\t\r]/.test(value) && !/^-?\d+([.,]\d+)?$/.test(value) ? `'${value}` : value);

/** columns: [{ header, key, width?, numFmt? }], rows: plain objects. */
export async function exportXlsx({ sheet: sheetName, columns, rows, filename }) {
  const ExcelJS = await excel();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(String(sheetName || 'Report').slice(0, 31));
  sheet.columns = columns.map(({ header, key, width }) => ({ header, key, width: width || Math.max(10, String(header).length + 2) }));
  for (const row of rows) sheet.addRow(Object.fromEntries(columns.map((col) => [col.key, guard(row[col.key] ?? null)])));
  columns.forEach((col, index) => {
    if (col.numFmt) sheet.getColumn(index + 1).numFmt = col.numFmt;
  });
  const head = sheet.getRow(1);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3F8' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  download(await book.xlsx.writeBuffer(), filename);
}

/** Import columns: key → accepted header spellings (Russian or English). */
export const ITEM_COLUMNS = [
  { key: 'name', ru: 'Наименование', en: 'Name', aliases: ['наименование', 'название', 'name', 'позиция'] },
  { key: 'sku', ru: 'Артикул', en: 'SKU', aliases: ['артикул', 'sku', 'код'] },
  { key: 'category', ru: 'Категория', en: 'Category', aliases: ['категория', 'category', 'группа'] },
  { key: 'unit', ru: 'Ед. изм.', en: 'Unit', aliases: ['ед. изм.', 'ед.', 'единица', 'unit', 'ед изм'] },
  { key: 'units', ru: 'Доп. единицы', en: 'Extra units', aliases: ['доп. единицы', 'упаковки', 'extra units', 'units'] },
  { key: 'barcodes', ru: 'Штрихкоды', en: 'Barcodes', aliases: ['штрихкоды', 'штрихкод', 'barcodes', 'barcode', 'ean'] },
  { key: 'tracking', ru: 'Учёт', en: 'Tracking', aliases: ['учёт', 'учет', 'tracking', 'тип учёта'] },
  { key: 'brand', ru: 'Бренд', en: 'Brand', aliases: ['бренд', 'brand', 'производитель'] },
  { key: 'supplier', ru: 'Поставщик', en: 'Supplier', aliases: ['поставщик', 'supplier'] },
  { key: 'price', ru: 'Цена', en: 'Price', aliases: ['цена', 'price', 'стоимость'] },
  { key: 'minQty', ru: 'Мин. остаток', en: 'Min stock', aliases: ['мин. остаток', 'минимум', 'min', 'min stock'] },
  { key: 'warehouse', ru: 'Склад', en: 'Warehouse', aliases: ['склад', 'warehouse'] },
  { key: 'description', ru: 'Описание', en: 'Description', aliases: ['описание', 'description'] },
];

export const OPENING_COLUMNS = [
  { key: 'sku', ru: 'Артикул', en: 'SKU', aliases: ['артикул', 'sku', 'код'] },
  { key: 'barcode', ru: 'Штрихкод', en: 'Barcode', aliases: ['штрихкод', 'barcode', 'ean'] },
  { key: 'name', ru: 'Наименование', en: 'Name', aliases: ['наименование', 'название', 'name'] },
  { key: 'qty', ru: 'Количество', en: 'Quantity', aliases: ['количество', 'кол-во', 'qty', 'quantity', 'остаток'] },
  { key: 'unit', ru: 'Ед. изм.', en: 'Unit', aliases: ['ед. изм.', 'ед.', 'unit', 'единица'] },
  { key: 'price', ru: 'Цена', en: 'Price', aliases: ['цена', 'price', 'себестоимость'] },
  { key: 'batch', ru: 'Партия', en: 'Batch', aliases: ['партия', 'batch'] },
  { key: 'expiresOn', ru: 'Годен до', en: 'Expires', aliases: ['годен до', 'срок годности', 'expires', 'expiry'] },
  { key: 'bin', ru: 'Ячейка', en: 'Bin', aliases: ['ячейка', 'bin', 'место'] },
  { key: 'inventoryNo', ru: 'Инв. номера', en: 'Inventory numbers', aliases: ['инв. номера', 'инв. номер', 'инвентарный номер', 'inventory no', 'inventory numbers'] },
  { key: 'serialNo', ru: 'Серийные номера', en: 'Serial numbers', aliases: ['серийные номера', 'серийный номер', 'serial no', 'serial numbers'] },
];

const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((part) => part.text).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function parseCsv(text) {
  const first = text.split('\n')[0];
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => String(value).trim()));
}

/** Reads an .xlsx / .csv file → { headers: [{ text, key|null }], rows: [{ key: value }] } by the given columns. */
export async function readImportFile(file, columns) {
  let table;
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    table = parseCsv((await file.text()).replace(/^﻿/, ''));
  } else {
    const ExcelJS = await excel();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    const sheet = book.worksheets[0];
    table = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = [];
      for (let c = 1; c <= sheet.columnCount; c += 1) values.push(cellText(row.getCell(c).value));
      table.push(values);
    });
  }
  if (!table.length) return { headers: [], rows: [] };
  const headers = table[0].map((text) => {
    const n = norm(text);
    const col = columns.find((item) => item.key.toLowerCase() === n || norm(item.ru) === n || norm(item.en) === n || item.aliases.includes(n));
    return { text: String(text), key: col?.key || null };
  });
  const rows = table.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header.key, values[index] ?? '']).filter(([key]) => key)));
  return { headers, rows: rows.filter((row) => Object.values(row).some((value) => String(value).trim())) };
}

/** A template with the headers and an example row. */
export async function importTemplate(columns, example, locale, filename) {
  const ExcelJS = await excel();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Import');
  sheet.columns = columns.map((col) => ({ header: locale === 'ru' ? col.ru : col.en, key: col.key, width: Math.max(14, col.ru.length + 4) }));
  sheet.addRow(example);
  sheet.getRow(1).font = { bold: true };
  download(await book.xlsx.writeBuffer(), filename);
}
