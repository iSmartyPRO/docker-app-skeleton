export default {
  id: 'approvals',
  icon: 'inbox',
  title: { ru: 'Согласования и «Ждёт меня»', en: 'Approvals and «Waiting for me»' },
  tagline: {
    ru: 'Всё, что ждёт вашего решения, — на одной странице. Согласовать или задать вопрос можно в один-два клика.',
    en: 'Everything waiting for your decision on one page. Approve or ask a question in one or two clicks.',
  },
  summary: {
    ru: 'Согласования — общий сервис портала. Заявки на закупку, договоры и другие документы проходят по маршруту из этапов, а каждый согласующий видит свои документы на странице «Ждёт меня». Там же — вопросы к вам, возвращённые вам документы и задачи, которые ждут принятия.',
    en: 'Approvals are a shared service of the portal. Purchase requests, contracts and other documents go through a route of stages, and each approver sees their documents on the «Waiting for me» page — together with questions to you, documents returned to you and tasks waiting for acceptance.',
  },
  highlights: [
    { icon: '📥', title: { ru: 'Одна точка входа', en: 'One place' }, text: { ru: 'Значок «Входящие» в шапке со счётчиком, страница «Ждёт меня» и виджет на дашборде.', en: 'The Inbox icon in the header with a counter, the «Waiting for me» page and a dashboard widget.' } },
    { icon: '⚡', title: { ru: 'Решение за 1–2 клика', en: 'Decide in 1–2 clicks' }, text: { ru: '«Согласовать», «Вопрос» и «Открыть» прямо в строке; несколько документов — одним действием.', en: '«Approve», «Question» and «Open» right in the row; several documents in one action.' } },
    { icon: '🚦', title: { ru: 'Цвет означает срок', en: 'Colour means deadline' }, text: { ru: 'Красное — просрочено, жёлтое — скоро срок. Срочное всегда сверху.', en: 'Red is overdue, yellow is due soon. Urgent items are always on top.' } },
    { icon: '🧭', title: { ru: 'Прозрачный путь', en: 'A clear path' }, text: { ru: 'Видно, кто подал, кто уже согласовал, где документ сейчас и сколько он там лежит.', en: 'See who sent it, who approved it, where it is now and how long it has waited.' } },
    { icon: '💬', title: { ru: 'Вопросы рядом с документом', en: 'Questions next to the document' }, text: { ru: 'Ответ на вопрос возвращает документ на тот же этап — ничего не теряется в мессенджерах.', en: 'An answer returns the document to the same stage — nothing gets lost in messengers.' } },
    { icon: '🏖', title: { ru: 'Заместитель', en: 'A substitute' }, text: { ru: 'На время отпуска ваши согласования решает заместитель.', en: 'While you are on vacation, your substitute decides your approvals.' } },
  ],
  tips: [
    { ru: 'Откройте документ щелчком по строке: карточка появится справа, а клавиши ↑ и ↓ листают документы.', en: 'Click a row to open the side card; ↑ and ↓ move between documents.' },
    { ru: 'В окне вопроса Ctrl+Enter отправляет текст.', en: 'In the question box, Ctrl+Enter sends.' },
    { ru: 'Отметьте несколько строк флажками и нажмите «Согласовать отмеченные» — портал спросит подтверждение.', en: 'Tick several rows and press «Approve selected» — the portal asks for confirmation.' },
    { ru: 'Фильтр по модулю над списком показывает, сколько документов ждёт в каждом.', en: 'The module filter above the list shows how many documents wait in each module.' },
    { ru: 'Уезжаете? «Кабинет → Мой заместитель» — укажите человека и даты.', en: 'Going away? «Account → My substitute» — choose a person and the dates.' },
  ],
  sections: [
    {
      id: 'inbox',
      title: { ru: 'Страница «Ждёт меня»', en: 'The «Waiting for me» page' },
      body: {
        ru: 'Откройте её значком «Входящие» в шапке или из меню приложений. Вкладки:\n\n- **Ждёт меня** — документы на вашем этапе, вопросы к вам, документы, возвращённые вам на доработку, и задачи, которые ждут принятия;\n- **Мои на согласовании** — ваши документы: на каком этапе, кого ждут и до какого срока;\n- **Решённые мной** — что вы согласовали, отклонили, вернули или передали.\n\nСписок разбит на группы **Просрочено**, **Сегодня** и **Остальные**; внутри — по срочности и сроку. В строке: модуль, номер, название, сумма, автор, срок и срочность.',
        en: 'Open it with the Inbox icon in the header or from the app menu. Tabs:\n\n- **Waiting for me** — documents on your stage, questions to you, documents returned to you for rework, and tasks waiting for acceptance;\n- **Mine in approval** — your documents: their stage, whom they wait for and until when;\n- **Decided by me** — what you approved, rejected, returned or passed on.\n\nThe list is grouped into **Overdue**, **Today** and **Others**, sorted by urgency and deadline. A row shows the module, number, title, amount, author, deadline and urgency.',
      },
    },
    {
      id: 'decisions',
      title: { ru: 'Решения', en: 'Decisions' },
      body: {
        ru: '- **Согласовать** — этап закрывается, когда согласовали все (или любой из — как задано в маршруте); документ идёт дальше. После последнего этапа он «Согласован».\n- **Вопрос** — обязателен текст. Документ переходит в «Нужен ответ» у автора или у человека, которого вы выбрали. Ответ возвращает документ на тот же этап, а время ожидания ответа добавляется к сроку.\n- **Вернуть на доработку** — с комментарием. Автор правит документ и отправляет заново.\n- **Делегировать** — передать решение другому человеку.\n- **Отклонить** — обязателен комментарий; согласование завершается.\n\nАвтор может **отозвать** документ, пока его не согласовали.',
        en: '- **Approve** — the stage closes when everyone (or any one — as the route says) approved; the document moves on. After the last stage it is «Approved».\n- **Question** — the text is required. The document goes to «Needs an answer» for the author or the person you chose. The answer returns it to the same stage, and the waiting time is added to the deadline.\n- **Return for rework** — with a comment. The author edits the document and sends it again.\n- **Delegate** — pass the decision to someone else.\n- **Reject** — the comment is required; the approval ends.\n\nThe author can **withdraw** a document until it is approved.',
      },
    },
    {
      id: 'deadlines',
      title: { ru: 'Сроки, напоминания и эскалация', en: 'Deadlines, reminders and escalation' },
      body: {
        ru: 'Срок реакции этапа зависит от срочности: по умолчанию **Критично — 4 ч**, **Срочно — 24 ч**, **Обычно — 72 ч**. Рабочее время пока не учитывается.\n\nКогда прошло 75 % срока, согласующим приходит напоминание. Когда срок вышел, документ горит красным, а уведомление об эскалации получают люди, указанные в маршруте (по умолчанию — администраторы модуля). Напоминание и эскалация приходят один раз на этап.',
        en: 'A stage’s reaction time depends on urgency: by default **Critical — 4 h**, **Urgent — 24 h**, **Normal — 72 h**. Working hours are not taken into account yet.\n\nWhen 75 % of the time has passed, the approvers get a reminder. When the deadline passes, the document turns red and the route’s escalation people (the module’s administrators by default) are notified. The reminder and the escalation come once per stage.',
      },
    },
    {
      id: 'substitutes',
      title: { ru: 'Заместитель', en: 'Substitute' },
      body: {
        ru: 'В **Кабинете → Мой заместитель** выберите человека и период (обе даты включительно). Пока период идёт, заместитель видит ваши этапы на своей странице «Ждёт меня» и может решать их. В истории решение отмечается «за вас». Администратор согласований может назначать заместителей любым сотрудникам.',
        en: 'In **Account → My substitute** choose a person and a period (both dates inclusive). During the period the substitute sees your stages on their «Waiting for me» page and can decide them. History marks such decisions as made “for you”. An approvals administrator can set substitutes for anyone.',
      },
    },
    {
      id: 'routes',
      title: { ru: 'Маршруты (для администраторов)', en: 'Routes (for administrators)' },
      body: {
        ru: 'Маршрут задаётся для каждого типа документа: **Входящие → ⚙ Настройки** или **Настройки → Модули → Согласования**.\n\n- Этапы перетаскиваются; у этапа — название, согласующие (люди, роли, группы) и режим «все» или «любой из». Роль или группа — один согласующий: решает любой её участник.\n- **Условия** этапа проверяются по полям документа: сумма больше X (можно указать валюту), категория, проект, юрлицо. Если условие не выполнено, этап пропускается.\n- **После доработки** документ проходит маршрут с первого этапа или с того, который его вернул.\n- **Эскалация** — кому сообщить о просрочке.\n- **Предпросмотр** справа показывает, каким будет маршрут, например, для заявки на $5 000 категории «Оборудование».\n\nМаршруты меняют администраторы согласований и администраторы самого модуля (например, Закупок). Уровни срочности, напоминание и эскалацию настраивает администратор согласований.',
        en: 'A route is set for each document type: **Inbox → ⚙ Settings** or **Settings → Modules → Approvals**.\n\n- Drag stages to reorder; a stage has a name, approvers (people, roles, groups) and the mode «all» or «any of». A role or group is one approver: any of its members decides.\n- A stage’s **conditions** check the document’s fields: amount above X (optionally in a currency), category, project, legal entity. When a condition fails, the stage is skipped.\n- **After rework** the document goes from the first stage or from the stage that returned it.\n- **Escalation** — whom to tell when a stage is overdue.\n- The **preview** on the right shows the route, e.g. for a $5 000 request in «Equipment».\n\nRoutes are changed by approvals administrators and by the module’s own administrators (e.g. Procurement). Urgency levels, the reminder and escalation are set by an approvals administrator.',
      },
      example: {
        title: { ru: 'Пример маршрута закупки', en: 'An example purchase route' },
        body: {
          ru: '1. «Руководитель отдела» — роль, любой из.\n2. «Финансовый директор» — если сумма ≥ 5 000 USD.\n3. «ИТ» — группа, если категория «Оборудование».\n\nЗаявка на 300 USD «Услуги» пройдёт только первый этап; на 5 000 USD «Оборудование» — все три.',
          en: '1. «Head of department» — a role, any of.\n2. «CFO» — if the amount ≥ 5 000 USD.\n3. «IT» — a group, if the category is «Equipment».\n\nA 300 USD «Services» request passes only the first stage; a 5 000 USD «Equipment» one — all three.',
        },
      },
    },
  ],
  faq: [
    { q: { ru: 'Почему документ не появился у меня, хотя я в группе согласующих?', en: 'Why do I not see a document although I am in the approvers’ group?' }, a: { ru: 'Возможно, этап ещё не начался (документ на предыдущем этапе), его уже согласовал другой участник в режиме «любой из», или этап пропущен по условию.', en: 'The stage may not have started yet (the document is on an earlier stage), another member already approved it in «any of» mode, or the stage was skipped by a condition.' } },
    { q: { ru: 'Я нажал «Согласовать», а портал пишет, что процесс ушёл дальше.', en: 'I pressed «Approve» and the portal says the process has moved on.' }, a: { ru: 'Кто-то решил раньше вас — например, другой участник роли. Обновите список: документ уже на следующем этапе или завершён.', en: 'Someone decided before you — e.g. another member of the role. Refresh: the document is already on the next stage or finished.' } },
    { q: { ru: 'Сколько ждать ответа на вопрос?', en: 'How long does a question wait?' }, a: { ru: 'Пока ждём ответа, срок этапа стоит на паузе; после ответа он продолжается с того же места.', en: 'While the answer is pending the stage deadline is paused; after the answer it continues where it stopped.' } },
    { q: { ru: 'Можно ли выключить согласования?', en: 'Can approvals be switched off?' }, a: { ru: 'Нет, это сервис ядра. Выключаются модули, которые им пользуются (Закупки, Договоры).', en: 'No, it is a core service. The modules that use it (Procurement, Contracts) can be switched off.' } },
  ],
  fields: {
    restartFrom: { title: { ru: 'После доработки', en: 'After rework' }, text: { ru: 'С какого этапа пойдёт документ, когда автор отправит его заново.', en: 'Where the document starts when the author sends it again.' }, more: 'routes' },
    escalateTo: { title: { ru: 'Эскалация', en: 'Escalation' }, text: { ru: 'Кому сообщить, что этап просрочен. Пусто — администраторам модуля.', en: 'Who is told that a stage is overdue. Empty — the module’s administrators.' }, more: 'deadlines' },
  },
  related: ['dashboard', 'tasks', 'notifications'],
};
