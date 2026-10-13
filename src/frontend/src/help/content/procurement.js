export default {
  id: 'procurement',
  icon: 'cart',
  title: { ru: 'Закупки', en: 'Procurement' },
  tagline: {
    ru: 'Заявка на закупку за минуту: суть, сумма и счёт. Дальше — согласование, оплата и поставка без писем и мессенджеров.',
    en: 'A purchase request in a minute: what, how much and the invoice. Then approval, payment and delivery without e-mails or messengers.',
  },
  summary: {
    ru: 'Сотрудник подаёт заявку и прикладывает счёт. Заявка проходит согласование, после чего сама попадает в реестр оплат бухгалтерии. Бухгалтер отмечает оплату с платёжкой, ответственный подтверждает поставку. Путь и сроки видны всем участникам.',
    en: 'An employee files a request with the invoice. It goes through approval and then lands in the accounting payments registry by itself. Accounting marks the payment with the payment order, the responsible person confirms delivery. Everyone involved sees the path and the deadlines.',
  },
  highlights: [
    { icon: '📱', title: { ru: 'С телефона за минуту', en: 'From the phone in a minute' }, text: { ru: 'Сфотографируйте счёт камерой — форма сохраняется сама.', en: 'Take a photo of the invoice — the form saves itself.' } },
    { icon: '🧭', title: { ru: 'Прозрачный путь', en: 'A clear path' }, text: { ru: 'Кто подал, кто согласовал, где заявка сейчас и сколько там лежит.', en: 'Who filed it, who approved it, where it is now and for how long.' } },
    { icon: '💳', title: { ru: 'Реестр оплат', en: 'Payments registry' }, text: { ru: 'Бухгалтерия видит, что оплатить сегодня и что просрочено, с итогами по валютам.', en: 'Accounting sees what to pay today and what is overdue, with totals per currency.' } },
    { icon: '🚦', title: { ru: 'Цвет означает срок', en: 'Colour means deadline' }, text: { ru: 'Красное — просрочено, жёлтое — скоро срок. Напоминания уходят сами.', en: 'Red is overdue, yellow is due soon. Reminders go out by themselves.' } },
    { icon: '💬', title: { ru: 'Обсуждение в карточке', en: 'Discussion in the card' }, text: { ru: 'Вопросы и ответы — прямо в заявке, ничего не теряется.', en: 'Questions and answers right in the request; nothing gets lost.' } },
  ],
  tips: [
    { ru: 'Чипы над списком показывают счётчики: «Ждут меня», «Срочные», «Просрочено», «К оплате».', en: 'The chips above the list show counters: «Waiting for me», «Urgent», «Overdue», «To pay».' },
    { ru: 'Нужный набор фильтров сохраните как вид — он появится в меню «Виды».', en: 'Save a set of filters as a view — it appears in the «Views» menu.' },
    { ru: 'В открытой карточке клавиши ↑ и ↓ листают заявки списка.', en: 'With a card open, ↑ and ↓ move through the list.' },
    { ru: 'Позиции считают сумму сами; одна общая сумма — тоже можно.', en: 'Line items add up the amount; one total amount works too.' },
    { ru: 'Похожая заявка? «Ещё → Создать копию» — без документов и оплат.', en: 'A similar request? «More → Duplicate» — without documents and payments.' },
  ],
  sections: [
    {
      id: 'create',
      title: { ru: 'Подать заявку', en: 'File a request' },
      steps: [
        { ru: 'Нажмите «Новая заявка».', en: 'Press «New request».' },
        { ru: 'Опишите, что покупаете, и укажите сумму — одной суммой или позициями (наименование, количество, цена).', en: 'Describe what you buy and enter the amount — one total or line items (name, quantity, price).' },
        { ru: 'Перетащите счёт в рамку, выберите файл, возьмите его из «Файлов» или сфотографируйте камерой телефона.', en: 'Drop the invoice into the frame, choose a file, take it from Files or photograph it with the phone camera.' },
        { ru: 'Укажите срочность, «оплатить до», поставщика и, если нужно, остальное. Черновик сохраняется сам.', en: 'Set the urgency, «pay by», the supplier and anything else you need. The draft saves itself.' },
        { ru: 'Нажмите «Отправить на согласование».', en: 'Press «Send to approval».' },
      ],
      note: { ru: 'Обязательны только суть, сумма и счёт (если администратор не отключил требование счёта). Остальное можно дополнить позже.', en: 'Only the essence, the amount and the invoice are required (unless the administrator switched the invoice rule off). Everything else can be added later.' },
    },
    {
      id: 'statuses',
      title: { ru: 'Статусы заявки', en: 'Request statuses' },
      body: {
        ru: '**Черновик** → **На согласовании** (↔ **Нужен ответ**) → **К оплате** → **Оплачено частично** / **Оплачено** → **Поставлено** → **Закрыто**. Боковые: **Отклонено**, **Отменено**, **На доработке**.\n\n- После согласования заявка сама становится «К оплате» и появляется в реестре оплат.\n- «Оплачено» ставится, когда сумма оплат равна сумме заявки.\n- Отклонённая заявка не отправляется повторно — создайте копию.\n- Отменить можно черновик, заявку на согласовании (она отзовётся) и «К оплате» без оплат.',
        en: '**Draft** → **In approval** (↔ **Needs an answer**) → **To pay** → **Partly paid** / **Paid** → **Delivered** → **Closed**. Side statuses: **Rejected**, **Cancelled**, **Returned for rework**.\n\n- After approval the request becomes «To pay» by itself and appears in the payments registry.\n- «Paid» is set when the payments add up to the amount.\n- A rejected request is not sent again — make a copy.\n- You can cancel a draft, a request in approval (it is withdrawn) and «To pay» without payments.',
      },
    },
    {
      id: 'approval',
      title: { ru: 'Согласование', en: 'Approval' },
      body: {
        ru: 'Заявка идёт по маршруту согласования: по умолчанию один этап «Директор». Администратор может добавить этапы и условия (например, от $5 000 — финансовый директор). Согласующий видит заявку на странице [«Ждёт меня»](/app/approvals) и решает в 1–2 клика. Если вам задали вопрос, при необходимости поправьте заявку и ответьте в её карточке — она вернётся на тот же этап.',
        en: 'The request follows the approval route: one stage «Director» by default. An administrator can add stages and conditions (e.g. from $5,000 — the CFO). Approvers see it on the [«Waiting for me»](/app/approvals) page and decide in 1–2 clicks. If you are asked a question, change the request if needed and answer in its card — it returns to the same stage.',
      },
    },
    {
      id: 'payments',
      title: { ru: 'Реестр оплат', en: 'Payments registry' },
      body: {
        ru: 'Для бухгалтерии (право «Бухгалтерия: оплаты»). Согласованные заявки сгруппированы: **Просрочено**, **Сегодня**, **На неделе**, **Позже** — с итогами по валютам. «Отметить оплату» прямо в строке: дата, сумма (по умолчанию остаток), способ, номер платёжки и её файл. Можно отметить несколько частичных оплат. Кнопка «Выгрузить в Excel» сохраняет реестр в CSV.',
        en: 'For accounting (the «Accounting: payments» permission). Approved requests are grouped: **Overdue**, **Today**, **This week**, **Later** — with totals per currency. «Mark payment» right in the row: the date, the amount (what is left by default), the method, the payment order number and file. Several partial payments are fine. «Export to Excel» saves the registry as CSV.',
      },
    },
    {
      id: 'delivery',
      title: { ru: 'Поставка и закрытие', en: 'Delivery and closing' },
      body: {
        ru: 'Поставку подтверждает ответственный или автор: дата, «поставлено частично», накладная или акт. При постоплате поставку можно подтвердить до оплаты. Когда всё оплачено и поставлено, нажмите «Закрыть».',
        en: 'The responsible person or the author confirms delivery: the date, «delivered partly», the waybill or act. With post-payment, delivery can be confirmed before payment. When everything is paid and delivered, press «Close».',
      },
    },
    {
      id: 'summary',
      title: { ru: 'Сводка для руководителя', en: 'Summary for management' },
      body: {
        ru: 'Суммы по статусам, категориям и месяцам (по каждой валюте отдельно), средний срок согласования и список просроченных заявок — за последние 12 месяцев, по тем заявкам, которые вам видны.',
        en: 'Sums by status, category and month (per currency), the average approval time and overdue requests — for the last 12 months, over the requests you may see.',
      },
    },
    {
      id: 'access',
      title: { ru: 'Кто что видит', en: 'Who sees what' },
      body: {
        ru: '- Свои заявки (автор или ответственный) — всегда.\n- Заявки коллег из ваших групп — если так настроено (черновики остаются личными).\n- Заявки, где вы согласующий или вам задали вопрос.\n- **Видеть все заявки** — руководство.\n- **Бухгалтерия** видит согласованные заявки.\n- **Администратор закупок** настраивает справочники и управляет любыми заявками.',
        en: '- Your own requests (author or responsible) — always.\n- Requests of colleagues from your groups — if configured (drafts stay private).\n- Requests you approve or were asked about.\n- **See every request** — management.\n- **Accounting** sees approved requests.\n- **Procurement administrator** manages the directories and any request.',
      },
    },
  ],
  faq: [
    { q: { ru: 'Почему кнопка «Отправить на согласование» неактивна?', en: 'Why is «Send to approval» disabled?' }, a: { ru: 'Не хватает сути, суммы или счёта. Подсказка под кнопкой говорит, чего именно.', en: 'The title, the amount or the invoice is missing. The hint under the button says which.' } },
    { q: { ru: 'Можно ли изменить сумму после согласования?', en: 'Can the amount change after approval?' }, a: { ru: 'Нет. Отмените заявку и подайте новую (или создайте копию). Описание, срок поставки, ответственного и привязки менять можно.', en: 'No. Cancel the request and file a new one (or duplicate it). The description, deliver-by date, responsible person and links can still change.' } },
    { q: { ru: 'Бухгалтер ошибся с оплатой — что делать?', en: 'Accounting made a mistake in a payment — what now?' }, a: { ru: 'На вкладке «Оплаты» бухгалтер удаляет ошибочную запись, статус пересчитается сам.', en: 'On the «Payments» tab accounting removes the wrong record; the status is recalculated.' } },
    { q: { ru: 'Где выбрать юрлицо-плательщика?', en: 'Where do I choose the paying legal entity?' }, a: { ru: 'В блоке «Плательщик и условия». Список юрлиц ведёт администратор (общий с Договорами).', en: 'In the «Payer and terms» block. An administrator keeps the list of legal entities (shared with Contracts).' } },
  ],
  fields: {
    invoice: { title: { ru: 'Счёт на оплату', en: 'Invoice' }, text: { ru: 'Без счёта заявку нельзя отправить, если так настроено. Первый загруженный файл становится счётом; тип документа можно сменить в карточке.', en: 'Without an invoice the request cannot be sent, if so configured. The first file you upload becomes the invoice; change the document type in the card.' }, more: 'create' },
    paymentTerms: { title: { ru: 'Условия оплаты', en: 'Payment terms' }, text: { ru: '100 % — предоплата полностью, аванс — часть до поставки, постоплата — после поставки. Юрлицо-плательщик — кто платит по счёту.', en: '100 % — full prepayment, advance — part before delivery, post-payment — after delivery. The paying legal entity is who pays the invoice.' }, more: 'payments' },
    responsible: { title: { ru: 'Ответственный', en: 'Responsible' }, text: { ru: 'По умолчанию — автор. Можно назначить снабженца: он ведёт закупку и подтверждает поставку.', en: 'The author by default. Assign a buyer: they handle the purchase and confirm delivery.' }, more: 'delivery' },
    links: { title: { ru: 'Привязки', en: 'Links' }, text: { ru: 'Проект или объект Мастерплана, сделка CRM, договор — показываются, только если эти модули включены.', en: 'A Masterplan project or object, a CRM deal, a contract — shown only when these modules are on.' }, more: 'create' },
  },
  related: ['approvals', 'companies', 'files'],
};
