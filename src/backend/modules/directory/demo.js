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
  const company = t({ ru: 'ООО «Пример»', en: 'Example LLC', ky: '«Мисал» ЖЧК', tr: 'Örnek Ltd. Şti.', zh: '“示例”有限责任公司' });
  const ou = (dn, description) => out.push({ dn, kind: 'ou', attrs: { objectclass: ['top', 'organizationalUnit'], ou: dn.split(',')[0].slice(3), description, whencreated: generalizedStamp(ago(400)) } });
  const container = (dn, description) => out.push({ dn, kind: 'container', attrs: { objectclass: ['top', 'container'], cn: dn.split(',')[0].slice(3), description } });
  const hq = `OU=HQ,${DEMO_ROOT}`;
  const site = `OU=North-Quarter,${DEMO_ROOT}`;
  const branch = `OU=Branch-East,${DEMO_ROOT}`;
  ou(`OU=Domain Controllers,${DEMO_BASE}`, t({ ru: 'Контроллеры домена', en: 'Domain controllers', ky: 'Домен контроллерлери', tr: 'Etki alanı denetleyicileri', zh: '域控制器' }));
  container(`CN=Users,${DEMO_BASE}`, t({ ru: 'Встроенный контейнер', en: 'Built-in container', ky: 'Орнотулган контейнер', tr: 'Yerleşik kapsayıcı', zh: '内置容器' }));
  ou(DEMO_ROOT, t({ ru: 'Корень управления', en: 'Managed root', ky: 'Башкаруу тамыры', tr: 'Yönetilen kök', zh: '受管根节点' }));
  ou(hq, t({ ru: 'Центральный офис', en: 'Head office', ky: 'Борбордук кеңсе', tr: 'Genel merkez', zh: '总部' }));
  ou(site, t({ ru: 'Объект «Северный квартал»', en: 'Site «North Quarter»', ky: '«Түндүк квартал» объектиси', tr: '«Kuzey Mahallesi» şantiyesi', zh: '“北区”工地' }));
  ou(branch, t({ ru: 'Филиал «Восток»', en: 'Branch «East»', ky: '«Чыгыш» филиалы', tr: 'Doğu şubesi', zh: '东方分公司' }));
  for (const base of [hq, site]) for (const sub of ['Users', 'Groups', 'Computers']) ou(`OU=${sub},${base}`, null);
  for (const sub of ['Users', 'Groups']) ou(`OU=${sub},${branch}`, null);
  ou(`OU=Disabled,${DEMO_ROOT}`, t({ ru: 'Уволенные и отключённые', en: 'Offboarded and disabled', ky: 'Бошотулгандар жана өчүрүлгөндөр', tr: 'İşten ayrılanlar ve devre dışı bırakılanlar', zh: '已离职和已停用' }));
  ou(`OU=Service,${DEMO_ROOT}`, t({ ru: 'Служебные учётные записи (скрыто)', en: 'Service accounts (hidden)', ky: 'Кызматтык эсептик жазуулар (жашырылган)', tr: 'Hizmet hesapları (gizli)', zh: '服务账户（隐藏）' }));
  ou(`OU=Admins,${DEMO_ROOT}`, t({ ru: 'Администраторы (скрыто)', en: 'Administrators (hidden)', ky: 'Администраторлор (жашырылган)', tr: 'Yöneticiler (gizli)', zh: '管理员（隐藏）' }));

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
  user('director', hqUsers, { first: { ru: 'Дмитрий', en: 'Daniel', ky: 'Дмитрий' }, last: { ru: 'Орлов', en: 'Walsh', ky: 'Орлов' }, title: { ru: 'Генеральный директор', en: 'Chief executive', ky: 'Башкы директор', tr: 'Genel müdür', zh: '首席执行官' }, department: { ru: 'Дирекция', en: 'Management', ky: 'Дирекция', tr: 'Üst yönetim', zh: '管理层' } }, { phone: '+1 555 0100' });
  user('accountant', hqUsers, { first: { ru: 'Анна', en: 'Anna', ky: 'Анна' }, last: { ru: 'Смирнова', en: 'Smith', ky: 'Смирнова' }, title: { ru: 'Главный бухгалтер', en: 'Chief accountant', ky: 'Башкы бухгалтер', tr: 'Mali işler müdürü', zh: '总会计师' }, department: { ru: 'Бухгалтерия', en: 'Accounting', ky: 'Бухгалтерия', tr: 'Muhasebe', zh: '财务部' } }, { phone: '+1 555 0101' });
  user('admin', hqUsers, { first: { ru: 'Игорь', en: 'Igor', ky: 'Игорь' }, last: { ru: 'Петров', en: 'Peterson', ky: 'Петров' }, title: { ru: 'Системный администратор', en: 'System administrator', ky: 'Системалык администратор', tr: 'Sistem yöneticisi', zh: '系统管理员' }, department: { ru: 'ИТ', en: 'IT', ky: 'IT', tr: 'BT', zh: 'IT' } }, { phone: '+1 555 0102', lastLogon: 0 });
  user('hr', hqUsers, { first: { ru: 'Мария', en: 'Maria', ky: 'Мария' }, last: { ru: 'Кузнецова', en: 'Carter', ky: 'Кузнецова' }, title: { ru: 'Специалист по кадрам', en: 'HR specialist', ky: 'Кадрлар боюнча адис', tr: 'İK uzmanı', zh: '人事专员' }, department: { ru: 'Кадры', en: 'HR', ky: 'Кадрлар', tr: 'İK', zh: '人事' } }, { locked: true });
  user('lawyer', hqUsers, { first: { ru: 'Олег', en: 'Oliver', ky: 'Олег' }, last: { ru: 'Соколов', en: 'Fisher', ky: 'Соколов' }, title: { ru: 'Юрист', en: 'Lawyer', ky: 'Юрист', tr: 'Hukukçu', zh: '律师' }, department: { ru: 'Юридический отдел', en: 'Legal', ky: 'Юридикалык бөлүм', tr: 'Hukuk', zh: '法务部' } }, { pwdAge: 120 });
  user('office', hqUsers, { first: { ru: 'Елена', en: 'Ellen', ky: 'Елена' }, last: { ru: 'Волкова', en: 'Brooks', ky: 'Волкова' }, title: { ru: 'Офис-менеджер', en: 'Office manager', ky: 'Офис-менеджер', tr: 'Ofis yöneticisi', zh: '行政主管' }, department: { ru: 'Администрация', en: 'Administration', ky: 'Администрация', tr: 'İdare', zh: '行政部' } }, { mustChange: true, lastLogon: null, created: 3 });
  user('foreman', siteUsers, { first: { ru: 'Сергей', en: 'Samuel', ky: 'Сергей' }, last: { ru: 'Лебедев', en: 'Turner', ky: 'Лебедев' }, title: { ru: 'Прораб', en: 'Site foreman', ky: 'Прораб', tr: 'Şantiye şefi', zh: '工长' }, department: { ru: 'Строительство', en: 'Construction', ky: 'Курулуш', tr: 'İnşaat', zh: '施工' } }, { phone: '+1 555 0110' });
  user('engineer', siteUsers, { first: { ru: 'Алексей', en: 'Alex', ky: 'Алексей' }, last: { ru: 'Морозов', en: 'Hunt', ky: 'Морозов' }, title: { ru: 'Инженер ПТО', en: 'Planning engineer', ky: 'Өндүрүштүк-техникалык бөлүмдүн инженери', tr: 'Planlama mühendisi', zh: '计划工程师' }, department: { ru: 'Строительство', en: 'Construction', ky: 'Курулуш', tr: 'İnşaat', zh: '施工' } }, { lastLogon: 140, pwdAge: 60 });
  user('storekeeper', siteUsers, { first: { ru: 'Наталья', en: 'Natalie', ky: 'Наталья' }, last: { ru: 'Новикова', en: 'Stone', ky: 'Новикова' }, title: { ru: 'Кладовщик', en: 'Storekeeper', ky: 'Кампачы', tr: 'Depo sorumlusu', zh: '仓管员' }, department: { ru: 'Склад', en: 'Warehouse', ky: 'Кампа', tr: 'Depo', zh: '仓库' } }, { lastLogon: 2 });
  user('safety', siteUsers, { first: { ru: 'Руслан', en: 'Ryan', ky: 'Руслан' }, last: { ru: 'Ахметов', en: 'Kemp', ky: 'Ахметов' }, title: { ru: 'Инженер по охране труда', en: 'Safety engineer', ky: 'Эмгекти коргоо боюнча инженер', tr: 'İş güvenliği uzmanı', zh: '安全工程师' }, department: { ru: 'Строительство', en: 'Construction', ky: 'Курулуш', tr: 'İnşaat', zh: '施工' } }, { disabled: true, lastLogon: 45 });
  user('sales', branchUsers, { first: { ru: 'Айгуль', en: 'Abby', ky: 'Айгуль' }, last: { ru: 'Сабирова', en: 'Grant', ky: 'Сабирова' }, title: { ru: 'Менеджер по продажам', en: 'Sales manager', ky: 'Сатуу менеджери', tr: 'Satış temsilcisi', zh: '销售代表' }, department: { ru: 'Продажи', en: 'Sales', ky: 'Сатуу', tr: 'Satış', zh: '销售' } }, { phone: '+1 555 0120' });
  user('sales2', branchUsers, { first: { ru: 'Тимур', en: 'Tom', ky: 'Тимур' }, last: { ru: 'Каримов', en: 'Wells', ky: 'Каримов' }, title: { ru: 'Менеджер по продажам', en: 'Sales manager', ky: 'Сатуу менеджери', tr: 'Satış temsilcisi', zh: '销售代表' }, department: { ru: 'Продажи', en: 'Sales', ky: 'Сатуу', tr: 'Satış', zh: '销售' } }, { lastLogon: 200, pwdAge: 200 });
  user('former', `OU=Disabled,${DEMO_ROOT}`, { first: { ru: 'Виктор', en: 'Victor', ky: 'Виктор' }, last: { ru: 'Белов', en: 'Price', ky: 'Белов' }, title: { ru: 'Снабженец', en: 'Buyer', ky: 'Жабдуучу', tr: 'Satın almacı', zh: '采购员' }, department: { ru: 'Снабжение', en: 'Procurement', ky: 'Жабдуу', tr: 'Satın alma', zh: '采购' } }, { disabled: true, lastLogon: 95 });
  user('svc1', `OU=Service,${DEMO_ROOT}`, { first: { ru: 'svc', en: 'svc' }, last: { ru: 'backup', en: 'backup' } }, { login: 'svc-backup', neverExpires: true, noMail: true });
  user('svc2', `OU=Service,${DEMO_ROOT}`, { first: { ru: 'svc', en: 'svc' }, last: { ru: 'scan', en: 'scan' } }, { login: 'svc-scan', neverExpires: true, noMail: true });
  user('adm', `OU=Admins,${DEMO_ROOT}`, { first: { ru: 'Игорь', en: 'Igor', ky: 'Игорь' }, last: { ru: 'Петров (админ)', en: 'Peterson (admin)', ky: 'Петров (админ)' } }, { login: 'adm-ipetrov', protected: true, noMail: true });
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
  group(hqGroups, 'All-Staff', everyone, { description: t({ ru: 'Все сотрудники', en: 'All staff', ky: 'Бардык кызматкерлер', tr: 'Tüm çalışanlar', zh: '全体员工' }) });
  group(hqGroups, 'HQ-Accounting', ['accountant'], { description: t({ ru: 'Бухгалтерия', en: 'Accounting', ky: 'Бухгалтерия', tr: 'Muhasebe', zh: '财务部' }) });
  group(hqGroups, 'HQ-HR', ['hr'], { description: t({ ru: 'Отдел кадров', en: 'HR department', ky: 'Кадрлар бөлүмү', tr: 'İK departmanı', zh: '人事部' }) });
  group(hqGroups, 'IT-Helpdesk', ['admin'], { description: t({ ru: 'Поддержка пользователей', en: 'User support', ky: 'Колдонуучуларды колдоо', tr: 'Kullanıcı desteği', zh: '用户支持' }) });
  group(hqGroups, 'Management', ['director', 'accountant', 'foreman'], { description: t({ ru: 'Руководители', en: 'Managers', ky: 'Жетекчилер', tr: 'Yöneticiler', zh: '管理人员' }) });
  group(hqGroups, 'VPN-Users', ['director', 'accountant', 'admin', 'sales', 'engineer'], { description: t({ ru: 'Удалённый доступ', en: 'Remote access', ky: 'Алыстан кирүү', tr: 'Uzaktan erişim', zh: '远程访问' }) });
  group(hqGroups, 'Printers-HQ', ['accountant', 'hr', 'office'], { description: t({ ru: 'Рассылка: принтеры офиса', en: 'Distribution: office printers', ky: 'Таратуу: кеңсенин принтерлери', tr: 'Dağıtım: ofis yazıcıları', zh: '通讯组：办公室打印机' }), type: '2' });
  group(hqGroups, 'sg_hq_buh_full', ['accountant'], { description: 'W:\\Accounting;Full Access' });
  group(hqGroups, 'sg_hq_buh_read', ['director'], { description: 'W:\\Accounting;Read Only' });
  const siteGroups = `OU=Groups,${site}`;
  group(siteGroups, 'NQ-Site', ['foreman', 'engineer', 'storekeeper', 'safety'], { description: t({ ru: 'Команда объекта', en: 'Site team', ky: 'Объекттин командасы', tr: 'Şantiye ekibi', zh: '工地团队' }) });
  group(siteGroups, 'sg_nq_docs_read', ['foreman', 'engineer'], { description: 'G:\\North-Quarter\\Docs;Read Only' });
  group(`OU=Groups,${branch}`, 'Sales', ['sales', 'sales2'], { description: t({ ru: 'Отдел продаж', en: 'Sales team', ky: 'Сатуу бөлүмү', tr: 'Satış ekibi', zh: '销售团队' }) });
  // Outside the root: shown in cards, never changed here.
  group(`CN=Users,${DEMO_BASE}`, 'Wi-Fi Corporate', ['accountant', 'director', 'admin'], { description: t({ ru: 'Корпоративный Wi-Fi', en: 'Corporate Wi-Fi', ky: 'Корпоративдик Wi-Fi', tr: 'Kurumsal Wi-Fi', zh: '企业 Wi-Fi' }) });

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
    ky: 'Демо AD каталогу: OU\'лары бар кеңсе, объект жана филиал, ар кандай абалдагы 15 колдонуучу, топтор жана компьютерлер (AD жөндөлө элек кезде гана)',
    tr: 'Bir demo AD dizini: OU\'larıyla bir ofis, bir şantiye ve bir şube, farklı durumlarda 15 kullanıcı, gruplar ve bilgisayarlar (yalnızca AD ayarlanmamışken)',
    zh: '演示 AD 目录：包含 OU 的办公室、工地和分公司，15 个不同状态的用户、组和计算机（仅在未配置 AD 时）',
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
      ['anna', loginFromTemplate('{f}.{last}', { first: ctx.t({ ru: 'Анна', en: 'Anna', ky: 'Анна' }), last: ctx.t({ ru: 'Смирнова', en: 'Smith', ky: 'Смирнова' }) }), ctx.t({ ru: 'Анна Смирнова', en: 'Anna Smith', ky: 'Анна Смирнова' })],
      ['igor', loginFromTemplate('{f}.{last}', { first: ctx.t({ ru: 'Игорь', en: 'Igor', ky: 'Игорь' }), last: ctx.t({ ru: 'Петров', en: 'Peterson', ky: 'Петров' }) }), ctx.t({ ru: 'Игорь Петров', en: 'Igor Peterson', ky: 'Игорь Петров' })],
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
