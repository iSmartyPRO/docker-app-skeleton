import { registerDemo } from '../../services/demo.js';
import { createUnit, updateUnit } from './service.js';

/*
 * Demo org structure (spec §8): a neutral company «ООО «Пример»» with a
 * central office, two branches, departments and two sites. Heads are demo
 * colleagues (no password), so «руководитель подразделения» works in
 * Approvals without the Employees module. The Employees demo builds on it
 * (modules/employees/demo.js finds the units by their `key`).
 */

import { DEMO_HEADS, DEMO_UNITS } from './demoData.js';

export { DEMO_HEADS, DEMO_UNITS };

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
