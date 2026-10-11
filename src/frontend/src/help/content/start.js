export default {
  id: 'start',
  icon: 'rocket',
  title: { ru: 'Начало работы', en: 'Getting started' },
  tagline: {
    ru: 'Как войти, где что находится и как быстро найти нужное',
    en: 'How to sign in, where things are and how to find what you need fast',
  },
  summary: {
    ru: 'Портал — единое рабочее место: задачи, календарь, чаты, файлы и другие приложения открываются из одной шапки. Здесь — как войти, как устроен экран, как установить портал на телефон и что делать, если что-то пошло не так.',
    en: 'The portal is one workplace: tasks, calendar, chats, files and other apps open from the same header. This guide covers signing in, the layout of the screen, installing the portal on your phone and what to do when something goes wrong.',
  },
  highlights: [
    {
      icon: '🔑',
      title: { ru: 'Удобный вход', en: 'Easy sign-in' },
      text: {
        ru: 'Пароль, корпоративный логин, Google, Telegram или одноразовый код — что включил администратор.',
        en: 'Password, corporate login, Google, Telegram or a one-time code — whatever your administrator enabled.',
      },
    },
    {
      icon: '🧭',
      title: { ru: 'Всё из шапки', en: 'Everything from the header' },
      text: {
        ru: 'Справка, чаты, уведомления, приложения и ваш профиль — в правом верхнем углу на любой странице.',
        en: 'Help, chats, notifications, apps and your profile sit in the top-right corner of every page.',
      },
    },
    {
      icon: '🧩',
      title: { ru: 'Приложения', en: 'Apps' },
      text: {
        ru: 'Значок из девяти точек открывает все разделы портала: задачи, календарь, файлы и другие.',
        en: 'The nine-dot icon opens every part of the portal: tasks, calendar, files and more.',
      },
    },
    {
      icon: '📱',
      title: { ru: 'Как приложение', en: 'Like an app' },
      text: {
        ru: 'Портал можно установить на телефон или компьютер: своя иконка, полный экран и push-уведомления.',
        en: 'Install the portal on your phone or computer: its own icon, full screen and push notifications.',
      },
    },
    {
      icon: '🌗',
      title: { ru: 'Язык и тема', en: 'Language and theme' },
      text: {
        ru: 'Русский или English, светлая или тёмная тема — переключаются в шапке одним нажатием.',
        en: 'Russian or English, light or dark theme — switched in the header with one click.',
      },
    },
    {
      icon: 'ⓘ',
      title: { ru: 'Подсказки везде', en: 'Hints everywhere' },
      text: {
        ru: 'Значок ⓘ у поля объясняет его, клавиша ? открывает справку по текущей странице.',
        en: 'The ⓘ icon next to a field explains it; the ? key opens help for the current page.',
      },
    },
  ],
  tips: [
    {
      ru: 'Нажмите ? на любой странице — откроется справка именно по ней.',
      en: 'Press ? on any page to open help for that very page.',
    },
    {
      ru: 'Заполните почту и телефон в профиле — так можно входить по коду, если забыли пароль.',
      en: 'Fill in your email and phone in the profile — then you can sign in with a code if you forget your password.',
    },
    {
      ru: 'Установите портал на телефон, чтобы получать push-уведомления о задачах и встречах.',
      en: 'Install the portal on your phone to get push notifications about tasks and meetings.',
    },
    {
      ru: 'Значок из девяти точек в шапке — самый быстрый путь в любое приложение.',
      en: 'The nine-dot icon in the header is the fastest way into any app.',
    },
    {
      ru: 'Если страница «зависла», сначала просто обновите её (F5 или потяните вниз на телефоне).',
      en: 'If a page seems stuck, first just reload it (F5, or pull down on a phone).',
    },
  ],
  sections: [
    {
      id: 'sign-in',
      title: { ru: 'Вход в портал', en: 'Signing in' },
      body: {
        ru: 'На странице входа показаны только те способы, которые включил администратор. Чаще всего это:\n\n- **Пароль** — логин и пароль. Если в компании есть Active Directory, подойдут обычный рабочий логин и пароль от компьютера.\n- **Войти через Google** — кнопка над вкладками, вход одним нажатием рабочим аккаунтом Google.\n- **Telegram** — подтверждение входа в Telegram без пароля или код от бота портала.\n- **Почта**, **WhatsApp**, **Mattermost** — портал присылает 6-значный код (или ссылку для входа) туда, что указано в вашем профиле.\n\nКод действует 5 минут и срабатывает один раз; ссылка для входа — 15 минут. Вход выполняется сразу после ввода последней цифры. Портал запоминает выбранный способ и в следующий раз откроет ту же вкладку.',
        en: 'The sign-in page shows only the methods your administrator enabled. Most often:\n\n- **Password** — username and password. If the company uses Active Directory, your usual work login and computer password will do.\n- **Sign in with Google** — the button above the tabs, one click with your work Google account.\n- **Telegram** — confirm the sign-in in Telegram without a password, or get a code from the portal bot.\n- **Email**, **WhatsApp**, **Mattermost** — the portal sends a 6-digit code (or a sign-in link) to the contact in your profile.\n\nA code is valid for 5 minutes and works once; a sign-in link — for 15 minutes. You are signed in as soon as you type the last digit. The portal remembers your method and opens the same tab next time.',
      },
      steps: [
        { ru: 'Откройте адрес портала в браузере.', en: 'Open the portal address in your browser.' },
        { ru: 'Выберите вкладку со способом входа (или нажмите «Войти через Google»).', en: 'Pick the tab with your sign-in method (or press “Sign in with Google”).' },
        { ru: 'Введите логин и пароль — или почту, телефон, имя в Telegram/Mattermost и нажмите «Получить код».', en: 'Enter your username and password — or your email, phone, Telegram/Mattermost name and press “Get code”.' },
        { ru: 'Введите 6 цифр из сообщения — вход выполнится сам.', en: 'Type the 6 digits from the message — you are signed in automatically.' },
      ],
      example: {
        title: { ru: 'Забыли пароль', en: 'Forgot your password' },
        body: {
          ru: 'Анна забыла пароль, но в её профиле указана рабочая почта. На странице входа она открывает вкладку «Почта», вводит адрес и нажимает «Получить код». Через минуту приходит письмо с 6 цифрами — Анна вводит их и попадает в портал. Затем в «Кабинет → Безопасность» задаёт новый пароль.',
          en: 'Anna forgot her password, but her profile has her work email. On the sign-in page she opens the “Email” tab, enters the address and presses “Get code”. A minute later an email with 6 digits arrives — she types them and is in. Then she sets a new password in “Account → Security”.',
        },
      },
      note: {
        ru: 'Коды приходят только на контакты, указанные в вашем профиле. Никому не сообщайте код — сотрудники портала никогда не спрашивают его по телефону или в чате.',
        en: 'Codes go only to the contacts in your profile. Never share a code — portal staff never ask for it by phone or in chat.',
      },
    },
    {
      id: 'home',
      title: { ru: 'Главная страница', en: 'Home page' },
      body: {
        ru: 'Что открывается на главной, решает администратор. Это может быть:\n\n- **Дашборд** — ваш день одним взглядом: задачи, встречи, файлы и цифры;\n- другое приложение портала, например «Задачи» или «Ресурсы»;\n- стартовая страница с кнопками «Открыть кабинет» и «Администрирование».\n\nНа главную всегда можно вернуться, нажав на логотип и название портала в левом верхнем углу.',
        en: 'Your administrator decides what the home page shows. It can be:\n\n- **Dashboard** — your day at a glance: tasks, meetings, files and numbers;\n- another portal app, such as “Tasks” or “Resources”;\n- a start page with “Open account” and “Administration” buttons.\n\nYou can always get back home by clicking the logo and portal name in the top-left corner.',
      },
    },
    {
      id: 'header',
      title: { ru: 'Шапка портала: где что находится', en: 'The header: where things are' },
      body: {
        ru: 'Шапка одинакова на всех страницах. Слева — логотип (ведёт на главную). Справа, по порядку:\n\n- **Флажок** и **Тема** — переключатели языка интерфейса (русский/английский) и светлой/тёмной темы;\n- **?** — справка по текущей странице;\n- **Чаты** — последние переписки и переход в мессенджер;\n- **Колокольчик** — уведомления; цифра показывает, сколько непрочитанных;\n- **Девять точек** — все приложения портала;\n- **Четыре квадрата** — консоль администратора (видна только администраторам);\n- **Аватар с именем** — меню: «Личный кабинет», «Установить приложение», «Выйти».',
        en: 'The header is the same on every page. On the left is the logo (it leads home). On the right, in order:\n\n- **Flag** and **Theme** — switch the interface language (Russian/English) and light/dark theme;\n- **?** — help for the current page;\n- **Chats** — recent conversations and a link to the messenger;\n- **Bell** — notifications; the number shows how many are unread;\n- **Nine dots** — every portal app;\n- **Four squares** — the administrator console (administrators only);\n- **Avatar with your name** — a menu: “Account”, “Install the app”, “Sign out”.',
      },
      note: {
        ru: 'На узком экране телефона часть подписей скрывается, остаются только значки — порядок тот же.',
        en: 'On a narrow phone screen some labels hide and only icons remain — the order is the same.',
      },
    },
    {
      id: 'apps',
      title: { ru: 'Запуск приложений', en: 'Opening apps' },
      body: {
        ru: 'Портал состоит из приложений: «Дашборд», «Задачи», «Календарь», «Чаты», «Файлы», «База знаний» и других. Набор зависит от того, что включил администратор, и от ваших прав.\n\nОткрыть приложение можно двумя способами:\n\n- нажмите значок из девяти точек в шапке и выберите приложение в выпадающей сетке;\n- внизу этой сетки нажмите «Все приложения →» — откроется страница [Приложения](/apps) с плитками и коротким описанием каждого.',
        en: 'The portal is made of apps: “Dashboard”, “Tasks”, “Calendar”, “Chats”, “Files”, “Knowledge base” and others. Which ones you see depends on what your administrator enabled and on your permissions.\n\nThere are two ways to open an app:\n\n- click the nine-dot icon in the header and pick the app from the grid;\n- at the bottom of that grid click “All apps →” — the [Apps](/apps) page opens with tiles and a short description of each.',
      },
      example: {
        title: { ru: 'Закладка на нужный раздел', en: 'A bookmark to the right place' },
        body: {
          ru: 'Сергей каждый день начинает с задач. Он открывает «Задачи» через девять точек и добавляет страницу в закладки браузера. Теперь задачи открываются сразу, без лишних кликов.',
          en: 'Sergey starts every day with his tasks. He opens “Tasks” via the nine dots and bookmarks the page in his browser. Now tasks open straight away, with no extra clicks.',
        },
      },
      note: {
        ru: 'Не видите нужного приложения? Скорее всего, оно выключено или у вас нет к нему доступа — обратитесь к администратору.',
        en: 'Can’t see an app you need? It is probably turned off or you have no access to it — ask your administrator.',
      },
    },
    {
      id: 'search',
      title: { ru: 'Быстрый поиск (Ctrl+K)', en: 'Quick search (Ctrl+K)' },
      body: {
        ru: 'В консоли администратора нажмите **Ctrl+K** (на Mac — **⌘K**): откроется окно быстрого перехода. Начните печатать название страницы или настройки — например, «пользователи» или «тема» — стрелками выберите строку и нажмите Enter. Esc закрывает окно.\n\nВ остальных частях портала для быстрого перехода используйте значок девяти точек, а внутри приложений — их собственный поиск (в задачах, файлах, базе знаний).',
        en: 'In the administrator console press **Ctrl+K** (**⌘K** on a Mac) to open quick navigation. Start typing the name of a page or setting — for example “users” or “theme” — pick a line with the arrow keys and press Enter. Esc closes the window.\n\nElsewhere in the portal use the nine-dot icon to jump between apps, and the search inside each app (tasks, files, knowledge base).',
      },
      example: {
        title: { ru: 'Найти настройку за секунду', en: 'Find a setting in a second' },
        body: {
          ru: 'Администратору нужно добавить сотрудника. Он нажимает Ctrl+K, печатает «польз», жмёт Enter — и сразу оказывается на странице «Пользователи».',
          en: 'An administrator needs to add an employee. He presses Ctrl+K, types “use”, hits Enter — and lands on the “Users” page right away.',
        },
      },
      note: {
        ru: 'Окно быстрого поиска есть только в консоли администратора. Обычным сотрудникам оно не нужно — всё доступное им открывается из шапки.',
        en: 'The quick search window exists only in the administrator console. Regular staff do not need it — everything they can use opens from the header.',
      },
    },
    {
      id: 'language-theme',
      title: { ru: 'Язык и тема', en: 'Language and theme' },
      body: {
        ru: 'Переключатели языка и темы находятся в шапке слева от значка «?». Изменения применяются сразу.\n\nЧтобы выбор сохранился в вашей учётной записи и действовал на всех устройствах, задайте его в [Кабинет → Оформление](/account/appearance):\n\n- **Язык**: «Как в портале», «Русский» или «English»;\n- **Тема**: «Светлая», «Тёмная» или «Системная» — следует настройке телефона или компьютера.',
        en: 'The language and theme switches are in the header, to the left of the “?” icon. Changes apply at once.\n\nTo keep the choice in your account on every device, set it in [Account → Appearance](/account/appearance):\n\n- **Language**: “As the portal”, “Русский” or “English”;\n- **Theme**: “Light”, “Dark” or “System” — follows your phone or computer setting.',
      },
    },
    {
      id: 'install',
      title: { ru: 'Установка на телефон и компьютер', en: 'Installing on your phone and computer' },
      body: {
        ru: 'Портал можно установить как приложение — без App Store и Google Play. Появится иконка на экране, портал будет открываться на весь экран и сможет присылать push-уведомления.\n\nПошаговая инструкция с картинками для вашего устройства — на странице [Установить приложение](/install). Её также можно открыть из меню под аватаром или со страницы входа.\n\n**Что меняется в установленном приложении:**\n\n- нет адресной строки и кнопок браузера;\n- поэтому в шапке слева появляется своя кнопка **«Назад»** (стрелка) — она возвращает на предыдущий экран;\n- на иконке приложения показывается число непрочитанных уведомлений;\n- обновления приходят сами, ничего переустанавливать не нужно.',
        en: 'You can install the portal as an app — no App Store or Google Play. You get an icon on the screen, the portal opens full screen and can send push notifications.\n\nStep-by-step instructions with pictures for your device are on the [Install the app](/install) page. You can also open it from the menu under your avatar or from the sign-in page.\n\n**What changes in the installed app:**\n\n- there is no address bar and no browser buttons;\n- so a **Back** button (an arrow) appears on the left of the header — it returns to the previous screen;\n- the app icon shows the number of unread notifications;\n- updates arrive on their own, nothing needs reinstalling.',
      },
      steps: [
        { ru: 'iPhone: откройте портал в Safari → «Поделиться» → «На экран „Домой“» → «Добавить».', en: 'iPhone: open the portal in Safari → Share → “Add to Home Screen” → Add.' },
        { ru: 'Android: откройте портал в Chrome → меню ⋮ → «Установить приложение» → «Установить».', en: 'Android: open the portal in Chrome → ⋮ menu → “Install app” → Install.' },
        { ru: 'Компьютер (Chrome, Edge, Яндекс Браузер): значок установки справа в адресной строке.', en: 'Computer (Chrome, Edge, Yandex Browser): the install icon on the right of the address bar.' },
        { ru: 'Откройте приложение с иконки и включите уведомления в «Кабинет → Уведомления».', en: 'Open the app from its icon and turn on notifications in “Account → Notifications”.' },
      ],
      example: {
        title: { ru: 'Ссылка из Telegram не устанавливается', en: 'A link from Telegram won’t install' },
        body: {
          ru: 'Коллега прислала ссылку на портал в Telegram, она открылась внутри мессенджера, и кнопки установки нет. Нужно нажать ⋯ → «Открыть в браузере» (Safari на iPhone или Chrome на Android) — и уже там установить.',
          en: 'A colleague sent the portal link in Telegram; it opened inside the messenger and there is no install button. Tap ⋯ → “Open in browser” (Safari on iPhone or Chrome on Android) and install from there.',
        },
      },
      note: {
        ru: 'На iPhone push-уведомления работают только в установленном приложении и на iOS 16.4 или новее.',
        en: 'On iPhone push notifications work only in the installed app and on iOS 16.4 or later.',
      },
    },
    {
      id: 'bell-chat',
      title: { ru: 'Уведомления и чаты в шапке', en: 'Notifications and chats in the header' },
      body: {
        ru: '**Колокольчик** собирает всё, что касается вас: новые поручения, комментарии и упоминания, приглашения на встречи, напоминания о сроках. Цифра на нём — число непрочитанных. В панели есть вкладки «Все» и «Непрочитанные», кнопка «Прочитать все»; нажатие на уведомление открывает нужную задачу или событие. Уведомления хранятся 120 дней.\n\nДополнительно уведомления можно получать на почту, в Telegram, Mattermost и push — это настраивается в [Кабинет → Уведомления](/account/notifications). Подробнее — в разделе [Уведомления](/help/notifications).\n\n**Значок чатов** рядом показывает последние переписки и ведёт в приложение «Чаты».',
        en: 'The **bell** collects everything that concerns you: new assignments, comments and mentions, meeting invitations, deadline reminders. The number on it is the unread count. The panel has “All” and “Unread” tabs and a “Mark all read” button; clicking a notification opens the task or event. Notifications are kept for 120 days.\n\nYou can also receive them by email, Telegram, Mattermost and push — set this up in [Account → Notifications](/account/notifications). More in the [Notifications](/help/notifications) guide.\n\nThe **chats icon** next to it shows recent conversations and leads to the “Chats” app.',
      },
      note: {
        ru: 'О собственных действиях уведомления не приходят: если вы сами назначили себе задачу, колокольчик промолчит.',
        en: 'You are never notified about your own actions: if you assign a task to yourself, the bell stays quiet.',
      },
    },
    {
      id: 'help',
      title: { ru: 'Как пользоваться справкой', en: 'Using the help' },
      body: {
        ru: 'Справка встроена в портал и всегда под рукой:\n\n- **ⓘ у поля** — наведите курсор или нажмите: появится короткое объяснение и ссылка «Подробнее» на нужный раздел руководства;\n- **клавиша ?** (или значок **?** в шапке) — открывает справку по странице, на которой вы находитесь;\n- **Центр помощи** [/help](/help) — все руководства, вопросы и ответы и поиск по справке.\n\nВ каждом руководстве сначала идут короткие «Что можно делать» и «Советы», ниже — подробные темы с примерами и вопросы и ответы.',
        en: 'Help is built into the portal and always at hand:\n\n- **ⓘ next to a field** — hover or tap it for a short explanation and a “More” link to the right part of the guide;\n- **the ? key** (or the **?** icon in the header) — opens help for the page you are on;\n- **Help center** [/help](/help) — every guide, questions and answers, and a search across the help.\n\nEach guide starts with a short “What you can do” and “Tips”, followed by detailed topics with examples and questions and answers.',
      },
      example: {
        title: { ru: 'Найти ответ поиском', en: 'Find an answer with search' },
        body: {
          ru: 'Нужно понять, как поделиться папкой. Откройте [Центр помощи](/help), напечатайте «поделиться папкой» — поиск покажет нужную тему в руководстве по файлам.',
          en: 'You want to know how to share a folder. Open the [Help center](/help), type “share a folder” — the search shows the right topic in the files guide.',
        },
      },
      note: {
        ru: 'Клавиша ? не срабатывает, пока вы печатаете в поле ввода, — щёлкните по пустому месту страницы и нажмите ещё раз.',
        en: 'The ? key does nothing while you are typing in a field — click an empty spot on the page and press it again.',
      },
    },
    {
      id: 'troubleshooting',
      title: { ru: 'Если что-то не работает', en: 'If something does not work' },
      body: {
        ru: 'Большинство проблем решается за минуту:\n\n1. **Обновите страницу** — F5 (на Mac ⌘R) или потяните экран вниз на телефоне. Если появилось сообщение «Доступна новая версия», нажмите «Обновить».\n2. **Выйдите и войдите снова** — меню под аватаром → «Выйти».\n3. **Проверьте интернет** — без связи установленное приложение покажет экран «нет подключения».\n4. **Попробуйте другой браузер** — Chrome, Edge, Safari или Яндекс Браузер свежей версии.\n\nЕсли не помогло — напишите администратору портала или в IT-поддержку вашей компании. Опишите, что делали, что ожидали и что увидели; приложите снимок экрана.',
        en: 'Most problems are solved in a minute:\n\n1. **Reload the page** — F5 (⌘R on a Mac) or pull down on a phone. If you see “A new version is available”, press “Reload”.\n2. **Sign out and back in** — the menu under your avatar → “Sign out”.\n3. **Check your connection** — offline, the installed app shows a “no connection” screen.\n4. **Try another browser** — an up-to-date Chrome, Edge, Safari or Yandex Browser.\n\nIf that does not help, contact the portal administrator or your company’s IT support. Describe what you did, what you expected and what you saw; attach a screenshot.',
      },
      note: {
        ru: 'Ваши данные хранятся на сервере: обновление страницы, выход или переустановка приложения ничего не удаляют.',
        en: 'Your data lives on the server: reloading, signing out or reinstalling the app deletes nothing.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Пишет «Неверный логин или пароль», хотя я ввожу правильно.', en: 'It says “Invalid username or password” although I type it correctly.' },
      a: {
        ru: 'Проверьте раскладку клавиатуры и Caps Lock. Если пароль действительно забыт — войдите по коду на почту или в Telegram (если эти способы включены) и задайте новый пароль в «Кабинет → Безопасность». Иначе попросите администратора сбросить пароль.',
        en: 'Check the keyboard layout and Caps Lock. If you really forgot the password, sign in with a code by email or Telegram (if enabled) and set a new one in “Account → Security”. Otherwise ask an administrator to reset it.',
      },
    },
    {
      q: { ru: 'Пишет «Слишком много неудачных попыток».', en: 'It says “Too many failed attempts”.' },
      a: {
        ru: 'Вход временно заблокирован для защиты от подбора пароля. Подождите несколько минут и попробуйте снова или войдите другим способом.',
        en: 'Sign-in is temporarily blocked to protect against password guessing. Wait a few minutes and try again, or use another method.',
      },
    },
    {
      q: { ru: 'Код для входа не приходит.', en: 'The sign-in code does not arrive.' },
      a: {
        ru: 'Код отправляется только на контакт из вашего профиля. Проверьте папку «Спам», правильность номера или адреса; для Telegram — что он привязан в «Кабинет → Безопасность» и бот не заблокирован. Если вы новый сотрудник, попросите администратора добавить ваш телефон или почту.',
        en: 'The code goes only to the contact in your profile. Check your spam folder and that the number or address is right; for Telegram — that it is linked in “Account → Security” and the bot is not blocked. New employees should ask an administrator to add their phone or email.',
      },
    },
    {
      q: { ru: 'Где найти приложение, которое было у коллеги?', en: 'Where is the app a colleague has?' },
      a: {
        ru: 'Нажмите девять точек в шапке → «Все приложения». Если его там нет — у вас нет к нему доступа; обратитесь к администратору.',
        en: 'Click the nine dots in the header → “All apps”. If it is not there, you have no access to it; ask your administrator.',
      },
    },
    {
      q: { ru: 'Как вернуться назад в установленном приложении?', en: 'How do I go back in the installed app?' },
      a: {
        ru: 'Нажмите стрелку «Назад» в левой части шапки. На Android также работает системный жест или кнопка «Назад».',
        en: 'Tap the Back arrow on the left of the header. On Android the system back gesture or button works too.',
      },
    },
    {
      q: { ru: 'Это безопасно — устанавливать портал на телефон?', en: 'Is it safe to install the portal on my phone?' },
      a: {
        ru: 'Да. Это тот же сайт, открытый в отдельном окне: он ничего не скачивает в обход магазинов и не получает доступа к вашим файлам. Удаляется как обычное приложение.',
        en: 'Yes. It is the same website opened in its own window: it downloads nothing bypassing the stores and gets no access to your files. You remove it like any app.',
      },
    },
    {
      q: { ru: 'Почему у меня нет значка консоли администратора?', en: 'Why don’t I have the administrator console icon?' },
      a: {
        ru: 'Консоль администратора видят только сотрудники с правами администратора. Для обычной работы она не нужна.',
        en: 'Only staff with administrator rights see the console. You do not need it for everyday work.',
      },
    },
    {
      q: { ru: 'Интерфейс вдруг стал на английском. Как вернуть русский?', en: 'The interface suddenly switched language. How do I change it back?' },
      a: {
        ru: 'Нажмите флажок языка в шапке или выберите «Русский» в «Кабинет → Оформление» и сохраните — тогда выбор запомнится на всех устройствах.',
        en: 'Click the language flag in the header, or choose “English” in “Account → Appearance” and save — the choice is then kept on every device.',
      },
    },
  ],
  fields: {},
  related: ['account', 'notifications', 'dashboard'],
};
