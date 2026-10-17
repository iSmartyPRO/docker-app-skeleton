import { registerDemo } from '../../services/demo.js';
import { createUnit, updateUnit } from './service.js';

/*
 * Demo org structure (spec §8): a neutral company «ООО «Пример»» with a
 * central office, two branches, departments and two sites. Heads are demo
 * colleagues (no password), so «руководитель подразделения» works in
 * Approvals without the Employees module. The Employees demo builds on it
 * (modules/employees/demo.js finds the units by their `key`).
 */

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

/** Creates a unit; a code another (real) unit already uses is dropped instead of failing the demo. */
async function create(ctx, input) {
  try {
    return await createUnit(ctx.request, input);
  } catch (err) {
    if (err.code !== 'CODE_TAKEN') throw err;
    return createUnit(ctx.request, { ...input, code: null });
  }
}

registerDemo({
  module: 'org',
  describe: {
    ru: '«ООО «Пример»»: центральный офис с отделами, два филиала и два объекта, руководители — демо-коллеги',
    en: '«Example LLC»: a head office with departments, two branches and two sites, demo colleagues as heads',
    ky: '«Мисал» ЖЧК: бөлүмдөрү бар борбордук кеңсе, эки филиал жана эки объект, жетекчилер — демо кесиптештер',
    tr: '«Örnek Ltd. Şti.»: departmanlarıyla bir genel merkez, iki şube ve iki şantiye; yöneticiler demo iş arkadaşları',
    zh: '“示例”有限责任公司：设有各部门的总部、两家分公司和两个工地，负责人为演示同事',
  },
  async seed(ctx) {
    const { rows } = await ctx.query(`INSERT INTO legal_entities (name, short_name, note) VALUES ($1, $2, $3) RETURNING id`, [
      ctx.t({ ru: 'Общество с ограниченной ответственностью «Пример»', en: 'Example Limited Liability Company', ky: '«Мисал» жоопкерчилиги чектелген коому', tr: 'Örnek Limited Şirketi', zh: '“示例”有限责任公司' }),
      ctx.t({ ru: 'ООО «Пример»', en: 'Example LLC', ky: '«Мисал» ЖЧК', tr: 'Örnek Ltd. Şti.', zh: '“示例”有限责任公司' }),
      ctx.t({ ru: 'Демо-данные', en: 'Demo data', ky: 'Демо маалыматтар', tr: 'Demo verileri', zh: '演示数据' }),
    ]);
    await ctx.track('legal_entities', rows[0].id);
    const ids = {};
    for (const def of DEMO_UNITS) {
      const unit = await create(ctx, {
        name: ctx.t(def.name),
        type: def.type,
        code: def.code,
        parentId: def.parent ? ids[def.parent] : null,
        legalEntityId: def.type === 'company' ? rows[0].id : null,
        address: def.address ? ctx.t(def.address) : null,
        purposes: def.purposes || [],
        status: 'active',
      });
      ids[def.key] = unit.id;
      await ctx.track('org_units', unit.id);
    }
    // Heads: demo colleagues placed in their units (the light link of portal accounts).
    for (const def of DEMO_UNITS.filter((item) => item.head)) {
      const userId = await ctx.demoUser(`org.${def.head}`, { displayName: ctx.t(DEMO_HEADS[def.head]) });
      await ctx.query(`UPDATE users SET org_unit_id = $2 WHERE id = $1`, [userId, ids[def.key]]);
      await updateUnit(ctx.request, ids[def.key], { headUserId: userId });
    }
  },
});
