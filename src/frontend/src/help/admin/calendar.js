export default {
  id: 'calendar',
  purpose: {
    ru: 'Календарь собирает встречи, общие календари команд и переговорных, приглашения с ответами и сроки задач. Сотрудники видят свой день в одном месте, а Google Календарь можно показать рядом.',
    en: 'The Calendar brings together meetings, shared calendars of teams and rooms, invitations with replies and task deadlines. People see their day in one place, with Google Calendar alongside.',
  },
  audience: {
    ru: 'Все сотрудники; офис-менеджер ведёт общие календари (переговорные, отпуска, события компании).',
    en: 'Every employee; the office manager runs shared calendars (meeting rooms, holidays, company events).',
  },
  setup: [
    { title: { ru: 'Задайте рабочий день', en: 'Set the working day' }, text: { ru: 'В [настройках](/admin/settings/calendar): начало недели, часы дня, вид по умолчанию и напоминание по умолчанию. Каждый может поменять это для себя.', en: 'In the [settings](/admin/settings/calendar): week start, day hours, default view and default reminder. Everyone can change them for themselves.' } },
    { title: { ru: 'Решите, кто создаёт общие календари', en: 'Decide who creates shared calendars' }, text: { ru: '«Все» или «Только администраторы» (право calendar.admin).', en: '«Everyone» or «Administrators only» (calendar.admin).' } },
    { title: { ru: 'Создайте общие календари', en: 'Create shared calendars' }, text: { ru: 'Например, «Переговорная», «Отпуска», «События компании», и откройте их нужным группам на просмотр или правку.', en: 'For example «Meeting room», «Holidays», «Company events», and open them to groups to view or edit.' } },
    { title: { ru: 'Подключите Google (по желанию)', en: 'Connect Google (optional)' }, text: { ru: 'В [интеграции Google](/admin/settings/google) включите календарь — сотрудники смогут показать свои Google-календари в портале.', en: 'In the [Google integration](/admin/settings/google) switch on the calendar — people can show their Google calendars in the portal.' } },
  ],
  roles: {
    'calendar.admin': { ru: 'Управление всеми общими календарями. Личные календари сотрудников администратор не видит.', en: 'Manage every shared calendar. Personal calendars stay private even to the administrator.' },
  },
  scenarios: [
    { title: { ru: 'Бронь переговорной', en: 'Booking a meeting room' }, text: { ru: 'Общий календарь «Переговорная» открыт всем на правку: занять время — значит создать в нём событие.', en: 'A shared «Meeting room» calendar open to everyone for editing: booking a slot means adding an event to it.' } },
    { title: { ru: 'Планёрка по понедельникам', en: 'Monday stand-up' }, text: { ru: 'Повторяющееся событие с участниками: каждый получает приглашение и напоминание за 15 минут.', en: 'A recurring event with attendees: each gets an invitation and a reminder 15 minutes before.' } },
  ],
  faq: [
    { q: { ru: 'Откуда в календаре задачи?', en: 'Why are tasks in my calendar?' }, a: { ru: 'Календарь показывает сроки задач, в которых человек участвует, если включён модуль «Задачи». Это отключается в личных настройках.', en: 'The calendar shows deadlines of tasks the person takes part in when Tasks is on. It can be turned off in personal settings.' } },
    { q: { ru: 'Как приходят напоминания?', en: 'How are reminders delivered?' }, a: { ru: 'Через центр уведомлений: в портал и по каналам, которые человек выбрал (почта, Telegram и др.).', en: 'Through the notification center: in the portal and through the channels the person chose (e-mail, Telegram, etc.).' } },
    { q: { ru: 'Синхронизация с Google двусторонняя?', en: 'Is Google sync two-way?' }, a: { ru: 'Google-календари показываются вживую, события в них можно создавать из портала, если человек дал доступ.', en: 'Google calendars are shown live; events can be created in them from the portal when the person granted access.' } },
  ],
};
