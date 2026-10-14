export default {
  id: 'files',
  icon: 'folder',
  title: { ru: 'Файлы', en: 'Files' },
  tagline: {
    ru: 'Личные и общие файлы, совместный доступ и публичные ссылки',
    en: 'Personal and shared files, sharing and public links',
  },
  summary: {
    ru: 'Храните рабочие документы в портале: в личной папке «Мои файлы» или в общих пространствах команды. Любым файлом или папкой можно поделиться с коллегами или отправить наружу по публичной ссылке — с паролем и сроком действия. Файлы открываются прямо в браузере: PDF, Word, Excel, картинки, видео.',
    en: 'Keep work documents in the portal: in your personal My files or in your team’s shared spaces. Share any file or folder with colleagues, or send it outside by a public link with a password and an expiry date. Files open right in the browser: PDF, Word, Excel, images, video.',
  },
  highlights: [
    {
      icon: '🗂',
      title: { ru: 'Мои файлы', en: 'My files' },
      text: { ru: 'Личное хранилище: его видите только вы, пока сами не поделитесь.', en: 'Personal storage: only you see it until you share something.' },
    },
    {
      icon: '👥',
      title: { ru: 'Общие пространства', en: 'Shared spaces' },
      text: { ru: 'Общие диски отделов со своими правами: просмотр, редактирование, управление.', en: 'Team drives with their own rules: view, edit, manage.' },
    },
    {
      icon: '🤝',
      title: { ru: 'Поделиться с коллегами', en: 'Share with colleagues' },
      text: { ru: 'Откройте файл или папку людям и группам — на просмотр или на редактирование.', en: 'Open a file or folder to people and groups, for viewing or editing.' },
    },
    {
      icon: '🔗',
      title: { ru: 'Публичные ссылки', en: 'Public links' },
      text: { ru: 'Ссылка для партнёров без входа в портал: только просмотр, приём файлов или полный доступ — с паролем и сроком.', en: 'A link for partners without a portal account: view only, a file drop box or full access, with a password and expiry.' },
    },
    {
      icon: '👁',
      title: { ru: 'Просмотр в браузере', en: 'View in the browser' },
      text: { ru: 'PDF, Office, картинки, видео и аудио открываются без скачивания; PDF — даже как презентация.', en: 'PDF, Office, images, video and audio open without downloading; PDFs even as a presentation.' },
    },
    {
      icon: '🗑',
      title: { ru: 'Корзина', en: 'Trash' },
      text: { ru: 'Удалённое хранится 30 дней — случайно удалённый файл можно вернуть.', en: 'Deleted items are kept for 30 days, so an accidental delete can be undone.' },
    },
  ],
  tips: [
    { ru: 'Перетащите файлы или целую папку из проводника прямо в окно папки — всё загрузится туда вместе с вложенными папками.', en: 'Drag files or a whole folder from Explorer straight onto a folder window: everything uploads there, sub-folders included.' },
    { ru: 'Делитесь папкой, а не отдельными файлами: всё, что вы добавите в неё позже, станет доступно автоматически.', en: 'Share a folder rather than single files: everything you add later becomes available automatically.' },
    { ru: 'Для коллег отправляйте кнопку «Ссылка» со страницы файла, а не публичную ссылку — она откроется только тем, у кого есть доступ.', en: 'For colleagues, send the Link button from the file page, not a public link: it opens only for people with access.' },
    { ru: 'Публичным ссылкам на важные документы ставьте пароль и срок действия.', en: 'Give public links to important documents a password and an expiry date.' },
    { ru: 'Кликните правой кнопкой мыши по файлу — откроется меню со всеми действиями.', en: 'Right-click a file to open the menu with every action.' },
    { ru: 'Нужен файл с файлового сервера компании? Он в модуле [Файловый сервер](/app/drive).', en: 'Need a file from the company file server? It lives in [File server](/app/drive).' },
  ],
  sections: [
    {
      id: 'my-files',
      title: { ru: 'Мои файлы и разделы', en: 'My files and places' },
      body: {
        ru: 'Слева — разделы модуля:\n\n- **Мои файлы** — ваша личная папка. Здесь можно создавать вложенные папки и хранить что угодно.\n- **Доступные мне** — всё, чем с вами или вашими группами поделились коллеги, с указанием владельца.\n- **Общие файлы** — общие пространства команд, в которые у вас есть доступ.\n- **Недавние** — последние загруженные и изменённые файлы.\n- **Корзина** — удалённые файлы.\n\nСписок можно показывать плиткой или таблицей, выделять несколько файлов сразу и перемещать или удалять их вместе. Над списком — «хлебные крошки» с путём к текущей папке. На телефоне разделы открываются из бокового меню.',
        en: 'The places are on the left:\n\n- **My files**: your personal folder. Create sub-folders and keep anything here.\n- **Shared with me**: everything colleagues shared with you or your groups, with the owner shown.\n- **Shared spaces**: team spaces you have access to.\n- **Recent**: your latest uploads and changes.\n- **Trash**: deleted files.\n\nShow the list as a grid or a table, select several files and move or delete them together. Breadcrumbs above the list show where you are. On a phone the places open from the side drawer.',
      },
      note: {
        ru: 'Файлы, загруженные в [Базу знаний](/app/kb), тоже лежат здесь — в системной папке «Мои файлы → База знаний».',
        en: 'Files uploaded to the [Knowledge Base](/app/kb) live here too, in the system folder My files → Knowledge base.',
      },
    },
    {
      id: 'upload',
      title: { ru: 'Загрузка и перетаскивание', en: 'Uploading and drag & drop' },
      body: {
        ru: 'Загружайте файлы кнопкой **«Загрузить»** или просто перетащите их из проводника в окно папки — появится подсказка «Отпустите, чтобы загрузить». Можно загружать сразу много файлов.\n\n**Целые папки** тоже можно перетащить — или выбрать через стрелку у кнопки → **«Загрузить папку»**. Вложенные папки создадутся сами, а файлы лягут на свои места; папки с тем же именем объединяются, пустые папки сохраняются. Внизу справа видно, сколько файлов уже загружено, загрузку можно отменить, а если какие-то файлы не загрузились, там же будет список с причинами. На телефоне выбрать папку нельзя — это ограничение iOS и Android.\n\nЕсли в папке уже есть файл с таким именем, ничего не перезапишется: новый файл получит имя вроде «Отчёт (2).pdf».',
        en: 'Upload with the **Upload** button, or just drag files from Explorer onto the folder window; you will see a “Drop to upload” hint. Many files can go at once.\n\n**Whole folders** can be dropped too, or picked with the arrow next to the button → **Upload folder**. Sub-folders are created for you and every file lands in its place; folders with the same name are merged, empty folders are kept. The panel in the bottom right shows how many files are done, lets you cancel, and lists any files that failed with the reason. Phones cannot pick folders (an iOS and Android limitation).\n\nIf the folder already has a file with that name, nothing is overwritten: the new file is saved as “Report (2).pdf”.',
      },
      steps: [
        { ru: 'Откройте нужную папку в «Моих файлах» или в общем пространстве.', en: 'Open the folder in My files or in a shared space.' },
        { ru: 'Нажмите «Новая папка», если нужно разложить файлы по папкам.', en: 'Press New folder if you want to sort files into folders.' },
        { ru: 'Перетащите файлы или целую папку в окно или нажмите «Загрузить» и выберите их.', en: 'Drag files or a whole folder onto the window, or press Upload and pick them.' },
      ],
      note: {
        ru: 'Администратор задаёт максимальный размер файла и допустимые типы. Если файл не загружается, проверьте его размер и формат.',
        en: 'The administrator sets the maximum file size and allowed types. If a file will not upload, check its size and format.',
      },
    },
    {
      id: 'spaces',
      title: { ru: 'Общие пространства и доступ', en: 'Shared spaces and access' },
      body: {
        ru: 'Общее пространство — это общий диск команды, например «Бухгалтерия» или «Маркетинг». Файлы в нём принадлежат пространству, а не тому, кто их загрузил, поэтому ничего не пропадёт, если сотрудник уйдёт.\n\nПри создании выберите, кто получит доступ:\n\n- **Все могут добавлять и изменять** — общий диск для всей команды;\n- **Все могут просматривать** — изменять могут только добавленные вами люди;\n- **Только я** — людей можно добавить позже.\n\nПозже права настраиваются в меню пространства → **«Доступ»**. Уровни: **Просмотр** (открывать и скачивать), **Редактирование** (загружать, переименовывать, перемещать, удалять), **Управление** (всё это плюс доступ, ссылки и корзина пространства).',
        en: 'A shared space is a team drive, such as *Accounting* or *Marketing*. Files in it belong to the space, not to whoever uploaded them, so nothing is lost when someone leaves.\n\nWhen you create one, choose who gets access:\n\n- **Everyone can add and edit**: a common drive for the whole team;\n- **Everyone can view**: only people you add can change files;\n- **Only me**: add people later.\n\nChange the rules later in the space menu → **Access**. Levels: **View** (open and download), **Edit** (upload, rename, move, delete), **Manage** (all of that plus access, links and the space’s trash).',
      },
      example: {
        title: { ru: 'Пространство для отдела продаж', en: 'A space for the sales team' },
        body: {
          ru: 'Руководитель создаёт пространство «Продажи» с вариантом «Все могут просматривать», затем в «Доступе» даёт группе «Отдел продаж» уровень «Редактирование». Вся компания видит прайс-листы и шаблоны договоров, а менять их могут только продажники.',
          en: 'The head of sales creates a *Sales* space with “Everyone can view”, then in Access gives the *Sales team* group the Edit level. The whole company sees price lists and contract templates, but only the sales team can change them.',
        },
      },
      note: {
        ru: 'Кто может создавать пространства — все или только администраторы, — решает администратор портала.',
        en: 'Whether everyone or only administrators can create spaces is up to the portal administrator.',
      },
    },
    {
      id: 'viewer',
      title: { ru: 'Просмотр файлов, PDF-слайды и презентация', en: 'Viewing files, PDF slides and presenting' },
      body: {
        ru: 'По клику файл открывается на **отдельной странице**: стрелками ‹ › можно листать соседние файлы папки, а кнопка **«Ссылка»** копирует адрес страницы для коллег (откроется у тех, у кого есть доступ).\n\nВ браузере открываются PDF, Word, Excel и другие офисные документы, картинки, текст и Markdown, видео и аудио. Неизвестные форматы просто скачиваются.\n\nУ PDF три режима: **«Страницы»** — обычная прокрутка, **«Слайды»** — по одной странице, и **«Презентация»** — на весь экран. В презентации листайте стрелками ← → или пробелом, выход — Esc.',
        en: 'A click opens the file on **its own page**: ‹ › move through the folder’s other files, and the **Link** button copies the page address for colleagues (it opens for anyone who has access).\n\nPDF, Word, Excel and other Office documents, images, text and Markdown, video and audio open in the browser. Unknown formats are simply downloaded.\n\nPDFs have three modes: **Pages** (normal scrolling), **Slides** (one page at a time) and **Present** (full screen). In a presentation use ← → or Space to move, Esc to leave.',
      },
      example: {
        title: { ru: 'Показать презентацию на встрече', en: 'Show a deck in a meeting' },
        body: {
          ru: 'Сохраните презентацию в PDF и загрузите в пространство отдела. На встрече откройте файл, нажмите «Презентация» — слайды развернутся на весь экран, и PowerPoint не понадобится.',
          en: 'Save the deck as PDF and upload it to your team’s space. In the meeting, open the file and press Present: slides fill the screen, no PowerPoint needed.',
        },
      },
      note: {
        ru: 'Администратор может переключить открытие файлов в окно поверх папки вместо отдельной страницы.',
        en: 'The administrator can switch files to open in a window over the folder instead of their own page.',
      },
    },
    {
      id: 'share',
      title: { ru: 'Поделиться с людьми', en: 'Sharing with people' },
      body: {
        ru: 'Откройте меню файла или папки → **«Поделиться…»** → вкладка **«Люди»**. Добавьте коллег или группы и выберите уровень:\n\n- **Просмотр** — открывать, просматривать и скачивать;\n- **Редактирование** — также загружать, переименовывать, перемещать и удалять внутри.\n\nДоступ к папке распространяется на всё её содержимое, включая файлы, добавленные позже. Получатели увидят уведомление и найдут файл в разделе **«Доступные мне»**.',
        en: 'Open the file or folder menu → **Share…** → the **People** tab. Add colleagues or groups and pick a level:\n\n- **View**: open, preview and download;\n- **Edit**: also upload, rename, move and delete inside.\n\nAccess to a folder covers everything in it, including files added later. Recipients get a notification and find the item under **Shared with me**.',
      },
      steps: [
        { ru: 'Правый клик по файлу или папке → «Поделиться…».', en: 'Right-click the file or folder → Share….' },
        { ru: 'В поле «Добавьте людей или группы» найдите коллегу или группу.', en: 'Find a colleague or group in “Add people or groups”.' },
        { ru: 'Выберите «Просмотр» или «Редактирование» и нажмите «Сохранить».', en: 'Choose View or Edit and press Save.' },
      ],
      example: {
        title: { ru: 'Папка для подготовки отчёта', en: 'A folder for a report' },
        body: {
          ru: 'Создайте в «Моих файлах» папку «Годовой отчёт 2026» и дайте группе «Финансы» уровень «Редактирование». Коллеги складывают туда свои таблицы, а вы видите всё в одном месте.',
          en: 'Create an *Annual report 2026* folder in My files and give the *Finance* group Edit. Colleagues drop their spreadsheets there and you see everything in one place.',
        },
      },
      note: {
        ru: 'Менять доступ, создавать ссылки и удалять навсегда может только владелец файла.',
        en: 'Only the owner can change access, create links and delete for good.',
      },
    },
    {
      id: 'links',
      title: { ru: 'Публичные ссылки: права, пароль и срок', en: 'Public links: permissions, password and expiry' },
      body: {
        ru: 'Публичная ссылка открывает файл или папку **без входа в портал** — например, для клиента или подрядчика. Ссылка на папку показывает только её содержимое, выйти за её пределы нельзя.\n\nВ меню «Поделиться…» → вкладка **«Публичные ссылки»** задайте:\n\n- **Пароль** — не короче 4 символов; посетитель вводит его один раз;\n- **Действует до** — 1, 7 или 30 дней либо конкретная дата;\n- **Что может получатель** — готовый набор прав или свои галочки (см. [Права ссылки](#link-permissions)).\n\nУ каждой ссылки видно права, число просмотров и загрузок. Её можно скопировать, показать QR-кодом, открыть «как увидит получатель», изменить, **отозвать** (и потом вернуть) или удалить. После смены пароля или отзыва все, кто уже открывал ссылку, потеряют доступ.',
        en: 'A public link opens a file or folder **without signing in**, for a client or a contractor say. A folder link shows only what is inside; visitors cannot go above it.\n\nIn Share… → the **Public links** tab, set:\n\n- **Password**: at least 4 characters; the visitor enters it once;\n- **Expires**: 1, 7 or 30 days, or a specific date;\n- **What the recipient can do**: a ready preset or your own ticks (see [Link permissions](#link-permissions)).\n\nEach link shows its permissions, views and uploads. Copy it, show it as a QR code, open it “as the recipient”, edit it, **revoke** it (and restore later) or delete it. Revoking or changing the password cuts off everyone who already opened it.',
      },
      steps: [
        { ru: 'Меню файла → «Поделиться…» → «Публичные ссылки».', en: 'File menu → Share… → Public links.' },
        { ru: 'Выберите, что может получатель, укажите пароль и срок.', en: 'Choose what the recipient can do, set a password and expiry.' },
        { ru: 'Нажмите «Создать ссылку» — она сразу скопируется.', en: 'Press Create link: it is copied at once.' },
        { ru: 'Отправьте ссылку и пароль получателю разными каналами.', en: 'Send the link and the password through different channels.' },
      ],
      example: {
        title: { ru: 'Договор для клиента на неделю', en: 'A contract for a client, for a week' },
        body: {
          ru: 'Создайте ссылку на PDF договора с правами «Только просмотр», паролем и сроком «7 дн.». Ссылку отправьте по почте, а пароль — в мессенджере. Через неделю ссылка перестанет работать сама.',
          en: 'Create a link to the contract PDF with “View only”, a password and “7 d”. Email the link and send the password by messenger. After a week the link stops working by itself.',
        },
      },
      note: {
        ru: 'Администратор может выключить публичные ссылки, сделать пароль обязательным или ограничить срок. Ссылки на файлы в корзине не работают.',
        en: 'The administrator can turn public links off, make a password mandatory or cap their lifetime. Links to items in the trash do not work.',
      },
    },
    {
      id: 'link-permissions',
      title: { ru: 'Права ссылки: смотреть, загружать, менять', en: 'Link permissions: view, upload, change' },
      body: {
        ru: 'Для каждой ссылки выберите, что может получатель:\n\n- **Только просмотр** — открывать файлы в браузере, без скачивания;\n- **Просмотр и скачивание** — как раньше, по умолчанию;\n- **Только загрузка** — «приём файлов»: получатель видит красивую страницу «Отправьте файлы для …», может отправить файлы, но не видит, что лежит в папке (только то, что отправил сам);\n- **Просмотр и загрузка** — видеть, скачивать и добавлять новые файлы;\n- **Полный доступ** — ещё и папки, переименование, замена новой версией и удаление;\n- **Настроить…** — отдельные переключатели: просмотр, скачивание, загрузка, создание папок, переименование и перемещение, замена, удаление.\n\nДля ссылок с загрузкой есть **правила**: максимальный размер файла, разрешённые типы (например `.pdf, .jpg`), общий лимит на ссылку, **спрашивать имя** (и e-mail) посетителя и **уведомлять меня** — одно уведомление за визит.\n\nЗагруженное по ссылке лежит у вас и учитывается в вашей квоте. Рядом с файлом видно «через ссылку · Имя», а в меню ссылки → **Действия** — кто что сделал. Удалённое посетителем попадает в вашу корзину; при замене предыдущая версия тоже остаётся в корзине.',
        en: 'For every link choose what the recipient can do:\n\n- **View only**: open files in the browser, no downloads;\n- **View and download**: as before, the default;\n- **Upload only**: a drop box. The recipient sees a “Send files to …” page and can send files but never sees what is in the folder (only what they sent);\n- **View and upload**: see, download and add new files;\n- **Full access**: also folders, renaming, replacing with a new version and deleting;\n- **Customize…**: separate switches for view, download, upload, create folders, rename and move, replace, delete.\n\nLinks with uploads have **rules**: maximum file size, allowed types (e.g. `.pdf, .jpg`), a total limit for the link, **ask the visitor’s name** (and e-mail) and **notify me**, one notice per visit.\n\nWhat arrives through a link is yours and counts against your quota. Files show “via link · Name”, and the link menu → **Activity** lists who did what. Items a visitor deletes go to your trash; on replace the previous version stays in the trash too.',
      },
      example: {
        title: { ru: 'Сбор документов от клиента', en: 'Collecting documents from a client' },
        body: {
          ru: 'Создайте папку «Документы клиента», ссылку «Только загрузка» с правилами «.pdf, .jpg», «до 20 МБ» и «Спрашивать имя», включите «Уведомлять меня». Клиент перетащит сканы на страницу, а вы получите одно уведомление и увидите файлы с его именем.',
          en: 'Make a folder “Client documents”, an “Upload only” link with “.pdf, .jpg”, “up to 20 MB” and “Ask the visitor’s name”, and turn on “Notify me”. The client drops the scans on the page; you get one notice and see the files with their name.',
        },
      },
      note: {
        ru: 'Выдать по ссылке можно только то, что можете сами: для загрузки и изменений нужны права на редактирование. Администратор может выключить ссылки с изменениями или требовать для них пароль.',
        en: 'You can only grant what you can do yourself: uploads and changes need edit rights. The administrator can turn off links that allow changes or require a password for them.',
      },
    },
    {
      id: 'trash',
      title: { ru: 'Корзина', en: 'Trash' },
      body: {
        ru: 'Удалённые файлы и папки попадают в **корзину** и хранятся там 30 дней (срок задаёт администратор), затем удаляются навсегда.\n\nВ корзине можно **восстановить** элемент на прежнее место, **удалить навсегда** или **очистить корзину** целиком.',
        en: 'Deleted files and folders go to the **trash** and stay there for 30 days (the administrator sets the period), then disappear for good.\n\nIn the trash you can **restore** an item to where it was, **delete it for good**, or **empty the trash**.',
      },
      note: {
        ru: 'Файл, который используется в Базе знаний, удалить нельзя: портал покажет статьи и папки, откуда его сначала нужно убрать.',
        en: 'A file used by the Knowledge Base cannot be deleted: the portal lists the articles and folders to remove it from first.',
      },
    },
    {
      id: 'search',
      title: { ru: 'Поиск', en: 'Search' },
      body: {
        ru: 'Строка **«Поиск файлов»** ищет по названию во всех местах, куда у вас есть доступ: в «Моих файлах», в доступных вам файлах и в общих пространствах. У каждого результата показан путь к папке, чтобы было понятно, где он лежит.',
        en: 'The **Search files** box searches names in every place you can open: My files, items shared with you and shared spaces. Each result shows its folder path, so you know where it lives.',
      },
    },
    {
      id: 'quota',
      title: { ru: 'Квота и место', en: 'Quota and storage' },
      body: {
        ru: 'Внизу списка разделов видно, сколько места занимают ваши личные файлы, например «120 МБ из 2 ГБ». В квоту входят «Мои файлы» **вместе с корзиной**; общие пространства не учитываются.\n\nЕсли место закончилось, удалите ненужное и **очистите корзину** — только тогда место освободится.',
        en: 'Below the places you see how much your personal files take, e.g. “120 MB of 2 GB”. The quota counts My files **including the trash**; shared spaces do not count.\n\nIf you run out, delete what you no longer need and **empty the trash**: only then is the space freed.',
      },
    },
    {
      id: 'settings',
      title: { ru: 'Настройки модуля (для администратора)', en: 'Module settings (administrators)' },
      body: {
        ru: 'Раздел **Настройки → Модули → Файлы**:\n\n- **Максимальный размер файла** — по умолчанию 200 МБ;\n- **Личное хранилище пользователя** — квота на «Мои файлы», 0 — без ограничений;\n- **Хранить удалённые файлы** — срок корзины, по умолчанию 30 дней;\n- **Разрешить любые типы файлов** или только выбранные группы (картинки, PDF, офис, текст, медиа, архивы);\n- **Кто создаёт общие пространства** — все или только администраторы;\n- **Публичные ссылки**, **Требовать пароль для каждой ссылки**, **Максимальный срок ссылки**;\n- **Кто публикует ссылки** — только владельцы или все, у кого есть доступ (не больше своих прав);\n- **Ссылки с правом изменений** и **Пароль для ссылок с изменениями**;\n- **Открытие файлов** — отдельная страница или модальное окно.\n\nПраво «Администратор файлов» даёт управление всеми общими пространствами. Личные файлы сотрудников остаются личными и для администратора.',
        en: '**Settings → Modules → Files**:\n\n- **Maximum file size**: 200 MB by default;\n- **Personal storage per user**: the My files quota, 0 means unlimited;\n- **Keep deleted files**: the trash period, 30 days by default;\n- **Allow any file type**, or only chosen groups (images, PDF, office, text, media, archives);\n- **Who creates shared spaces**: everyone or administrators only;\n- **Public links**, **Require a password on every link**, **Maximum link lifetime**;\n- **Who publishes links**: owners only or anyone with access (within their own rights);\n- **Links that allow changes** and **Password for links that allow changes**;\n- **Opening files**: own page or modal window.\n\nThe Files admin permission manages every shared space. Employees’ personal files stay private even from administrators.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Видит ли кто-нибудь мои личные файлы?', en: 'Can anyone see my personal files?' },
      a: { ru: 'Нет. «Мои файлы» видите только вы — даже администратор их не видит. Доступ появляется, только когда вы сами поделитесь файлом или создадите ссылку.', en: 'No. Only you see My files, not even administrators. Others get access only when you share an item or create a link.' },
    },
    {
      q: { ru: 'Я случайно удалил файл. Как вернуть?', en: 'I deleted a file by mistake. How do I get it back?' },
      a: { ru: 'Откройте «Корзину», найдите файл и нажмите «Восстановить». Файлы хранятся там 30 дней, если администратор не задал другой срок.', en: 'Open Trash, find the file and press Restore. Files stay there for 30 days unless the administrator set another period.' },
    },
    {
      q: { ru: 'Чем публичная ссылка отличается от кнопки «Ссылка» на странице файла?', en: 'How is a public link different from the Link button on a file page?' },
      a: { ru: 'Кнопка «Ссылка» копирует адрес страницы в портале — откроется только у коллег с доступом. Публичная ссылка открывается кем угодно без входа, поэтому её лучше защищать паролем и сроком.', en: 'The Link button copies the portal page address, which opens only for colleagues with access. A public link opens for anyone without signing in, so protect it with a password and an expiry.' },
    },
    {
      q: { ru: 'Получатель ссылки пишет, что она не открывается.', en: 'The recipient says the link does not open.' },
      a: { ru: 'Проверьте в «Поделиться…» → «Публичные ссылки» её состояние: она могла истечь или быть отозвана. Также ссылка перестаёт работать, если файл перемещён в корзину.', en: 'Check its state in Share… → Public links: it may have expired or been revoked. A link also stops working when the file is moved to the trash.' },
    },
    {
      q: { ru: 'Почему я не могу удалить файл?', en: 'Why can’t I delete a file?' },
      a: { ru: 'Либо у вас только право просмотра, либо файл используется в Базе знаний. Во втором случае портал покажет, из каких статей его нужно сначала убрать.', en: 'Either you only have view access, or the file is used in the Knowledge Base. In the second case the portal lists the articles to remove it from first.' },
    },
    {
      q: { ru: 'Пишет, что превышена квота. Что делать?', en: 'It says my quota is exceeded. What now?' },
      a: { ru: 'Удалите ненужные файлы и очистите корзину — удалённое тоже занимает место, пока лежит в корзине. Общие рабочие материалы удобнее хранить в общем пространстве: оно в вашу квоту не входит.', en: 'Delete files you no longer need and empty the trash: deleted items count until the trash is emptied. Keep team materials in a shared space, which does not count against your quota.' },
    },
    {
      q: { ru: 'Чем «Файлы» отличаются от «Файлового сервера»?', en: 'How is Files different from File server?' },
      a: { ru: '«Файлы» хранятся в самом портале. [Файловый сервер](/app/drive) — это сетевые папки компании (как диск в проводнике Windows), права на которые выдаёт ИТ-отдел.', en: 'Files are stored in the portal itself. [File server](/app/drive) shows the company network folders (like a drive in Windows Explorer), with rights granted by IT.' },
    },
  ],
  fields: {
    sharePeople: {
      title: { ru: 'Доступ для людей', en: 'Access for people' },
      text: { ru: 'Добавьте коллег или группы: «Просмотр» — открывать и скачивать, «Редактирование» — также менять и удалять. Доступ к папке действует на всё её содержимое.', en: 'Add colleagues or groups: View lets them open and download, Edit also lets them change and delete. Folder access covers everything inside.' },
      more: 'share',
    },
    linkPassword: {
      title: { ru: 'Пароль ссылки', en: 'Link password' },
      text: { ru: 'Не короче 4 символов. Отправьте пароль отдельно от ссылки, например в мессенджере.', en: 'At least 4 characters. Send it separately from the link, e.g. by messenger.' },
      more: 'links',
    },
    linkExpires: {
      title: { ru: 'Срок действия', en: 'Expiry' },
      text: { ru: 'После этой даты ссылка перестанет открываться сама. Пусто — бессрочно (если администратор не ограничил срок).', en: 'After this date the link stops working by itself. Empty means no expiry, unless the administrator capped it.' },
      more: 'links',
    },
    linkPermissions: {
      title: { ru: 'Что может получатель', en: 'What the recipient can do' },
      text: { ru: 'Выберите готовый набор или «Настроить…». «Только загрузка» — приём файлов: получатель отправляет файлы, но не видит содержимое папки.', en: 'Pick a preset or Customize…. Upload only is a drop box: the recipient sends files but never sees what is in the folder.' },
      more: 'link-permissions',
    },
    allowDownload: {
      title: { ru: 'Разрешить скачивание', en: 'Allow download' },
      text: { ru: 'Выключите, чтобы по ссылке файл можно было только посмотреть в браузере.', en: 'Switch off so the file can only be viewed in the browser.' },
      more: 'links',
    },
    spaceVisibility: {
      title: { ru: 'Кто получит доступ', en: 'Who gets access' },
      text: { ru: 'Начальные права пространства. Позже их можно точно настроить в меню пространства → «Доступ».', en: 'The space’s starting rules. Fine-tune them later in the space menu → Access.' },
      more: 'spaces',
    },
    quota: {
      title: { ru: 'Личное хранилище', en: 'Personal storage' },
      text: { ru: 'Лимит на «Мои файлы» каждого сотрудника, включая его корзину. Общие пространства в него не входят.', en: 'The limit for each person’s My files, including their trash. Shared spaces do not count.' },
      more: 'quota',
    },
    requirePassword: {
      title: { ru: 'Обязательный пароль', en: 'Mandatory password' },
      text: { ru: 'Новую публичную ссылку нельзя будет создать без пароля. Уже созданные ссылки не меняются.', en: 'New public links cannot be created without a password. Existing links are not changed.' },
      more: 'links',
    },
  },
  related: ['drive', 'kb', 'chat'],
};
