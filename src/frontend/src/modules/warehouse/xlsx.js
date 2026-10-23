/* Warehouse import columns (the generic xlsx/csv helpers are core: lib/xlsx.js). */
export { exportXlsx, importTemplate, readImportFile } from '../../lib/xlsx';

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
