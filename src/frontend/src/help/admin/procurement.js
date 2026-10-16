export default {
  id: 'procurement',
  purpose: {
    ru: 'Закупки ведут заявку от счёта до поставки: сотрудник подаёт заявку со счётом, она проходит согласование, попадает в реестр оплат бухгалтерии, оплачивается (частями или целиком) и закрывается после поставки.',
    en: 'Procurement takes a request from invoice to delivery: an employee files it with the invoice, it is approved, lands in accounting’s payments registry, is paid (in parts or in full) and closed after delivery.',
  },
  audience: { ru: 'Инициаторы закупок, согласующие, бухгалтерия, снабжение.', en: 'Requesters, approvers, accounting and supply.' },
  setup: [
    { title: { ru: 'Включите модуль', en: 'Switch the module on' }, text: { ru: 'Он выключен по умолчанию. Нужны «Согласования» (служба ядра, всегда включена).', en: 'It is off by default. It needs Approvals (a core service, always on).' } },
    { title: { ru: 'Справочники', en: 'Directories' }, text: { ru: 'Категории закупок, юрлица-плательщики и валюты — в [настройках](/admin/settings/procurement).', en: 'Purchase categories, paying legal entities and currencies — in the [settings](/admin/settings/procurement).' } },
    { title: { ru: 'Маршрут согласования', en: 'Approval route' }, text: { ru: 'Настройте этапы для типа «Заявка на закупку» в [согласованиях](/admin/settings/approvals), например по сумме.', en: 'Set stages for «Purchase request» in [approvals](/admin/settings/approvals), e.g. by amount.' } },
    { title: { ru: 'Права', en: 'Rights' }, text: { ru: 'Бухгалтерии — procurement.pay, руководству — procurement.view_all.', en: 'Accounting gets procurement.pay, management procurement.view_all.' } },
    { title: { ru: 'Связки', en: 'Links' }, text: { ru: 'Включите «Контрагентов», «Мастерплан», CRM и «Договоры», чтобы выбирать поставщика, объект, сделку и договор из справочников.', en: 'Switch on Counterparties, Masterplan, CRM and Contracts to pick the supplier, object, deal and contract from directories.' } },
  ],
  roles: {
    'procurement.create': { ru: 'Подача заявок, если «Подавать могут все» выключено.', en: 'Filing requests when «Anyone may file» is off.' },
    'procurement.view_all': { ru: 'Все заявки компании, а не только свои и согласуемые.', en: 'Every request, not only own and approved ones.' },
    'procurement.pay': { ru: 'Реестр оплат и отметка платежей.', en: 'The payments registry and marking payments.' },
    'procurement.admin': { ru: 'Справочники, настройки, маршруты и все заявки.', en: 'Directories, settings, routes and every request.' },
  },
  scenarios: [
    { title: { ru: 'Покупка оборудования', en: 'Buying equipment' }, text: { ru: 'Прораб подаёт заявку со счётом на объект «Северный квартал», руководитель согласует, бухгалтерия платит двумя частями, склад принимает поставку.', en: 'A foreman files a request with an invoice for the «North Quarter» site, the manager approves, accounting pays in two parts, the warehouse receives the goods.' } },
    { title: { ru: 'Возврат на доработку', en: 'Returned for changes' }, text: { ru: 'Согласующий возвращает заявку с комментарием, автор прикладывает новый счёт и отправляет снова.', en: 'An approver returns the request with a comment; the author attaches a new invoice and resubmits.' } },
  ],
  faq: [
    { q: { ru: 'Обязателен ли модуль «Контрагенты»?', en: 'Are Counterparties required?' }, a: { ru: 'Нет. Без него поставщик вводится текстом.', en: 'No. Without it the supplier is typed as text.' } },
    { q: { ru: 'Кто видит заявку?', en: 'Who sees a request?' }, a: { ru: 'Автор, ответственный, согласующие, держатели view_all/pay/admin.', en: 'The author, the responsible person, approvers and holders of view_all/pay/admin.' } },
  ],
};
