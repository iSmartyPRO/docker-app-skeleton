export default {
  id: 'warehouse',
  icon: 'box',
  title: { ru: 'Склад', en: 'Warehouse' },
  tagline: {
    ru: 'Остаток в реальном времени, каждое движение — по документу, инструмент на виду. Работает с телефона и сканера.',
    en: 'Stock in real time, every movement by a document, tools in sight. Works from the phone and a scanner.',
  },
  summary: {
    ru: 'Склад ведёт количество, места хранения, ответственных и себестоимость. Приход, выдача, перемещение и списание оформляются документами за три шага. Нельзя выдать больше, чем есть, а два кладовщика не выдадут одно и то же. Инструмент виден по экземплярам: где он сейчас и когда ТО.',
    en: 'The warehouse keeps quantities, storage places, responsible people and cost. Receipts, issues, transfers and write-offs are documents made in three steps. You cannot issue more than there is, and two storekeepers never issue the same piece. Tools are tracked by instance: where each one is and when it needs service.',
  },
  highlights: [
    { icon: '📷', title: { ru: 'Сканер везде', en: 'Scanner everywhere' }, text: { ru: 'Камера телефона или USB/Bluetooth-сканер: каждый скан добавляет позицию в документ.', en: 'The phone camera or a USB/Bluetooth scanner: every scan adds an item to the document.' } },
    { icon: '🧮', title: { ru: 'Без минусов', en: 'No negative stock' }, text: { ru: 'В строке видно «на складе · резерв · доступно»; нехватка подсвечивается и заказывается в Закупках.', en: 'Each line shows «on hand · reserved · available»; a shortage is highlighted and ordered in Procurement.' } },
    { icon: '🚚', title: { ru: 'Перемещение в два шага', en: 'Two-step transfers' }, text: { ru: 'Отгрузили — товар «в пути»; МОЛ склада принимает, расхождение оформляется актом.', en: 'Shipped — the goods are «in transit»; the MOL accepts, a difference becomes an act.' } },
    { icon: '🔧', title: { ru: 'Мой инструмент', en: 'My tools' }, text: { ru: 'Что за мной числится, передача коллеге с подтверждением, напоминания о ТО.', en: 'What is on me, hand-over to a colleague with confirmation, service reminders.' } },
    { icon: '🔒', title: { ru: 'Суммы — по праву', en: 'Sums by right' }, text: { ru: 'Кладовщики и прорабы видят количество; себестоимость — только бухгалтерия и руководство.', en: 'Storekeepers and foremen see quantities; cost only accounting and management.' } },
  ],
  tips: [
    { ru: 'Найти позицию быстрее всего сканом: кнопка с камерой вверху «Остатков».', en: 'The fastest way to find an item is a scan: the camera button on top of «Stock».' },
    { ru: '«Как в прошлый раз» подставит строки последнего такого же документа.', en: '«Like last time» takes the lines of the last document of the same kind.' },
    { ru: 'Вводите в упаковках — система сама пересчитает в штуки: «2 уп = 48 шт».', en: 'Enter in packs — the system converts to pieces: «2 packs = 48 pcs».' },
    { ru: 'Проведённый документ не удаляется: ошибку исправляет «Сторно».', en: 'A posted document is never deleted: «Storno» corrects a mistake.' },
    { ru: 'Распечатайте QR-этикетки на ячейки и инструмент — потом достаточно навести камеру.', en: 'Print QR labels for bins and tools — then pointing the camera is enough.' },
    { ru: 'На телефоне откройте «Режим кладовщика» — крупные плитки и работа одной рукой.', en: 'On the phone open «Storekeeper mode» — big tiles, one-handed work.' },
  ],
  sections: [
    {
      id: 'stock',
      title: { ru: 'Остатки', en: 'Stock' },
      body: {
        ru: 'Главный экран. В строке — позиция, склад, остаток, резерв, доступно, минимальный остаток и последнее движение (сумма — только с правом «Себестоимость»).\n\n- Чипы: **Ниже минимума**, **Нет в наличии**, **Истекает срок**, **Есть резерв**, **Без движения 90 дней**, **Мои склады**.\n- Группировка: по складам, по категориям, по держателям (склады, сотрудники, объекты), по ячейкам выбранного склада.\n- Щелчок по строке открывает карточку позиции: остатки по складам и ячейкам, движение, партии и экземпляры, резервы, штрихкоды, нормы и фото.\n- В фильтре «Ниже минимума» по одному складу есть кнопка «Заказать в Закупках» — создаётся черновик заявки на недостающее до точки заказа.',
        en: 'The main screen. A row shows the item, warehouse, on hand, reserved, available, minimum and last movement (the sum only with the «Cost» right).\n\n- Chips: **Below minimum**, **Out of stock**, **Expiring**, **Reserved**, **No movement 90 days**, **My warehouses**.\n- Grouping: by warehouse, by category, by holder (warehouses, people, objects), by bin of the chosen warehouse.\n- A click opens the item card: stock by warehouses and bins, movements, batches and instances, reserves, barcodes, norms and photos.\n- With «Below minimum» on one warehouse there is «Order in Procurement» — a draft purchase request up to the reorder point.',
      },
    },
    {
      id: 'documents',
      title: { ru: 'Документы за три шага', en: 'Documents in three steps' },
      steps: [
        { ru: 'Нажмите «Новый документ» и выберите тип: приход, выдача, перемещение, возврат, списание…', en: 'Press «New document» and choose the type: receipt, issue, transfer, return, write-off…' },
        { ru: 'Шаг 1 «Откуда / Куда»: склад, получатель (сотрудник или объект Мастерплана), поставщик, причина списания.', en: 'Step 1 «From / to»: warehouse, recipient (a person or a Masterplan object), supplier, write-off reason.' },
        { ru: 'Шаг 2 «Позиции»: сканируйте, ищите или нажмите «Как в прошлый раз». Под строкой — подсказка остатка; нехватка подсвечивается красным.', en: 'Step 2 «Lines»: scan, search or press «Like last time». Each line shows the stock hint; a shortage is red.' },
        { ru: 'Шаг 3 «Провести»: приложите фото накладной, получатель подписывается пальцем на экране, нажмите «Провести».', en: 'Step 3 «Post»: attach a photo of the waybill, the recipient signs with a finger, press «Post».' },
      ],
      note: {
        ru: 'Прораб без права кладовщика создаёт **требование** и отправляет его кладовщику — кладовщик проводит выдачу. Статусы: Черновик → (На согласовании) → Проведён → (Сторнирован).',
        en: 'A foreman without the storekeeper right creates a **requisition** and sends it to the storekeeper, who posts the issue. Statuses: Draft → (In approval) → Posted → (Reversed).',
      },
    },
    {
      id: 'transfer',
      title: { ru: 'Перемещение и приёмка', en: 'Transfer and acceptance' },
      body: {
        ru: 'Перемещение проходит в два этапа. Кладовщик склада-отправителя нажимает «Отгрузить» — товар списывается с его склада и числится «в пути». МОЛ склада-получателя видит перемещение в чипе «Ждут приёмки» и на странице «Ждёт меня», нажимает «Принять» и проверяет количество по каждой строке. Если пришло меньше или больше, автоматически проводится **акт расхождения**: недостача списывается из транзита, излишек приходуется.',
        en: 'A transfer has two steps. The storekeeper of the source presses «Ship» — the goods leave the warehouse and are «in transit». The MOL of the destination sees it in the «Waiting for acceptance» chip and on «Waiting for me», presses «Accept» and checks the quantity of each line. A difference posts a **discrepancy act** automatically: a shortage leaves the transit, a surplus arrives.',
      },
    },
    {
      id: 'procurement',
      title: { ru: 'Приход из заявки Закупок', en: 'Receipt from a purchase request' },
      body: {
        ru: 'В новом приходе выберите согласованную заявку: позиции, поставщик, цены и валюта подставятся, позиции сопоставятся по артикулу или названию. После проведения в заявке отмечается поставка — частичная, пока принято не всё. Из выдачи с нехваткой «Заказать недостающее» создаёт черновик заявки в Закупках.',
        en: 'In a new receipt choose an approved request: items, supplier, prices and currency are filled in, items match by SKU or name. Posting marks the delivery in the request — partial while something is still to come. From an issue with a shortage, «Order what is missing» creates a draft purchase request.',
      },
    },
    {
      id: 'writeoff',
      title: { ru: 'Списание и согласование', en: 'Write-off and approval' },
      body: {
        ru: 'Причина обязательна: использовано в работе, брак, порча, недостача, истёк срок… Если сумма больше порога (по умолчанию $500), документ уходит на согласование и проводится сам после решения. Маршрут настраивается в «Согласованиях».',
        en: 'A reason is required: used in work, defect, damage, shortage, expired… Above the threshold ($500 by default) the document goes to approval and is posted by itself after the decision. The route is set up in «Approvals».',
      },
    },
    {
      id: 'mobile',
      title: { ru: 'Режим кладовщика на телефоне', en: 'Storekeeper mode on the phone' },
      steps: [
        { ru: 'Откройте «Режим кладовщика» в меню склада (адрес /app/warehouse/m) и выберите свой склад — телефон его запомнит.', en: 'Open «Storekeeper mode» in the warehouse menu (/app/warehouse/m) and pick your warehouse — the phone remembers it.' },
        { ru: 'Плитки: Приход, Выдать, Переместить, Принять перемещение, Инвентаризация, Найти позицию, Мой инструмент.', en: 'Tiles: Receipt, Issue, Transfer, Accept transfer, Inventory, Find an item, My tools.' },
        { ru: 'Сканируйте камерой (она не закрывается между сканами) или USB/Bluetooth-сканером. После скана открывается ввод количества: «−» и «+», переключатель «уп ↔ шт» с пересчётом «2 уп = 48 шт». Повторный скан той же позиции прибавляет одну. Переключатель «+1 сразу» добавляет без вопросов.', en: 'Scan with the camera (it stays open between scans) or a USB / Bluetooth scanner. A quantity sheet opens after a scan: «−» and «+», the «pack ↔ pcs» switch with «2 packs = 48 pcs». A repeat scan of the same item adds one. The «+1 at once» switch adds without asking.' },
        { ru: 'Отсканируйте этикетку ячейки — следующие строки лягут в неё. В выдаче под строкой видно «на складе · доступно», нехватка подсвечена красным.', en: 'Scan a bin label — the next lines go there. In an issue each line shows «on hand · available», a shortage is red.' },
        { ru: 'Последний шаг: фото накладной, подпись получателя пальцем (для выдачи), «Провести» — и экран с результатом.', en: 'The last step: a photo of the waybill, the recipient’s finger signature (issues), «Post» — and a result screen.' },
      ],
      note: {
        ru: 'Приход по заявке Закупок: строки подставятся из заявки; кнопка «Считать по факту» обнулит их, и вы посчитаете пришедшее сканом. Не пришедшие строки уберутся сами, заявка получит отметку о поставке.',
        en: 'A receipt from a purchase request: the lines come from the request; «Count by fact» zeroes them and you count what arrived by scanning. Lines that did not arrive are left out, the request gets its delivery mark.',
      },
    },
    {
      id: 'inventory',
      title: { ru: 'Инвентаризация', en: 'Inventory' },
      steps: [
        { ru: '«Инвентаризация» → «Новая»: склад, при желании ячейки или категории (частичная), «слепой» режим и что делать с движениями — запретить или фиксировать отдельно. Выберите счётчиков.', en: '«Inventory» → «New»: the warehouse, optionally bins or categories (a partial count), the «blind» mode and what to do with movements — block or record separately. Choose the counters.' },
        { ru: 'На вкладке «Ячейки и счётчики» выделите ячейки или зону и назначьте человека. Распечатайте этикетки ячеек, если их нет.', en: 'On «Bins and counters» select bins or a zone and assign a person. Print bin labels if there are none.' },
        { ru: 'Счётчик на телефоне сканирует ячейку, затем товар и вводит количество; в конце — «Ячейка посчитана». Без интернета подсчёт копится в телефоне и отправится сам, когда сеть вернётся.', en: 'On the phone a counter scans the bin, then the goods, and enters the quantity; at the end — «Bin counted». Without a connection the counts wait in the phone and go out by themselves when it is back.' },
        { ru: '«Сверка»: учёт, факт, разница и сумма разницы (по праву «Себестоимость»), фильтр «Только расхождения». Где считали двое, подсчёты суммируются и помечены — нажмите «Решить». Любую строку можно отправить на пересчёт.', en: '«Reconciliation»: book, count, difference and its sum (with the «Cost» right), the «Only differences» filter. Where two people counted, the counts are summed and flagged — press «Decide». Any row can go back for a recount.' },
        { ru: '«Завершить и сформировать акт»: один акт инвентаризации; если расхождение больше порога, он уходит на согласование. После проведения остатки равны факту, «заморозка» снимается.', en: '«Finish and make the act»: one inventory act; above the threshold it goes to approval. Once posted the stock equals the count and the freeze ends.' },
      ],
      note: {
        ru: 'Регулярные частичные инвентаризации («каждые 30 дней: электрика») задаются на вкладке «Регулярные» — в срок приходит напоминание. Пока идёт инвентаризация с запретом движений, приход, выдача и перемещение по её составу не проводятся — об этом предупреждает красная плашка.',
        en: 'Regular partial counts («every 30 days: electrics») are set on the «Regular» tab — a reminder comes when one is due. While an inventory blocks movements, receipts, issues and transfers of its scope are not posted — a red banner warns about it.',
      },
    },
    {
      id: 'tools',
      title: { ru: 'Инструмент', en: 'Tools' },
      body: {
        ru: 'Серийные позиции учитываются по экземплярам с инвентарным номером. В реестре видно, где каждый экземпляр сейчас: склад и ячейка, сотрудник или объект; фильтры «У меня», «В ремонте», «ТО скоро». В «Моём инструменте» сотрудник видит своё и может передать коллеге — передача проходит, когда коллега подтвердит получение. О приближении ТО и о невозврате к сроку приходят напоминания.',
        en: 'Serial items are tracked by instance with an inventory number. The registry shows where each one is now: a warehouse and bin, a person or an object; filters «On me», «In repair», «Service soon». In «My tools» a person sees what is on them and may hand it to a colleague — it passes when the colleague confirms. Reminders come before service and when something is not returned on time.',
      },
    },
    {
      id: 'reports',
      title: { ru: 'Отчёты', en: 'Reports' },
      body: {
        ru: '- **Оборотная ведомость**: начальный остаток, приход, расход, конечный остаток за период — в количестве и сумме.\n- **Движение по позиции** с документами и остатком после каждого.\n- **Материалы по объекту**: выдано, возвращено, списано и что числится.\n- **Инструмент по держателям**.\n\nВыгрузка в Excel (CSV) защищена от формул; суммы в ней — только с правом «Себестоимость».',
        en: '- **Turnover statement**: opening, in, out, closing for the period — quantity and sum.\n- **Item movement** with documents and the balance after each.\n- **Materials by object**: issued, returned, written off and what is on it.\n- **Tools by holder**.\n\nExcel (CSV) exports are protected against formulas; sums only with the «Cost» right.',
      },
    },
    {
      id: 'warehouses',
      title: { ru: 'Склады, ячейки, права', en: 'Warehouses, bins, rights' },
      body: {
        ru: 'Администратор склада создаёт склады (основной, объектовый, транзитный, мобильный), назначает МОЛ, включает ячейки (зона → стеллаж → полка) и печатает на них QR-этикетки. На вкладке «Кто работает» права выдаются на конкретный склад: кладовщик склада A не проводит документы склада B, но видит его остатки, если это разрешено.',
        en: 'The warehouse administrator creates warehouses (main, site, transit, mobile), sets the MOL, switches bins on (zone → rack → shelf) and prints QR labels for them. «Who works here» grants rights on one warehouse: the storekeeper of A does not post documents of B, but sees its stock if allowed.',
      },
    },
    {
      id: 'import',
      title: { ru: 'Импорт из Excel', en: 'Import from Excel' },
      body: {
        ru: 'Номенклатура и начальные остатки загружаются из .xlsx или .csv. Скачайте шаблон, заполните и нажмите «Проверить» — появится список ошибок по строкам. Начальные остатки создают документ «Ввод остатков».',
        en: 'Items and opening balances come from .xlsx or .csv. Download the template, fill it in and press «Check» — a list of errors by row appears. Opening balances create an «Opening balances» document.',
      },
    },
  ],
  faq: [
    { q: { ru: 'Почему я не вижу сумм?', en: 'Why can’t I see sums?' }, a: { ru: 'Себестоимость и суммы видят только люди с правом «Склад: себестоимость и суммы». Остальным показывается количество.', en: 'Cost and sums are shown only to people with «Warehouse: see costs and sums». Others see quantities.' } },
    { q: { ru: 'Ошиблись в проведённом документе — как исправить?', en: 'A posted document is wrong — how to fix it?' }, a: { ru: 'Нажмите «Сторно» и укажите причину: будет проведён обратный документ. Затем создайте правильный.', en: 'Press «Storno» with a reason: an opposite document is posted. Then create the right one.' } },
    { q: { ru: 'Почему документ не проводится?', en: 'Why doesn’t the document post?' }, a: { ru: 'Скорее всего, не хватает остатка: строки подсвечены красным, в подсказке видно, сколько доступно. Резерв под другой объект не выдаётся.', en: 'Most likely the stock is short: the lines are red and the hint shows what is available. Stock reserved for something else is not issued.' } },
    { q: { ru: 'Документ не проводится: «идёт инвентаризация»', en: 'A document does not post: «inventory in progress»' }, a: { ru: 'На складе идёт инвентаризация с запретом движений. Дождитесь проведения её акта или попросите ответственного завершить подсчёт.', en: 'The warehouse is being counted with movements blocked. Wait until its act is posted or ask the person running it to finish.' } },
    { q: { ru: 'Можно провести документ прошлой датой?', en: 'Can I post with a past date?' }, a: { ru: 'Да, с правом «Документы задним числом» и только в открытом периоде.', en: 'Yes, with the «Backdate documents» right and only in the open period.' } },
  ],
  related: ['procurement', 'approvals', 'masterplan'],
};
