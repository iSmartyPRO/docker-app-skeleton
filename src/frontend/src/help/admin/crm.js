export default {
  id: 'crm',
  purpose: {
    ru: 'CRM ведёт сделки по стадиям воронки: канбан, список, дела и календарь, свои поля и несколько воронок. Клиенты — компании и люди из «Контрагентов», без отдельной копии.',
    en: 'CRM moves deals through pipeline stages: kanban, list, activities and calendar, custom fields and several pipelines. Clients are the companies and people of Counterparties, with no separate copy.',
  },
  audience: { ru: 'Отдел продаж и его руководитель.', en: 'The sales team and its head.' },
  setup: [
    { title: { ru: 'Воронки и стадии', en: 'Pipelines and stages' }, text: { ru: 'Создайте воронку и стадии; последние две — «Успех» и «Провал».', en: 'Create a pipeline and stages; the last two are «Won» and «Lost».' } },
    { title: { ru: 'Валюты и поля', en: 'Currencies and fields' }, text: { ru: 'В [настройках](/admin/settings/crm): валюта по умолчанию, список валют, свои поля сделки и их разделы.', en: 'In the [settings](/admin/settings/crm): default currency, currency list, custom deal fields and their sections.' } },
    { title: { ru: 'Видимость', en: 'Visibility' }, text: { ru: 'Видят ли менеджеры только свои сделки или все.', en: 'Whether managers see only their own deals or all.' } },
    { title: { ru: 'Включите «Контрагентов»', en: 'Switch on Counterparties' }, text: { ru: 'Чтобы выбирать клиентов из справочника и видеть сделки в карточке компании.', en: 'To pick clients from the directory and see deals on the company card.' } },
  ],
  roles: {
    'crm.admin': { ru: 'Настройки, воронки и все сделки.', en: 'Settings, pipelines and every deal.' },
    'crm.all': { ru: 'Видит и правит все сделки — для руководителя продаж.', en: 'Sees and edits every deal — for the head of sales.' },
  },
  scenarios: [
    { title: { ru: 'Входящая заявка', en: 'An incoming lead' }, text: { ru: 'Менеджер создаёт сделку, выбирает компанию из справочника, планирует звонок — дело появляется в календаре.', en: 'A manager creates a deal, picks the company, schedules a call — the activity shows in the calendar.' } },
    { title: { ru: 'Отчёт руководителю', en: 'Report for the head' }, text: { ru: 'С правом crm.all руководитель видит канбан всей команды и суммы по стадиям.', en: 'With crm.all the head sees the whole team’s kanban and sums per stage.' } },
  ],
  faq: [
    { q: { ru: 'Можно ли несколько воронок?', en: 'Several pipelines?' }, a: { ru: 'Да, у каждой свои стадии; одна — по умолчанию.', en: 'Yes, each with its own stages; one is the default.' } },
    { q: { ru: 'Обязательные поля?', en: 'Required fields?' }, a: { ru: 'Поле можно сделать обязательным в форме; API такие сделки не отклоняет.', en: 'A field can be required in the form; the API does not refuse such deals.' } },
  ],
};
