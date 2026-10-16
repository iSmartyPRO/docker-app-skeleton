export default {
  id: 'approvals',
  purpose: {
    ru: 'Согласования — служба ядра: маршруты согласования документов (заявки, договоры, складские документы) с условиями, сроками, срочностью и замещениями, и единые входящие «Ждёт меня» для всех решений.',
    en: 'Approvals is a core service: approval routes for documents (requests, contracts, warehouse documents) with conditions, deadlines, urgency and substitutes, and one «Waiting for me» inbox for every decision.',
  },
  audience: { ru: 'Все, кто согласует; администратор настраивает маршруты для каждого типа документа.', en: 'Everyone who approves; the administrator sets routes per document type.' },
  setup: [
    { title: { ru: 'Маршруты', en: 'Routes' }, text: { ru: 'В [настройках](/admin/settings/approvals) для каждого типа документа задайте этапы: кто согласует, последовательно или параллельно, и условия (сумма, тип, юрлицо).', en: 'In the [settings](/admin/settings/approvals) set stages per document type: who approves, in sequence or in parallel, and conditions (amount, type, legal entity).' } },
    { title: { ru: 'Срочность и сроки', en: 'Urgency and deadlines' }, text: { ru: 'Уровни срочности со своими сроками, напоминаниями и эскалацией.', en: 'Urgency levels with their deadlines, reminders and escalation.' } },
    { title: { ru: 'Замещения', en: 'Substitutes' }, text: { ru: 'На время отпуска сотрудник назначает заместителя в «Кабинет → Замещение».', en: 'During a holiday a person names a substitute in Account → Substitute.' } },
  ],
  roles: { 'approvals.admin': { ru: 'Маршруты, срочность и настройки службы.', en: 'Routes, urgency and service settings.' } },
  scenarios: [
    { title: { ru: 'Крупная закупка', en: 'A large purchase' }, text: { ru: 'Заявка дороже порога идёт руководителю, затем финансовому директору; дешевле — только руководителю.', en: 'A request above the threshold goes to the manager and then the CFO; below it — to the manager only.' } },
    { title: { ru: 'Отпуск согласующего', en: 'An approver on holiday' }, text: { ru: 'Заместитель получает документы во «Ждёт меня» на время отпуска; в истории видно, кто решал.', en: 'The substitute gets the documents in «Waiting for me» during the holiday; history shows who decided.' } },
  ],
  faq: [
    { q: { ru: 'Почему нельзя выключить согласования?', en: 'Why can’t approvals be switched off?' }, a: { ru: 'Это служба ядра: через неё идут документы закупок, договоров и склада.', en: 'It is a core service: procurement, contract and warehouse documents go through it.' } },
    { q: { ru: 'Что если маршрут не задан?', en: 'What if no route is set?' }, a: { ru: 'Модуль использует свой маршрут по умолчанию (обычно — руководитель автора).', en: 'The module uses its default route (usually the author’s manager).' } },
  ],
};
