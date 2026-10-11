export default {
  id: 'dashboard',
  icon: 'dashboard',
  title: { ru: 'Дашборд', en: 'Dashboard' },
  tagline: {
    ru: 'Ваш день одним взглядом: задачи, встречи, файлы и цифры на одной странице.',
    en: 'Your day at a glance: tasks, meetings, files and figures on one page.',
  },
  summary: {
    ru: 'Дашборд собирает самое важное из других модулей портала в виде виджетов. Добавляйте нужные из галереи, расставляйте и меняйте размер, настраивайте фильтры — всё сохраняется само.',
    en: 'The dashboard gathers what matters from the portal’s other modules as widgets. Add them from the gallery, arrange and resize them, set their filters — everything saves automatically.',
  },
  highlights: [
    {
      icon: '🧩',
      title: { ru: 'Виджеты на любой вкус', en: 'Widgets for everything' },
      text: { ru: 'Задачи, повестка, файлы, база знаний, компании, часы, заметка и другие.', en: 'Tasks, agenda, files, knowledge base, companies, clock, a note and more.' },
    },
    {
      icon: '📊',
      title: { ru: 'Цифры и графики', en: 'Figures and charts' },
      text: { ru: 'Статистика и динамика задач, активность — наглядно, с выбором периода.', en: 'Task statistics and trends, activity — at a glance, for the period you choose.' },
    },
    {
      icon: '🖱',
      title: { ru: 'Перетаскивание и размер', en: 'Drag and resize' },
      text: { ru: 'Тяните виджет за заголовок, размер меняйте за правый нижний уголок.', en: 'Drag a widget by its header, resize it by the bottom-right corner.' },
    },
    {
      icon: '⚙',
      title: { ru: 'Свои фильтры', en: 'Your own filters' },
      text: { ru: 'У каждого виджета — заголовок и настройки: проект, срок, период, календари.', en: 'Each widget has its own title and settings: project, deadline, period, calendars.' },
    },
    {
      icon: '🔒',
      title: { ru: 'Только то, что вам доступно', en: 'Only what you may see' },
      text: { ru: 'Виджеты показывают данные с вашими правами — не больше, чем в самом модуле.', en: 'Widgets show data with your own rights — never more than the module itself.' },
    },
    {
      icon: '💾',
      title: { ru: 'Сохраняется само', en: 'Saves itself' },
      text: { ru: 'Изменения сохраняются автоматически и видны на всех ваших устройствах.', en: 'Changes save automatically and appear on all your devices.' },
    },
  ],
  tips: [
    { ru: 'Один виджет можно добавить несколько раз — например, «Мои задачи» по двум разным проектам.', en: 'Add the same widget several times — e.g. “My tasks” for two different projects.' },
    { ru: 'Дайте копии виджета свой заголовок, чтобы не путать их: «Задачи · Сайт», «Задачи · CRM».', en: 'Give each copy its own title so you don’t mix them up: “Tasks · Website”, “Tasks · CRM”.' },
    { ru: 'Удалили виджет случайно? Нажмите «Вернуть» во всплывающем сообщении — у вас есть 5 секунд.', en: 'Removed a widget by accident? Click “Undo” in the pop-up — you have 5 seconds.' },
    { ru: 'В меню ⋯ виджета есть готовые размеры: маленький, средний, большой, широкий, во всю ширину.', en: 'The widget’s ⋯ menu has ready sizes: small, medium, large, wide, full width.' },
    { ru: 'В «Повестке» кнопка «Подключиться» появляется за 15 минут до онлайн-встречи.', en: 'In “Agenda” the “Join” button appears 15 minutes before an online meeting.' },
    { ru: 'Запутались в настройках? «Настроить» → «Сбросить» вернёт стартовый набор.', en: 'Got lost? “Customize” → “Reset” brings back the starting set.' },
  ],
  sections: [
    {
      id: 'widgets',
      title: { ru: 'Виджеты и их данные', en: 'Widgets and their data' },
      body: {
        ru: 'Виджет — карточка с данными из одного из модулей портала:\n\n- **Приветствие** — задачи и события на сегодня, просрочка, ближайшая встреча с отсчётом;\n- **Мои задачи** — открытые задачи со сроками; закрыть в один клик и быстро добавить новую;\n- **Статистика задач** и **Динамика задач** — графики по статусам, приоритетам, проектам и по дням;\n- **Повестка** и **Месяц** — встречи и сроки задач;\n- **Недавние файлы**, **Файловый сервер**, **База знаний**, **Онлайн ресурсы**, **Компании**;\n- **Уведомления**, **Быстрый доступ**, **Мировое время**, **Заметка**.\n\nДанные обновляются каждые несколько минут и при возвращении на вкладку. Виджеты показывают только то, что вам доступно в самом модуле.',
        en: 'A widget is a card with data from one of the portal’s modules:\n\n- **Greeting** — today’s tasks and events, overdue items, the next meeting with a countdown;\n- **My tasks** — open tasks with deadlines; complete in one click, add a new one quickly;\n- **Task statistics** and **Task dynamics** — charts by status, priority, project and by day;\n- **Agenda** and **Month** — meetings and task deadlines;\n- **Recent files**, **File server**, **Knowledge base**, **Online resources**, **Companies**;\n- **Notifications**, **Quick access**, **World clock**, **Note**.\n\nData refreshes every few minutes and when you return to the tab. Widgets show only what you can see in the module itself.',
      },
      note: {
        ru: 'Если модуль выключен или недоступен вам, его виджеты не показываются. Когда модуль включат, они вернутся на свои места.',
        en: 'If a module is off or not available to you, its widgets are not shown. When the module is back on, they return to their places.',
      },
    },
    {
      id: 'gallery',
      title: { ru: 'Добавить виджет из галереи', en: 'Adding a widget from the gallery' },
      body: {
        ru: 'Галерея показывает все доступные вам виджеты по категориям: **Обзор**, **Задачи**, **Календарь**, **Файлы и знания**, **Бизнес**, **Инструменты** и другие. У каждого — эскиз и краткое описание, есть поиск.\n\nНовый виджет появляется вверху дашборда и на секунду подсвечивается.',
        en: 'The gallery lists all widgets available to you by category: **Overview**, **Tasks**, **Calendar**, **Files and knowledge**, **Business**, **Tools** and more. Each has a preview and a short description; there is a search.\n\nA new widget appears at the top of the dashboard and is briefly highlighted.',
      },
      steps: [
        { ru: 'Нажмите **«Добавить виджет»** вверху страницы.', en: 'Click **“Add widget”** at the top of the page.' },
        { ru: 'Выберите категорию слева или введите название в поиск.', en: 'Pick a category on the left or type a name in the search.' },
        { ru: 'Нажмите на карточку виджета — он добавится на дашборд.', en: 'Click the widget card — it is added to the dashboard.' },
        { ru: 'Откройте ⚙ на виджете, чтобы настроить его под себя.', en: 'Open ⚙ on the widget to tailor it.' },
      ],
      example: {
        title: { ru: 'Задачи двух проектов рядом', en: 'Tasks of two projects side by side' },
        body: {
          ru: 'Руководитель добавляет «Мои задачи» дважды. В первом в ⚙ выбирает проект «Сайт» и называет виджет «Сайт», во втором — проект «CRM». Теперь оба списка стоят рядом.',
          en: 'A team lead adds “My tasks” twice. In the first one’s ⚙ she picks the “Website” project and titles it “Website”; in the second, the “CRM” project. Now both lists sit side by side.',
        },
      },
    },
    {
      id: 'arrange',
      title: { ru: 'Перетаскивание и размер', en: 'Moving and resizing' },
      body: {
        ru: 'В режиме **«Настроить»**:\n\n- **переместить** — тяните виджет за заголовок;\n- **изменить размер** — тяните правый нижний уголок; размер прилипает к сетке и показывается во время перетаскивания;\n- **готовые размеры** — меню ⋯ → «Размер»: маленький, средний, большой, широкий, во всю ширину.\n\nНа широком экране сетка — 12 колонок, на планшете — 6. Пустые места закрываются сами. Нажмите **«Готово»**, чтобы выйти из режима настройки.',
        en: 'In **“Customize”** mode:\n\n- **move** — drag a widget by its header;\n- **resize** — drag the bottom-right corner; the size snaps to the grid and is shown while dragging;\n- **preset sizes** — ⋯ menu → “Size”: small, medium, large, wide, full width.\n\nWide screens have a 12-column grid, tablets 6. Gaps close by themselves. Click **“Done”** to leave customize mode.',
      },
      note: {
        ru: 'Над дашбордом видно состояние: «Сохраняем…», «Сохранено ✓». Нажимать «Сохранить» не нужно.',
        en: 'The status above the dashboard shows “Saving…”, “Saved ✓”. No need to press Save.',
      },
    },
    {
      id: 'settings',
      title: { ru: 'Настройки и фильтры виджета', en: 'Widget settings and filters' },
      body: {
        ru: 'Кнопка **⚙** открывает настройки виджета. У всех есть **Заголовок** — своё название карточки. Остальное зависит от виджета:\n\n- **Мои задачи** — чьи задачи (мои / без исполнителя / все), проект, срок, порядок, сколько показывать, быстрое добавление;\n- **Статистика** и **Динамика** — период (7, 30, 90 дней), что показывать, тип графика;\n- **Повестка** и **Месяц** — дней вперёд, календари, сроки задач;\n- **Онлайн ресурсы** — категория и вид (плитки или список);\n- **Мировое время** — другие города (до 6), формат 24/12 ч, стрелочные часы;\n- **Заметка** — цвет.\n\nНажмите **«Сохранить»** в окне настроек — виджет сразу обновится.',
        en: 'The **⚙** button opens a widget’s settings. Every widget has a **Title** — your own name for the card. The rest depends on the widget:\n\n- **My tasks** — whose tasks (mine / unassigned / all), project, deadline, order, how many, quick add;\n- **Statistics** and **Dynamics** — period (7, 30, 90 days), what to show, chart type;\n- **Agenda** and **Month** — days ahead, calendars, task deadlines;\n- **Online resources** — category and style (tiles or list);\n- **World clock** — other cities (up to 6), 24/12 h, analog clock;\n- **Note** — colour.\n\nClick **“Save”** in the settings window — the widget updates right away.',
      },
      example: {
        title: { ru: 'Просроченное в отделе', en: 'Overdue in the team' },
        body: {
          ru: 'Чтобы видеть все просроченные задачи проекта «Логистика», в «Мои задачи» выберите **Чьи задачи → Все**, **Проект → Логистика**, **Срок → Просроченные**, **Порядок → По приоритету** и назовите виджет «Горит».',
          en: 'To see all overdue tasks of the “Logistics” project, in “My tasks” choose **Whose tasks → All**, **Project → Logistics**, **Deadline → Overdue**, **Order → By priority** and title the widget “On fire”.',
        },
      },
    },
    {
      id: 'manage',
      title: { ru: 'Дублировать, удалить, отменить', en: 'Duplicate, remove, undo' },
      body: {
        ru: 'Меню **⋯** на виджете в режиме настройки:\n\n- **Дублировать** — копия с теми же настройками появится рядом; удобно, чтобы сделать похожий виджет с другим фильтром;\n- **Открыть модуль** — перейти в модуль, откуда данные;\n- **Убрать** — виджет исчезнет, а внизу на 5 секунд появится кнопка **«Вернуть»**.\n\n**«Сбросить»** заменяет все ваши виджеты, размеры и настройки стартовым набором — перед этим портал переспросит.',
        en: 'The **⋯** menu on a widget in customize mode:\n\n- **Duplicate** — a copy with the same settings appears next to it; handy for a similar widget with another filter;\n- **Open module** — go to the module the data comes from;\n- **Remove** — the widget disappears and an **“Undo”** button shows for 5 seconds.\n\n**“Reset”** replaces all your widgets, sizes and settings with the starting set — the portal asks first.',
      },
      note: {
        ru: 'Сброс отменить нельзя. Если сомневаетесь, лучше убирайте виджеты по одному.',
        en: 'A reset cannot be undone. If unsure, remove widgets one by one instead.',
      },
    },
    {
      id: 'default',
      title: { ru: 'Стартовый набор от администратора', en: 'Starting set from the administrator' },
      body: {
        ru: 'Пока вы ничего не меняли, вы видите **стартовый набор**: приветствие, быстрый доступ, задачи, повестку, статистику, уведомления, месяц, ресурсы, базу знаний, файлы и другое. Виджеты недоступных вам модулей в нём скрываются.\n\nАдминистратор дашборда может сделать свой дашборд стартовым для всех, кто ещё не собрал свой: **«Настроить» → «Администрирование» → «Сделать стартовым набором»**. Пункт **«Вернуть встроенный стартовый набор»** отменяет это.\n\nЕсли в **Настройки → Модули → Дашборд** выключены **«Личные дашборды»**, все видят стартовый набор и не могут его менять.',
        en: 'Until you change anything, you see the **starting set**: greeting, quick access, tasks, agenda, statistics, notifications, month, resources, knowledge base, files and more. Widgets of modules you can’t use are hidden.\n\nA dashboard administrator can make their dashboard the starting one for everyone without their own: **“Customize” → “Administration” → “Make it the starting layout”**. **“Back to the built-in starting layout”** undoes it.\n\nIf **“Personal dashboards”** is off in **Settings → Modules → Dashboard**, everyone sees the starting set and cannot change it.',
      },
      steps: [
        { ru: 'Соберите дашборд так, как он должен выглядеть у всех.', en: 'Arrange the dashboard as everyone should see it.' },
        { ru: 'Нажмите **«Настроить»** → **«Администрирование»**.', en: 'Click **“Customize”** → **“Administration”**.' },
        { ru: 'Выберите **«Сделать стартовым набором»** и подтвердите.', en: 'Choose **“Make it the starting layout”** and confirm.' },
      ],
      example: {
        title: { ru: 'Дашборд для новичков', en: 'A dashboard for newcomers' },
        body: {
          ru: 'Администратор ставит наверх «Приветствие», «Онлайн ресурсы» и «Базу знаний», ниже — «Мои задачи» и «Повестку», и делает это стартовым набором. Все новые сотрудники сразу видят нужные ссылки и инструкции.',
          en: 'The administrator puts “Greeting”, “Online resources” and “Knowledge base” on top, “My tasks” and “Agenda” below, and makes it the starting set. Every new employee sees the right links and guides from day one.',
        },
      },
      note: {
        ru: 'Тех, кто уже собрал свой дашборд, стартовый набор не затронет — пока они не нажмут «Сбросить».',
        en: 'People who already have their own dashboard are not affected — until they click “Reset”.',
      },
    },
    {
      id: 'mobile',
      title: { ru: 'На телефоне', en: 'On a phone' },
      body: {
        ru: 'На узком экране виджеты выстраиваются **в одну колонку** в том же порядке, что на компьютере. Размер по ширине на телефоне не меняется — удобнее настраивать раскладку на большом экране.\n\nДашборд у вас один на все устройства: что поменяли на компьютере, сразу будет и на телефоне.',
        en: 'On a narrow screen widgets line up **in one column**, in the same order as on the computer. Width can’t be changed on a phone — arranging is easier on a large screen.\n\nYou have one dashboard on all devices: what you change on the computer is on your phone too.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Нет кнопки «Настроить».', en: 'There is no “Customize” button.' },
      a: { ru: 'Администратор выключил **личные дашборды** — у всех одинаковый стартовый набор.', en: 'The administrator has turned off **personal dashboards** — everyone has the same starting set.' },
    },
    {
      q: { ru: 'Почему в галерее нет нужного виджета?', en: 'Why is a widget missing from the gallery?' },
      a: { ru: 'Его модуль выключен или у вас нет к нему доступа. Например, «Пользователи и входы» видят только те, кому разрешён просмотр пользователей.', en: 'Its module is off or you have no access to it. For example, “Users and sign-ins” is only for people allowed to view users.' },
    },
    {
      q: { ru: 'Виджет показывает не все задачи.', en: 'The widget doesn’t show all tasks.' },
      a: { ru: 'Проверьте фильтры в ⚙: **Чьи задачи**, **Проект**, **Срок** и **Сколько показывать**. Виджет показывает только задачи, доступные вам в модуле «Задачи».', en: 'Check the filters in ⚙: **Whose tasks**, **Project**, **Deadline** and **How many**. The widget shows only tasks you can see in Tasks.' },
    },
    {
      q: { ru: 'Видят ли коллеги мой дашборд?', en: 'Do colleagues see my dashboard?' },
      a: { ru: 'Нет, дашборд личный. А данные в виджетах у каждого свои — по его правам.', en: 'No, the dashboard is personal. And each person’s widgets show data according to their own rights.' },
    },
    {
      q: { ru: 'Как вернуть всё как было?', en: 'How do I start over?' },
      a: { ru: '**«Настроить» → «Сбросить»** — вернётся стартовый набор. Ваши виджеты и настройки при этом пропадут.', en: '**“Customize” → “Reset”** brings back the starting set. Your widgets and settings will be lost.' },
    },
    {
      q: { ru: 'Сохранится ли текст в «Заметке»?', en: 'Is the text in a “Note” saved?' },
      a: { ru: 'Да, заметка сохраняется по мере ввода. Видите её только вы.', en: 'Yes, the note saves as you type. Only you see it.' },
    },
    {
      q: { ru: 'Можно ли открыть дашборд сразу по адресу портала?', en: 'Can the dashboard open at the portal’s address?' },
      a: { ru: 'Да, если администратор выберет «Дашборд» в **Настройки → Доступ к сайту → Главная страница**.', en: 'Yes, if the administrator picks “Dashboard” in **Settings → Site access → Home page**.' },
    },
  ],
  fields: {
    widgetTitle: {
      title: { ru: 'Заголовок', en: 'Title' },
      text: { ru: 'Своё название карточки. Пусто — стандартное имя виджета. Удобно, если одинаковых виджетов несколько.', en: 'Your own name for the card. Empty — the widget’s standard name. Handy when you have several of the same.' },
      more: 'settings',
    },
    scope: {
      title: { ru: 'Чьи задачи', en: 'Whose tasks' },
      text: { ru: '**Мои** — где вы исполнитель; **Без исполнителя** — ещё ничьи; **Все** — все задачи, доступные вам.', en: '**Mine** — assigned to you; **Unassigned** — nobody’s yet; **All** — every task you can see.' },
      more: 'settings',
    },
    period: {
      title: { ru: 'Период', en: 'Period' },
      text: { ru: 'За сколько последних дней считать цифры и строить график.', en: 'How many recent days the figures and chart cover.' },
      more: 'settings',
    },
    gallery: {
      title: { ru: 'Галерея виджетов', en: 'Widget gallery' },
      text: { ru: 'Здесь только виджеты, доступные вам. Один и тот же можно добавить несколько раз с разными настройками.', en: 'Only widgets available to you are listed. The same one can be added several times with different settings.' },
      more: 'gallery',
    },
    personalize: {
      title: { ru: 'Личные дашборды', en: 'Personal dashboards' },
      text: { ru: 'Включено — каждый собирает дашборд под себя. Выключено — у всех стартовый набор без возможности изменить.', en: 'On — everyone builds their own dashboard. Off — everyone sees the starting set and cannot change it.' },
      more: 'default',
    },
  },
  related: ['tasks', 'calendar', 'start'],
};
