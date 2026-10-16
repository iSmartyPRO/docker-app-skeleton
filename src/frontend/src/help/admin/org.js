export default {
  id: 'org',
  purpose: {
    ru: 'Оргструктура — карта компании в портале: юрлицо, центральный офис, филиалы, отделы и объекты с руководителями. Это служба ядра, она всегда включена. Согласования отправляют документ «руководителю подразделения автора», модули выбирают подразделения по назначению (склады объекта, стройплощадки), оргсхема показывает, кто кем руководит.',
    en: 'The org structure is the company’s map in the portal: the legal entity, the head office, branches, departments and sites with their heads. It is a core service and always on. Approvals route a document to «the head of the author’s unit», modules pick units by purpose (warehouses of a site, construction sites), the org chart shows who reports to whom.',
  },
  audience: {
    ru: 'Администратор портала или отдел кадров настраивает дерево; руководители и сотрудники видят оргсхему; модули и Согласования пользуются ей сами.',
    en: 'The portal administrator or HR builds the tree; heads and staff see the org chart; modules and Approvals use it by themselves.',
  },
  setup: [
    {
      title: { ru: 'Типы подразделений', en: 'Unit types' },
      text: {
        ru: 'Проверьте типы на вкладке «Типы и назначения»: по умолчанию Компания, Центральный офис, Филиал, Департамент/Отдел, Объект. Переименуйте их под свою компанию или добавьте свои (например, «Магазин»).',
        en: 'Check the types on «Types and purposes»: by default Company, Head office, Branch, Department, Site. Rename them for your company or add your own (e.g. «Store»).',
      },
    },
    {
      title: { ru: 'Компания и юрлицо', en: 'The company and its legal entity' },
      text: {
        ru: 'Создайте верхний узел типа «Компания» и свяжите его с юрлицом из [справочника юрлиц](/admin/settings/legalEntities). В группе компаний — по узлу на каждое юрлицо.',
        en: 'Create the top node of type «Company» and link it to a legal entity from the [legal entities directory](/admin/settings/legalEntities). A group of companies gets one node per entity.',
      },
    },
    {
      title: { ru: 'Офисы, филиалы, отделы, объекты', en: 'Offices, branches, departments, sites' },
      text: {
        ru: 'Добавьте подразделения и перетащите их на места. Часовой пояс задают только там, где он отличается: остальные наследуют его сверху.',
        en: 'Add the units and drag them into place. Set a time zone only where it differs: the others inherit it from above.',
      },
    },
    {
      title: { ru: 'Руководители', en: 'Heads' },
      text: {
        ru: 'Назначьте руководителя каждому подразделению — сотрудника (если включён модуль «Сотрудники») или учётную запись портала. Без руководителя вопрос поднимается к вышестоящему.',
        en: 'Give every unit a head — an employee (with the Employees module) or a portal account. Without one, the question goes up to the unit above.',
      },
    },
    {
      title: { ru: 'Люди в подразделениях', en: 'People in units' },
      text: {
        ru: 'Без модуля «Сотрудники» разместите учётные записи в подразделениях — в карточке подразделения или в «Пользователи → человек → Оргструктура». С модулем подразделение берётся из карточки сотрудника.',
        en: 'Without the Employees module place accounts in units — on the unit card or in «Users → a person → Org structure». With the module the unit comes from the employee card.',
      },
    },
    {
      title: { ru: 'Маршруты согласования', en: 'Approval routes' },
      text: {
        ru: 'В [маршрутах](/admin/settings/approvals) добавьте этап с согласующим «Руководитель подразделения автора». В предпросмотре выберите автора — увидите, кто именно согласует.',
        en: 'In the [routes](/admin/settings/approvals) add a stage with the approver «Head of the author’s unit». Pick an author in the preview to see who exactly will approve.',
      },
    },
  ],
  roles: {
    'org.manage': {
      ru: 'Меняет дерево, типы и назначения, размещает людей. Смотреть оргструктуру могут все вошедшие.',
      en: 'Changes the tree, types and purposes, places people. Everyone signed in can look at the structure.',
    },
  },
  access: {
    ru: 'Читать оргструктуру может любой вошедший — это общая карта компании. Подразделение учётной записи могут менять обладатели `org.manage` или `users.manage`.',
    en: 'Anyone signed in reads the structure — it is the company’s shared map. The unit of an account is changed by holders of `org.manage` or `users.manage`.',
  },
  scenarios: [
    {
      title: { ru: 'Заявка уходит руководителю', en: 'A request goes to the head' },
      text: {
        ru: 'Бухгалтер из «Финансового отдела» создаёт заявку на закупку — первым её согласует руководитель отдела. Если заявку создаёт сам руководитель, её согласует директор.',
        en: 'An accountant of «Finance» files a purchase request — the head of the department approves first. If the head files it, the director approves.',
      },
    },
    {
      title: { ru: 'Новый филиал', en: 'A new branch' },
      text: {
        ru: 'Создайте «Филиал «Север»» с часовым поясом города, перетащите в него отдел продаж и объект — согласования и сроки сразу учитывают новое место.',
        en: 'Create «North branch» with the city’s time zone, drag the sales team and the site into it — approvals and deadlines follow the new place at once.',
      },
    },
    {
      title: { ru: 'Реорганизация', en: 'A reorganisation' },
      text: {
        ru: 'Отдел переходит в другой департамент: перетащите его. Перемещение видно в истории подразделения и в журнале; запущенные согласования не меняются.',
        en: 'A team moves to another department: drag it. The move shows in the unit’s history and the activity log; running approvals stay as they are.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Как удалить подразделение?', en: 'How do I delete a unit?' },
      a: {
        ru: 'Удалить можно только пустое подразделение без вложенных и людей. Иначе закройте его — статус «Закрыт» сохраняет историю, а в выборе подразделения его больше нет.',
        en: 'Only an empty unit without subunits and people can be deleted. Otherwise close it — «Closed» keeps the history and it disappears from pickers.',
      },
    },
    {
      q: { ru: 'Что, если руководитель не найден?', en: 'What if no head is found?' },
      a: {
        ru: 'Этап согласуют люди эскалации маршрута, а если их нет — администраторы модуля. В истории процесса появится отметка.',
        en: 'The route’s escalation people approve the stage, otherwise the module administrators. The process history notes it.',
      },
    },
    {
      q: { ru: 'Нужен ли модуль «Сотрудники»?', en: 'Do I need the Employees module?' },
      a: {
        ru: 'Нет. Оргструктура работает и с одними учётными записями портала. Модуль «Сотрудники» добавляет людей без доступа к порталу, явных руководителей и численность.',
        en: 'No. The structure works with portal accounts alone. The Employees module adds people without portal access, explicit managers and headcount.',
      },
    },
    {
      q: { ru: 'Можно ли откатить перемещение?', en: 'Can I undo a move?' },
      a: {
        ru: 'Сразу после перетаскивания есть кнопка «Отменить». Позже — перетащите подразделение обратно; оба перемещения останутся в истории.',
        en: 'Right after a drop there is «Undo». Later, drag the unit back; both moves stay in the history.',
      },
    },
  ],
};
