/**
 * Module manifests (spec docs/specs/platform-2.0.ru.md §1.2, §1.4).
 *
 * One plain object per module, keyed by id, with the facts the platform needs
 * to reason about modules: version, category, hard requirements, optional
 * links, the minimum core version and a short changelog. Settings defaults,
 * sanitizers and permissions stay in catalog.js (merged in by moduleManifest()).
 * No imports, so anything (settings, permissions, tests, the System page) can
 * read it without loading module code.
 *
 * The client gets the same objects from GET /api/admin/modules and adds its
 * own UI parts (icon, settings screen, admin docs, tour) from
 * src/frontend/src/modules/manifest.js.
 *
 * Shape (docs/extending.md «Module manifest»):
 *
 *   tasks: {
 *     name:        { en, ru },                  // fallback name (the UI uses i18n apps.<id>.name)
 *     version:     '1.0.0',                     // semver of the module, independent of the core VERSION
 *     category:    'work',                      // one of CATEGORIES
 *     minCore:     '1.4.0',                     // lowest core VERSION this module runs on
 *     requires:    [{ id: 'approvals', reason: { en, ru } }        // another module: must be on
 *                   { integration: 'activeDirectory', reason }],    // an integration: must be on (Settings → Integrations);
 *                                                                   //   `demo: true` — may be switched on without it (setup page / demo data)
 *     enhances:    [{ id: 'calendar', what: { en, ru } }],          // optional link: works without it, the feature hides
 *     docs:        { user: 'tasks', guide: 'docs/tasks.md' },       // help article id (/help/<user>) and the developer doc
 *     changelog:   [{ version: '1.0.0', date: '2026-10-16', changes: { en: [...], ru: [...] } }],  // newest first, a few entries
 *   }
 *
 * Version bump rules: patch for fixes, minor for new features and new
 * settings with defaults, major for changes that need an administrator's
 * attention (removed settings, a data migration that cannot be undone, an API
 * change). Add a changelog entry with every bump; keep the last 5.
 */

/** Categories of the «Modules» page, in display order (labels: i18n platform.categories.<id>). */
export const CATEGORIES = ['work', 'documents', 'sales', 'supply', 'construction', 'people', 'infrastructure'];

/** Integrations a manifest may name in `requires` / `enhances` (keys of settings.integrations). */
export const INTEGRATIONS = ['email', 'telegram', 'whatsapp', 'wazzup', 'mattermost', 'google', 'documents', 'activeDirectory'];

const FIRST = '2026-10-16';
const first = (en, ru) => [{ version: '1.0.0', date: FIRST, changes: { en, ru } }];
const APPROVALS = {
  id: 'approvals',
  reason: { en: 'Documents go through approval routes', ru: 'Документы проходят маршруты согласования' },
};

export const MODULE_MANIFEST = {
  approvals: {
    name: { en: 'Approvals', ru: 'Согласования' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [],
    docs: { user: 'approvals', guide: 'docs/approvals.md' },
    changelog: first(
      ['Routes with conditions, urgency and SLA, substitutes, the «Waiting for me» inbox.'],
      ['Маршруты с условиями, срочность и сроки, замещения, входящие «Ждёт меня».']
    ),
  },
  dashboard: {
    name: { en: 'Dashboard', ru: 'Дашборд' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'tasks', what: { en: 'Task widgets: mine, overdue, projects', ru: 'Виджеты задач: мои, просроченные, проекты' } },
      { id: 'calendar', what: { en: 'Agenda of today’s meetings', ru: 'Повестка встреч на сегодня' } },
      { id: 'files', what: { en: 'Recent files and storage usage', ru: 'Недавние файлы и занятое место' } },
      { id: 'drive', what: { en: 'File server shortcuts and activity', ru: 'Ярлыки и активность файлового сервера' } },
      { id: 'kb', what: { en: 'New knowledge base materials', ru: 'Новые материалы базы знаний' } },
      { id: 'resources', what: { en: 'Online resources tiles', ru: 'Плитки онлайн-ресурсов' } },
      { id: 'companies', what: { en: 'Recent counterparties', ru: 'Недавние контрагенты' } },
      { id: 'procurement', what: { en: 'Purchase requests widget', ru: 'Виджет заявок на закупку' } },
      { id: 'warehouse', what: { en: 'Stock below minimum, transfers, tools on me', ru: 'Остатки ниже минимума, перемещения, инструмент на мне' } },
      { id: 'contracts', what: { en: 'Upcoming contract payments', ru: 'Ближайшие платежи по договорам' } },
    ],
    docs: { user: 'dashboard', guide: 'docs/dashboard.md' },
    changelog: first(['Widgets from every enabled module, personal layouts, charts.'], ['Виджеты всех включённых модулей, личная раскладка, графики.']),
  },
  tasks: {
    name: { en: 'Tasks', ru: 'Задачи' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'chat', what: { en: 'A conversation in every task', ru: 'Чат у каждой задачи' } },
      { id: 'files', what: { en: 'Attach files from Files', ru: 'Вложения из «Файлов»' } },
      { id: 'drive', what: { en: 'Attach files from the file server', ru: 'Вложения с файлового сервера' } },
      { id: 'calendar', what: { en: 'Deadlines shown in the calendar', ru: 'Сроки задач в календаре' } },
    ],
    docs: { user: 'tasks', guide: 'docs/tasks.md' },
    changelog: first(['Projects and boards, acceptance, orders, recurring tasks, flows.'], ['Проекты и доски, принятие в работу, поручения, повторяющиеся задачи, потоки.']),
  },
  calendar: {
    name: { en: 'Calendar', ru: 'Календарь' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'tasks', what: { en: 'Task deadlines on the calendar', ru: 'Сроки задач в календаре' } },
      { integration: 'google', what: { en: 'Sync with Google Calendar', ru: 'Синхронизация с Google Календарём' } },
    ],
    docs: { user: 'calendar', guide: 'docs/calendar.md' },
    changelog: first(['Shared calendars, recurrence, reminders, Google Calendar.'], ['Общие календари, повторения, напоминания, Google Календарь.']),
  },
  chat: {
    name: { en: 'Chats', ru: 'Чаты' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [],
    docs: { user: 'chat', guide: 'docs/chat.md' },
    changelog: first(['Direct and group chats, conversations of records, video call links.'], ['Личные и групповые чаты, обсуждения записей, ссылки на видеозвонки.']),
  },
  resources: {
    name: { en: 'Online resources', ru: 'Онлайн-ресурсы' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [],
    docs: { user: 'resources', guide: 'docs/resources.md' },
    changelog: first(['Tiles of company services with access by role and group.'], ['Плитки сервисов компании с доступом по ролям и группам.']),
  },
  assistant: {
    name: { en: 'Robot assistant', ru: 'Робот-помощник' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [],
    docs: { user: 'assistant', guide: 'docs/assistant.md' },
    changelog: first(['Characters, tips on first visit, quick help.'], ['Персонажи, подсказки при первом входе, быстрая справка.']),
  },
  files: {
    name: { en: 'Files', ru: 'Файлы' },
    version: '1.0.0',
    category: 'documents',
    minCore: '1.4.0',
    requires: [],
    enhances: [{ integration: 'documents', what: { en: 'Office previews and online editing', ru: 'Просмотр и онлайн-редактирование документов Office' } }],
    docs: { user: 'files', guide: 'docs/files.md' },
    changelog: first(['Personal and shared spaces, public links, quotas, trash.'], ['Личные и общие пространства, публичные ссылки, квоты, корзина.']),
  },
  kb: {
    name: { en: 'Knowledge base', ru: 'База знаний' },
    version: '1.0.0',
    category: 'documents',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'files', what: { en: 'Pick materials from Files', ru: 'Выбор материалов из «Файлов»' } },
      { integration: 'documents', what: { en: 'Exact previews of Word and PowerPoint', ru: 'Точный просмотр Word и PowerPoint' } },
    ],
    docs: { user: 'kb', guide: 'docs/knowledge-base.md' },
    changelog: first(['Folders, articles and files with access rules and public links.'], ['Папки, статьи и файлы с правами доступа и публичными ссылками.']),
  },
  contracts: {
    name: { en: 'Contracts', ru: 'Договоры' },
    version: '1.0.0',
    category: 'documents',
    minCore: '1.4.0',
    requires: [APPROVALS],
    enhances: [
      { id: 'companies', what: { en: 'Pick the counterparty from the directory', ru: 'Выбор контрагента из справочника' } },
      { id: 'chat', what: { en: 'A conversation in every contract', ru: 'Чат у каждого договора' } },
      { id: 'crm', what: { en: 'Link contracts to deals', ru: 'Связь договоров со сделками' } },
      { id: 'masterplan', what: { en: 'Sales contracts update units', ru: 'Договоры продажи обновляют юниты' } },
      { id: 'procurement', what: { en: 'Purchase requests of the contract', ru: 'Заявки на закупку по договору' } },
    ],
    docs: { user: 'contracts', guide: 'docs/contracts.md' },
    changelog: first(['Registry with versions, lawyer’s risks, approval, expiry reminders, payments.'], ['Реестр с версиями, риски юриста, согласование, напоминания об окончании, оплаты.']),
  },
  companies: {
    name: { en: 'Counterparties', ru: 'Контрагенты' },
    version: '1.0.0',
    category: 'sales',
    minCore: '1.4.0',
    requires: [],
    enhances: [{ id: 'crm', what: { en: 'Deals on the company card', ru: 'Сделки в карточке компании' } }],
    docs: { user: 'companies', guide: 'docs/companies.md' },
    changelog: first(['Companies and people, registry lookups, careers, history and rating.'], ['Компании и люди, реквизиты из реестров, карьера, история и рейтинг.']),
  },
  crm: {
    name: { en: 'CRM', ru: 'CRM' },
    version: '1.0.0',
    category: 'sales',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'companies', what: { en: 'Clients from the counterparties directory', ru: 'Клиенты из справочника контрагентов' } },
      { id: 'chat', what: { en: 'Discuss a deal with colleagues', ru: 'Обсуждение сделки с коллегами' } },
    ],
    docs: { user: 'crm', guide: 'docs/crm.md' },
    changelog: first(['Pipelines, kanban and list, activities, custom fields.'], ['Воронки, канбан и список, дела, свои поля.']),
  },
  procurement: {
    name: { en: 'Procurement', ru: 'Закупки' },
    version: '1.0.0',
    category: 'supply',
    minCore: '1.4.0',
    requires: [APPROVALS],
    enhances: [
      { id: 'companies', what: { en: 'Pick suppliers from the directory', ru: 'Выбор поставщиков из справочника' } },
      { id: 'masterplan', what: { en: 'Requests for a project or object', ru: 'Заявки на проект или объект' } },
      { id: 'crm', what: { en: 'Link requests to deals', ru: 'Связь заявок со сделками' } },
      { id: 'contracts', what: { en: 'Requests under a contract', ru: 'Заявки по договору' } },
      { id: 'files', what: { en: 'Attach invoices from Files', ru: 'Счета из «Файлов»' } },
      { id: 'chat', what: { en: 'A conversation in every request', ru: 'Чат у каждой заявки' } },
    ],
    docs: { user: 'procurement', guide: 'docs/procurement.md' },
    changelog: first(['Purchase requests, approval, payments registry, delivery.'], ['Заявки на закупку, согласование, реестр оплат, поставка.']),
  },
  warehouse: {
    name: { en: 'Warehouse', ru: 'Склад' },
    version: '1.0.0',
    category: 'supply',
    minCore: '1.4.0',
    requires: [APPROVALS],
    enhances: [
      { id: 'procurement', what: { en: 'Receipts from purchase requests', ru: 'Приход по заявкам на закупку' } },
      { id: 'masterplan', what: { en: 'Issues to projects and objects', ru: 'Выдача на проекты и объекты' } },
      { id: 'companies', what: { en: 'Suppliers from the directory', ru: 'Поставщики из справочника' } },
    ],
    docs: { user: 'warehouse', guide: 'docs/warehouse.md' },
    changelog: first(['Stock, receipts and issues, transfers, tools, barcodes, inventory.'], ['Остатки, приход и выдача, перемещения, инструмент, штрихкоды, инвентаризация.']),
  },
  masterplan: {
    name: { en: 'Masterplan', ru: 'Мастерплан' },
    version: '1.0.0',
    category: 'construction',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'crm', what: { en: 'Units linked to CRM deals', ru: 'Юниты связаны со сделками CRM' } },
      { id: 'companies', what: { en: 'Buyers from the counterparties directory', ru: 'Покупатели из справочника контрагентов' } },
    ],
    docs: { user: 'masterplan', guide: 'docs/masterplan.md' },
    changelog: first(['Site plan, chessboard, bookings, pricing, construction progress.'], ['Генплан, шахматка, брони, цены, ход строительства.']),
  },
  drive: {
    name: { en: 'File server', ru: 'Файловый сервер' },
    version: '1.0.0',
    category: 'infrastructure',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { integration: 'activeDirectory', what: { en: 'Folder access groups, the domain password for shares', ru: 'Группы доступа к папкам, доменный пароль для шар' } },
      { integration: 'documents', what: { en: 'Office previews and online editing', ru: 'Просмотр и онлайн-редактирование документов Office' } },
    ],
    docs: { user: 'drive', guide: 'docs/drive.md' },
    changelog: first(['SMB shares as one drive, links, activity log, folder access management.'], ['SMB-шары как единый диск, ссылки, журнал действий, управление доступом к папкам.']),
  },
  org: {
    name: { en: 'Org structure', ru: 'Оргструктура' },
    version: '1.0.0',
    category: 'people',
    minCore: '1.4.0',
    requires: [],
    enhances: [{ id: 'employees', what: { en: 'Heads and headcount from employee cards', ru: 'Руководители и численность из карточек сотрудников' } }],
    docs: { user: null, guide: 'docs/org-structure.md' },
    changelog: first(
      ['Tree of units with configurable types, heads, purposes and time zones; drag and drop with history; org chart; managerOf() for modules and approvals.'],
      ['Дерево подразделений с настраиваемыми типами, руководителями, назначениями и часовыми поясами; перетаскивание с историей; оргсхема; managerOf() для модулей и согласований.']
    ),
  },
  employees: {
    name: { en: 'Employees', ru: 'Сотрудники' },
    version: '1.0.0',
    category: 'people',
    minCore: '1.4.0',
    requires: [{ id: 'org', reason: { en: 'Employees belong to units of the org structure', ru: 'Сотрудники числятся в подразделениях оргструктуры' } }],
    enhances: [
      { id: 'dashboard', what: { en: 'Birthdays and work anniversaries widget', ru: 'Виджет дней рождения и годовщин' } },
      { integration: 'activeDirectory', what: { en: 'The AD account field on the employee card', ru: 'Поле «Учётная запись AD» в карточке сотрудника' } },
    ],
    docs: { user: 'employees', guide: 'docs/employees.md' },
    changelog: first(
      ['Registry and cards, positions, documents, skills and clearances with reminders, portal user link, org chart, Excel import, birthdays widget.'],
      ['Реестр и карточки, должности, документы, навыки и допуски с напоминаниями, связь с пользователем портала, оргсхема, импорт из Excel, виджет дней рождения.']
    ),
  },
  directory: {
    name: { en: 'AD directory', ru: 'Каталог AD' },
    version: '1.0.0',
    category: 'infrastructure',
    minCore: '1.4.0',
    requires: [
      {
        integration: 'activeDirectory',
        reason: { en: 'Users, groups and OUs are read from and written to Active Directory', ru: 'Пользователи, группы и OU читаются из Active Directory и меняются в нём' },
        // May be switched on without it: the module page then explains the setup and can show the demo directory.
        demo: true,
      },
    ],
    enhances: [
      { id: 'employees', what: { en: 'Link AD accounts to employee cards and create them from a card', ru: 'Связывать учётные записи AD с карточками сотрудников и создавать их из карточки' } },
      { id: 'drive', what: { en: 'Folder access groups (sg_…) are managed in File server → Access', ru: 'Группы доступа к папкам (sg_…) управляются в «Файловый сервер → Доступ»' } },
    ],
    docs: { user: 'directory', guide: 'docs/directory.md' },
    changelog: first(
      ['OU tree within a managed root, users, groups and computers, account actions under the administrator’s own AD account, password reset over LDAPS / StartTLS, journal, demo directory.'],
      ['Дерево OU внутри корня управления, пользователи, группы и компьютеры, действия с учётными записями от AD-учётки администратора, сброс пароля по LDAPS / StartTLS, журнал, демо-каталог.']
    ),
  },
};

/**
 * Core services: always on, listed in the «Core» section of the Modules page
 * (labels: i18n platform.core.<id>). `path` is where an administrator sets them up.
 */
export const CORE_SERVICES = [
  { id: 'users', icon: 'people', path: '/admin/users' },
  { id: 'signin', icon: 'shield', path: '/admin/settings/signin' },
  { id: 'notifications', icon: 'bell', path: '/admin/settings/notifications' },
  { id: 'approvals', icon: 'inbox', path: '/admin/settings/approvals' },
  { id: 'org', icon: 'layers', path: '/admin/settings/org' },
  { id: 'api', icon: 'code', path: '/admin/api' },
  { id: 'activity', icon: 'bell', path: '/admin/activity' },
  { id: 'regional', icon: 'globe', path: '/admin/settings/general' },
  { id: 'appearance', icon: 'palette', path: '/admin/settings/theme' },
  { id: 'scheduler', icon: 'server', path: '/admin/settings/system' },
  { id: 'help', icon: 'graduation', path: '/help' },
];

// ── Versions ────────────────────────────────────────────────────────────────

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export function isSemver(value) {
  return typeof value === 'string' && SEMVER.test(value);
}

/** -1 / 0 / 1; prerelease and build suffixes are ignored. */
export function compareVersions(a, b) {
  const pa = SEMVER.exec(String(a)) || [0, 0, 0, 0];
  const pb = SEMVER.exec(String(b)) || [0, 0, 0, 0];
  for (let i = 1; i <= 3; i += 1) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// ── Validation ──────────────────────────────────────────────────────────────

const text = (value) => value && typeof value === 'object' && typeof value.en === 'string' && typeof value.ru === 'string';

/**
 * Problems of a manifest set, as readable strings (empty = valid): unknown
 * ids, bad versions or categories, missing texts, requirement cycles.
 * `catalogIds`: ids of MODULE_CATALOG; each must have a manifest and back.
 */
export function validateManifests(manifest = MODULE_MANIFEST, { catalogIds, coreVersion, coreIds = [] } = {}) {
  const problems = [];
  const ids = new Set(Object.keys(manifest));
  if (catalogIds) {
    for (const id of catalogIds) if (!ids.has(id)) problems.push(`${id}: no manifest entry`);
    for (const id of ids) if (!catalogIds.includes(id)) problems.push(`${id}: manifest entry without a catalog module`);
  }
  for (const [id, entry] of Object.entries(manifest)) {
    if (!isSemver(entry.version)) problems.push(`${id}: version "${entry.version}" is not semver`);
    if (!isSemver(entry.minCore)) problems.push(`${id}: minCore "${entry.minCore}" is not semver`);
    else if (coreVersion && compareVersions(coreVersion, entry.minCore) < 0) problems.push(`${id}: needs core ${entry.minCore}, running ${coreVersion}`);
    if (!CATEGORIES.includes(entry.category)) problems.push(`${id}: unknown category "${entry.category}"`);
    if (!text(entry.name)) problems.push(`${id}: name needs en and ru`);
    for (const [field, label] of [['requires', 'reason'], ['enhances', 'what']]) {
      if (!Array.isArray(entry[field])) {
        problems.push(`${id}: ${field} must be a list`);
        continue;
      }
      for (const link of entry[field]) {
        if (link.integration) {
          if (!INTEGRATIONS.includes(link.integration)) problems.push(`${id}: ${field} names unknown integration "${link.integration}"`);
        } else if (!ids.has(link.id)) problems.push(`${id}: ${field} names unknown module "${link.id}"`);
        else if (link.id === id) problems.push(`${id}: ${field} names itself`);
        if (!text(link[label])) problems.push(`${id}: ${field} → ${link.id || link.integration} needs ${label} in en and ru`);
      }
    }
    if (!Array.isArray(entry.changelog) || !entry.changelog.length) problems.push(`${id}: changelog is empty`);
    else if (entry.changelog[0].version !== entry.version) problems.push(`${id}: the newest changelog entry is not ${entry.version}`);
  }
  const cycle = findRequiresCycle(manifest);
  if (cycle) problems.push(`requirement cycle: ${cycle.join(' → ')}`);
  // A core module (always on) may not require one that can be switched off.
  for (const id of coreIds) {
    for (const link of manifest[id]?.requires || []) {
      if (link.id && !coreIds.includes(link.id)) problems.push(`${id}: a core module cannot require the optional module "${link.id}"`);
    }
  }
  return problems;
}

/** The first cycle in the `requires` graph (module ids only) as [a, b, …, a], or null. */
export function findRequiresCycle(manifest = MODULE_MANIFEST) {
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    state.set(id, 'open');
    stack.push(id);
    for (const link of manifest[id]?.requires || []) {
      if (!link.id || !manifest[link.id]) continue;
      if (state.get(link.id) === 'open') return [...stack.slice(stack.indexOf(link.id)), link.id];
      if (!state.has(link.id)) {
        const found = visit(link.id);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const id of Object.keys(manifest)) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

/** Module ids so that every module comes after the modules it requires (stable: `order` breaks ties). */
export function dependencyOrder(ids, manifest = MODULE_MANIFEST, order = ids) {
  const wanted = new Set(ids);
  const done = new Set();
  const out = [];
  const place = (id, seen = new Set()) => {
    if (done.has(id) || seen.has(id)) return;
    seen.add(id);
    for (const link of manifest[id]?.requires || []) if (link.id && wanted.has(link.id)) place(link.id, seen);
    done.add(id);
    out.push(id);
  };
  for (const id of [...order].filter((id) => wanted.has(id))) place(id);
  for (const id of ids) place(id);
  return out;
}
