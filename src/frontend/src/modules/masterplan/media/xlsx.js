import { can } from '../lib';

/*
 * Excel in the browser (exceljs, loaded on demand like the KB sheet viewer):
 * the registry export, the import template and reading an import file
 * (.xlsx or .csv) into rows for POST /units/import.
 */

/** Import columns: key → Russian header (the template) and accepted header spellings. */
export const IMPORT_COLUMNS = [
  { key: 'code', ru: 'Код', en: 'Code', aliases: ['код', 'code', 'код объекта'] },
  { key: 'name', ru: 'Название', en: 'Name', aliases: ['название', 'name', 'наименование'] },
  { key: 'type', ru: 'Тип', en: 'Type', aliases: ['тип', 'type', 'тип объекта'] },
  { key: 'parent', ru: 'Родитель (код)', en: 'Parent (code)', aliases: ['родитель', 'родитель (код)', 'parent', 'parent (code)', 'линия', 'секция'] },
  { key: 'status', ru: 'Статус', en: 'Status', aliases: ['статус', 'status'] },
  { key: 'price', ru: 'Цена', en: 'Price', aliases: ['цена', 'price', 'стоимость'] },
  { key: 'currency', ru: 'Валюта', en: 'Currency', aliases: ['валюта', 'currency'] },
  { key: 'minPrice', ru: 'Мин. цена', en: 'Min price', aliases: ['мин. цена', 'минимальная цена', 'min price'] },
  { key: 'areaTotal', ru: 'Площадь, м²', en: 'Area, m²', aliases: ['площадь', 'площадь, м²', 'площадь м2', 'area', 'area, m²'] },
  { key: 'areaLiving', ru: 'Жилая, м²', en: 'Living area, m²', aliases: ['жилая', 'жилая, м²', 'living area'] },
  { key: 'areaPlot', ru: 'Участок, м²', en: 'Plot, m²', aliases: ['участок', 'участок, м²', 'площадь участка', 'plot', 'plot, m²'] },
  { key: 'areaTerrace', ru: 'Террасы, м²', en: 'Terraces, m²', aliases: ['террасы', 'террасы, м²', 'terrace'] },
  { key: 'rooms', ru: 'Комнат', en: 'Rooms', aliases: ['комнат', 'комнаты', 'rooms'] },
  { key: 'bedrooms', ru: 'Спален', en: 'Bedrooms', aliases: ['спален', 'спальни', 'bedrooms'] },
  { key: 'bathrooms', ru: 'Санузлов', en: 'Bathrooms', aliases: ['санузлов', 'санузлы', 'bathrooms'] },
  { key: 'levels', ru: 'Этажей в юните', en: 'Levels', aliases: ['этажей', 'этажей в юните', 'levels'] },
  { key: 'floor', ru: 'Этаж', en: 'Floor', aliases: ['этаж', 'floor'] },
  { key: 'number', ru: 'Номер', en: 'Number', aliases: ['номер', '№', 'number'] },
  { key: 'riser', ru: 'Стояк', en: 'Riser', aliases: ['стояк', 'riser'] },
  { key: 'finishing', ru: 'Отделка', en: 'Finishing', aliases: ['отделка', 'finishing'] },
];

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

const stamp = () => new Date().toISOString().slice(0, 10);

/** The registry as .xlsx with the columns the person may see. */
export async function exportXlsx(items, { t, project, caps }) {
  const ExcelJS = await excel();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(t('mp.nav.registry'));
  const cols = [
    { header: t('mp.reg.code'), key: 'code', width: 14, get: (n) => n.code },
    { header: t('mp.reg.name'), key: 'name', width: 26, get: (n) => n.name },
    { header: t('mp.reg.type'), key: 'type', width: 22, get: (n) => n.type?.name },
    can(caps, 'status.view') && { header: t('mp.reg.status'), key: 'status', width: 14, get: (n) => (n.unit?.status ? t(`mp.status.${n.unit.status}`) : '') },
    can(caps, 'price.view') && { header: t('mp.reg.price'), key: 'price', width: 14, get: (n) => n.unit?.price, numFmt: '#,##0' },
    can(caps, 'price.view') && { header: t('mp.reg.currency'), key: 'currency', width: 8, get: (n) => n.unit?.currency },
    can(caps, 'price.view') && { header: t('mp.reg.ppm'), key: 'ppm', width: 12, get: (n) => n.unit?.pricePerM2, numFmt: '#,##0' },
    can(caps, 'minprice.view') && { header: t('mp.card.minPrice'), key: 'minPrice', width: 14, get: (n) => n.unit?.minPrice, numFmt: '#,##0' },
    { header: t('mp.reg.area'), key: 'area', width: 11, get: (n) => n.unit?.areaTotal, numFmt: '0.0' },
    { header: t('mp.reg.plot'), key: 'plot', width: 11, get: (n) => n.unit?.areaPlot, numFmt: '0.0' },
    { header: t('mp.reg.rooms'), key: 'rooms', width: 8, get: (n) => n.unit?.rooms },
    { header: t('mp.reg.bedrooms'), key: 'bedrooms', width: 8, get: (n) => n.unit?.bedrooms },
    { header: t('mp.reg.floor'), key: 'floor', width: 7, get: (n) => n.unit?.floor },
    { header: t('mp.reg.finishing'), key: 'finishing', width: 14, get: (n) => (n.unit?.finishing ? t(`mp.finishing.${n.unit.finishing}`) : '') },
    can(caps, 'build.view') && { header: t('mp.reg.readiness'), key: 'readiness', width: 11, get: (n) => (n.readiness === null || n.readiness === undefined ? null : n.readiness / 100), numFmt: '0%' },
    can(caps, 'booking.view') && { header: t('mp.reg.manager'), key: 'manager', width: 20, get: (n) => n.unit?.manager?.name },
    (can(caps, 'clients.all') || can(caps, 'clients.own')) && { header: t('mp.reg.client'), key: 'client', width: 22, get: (n) => n.unit?.client?.name },
  ].filter(Boolean);
  sheet.columns = cols.map(({ header, key, width }) => ({ header, key, width }));
  for (const node of items) sheet.addRow(Object.fromEntries(cols.map((col) => [col.key, col.get(node) ?? null])));
  cols.forEach((col, index) => {
    if (col.numFmt) sheet.getColumn(index + 1).numFmt = col.numFmt;
  });
  const head = sheet.getRow(1);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3F8' } };
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  download(await book.xlsx.writeBuffer(), `${(project.code || project.name).replace(/[^\p{L}\p{N}_-]+/gu, '_')}-units-${stamp()}.xlsx`);
}

/** An import template with the headers and two example rows. */
export async function importTemplate(locale, types) {
  const ExcelJS = await excel();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Units');
  sheet.columns = IMPORT_COLUMNS.map((col) => ({ header: locale === 'ru' ? col.ru : col.en, key: col.key, width: Math.max(12, col.ru.length + 2) }));
  const cottage = types.find((type) => type.key === 'cottage')?.name || 'Коттедж';
  const apartment = types.find((type) => type.key === 'apartment')?.name || 'Квартира';
  sheet.addRow({ code: 'A-1-01', name: 'Коттедж «Модерн 220»', type: cottage, parent: 'A-1', status: 'Свободно', price: 250000, currency: 'USD', areaTotal: 220, areaPlot: 1200, rooms: 6, bedrooms: 4, bathrooms: 3, levels: 2, finishing: 'pso' });
  sheet.addRow({ code: 'H1-101', name: 'Кв. 101', type: apartment, parent: 'H1-S1', status: 'Свободно', price: 90000, currency: 'USD', areaTotal: 64, rooms: 2, floor: 1, number: '101', riser: 1, finishing: 'whitebox' });
  sheet.getRow(1).font = { bold: true };
  const help = book.addWorksheet(locale === 'ru' ? 'Справка' : 'Help');
  help.columns = [{ width: 24 }, { width: 80 }];
  help.addRow([locale === 'ru' ? 'Типы' : 'Types', types.map((type) => type.name).join('; ')]);
  help.addRow([locale === 'ru' ? 'Статус' : 'Status', locale === 'ru' ? 'Свободно или Не в продаже' : 'free or not_for_sale']);
  help.addRow([locale === 'ru' ? 'Отделка' : 'Finishing', 'pso, rough, whitebox, turnkey, furnished']);
  help.addRow([locale === 'ru' ? 'Родитель' : 'Parent', locale === 'ru' ? 'Код существующего узла (линии, секции) или строки выше' : 'Code of an existing node or of a row above']);
  download(await book.xlsx.writeBuffer(), `masterplan-import-template.xlsx`);
}

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
  const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
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

/**
 * Reads an .xlsx / .csv file: → { headers: [{ text, key|null }], rows: [{ key: value }] }.
 * Headers are matched to IMPORT_COLUMNS by name (Russian or English).
 */
export async function readImportFile(file) {
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
    const col = IMPORT_COLUMNS.find((item) => item.key.toLowerCase() === n || norm(item.ru) === n || norm(item.en) === n || item.aliases.includes(n));
    return { text: String(text), key: col?.key || null };
  });
  const rows = table.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header.key, values[index] ?? '']).filter(([key]) => key)));
  return { headers, rows: rows.filter((row) => Object.values(row).some((value) => String(value).trim())) };
}
