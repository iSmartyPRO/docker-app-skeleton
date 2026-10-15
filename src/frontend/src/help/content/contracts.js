export default {
  id: 'contracts',
  icon: 'clipboard',
  title: { ru: 'Договоры', en: 'Contracts' },
  tagline: {
    ru: 'Реестр договоров компании: версии, риски юриста, согласование и сроки под контролем.',
    en: 'The company’s contracts registry: versions, the lawyer’s risks, approval and deadlines under control.',
  },
  summary: {
    ru: 'Каждый договор — карточка с контрагентом, суммой, сроками и ответственными. Юрист отмечает, на что обратить внимание, коллеги загружают новые версии с описанием правок, договор проходит согласование, а за 30 и 7 дней до окончания приходит напоминание.',
    en: 'Each contract is a card with the counterparty, amount, dates and people. The lawyer notes what to watch for, colleagues upload new versions saying what changed, the contract goes through approval, and reminders arrive 30 and 7 days before the end.',
  },
  highlights: [
    { icon: '🗂', title: { ru: 'Версии файла', en: 'File versions' }, text: { ru: 'Каждая версия — с автором, датой и «что изменено»; любую можно открыть или скачать.', en: 'Each version has its author, date and “what changed”; any one opens or downloads.' } },
    { icon: '⚠️', title: { ru: 'На что обратить внимание', en: 'What to watch for' }, text: { ru: 'Риски юриста с пунктом и важностью; серьёзные видны согласующему рядом с кнопками.', en: 'The lawyer’s risks with the clause and importance; serious ones sit next to the approver’s buttons.' } },
    { icon: '✅', title: { ru: 'Согласование', en: 'Approval' }, text: { ru: 'Маршрут из этапов, вопросы и ответы прямо в карточке.', en: 'A route of stages, questions and answers right in the card.' } },
    { icon: '⏳', title: { ru: 'Сроки под контролем', en: 'Deadlines under control' }, text: { ru: '«Истекает» ставится сам, напоминания приходят ответственному и юристу.', en: '«Expiring» is set automatically, reminders go to the owner and the lawyer.' } },
    { icon: '📅', title: { ru: 'Календарь окончаний', en: 'Expiry calendar' }, text: { ru: 'Двенадцать месяцев вперёд: что заканчивается и когда отказаться от пролонгации.', en: 'Twelve months ahead: what ends and when to refuse a prolongation.' } },
    { icon: '💬', title: { ru: 'Обсуждение', en: 'Discussion' }, text: { ru: 'Чат договора; сообщение можно привязать к риску.', en: 'The contract’s chat; a message can point at a risk.' } },
    { icon: '💳', title: { ru: 'Задаток и оплаты', en: 'Deposit and payments' }, text: { ru: 'Для продаж: задаток, график платежей из суммы или сетки цен объекта, поступления и просрочка.', en: 'For sales: the deposit, a payment schedule from the amount or the object’s price grid, payments and what is overdue.' } },
  ],
  tips: [
    { ru: 'Карточка открывается справа поверх реестра; ↑ и ↓ листают договоры, Esc закрывает.', en: 'The card opens on the right over the registry; ↑ and ↓ move between contracts, Esc closes.' },
    { ru: 'Клавиша / ставит курсор в поиск реестра.', en: 'The / key puts the cursor into the registry search.' },
    { ru: 'Незаконченная форма нового договора сохраняется сама — её можно закрыть и вернуться.', en: 'An unfinished new-contract form is saved by itself — close it and come back later.' },
    { ru: 'Чип «Без подписанной версии» показывает подписанные договоры, скан которых ещё не загружен.', en: 'The «No signed version» chip shows signed contracts whose scan is not uploaded yet.' },
    { ru: 'Кнопка «⤓ CSV» выгружает текущий список в Excel с учётом фильтров и прав.', en: 'The «⤓ CSV» button exports the current list to Excel with the filters and rights applied.' },
  ],
  sections: [
    {
      id: 'registry',
      title: { ru: 'Реестр', en: 'The registry' },
      body: {
        ru: 'Над списком — чипы со счётчиками: **Все**, **Мои**, **Ждут меня**, **Срочные**, **Просрочено**, **В работе**, **Действуют**, **Истекают за N дней**, **Без подписанной версии** и **Отработано** (архив: завершённые, расторгнутые, отклонённые).\n\nПоиск — по номеру, предмету, контрагенту и номеру у контрагента. Колонки: №, контрагент и предмет, тип, сумма, срок до, статус, ответственный. Дата окончания подсвечивается: красным — осталось меньше недели или срок прошёл, жёлтым — договор в окне «Истекает», значок ↻ — автопролонгация.\n\nПо умолчанию сверху то, что требует внимания: просроченные согласования, вопросы, договоры на согласовании по срочности, затем истекающие.',
        en: 'Above the list are chips with counters: **All**, **Mine**, **Waiting for me**, **Urgent**, **Overdue**, **In work**, **In force**, **Expiring in N days**, **No signed version** and **Done** (the archive: completed, terminated, rejected).\n\nSearch by number, subject, counterparty and the counterparty’s number. Columns: number, counterparty and subject, type, amount, end date, status, owner. The end date is red when less than a week is left or it has passed, yellow inside the «Expiring» window; ↻ marks auto-prolongation.\n\nBy default what needs attention is on top: overdue approvals, questions, contracts in approval by urgency, then expiring ones.',
      },
    },
    {
      id: 'card',
      title: { ru: 'Карточка договора', en: 'The contract card' },
      body: {
        ru: 'В шапке — номер, статус, тип, предмет, контрагент и юрлицо, сумма (или «Рамочный»), срок, дата отказа от пролонгации и ответственные. Ниже — путь согласования и кнопки решения, затем вкладки:\n\n- **Обзор** — все поля и риски;\n- **Версии** — лента файлов;\n- **Обсуждение** — чат договора;\n- **Связи** — заявки на закупку, сделка CRM, объект Мастерплана (если эти модули включены);\n- **История** — кто и что менял, включая решения по согласованию.',
        en: 'The header shows the number, status, type, subject, counterparty and legal entity, amount (or «Framework»), term, the refusal deadline and the people. Below are the approval path and the decision buttons, then the tabs:\n\n- **Overview** — every field and the risks;\n- **Versions** — the file feed;\n- **Discussion** — the contract’s chat;\n- **Links** — purchase requests, the CRM deal, the Masterplan object (when those modules are on);\n- **History** — who changed what, approval decisions included.',
      },
      steps: [
        { ru: 'Нажмите «Новый договор». Достаточно предмета, контрагента и файла — остальное можно дополнить позже.', en: 'Press «New contract». The subject, the counterparty and the file are enough — the rest can follow.' },
        { ru: 'Юрист добавляет риски на вкладке «Обзор».', en: 'The lawyer adds risks on the Overview tab.' },
        { ru: 'После правок загрузите новую версию с комментарием «что изменено».', en: 'After changes, upload a new version saying what changed.' },
        { ru: 'Выберите срочность и нажмите «Отправить на согласование».', en: 'Choose the urgency and press «Send to approval».' },
        { ru: 'После согласования юрист отмечает договор подписанным и выбирает подписанную версию.', en: 'Once approved, the lawyer marks the contract signed and picks the signed version.' },
      ],
    },
    {
      id: 'statuses',
      title: { ru: 'Статусы', en: 'Statuses' },
      body: {
        ru: '**Проект** → **На согласовании** (↔ **Нужен ответ**) → **Согласован** → **Подписан** → **Действует** → **Истекает** → **Завершён**. Боковые: **Отклонён** и **Расторгнут**.\n\n- Статусы согласования ставит сервис согласований; вернуть документ на доработку — значит вернуть его в «Проект».\n- «Подписан», «Действует», «Завершён» и «Расторгнут» ставит юрист; для расторжения нужна причина.\n- «Действует» ставится сам с даты начала, «Истекает» — за N дней до окончания, «Завершён» — после окончания. Договор с автопролонгацией после окончания получает следующий срок той же длины.\n- Поля можно править в «Проекте», «Нужен ответ» и «Отклонён»; на согласовании они заблокированы, а версии и риски — нет. Юрист может поправить поля и на согласовании — тогда этапы, до которых ещё не дошло, пересчитываются по условиям маршрута.',
        en: '**Draft** → **In approval** (↔ **Answer needed**) → **Approved** → **Signed** → **In force** → **Expiring** → **Completed**. Side ones: **Rejected** and **Terminated**.\n\n- Approval statuses come from the approvals service; returning a document for rework puts it back into «Draft».\n- «Signed», «In force», «Completed» and «Terminated» are set by a lawyer; termination needs a reason.\n- «In force» comes by itself from the start date, «Expiring» N days before the end, «Completed» after the end. An auto-prolonged contract gets the next term of the same length instead.\n- Fields can be edited in «Draft», «Answer needed» and «Rejected»; in approval they are locked, versions and risks are not. A lawyer may still correct fields in approval; the stages not reached yet are then re-planned by the route conditions.',
      },
    },
    {
      id: 'risks',
      title: { ru: 'На что обратить внимание', en: 'What to watch for' },
      body: {
        ru: 'Чек-лист юриста: текст, пункт договора, важность (высокая, средняя, низкая) и статус (открыт, принят, исправлен). Пока договор на согласовании, открытые риски высокой важности показываются согласующему прямо над кнопками решения.\n\nКнопка 💬 у риска пишет в обсуждение сообщение «Риск #N» со ссылкой обратно на него — так переписка не теряет контекст.',
        en: 'The lawyer’s checklist: the text, the clause, the importance (high, medium, low) and the status (open, accepted, fixed). While the contract is in approval, open high risks are shown to the approver right above the decision buttons.\n\nThe 💬 button of a risk writes a «Risk #N» message into the discussion with a link back to it, so the conversation keeps its context.',
      },
    },
    {
      id: 'calendar',
      title: { ru: 'Календарь окончаний и напоминания', en: 'Expiry calendar and reminders' },
      body: {
        ru: 'Календарь показывает двенадцать месяцев: в каждой ячейке — сколько договоров заканчивается и сколько сроков отказа от пролонгации (↻). Ниже месяцы списком: день, что происходит, контрагент, сумма.\n\nНапоминания приходят ответственному и юристу за 30 и 7 дней (настраивается) до окончания, а для договоров с автопролонгацией — до последнего дня, когда можно отказаться. Каждое напоминание приходит один раз.',
        en: 'The calendar shows twelve months: each cell says how many contracts end and how many refusal deadlines (↻) fall in it. Below, the months as lists: the day, what happens, the counterparty, the amount.\n\nReminders reach the owner and the lawyer 30 and 7 days (configurable) before the end, and for auto-prolonged contracts before the last day to refuse. Each reminder comes once.',
      },
    },
    {
      id: 'payments',
      title: { ru: 'Задаток, график платежей, поступления', en: 'Deposit, payment schedule, payments' },
      body: {
        ru: 'Вкладка **Оплаты** появляется у договоров с клиентом, у типов «Купли-продажи» и «Продажа объекта» и у любого договора, где уже есть задаток или график.\n\n**Задаток или аванс.** Задаток обеспечивает сделку: если откажется покупатель — он остаётся у продавца, если продавец — возвращается в двойном размере (ГК КР / РФ). Аванс возвращается всегда. Укажите сумму, срок и условия возврата; получение подтверждает финансист (право «Финансы (договоры)») — с датой, способом, номером и платёжкой. Потом задаток можно **зачесть в оплату**, **вернуть** или **удержать**.\n\n**График платежей.** «Составить график»: 100 % или рассрочка — первый взнос в %, число месяцев, дата первого платежа и день месяца. Если договор связан с объектом Мастерплана, сверху — планы его сетки цен: нажмите план, и параметры подставятся. Первый взнос и ежемесячные — целыми суммами, последний платёж забирает разницу. Задаток идёт отдельной строкой и уменьшает первый взнос. Строки можно править перед сохранением.\n\n**Поступления.** Финансист отмечает каждое поступление — оно закрывает самые ранние неоплаченные платежи, частичная оплата закрывает платёж частично. Наверху — «оплачено N %», остаток, просрочено и следующий платёж. Просроченные строки — красные, ближайшие (за 7 дней, настраивается) — жёлтые.\n\n**Мастерплан.** Если договор связан с объектом и оба модуля включены: подтверждённый задаток переводит объект из «Резерва» / «Брони» в «Задаток», подписание — в «Договор» (номер, дата, сумма), поступления обновляют «оплачено», 100 % — «Продано». Переходы делаются с вашими правами в Мастерплане; если переход не разрешён, деньги всё равно учтены, а в карточке появляется жёлтая заметка — что сделать вручную.',
        en: 'The **Payments** tab shows on contracts with a client, on the «Sale» and «Property sale» types and on any contract that already has a deposit or a schedule.\n\n**Deposit or advance.** A deposit secures the deal: if the buyer backs out it stays with the seller, if the seller backs out it is returned double (Civil Code of the KR / RF). An advance is always refundable. Enter the amount, the due day and the refund terms; finance (the «Finance (contracts)» right) confirms the receipt with the date, method, number and document. Later the deposit is **credited to the price**, **returned** or **retained**.\n\n**Payment schedule.** «Build a schedule»: 100 % or installments — the first payment in %, months, the first day and the day of month. When the contract is linked to a Masterplan object, its price-grid plans are on top: click one and the numbers fill in. The first and monthly payments are whole amounts, the last one takes the difference. The deposit is its own row and reduces the first payment. Rows can be edited before saving.\n\n**Payments.** Finance registers every payment: it covers the oldest unpaid rows first, a partial payment covers a row partly. On top: «paid N %», what is left, overdue and the next payment. Overdue rows are red, upcoming ones (7 days, configurable) amber.\n\n**Masterplan.** When the contract is linked to an object and both modules are on: a confirmed deposit moves the object from reserve / booking to «Deposit», signing to «Contract» (number, date, amount), payments update «paid», 100 % makes it «Sold». The moves use your Masterplan rights; when one is not allowed the money is recorded anyway and the card shows an amber note with what to do by hand.',
      },
    },
    {
      id: 'payments-registry',
      title: { ru: 'Реестр поступлений', en: 'Payments registry' },
      body: {
        ru: '**Поступления** в меню модуля — для финансов и тех, кто видит все договоры: неоплаченные платежи и ожидаемые задатки по группам **Просрочено**, **Сегодня**, **На неделе**, **Позже**, итоги по валютам. «Отметить поступление» и «Подтвердить» задаток — прямо в строке; договор открывается справа на вкладке «Оплаты». Кнопка «Выгрузить CSV» сохраняет список для Excel.\n\nВ реестре договоров есть чипы **Ждут задаток**, **Просрочены платежи** и **Оплачены** — они появляются, когда им есть что показать. На главной странице можно добавить виджет «Поступления по договорам».',
        en: '**Payments** in the module menu is for finance and those who see every contract: unpaid payments and expected deposits grouped **Overdue**, **Today**, **This week**, **Later**, with totals per currency. «Mark received» and «Confirm» a deposit right in the row; the contract opens on the right on its «Payments» tab. «Export CSV» saves the list for Excel.\n\nThe contracts registry has the chips **Awaiting deposit**, **Payments overdue** and **Paid** — they show up when they have something to show. The «Contract payments» widget can be added to the home page.',
      },
    },
    {
      id: 'access',
      title: { ru: 'Кто что видит', en: 'Who sees what' },
      body: {
        ru: '- **Все договоры** видят руководство (право «Все договоры»), юристы и администраторы договоров.\n- Остальные видят свои договоры (создал, ответственный, юрист), договоры своей группы и те, где они согласующие.\n- Создавать договоры может тот, у кого есть право «Создание договоров».\n- Файлы открываются только тем, кто видит договор.\n- **Финансы (договоры)** видят договоры с задатком или графиком, подтверждают задатки и отмечают поступления; планируют задаток и график люди договора.',
        en: '- **Every contract** is visible to management (the «See every contract» right), lawyers and contracts administrators.\n- Others see their own contracts (created, owner, lawyer), their group’s and those they approve.\n- Contracts are created by people with the «Create contracts» right.\n- Files open only for people who see the contract.\n- **Finance (contracts)** sees the contracts with a deposit or a schedule, confirms deposits and registers payments; the contract’s people plan the deposit and the schedule.',
      },
    },
  ],
  faq: [
    { q: { ru: 'Почему не отправляется на согласование?', en: 'Why can’t I send it to approval?' }, a: { ru: 'Нужен хотя бы один файл договора, а сам договор должен быть в «Проекте» или «Отклонён».', en: 'It needs at least one file, and the contract must be a draft or rejected.' } },
    { q: { ru: 'Кто согласует договоры?', en: 'Who approves contracts?' }, a: { ru: 'Маршрут настраивается в «Настройки → Согласования», тип «Договор». Пока он не сохранён — администраторы договоров.', en: 'The route is set in «Settings → Approvals», type «Contract». Until it is saved, contracts administrators approve.' } },
    { q: { ru: 'Как продлить договор?', en: 'How do I extend a contract?' }, a: { ru: 'Юрист меняет дату окончания — договор снова станет «Действует». С автопролонгацией срок продлевается сам.', en: 'A lawyer changes the end date and the contract is «In force» again. With auto-prolongation the term extends by itself.' } },
    { q: { ru: 'Что значит «Без подписанной версии»?', en: 'What does «No signed version» mean?' }, a: { ru: 'Договор согласован или подписан, но ни одна версия не отмечена подписанной. Загрузите скан с галочкой «Это подписанная версия».', en: 'The contract is approved or signed, but no version is marked as signed. Upload the scan with «This is the signed version» ticked.' } },
  ],
  fields: {
    framework: { title: { ru: 'Рамочный договор', en: 'Framework contract' }, text: { ru: 'Без фиксированной суммы: объёмы и цены определяются заказами или спецификациями.', en: 'No fixed amount: volumes and prices come with orders or specifications.' } },
    autoRenew: { title: { ru: 'Автопролонгация', en: 'Auto-prolongation' }, text: { ru: 'Договор продлевается сам, если ни одна сторона не отказалась. После окончания портал ставит следующий срок той же длины.', en: 'The contract renews by itself unless a side refuses. After the end the portal sets the next term of the same length.' }, more: 'statuses' },
    noticeDays: { title: { ru: 'Срок уведомления об отказе', en: 'Refusal notice' }, text: { ru: 'За сколько дней до окончания нужно уведомить об отказе от продления. Портал напомнит заранее.', en: 'How many days before the end a refusal must be sent. The portal reminds you in advance.' }, more: 'calendar' },
    risks: { title: { ru: 'Риски', en: 'Risks' }, text: { ru: 'Чек-лист юриста. Открытые риски высокой важности согласующий видит рядом с кнопками решения.', en: 'The lawyer’s checklist. Approvers see open high risks next to their decision buttons.' }, more: 'risks' },
  },
  related: ['approvals', 'procurement', 'companies', 'chat'],
};
