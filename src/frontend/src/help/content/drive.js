export default {
  id: 'drive',
  icon: 'server',
  title: { ru: 'Файловый сервер', en: 'File server' },
  tagline: {
    ru: 'Сетевые папки компании прямо в браузере',
    en: 'The company’s network folders right in the browser',
  },
  summary: {
    ru: 'Все папки файловых серверов компании собраны в один сетевой диск — как в проводнике Windows, только в браузере и с любого устройства. Просматривайте документы и чертежи, загружайте, переименовывайте и перемещайте файлы, скачивайте папки архивом и делитесь ими по ссылке. Что вы можете открыть и изменить, решает файловый сервер — так же, как на рабочем компьютере.',
    en: 'All the company file-server folders are gathered into one network drive: like Windows Explorer, but in the browser and on any device. View documents and drawings, upload, rename and move files, download folders as ZIP and share them by link. What you can open and change is decided by the file server, just as on your work PC.',
  },
  highlights: [
    {
      icon: '🗄',
      title: { ru: 'Все папки в одном месте', en: 'Every folder in one place' },
      text: { ru: 'Папки разных серверов — на одном экране, с вашими правами и свободным местом.', en: 'Folders from different servers on one screen, with your rights and free space.' },
    },
    {
      icon: '🔑',
      title: { ru: 'Ваша доменная учётная запись', en: 'Your domain account' },
      text: { ru: 'Вход тем же логином, что и в Windows; права те же, что в проводнике.', en: 'Sign in with your Windows login; rights are the same as in Explorer.' },
    },
    {
      icon: '👁',
      title: { ru: 'Просмотр без скачивания', en: 'View without downloading' },
      text: { ru: 'PDF, Word, Excel, картинки, видео и даже чертежи AutoCAD открываются в браузере.', en: 'PDF, Word, Excel, images, video and even AutoCAD drawings open in the browser.' },
    },
    {
      icon: '📦',
      title: { ru: 'Скачать ZIP-архивом', en: 'Download as ZIP' },
      text: { ru: 'Целая папка или несколько выбранных файлов — одним архивом.', en: 'A whole folder or a selection of files in one archive.' },
    },
    {
      icon: '🔗',
      title: { ru: 'Ссылки для партнёров', en: 'Links for partners' },
      text: { ru: 'Поделитесь файлом или папкой по ссылке — с паролем, сроком и только для сотрудников.', en: 'Share a file or folder by link, with a password, an expiry, or for employees only.' },
    },
    {
      icon: '⭐',
      title: { ru: 'Избранное и недавние', en: 'Favourites and recent' },
      text: { ru: 'Закрепите нужные папки звёздочкой и возвращайтесь к ним в один клик.', en: 'Star the folders you need and get back to them in one click.' },
    },
  ],
  tips: [
    { ru: 'Отмечайте часто нужные папки звёздочкой ☆ — они появятся в «Избранном».', en: 'Star folders you use often with ☆: they appear in Favourites.' },
    { ru: 'Кнопка «Копировать сетевой путь» даёт адрес вида \\\\сервер\\папка — вставьте его в проводник Windows.', en: 'Copy network path gives an address like \\\\server\\share: paste it into Windows Explorer.' },
    { ru: 'Сменили доменный пароль? Зайдите в «Подключения» и войдите заново.', en: 'Changed your domain password? Go to Connections and sign in again.' },
    { ru: 'Удаление на сервере необратимо — корзины нет. Перед удалением проверьте, что выбрали.', en: 'Deleting on the server is final, there is no trash. Check your selection first.' },
    { ru: 'Если нет доступа к папке, попросите руководителя или ИТ-отдел добавить вас в нужную группу.', en: 'No access to a folder? Ask your manager or IT to add you to the right group.' },
    { ru: 'Свои личные документы удобнее хранить в модуле [Файлы](/app/files).', en: 'Keep your own documents in [Files](/app/files).' },
  ],
  sections: [
    {
      id: 'connect',
      title: { ru: 'Подключение к серверу и учётные данные', en: 'Connecting to a server and credentials' },
      body: {
        ru: 'Файловый сервер пускает вас под **вашей доменной учётной записью** — той же, что для входа в Windows. Если вы вошли в портал через Active Directory, подключение обычно происходит автоматически.\n\nЕсли на плитке папки написано **«Нужен вход»**, нажмите **«Войти»** и введите имя пользователя и пароль. Имя можно указать в любом виде: ivan.petrov, CORP\\ivan.petrov или ivan@corp.local. Поле «Домен» обычно оставляют пустым.\n\nВ разделе **«Подключения»** видно, какой учётной записью открывается каждый сервер. Там же можно сменить учётную запись или нажать **«Забыть учётные данные»**.',
        en: 'The file server lets you in with **your domain account**, the same one you use to sign in to Windows. If you signed in to the portal through Active Directory, the connection is usually automatic.\n\nIf a folder tile says **Sign-in needed**, press **Sign in** and enter your user name and password. Any form works: ivan.petrov, CORP\\ivan.petrov or ivan@corp.local. The Domain field is usually left empty.\n\n**Connections** shows which account opens each server. You can switch accounts there or press **Forget credentials**.',
      },
      steps: [
        { ru: 'Откройте «Подключения» или нажмите «Войти» на плитке папки.', en: 'Open Connections, or press Sign in on a folder tile.' },
        { ru: 'Введите доменное имя пользователя и пароль.', en: 'Enter your domain user name and password.' },
        { ru: 'Нажмите «Войти» — сервер проверит данные, и папки откроются.', en: 'Press Sign in: the server checks them and the folders open.' },
      ],
      note: {
        ru: 'Пароль хранится зашифрованным, его нельзя посмотреть. Если сервер отклонил пароль (например, вы его сменили), портал больше не будет его пробовать — так доменная учётная запись не заблокируется. Просто войдите заново.',
        en: 'The password is stored encrypted and cannot be viewed. If the server rejects it (say, you changed it), the portal stops trying it, so your domain account will not get locked. Just sign in again.',
      },
    },
    {
      id: 'navigate',
      title: { ru: 'Навигация по папкам', en: 'Browsing folders' },
      body: {
        ru: 'На странице **«Обзор»** — плитки всех папок диска с вашими правами (**«Чтение и запись»** или **«Только чтение»**) и свободным местом, а ещё избранное и недавние файлы.\n\nВнутри папки:\n\n- «хлебные крошки» показывают путь, по ним можно подняться выше;\n- вид плиткой или списком, сортировка по имени, дате, размеру или типу;\n- **«Поиск в этой папке»** ищет по имени в папке и во всех её подпапках;\n- **«Показывать скрытые файлы»** — для служебных файлов;\n- **«Копировать сетевой путь»** — чтобы открыть то же место в проводнике.',
        en: 'The **Overview** page shows a tile for every folder with your rights (**Read & write** or **Read only**) and free space, plus favourites and recent files.\n\nInside a folder:\n\n- breadcrumbs show the path and take you back up;\n- grid or list view, sorted by name, date, size or type;\n- **Search in this folder** looks through the folder and all its sub-folders;\n- **Show hidden files** for system files;\n- **Copy network path** to open the same place in Explorer.',
      },
      note: {
        ru: 'Если папки нет в списке, у вас нет к ней доступа на сервере. Доступ выдаёт ИТ-отдел через группы безопасности Active Directory.',
        en: 'If a folder is missing, you have no access to it on the server. IT grants access through Active Directory security groups.',
      },
    },
    {
      id: 'files',
      title: { ru: 'Просмотр, скачивание и загрузка', en: 'Viewing, downloading and uploading' },
      body: {
        ru: 'Файл открывается на **отдельной странице** на всё окно: стрелки ‹ › листают соседние файлы, адрес страницы можно добавить в закладки или отправить коллеге.\n\nВ браузере открываются PDF (страницы, слайды и полноэкранная презентация), картинки, Word, Excel, другие офисные файлы, видео и аудио. Текстовые файлы и Markdown можно **редактировать прямо в портале** — Ctrl+S сохраняет изменения на сервере.\n\nЗагружайте файлы кнопкой или перетаскиванием. Если в папке уже есть файлы с такими именами, выберите: **«Заменить»**, **«Сохранить оба»** или **«Пропустить»**.\n\n**Папки целиком** тоже можно перетащить или выбрать через стрелку у кнопки → **«Загрузить папку»**: вложенные папки создадутся на сервере, файлы лягут на свои места. Если такая папка уже есть, содержимое объединится, а выбор «Заменить / Сохранить оба / Пропустить» относится к файлам внутри. Ход загрузки, отмена и список незагруженных файлов — в панели внизу справа.',
        en: 'A file opens on **its own page**, full window: ‹ › move through neighbouring files, and the address can be bookmarked or sent to a colleague.\n\nPDF (pages, slides and a full-screen presentation), images, Word, Excel, other Office files, video and audio open in the browser. Text and Markdown files can be **edited right in the portal**: Ctrl+S saves to the server.\n\nUpload with the button or by drag & drop. If the folder already has files with those names, choose **Replace**, **Keep both** or **Skip**.\n\n**Whole folders** can be dropped too, or picked with the arrow next to the button → **Upload folder**: sub-folders are created on the server and every file lands in its place. If the folder is already there, the contents are merged and *Replace / Keep both / Skip* applies to the files inside. Progress, cancel and the list of files that failed are in the panel in the bottom right.',
      },
      example: {
        title: { ru: 'Обновить прайс-лист', en: 'Update a price list' },
        body: {
          ru: 'Перетащите новый «Прайс.xlsx» в папку «Продажи». Портал сообщит, что такой файл уже есть, — выберите «Заменить». Если файл в этот момент открыт у коллеги в Excel, портал попросит попробовать позже.',
          en: 'Drag the new “Prices.xlsx” into *Sales*. The portal says the file already exists; choose Replace. If a colleague has it open in Excel right now, the portal asks you to try later.',
        },
      },
      note: {
        ru: 'Кнопки изменения видны только там, где сервер даёт вам право записи. В папках «Только чтение» можно просматривать и скачивать.',
        en: 'Change buttons appear only where the server gives you write access. In Read only folders you can view and download.',
      },
    },
    {
      id: 'organize',
      title: { ru: 'Переименование, перемещение и удаление', en: 'Renaming, moving and deleting' },
      body: {
        ru: 'Через меню файла (правый клик или ⋯) можно **переименовать**, **переместить или копировать** и **удалить**. Можно выделить несколько файлов и работать с ними сразу.\n\nПеремещать и копировать можно только между папками **одного сервера**. Имена не могут содержать символы \\ / : * ? " < > |.',
        en: 'The file menu (right-click or ⋯) lets you **rename**, **move or copy** and **delete**. Select several files to act on them at once.\n\nMoving and copying work only between folders of **the same server**. Names cannot contain \\ / : * ? " < > |.',
      },
      steps: [
        { ru: 'Выделите файлы и выберите «Переместить или копировать».', en: 'Select the files and choose Move or copy.' },
        { ru: 'В окне «Куда» откройте папку назначения.', en: 'Open the destination folder in the Destination window.' },
        { ru: 'Нажмите «Переместить сюда» или «Копировать сюда».', en: 'Press Move here or Copy here.' },
      ],
      note: {
        ru: 'Удаление происходит прямо на файловом сервере, корзины нет. Восстановить файл сможет только ИТ-отдел из резервной копии.',
        en: 'Deleting happens directly on the file server; there is no trash. Only IT can restore a file from backup.',
      },
    },
    {
      id: 'zip',
      title: { ru: 'Скачать ZIP-архивом', en: 'Download as ZIP' },
      body: {
        ru: 'Чтобы забрать сразу много файлов, выделите их и нажмите **«Скачать ZIP»** или выберите в меню папки **«Скачать папку ZIP-архивом»**. Архив собирается на лету, вложенные папки сохраняются.',
        en: 'To take many files at once, select them and press **Download ZIP**, or choose **Download folder as ZIP** in a folder’s menu. The archive is built on the fly and keeps sub-folders.',
      },
      example: {
        title: { ru: 'Отправить комплект документов', en: 'Send a document set' },
        body: {
          ru: 'Бухгалтеру нужно передать аудитору все акты за квартал. Она открывает папку «Акты\\2026-Q3», выбирает «Скачать папку ZIP-архивом» и прикладывает один файл к письму.',
          en: 'An accountant needs to pass all the quarter’s acts to the auditor. She opens “Acts\\2026-Q3”, chooses Download folder as ZIP and attaches one file to the email.',
        },
      },
    },
    {
      id: 'links',
      title: { ru: 'Публичные ссылки', en: 'Public links' },
      body: {
        ru: 'В меню файла или папки выберите **«Поделиться ссылкой»**. Настройте:\n\n- **Кто может открыть** — «Все, у кого есть ссылка» (партнёры и клиенты без учётной записи) или «Только сотрудники» (нужен вход в портал);\n- **Пароль** — необязательно, не короче 4 символов;\n- **Действует до** — 1, 7 или 30 дней либо дата;\n- **Разрешить скачивание** — выключите, чтобы оставить только просмотр.\n\nСсылка копируется сразу после создания. Все свои ссылки и их состояние видно в разделе **«Мои ссылки»**.',
        en: 'In a file or folder menu choose **Share by link**. Set:\n\n- **Who can open**: “Anyone with the link” (partners and clients without an account) or “Employees only” (portal sign-in required);\n- **Password**: optional, at least 4 characters;\n- **Expires**: 1, 7 or 30 days, or a date;\n- **Allow download**: switch off to allow viewing only.\n\nThe link is copied as soon as it is created. **My links** shows all your links and their state.',
      },
      example: {
        title: { ru: 'Чертежи для подрядчика', en: 'Drawings for a contractor' },
        body: {
          ru: 'Инженер делится папкой «Проект Север\\Чертежи» по ссылке для всех, с паролем и сроком 30 дней. Подрядчик смотрит DWG прямо в браузере и скачивает нужное, но не видит ничего за пределами этой папки.',
          en: 'An engineer shares “North project\\Drawings” by a link for anyone, with a password and 30 days. The contractor views the DWGs in the browser and downloads what he needs, but sees nothing outside that folder.',
        },
      },
      note: {
        ru: 'Ссылка работает от вашего имени: пока вы действующий сотрудник и у вас есть доступ к файлу на сервере. Если доступ пропадёт или вы покинете компанию, ссылка отключится автоматически.',
        en: 'A link works on your behalf: while you are an employee and have access to the item on the server. If you lose access or leave the company, the link switches off automatically.',
      },
    },
    {
      id: 'cad',
      title: { ru: 'Просмотр чертежей AutoCAD', en: 'Viewing AutoCAD drawings' },
      body: {
        ru: 'Файлы **DWG** и **DXF** открываются во встроенном CAD-просмотрщике — AutoCAD не нужен:\n\n- перетаскивайте мышью, чтобы двигать чертёж, колесо — масштаб;\n- **«Вписать в экран»** возвращает весь чертёж;\n- **«Слои»** позволяют скрыть лишнее.\n\nБольшой чертёж при первом открытии может готовиться несколько секунд.',
        en: '**DWG** and **DXF** files open in the built-in CAD viewer, no AutoCAD needed:\n\n- drag to pan, scroll to zoom;\n- **Fit to screen** shows the whole drawing again;\n- **Layers** let you hide what you do not need.\n\nA large drawing may take a few seconds the first time.',
      },
      note: {
        ru: 'Если чертёж не отображается, его формат пока не поддерживается — скачайте файл и откройте в AutoCAD.',
        en: 'If a drawing will not show, its format is not supported yet: download it and open it in AutoCAD.',
      },
    },
    {
      id: 'activity',
      title: { ru: 'Журнал действий (для администраторов)', en: 'Activity log (administrators)' },
      body: {
        ru: '**Журнал действий** показывает, кто и что делал на файловом сервере: открывал, искал, скачивал, загружал, переименовывал, перемещал, удалял, создавал ссылки и входил на сервер. Видны время, сотрудник (или посетитель по ссылке и IP), папка, путь и результат.\n\nЖурнал доступен с правом «Журнал действий файлового сервера». В меню файла или папки пункт **«История действий»** открывает журнал сразу по этому объекту.\n\nФильтры: период, поиск, сотрудники, действия, папки, результат, портал или публичные ссылки. **«Экспорт CSV»** выгружает всё, что подходит под фильтры (до 100 000 строк), для Excel.',
        en: 'The **Activity log** shows who did what on the file server: opened, searched, downloaded, uploaded, renamed, moved, deleted, created links and signed in. You see the time, the person (or link visitor and IP), folder, path and result.\n\nIt needs the “File server activity log” permission. **Activity history** in a file or folder menu opens the log filtered to that item.\n\nFilters: period, search, people, actions, folders, result, portal or public links. **Export CSV** downloads everything that matches (up to 100,000 rows) for Excel.',
      },
      example: {
        title: { ru: 'Кто удалил договор?', en: 'Who deleted the contract?' },
        body: {
          ru: 'Откройте меню папки «Договоры» → «История действий», выберите группу действий «Удаление» и период «7 дней». В списке будет видно, кто и когда удалил файл.',
          en: 'Open the *Contracts* folder menu → Activity history, pick the Deletion group and “7 days”. The list shows who deleted the file and when.',
        },
      },
      note: {
        ru: 'Повторные открытия того же файла или папки в течение нескольких минут считаются одним событием.',
        en: 'Opening the same file or folder again within a few minutes counts as one event.',
      },
    },
    {
      id: 'admin',
      title: { ru: 'Серверы и папки (для администратора)', en: 'Servers and folders (administrators)' },
      body: {
        ru: 'Раздел **Настройки → Модули → Файловый сервер** (право «Администратор файлового сервера»).\n\n**Общие настройки:** название и подзаголовок диска, открытие файлов (отдельная страница или модальное окно), «Использовать вход в портал», «Скрывать папки без доступа», максимальный размер загрузки, публичные ссылки и кто может их открывать, журнал действий и срок его хранения.\n\n**Файловый сервер:** название, адрес (DNS или IP), домен, порт 445 и способ входа:\n\n- **Личные доменные учётные записи** — рекомендуется: для каждого действуют права NTFS и группы AD;\n- **Одна служебная учётная запись** — все работают под одной записью, видимость папок ограничивают группами портала.\n\nКнопка **«Проверить»** проверяет подключение и показывает список шар.\n\n**Папка:** название на диске, шара, необязательная подпапка, путь для сотрудников (например, DFS), группы «Кому видна» и «Разрешить публичные ссылки». Папки можно упорядочить.\n\nВ блоке **«Все публичные ссылки»** видны все ссылки диска с авторами; любую можно отключить.',
        en: '**Settings → Modules → File server** (the “File server admin” permission).\n\n**General:** drive name and subtitle, opening files (own page or modal), “Use the portal sign-in”, “Hide folders without access”, maximum upload size, public links and who may open them, the activity log and how long to keep it.\n\n**A file server:** name, address (DNS or IP), domain, port 445 and the sign-in mode:\n\n- **Personal domain accounts** (recommended): NTFS rights and AD groups apply to each person;\n- **One service account**: everyone works as one account; limit folder visibility with portal groups.\n\n**Test** checks the connection and lists the shares.\n\n**A folder:** its name on the drive, the share, an optional sub-folder, the path shown to people (e.g. DFS), “Visible to” groups and “Allow public links”. Folders can be reordered.\n\n**All public links** lists every link with its author; any of them can be turned off.',
      },
      example: {
        title: { ru: 'Опубликовать папку бухгалтерии', en: 'Publish the accounting folder' },
        body: {
          ru: 'На сервере fs01 есть шара Data с папкой Departments\\Accounting. Добавьте папку: название «Бухгалтерия», шара Data, подпапка Departments\\Accounting, выключите «Разрешить публичные ссылки». Сотрудники увидят плитку «Бухгалтерия», а откроют её только те, кому сервер даёт права.',
          en: 'Server fs01 has a Data share with Departments\\Accounting inside. Add a folder: name *Accounting*, share Data, sub-folder Departments\\Accounting, “Allow public links” off. People see an *Accounting* tile, and only those the server grants rights can open it.',
        },
      },
      note: {
        ru: 'Даже администратор портала видит внутри папок только то, что разрешает ему файловый сервер.',
        en: 'Even a portal administrator sees inside folders only what the file server allows.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Какой логин и пароль вводить?', en: 'Which login and password do I enter?' },
      a: { ru: 'Те же, что для входа в рабочий компьютер с Windows (доменная учётная запись). Поле «Домен» обычно можно не заполнять.', en: 'The same ones you use for your Windows work PC (your domain account). The Domain field can usually be left empty.' },
    },
    {
      q: { ru: 'Пишет «Сервер отклонил сохранённый пароль». Что делать?', en: 'It says the server rejected the saved password. What now?' },
      a: { ru: 'Скорее всего, вы сменили доменный пароль. Откройте «Подключения» и войдите заново с новым паролем. Старый пароль портал больше не пробует, поэтому учётная запись не заблокируется.', en: 'You most likely changed your domain password. Open Connections and sign in again with the new one. The portal stops trying the old password, so your account will not get locked.' },
    },
    {
      q: { ru: 'Почему я не вижу нужную папку или вижу её с замком?', en: 'Why can’t I see a folder, or why does it have a lock?' },
      a: { ru: 'У вашей учётной записи нет прав на эту папку на сервере. Попросите руководителя или ИТ-отдел добавить вас в нужную группу безопасности.', en: 'Your account has no rights to that folder on the server. Ask your manager or IT to add you to the right security group.' },
    },
    {
      q: { ru: 'Можно ли восстановить удалённый файл?', en: 'Can I restore a deleted file?' },
      a: { ru: 'В портале — нет, корзины на файловом сервере нет. Обратитесь в ИТ-отдел: файл можно вернуть из резервной копии.', en: 'Not in the portal: the file server has no trash. Contact IT; they can restore it from backup.' },
    },
    {
      q: { ru: 'Пишет «Файл открыт в другой программе».', en: 'It says “The file is open in another program”.' },
      a: { ru: 'Кто-то из коллег держит файл открытым, например в Word или Excel. Просматривать его можно, а изменить — когда коллега закроет файл.', en: 'A colleague has the file open, e.g. in Word or Excel. You can view it, and change it once they close it.' },
    },
    {
      q: { ru: 'Почему ссылка, которую я отправил, перестала работать?', en: 'Why did a link I sent stop working?' },
      a: { ru: 'Возможно, истёк её срок, вы её отключили, файл переместили или удалили на сервере, либо у вас пропал доступ к нему. Состояние каждой ссылки видно в «Моих ссылках».', en: 'It may have expired, you may have turned it off, the file may have been moved or deleted on the server, or you lost access to it. My links shows the state of each link.' },
    },
    {
      q: { ru: 'Как открыть ту же папку в проводнике Windows?', en: 'How do I open the same folder in Windows Explorer?' },
      a: { ru: 'Нажмите «Копировать сетевой путь» и вставьте его в адресную строку проводника.', en: 'Press Copy network path and paste it into Explorer’s address bar.' },
    },
  ],
  fields: {
    linkAudience: {
      title: { ru: 'Кто может открыть', en: 'Who can open' },
      text: { ru: '«Все, у кого есть ссылка» — для партнёров и клиентов. «Только сотрудники» — откроется лишь после входа в портал.', en: '“Anyone with the link” is for partners and clients. “Employees only” opens only after signing in to the portal.' },
      more: 'links',
    },
    linkExpires: {
      title: { ru: 'Срок действия', en: 'Expiry' },
      text: { ru: 'После этой даты ссылка отключится сама. Администратор может ограничить максимальный срок.', en: 'After this date the link switches off by itself. The administrator may cap the lifetime.' },
      more: 'links',
    },
    username: {
      title: { ru: 'Имя пользователя', en: 'User name' },
      text: { ru: 'Ваш логин для входа в Windows: ivan.petrov, CORP\\ivan.petrov или ivan@corp.local.', en: 'Your Windows login: ivan.petrov, CORP\\ivan.petrov or ivan@corp.local.' },
      more: 'connect',
    },
    domain: {
      title: { ru: 'Домен', en: 'Domain' },
      text: { ru: 'Обычно оставляют пустым — подставится домен компании. Заполните, только если ИТ-отдел попросил.', en: 'Usually left empty: the company domain is used. Fill it in only if IT asked you to.' },
      more: 'connect',
    },
    authMode: {
      title: { ru: 'Как сотрудники входят', en: 'How people sign in' },
      text: { ru: 'Личные учётные записи сохраняют права NTFS и групп AD для каждого. Служебная запись даёт всем одинаковые права — ограничивайте видимость папок группами портала.', en: 'Personal accounts keep each person’s NTFS and AD group rights. A service account gives everyone the same rights, so limit folders with portal groups.' },
      more: 'admin',
    },
    activityLog: {
      title: { ru: 'Журнал действий', en: 'Activity log' },
      text: { ru: 'Записывает, кто что открывал, скачивал, изменял и удалял. Смотреть его могут обладатели права «Журнал действий файлового сервера».', en: 'Records who opened, downloaded, changed and deleted what. People with the “File server activity log” permission can read it.' },
      more: 'activity',
    },
  },
  related: ['files', 'kb'],
};
