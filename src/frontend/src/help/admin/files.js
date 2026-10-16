export default {
  id: 'files',
  purpose: {
    ru: 'Файлы — облачное хранилище портала: личные файлы каждого, общие пространства отделов, совместный доступ и публичные ссылки с паролем и сроком. В нём же хранятся материалы базы знаний.',
    en: 'Files is the portal’s cloud storage: everyone’s personal files, department spaces, sharing and public links with a password and expiry. The knowledge base keeps its materials here too.',
  },
  audience: { ru: 'Все сотрудники; администратор файлов управляет пространствами, квотами и политикой ссылок.', en: 'Every employee; the files administrator manages spaces, quotas and the link policy.' },
  setup: [
    { title: { ru: 'Лимиты', en: 'Limits' }, text: { ru: 'В [настройках](/admin/settings/files): максимальный размер файла, личная квота, срок хранения корзины, разрешённые типы файлов.', en: 'In the [settings](/admin/settings/files): maximum file size, personal quota, trash retention, allowed file types.' } },
    { title: { ru: 'Политика публичных ссылок', en: 'Public link policy' }, text: { ru: 'Разрешить ли ссылки, обязателен ли пароль, максимальный срок, можно ли посетителям загружать файлы.', en: 'Whether links are allowed, whether a password is required, the longest lifetime, whether visitors may upload.' } },
    { title: { ru: 'Общие пространства', en: 'Shared spaces' }, text: { ru: 'Решите, кто их создаёт (все или администраторы), и заведите пространства отделов с доступом по группам.', en: 'Decide who creates them (everyone or administrators) and create department spaces with group access.' } },
    { title: { ru: 'Просмотр документов Office', en: 'Office document previews' }, text: { ru: 'Подключите [сервер документов](/admin/settings/documents) (Collabora) для точного просмотра и онлайн-редактирования.', en: 'Connect a [document server](/admin/settings/documents) (Collabora) for exact previews and online editing.' } },
  ],
  roles: { 'files.admin': { ru: 'Создание общих пространств при запрете для всех, управление всеми пространствами и настройками модуля. Личные файлы других людей это право не открывает.', en: 'Create shared spaces when others may not, manage every space and the module settings. It does not open other people’s personal files.' } },
  access: { ru: 'Доступ задаётся на пространстве, папке или файле: просмотр, правка, управление — пользователю, группе или роли.', en: 'Access is set on a space, folder or file: view, edit, manage — for a user, group or role.' },
  scenarios: [
    { title: { ru: 'Обмен с клиентом', en: 'Exchange with a client' }, text: { ru: 'Менеджер создаёт ссылку на папку «Для клиента» с паролем и сроком 14 дней и правом загрузки — клиент присылает документы без почты.', en: 'A manager links the «For the client» folder with a password, a 14-day expiry and upload rights — the client sends documents without e-mail.' } },
    { title: { ru: 'Пространство бухгалтерии', en: 'Accounting space' }, text: { ru: 'Пространство открыто группе «Бухгалтерия» на правку и руководству на просмотр.', en: 'The space is open to the «Accounting» group to edit and to management to view.' } },
  ],
  faq: [
    { q: { ru: 'Где физически лежат файлы?', en: 'Where are files stored?' }, a: { ru: 'В папке загрузок сервера портала; они отдаются только после проверки прав.', en: 'In the portal server’s upload folder; they are served only after an access check.' } },
    { q: { ru: 'Что будет, если отключить публичные ссылки?', en: 'What if public links are turned off?' }, a: { ru: 'Все существующие ссылки сразу перестанут открываться.', en: 'Every existing link stops working at once.' } },
    { q: { ru: 'Можно ли восстановить удалённый файл?', en: 'Can a deleted file be restored?' }, a: { ru: 'Да, из корзины в течение срока хранения.', en: 'Yes, from the trash within the retention period.' } },
  ],
};
