export default {
  id: 'employees',
  icon: 'people',
  title: { ru: 'Сотрудники', en: 'Employees' },
  tagline: { ru: 'Все, кто работает на компанию, — в одном справочнике.', en: 'Everyone who works for the company — in one directory.' },
  summary: {
    ru: 'Справочник коллег с должностями, подразделениями и рабочими контактами, оргсхема и дни рождения. Отдел кадров ведёт здесь карточки, документы и допуски — в том числе людей без доступа к порталу.',
    en: 'A directory of colleagues with positions, units and work contacts, the org chart and birthdays. HR keeps cards, documents and clearances here — also of people without portal access.',
  },
  highlights: [
    { icon: '🔎', title: { ru: 'Найти коллегу', en: 'Find a colleague' }, text: { ru: 'Поиск по имени, должности, e-mail и телефону, фильтры по подразделению и объекту.', en: 'Search by name, position, e-mail and phone; filter by unit and site.' } },
    { icon: '🗂️', title: { ru: 'Оргсхема', en: 'Org chart' }, text: { ru: 'Подразделения с руководителями и численностью — нажмите, чтобы увидеть людей.', en: 'Units with heads and headcount — click to see the people.' } },
    { icon: '🛡️', title: { ru: 'Допуски', en: 'Clearances' }, text: { ru: 'Сроки допусков под контролем: напоминание приходит заранее.', en: 'Clearance dates under control: a reminder comes in advance.' } },
    { icon: '🎂', title: { ru: 'Праздники', en: 'Celebrations' }, text: { ru: 'Виджет дашборда с днями рождения (только день и месяц) и годовщинами работы.', en: 'A dashboard widget with birthdays (day and month only) and work anniversaries.' } },
  ],
  tips: [
    { ru: 'Свою карточку открывайте в меню «Моя карточка» — там можно поправить свой телефон и личные контакты.', en: 'Open your own card from «My card» — you can correct your phone and personal contacts there.' },
    { ru: 'Таблица или карточки — переключатель справа от поиска; выбор запоминается.', en: 'Table or cards — the switch next to the search; the choice is remembered.' },
    { ru: '«Выгрузить» сохраняет текущую выборку в CSV для Excel.', en: '«Export» saves the current selection as a CSV for Excel.' },
  ],
  sections: [
    {
      id: 'registry',
      title: { ru: 'Реестр', en: 'The registry' },
      body: {
        ru: 'В реестре — работающие сотрудники и те, кто в отпуске. Вы видите ФИО, фото, должность, подразделение, объект и рабочие контакты. Личные данные видят только отдел кадров и сам сотрудник.',
        en: 'The registry lists people who work or are on vacation. You see names, photos, positions, units, sites and work contacts. Personal data is seen only by HR and the person themselves.',
      },
    },
    {
      id: 'card',
      title: { ru: 'Карточка сотрудника', en: 'The employee card' },
      body: {
        ru: 'Должность, подразделение и объект, руководитель, рабочие контакты. Отдел кадров видит также табельный номер, даты приёма и увольнения, тип занятости, документы, навыки и допуски, учётную запись портала и историю изменений.',
        en: 'Position, unit and site, manager, work contacts. HR also sees the personnel number, hire and termination dates, employment type, documents, skills and clearances, the portal account and the history of changes.',
      },
    },
    {
      id: 'hr',
      title: { ru: 'Для отдела кадров', en: 'For HR' },
      body: {
        ru: 'Карточку можно завести и для человека без доступа к порталу. Учётная запись создаётся из карточки в один клик («Учётная запись» → «Создать пользователя»), а при увольнении её предлагают заблокировать.',
        en: 'A card can exist for a person without portal access. An account is created from the card in one click («Portal account» → «Create a user»), and on termination you are offered to block it.',
      },
      steps: [
        { ru: 'Нажмите «Добавить сотрудника» и заполните ФИО, должность и подразделение.', en: 'Press «Add employee» and fill in the name, position and unit.' },
        { ru: 'Во вкладке «Навыки и допуски» добавьте допуски с датой окончания.', en: 'On «Skills and clearances» add clearances with their expiry date.' },
        { ru: 'Во вкладке «Учётная запись» создайте пользователя или свяжите существующего.', en: 'On «Portal account» create a user or link an existing one.' },
      ],
      note: { ru: 'Много людей сразу — через «Импорт» из Excel: файл сначала проверяется, ошибки показаны по строкам.', en: 'Many people at once — «Import» from Excel: the file is checked first, problems are shown by row.' },
    },
  ],
  faq: [
    { q: { ru: 'Почему я не вижу коллегу?', en: 'Why can’t I find a colleague?' }, a: { ru: 'В справочнике только работающие и те, кто в отпуске. Уволенных и кандидатов видит отдел кадров.', en: 'The directory shows people who work or are on vacation. HR sees terminated people and candidates.' } },
    { q: { ru: 'Кто видит мой день рождения?', en: 'Who sees my birthday?' }, a: { ru: 'Коллеги видят только день и месяц, если администратор включил это; год — никто, кроме отдела кадров.', en: 'Colleagues see only the day and month, if the administrator allows it; the year — nobody but HR.' } },
    { q: { ru: 'Как исправить свой телефон?', en: 'How do I fix my phone number?' }, a: { ru: 'Откройте «Моя карточка» → «Мои контакты».', en: 'Open «My card» → «My contacts».' } },
  ],
  related: ['approvals', 'dashboard'],
};
