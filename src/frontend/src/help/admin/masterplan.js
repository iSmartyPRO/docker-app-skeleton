export default {
  id: 'masterplan',
  purpose: {
    ru: 'Мастерплан показывает проект застройки целиком: генплан с кликабельными контурами, шахматку домов, реестр юнитов, статусы продаж с бронями на таймере, цены с историей и ход строительства с фотоотчётами.',
    en: 'Masterplan shows a development project as a whole: the site plan with clickable contours, the chessboard of buildings, the unit registry, sales statuses with timed bookings, prices with history and construction progress with photo reports.',
  },
  audience: { ru: 'Девелоперы: продажи, финансы, юристы, стройка, маркетинг, руководство.', en: 'Developers: sales, finance, legal, construction, marketing and management.' },
  setup: [
    { title: { ru: 'Включите модуль', en: 'Switch the module on' }, text: { ru: 'Он выключен по умолчанию.', en: 'It is off by default.' } },
    { title: { ru: 'Создайте проект', en: 'Create a project' }, text: { ru: 'Загрузите подложку генплана, нарисуйте контуры, заведите дома, подъезды, этажи и юниты (или импортируйте).', en: 'Upload the site plan background, draw contours, add buildings, entrances, floors and units (or import).' } },
    { title: { ru: 'Роли', en: 'Roles' }, text: { ru: 'Выдайте права masterplan.* через роли или назначьте роль в проекте с зоной (поддерево).', en: 'Grant masterplan.* through roles or assign a role in a project with a zone (a subtree).' } },
    { title: { ru: 'Продажи', en: 'Sales' }, text: { ru: 'В [настройках](/admin/settings/masterplan): статусы, сроки броней, валюты, лимит скидки руководителя продаж.', en: 'In the [settings](/admin/settings/masterplan): statuses, booking timers, currencies, the head of sales’ discount limit.' } },
    { title: { ru: 'CRM', en: 'CRM' }, text: { ru: 'Включите CRM и «Контрагентов», чтобы связывать юниты со сделками и покупателями.', en: 'Switch on CRM and Counterparties to link units to deals and buyers.' } },
  ],
  roles: {
    'masterplan.admin': { ru: 'Всё в модуле, включая структуру и настройки.', en: 'Everything, including structure and settings.' },
    'masterplan.sales': { ru: 'Брони и продажи юнитов.', en: 'Bookings and unit sales.' },
    'masterplan.foreman': { ru: 'Ход строительства и фотоотчёты.', en: 'Construction progress and photo reports.' },
  },
  scenarios: [
    { title: { ru: 'Бронь квартиры', en: 'Booking an apartment' }, text: { ru: 'Менеджер ставит бронь на 3 дня из сделки CRM; по истечении таймера юнит освобождается сам.', en: 'A manager books a unit for 3 days from a CRM deal; when the timer runs out the unit is freed.' } },
    { title: { ru: 'Отчёт стройки', en: 'Construction report' }, text: { ru: 'Прораб отмечает готовность этажей и прикладывает фото с объекта «Северный квартал».', en: 'A foreman marks floor progress and attaches photos from the «North Quarter» site.' } },
  ],
  faq: [
    { q: { ru: 'Кто видит цены?', en: 'Who sees prices?' }, a: { ru: 'Зависит от роли: поля скрываются на сервере.', en: 'It depends on the role: fields are hidden on the server.' } },
    { q: { ru: 'Без CRM работает?', en: 'Without CRM?' }, a: { ru: 'Да, но без связи юнитов со сделками.', en: 'Yes, but without linking units to deals.' } },
  ],
};
