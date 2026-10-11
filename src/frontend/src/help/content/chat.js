export default {
  id: 'chat',
  icon: 'chat',
  title: { ru: 'Чаты', en: 'Chats' },
  tagline: {
    ru: 'Переписка с коллегами, группы и обсуждения задач в реальном времени',
    en: 'Real-time messaging with colleagues, groups and task discussions',
  },
  summary: {
    ru: 'Пишите коллегам лично, собирайте групповые чаты и обсуждайте задачи прямо в их карточке. Делитесь файлами и скриншотами, отвечайте на сообщения, ставьте реакции и запускайте видеозвонок в один клик. Если вы не смотрите чат, новое сообщение придёт push-уведомлением.',
    en: 'Message colleagues one to one, set up group chats and discuss tasks right in their card. Share files and screenshots, reply to messages, react and start a video call in one click. If you are not looking at a chat, a new message reaches you as a push notification.',
  },
  highlights: [
    {
      icon: '💬',
      title: { ru: 'Личные и групповые', en: 'Direct and group' },
      text: { ru: 'Один чат на каждого коллегу и сколько угодно групп для команд и проектов.', en: 'One chat per colleague and as many groups as your teams and projects need.' },
    },
    {
      icon: '✅',
      title: { ru: 'Чаты задач', en: 'Task chats' },
      text: { ru: 'У каждой задачи своё обсуждение, и все её участники уже внутри.', en: 'Every task has its own discussion with all its participants already inside.' },
    },
    {
      icon: '📎',
      title: { ru: 'Файлы и скриншоты', en: 'Files and screenshots' },
      text: { ru: 'Скрепка, перетаскивание или Ctrl+V — картинки сразу видны в переписке.', en: 'Paperclip, drag and drop or Ctrl+V — images show right in the conversation.' },
    },
    {
      icon: '@',
      title: { ru: 'Упоминания', en: 'Mentions' },
      text: { ru: 'Наберите @ и имя — коллега получит уведомление, даже если выключил звук чата.', en: 'Type @ and a name — the colleague is notified even if they muted the chat.' },
    },
    {
      icon: '🎥',
      title: { ru: 'Видеозвонок', en: 'Video call' },
      text: { ru: 'Одна кнопка — и ссылка на встречу уже в чате для всех участников.', en: 'One button, and the meeting link is in the chat for everyone.' },
    },
    {
      icon: '🔔',
      title: { ru: 'Push без лишнего шума', en: 'Push without the noise' },
      text: { ru: 'Уведомление приходит, только когда вы не смотрите этот чат.', en: 'A notification arrives only when you are not looking at that chat.' },
    },
  ],
  tips: [
    { ru: 'Сделали скриншот? Просто нажмите **Ctrl+V** в поле сообщения.', en: 'Took a screenshot? Just press **Ctrl+V** in the message box.' },
    { ru: 'Наберите **@**, чтобы упомянуть коллегу, — он точно увидит.', en: 'Type **@** to mention a colleague — they will not miss it.' },
    { ru: '**Shift+Enter** — новая строка, **Enter** — отправить.', en: '**Shift+Enter** for a new line, **Enter** to send.' },
    { ru: 'Наведите на сообщение и нажмите «Ответить», чтобы процитировать его.', en: 'Hover a message and click “Reply” to quote it.' },
    { ru: 'Шумная группа? Меню **⋯** → «Выключить звук».', en: 'Noisy group? Menu **⋯** → “Mute”.' },
    { ru: 'Важные чаты закрепите — они всегда вверху списка.', en: 'Pin important chats — they always stay at the top of the list.' },
  ],
  sections: [
    {
      id: 'chats',
      title: { ru: 'Личные и групповые чаты', en: 'Direct and group chats' },
      body: {
        ru: 'Все разговоры собраны в разделе [Чаты](/app/chat). Сверху — закреплённые, дальше — по времени последнего сообщения. Фильтры над списком: **Все**, **Непрочитанные**, **Личные**, **Группы**, **Задачи**.\n\n- **Личный чат** — переписка двоих. С каждым коллегой он один, история сохраняется.\n- **Групповой чат** — для команды, отдела или проекта. Создатель становится его владельцем.\n\nКнопка чатов в шапке портала показывает число непрочитанных на любой странице и открывает последние разговоры.',
        en: 'All conversations live in [Chats](/app/chat). Pinned ones come first, then by the time of the last message. Filters above the list: **All**, **Unread**, **People**, **Groups**, **Tasks**.\n\n- A **direct chat** is between two people. There is one per colleague, and history is kept.\n- A **group chat** is for a team, department or project. Its creator becomes the owner.\n\nThe chat button in the portal header shows the unread count on every page and opens your recent conversations.',
      },
      steps: [
        { ru: 'Нажмите **✎** над списком чатов («Новый чат»).', en: 'Click **✎** above the chat list (“New chat”).' },
        { ru: 'Для личного чата оставьте «Сотрудник» и выберите коллегу.', en: 'For a direct chat keep “Person” and pick a colleague.' },
        { ru: 'Для группы переключитесь на «Группа», введите название и выберите участников.', en: 'For a group switch to “Group”, enter a name and choose the members.' },
        { ru: 'Нажмите «Создать группу».', en: 'Click “Create group”.' },
      ],
      example: {
        title: { ru: 'Группа отдела', en: 'A department group' },
        body: {
          ru: 'Руководитель создаёт группу «Отдел продаж» и добавляет шесть менеджеров. Теперь объявления, графики и быстрые вопросы — в одном месте, а новичков он добавит позже через панель «Участники».',
          en: 'A manager creates the group “Sales team” and adds six salespeople. Announcements, schedules and quick questions now live in one place, and new hires are added later from the “People” panel.',
        },
      },
      note: {
        ru: 'Если вкладки «Группа» нет, администратор разрешил создавать группы только администраторам чатов. Попросите его создать группу для вас.',
        en: 'If there is no “Group” tab, the administrator allowed only chat administrators to create groups. Ask them to create one for you.',
      },
    },
    {
      id: 'task-chats',
      title: { ru: 'Чаты задач', en: 'Task chats' },
      body: {
        ru: 'У каждой задачи есть свой чат — он открывается прямо в карточке задачи и виден в списке чатов с фильтром **Задачи**. Название чата берётся из задачи, например `TSK-12 · Договор`.\n\nВ чат задачи автоматически попадают события: смена статуса, новые исполнители и т. п. Они показаны серыми строками и не считаются непрочитанными.\n\nКто видит задачу, тот видит и её чат. Отдельно добавлять людей не нужно — и нельзя.',
        en: 'Every task has its own chat. It opens right in the task card and also appears in the chat list under the **Tasks** filter. Its name comes from the task, e.g. `TSK-12 · Contract`.\n\nTask events land in the chat automatically: status changes, new assignees and so on. They are shown as grey lines and do not count as unread.\n\nWhoever can see the task can see its chat. There is no separate member list to manage.',
      },
      example: {
        title: { ru: 'Вопрос по задаче', en: 'A question on a task' },
        body: {
          ru: 'Исполнитель пишет в чате задачи: «@ivanov, какой срок оплаты в договоре?» Иванов получает уведомление, отвечает прямо там, а через месяц вся история решения остаётся рядом с задачей.',
          en: 'The assignee writes in the task chat: “@ivanov, what are the payment terms in the contract?” Ivanov gets notified and replies right there, and a month later the whole story is still next to the task.',
        },
      },
      note: {
        ru: 'Чат задачи нельзя закрепить или скрыть, но звук у него можно выключить. Чтобы перейти к самой задаче, выберите в меню **⋯** «Открыть задачу».',
        en: 'A task chat cannot be pinned or hidden, but it can be muted. To go to the task itself, choose “Open the task” in the **⋯** menu.',
      },
    },
    {
      id: 'messages',
      title: { ru: 'Сообщения', en: 'Messages' },
      body: {
        ru: '**Enter** отправляет сообщение, **Shift+Enter** переносит строку.\n\nПростое форматирование:\n- `**жирный**` → **жирный**\n- `_курсив_` или `*курсив*` → курсив\n- `~~зачёркнутый~~` → зачёркнутый\n- `` `код` `` и блоки кода в тройных обратных кавычках\n- ссылки становятся кликабельными сами\n\nСообщение из одного–трёх эмодзи показывается крупно.\n\nНаведите на сообщение, чтобы увидеть действия:\n- **Ответить** — сообщение уйдёт с цитатой; клик по цитате перенесёт к оригиналу.\n- **Реакция** — 👍 ❤️ 😂 😮 🙏 🔥 и другие эмодзи; наведите на реакцию, чтобы увидеть, кто её поставил.\n- **Ещё** — копировать текст, изменить или удалить своё сообщение.',
        en: '**Enter** sends a message, **Shift+Enter** adds a new line.\n\nSimple formatting:\n- `**bold**` → **bold**\n- `_italic_` or `*italic*` → italic\n- `~~strike~~` → strikethrough\n- `` `code` `` and code blocks in triple backticks\n- links become clickable by themselves\n\nA message of one to three emoji is shown large.\n\nHover a message to see its actions:\n- **Reply** sends your message with a quote; clicking the quote jumps to the original.\n- **React** with 👍 ❤️ 😂 😮 🙏 🔥 or any emoji; hover a reaction to see who left it.\n- **More** lets you copy the text, edit or delete your own message.',
      },
      example: {
        title: { ru: 'Короткий ответ', en: 'A quick answer' },
        body: {
          ru: 'Коллега спрашивает в группе: «Кто сможет завтра провести демо?» Вместо отдельного сообщения поставьте 👍 — или нажмите «Ответить» и напишите «Я, в 11:00», чтобы ответ был привязан к вопросу.',
          en: 'A colleague asks the group: “Who can run the demo tomorrow?” Instead of a separate message, react with 👍 — or click “Reply” and write “Me, at 11:00” so the answer is tied to the question.',
        },
      },
      note: {
        ru: 'Изменять и удалять можно только свои сообщения. На месте удалённого остаётся пометка «Сообщение удалено». Владелец группы и администратор чатов могут удалить любое сообщение.',
        en: 'You can edit and delete only your own messages. A deleted one leaves a “Message deleted” stub. The group owner and chat administrators can delete any message.',
      },
    },
    {
      id: 'mentions',
      title: { ru: 'Упоминания', en: 'Mentions' },
      body: {
        ru: 'Наберите **@** — появится список участников чата. Стрелками выберите человека и нажмите **Enter** или **Tab**.\n\nУпомянутый получает уведомление по всем каналам, которые он включил в профиле: колокольчик, push, почта, Telegram, Mattermost. Это работает, **даже если у него выключен звук этого чата**. В списке чатов такой разговор отмечен значком **@**.',
        en: 'Type **@** to see the chat members. Pick a person with the arrow keys and press **Enter** or **Tab**.\n\nThe mentioned person is notified through every channel they enabled in their profile: the bell, push, email, Telegram, Mattermost. This works **even if they muted the chat**. In the chat list such a conversation shows an **@** mark.',
      },
      example: {
        title: { ru: 'Позвать нужного человека', en: 'Calling the right person' },
        body: {
          ru: 'В группе из 30 человек у многих выключен звук. Напишите «@petrova, проверь, пожалуйста, счёт» — Петрова получит уведомление, а остальных вы не потревожите.',
          en: 'In a group of 30 many people have muted the chat. Write “@petrova, please check the invoice” — Petrova gets notified and nobody else is disturbed.',
        },
      },
    },
    {
      id: 'files',
      title: { ru: 'Файлы и картинки', en: 'Files and images' },
      body: {
        ru: 'Три способа отправить файл:\n- скрепка рядом с полем сообщения;\n- перетащите файлы в окно чата;\n- вставьте скриншот или скопированный файл через **Ctrl+V**.\n\nФайлы загружаются сразу, к ним можно дописать текст и отправить вместе. Картинки показываются превью — клик открывает просмотр на весь экран. Остальные файлы — карточкой с названием и размером. Изображения, PDF, текст, аудио и видео открываются в браузере, прочее скачивается.\n\nВсё, чем поделились в чате, собрано на вкладке **Файлы** в боковой панели; кнопка ↗ покажет сообщение, где файл был отправлен.',
        en: 'Three ways to send a file:\n- the paperclip next to the message box;\n- drag files into the chat window;\n- paste a screenshot or a copied file with **Ctrl+V**.\n\nFiles upload at once; add some text and send them together. Images show a preview — click to view full screen. Other files appear as a card with name and size. Images, PDF, text, audio and video open in the browser, everything else downloads.\n\nEverything shared in a chat is on the **Files** tab of the side panel; the ↗ button shows the message where it was sent.',
      },
      note: {
        ru: 'Размер одного файла ограничен (обычно 100 МБ). Если файл больше, вы увидите сообщение «… больше N МБ».',
        en: 'The size of one file is limited (100 MB by default). If a file is larger, you will see “… is larger than N MB”.',
      },
    },
    {
      id: 'read-typing',
      title: { ru: 'Прочтение и «печатает»', en: 'Read receipts and typing' },
      body: {
        ru: '- **✓** — сообщение отправлено.\n- **✓✓** — его прочитали остальные участники.\n- «Иван печатает…» внизу чата — собеседник набирает ответ.\n- Полоса **Новые сообщения** отмечает, с какого места вы ещё не читали.\n- Кнопка со стрелкой вниз возвращает к последним сообщениям и показывает, сколько новых пришло.\n\nСообщения считаются прочитанными, когда вы долистали чат до конца на открытой вкладке.',
        en: '- **✓** — the message was sent.\n- **✓✓** — the others have read it.\n- “Ivan is typing…” at the bottom — the other person is writing.\n- The **New messages** bar marks where your unread part starts.\n- The down-arrow button takes you back to the latest messages and shows how many new ones arrived.\n\nMessages count as read once you scroll to the end of the chat in a visible tab.',
      },
    },
    {
      id: 'search',
      title: { ru: 'Поиск', en: 'Search' },
      body: {
        ru: '- **По списку чатов** — поле «Поиск по чатам» над списком ищет по названию чата и имени коллеги.\n- **Внутри чата** — значок лупы в шапке открывает «Поиск по этому чату». Введите от двух букв; клик по результату перенесёт к сообщению, даже если оно очень старое.',
        en: '- **In the chat list** — the “Search chats” box above the list finds chats by name and colleagues by name.\n- **Inside a chat** — the magnifier in the header opens “Search in this chat”. Type at least two letters; click a result to jump to the message, however old it is.',
      },
      steps: [
        { ru: 'Откройте чат и нажмите лупу в шапке.', en: 'Open the chat and click the magnifier in the header.' },
        { ru: 'Введите слово из сообщения, например «счёт».', en: 'Type a word from the message, e.g. “invoice”.' },
        { ru: 'Нажмите на найденное сообщение — оно подсветится в переписке.', en: 'Click the result — it is highlighted in the conversation.' },
      ],
    },
    {
      id: 'prefs',
      title: { ru: 'Закрепить, без звука, скрыть', en: 'Pin, mute, hide' },
      body: {
        ru: 'Меню **⋯** в шапке чата — настройки только для вас, остальные участники их не видят:\n- **Закрепить** 📌 — чат всегда вверху списка.\n- **Выключить звук** 🔕 — push по этому чату не приходят, счётчик непрочитанных становится серым. Упоминания (@) всё равно дойдут.\n- **Скрыть из списка** — чат пропадает из списка, история сохраняется.',
        en: 'The **⋯** menu in the chat header holds settings just for you; other members do not see them:\n- **Pin** 📌 keeps the chat at the top of the list.\n- **Mute** 🔕 stops push for this chat and turns its unread badge grey. Mentions (@) still reach you.\n- **Hide from the list** removes the chat from the list; history is kept.',
      },
      note: {
        ru: 'Скрытый чат вернётся сам, как только в нём появится новое сообщение. Личный чат можно вернуть и сразу: «Новый чат» → выберите коллегу.',
        en: 'A hidden chat comes back by itself as soon as a new message arrives. A direct chat can be brought back right away: “New chat” → pick the colleague.',
      },
    },
    {
      id: 'calls',
      title: { ru: 'Видеозвонок', en: 'Video call' },
      body: {
        ru: 'Кнопка с камерой в шапке чата создаёт встречу (по умолчанию Jitsi) и открывает её в новой вкладке. Ссылка «Присоединиться к звонку» тут же появляется в чате — участники подключаются одним кликом. Ничего устанавливать не нужно, достаточно браузера.',
        en: 'The camera button in the chat header creates a meeting (Jitsi by default) and opens it in a new tab. A “Join the call” link appears in the chat at once, so members join in one click. Nothing to install — a browser is enough.',
      },
      example: {
        title: { ru: 'Пятиминутка', en: 'A quick stand-up' },
        body: {
          ru: 'В группе «Отдел продаж» нажмите камеру — в чате появится карточка звонка. Коллеги, которые не смотрят чат, получат push и подключатся прямо с телефона.',
          en: 'In the “Sales team” group click the camera — a call card appears in the chat. Colleagues who are not looking at the chat get a push and join right from their phones.',
        },
      },
      note: {
        ru: 'Если кнопки с камерой нет, администратор отключил видеозвонки.',
        en: 'If there is no camera button, the administrator has turned video calls off.',
      },
    },
    {
      id: 'push',
      title: { ru: 'Push-уведомления', en: 'Push notifications' },
      body: {
        ru: 'Новое сообщение приходит push-уведомлением на телефон или компьютер, **только если вы сейчас не смотрите этот чат**. По каждому чату на устройстве висит одно уведомление — свежее заменяет предыдущее.\n\nPush не приходят:\n- по чатам с выключенным звуком (кроме упоминаний);\n- если push не включены на этом устройстве;\n- если уведомления для портала запрещены в настройках браузера или телефона.',
        en: 'A new message reaches your phone or computer as a push notification **only if you are not looking at that chat right now**. Each chat keeps one notification on the device — a newer one replaces the older.\n\nPush does not arrive:\n- for muted chats (except mentions);\n- if push is not enabled on this device;\n- if notifications for the portal are blocked in the browser or phone settings.',
      },
      steps: [
        { ru: 'На телефоне установите портал как приложение (PWA): «Поделиться» → «На экран „Домой“» на iPhone или «Установить» в Chrome на Android.', en: 'On a phone install the portal as an app (PWA): Share → “Add to Home Screen” on iPhone or “Install” in Chrome on Android.' },
        { ru: 'Откройте [Профиль → Уведомления](/account/notifications).', en: 'Open [Profile → Notifications](/account/notifications).' },
        { ru: 'Включите «Push на этом устройстве» и разрешите уведомления.', en: 'Turn on “Push on this device” and allow notifications.' },
        { ru: 'Нажмите «Проверить» — должно прийти тестовое уведомление.', en: 'Click “Test” — a test notification should arrive.' },
      ],
      note: {
        ru: 'На iPhone push работают только в установленном приложении и начиная с iOS 16.4. Push включаются отдельно на каждом устройстве.',
        en: 'On iPhone push works only in the installed app and from iOS 16.4. Push is turned on separately on each device.',
      },
    },
    {
      id: 'group-admin',
      title: { ru: 'Управление группой', en: 'Managing a group' },
      body: {
        ru: 'Создатель группы — её **владелец** (в списке участников отмечен «владелец»). Он может:\n- добавлять людей: боковая панель **Участники** → «Добавить участников»;\n- исключать участников: крестик рядом с именем;\n- переименовывать группу: меню **⋯** → «Переименовать»;\n- удалять любые сообщения.\n\nЛюбой участник может выйти сам: меню **⋯** → «Выйти из чата». Если владелец вышел, эта роль переходит к самому давнему участнику.\n\nВсе изменения состава и названия видны в чате серыми строками.',
        en: 'The person who created a group is its **owner** (marked “owner” in the member list). The owner can:\n- add people: side panel **People** → “Add people”;\n- remove members: the cross next to a name;\n- rename the group: **⋯** menu → “Rename”;\n- delete any message.\n\nAny member can leave: **⋯** menu → “Leave the chat”. If the owner leaves, the role passes to the longest-standing member.\n\nChanges to members and the name show up in the chat as grey lines.',
      },
      note: {
        ru: 'Новые участники видят всю историю группы, включая сообщения до их добавления.',
        en: 'New members see the whole group history, including messages sent before they joined.',
      },
    },
    {
      id: 'admin',
      title: { ru: 'Администрирование', en: 'Administration' },
      body: {
        ru: 'Настройки модуля: **Администрирование → Настройки → Модули → Чаты**.\n- **Включено** — чаты, кнопка в шапке и чаты задач.\n- **Групповые чаты для всех** — если выключить, группы создают только администраторы чатов.\n- **Самый большой файл** — ограничение на один файл, от 1 до 2048 МБ (по умолчанию 100).\n- **Видеозвонки** — шаблон ссылки на встречу, `{room}` заменяется уникальным кодом. По умолчанию `https://meet.jit.si/{room}`; пустое поле скрывает кнопку звонка.\n\nПраво **Администратор чатов** позволяет создавать группы, когда это ограничено, и удалять любые сообщения. Выдаётся в ролях.',
        en: 'Module settings: **Admin → Settings → Modules → Chats**.\n- **Enabled** — chats, the header button and task chats.\n- **Group chats for everyone** — when off, only chat administrators create groups.\n- **Largest file** — the limit for a single file, 1 to 2048 MB (100 by default).\n- **Video calls** — the meeting link template; `{room}` becomes a unique code. Default `https://meet.jit.si/{room}`; leave it empty to hide the call button.\n\nThe **Chat admin** permission allows creating groups when that is restricted and deleting any message. It is granted through roles.',
      },
      example: {
        title: { ru: 'Свой сервер видеосвязи', en: 'Your own video server' },
        body: {
          ru: 'В компании есть собственный Jitsi по адресу `meet.company.ru`. Укажите в поле «Видеозвонки» `https://meet.company.ru/{room}` — все новые звонки пойдут через него.',
          en: 'The company runs its own Jitsi at `meet.company.com`. Put `https://meet.company.com/{room}` in “Video calls” — every new call goes through it.',
        },
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Почему не приходят push-уведомления?', en: 'Why do I not get push notifications?' },
      a: {
        ru: 'Проверьте по порядку: push включены на этом устройстве ([Профиль → Уведомления](/account/notifications) → «Push на этом устройстве»); уведомления не запрещены в браузере или телефоне; у чата не выключен звук. На iPhone push работают только в установленном приложении. И помните: если чат открыт у вас на экране, push по нему не приходит.',
        en: 'Check in order: push is on for this device ([Profile → Notifications](/account/notifications) → “Push on this device”); notifications are not blocked in the browser or phone; the chat is not muted. On iPhone push works only in the installed app. And remember: if the chat is open on your screen, no push is sent for it.',
      },
    },
    {
      q: { ru: 'Как вернуть скрытый чат?', en: 'How do I bring back a hidden chat?' },
      a: {
        ru: 'Он вернётся сам при первом новом сообщении. Личный чат можно открыть сразу: «Новый чат» → выберите коллегу — вся история на месте.',
        en: 'It comes back by itself with the next new message. A direct chat can be opened right away: “New chat” → pick the colleague — all history is still there.',
      },
    },
    {
      q: { ru: 'Кто видит чат задачи?', en: 'Who can see a task chat?' },
      a: {
        ru: 'Все, кто видит саму задачу: постановщик, исполнители, наблюдатели и те, у кого есть доступ к задаче. Права чата всегда совпадают с правами задачи.',
        en: 'Everyone who can see the task itself: its author, assignees, watchers and anyone with access to it. The chat always follows the task’s access.',
      },
    },
    {
      q: { ru: 'Можно ли исправить или удалить отправленное сообщение?', en: 'Can I edit or delete a sent message?' },
      a: {
        ru: 'Да, своё: наведите на сообщение → «Ещё» → «Изменить» или «Удалить». У изменённого появится пометка «изменено», на месте удалённого — «Сообщение удалено».',
        en: 'Yes, your own: hover the message → “More” → “Edit” or “Delete”. An edited one is marked “edited”, a deleted one leaves “Message deleted”.',
      },
    },
    {
      q: { ru: 'Видят ли другие, что я выключил звук или закрепил чат?', en: 'Do others see that I muted or pinned a chat?' },
      a: {
        ru: 'Нет. Закрепление, выключение звука и скрытие — только ваши личные настройки.',
        en: 'No. Pinning, muting and hiding are your personal settings only.',
      },
    },
    {
      q: { ru: 'Почему я не могу создать группу?', en: 'Why can I not create a group?' },
      a: {
        ru: 'Администратор разрешил создавать группы только администраторам чатов. Попросите его создать группу или выдать вам это право.',
        en: 'The administrator allowed only chat administrators to create groups. Ask them to create the group or grant you that permission.',
      },
    },
    {
      q: { ru: 'Файл не отправляется — что делать?', en: 'A file will not send — what now?' },
      a: {
        ru: 'Скорее всего, он больше разрешённого размера — портал покажет «… больше N МБ». Сожмите файл в архив или поделитесь ссылкой из [Базы знаний](/app/kb).',
        en: 'Most likely it is over the size limit — the portal shows “… is larger than N MB”. Compress it or share a link from the [Knowledge base](/app/kb).',
      },
    },
    {
      q: { ru: 'Как выйти из группы?', en: 'How do I leave a group?' },
      a: {
        ru: 'Меню **⋯** в шапке чата → «Выйти из чата». Вернуться можно, только если вас снова добавит владелец.',
        en: '**⋯** menu in the chat header → “Leave the chat”. You can come back only if the owner adds you again.',
      },
    },
  ],
  fields: {
    groupName: {
      title: { ru: 'Название группы', en: 'Group name' },
      text: { ru: 'Видно всем участникам в списке чатов. Владелец сможет переименовать группу позже.', en: 'All members see it in their chat list. The owner can rename the group later.' },
      more: 'chats',
    },
    groupMembers: {
      title: { ru: 'Участники', en: 'Members' },
      text: { ru: 'Начните вводить имя коллеги. Вы станете владельцем группы, а добавить людей можно и потом.', en: 'Start typing a colleague’s name. You become the group owner, and you can add people later too.' },
      more: 'chats',
    },
    addMembers: {
      title: { ru: 'Добавить участников', en: 'Add people' },
      text: { ru: 'Новые участники увидят всю историю группы. Добавлять и исключать людей может владелец.', en: 'New members see the whole group history. The owner adds and removes people.' },
      more: 'group-admin',
    },
    mute: {
      title: { ru: 'Без звука', en: 'Mute' },
      text: { ru: 'Push по этому чату не приходят, но упоминания (@) дойдут. Видно только вам.', en: 'No push for this chat, but mentions (@) still reach you. Only you see this.' },
      more: 'prefs',
    },
    pin: {
      title: { ru: 'Закрепить', en: 'Pin' },
      text: { ru: 'Чат всегда будет вверху вашего списка.', en: 'The chat stays at the top of your list.' },
      more: 'prefs',
    },
    hide: {
      title: { ru: 'Скрыть из списка', en: 'Hide from the list' },
      text: { ru: 'Чат исчезнет из списка и вернётся сам с первым новым сообщением. История сохранится.', en: 'The chat leaves your list and comes back with the next new message. History is kept.' },
      more: 'prefs',
    },
    allowGroups: {
      title: { ru: 'Групповые чаты для всех', en: 'Group chats for everyone' },
      text: { ru: 'Выключите, если группы должны создавать только администраторы чатов. Существующие группы останутся.', en: 'Turn off if only chat administrators should create groups. Existing groups stay.' },
      more: 'admin',
    },
    maxUploadMb: {
      title: { ru: 'Самый большой файл', en: 'Largest file' },
      text: { ru: 'Ограничение на один файл в сообщении, от 1 до 2048 МБ. По умолчанию 100 МБ.', en: 'The limit for a single file in a message, 1 to 2048 MB. 100 MB by default.' },
      more: 'admin',
    },
    callUrl: {
      title: { ru: 'Видеозвонки', en: 'Video calls' },
      text: { ru: 'Ссылка на встречу, `{room}` заменяется уникальным кодом, например `https://meet.jit.si/{room}`. Пустое поле скрывает кнопку звонка.', en: 'The meeting link; `{room}` becomes a unique code, e.g. `https://meet.jit.si/{room}`. Leave empty to hide the call button.' },
      more: 'calls',
    },
  },
  related: ['tasks', 'notifications', 'start'],
};
