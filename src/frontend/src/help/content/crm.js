export default {
  id: 'crm',
  icon: 'target',
  title: { ru: 'CRM', en: 'CRM' },
  tagline: {
    ru: 'Сделки от первого контакта до результата — на канбане, в списке, по делам и в календаре.',
    en: 'Deals from the first contact to the result — on a kanban, in a list, by activities and in a calendar.',
  },
  summary: {
    ru: 'CRM ведёт сделки по стадиям воронки. Перетаскивайте карточки между стадиями, планируйте звонки и встречи, чтобы ни одна сделка не зависла без следующего шага, и закрывайте их как успешные или проваленные. Клиенты — это компании и контакты из «Контрагентов», поэтому вся история клиента остаётся в одном месте.',
    en: 'The CRM moves deals through the stages of a pipeline. Drag cards between stages, plan calls and meetings so no deal stalls without a next step, and close deals as won or lost. Clients are the companies and contacts of Counterparties, so the whole client history stays in one place.',
  },
  highlights: [
    {
      icon: '🗂',
      title: { ru: 'Канбан по стадиям', en: 'Kanban by stages' },
      text: {
        ru: 'Каждая стадия — колонка с количеством сделок и суммой; карточку можно перетащить мышью или пальцем.',
        en: 'Every stage is a column with the number of deals and their total; drag a card with the mouse or a finger.',
      },
    },
    {
      icon: '📌',
      title: { ru: 'Дела по сделкам', en: 'Activities on deals' },
      text: {
        ru: 'Звонки, встречи, задачи и письма с датой, ответственным и напоминанием.',
        en: 'Calls, meetings, tasks and e-mails with a date, a person and a reminder.',
      },
    },
    {
      icon: '🔎',
      title: { ru: 'Один фильтр на все виды', en: 'One filter for every view' },
      text: {
        ru: 'Канбан, список, дела и календарь показывают одни и те же сделки; удачный фильтр можно сохранить.',
        en: 'Kanban, list, activities and calendar show the same deals; a good filter can be saved.',
      },
    },
    {
      icon: '🏆',
      title: { ru: 'Успех или провал', en: 'Won or lost' },
      text: {
        ru: 'Закрывайте сделки одной кнопкой; для проваленных портал спросит причину.',
        en: 'Close deals with one button; for lost ones the portal asks why.',
      },
    },
    {
      icon: '🏢',
      title: { ru: 'Клиенты из «Контрагентов»', en: 'Clients from Counterparties' },
      text: {
        ru: 'Сделка связана с компанией и контактом; на их карточках видно созданные и закрытые сделки.',
        en: 'A deal is linked to a company and a contact; their cards show created and closed deals.',
      },
    },
    {
      icon: '💬',
      title: { ru: 'Обсуждение с коллегами', en: 'Discuss with colleagues' },
      text: {
        ru: 'У каждой сделки может быть свой чат для ответственного, наблюдателей и автора.',
        en: 'Each deal can have its own chat for the responsible person, watchers and the author.',
      },
    },
  ],
  tips: [
    { ru: 'Оставляйте у каждой сделки следующее дело — счётчик «Без дел» подскажет, какие сделки забыты.', en: 'Keep a next activity on every deal — the «No activities» counter shows forgotten deals.' },
    { ru: 'Начните день с вида «Дела»: колонки «Просрочены» и «На сегодня» — ваш план.', en: 'Start the day with the Activities view: «Overdue» and «Today» are your plan.' },
    { ru: 'Быстрая сделка в первой колонке канбана создаётся за три поля: название, сумма, клиент.', en: 'A quick deal in the first kanban column takes three fields: name, amount, client.' },
    { ru: 'Esc закрывает карточку сделки и возвращает к виду, где вы были.', en: 'Esc closes the deal card and brings you back to the view you were in.' },
    { ru: 'Нажмите на счётчик «Просрочены» над доской — останутся только сделки с просроченными делами.', en: 'Click the «Overdue» counter above the board to keep only deals with overdue activities.' },
    { ru: 'Сохраните фильтр, которым пользуетесь каждый день, — он появится в списке фильтров слева.', en: 'Save the filter you use every day — it appears in the list of filters on the left.' },
  ],
  sections: [
    {
      id: 'kanban',
      title: { ru: 'Канбан', en: 'Kanban' },
      body: {
        ru: 'Колонки — стадии выбранной воронки. В заголовке стадии — её цвет, количество сделок и сумма по каждой валюте.\n\nНа карточке видно название, сумму, клиента, ближайшее дело (красным, если просрочено), число открытых дел и ответственного. Кнопка **+ Дело** на карточке планирует звонок или встречу, не открывая сделку.\n\nПеретащите карточку в другую колонку, чтобы сменить стадию. Пока вы тянете карточку, внизу появляются зоны **Успешно** и **Провалена** — бросьте карточку туда, чтобы закрыть сделку. Если в колонке много сделок, внизу появится кнопка **Ещё**.',
        en: 'Columns are the stages of the chosen pipeline. A stage header shows its colour, the number of deals and the total per currency.\n\nA card shows the name, amount, client, the next activity (red when overdue), the number of open activities and the responsible person. The **+ Activity** button on a card plans a call or meeting without opening the deal.\n\nDrag a card to another column to change the stage. While you drag, **Won** and **Lost** zones appear at the bottom — drop the card there to close the deal. Long columns get a **More** button at the bottom.',
      },
      steps: [
        { ru: 'Нажмите **+ Быстрая сделка** в первой колонке.', en: 'Press **+ Quick deal** in the first column.' },
        { ru: 'Введите название, сумму и выберите клиента — или создайте его прямо в списке.', en: 'Enter the name, amount and pick the client — or create one right in the list.' },
        { ru: 'Нажмите **Создать**: сделка встанет первой в колонке.', en: 'Press **Create**: the deal goes to the top of the column.' },
      ],
      note: {
        ru: 'На телефоне карточку нужно сначала немного подержать пальцем, а потом тянуть — так прокрутка доски не мешает перетаскиванию.',
        en: 'On a phone, hold the card for a moment before dragging — this way scrolling the board does not interfere.',
      },
    },
    {
      id: 'list',
      title: { ru: 'Список', en: 'List' },
      body: {
        ru: 'Таблица сделок с сортировкой по клику на заголовок колонки. Кнопка с колонками справа выбирает, что показывать, включая свои поля; выбор запоминается.\n\nПолоска стадий в колонке «Стадия» кликабельна: нажмите на сегмент, чтобы перевести сделку, или на последний — чтобы завершить её.\n\nОтметьте строки галочками — внизу появится панель действий: **Изменить стадию**, **Ответственного**, **Перенести в воронку**, **Наблюдатели**, **Удалить**. Галочка **Для всех по фильтру** применяет действие ко всем сделкам фильтра (до 1000).',
        en: 'A table of deals sorted by a click on a column header. The columns button on the right chooses what to show, including custom fields; the choice is remembered.\n\nThe stage bar in the «Stage» column is clickable: click a segment to move the deal, or the last one to close it.\n\nTick rows and an action bar appears at the bottom: **Change stage**, **Responsible**, **Move to pipeline**, **Watchers**, **Delete**. **For all by the filter** applies the action to every deal of the filter (up to 1000).',
      },
      note: {
        ru: 'Чтобы список открывался быстро, общее количество сделок считается по кнопке **Показать количество**.',
        en: 'To keep the list fast, the total is counted on demand with **Show count**.',
      },
    },
    {
      id: 'activities',
      title: { ru: 'Дела', en: 'Activities' },
      body: {
        ru: 'Сделки разложены по их ближайшему открытому делу: **Просрочены**, **На сегодня**, **На этой неделе**, **На следующей неделе**, **Позже** и **Без дел**.\n\nПеретащите карточку в другую колонку — ближайшее дело сделки переедет на этот день (время сохранится). В колонку «Без дел» перетаскивать нельзя: чтобы снять дело, отметьте его выполненным в карточке сделки.\n\n**Мои дела** в боковом меню — все ваши открытые дела по всем сделкам с галочками «выполнено».',
        en: 'Deals are sorted by their nearest open activity: **Overdue**, **Today**, **This week**, **Next week**, **Later** and **No activities**.\n\nDrag a card to another column and the nearest activity of the deal moves to that day (the time stays). You cannot drop into «No activities»: to remove an activity, mark it done in the deal card.\n\n**My activities** in the sidebar lists all your open activities across deals with «done» checkboxes.',
      },
    },
    {
      id: 'calendar',
      title: { ru: 'Календарь', en: 'Calendar' },
      body: {
        ru: 'Сделки на сетке месяца или недели по дате закрытия — или по любому своему полю с типом «Дата» (выбирается справа над календарём). Перетащите сделку на другой день, чтобы изменить эту дату. Клик открывает сделку.',
        en: 'Deals on a month or week grid by the close date — or by any custom «Date» field (chosen above the calendar on the right). Drag a deal to another day to change that date. A click opens the deal.',
      },
    },
    {
      id: 'filter',
      title: { ru: 'Фильтр и счётчики', en: 'Filter and counters' },
      body: {
        ru: 'Поле фильтра над доской ищет по названию сделки, клиенту и комментарию. Клик по полю открывает панель: слева готовые фильтры — **В работе**, **Мои сделки**, **Закрытые** и ваши сохранённые, справа — поля: ответственный, сумма, стадии, группа стадий, даты, источник, клиент и свои поля-списки.\n\nСчётчики **Просрочены**, **На сегодня**, **Запланированы**, **Без дел** считают сделки текущего фильтра по их делам; клик по счётчику оставляет только эти сделки.\n\nВид (канбан, список, дела, календарь), воронка и фильтр запоминаются — в следующий раз CRM откроется так же.',
        en: 'The filter field above the board searches the deal name, the client and the comment. A click opens the panel: ready filters on the left — **In progress**, **My deals**, **Closed** and your saved ones; fields on the right: responsible, amount, stages, stage group, dates, source, client and custom list fields.\n\nThe **Overdue**, **Today**, **Planned**, **No activities** counters count the deals of the current filter by their activities; a click keeps only those deals.\n\nThe view (kanban, list, activities, calendar), the pipeline and the filter are remembered — next time the CRM opens the same way.',
      },
      steps: [
        { ru: 'Откройте фильтр и выберите нужные поля.', en: 'Open the filter and choose the fields.' },
        { ru: 'Нажмите **+ Сохранить фильтр** и дайте ему имя.', en: 'Press **+ Save filter** and name it.' },
        { ru: 'Фильтр появится в списке слева — его видите только вы.', en: 'The filter appears in the list on the left — only you see it.' },
      ],
    },
    {
      id: 'deal',
      title: { ru: 'Карточка сделки', en: 'The deal card' },
      body: {
        ru: 'Сделка открывается панелью поверх текущего вида. Вверху — воронка, название (меняется прямо на месте), сумма, ответственный и стрелки стадий: клик по стрелке переводит сделку, кнопка **Завершить** закрывает её как **Успешно** или **Провалена**.\n\nСлева — карточки разделов с полями. Пустые поля помечены «не заполнено»; нажмите на значение, чтобы изменить его. В блоке «Клиент» — компания и контакт с кнопками звонка и письма и ссылкой на их карточку в «Контрагентах».\n\nСправа — лента: вкладка **Дело** планирует звонок, встречу, задачу или письмо, вкладка **Комментарий** — заметка для коллег. Ниже закреплён список **Что нужно сделать** с открытыми делами: галочка отмечает дело выполненным, просроченные — красные. Под ним — вся история сделки по дням.\n\n**Обсудить с коллегами** открывает чат сделки. На телефоне поля и лента — на отдельных вкладках.',
        en: 'A deal opens as a panel over the current view. At the top: the pipeline, the name (edited in place), the amount, the responsible person and the stage arrows: click an arrow to move the deal, **Close deal** finishes it as **Won** or **Lost**.\n\nOn the left — section cards with fields. Empty fields read «not filled in»; click a value to change it. The «Client» block shows the company and the contact with call and e-mail buttons and a link to their Counterparties card.\n\nOn the right — the timeline: the **Activity** tab plans a call, meeting, task or e-mail, the **Comment** tab leaves a note for colleagues. Below is the pinned **To do** list of open activities: the checkbox marks one done, overdue ones are red. Then the whole history of the deal by day.\n\n**Discuss with colleagues** opens the deal chat. On a phone, fields and the timeline are separate tabs.',
      },
      example: {
        title: { ru: 'Звонок после встречи', en: 'A call after a meeting' },
        body: {
          ru: 'Встреча прошла, клиент просит коммерческое предложение. Отметьте встречу выполненной, переведите сделку на стадию «Предложение» и запланируйте звонок на послезавтра с напоминанием за 15 минут — CRM напомнит, а сделка не потеряется.',
          en: 'The meeting went well and the client wants a proposal. Mark the meeting done, move the deal to «Proposal» and plan a call for the day after tomorrow with a 15-minute reminder — the CRM reminds you and the deal is not lost.',
        },
      },
      note: {
        ru: 'Если коллега изменил сделку, пока она была у вас открыта, портал покажет свежую версию и предупредит — чужие правки не затрутся.',
        en: 'If a colleague changes the deal while you have it open, the portal shows the fresh version and warns you — nobody overwrites anyone.',
      },
    },
    {
      id: 'pipelines',
      title: { ru: 'Воронки и стадии', en: 'Pipelines and stages' },
      body: {
        ru: 'Администратор CRM настраивает воронки в разделе **Воронки**: название, цвет, стадии и их порядок (перетаскиванием). Стадии **Успешно** и **Провалена** всегда стоят в конце, их можно переименовать.\n\nЕсли на удаляемой стадии есть сделки, портал спросит, куда их перенести. Воронку со сделками можно удалить, только выбрав другую воронку для её сделок.',
        en: 'A CRM administrator sets up pipelines under **Pipelines**: the name, colour, stages and their order (by dragging). The **Won** and **Lost** stages always come last and can be renamed.\n\nIf a removed stage still has deals, the portal asks where to move them. A pipeline with deals can be deleted only by choosing another pipeline for them.',
      },
    },
    {
      id: 'settings',
      title: { ru: 'Настройки', en: 'Settings' },
      body: {
        ru: 'В **Настройках** CRM задаются валюта по умолчанию и список валют, видимость сделок (все видят все или только свои), источники, причины провала, напоминания о делах, разделы карточки и свои поля.\n\nСвои поля бывают: текст, длинный текст, число, деньги, дата, список, несколько из списка, да/нет, ссылка и сотрудник. Галочка **В списке** добавляет поле колонкой в вид «Список».',
        en: 'CRM **Settings** hold the default currency and the list of currencies, the visibility of deals (everyone sees everything or only their own), sources, lost reasons, activity reminders, card sections and custom fields.\n\nCustom fields can be text, long text, number, money, date, list, several from a list, yes/no, link and employee. **In the list** adds the field as a column of the List view.',
      },
    },
    {
      id: 'trash',
      title: { ru: 'Корзина', en: 'Trash' },
      body: {
        ru: 'Удалённые сделки попадают в **Корзину** вместе с делами и историей. Восстановить сделку могут её ответственный, автор и администраторы CRM.',
        en: 'Deleted deals go to the **Trash** with their activities and history. The responsible person, the author and CRM administrators can restore them.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Почему я не вижу сделки коллег?', en: 'Why can’t I see my colleagues’ deals?' },
      a: {
        ru: 'Администратор включил видимость «Только свои сделки». Вы видите сделки, где вы ответственный, наблюдатель или автор. Попросите добавить вас наблюдателем.',
        en: 'The administrator turned on «Only their own deals». You see deals where you are responsible, a watcher or the author. Ask to be added as a watcher.',
      },
    },
    {
      q: { ru: 'Как вернуть закрытую сделку в работу?', en: 'How do I reopen a closed deal?' },
      a: {
        ru: 'Откройте сделку и нажмите **Вернуть в работу** в плашке результата, затем выберите стадию. Найти закрытые сделки помогает фильтр **Закрытые**.',
        en: 'Open the deal and press **Back to work** on the result banner, then choose a stage. The **Closed** filter helps to find closed deals.',
      },
    },
    {
      q: { ru: 'Куда приходят напоминания о делах?', en: 'Where do activity reminders arrive?' },
      a: {
        ru: 'Туда же, куда остальные уведомления портала: колокольчик, push, Telegram или почта — по вашим настройкам в [Уведомлениях](/account/notifications), группа «CRM».',
        en: 'Where the other portal notifications go: the bell, push, Telegram or e-mail — as set in your [Notifications](/account/notifications), group «CRM».',
      },
    },
    {
      q: { ru: 'Можно ли сменить воронку у сделки?', en: 'Can I move a deal to another pipeline?' },
      a: {
        ru: 'Да: в карточке сделки нажмите на название воронки над заголовком и выберите другую. Сделка начнёт с её первой стадии. Для нескольких сделок — действие **Перенести в воронку** в списке.',
        en: 'Yes: in the deal card click the pipeline name above the title and choose another. The deal starts at its first stage. For several deals use **Move to pipeline** in the list.',
      },
    },
    {
      q: { ru: 'Как выгрузить сделки в Excel?', en: 'How do I export deals to Excel?' },
      a: {
        ru: 'В виде «Список» нажмите **Экспорт CSV** — выгрузятся сделки текущего фильтра с выбранными колонками. Файл открывается в Excel.',
        en: 'In the List view press **Export CSV** — the deals of the current filter with the chosen columns are exported. The file opens in Excel.',
      },
    },
    {
      q: { ru: 'Где видно, какие сделки были с клиентом?', en: 'Where can I see a client’s deals?' },
      a: {
        ru: 'В карточке компании или контакта в «Контрагентах», на вкладке «История»: созданные, успешные и проваленные сделки со ссылкой на них. В CRM — фильтр по полю «Клиент».',
        en: 'In the company or contact card in Counterparties, on the «History» tab: created, won and lost deals with links. In the CRM — filter by «Client».',
      },
    },
  ],
  fields: {
    lostReasons: {
      title: { ru: 'Причины провала', en: 'Lost reasons' },
      text: {
        ru: 'Когда сделку закрывают как проваленную, портал просит выбрать причину. По ним потом видно, почему уходят клиенты.',
        en: 'When a deal is closed as lost, the portal asks for a reason. Later they show why clients leave.',
      },
      more: 'settings',
    },
    customFields: {
      title: { ru: 'Свои поля', en: 'Custom fields' },
      text: {
        ru: 'Дополнительные поля сделок по разделам карточки. «В списке» — колонка в виде «Список», «Обязательное» — нельзя создать сделку без значения.',
        en: 'Extra deal fields in the card sections. «In the list» adds a List column, «Required» means a deal cannot be created without a value.',
      },
      more: 'settings',
    },
  },
  related: ['companies', 'tasks', 'notifications', 'chat'],
};
