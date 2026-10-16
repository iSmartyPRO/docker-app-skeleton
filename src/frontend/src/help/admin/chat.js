export default {
  id: 'chat',
  purpose: {
    ru: 'Чаты — мессенджер внутри портала: личные и групповые переписки, обсуждения задач, сделок, заявок и договоров. Рабочие разговоры остаются в компании и привязаны к делу, а не теряются в личных мессенджерах.',
    en: 'Chats is the portal’s messenger: direct and group conversations, discussions of tasks, deals, requests and contracts. Work talk stays in the company and next to the record instead of personal messengers.',
  },
  audience: { ru: 'Все сотрудники.', en: 'Every employee.' },
  setup: [
    { title: { ru: 'Разрешите или запретите группы', en: 'Allow or forbid groups' }, text: { ru: 'В [настройках](/admin/settings/chat) решите, может ли каждый создавать групповые чаты.', en: 'In the [settings](/admin/settings/chat) decide whether anyone may create group chats.' } },
    { title: { ru: 'Ограничьте размер файлов', en: 'Limit file size' }, text: { ru: 'Максимальный размер вложения в мегабайтах.', en: 'The maximum attachment size in megabytes.' } },
    { title: { ru: 'Настройте видеозвонки', en: 'Set up video calls' }, text: { ru: 'Шаблон ссылки на встречу, `{room}` заменяется уникальным кодом. Пустое поле убирает кнопку звонка.', en: 'A meeting link template; `{room}` becomes a unique code. Leave it empty to hide the call button.' } },
    { title: { ru: 'Проверьте push-уведомления', en: 'Check push notifications' }, text: { ru: 'Сообщения приходят тем, кто не смотрит в чат, через [уведомления](/admin/settings/notifications).', en: 'Messages reach people who are not looking through [notifications](/admin/settings/notifications).' } },
  ],
  roles: {
    'chat.admin': { ru: 'Создание групп при запрете для всех и удаление любых сообщений. Читать чужие личные переписки это право не позволяет.', en: 'Create groups when it is forbidden for others and delete any message. It does not allow reading other people’s direct chats.' },
  },
  scenarios: [
    { title: { ru: 'Чат отдела', en: 'Department chat' }, text: { ru: 'Руководитель создаёт группу «Продажи», закрепляет важные сообщения, новые сотрудники добавляются в один клик.', en: 'The head creates a «Sales» group and pins key messages; newcomers are added in one click.' } },
    { title: { ru: 'Обсуждение задачи', en: 'Discussing a task' }, text: { ru: 'У каждой задачи свой чат: участники видят историю изменений и переписку вместе.', en: 'Each task has its own chat: participants see the history of changes and the discussion together.' } },
  ],
  faq: [
    { q: { ru: 'Что будет, если выключить чаты?', en: 'What if chats are switched off?' }, a: { ru: 'Переписки скрываются, но сохраняются. У задач, сделок и заявок пропадёт вкладка обсуждения.', en: 'Conversations are hidden but kept. Tasks, deals and requests lose their discussion tab.' } },
    { q: { ru: 'Видит ли администратор личные сообщения?', en: 'Can the administrator read direct messages?' }, a: { ru: 'Нет. Личный чат видят только его участники.', en: 'No. A direct chat is visible to its participants only.' } },
    { q: { ru: 'Какой сервис звонков нужен?', en: 'Which call service is needed?' }, a: { ru: 'Любой, где встреча открывается по ссылке (по умолчанию Jitsi Meet). Можно указать свой сервер.', en: 'Any service where a meeting opens by link (Jitsi Meet by default). You can point to your own server.' } },
  ],
};
