export default {
  id: 'tasks',
  icon: 'tasks',
  title: { ru: 'Задачи', en: 'Tasks' },
  tagline: {
    ru: 'Поручения, сроки и результат — в одном месте, с чатом у каждой задачи.',
    en: 'Assignments, deadlines and results in one place, with a chat for every task.',
  },
  summary: {
    ru: 'Ставьте задачи себе и коллегам, следите за сроками и получайте напоминания. У каждой задачи есть чек-листы, файлы, результат и свой чат, где видна вся история. Задачи можно собирать в проекты с доской, повторять по расписанию и раздавать команде через потоки.',
    en: 'Assign tasks to yourself and your colleagues, keep track of deadlines and get reminders. Every task has checklists, files, a result and its own chat with the full history. Tasks can be grouped into projects with a board, repeated on a schedule and shared out to a team through flows.',
  },

  highlights: [
    {
      icon: '⚡',
      title: { ru: 'Быстро или подробно', en: 'Quick or detailed' },
      text: {
        ru: 'Короткая форма за пять секунд, а «Полная форма» — для чек-листов, наблюдателей, напоминаний и всего остального.',
        en: 'A quick form takes five seconds; the «Full form» adds checklists, auditors, reminders and everything else.',
      },
    },
    {
      icon: '👥',
      title: { ru: 'Понятные роли', en: 'Clear roles' },
      text: {
        ru: 'Постановщик, исполнитель, соисполнители и наблюдатели — каждый видит свою часть работы во вкладках «Мои задачи».',
        en: 'Originator, assignee, co-assignees and auditors: each person sees their share of the work in the My tasks tabs.',
      },
    },
    {
      icon: '⏰',
      title: { ru: 'Сроки и напоминания', en: 'Deadlines and reminders' },
      text: {
        ru: 'Портал сам напомнит о сроке, а свои напоминания можно отправить в приложение, на почту, в Telegram, WhatsApp или Mattermost.',
        en: 'The portal reminds you of deadlines itself, and your own reminders can go to the app, e-mail, Telegram, WhatsApp or Mattermost.',
      },
    },
    {
      icon: '🏁',
      title: { ru: 'Результат, а не галочка', en: 'A result, not just a tick' },
      text: {
        ru: 'Включите «Требуется результат» — и задачу нельзя будет закрыть, пока исполнитель не покажет, что сделано.',
        en: 'Turn on «A result is required» and the task cannot be closed until the assignee shows what was done.',
      },
    },
    {
      icon: '💬',
      title: { ru: 'Чат у каждой задачи', en: 'A chat in every task' },
      text: {
        ru: 'Обсуждение, файлы и все изменения задачи — в одной ленте, без переписки в почте.',
        en: 'Discussion, files and every change to the task in one feed, with no e-mail threads.',
      },
    },
    {
      icon: '🤝',
      title: { ru: 'Принять в работу', en: 'Accept the task' },
      text: {
        ru: 'Исполнитель подтверждает, что взял задачу; не принятая в срок горит красным, а постановщик узнаёт об этом сам.',
        en: 'The assignee confirms they have taken the task; one not accepted in time turns red, and the originator hears about it.',
      },
    },
    {
      icon: '🔁',
      title: { ru: 'Шаблоны и повторы', en: 'Templates and repeats' },
      text: {
        ru: 'Типовые задачи создаются из шаблона в один клик, а регулярные появляются сами по расписанию.',
        en: 'Routine tasks are created from a template in one click, and recurring ones appear by themselves on schedule.',
      },
    },
  ],

  tips: [
    {
      ru: 'Нажмите стрелку рядом с «＋ Создать», чтобы сразу открыть полную форму или создать задачу по шаблону.',
      en: 'Click the arrow next to «＋ Create» to open the full form straight away or create a task from a template.',
    },
    {
      ru: 'Выделите строки в описании и нажмите «Чек-лист» — они превратятся в пункты чек-листа.',
      en: 'Select lines in the description and click «Checklist» to turn them into checklist items.',
    },
    {
      ru: 'Любое сообщение чата задачи можно сделать результатом: «⋯ → Добавить в результат».',
      en: 'Any message in the task chat can become the result: «⋯ → Add to result».',
    },
    {
      ru: 'Задача со сроком появляется в Календаре в день срока; её можно перетащить на другой день, чтобы перенести срок.',
      en: 'A task with a deadline shows up in the Calendar on its date; drag it to another day to move the deadline.',
    },
    {
      ru: 'Не успеваете — не просрочивайте молча: перенесите срок или напишите постановщику в чате задачи.',
      en: 'Running late? Do not let it go overdue silently: move the deadline or write to the originator in the task chat.',
    },
    {
      ru: 'Ссылку на задачу вида HR-12 можно вставить в любой чат — коллега откроет её в один клик.',
      en: 'A task link such as HR-12 can be pasted into any chat, and a colleague opens it in one click.',
    },
  ],

  sections: [
    {
      id: 'create',
      title: { ru: 'Создание задачи: быстрая и полная форма', en: 'Creating a task: quick and full form' },
      body: {
        ru: `Кнопка **«＋ Создать»** открывает быструю форму: название, короткое описание, исполнитель и срок. По умолчанию исполнитель — вы, а срок — через неделю в 19:00. Внизу есть кнопки **Файлы**, **Чек-лист** и **Проект**.

Если задаче нужны соисполнители, наблюдатели, напоминания или результат, нажмите **«Полная форма →»** — всё, что вы уже ввели, перенесётся. Стрелка рядом с «Создать» открывает полную форму сразу или создаёт задачу **по шаблону**.

В полной форме дополнительные блоки включаются кнопками под основными полями: «Результаты», «Чек-листы», «Соисполнители», «Напоминания» и другие. Форма запоминает, какие блоки вы открывали, и покажет их в следующий раз.

Значок **огонька** рядом с названием отмечает задачу как **важную**: она выделяется в списках, и её легче заметить среди остальных.`,
        en: `The **«＋ Create»** button opens the quick form: title, a short description, assignee and deadline. By default you are the assignee and the deadline is a week ahead at 19:00. Below are the **Files**, **Checklist** and **Project** buttons.

If the task needs co-assignees, auditors, reminders or a result, click **«Full form →»**: everything you typed is carried over. The arrow next to «Create» opens the full form directly or creates a task **from a template**.

In the full form, extra blocks are switched on with the buttons under the main fields: «Results», «Checklists», «Co-assignees», «Reminders» and others. The form remembers which blocks you opened and shows them next time.

The **flame** next to the title marks the task as **important**: it stands out in lists and is easier to spot among the others.`,
      },
      steps: [
        { ru: 'Нажмите «＋ Создать» и напишите, что нужно сделать.', en: 'Click «＋ Create» and write what needs to be done.' },
        { ru: 'Выберите исполнителя и срок — или оставьте как есть.', en: 'Choose the assignee and the deadline, or leave them as they are.' },
        { ru: 'При необходимости откройте «Полная форма →» и включите нужные блоки.', en: 'If needed, open «Full form →» and switch on the blocks you need.' },
        { ru: 'Нажмите «Создать» или Enter. Задача получит номер, например HR-12.', en: 'Click «Create» or press Enter. The task gets a number such as HR-12.' },
      ],
      example: {
        title: { ru: 'Пример: «Согласовать договор с юристами»', en: 'Example: «Agree the contract with the legal team»' },
        body: {
          ru: 'Менеджер создаёт задачу в быстрой форме, выбирает исполнителем юриста и срок «В конце недели». Затем открывает полную форму, прикрепляет проект договора и добавляет руководителя отдела наблюдателем.',
          en: 'A manager creates the task in the quick form, picks a lawyer as the assignee and the deadline «End of the week». Then they open the full form, attach the draft contract and add the head of department as an auditor.',
        },
      },
      note: {
        ru: 'Если выбрать несколько исполнителей (кнопка «＋» рядом с исполнителем), каждый получит **свою копию** задачи — так удобно раздать одинаковое поручение нескольким людям.',
        en: 'If you choose several assignees (the «＋» next to the assignee), each of them gets **their own copy** of the task, which is handy for giving the same assignment to several people.',
      },
    },
    {
      id: 'roles',
      title: { ru: 'Роли: кто за что отвечает', en: 'Roles: who is responsible for what' },
      body: {
        ru: `- **Постановщик** — тот, кто поручает. Меняет всё в задаче, включая срок, принимает и оценивает результат, может удалить задачу.
- **Исполнитель** — тот, кто отвечает за выполнение. Начинает и завершает задачу, может делегировать её. Срок меняет, только если постановщик это разрешил.
- **Соисполнители** — помогают исполнителю и могут так же редактировать и завершать задачу.
- **Наблюдатели** — следят за ходом работы: видят задачу, пишут в её чат и получают уведомления, но ничего не меняют.

Участники задачи видят её, даже если у них нет доступа к самому проекту.

**Делегировать** (меню «⋯» внизу задачи) — передать задачу другому сотруднику. Прежний исполнитель становится наблюдателем и продолжает видеть, что происходит.`,
        en: `- **Originator**: the person who assigns. Can change anything in the task, including the deadline, accepts and rates the result, and can delete the task.
- **Assignee**: the person responsible for doing it. Starts and completes the task and can delegate it. Can change the deadline only if the originator allows it.
- **Co-assignees**: help the assignee and can edit and complete the task in the same way.
- **Auditors**: follow the progress. They see the task, write in its chat and get notifications, but change nothing.

Task participants see the task even without access to its project.

**Delegate** (the «⋯» menu at the bottom of the task) hands the task to another person. The previous assignee becomes an auditor and keeps seeing what happens.`,
      },
      example: {
        title: { ru: 'Пример: отчёт для руководства', en: 'Example: a report for management' },
        body: {
          ru: 'Финансовый директор — постановщик задачи «Квартальный отчёт». Исполнитель — главный бухгалтер, соисполнитель — экономист, который собирает данные, а генеральный директор добавлен наблюдателем, чтобы видеть готовность без лишних вопросов.',
          en: 'The CFO is the originator of «Quarterly report». The chief accountant is the assignee, an economist who gathers the figures is a co-assignee, and the CEO is added as an auditor to see the progress without asking.',
        },
      },
    },
    {
      id: 'acceptance',
      title: { ru: 'Принять в работу', en: 'Accepting a task' },
      body: {
        ru: `Задача, которую поставили **другому человеку**, сначала **ждёт принятия**. Исполнитель видит сверху карточки плашку и две кнопки:
- **«Принять»** — подтвердить, что задача понятна и взята в работу. Можно добавить короткий комментарий для постановщика;
- **«Обсудить»** — открыть чат задачи и уточнить детали до того, как браться за неё.

**Начать** задачу, перевести её в статус «В работе» или сразу **завершить** — тоже значит принять. В ленте чата остаётся отметка «Принято в работу: имя · время», а постановщику приходит уведомление.

Задачи, которые вы ставите **себе**, принимаются сами. Если задачу **делегировали** или сменили исполнителя, новый исполнитель снова должен её принять. Соисполнители помогают исполнителю и отдельно задачу не принимают.

**Срок принятия** — 24 часа, для важных задач (с огоньком) — 4 часа. Администратор меняет их в настройках модуля, руководитель проекта — для своего проекта (меню проекта → «Изменить»). Не принятая вовремя задача **горит красным** с меткой «Не принята N ч» в списках, на доске, в карточке и в «Моих задачах»; исполнителю приходит напоминание, постановщику — уведомление (по одному разу). Просрочка исполнения — отдельная красная метка у срока.`,
        en: `A task given to **someone else** first **waits for acceptance**. The assignee sees a banner on top of the task with two buttons:
- **«Accept»** confirms the task is clear and taken on. You can add a short comment for the originator;
- **«Discuss»** opens the task chat to clear things up before taking it on.

**Starting** the task, moving it to an «In progress» status or **completing** it straight away also accepts it. The chat keeps an «Accepted by name · time» mark, and the originator gets a notification.

Tasks you give **yourself** are accepted automatically. When a task is **delegated** or gets another assignee, the new assignee accepts it again. Co-assignees help the assignee and do not accept it separately.

**Time to accept** is 24 hours, 4 hours for important tasks (with the flame). An administrator changes it in the module settings, a project manager for their project (project menu → «Edit»). A task not accepted in time **turns red** with a «Not accepted N h» label in lists, on the board, in the task and in My tasks; the assignee gets a reminder and the originator a notification (once each). A missed deadline is a separate red label at the deadline.`,
      },
      steps: [
        { ru: 'Откройте задачу из уведомления, из «Моих задач» (группа «Ждут принятия») или со страницы «Ждёт меня».', en: 'Open the task from the notification, from My tasks (the «Awaiting my acceptance» group) or from the «Waiting for me» page.' },
        { ru: 'Прочитайте описание. Если что-то непонятно — нажмите «Обсудить» и спросите в чате.', en: 'Read the description. If something is unclear, click «Discuss» and ask in the chat.' },
        { ru: 'Нажмите «Принять» (при желании — «С комментарием»).', en: 'Click «Accept» (or «Add a comment» first).' },
      ],
      example: {
        title: { ru: 'Пример: «Найти администратора, срок 5 дней»', en: 'Example: «Find an administrator, 5 days»' },
        body: {
          ru: 'Директор ставит поручение кадровику. Через 24 часа задача всё ещё не принята — она горит красным «Не принята 24 ч», кадровику приходит напоминание, а директору — уведомление. Кадровик нажимает «Обсудить», уточняет требования к кандидату и принимает задачу.',
          en: 'The director gives an order to the HR officer. 24 hours later it is still not accepted: it turns red with «Not accepted 24 h», the HR officer gets a reminder and the director a notification. The HR officer clicks «Discuss», clarifies the requirements and accepts the task.',
        },
      },
    },
    {
      id: 'orders',
      title: { ru: 'Поручения', en: 'Orders' },
      body: {
        ru: `**Поручение** — задача, которую дало руководство. Задача считается поручением, если:
- её постановщик состоит в одной из групп «Руководство» (администратор выбирает их в настройках модуля), а исполнитель — другой человек;
- или на задаче включён флажок **«Поручение»** (значок закладки рядом с огоньком; ставит постановщик или руководитель проекта).

Поручения отмечены значком на карточках и в списках. Чип **«Поручения»** над списком в «Моих задачах» и в проекте показывает только их.

Над списками есть **быстрые фильтры со счётчиками**: «Срочные», «Просрочено», «Не приняты», «В работе», «Отработано» и «Поручения». Повторное нажатие на чип снимает фильтр.`,
        en: `An **order** («поручение») is a task given by the management. A task is an order when:
- its originator belongs to one of the «Leadership» groups (an administrator chooses them in the module settings) and someone else is the assignee;
- or the **«Order»** flag is on (the bookmark icon next to the flame; set by the originator or a project manager).

Orders carry a badge on cards and in lists. The **«Orders»** chip above the list in My tasks and in a project shows only them.

Above the lists there are **quick filters with counters**: «Urgent», «Overdue», «Not accepted», «In progress», «Done» and «Orders». Click a chip again to clear it.`,
      },
    },
    {
      id: 'deadlines',
      title: { ru: 'Сроки и планирование', en: 'Deadlines and planning' },
      body: {
        ru: `Срок выбирается в один клик: **Сегодня**, **Завтра**, **В конце недели**, **Через неделю**, **В конце месяца** — или любая дата в календаре и точное время. «Без срока» убирает срок совсем.

Просроченная задача подсвечивается, а рядом видно, на сколько она опоздала. В «Моих задачах» задачи сгруппированы по срокам: просроченные, сегодня, завтра, ближайшие 7 дней и позже.

Блок **«Планирование сроков»** (кнопка 🗓 рядом со сроком) нужен для задач подлиннее:
- плановые даты **Начать** и **Завершить** и их длительность;
- **Разрешить исполнителю изменять запланированные сроки** — если выключить, переносить срок сможет только постановщик;
- **Пропускать выходные дни**;
- **Сроки задачи зависят от подзадач** — срок задачи сам станет равен самому позднему сроку её подзадач.

Если задача временно неактуальна, её можно **отложить** (меню «⋯» внизу задачи): отложенные задачи не присылают напоминаний и показываются отдельной группой.`,
        en: `The deadline takes one click: **Today**, **Tomorrow**, **End of the week**, **In a week**, **End of the month**, or any date in the calendar and an exact time. «No deadline» removes it.

An overdue task is highlighted, with how late it is next to it. In My tasks, tasks are grouped by deadline: overdue, today, tomorrow, next 7 days and later.

The **«Planning»** block (the 🗓 button next to the deadline) is for longer tasks:
- planned **Start** and **Finish** dates and their duration;
- **Allow the assignee to change the planned dates**: when off, only the originator can move the deadline;
- **Skip weekends**;
- **The deadline depends on subtasks**: the task's deadline becomes the latest deadline of its subtasks.

If a task is not relevant for now, you can **defer** it (the «⋯» menu at the bottom of the task): deferred tasks send no reminders and are shown in a separate group.`,
      },
      note: {
        ru: 'Когда срок переносят, напоминания о нём срабатывают заново — уже для новой даты.',
        en: 'When the deadline moves, its reminders are armed again for the new date.',
      },
    },
    {
      id: 'reminders',
      title: { ru: 'Напоминания', en: 'Reminders' },
      body: {
        ru: `Портал напоминает о сроках сам: исполнитель получает уведомление, когда до срока остаются сутки, а исполнитель и постановщик — когда задача просрочена. Такие напоминания появляются и в чате задачи с кнопками **«Завершите её»** и **«Измените крайний срок»**.

Свои напоминания добавляются в блоке **«Напоминания»** полной формы. Вы выбираете:
- **Кому напомнить** — себе, исполнителю, постановщику или соисполнителям;
- **Когда** — в конкретную дату и время или за какое-то время **до крайнего срока**;
- **Как** — **В приложении** (колокольчик и push), **На e-mail**, **В мессенджеры** (Telegram, WhatsApp и Mattermost).

**Чтобы напоминание дошло, канал должен быть подключён:**
- для мессенджеров привяжите Telegram в [Профиль → Безопасность](/account/security) или укажите Mattermost в [Профиле](/account);
- для push разрешите уведомления в браузере или приложении на нужном устройстве ([настройки уведомлений](/account/notifications));
- для почты в профиле должен быть указан e-mail.

Если канал не подключён, форма напоминания покажет предупреждение со ссылкой «Исправить».`,
        en: `The portal reminds you of deadlines itself: the assignee is notified a day before the deadline, and the assignee and the originator when the task is overdue. These reminders also appear in the task chat with the buttons **«Complete it»** and **«Change the deadline»**.

Your own reminders are added in the **«Reminders»** block of the full form. You choose:
- **Whom to remind**: yourself, the assignee, the originator or the co-assignees;
- **When**: at a specific date and time, or some time **before the deadline**;
- **How**: **In the app** (the bell and push), **E-mail**, **Messengers** (Telegram, WhatsApp and Mattermost).

**For a reminder to arrive, the channel must be connected:**
- for messengers, link Telegram in [Profile → Security](/account/security) or enter your Mattermost name in the [Profile](/account);
- for push, allow notifications in the browser or app on the device you use ([notification settings](/account/notifications));
- for e-mail, your profile must have an address.

If a channel is not connected, the reminder form shows a warning with a «Fix» link.`,
      },
      steps: [
        { ru: 'Откройте задачу и включите блок «Напоминания».', en: 'Open the task and switch on the «Reminders» block.' },
        { ru: 'Нажмите «＋ Добавить напоминание».', en: 'Click «＋ Add a reminder».' },
        { ru: 'Отметьте, кому напомнить, выберите время и каналы.', en: 'Tick whom to remind, choose the time and the channels.' },
        { ru: 'Нажмите «Напомнить». Отправленное напоминание помечается словом «отправлено».', en: 'Click «Remind». A sent reminder is marked «sent».' },
      ],
      example: {
        title: { ru: 'Пример: не забыть про подписание', en: 'Example: do not forget the signing' },
        body: {
          ru: 'Для задачи «Согласовать договор с юристами» постановщик ставит напоминание исполнителю «за 1 день до крайнего срока» в приложение и в Telegram, а себе — в дату встречи в 10:00.',
          en: 'For «Agree the contract with the legal team», the originator sets a reminder for the assignee «1 day before the deadline» in the app and Telegram, and one for themselves on the meeting day at 10:00.',
        },
      },
      note: {
        ru: 'Напоминания по завершённым задачам не отправляются. Напоминание «до крайнего срока» доступно, только если у задачи есть срок.',
        en: 'Reminders are not sent for completed tasks. A «before the deadline» reminder is available only when the task has a deadline.',
      },
    },
    {
      id: 'checklists',
      title: { ru: 'Чек-листы', en: 'Checklists' },
      body: {
        ru: `Чек-лист разбивает задачу на шаги и показывает прогресс: «3/5 выполнено». В задаче может быть несколько чек-листов, например «Подготовка» и «Проверка».

- **Enter** добавляет пункт; можно вставить сразу несколько строк.
- Пункты перетаскиваются мышью, сдвигаются вправо для вложенности и переносятся в другой чек-лист.
- У пункта есть меню «⋯»: отметить важным, прикрепить файл, назначить соисполнителя или наблюдателя пункта.
- **Групповые действия** отмечают или переносят сразу несколько пунктов, а **Скрыть выполненные** убирает лишнее.

Когда все пункты чек-листа отмечены, в чате задачи появится запись «Чек-лист выполнен».`,
        en: `A checklist breaks the task into steps and shows progress: «3/5 done». A task can have several checklists, for example «Preparation» and «Review».

- **Enter** adds an item; you can paste several lines at once.
- Items can be dragged, moved right to nest them, and moved to another checklist.
- Each item has a «⋯» menu: mark it important, attach a file, give it a co-assignee or an auditor.
- **Group actions** tick or move several items at once, and **Hide completed** removes the clutter.

When every item of a checklist is ticked, the task chat shows «Checklist is complete».`,
      },
      example: {
        title: { ru: 'Пример: выход нового сотрудника', en: 'Example: a new employee starts' },
        body: {
          ru: 'В задаче «Выход нового менеджера 1 марта» HR ведёт чек-лист: подготовить договор, заказать пропуск, выдать ноутбук, создать учётную запись. Пункт «выдать ноутбук» назначен сотруднику IT.',
          en: 'In «New manager starts on 1 March», HR keeps a checklist: prepare the contract, order a pass, hand out a laptop, create an account. The «hand out a laptop» item is assigned to someone from IT.',
        },
      },
    },
    {
      id: 'results',
      title: { ru: 'Выполнение и результат', en: 'Completing a task and its result' },
      body: {
        ru: `Исполнитель нажимает **«Начать»**, когда берётся за работу, и **«Завершить»**, когда закончил. Завершённую задачу можно **«Вернуть в работу»**.

**Требуется результат** — постановщик включает это в блоке «Результаты» (меню «⋯ → Требовать результат»). Тогда задачу нельзя завершить, пока исполнитель не опишет, что сделано: выводы, ссылки, итоговый документ.

Результат добавляется кнопкой «Добавить результат» или прямо из чата: у любого сообщения выберите **«⋯ → Добавить в результат»**. Постановщик получает уведомление о новом результате.

После завершения постановщик может **оценить задачу** — «Хорошо» или «Плохо».`,
        en: `The assignee clicks **«Start»** when they take the task up and **«Complete»** when it is done. A completed task can be sent **«Back to work»**.

**A result is required**: the originator turns this on in the «Results» block (the «⋯ → Require a result» menu). The task then cannot be completed until the assignee describes what was done: conclusions, links, the final document.

A result is added with «Add a result» or straight from the chat: on any message choose **«⋯ → Add to result»**. The originator is notified about a new result.

Once the task is complete, the originator can **rate it** «Good» or «Poor».`,
      },
      example: {
        title: { ru: 'Пример: анализ цен конкурентов', en: 'Example: a competitor price review' },
        body: {
          ru: 'Руководитель отдела продаж ставит задачу с «Требуется результат». Аналитик не сможет её закрыть, пока не приложит таблицу и короткий вывод — и руководитель увидит итог сразу в карточке задачи.',
          en: 'The head of sales sets the task with «A result is required». The analyst cannot close it until they attach the spreadsheet and a short conclusion, and the manager sees the outcome right in the task card.',
        },
      },
    },
    {
      id: 'chat',
      title: { ru: 'Файлы и чат задачи', en: 'Files and the task chat' },
      body: {
        ru: `Справа от задачи — её **чат**. В нём обсуждают работу, созваниваются, делятся файлами и упоминают коллег через **@**. Туда же автоматически пишутся все изменения: смена срока, исполнителя, статуса, добавленные файлы, результат и напоминания. Отдельные комментарии и история не нужны — всё в одной ленте.

Чат видят только участники задачи. Звук чата можно выключить в меню задачи ≡ → «Выключить звук чата задачи».

**Файлы** прикрепляются в блоке «Файлы»: **с компьютера**, **с Диска («Файлы»)** или **с файлового сервера**. Можно просто перетащить файлы в блок. На телефоне задача и чат открываются двумя вкладками.`,
        en: `To the right of the task is its **chat**. People discuss the work there, call each other, share files and mention colleagues with **@**. Every change is logged there automatically: deadline, assignee and status changes, added files, the result and reminders. No separate comments or history: everything is in one feed.

Only task participants see the chat. You can mute it from the task's ≡ menu → «Mute the task chat».

**Files** are attached in the «Files» block: **from the computer**, **from Files** or **from the file server**. You can also drop files onto the block. On a phone, the task and its chat are two tabs.`,
      },
    },
    {
      id: 'subtasks',
      title: { ru: 'Подзадачи, связи и Гант', en: 'Subtasks, links and Gantt' },
      body: {
        ru: `Большую задачу удобно разбить на **подзадачи**: в меню задачи ≡ выберите «Создать подзадачу» или нажмите «＋ Подзадача» в блоке «Подзадачи». У подзадачи свой исполнитель и срок, а в карточке видна ссылка на родительскую задачу.

Блок **«Родительская задача»** делает текущую задачу подзадачей другой. **«Связанные задачи»** просто связывают задачи друг с другом в обе стороны — например, заявку и счёт по ней.

Блок **«Гант»** задаёт порядок работ между задачами:
- **Завершение → Начало** — эту задачу начинают, когда закончена связанная (самый частый случай);
- **Начало → Начало** — начинают одновременно;
- **Завершение → Завершение** — заканчивают одновременно;
- **Начало → Завершение** — эта задача заканчивается, когда началась связанная.`,
        en: `A big task is easier to handle as **subtasks**: choose «Create a subtask» in the task's ≡ menu or click «＋ Subtask» in the «Subtasks» block. A subtask has its own assignee and deadline, and its card links back to the parent task.

The **«Parent task»** block makes the current task a subtask of another one. **«Related tasks»** simply link tasks to each other both ways, for example a request and its invoice.

The **«Gantt»** block sets the order of work between tasks:
- **Finish → Start**: this task starts when the linked one is finished (the most common case);
- **Start → Start**: they start together;
- **Finish → Finish**: they finish together;
- **Start → Finish**: this task finishes when the linked one starts.`,
      },
      example: {
        title: { ru: 'Пример: переезд офиса', en: 'Example: an office move' },
        body: {
          ru: 'Задача «Переезд офиса» содержит подзадачи «Договор аренды», «Мебель» и «Сеть и телефония». У «Мебели» связь Ганта «Завершение → Начало» с «Договором аренды»: заказывать мебель начинают только после подписания договора.',
          en: '«Office move» has the subtasks «Lease agreement», «Furniture» and «Network and phones». «Furniture» has a Gantt link «Finish → Start» to «Lease agreement»: furniture is ordered only after the lease is signed.',
        },
      },
      note: {
        ru: 'Подзадачи можно добавлять после того, как задача создана.',
        en: 'Subtasks can be added once the task has been created.',
      },
    },
    {
      id: 'recurring',
      title: { ru: 'Шаблоны и регулярные задачи', en: 'Templates and recurring tasks' },
      body: {
        ru: `**Шаблон** — сохранённая форма задачи: название, описание, люди, чек-листы. В полной форме нажмите **«📄 Шаблоны» → «Сохранить как шаблон»**, а потом создавайте такие задачи через стрелку рядом с «＋ Создать» → «Задачу по шаблону».

**Регулярная задача** создаётся сама по расписанию. Включите блок «Регулярная задача» и задайте:
- **Повторять каждые** N дней, недель, месяцев или лет, для недель — дни недели;
- **Начать с** даты и время, когда **создавать** копию;
- **Завершить** — вручную, после N раз или в дату;
- **Крайний срок копий** — через сколько после создания наступает срок;
- что делать, если день выпал на **выходные и праздники**.

У существующей задачи то же самое делается через меню ≡ → «Автоматизировать задачи» → «Сделать регулярной». Изменения расписания применяются ко всем будущим копиям.`,
        en: `A **template** is a saved task form: title, description, people, checklists. In the full form click **«📄 Templates» → «Save as template»**, then create such tasks with the arrow next to «＋ Create» → «Task from a template».

A **recurring task** is created by itself on a schedule. Switch on the «Recurring» block and set:
- **Repeat every** N days, weeks, months or years, and the weekdays for weeks;
- **Start on** a date and the time to **create** each copy;
- **End**: manually, after N times or on a date;
- **Deadline of each copy**: how long after creation it is due;
- what to do when the day falls on **weekends and holidays**.

For an existing task, use the ≡ menu → «Automate tasks» → «Make it recurring». Schedule changes apply to every future copy.`,
      },
      example: {
        title: { ru: 'Пример: ежемесячная сверка', en: 'Example: a monthly reconciliation' },
        body: {
          ru: 'Бухгалтерия создаёт регулярную задачу «Сверка с поставщиками»: каждый месяц 1-го числа в 9:00, крайний срок — через 3 дня, если выпадает на выходные — переносить на понедельник.',
          en: 'Accounting sets up the recurring task «Supplier reconciliation»: every month on the 1st at 9:00, due 3 days later, moved to Monday when it falls on a weekend.',
        },
      },
    },
    {
      id: 'flows',
      title: { ru: 'Потоки: задачи для команды', en: 'Flows: tasks for a team' },
      body: {
        ru: `**Поток** — общая очередь задач команды, например «Заявки в IT» или «Договоры на проверку». Вы ставите задачу в поток, а не конкретному человеку, и она достаётся кому-то из участников:
- **По очереди** — участникам по кругу;
- **Наименее загруженному** — тому, у кого меньше открытых задач;
- **Вручную** — ответственный распределяет сам.

Поток создаётся прямо в блоке «Поток» → «Создать поток». Под выбранным потоком видно, сколько в нём открытых и просроченных задач и какая доля сделана в срок.`,
        en: `A **flow** is a team's shared task queue, such as «IT requests» or «Contracts to review». You put a task into the flow instead of assigning a specific person, and it goes to one of the members:
- **In turn**: members one after another;
- **Least loaded**: whoever has fewer open tasks;
- **Manually**: someone assigns tasks by hand.

A flow is created right in the «Flow» block → «Create a flow». Below the chosen flow you see how many tasks are open and overdue, and the share done on time.`,
      },
      example: {
        title: { ru: 'Пример: заявки в IT', en: 'Example: IT requests' },
        body: {
          ru: 'Офис-менеджер ставит задачу «Не работает принтер на 3 этаже» в поток «Заявки в IT» с распределением «Наименее загруженному» — заявку получает свободный специалист, и никто не выбирает исполнителя вручную.',
          en: 'The office manager puts «The 3rd-floor printer is broken» into the «IT requests» flow set to «Least loaded»: the request goes to whoever is free, and nobody has to pick an assignee.',
        },
      },
    },
    {
      id: 'time',
      title: { ru: 'Учёт времени', en: 'Time tracking' },
      body: {
        ru: `Включите блок **«Учёт времени»** и переключатель **«Учитывать время»**, чтобы видеть, сколько реально ушло на задачу.

- **Плановое время** — сколько часов и минут вы закладываете.
- **Таймер** — кнопка ▶ запускает отсчёт, ⏸ ставит на паузу. Таймер виден прямо в шапке задачи.
- Время копится по каждому участнику, а рядом с ним видна плановая оценка.`,
        en: `Switch on the **«Time tracking»** block and the **«Track time»** toggle to see how long the task really took.

- **Planned time**: how many hours and minutes you allow.
- **Timer**: ▶ starts counting, ⏸ pauses it. The timer is shown right in the task header.
- Time is counted per participant and shown next to the estimate.`,
      },
    },
    {
      id: 'my-tasks',
      title: { ru: 'Мои задачи', en: 'My tasks' },
      body: {
        ru: `Страница **«Мои задачи»** — ваш личный список дел. Вкладки по ролям:
- **Делаю** — вы исполнитель или соисполнитель;
- **Помогаю** — вы соисполнитель;
- **Поручил** — вы постановщик, задачи поручены другим;
- **Наблюдаю** — вы наблюдатель;
- **Все** — всё сразу.

Задачи сгруппированы по срокам: **Просрочено**, **Сегодня**, **Завтра**, **Ближайшие 7 дней**, **Позже**, **Без срока**, затем **Отложенные** и **Недавно выполненные**. Огонёк отмечает важные задачи, счётчик — подзадачи. Выбранная вкладка запоминается.`,
        en: `**My tasks** is your personal to-do list. The tabs follow your role:
- **Doing**: you are the assignee or a co-assignee;
- **Helping**: you are a co-assignee;
- **Assigned**: you are the originator and others do the work;
- **Following**: you are an auditor;
- **All**: everything together.

Tasks are grouped by deadline: **Overdue**, **Today**, **Tomorrow**, **Next 7 days**, **Later**, **No due date**, then **Deferred** and **Done recently**. A flame marks important tasks, a counter shows subtasks. The chosen tab is remembered.`,
      },
      note: {
        ru: 'Начинайте день со вкладки «Делаю» и группы «Сегодня», а раз в неделю заглядывайте в «Поручил» — так ничего не потеряется.',
        en: 'Start your day with «Doing» and the «Today» group, and check «Assigned» once a week so nothing slips.',
      },
    },
    {
      id: 'projects',
      title: { ru: 'Проекты, доска и доступ', en: 'Projects, board and access' },
      body: {
        ru: `**Проект** собирает задачи отдела или направления. У каждого проекта есть **ключ** — короткий код из 2–10 латинских букв или цифр: он стоит в номерах задач и ссылках, например HR-12. Ключ предлагается из названия («Отдел продаж» → OP) и **не меняется** после создания, поэтому ссылки не ломаются.

Задачи проекта видны на **доске** (колонки по этапам, карточки перетаскиваются) или **списком**. Этапы настраиваются в меню проекта → «Этапы работы»: каждый относится к виду «Не начато», «В работе» или «Готово». Задача считается выполненной, когда попадает в этап вида «Готово».

**Кому доступно** выбирается при создании: «Всем, с редактированием», «Всем, только просмотр» или «Только мне». Позже доступ уточняется в меню проекта → «Доступ» для людей, групп или ролей:
- **Просмотр** — видеть задачи и писать в их чаты;
- **Редактирование** — создавать, менять и перемещать задачи;
- **Управление** — ещё этапы, доступ, архив и удаление проекта.

Задача может быть и **без проекта** — тогда её видят только участники.`,
        en: `A **project** gathers the tasks of a department or a line of work. Every project has a **key**: a short code of 2–10 Latin letters or digits used in task numbers and links, such as HR-12. It is suggested from the name («Sales department» → SD) and **cannot change** after creation, so links never break.

A project's tasks are shown on a **board** (columns by stage, cards are dragged) or as a **list**. Stages are set in the project menu → «Workflow»: each one is of the kind «Not started», «In progress» or «Done». A task is complete when it enters a «Done» stage.

**Who can access it** is chosen at creation: «Everyone, can edit», «Everyone, read only» or «Only me». Later, access is fine-tuned in the project menu → «Access» for people, groups or roles:
- **View**: see tasks and write in their chats;
- **Edit**: create, change and move tasks;
- **Manage**: also stages, access, archiving and deleting the project.

A task can also have **no project**: then only its participants see it.`,
      },
      example: {
        title: { ru: 'Пример: проект отдела кадров', en: 'Example: an HR project' },
        body: {
          ru: 'Отдел кадров создаёт проект «Кадры» с ключом HR и доступом «Только мне», затем во вкладке «Доступ» даёт группе HR «Редактирование», а руководителям — «Просмотр».',
          en: 'HR creates the project «Personnel» with the key HR and «Only me» access, then in «Access» gives the HR group «Edit» and managers «View».',
        },
      },
    },
    {
      id: 'calendar',
      title: { ru: 'Задачи в календаре', en: 'Tasks in the calendar' },
      body: {
        ru: `Все задачи, где вы участвуете (исполнитель, соисполнитель, постановщик или наблюдатель) и у которых есть **срок**, сами появляются в [Календаре](/app/calendar) — в день и время срока. Просроченные отмечены красным, выполненные зачёркнуты. Клик по задаче открывает её.

- **Перетащите** задачу на другой день или час — срок перенесётся.
- Слева в календаре есть список **«Без срока»**: перетащите задачу оттуда на нужный день, чтобы назначить срок.
- Новую задачу можно создать прямо в календаре: нажмите на пустое место и выберите «Задача».
- После создания задачи появляется подсказка со сроком и кнопкой **«В календаре»** — она откроет нужный день.

Какие задачи показывать (только те, что вы выполняете, все ваши или все доступные), а также завершённые — выбирается в настройках календаря (⚙).`,
        en: `Every task you take part in (assignee, co-assignee, originator or auditor) that has a **deadline** appears in the [Calendar](/app/calendar) on its date and time. Overdue tasks are marked red, completed ones are crossed out. Click a task to open it.

- **Drag** a task to another day or hour to move its deadline.
- The calendar sidebar lists tasks **«Without a deadline»**: drag one onto a day to give it a deadline.
- Create a task right in the calendar: click an empty slot and choose «Task».
- After you create a task, a note shows its deadline with an **«In the calendar»** button that opens that day.

Which tasks to show (the ones you do, all yours, or all you can see) and whether to show completed ones is set in the calendar settings (⚙).`,
      },
      example: {
        title: { ru: 'Срок «через неделю»', en: 'A deadline "in a week"' },
        body: {
          ru: 'Вы создали задачу в понедельник, срок по умолчанию — через неделю, в 19:00. В календаре на текущей неделе её нет — она в следующем понедельнике. Нажмите «В календаре» в подсказке после создания или переключитесь на следующую неделю.',
          en: 'You create a task on Monday; the default deadline is a week ahead at 19:00. It is not in this week of the calendar — it is next Monday. Click «In the calendar» in the note after creating it, or go to next week.',
        },
      },
    },
  ],

  faq: [
    {
      q: { ru: 'Почему задача горит красным «Не принята»?', en: 'Why is a task red with «Not accepted»?' },
      a: {
        ru: 'Исполнитель не принял её за срок принятия (по умолчанию 24 ч, для важных — 4 ч). Достаточно нажать «Принять» в задаче или начать её — метка исчезнет. Срок исполнения от этого не меняется.',
        en: 'The assignee has not accepted it within the time to accept (24 h by default, 4 h for important tasks). Click «Accept» in the task or start it and the label goes away. The deadline itself does not change.',
      },
    },
    {
      q: { ru: 'Нужно ли принимать задачу, которую я поставил себе?', en: 'Do I accept a task I gave myself?' },
      a: {
        ru: 'Нет, такие задачи принимаются автоматически. Принимать нужно только задачи, которые вам поставил кто-то другой.',
        en: 'No, those are accepted automatically. Only tasks someone else gave you need accepting.',
      },
    },
    {
      q: { ru: 'Почему задача не видна в календаре?', en: 'Why is my task not in the calendar?' },
      a: {
        ru: `Задача появляется **в день своего срока**. Проверьте:
- у задачи задан срок (иначе она в списке «Без срока» слева в календаре);
- открыта нужная неделя — срок по умолчанию «через неделю», то есть на следующей неделе;
- в боковой панели календаря включены «Мои задачи», а в настройках (⚙) — «Показывать задачи».`,
        en: `A task appears **on its deadline date**. Check that:
- the task has a deadline (otherwise it is in «Without a deadline» in the calendar sidebar);
- the right week is shown — the default deadline is "in a week", i.e. next week;
- «My tasks» is on in the calendar sidebar, and «Show tasks» in the settings (⚙).`,
      },
    },
    {
      q: { ru: 'Почему не пришло напоминание?', en: 'Why did a reminder not arrive?' },
      a: {
        ru: `Проверьте по порядку:
1. Дату и время напоминания — и что у задачи есть срок, если напоминание «до крайнего срока».
2. Задача не завершена и не отложена.
3. Каналы: Telegram привязан в [Профиль → Безопасность](/account/security), Mattermost указан в [Профиле](/account), push включены на устройстве, в профиле есть e-mail.
5. В [настройках уведомлений](/account/notifications) внизу есть «Последние уведомления» — там видно, куда ушло каждое и почему не дошло. Кнопка «Отправить тест» проверит все каналы.
4. Мессенджеры не выключены в [настройках уведомлений](/account/notifications).

В колокольчике портала напоминание есть всегда.`,
        en: `Check in order:
1. The reminder's date and time, and that the task has a deadline if the reminder is «before the deadline».
2. The task is not completed or deferred.
3. Channels: Telegram linked in [Profile → Security](/account/security), Mattermost entered in the [Profile](/account), push enabled on the device, an e-mail in your profile.
5. [Notification settings](/account/notifications) show «Recent notifications» at the bottom: where each one went and why it did not arrive. «Send a test» checks every channel.
4. Messengers are not switched off in [notification settings](/account/notifications).

The reminder is always in the portal's bell.`,
      },
    },
    {
      q: { ru: 'Не могу изменить срок задачи. Почему?', en: 'I cannot change the deadline. Why?' },
      a: {
        ru: 'Исполнитель меняет срок, только если постановщик это разрешил («Планирование сроков» → «Разрешить исполнителю изменять запланированные сроки»). Напишите постановщику в чате задачи — он перенесёт срок или включит разрешение.',
        en: 'The assignee can change the deadline only if the originator allows it («Planning» → «Allow the assignee to change the planned dates»). Write to the originator in the task chat: they can move the deadline or allow it.',
      },
    },
    {
      q: { ru: 'Кнопка «Завершить» выдаёт ошибку. Что делать?', en: 'The «Complete» button shows an error. What should I do?' },
      a: {
        ru: 'Скорее всего, у задачи включено «Требуется результат». Откройте блок «Результаты», опишите, что сделано, и сохраните — после этого задачу можно завершить.',
        en: 'Most likely the task has «A result is required» on. Open the «Results» block, describe what was done and save it; then the task can be completed.',
      },
    },
    {
      q: { ru: 'Чем соисполнитель отличается от наблюдателя?', en: 'What is the difference between a co-assignee and an auditor?' },
      a: {
        ru: 'Соисполнитель работает над задачей вместе с исполнителем: может её редактировать и завершать. Наблюдатель только следит — видит задачу, пишет в чат и получает уведомления.',
        en: 'A co-assignee works on the task together with the assignee and can edit and complete it. An auditor only follows: sees the task, writes in the chat and gets notifications.',
      },
    },
    {
      q: { ru: 'Я выбрал трёх исполнителей — почему появилось три задачи?', en: 'I chose three assignees: why are there three tasks?' },
      a: {
        ru: 'Так задумано: каждый исполнитель получает свою копию, чтобы отвечать за свою часть. Если нужна одна общая задача, выберите одного исполнителя, а остальных добавьте соисполнителями.',
        en: 'That is by design: each assignee gets their own copy and answers for their part. If you need one shared task, pick one assignee and add the others as co-assignees.',
      },
    },
    {
      q: { ru: 'Коллега не видит задачу по ссылке', en: 'A colleague cannot open the task link' },
      a: {
        ru: 'Задачу видят её участники и те, у кого есть доступ к проекту. Добавьте коллегу наблюдателем или соисполнителем — либо попросите руководителя проекта выдать доступ в меню проекта → «Доступ».',
        en: 'A task is visible to its participants and to people with access to its project. Add the colleague as an auditor or co-assignee, or ask the project manager to grant access in the project menu → «Access».',
      },
    },
    {
      q: { ru: 'Можно ли поменять ключ проекта?', en: 'Can I change a project key?' },
      a: {
        ru: 'Нет. Ключ входит в номера и ссылки всех задач проекта, поэтому он задаётся один раз при создании. Название, описание и цвет проекта менять можно.',
        en: 'No. The key is part of every task number and link in the project, so it is set once at creation. The project name, description and colour can be changed.',
      },
    },
  ],

  fields: {
    important: {
      title: { ru: 'Важная задача', en: 'Important task' },
      text: {
        ru: 'Огонёк выделяет задачу в списках и на доске, чтобы её не пропустили. Срок исполнения он не меняет, но принять важную задачу нужно быстрее — по умолчанию за 4 ч.',
        en: 'The flame highlights the task in lists and on the board so nobody misses it. It does not change the deadline, but an important task has to be accepted sooner — within 4 h by default.',
      },
      more: 'create',
    },
    originator: {
      title: { ru: 'Постановщик', en: 'Originator' },
      text: {
        ru: 'Тот, кто поручает задачу: меняет срок, принимает и оценивает результат. Обычно это вы.',
        en: 'The person who assigns the task: changes the deadline, accepts and rates the result. Usually that is you.',
      },
      more: 'roles',
    },
    assignee: {
      title: { ru: 'Исполнитель', en: 'Assignee' },
      text: {
        ru: 'Главный ответственный за выполнение. Если выбрать несколько исполнителей, каждый получит свою копию задачи.',
        en: 'The person mainly responsible for doing it. If you pick several assignees, each gets their own copy of the task.',
      },
      more: 'roles',
    },
    deadline: {
      title: { ru: 'Крайний срок', en: 'Deadline' },
      text: {
        ru: 'Когда задача должна быть готова. О сроке напомнят заранее, а задача появится в Календаре исполнителя в этот день.',
        en: 'When the task must be done. A reminder comes in advance, and the task appears in the assignee\'s Calendar on that day.',
      },
      more: 'deadlines',
    },
    coassignees: {
      title: { ru: 'Соисполнители', en: 'Co-assignees' },
      text: {
        ru: 'Помогают исполнителю: могут редактировать и завершать задачу. Задача появится у них во вкладке «Помогаю».',
        en: 'They help the assignee and can edit and complete the task. It shows up in their «Helping» tab.',
      },
      more: 'roles',
    },
    auditors: {
      title: { ru: 'Наблюдатели', en: 'Auditors' },
      text: {
        ru: 'Следят за задачей: видят её, пишут в чат и получают уведомления, но ничего не меняют.',
        en: 'They follow the task: see it, write in the chat and get notifications, but change nothing.',
      },
      more: 'roles',
    },
    results: {
      title: { ru: 'Результаты', en: 'Results' },
      text: {
        ru: 'Что сделано по задаче. С «Требуется результат» задачу нельзя завершить, пока результат не добавлен (меню «⋯»).',
        en: 'What was done. With «A result is required», the task cannot be completed until a result is added (the «⋯» menu).',
      },
      more: 'results',
    },
    flow: {
      title: { ru: 'Поток', en: 'Flow' },
      text: {
        ru: 'Очередь задач команды: задача сама достанется участнику по очереди или наименее загруженному.',
        en: 'A team task queue: the task goes to a member in turn or to the least loaded one.',
      },
      more: 'flows',
    },
    reminders: {
      title: { ru: 'Напоминания', en: 'Reminders' },
      text: {
        ru: 'Кому, когда и куда напомнить о задаче. Telegram привязывается в «Профиль → Безопасность», Mattermost указывается в «Профиле».',
        en: 'Whom, when and where to remind about the task. Link Telegram in «Profile → Security» and enter Mattermost in «Profile».',
      },
      more: 'reminders',
    },
    reminderChannels: {
      title: { ru: 'Каналы напоминания', en: 'Reminder channels' },
      text: {
        ru: '«В приложении» — колокольчик и push (push должны быть разрешены на устройстве). «В мессенджеры» работает, если привязан Telegram (Профиль → Безопасность) или указан Mattermost (Профиль).',
        en: '«In the app» means the bell and push (push must be allowed on the device). «Messengers» works if Telegram is linked (Profile → Security) or Mattermost is set in the Profile.',
      },
      more: 'reminders',
    },
    recurring: {
      title: { ru: 'Регулярная задача', en: 'Recurring task' },
      text: {
        ru: 'Задача будет создаваться сама по расписанию — каждый день, неделю, месяц или год, со своим сроком у каждой копии.',
        en: 'The task is created by itself on a schedule (daily, weekly, monthly or yearly), with its own deadline for each copy.',
      },
      more: 'recurring',
    },
    planning: {
      title: { ru: 'Планирование сроков', en: 'Planning' },
      text: {
        ru: 'Плановые даты начала и окончания, пропуск выходных и срок по подзадачам. Здесь же решается, может ли исполнитель переносить срок.',
        en: 'Planned start and finish, skipping weekends and the deadline from subtasks. This is also where you decide whether the assignee may move the deadline.',
      },
      more: 'deadlines',
    },
    timeTracking: {
      title: { ru: 'Учёт времени', en: 'Time tracking' },
      text: {
        ru: 'Плановое время и таймер: видно, сколько реально ушло на задачу у каждого участника.',
        en: 'Planned time and a timer: you see how long the task really took for each participant.',
      },
      more: 'time',
    },
    gantt: {
      title: { ru: 'Связи Ганта', en: 'Gantt links' },
      text: {
        ru: 'Порядок работ между задачами. Чаще всего нужна «Завершение → Начало»: эту задачу начинают после связанной.',
        en: 'The order of work between tasks. Most often you need «Finish → Start»: this task starts after the linked one.',
      },
      more: 'subtasks',
    },
    acceptHours: {
      title: { ru: 'Срок принятия', en: 'Time to accept' },
      text: {
        ru: 'Сколько часов у исполнителя, чтобы принять задачу этого проекта. Пусто — как в настройках модуля.',
        en: 'How many hours the assignee has to accept a task of this project. Empty means as in the module settings.',
      },
      more: 'acceptance',
    },
    projectKey: {
      title: { ru: 'Ключ проекта', en: 'Project key' },
      text: {
        ru: 'Короткий код из латинских букв и цифр для номеров задач и ссылок, например HR-12. После создания его не изменить.',
        en: 'A short code of Latin letters and digits for task numbers and links, such as HR-12. It cannot be changed after creation.',
      },
      more: 'projects',
    },
    projectAccess: {
      title: { ru: 'Кому доступно', en: 'Who can access it' },
      text: {
        ru: 'Стартовые права на проект. Позже их можно уточнить для людей, групп и ролей в меню проекта → «Доступ».',
        en: 'The starting access to the project. Later you can fine-tune it for people, groups and roles in the project menu → «Access».',
      },
      more: 'projects',
    },
  },

  related: ['calendar', 'chat', 'notifications'],
};
