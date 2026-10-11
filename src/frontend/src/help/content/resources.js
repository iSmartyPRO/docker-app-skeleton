export default {
  id: 'resources',
  icon: 'compass',
  title: { ru: 'Онлайн-ресурсы', en: 'Online resources' },
  tagline: {
    ru: 'Все сервисы компании — почта, CRM, кадровые формы, сайт — плитками в одном месте.',
    en: 'All company services — mail, CRM, HR forms, the website — as tiles in one place.',
  },
  summary: {
    ru: 'Онлайн-ресурсы — это доска ссылок на рабочие сервисы. Нужное находится поиском или по категории, а порядок плиток каждый настраивает под себя. Часто именно эта доска открывается по адресу портала.',
    en: 'Online resources is a board of links to work services. Find what you need by search or category, and arrange the tiles your own way. It is often the page that opens at the portal’s address.',
  },
  highlights: [
    {
      icon: '🧭',
      title: { ru: 'Всё в один клик', en: 'One click away' },
      text: { ru: 'Почта, CRM, база знаний и другие сервисы — плитками с понятными иконками.', en: 'Mail, CRM, the knowledge base and other services as tiles with clear icons.' },
    },
    {
      icon: '🔎',
      title: { ru: 'Поиск и категории', en: 'Search and categories' },
      text: { ru: 'Ищите по названию, описанию или адресу, фильтруйте кнопками категорий.', en: 'Search by title, description or address; filter with category chips.' },
    },
    {
      icon: '🧩',
      title: { ru: 'Своя раскладка', en: 'Your own layout' },
      text: { ru: 'Перетащите плитки в удобном порядке и скройте лишние — это видите только вы.', en: 'Drag tiles into your order and hide the ones you don’t need — only you see it.' },
    },
    {
      icon: '💾',
      title: { ru: 'На всех устройствах', en: 'On every device' },
      text: { ru: 'После входа раскладка хранится на сервере и одинакова на компьютере и телефоне.', en: 'Once signed in, your layout is kept on the server and is the same on computer and phone.' },
    },
    {
      icon: '🛡',
      title: { ru: 'Каждому — своё', en: 'Right links for each person' },
      text: { ru: 'Администратор решает, кому виден ресурс: всем, сотрудникам или выбранным.', en: 'The administrator decides who sees a resource: everyone, employees or selected people.' },
    },
    {
      icon: '🌐',
      title: { ru: 'На вашем языке', en: 'In your language' },
      text: { ru: 'Названия и описания показываются на русском или английском — как выбрано у вас.', en: 'Titles and descriptions appear in Russian or English, whichever you use.' },
    },
  ],
  tips: [
    { ru: 'Начните печатать в поле «Найти ресурс» — плитки отфильтруются сразу.', en: 'Start typing in “Find a resource” — the tiles filter instantly.' },
    { ru: 'Значок ↗ на плитке означает, что ссылка откроется в новой вкладке.', en: 'The ↗ mark on a tile means the link opens in a new tab.' },
    { ru: 'Скрыли плитку по ошибке? «Настроить» → «Скрытые» → нажмите на неё, и она вернётся.', en: 'Hid a tile by mistake? “Customize” → “Hidden” → click it to bring it back.' },
    { ru: 'Войдите в портал, чтобы раскладка была с вами на любом устройстве, а не только в этом браузере.', en: 'Sign in so your layout follows you to every device, not just this browser.' },
    { ru: 'Самые нужные сервисы поставьте в первый ряд — их видно сразу при открытии портала.', en: 'Put your most-used services in the first row — they are visible right when the portal opens.' },
    { ru: 'Не нашли нужный сервис? Попросите администратора портала добавить его в каталог.', en: 'Missing a service? Ask the portal administrator to add it to the catalogue.' },
  ],
  sections: [
    {
      id: 'tiles',
      title: { ru: 'Плитки', en: 'Tiles' },
      body: {
        ru: 'Каждый ресурс — это плитка с иконкой, названием, кратким описанием и адресом.\n\n- **↗** рядом с адресом — ссылка откроется в новой вкладке, портал останется открытым.\n- Плитки **модулей портала** (Задачи, Календарь, База знаний и другие) открываются здесь же, в портале.\n- Если модуль портала выключен, его плитка исчезает сама и возвращается, когда модуль снова включат.\n\nНад плитками — приветствие по времени суток. Администратор может выбрать компактный размер плиток и скрыть описания.',
        en: 'Each resource is a tile with an icon, a title, a short description and the address.\n\n- **↗** next to the address — the link opens in a new tab and the portal stays open.\n- Tiles of **portal modules** (Tasks, Calendar, Knowledge base and others) open right here in the portal.\n- If a portal module is switched off, its tile disappears and comes back when the module is on again.\n\nAbove the tiles is a greeting for the time of day. The administrator can choose compact tiles and hide descriptions.',
      },
    },
    {
      id: 'search',
      title: { ru: 'Поиск и категории', en: 'Search and categories' },
      body: {
        ru: 'Поле **«Найти ресурс»** ищет по названию, описанию и адресу. Кнопки категорий над плитками (например, «Работа», «Кадры», «ИТ») оставляют только ресурсы этой категории; **«Все»** снимает фильтр.\n\nПоиск и категории можно сочетать.',
        en: 'The **“Find a resource”** field searches titles, descriptions and addresses. The category chips above the tiles (e.g. “Work”, “HR”, “IT”) leave only that category; **“All”** clears the filter.\n\nSearch and categories can be combined.',
      },
      example: {
        title: { ru: 'Найти форму отпуска', en: 'Finding the leave form' },
        body: {
          ru: 'Нажмите категорию **«Кадры»** и введите «отпуск» — останется плитка «Заявление на отпуск», даже если слово есть только в её описании.',
          en: 'Click the **“HR”** category and type “leave” — the “Leave request” tile remains, even if the word is only in its description.',
        },
      },
      note: {
        ru: 'Если поиска и категорий не видно, администратор отключил их в настройках модуля.',
        en: 'If you don’t see search and categories, the administrator has turned them off in the module settings.',
      },
    },
    {
      id: 'layout',
      title: { ru: 'Личная раскладка', en: 'Your own layout' },
      body: {
        ru: 'Кнопка **«Настроить»** включает режим настройки. В нём можно:\n\n- перетаскивать плитки мышью, а на телефоне — после короткого нажатия;\n- менять порядок с клавиатуры;\n- скрывать лишнее кнопкой **«Скрыть»** — скрытые плитки собираются в блок **«Скрытые»**;\n- вернуть порядок администратора кнопкой **«Вернуть как было»**.\n\nНажмите **«Готово»**, когда закончите. Раскладку видите только вы.',
        en: 'The **“Customize”** button turns on edit mode. There you can:\n\n- drag tiles with the mouse, or on a phone after a short press;\n- reorder with the keyboard;\n- hide what you don’t need with **“Hide”** — hidden tiles gather in the **“Hidden”** block;\n- return to the administrator’s order with **“Reset to default”**.\n\nClick **“Done”** when finished. Only you see your layout.',
      },
      steps: [
        { ru: 'Нажмите **«Настроить»** над плитками.', en: 'Click **“Customize”** above the tiles.' },
        { ru: 'Перетащите плитки в удобном порядке.', en: 'Drag the tiles into the order you like.' },
        { ru: 'Нажмите **«Скрыть»** на ненужных плитках.', en: 'Click **“Hide”** on tiles you don’t need.' },
        { ru: 'Нажмите **«Готово»** — раскладка сохранится.', en: 'Click **“Done”** — the layout is saved.' },
      ],
      example: {
        title: { ru: 'Бухгалтер настраивает доску', en: 'An accountant sets up the board' },
        body: {
          ru: 'Мария ставит «1С», «Банк-клиент» и «Почту» в первый ряд, а «Сайт компании» и «Вики разработчиков» скрывает. Утром она открывает портал на ноутбуке — и видит ту же доску, что вчера на рабочем компьютере.',
          en: 'Maria puts “1C”, “Bank client” and “Mail” in the first row and hides “Company website” and “Developer wiki”. In the morning she opens the portal on her laptop and sees the same board as yesterday at work.',
        },
      },
      note: {
        ru: '**Где хранится раскладка.** Если вы вошли — на сервере, на всех устройствах. Гостям — только в этом браузере. Новые ресурсы появляются в конце вашей раскладки, удалённые просто исчезают.',
        en: '**Where the layout is kept.** Signed in — on the server, on every device. For guests — only in this browser. New resources appear at the end of your layout; removed ones simply disappear.',
      },
    },
    {
      id: 'visibility',
      title: { ru: 'Кто видит какой ресурс', en: 'Who sees which resource' },
      body: {
        ru: 'У каждого ресурса есть настройка **«Кому видно»**:\n\n- **Всем** — в том числе гостям без входа, если сайт открытый;\n- **Сотрудникам** — всем, кто вошёл в портал;\n- **Выбранным** — отдельным пользователям, группам и ролям.\n\nПереключатель **«Показывать»** прячет ресурс от всех, не удаляя его. Администраторы ресурсов видят всё.',
        en: 'Each resource has a **“Who sees it”** setting:\n\n- **Everyone** — including guests who are not signed in, if the site is open;\n- **Employees** — everyone signed in;\n- **Selected** — chosen users, groups and roles.\n\nThe **“Show”** switch hides a resource from everyone without deleting it. Resource administrators see everything.',
      },
      example: {
        title: { ru: 'Ссылка только для отдела продаж', en: 'A link for the sales team only' },
        body: {
          ru: 'Администратор добавляет «CRM», выбирает **«Выбранным»** и указывает группу «Продажи». Менеджеры видят плитку, остальные сотрудники и гости — нет.',
          en: 'The administrator adds “CRM”, picks **“Selected”** and chooses the “Sales” group. Sales managers see the tile; other employees and guests don’t.',
        },
      },
      note: {
        ru: 'Не видите ресурс, который видит коллега? Скорее всего, он открыт только для определённой группы — обратитесь к администратору.',
        en: 'Can’t see a resource a colleague sees? It is probably limited to a group — ask the administrator.',
      },
    },
    {
      id: 'icons',
      title: { ru: 'Иконки', en: 'Icons' },
      body: {
        ru: 'Иконку выбирают при создании ресурса — превью сразу показывает, как плитка выглядит на светлом и тёмном фоне. Источники:\n\n- **Иконки** — тысячи линейных иконок с поиском (mail, chart, truck…);\n- **Бренды** — логотипы сервисов в фирменных цветах (Gmail, Jira, Telegram…);\n- **Своя** — PNG, SVG, WebP или JPEG до 1 МБ, при желании отдельный вариант для тёмной темы;\n- **Портал** — иконки меню и модулей портала;\n- **Буква** — одна-две буквы на цветной плитке.\n\nСтили: **Градиент**, **Мягкий**, **Заливка**, **Без фона**. Цвет — из палитры или любой, можно задать отдельно для тёмной темы.',
        en: 'The icon is picked when creating a resource — the preview shows the tile on light and dark backgrounds. Sources:\n\n- **Icons** — thousands of line icons with search (mail, chart, truck…);\n- **Brands** — service logos in brand colours (Gmail, Jira, Telegram…);\n- **Your own** — PNG, SVG, WebP or JPEG up to 1 MB, optionally a separate dark-theme version;\n- **Portal** — the portal’s menu and module icons;\n- **Letter** — one or two characters on a coloured tile.\n\nStyles: **Gradient**, **Soft**, **Solid**, **Plain**. Colour from the palette or any, optionally separate for the dark theme.',
      },
      note: {
        ru: 'Некоторых брендов (например, Slack, Microsoft) в библиотеке нет — загрузите их логотип во вкладке «Своя».',
        en: 'Some brands (e.g. Slack, Microsoft) are not in the library — upload their logo under “Your own”.',
      },
    },
    {
      id: 'admin',
      title: { ru: 'Управление для администратора', en: 'Managing resources (administrators)' },
      body: {
        ru: 'Кнопка **«Управление»** на доске открывает **каталог ресурсов**. Нужно право «Управление онлайн-ресурсами».\n\n- **«Добавить ресурс»** — ссылка или модуль портала;\n- **«Добавить модули»** — сразу несколько модулей портала одним кликом, с их иконками и цветами;\n- перетаскивание строк за ⋮⋮ задаёт **порядок по умолчанию** — его видят все, пока не настроят свой;\n- **категории** — название на двух языках и цвет; при удалении категории ресурсы остаются без неё.\n\nВ ресурсе название и описание заполняются на вкладках **Русский / English** (✓ отмечает заполненные). Если один язык пуст, показывается другой.',
        en: 'The **“Manage”** button on the board opens the **resource catalogue**. You need the “Manage online resources” permission.\n\n- **“Add resource”** — a link or a portal module;\n- **“Add modules”** — several portal modules in one click, with their icons and colours;\n- dragging rows by ⋮⋮ sets the **default order** — everyone sees it until they arrange their own;\n- **categories** — a name in both languages and a colour; deleting a category leaves its resources without one.\n\nA resource’s title and description are filled on the **Русский / English** tabs (✓ marks filled ones). If one language is empty, the other is shown.',
      },
      steps: [
        { ru: 'Откройте **«Управление»** → **«Добавить ресурс»**.', en: 'Open **“Manage”** → **“Add resource”**.' },
        { ru: 'Выберите **«Ссылка»** и введите адрес, или **«Модуль портала»** и выберите модуль.', en: 'Choose **“Link”** and enter the address, or **“Portal module”** and pick the module.' },
        { ru: 'Заполните название и описание на обоих языках.', en: 'Fill in the title and description in both languages.' },
        { ru: 'Укажите категорию, где открывать и **«Кому видно»**.', en: 'Set the category, how it opens and **“Who sees it”**.' },
        { ru: 'Выберите иконку справа и нажмите **«Сохранить»**.', en: 'Pick an icon on the right and click **“Save”**.' },
      ],
      example: {
        title: { ru: 'Добавить корпоративную почту', en: 'Adding corporate mail' },
        body: {
          ru: 'Адрес `https://mail.company.com`, название «Корпоративная почта», категория «Работа», **«Сотрудникам»**, иконка из вкладки «Бренды» или буква «П» в стиле «Градиент». Открывать — **«В новой вкладке»**.',
          en: 'Address `https://mail.company.com`, title “Corporate mail”, category “Work”, **“Employees”**, an icon from “Brands” or the letter “M” in “Gradient” style. Opens — **“In a new tab”**.',
        },
      },
      note: {
        ru: 'Адрес может быть `https://…`, `mailto:`, `tel:` или страницей портала вроде `/app/kb`. Другие виды ссылок не принимаются из соображений безопасности.',
        en: 'An address can be `https://…`, `mailto:`, `tel:` or a portal page such as `/app/kb`. Other kinds of links are refused for safety.',
      },
    },
    {
      id: 'settings',
      title: { ru: 'Настройки модуля и главная страница', en: 'Module settings and home page' },
      body: {
        ru: 'В **Настройки → Модули → Онлайн-ресурсы** администратор задаёт:\n\n- **Заголовок** и **Подзаголовок** над плитками;\n- **Размер плиток** — обычный или компактный;\n- **Показывать описания**;\n- **Поиск и категории**;\n- **Личная раскладка** — можно ли каждому менять порядок и скрывать плитки.\n\nЧтобы доска открывалась по адресу сайта, выберите «Онлайн-ресурсы» в **Настройки → Доступ к сайту → Главная страница**. Гости увидят ресурсы «Всем», если сайт открытый.',
        en: 'In **Settings → Modules → Online resources** the administrator sets:\n\n- the **Heading** and **Subheading** above the tiles;\n- **Tile size** — comfortable or compact;\n- **Show descriptions**;\n- **Search and categories**;\n- **Personal layout** — whether people may reorder and hide tiles.\n\nTo show the board at the site’s address, choose “Online resources” in **Settings → Site access → Home page**. Guests see “Everyone” resources if the site is open.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Я скрыл плитку. Как её вернуть?', en: 'I hid a tile. How do I get it back?' },
      a: { ru: 'Нажмите **«Настроить»**, откройте блок **«Скрытые»** и нажмите на нужный ресурс.', en: 'Click **“Customize”**, open the **“Hidden”** block and click the resource.' },
    },
    {
      q: { ru: 'Моя раскладка видна коллегам?', en: 'Do colleagues see my layout?' },
      a: { ru: 'Нет. Порядок и скрытые плитки — только ваши. Остальные видят свою раскладку или порядок администратора.', en: 'No. Your order and hidden tiles are yours only. Others see their own layout or the administrator’s order.' },
    },
    {
      q: { ru: 'На другом компьютере раскладка другая. Почему?', en: 'My layout is different on another computer. Why?' },
      a: { ru: 'Скорее всего, вы настраивали доску без входа — тогда она хранится только в том браузере. Войдите и настройте заново: дальше раскладка будет общей для всех устройств.', en: 'You probably arranged the board without signing in — then it is kept only in that browser. Sign in and arrange it again: from then on it is shared across devices.' },
    },
    {
      q: { ru: 'Нет кнопки «Настроить».', en: 'There is no “Customize” button.' },
      a: { ru: 'Администратор отключил **личную раскладку** — все видят одинаковый порядок.', en: 'The administrator has turned off **personal layout** — everyone sees the same order.' },
    },
    {
      q: { ru: 'Пропала плитка модуля портала (например, «Задачи»).', en: 'A portal module tile (e.g. “Tasks”) disappeared.' },
      a: { ru: 'Модуль выключен в настройках портала. Плитка вернётся сама, когда модуль включат.', en: 'The module is switched off in the portal settings. The tile comes back when the module is on again.' },
    },
    {
      q: { ru: 'Как добавить свой ресурс?', en: 'How do I add my own resource?' },
      a: { ru: 'Ресурсы добавляет администратор — пришлите ему адрес, название и кому он нужен. Если у вас есть право «Управление онлайн-ресурсами», см. [Управление для администратора](/help/resources#admin).', en: 'Resources are added by an administrator — send them the address, a title and who needs it. If you have “Manage online resources”, see [Managing resources](/help/resources#admin).' },
    },
  ],
  fields: {
    url: {
      title: { ru: 'Адрес', en: 'Address' },
      text: { ru: 'Куда ведёт плитка: `https://…`, `mailto:`, `tel:` или страница портала вроде `/app/kb`. Другие ссылки не принимаются.', en: 'Where the tile leads: `https://…`, `mailto:`, `tel:` or a portal page such as `/app/kb`. Other links are refused.' },
      more: 'admin',
    },
    category: {
      title: { ru: 'Категория', en: 'Category' },
      text: { ru: 'По категориям люди фильтруют доску кнопками над плитками. Можно оставить «Без категории».', en: 'People filter the board by category with the chips above the tiles. “No category” is fine too.' },
      more: 'search',
    },
    visibility: {
      title: { ru: 'Кому видно', en: 'Who sees it' },
      text: { ru: '**Всем** — и гостям без входа; **Сотрудникам** — всем вошедшим; **Выбранным** — указанным людям, группам и ролям.', en: '**Everyone** — guests too; **Employees** — everyone signed in; **Selected** — the chosen people, groups and roles.' },
      more: 'visibility',
    },
    active: {
      title: { ru: 'Показывать', en: 'Show' },
      text: { ru: 'Выключите, чтобы временно спрятать ресурс от всех, не удаляя его и его настройки.', en: 'Turn off to hide the resource from everyone for now, without deleting it or its settings.' },
      more: 'visibility',
    },
    personalize: {
      title: { ru: 'Личная раскладка', en: 'Personal layout' },
      text: { ru: 'Включено — каждый может менять порядок и скрывать плитки для себя. Выключено — у всех порядок из каталога.', en: 'On — everyone can reorder and hide tiles for themselves. Off — everyone sees the catalogue order.' },
      more: 'layout',
    },
  },
  related: ['start', 'dashboard'],
};
