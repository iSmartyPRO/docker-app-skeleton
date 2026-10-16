export default {
  id: 'drive',
  purpose: {
    ru: 'Файловый сервер открывает Windows-шары компании (SMB, Samba) в браузере как единый сетевой диск: просмотр, правка, загрузка, ссылки и журнал действий. Права берутся с сервера (NTFS, группы Active Directory), портал их не обходит.',
    en: 'The file server opens the company’s Windows shares (SMB, Samba) in the browser as one network drive: viewing, editing, uploads, links and an activity log. Rights come from the server (NTFS, Active Directory groups); the portal never bypasses them.',
  },
  audience: { ru: 'Сотрудники, работающие с общими папками; системный администратор подключает серверы и управляет доступом.', en: 'People working with shared folders; the system administrator connects servers and manages access.' },
  setup: [
    { title: { ru: 'Включите модуль и назовите диск', en: 'Switch it on and name the drive' }, text: { ru: 'Модуль выключен по умолчанию. В [настройках](/admin/settings/drive) задайте название, например «Диск компании».', en: 'The module is off by default. In the [settings](/admin/settings/drive) give it a name, e.g. «Company drive».' } },
    { title: { ru: 'Добавьте серверы и папки', en: 'Add servers and folders' }, text: { ru: 'Адрес сервера и шары, которые увидят сотрудники. Вход — доменной учётной записью каждого.', en: 'Server address and the shares people see. Sign-in uses each person’s domain account.' } },
    { title: { ru: 'Подключите Active Directory', en: 'Connect Active Directory' }, text: { ru: '[Интеграция AD](/admin/settings/ad) нужна для блока «Управление доступом» (группы доступа к папкам) и повторного использования доменного пароля.', en: 'The [AD integration](/admin/settings/ad) is needed for «Access management» (folder access groups) and reusing the domain password.' } },
    { title: { ru: 'Ссылки и журнал', en: 'Links and log' }, text: { ru: 'Политика публичных ссылок, журнал действий и срок его хранения.', en: 'Public link policy, the activity log and how long it is kept.' } },
  ],
  roles: {
    'drive.admin': { ru: 'Настройки модуля, серверы и папки.', en: 'Module settings, servers and folders.' },
    'drive.audit': { ru: 'Журнал действий: кто что открыл, изменил или удалил.', en: 'Activity log: who opened, changed or deleted what.' },
    'drive.access': { ru: 'Состав групп доступа к папкам в AD (кроме защищённых). Права NTFS — только суперадминистраторам.', en: 'Membership of folder access groups in AD (except protected ones). NTFS rights are for superadministrators only.' },
  },
  scenarios: [
    { title: { ru: 'Удалённая работа', en: 'Remote work' }, text: { ru: 'Сотрудник открывает папку отдела из дома через браузер, без VPN; права те же, что в офисе.', en: 'An employee opens the department folder from home in the browser, without VPN; rights are the same as in the office.' } },
    { title: { ru: 'Выдача доступа к папке', en: 'Granting folder access' }, text: { ru: 'Руководитель просит доступ — администратор в панели «Доступ» добавляет человека в группу чтения папки, действие пишется в журнал.', en: 'A manager asks for access — the administrator adds the person to the folder’s read group in the «Access» panel, logged in the journal.' } },
  ],
  faq: [
    { q: { ru: 'Портал хранит копии файлов?', en: 'Does the portal keep copies?' }, a: { ru: 'Нет, файлы остаются на файловом сервере; кэшируются только превью.', en: 'No, files stay on the file server; only previews are cached.' } },
    { q: { ru: 'Можно ли без Active Directory?', en: 'Does it work without Active Directory?' }, a: { ru: 'Да, для обычного доступа к шарам. Без AD недоступно только управление группами доступа.', en: 'Yes for plain share access. Without AD only access group management is unavailable.' } },
  ],
};
