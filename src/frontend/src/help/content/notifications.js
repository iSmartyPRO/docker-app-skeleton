export default {
  id: 'notifications',
  icon: 'bell',
  title: { ru: 'Уведомления', en: 'Notifications' },
  tagline: { ru: 'Что, куда и когда вам сообщает портал', en: 'What the portal tells you, where and when' },
  summary: {
    ru: 'Портал сообщает о задачах, встречах, упоминаниях и файлах. Всё всегда собирается в колокольчике, а дублировать ли в push, почту, Telegram, WhatsApp и Mattermost — решаете вы: по каждому событию, с тихими часами и паузой. Подпишитесь на проект или календарь, чтобы следить за ними целиком.',
    en: 'The portal tells you about tasks, meetings, mentions and files. Everything always lands in the bell, and you decide what else goes to push, e-mail, Telegram, WhatsApp and Mattermost: per event, with quiet hours and a pause. Follow a project or a calendar to keep an eye on all of it.',
  },
  highlights: [
    { icon: '🔔', title: { ru: 'Колокольчик', en: 'The bell' }, text: { ru: 'Все уведомления в одном месте в шапке портала, непрочитанные — со счётчиком.', en: 'Every notification in one place in the header, with an unread counter.' } },
    { icon: '📱', title: { ru: 'Push и мессенджеры', en: 'Push and messengers' }, text: { ru: 'Push на телефон и компьютер, почта, Telegram, WhatsApp и Mattermost — какие подключены.', en: 'Push to phone and computer, e-mail, Telegram, WhatsApp and Mattermost — whichever are connected.' } },
    { icon: '🎚️', title: { ru: 'По каждому событию', en: 'Per event' }, text: { ru: 'Таблица «событие × канал»: например, назначения — везде, смена статуса — только push.', en: 'An “event × channel” table: e.g. assignments everywhere, status changes push only.' } },
    { icon: '🌙', title: { ru: 'Тихие часы и пауза', en: 'Quiet hours and pause' }, text: { ru: 'Ночью и на выходных — без push и сообщений; пауза на час или до утра.', en: 'No pushes or messages at night or at weekends; pause for an hour or until morning.' } },
    { icon: '⭐', title: { ru: 'Подписки', en: 'Subscriptions' }, text: { ru: 'Следите за проектом или календарём целиком, не участвуя в каждой задаче.', en: 'Follow a whole project or calendar without taking part in each item.' } },
    { icon: '🧪', title: { ru: 'Проверка и история', en: 'Test and history' }, text: { ru: 'Тестовое уведомление во все каналы и история: куда ушло каждое и почему не дошло.', en: 'A test through every channel and a history: where each one went and why it did not arrive.' } },
  ],
  tips: [
    { ru: 'Сначала нажмите «Отправить тест» — сразу видно, какие каналы работают.', en: 'Start with “Send a test” — you see at once which channels work.' },
    { ru: 'Push на телефоне работают надёжнее всего, если установить портал как приложение.', en: 'Push on a phone works best when the portal is installed as an app.' },
    { ru: 'Слишком много сообщений? «Готовые наборы» → «Только важное».', en: 'Too many messages? “Presets” → “Only important”.' },
    { ru: 'Напоминания, которые вы ставите сами, приходят всегда — даже в тихие часы.', en: 'Reminders you set yourself always arrive — even during quiet hours.' },
    { ru: 'Чат без звука (⋯ → Без звука) не присылает push, но упоминания @вас приходят.', en: 'A muted chat (⋯ → Mute) sends no push, but @mentions still arrive.' },
  ],
  sections: [
    {
      id: 'channels',
      title: { ru: 'Каналы: куда приходят уведомления', en: 'Channels: where notifications go' },
      body: {
        ru: `- **Колокольчик** в шапке — всегда, ничего не теряется.
- **Push** — всплывающие уведомления на телефоне и компьютере. Включаются на каждом устройстве отдельно в [настройках уведомлений](/account/notifications) («Push на этом устройстве»). На iPhone push работают только в установленном приложении (Поделиться → «На экран Домой»).
- **Почта** — на адрес из [профиля](/account).
- **Telegram** — привяжите аккаунт в [Профиль → Безопасность](/account/security).
- **WhatsApp** — укажите мобильный телефон в [профиле](/account); сообщения придут на этот номер (если администратор подключил WhatsApp).
- **Mattermost** — укажите своё имя в Mattermost в [профиле](/account).

Карточка канала показывает его состояние: «Включено», «Выключено» (вами) или «Не подключено» — со ссылкой, где подключить. Выключенный канал не получает ничего.`,
        en: `- **The bell** in the header — always, nothing is lost.
- **Push** — pop-up notifications on phone and computer. Turned on per device in [notification settings](/account/notifications) (“Push on this device”). On iPhone push works only in the installed app (Share → “Add to Home Screen”).
- **E-mail** — to the address in your [profile](/account).
- **Telegram** — link your account in [Profile → Security](/account/security).
- **WhatsApp** — add your mobile phone in the [profile](/account); messages go to that number (if the administrator has connected WhatsApp).
- **Mattermost** — enter your Mattermost name in your [profile](/account).

A channel card shows its state: “On”, “Off” (by you) or “Not connected” — with a link to connect it. A switched-off channel gets nothing.`,
      },
      steps: [
        { ru: 'Откройте [Профиль → Уведомления](/account/notifications).', en: 'Open [Profile → Notifications](/account/notifications).' },
        { ru: 'Подключите нужные каналы по ссылкам в карточках.', en: 'Connect the channels you want using the links in the cards.' },
        { ru: 'Нажмите **Отправить тест** — под каждым каналом появится «доставлено» или причина ошибки.', en: 'Click **Send a test** — each channel shows “delivered” or the reason it failed.' },
      ],
    },
    {
      id: 'events',
      title: { ru: 'О чём сообщать', en: 'What to tell you about' },
      body: {
        ru: `В таблице «О чём» строки — события (вам поставили задачу, приглашение на встречу, упоминание в чате…), столбцы — каналы. Отметьте, где хотите видеть каждое событие. Серые столбцы — каналы, которые не подключены или выключены.

Столбец **«Портал»** — колокольчик. Снимите отметку, если событие совсем не нужно. Напоминания («всегда») отключить нельзя — они приходят туда, куда вы выбрали при их создании.

**Готовые наборы** быстро меняют всю таблицу: «Рекомендуемые», «Только важное», «Всё и везде», «Только колокольчик».`,
        en: `In the “About what” table rows are events (you got a task, a meeting invitation, a chat mention…), columns are channels. Tick where you want each event. Grey columns are channels that are not connected or switched off.

The **“Bell”** column is the portal bell. Untick it if you do not need an event at all. Reminders (“always”) cannot be switched off — they go where you chose when creating them.

**Presets** change the whole table at once: “Recommended”, “Only important”, “Everything everywhere”, “Bell only”.`,
      },
      example: {
        title: { ru: 'Меньше писем, но ничего важного не пропустить', en: 'Fewer e-mails, nothing important missed' },
        body: {
          ru: 'Выберите «Готовые наборы» → «Только важное»: назначения задач, упоминания, приглашения, просрочки и напоминания придут на почту и в Telegram, остальное — только в колокольчик. Потом точечно включите push для «Смена статуса», если хотите следить за ходом задач.',
          en: 'Choose “Presets” → “Only important”: assignments, mentions, invitations, overdue tasks and reminders go to e-mail and Telegram, the rest only to the bell. Then tick push for “Status changes” if you want to follow progress.',
        },
      },
    },
    {
      id: 'quiet',
      title: { ru: 'Тихие часы и пауза', en: 'Quiet hours and pause' },
      body: {
        ru: `**Тихие часы** — например, с 22:00 до 08:00 и все выходные — в это время push, почта и мессенджеры молчат. **Пауза** — то же самое на время: на час, 3 часа, до завтрашнего утра или до понедельника.

Колокольчик продолжает собирать всё, так что утром вы увидите, что произошло. Напоминания, которые вы поставили сами, приходят вовремя всегда.

Время тихих часов и паузы считается в вашем часовом поясе — его можно сменить в [Оформление → Дата и время](/account/appearance).`,
        en: `**Quiet hours** — e.g. 22:00 to 08:00 and all weekend — keep push, e-mail and messengers silent. **Pause** does the same for a while: an hour, 3 hours, until tomorrow morning or until Monday.

The bell keeps collecting everything, so in the morning you see what happened. Reminders you set yourself always arrive on time.

Quiet hours and the pause follow your time zone — change it in [Appearance → Date and time](/account/appearance).`,
      },
      note: { ru: 'Тихие часы считаются по часовому поясу вашего браузера — он запоминается при сохранении настроек.', en: 'Quiet hours use your browser’s time zone — it is saved when you change the settings.' },
    },
    {
      id: 'subscriptions',
      title: { ru: 'Подписки на проекты и календари', en: 'Following projects and calendars' },
      body: {
        ru: `Подписка — способ следить за целым проектом или календарём, не участвуя в каждой задаче или событии.

- **Проект задач**: кнопка 🔔 **Подписаться** на странице проекта — вы узнаете о новых и завершённых задачах.
- **Календарь**: ⋯ у общего календаря → **Сообщать об изменениях** — о новых, изменённых и удалённых событиях.

Все подписки собраны в настройках уведомлений, там же можно отписаться. Как приходят такие уведомления, настраивается строками «Проекты по подписке» и «Календари по подписке».`,
        en: `A subscription lets you follow a whole project or calendar without taking part in each task or event.

- **Task project**: 🔔 **Follow** on the project page — you hear about new and completed tasks.
- **Calendar**: ⋯ next to a shared calendar → **Notify me about changes** — new, changed and removed events.

All subscriptions are listed in notification settings, where you can also unsubscribe. How they reach you is set in the rows “Projects I follow” and “Calendars I follow”.`,
      },
      example: {
        title: { ru: 'Руководитель следит за проектом', en: 'A manager follows a project' },
        body: {
          ru: 'Руководитель отдела не участвует в каждой задаче проекта «Сайт», но хочет знать, что появляется новое и что закрыто. Он нажимает 🔔 «Подписаться» на странице проекта — и получает push о каждой новой и завершённой задаче.',
          en: 'A head of department is not in every task of the “Website” project but wants to know what is new and what is closed. They click 🔔 “Follow” on the project page and get a push for every new and completed task.',
        },
      },
    },
    {
      id: 'reminders',
      title: { ru: 'Напоминания', en: 'Reminders' },
      body: {
        ru: `Напоминание в задаче или событии вы ставите сами, поэтому оно приходит всегда — даже в тихие часы и на паузе — в выбранные при создании каналы.

При выборе времени используйте быстрые варианты («Через час», «Завтра утром») или дату и время отдельно. Под выбором портал пишет, когда именно сработает напоминание, и предупреждает, если выбранный канал не подключён.`,
        en: `You set a reminder in a task or event yourself, so it always arrives — even during quiet hours or a pause — through the channels chosen when creating it.

When choosing the time use quick options (“In an hour”, “Tomorrow morning”) or date and time separately. Under the picker the portal says exactly when the reminder fires and warns if a chosen channel is not connected.`,
      },
      example: {
        title: { ru: 'Напоминание не пришло', en: 'A reminder did not arrive' },
        body: {
          ru: 'Вы выбрали в напоминании только время, а дата осталась завтрашней — значит, оно сработает завтра. Теперь под выбором написано «Сработает … — через …», так что ошибиться сложнее. Если выбраны мессенджеры, но Telegram не привязан, портал предупредит и даст ссылку.',
          en: 'You changed only the time and the date stayed tomorrow — so it fires tomorrow. Now the picker says “Fires … — in …”, which makes this hard to miss. If messengers are chosen but Telegram is not linked, the portal warns and links to the fix.',
        },
      },
    },
    {
      id: 'history',
      title: { ru: 'История доставки', en: 'Delivery history' },
      body: {
        ru: 'Внизу настроек уведомлений — последние уведомления с отметкой по каждому каналу: зелёная — доставлено, серая — не использовалось (выключено, не подключено, тихие часы), красная — ошибка. Наведите на отметку, чтобы прочитать причину.',
        en: 'At the bottom of notification settings are the recent notifications with a mark per channel: green — delivered, grey — not used (off, not connected, quiet hours), red — failed. Hover a mark to read the reason.',
      },
    },
    {
      id: 'chat',
      title: { ru: 'Чаты', en: 'Chats' },
      body: {
        ru: 'О новых сообщениях чат присылает только push — и только если вы сейчас не смотрите этот чат. Упоминание @вас — полноценное уведомление во все выбранные каналы. Чат «без звука» не присылает push, кроме упоминаний.',
        en: 'For new messages a chat sends only a push — and only if you are not looking at that chat. A @mention is a full notification to all chosen channels. A muted chat sends no push except mentions.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Ничего не приходит в Telegram', en: 'Nothing arrives in Telegram' },
      a: {
        ru: 'Привяжите Telegram в [Профиль → Безопасность](/account/security), затем в [уведомлениях](/account/notifications) включите карточку Telegram и нажмите «Отправить тест». Если карточка «Недоступно» — бот ещё не настроен администратором.',
        en: 'Link Telegram in [Profile → Security](/account/security), then in [notifications](/account/notifications) switch the Telegram card on and click “Send a test”. If the card says “Unavailable”, the administrator has not set up the bot yet.',
      },
    },
    {
      q: { ru: 'Не приходят push на телефон', en: 'No push on my phone' },
      a: {
        ru: 'Откройте настройки уведомлений на самом телефоне и включите «Push на этом устройстве». На iPhone сначала установите портал на экран «Домой» и откройте его оттуда. Проверьте, что уведомления для браузера/приложения разрешены в настройках телефона.',
        en: 'Open notification settings on the phone itself and turn on “Push on this device”. On iPhone first add the portal to the Home Screen and open it from there. Check that notifications for the browser/app are allowed in the phone’s settings.',
      },
    },
    {
      q: { ru: 'Как получать меньше уведомлений?', en: 'How do I get fewer notifications?' },
      a: {
        ru: '«Готовые наборы» → «Только важное», включите тихие часы, отключите звук у шумных чатов, а для конкретных событий снимите отметки в таблице.',
        en: '“Presets” → “Only important”, turn on quiet hours, mute noisy chats, and untick specific events in the table.',
      },
    },
    {
      q: { ru: 'Пропадут ли уведомления в тихие часы?', en: 'Are notifications lost during quiet hours?' },
      a: { ru: 'Нет. В колокольчике они есть всегда; в тихие часы не отправляются только push, почта и мессенджеры.', en: 'No. They are always in the bell; quiet hours only hold back push, e-mail and messengers.' },
    },
    {
      q: { ru: 'Где увидеть, почему уведомление не дошло?', en: 'Where can I see why a notification did not arrive?' },
      a: { ru: 'В настройках уведомлений → «Последние уведомления»: наведите на отметку канала.', en: 'In notification settings → “Recent notifications”: hover a channel mark.' },
    },
  ],
  fields: {
    channels: { title: { ru: 'Каналы', en: 'Channels' }, text: { ru: 'Куда, кроме колокольчика, приходят уведомления. «Отправить тест» проверит все подключённые каналы.', en: 'Where notifications go besides the bell. “Send a test” checks every connected channel.' }, more: 'channels' },
    quiet: { title: { ru: 'Тихие часы и пауза', en: 'Quiet hours and pause' }, text: { ru: 'В это время push, почта и мессенджеры молчат; колокольчик собирает всё. Ваши напоминания приходят всегда.', en: 'Push, e-mail and messengers stay silent then; the bell collects everything. Your reminders always arrive.' }, more: 'quiet' },
    events: { title: { ru: 'События и каналы', en: 'Events and channels' }, text: { ru: 'Отметьте, куда приходит каждое событие. «Готовые наборы» меняют всё сразу.', en: 'Tick where each event goes. “Presets” change everything at once.' }, more: 'events' },
    subscriptions: { title: { ru: 'Подписки', en: 'Subscriptions' }, text: { ru: 'Следите за проектом (🔔 на странице проекта) или календарём (⋯ → Сообщать об изменениях).', en: 'Follow a project (🔔 on its page) or a calendar (⋯ → Notify me about changes).' }, more: 'subscriptions' },
  },
  related: ['account', 'tasks', 'calendar', 'chat'],
};
