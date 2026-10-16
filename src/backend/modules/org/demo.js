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
  { key: 'company', parent: null, type: 'company', code: 'EX', name: { ru: 'ООО «Пример»', en: 'Example LLC' }, head: 'director', address: { ru: 'г. Пример, ул. Центральная, 1', en: '1 Central St, Example City' } },
  { key: 'office', parent: 'company', type: 'office', code: 'EX-HQ', name: { ru: 'Центральный офис', en: 'Head office' }, purposes: ['office'] },
  { key: 'finance', parent: 'office', type: 'department', code: 'EX-FIN', name: { ru: 'Финансовый отдел', en: 'Finance' }, head: 'finance' },
  { key: 'hr', parent: 'office', type: 'department', code: 'EX-HR', name: { ru: 'Отдел кадров', en: 'Human resources' }, head: 'hr' },
  { key: 'it', parent: 'office', type: 'department', code: 'EX-IT', name: { ru: 'ИТ-отдел', en: 'IT' } },
  { key: 'supply', parent: 'office', type: 'department', code: 'EX-SUP', name: { ru: 'Отдел снабжения', en: 'Procurement' }, purposes: ['warehouse'] },
  { key: 'north', parent: 'company', type: 'branch', code: 'EX-N', name: { ru: 'Филиал «Север»', en: 'North branch' }, head: 'north', address: { ru: 'г. Северный, пр. Мира, 10', en: '10 Peace Ave, North Town' } },
  { key: 'northSales', parent: 'north', type: 'department', code: 'EX-N-S', name: { ru: 'Отдел продаж', en: 'Sales' }, purposes: ['sales'] },
  { key: 'northSite', parent: 'north', type: 'site', code: 'EX-N-1', name: { ru: 'Объект «Северный квартал»', en: '«North Quarter» site' }, purposes: ['construction', 'warehouse'], head: 'foreman', address: { ru: 'г. Северный, ул. Строителей, 5', en: '5 Builders St, North Town' } },
  { key: 'south', parent: 'company', type: 'branch', code: 'EX-S', name: { ru: 'Филиал «Юг»', en: 'South branch' }, head: 'south' },
  { key: 'southSales', parent: 'south', type: 'department', code: 'EX-S-S', name: { ru: 'Отдел продаж', en: 'Sales' }, purposes: ['sales'] },
  { key: 'southSite', parent: 'south', type: 'site', code: 'EX-S-1', name: { ru: 'Площадка «Южная»', en: '«South» yard' }, purposes: ['warehouse', 'production'] },
];

export const DEMO_HEADS = {
  director: { ru: 'Анна Демова', en: 'Anna Demo' },
  finance: { ru: 'Олег Счётов', en: 'Oleg Ledger' },
  hr: { ru: 'Мария Кадрова', en: 'Maria People' },
  north: { ru: 'Игорь Северов', en: 'Igor North' },
  south: { ru: 'Елена Южная', en: 'Elena South' },
  foreman: { ru: 'Пётр Прорабов', en: 'Peter Foreman' },
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
  },
  async seed(ctx) {
    const { rows } = await ctx.query(`INSERT INTO legal_entities (name, short_name, note) VALUES ($1, $2, $3) RETURNING id`, [
      ctx.t({ ru: 'Общество с ограниченной ответственностью «Пример»', en: 'Example Limited Liability Company' }),
      ctx.t({ ru: 'ООО «Пример»', en: 'Example LLC' }),
      ctx.t({ ru: 'Демо-данные', en: 'Demo data' }),
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
