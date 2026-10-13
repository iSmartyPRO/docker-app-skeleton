export default {
  id: 'masterplan',
  icon: 'siteplan',
  title: { ru: 'Мастерплан', en: 'Masterplan' },
  tagline: {
    ru: 'Живой генплан проекта: что свободно, что в брони, что продано и как идёт стройка.',
    en: 'The live site plan of a project: what is available, booked, sold, and how construction goes.',
  },
  summary: {
    ru: '«Мастерплан» показывает проект застройки на генплане, в шахматке и в реестре. Менеджеры резервируют и бронируют юниты, финансисты и юристы ведут их до продажи и передачи, прорабы с телефона отправляют фотоотчёты о стройке. Все видят одну картину, и двойная бронь невозможна.',
    en: 'Masterplan shows a development project on the site plan, in a chessboard and in a registry. Managers reserve and book units, finance and legal take them to the sale and handover, foremen send construction photo reports from their phones. Everyone sees the same picture, and a double booking is impossible.',
  },
  highlights: [
    { icon: '🗺️', title: { ru: 'Генплан со слоями', en: 'Site plan with layers' }, text: { ru: 'Цвета продаж, готовность стройки или типы объектов — переключателем над планом.', en: 'Sales colours, construction readiness or object types — one switch above the plan.' } },
    { icon: '🔒', title: { ru: 'Без двойных броней', en: 'No double bookings' }, text: { ru: 'Если коллега успел первым, вы увидите «Объект только что забронирован менеджером X».', en: 'If a colleague was first you see “The unit has just been reserved by X”.' } },
    { icon: '⏳', title: { ru: 'Брони с таймером', en: 'Bookings with a timer' }, text: { ru: 'Напоминания за 24 и 2 часа, по истечении объект освобождается сам.', en: 'Reminders 24 and 2 hours before; when time is up the unit is released by itself.' } },
    { icon: '🏢', title: { ru: 'Шахматка', en: 'Chessboard' }, text: { ru: 'Этажи × квартиры с ценой, ценой за м² или площадью и групповой сменой цен.', en: 'Floors × apartments with price, price per m² or area, and bulk price changes.' } },
    { icon: '📷', title: { ru: 'Фотоотчёты стройки', en: 'Construction photo reports' }, text: { ru: 'Прораб отправляет отчёт с телефона за три касания; готовность считается сама.', en: 'A foreman sends a report from a phone in three taps; readiness is computed.' } },
    { icon: '🤝', title: { ru: 'Связь с CRM', en: 'Linked with the CRM' }, text: { ru: 'Бронь привязывается к сделке, в сделке виден объект и его стройка.', en: 'A booking is linked to a deal; the deal shows the unit and its construction.' } },
  ],
  tips: [
    { ru: 'Нажмите на статус в легенде — останутся только такие юниты.', en: 'Click a status in the legend to keep only those units.' },
    { ru: 'Кнопка «Презентация» прячет клиентов, менеджеров и минимальные цены — можно показывать клиенту.', en: 'The Presentation button hides clients, managers and minimum prices — safe to show a client.' },
    { ru: 'Из сделки CRM нажмите «Подобрать объект»: на генплане сделка уже будет выбрана для брони.', en: 'In a CRM deal press “Pick a unit”: on the site plan the deal is already chosen for the booking.' },
    { ru: 'Прорабу удобно добавить портал на главный экран телефона: «+ Отчёт» → Камера → Отправить.', en: 'Foremen: add the portal to the phone home screen — “+ Report” → Camera → Send.' },
    { ru: 'Без нарисованных контуров генплан показывает объекты схемой — работать можно с первого дня.', en: 'Without contours the plan shows objects as a scheme — you can work from day one.' },
    { ru: 'Ищите по старому номеру с прежнего генплана: «14» найдёт и дом 14, и дом, который раньше был №14.', en: 'Search by the old number from the previous plan: “14” finds house 14 and the house that used to be №14.' },
  ],
  sections: [
    {
      id: 'plan',
      title: { ru: 'Генплан', en: 'Site plan' },
      body: {
        ru: 'Поверх подложки — контуры очередей, секторов, участков и зданий. Колесо мыши или щипок приближают, перетаскивание двигает план, кнопка ⤢ показывает весь проект.\n\nНаведите на объект — появится подсказка: код, тип, площадь, цена, статус и готовность. Щелчок по сектору приближает его и открывает сводку, щелчок по участку или дому открывает карточку справа, не уходя с плана.\n\n- **Продажи** — цвет по статусу продажи;\n- **Строительство** — от серого к зелёному по проценту готовности;\n- **Типы** — жилые, коммерческие, инфраструктура.\n\nЦвета меняются сами, когда коллеги бронируют и продают.',
        en: 'On top of the background are contours of phases, sectors, plots and buildings. The mouse wheel or a pinch zooms, dragging moves the plan, ⤢ shows the whole project.\n\nHover an object to see its code, type, area, price, status and readiness. A click on a sector zooms in and opens its summary; a click on a plot or a house opens the card on the right without leaving the plan.\n\n- **Sales** — colour by sales status;\n- **Construction** — grey to green by readiness;\n- **Types** — residential, commercial, infrastructure.\n\nColours change by themselves as colleagues book and sell.',
      },
    },
    {
      id: 'numbers',
      title: { ru: 'Номера, поиск и секторы', en: 'Numbers, search and sectors' },
      body: {
        ru: 'Номер виден, если он помещается в контур: шрифт растёт от 9 до 14 px по мере приближения. Если не помещается — номер показывается кружком в цвете статуса; при наложении кружков нижний скрывается. Переключатель **Номера: авто / всегда / скрыть** над планом запоминается для вас; в «Презентации» по умолчанию «всегда».\n\nВ поиске наберите номер, название («Апарт-корпус 40») или **старый номер** с прежнего генплана («14», «блок 3») — выберите строку или нажмите Enter: план приблизит объект и откроет его карточку. Старый номер виден в подсказке («Было №14») и в карточке; поправить его можно кнопкой ✎ рядом.\n\nКонтуры секторов могут перекрываться на стыке: щелчок попадает в самый мелкий объект сверху, щелчок по сектору приближает его. В редакторе контуров кнопка **Контур по объектам** обводит сектор вокруг его домов.',
        en: 'A number is shown when it fits its contour: the font grows from 9 to 14 px as you zoom in. If it does not fit it becomes a badge in the status colour; when badges overlap the lower one is hidden. The switch **Numbers: auto / always / hide** above the plan is remembered for you; Presentation starts with “always”.\n\nIn the search type a number, a name (“Апарт-корпус 40”) or the **old number** from the previous plan (“14”, “block 3”) — pick a line or press Enter: the plan zooms to the object and opens its card. The old number is in the tooltip (“Was №14”) and in the card; fix it with ✎ next to it.\n\nSector contours may overlap where they meet: a click lands on the smallest object on top, a click on a sector zooms into it. In the contour editor **Around the objects inside** draws a sector around its houses.',
      },
    },
    {
      id: 'points',
      title: { ru: 'Точки вместо контуров', en: 'Points instead of contours' },
      body: {
        ru: 'Объект можно поставить на план **точкой** — кружком с номером — вместо нарисованного контура. Цвет тот же, что у контуров: статус на слое «Продажи», готовность на «Строительстве», тип на «Типах». У апарт-корпуса вокруг кружка — **кольцо статусов** его юнитов (зелёная часть — свободные) и плашка «свободно / всего»; на слое «Строительство» — дуга готовности. Наведите — подсказка, щёлкните или коснитесь — откроется та же карточка.\n\nТочки никогда не прячутся: если соседние мешают друг другу, обе уменьшаются, а совсем мелкие становятся аккуратными точками без номера — приблизьте план, и номера появятся. «Номера: всегда» показывает номера всегда, «скрыть» — только точки.\n\n**Как расставить** (администратор): *Структура → Генпланы → Точки*. Слева — объекты, которых ещё нет на плане, и счётчик «Размещено X из N». Выберите объект (или ↑ ↓ и Enter в поиске) и щёлкните по плану, где он стоит. С включённым **«Ставить подряд»** сразу выбирается следующий — можно щёлкать дом за домом. Щёлкните поставленную точку, чтобы перетащить её (с «Выравнивать» она прилипает к линии соседей), изменить размер ручкой или кнопками S / M / L, задать подпись, превратить **в контур** или убрать. Контур превращается в точку кнопкой **«В точку»**. На одном плане у объекта либо контур, либо точка. **Отменить** (Ctrl+Z) возвращает последнее действие.',
        en: 'An object can stand on the plan as a **point** — a circle with its number — instead of a drawn contour. The colour is the same as for contours: the status on Sales, readiness on Construction, the type on Types. An apartment building gets a **ring of its units’ statuses** (the green part is available) and a “free / total” chip; on Construction — a readiness arc. Hover for the tooltip; click or tap to open the same card.\n\nPoints are never hidden: when neighbours crowd each other both get smaller, and very small ones become neat dots without a number — zoom in and the numbers appear. “Numbers: always” keeps every number, “hide” shows dots only.\n\n**How to place them** (administrators): *Structure → Plans → Points*. On the left are the objects not on the plan yet and the counter “Placed X of N”. Choose an object (or ↑ ↓ and Enter in the search) and click the plan where it stands. With **Place one after another** on, the next one is chosen at once — click house after house. Click a placed point to drag it (with Align it snaps to the line of its neighbours), resize it with the handle or S / M / L, set a label, turn it **into a contour** or remove it. A contour becomes a point with **Make a point**. On one plan an object has either a contour or a point. **Undo** (Ctrl+Z) reverts the last action.',
      },
    },
    {
      id: 'building-card',
      title: { ru: 'Карточка дома и корпуса', en: 'The card of a house or a building' },
      body: {
        ru: 'У коттеджа и апарт-корпуса одна карточка. Сверху — номер, тип, сектор, старый номер и статус (у корпуса — «Свободно X из N» с полосой статусов), цена или диапазон «от – до» и цена за м² по свободным, варианты оплаты.\n\nУ корпуса дальше: **Состав** по комнатности (площадь, свободно / всего, цена от) с кнопкой **Резерв** — она резервирует первый свободный юнит этой строки; **мини-шахматка** (этажи × юниты в цветах статусов) с подбором по комнатности и этажу и ссылкой «Открыть в шахматке». Щелчок по юниту открывает его карточку с кнопками продажи и «← корпус». Руководство может **закрыть продажу всего корпуса** одной кнопкой.\n\nПланировки и рендеры, загруженные на **серию** (проект дома, тип апартаментов), видны во всех карточках этой серии.',
        en: 'A cottage and an apartment building share one card. On top — number, type, sector, old number and status (a building shows “X of N available” with a status bar), the price or the “from – to” range and the price per m² of the available units, payment options.\n\nA building also has the **Composition** by rooms (area, available / total, price from) with **Reserve**, which reserves the first available unit of that row; a **mini-chessboard** (floors × units in status colours) with a picker by rooms and floor and “Open in the chessboard”. A unit opens its own card with the sale buttons and “← building”. Management can **close sales of the whole building** with one button.\n\nLayouts and renders uploaded on a **series** (a house project, an apartment type) show in every card of that series.',
      },
      note: { ru: 'Свободную 3-комнатную в корпусе 23 можно зарезервировать в два нажатия, не уходя с генплана: «Резерв» в строке «3-комн.» → «Подтвердить».', en: 'A free 3-room apartment in building 23 is reserved in two clicks without leaving the plan: “Reserve” in the “3-room” row → “Confirm”.' },
    },
    {
      id: 'statuses',
      title: { ru: 'Статусы и кто их меняет', en: 'Statuses and who changes them' },
      body: {
        ru: '1. **Свободно → Резерв** — менеджер продаж (у менеджера ограничено число одновременных резервов).\n2. **Резерв → Бронь** — менеджер своего резерва, нужна сделка CRM с клиентом.\n3. **Бронь → Задаток** — финансист.\n4. **Задаток → Договор** — юрист или РОП, с номером и датой договора.\n5. **Договор → Продано** — финансист (оплачено 100%).\n6. **Продано → Передано** — руководитель строительства или юрист, с датой акта.\n\nСнять резерв или бронь может её менеджер (с причиной) или РОП. Продлить — менеджер один раз, дальше РОП. Закрыть продажу — только руководство. Откат назад — РОП и руководство, всегда с причиной.',
        en: '1. **Available → Reserved** — a sales manager (the number of reserves at once is limited).\n2. **Reserved → Booked** — the manager of the reserve, with a CRM deal that has a client.\n3. **Booked → Deposit** — finance.\n4. **Deposit → Contract** — legal or the head of sales, with the contract number and date.\n5. **Contract → Sold** — finance (paid in full).\n6. **Sold → Handed over** — the head of construction or legal, with the act date.\n\nA reserve or booking is released by its manager (with a reason) or the head of sales. A manager extends once, then the head of sales. Closing sales is for management. Rolling back is for the head of sales and management, always with a reason.',
      },
      note: { ru: 'Если двое бронируют один объект одновременно, бронь получает только один — второй увидит, кто его опередил.', en: 'If two people book one unit at the same moment, only one gets it — the other sees who was first.' },
    },
    {
      id: 'migration',
      title: { ru: 'Перенос статусов (миграция)', en: 'Status migration' },
      body: {
        ru: 'Для броней и продаж, сделанных до портала или вне его. Администратор Мастерплана нажимает в карточке **Перенести статус…** и ставит любой статус — без цепочки статусов, сделки CRM и таймера. Указываются дата статуса, клиент, менеджер, номер, дата и сумма договора и обязательно причина.\n\nБронь без даты окончания не истекает. Если указать «Резерв / бронь до», включится обычный таймер.\n\nНесколько юнитов сразу — в реестре: выделите строки и нажмите **Перенести статус…**. Из Excel — колонки «Статус» (Резерв … Передано), «Клиент», «Менеджер», «Дата статуса», «Номер договора», «Дата договора», «Сумма договора», «Бронь до»; причину введите в окне импорта.\n\nВ истории объекта такая запись помечена как **Миграция**: кто, когда, из какого статуса в какой и с какой датой.',
        en: 'For bookings and sales made before the portal or outside it. A Masterplan administrator presses **Migrate status…** in the card and sets any status — without the chain of statuses, a CRM deal or a timer. Give the status date, client, manager, contract number, date and amount, and always a reason.\n\nA booking without an end date never expires. With “Reserve / booking until” it gets the usual timer.\n\nSeveral units at once — in the registry: select rows and press **Migrate status…**. From Excel — the columns “Status” (reserve … handed), “Client”, “Manager”, “Status date”, “Contract number”, “Contract date”, “Contract amount”, “Booked until”; type the reason in the import window.\n\nThe history marks such a change as a **Migration**: who, when, from which status to which, with which date.',
      },
      note: { ru: 'Переносить статусы может только администратор Мастерплана; остальные работают по обычной цепочке.', en: 'Only Masterplan administrators migrate statuses; everyone else uses the normal chain.' },
    },
    {
      id: 'pricing',
      title: { ru: 'Цены по форме оплаты', en: 'Prices by payment form' },
      body: {
        ru: 'Цена юнита — это цена при 100% оплате. На вкладке **Структура → Цены** администратор задаёт сетку: варианты оплаты (например, 100%, рассрочка 50% по $2 200/м² на 12 месяцев, рассрочка 30% по $2 500/м² на 24 месяца) и плановую цену за м² к завершению стройки. Сетка действует с выбранной даты; новая версия не меняет старые — они остаются историей цен. Для типа объекта можно задать свою сетку.\n\nВ карточке и в режиме «Презентация» видно каждый вариант: итоговая цена, цена за м², первый взнос и ежемесячный платёж, а также плановая цена к завершению.',
        en: 'The unit price is the price for 100% payment. On **Structure → Prices** an administrator sets the grid: payment plans (e.g. 100%, an installment 50% at $2,200/m² over 12 months, 30% at $2,500/m² over 24 months) and the planned price per m² at completion. The grid applies from a chosen date; a new version never changes the old ones — they stay as the history of prices. A type of object may have its own grid.\n\nThe card and the Presentation mode show every plan: the total, the price per m², the first payment and the monthly payment, and the planned price at completion.',
      },
    },
    {
      id: 'chess',
      title: { ru: 'Шахматка', en: 'Chessboard' },
      body: {
        ru: 'Колонки — секции и стояки, строки — этажи (верхний этаж сверху). В ячейке — номер, комнатность, площадь и цена; переключатель показывает цену, цену за м² или площадь.\n\nКнопка **Выбрать** включает выделение ячеек: выберите несколько квартир и измените цену на процент или сумму, закройте или откройте их продажу.',
        en: 'Columns are sections and risers, rows are floors (top floor first). A cell shows the number, rooms, area and price; a switch shows price, price per m² or area.\n\n**Select** turns on picking: choose several apartments and change their price by a percent or an amount, close or open their sales.',
      },
    },
    {
      id: 'registry',
      title: { ru: 'Реестр, экспорт и импорт', en: 'Registry, export and import' },
      body: {
        ru: 'Таблица всех юнитов: колонки настраиваются, сортировка — по заголовку, фильтры — те же, что на генплане. Выделите строки, чтобы изменить цены или закрыть продажу.\n\n**Экспорт** — Excel или CSV, только с теми колонками, которые вам положено видеть.\n\n**Импорт** (администратор): скачайте шаблон, заполните, загрузите. Портал проверит каждую строку и покажет ошибки; ничего не запишется, пока файл не чистый.',
        en: 'A table of every unit: columns are configurable, sort by a header, the same filters as on the plan. Select rows to change prices or close sales.\n\n**Export** — Excel or CSV, only with the columns you may see.\n\n**Import** (administrators): download the template, fill it in, upload. Every row is checked and errors are listed; nothing is written until the file is clean.',
      },
    },
    {
      id: 'bookings',
      title: { ru: 'Брони', en: 'Bookings' },
      body: {
        ru: 'Активные резервы и брони с оставшимся временем. Истекающие сегодня и завтра — сверху. Отсюда же продлевают и открывают карточку, чтобы снять бронь или перевести в задаток.',
        en: 'Active reserves and bookings with the time left. Those ending today and tomorrow are on top. Extend from here, or open the card to release or move to a deposit.',
      },
    },
    {
      id: 'construction',
      title: { ru: 'Строительство и фотоотчёты', en: 'Construction and photo reports' },
      body: {
        ru: 'Список объектов с этапом, готовностью, графиком и датой последнего отчёта. Фильтры: «нет отчёта больше 14 дней», «отставание», «мои».\n\nКнопка **+ Отчёт**: объекты (можно целую линию), этап, процент, фото с камеры и комментарий. Фото сжимаются на телефоне и догружаются при плохой связи.\n\nЕсли в проекте включена модерация, отчёт прораба сначала проверяет руководитель строительства (вкладка «На проверке»). Опубликованный отчёт сдвигает этап, пересчитывает готовность и уведомляет менеджеров с бронями на этих объектах.\n\nЖурнал — лента по датам: автор, статус, прогресс этапа «было → стало», фото. Нажмите на фото — откроется просмотр на весь экран (листание, увеличение, дата и место съёмки, скачивание).\n\n**Исправить или удалить отчёт** (меню «⋯» на карточке): автор — пока отчёт черновик, на проверке или возвращён, и в течение 24 часов после публикации; руководитель строительства и администратор — всегда. Отдельное фото удаляется из просмотра (значок корзины). При удалении опубликованного отчёта прогресс этапа возвращается к прежнему значению, готовность пересчитывается.',
        en: 'Objects with stage, readiness, schedule and the last report date. Filters: “no report for over 14 days”, “behind”, “mine”.\n\n**+ Report**: objects (a whole line too), stage, percent, photos from the camera and a comment. Photos are shrunk on the phone and resumed on a weak connection.\n\nWith moderation on, a foreman’s report is reviewed by the head of construction first (the Review tab). A published report moves the stage, recomputes readiness and notifies managers who hold units there.\n\nThe journal is a feed by date: author, status, stage progress “before → after”, photos. Tap a photo for the full-screen viewer (swipe, zoom, shooting date and place, download).\n\n**Edit or delete a report** (the “⋯” menu on the card): the author while it is a draft, under review or returned, and for 24 hours after publishing; the head of construction and administrators always. A single photo is deleted from the viewer (the bin icon). Deleting a published report takes the stage progress back to the previous value and recomputes readiness.',
      },
      steps: [
        { ru: 'Нажмите **+ Отчёт** (на телефоне — круглая кнопка внизу).', en: 'Press **+ Report** (on a phone — the round button at the bottom).' },
        { ru: 'Нажмите **Камера** и снимите фото.', en: 'Press **Camera** and take photos.' },
        { ru: 'Выберите этап и процент, нажмите **Отправить**.', en: 'Choose the stage and percent, press **Send**.' },
      ],
      note: { ru: 'Прораб видит и может выбрать только объекты своей зоны ответственности.', en: 'A foreman sees and picks only objects of their own zone.' },
    },
    {
      id: 'dashboard',
      title: { ru: 'Дашборд', en: 'Dashboard' },
      body: {
        ru: 'Продано, в брони и свободно — в штуках, м² и деньгах (в базовой валюте по курсам из настроек); продажи по месяцам и менеджерам; цена за м² во времени (средняя цена прайса, варианты сетки цен, плановая цена к завершению); готовность по очередям и секторам; объекты без свежих отчётов и «продано, но не построено».',
        en: 'Sold, booked and available — in pieces, m² and money (in the base currency at the rates from the settings); sales by month and manager; price per m² over time (average list price, the price grid plans, the planned price at completion); readiness by phases and sectors; objects without fresh reports and “sold but not built”.',
      },
    },
    {
      id: 'structure',
      title: { ru: 'Структура, генплан и команда', en: 'Structure, site plan and team' },
      body: {
        ru: 'Администратор строит дерево: очередь → сектор → линия → участок → здание → юнит (уровни можно пропускать, до 8 уровней). **Массово** создаёт линию «A-1-01…A-1-15» или квартиры секции «этажи × на этаже». Узлы перетаскиваются мышью; чтобы перенести сразу несколько (например, 10 домов в другой сектор), нажмите **Выбрать несколько**, отметьте узлы и нажмите **Перенести…**.\n\nНа вкладке **Генпланы** загрузите подложку (картинку или SVG), выберите объект и щёлкайте по подложке, ставя точки контура; замкните и сохраните.\n\nНа вкладке **Команда** выдайте роли: на весь проект или только внутри сектора, линии, здания. Роль может быть временной.',
        en: 'An administrator builds the tree: phase → sector → line → plot → building → unit (levels may be skipped, up to 8). **In bulk** creates a line “A-1-01…A-1-15” or a section’s apartments “floors × per floor”. Drag nodes to move them; to move several at once (e.g. 10 houses into another sector) press **Select several**, tick the nodes and press **Move…**.\n\nOn **Site plans** upload a background (picture or SVG), pick an object and click the background to put contour points; close and save.\n\nOn **Team** grant roles: over the whole project or only inside a sector, line or building. A role can be temporary.',
      },
    },
  ],
  faq: [
    { q: { ru: 'Почему я не вижу минимальную цену и клиентов?', en: 'Why can’t I see the minimum price and clients?' }, a: { ru: 'Их видят РОП и руководство; менеджер видит клиентов только своих броней. Это скрывается на сервере, а не только в интерфейсе.', en: 'Heads of sales and management see them; a manager sees clients of their own bookings only. This is hidden on the server, not just in the interface.' } },
    { q: { ru: 'Что будет, если бронь истекла?', en: 'What happens when a booking expires?' }, a: { ru: 'Объект сам становится свободным, менеджер и РОП получают уведомление, в сделку CRM пишется строка.', en: 'The unit becomes available by itself, the manager and the head of sales are notified, the CRM deal gets a line.' } },
    { q: { ru: 'Почему не получается отправить отчёт по соседнему сектору?', en: 'Why can’t I report on the neighbouring sector?' }, a: { ru: 'Прораб вносит данные только в своей зоне ответственности; её назначает администратор на вкладке «Команда».', en: 'A foreman enters data only in their zone of responsibility; an administrator sets it on the Team tab.' } },
    { q: { ru: 'Как стадия сделки меняет статус объекта?', en: 'How does a deal stage change the unit status?' }, a: { ru: 'Администратор задаёт соответствие «стадия → статус» в настройках модуля. Когда сделка переходит на такую стадию, её объекты меняют статус по тем же правилам и правам.', en: 'An administrator maps “stage → status” in the module settings. When a deal moves to such a stage, its units change status by the same rules and rights.' } },
  ],
  related: ['crm', 'companies', 'notifications'],
};
