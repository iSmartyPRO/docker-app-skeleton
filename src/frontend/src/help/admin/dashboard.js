export default {
  id: 'dashboard',
  purpose: {
    ru: 'Дашборд — личная страница виджетов поверх всех модулей: мои задачи, встречи, файлы, заявки, остатки, цифры. Администратор задаёт стартовую раскладку, каждый может перестроить её под себя.',
    en: 'The dashboard is a personal page of widgets over every module: my tasks, meetings, files, requests, stock and figures. The administrator sets the starting layout; everyone can rearrange it.',
  },
  audience: { ru: 'Все сотрудники; руководителям — сводка дня.', en: 'Every employee; for managers — the day at a glance.' },
  setup: [
    { title: { ru: 'Стартовая раскладка', en: 'Starting layout' }, text: { ru: 'В [настройках](/admin/settings/dashboard) соберите набор виджетов, который увидят новые сотрудники.', en: 'In the [settings](/admin/settings/dashboard) build the set of widgets newcomers see.' } },
    { title: { ru: 'Личная настройка', en: 'Personal layouts' }, text: { ru: 'Разрешите или запретите сотрудникам менять раскладку.', en: 'Allow or forbid people to change their layout.' } },
    { title: { ru: 'Сделайте главной', en: 'Make it the home page' }, text: { ru: 'В [доступе к сайту](/admin/settings/access) выберите «Дашборд».', en: 'In [site access](/admin/settings/access) choose «Dashboard».' } },
  ],
  roles: { 'dashboard.admin': { ru: 'Стартовая раскладка и настройки модуля.', en: 'The starting layout and module settings.' } },
  scenarios: [
    { title: { ru: 'Утро руководителя', en: 'A manager’s morning' }, text: { ru: '«Ждёт меня», просроченные задачи команды, встречи дня и платежи по договорам на одном экране.', en: '«Waiting for me», the team’s overdue tasks, today’s meetings and contract payments on one screen.' } },
    { title: { ru: 'Кладовщик', en: 'Storekeeper' }, text: { ru: 'Виджеты «Ниже минимума» и «Ждут приёмки» вместо заметок и графиков.', en: '«Below minimum» and «Awaiting receipt» widgets instead of notes and charts.' } },
  ],
  faq: [
    { q: { ru: 'Пропал виджет', en: 'A widget disappeared' }, a: { ru: 'Виджеты выключенных модулей и тех, на которые у человека нет прав, скрываются автоматически.', en: 'Widgets of switched-off modules, or ones the person may not use, are hidden automatically.' } },
    { q: { ru: 'Изменение стартовой раскладки затронет всех?', en: 'Does changing the starting layout affect everyone?' }, a: { ru: 'Только тех, кто ещё не настраивал свой дашборд, и тех, кто нажмёт «Сбросить».', en: 'Only those who have not arranged their own yet, and those who press «Reset».' } },
  ],
};
