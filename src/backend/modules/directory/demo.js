import { registerDemo } from '../../services/demo.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { canonDn, childDn, parentDn } from './dn.js';
import { DEMO_BASE, DEMO_ROOT, generalizedStamp, randomGuid } from './demoDirectory.js';
import { UAC, kindOf, loginFromTemplate, toFileTime } from './logic.js';

/*
 * Demo data of the AD directory module: a neutral directory («Демо-каталог») in the table
 * ad_demo_objects — a head office, a construction site and a branch, each with Users /
 * Groups / Computers, a «Disabled» OU and two excluded OUs (Service, Admins) — with
 * accounts in every state the filters know (locked, disabled, password expired, never
 * signed in, inactive). Shown only while the AD integration is not set up; no LDAP call is
 * made. Two demo portal users are linked to AD accounts and, when the Employees demo is
 * there, three demo employees get AD accounts.
 */

const DAY = 86400000;
const ago = (days) => new Date(Date.now() - days * DAY);

/** The demo objects for a language: [{ dn, kind, attrs }] (attribute names in lower case, as stored). */
export function demoObjects(t, { now = new Date(), employees = [] } = {}) {
  const out = [];
  const company = t({ ru: 'ООО «Пример»', en: 'Example LLC' });
  const ou = (dn, description) => out.push({ dn, kind: 'ou', attrs: { objectclass: ['top', 'organizationalUnit'], ou: dn.split(',')[0].slice(3), description, whencreated: generalizedStamp(ago(400)) } });
  const container = (dn, description) => out.push({ dn, kind: 'container', attrs: { objectclass: ['top', 'container'], cn: dn.split(',')[0].slice(3), description } });
  const hq = `OU=HQ,${DEMO_ROOT}`;
  const site = `OU=North-Quarter,${DEMO_ROOT}`;
  const branch = `OU=Branch-East,${DEMO_ROOT}`;
  ou(`OU=Domain Controllers,${DEMO_BASE}`, t({ ru: 'Контроллеры домена', en: 'Domain controllers' }));
  container(`CN=Users,${DEMO_BASE}`, t({ ru: 'Встроенный контейнер', en: 'Built-in container' }));
  ou(DEMO_ROOT, t({ ru: 'Корень управления', en: 'Managed root' }));
  ou(hq, t({ ru: 'Центральный офис', en: 'Head office' }));
  ou(site, t({ ru: 'Объект «Северный квартал»', en: 'Site «North Quarter»' }));
  ou(branch, t({ ru: 'Филиал «Восток»', en: 'Branch «East»' }));
  for (const base of [hq, site]) for (const sub of ['Users', 'Groups', 'Computers']) ou(`OU=${sub},${base}`, null);
  for (const sub of ['Users', 'Groups']) ou(`OU=${sub},${branch}`, null);
  ou(`OU=Disabled,${DEMO_ROOT}`, t({ ru: 'Уволенные и отключённые', en: 'Offboarded and disabled' }));
  ou(`OU=Service,${DEMO_ROOT}`, t({ ru: 'Служебные учётные записи (скрыто)', en: 'Service accounts (hidden)' }));
  ou(`OU=Admins,${DEMO_ROOT}`, t({ ru: 'Администраторы (скрыто)', en: 'Administrators (hidden)' }));

  const users = new Map();
  const user = (key, where, person, extra = {}) => {
    const first = t(person.first);
    const last = t(person.last);
    const login = extra.login || loginFromTemplate('{f}.{last}', { first, last });
    const displayName = `${first} ${last}`;
    const dn = childDn('CN', displayName, where);
    const uac = UAC.NORMAL_ACCOUNT | (extra.disabled ? UAC.ACCOUNTDISABLE : 0) | (extra.neverExpires ? UAC.DONT_EXPIRE_PASSWORD : 0);
    const attrs = {
      objectclass: ['top', 'person', 'organizationalPerson', 'user'],
      cn: displayName,
      displayname: displayName,
      givenname: first,
      sn: last,
      samaccountname: login,
      userprincipalname: `${login}@example.local`,
      mail: extra.noMail ? undefined : `${login}@example.local`,
      title: person.title ? t(person.title) : undefined,
      department: person.department ? t(person.department) : undefined,
      company,
      telephonenumber: extra.phone,
      useraccountcontrol: String(uac),
      pwdlastset: extra.mustChange ? '0' : toFileTime(ago(extra.pwdAge ?? 20)),
      lastlogontimestamp: extra.lastLogon === null ? undefined : toFileTime(ago(extra.lastLogon ?? 1)),
      lockouttime: extra.locked ? toFileTime(new Date(now.getTime() - 10 * 60000)) : undefined,
      whencreated: generalizedStamp(ago(extra.created ?? 300)),
      objectguid: randomGuid(),
      admincount: extra.protected ? '1' : undefined,
      _employee: extra.employee ? String(extra.employee) : undefined,
    };
    Object.keys(attrs).forEach((name) => attrs[name] === undefined && delete attrs[name]);
    out.push({ dn, kind: 'user', attrs });
    users.set(key, dn);
    return dn;
  };

  const hqUsers = `OU=Users,${hq}`;
  const siteUsers = `OU=Users,${site}`;
  const branchUsers = `OU=Users,${branch}`;
  user('director', hqUsers, { first: { ru: 'Дмитрий', en: 'Daniel' }, last: { ru: 'Орлов', en: 'Walsh' }, title: { ru: 'Генеральный директор', en: 'Chief executive' }, department: { ru: 'Дирекция', en: 'Management' } }, { phone: '+1 555 0100' });
  user('accountant', hqUsers, { first: { ru: 'Анна', en: 'Anna' }, last: { ru: 'Смирнова', en: 'Smith' }, title: { ru: 'Главный бухгалтер', en: 'Chief accountant' }, department: { ru: 'Бухгалтерия', en: 'Accounting' } }, { phone: '+1 555 0101' });
  user('admin', hqUsers, { first: { ru: 'Игорь', en: 'Igor' }, last: { ru: 'Петров', en: 'Peterson' }, title: { ru: 'Системный администратор', en: 'System administrator' }, department: { ru: 'ИТ', en: 'IT' } }, { phone: '+1 555 0102', lastLogon: 0 });
  user('hr', hqUsers, { first: { ru: 'Мария', en: 'Maria' }, last: { ru: 'Кузнецова', en: 'Carter' }, title: { ru: 'Специалист по кадрам', en: 'HR specialist' }, department: { ru: 'Кадры', en: 'HR' } }, { locked: true });
  user('lawyer', hqUsers, { first: { ru: 'Олег', en: 'Oliver' }, last: { ru: 'Соколов', en: 'Fisher' }, title: { ru: 'Юрист', en: 'Lawyer' }, department: { ru: 'Юридический отдел', en: 'Legal' } }, { pwdAge: 120 });
  user('office', hqUsers, { first: { ru: 'Елена', en: 'Ellen' }, last: { ru: 'Волкова', en: 'Brooks' }, title: { ru: 'Офис-менеджер', en: 'Office manager' }, department: { ru: 'Администрация', en: 'Administration' } }, { mustChange: true, lastLogon: null, created: 3 });
  user('foreman', siteUsers, { first: { ru: 'Сергей', en: 'Samuel' }, last: { ru: 'Лебедев', en: 'Turner' }, title: { ru: 'Прораб', en: 'Site foreman' }, department: { ru: 'Строительство', en: 'Construction' } }, { phone: '+1 555 0110' });
  user('engineer', siteUsers, { first: { ru: 'Алексей', en: 'Alex' }, last: { ru: 'Морозов', en: 'Hunt' }, title: { ru: 'Инженер ПТО', en: 'Planning engineer' }, department: { ru: 'Строительство', en: 'Construction' } }, { lastLogon: 140, pwdAge: 60 });
  user('storekeeper', siteUsers, { first: { ru: 'Наталья', en: 'Natalie' }, last: { ru: 'Новикова', en: 'Stone' }, title: { ru: 'Кладовщик', en: 'Storekeeper' }, department: { ru: 'Склад', en: 'Warehouse' } }, { lastLogon: 2 });
  user('safety', siteUsers, { first: { ru: 'Руслан', en: 'Ryan' }, last: { ru: 'Ахметов', en: 'Kemp' }, title: { ru: 'Инженер по охране труда', en: 'Safety engineer' }, department: { ru: 'Строительство', en: 'Construction' } }, { disabled: true, lastLogon: 45 });
  user('sales', branchUsers, { first: { ru: 'Айгуль', en: 'Abby' }, last: { ru: 'Сабирова', en: 'Grant' }, title: { ru: 'Менеджер по продажам', en: 'Sales manager' }, department: { ru: 'Продажи', en: 'Sales' } }, { phone: '+1 555 0120' });
  user('sales2', branchUsers, { first: { ru: 'Тимур', en: 'Tom' }, last: { ru: 'Каримов', en: 'Wells' }, title: { ru: 'Менеджер по продажам', en: 'Sales manager' }, department: { ru: 'Продажи', en: 'Sales' } }, { lastLogon: 200, pwdAge: 200 });
  user('former', `OU=Disabled,${DEMO_ROOT}`, { first: { ru: 'Виктор', en: 'Victor' }, last: { ru: 'Белов', en: 'Price' }, title: { ru: 'Снабженец', en: 'Buyer' }, department: { ru: 'Снабжение', en: 'Procurement' } }, { disabled: true, lastLogon: 95 });
  user('svc1', `OU=Service,${DEMO_ROOT}`, { first: { ru: 'svc', en: 'svc' }, last: { ru: 'backup', en: 'backup' } }, { login: 'svc-backup', neverExpires: true, noMail: true });
  user('svc2', `OU=Service,${DEMO_ROOT}`, { first: { ru: 'svc', en: 'svc' }, last: { ru: 'scan', en: 'scan' } }, { login: 'svc-scan', neverExpires: true, noMail: true });
  user('adm', `OU=Admins,${DEMO_ROOT}`, { first: { ru: 'Игорь', en: 'Igor' }, last: { ru: 'Петров (админ)', en: 'Peterson (admin)' } }, { login: 'adm-ipetrov', protected: true, noMail: true });
  // Demo employees of the Employees module (when seeded) get accounts of their own.
  employees.slice(0, 3).forEach((employee, index) => {
    user(`employee${index}`, hqUsers, { first: { ru: employee.first_name, en: employee.first_name }, last: { ru: employee.last_name, en: employee.last_name }, title: { ru: employee.position || '', en: employee.position || '' } }, { employee: employee.id, lastLogon: 3 + index });
  });

  // Managers.
  const managerOf = { accountant: 'director', admin: 'director', hr: 'director', lawyer: 'director', office: 'director', foreman: 'director', engineer: 'foreman', storekeeper: 'foreman', safety: 'foreman', sales2: 'sales' };
  for (const [key, boss] of Object.entries(managerOf)) out.find((item) => item.dn === users.get(key)).attrs.manager = users.get(boss);

  const group = (where, name, members, { description, type = '-2147483646' } = {}) =>
    out.push({ dn: childDn('CN', name, where), kind: 'group', attrs: { objectclass: ['top', 'group'], cn: name, samaccountname: name, grouptype: type, description, member: members.map((key) => users.get(key)).filter(Boolean), objectguid: randomGuid(), whencreated: generalizedStamp(ago(380)) } });
  const hqGroups = `OU=Groups,${hq}`;
  const everyone = [...users.keys()].filter((key) => !['svc1', 'svc2', 'adm', 'former'].includes(key));
  group(hqGroups, 'All-Staff', everyone, { description: t({ ru: 'Все сотрудники', en: 'All staff' }) });
  group(hqGroups, 'HQ-Accounting', ['accountant'], { description: t({ ru: 'Бухгалтерия', en: 'Accounting' }) });
  group(hqGroups, 'HQ-HR', ['hr'], { description: t({ ru: 'Отдел кадров', en: 'HR department' }) });
  group(hqGroups, 'IT-Helpdesk', ['admin'], { description: t({ ru: 'Поддержка пользователей', en: 'User support' }) });
  group(hqGroups, 'Management', ['director', 'accountant', 'foreman'], { description: t({ ru: 'Руководители', en: 'Managers' }) });
  group(hqGroups, 'VPN-Users', ['director', 'accountant', 'admin', 'sales', 'engineer'], { description: t({ ru: 'Удалённый доступ', en: 'Remote access' }) });
  group(hqGroups, 'Printers-HQ', ['accountant', 'hr', 'office'], { description: t({ ru: 'Рассылка: принтеры офиса', en: 'Distribution: office printers' }), type: '2' });
  group(hqGroups, 'sg_hq_buh_full', ['accountant'], { description: 'W:\\Accounting;Full Access' });
  group(hqGroups, 'sg_hq_buh_read', ['director'], { description: 'W:\\Accounting;Read Only' });
  const siteGroups = `OU=Groups,${site}`;
  group(siteGroups, 'NQ-Site', ['foreman', 'engineer', 'storekeeper', 'safety'], { description: t({ ru: 'Команда объекта', en: 'Site team' }) });
  group(siteGroups, 'sg_nq_docs_read', ['foreman', 'engineer'], { description: 'G:\\North-Quarter\\Docs;Read Only' });
  group(`OU=Groups,${branch}`, 'Sales', ['sales', 'sales2'], { description: t({ ru: 'Отдел продаж', en: 'Sales team' }) });
  // Outside the root: shown in cards, never changed here.
  group(`CN=Users,${DEMO_BASE}`, 'Wi-Fi Corporate', ['accountant', 'director', 'admin'], { description: t({ ru: 'Корпоративный Wi-Fi', en: 'Corporate Wi-Fi' }) });

  const computer = (where, name, os, { disabled = false, lastLogon = 1 } = {}) =>
    out.push({
      dn: childDn('CN', name, where),
      kind: 'computer',
      attrs: {
        objectclass: ['top', 'person', 'organizationalPerson', 'user', 'computer'],
        cn: name,
        samaccountname: `${name}$`,
        dnshostname: `${name.toLowerCase()}.example.local`,
        operatingsystem: os,
        useraccountcontrol: String(UAC.WORKSTATION_TRUST_ACCOUNT | (disabled ? UAC.ACCOUNTDISABLE : 0)),
        lastlogontimestamp: toFileTime(ago(lastLogon)),
        whencreated: generalizedStamp(ago(500)),
        objectguid: randomGuid(),
      },
    });
  computer(`OU=Computers,${hq}`, 'HQ-PC-001', 'Windows 11 Pro');
  computer(`OU=Computers,${hq}`, 'HQ-PC-002', 'Windows 11 Pro', { lastLogon: 3 });
  computer(`OU=Computers,${hq}`, 'HQ-NB-003', 'Windows 10 Pro', { disabled: true, lastLogon: 160 });
  computer(`OU=Computers,${site}`, 'NQ-PC-001', 'Windows 11 Pro', { lastLogon: 5 });
  return out;
}

async function demoEmployees(ctx) {
  try {
    const ids = (await ctx.records('employees', 'employees')).map(Number).filter(Boolean);
    if (!ids.length) return [];
    const { rows } = await ctx.query(
      `SELECT e.id, e.first_name, e.last_name, p.name AS position FROM employees e LEFT JOIN emp_positions p ON p.id = e.position_id
        WHERE e.id = ANY($1::int[]) AND e.ad_account IS NULL AND e.status = 'active' ORDER BY e.id LIMIT 3`,
      [ids]
    );
    return rows;
  } catch {
    return [];
  }
}

/**
 * Undoes the employee links journalled in demo mode (ad_journal demo rows employee_link /
 * employee_unlink), newest first: a link goes back to the value before it (details.before;
 * none for rows older than that field) when the card still holds the demo login; an unlink
 * gets its login back when the card is still empty. Exported for tests.
 */
export async function revertDemoEmployeeLinks(run) {
  const { rows } = await run(
    `SELECT id, action, details FROM ad_journal WHERE demo = TRUE AND ok = TRUE AND action IN ('employee_link', 'employee_unlink') ORDER BY id DESC`
  );
  let reverted = 0;
  for (const row of rows) {
    const employeeId = Number(row.details?.employeeId) || 0;
    const login = row.details?.login || null;
    if (!employeeId || !login) continue;
    const result =
      row.action === 'employee_link'
        ? await run(`UPDATE employees SET ad_account = $3, updated_at = NOW() WHERE id = $1 AND LOWER(ad_account) = LOWER($2::text)`, [employeeId, login, row.details.before || null])
        : await run(`UPDATE employees SET ad_account = $2, updated_at = NOW() WHERE id = $1 AND ad_account IS NULL`, [employeeId, login]);
    reverted += result.rowCount || 0;
  }
  return reverted;
}

registerDemo({
  module: 'directory',
  describe: {
    ru: 'Демо-каталог AD: офис, объект и филиал с OU, 15 пользователей в разных состояниях, группы и компьютеры (только пока AD не настроен)',
    en: 'A demo AD directory: an office, a site and a branch with OUs, 15 users in different states, groups and computers (only while AD is not set up)',
  },
  after: ['employees'],
  async seed(ctx) {
    const cfg = parseSettings(await getSettings()).integrations.activeDirectory;
    // With a real directory the demo would never be shown: nothing to fill.
    if (cfg?.enabled && cfg.host && cfg.baseDn) return;
    const employees = await demoEmployees(ctx);
    for (const item of demoObjects(ctx.t, { employees })) {
      const { rows } = await ctx.query(
        `INSERT INTO ad_demo_objects (dn, canon, parent_canon, kind, attrs) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (canon) DO NOTHING RETURNING id`,
        [item.dn, canonDn(item.dn), canonDn(parentDn(item.dn)), item.kind || kindOf(item.attrs.objectclass), JSON.stringify(item.attrs)]
      );
      if (rows[0]) await ctx.track('ad_demo_objects', rows[0].id);
      if (rows[0] && item.attrs._employee) await ctx.query(`UPDATE employees SET ad_account = $2 WHERE id = $1 AND ad_account IS NULL`, [Number(item.attrs._employee), item.attrs.samaccountname]).catch(() => {});
    }
    // Two demo colleagues of the portal are linked to their AD accounts.
    for (const [key, login, name] of [
      ['anna', loginFromTemplate('{f}.{last}', { first: ctx.t({ ru: 'Анна', en: 'Anna' }), last: ctx.t({ ru: 'Смирнова', en: 'Smith' }) }), ctx.t({ ru: 'Анна Смирнова', en: 'Anna Smith' })],
      ['igor', loginFromTemplate('{f}.{last}', { first: ctx.t({ ru: 'Игорь', en: 'Igor' }), last: ctx.t({ ru: 'Петров', en: 'Peterson' }) }), ctx.t({ ru: 'Игорь Петров', en: 'Igor Peterson' })],
    ]) {
      const userId = await ctx.demoUser(key, { displayName: name });
      const { rows } = await ctx.query(`SELECT dn, attrs->>'objectguid' AS guid FROM ad_demo_objects WHERE LOWER(attrs->>'samaccountname') = LOWER($1)`, [login]);
      if (userId && rows[0]) await ctx.query(`UPDATE users SET auth_source = 'ldap', external_id = $2, directory_guid = $3
            WHERE id = $1 AND (auth_source IS NULL OR auth_source = 'local')
              AND NOT EXISTS (SELECT 1 FROM users other WHERE other.auth_source = 'ldap' AND LOWER(other.external_id) = LOWER($2::text))`, [userId, rows[0].dn, rows[0].guid]);
    }
  },
  async purge(ctx) {
    // Employee cards get their AD field back, demo users their local sign-in; everything made in the demo goes.
    // Links made by hand in the demo (card links, the wizard's «link to employee») are undone from the
    // journal, newest first, and only where the card still holds what the demo wrote.
    await revertDemoEmployeeLinks(ctx.query).catch((err) => console.warn('AD directory demo: reverting employee links failed:', err.message));
    await ctx
      .query(
        `UPDATE employees e SET ad_account = NULL FROM ad_demo_objects d
          WHERE d.kind = 'user' AND d.attrs ? '_employee' AND e.id = (d.attrs->>'_employee')::int AND LOWER(e.ad_account) = LOWER(d.attrs->>'samaccountname')`
      )
      .catch(() => {});
    await ctx.query(
      `UPDATE users SET auth_source = 'local', external_id = NULL, directory_guid = NULL
        WHERE auth_source = 'ldap' AND id IN (SELECT record_key::int FROM demo_records WHERE module = '_users' AND table_name = 'users')
          AND LOWER(external_id) IN (SELECT LOWER(dn) FROM ad_demo_objects)`
    );
    await ctx.query(`DELETE FROM ad_demo_objects`);
    await ctx.query(`DELETE FROM ad_journal WHERE demo = TRUE`);
  },
});
