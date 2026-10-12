export default {
  id: 'kb',
  icon: 'graduation',
  title: { ru: 'База знаний', en: 'Knowledge base' },
  tagline: {
    ru: 'Инструкции, документы и ответы — в одном месте и по полочкам.',
    en: 'Instructions, documents and answers — in one place, neatly organised.',
  },
  summary: {
    ru: 'База знаний — это библиотека компании: папки любой вложенности, а в них статьи, файлы и ссылки. Документы открываются прямо в браузере, поиск находит нужное по названию и тексту, а доступ настраивается на каждую папку и материал. Папкой можно поделиться с людьми вне портала по публичной ссылке.',
    en: 'The knowledge base is your company library: folders of any depth holding articles, files and links. Documents open right in the browser, search finds things by title and text, and access is set per folder and per material. A folder can be shared with people outside the portal through a public link.',
  },
  highlights: [
    {
      icon: '📁',
      title: { ru: 'Папки любой глубины', en: 'Folders of any depth' },
      text: {
        ru: 'Дерево слева, хлебные крошки сверху, у каждой папки — своя иконка и цвет.',
        en: 'A tree on the left, breadcrumbs on top, and every folder has its own icon and colour.',
      },
    },
    {
      icon: '📝',
      title: { ru: 'Статьи, файлы и ссылки', en: 'Articles, files and links' },
      text: {
        ru: 'Пишите инструкции в удобном редакторе, загружайте документы или сохраняйте полезные сайты.',
        en: 'Write how-tos in a friendly editor, upload documents or save useful websites.',
      },
    },
    {
      icon: '👁',
      title: { ru: 'Просмотр без скачивания', en: 'View without downloading' },
      text: {
        ru: 'PDF, Word, Excel, картинки и видео открываются прямо на портале — и на телефоне тоже.',
        en: 'PDF, Word, Excel, images and video open right in the portal — on your phone too.',
      },
    },
    {
      icon: '🔎',
      title: { ru: 'Быстрый поиск', en: 'Quick search' },
      text: {
        ru: 'Ищет по названиям папок и материалов, описаниям, именам файлов и тексту статей.',
        en: 'Searches folder and material names, descriptions, file names and article text.',
      },
    },
    {
      icon: '🔐',
      title: { ru: 'Гибкий доступ', en: 'Flexible access' },
      text: {
        ru: 'Просмотр, редактирование или управление — для всех, группы, роли или конкретного человека.',
        en: 'View, edit or manage — for everyone, a group, a role or a specific person.',
      },
    },
    {
      icon: '🔗',
      title: { ru: 'Публичные ссылки', en: 'Public links' },
      text: {
        ru: 'Откройте папку партнёру или новичку без входа — с паролем и сроком действия.',
        en: 'Open a folder to a partner or a new hire without sign-in — with a password and an expiry date.',
      },
    },
  ],
  tips: [
    {
      ru: 'Перетащите файлы мышкой прямо в открытую папку — загрузятся сразу несколько.',
      en: 'Drag files straight into an open folder — several upload at once.',
    },
    {
      ru: 'В редакторе статьи включите режим «Рядом», чтобы видеть результат, пока пишете.',
      en: 'In the article editor switch to “Split” to see the result while you type.',
    },
    {
      ru: 'Заполняйте «Описание» — по нему тоже работает поиск, и коллеги быстрее поймут, что внутри.',
      en: 'Fill in the “Description” — search uses it too, and colleagues see at a glance what is inside.',
    },
    {
      ru: 'Отключите «Наследовать доступ», чтобы сделать папку закрытой только для нужных людей.',
      en: 'Turn off “Inherit access” to make a folder private to just the right people.',
    },
    {
      ru: 'PDF можно показать как презентацию: кнопка «Презентация» откроет слайды на весь экран.',
      en: 'A PDF can be shown as a presentation: the “Present” button opens full-screen slides.',
    },
    {
      ru: 'Не нужна ссылка больше? Нажмите «Отозвать» — её можно будет восстановить.',
      en: 'Link no longer needed? Click “Revoke” — you can restore it later.',
    },
  ],
  sections: [
    {
      id: 'folders',
      title: { ru: 'Структура папок', en: 'Folder structure' },
      body: {
        ru: 'Всё в базе знаний лежит в папках. Папки можно вкладывать друг в друга на любую глубину.\n\n- **Дерево** слева показывает все доступные вам папки (на телефоне — выдвижная панель).\n- **Хлебные крошки** сверху помогают вернуться на уровень выше.\n- **Плитки** или **Список** — выберите удобный вид папки.\n- У каждой папки есть **Название**, **Описание**, **Цвет** и **Иконка**. Если цвет или иконку не выбирать, используется вариант «По умолчанию» из настроек модуля.\n\nДействия с папкой — в меню «Действия»: «Настройки папки», «Переместить», «Доступ…», «Публичные ссылки…» и удаление.',
        en: 'Everything in the knowledge base lives in folders. Folders can be nested to any depth.\n\n- The **tree** on the left shows every folder you can access (a slide-out panel on phones).\n- **Breadcrumbs** on top take you one level up.\n- **Grid** or **List** — pick the view you like.\n- Every folder has a **Name**, **Description**, **Colour** and **Icon**. If you leave colour or icon unset, the “Default” from the module settings is used.\n\nFolder actions are in the “Actions” menu: “Folder settings”, “Move”, “Access…”, “Public links…” and delete.',
      },
      steps: [
        { ru: 'Откройте папку, в которой нужна новая (или главную страницу базы).', en: 'Open the folder that should contain the new one (or the base home page).' },
        { ru: 'Нажмите «Добавить» → «Новая папка».', en: 'Click “Add” → “New folder”.' },
        { ru: 'Введите название, при желании — описание, цвет и иконку. Предпросмотр сразу покажет, как она будет выглядеть.', en: 'Enter a name and, if you like, a description, colour and icon. The preview shows how it will look.' },
        { ru: 'Нажмите «Создать».', en: 'Click “Create”.' },
      ],
      example: {
        title: { ru: 'Пример структуры', en: 'Sample structure' },
        body: {
          ru: '- 📘 **Новичкам** — первый день, контакты, правила офиса\n- 📊 **Бухгалтерия** → Шаблоны договоров, Регламенты\n- 🛠 **ИТ** → Как подключить VPN, Принтеры\n\nСиняя иконка для общих тем, зелёная для отделов — так папки легко различать с первого взгляда.',
          en: '- 📘 **New hires** — first day, contacts, office rules\n- 📊 **Accounting** → Contract templates, Policies\n- 🛠 **IT** → How to set up VPN, Printers\n\nBlue for general topics, green for departments — folders are easy to tell apart at a glance.',
        },
      },
      note: {
        ru: 'Удаление папки удаляет и всё внутри: вложенные папки, материалы и публичные ссылки. Файлы, загруженные через «Файлы», при этом остаются в модуле «Файлы».',
        en: 'Deleting a folder also deletes everything inside: subfolders, materials and public links. Files stored in the Files module stay there.',
      },
    },
    {
      id: 'materials',
      title: { ru: 'Материалы: статьи, файлы и ссылки', en: 'Materials: articles, files and links' },
      body: {
        ru: 'Внутри папок лежат материалы трёх видов:\n\n- **Статья** — текст прямо на портале: инструкция, регламент, ответ на частый вопрос. Можно вставлять картинки и прикреплять файлы.\n- **Файл** — любой документ: PDF, Word, Excel, презентация, картинка, видео. Открывается в браузере.\n- **Ссылка** — адрес внешнего сайта (только `http` или `https`), например, портала налоговой или сервиса бронирования.\n\nВсё добавляется кнопкой «Добавить»: «Загрузить файлы», «Добавить из Файлов», «Новая статья», «Новая ссылка». Материал можно изменить, переименовать, переместить в другую папку или удалить — через меню материала.',
        en: 'Folders hold three kinds of materials:\n\n- **Article** — text right in the portal: an instruction, a policy, an answer to a common question. You can embed pictures and attach files.\n- **File** — any document: PDF, Word, Excel, slides, image, video. It opens in the browser.\n- **Link** — the address of an external site (`http` or `https` only), e.g. the tax portal or a booking service.\n\nEverything is added with the “Add” button: “Upload files”, “Add from Files”, “New article”, “New link”. A material can be edited, renamed, moved to another folder or deleted from its menu.',
      },
      steps: [
        { ru: 'Откройте папку и нажмите «Добавить».', en: 'Open a folder and click “Add”.' },
        { ru: 'Выберите вид: «Загрузить файлы», «Новая статья» или «Новая ссылка».', en: 'Pick a kind: “Upload files”, “New article” or “New link”.' },
        { ru: 'Заполните «Заголовок» и при желании «Описание» — оно видно в списке и участвует в поиске.', en: 'Fill in the “Title” and optionally the “Description” — it shows in the list and is searchable.' },
        { ru: 'Нажмите «Создать».', en: 'Click “Create”.' },
      ],
    },
    {
      id: 'editor',
      title: { ru: 'Редактор статей', en: 'Article editor' },
      body: {
        ru: 'У статьи два редактора — переключатель над текстом:\n\n- **Визуальный** (по умолчанию для новых статей) — как в обычном документе: заголовки, жирный, курсив, подчёркивание, маркер, списки, чек-листы, цитаты, код, выравнивание, ссылки и таблицы. **Картинки и файлы** можно вставить из буфера (Ctrl+V), перетащить мышью прямо в текст, загрузить с компьютера или выбрать из Файлов (кнопки 🖼 и 📎). **Щёлкните по картинке** — появится панель: размер (S, M, L, 100% или «Авто» — исходный), положение относительно текста (по центру, слева, справа или **с обтеканием** слева/справа — текст идёт рядом с картинкой; на телефоне такие картинки показываются на всю ширину), подпись под картинкой, описание (alt — для незрячих и поиска), ссылка, замена, открыть оригинал, скачать и удалить. Размер можно менять и мышью/пальцем, потянув за уголок; двойной щелчок добавляет подпись, Delete удаляет картинку. Читатели открывают картинку во весь экран щелчком. Кнопка ⤢ раскрывает редактор во весь экран, Esc — обратно.\n- **Markdown** — простой текст с разметкой и панелью кнопок. Три режима сверху справа:\n\n- **Текст** — только поле ввода;\n- **Рядом** — текст и готовый вид бок о бок;\n- **Просмотр** — как статью увидят читатели.\n\nЕсли вы знакомы с разметкой Markdown, можно писать её напрямую: `# Заголовок`, `**жирный**`, `- пункт списка`.\n\nПереключить уже написанную статью можно в любой момент: содержание сохранится; при переходе в Markdown пропадут только выравнивание и выделение маркером, а таблицы и картинки с размером, положением или подписью останутся в виде HTML.',
        en: 'An article has two editors — the switch is above the text:\n\n- **Visual** (the default for new articles) — like a regular document: headings, bold, italic, underline, highlight, lists, checklists, quotes, code, alignment, links and tables. **Pictures and files** can be pasted (Ctrl+V), dragged right into the text, uploaded from the computer or chosen from Files (the 🖼 and 📎 buttons). **Click a picture** to get its toolbar: size (S, M, L, 100% or “Auto” — the original), position relative to the text (centred, left, right, or **wrapped** left/right — the text flows beside the picture; on phones wrapped pictures take the full width), a caption, a description (alt text, for screen readers and search), a link, replace, open the original, download and delete. You can also drag a corner to resize; double-click adds a caption, Delete removes the picture. Readers click a picture to see it full screen. ⤢ opens the editor full screen, Esc returns.\n- **Markdown** — plain text with marks and a toolbar. Three modes in the top right:\n\n- **Text** — just the input;\n- **Split** — text and result side by side;\n- **Preview** — the article as readers see it.\n\nIf you know Markdown, type it directly: `# Heading`, `**bold**`, `- list item`.\n\nA written article can be switched at any time: the content stays; going to Markdown drops only alignment and highlights; tables and pictures with a size, position or caption stay as HTML.',
      },
      example: {
        title: { ru: 'Короткая инструкция', en: 'A short how-to' },
        body: {
          ru: '`## Как заказать пропуск для гостя`\n\n`1. Откройте форму на сайте охраны`\n`2. Укажите **ФИО** и время визита`\n`3. Отправьте до 17:00 накануне`\n\nВ режиме «Просмотр» это превратится в заголовок и нумерованный список с выделенным словом «ФИО».',
          en: '`## How to order a guest pass`\n\n`1. Open the form on the security site`\n`2. Enter the **full name** and visit time`\n`3. Submit before 5 pm the day before`\n\nIn “Preview” this becomes a heading and a numbered list with “full name” in bold.',
        },
      },
    },
    {
      id: 'attachments',
      title: { ru: 'Картинки и вложения в статьях', en: 'Pictures and attachments in articles' },
      body: {
        ru: 'Когда включён модуль [Файлы](/app/files), к статье можно добавить файлы двумя способами:\n\n- **📎 Файл** на панели редактора — вставляет файл прямо в текст. Картинка отображается в статье, любой другой файл становится ссылкой.\n- **Вложения → «Прикрепить файлы»** под редактором — файлы показываются списком под статьёй.\n\nФайлы, вставленные в текст, прикрепляются автоматически. Читателям не нужен доступ к этим файлам в «Файлах» — достаточно доступа к статье.',
        en: 'When the [Files](/app/files) module is on, you can add files to an article in two ways:\n\n- **📎 File** on the editor toolbar inserts a file into the text. A picture is shown in the article; any other file becomes a link.\n- **Attachments → “Attach files”** below the editor lists files under the article.\n\nFiles inserted in the text are attached automatically. Readers do not need access to these files in Files — access to the article is enough.',
      },
      steps: [
        { ru: 'Поставьте курсор туда, где должна быть картинка.', en: 'Put the cursor where the picture should go.' },
        { ru: 'Нажмите «📎 Файл» и выберите файл из «Файлов».', en: 'Click “📎 File” and pick a file from Files.' },
        { ru: 'Нажмите «Вставить» — картинка появится в тексте.', en: 'Click “Insert” — the picture appears in the text.' },
      ],
      example: {
        title: { ru: 'Инструкция со скриншотами', en: 'A how-to with screenshots' },
        body: {
          ru: 'В статье «Настройка почты на телефоне» после каждого шага вставлен скриншот через «📎 Файл», а в «Вложениях» лежит PDF-памятка для печати.',
          en: 'In “Setting up mail on your phone” a screenshot is inserted after each step with “📎 File”, and a printable PDF cheat sheet sits in “Attachments”.',
        },
      },
    },
    {
      id: 'viewers',
      title: { ru: 'Просмотр документов и PDF', en: 'Viewing documents and PDFs' },
      body: {
        ru: 'Большинство файлов открываются прямо на портале, скачивать их не нужно:\n\n- **PDF** — миниатюры страниц, «По ширине» / «Страница целиком», масштаб, переход к странице, выделение и копирование текста, «Во весь экран». Кнопка **«Презентация»** показывает документ слайдами: ← → или Пробел — листать, Esc — выход.\n- **Картинки** — галерея с увеличением, перетаскиванием и листанием (на телефоне — жестами).\n- **Word (.docx)** — показывается в браузере.\n- **Excel и CSV** — таблица с листами (первые 3000 строк).\n- **PowerPoint, старые форматы .doc / .xls, OpenDocument, RTF** — показываются как PDF, если администратор подключил сервер конвертации.\n- **Текст и Markdown**, **видео и аудио** — встроенный просмотр и плеер.\n\nДля остальных форматов показывается карточка с кнопкой «Скачать».',
        en: 'Most files open right in the portal, no download needed:\n\n- **PDF** — page thumbnails, “Fit width” / “Fit page”, zoom, jump to page, select and copy text, “Full screen”. The **“Present”** button shows the document as slides: ← → or Space to flip, Esc to exit.\n- **Images** — a gallery with zoom, pan and swipe (gestures on phones).\n- **Word (.docx)** — rendered in the browser.\n- **Excel and CSV** — a sheet grid with tabs (first 3,000 rows).\n- **PowerPoint, legacy .doc / .xls, OpenDocument, RTF** — shown as PDF when the administrator has connected a conversion server.\n- **Text and Markdown**, **video and audio** — built-in viewer and player.\n\nOther formats show a card with a “Download” button.',
      },
      note: {
        ru: 'Видите «для просмотра нужен сервер конвертации»? Файл можно скачать, а для просмотра в браузере попросите администратора подключить конвертацию документов.',
        en: 'Seeing “a conversion server is needed to view”? You can still download the file; ask your administrator to connect document conversion for in-browser viewing.',
      },
    },
    {
      id: 'search',
      title: { ru: 'Поиск', en: 'Search' },
      body: {
        ru: 'Строка «Поиск по базе знаний» вверху ищет сразу везде:\n\n- названия и описания папок;\n- заголовки и описания материалов;\n- имена файлов;\n- текст статей.\n\nВ результатах — только то, к чему у вас есть доступ. Закрытые папки и материалы в поиске не появляются.',
        en: 'The “Search the knowledge base” box at the top looks everywhere at once:\n\n- folder names and descriptions;\n- material titles and descriptions;\n- file names;\n- article text.\n\nResults include only what you can access. Private folders and materials never show up.',
      },
      example: {
        title: { ru: 'Найти по слову из текста', en: 'Find by a word from the text' },
        body: {
          ru: 'Ищете, как подключиться к Wi-Fi гостевой сети? Введите **wi-fi** — найдётся статья «Сеть в офисе», даже если в заголовке этого слова нет, но оно есть в тексте.',
          en: 'Looking for how to join the guest Wi-Fi? Type **wi-fi** — the “Office network” article is found even if the word is only in the text, not the title.',
        },
      },
      note: {
        ru: 'Содержимое PDF и Word-файлов поиск не читает — поэтому полезно заполнять у файлов понятное «Описание».',
        en: 'Search does not read inside PDF and Word files — so give files a clear “Description”.',
      },
    },
    {
      id: 'access',
      title: { ru: 'Доступ к папкам и материалам', en: 'Access to folders and materials' },
      body: {
        ru: 'Доступ настраивается на трёх уровнях: на всю базу («Доступ к базе» на главной), на папку и на отдельный материал («Доступ…» в меню). Каждый уровень включает предыдущий:\n\n- **Просмотр** — открывать и скачивать;\n- **Редактирование** — плюс добавлять, переименовывать, перемещать и удалять материалы;\n- **Управление** — плюс менять доступ, делиться ссылками и удалять папки.\n\nДоступ выдаётся: «Все вошедшие», группе, роли или конкретному человеку.\n\n**Наследование.** По умолчанию папка получает доступ от родительской, а записи в ней его только расширяют. Если выключить «Наследовать доступ», папка становится **закрытой**: в ней действуют только её собственные записи, а вложенные папки наследуют уже от неё.',
        en: 'Access is set at three places: the whole base (“Access to the base” on the home page), a folder, and a single material (“Access…” in the menu). Each level includes the one before:\n\n- **View** — open and download;\n- **Edit** — plus add, rename, move and delete materials;\n- **Manage** — plus change access, share links and delete folders.\n\nAccess can be given to “Everyone signed in”, a group, a role or a specific person.\n\n**Inheritance.** By default a folder gets its parent’s access, and its own entries only add to it. Turn off “Inherit access” and the folder becomes **private**: only its own entries apply, and subfolders inherit from it.',
      },
      steps: [
        { ru: 'Откройте папку и выберите «Доступ…» (или кнопку «Доступ»).', en: 'Open a folder and choose “Access…” (or the “Access” button).' },
        { ru: 'В поле «Добавить человека, группу или роль…» выберите, кому открыть доступ.', en: 'In “Add a person, group or role…” pick who gets access.' },
        { ru: 'Выберите уровень: «Просмотр», «Редактирование» или «Управление».', en: 'Choose the level: “View”, “Edit” or “Manage”.' },
        { ru: 'Чтобы сделать папку закрытой, выключите «Наследовать доступ». Нажмите «Сохранить».', en: 'To make the folder private, turn off “Inherit access”. Click “Save”.' },
      ],
      example: {
        title: { ru: 'Закрытая папка для руководителей', en: 'A private folder for managers' },
        body: {
          ru: 'Папка «Зарплаты и премии»: выключите «Наследовать доступ», добавьте группу «Руководители» с уровнем «Просмотр» и бухгалтера — с «Редактированием». Остальные сотрудники папку даже не увидят — ни в дереве, ни в поиске.',
          en: 'Folder “Salaries and bonuses”: turn off “Inherit access”, add the “Managers” group with “View” and the accountant with “Edit”. Other staff will not even see the folder — not in the tree, not in search.',
        },
      },
      note: {
        ru: 'Заблокировать себя нельзя: если вы сохраните правила, убирающие ваше «Управление», оно у вас останется. Администраторы базы знаний управляют всеми папками всегда.',
        en: 'You cannot lock yourself out: if you save rules that remove your “Manage”, you keep it. Knowledge base administrators can always manage every folder.',
      },
    },
    {
      id: 'sharing',
      title: { ru: 'Публичные ссылки на папку', en: 'Public links to a folder' },
      body: {
        ru: 'Публичная ссылка открывает папку людям **без входа на портал**: подрядчику, кандидату, клиенту. По ссылке видно содержимое папки и всё, что наследует от неё доступ. **Закрытые** вложенные папки и материалы по ссылке не видны никогда.\n\nНастройки ссылки:\n\n- **Название ссылки** — его увидит посетитель вместо названия папки;\n- **Адрес** — понятное имя, например `/s/onboarding`. Портал сразу проверит, свободно ли оно, и предложит вариант, если занято;\n- **Пароль** — посетитель вводит его один раз;\n- **Срок действия** — «Бессрочно», 1, 7, 30 дней или конкретная дата;\n- **Разрешить скачивание** — если выключить, файлы можно будет только смотреть.\n\nУ одной папки может быть несколько ссылок с разными настройками. Для каждой видно число просмотров. Ссылку можно скопировать, изменить, «Отозвать» (и потом «Восстановить») или удалить.',
        en: 'A public link opens a folder to people **without a portal sign-in**: a contractor, a candidate, a client. The link shows the folder and everything that inherits its access. **Private** subfolders and materials are never visible through a link.\n\nLink settings:\n\n- **Link title** — visitors see it instead of the folder name;\n- **Address** — a readable name such as `/s/onboarding`. The portal checks availability as you type and suggests an alternative if taken;\n- **Password** — visitors enter it once;\n- **Expiry** — “Never”, 1, 7, 30 days or a specific date;\n- **Allow downloads** — turn off for view-only.\n\nA folder can have several links with different settings. Each shows its view count. A link can be copied, edited, “Revoked” (and later “Restored”) or deleted.',
      },
      steps: [
        { ru: 'Откройте папку и нажмите «Поделиться» (или «Публичные ссылки…» в меню).', en: 'Open the folder and click “Share” (or “Public links…” in the menu).' },
        { ru: 'Проверьте название и адрес ссылки.', en: 'Check the link title and address.' },
        { ru: 'При необходимости включите пароль и выберите срок действия.', en: 'Turn on a password and choose an expiry if needed.' },
        { ru: 'Нажмите «Создать ссылку», затем скопируйте её кнопкой ⧉ и отправьте.', en: 'Click “Create link”, then copy it with ⧉ and send it.' },
      ],
      example: {
        title: { ru: 'Материалы для нового сотрудника', en: 'Materials for a new hire' },
        body: {
          ru: 'За неделю до выхода новичка создайте ссылку на папку «Новичкам» с адресом `/s/welcome`, паролем и сроком «7 дней». Пароль отправьте отдельным сообщением. Через неделю ссылка перестанет работать сама.',
          en: 'A week before a new hire starts, create a link to the “New hires” folder at `/s/welcome`, with a password and a 7-day expiry. Send the password separately. After a week the link stops working on its own.',
        },
      },
      note: {
        ru: 'Смена пароля или отзыв ссылки сразу закрывают доступ всем, кто уже открыл её. Управлять ссылками может только тот, у кого есть «Управление» папкой.',
        en: 'Changing the password or revoking a link immediately cuts off everyone who already opened it. Only people with “Manage” on the folder can handle its links.',
      },
    },
    {
      id: 'from-files',
      title: { ru: 'Загрузка и «Добавить из Файлов»', en: 'Uploading and “Add from Files”' },
      body: {
        ru: 'Загружать файлы можно кнопкой «Добавить» → «Загрузить файлы» или просто **перетащив их в папку**. Размер и типы файлов ограничивает администратор.\n\nКогда включён модуль [Файлы](/app/files), загруженные файлы также появляются в **Файлы → Мои файлы → База знаний**.\n\n**«Добавить из Файлов»** берёт файлы, которые уже лежат в «Файлах» (Мои файлы, «Доступные мне» или общие файлы), **без копирования**: обновили файл там — обновился и в базе знаний.',
        en: 'Upload with “Add” → “Upload files” or simply **drag files into the folder**. File size and types are limited by your administrator.\n\nWhen the [Files](/app/files) module is on, uploaded files also appear in **Files → My files → Knowledge base**.\n\n**“Add from Files”** takes files that already live in Files (My files, “Shared with me” or shared spaces) **without copying**: update the file there and it is updated in the knowledge base too.',
      },
      steps: [
        { ru: 'Откройте папку базы знаний и нажмите «Добавить» → «Добавить из Файлов».', en: 'Open a knowledge base folder and click “Add” → “Add from Files”.' },
        { ru: 'Отметьте нужные файлы.', en: 'Tick the files you need.' },
        { ru: 'Нажмите «Добавить в папку».', en: 'Click “Add to folder”.' },
      ],
      note: {
        ru: 'Файл, который используется в базе знаний, нельзя отправить в корзину в «Файлах», пока он не убран из материалов. А удаление материала из базы знаний сам файл в «Файлах» не удаляет.',
        en: 'A file used in the knowledge base cannot be moved to the trash in Files until it is removed from the materials. Deleting a material does not delete the file from Files.',
      },
    },
    {
      id: 'settings',
      title: { ru: 'Настройки модуля (для администратора)', en: 'Module settings (for administrators)' },
      body: {
        ru: 'Администратор настраивает базу знаний в разделе **Настройки → Модули → База знаний**:\n\n- **Включено** — показывать базу знаний в меню приложений;\n- **Вид папок** — «Цвет по умолчанию» и «Иконка по умолчанию» для папок без своих настроек;\n- **Максимальный размер файла** — от 1 до 1024 МБ (по умолчанию 50 МБ);\n- **Разрешённые типы** — изображения, PDF, Office, текст, видео и аудио, архивы;\n- **Просмотр Office** — подключён ли сервер конвертации для точного показа Word, PowerPoint и старых форматов;\n- **Публичные ссылки** — разрешить их, сделать пароль обязательным и ограничить «Максимальный срок» (0 — без ограничения).\n\nКто может пользоваться базой, настраивается не здесь, а в самой базе знаний — кнопкой «Доступ к базе».',
        en: 'Administrators configure the knowledge base under **Settings → Modules → Knowledge base**:\n\n- **Enabled** — show the knowledge base in the apps menu;\n- **Folder look** — “Default colour” and “Default icon” for folders without their own;\n- **Maximum file size** — 1 to 1024 MB (50 MB by default);\n- **Allowed types** — images, PDF, Office, text, video and audio, archives;\n- **Office preview** — whether a conversion server is connected for exact Word, PowerPoint and legacy formats;\n- **Public links** — allow them, require a password and cap the “Maximum duration” (0 means no limit).\n\nWho can use the base is set not here but in the knowledge base itself, with “Access to the base”.',
      },
      note: {
        ru: 'Если выключить «Разрешить публичные ссылки», все существующие ссылки сразу перестанут работать. Включите обратно — заработают снова.',
        en: 'Turning off “Allow public links” stops all existing links at once. Turn it back on and they work again.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Почему я не вижу папку, о которой говорит коллега?', en: 'Why can’t I see a folder a colleague mentions?' },
      a: {
        ru: 'Скорее всего, она закрыта и вас нет в списке доступа. Попросите того, кто управляет папкой, добавить вас через «Доступ…».',
        en: 'Most likely it is private and you are not on its access list. Ask whoever manages the folder to add you via “Access…”.',
      },
    },
    {
      q: { ru: 'Не получается загрузить файл — что делать?', en: 'My file won’t upload — what now?' },
      a: {
        ru: 'Проверьте размер и формат: администратор ограничивает максимальный размер файла и разрешённые типы. Если файл переименован из другого формата (например, программа под видом PDF), портал его не примет.',
        en: 'Check its size and format: the administrator limits the maximum file size and allowed types. A file renamed from another format (say, a program disguised as a PDF) is rejected.',
      },
    },
    {
      q: { ru: 'Презентация PowerPoint не открывается в браузере. Почему?', en: 'A PowerPoint deck won’t open in the browser. Why?' },
      a: {
        ru: 'Для PowerPoint, старых .doc/.xls и OpenDocument нужен сервер конвертации документов. Пока его нет, файл можно скачать. Word (.docx), Excel и PDF открываются и без него.',
        en: 'PowerPoint, legacy .doc/.xls and OpenDocument need a document conversion server. Until one is connected, download the file. Word (.docx), Excel and PDF open without it.',
      },
    },
    {
      q: { ru: 'Увидит ли человек по публичной ссылке закрытые подпапки?', en: 'Will a public link expose private subfolders?' },
      a: {
        ru: 'Нет. По ссылке видно только то, что наследует доступ от папки. Закрытые подпапки и материалы со своим доступом остаются скрытыми.',
        en: 'No. A link shows only what inherits the folder’s access. Private subfolders and materials with their own access stay hidden.',
      },
    },
    {
      q: { ru: 'Посетитель забыл пароль от ссылки. Как быть?', en: 'A visitor forgot the link password. What now?' },
      a: {
        ru: 'Пароль нигде не показывается. Откройте ссылку, нажмите «Изменить», задайте новый пароль и отправьте его посетителю.',
        en: 'Passwords are never shown. Open the link, click “Edit”, set a new password and send it to the visitor.',
      },
    },
    {
      q: { ru: 'Чем «Отозвать» отличается от удаления ссылки?', en: 'How is “Revoke” different from deleting a link?' },
      a: {
        ru: '«Отозвать» временно выключает ссылку — её можно «Восстановить» с тем же адресом. Удаление стирает ссылку навсегда, и её адрес освобождается.',
        en: '“Revoke” switches the link off temporarily — you can “Restore” it at the same address. Deleting removes it for good and frees the address.',
      },
    },
    {
      q: { ru: 'Если удалить материал, пропадёт ли файл из «Файлов»?', en: 'If I delete a material, is the file gone from Files?' },
      a: {
        ru: 'Нет, файл останется в модуле «Файлы». Удаляется только материал в базе знаний.',
        en: 'No, the file stays in Files. Only the knowledge base material is removed.',
      },
    },
    {
      q: { ru: 'Как перенести материал в другую папку?', en: 'How do I move a material to another folder?' },
      a: {
        ru: 'В меню материала выберите «Переместить» и укажите папку. Нужен уровень «Редактирование» в обеих папках.',
        en: 'In the material menu choose “Move” and pick a folder. You need “Edit” in both folders.',
      },
    },
  ],
  fields: {
    attachments: {
      title: { ru: 'Вложения', en: 'Attachments' },
      text: {
        ru: 'Файлы списком под статьёй. Чтобы показать картинку прямо в тексте, используйте «📎 Файл» на панели редактора.',
        en: 'Files listed below the article. To show a picture inside the text, use “📎 File” on the editor toolbar.',
      },
      more: 'attachments',
    },
    folderIcon: {
      title: { ru: 'Иконка и цвет', en: 'Icon and colour' },
      text: {
        ru: 'Помогают узнать папку с первого взгляда. Вариант «По умолчанию» берётся из настроек модуля.',
        en: 'Help recognise the folder at a glance. “Default” comes from the module settings.',
      },
      more: 'folders',
    },
    accessLevels: {
      title: { ru: 'Уровни доступа', en: 'Access levels' },
      text: {
        ru: '**Просмотр** — открывать и скачивать. **Редактирование** — ещё и менять материалы. **Управление** — ещё и доступ, ссылки и удаление папок.',
        en: '**View** — open and download. **Edit** — also change materials. **Manage** — also access, links and deleting folders.',
      },
      more: 'access',
    },
    inherit: {
      title: { ru: 'Наследовать доступ', en: 'Inherit access' },
      text: {
        ru: 'Включено — действуют права родительской папки плюс записи ниже. Выключено — папка закрыта: доступ только у тех, кто в списке.',
        en: 'On — the parent folder’s access applies plus the entries below. Off — the folder is private: only those listed get in.',
      },
      more: 'access',
    },
    shareSlug: {
      title: { ru: 'Адрес ссылки', en: 'Link address' },
      text: {
        ru: 'Короткое понятное имя: латиница, цифры и дефис, 3–64 символа. Если занято — портал предложит свободный вариант.',
        en: 'A short readable name: Latin letters, digits and hyphens, 3–64 characters. If taken, the portal suggests a free one.',
      },
      more: 'sharing',
    },
    sharePassword: {
      title: { ru: 'Пароль ссылки', en: 'Link password' },
      text: {
        ru: 'Посетитель вводит его один раз. Отправляйте пароль отдельно от ссылки. Смена пароля закрывает доступ всем, кто уже открыл ссылку.',
        en: 'Visitors enter it once. Send the password separately from the link. Changing it cuts off everyone who already opened the link.',
      },
      more: 'sharing',
    },
    shareExpiry: {
      title: { ru: 'Срок действия', en: 'Expiry' },
      text: {
        ru: 'После этой даты ссылка покажет «Срок действия ссылки истёк». Администратор может ограничить максимальный срок.',
        en: 'After this date the link shows “This link has expired”. The administrator may cap the maximum duration.',
      },
      more: 'sharing',
    },
    fileTypes: {
      title: { ru: 'Разрешённые типы', en: 'Allowed types' },
      text: {
        ru: 'Файлы других форматов загрузить не получится. PDF и картинки дополнительно проверяются по содержимому.',
        en: 'Files of other formats cannot be uploaded. PDFs and images are also checked by content.',
      },
      more: 'settings',
    },
    conversion: {
      title: { ru: 'Просмотр Office', en: 'Office preview' },
      text: {
        ru: 'Без сервера конвертации PowerPoint и старые форматы можно только скачать. Word (.docx), Excel и CSV открываются в любом случае.',
        en: 'Without a conversion server, PowerPoint and legacy formats can only be downloaded. Word (.docx), Excel and CSV open either way.',
      },
      more: 'viewers',
    },
    maxShareDays: {
      title: { ru: 'Максимальный срок ссылок', en: 'Maximum link duration' },
      text: {
        ru: 'Сколько дней может жить новая публичная ссылка. 0 — без ограничения, тогда доступен вариант «Бессрочно».',
        en: 'How many days a new public link may live. 0 means no limit, and “Never” becomes available.',
      },
      more: 'settings',
    },
  },
  related: ['files', 'drive'],
};
