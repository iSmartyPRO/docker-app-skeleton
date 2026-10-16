export default {
  id: 'employees',
  purpose: {
    ru: 'Сотрудники — реестр всех, кто работает на компанию, в том числе людей без доступа к порталу: строителей, водителей, сезонных работников. Карточка хранит должность, подразделение и объект, руководителя, контакты, кадровые данные, документы, навыки и допуски с напоминаниями об окончании. Учётную запись портала можно создать из карточки в один клик.',
    en: 'Employees is the registry of everyone who works for the company, including people without portal access: builders, drivers, seasonal staff. The card keeps the position, unit and site, manager, contacts, HR data, documents, skills and clearances with expiry reminders. A portal account can be created from the card in one click.',
  },
  audience: {
    ru: 'Отдел кадров ведёт карточки; руководители и коллеги пользуются справочником и оргсхемой; администратор настраивает доступ и должности.',
    en: 'HR keeps the cards; heads and colleagues use the directory and the org chart; the administrator sets up access and positions.',
  },
  setup: [
    {
      title: { ru: 'Оргструктура', en: 'The org structure' },
      text: {
        ru: 'Сначала постройте [оргструктуру](/admin/settings/org): сотрудники числятся в её подразделениях и на её объектах.',
        en: 'Build the [org structure](/admin/settings/org) first: employees belong to its units and sites.',
      },
    },
    {
      title: { ru: 'Включите модуль', en: 'Switch the module on' },
      text: { ru: 'Он выключен по умолчанию: «Настройки → Модули → Сотрудники».', en: 'It is off by default: «Settings → Modules → Employees».' },
    },
    {
      title: { ru: 'Права', en: 'Rights' },
      text: {
        ru: 'Дайте отделу кадров `employees.hr` (и `users.manage`, чтобы создавать учётные записи), руководителям — `employees.view`, администратору модуля — `employees.admin`. Или включите «Справочник для всех».',
        en: 'Give HR `employees.hr` (and `users.manage` to create accounts), heads `employees.view`, the module administrator `employees.admin`. Or switch on «Directory for everyone».',
      },
    },
    {
      title: { ru: 'Должности и импорт', en: 'Positions and import' },
      text: {
        ru: 'Заполните справочник должностей или загрузите людей из Excel: импорт проверяет каждую строку и добавляет новые должности.',
        en: 'Fill in the positions directory or load people from Excel: the import checks every row and adds new positions.',
      },
    },
    {
      title: { ru: 'Допуски и напоминания', en: 'Clearances and reminders' },
      text: {
        ru: 'Укажите, за сколько дней напоминать об окончании допусков (по умолчанию за 30 и 7 дней и в день окончания), и кому.',
        en: 'Choose how many days ahead clearance reminders go (30 and 7 days and on the day by default) and to whom.',
      },
    },
  ],
  roles: {
    'employees.view': {
      ru: 'Справочник: ФИО, фото, должность, подразделение, объект, руководитель, рабочие контакты работающих людей. Без личных данных.',
      en: 'The directory: name, photo, position, unit, site, manager, work contacts of working people. No personal data.',
    },
    'employees.hr': {
      ru: 'Всё: уволенные и кандидаты, личные контакты, дата рождения, табельный номер, документы, допуски, заметки; создание карточек и связь с учётными записями. Создание и блокировка учётных записей требуют ещё `users.manage`.',
      en: 'Everything: terminated people and candidates, personal contacts, birth date, personnel number, documents, clearances, notes; creating cards and linking accounts. Creating and blocking accounts also needs `users.manage`.',
    },
    'employees.admin': { ru: 'Справочник должностей и настройки модуля.', en: 'The positions directory and the module settings.' },
  },
  access: {
    ru: 'Видимость решает сервер в каждом ответе: без `employees.hr` личные поля просто не приходят. Сотрудник со связанной учётной записью всегда видит свою карточку с личными данными (без заметок кадров) и может поправить свои контакты.',
    en: 'The server decides visibility in every answer: without `employees.hr` personal fields are never sent. An employee with a linked account always sees their own card with personal data (without HR notes) and can correct their contacts.',
  },
  scenarios: [
    {
      title: { ru: 'Новый сотрудник с доступом', en: 'A new hire with access' },
      text: {
        ru: 'Кадровик заводит карточку, на вкладке «Учётная запись» нажимает «Создать пользователя», выбирает вход по одноразовому коду и группу — человек сразу может войти.',
        en: 'HR creates the card, on «Portal account» presses «Create a user», picks one-time codes and a group — the person can sign in right away.',
      },
    },
    {
      title: { ru: 'Монтажник без портала', en: 'An installer without the portal' },
      text: {
        ru: 'Карточка без учётной записи: объект «Северный квартал», допуск к работам на высоте до конца месяца. За 7 дней кадры и прораб получат напоминание.',
        en: 'A card without an account: the «North Quarter» site, a work-at-height clearance until month’s end. Seven days before, HR and the foreman are reminded.',
      },
    },
    {
      title: { ru: 'Увольнение', en: 'Termination' },
      text: {
        ru: '«Уволить» ставит дату и статус и предлагает заблокировать учётную запись портала — доступ закрывается одним действием.',
        en: '«Terminate» sets the date and status and offers to block the portal account — access closes in one step.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Как привязать уже существующего пользователя?', en: 'How do I link an existing user?' },
      a: {
        ru: 'В карточке → «Учётная запись» → «Связать с существующим». Одна учётная запись — одна карточка. Связанная запись получает подразделение и должность из карточки.',
        en: 'Card → «Portal account» → «Link an existing user». One account, one card. A linked account takes its unit and position from the card.',
      },
    },
    {
      q: { ru: 'Видят ли коллеги дни рождения?', en: 'Do colleagues see birthdays?' },
      a: {
        ru: 'Только день и месяц, и только если в настройках выбрано «Всем». Можно оставить их только кадрам или выключить.',
        en: 'Only the day and month, and only with «To everyone» in the settings. You can keep them to HR or switch them off.',
      },
    },
    {
      q: { ru: 'Где учётная запись AD?', en: 'Where is the AD account?' },
      a: {
        ru: 'При включённой интеграции с Active Directory в карточке появляется поле «Учётная запись AD». Модуль «Каталог AD» добавит в карточку свою вкладку.',
        en: 'With the Active Directory integration on, the card shows the «AD account» field. The AD directory module adds its own tab to the card.',
      },
    },
    {
      q: { ru: 'Модули Склад, Задачи, Мастерплан используют сотрудников?', en: 'Do Warehouse, Tasks, Masterplan use employees?' },
      a: {
        ru: 'Пока они работают с учётными записями портала. Связь карточки с учётной записью и выбор «Сотрудник» подготовлены, модули перейдут на них постепенно.',
        en: 'For now they work with portal accounts. The card–account link and the employee picker are in place; the modules will move to them step by step.',
      },
    },
  ],
};
