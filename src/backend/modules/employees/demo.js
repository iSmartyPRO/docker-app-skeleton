import { registerDemo, seedModule } from '../../services/demo.js';
import { DEMO_HEADS, DEMO_UNITS } from '../org/demo.js';
import { portalToday, syncUser } from './service.js';

/*
 * Demo employees (spec §8): about 25 people of «ООО «Пример»» across the
 * central office, two branches and two sites — heads and office staff with
 * demo portal accounts, site workers without portal access, a candidate, a
 * person on vacation and a terminated one; clearances that expire soon or
 * have expired; birthdays and work anniversaries in the coming days.
 * Builds on the org structure demo (seeded first when it is not there yet).
 */

const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** A date `years` ago shifted to `inDays` from today (birthdays and anniversaries soon). */
const yearsAgo = (today, years, inDays = 40) => {
  const shifted = addDays(today, inDays);
  return `${Number(shifted.slice(0, 4)) - years}${shifted.slice(4)}`;
};

const POSITIONS = {
  ceo: { ru: 'Генеральный директор', en: 'Chief executive' },
  cfo: { ru: 'Главный бухгалтер', en: 'Chief accountant' },
  accountant: { ru: 'Бухгалтер', en: 'Accountant' },
  hrHead: { ru: 'Руководитель отдела кадров', en: 'Head of HR' },
  hrSpecialist: { ru: 'Специалист по кадрам', en: 'HR specialist' },
  sysadmin: { ru: 'Системный администратор', en: 'System administrator' },
  developer: { ru: 'Программист', en: 'Developer' },
  buyer: { ru: 'Менеджер по закупкам', en: 'Buyer' },
  branchHead: { ru: 'Директор филиала', en: 'Branch director' },
  sales: { ru: 'Менеджер по продажам', en: 'Sales manager' },
  foreman: { ru: 'Прораб', en: 'Foreman' },
  installer: { ru: 'Монтажник', en: 'Installer' },
  welder: { ru: 'Сварщик', en: 'Welder' },
  crane: { ru: 'Машинист крана', en: 'Crane operator' },
  concrete: { ru: 'Бетонщик', en: 'Concrete worker' },
  storekeeper: { ru: 'Кладовщик', en: 'Storekeeper' },
  forklift: { ru: 'Водитель погрузчика', en: 'Forklift driver' },
  electrician: { ru: 'Электрик', en: 'Electrician' },
  officeManager: { ru: 'Офис-менеджер', en: 'Office manager' },
};

const CLEARANCES = {
  height: { ru: 'Допуск к работам на высоте', en: 'Work at height' },
  welding: { ru: 'Аттестация сварщика', en: 'Welder certification' },
  crane: { ru: 'Удостоверение машиниста крана', en: 'Crane operator licence' },
  forklift: { ru: 'Удостоверение водителя погрузчика', en: 'Forklift licence' },
  electrical: { ru: 'Группа по электробезопасности', en: 'Electrical safety group' },
  firstAid: { ru: 'Первая помощь', en: 'First aid' },
};

// [key, last, first, middle (ru), last, first (en), position, unit, site, extra]
const PEOPLE = [
  ['director', 'Демова', 'Анна', 'Сергеевна', 'Demo', 'Anna', 'ceo', 'company', null, { account: 'director', hireYears: 8, birthIn: 3 }],
  ['finance', 'Счётов', 'Олег', 'Иванович', 'Ledger', 'Oleg', 'cfo', 'finance', null, { account: 'finance', manager: 'director', hireYears: 6 }],
  ['accountant', 'Цифрова', 'Светлана', 'Петровна', 'Numbers', 'Svetlana', 'accountant', 'finance', null, { account: 'accountant', manager: 'finance', hireYears: 2, hireIn: 5 }],
  ['hr', 'Кадрова', 'Мария', 'Андреевна', 'People', 'Maria', 'hrHead', 'hr', null, { account: 'hr', manager: 'director', hireYears: 5 }],
  ['hr2', 'Анкетова', 'Ирина', 'Олеговна', 'Forms', 'Irina', 'hrSpecialist', 'hr', null, { manager: 'hr', status: 'vacation', hireYears: 1, birthIn: 9 }],
  ['it', 'Сетевой', 'Денис', 'Викторович', 'Network', 'Denis', 'sysadmin', 'it', null, { account: 'it', manager: 'director', hireYears: 3 }],
  ['dev', 'Кодов', 'Кирилл', 'Алексеевич', 'Code', 'Kirill', 'developer', 'it', null, { manager: 'it', employment: 'part_time', hireYears: 1 }],
  ['buyer', 'Закупова', 'Татьяна', 'Николаевна', 'Supply', 'Tatiana', 'buyer', 'supply', null, { manager: 'director', hireYears: 4 }],
  ['north', 'Северов', 'Игорь', 'Павлович', 'North', 'Igor', 'branchHead', 'north', null, { account: 'north', manager: 'director', hireYears: 7, hireIn: 2 }],
  ['sales1', 'Продажин', 'Алексей', 'Дмитриевич', 'Seller', 'Alexey', 'sales', 'northSales', null, { account: 'sales1', manager: 'north', hireYears: 2 }],
  ['sales2', 'Клиентова', 'Наталья', 'Игоревна', 'Client', 'Natalia', 'sales', 'northSales', null, { status: 'candidate' }],
  ['foreman', 'Прорабов', 'Пётр', 'Ильич', 'Foreman', 'Peter', 'foreman', 'northSite', 'northSite', { account: 'foreman', manager: 'north', hireYears: 4, skills: [['firstAid', 300]] }],
  ['installer', 'Монтажов', 'Сергей', 'Юрьевич', 'Fitter', 'Sergey', 'installer', 'northSite', 'northSite', { manager: 'foreman', hireYears: 2, skills: [['height', 5]] }],
  ['welder', 'Сварщиков', 'Виктор', 'Романович', 'Welder', 'Victor', 'welder', 'northSite', 'northSite', { manager: 'foreman', hireYears: 3, skills: [['welding', -3], ['height', 120]] }],
  ['crane', 'Крановщиков', 'Николай', 'Борисович', 'Crane', 'Nikolay', 'crane', 'northSite', 'northSite', { manager: 'foreman', employment: 'contractor', skills: [['crane', 20]] }],
  ['concrete', 'Бетонов', 'Роман', 'Сергеевич', 'Concrete', 'Roman', 'concrete', 'northSite', 'northSite', { manager: 'foreman', employment: 'seasonal', birthIn: 1 }],
  ['store1', 'Кладовщиков', 'Андрей', 'Васильевич', 'Store', 'Andrey', 'storekeeper', 'northSite', 'northSite', { manager: 'foreman', hireYears: 1 }],
  ['south', 'Южная', 'Елена', 'Михайловна', 'South', 'Elena', 'branchHead', 'south', null, { account: 'south', manager: 'director', hireYears: 5 }],
  ['sales3', 'Сделкина', 'Ольга', 'Александровна', 'Deal', 'Olga', 'sales', 'southSales', null, { account: 'sales3', manager: 'south', hireYears: 3, birthIn: 12 }],
  ['sales4', 'Торгов', 'Павел', 'Геннадьевич', 'Trade', 'Pavel', 'sales', 'southSales', null, { manager: 'south', hireYears: 1 }],
  ['store2', 'Складов', 'Григорий', 'Ефимович', 'Yard', 'Grigory', 'storekeeper', 'southSite', 'southSite', { manager: 'south', hireYears: 6, skills: [['forklift', 25]] }],
  ['forklift', 'Погрузчиков', 'Михаил', 'Степанович', 'Lift', 'Mikhail', 'forklift', 'southSite', 'southSite', { manager: 'store2', hireYears: 2, skills: [['forklift', 365]] }],
  ['electrician', 'Электриков', 'Юрий', 'Тимофеевич', 'Volt', 'Yuri', 'electrician', 'southSite', 'southSite', { manager: 'store2', hireYears: 4, skills: [['electrical', 7], ['height', 60]] }],
  ['former', 'Старов', 'Василий', 'Кузьмич', 'Former', 'Vasily', 'installer', 'northSite', 'northSite', { manager: 'foreman', status: 'terminated', hireYears: 3, terminatedDaysAgo: 20 }],
  ['office', 'Офисова', 'Людмила', 'Фёдоровна', 'Office', 'Lyudmila', 'officeManager', 'office', null, { manager: 'director', hireYears: 2 }],
];

registerDemo({
  module: 'employees',
  describe: {
    ru: '25 сотрудников «ООО «Пример»»: офис, два филиала и объекты; часть без доступа к порталу; допуски, которые скоро истекают',
    en: '25 employees of «Example LLC»: office, two branches and sites; some without portal access; clearances expiring soon',
  },
  after: ['org'],
  async seed(ctx) {
    // The org structure demo first (the units the people work in).
    let unitIds = await ctx.records('org_units', 'org');
    if (!unitIds.length) {
      await seedModule('org', ctx.request);
      unitIds = await ctx.records('org_units', 'org');
    }
    const { rows: unitRows } = await ctx.query(`SELECT id FROM org_units WHERE id = ANY($1)`, [unitIds]);
    const alive = new Set(unitRows.map((row) => row.id));
    const units = {};
    // Units were tracked in DEMO_UNITS order, so the n-th tracked id is the n-th definition.
    DEMO_UNITS.forEach((def, index) => {
      if (alive.has(unitIds[index])) units[def.key] = unitIds[index];
    });
    const today = await portalToday();

    const positions = {};
    for (const [key, name] of Object.entries(POSITIONS)) {
      const label = ctx.t(name);
      const made = await ctx.query(`INSERT INTO emp_positions (name, sort) VALUES ($1, $2) ON CONFLICT ((LOWER(name))) DO NOTHING RETURNING id`, [label, Object.keys(POSITIONS).indexOf(key) * 10 + 10]);
      if (made.rows[0]) {
        positions[key] = made.rows[0].id;
        await ctx.track('emp_positions', made.rows[0].id);
      } else {
        positions[key] = (await ctx.query(`SELECT id FROM emp_positions WHERE LOWER(name) = LOWER($1)`, [label])).rows[0].id;
      }
    }

    const ids = {};
    let number = 0;
    for (const [key, lastRu, firstRu, middleRu, lastEn, firstEn, position, unit, site, extra] of PEOPLE) {
      number += 1;
      // Russian names for a Russian portal, English ones for every other language.
      const en = ctx.locale !== 'ru';
      const status = extra.status || 'active';
      const hireDate = extra.hireYears ? yearsAgo(today, extra.hireYears, extra.hireIn ?? 40 + number) : status === 'candidate' ? null : addDays(today, -120 - number * 3);
      const birthDate = yearsAgo(today, 24 + ((number * 7) % 30), extra.birthIn ?? 20 + number * 9);
      const email = `demo.emp${String(number).padStart(2, '0')}@example.com`;
      const { rows } = await ctx.query(
        `INSERT INTO employees (last_name, first_name, middle_name, position_id, unit_id, site_id, personnel_no, hire_date, termination_date, birth_date, status, employment, work_email, work_phone, personal_phone, hr_notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
        [
          en ? lastEn : lastRu,
          en ? firstEn : firstRu,
          en ? null : middleRu,
          positions[position],
          units[unit] || null,
          site ? units[site] || null : null,
          `DEMO-${String(number).padStart(3, '0')}`,
          hireDate,
          status === 'terminated' ? addDays(today, -(extra.terminatedDaysAgo || 10)) : null,
          birthDate,
          status,
          extra.employment || 'staff',
          site ? null : email,
          `+1 555 01${String(number).padStart(2, '0')}`,
          `+1 555 02${String(number).padStart(2, '0')}`,
          number % 6 === 0 ? ctx.t({ ru: 'Демо: заметка отдела кадров.', en: 'Demo: an HR note.' }) : null,
          ctx.userId,
        ]
      );
      ids[key] = rows[0].id;
      await ctx.track('employees', rows[0].id);
      for (const [clearance, inDays] of extra.skills || []) {
        await ctx.query(`INSERT INTO emp_skills (employee_id, kind, name, number, issued_on, expires_on) VALUES ($1, 'clearance', $2, $3, $4, $5)`, [
          rows[0].id,
          ctx.t(CLEARANCES[clearance]),
          `№ ${100 + number}-${clearance.length}`,
          addDays(today, inDays - 365),
          addDays(today, inDays),
        ]);
      }
      if (extra.account) {
        const names = DEMO_HEADS[extra.account] || { ru: `${firstRu} ${lastRu}`, en: `${firstEn} ${lastEn}` };
        const userKey = DEMO_HEADS[extra.account] ? `org.${extra.account}` : `emp.${extra.account}`;
        const userId = await ctx.demoUser(userKey, { displayName: ctx.t(names) });
        const free = await ctx.query(`SELECT 1 FROM employees WHERE user_id = $1`, [userId]);
        if (!free.rows.length) {
          await ctx.query(`UPDATE employees SET user_id = $2 WHERE id = $1`, [rows[0].id, userId]);
          await syncUser({ query: ctx.query }, rows[0].id);
        }
      }
    }
    for (const [key, , , , , , , , , extra] of PEOPLE) {
      if (extra.manager && ids[extra.manager]) await ctx.query(`UPDATE employees SET manager_id = $2 WHERE id = $1`, [ids[key], ids[extra.manager]]);
    }
  },
});
