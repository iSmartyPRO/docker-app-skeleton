import { LANGUAGES, pick } from '../../i18n/languages';
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

/** Import columns: key → header in each language (the template uses the person's) and extra accepted spellings. */
export const ITEM_COLUMNS = [
  { key: 'name', ru: 'Наименование', en: 'Name', ky: 'Аталышы', tr: 'Adı', zh: '名称', aliases: ['наименование', 'название', 'name', 'позиция'] },
  { key: 'sku', ru: 'Артикул', en: 'SKU', ky: 'Артикул', tr: 'Stok kodu', zh: '物料编码', aliases: ['артикул', 'sku', 'код'] },
  { key: 'category', ru: 'Категория', en: 'Category', ky: 'Категория', tr: 'Kategori', zh: '类别', aliases: ['категория', 'category', 'группа'] },
  { key: 'unit', ru: 'Ед. изм.', en: 'Unit', ky: 'Өлч. бирд.', tr: 'Birim', zh: '单位', aliases: ['ед. изм.', 'ед.', 'единица', 'unit', 'ед изм'] },
  { key: 'units', ru: 'Доп. единицы', en: 'Extra units', ky: 'Кошумча бирдиктер', tr: 'Ek birimler', zh: '附加单位', aliases: ['доп. единицы', 'упаковки', 'extra units', 'units'] },
  { key: 'barcodes', ru: 'Штрихкоды', en: 'Barcodes', ky: 'Штрихкоддор', tr: 'Barkodlar', zh: '条形码', aliases: ['штрихкоды', 'штрихкод', 'barcodes', 'barcode', 'ean'] },
  { key: 'tracking', ru: 'Учёт', en: 'Tracking', ky: 'Эсепке алуу', tr: 'Takip', zh: '跟踪方式', aliases: ['учёт', 'учет', 'tracking', 'тип учёта'] },
  { key: 'brand', ru: 'Бренд', en: 'Brand', ky: 'Бренд', tr: 'Marka', zh: '品牌', aliases: ['бренд', 'brand', 'производитель'] },
  { key: 'supplier', ru: 'Поставщик', en: 'Supplier', ky: 'Жеткирүүчү', tr: 'Tedarikçi', zh: '供应商', aliases: ['поставщик', 'supplier'] },
  { key: 'price', ru: 'Цена', en: 'Price', ky: 'Баасы', tr: 'Fiyat', zh: '价格', aliases: ['цена', 'price', 'стоимость'] },
  { key: 'minQty', ru: 'Мин. остаток', en: 'Min stock', ky: 'Мин. калдык', tr: 'Asgari stok', zh: '最低库存', aliases: ['мин. остаток', 'минимум', 'min', 'min stock'] },
  { key: 'warehouse', ru: 'Склад', en: 'Warehouse', ky: 'Кампа', tr: 'Depo', zh: '仓库', aliases: ['склад', 'warehouse'] },
  { key: 'description', ru: 'Описание', en: 'Description', ky: 'Сүрөттөмө', tr: 'Açıklama', zh: '描述', aliases: ['описание', 'description'] },
];

export const OPENING_COLUMNS = [
  { key: 'sku', ru: 'Артикул', en: 'SKU', ky: 'Артикул', tr: 'Stok kodu', zh: '物料编码', aliases: ['артикул', 'sku', 'код'] },
  { key: 'barcode', ru: 'Штрихкод', en: 'Barcode', ky: 'Штрихкод', tr: 'Barkod', zh: '条形码', aliases: ['штрихкод', 'barcode', 'ean'] },
  { key: 'name', ru: 'Наименование', en: 'Name', ky: 'Аталышы', tr: 'Adı', zh: '名称', aliases: ['наименование', 'название', 'name'] },
  { key: 'qty', ru: 'Количество', en: 'Quantity', ky: 'Саны', tr: 'Miktar', zh: '数量', aliases: ['количество', 'кол-во', 'qty', 'quantity', 'остаток'] },
  { key: 'unit', ru: 'Ед. изм.', en: 'Unit', ky: 'Өлч. бирд.', tr: 'Birim', zh: '单位', aliases: ['ед. изм.', 'ед.', 'unit', 'единица'] },
  { key: 'price', ru: 'Цена', en: 'Price', ky: 'Баасы', tr: 'Fiyat', zh: '价格', aliases: ['цена', 'price', 'себестоимость'] },
  { key: 'batch', ru: 'Партия', en: 'Batch', ky: 'Партия', tr: 'Parti', zh: '批次', aliases: ['партия', 'batch'] },
  { key: 'expiresOn', ru: 'Годен до', en: 'Expires', ky: 'Жарактуулук мөөнөтү', tr: 'Son kullanma', zh: '有效期至', aliases: ['годен до', 'срок годности', 'expires', 'expiry'] },
  { key: 'bin', ru: 'Ячейка', en: 'Bin', ky: 'Уяча', tr: 'Lokasyon', zh: '库位', aliases: ['ячейка', 'bin', 'место'] },
  { key: 'inventoryNo', ru: 'Инв. номера', en: 'Inventory numbers', ky: 'Инвентардык номерлер', tr: 'Demirbaş numaraları', zh: '资产编号', aliases: ['инв. номера', 'инв. номер', 'инвентарный номер', 'inventory no', 'inventory numbers'] },
  { key: 'serialNo', ru: 'Серийные номера', en: 'Serial numbers', ky: 'Сериялык номерлер', tr: 'Seri numaraları', zh: '序列号', aliases: ['серийные номера', 'серийный номер', 'serial no', 'serial numbers'] },
];

// Case and spaces do not matter; Turkish dotted/dotless i match either way.
const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/\u0307/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ');

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
    // A header in any portal language, or one of the extra spellings.
    const col = columns.find((item) => item.key.toLowerCase() === n || LANGUAGES.some((language) => item[language.code] && norm(item[language.code]) === n) || item.aliases.some((alias) => norm(alias) === n));
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
  sheet.columns = columns.map((col) => ({ header: pick(col, locale), key: col.key, width: Math.max(14, col.ru.length + 4) }));
  sheet.addRow(example);
  sheet.getRow(1).font = { bold: true };
  download(await book.xlsx.writeBuffer(), filename);
}
