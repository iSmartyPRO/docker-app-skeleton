export default {
  id: 'admin',
  icon: 'shield',
  title: { ru: 'Администрирование', en: 'Administration' },
  tagline: {
    ru: 'Люди, доступ, безопасность и настройки портала в одной консоли',
    en: 'People, access, security and portal settings in one console',
  },
  summary: {
    ru: 'Консоль администратора открывается по адресу [/admin](/admin). Здесь заводят и блокируют учётные записи, собирают людей в группы, решают через роли, кто что может, следят за журналом безопасности и настраивают портал: оформление, способы входа, интеграции и модули.',
    en: 'The admin console lives at [/admin](/admin). Here you create and block accounts, put people into groups, decide through roles who may do what, watch the security log and configure the portal: branding, sign-in methods, integrations and modules.',
  },
  highlights: [
    {
      icon: '👥',
      title: { ru: 'Группы → роли → права', en: 'Groups → roles → permissions' },
      text: {
        ru: 'Человек получает права через группы своего отдела, а роли напрямую нужны только для исключений.',
        en: 'People get permissions through their department’s groups; direct roles are only for exceptions.',
      },
    },
    {
      icon: '🔐',
      title: { ru: 'Гибкий вход', en: 'Flexible sign-in' },
      text: {
        ru: 'Пароль, Active Directory, Google, Telegram и одноразовые коды в WhatsApp, на почту, в Telegram или Mattermost.',
        en: 'Password, Active Directory, Google, Telegram and one-time codes via WhatsApp, email, Telegram or Mattermost.',
      },
    },
    {
      icon: '🛡️',
      title: { ru: 'Защита от ошибок', en: 'Safety rails' },
      text: {
        ru: 'Нельзя выдать больше прав, чем есть у вас, отключить самого себя или остаться без суперадминистратора.',
        en: 'You cannot grant more than you hold, lock yourself out or remove the last super administrator.',
      },
    },
    {
      icon: '📜',
      title: { ru: 'Журнал безопасности', en: 'Security log' },
      text: {
        ru: 'Неудачные входы, блокировки и отказы по IP за 90 дней с адресом и подробностями.',
        en: 'Failed sign-ins, lockouts and IP denials for 90 days, with address and details.',
      },
    },
    {
      icon: '🎨',
      title: { ru: 'Оформление под компанию', en: 'Your company’s look' },
      text: {
        ru: 'Название, логотипы для светлой и тёмной темы, палитра, шрифты и иконки меню с живым превью.',
        en: 'Name, logos for light and dark themes, palette, fonts and menu icons with a live preview.',
      },
    },
    {
      icon: '🧩',
      title: { ru: 'Модули и интеграции', en: 'Modules and integrations' },
      text: {
        ru: 'Включайте только нужные приложения и подключайте почту, мессенджеры, Google и конвертацию документов.',
        en: 'Turn on only the apps you need and connect email, messengers, Google and document conversion.',
      },
    },
  ],
  tips: [
    {
      ru: 'Нажмите Ctrl+K (⌘K на Mac) в консоли, чтобы быстро перейти к любой странице или настройке.',
      en: 'Press Ctrl+K (⌘K on a Mac) in the console to jump to any page or setting.',
    },
    {
      ru: 'Выдавайте доступ через группы, а не человеку напрямую: при переводе в другой отдел достаточно сменить группу.',
      en: 'Grant access through groups, not to a person directly: when someone changes department, just change the group.',
    },
    {
      ru: 'Держите минимум двух суперадминистраторов — на случай отпуска или потерянного пароля.',
      en: 'Keep at least two super administrators in case of a holiday or a lost password.',
    },
    {
      ru: 'Перед включением белого списка IP нажмите «Разрешить мой IP», иначе портал не даст сохранить правило.',
      en: 'Before turning on the IP allow list, press “Allow my IP” — otherwise the portal will refuse the change.',
    },
    {
      ru: 'Кнопка «Проверить соединение» в интеграциях проверяет значения прямо из формы, даже несохранённые.',
      en: '“Test connection” in integrations checks the values in the form, even unsaved ones.',
    },
  ],
  sections: [
    {
      id: 'console',
      title: { ru: 'Как устроена консоль', en: 'How the console is organised' },
      body: {
        ru: 'В боковом меню консоли — несколько разделов:\n\n- **Обзор** — состояние портала одним взглядом.\n- **Пользователи**, **Группы**, **Роли** — люди и их доступ.\n- **Журнал** — события безопасности.\n- **API и интеграции** — токены и вебхуки для других систем (см. справку [API и интеграции](/help/api)).\n- **Настройки** — всё остальное, сгруппировано: Проект, Оформление, Безопасность, Интеграции, Модули, Система. Наверху есть поиск по настройкам.\n\nКаждый видит только те разделы, на которые у него есть права. С правом «Просмотр настроек» все экраны открываются, но поля недоступны для изменения.',
        en: 'The console’s sidebar has a few sections:\n\n- **Overview** — the portal’s state at a glance.\n- **Users**, **Groups**, **Roles** — people and their access.\n- **Activity** — security events.\n- **API & integrations** — tokens and webhooks for other systems (see [API and integrations](/help/api)).\n- **Settings** — everything else, grouped: Project, Appearance, Security, Integrations, Modules, System. There is a search box at the top.\n\nEveryone sees only the sections they have permissions for. With “View settings” every screen opens, but the fields are read-only.',
      },
      note: {
        ru: 'Изменённая форма показывает внизу панель «Сохранить / Отменить». Пока вы не нажали «Сохранить», ничего не применяется.',
        en: 'A changed form shows a Save / Discard bar at the bottom. Nothing is applied until you press Save.',
      },
    },
    {
      id: 'users',
      title: { ru: 'Пользователи: создание и профиль', en: 'Users: creating and editing' },
      body: {
        ru: 'В разделе [Пользователи](/admin/users) — все, кто может войти, с поиском по имени, логину и почте и фильтрами по роли, группе и статусу.\n\nПри создании укажите **логин** (3–32 символа: латиница, цифры, точка, подчёркивание, дефис), имя и, по желанию, почту, телефон и группы. Пароль необязателен: его не задают тем, кто входит через Active Directory, Google, Telegram или по коду.\n\nВ карточке пользователя есть блок **Контакты для входа**: телефон (для кодов в WhatsApp), почта, имя в Mattermost и привязанный Telegram. По этим данным портал узнаёт человека при входе по коду.',
        en: 'The [Users](/admin/users) page lists everyone who can sign in, with search by name, username and email and filters by role, group and status.\n\nWhen creating an account, enter a **username** (3–32 characters: Latin letters, digits, dot, underscore, hyphen), a name and optionally email, phone and groups. The password is optional: leave it empty for people who sign in through Active Directory, Google, Telegram or a code.\n\nThe user page has a **Sign-in contacts** block: phone (for WhatsApp codes), email, Mattermost username and linked Telegram. The portal uses these to recognise the person when they sign in with a code.',
      },
      steps: [
        { ru: 'Откройте «Пользователи» и нажмите «Новый пользователь».', en: 'Open Users and press “New user”.' },
        { ru: 'Заполните логин и имя, при необходимости — почту и телефон в международном формате.', en: 'Fill in the username and name, and if needed email and phone in international format.' },
        { ru: 'Выберите группы. Если не выбрать ни одной, человек попадёт в группу по умолчанию.', en: 'Choose groups. If you choose none, the person joins the default group.' },
        { ru: 'Задайте пароль (от 10 символов) или оставьте пустым для входа без пароля.', en: 'Set a password (10+ characters) or leave it empty for password-less sign-in.' },
      ],
      note: {
        ru: 'Почта должна быть уникальной: если один адрес указан у двух учётных записей, код на почту не придёт ни одной из них.',
        en: 'Email must be unique: if two accounts share an address, neither will receive email codes.',
      },
    },
    {
      id: 'user-access',
      title: { ru: 'Блокировка, сброс пароля и сессий', en: 'Blocking, password and session reset' },
      body: {
        ru: 'В карточке пользователя, в блоке **Доступ**, два переключателя:\n\n- **Активен** — выключите, чтобы учётная запись не могла войти совсем (например, человек уволился).\n- **В блоке** — человеку отказывается во входе даже с верным паролем. Удобно как временная мера, например при подозрении на взлом.\n\n**Сброс пароля**: введите новый пароль и сохраните — человек выйдет на всех устройствах. **Сессии → Выйти везде** завершает все входы сразу, не меняя пароль.\n\nЛюбое изменение доступа — групп, ролей, статуса — тоже завершает все сессии пользователя: при следующем действии он войдёт заново уже с новыми правами.',
        en: 'The **Access** block on the user page has two switches:\n\n- **Active** — turn it off so the account cannot sign in at all (e.g. the person has left).\n- **Blocked** — sign-in is refused even with the right password. Handy as a temporary measure, for example if you suspect the account was compromised.\n\n**Password reset**: enter a new password and save — the person is signed out everywhere. **Sessions → Sign out everywhere** ends every session at once without changing the password.\n\nAny access change — groups, roles, status — also ends the user’s sessions, so they sign in again with the new rights.',
      },
      example: {
        title: { ru: 'Сотрудник уволился', en: 'An employee has left' },
        body: {
          ru: 'Откройте его карточку, выключите **Активен** и сохраните — все его сессии на телефоне и ноутбуке завершатся сразу. Учётную запись не удаляйте: его задачи, сообщения и история останутся с правильным автором. Если у него были API-токены, они тоже перестанут работать.',
          en: 'Open their page, turn **Active** off and save — every session on their phone and laptop ends at once. Don’t delete the account: their tasks, messages and history keep the right author. Any API tokens they had stop working as well.',
        },
      },
      note: {
        ru: 'Свои роли, группы и статус изменить нельзя — попросите другого администратора. Учётную запись с бо́льшими правами, чем у вас, можно только просматривать.',
        en: 'You cannot change your own roles, groups or status — ask another administrator. An account with more rights than yours is read-only to you.',
      },
    },
    {
      id: 'groups',
      title: { ru: 'Группы', en: 'Groups' },
      body: {
        ru: '[Группы](/admin/groups) — это команды и отделы. Каждый участник группы автоматически получает все её **роли участников**. Человек может состоять в нескольких группах — права складываются.\n\nОдна группа — **по умолчанию**: в неё попадают новые учётные записи, созданные администратором без групп или созданные автоматически при входе через Active Directory, Google или Telegram. Группу по умолчанию нельзя удалить — сначала назначьте по умолчанию другую.\n\nПри входе через Active Directory людей можно добавлять в группы портала автоматически — см. раздел «Способы входа».',
        en: '[Groups](/admin/groups) are teams and departments. Every member automatically gets all of the group’s **member roles**. A person can be in several groups — permissions add up.\n\nOne group is the **default**: new accounts join it when an administrator creates them without groups, or when they are created automatically on first sign-in through Active Directory, Google or Telegram. The default group cannot be deleted — make another group the default first.\n\nWith Active Directory, people can be added to portal groups automatically on sign-in — see “Sign-in methods”.',
      },
      example: {
        title: { ru: 'Дать отделу продаж управление контрагентами', en: 'Let the sales team manage counterparties' },
        body: {
          ru: '1. В [Ролях](/admin/roles) создайте роль «Контрагенты — управление» и отметьте разрешение «Администратор контрагентов».\n2. В [Группах](/admin/groups) создайте группу «Отдел продаж» (или откройте существующую).\n3. В «Роли участников» отметьте новую роль, в «Участники» добавьте сотрудников.\n4. Сохраните. Новым продавцам теперь достаточно попасть в группу — права придут сами.\n\nСмотреть справочник контрагентов могут все сотрудники и без этой роли; она нужна, чтобы менять любые карточки и настраивать модуль.',
          en: '1. In [Roles](/admin/roles) create a role “Counterparties — manage” and tick “Counterparties admin”.\n2. In [Groups](/admin/groups) create a “Sales” group (or open the existing one).\n3. Tick the new role under “Member roles” and add the employees under “Members”.\n4. Save. New sales people now only need to join the group — the rights follow.\n\nEvery employee can view the counterparties directory without this role; it is needed to change any card and configure the module.',
        },
      },
      note: {
        ru: 'Роль, которой нет у вас самих, выдать группе нельзя — такие роли в списке недоступны.',
        en: 'You cannot give a group a role you don’t hold yourself — such roles are greyed out.',
      },
    },
    {
      id: 'roles',
      title: { ru: 'Роли и права', en: 'Roles and permissions' },
      body: {
        ru: '**Разрешение** — одно конкретное действие: «Вход в консоль», «Управление пользователями», «Способы входа» и т. д. Список разрешений фиксирован; модули добавляют свои (например, «Администратор базы знаний»).\n\n**Роль** — набор разрешений с понятным названием. Роль выдают группе (рекомендуется) или человеку напрямую. Итоговые права человека — сумма всех его ролей, прямых и через группы; их видно в карточке пользователя в строке **Итоговый доступ**.\n\nВстроенные роли:\n\n- **Суперадминистратор** — полный доступ ко всему; роль нельзя изменить или удалить.\n- **Администратор** — пользователи, группы, журнал, оформление, интеграции.\n- **Модератор** — помощь пользователям: профили, сброс паролей, блокировки, журнал.\n- **Аудитор** — только просмотр: пользователи, журнал, настройки.\n- **Пользователь** — только личный кабинет.\n\nРазрешения встроенных ролей можно менять — изменения сохраняются при обновлениях. Свои роли можно создавать и удалять.',
        en: 'A **permission** is one specific action: “Open the admin console”, “Manage users”, “Sign-in methods” and so on. The list is fixed; modules add their own (for example “Knowledge base admin”).\n\nA **role** is a named set of permissions. It is given to a group (recommended) or directly to a person. A person’s effective permissions are the sum of all their roles, direct and via groups; you see them on the user page under **Effective access**.\n\nBuilt-in roles:\n\n- **Super administrator** — everything; cannot be edited or deleted.\n- **Administrator** — users, groups, activity, branding, integrations.\n- **Moderator** — helps users: profiles, password resets, blocking, activity.\n- **Auditor** — read-only: users, activity, settings.\n- **User** — personal cabinet only.\n\nYou can change the permissions of built-in roles — the changes survive upgrades. Your own roles can be created and deleted.',
      },
      example: {
        title: { ru: 'Роль для внешнего аудитора', en: 'A role for an external auditor' },
        body: {
          ru: 'Создайте учётную запись проверяющего и добавьте его в группу «Аудиторы» (с ролью «Аудитор»). Он увидит пользователей, журнал и все настройки, но ничего не сможет изменить. По окончании проверки выключите **Активен**.',
          en: 'Create an account for the auditor and add it to the “Auditors” group (with the Auditor role). They see users, the activity log and every setting but cannot change anything. When the audit ends, turn **Active** off.',
        },
      },
      note: {
        ru: 'Правила безопасности: выдать или отнять можно только то, что есть у вас самих; администратор не может создать суперадминистратора; в системе всегда остаётся хотя бы один активный суперадминистратор — изменение, которое это нарушит, будет отклонено.',
        en: 'Safety rules: you can grant or remove only what you hold yourself; an administrator cannot create a super administrator; there is always at least one active super administrator — a change that would break this is refused.',
      },
    },
    {
      id: 'activity',
      title: { ru: 'Журнал безопасности', en: 'Security log' },
      body: {
        ru: 'В разделе [Журнал](/admin/activity) — события безопасности за 90 дней, а сверху счётчики за последние 24 часа. Типы событий:\n\n- **Неудачный вход** и **Блокировка входа** — подбор пароля или забывчивый сотрудник.\n- **Отключённый / Заблокированный аккаунт** — попытка входа в закрытую учётную запись.\n- **IP в чёрном списке** и **IP нет в белом списке** — отказы IP-фильтра.\n- **Лимит попыток входа** — слишком много попыток с одного адреса.\n- **Код для неизвестного контакта** и **Сбой доставки кода** — проблемы с кодами входа.\n\nФильтр «Тип события» оставляет только нужные записи. В каждой строке — время, логин, IP-адрес и подробности.',
        en: 'The [Activity](/admin/activity) page shows security events for 90 days, with 24-hour counters at the top. Event types:\n\n- **Failed login** and **Account lockout** — password guessing or a forgetful employee.\n- **Disabled / Blocked account** — a sign-in attempt on a closed account.\n- **IP on block-list** and **IP not on allow-list** — IP filter denials.\n- **Login rate limit** — too many attempts from one address.\n- **Code for unknown contact** and **Code delivery failed** — problems with sign-in codes.\n\nThe event type filter narrows the list. Each row has the time, username, IP address and details.',
      },
      example: {
        title: { ru: 'Кто-то подбирает пароль', en: 'Someone is guessing passwords' },
        body: {
          ru: 'В журнале десятки «Неудачных входов» с одного незнакомого IP под разными логинами. Скопируйте адрес, откройте **Настройки → IP-фильтрация** и добавьте его в чёрный список с причиной «подбор пароля». Чтобы узнавать о таком сразу, включите оповещения безопасности в интеграции Mattermost.',
          en: 'The log shows dozens of failed sign-ins from one unknown IP under different usernames. Copy the address, open **Settings → IP filtering** and add it to the block list with the reason “password guessing”. To hear about this immediately, turn on security alerts in the Mattermost integration.',
        },
      },
    },
    {
      id: 'branding',
      title: { ru: 'Оформление', en: 'Appearance' },
      body: {
        ru: 'Группы **Проект** и **Оформление** в настройках:\n\n- **Основное** — название и описание портала, логотип (SVG, PNG, JPG или WebP до 2 МБ), отдельный логотип для тёмной темы и высота логотипа в шапке.\n- **Цветовая схема** — шаблон палитры, тонкая настройка цветов (акцент, фон, текст, статусы) и тема по умолчанию для тех, кто не выбрал свою.\n- **Типографика** — одна из 28 шрифтовых систем, базовый размер и насыщенность заголовков.\n- **Иконки меню** — цветные плитки или монохромные глифы и иконка для каждого пункта меню.\n\nВсе изменения сразу видны вам как превью. Остальные увидят их только после того, как вы нажмёте «Применить» / «Сохранить».',
        en: 'The **Project** and **Appearance** settings groups:\n\n- **General** — portal name and description, logo (SVG, PNG, JPG or WebP up to 2 MB), a separate logo for the dark theme and the logo height in the header.\n- **Color theme** — palette template, fine-tuning of colors (accent, background, text, statuses) and the default theme for people who haven’t chosen one.\n- **Typography** — one of 28 font systems, base size and heading weight.\n- **Menu icons** — colored tiles or monochrome glyphs, and an icon for every menu item.\n\nEvery change shows to you as a live preview. Others see it only after you press Apply / Save.',
      },
      note: {
        ru: 'Если логотип тёмный, загрузите светлую версию «Для тёмной темы» — иначе в тёмной теме он сольётся с фоном.',
        en: 'If your logo is dark, upload a light version “For the dark theme” — otherwise it disappears on the dark background.',
      },
    },
    {
      id: 'signin',
      title: { ru: 'Способы входа', en: 'Sign-in methods' },
      body: {
        ru: 'Экран **Безопасность → Способы входа** решает, как люди входят в портал. На странице входа видны только способы, которые включены **и** чья интеграция настроена; рядом с каждым способом показано, готова ли интеграция, со ссылкой на её настройку.\n\n- **Логин и пароль** — классический вход. Если выключить, суперадминистраторы всё равно смогут войти по паролю — это аварийный вход.\n- **Google** — вход аккаунтом Google или Google Workspace, можно ограничить доменами компании.\n- **Active Directory / LDAP** — доменный логин и пароль. Можно создавать учётные записи автоматически и сопоставлять группы каталога с группами портала.\n- **Вход через Telegram** — одно нажатие; сначала человек привязывает Telegram в профиле.\n- **Одноразовые коды** — 6 цифр в WhatsApp, на почту, в Telegram или в Mattermost. Код живёт 5 минут, даётся 5 попыток.\n- **Ссылки для входа (magic link)** — вместо кода приходит ссылка в один клик, действует 15 минут.',
        en: 'The **Security → Sign-in methods** screen decides how people get in. The sign-in page shows only methods that are enabled **and** whose integration is configured; each method shows whether its integration is ready, with a link to set it up.\n\n- **Username and password** — the classic way. If you turn it off, super administrators can still use their password — a break-glass entrance.\n- **Google** — a Google or Google Workspace account, optionally limited to company domains.\n- **Active Directory / LDAP** — domain username and password. Accounts can be created automatically and directory groups mapped to portal groups.\n- **Telegram Login** — one tap; the person links Telegram in their profile first.\n- **One-time codes** — 6 digits via WhatsApp, email, Telegram or Mattermost. A code lives 5 minutes and allows 5 attempts.\n- **Sign-in links (magic link)** — a one-click link instead of a code, valid for 15 minutes.',
      },
      example: {
        title: { ru: 'Вход по доменной учётной записи', en: 'Sign-in with the domain account' },
        body: {
          ru: '1. **Интеграции → Active Directory**: адрес контроллера домена, служебная учётная запись и Base DN, «Проверить соединение».\n2. **Способы входа**: включите Active Directory и «Создавать учётные записи автоматически».\n3. В «Сопоставлении групп каталога» добавьте строки: `Sales` → «Отдел продаж», `Portal Admins` → «Администраторы».\n\nТеперь сотрудник входит доменным логином (`ivanov` или `ivanov@corp.local`), учётная запись создаётся сама, а при каждом входе он добавляется в группы портала по своим группам AD.',
          en: '1. **Integrations → Active Directory**: domain controller, service account and Base DN, then Test connection.\n2. **Sign-in methods**: enable Active Directory and “Create accounts automatically”.\n3. Under “Directory group mapping” add rows: `Sales` → “Sales”, `Portal Admins` → “Administrators”.\n\nEmployees now sign in with their domain login (`ivanov` or `ivanov@corp.local`), the account is created automatically, and on every sign-in they are added to portal groups according to their AD groups.',
        },
      },
      note: {
        ru: 'Автосоздание через Telegram создаёт учётную запись любому незнакомому пользователю Telegram — для закрытого корпоративного портала держите его выключенным.',
        en: 'Telegram auto-provisioning creates an account for any unknown Telegram user — keep it off for a closed corporate portal.',
      },
    },
    {
      id: 'site-access',
      title: { ru: 'Доступ к сайту', en: 'Site access' },
      body: {
        ru: 'Экран **Безопасность → Доступ к сайту**:\n\n- **Закрытый** режим — гости сразу видят форму входа, без входа ничего не показывается. Подходит для большинства корпоративных порталов.\n- **Открытый** режим — публичная главная страница видна всем, но личный кабинет, модули и консоль всё равно требуют входа.\n\nЗдесь же выбирается **Главная страница** — что открывается по адресу сайта: приветственная страница или один из включённых модулей (например, Дашборд или Онлайн-ресурсы).',
        en: 'The **Security → Site access** screen:\n\n- **Closed** mode — guests see the sign-in form straight away; nothing is shown without signing in. Right for most corporate portals.\n- **Open** mode — the public home page is visible to everyone, but the cabinet, modules and the console still require sign-in.\n\nThe same screen sets the **Home page** — what opens at the site’s address: the welcome page or one of the enabled modules (for example Dashboard or Online resources).',
      },
    },
    {
      id: 'login',
      title: { ru: 'Вход, блокировки и сессии', en: 'Sign-in, lockouts and sessions' },
      body: {
        ru: 'Экран **Безопасность → Вход и сессии**:\n\n- **Неудачных попыток до блокировки** (3–30, по умолчанию 8) и **Длительность блокировки** (5–180 минут, по умолчанию 15). Считаются отдельно для логина и для IP-адреса: подбор с одного адреса блокирует этот адрес, подбор одного логина с разных адресов — этот логин.\n- **Время жизни сессии** (1–90 дней, по умолчанию 7) — через сколько дней без повторного входа человека попросят войти снова. Применяется к новым входам.\n\nНеудачные попытки входа по коду тоже учитываются в блокировках и видны в журнале.',
        en: 'The **Security → Sign-in & sessions** screen:\n\n- **Failed attempts before lockout** (3–30, default 8) and **Lockout duration** (5–180 minutes, default 15). Counted separately per username and per IP address: guessing from one address locks that address; guessing one username from many addresses locks that username.\n- **Session lifetime** (1–90 days, default 7) — after how many days people must sign in again. Applies to new sign-ins.\n\nFailed code sign-ins also count towards lockouts and appear in the log.',
      },
      note: {
        ru: 'Блокировку логина может вызвать и злоумышленник, который знает чужой логин. Если сотрудник жалуется на блокировку, проверьте журнал — возможно, адрес атакующего стоит занести в чёрный список.',
        en: 'An attacker who knows someone’s username can trigger their lockout. If an employee complains about being locked out, check the log — the attacker’s address may belong on the block list.',
      },
    },
    {
      id: 'ip',
      title: { ru: 'IP-фильтрация', en: 'IP filtering' },
      body: {
        ru: 'Экран **Безопасность → IP-фильтрация** пускает или не пускает в портал по адресу:\n\n- **Чёрный список** — перечисленные адреса не допускаются. Чёрный список всегда главнее.\n- **Режим белого списка** — пускаются только перечисленные адреса, все остальные получают отказ.\n\nПравило — это один адрес (IPv4 или IPv6) или сеть IPv4 в формате CIDR, например `10.0.0.0/8` или `192.168.1.0/24`, с необязательной причиной. Адрес самого сервера разрешён всегда.\n\nПортал не даст сохранить изменение, после которого вы сами потеряете доступ: сначала добавьте свой адрес в белый список кнопкой **Разрешить мой IP**.',
        en: 'The **Security → IP filtering** screen lets people in or keeps them out by address:\n\n- **Block list** — listed addresses are refused. The block list always wins.\n- **Allow-list mode** — only listed addresses are let in; everyone else is refused.\n\nA rule is a single address (IPv4 or IPv6) or an IPv4 network in CIDR form, e.g. `10.0.0.0/8` or `192.168.1.0/24`, with an optional reason. The server’s own address is always allowed.\n\nThe portal refuses a change that would cut you off: first add your own address to the allow list with **Allow my IP**.',
      },
      example: {
        title: { ru: 'Пустить в портал только из офиса', en: 'Office-only access' },
        body: {
          ru: '1. Узнайте внешние адреса офисов и VPN у сетевого администратора, например `203.0.113.10` и сеть `198.51.100.0/24`.\n2. Добавьте их в белый список с причинами «Офис» и «VPN». Нажмите «Разрешить мой IP», если вы работаете не из офиса.\n3. Включите **Режим белого списка** и сохраните.\n\nСотрудники из дома теперь входят только через VPN.',
          en: '1. Get the external office and VPN addresses from your network administrator, e.g. `203.0.113.10` and the network `198.51.100.0/24`.\n2. Add them to the allow list with reasons “Office” and “VPN”. Press “Allow my IP” if you are not in the office.\n3. Turn on **Allow-list mode** and save.\n\nPeople working from home now get in only through the VPN.',
        },
      },
      note: {
        ru: 'Сети в формате CIDR поддерживаются только для IPv4; IPv6-адреса указываются точно.',
        en: 'CIDR networks are supported for IPv4 only; IPv6 addresses must be exact.',
      },
    },
    {
      id: 'integrations',
      title: { ru: 'Интеграции', en: 'Integrations' },
      body: {
        ru: 'Все интеграции выключены по умолчанию. У каждой есть переключатель «Включено», поля подключения и кнопка **Проверить соединение**. Пароли, токены и ключи хранятся только на сервере: после сохранения поле показывает «Сохранено — введите, чтобы заменить»; оставьте его пустым, чтобы не менять.\n\n- **Почта (SMTP)** — коды и ссылки входа, уведомления. Хост, порт, SSL/TLS (вкл. для порта 465, выкл. для 587), пользователь, пароль, отправитель.\n- **Telegram-бот** — вход через Telegram и коды в Telegram. Токен от @BotFather; имя бота заполнится после проверки. В @BotFather выполните `/setdomain` с адресом портала.\n- **WhatsApp Gateway** — ваш шлюз WhatsApp: адрес и API-ключ (один ключ = один номер-отправитель).\n- **Wazzup** — WhatsApp, Telegram, Instagram и другие каналы через один аккаунт. Введите API-ключ, загрузите каналы и выберите канал для каждого мессенджера.\n- **Mattermost** — коды входа личным сообщением от бота и оповещения безопасности в канал.\n- **Google** — вход через Google, Google Календарь для пользователей и отправка почты через Gmail.\n- **Конвертация документов** — адрес сервера Collabora / LibreOffice для просмотра Office-файлов в виде PDF.\n- **Active Directory** — контроллер домена, служебная учётная запись, Base DN.',
        en: 'All integrations are off by default. Each has an Enabled switch, connection fields and a **Test connection** button. Passwords, tokens and keys are kept on the server only: once saved, the field shows “Saved — type to replace”; leave it empty to keep the value.\n\n- **Email (SMTP)** — sign-in codes and links, notifications. Host, port, SSL/TLS (on for port 465, off for 587), user, password, sender.\n- **Telegram bot** — Telegram Login and codes in Telegram. Token from @BotFather; the bot name fills in after the test. Run `/setdomain` in @BotFather with the portal’s address.\n- **WhatsApp Gateway** — your WhatsApp gateway: address and API key (one key = one sender number).\n- **Wazzup** — WhatsApp, Telegram, Instagram and more through one account. Enter the API key, load channels and choose a channel per messenger.\n- **Mattermost** — sign-in codes as a direct message from a bot and security alerts to a channel.\n- **Google** — Google sign-in, Google Calendar for users and sending email through Gmail.\n- **Document conversion** — the Collabora / LibreOffice server address for viewing Office files as PDF.\n- **Active Directory** — domain controller, service account, Base DN.',
      },
      example: {
        title: { ru: 'Коды входа в WhatsApp с резервом', en: 'WhatsApp sign-in codes with a fallback' },
        body: {
          ru: '1. Настройте и проверьте **WhatsApp Gateway** и **Wazzup** (в Wazzup выберите канал для WhatsApp).\n2. В **Способах входа** включите «Код в WhatsApp», в «Отправлять через» выберите основной провайдер и включите резерв.\n3. Проверьте, что у сотрудников в профиле указан телефон в международном формате.\n\nЕсли основной провайдер не доставит код, он уйдёт через второй, а сбой появится в журнале как «Сбой доставки кода».',
          en: '1. Set up and test **WhatsApp Gateway** and **Wazzup** (pick a WhatsApp channel in Wazzup).\n2. In **Sign-in methods** turn on “Code in WhatsApp”, choose the main provider under “Send through” and turn on the fallback.\n3. Make sure employees have their phone in international format in the profile.\n\nIf the main provider fails, the code goes through the other one, and the failure shows in the log as “Code delivery failed”.',
        },
      },
    },
    {
      id: 'modules',
      title: { ru: 'Модули', en: 'Modules' },
      body: {
        ru: 'Модули — это приложения портала: Дашборд, Контрагенты, Онлайн-ресурсы, Файловый сервер, Файлы, База знаний, Задачи, Чат, Календарь. На экране **Модули** у каждого есть переключатель.\n\n- **Включённый** модуль появляется в меню приложений и в шапке.\n- **Выключенный** модуль исчезает отовсюду, его адреса и публичные ссылки отвечают «не найдено». **Данные сохраняются** — после включения всё вернётся.\n\nУ большинства модулей есть свои настройки (ссылка «Настройки» на карточке): например, ограничения загрузок, кто может менять карточки контрагентов или ключ DaData. Для этого нужно право «Модули».',
        en: 'Modules are the portal’s apps: Dashboard, Counterparties, Online resources, File server, Files, Knowledge base, Tasks, Chat, Calendar. The **Modules** screen has a switch for each.\n\n- An **enabled** module appears in the apps menu and the header.\n- A **disabled** module disappears everywhere; its addresses and public links answer “not found”. **Data is kept** — turning it back on restores everything.\n\nMost modules have their own settings (the Settings link on the card): upload limits, who may change counterparty cards, the DaData key and so on. This needs the “Modules” permission.',
      },
      note: {
        ru: 'Администрирование содержимого модуля — отдельные права в ролях: «Администратор базы знаний», «Администратор контрагентов» и т. п. Они не связаны с правом включать модули.',
        en: 'Managing a module’s content is a separate permission in roles: “Knowledge base admin”, “Counterparties admin” and so on. It is unrelated to turning modules on.',
      },
    },
    {
      id: 'system',
      title: { ru: 'Система и лимиты', en: 'System and limits' },
      body: {
        ru: 'Экран **Система** показывает версию портала, окружение, аптайм, часовой пояс и состояние базы данных — пригодится при обращении в поддержку.\n\nБлок **Лимит запросов к API** защищает портал от перегрузки:\n\n- **Гости: запросов с одного IP** — по умолчанию 300 за окно.\n- **Вошедшие: запросов на человека** — по умолчанию 5000; сотрудники одного офиса за общим IP не делят лимит между собой.\n- **Окно** — период подсчёта, по умолчанию 15 минут.\n\nЗагрузка страниц, просмотр файлов и вход не учитываются. Лимиты применяются сразу, изменение окна — после перезапуска сервера. Лимиты API-токенов настраиваются отдельно в разделе «API и интеграции».',
        en: 'The **System** screen shows the portal version, environment, uptime, time zone and database status — useful when contacting support.\n\nThe **API rate limit** block protects the portal from overload:\n\n- **Guests: requests per IP** — 300 per window by default.\n- **Signed-in: requests per person** — 5000 by default; colleagues behind one office IP don’t share a budget.\n- **Window** — the counting period, 15 minutes by default.\n\nPage loads, file views and sign-in are not counted. Limits apply at once; a new window applies after a server restart. API token limits are set separately under API & integrations.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Чем «Отключён» отличается от «В блоке»?', en: 'What’s the difference between Disabled and Blocked?' },
      a: {
        ru: 'Оба не дают войти и завершают сессии. «Активен: выкл.» — обычное состояние для ушедших сотрудников. «В блоке» — отметка о проблеме (подозрение на взлом, нарушение); такие попытки входа в журнале отмечаются отдельно.',
        en: 'Both prevent sign-in and end sessions. “Active: off” is the usual state for people who have left. “Blocked” flags a problem (suspected compromise, violation); such sign-in attempts are logged separately.',
      },
    },
    {
      q: { ru: 'Почему я не могу выдать роль или изменить пользователя?', en: 'Why can’t I grant a role or edit a user?' },
      a: {
        ru: 'Выдавать можно только те права, которые есть у вас самих, а учётные записи с бо́льшими правами доступны только для просмотра. Свои роли, группы и статус изменить тоже нельзя — попросите другого администратора.',
        en: 'You can grant only permissions you hold yourself, and accounts with more rights than yours are read-only. You also cannot change your own roles, groups or status — ask another administrator.',
      },
    },
    {
      q: { ru: 'Я включил белый список и не могу войти. Что делать?', en: 'I turned on the allow list and can’t get in. What now?' },
      a: {
        ru: 'Портал не даёт сохранить правило, отрезающее ваш текущий адрес, но если вы зашли из другой сети — попросите коллегу из разрешённой сети добавить ваш IP. С самого сервера (localhost) доступ есть всегда.',
        en: 'The portal refuses a rule that would cut off your current address, but if you come from another network, ask a colleague on an allowed network to add your IP. The server itself (localhost) is always allowed.',
      },
    },
    {
      q: { ru: 'Сотрудник не получает код входа. Где искать причину?', en: 'An employee doesn’t receive a sign-in code. Where do I look?' },
      a: {
        ru: 'Проверьте в его карточке телефон (международный формат), почту (не должна совпадать с чужой) или имя в Mattermost. Затем загляните в [Журнал](/admin/activity): «Код для неизвестного контакта» значит, что портал не нашёл человека по этим данным, «Сбой доставки кода» — что не сработала интеграция.',
        en: 'Check the phone (international format), email (must not be shared) or Mattermost username on their page. Then look at [Activity](/admin/activity): “Code for unknown contact” means the portal couldn’t match the person, “Code delivery failed” means the integration failed.',
      },
    },
    {
      q: { ru: 'Telegram пишет «Bot domain invalid»', en: 'Telegram says “Bot domain invalid”' },
      a: {
        ru: 'В @BotFather выполните команду `/setdomain`, выберите своего бота и укажите домен портала (например, `portal.company.ru`).',
        en: 'In @BotFather run `/setdomain`, choose your bot and enter the portal’s domain (for example `portal.company.com`).',
      },
    },
    {
      q: { ru: 'Пропадут ли данные, если выключить модуль?', en: 'Is data lost when a module is turned off?' },
      a: {
        ru: 'Нет. Модуль просто становится невидимым и недоступным. После повторного включения все данные и ссылки снова работают.',
        en: 'No. The module just becomes invisible and unreachable. Turn it back on and all data and links work again.',
      },
    },
    {
      q: { ru: 'Можно ли совсем отключить вход по паролю?', en: 'Can password sign-in be turned off completely?' },
      a: {
        ru: 'Для обычных пользователей — да. Суперадминистраторы сохраняют вход по паролю как аварийный, чтобы сбой Active Directory или мессенджера не закрыл портал для всех.',
        en: 'For regular users, yes. Super administrators keep password sign-in as a break-glass entrance, so a broken directory or messenger never locks everyone out.',
      },
    },
    {
      q: { ru: 'Как сделать нового сотрудника администратором?', en: 'How do I make someone an administrator?' },
      a: {
        ru: 'Добавьте его в группу «Администраторы» (или в любую группу с ролью «Администратор»). Суперадминистратора может назначить только суперадминистратор.',
        en: 'Add them to the “Administrators” group (or any group with the Administrator role). Only a super administrator can appoint another super administrator.',
      },
    },
  ],
  fields: {
    groups: {
      title: { ru: 'Группы', en: 'Groups' },
      text: {
        ru: 'Основной способ выдать доступ: человек получает все роли своих групп. При переводе в другой отдел достаточно сменить группу.',
        en: 'The main way to grant access: the person gets all roles of their groups. When they change department, just change the group.',
      },
      more: 'groups',
    },
    directRoles: {
      title: { ru: 'Роли напрямую', en: 'Direct roles' },
      text: {
        ru: 'Только для исключений — например, одному человеку нужен доступ, которого нет у его отдела. Права из прямых ролей и групп складываются.',
        en: 'For exceptions only — e.g. one person needs access their department doesn’t have. Direct roles and group roles add up.',
      },
      more: 'roles',
    },
    blocked: {
      title: { ru: 'Активен и В блоке', en: 'Active and Blocked' },
      text: {
        ru: 'Оба не пускают в портал и сразу завершают сессии. «Активен: выкл.» — для ушедших сотрудников, «В блоке» — при подозрении на взлом или нарушение.',
        en: 'Both keep the person out and end their sessions at once. “Active: off” is for people who left, “Blocked” for a suspected compromise or violation.',
      },
      more: 'user-access',
    },
    sessions: {
      title: { ru: 'Выйти везде', en: 'Sign out everywhere' },
      text: {
        ru: 'Завершает вход на всех устройствах пользователя, не меняя пароль. Сброс пароля и изменение доступа делают то же самое автоматически.',
        en: 'Ends the user’s sessions on every device without changing the password. A password reset or access change does this automatically.',
      },
      more: 'user-access',
    },
    defaultGroup: {
      title: { ru: 'Группа по умолчанию', en: 'Default group' },
      text: {
        ru: 'Сюда попадают новые учётные записи без явных групп — созданные вручную или автоматически при входе через AD, Google или Telegram. Дайте ей минимальные права.',
        en: 'New accounts without explicit groups land here — created manually or automatically via AD, Google or Telegram. Give it minimal rights.',
      },
      more: 'groups',
    },
    groupRoles: {
      title: { ru: 'Роли участников', en: 'Member roles' },
      text: {
        ru: 'Каждый участник группы получает все отмеченные роли. Роли, которых нет у вас самих, выдать нельзя.',
        en: 'Every member gets all ticked roles. You cannot give roles you don’t hold yourself.',
      },
      more: 'groups',
    },
    permissions: {
      title: { ru: 'Разрешения', en: 'Permissions' },
      text: {
        ru: 'Каждая строка — одно действие. Роль даёт сумму отмеченных разрешений; недоступные строки — права, которых нет у вас.',
        en: 'Each row is one action. A role grants the sum of ticked permissions; locked rows are permissions you don’t hold.',
      },
      more: 'roles',
    },
    accessMode: {
      title: { ru: 'Режим доступа', en: 'Access mode' },
      text: {
        ru: '«Закрытый» — гости видят только форму входа. «Открытый» — гостям видна главная страница, остальное всё равно требует входа.',
        en: '“Closed” — guests see only the sign-in form. “Open” — guests see the home page; everything else still needs sign-in.',
      },
      more: 'site-access',
    },
    lockout: {
      title: { ru: 'Защита от подбора', en: 'Brute-force protection' },
      text: {
        ru: 'После заданного числа неудачных попыток подряд логин или IP-адрес блокируется на указанное время. Логин и IP считаются отдельно.',
        en: 'After the set number of failed attempts in a row, the username or IP address is locked for the given time. Usernames and IPs are counted separately.',
      },
      more: 'login',
    },
    sessionDays: {
      title: { ru: 'Время жизни сессии', en: 'Session lifetime' },
      text: {
        ru: 'Через сколько дней после входа человеку придётся войти снова. Действует для новых входов.',
        en: 'How many days after sign-in a person has to sign in again. Applies to new sign-ins.',
      },
      more: 'login',
    },
    whitelist: {
      title: { ru: 'Режим белого списка', en: 'Allow-list mode' },
      text: {
        ru: 'Пускает только адреса из белого списка. Сначала добавьте свой адрес кнопкой «Разрешить мой IP» — иначе включить не получится.',
        en: 'Lets in only allow-listed addresses. Add your own address first with “Allow my IP”, or the portal won’t enable it.',
      },
      more: 'ip',
    },
    ipRules: {
      title: { ru: 'Правила IP', en: 'IP rules' },
      text: {
        ru: 'Один адрес (IPv4 или IPv6) или сеть IPv4, например `10.0.0.0/8`. Чёрный список всегда сильнее белого.',
        en: 'A single address (IPv4 or IPv6) or an IPv4 network like `10.0.0.0/8`. The block list always beats the allow list.',
      },
      more: 'ip',
    },
    groupMap: {
      title: { ru: 'Сопоставление групп каталога', en: 'Directory group mapping' },
      text: {
        ru: 'При каждом входе участник группы AD добавляется в выбранную группу портала. Укажите имя группы (CN) или полный DN. Добавленные вручную группы не теряются.',
        en: 'On every sign-in a member of the AD group is added to the chosen portal group. Enter the group name (CN) or full DN. Manually added groups are kept.',
      },
      more: 'signin',
    },
    magicLink: {
      title: { ru: 'Ссылки для входа', en: 'Sign-in links' },
      text: {
        ru: 'Вместо 6-значного кода человек получает ссылку в один клик через тот же канал. Ссылка одноразовая и действует 15 минут.',
        en: 'Instead of a 6-digit code the person gets a one-click link through the same channel. It is single-use and valid for 15 minutes.',
      },
      more: 'signin',
    },
    smtp: {
      title: { ru: 'Почта (SMTP)', en: 'Email (SMTP)' },
      text: {
        ru: 'Для порта 465 включите SSL/TLS, для 587 — выключите. Многим почтовым сервисам нужен пароль приложения, а не обычный пароль ящика.',
        en: 'Turn SSL/TLS on for port 465 and off for 587. Many providers need an app password, not the mailbox password.',
      },
      more: 'integrations',
    },
    telegramBot: {
      title: { ru: 'Telegram-бот', en: 'Telegram bot' },
      text: {
        ru: 'Вставьте токен от @BotFather и нажмите «Проверить соединение» — имя бота заполнится само. Не забудьте `/setdomain` в @BotFather.',
        en: 'Paste the token from @BotFather and press Test connection — the bot name fills in. Don’t forget `/setdomain` in @BotFather.',
      },
      more: 'integrations',
    },
    whatsappGateway: {
      title: { ru: 'WhatsApp Gateway', en: 'WhatsApp Gateway' },
      text: {
        ru: 'Адрес вашего шлюза и API-ключ из его админки. Каждый ключ привязан к одному номеру — с него и уходят коды.',
        en: 'Your gateway’s address and an API key from its admin. Each key is tied to one number — codes are sent from it.',
      },
      more: 'integrations',
    },
    wazzup: {
      title: { ru: 'Wazzup', en: 'Wazzup' },
      text: {
        ru: 'API-ключ из Wazzup (Интеграции → API). После загрузки каналов выберите, через какой канал работать с каждым мессенджером.',
        en: 'The API key from Wazzup (Integrations → API). After loading channels, choose the channel to use for each messenger.',
      },
      more: 'integrations',
    },
    mattermost: {
      title: { ru: 'Mattermost', en: 'Mattermost' },
      text: {
        ru: 'Адрес сервера и токен бот-аккаунта. Для оповещений добавьте бота в канал и укажите ID канала (26 символов), а не его название.',
        en: 'Server address and bot account token. For alerts, add the bot to a channel and enter the channel ID (26 characters), not its name.',
      },
      more: 'integrations',
    },
    documents: {
      title: { ru: 'Конвертация документов', en: 'Document conversion' },
      text: {
        ru: 'Адрес сервера Collabora / LibreOffice, доступный с сервера портала. Документы не покидают вашу сеть и не хранятся на конвертере.',
        en: 'A Collabora / LibreOffice server address reachable from the portal server. Documents stay inside your network and are not kept on the converter.',
      },
      more: 'integrations',
    },
    activeDirectory: {
      title: { ru: 'Active Directory', en: 'Active Directory' },
      text: {
        ru: 'Порт 389, или 636 с TLS. Служебной учётной записи достаточно права на поиск пользователей. Проверка делает настоящий вход и поиск в Base DN.',
        en: 'Port 389, or 636 with TLS. The service account only needs to search users. The test performs a real bind and a search under the Base DN.',
      },
      more: 'integrations',
    },
    rateLimit: {
      title: { ru: 'Лимит запросов', en: 'Rate limit' },
      text: {
        ru: 'Защита от перегрузки: гостей считаем по IP, вошедших — по учётной записи. Если люди видят ошибку «слишком много запросов», увеличьте лимит.',
        en: 'Overload protection: guests are counted per IP, signed-in people per account. If people see “too many requests”, raise the limit.',
      },
      more: 'system',
    },
  },
  related: ['api', 'account', 'notifications'],
};
