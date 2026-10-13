/*
 * Hand-written part of the API reference: sections and the endpoints worth
 * explaining. Every other route is still listed (api/introspect.js finds them
 * all), with its scope, just without prose.
 *
 * Keys are "METHOD /path" exactly as the route is declared, relative to /api.
 * Texts are { ru, en }.
 */

const L = (ru, en) => ({ ru, en });
const q = (name, type, desc, extra = {}) => ({ name, type, desc, ...extra });
const b = (name, type, desc, extra = {}) => ({ name, type, desc, ...extra });

export const SECTIONS = [
  { key: 'account', area: 'account', prefix: ['/auth/me', '/account'], title: L('Профиль', 'Account'), intro: L('Кто владелец токена и его профиль.', 'Who owns the token, and their profile.') },
  { key: 'notifications', area: 'notifications', prefix: ['/notifications'], title: L('Уведомления', 'Notifications'), intro: L('Входящие уведомления владельца токена: список, счётчик, отметка о прочтении.', "The token owner's inbox: list, counter, marking as read.") },
  { key: 'tasks', area: 'tasks', prefix: ['/app/tasks'], title: L('Задачи', 'Tasks'), intro: L('Проекты, задачи, чек-листы, результаты, файлы, шаблоны и потоки. Задача адресуется ссылкой `KEY-12` или числовым id.', 'Projects, tasks, checklists, results, files, templates and flows. A task is addressed by its reference `KEY-12` or numeric id.') },
  { key: 'chat', area: 'chat', prefix: ['/app/chat'], title: L('Чат', 'Chat'), intro: L('Личные, групповые чаты и чаты записей (например, задачи). Для событий в реальном времени — поток SSE или вебхук `chat.message`.', 'Direct, group and record conversations (e.g. a task). For real time use the SSE stream or the `chat.message` webhook.') },
  { key: 'calendar', area: 'calendar', prefix: ['/app/calendar'], title: L('Календарь', 'Calendar'), intro: L('Календари и события с повторениями, участниками и напоминаниями. Даты — ISO 8601.', 'Calendars and events with recurrence, attendees and reminders. Dates are ISO 8601.') },
  { key: 'companies', area: 'companies', prefix: ['/app/companies'], title: L('Контрагенты', 'Counterparties'), intro: L('Компании и контакты, проверка по реестрам, заметки и оценки.', 'Companies and people, registry checks, notes and ratings.') },
  { key: 'crm', area: 'crm', prefix: ['/app/crm'], title: L('CRM', 'CRM'), intro: L('Сделки по стадиям воронок, дела, история, фильтры. Клиенты — компании и люди модуля «Контрагенты». Суммы — числа с двумя знаками, валюты — ISO 4217. Видимость сделок та же, что в интерфейсе; токен можно ограничить воронками (`crm.pipelines`).', 'Deals moving through pipeline stages, activities, history, filters. Clients are companies and people of the Counterparties module. Amounts are numbers with two decimals, currencies ISO 4217. Deals are visible as in the UI; a token can be narrowed to pipelines (`crm.pipelines`).') },
  { key: 'files', area: 'files', prefix: ['/app/files'], title: L('Файлы', 'Files'), intro: L('Личные файлы и общие пространства: папки, загрузка, скачивание, доступ и ссылки.', 'Personal files and shared spaces: folders, upload, download, sharing and links.') },
  { key: 'kb', area: 'kb', prefix: ['/app/kb'], title: L('База знаний', 'Knowledge base'), intro: L('Папки и материалы базы знаний.', 'Knowledge base folders and items.') },
  { key: 'drive', area: 'drive', prefix: ['/app/drive'], title: L('Файловый сервер', 'File server'), intro: L('Сетевые папки (SMB): список, чтение, загрузка. Пути передаются параметром `path`.', 'Network shares (SMB): listing, reading, uploading. Paths go in the `path` parameter.') },
  { key: 'resources', area: 'resources', prefix: ['/app/resources'], title: L('Онлайн-ресурсы', 'Online resources'), intro: L('Плитки ссылок и их порядок.', 'Link tiles and their order.') },
  { key: 'dashboard', area: 'dashboard', prefix: ['/app/dashboard'], title: L('Дашборд', 'Dashboard'), intro: L('Виджеты владельца токена и данные для них.', "The token owner's widgets and their data.") },
  { key: 'admin.users', area: 'admin.users', prefix: ['/admin/users', '/admin/groups', '/admin/roles', '/admin/permissions'], title: L('Пользователи и группы', 'Users and groups'), intro: L('Учётные записи, группы и роли. Нужны права администратора у владельца токена.', 'Accounts, groups and roles. The token owner needs administrator rights.') },
  { key: 'admin.security', area: 'admin.security', prefix: ['/admin/security'], title: L('Безопасность', 'Security'), intro: L('Журнал событий безопасности и IP-правила.', 'Security events and IP rules.') },
  { key: 'admin.settings', area: 'admin.settings', prefix: ['/admin'], title: L('Администрирование', 'Administration'), intro: L('Настройки портала, интеграции, сведения о системе.', 'Portal settings, integrations, system information.') },
  { key: 'common', area: null, prefix: ['/apps', '/status', '/settings'], title: L('Общее', 'General'), intro: L('Доступно любому действующему токену.', 'Available to any valid token.') },
];

const TASK_EXAMPLE = {
  id: 128,
  ref: 'WEB-12',
  title: 'Prepare the release notes',
  important: true,
  status: { id: 3, name: 'In progress', kind: 'active', color: '#3B82F6' },
  priority: 2,
  dueAt: '2026-10-18T13:00:00.000Z',
  assignee: { id: 7, name: 'Aida Bekova' },
  originator: { id: 1, name: 'Alex Morgan' },
  project: { id: 2, key: 'WEB', name: 'Website relaunch' },
  labels: ['release'],
  checklist: { done: 1, total: 4 },
  url: '/app/tasks/WEB-12',
};

export const DOCS = {
  // ── Common ──
  'GET /apps': { summary: L('Включённые модули', 'Enabled modules'), response: { success: true, apps: [{ id: 'tasks', enabled: true }, { id: 'chat', enabled: true }] } },
  'GET /status': { summary: L('Состояние API и базы данных', 'API and database status'), response: { success: true, api: 'ok', app: { name: 'Portal', version: '1.0.0' }, database: { connected: true } } },

  // ── Account ──
  'GET /auth/me': {
    summary: L('Владелец токена', 'Token owner'),
    description: L('Возвращает пользователя, от имени которого работает токен, с ролями и правами. Удобно для проверки токена.', 'Returns the person the token acts as, with roles and permissions. Handy to check a token.'),
    response: { success: true, user: { id: 7, username: 'aida', displayName: 'Aida Bekova', email: 'aida@example.com', locale: 'ru', roles: [{ key: 'user' }], permissions: ['tasks.admin'] } },
  },
  'GET /account/profile': { summary: L('Профиль', 'Profile'), response: { success: true, user: { id: 7, username: 'aida', displayName: 'Aida Bekova', email: 'aida@example.com', phone: '+996700000000', locale: 'ru', theme: 'light' } } },
  'PUT /account/profile': { summary: L('Изменить профиль', 'Update the profile'), body: [b('displayName', 'string', L('Имя', 'Name')), b('email', 'string', L('Почта', 'Email')), b('locale', '"ru" | "en"', L('Язык', 'Language')), b('theme', '"light" | "dark" | "system"', L('Тема', 'Theme'))] },
  'GET /account/notifications': { summary: L('Настройки уведомлений', 'Notification preferences') },
  'PUT /account/notifications': { summary: L('Изменить настройки уведомлений', 'Change notification preferences') },

  // ── Notifications ──
  'GET /notifications/': {
    summary: L('Список уведомлений', 'Notifications'),
    query: [q('limit', 'integer', L('Сколько вернуть, до 50 (20)', 'How many, up to 50 (20)')), q('before', 'integer', L('id, с которого продолжить (страницы)', 'Continue before this id (paging)')), q('unread', '"1"', L('Только непрочитанные', 'Unread only'))],
    response: { success: true, unread: 3, more: false, items: [{ id: 501, kind: 'tasks.assigned', title: 'WEB-12 · Prepare the release notes', body: 'Alex Morgan assigned you a task', link: '/app/tasks/WEB-12', readAt: null, createdAt: '2026-10-11T09:12:00.000Z' }] },
  },
  'GET /notifications/unread': { summary: L('Число непрочитанных', 'Unread count'), response: { success: true, unread: 3 } },
  'POST /notifications/read': { summary: L('Отметить прочитанными', 'Mark as read'), body: [b('ids', 'integer[]', L('Какие уведомления', 'Which notifications')), b('all', 'boolean', L('Все сразу', 'All of them'))], response: { success: true, unread: 0 } },

  // ── Tasks ──
  'GET /app/tasks/': { summary: L('Обзор: проекты и мои счётчики', 'Overview: projects and my counters'), response: { success: true, projects: [{ id: 2, key: 'WEB', name: 'Website relaunch', level: 'edit', openCount: 14 }], mine: { open: 6, overdue: 1, done_week: 9, assigned: 4, helping: 1, auditing: 2 } } },
  'GET /app/tasks/projects': { summary: L('Проекты', 'Projects'), query: [q('archived', '"1"', L('Включая архивные', 'Include archived'))] },
  'POST /app/tasks/projects': {
    summary: L('Создать проект', 'Create a project'),
    body: [b('name', 'string', L('Название', 'Name'), { required: true }), b('key', 'string', L('Ключ 2–10 латинских букв/цифр; если не задан — из названия', '2–10 Latin letters/digits; derived from the name if omitted')), b('description', 'string', L('Описание', 'Description')), b('color', '#RRGGBB', L('Цвет', 'Colour')), b('visibility', '"team" | "readonly" | "private"', L('Стартовый доступ: все редактируют / все читают / только я', 'Initial access: everyone edits / everyone reads / only me'))],
  },
  'GET /app/tasks/projects/:ref': { summary: L('Проект со статусами и участниками', 'Project with statuses and members') },
  'GET /app/tasks/subjects': { summary: L('Кому можно поставить задачу', 'People who can be given a task') },
  'GET /app/tasks/tasks': {
    summary: L('Поиск и список задач', 'List and search tasks'),
    description: L('Все фильтры необязательны и сочетаются.', 'All filters are optional and combine.'),
    query: [
      q('project', 'string', L('Ключ или id проекта', 'Project key or id')),
      q('role', '"doing" | "helping" | "assigned" | "auditing" | "all"', L('Моя роль в задаче', 'My role in the task')),
      q('assignee', '"me" | "none" | id', L('Исполнитель', 'Assignee')),
      q('status', 'id', L('Статус', 'Status')),
      q('priority', '0–3', L('Приоритет', 'Priority')),
      q('label', 'string', L('Тег', 'Tag')),
      q('important', '"1"', L('Только важные', 'Important only')),
      q('open', '"1"', L('Только незавершённые', 'Open only')),
      q('q', 'string', L('Текст или ссылка `KEY-12`', 'Text or a `KEY-12` reference')),
      q('dueFrom / dueTo', 'ISO date', L('Срок в диапазоне', 'Due within a range')),
      q('doneSince', 'ISO date', L('Завершённые после', 'Completed after')),
      q('sort', '"due" | "updated" | "created" | "priority"', L('Сортировка', 'Sort order')),
      q('limit', 'integer', L('Не больше N задач', 'At most N tasks')),
    ],
    response: { success: true, tasks: [TASK_EXAMPLE] },
  },
  'POST /app/tasks/tasks': {
    summary: L('Создать задачу', 'Create a task'),
    description: L('Без `projectId` задача попадает в «Без проекта» (ключ TSK). Несколько `assigneeIds` создают копию задачи на каждого.', 'Without `projectId` the task goes to "No project" (key TSK). Several `assigneeIds` create one copy per person.'),
    body: [
      b('title', 'string', L('Заголовок', 'Title'), { required: true }),
      b('description', 'string', L('Описание (HTML или Markdown)', 'Description (HTML or Markdown)')),
      b('descriptionFormat', '"html" | "markdown"', L('Формат описания', 'Description format')),
      b('projectId', 'string | integer', L('Ключ или id проекта', 'Project key or id')),
      b('assigneeIds', 'integer[]', L('Исполнители', 'Assignees')),
      b('coassigneeIds / auditorIds', 'integer[]', L('Соисполнители и наблюдатели', 'Co-assignees and auditors')),
      b('dueAt', 'ISO date-time', L('Крайний срок', 'Deadline')),
      b('important', 'boolean', L('Важная', 'Important')),
      b('priority', '0–3', L('Приоритет', 'Priority')),
      b('labels', 'string[]', L('Теги', 'Tags')),
      b('checklists', '[{ title, items: [{ text, done }] }]', L('Чек-листы', 'Checklists')),
      b('resultRequired', 'boolean', L('Нельзя закрыть без результата', 'Cannot be closed without a result')),
      b('parentId', 'integer', L('Родительская задача', 'Parent task')),
      b('reminders', '[{ at | before, whom, channels }]', L('Напоминания', 'Reminders')),
    ],
    example: { title: 'Prepare the release notes', projectId: 'WEB', assigneeIds: [7], dueAt: '2026-10-18T13:00:00Z', important: true, checklists: [{ title: 'Steps', items: [{ text: 'Collect changes' }, { text: 'Review' }] }] },
    response: { success: true, task: TASK_EXAMPLE },
  },
  'GET /app/tasks/tasks/:ref': { summary: L('Задача целиком', 'Full task'), description: L('Вместе с участниками, чек-листами, файлами, результатами, подзадачами, связями и правами `can`.', 'With participants, checklists, files, results, subtasks, links and the `can` flags.'), response: { success: true, task: { ...TASK_EXAMPLE, can: { edit: true, complete: true, delete: false } } } },
  'PUT /app/tasks/tasks/:ref': {
    summary: L('Изменить задачу', 'Update a task'),
    description: L('Частичное обновление: передайте только меняемые поля.', 'Partial update: send only the fields that change.'),
    body: [b('title / description / dueAt / priority / important / labels / startDate / parentId / resultRequired', '…', L('Поля задачи', 'Task fields')), b('statusId', 'integer', L('Новый статус', 'New status')), b('complete', 'boolean', L('true — завершить (первый статус «Готово»)', 'true moves the task to the first Done status')), b('assigneeId', 'integer | null', L('Исполнитель', 'Assignee')), b('projectId', 'string | integer', L('Перенести в проект', 'Move to a project')), b('deferred', 'boolean', L('Отложить', 'Defer'))],
    example: { complete: true },
  },
  'DELETE /app/tasks/tasks/:ref': { summary: L('Удалить задачу', 'Delete a task') },
  'POST /app/tasks/tasks/:ref/start': { summary: L('Начать выполнение', 'Start working') },
  'POST /app/tasks/tasks/:ref/delegate': { summary: L('Делегировать', 'Delegate'), body: [b('userId', 'integer', L('Новый исполнитель', 'New assignee'), { required: true })] },
  'POST /app/tasks/tasks/:ref/results': { summary: L('Добавить результат', 'Add a result'), body: [b('body', 'string', L('Текст результата', 'Result text')), b('messageId', 'integer', L('Или сообщение чата задачи', 'Or a message of the task chat'))] },
  'POST /app/tasks/tasks/:ref/checklist': { summary: L('Добавить пункт чек-листа', 'Add a checklist item'), body: [b('text', 'string', L('Текст', 'Text'), { required: true }), b('checklistId', 'integer', L('В какой чек-лист', 'Which checklist'))] },
  'PUT /app/tasks/checklist/:id': { summary: L('Изменить пункт (в т.ч. отметить)', 'Update an item (e.g. tick it)'), body: [b('done', 'boolean', L('Выполнен', 'Done')), b('text', 'string', L('Текст', 'Text'))] },
  'POST /app/tasks/tasks/:ref/files': { summary: L('Прикрепить файлы', 'Attach files'), description: L('`multipart/form-data`, поле `files` (можно несколько).', '`multipart/form-data`, field `files` (several allowed).') },
  'GET /app/tasks/templates': { summary: L('Шаблоны и регулярные задачи', 'Templates and recurring tasks') },
  'GET /app/tasks/calendar': { summary: L('Задачи со сроком в диапазоне', 'Tasks due in a range'), query: [q('from', 'ISO date', L('С', 'From'), { required: true }), q('to', 'ISO date', L('По', 'To'), { required: true }), q('mine', '"1"', L('Только мои', 'Mine only'))] },

  // ── Chat ──
  'GET /app/chat/rooms': { summary: L('Мои чаты', 'My conversations'), response: { success: true, rooms: [{ id: 34, kind: 'group', title: 'Release team', unread: 2, lastMessage: { id: 9001, body: 'Ready for review', author: { id: 7, name: 'Aida Bekova' }, createdAt: '2026-10-11T09:30:00.000Z' } }] } },
  'GET /app/chat/unread': { summary: L('Всего непрочитанных', 'Total unread'), response: { success: true, unread: 5 } },
  'POST /app/chat/direct/:userId': { summary: L('Открыть личный чат', 'Open a direct conversation'), description: L('Создаёт чат при первом обращении.', 'Creates it on first use.') },
  'GET /app/chat/entity/:type/:id': { summary: L('Чат записи', 'Conversation of a record'), description: L('Например, `/entity/task/128` — чат задачи. Доступ как к самой записи.', 'E.g. `/entity/task/128` is the task chat. Access follows the record.') },
  'POST /app/chat/rooms': { summary: L('Создать групповой чат', 'Create a group'), body: [b('title', 'string', L('Название', 'Title'), { required: true }), b('memberIds', 'integer[]', L('Участники', 'Members')), b('color', '#RRGGBB', L('Цвет', 'Colour'))] },
  'GET /app/chat/rooms/:id/messages': {
    summary: L('Сообщения', 'Messages'),
    query: [q('before', 'integer', L('Старее этого id', 'Older than this id')), q('after', 'integer', L('Новее этого id', 'Newer than this id')), q('around', 'integer', L('Вокруг сообщения', 'Around a message')), q('q', 'string', L('Поиск', 'Search')), q('limit', 'integer', L('Сколько', 'How many'))],
  },
  'POST /app/chat/rooms/:id/messages': {
    summary: L('Отправить сообщение', 'Send a message'),
    description: L('Поддерживает Markdown и @упоминания (`@username`). Файлы сначала загружаются в `/rooms/:id/files`, затем их id передаются в `fileIds`.', 'Markdown and @mentions (`@username`) work. Upload files to `/rooms/:id/files` first, then pass their ids in `fileIds`.'),
    body: [b('body', 'string', L('Текст', 'Text')), b('replyTo', 'integer', L('Ответ на сообщение', 'Reply to a message')), b('fileIds', 'integer[]', L('Загруженные файлы', 'Uploaded files'))],
    example: { body: 'Build **#482** passed ✅ @aida' },
    response: { success: true, message: { id: 9002, body: 'Build **#482** passed ✅ @aida', author: { id: 12, name: 'CI bot' }, createdAt: '2026-10-11T09:31:00.000Z' } },
  },
  'POST /app/chat/rooms/:id/files': { summary: L('Загрузить файлы для сообщения', 'Upload files for a message'), description: L('`multipart/form-data`, поле `files`. Возвращает id для `fileIds`.', '`multipart/form-data`, field `files`. Returns ids for `fileIds`.') },
  'POST /app/chat/rooms/:id/read': { summary: L('Отметить прочитанным', 'Mark as read'), body: [b('messageId', 'integer', L('До какого сообщения', 'Up to which message'))] },
  'GET /app/chat/stream': { summary: L('Поток событий (SSE)', 'Event stream (SSE)'), description: L('`text/event-stream`: события `message`, `edit`, `delete`, `reaction`, `read`, `typing`. Соединение держится открытым; переподключайтесь при обрыве.', '`text/event-stream` with `message`, `edit`, `delete`, `reaction`, `read`, `typing` events. Keep it open and reconnect when it drops.') },

  // ── Calendar ──
  'GET /app/calendar/': { summary: L('Календари и настройки', 'Calendars and settings') },
  'GET /app/calendar/events': {
    summary: L('События в диапазоне', 'Events in a range'),
    description: L('Повторяющиеся события разворачиваются в отдельные вхождения.', 'Recurring events are expanded into occurrences.'),
    query: [q('from', 'ISO date-time', L('Начало', 'Start'), { required: true }), q('to', 'ISO date-time', L('Конец', 'End'), { required: true }), q('calendars', 'string', L('id через запятую', 'Comma-separated ids')), q('invitations', '"0"', L('Без приглашений из чужих календарей', 'Skip invitations from other calendars'))],
  },
  'POST /app/calendar/events': {
    summary: L('Создать событие', 'Create an event'),
    body: [
      b('calendarId', 'integer', L('Календарь', 'Calendar'), { required: true }),
      b('title', 'string', L('Название', 'Title'), { required: true }),
      b('start / end', 'ISO date-time', L('Начало и конец', 'Start and end'), { required: true }),
      b('allDay', 'boolean', L('Весь день', 'All day')),
      b('timezone', 'string', L('Часовой пояс IANA', 'IANA time zone')),
      b('location / meetingUrl / description', 'string', L('Место, ссылка на встречу, описание', 'Place, meeting link, description')),
      b('attendees', 'integer[]', L('Участники', 'Attendees')),
      b('rrule', 'string', L('Повторение (RRULE)', 'Recurrence (RRULE)')),
      b('reminders', 'integer[]', L('Напоминания, минут до начала', 'Reminders, minutes before')),
    ],
    example: { calendarId: 3, title: 'Weekly sync', start: '2026-10-13T04:00:00Z', end: '2026-10-13T04:30:00Z', rrule: 'FREQ=WEEKLY;BYDAY=MO', attendees: [7, 9], reminders: [10] },
  },
  'PUT /app/calendar/events/:id': { summary: L('Изменить событие', 'Update an event'), body: [b('scope', '"all" | "single"', L('Всю серию или одно вхождение', 'The whole series or one occurrence')), b('occurrence', 'ISO date-time', L('Какое вхождение', 'Which occurrence'))] },
  'DELETE /app/calendar/events/:id': { summary: L('Удалить событие', 'Delete an event'), query: [q('scope', '"all" | "single"', L('Всю серию или одно вхождение', 'The whole series or one occurrence')), q('occurrence', 'ISO date-time', L('Вхождение', 'Occurrence'))] },
  'PUT /app/calendar/events/:id/rsvp': { summary: L('Ответить на приглашение', 'Answer an invitation'), body: [b('status', '"accepted" | "declined" | "tentative" | "needs"', L('Ответ', 'Answer'), { required: true })] },

  // ── CRM ──
  'GET /app/crm/meta': {
    summary: L('Настройки, воронки и мои права', 'Settings, pipelines and my rights'),
    response: { success: true, settings: { currency: 'KGS', currencies: ['KGS', 'USD'], visibility: 'all', sources: ['Сайт'], lostReasons: ['Дорого'], sections: [{ key: 'about', title: 'О сделке' }], fields: [{ key: 'region', label: 'Region', type: 'select', options: ['Бишкек', 'Ош'], section: 'about', listColumn: true, required: false }] }, pipelines: [{ id: 1, name: 'Продажи', color: '#2563EB', sort: 0, isDefault: true, stages: [{ id: 1, pipelineId: 1, name: 'Новая', color: '#94A3B8', sort: 0, kind: 'open' }], counts: { open: 12 } }], me: { id: 7, canAdmin: false, canAll: false }, companiesEnabled: true, chatEnabled: true },
  },
  'GET /app/crm/board': {
    summary: L('Канбан воронки', 'Pipeline kanban'),
    description: L('Все стадии с количеством и суммами по валютам (по фильтру); сделки — для стадий группы `group` (по умолчанию открытые), по `limit` на стадию. Дальше — `GET /board/stage/:stageId?offset=`.', 'Every stage with its count and sums per currency (over the filter); deals for the stages of `group` (open by default), `limit` per stage. Further pages: `GET /board/stage/:stageId?offset=`.'),
    query: [q('pipeline', 'integer', L('Воронка (по умолчанию — основная)', 'Pipeline (default one if omitted)')), q('group', '"open" | "won" | "lost" | "all"', L('Группа стадий', 'Stage group')), q('limit', 'integer', L('Сделок на стадию, до 100 (30)', 'Deals per stage, up to 100 (30)')), q('q, owners, client, amountMin, amountMax, createdFrom, createdTo, closeFrom, closeTo, createdBy, activity, source, stages, cf_<key>', 'string', L('Фильтр — см. «Сделки»', 'Filter — see "Deals"')), q('tz', 'IANA zone', L('Часовой пояс для «сегодня»', 'Time zone for "today"'))],
  },
  'GET /app/crm/deals': {
    summary: L('Сделки (список)', 'Deals (list)'),
    query: [
      q('q', 'string', L('Название, клиент, комментарий', 'Title, client, comment')),
      q('pipeline', 'integer', L('Воронка', 'Pipeline')),
      q('stages', 'ids', L('Стадии через запятую', 'Comma-separated stages')),
      q('group', '"open" | "won" | "lost" | "all"', L('Группа стадий (open)', 'Stage group (open)')),
      q('owners / createdBy', 'ids | "me"', L('Ответственные / авторы', 'Owners / authors')),
      q('client', '"c:<id>" | "p:<id>"', L('Компания или контакт', 'Company or person')),
      q('amountMin / amountMax', 'number', L('Сумма', 'Amount')),
      q('createdFrom / createdTo / closeFrom / closeTo', 'YYYY-MM-DD', L('Даты (включительно)', 'Dates (inclusive)')),
      q('activity', '"overdue" | "today" | "planned" | "none"', L('Состояние дел', 'Activity state')),
      q('source', 'string', L('Источник; несколько через |', 'Source; several with |')),
      q('cf_<key>', 'string', L('Своё поле: равно (select: a|b), содержит (multiselect, text), диапазон дат a..b', 'Custom field: equals (select: a|b), contains (multiselect, text), date range a..b')),
      q('sort', '"updated" | "created" | "amount" | "title" | "close" | "stage"', L('Сортировка', 'Sort')),
      q('order', '"asc" | "desc"', L('Направление', 'Direction')),
      q('page / pageSize', 'integer', L('Страница, размер до 100 (20)', 'Page, size up to 100 (20)')),
      q('count', '"1"', L('Вернуть total', 'Return total')),
    ],
    response: { success: true, items: [{ id: 42, pipelineId: 1, stageId: 3, title: 'Поставка оборудования', amount: 150000, currency: 'KGS', company: { id: 5, name: 'ОсОО «Ала-Тоо»' }, person: null, owner: { id: 7, username: 'aida', name: 'Aida Bekova', avatarUrl: null }, version: 4, activity: { next: { id: 9, kind: 'call', title: 'Перезвонить', dueAt: '2026-10-14T05:00:00.000Z', overdue: false }, open: 1, overdue: 0 }, canEdit: true, canDelete: true }], page: 1, pageSize: 20, total: 57 },
  },
  'POST /app/crm/deals': {
    summary: L('Создать сделку', 'Create a deal'),
    body: [b('title', 'string', L('Название', 'Title'), { required: true }), b('pipelineId / stageId', 'integer', L('Воронка и стадия (по умолчанию — основная, первая открытая)', 'Pipeline and stage (default pipeline, first open stage)')), b('amount', 'number', L('Сумма ≥ 0', 'Amount ≥ 0')), b('currency', 'string', L('Валюта из настроек', 'A currency from the settings')), b('companyId / personId', 'integer', L('Клиент', 'Client')), b('ownerId', 'integer', L('Ответственный (по умолчанию — вы)', 'Owner (you by default)')), b('source / comment', 'string', L('Источник, комментарий', 'Source, comment')), b('closeDate', 'YYYY-MM-DD', L('Дата закрытия', 'Close date')), b('custom', 'object', L('Значения своих полей', 'Custom field values')), b('watcherIds', 'integer[]', L('Наблюдатели', 'Watchers'))],
    example: { title: 'Поставка оборудования', pipelineId: 1, amount: 150000, currency: 'KGS', companyId: 5, ownerId: 7, closeDate: '2026-11-30' },
  },
  'GET /app/crm/deals/:id': { summary: L('Сделка: поля, воронка, дела, история', 'Deal: fields, pipeline, activities, history') },
  'PUT /app/crm/deals/:id': {
    summary: L('Изменить сделку', 'Update a deal'),
    description: L('Любые поля сделки; `custom` сливается по ключам (null удаляет). Передайте `version` — при устаревшей версии ответ 409 `VERSION_CONFLICT` со свежей сделкой в `deal`.', 'Any deal field; `custom` is merged key by key (null removes). Send `version`: a stale one answers 409 `VERSION_CONFLICT` with the fresh deal in `deal`.'),
  },
  'POST /app/crm/deals/:id/move': {
    summary: L('Перенести на стадию / в колонке', 'Move to a stage / within a column'),
    body: [b('stageId', 'integer', L('Стадия этой воронки', 'A stage of the same pipeline'), { required: true }), b('beforeId', 'integer', L('Карточка, которая окажется выше', 'The card that ends up above')), b('afterId', 'integer', L('Карточка, которая окажется ниже', 'The card that ends up below')), b('lostReason', 'string', L('Причина (обязательна для стадии «провал», если в настройках есть причины)', 'Reason (required for the lost stage when the settings list reasons)')), b('version', 'integer', L('Версия для проверки', 'Version to check'))],
  },
  'POST /app/crm/deals/bulk': {
    summary: L('Массовые действия', 'Bulk actions'),
    body: [b('ids', 'integer[]', L('Сделки (до 1000)', 'Deals (up to 1000)')), b('all / filter', 'true / object', L('Все по фильтру', 'All matching a filter')), b('action', '"stage" | "owner" | "pipeline" | "watchers" | "delete"', L('Действие', 'Action'), { required: true }), b('value', 'any', L('stageId | {stageId, lostReason} · userId · {pipelineId, stageId} · {add, remove}', 'stageId | {stageId, lostReason} · userId · {pipelineId, stageId} · {add, remove}'))],
    response: { success: true, affected: 12 },
  },
  'POST /app/crm/deals/:id/activities': { summary: L('Добавить дело', 'Add an activity'), body: [b('kind', '"call" | "meeting" | "task" | "email" | "other"', L('Тип', 'Kind')), b('title / note', 'string', L('Название, заметка', 'Title, note')), b('dueAt', 'ISO date-time', L('Срок', 'Due')), b('ownerId', 'integer', L('Ответственный', 'Responsible')), b('remindMinutes', 'integer', L('Напомнить за N минут', 'Remind N minutes before'))] },
  'PUT /app/crm/activities/:id': { summary: L('Изменить дело / отметить выполненным', 'Update / complete an activity'), body: [b('done', 'boolean', L('Выполнено', 'Done')), b('dueAt', 'ISO date-time', L('Новый срок', 'New due time'))] },
  'GET /app/crm/counters': { summary: L('Счётчики по делам', 'Activity counters'), response: { success: true, overdue: 3, today: 5, planned: 20, none: 7, incoming: 1 } },
  'GET /app/crm/activity-board': { summary: L('Сделки по ближайшему делу', 'Deals by their nearest activity'), query: [q('column', '"overdue" | "today" | "week" | "nextWeek" | "later" | "none"', L('Одна колонка (с offset)', 'One column (with offset)')), q('tz', 'IANA zone', L('Часовой пояс', 'Time zone'))] },
  'GET /app/crm/calendar': { summary: L('Сделки по дате', 'Deals by date'), query: [q('from / to', 'YYYY-MM-DD', L('Период', 'Period'), { required: true }), q('field', '"closeDate" | "cf_<key>"', L('Поле даты', 'Date field'))] },
  'GET /app/crm/export.csv': { summary: L('Выгрузка CSV', 'CSV export'), description: L('UTF-8 с BOM, разделитель `;`, до 20 000 строк. `columns` — ключи через запятую (id, title, pipeline, stage, amount, currency, company, person, phone, email, owner, source, closeDate, createdAt, updatedAt, closedAt, createdBy, comment, lostReason, watchers, nextActivity, cf_<key>).', 'UTF-8 with BOM, `;` separator, up to 20 000 rows. `columns`: comma-separated keys (id, title, pipeline, stage, amount, currency, company, person, phone, email, owner, source, closeDate, createdAt, updatedAt, closedAt, createdBy, comment, lostReason, watchers, nextActivity, cf_<key>).') },
  'GET /app/crm/clients': { summary: L('Поиск клиентов', 'Client search'), response: { success: true, companies: [{ id: 5, name: 'ОсОО «Ала-Тоо»', inn: '01234567891011' }], people: [{ id: 3, name: 'Иванов Пётр', phone: '+996 555 000000', email: null, company: { id: 5, name: 'ОсОО «Ала-Тоо»' } }] } },
  'GET /app/crm/pipelines': { summary: L('Воронки со стадиями', 'Pipelines with stages') },
  'PUT /app/crm/pipelines/:id': { summary: L('Изменить воронку и стадии (crm.admin)', 'Update a pipeline and its stages (crm.admin)'), body: [b('name / color', 'string', L('Название, цвет', 'Name, colour')), b('stages', '[{ id?, name, color, kind }]', L('Стадии по порядку: открытые, затем won, затем lost', 'Stages in order: open, then won, then lost')), b('moveTo', 'integer | { removedId: keptId }', L('Куда перенести сделки удаляемых стадий', 'Where deals of removed stages go'))] },

  // ── Companies ──
  'GET /app/companies/companies': {
    summary: L('Компании', 'Companies'),
    query: [q('q', 'string', L('Название, ИНН, телефон, почта', 'Name, TIN, phone, email')), q('status', 'string', L('Статус', 'Status')), q('relation', 'string', L('Тип отношений', 'Relation')), q('tag', 'string', L('Тег', 'Tag')), q('owner', '"me"', L('Только мои', 'Mine only')), q('sort', '"name" | "updated" | "created" | "rating"', L('Сортировка', 'Sort order')), q('archived', '"1"', L('Архивные', 'Archived')), q('limit / offset', 'integer', L('Страницы, до 200', 'Paging, up to 200'))],
  },
  'POST /app/companies/companies': {
    summary: L('Создать компанию', 'Create a company'),
    description: L('При совпадении идентификатора вернёт 409 `DUPLICATE`; `force: true` создаст всё равно.', 'A matching identifier returns 409 `DUPLICATE`; `force: true` creates it anyway.'),
    body: [b('name', 'string', L('Название', 'Name'), { required: true }), b('country', '"KG" | "KZ" | "RU" | "UZ" | …', L('Страна', 'Country')), b('ids', '{ inn, okpo, … }', L('Идентификаторы страны', "The country's identifiers")), b('kind', '"legal" | "individual" | "branch" | "government" | "other"', L('Вид', 'Kind')), b('phones / emails', 'string[]', L('Контакты', 'Contacts')), b('tags / relations', 'string[]', L('Теги, отношения', 'Tags, relations')), b('owner_id', 'integer', L('Ответственный', 'Owner')), b('force', 'boolean', L('Игнорировать дубликаты', 'Ignore duplicates'))],
    example: { name: 'Ала-Тоо Трейд', country: 'KG', ids: { inn: '01234567891011' }, phones: ['+996 312 000000'], tags: ['supplier'] },
  },
  'GET /app/companies/companies/:id': { summary: L('Карточка компании', 'Company card') },
  'PUT /app/companies/companies/:id': { summary: L('Изменить компанию', 'Update a company') },
  'GET /app/companies/people': { summary: L('Контакты (люди)', 'People') },
  'POST /app/companies/people': { summary: L('Создать контакт', 'Create a person'), body: [b('first_name / last_name / middle_name', 'string', L('ФИО', 'Name'), { required: true }), b('phones / emails', 'string[]', L('Контакты', 'Contacts'))] },
  'POST /app/companies/:type(company|person)/:id/notes': { summary: L('Добавить заметку', 'Add a note'), body: [b('body', 'string', L('Текст', 'Text'), { required: true })] },

  // ── Files ──
  'GET /app/files/': { summary: L('Пространства и квота', 'Spaces and quota') },
  'GET /app/files/my': { summary: L('Мои файлы (корень)', 'My files (root)') },
  'GET /app/files/folders/:id': { summary: L('Содержимое папки', 'Folder contents') },
  'GET /app/files/spaces/:id/files': { summary: L('Корень пространства', 'Space root') },
  'POST /app/files/folders': { summary: L('Создать папку', 'Create a folder'), body: [b('name', 'string', L('Название', 'Name'), { required: true }), b('parentId', 'integer', L('В папке', 'Inside a folder')), b('spaceId', 'integer', L('В корне пространства', 'At a space root'))] },
  'POST /app/files/folders/tree': {
    summary: L('Создать дерево папок (загрузка папки)', 'Create a folder tree (folder upload)'),
    description: L('Создаёт недостающие папки по относительным путям; существующие папки с тем же именем используются повторно. Ответ `folders` — id папок в порядке `paths`. Затем файлы загружаются через `POST /app/files/upload?parentId=<id>`.', 'Creates the missing folders of relative paths; existing folders with the same name are reused. `folders` holds the folder ids in the order of `paths`. Files then go up via `POST /app/files/upload?parentId=<id>`.'),
    body: [b('paths', 'string[]', L('Пути папок: "Фото", "Фото/2026" (до 1000, до 32 уровней)', 'Folder paths: "Photos", "Photos/2026" (up to 1000, 32 levels)'), { required: true }), b('parentId', 'integer', L('В папке', 'Inside a folder')), b('spaceId', 'integer', L('В корне пространства', 'At a space root')), b('bytes', 'integer', L('Общий размер файлов — заранее сверяется с квотой', 'Total size of the files, checked against the quota up front'))],
    example: { parentId: 42, paths: ['Photos', 'Photos/2026'], bytes: 1048576 },
  },
  'POST /app/files/upload': {
    summary: L('Загрузить файлы', 'Upload files'),
    description: L('`multipart/form-data`, поле `files`. Куда — параметрами `?parentId=` или `?spaceId=` (без них — в «Мои файлы»).', '`multipart/form-data`, field `files`. Target via `?parentId=` or `?spaceId=` (none = My files).'),
    query: [q('parentId', 'integer', L('Папка', 'Folder')), q('spaceId', 'integer', L('Пространство', 'Space'))],
  },
  'GET /app/files/nodes/:id/file': { summary: L('Скачать файл', 'Download a file'), query: [q('download', '"1"', L('Как вложение', 'As an attachment'))] },
  'GET /app/files/search': { summary: L('Поиск по имени', 'Search by name'), query: [q('q', 'string', L('От 2 символов', 'At least 2 characters'), { required: true })] },

  // ── Drive ──
  'GET /app/drive/': { summary: L('Серверы и папки', 'Servers and shares') },
  'GET /app/drive/shares/:id/list': { summary: L('Содержимое папки', 'Folder listing'), query: [q('path', 'string', L('Путь внутри папки', 'Path inside the share'))] },
  'GET /app/drive/shares/:id/file': { summary: L('Скачать файл', 'Download a file'), query: [q('path', 'string', L('Путь к файлу', 'File path'), { required: true })] },
  'POST /app/drive/shares/:id/folders/tree': {
    summary: L('Создать дерево папок (загрузка папки)', 'Create a folder tree (folder upload)'),
    description: L('Создаёт недостающие папки под `path`; существующие используются повторно. Ответ `folders` — `{ path, error }` в порядке `paths`.', 'Creates the missing folders under `path`; existing ones are reused. `folders` holds `{ path, error }` in the order of `paths`.'),
    body: [b('path', 'string', L('Папка, куда загружают', 'Folder to upload into')), b('paths', 'string[]', L('Относительные пути папок (до 1000, до 32 уровней)', 'Relative folder paths (up to 1000, 32 levels)'), { required: true })],
  },
  'PUT /app/drive/shares/:id/upload': { summary: L('Загрузить файл', 'Upload a file'), query: [q('path', 'string', L('Путь к новому файлу', 'Path of the new file'), { required: true })] },

  // ── KB ──
  'GET /app/kb/tree': { summary: L('Дерево папок', 'Folder tree') },
  'GET /app/kb/search': { summary: L('Поиск', 'Search'), query: [q('q', 'string', L('Текст', 'Text'), { required: true })] },
  'GET /app/kb/items/:id': { summary: L('Материал', 'Item') },
  'POST /app/kb/items': {
    summary: L('Создать материал', 'Create an item'),
    body: [
      b('folderId', 'integer', L('Папка', 'Folder'), { required: true }),
      b('kind', 'string', L('article или link', 'article or link')),
      b('title', 'string', L('Заголовок', 'Title'), { required: true }),
      b('content', 'string', L('Текст статьи; файлы — kbfile:<id>', 'Article body; files as kbfile:<id>')),
      b('format', 'string', L('md (Markdown, по умолчанию) или html (визуальный редактор)', 'md (Markdown, default) or html (visual editor)')),
      b('url', 'string', L('Адрес для ссылки', 'Address of a link')),
    ],
  },
  'POST /app/kb/folders/:id/media': { summary: L('Загрузить картинки и файлы для статьи', 'Upload pictures and files for an article'), description: L('multipart, поле files. Файлы прикрепляются к статье, когда она сохранена с kbfile:<id> в тексте.', 'multipart, field files. Files are attached when the article is saved with kbfile:<id> in its body.') },

  // ── Dashboard ──
  'GET /app/dashboard/': { summary: L('Мои виджеты', 'My widgets') },
  'GET /app/dashboard/data/:type': { summary: L('Данные виджета', 'Widget data') },

  // ── Admin: users ──
  'GET /admin/users': { summary: L('Пользователи', 'Users'), response: { success: true, users: [{ id: 7, username: 'aida', displayName: 'Aida Bekova', email: 'aida@example.com', isActive: true, roles: [{ key: 'user' }], groups: [{ id: 2, name: 'Sales' }] }] } },
  'POST /admin/users': {
    summary: L('Создать пользователя', 'Create a user'),
    description: L('Подходит для синхронизации с кадровой системой.', 'Suits syncing with an HR system.'),
    body: [b('username', 'string', L('Логин', 'Login'), { required: true }), b('displayName', 'string', L('Имя', 'Name')), b('email / phone', 'string', L('Контакты', 'Contacts')), b('password', 'string', L('Пароль (необязательно — вход по коду или AD)', 'Password (optional: code or AD sign-in)')), b('roleIds / groupIds', 'integer[]', L('Роли и группы', 'Roles and groups'))],
    example: { username: 'n.ivanova', displayName: 'Nadezhda Ivanova', email: 'n.ivanova@example.com', groupIds: [2] },
  },
  'GET /admin/users/:id': { summary: L('Пользователь', 'User') },
  'PUT /admin/users/:id': { summary: L('Изменить пользователя', 'Update a user'), body: [b('isActive', 'boolean', L('Включён', 'Enabled')), b('isBlocked', 'boolean', L('Заблокирован', 'Blocked')), b('displayName / email / phone / locale', 'string', L('Поля профиля', 'Profile fields')), b('password', 'string', L('Новый пароль', 'New password')), b('roleIds / groupIds', 'integer[]', L('Роли и группы', 'Roles and groups'))] },
  'DELETE /admin/users/:id': { summary: L('Удалить пользователя', 'Delete a user') },
  'GET /admin/groups': { summary: L('Группы', 'Groups') },
  'POST /admin/groups': { summary: L('Создать группу', 'Create a group'), body: [b('name', 'string', L('Название', 'Name'), { required: true }), b('description', 'string', L('Описание', 'Description')), b('roleIds', 'integer[]', L('Роли группы', 'Roles of the group')), b('isDefault', 'boolean', L('Новые пользователи попадают в неё', 'New users join it'))] },
  'GET /admin/roles': { summary: L('Роли', 'Roles') },
  'GET /admin/permissions': { summary: L('Каталог прав', 'Permission catalog') },
  'GET /admin/security/events': { summary: L('События безопасности', 'Security events'), query: [q('kind', 'string', L('Тип', 'Kind')), q('limit', 'integer', L('Сколько', 'How many'))] },
  'GET /admin/system': { summary: L('Версия, база, аптайм', 'Version, database, uptime') },
  'GET /admin/overview': { summary: L('Сводка администратора', 'Administrator overview') },
};

/** Reusable explanations shown in the guide part of the developer portal. */
export const ERRORS = [
  { status: 400, code: 'VALIDATION', text: L('Неверные данные запроса; в `error` — что именно.', 'Invalid request data; `error` says what.') },
  { status: 401, code: 'TOKEN_INVALID', text: L('Токен не найден или повреждён.', 'The token is unknown or malformed.') },
  { status: 401, code: 'TOKEN_EXPIRED', text: L('Срок действия токена истёк.', 'The token has expired.') },
  { status: 401, code: 'TOKEN_REVOKED', text: L('Токен отозван.', 'The token was revoked.') },
  { status: 403, code: 'SCOPE_DENIED', text: L('У токена нет нужной области (`scope`) или запрос запрещён правилом (`rule`).', 'The token lacks the needed `scope`, or a `rule` denies the request.') },
  { status: 403, code: 'ROUTE_NOT_AVAILABLE', text: L('Эндпоинт недоступен токенам (вход, пароли, управление токенами).', 'Not available to tokens (sign-in, passwords, token management).') },
  { status: 403, code: 'IP_NOT_ALLOWED', text: L('Адрес не входит в список разрешённых для токена.', "The address is not in the token's allow list.") },
  { status: 403, code: 'FORBIDDEN', text: L('У владельца токена нет прав на действие.', 'The token owner may not do this.') },
  { status: 403, code: 'OWNER_INACTIVE', text: L('Учётная запись владельца отключена.', "The owner's account is disabled.") },
  { status: 404, code: 'NOT_FOUND', text: L('Не найдено или нет доступа.', 'Not found, or no access.') },
  { status: 404, code: 'MODULE_DISABLED', text: L('Модуль выключен.', 'The module is turned off.') },
  { status: 429, code: 'RATE_LIMITED', text: L('Превышен лимит запросов; подождите `retryAfter` секунд.', 'Rate limit exceeded; wait `retryAfter` seconds.') },
  { status: 503, code: 'API_DISABLED', text: L('API выключен администратором.', 'The API is turned off by the administrator.') },
];
