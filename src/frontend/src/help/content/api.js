export default {
  id: 'api',
  icon: 'code',
  title: { ru: 'API и интеграции', en: 'API and integrations' },
  tagline: {
    ru: 'Подключайте 1С, ботов, кадровые и другие системы к порталу — с точным контролем доступа',
    en: 'Connect 1C, bots, HR and other systems to the portal — with precise access control',
  },
  summary: {
    ru: 'Другие системы работают с порталом через REST API по **токену**: создают задачи, пишут в чат, синхронизируют календарь и сотрудников. Каждый токен действует от имени конкретного человека и никогда не получает больше его прав, а администратор дополнительно сужает доступ шаблонами, разделами, ресурсами и правилами. **Вебхуки** в обратную сторону сразу сообщают внешним системам о событиях в портале.',
    en: 'Other systems work with the portal through a REST API using a **token**: they create tasks, post to chat, sync calendars and staff. Every token acts on behalf of a specific person and never gets more than their rights, and the administrator narrows access further with templates, areas, resources and rules. **Webhooks** work the other way, telling external systems about portal events as they happen.',
  },
  highlights: [
    {
      icon: '🔑',
      title: { ru: 'Токены от имени человека', en: 'Tokens act as a person' },
      text: {
        ru: 'Токен работает с правами владельца — ни больше, ни меньше, чем человек может сам.',
        en: 'A token works with its owner’s rights — never more than that person can do.',
      },
    },
    {
      icon: '🧩',
      title: { ru: 'Шаблоны доступа', en: 'Access templates' },
      text: {
        ru: 'Готовые наборы «Только чтение», «Чат-бот», «Синхронизация с кадрами» и свои шаблоны.',
        en: 'Ready-made sets like “Read only”, “Chat bot”, “HR directory sync”, plus your own.',
      },
    },
    {
      icon: '🎯',
      title: { ru: 'Точная настройка', en: 'Fine-grained control' },
      text: {
        ru: 'Уровни по разделам, отдельные проекты и календари, правила для путей, IP, срок и лимит.',
        en: 'Per-area levels, specific projects and calendars, path rules, IP, expiry and rate limit.',
      },
    },
    {
      icon: '📡',
      title: { ru: 'Вебхуки', en: 'Webhooks' },
      text: {
        ru: 'Подписанные уведомления о задачах, сообщениях, событиях календаря и пользователях с повторами при сбое.',
        en: 'Signed notifications about tasks, messages, calendar events and users, retried on failure.',
      },
    },
    {
      icon: '📊',
      title: { ru: 'Журнал запросов', en: 'Request log' },
      text: {
        ru: 'Каждый вызов по токену: кто, что, с каким результатом и за сколько миллисекунд.',
        en: 'Every token call: who, what, with which result and how many milliseconds.',
      },
    },
    {
      icon: '📘',
      title: { ru: 'Портал разработчика', en: 'Developer portal' },
      text: {
        ru: 'Справочник с примерами, консоль «Попробовать» и OpenAPI для Postman — по адресу /developers.',
        en: 'Reference with examples, a “Try it” console and OpenAPI for Postman — at /developers.',
      },
    },
  ],
  tips: [
    {
      ru: 'Для каждой интеграции заводите отдельную техническую учётную запись и отдельный токен.',
      en: 'Give each integration its own technical account and its own token.',
    },
    {
      ru: 'Токен показывается один раз — сразу сохраните его в хранилище секретов интеграции.',
      en: 'A token is shown only once — store it in the integration’s secret store right away.',
    },
    {
      ru: 'Панель «Проверить запрос» в редакторе токена сразу показывает, пропустит ли токен нужный вызов.',
      en: 'The “Check a request” panel in the token editor tells you at once whether the token allows a call.',
    },
    {
      ru: 'Ставьте срок действия и список IP для каждого токена интеграции — это бесплатная страховка от утечки.',
      en: 'Set an expiry and an IP list on every integration token — free insurance against leaks.',
    },
    {
      ru: 'Следите за блоком «Требует внимания» на обзоре: там истекающие и неиспользуемые токены и сбойные вебхуки.',
      en: 'Watch “Needs attention” on the overview: expiring and idle tokens and failing webhooks show up there.',
    },
  ],
  sections: [
    {
      id: 'tokens',
      title: { ru: 'Что такое токен', en: 'What a token is' },
      body: {
        ru: '**API-токен** — длинный секретный ключ вида `pat_k3Jd9xQe_…`, по которому другая система обращается к порталу. Он передаётся в заголовке `Authorization: Bearer …` и работает как вход от имени своего владельца: применяются его роли, группы, доступ к проектам и папкам.\n\nГде управлять токенами:\n\n- **Консоль администратора → API и интеграции** ([/admin/api](/admin/api)) — все токены портала, шаблоны, вебхуки, журнал и настройки. Нужно право «Администрирование API».\n- **Личный кабинет → API-токены** ([/account/api](/account/api)) — свои токены. Нужно право «Личные API-токены».\n\nПортал хранит только отпечаток токена, поэтому показать его ещё раз нельзя. Если токен потерян — нажмите **Новый секрет**: старый перестанет работать сразу. **Отозвать** — мгновенно отключает токен навсегда.',
        en: 'An **API token** is a long secret key like `pat_k3Jd9xQe_…` that another system uses to talk to the portal. It is sent in the `Authorization: Bearer …` header and works like signing in as its owner: their roles, groups and access to projects and folders apply.\n\nWhere tokens are managed:\n\n- **Admin console → API & integrations** ([/admin/api](/admin/api)) — every token, templates, webhooks, the log and settings. Needs the “API administration” permission.\n- **Account → API tokens** ([/account/api](/account/api)) — your own tokens. Needs the “Personal API tokens” permission.\n\nThe portal keeps only a fingerprint of the token, so it can’t be shown again. If it is lost, press **New secret**: the old one stops working at once. **Revoke** switches the token off for good, immediately.',
      },
      note: {
        ru: 'Токены никогда не могут входить и выходить, менять пароли и сессии или управлять другими токенами — эти действия доступны только человеку в интерфейсе.',
        en: 'Tokens can never sign in or out, change passwords or sessions, or manage other tokens — those actions are for people in the interface only.',
      },
    },
    {
      id: 'owners',
      title: { ru: 'Личные токены и токены от имени', en: 'Personal tokens and tokens on behalf of others' },
      body: {
        ru: '- **Личный токен** человек создаёт себе сам в кабинете — например, для своего скрипта выгрузки задач. Он работает с правами автора.\n- **Токен от имени** администратор API выпускает для другой учётной записи (поле **Работает от имени**). В списке такие токены помечены «От имени».\n\nДля интеграций лучше всего завести отдельную **техническую учётную запись** («Интеграция 1С», «Бот поддержки»), дать ей ровно нужные группы и выпустить токен от её имени. Тогда интеграция не зависит от конкретного сотрудника: если он уволится и его учётную запись отключат, его токены перестанут работать.',
        en: '- A **personal token** is created by a person for themselves in the cabinet — say, for their own task export script. It has the author’s rights.\n- A **token on behalf of** another account is issued by an API administrator (the **Acts on behalf of** field). Such tokens are marked “On behalf of” in the list.\n\nFor integrations, create a dedicated **technical account** (“1C integration”, “Support bot”), give it exactly the groups it needs and issue the token on its behalf. The integration then doesn’t depend on an employee: if that person leaves and their account is disabled, their tokens stop working.',
      },
      example: {
        title: { ru: 'Интеграция с 1С', en: 'Integration with 1C' },
        body: {
          ru: '1. В [Пользователях](/admin/users) создайте учётную запись «Интеграция 1С» без пароля и добавьте её в группу с доступом к нужному проекту задач.\n2. В **API и интеграции → Новый токен** выберите её в «Работает от имени», шаблон **Интеграция с задачами**.\n3. В «Только выбранные ресурсы» отметьте проект «Бухгалтерия», в «Разрешённые IP-адреса» — адрес сервера 1С, срок — 1 год.\n4. Скопируйте токен и передайте программисту 1С через защищённый канал.\n\n1С создаёт задачи только в «Бухгалтерии», только со своего сервера, а в журнале видно каждое обращение.',
          en: '1. In [Users](/admin/users) create a “1C integration” account without a password and add it to a group with access to the right task project.\n2. In **API & integrations → New token** choose it under “Acts on behalf of”, template **Task integration**.\n3. Under “Only selected resources” tick the “Accounting” project, under “Allowed IP addresses” the 1C server, expiry 1 year.\n4. Copy the token and hand it to the 1C developer over a secure channel.\n\n1C creates tasks only in “Accounting”, only from its server, and every call is in the log.',
        },
      },
    },
    {
      id: 'templates',
      title: { ru: 'Шаблоны доступа', en: 'Access templates' },
      body: {
        ru: '**Шаблон** — именованный набор уровней по разделам и правил. Токен ссылается на шаблон и хранит только свои отличия от него. Поэтому изменение шаблона сразу меняет все токены на его основе.\n\nВстроенные шаблоны (их нельзя изменить, но можно **дублировать** и править копию):\n\n- **Только чтение** — читает всё, что видит владелец. Отчёты, BI, выгрузки.\n- **Полный доступ пользователя** — всё в модулях, без администрирования.\n- **Интеграция с задачами** — задачи и их чаты, чтение календаря и профиля.\n- **Синхронизация календаря** — создание и изменение событий.\n- **Чат-бот** — пишет в чаты, читает уведомления, никогда не удаляет сообщения.\n- **Синхронизация с кадрами** — создаёт и обновляет учётные записи и группы; удаление запрещено.\n- **Мониторинг и аудит** — события безопасности, настройки, дашборд — только чтение.\n- **Полный доступ** — все разделы, включая администрирование. Используйте осторожно.\n\nСвои шаблоны создаются на вкладке **Шаблоны доступа**: название, описание, цвет, значок, уровни и правила. Шаблон, который используют действующие токены, удалить нельзя.',
        en: 'A **template** is a named set of area levels and rules. A token refers to a template and stores only its own differences. Changing a template therefore changes every token built on it.\n\nBuilt-in templates (read-only, but you can **Duplicate** and edit the copy):\n\n- **Read only** — reads everything the owner sees. Reports, BI, exports.\n- **Full user access** — everything in modules, no administration.\n- **Task integration** — tasks and their chats, read calendar and profile.\n- **Calendar sync** — creates and changes events.\n- **Chat bot** — posts to chats, reads notifications, never deletes messages.\n- **HR directory sync** — creates and updates accounts and groups; deleting is denied.\n- **Monitoring and audit** — security events, settings, dashboard — read only.\n- **Full access** — every area including administration. Use with care.\n\nYour own templates are made on the **Access templates** tab: name, description, color, icon, levels and rules. A template used by active tokens cannot be deleted.',
      },
    },
    {
      id: 'scopes',
      title: { ru: 'Точная настройка по разделам', en: 'Fine-tuning by area' },
      body: {
        ru: 'API поделён на **разделы**: Профиль, Уведомления, по одному на каждый модуль (Задачи, Чат, Календарь, Файлы, База знаний, Контрагенты…) и три административных — Пользователи и группы, Безопасность, Настройки портала. Для каждого раздела токену задаётся уровень:\n\n- **Нет доступа**;\n- **Чтение** — только получать данные;\n- **Чтение и запись** — создавать, менять и удалять.\n\nУровни из шаблона можно поменять для конкретного токена — изменённые отмечаются «изменено», а «Вернуть как в шаблоне» откатывает отличие. Справа в блоке **Итоговый доступ** видно, что получилось.',
        en: 'The API is split into **areas**: Profile, Notifications, one per module (Tasks, Chat, Calendar, Files, Knowledge base, Counterparties…) and three admin ones — Users and groups, Security, Portal settings. Each area gets a level on the token:\n\n- **No access**;\n- **Read** — fetch data only;\n- **Read & write** — create, change and delete.\n\nTemplate levels can be changed for one token — changes are marked “changed”, and “Reset to template” undoes one. The **Effective access** panel on the right shows the result.',
      },
      note: {
        ru: 'Уровень раздела не расширяет права владельца: токен с «Чтение и запись» в Задачах всё равно не изменит проект, в котором у владельца только просмотр.',
        en: 'An area level never extends the owner’s rights: a token with “Read & write” on Tasks still can’t change a project where the owner can only view.',
      },
    },
    {
      id: 'resources',
      title: { ru: 'Только выбранные ресурсы', en: 'Only selected resources' },
      body: {
        ru: 'Токен (и вебхук) можно сузить до отдельных:\n\n- **проектов задач** — в том числе «Без проекта (TSK)»;\n- **календарей**;\n- **пространств файлов** — только общих; до личных файлов владельца такой токен не дотянется.\n\nОграничение учитывает каждый вызов модуля: списки, поиск, карточки, создание, виджеты дашборда, чат задачи. Суженный токен никогда не получает обхода администратора модуля, даже если у владельца есть такое право.',
        en: 'A token (and a webhook) can be narrowed to specific:\n\n- **task projects** — including “No project (TSK)”;\n- **calendars**;\n- **file spaces** — shared ones only; such a token can’t reach the owner’s personal files.\n\nThe limit applies to every module call: lists, search, cards, creation, dashboard widgets, the task chat. A narrowed token never gets a module administrator’s bypass, even if the owner holds that right.',
      },
      example: {
        title: { ru: 'Бронирование переговорных', en: 'Meeting room booking' },
        body: {
          ru: 'Сайт бронирования должен создавать встречи в календаре «Переговорная 1» и больше нигде. Токен: шаблон **Синхронизация календаря**, в «Только выбранные ресурсы» → Календари отмечен только «Переговорная 1». Попытка тронуть другой календарь вернёт ошибку `TOKEN_LIMITED`.',
          en: 'A booking site must create meetings in the “Room 1” calendar and nowhere else. Token: template **Calendar sync**, “Only selected resources” → Calendars with only “Room 1” ticked. Touching any other calendar returns `TOKEN_LIMITED`.',
        },
      },
    },
    {
      id: 'rules',
      title: { ru: 'Точечные правила', en: 'Precise rules' },
      body: {
        ru: 'Правило разрешает или запрещает конкретный путь API. Оно состоит из действия (**Разрешить** / **Запретить**), методов (пусто — любой) и пути от `/api/v1`, где `*` — один сегмент пути, `**` — весь остаток.\n\nПорядок проверки:\n\n1. Путь, недоступный токенам никогда, — отказ.\n2. Подходит правило **Запретить** — отказ. Запрет всегда сильнее.\n3. Подходит правило **Разрешить** — проходит, даже если раздел закрыт.\n4. Иначе решает уровень раздела.\n5. Затем внутри модуля действуют права владельца и ограничения ресурсами.\n\nПримеры:\n\n- Запретить `DELETE /app/**` — токен никогда ничего не удаляет.\n- Разрешить `POST /app/chat/rooms/*/messages` — можно писать сообщения, хотя раздел Чат только на чтение.',
        en: 'A rule allows or denies one API path. It has an effect (**Allow** / **Deny**), methods (empty = any) and a path relative to `/api/v1`, where `*` is one path segment and `**` the rest of the path.\n\nCheck order:\n\n1. A path never available to tokens — denied.\n2. A **Deny** rule matches — denied. Deny always wins.\n3. An **Allow** rule matches — passes, even if the area is closed.\n4. Otherwise the area level decides.\n5. Then the owner’s rights and resource limits apply inside the module.\n\nExamples:\n\n- Deny `DELETE /app/**` — the token never deletes anything.\n- Allow `POST /app/chat/rooms/*/messages` — posting is allowed while the Chat area is read-only.',
      },
      example: {
        title: { ru: 'Бот в рабочий чат', en: 'A bot in the team chat' },
        body: {
          ru: 'Бот мониторинга пишет в канал «Дежурство». Создайте учётную запись «Бот мониторинга», добавьте её в этот чат, выпустите токен с шаблоном **Чат-бот** — он уже содержит правило «Запретить `DELETE /app/chat/**`». Бот отправляет сообщения, но не может удалить чужие или свои. В «Проверить запрос» введите `POST /app/chat/rooms/12/messages` — увидите «Разрешено».',
          en: 'A monitoring bot posts to the “On-call” chat. Create a “Monitoring bot” account, add it to that chat and issue a token with the **Chat bot** template — it already contains “Deny `DELETE /app/chat/**`”. The bot sends messages but can’t delete anyone’s, including its own. Type `POST /app/chat/rooms/12/messages` in “Check a request” to see “Allowed”.',
        },
      },
    },
    {
      id: 'limits',
      title: { ru: 'IP-адреса, срок и лимит запросов', en: 'IP addresses, expiry and rate limit' },
      body: {
        ru: '- **Разрешённые IP-адреса** — адреса или сети IPv4 (`10.0.0.0/8`). С других адресов токен получает отказ. Пусто — откуда угодно.\n- **Срок действия** — 30 дней, 90 дней, 1 год, своя дата или бессрочно. Токен перестаёт работать в конце указанного дня. Если в настройках задан максимальный срок, бессрочный токен выпустить нельзя.\n- **Лимит запросов** — сколько запросов в минуту допускается этому токену. Пусто — значение портала (по умолчанию 120). При превышении интеграция получает ответ «подождите» с временем ожидания.',
        en: '- **Allowed IP addresses** — addresses or IPv4 networks (`10.0.0.0/8`). From other addresses the token is refused. Empty = from anywhere.\n- **Expiry** — 30 days, 90 days, 1 year, a date or never. The token stops working at the end of that day. If settings define a maximum lifetime, “never” is unavailable.\n- **Rate limit** — requests per minute for this token. Empty = the portal default (120). Over the limit the integration is told to wait and for how long.',
      },
    },
    {
      id: 'log',
      title: { ru: 'Обзор и журнал запросов', en: 'Overview and request log' },
      body: {
        ru: 'Вкладка **Обзор** показывает активные токены, число запросов и ошибок за 24 часа, задержку, график трафика, самые нагруженные эндпоинты и активные токены, а также блок **Требует внимания**: токены, истекающие в течение 7 дней, токены без запросов 30 дней и вебхуки, которые не доставляются.\n\nВкладка **Журнал запросов** — каждый вызов по токену: время, токен, владелец, метод, путь, раздел, результат, код ошибки, длительность и IP. Фильтры: токен, результат (успешные / ошибки), метод, раздел, часть пути. Записи хранятся столько дней, сколько указано в настройках (по умолчанию 30).\n\nЛюди видят журнал своих токенов на странице «API-токены» в кабинете.',
        en: 'The **Overview** tab shows active tokens, requests and errors for 24 hours, latency, a traffic chart, the busiest endpoints and tokens, plus **Needs attention**: tokens expiring within 7 days, tokens idle for 30 days and webhooks that fail to deliver.\n\nThe **Request log** tab lists every token call: time, token, owner, method, path, area, result, error code, duration and IP. Filters: token, result (successful / errors), method, area, part of the path. Entries are kept for the days set in settings (30 by default).\n\nPeople see the log of their own tokens on the API tokens page in their cabinet.',
      },
      note: {
        ru: 'Частые ошибки в журнале: `SCOPE_DENIED` — токену не хватает уровня раздела или мешает правило; `FORBIDDEN` — у владельца нет прав; `TOKEN_EXPIRED` — истёк срок; `IP_NOT_ALLOWED` — запрос не с того адреса.',
        en: 'Common log errors: `SCOPE_DENIED` — the token lacks the area level or a rule blocks it; `FORBIDDEN` — the owner has no right; `TOKEN_EXPIRED` — expired; `IP_NOT_ALLOWED` — wrong source address.',
      },
    },
    {
      id: 'webhooks',
      title: { ru: 'Вебхуки', en: 'Webhooks' },
      body: {
        ru: '**Вебхук** — адрес во внешней системе, который портал вызывает, когда что-то происходит. Настраивается на вкладке **Вебхуки**:\n\n- **Название** и **Адрес** — получает POST-запросы с JSON.\n- **События** — отдельные или группой: задачи (создана, изменена, завершена, удалена, комментарий, результат, скоро срок, просрочена), сообщение в чате, события календаря, пользователи (создан, изменён, удалён).\n- **Видит как** — человек, глазами которого вебхук смотрит на портал: приходят только события о том, что этот человек может видеть.\n- **Только выбранные ресурсы** — те же ограничения по проектам и календарям, что у токенов.\n\nИнструменты: **Отправить тест** сразу показывает ответ получателя; у каждой доставки видны тело запроса, ответ и попытки; **Отправить ещё раз** повторяет доставку.\n\nПри сбое портал повторяет доставку через 1 мин, 5 мин, 30 мин, 2 ч и 6 ч. После 20 неудачных доставок подряд вебхук отключается сам — это видно в «Требует внимания».',
        en: 'A **webhook** is an address in an external system that the portal calls when something happens. It is set up on the **Webhooks** tab:\n\n- **Name** and **URL** — receives POST requests with JSON.\n- **Events** — single or a whole group: tasks (created, updated, completed, deleted, comment, result, due soon, overdue), chat message, calendar events, users (created, updated, deleted).\n- **Sees as** — the person through whose eyes the webhook sees the portal: only events about things this person may see are sent.\n- **Only selected resources** — the same project and calendar limits as tokens.\n\nTools: **Send a test** shows the receiver’s answer at once; every delivery shows its payload, response and attempts; **Send again** repeats a delivery.\n\nOn failure the portal retries after 1 min, 5 min, 30 min, 2 h and 6 h. After 20 failed deliveries in a row the webhook switches itself off — you’ll see it under “Needs attention”.',
      },
      example: {
        title: { ru: 'Синхронизация с кадровой системой', en: 'Sync with the HR system' },
        body: {
          ru: 'Кадровая система ведёт сотрудников и должна создавать их в портале. Токен от имени учётной записи «Кадры» с правом управлять пользователями, шаблон **Синхронизация с кадрами** — создавать и обновлять можно, удалять нельзя. А чтобы кадровая система знала о ручных правках в портале, добавьте вебхук на события «Пользователь создан / изменён», «Видит как» — та же учётная запись «Кадры».',
          en: 'The HR system owns the staff list and must create people in the portal. Token on behalf of an “HR” account with the right to manage users, template **HR directory sync** — create and update allowed, delete denied. To let the HR system know about manual edits in the portal, add a webhook for “User created / updated” with “Sees as” set to the same “HR” account.',
        },
      },
      note: {
        ru: 'Событие может прийти дважды (повтор после тайм-аута). Получатель должен узнавать уже обработанные события по полю `id`.',
        en: 'An event may arrive twice (a retry after a timeout). The receiver should recognise processed events by their `id`.',
      },
    },
    {
      id: 'signature',
      title: { ru: 'Подпись вебхуков и внутренняя сеть', en: 'Webhook signatures and private networks' },
      body: {
        ru: 'При создании вебхука портал один раз показывает **секрет подписи** (`whsec_…`). Каждый вызов несёт заголовок `X-Portal-Signature` с подписью тела запроса этим секретом. Получатель проверяет подпись и отбрасывает всё, что пришло не от портала. Готовый код проверки на Node.js, Python и PHP есть на портале разработчика.\n\n**Новый секрет** выпускает другой ключ — сразу обновите его у получателя.\n\nПо умолчанию вебхуки на адреса внутренней сети (10.x, 172.16–31.x, 192.168.x, localhost) запрещены — это защищает внутренние сервисы. Если получатель внутри вашей сети, включите **Адреса внутренней сети** в настройках API.',
        en: 'When a webhook is created, the portal shows its **signing secret** (`whsec_…`) once. Every call carries an `X-Portal-Signature` header signing the body with that secret. The receiver checks the signature and drops anything that didn’t come from the portal. Ready-made verification code for Node.js, Python and PHP is on the developer portal.\n\n**New secret** issues a different key — update it on the receiver right away.\n\nBy default webhooks to private network addresses (10.x, 172.16–31.x, 192.168.x, localhost) are refused, to protect internal services. If the receiver is inside your network, turn on **Private network addresses** in API settings.',
      },
    },
    {
      id: 'developers',
      title: { ru: 'Портал разработчика и OpenAPI', en: 'Developer portal and OpenAPI' },
      body: {
        ru: 'Отдайте программистам ссылку [/developers](/developers). Там:\n\n- **Руководство** — быстрый старт, аутентификация, доступ и шаблоны, ошибки, лимиты, вебхуки и проверка подписи;\n- **Справочник API** — все эндпоинты портала с параметрами и примерами на cURL, JavaScript, Python и PHP, поиск по ⌘K / Ctrl+K;\n- **Попробовать** — живой вызов прямо из браузера по вставленному токену или вашей сессии;\n- **OpenAPI** — файл описания для импорта в Postman, Insomnia или генератор кода.\n\nСправочник собирается из работающего портала, поэтому эндпоинты новых модулей появляются в нём сами. По умолчанию документация доступна только вошедшим; настройка **Публичная документация** открывает её по ссылке для всех.',
        en: 'Give developers the link [/developers](/developers). It has:\n\n- **Guide** — quick start, authentication, access and templates, errors, limits, webhooks and signature checks;\n- **API reference** — every endpoint with parameters and examples in cURL, JavaScript, Python and PHP, search with ⌘K / Ctrl+K;\n- **Try it** — a live call from the browser with a pasted token or your own session;\n- **OpenAPI** — a description file to import into Postman, Insomnia or a code generator.\n\nThe reference is built from the running portal, so new modules’ endpoints appear on their own. By default only signed-in people can read it; **Public documentation** opens it to anyone with the link.',
      },
      note: {
        ru: 'Консоль «Попробовать» по-настоящему меняет данные. Вставленный токен хранится только в этой вкладке браузера.',
        en: 'The “Try it” console really changes data. A pasted token is kept only in that browser tab.',
      },
    },
    {
      id: 'security',
      title: { ru: 'Безопасность и настройки API', en: 'Security and API settings' },
      body: {
        ru: 'Вкладка **Настройки**:\n\n- **API включён** — выключите, и любой запрос с токеном получит отказ; сам портал продолжит работать. Аварийный рубильник при утечке.\n- **Личные токены** — разрешить людям с правом «Личные API-токены» создавать токены себе.\n- **Максимальный срок токена** — в днях, 0 — без ограничения.\n- **Лимит по умолчанию** — запросов в минуту для токенов без своего лимита (120).\n- **Хранить журнал запросов** — дней (30).\n- **Публичная документация**, **Вебхуки**, **Адреса внутренней сети**.\n\nПравила хорошего тона:\n\n- храните токены в переменных окружения или хранилище секретов, никогда в коде сайта или в репозитории;\n- выдавайте самый узкий шаблон, ограничивайте ресурсами, IP и сроком;\n- при подозрении на утечку сразу **отзовите** токен или выпустите **Новый секрет** — это действует в течение нескольких секунд.',
        en: 'The **Settings** tab:\n\n- **API is on** — turn it off and every token request is refused; the portal itself keeps working. An emergency switch for leaks.\n- **Personal tokens** — let people with “Personal API tokens” create their own.\n- **Longest token lifetime** — in days, 0 = no limit.\n- **Default rate limit** — requests per minute for tokens without their own limit (120).\n- **Keep the request log** — days (30).\n- **Public documentation**, **Webhooks**, **Private network addresses**.\n\nGood practice:\n\n- keep tokens in environment variables or a secret store, never in website code or a repository;\n- give the narrowest template, limit by resources, IP and expiry;\n- if you suspect a leak, **revoke** the token or issue a **New secret** at once — it takes effect within seconds.',
      },
      note: {
        ru: 'Права «Личные API-токены» и «Администрирование API» не входят ни в одну встроенную роль, кроме суперадминистратора. Выдайте их через свою роль в [Ролях](/admin/roles).',
        en: 'The “Personal API tokens” and “API administration” permissions are in no built-in role except super administrator. Grant them through a role in [Roles](/admin/roles).',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Я потерял токен. Можно его посмотреть?', en: 'I lost my token. Can I see it again?' },
      a: {
        ru: 'Нет, портал хранит только отпечаток. Нажмите «Новый секрет» — получите новый токен с теми же настройками, а старый сразу перестанет работать.',
        en: 'No, the portal keeps only a fingerprint. Press “New secret” to get a new token with the same settings; the old one stops working at once.',
      },
    },
    {
      q: { ru: 'Интеграция получает SCOPE_DENIED. Что проверить?', en: 'The integration gets SCOPE_DENIED. What should I check?' },
      a: {
        ru: 'Откройте токен и введите метод и путь в «Проверить запрос»: панель покажет, какой уровень раздела нужен или какое правило мешает. Ошибка FORBIDDEN означает, что нужного права нет уже у владельца токена.',
        en: 'Open the token and enter the method and path in “Check a request”: it shows which area level is needed or which rule blocks it. FORBIDDEN means the token’s owner lacks the right.',
      },
    },
    {
      q: { ru: 'Сотрудник, создавший токен, уволился. Интеграция сломается?', en: 'The employee who created the token has left. Will the integration break?' },
      a: {
        ru: 'Да: после отключения учётной записи её токены отвечают ошибкой OWNER_INACTIVE. Поэтому для интеграций используйте технические учётные записи и токены от их имени.',
        en: 'Yes: once the account is disabled its tokens answer OWNER_INACTIVE. That’s why integrations should use technical accounts and tokens on their behalf.',
      },
    },
    {
      q: { ru: 'Почему вебхук не получает некоторые события?', en: 'Why doesn’t the webhook receive some events?' },
      a: {
        ru: 'Вебхук получает только то, что видит человек из поля «Видит как», и только по выбранным ресурсам. Если события о закрытом проекте не приходят — добавьте этого человека в проект или выберите другого.',
        en: 'The webhook only receives what the “Sees as” person can see, and only for the selected resources. If events about a private project don’t arrive, add that person to the project or choose someone else.',
      },
    },
    {
      q: { ru: 'Вебхук отключился сам. Что случилось?', en: 'The webhook switched itself off. Why?' },
      a: {
        ru: 'После 20 неудачных доставок подряд вебхук отключается. Посмотрите ответ получателя в списке доставок, исправьте причину, включите вебхук и нажмите «Отправить тест».',
        en: 'After 20 failed deliveries in a row the webhook turns off. Check the receiver’s answers in the delivery list, fix the cause, turn the webhook back on and press “Send a test”.',
      },
    },
    {
      q: { ru: 'Вебхук на внутренний сервер не создаётся', en: 'A webhook to an internal server is refused' },
      a: {
        ru: 'Адреса внутренней сети по умолчанию запрещены. Включите «Адреса внутренней сети» на вкладке «Настройки» API.',
        en: 'Private network addresses are refused by default. Turn on “Private network addresses” on the API Settings tab.',
      },
    },
    {
      q: { ru: 'Как срочно остановить все интеграции?', en: 'How do I stop all integrations at once?' },
      a: {
        ru: 'Выключите «API включён» в настройках API: все запросы по токенам получат отказ, а люди продолжат работать в портале как обычно.',
        en: 'Turn off “API is on” in API settings: every token request is refused, while people keep using the portal as usual.',
      },
    },
  ],
  fields: {
    owner: {
      title: { ru: 'Работает от имени', en: 'Acts on behalf of' },
      text: {
        ru: 'Токен получает права этого человека и никогда больше. Для интеграций выбирайте отдельную техническую учётную запись, а не сотрудника.',
        en: 'The token gets this person’s rights and never more. For integrations pick a dedicated technical account, not an employee.',
      },
      more: 'owners',
    },
    template: {
      title: { ru: 'Шаблон доступа', en: 'Access template' },
      text: {
        ru: 'Готовый набор уровней и правил. Токен хранит только свои отличия, поэтому изменение шаблона меняет все токены на его основе.',
        en: 'A ready set of levels and rules. The token stores only its differences, so changing the template changes every token based on it.',
      },
      more: 'templates',
    },
    scopes: {
      title: { ru: 'Разделы', en: 'Areas' },
      text: {
        ru: '«Чтение» — только получать данные, «Чтение и запись» — также создавать, менять и удалять. Права владельца всё равно учитываются.',
        en: '“Read” fetches data only, “Read & write” also creates, changes and deletes. The owner’s own rights still apply.',
      },
      more: 'scopes',
    },
    resources: {
      title: { ru: 'Только выбранные ресурсы', en: 'Only selected resources' },
      text: {
        ru: 'Ограничьте токен отдельными проектами задач, календарями или общими пространствами файлов — остальное он не увидит.',
        en: 'Limit the token to specific task projects, calendars or shared file spaces — it won’t see anything else.',
      },
      more: 'resources',
    },
    rules: {
      title: { ru: 'Точечные правила', en: 'Precise rules' },
      text: {
        ru: 'Запрет всегда сильнее разрешения. `*` — один сегмент пути, `**` — остаток; пути пишутся от `/api/v1`, например `DELETE /app/**`.',
        en: 'Deny always beats allow. `*` is one path segment, `**` the rest; paths are relative to `/api/v1`, e.g. `DELETE /app/**`.',
      },
      more: 'rules',
    },
    ipAllow: {
      title: { ru: 'Разрешённые IP-адреса', en: 'Allowed IP addresses' },
      text: {
        ru: 'Укажите адрес сервера интеграции или сеть вида `10.0.0.0/8`. Даже украденный токен не сработает с чужого адреса.',
        en: 'Enter the integration server’s address or a network like `10.0.0.0/8`. Even a stolen token won’t work from elsewhere.',
      },
      more: 'limits',
    },
    expiry: {
      title: { ru: 'Срок действия', en: 'Expiry' },
      text: {
        ru: 'Токен перестаёт работать в конце выбранного дня. Для интеграций разумно 1 год с напоминанием о продлении.',
        en: 'The token stops working at the end of the chosen day. One year with a renewal reminder suits most integrations.',
      },
      more: 'limits',
    },
    rateLimit: {
      title: { ru: 'Лимит запросов', en: 'Rate limit' },
      text: {
        ru: 'Запросов в минуту для этого токена. Пусто — значение портала из настроек API.',
        en: 'Requests per minute for this token. Empty = the portal default from API settings.',
      },
      more: 'limits',
    },
    runAs: {
      title: { ru: 'Видит как', en: 'Sees as' },
      text: {
        ru: 'Вебхук получает только события о том, что может видеть этот человек: задачи его проектов, его чаты и календари.',
        en: 'The webhook receives only events about what this person can see: their projects’ tasks, their chats and calendars.',
      },
      more: 'webhooks',
    },
    privateNetwork: {
      title: { ru: 'Адреса внутренней сети', en: 'Private network addresses' },
      text: {
        ru: 'Разрешает вебхуки на 10.x, 172.16–31.x, 192.168.x и localhost. Включайте, только если получатель действительно внутри вашей сети.',
        en: 'Allows webhooks to 10.x, 172.16–31.x, 192.168.x and localhost. Turn on only if the receiver really is inside your network.',
      },
      more: 'signature',
    },
    personalTokens: {
      title: { ru: 'Личные токены', en: 'Personal tokens' },
      text: {
        ru: 'Люди с правом «Личные API-токены» сами создают токены в своём кабинете. Выключите, чтобы токены выпускал только администратор.',
        en: 'People with “Personal API tokens” create their own tokens in the cabinet. Turn off so only administrators issue tokens.',
      },
      more: 'owners',
    },
  },
  related: ['admin', 'account'],
};
