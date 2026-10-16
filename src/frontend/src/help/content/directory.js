export default {
  id: 'directory',
  icon: 'directory',
  title: { ru: 'Каталог AD', en: 'AD directory' },
  tagline: {
    ru: 'Учётные записи Active Directory компании — найти, проверить, помочь, создать.',
    en: 'The company’s Active Directory accounts — find, check, help, create.',
  },
  summary: {
    ru: 'Каталог AD показывает пользователей, группы и компьютеры домена внутри разрешённой части (корня управления). Здесь можно найти человека, увидеть, заблокирован ли он и когда входил, сбросить пароль, создать учётную запись для нового сотрудника или отключить уволенного. Всё делается от вашей собственной учётной записи AD и записывается в журнал.',
    en: 'The AD directory shows the domain’s users, groups and computers inside the allowed part (the managed root). Find a person, see whether they are locked out and when they last signed in, reset a password, create an account for a new employee or disable a leaver. Everything runs as your own AD account and is journalled.',
  },
  highlights: [
    { icon: '🌳', title: { ru: 'Дерево OU', en: 'OU tree' }, text: { ru: 'Подразделения с числом объектов; служебные OU скрыты.', en: 'Units with object counts; service OUs are hidden.' } },
    { icon: '🔎', title: { ru: 'Поиск и фильтры', en: 'Search and filters' }, text: { ru: 'По всему корню: отключённые, заблокированные, истёкший пароль, неактивные.', en: 'Across the root: disabled, locked, password expired, inactive.' } },
    { icon: '🪪', title: { ru: 'Карточка', en: 'The card' }, text: { ru: 'Статус, пароль, последний вход, группы, связь с порталом и сотрудником.', en: 'Status, password, last sign-in, groups, links to the portal and the employee.' } },
    { icon: '🔑', title: { ru: 'Сброс пароля', en: 'Password reset' }, text: { ru: 'С генератором и «сменить при входе»; только по защищённому каналу.', en: 'With a generator and «must change at next logon»; secure channel only.' } },
    { icon: '🧭', title: { ru: 'Мастер нового пользователя', en: 'New user wizard' }, text: { ru: 'Логин по шаблону с проверкой занятости, OU, пароль, группы.', en: 'Login from the template with an availability check, OU, password, groups.' } },
    { icon: '📜', title: { ru: 'Журнал', en: 'Journal' }, text: { ru: 'Кто, от какой учётки AD и что изменил.', en: 'Who changed what, as which AD account.' } },
  ],
  tips: [
    { ru: 'Поиск ищет по всему корню, а не только в выбранной OU.', en: 'The search covers the whole root, not just the selected OU.' },
    { ru: '«Неактивные», «Заблокированные», «Отключённые» в левом меню — готовые подборки.', en: '«Inactive», «Locked», «Disabled» in the left menu are ready-made lists.' },
    { ru: 'Выбор колонок (шестерёнка над списком) запоминается в браузере.', en: 'The column choice (the gear above the list) is remembered in the browser.' },
    { ru: 'Отметьте несколько строк — появятся массовые действия с предпросмотром.', en: 'Select several rows — bulk actions with a preview appear.' },
    { ru: 'Передавайте новый пароль лично или по телефону, не в чате.', en: 'Pass a new password on in person or by phone, not in a chat.' },
  ],
  sections: [
    {
      id: 'browse',
      title: { ru: 'Дерево и списки', en: 'Tree and lists' },
      body: {
        ru: 'Слева — подразделения (OU) внутри корня управления; число справа — сколько в нём пользователей, групп и компьютеров. Справа — объекты выбранной OU; переключатель «Вложенные OU» показывает и содержимое вложенных.\n\nФильтры: тип объекта и статус — **отключённые**, **заблокированные**, **пароль истёк**, **ни разу не входили**, **неактивные N дней**. На телефоне дерево открывается кнопкой с названием OU.',
        en: 'On the left — the units (OUs) inside the managed root; the number is how many users, groups and computers it holds. On the right — the objects of the selected OU; «Sub-OUs» shows nested ones too.\n\nFilters: object type and status — **disabled**, **locked**, **password expired**, **never signed in**, **inactive N days**. On a phone the tree opens with the button showing the OU name.',
      },
    },
    {
      id: 'card',
      title: { ru: 'Карточка', en: 'The card' },
      body: {
        ru: 'Нажмите на строку. В карточке: логин и UPN, должность, отдел, руководитель, телефоны, OU, **статус** (включена / отключена / заблокирована), когда задан пароль и когда истекает, последний вход, **группы** с их типом и **история** изменений через портал.\n\nГруппы доступа к папкам (`sg_…`) показаны только для чтения — ими управляют в «Файловый сервер → Доступ».',
        en: 'Click a row. The card shows the login and UPN, title, department, manager, phones, OU, the **status** (enabled / disabled / locked), when the password was set and expires, the last sign-in, **groups** with their type and the **history** of changes through the portal.\n\nFolder access groups (`sg_…`) are read-only here — they are managed in «File server → Access».',
      },
    },
    {
      id: 'password',
      title: { ru: 'Сброс пароля и разблокировка', en: 'Password reset and unlocking' },
      steps: [
        { ru: 'Откройте карточку и нажмите «Сбросить пароль».', en: 'Open the card and press «Reset password».' },
        { ru: 'Нажмите «Сгенерировать» или введите пароль — список под полем покажет, подходит ли он.', en: 'Press «Generate» or type a password — the list below shows whether it fits.' },
        { ru: 'Оставьте «Сменить пароль при следующем входе» и, если нужно, «Заодно разблокировать».', en: 'Keep «Must change at next logon» and, if needed, «Unlock the account too».' },
        { ru: 'Подтвердите и скопируйте пароль, чтобы передать человеку.', en: 'Confirm and copy the password to pass it on.' },
      ],
      note: {
        ru: 'Если кнопка недоступна и написано «нет защищённого канала» — Active Directory принимает пароли только по LDAPS/StartTLS. Это настраивает администратор.',
        en: 'If the button is off with «no secure channel» — Active Directory accepts passwords only over LDAPS/StartTLS. An administrator sets it up.',
      },
    },
    {
      id: 'create',
      title: { ru: 'Новый пользователь', en: 'A new user' },
      body: {
        ru: 'Кнопка «Новый пользователь» открывает мастер: ФИО → логин (по шаблону компании, занятость проверяется по всему домену) → OU → UPN и почта → начальный пароль → группы → проверка. Без пароля учётная запись создаётся отключённой.\n\nИз карточки сотрудника то же самое делает «Создать пользователя AD для сотрудника» — поля уже заполнены.',
        en: '«New user» opens the wizard: names → login (from the company template, checked across the domain) → OU → UPN and e-mail → initial password → groups → check. Without a password the account is created disabled.\n\nFrom an employee card «Create AD user for the employee» does the same with the fields filled in.',
      },
    },
    {
      id: 'bulk',
      title: { ru: 'Массовые действия и увольнение', en: 'Bulk actions and offboarding' },
      body: {
        ru: 'Отметьте строки — над списком появятся «Отключить», «Включить», «Переместить» и «Увольнение» (отключить и перенести в OU отключённых). Сначала показывается предпросмотр: что изменится и что будет пропущено. Ничего не меняется до подтверждения.',
        en: 'Select rows — «Disable», «Enable», «Move» and «Offboard» (disable and move to the disabled OU) appear above the list. A preview comes first: what changes and what is skipped. Nothing changes before you confirm.',
      },
    },
    {
      id: 'password-prompt',
      title: { ru: 'Почему портал спрашивает мой доменный пароль', en: 'Why the portal asks for my domain password' },
      body: {
        ru: 'Изменения в AD выполняются от **вашей** учётной записи AD — так Active Directory сам проверяет ваши права, а журнал показывает, кто что сделал. Пароль вводится один раз, проверяется контроллером домена и хранится зашифрованным (тот же, что для Файлового сервера).',
        en: 'Changes in AD run as **your** AD account — so Active Directory checks your rights itself and the journal shows who did what. The password is entered once, checked by the domain controller and kept encrypted (the same as for the File server).',
      },
    },
  ],
  faq: [
    { q: { ru: 'Почему я не вижу некоторые OU?', en: 'Why can’t I see some OUs?' }, a: { ru: 'Служебные OU и OU администраторов скрыты настройками модуля, а всё выше корня управления не показывается вовсе.', en: 'Service and administrators’ OUs are hidden by the module settings, and nothing above the managed root is shown at all.' } },
    { q: { ru: '«Последний вход» отстаёт', en: '«Last sign-in» lags behind' }, a: { ru: 'Active Directory обновляет это поле с задержкой до двух недель — для поиска давно неактивных этого достаточно.', en: 'Active Directory updates it with a delay of up to two weeks — enough to find long-inactive accounts.' } },
    { q: { ru: 'Изменил группу, а доступа нет', en: 'I changed a group but there is no access' }, a: { ru: 'Членство в группах применяется при следующем входе человека в Windows.', en: 'Group membership applies at the person’s next Windows sign-in.' } },
    { q: { ru: 'Что за «Демо-каталог»?', en: 'What is the «Demo directory»?' }, a: { ru: 'Демонстрационные данные без реального домена: можно всё попробовать, ничего не сломав.', en: 'Demo data without a real domain: try everything without breaking anything.' } },
  ],
  related: ['drive'],
};
