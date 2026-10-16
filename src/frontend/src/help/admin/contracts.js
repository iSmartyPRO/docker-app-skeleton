export default {
  id: 'contracts',
  purpose: {
    ru: 'Договоры — реестр договоров компании: версии файлов, риски от юриста, согласование, даты и автопролонгация с напоминаниями, оплаты и задатки, связи с заявками, сделками и объектами.',
    en: 'Contracts is the company’s contract registry: file versions, the lawyer’s risks, approval, dates and auto-prolongation with reminders, payments and deposits, links to requests, deals and objects.',
  },
  audience: { ru: 'Юристы, инициаторы договоров, финансы, руководство.', en: 'Lawyers, contract owners, finance and management.' },
  setup: [
    { title: { ru: 'Включите модуль', en: 'Switch the module on' }, text: { ru: 'Он выключен по умолчанию; договоры проходят «Согласования» (служба ядра).', en: 'It is off by default; contracts go through Approvals (a core service).' } },
    { title: { ru: 'Типы и нумерация', en: 'Types and numbering' }, text: { ru: 'В [настройках](/admin/settings/contracts): типы договоров, шаблон номера, окна напоминаний об окончании.', en: 'In the [settings](/admin/settings/contracts): contract types, the number template, expiry reminder windows.' } },
    { title: { ru: 'Маршрут', en: 'Route' }, text: { ru: 'Настройте этапы для «Договора» в [согласованиях](/admin/settings/approvals): юрист, финансы, директор — с условиями по сумме и типу.', en: 'Set stages for «Contract» in [approvals](/admin/settings/approvals): lawyer, finance, director — conditioned on amount and type.' } },
    { title: { ru: 'Права', en: 'Rights' }, text: { ru: 'Юристам — contracts.legal, финансам — contracts.finance.', en: 'Lawyers get contracts.legal, finance contracts.finance.' } },
  ],
  roles: {
    'contracts.create': { ru: 'Создание новых договоров.', en: 'Create contracts.' },
    'contracts.view_all': { ru: 'Все договоры компании.', en: 'Every contract.' },
    'contracts.legal': { ru: 'Риски, отметки «Подписан» и «Расторгнут».', en: 'Risks, «Signed» and «Terminated».' },
    'contracts.finance': { ru: 'Подтверждение задатков, платежи, реестр поступлений.', en: 'Confirm deposits, register payments, the payments registry.' },
    'contracts.admin': { ru: 'Настройки и всё остальное.', en: 'Settings and everything else.' },
  },
  scenarios: [
    { title: { ru: 'Договор поставки', en: 'A supply contract' }, text: { ru: 'Менеджер загружает проект, юрист отмечает риски, после согласования договор подписывается; за 30 дней до окончания приходит напоминание.', en: 'A manager uploads the draft, the lawyer marks risks, after approval it is signed; 30 days before the end a reminder arrives.' } },
    { title: { ru: 'Продажа квартиры', en: 'Selling an apartment' }, text: { ru: 'Договор продажи связан с юнитом мастерплана: подписание и оплаты обновляют статус и оплаченную сумму юнита.', en: 'A sales contract is linked to a masterplan unit: signing and payments update the unit’s status and paid amount.' } },
  ],
  faq: [
    { q: { ru: 'Без «Контрагентов»?', en: 'Without Counterparties?' }, a: { ru: 'Контрагент вводится текстом.', en: 'The counterparty is typed as text.' } },
    { q: { ru: 'Где версии?', en: 'Where are versions?' }, a: { ru: 'Во вкладке файлов карточки, с описанием «что изменено».', en: 'In the card’s files tab, with «what changed».' } },
  ],
};
