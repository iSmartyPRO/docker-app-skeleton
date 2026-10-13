export default {
  id: 'account',
  icon: 'user',
  title: { ru: 'Профиль', en: 'Profile' },
  tagline: {
    ru: 'Ваши данные, оформление, безопасность и подключённые сервисы',
    en: 'Your details, appearance, security and connected services',
  },
  summary: {
    ru: 'В личном кабинете вы указываете имя, почту, телефон и аватар, выбираете язык и тему, меняете пароль и привязываете Telegram и Google. От этих данных зависит, какими способами вы сможете входить и куда будут приходить уведомления.',
    en: 'In your account you set your name, email, phone and avatar, choose the language and theme, change your password and link Telegram and Google. These details decide how you can sign in and where notifications are delivered.',
  },
  highlights: [
    {
      icon: '👤',
      title: { ru: 'Профиль', en: 'Profile' },
      text: {
        ru: 'Имя, почта, телефон, Mattermost и аватар — то, как вас видят коллеги и как вас узнаёт портал при входе.',
        en: 'Name, email, phone, Mattermost and avatar — how colleagues see you and how the portal recognises you at sign-in.',
      },
    },
    {
      icon: '🎨',
      title: { ru: 'Оформление', en: 'Appearance' },
      text: {
        ru: 'Язык и тема сохраняются в учётной записи и действуют на всех ваших устройствах.',
        en: 'Language and theme are stored in your account and apply on all your devices.',
      },
    },
    {
      icon: '🔒',
      title: { ru: 'Безопасность', en: 'Security' },
      text: {
        ru: 'Смена пароля и выход на всех других устройствах одной кнопкой.',
        en: 'Change your password and sign out of every other device with one button.',
      },
    },
    {
      icon: '✈️',
      title: { ru: 'Telegram', en: 'Telegram' },
      text: {
        ru: 'Привязанный Telegram — это вход в одно нажатие, коды от бота и уведомления в мессенджер.',
        en: 'A linked Telegram gives one-tap sign-in, codes from the bot and notifications in the messenger.',
      },
    },
    {
      icon: '📅',
      title: { ru: 'Google', en: 'Google' },
      text: {
        ru: 'Вход через Google и ваши календари Google рядом с календарём портала.',
        en: 'Sign in with Google and see your Google calendars next to the portal calendar.',
      },
    },
    {
      icon: '🔔',
      title: { ru: 'Уведомления и API', en: 'Notifications and API' },
      text: {
        ru: 'Выбор каналов уведомлений и личные API-токены — в отдельных разделах кабинета.',
        en: 'Notification channels and personal API tokens have their own account sections.',
      },
    },
  ],
  tips: [
    {
      ru: 'Укажите рабочую почту и телефон — это запасной способ войти, если забыли пароль.',
      en: 'Add your work email and phone — a backup way to sign in if you forget your password.',
    },
    {
      ru: 'Телефон вводите в международном формате: +996 700 123 456.',
      en: 'Enter your phone in international format: +996 700 123 456.',
    },
    {
      ru: 'Телефон, почта и Mattermost принадлежат одной учётной записи: если они уже указаны у другой, портал не даст их сохранить — иначе вход по коду не поймёт, чья это учётка.',
      en: 'A phone, e-mail or Mattermost name belongs to one account: if another account already has it, the portal will not save it — otherwise a code sign-in could not tell whose account it is.',
    },
    {
      ru: 'Привяжите Telegram в «Безопасности», чтобы получать уведомления и входить без пароля.',
      en: 'Link Telegram under “Security” to get notifications and sign in without a password.',
    },
    {
      ru: 'Не забудьте нажать «Сохранить» внизу страницы — без этого изменения профиля не применятся.',
      en: 'Remember to press “Save” at the bottom of the page — otherwise profile changes are not applied.',
    },
    {
      ru: 'Заметили вход, которого не было? Смените пароль и нажмите «Выйти на других устройствах».',
      en: 'Noticed a sign-in that was not you? Change your password and press “Sign out other devices”.',
    },
  ],
  sections: [
    {
      id: 'open',
      title: { ru: 'Как открыть кабинет', en: 'Opening your account' },
      body: {
        ru: 'Нажмите на свой аватар с именем в правом верхнем углу и выберите **«Личный кабинет»**. Слева появится меню разделов: «Профиль», «Оформление», «Безопасность», «Уведомления», «Подключения» и, если у вас есть права, «API-токены».\n\nНа телефоне меню разделов сворачивается до значков — нажимайте на них так же.',
        en: 'Click your avatar and name in the top-right corner and choose **“Account”**. A menu of sections appears on the left: “Profile”, “Appearance”, “Security”, “Notifications”, “Connected accounts” and, if you have the rights, “API tokens”.\n\nOn a phone the section menu collapses to icons — tap them the same way.',
      },
    },
    {
      id: 'profile',
      title: { ru: 'Профиль: имя, почта, телефон, аватар', en: 'Profile: name, email, phone, avatar' },
      body: {
        ru: 'Раздел [Профиль](/account) — ваши данные:\n\n- **Отображаемое имя** — как вас видят коллеги в задачах, чатах и календаре. Логин (@имя) изменить нельзя.\n- **Почта** — сюда приходят уведомления и коды входа по почте.\n- **Телефон** — для кодов входа в WhatsApp, в международном формате. Если номер некорректен, поле подсветится красным.\n- **Mattermost** — ваше имя пользователя в Mattermost: бот пришлёт туда коды входа и уведомления.\n- **Instagram** — по желанию.\n\n**Аватар** меняется кнопкой «Сменить аватар» вверху страницы: JPG, PNG или WebP до 1 МБ. Он сохраняется сразу.\n\nОстальные поля сохраняются кнопкой **«Сохранить»** на панели, которая появляется внизу после первого изменения. «Отменить» вернёт прежние значения.',
        en: 'The [Profile](/account) section holds your details:\n\n- **Display name** — how colleagues see you in tasks, chats and the calendar. Your username (@name) cannot be changed.\n- **Email** — notifications and email sign-in codes go here.\n- **Phone** — for WhatsApp sign-in codes, in international format. An invalid number is highlighted in red.\n- **Mattermost** — your Mattermost username: the bot sends sign-in codes and notifications there.\n- **Instagram** — optional.\n\nYour **avatar** is changed with the “Change avatar” button at the top: JPG, PNG or WebP up to 1 MB. It is saved at once.\n\nOther fields are saved with the **“Save”** button on the bar that appears at the bottom after your first change. “Discard” restores the previous values.',
      },
      steps: [
        { ru: 'Откройте «Личный кабинет» → «Профиль».', en: 'Open “Account” → “Profile”.' },
        { ru: 'Исправьте имя, почту, телефон или Mattermost.', en: 'Edit your name, email, phone or Mattermost.' },
        { ru: 'Нажмите «Сохранить» на панели внизу.', en: 'Press “Save” on the bar at the bottom.' },
      ],
      example: {
        title: { ru: 'Входить по коду в WhatsApp', en: 'Sign in with a WhatsApp code' },
        body: {
          ru: 'Марат часто забывает пароль. Он вписывает в поле «Телефон» номер +996 555 123 456 и сохраняет. Теперь на странице входа он выбирает вкладку «WhatsApp», вводит номер и получает 6-значный код в WhatsApp.',
          en: 'Marat often forgets his password. He enters +996 555 123 456 in the “Phone” field and saves. Now on the sign-in page he picks the “WhatsApp” tab, enters the number and gets a 6-digit code in WhatsApp.',
        },
      },
      note: {
        ru: 'Почта должна быть уникальной: один адрес нельзя указать в двух учётных записях.',
        en: 'Email addresses must be unique: one address cannot be used in two accounts.',
      },
    },
    {
      id: 'appearance',
      title: { ru: 'Оформление: язык и тема', en: 'Appearance: language and theme' },
      body: {
        ru: 'В разделе [Оформление](/account/appearance):\n\n- **Язык** — «Как в портале» (язык по умолчанию, который выбрал администратор), «Русский» или «English»;\n- **Тема** — «Светлая», «Тёмная» или «Системная» (следует настройке телефона или компьютера: днём светлая, вечером тёмная, если так настроено).\n\nПосле «Сохранить» выбор хранится в учётной записи и применяется на всех устройствах, где вы вошли. Флажок и переключатель темы в шапке меняют вид только на время, в текущем браузере.',
        en: 'In [Appearance](/account/appearance):\n\n- **Language** — “As the portal” (the default your administrator chose), “Русский” or “English”;\n- **Theme** — “Light”, “Dark” or “System” (follows your phone or computer: light by day, dark in the evening if set up that way).\n\nAfter “Save” the choice is kept in your account and applies on every device you sign in on. The flag and theme switch in the header change the look only for now, in the current browser.',
      },
    },
    {
      id: 'regional',
      title: { ru: 'Дата и время', en: 'Date and time' },
      body: {
        ru: 'В [Оформление → Дата и время](/account/appearance) можно выбрать свой **часовой пояс**, **формат даты**, **формат времени** (14:30 или 2:30 PM) и **первый день недели**. По умолчанию всё «Как в портале» — так, как настроил администратор.\n\n- **Часовой пояс** влияет на всё: какое время показано у задач и встреч, когда наступает «сегодня» и «завтра», когда приходят напоминания и начинаются тихие часы.\n- **Как на этом устройстве** — пояс берётся из телефона или компьютера. Удобно в командировке: время само перейдёт на местное.\n- Даты без времени (день рождения, дата закрытия сделки) не сдвигаются при смене пояса.\n\nВнизу блока видно, как будут выглядеть даты. После «Сохранить» настройки действуют на всех ваших устройствах.',
        en: 'In [Appearance → Date and time](/account/appearance) you can choose your own **time zone**, **date format**, **time format** (14:30 or 2:30 PM) and **first day of the week**. By default everything is “As the portal” — what your administrator set.\n\n- The **time zone** affects everything: the times shown on tasks and meetings, when “today” and “tomorrow” begin, when reminders arrive and quiet hours start.\n- **As on this device** takes the zone from your phone or computer. Handy when travelling: times switch to local by themselves.\n- Dates without a time (a birthday, a deal’s close date) never shift when the zone changes.\n\nThe bottom of the block shows how dates will look. After “Save” the settings apply on all your devices.',
      },
    },
    {
      id: 'security',
      title: { ru: 'Безопасность: пароль и сессии', en: 'Security: password and sessions' },
      body: {
        ru: 'В разделе [Безопасность](/account/security):\n\n**Пароль.** Введите текущий пароль, новый (не менее 10 символов) и повторите его. После сохранения все другие устройства будут разлогинены — на них придётся войти заново.\n\nЕсли вы всегда входили без пароля (через Telegram, Google, код или Active Directory), здесь будет блок **«Задать пароль»** — текущий пароль вводить не нужно.\n\n**Сессии.** Список мест, где вы сейчас вошли: устройство, браузер и система, открыт ли портал как установленное **приложение** или во **вкладке браузера**, IP-адрес, способ входа и последняя активность. Текущее отмечено «Это устройство». Кнопка **«Завершить»** разлогинивает одно устройство, **«Завершить все, кроме этого»** — все остальные. На компьютере приложение Chrome/Edge и сам браузер делят один вход, поэтому показываются одной сессией с отметкой «Приложение и браузер».',
        en: 'In [Security](/account/security):\n\n**Password.** Enter your current password, a new one (at least 10 characters) and repeat it. After saving, all other devices are signed out — you will need to sign in there again.\n\nIf you have always signed in without a password (Telegram, Google, a code or Active Directory), you will see **“Set a password”** instead — no current password needed.\n\n**Sessions.** Where you are signed in right now: device, browser and system, whether the portal runs as the installed **app** or in a **browser tab**, IP address, sign-in method and last activity. The current one is marked “This device”. **“End”** signs one device out, **“End all except this one”** signs out all the others. On a computer the Chrome/Edge app and the browser itself share one sign-in, so they show as one session marked “App and browser”.',
      },
      steps: [
        { ru: 'Откройте «Личный кабинет» → «Безопасность».', en: 'Open “Account” → “Security”.' },
        { ru: 'Введите текущий пароль, новый пароль и повторите его.', en: 'Enter the current password, the new one and repeat it.' },
        { ru: 'Нажмите «Сохранить».', en: 'Press “Save”.' },
      ],
      example: {
        title: { ru: 'Забыли выйти на чужом компьютере', en: 'Forgot to sign out on another computer' },
        body: {
          ru: 'Ольга работала с портала в переговорной и не вышла. С рабочего ноутбука она открывает «Безопасность» и нажимает «Выйти на других устройствах» — сессия в переговорной сразу закрывается.',
          en: 'Olga used the portal in a meeting room and did not sign out. From her laptop she opens “Security” and presses “Sign out other devices” — the meeting-room session closes at once.',
        },
      },
      note: {
        ru: 'Если вы входите корпоративным логином (Active Directory), пароль меняется в системе компании, а не в портале — обратитесь в IT-поддержку.',
        en: 'If you sign in with a corporate login (Active Directory), the password is changed in the company system, not in the portal — contact IT support.',
      },
    },
    {
      id: 'telegram',
      title: { ru: 'Telegram', en: 'Telegram' },
      body: {
        ru: 'Блок **Telegram** находится в разделе [Безопасность](/account/security) (он виден, если администратор подключил бота). Привязка Telegram нужна, чтобы:\n\n- входить в портал в одно нажатие, без пароля;\n- получать коды входа от бота портала;\n- получать уведомления в Telegram.\n\nНажмите кнопку **«Войти через Telegram»** и подтвердите в окне Telegram — разрешите боту писать вам. После привязки появится ваше @имя; кнопка **«Отвязать»** убирает связь.',
        en: 'The **Telegram** block is in [Security](/account/security) (it shows when the administrator has set up the bot). Linking Telegram lets you:\n\n- sign in with one tap, without a password;\n- receive sign-in codes from the portal bot;\n- receive notifications in Telegram.\n\nPress the **“Log in with Telegram”** button and confirm in the Telegram window — allow the bot to message you. Once linked, your @name appears; **“Unlink”** removes the link.',
      },
      steps: [
        { ru: 'Откройте «Личный кабинет» → «Безопасность».', en: 'Open “Account” → “Security”.' },
        { ru: 'В блоке Telegram нажмите синюю кнопку Telegram.', en: 'In the Telegram block press the blue Telegram button.' },
        { ru: 'Подтвердите вход и разрешите боту отправлять сообщения.', en: 'Confirm and allow the bot to send you messages.' },
        { ru: 'Включите канал Telegram в «Кабинет → Уведомления».', en: 'Turn on the Telegram channel in “Account → Notifications”.' },
      ],
      example: {
        title: { ru: 'Уведомления о задачах в Telegram', en: 'Task notifications in Telegram' },
        body: {
          ru: 'Руслан редко сидит за компьютером. Он привязывает Telegram в «Безопасности», затем в «Уведомлениях» включает канал Telegram. Теперь о новом поручении бот пишет ему сразу в мессенджер.',
          en: 'Ruslan rarely sits at a computer. He links Telegram under “Security”, then turns on the Telegram channel under “Notifications”. Now the bot messages him about every new assignment right away.',
        },
      },
      note: {
        ru: 'Если вы заблокировали бота в Telegram, коды и уведомления перестанут приходить — разблокируйте его.',
        en: 'If you blocked the bot in Telegram, codes and notifications stop arriving — unblock it.',
      },
    },
    {
      id: 'connections',
      title: { ru: 'Подключения: Google и Mattermost', en: 'Connected accounts: Google and Mattermost' },
      body: {
        ru: 'В разделе [Подключения](/account/connections) подключается **Google**:\n\n- **Вход** — после подключения можно входить кнопкой «Войти через Google»;\n- **Календарь** — если администратор включил эту возможность, ваши календари Google появятся в приложении «Календарь». Отметьте галочками, какие показывать. Метка «Только чтение» значит, что в этот календарь портал не может добавлять события.\n\nКнопка **«Отключить»** выключает и вход через Google, и календарь. Если Google пишет «Доступ отозван» — нажмите «Разрешить доступ к Календарю» ещё раз.\n\n**Mattermost** отдельно привязывать не нужно: достаточно указать своё имя пользователя Mattermost в [Профиле](/account). После этого бот сможет присылать вам коды входа и уведомления.',
        en: 'In [Connected accounts](/account/connections) you connect **Google**:\n\n- **Sign-in** — once connected, you can use the “Sign in with Google” button;\n- **Calendar** — if the administrator enabled it, your Google calendars appear in the “Calendar” app. Tick which ones to show. “Read only” means the portal cannot add events to that calendar.\n\n**“Disconnect”** turns off both Google sign-in and the calendar. If Google shows “Access revoked”, press “Allow Calendar access” again.\n\n**Mattermost** needs no separate linking: just enter your Mattermost username in your [Profile](/account). The bot can then send you sign-in codes and notifications.',
      },
      steps: [
        { ru: 'Откройте «Личный кабинет» → «Подключения».', en: 'Open “Account” → “Connected accounts”.' },
        { ru: 'Нажмите «Подключить Google» и выберите рабочий аккаунт.', en: 'Press “Connect Google” and pick your work account.' },
        { ru: 'Разрешите доступ к Календарю, если Google спросит.', en: 'Allow Calendar access if Google asks.' },
        { ru: 'Отметьте календари, которые хотите видеть в портале.', en: 'Tick the calendars you want to see in the portal.' },
      ],
      note: {
        ru: 'Если раздел пишет «Внешние аккаунты недоступны», Google в портале не настроен — это делает администратор.',
        en: 'If the section says “No external accounts are available”, Google is not set up in the portal — that is up to the administrator.',
      },
    },
    {
      id: 'notifications',
      title: { ru: 'Уведомления', en: 'Notifications' },
      body: {
        ru: 'В разделе [Уведомления](/account/notifications) вы выбираете, куда кроме колокольчика присылать поручения, комментарии, приглашения и напоминания: почта, Telegram, Mattermost или push на этом устройстве. Если канал недоступен, рядом написано, чего не хватает, и есть кнопка «Исправить».\n\nПодробно — в руководстве [Уведомления](/help/notifications).',
        en: 'In [Notifications](/account/notifications) you choose where, besides the bell, assignments, comments, invitations and reminders are sent: email, Telegram, Mattermost or push on this device. If a channel is unavailable, it says what is missing and offers a “Fix” button.\n\nDetails are in the [Notifications](/help/notifications) guide.',
      },
    },
    {
      id: 'api',
      title: { ru: 'API-токены', en: 'API tokens' },
      body: {
        ru: 'Раздел [API-токены](/account/api) виден только тем, кому администратор дал это право. Токен позволяет другой программе (например, таблице или скрипту) работать с порталом от вашего имени и в пределах выбранного доступа.\n\nТокен показывается один раз — сохраните его в надёжном месте и никому не пересылайте в чат. Подробнее — в руководстве [API](/help/api).',
        en: 'The [API tokens](/account/api) section is visible only to people the administrator gave this right. A token lets another program (a spreadsheet or a script, for example) work with the portal on your behalf within the access you choose.\n\nA token is shown only once — store it safely and never paste it into a chat. More in the [API](/help/api) guide.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Не приходят уведомления в Telegram.', en: 'Telegram notifications do not arrive.' },
      a: {
        ru: 'Проверьте два шага: 1) Telegram привязан в «Кабинет → Безопасность» (там видно ваше @имя); 2) канал Telegram включён в «Кабинет → Уведомления». Также убедитесь, что вы не заблокировали бота портала в Telegram.',
        en: 'Check two steps: 1) Telegram is linked in “Account → Security” (your @name is shown there); 2) the Telegram channel is on in “Account → Notifications”. Also make sure you have not blocked the portal bot in Telegram.',
      },
    },
    {
      q: { ru: 'Не приходят уведомления на почту.', en: 'Email notifications do not arrive.' },
      a: {
        ru: 'Укажите почту в «Профиле» и сохраните, затем включите канал «Email» в «Уведомлениях». Проверьте папку «Спам».',
        en: 'Add your email in “Profile” and save, then turn on the “Email” channel in “Notifications”. Check your spam folder.',
      },
    },
    {
      q: { ru: 'Изменения в профиле не сохранились.', en: 'My profile changes were not saved.' },
      a: {
        ru: 'После правки внизу появляется панель с кнопкой «Сохранить» — её нужно нажать. Если поле подсвечено красным (например, неверный формат почты или телефона), исправьте его.',
        en: 'After editing, a bar with a “Save” button appears at the bottom — press it. If a field is highlighted in red (a wrong email or phone format, for example), fix it.',
      },
    },
    {
      q: { ru: 'Аватар не загружается.', en: 'My avatar will not upload.' },
      a: {
        ru: 'Подходят только JPG, PNG или WebP размером до 1 МБ. Уменьшите картинку или сохраните её в другом формате.',
        en: 'Only JPG, PNG or WebP up to 1 MB are accepted. Make the picture smaller or save it in another format.',
      },
    },
    {
      q: { ru: 'Можно ли сменить логин?', en: 'Can I change my username?' },
      a: {
        ru: 'Нет, логин (@имя) постоянный. Вы можете поменять отображаемое имя — именно его видят коллеги.',
        en: 'No, the username (@name) is permanent. You can change your display name — that is what colleagues see.',
      },
    },
    {
      q: { ru: 'После смены пароля меня выкинуло на телефоне.', en: 'After changing my password I was signed out on my phone.' },
      a: {
        ru: 'Так задумано: при смене пароля все остальные устройства разлогиниваются для безопасности. Просто войдите на телефоне заново с новым паролем.',
        en: 'That is by design: changing the password signs out all other devices for safety. Just sign in on the phone again with the new password.',
      },
    },
    {
      q: { ru: 'Пишет «Этот Telegram ещё не привязан».', en: 'It says “This Telegram is not linked yet”.' },
      a: {
        ru: 'Войдите другим способом (паролем или кодом), откройте «Кабинет → Безопасность» и привяжите Telegram. В следующий раз вход через Telegram сработает.',
        en: 'Sign in another way (password or code), open “Account → Security” and link Telegram. Next time Telegram sign-in will work.',
      },
    },
    {
      q: { ru: 'Не вижу свои встречи из Google Календаря.', en: 'I don’t see my Google Calendar meetings.' },
      a: {
        ru: 'В «Подключениях» проверьте, что у Google стоит зелёная метка «Календарь», и отметьте нужные календари галочками. Если метка оранжевая — нажмите «Разрешить доступ к Календарю».',
        en: 'In “Connected accounts” check that Google has the green “Calendar” tag and tick the calendars you need. If the tag is orange, press “Allow Calendar access”.',
      },
    },
  ],
  fields: {
    avatar: {
      title: { ru: 'Аватар', en: 'Avatar' },
      text: {
        ru: 'Фото, которое видят коллеги в задачах и чатах. JPG, PNG или WebP до 1 МБ; сохраняется сразу.',
        en: 'The photo colleagues see in tasks and chats. JPG, PNG or WebP up to 1 MB; saved at once.',
      },
      more: 'profile',
    },
    email: {
      title: { ru: 'Почта', en: 'Email' },
      text: {
        ru: 'Сюда приходят уведомления и коды входа по почте. Один адрес — только в одной учётной записи.',
        en: 'Notifications and email sign-in codes go here. One address can belong to one account only.',
      },
      more: 'profile',
    },
    phone: {
      title: { ru: 'Телефон', en: 'Phone' },
      text: {
        ru: 'Для кодов входа в WhatsApp. Вводите в международном формате, например +996 700 123 456.',
        en: 'For WhatsApp sign-in codes. Use international format, e.g. +996 700 123 456.',
      },
      more: 'profile',
    },
    mattermost: {
      title: { ru: 'Mattermost', en: 'Mattermost' },
      text: {
        ru: 'Ваше имя пользователя в Mattermost без @. По нему бот присылает коды входа и уведомления.',
        en: 'Your Mattermost username without @. The bot uses it to send sign-in codes and notifications.',
      },
      more: 'connections',
    },
    language: {
      title: { ru: 'Язык', en: 'Language' },
      text: {
        ru: '«Как в портале» — язык по умолчанию от администратора. Выбор сохраняется для всех ваших устройств.',
        en: '“As the portal” uses the administrator’s default. Your choice applies on all your devices.',
      },
      more: 'appearance',
    },
    theme: {
      title: { ru: 'Тема', en: 'Theme' },
      text: {
        ru: '«Системная» повторяет настройку телефона или компьютера: светлая или тёмная.',
        en: '“System” follows your phone or computer setting: light or dark.',
      },
      more: 'appearance',
    },
    regional: {
      title: { ru: 'Дата и время', en: 'Date and time' },
      text: {
        ru: 'Ваш часовой пояс и форматы. «Как в портале» — как у всех; «Как на этом устройстве» — пояс телефона или компьютера, удобно в поездках.',
        en: 'Your time zone and formats. “As the portal” matches everyone; “As on this device” uses your phone or computer zone, handy when travelling.',
      },
      more: 'regional',
    },
    password: {
      title: { ru: 'Пароль', en: 'Password' },
      text: {
        ru: 'Не менее 10 символов. После смены все другие устройства будут разлогинены.',
        en: 'At least 10 characters. After a change all other devices are signed out.',
      },
      more: 'security',
    },
    telegram: {
      title: { ru: 'Telegram', en: 'Telegram' },
      text: {
        ru: 'Привязка нужна для входа в одно нажатие, кодов от бота и уведомлений в Telegram.',
        en: 'Linking enables one-tap sign-in, codes from the bot and notifications in Telegram.',
      },
      more: 'telegram',
    },
    sessions: {
      title: { ru: 'Сессии', en: 'Sessions' },
      text: {
        ru: 'Где вы сейчас вошли: устройство, браузер или приложение, IP и активность. Незнакомый вход можно завершить.',
        en: 'Where you are signed in: device, browser or app, IP and activity. End any sign-in you do not recognise.',
      },
      more: 'security',
    },
    google: {
      title: { ru: 'Google', en: 'Google' },
      text: {
        ru: 'Вход через Google и, если включено, ваши календари Google в приложении «Календарь».',
        en: 'Sign in with Google and, if enabled, your Google calendars in the “Calendar” app.',
      },
      more: 'connections',
    },
  },
  related: ['notifications', 'start', 'api'],
};
