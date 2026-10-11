export default {
  id: 'calendar',
  icon: 'calendar',
  title: { ru: 'Календарь', en: 'Calendar' },
  tagline: { ru: 'Встречи, сроки задач и общие календари в одном месте', en: 'Meetings, task deadlines and shared calendars in one place' },
  summary: {
    ru: 'Планируйте встречи с коллегами, приглашайте участников и получайте напоминания. Задачи со сроком сами появляются в календаре — их можно переносить мышкой и создавать прямо здесь. Каждый настраивает календарь под себя: вид, рабочие часы, какие задачи показывать.',
    en: 'Plan meetings, invite colleagues and get reminders. Tasks with a deadline appear in the calendar by themselves — move them with the mouse or create them right here. Everyone sets the calendar up for themselves: view, working hours, which tasks to show.',
  },
  highlights: [
    { icon: '📅', title: { ru: 'События и приглашения', en: 'Events and invitations' }, text: { ru: 'Встречи с участниками, местом, ссылкой на видеозвонок и ответом «приду / не приду».', en: 'Meetings with attendees, place, video link and “going / not going” answers.' } },
    { icon: '☑️', title: { ru: 'Задачи на календаре', en: 'Tasks on the calendar' }, text: { ru: 'Сроки ваших задач видны рядом со встречами; перетащите задачу — срок перенесётся.', en: 'Your task deadlines sit next to meetings; drag a task to move its deadline.' } },
    { icon: '⚡', title: { ru: 'Быстрое создание', en: 'Quick creation' }, text: { ru: 'Нажмите на пустое место — выберите «Событие» или «Задача».', en: 'Click an empty slot and choose “Event” or “Task”.' } },
    { icon: '🔁', title: { ru: 'Повторы и напоминания', en: 'Repeats and reminders' }, text: { ru: 'Еженедельные планёрки, напоминания за нужное время — в портал, push, почту и мессенджеры.', en: 'Weekly stand-ups, reminders ahead of time — to the portal, push, e-mail and messengers.' } },
    { icon: '👥', title: { ru: 'Общие календари', en: 'Shared calendars' }, text: { ru: 'Календари отдела или переговорных с доступом для групп; подпишитесь, чтобы узнавать об изменениях.', en: 'Team or meeting-room calendars shared with groups; follow one to hear about changes.' } },
    { icon: '⚙️', title: { ru: 'Под себя', en: 'Your way' }, text: { ru: 'Вид, начало недели, рабочие часы, шаг сетки, выходные, какие задачи показывать.', en: 'View, week start, working hours, grid step, weekends, which tasks to show.' } },
  ],
  tips: [
    { ru: 'Нажмите и протяните мышью по сетке — событие сразу получит нужную длительность.', en: 'Click and drag across the grid — the event gets that length at once.' },
    { ru: 'Перетащите задачу из списка «Без срока» на день — ей назначится срок.', en: 'Drag a task from “Without a deadline” onto a day to give it a deadline.' },
    { ru: 'Галочки слева прячут и показывают календари, приглашения и задачи — выбор запоминается.', en: 'The ticks on the left hide and show calendars, invitations and tasks — your choice is remembered.' },
    { ru: 'Клик по числу дня открывает этот день целиком.', en: 'Click a day number to open that day.' },
    { ru: '⚙ в панели сверху — личные настройки календаря.', en: '⚙ in the top bar opens your calendar settings.' },
  ],
  sections: [
    {
      id: 'views',
      title: { ru: 'Виды и навигация', en: 'Views and navigation' },
      body: {
        ru: `Сверху переключаются виды: **Месяц**, **Неделя**, **Рабочая неделя** (без субботы и воскресенья), **День** и **Повестка** — список событий по дням. Кнопка **Сегодня** возвращает к текущей дате, стрелки ‹ › листают.

Мини-календарь слева позволяет быстро перейти к любой дате. На телефоне боковая панель открывается кнопкой ☰.`,
        en: `Switch views at the top: **Month**, **Week**, **Work week** (no Saturday and Sunday), **Day** and **Agenda** — a list of events by day. **Today** returns to the current date, the arrows ‹ › move back and forth.

The mini calendar on the left jumps to any date. On a phone the side panel opens with ☰.`,
      },
    },
    {
      id: 'events',
      title: { ru: 'Создание события', en: 'Creating an event' },
      body: {
        ru: 'Событие — это встреча или занятое время: название, начало и конец, календарь, участники, место, ссылка на видеозвонок, напоминания, описание и цвет.',
        en: 'An event is a meeting or busy time: title, start and end, calendar, attendees, place, video link, reminders, description and colour.',
      },
      steps: [
        { ru: 'Нажмите на пустое место в сетке (или протяните мышью для нужной длительности) либо кнопку **+ Событие** слева.', en: 'Click an empty slot (or drag for the length you need) or **+ Event** on the left.' },
        { ru: 'Если доступны и события, и задачи, выберите **Событие**.', en: 'If both events and tasks are available, choose **Event**.' },
        { ru: 'Введите название, проверьте время, выберите календарь и пригласите участников.', en: 'Enter the title, check the time, pick the calendar and invite attendees.' },
        { ru: 'Добавьте место или ссылку на звонок и напоминание. Нажмите **Сохранить**.', en: 'Add a place or a call link and a reminder. Click **Save**.' },
      ],
      example: {
        title: { ru: 'Планёрка отдела', en: 'Team stand-up' },
        body: {
          ru: 'Протяните мышью по понедельнику с 9:00 до 9:30, назовите «Планёрка», выберите календарь «Отдел продаж», в «Повтор» — «Каждую неделю», добавьте участников и напоминание за 10 минут. Коллеги получат приглашение и смогут ответить «Приду».',
          en: 'Drag across Monday 9:00–9:30, call it “Stand-up”, choose the “Sales” calendar, set “Repeat” to “Every week”, add attendees and a reminder 10 minutes before. Colleagues get an invitation and can answer “Going”.',
        },
      },
    },
    {
      id: 'invitations',
      title: { ru: 'Приглашения и ответы', en: 'Invitations and answers' },
      body: {
        ru: `Участники получают уведомление о приглашении. Событие появляется у них в календаре (раздел «Приглашения» слева), даже если сам календарь им не виден.

В карточке события можно ответить **Приду**, **Возможно** или **Не приду** — организатор увидит ответы. Отклонённые события остаются зачёркнутыми; спрятать их можно в настройках календаря.`,
        en: `Attendees get an invitation notification. The event appears in their calendar (“Invitations” on the left) even if they cannot see that calendar.

In the event card answer **Going**, **Maybe** or **Not going** — the organiser sees the answers. Declined events stay crossed out; hide them in the calendar settings.`,
      },
    },
    {
      id: 'repeat',
      title: { ru: 'Повторяющиеся события', en: 'Recurring events' },
      body: {
        ru: 'В поле «Повтор» выберите готовый вариант (каждый день, по будням, каждую неделю, месяц, год) или настройте свой: интервал, дни недели и окончание. При изменении или удалении одного повторения портал спросит: только это или всю серию.',
        en: 'In “Repeat” choose a preset (daily, weekdays, weekly, monthly, yearly) or set your own: interval, weekdays and end. When you change or delete one occurrence the portal asks: just this one or the whole series.',
      },
      note: {
        ru: 'Перетаскивание повторяющегося события тоже спросит, что переносить — одно событие или всю серию.',
        en: 'Dragging a recurring event also asks what to move — one occurrence or the whole series.',
      },
    },
    {
      id: 'reminders',
      title: { ru: 'Напоминания', en: 'Reminders' },
      body: {
        ru: `Напоминание приходит за выбранное время до начала: в колокольчик портала, push на телефон, на почту и в Telegram/Mattermost — по вашим [настройкам уведомлений](/account/notifications). Напоминание по умолчанию для новых событий задаётся в настройках календаря.

Если напоминание не пришло — откройте настройки уведомлений: внизу видно, куда ушло каждое уведомление и почему не дошло, а кнопка «Отправить тест» проверит каналы.`,
        en: `A reminder arrives the chosen time before the start: in the portal bell, as a push, by e-mail and to Telegram/Mattermost — following your [notification settings](/account/notifications). The default reminder for new events is set in the calendar settings.

If a reminder did not arrive, open the notification settings: at the bottom you see where each notification went and why, and “Send a test” checks the channels.`,
      },
    },
    {
      id: 'tasks',
      title: { ru: 'Задачи в календаре', en: 'Tasks in the calendar' },
      body: {
        ru: `Задачи со **сроком** показываются в день и время срока рядом с событиями: ☐ — открытая, ✓ и зачёркнутая — завершённая, красная полоса — просроченная. Клик открывает задачу.

- **Перетащите** задачу на другой день или час — срок перенесётся (если вам разрешено менять срок).
- Список **«Без срока»** слева — ваши открытые задачи без срока. Перетащите любую на день, чтобы назначить срок.
- **Создать задачу** можно кнопкой «Задача» слева или нажав на пустое место и выбрав «Задача». Она назначится вам; подробности — в карточке задачи.

Какие задачи показывать — те, что вы выполняете, все, где вы участвуете, или все доступные — и показывать ли завершённые, выбирается в настройках (⚙).`,
        en: `Tasks with a **deadline** appear on its date and time next to events: ☐ — open, ✓ and crossed out — done, a red bar — overdue. Click to open the task.

- **Drag** a task to another day or hour to move its deadline (if you may change it).
- **“Without a deadline”** on the left lists your open tasks without one. Drag any onto a day to schedule it.
- **Create a task** with “Task” on the left, or click an empty slot and choose “Task”. It is assigned to you; details go in the task card.

Which tasks to show — the ones you do, all you take part in, or all you can see — and whether to show completed ones is set in the settings (⚙).`,
      },
      example: {
        title: { ru: 'Распланировать неделю', en: 'Plan the week' },
        body: {
          ru: 'В понедельник утром откройте «Рабочую неделю». Слева в «Без срока» пять задач — перетащите каждую на свободное время между встречами. Сроки назначатся, а коллеги-постановщики увидят их в карточках задач.',
          en: 'On Monday morning open “Work week”. “Without a deadline” lists five tasks — drag each into free time between meetings. They get deadlines, and the colleagues who set them see the dates in the task cards.',
        },
      },
      note: {
        ru: 'Новая задача по умолчанию получает срок «через неделю» — ищите её на следующей неделе или нажмите «В календаре» в подсказке после создания.',
        en: 'A new task gets the deadline “in a week” by default — look for it next week, or click “In the calendar” in the note after creating it.',
      },
    },
    {
      id: 'calendars',
      title: { ru: 'Свои и общие календари', en: 'Personal and shared calendars' },
      body: {
        ru: `У каждого есть личный календарь. Общие календари — например, «Отдел продаж» или «Переговорная 1» — создаются кнопкой **+** в списке календарей (если администратор это разрешил).

Через меню календаря (⋯) владелец настраивает **доступ**: кому только смотреть, кому добавлять события, кому управлять. Галочка слева от названия прячет или показывает календарь.`,
        en: `Everyone has a personal calendar. Shared ones — e.g. “Sales” or “Meeting room 1” — are created with **+** in the calendar list (if the administrator allows it).

Through the calendar menu (⋯) the owner sets **access**: who only views, who adds events, who manages. The tick next to the name hides or shows the calendar.`,
      },
      example: {
        title: { ru: 'Календарь переговорной', en: 'A meeting room calendar' },
        body: {
          ru: 'Создайте календарь «Переговорная 1», откройте ⋯ → Доступ и дайте всем право добавлять события. Теперь бронь — это событие в этом календаре, и все видят, когда комната занята.',
          en: 'Create a calendar “Meeting room 1”, open ⋯ → Access and let everyone add events. Now a booking is an event in that calendar and everyone sees when the room is busy.',
        },
      },
    },
    {
      id: 'follow',
      title: { ru: 'Подписка на календарь', en: 'Following a calendar' },
      body: {
        ru: 'Чтобы узнавать о новых и изменённых событиях общего календаря, не будучи участником, откройте ⋯ у календаря → **Сообщать об изменениях**. Отписаться можно там же или в [настройках уведомлений](/account/notifications) → «Подписки».',
        en: 'To hear about new and changed events of a shared calendar without being an attendee, open ⋯ next to it → **Notify me about changes**. Unsubscribe there or in [notification settings](/account/notifications) → “Subscriptions”.',
      },
    },
    {
      id: 'settings',
      title: { ru: 'Личные настройки', en: 'Your settings' },
      body: {
        ru: `Кнопка ⚙ в панели сверху открывает настройки, которые действуют только для вас:
- **Вид** при открытии, начало недели, **рабочие часы** (подсвечиваются и задают, куда прокручивается день), шаг сетки, выходные, номера недель, отклонённые события;
- **Задачи**: показывать ли, какие (я выполняю / все мои / все доступные), завершённые, длина блока задачи;
- **Новые события**: календарь, длительность и напоминание по умолчанию.

«Как по умолчанию» возвращает настройки портала.`,
        en: `⚙ in the top bar opens settings that apply only to you:
- **View** on open, week start, **working hours** (highlighted, and where the day scrolls to), grid step, weekends, week numbers, declined events;
- **Tasks**: whether to show them, which ones (I do / all mine / all visible), completed ones, task block length;
- **New events**: default calendar, length and reminder.

“Reset to defaults” brings back the portal settings.`,
      },
    },
    {
      id: 'google',
      title: { ru: 'Google Календарь', en: 'Google Calendar' },
      body: {
        ru: 'Если администратор включил интеграцию с Google, подключите свой Google-аккаунт — его календари появятся слева отдельным блоком. События Google можно создавать, переносить и удалять прямо отсюда.',
        en: 'If the administrator enabled Google, connect your Google account — its calendars appear on the left as a separate block. Google events can be created, moved and deleted right here.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Создал задачу, а в календаре её нет', en: 'I created a task but it is not in the calendar' },
      a: {
        ru: 'Скорее всего, её срок на следующей неделе: по умолчанию срок — «через неделю». Нажмите «В календаре» в подсказке после создания или перейдите на следующую неделю. Также проверьте, что слева включены «Мои задачи», а в ⚙ — «Показывать задачи». Задачи без срока находятся в списке «Без срока».',
        en: 'Most likely its deadline is next week: the default is “in a week”. Click “In the calendar” in the note after creating it, or go to next week. Also check that “My tasks” is on in the sidebar and “Show tasks” in ⚙. Tasks without a deadline are in “Without a deadline”.',
      },
    },
    {
      q: { ru: 'Почему я не могу перетащить задачу?', en: 'Why can’t I drag a task?' },
      a: {
        ru: 'Завершённые задачи не переносятся. Если постановщик запретил менять срок, портал вернёт задачу на место и покажет причину.',
        en: 'Completed tasks do not move. If the originator locked the deadline, the portal puts the task back and shows why.',
      },
    },
    {
      q: { ru: 'Не пришло напоминание о встрече', en: 'A meeting reminder did not arrive' },
      a: {
        ru: 'Откройте [настройки уведомлений](/account/notifications): проверьте, что каналы подключены (Telegram — в «Профиль → Безопасность», push — включены на устройстве), нет паузы и тихих часов, и посмотрите «Последние уведомления» — там видна причина. Кнопка «Отправить тест» проверит все каналы сразу.',
        en: 'Open [notification settings](/account/notifications): check the channels are connected (Telegram — “Profile → Security”, push — enabled on the device), there is no pause or quiet hours, and look at “Recent notifications” — the reason is there. “Send a test” checks every channel at once.',
      },
    },
    {
      q: { ru: 'Как спрятать выходные?', en: 'How do I hide weekends?' },
      a: { ru: 'Выберите вид «Рабочая неделя» или выключите «Показывать выходные» в ⚙.', en: 'Choose the “Work week” view or turn off “Show weekends” in ⚙.' },
    },
    {
      q: { ru: 'Кто видит мои события?', en: 'Who sees my events?' },
      a: {
        ru: 'События личного календаря видите вы и приглашённые участники. События общего календаря — все, кому открыт этот календарь.',
        en: 'Events of your personal calendar are seen by you and the attendees. Events of a shared calendar — by everyone the calendar is shared with.',
      },
    },
    {
      q: { ru: 'Как сделать встречу видеозвонком?', en: 'How do I make a meeting a video call?' },
      a: { ru: 'Вставьте ссылку в поле «Ссылка на встречу» — в карточке события появится кнопка подключения.', en: 'Paste the link into “Meeting link” — the event card gets a join button.' },
    },
  ],
  fields: {
    quickTask: { title: { ru: 'Задача из календаря', en: 'A task from the calendar' }, text: { ru: 'Быстрая задача со сроком в выбранное время. Назначается вам; остальное — в карточке задачи.', en: 'A quick task due at the chosen time. Assigned to you; everything else is in the task card.' }, more: 'tasks' },
    undated: { title: { ru: 'Задачи без срока', en: 'Tasks without a deadline' }, text: { ru: 'Ваши открытые задачи без срока. Перетащите на день или час — срок назначится.', en: 'Your open tasks without a deadline. Drag one onto a day or hour to give it a deadline.' }, more: 'tasks' },
    workHours: { title: { ru: 'Рабочие часы', en: 'Working hours' }, text: { ru: 'Подсвечиваются в дне и неделе; день открывается с их начала.', en: 'Highlighted in day and week views; the day opens at their start.' }, more: 'settings' },
    tasks: { title: { ru: 'Задачи в календаре', en: 'Tasks in the calendar' }, text: { ru: 'Сроки задач рядом с событиями. Перетаскивание переносит срок.', en: 'Task deadlines next to events. Dragging moves the deadline.' }, more: 'tasks' },
    taskScope: { title: { ru: 'Какие задачи', en: 'Which tasks' }, text: { ru: '«Я выполняю» — где вы исполнитель или соисполнитель; «Все мои» — любая ваша роль; «Все доступные» — и задачи проектов, которые вам видны.', en: '“I do” — you are the assignee or co-assignee; “All mine” — any role of yours; “All visible” — also tasks of projects you can see.' }, more: 'tasks' },
    reminders: { title: { ru: 'Напоминание', en: 'Reminder' }, text: { ru: 'За сколько минут до начала напомнить. Куда придёт — по вашим настройкам уведомлений.', en: 'How many minutes before the start. Where it arrives follows your notification settings.' }, more: 'reminders' },
  },
  related: ['tasks', 'notifications', 'chat'],
};
