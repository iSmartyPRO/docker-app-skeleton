export default {
  id: 'resources',
  purpose: {
    ru: 'Онлайн-ресурсы — доска плиток со ссылками на сервисы компании: почта, CRM, формы, сайт, а также модули портала. Удобна как главная страница: гости видят публичные ссылки, сотрудники — свои.',
    en: 'Online resources is a board of tiles linking to company services: mail, CRM, forms, the website and portal modules. A good home page: guests see public links, employees see theirs.',
  },
  audience: { ru: 'Все сотрудники и гости открытого портала; наполняет администратор ресурсов.', en: 'Every employee and guests of an open portal; filled by the resources administrator.' },
  setup: [
    { title: { ru: 'Добавьте ресурсы', en: 'Add resources' }, text: { ru: 'Ссылка или модуль портала, иконка, название и описание на двух языках, категория.', en: 'A link or a portal module, an icon, a title and description in two languages, a category.' } },
    { title: { ru: 'Настройте видимость', en: 'Set visibility' }, text: { ru: 'Публичный ресурс видят гости, остальные — по ролям и группам.', en: 'Guests see public resources; the rest are visible by roles and groups.' } },
    { title: { ru: 'Сделайте главной страницей', en: 'Make it the home page' }, text: { ru: 'В [доступе к сайту](/admin/settings/access) выберите «Онлайн-ресурсы» как главную.', en: 'In [site access](/admin/settings/access) choose «Online resources» as the home page.' } },
    { title: { ru: 'Оформление', en: 'Look' }, text: { ru: 'Заголовок, подзаголовок, плотность плиток, поиск и личная раскладка — в [настройках](/admin/settings/resources).', en: 'Heading, subtitle, tile density, search and personal layouts — in the [settings](/admin/settings/resources).' } },
  ],
  roles: { 'resources.admin': { ru: 'Добавление, правка и порядок ресурсов и категорий.', en: 'Add, edit and order resources and categories.' } },
  scenarios: [
    { title: { ru: 'Стартовая страница офиса', en: 'Office start page' }, text: { ru: 'На главной — почта, бухгалтерия, база знаний и заявки в IT; каждый расставляет плитки под себя.', en: 'The home page has mail, accounting, the knowledge base and IT requests; everyone arranges tiles their way.' } },
    { title: { ru: 'Публичные ссылки для гостей', en: 'Public links for guests' }, text: { ru: 'Открытый портал показывает гостям сайт компании и форму обратной связи, а сотрудникам после входа — внутренние сервисы.', en: 'An open portal shows guests the website and a contact form, and employees the internal services after sign-in.' } },
  ],
  faq: [
    { q: { ru: 'Пропала плитка модуля', en: 'A module tile disappeared' }, a: { ru: 'Плитка модуля скрывается, пока модуль выключен, и возвращается после включения.', en: 'A module tile hides while the module is off and returns when it is switched on.' } },
    { q: { ru: 'Сбросятся ли личные раскладки?', en: 'Are personal layouts reset?' }, a: { ru: 'Нет. Новые ресурсы добавляются в конец, удалённые просто исчезают.', en: 'No. New resources go to the end, removed ones simply disappear.' } },
  ],
};
