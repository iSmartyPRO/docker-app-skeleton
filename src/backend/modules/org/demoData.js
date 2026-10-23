/* Demo org structure data (no side effects): used by org/demo.js and, through org/api.js, by the Employees demo. */

export const DEMO_UNITS = [
  { key: 'company', parent: null, type: 'company', code: 'EX', name: { ru: 'ООО «Пример»', en: 'Example LLC', ky: '«Мисал» ЖЧК', tr: 'Örnek Ltd. Şti.', zh: '“示例”有限责任公司' }, head: 'director', address: { ru: 'г. Пример, ул. Центральная, 1', en: '1 Central St, Example City', ky: 'Мисал ш., Борбордук к., 1', tr: 'Merkez Sok. No:1, Örnek Şehir', zh: '示例市中央街 1 号' } },
  { key: 'office', parent: 'company', type: 'office', code: 'EX-HQ', name: { ru: 'Центральный офис', en: 'Head office', ky: 'Борбордук кеңсе', tr: 'Genel merkez', zh: '总部' }, purposes: ['office'] },
  { key: 'finance', parent: 'office', type: 'department', code: 'EX-FIN', name: { ru: 'Финансовый отдел', en: 'Finance', ky: 'Финансы бөлүмү', tr: 'Finans', zh: '财务部' }, head: 'finance' },
  { key: 'hr', parent: 'office', type: 'department', code: 'EX-HR', name: { ru: 'Отдел кадров', en: 'Human resources', ky: 'Кадрлар бөлүмү', tr: 'İnsan kaynakları', zh: '人事部' }, head: 'hr' },
  { key: 'it', parent: 'office', type: 'department', code: 'EX-IT', name: { ru: 'ИТ-отдел', en: 'IT', ky: 'IT бөлүмү', tr: 'Bilgi teknolojileri', zh: 'IT 部' } },
  { key: 'supply', parent: 'office', type: 'department', code: 'EX-SUP', name: { ru: 'Отдел снабжения', en: 'Procurement', ky: 'Жабдуу бөлүмү', tr: 'Satın alma', zh: '采购部' }, purposes: ['warehouse'] },
  { key: 'north', parent: 'company', type: 'branch', code: 'EX-N', name: { ru: 'Филиал «Север»', en: 'North branch', ky: '«Түндүк» филиалы', tr: 'Kuzey şubesi', zh: '北方分公司' }, head: 'north', address: { ru: 'г. Северный, пр. Мира, 10', en: '10 Peace Ave, North Town', ky: 'Түндүк ш., Тынчтык пр., 10', tr: 'Barış Cad. No:10, Kuzey Kent', zh: '北城和平大道 10 号' } },
  { key: 'northSales', parent: 'north', type: 'department', code: 'EX-N-S', name: { ru: 'Отдел продаж', en: 'Sales', ky: 'Сатуу бөлүмү', tr: 'Satış', zh: '销售部' }, purposes: ['sales'] },
  { key: 'northSite', parent: 'north', type: 'site', code: 'EX-N-1', name: { ru: 'Объект «Северный квартал»', en: '«North Quarter» site', ky: '«Түндүк квартал» объектиси', tr: '«Kuzey Mahallesi» şantiyesi', zh: '“北区”工地' }, purposes: ['construction', 'warehouse'], head: 'foreman', address: { ru: 'г. Северный, ул. Строителей, 5', en: '5 Builders St, North Town', ky: 'Түндүк ш., Курулушчулар к., 5', tr: 'İnşaatçılar Sok. No:5, Kuzey Kent', zh: '北城建设者街 5 号' } },
  { key: 'south', parent: 'company', type: 'branch', code: 'EX-S', name: { ru: 'Филиал «Юг»', en: 'South branch', ky: '«Түштүк» филиалы', tr: 'Güney şubesi', zh: '南方分公司' }, head: 'south' },
  { key: 'southSales', parent: 'south', type: 'department', code: 'EX-S-S', name: { ru: 'Отдел продаж', en: 'Sales', ky: 'Сатуу бөлүмү', tr: 'Satış', zh: '销售部' }, purposes: ['sales'] },
  { key: 'southSite', parent: 'south', type: 'site', code: 'EX-S-1', name: { ru: 'Площадка «Южная»', en: '«South» yard', ky: '«Түштүк» аянтчасы', tr: '«Güney» sahası', zh: '“南区”场地' }, purposes: ['warehouse', 'production'] },
];

export const DEMO_HEADS = {
  director: { ru: 'Анна Демова', en: 'Anna Demo', ky: 'Анна Демова' },
  finance: { ru: 'Олег Счётов', en: 'Oleg Ledger', ky: 'Олег Счётов' },
  hr: { ru: 'Мария Кадрова', en: 'Maria People', ky: 'Мария Кадрова' },
  north: { ru: 'Игорь Северов', en: 'Igor North', ky: 'Игорь Северов' },
  south: { ru: 'Елена Южная', en: 'Elena South', ky: 'Елена Южная' },
  foreman: { ru: 'Пётр Прорабов', en: 'Peter Foreman', ky: 'Пётр Прорабов' },
};
