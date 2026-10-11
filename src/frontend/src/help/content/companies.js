export default {
  id: 'companies',
  icon: 'building',
  title: { ru: 'Контрагенты', en: 'Counterparties' },
  tagline: {
    ru: 'Компании и люди, с которыми мы работаем, — с реквизитами из реестров и всей историей.',
    en: 'The companies and people we work with — with details from public registers and the full history.',
  },
  summary: {
    ru: 'Общий справочник клиентов, поставщиков, партнёров и госорганов. Введите ИНН — реквизиты подтянутся из реестра, а сотрудники компании сохранят свою карьеру, даже когда переходят на новое место. Каждое изменение, звонок и оценка остаются в истории с автором и датой.',
    en: 'A shared directory of clients, suppliers, partners and government bodies. Enter the INN and the details load from the register; people keep their career history even when they change jobs. Every change, call and rating stays in the history with its author and date.',
  },
  highlights: [
    {
      icon: '⤓',
      title: { ru: 'Реквизиты по ИНН', en: 'Details by INN' },
      text: {
        ru: 'Для Кыргызстана и России карточка заполняется из реестра одной кнопкой, вместе с официальной выпиской.',
        en: 'For Kyrgyzstan and Russia the card fills from the register with one button, together with the official extract.',
      },
    },
    {
      icon: '🌍',
      title: { ru: 'Свои правила для каждой страны', en: 'Rules for each country' },
      text: {
        ru: 'ИНН, БИН, УНП, ОГРН и другие номера проверяются по формату именно вашей страны.',
        en: 'INN, BIN, UNP, OGRN and other numbers are checked against the format of that country.',
      },
    },
    {
      icon: '🛡',
      title: { ru: 'Без дублей', en: 'No duplicates' },
      text: {
        ru: 'Если компания с таким номером уже есть, портал предупредит и даст ссылку на неё.',
        en: 'If a company with the same number already exists, the portal warns you and links to it.',
      },
    },
    {
      icon: '👥',
      title: { ru: 'Люди и их карьера', en: 'People and careers' },
      text: {
        ru: 'Контакт может работать в нескольких компаниях, а при уходе его история не теряется.',
        en: 'A contact can work at several companies, and their history is kept when they leave.',
      },
    },
    {
      icon: '🕓',
      title: { ru: 'Полная история', en: 'Full history' },
      text: {
        ru: 'Кто, когда и что изменил — плюс заметки о звонках, встречах и сделках.',
        en: 'Who changed what and when — plus notes about calls, meetings and deals.',
      },
    },
    {
      icon: '⭐',
      title: { ru: 'Рейтинг от коллег', en: 'Ratings from colleagues' },
      text: {
        ru: 'Оценки по надёжности, платёжной дисциплине и качеству помогают выбрать, с кем работать.',
        en: 'Scores for reliability, payment discipline and quality help decide who to work with.',
      },
    },
  ],
  tips: [
    {
      ru: 'Начинайте новую компанию с номера: введите ИНН и нажмите **Enter** — это то же, что «Заполнить из реестра».',
      en: 'Start a new company with its number: type the INN and press **Enter** — same as “Fill from the register”.',
    },
    {
      ru: 'Раз в квартал нажимайте «Сверить с реестром» у ключевых клиентов — сразу увидите смену руководителя или адреса.',
      en: 'Once a quarter press “Check with the register” for key clients — you will see a new head or address at once.',
    },
    {
      ru: 'Человек уволился? Не удаляйте его — нажмите «Ушёл из компании», и он останется в контактах с историей.',
      en: 'Someone left? Don’t delete them — press “Left the company” and they stay in contacts with their history.',
    },
    {
      ru: 'После звонка или встречи добавьте запись во вкладке «История» — коллеги будут в курсе без лишних вопросов.',
      en: 'After a call or meeting add an entry on the “History” tab — colleagues stay informed without asking.',
    },
    {
      ru: 'Назначьте себя ответственным — компания появится в разделе «Мои компании».',
      en: 'Make yourself responsible and the company appears under “My companies”.',
    },
    {
      ru: 'Не нужна компания? Переносите в архив, а не удаляйте: всё сохранится и восстановится одной кнопкой.',
      en: 'Don’t need a company? Archive it instead of deleting: everything is kept and restores with one click.',
    },
  ],
  sections: [
    {
      id: 'card',
      title: { ru: 'Карточка компании', en: 'The company card' },
      body: {
        ru: 'Карточка собирает всё о компании в одном месте. Вверху — название, страна, номер, статус и отметка о последней сверке с реестром. Ниже — вкладки:\n\n- **Обзор** — реквизиты, руководство, адреса, контакты, банковские счета, заметки;\n- **Сотрудники** — кто сейчас работает в компании и кто уже ушёл;\n- **История** — все изменения, заметки, звонки и встречи;\n- **Рейтинг** — оценки коллег;\n- **Документы** — договоры, выписки и другие файлы.\n\nВ форме редактирования поля разложены по разделам: «Основное», «Регистрационные данные», «Руководство», «Адреса», «Контакты», «Банковские реквизиты», «Заметки». Обязательно только **Название** — остальное можно дополнить позже.',
        en: 'The card keeps everything about a company in one place. At the top: the name, country, number, status and the date of the last register check. Below are tabs:\n\n- **Overview** — details, management, addresses, contacts, bank accounts, notes;\n- **People** — who works there now and who has left;\n- **History** — every change, note, call and meeting;\n- **Rating** — scores from colleagues;\n- **Documents** — contracts, extracts and other files.\n\nIn the edit form the fields are grouped: “Main”, “Registration details”, “Management”, “Addresses”, “Contacts”, “Bank details”, “Notes”. Only the **Name** is required — the rest can be added later.',
      },
      steps: [
        { ru: 'Откройте «Компании» и нажмите «Добавить компанию».', en: 'Open “Companies” and press “Add company”.' },
        { ru: 'Выберите страну и введите основной номер (например, ИНН).', en: 'Choose the country and enter the main number (for example, the INN).' },
        { ru: 'Нажмите «Заполнить из реестра» или заполните поля вручную.', en: 'Press “Fill from the register” or fill the fields by hand.' },
        { ru: 'Укажите «Кто это для нас», ответственного и теги, затем нажмите «Создать».', en: 'Set the relationship, the responsible person and tags, then press “Create”.' },
      ],
      note: {
        ru: 'Телефоны и почты можно добавлять с подписью — «бухгалтерия», «отдел продаж». Так коллеги сразу поймут, куда звонить.',
        en: 'Phones and emails can carry a label — “accounting”, “sales”. Colleagues will know right away where to call.',
      },
    },
    {
      id: 'countries',
      title: { ru: 'Страны и идентификаторы', en: 'Countries and identifiers' },
      body: {
        ru: 'Сначала выберите **страну** — от неё зависят номера, их проверка, список правовых форм и подключённый реестр. Неверный по формату номер портал подсветит словами «Проверьте номер».\n\n- 🇰🇬 **Кыргызстан** — ИНН (14 цифр), регистрационный номер, ОКПО (8 цифр); реестр Минюста КР.\n- 🇷🇺 **Россия** — ИНН (10 цифр, у ИП — 12), КПП, ОГРН / ОГРНИП, ОКПО; контрольные цифры ИНН и ОГРН проверяются; реестр ЕГРЮЛ / DaData.\n- 🇰🇿 **Казахстан** — БИН / ИИН (12 цифр).\n- 🇺🇿 **Узбекистан** — ИНН (СТИР), 9 цифр.\n- 🇧🇾 **Беларусь** — УНП, 9 цифр.\n- 🇹🇯 **Таджикистан** — ИНН, 9 цифр.\n- 🇨🇳 **Китай** — единый код USCC, 18 символов.\n- 🇹🇷 **Турция** — налоговый номер VKN, 10 цифр.\n- 🌐 **Другая страна** — налоговый номер, регистрационный номер, VAT.\n\nДля Казахстана, Узбекистана и остальных стран реестр пока не подключён — карточку заполняют вручную.',
        en: 'First choose the **country** — it defines the numbers, how they are checked, the legal forms and the connected register. A number in the wrong format is marked “Check the number”.\n\n- 🇰🇬 **Kyrgyzstan** — INN (14 digits), registration number, OKPO (8 digits); Ministry of Justice register.\n- 🇷🇺 **Russia** — INN (10 digits, 12 for sole traders), KPP, OGRN / OGRNIP, OKPO; INN and OGRN check digits are verified; EGRUL / DaData register.\n- 🇰🇿 **Kazakhstan** — BIN / IIN (12 digits).\n- 🇺🇿 **Uzbekistan** — INN (STIR), 9 digits.\n- 🇧🇾 **Belarus** — UNP, 9 digits.\n- 🇹🇯 **Tajikistan** — INN, 9 digits.\n- 🇨🇳 **China** — USCC, 18 characters.\n- 🇹🇷 **Türkiye** — tax number VKN, 10 digits.\n- 🌐 **Other country** — tax ID, registration number, VAT.\n\nFor Kazakhstan, Uzbekistan and the other countries no register is connected yet — fill the card by hand.',
      },
      example: {
        title: { ru: 'Российский ИНН с опечаткой', en: 'A Russian INN with a typo' },
        body: {
          ru: 'Вы вводите ИНН `7707083894` вместо `7707083893`. Длина правильная, но контрольная цифра не сходится — портал сразу скажет «Проверьте номер», и ошибка не попадёт в справочник.',
          en: 'You type INN `7707083894` instead of `7707083893`. The length is right but the check digit fails — the portal says “Check the number” and the typo never reaches the directory.',
        },
      },
    },
    {
      id: 'registry',
      title: { ru: 'Заполнение из реестра', en: 'Filling from the register' },
      body: {
        ru: 'Введите номер и нажмите **«Заполнить из реестра»** — портал сам запросит открытый реестр и разложит данные по полям.\n\n- **Минюст КР** (Кыргызстан, ключ не нужен): наименования на русском, кыргызском и английском, регистрационный номер, ОКПО, регистрирующий орган, юридический адрес, руководитель, статус, даты регистрации и прекращения, число учредителей.\n- **DaData** (Россия, если администратор подключил ключ): наименования, правовая форма, ИНН, КПП, ОГРН, ОКПО, ОКВЭД, статус, даты, руководитель, полный адрес.\n- **ЕГРЮЛ ФНС** (Россия, бесплатно, без ключа): наименования, ИНН, КПП, ОГРН, руководитель, даты регистрации и прекращения.\n\nОфициальная PDF-выписка прикладывается к карточке во вкладку «Документы» после сохранения. Телефоны и почты, которые вы уже ввели вручную, не затираются.',
        en: 'Enter the number and press **“Fill from the register”** — the portal asks the public register and puts the data into the fields.\n\n- **Ministry of Justice of KG** (Kyrgyzstan, no key needed): names in Russian, Kyrgyz and English, registration number, OKPO, registering authority, legal address, head, status, registration and closure dates, number of founders.\n- **DaData** (Russia, if an administrator added a key): names, legal form, INN, KPP, OGRN, OKPO, OKVED, status, dates, head, full address.\n- **EGRUL of the Federal Tax Service** (Russia, free, no key): names, INN, KPP, OGRN, head, registration and closure dates.\n\nThe official PDF extract is attached to the card on the “Documents” tab once you save. Phones and emails you already typed by hand are kept.',
      },
      example: {
        title: { ru: 'Новый поставщик из Бишкека', en: 'A new supplier from Bishkek' },
        body: {
          ru: 'Страна — 🇰🇬 Кыргызстан, ИНН — 14 цифр из договора. Нажимаете «Заполнить из реестра»: через пару секунд появляется зелёная плашка «Реквизиты загружены: Минюст КР», заполнены название на русском и кыргызском, адрес, руководитель и ОКПО, а ниже — «Официальная выписка будет приложена». Остаётся добавить телефон бухгалтерии и банковский счёт.',
          en: 'Country — 🇰🇬 Kyrgyzstan, INN — the 14 digits from the contract. You press “Fill from the register”: in a couple of seconds a green banner says “Details loaded from Ministry of Justice of KG”, the Russian and Kyrgyz names, address, head and OKPO are filled, and below — “The official extract will be attached”. All that is left is the accounting phone and the bank account.',
        },
      },
      note: {
        ru: 'Реестр не отвечает или просит капчу? Подождите минуту или заполните карточку вручную. Запросов к реестрам — не больше 20 в минуту на человека.',
        en: 'The register is not responding or asks for a captcha? Wait a minute or fill the card by hand. You can make up to 20 register requests a minute.',
      },
    },
    {
      id: 'verify',
      title: { ru: 'Сверка с реестром', en: 'Checking with the register' },
      body: {
        ru: 'Компании меняют руководителей, адреса и статусы. Кнопка **«Сверить с реестром»** в карточке сравнивает её с реестром поле за полем и показывает таблицу «Поле — В карточке — В реестре».\n\n- Пустые поля карточки отмечены заранее — их стоит просто заполнить.\n- Отличающиеся значения вы выбираете сами: отметьте то, что нужно принять.\n- Если всё совпадает — нажмите «Отметить сверку», чтобы зафиксировать проверку.\n\nПосле сверки в истории появится запись с изменёнными полями, в шапке — «Сверено: … · дата», а во вкладку «Документы» добавится свежая выписка.',
        en: 'Companies change heads, addresses and status. **“Check with the register”** on the card compares it with the register field by field and shows a “Field — In the card — In the register” table.\n\n- Empty card fields are pre-selected — they simply need filling.\n- You decide on differing values: tick the ones to take.\n- If everything matches, press “Record the check” to note the check.\n\nAfter the check the history shows an entry with the changed fields, the header shows “Checked with … · date”, and a fresh extract is added to “Documents”.',
      },
      steps: [
        { ru: 'Откройте карточку компании и нажмите «Сверить с реестром».', en: 'Open the company card and press “Check with the register”.' },
        { ru: 'Просмотрите отличия; снимите галочки с того, что менять не нужно.', en: 'Review the differences; untick anything that should stay.' },
        { ru: 'Нажмите «Принять значений: N» или «Отметить сверку».', en: 'Press “Take N values” or “Record the check”.' },
      ],
      example: {
        title: { ru: 'Сменился директор', en: 'A new director' },
        body: {
          ru: 'Перед подписанием договора менеджер сверяет клиента. В строке «Руководитель» в карточке — Асанов, в реестре — Токтогулов. Менеджер принимает новое значение, и в истории остаётся запись «Сверка: Минюст КР — обновлено полей: 1» с выпиской на дату проверки.',
          en: 'Before signing a contract a manager checks the client. The “Head” row shows Asanov in the card and Toktogulov in the register. The manager takes the new value, and the history keeps “Checked with Ministry of Justice of KG: 1 field(s) updated” with the extract for that date.',
        },
      },
      note: {
        ru: 'Сверка доступна только для стран с подключённым реестром — сейчас это Кыргызстан и Россия.',
        en: 'Checking works only for countries with a connected register — currently Kyrgyzstan and Russia.',
      },
    },
    {
      id: 'duplicates',
      title: { ru: 'Дубликаты', en: 'Duplicates' },
      body: {
        ru: 'Перед сохранением портал ищет компанию с тем же основным номером (ИНН, БИН, УНП…) — в том числе в архиве. Если такая есть, появится жёлтое предупреждение «Компания с таким номером уже есть в справочнике» со ссылкой на неё.\n\n- Чаще всего правильно открыть существующую карточку и дополнить её.\n- Если это действительно другая запись — например, филиал с тем же ИНН, — нажмите «Всё равно создать».',
        en: 'Before saving, the portal looks for a company with the same main number (INN, BIN, UNP…) — including the archive. If there is one, a yellow warning “A company with this identifier is already in the directory” links to it.\n\n- Usually the right move is to open the existing card and complete it.\n- If it really is a separate record — for example, a branch with the same INN — press “Create anyway”.',
      },
      note: {
        ru: 'Нашлась компания «в архиве»? Откройте её и нажмите «Восстановить» — вся прежняя история вернётся.',
        en: 'Found one marked “in the archive”? Open it and press “Restore” — its whole history comes back.',
      },
    },
    {
      id: 'people',
      title: { ru: 'Контакты и должности', en: 'Contacts and jobs' },
      body: {
        ru: 'Раздел **«Контакты»** — это люди из компаний-контрагентов. У контакта есть ФИО (обязательно только имя), телефоны, почты, Telegram, WhatsApp, LinkedIn, день рождения, город, языки, теги и заметки.\n\nСвязь человека с компанией — это **место работы**: должность, отдел, дата начала, рабочий телефон и почта, отметка «Принимает решения». Один человек может работать сразу в нескольких компаниях. На вкладке «Сотрудники» у компании те, кто принимает решения, показываются первыми.\n\nКогда человек уходит, нажмите **«Ушёл из компании»**: укажите дату, причину и что дальше — «Пока никуда — оставить как контакт» или «Переходит в другую компанию» с новой должностью. Старое место работы останется на вкладке «Карьера».',
        en: 'The **“Contacts”** section holds the people at counterparties. A contact has a name (only the first name is required), phones, emails, Telegram, WhatsApp, LinkedIn, birthday, city, languages, tags and notes.\n\nThe link between a person and a company is a **job**: position, department, start date, work phone and email, and the “Decision maker” switch. One person can work at several companies at once. On a company’s “People” tab decision makers are shown first.\n\nWhen someone leaves, press **“Left the company”**: set the date, the reason and what next — “Nowhere yet — keep as a contact” or “Moves to another company” with the new position. The old job stays on the “Career” tab.',
      },
      steps: [
        { ru: 'В карточке компании откройте вкладку «Сотрудники».', en: 'On the company card open the “People” tab.' },
        { ru: 'Нажмите «Новый сотрудник» или «Из контактов», если человек уже есть в справочнике.', en: 'Press “New employee”, or “Existing contact” if the person is already in the directory.' },
        { ru: 'Укажите должность и, если нужно, включите «Принимает решения».', en: 'Set the position and, if needed, turn on “Decision maker”.' },
      ],
      example: {
        title: { ru: 'Закупщик сменил работу', en: 'A buyer changes jobs' },
        body: {
          ru: 'Айгуль, менеджер по закупкам ОсОО «Альфа», переходит в ТОО «Бета» в Алматы. Откройте её контакт, у места работы в «Альфе» нажмите «Ушёл из компании», выберите «Переходит в другую компанию», найдите «Бету» и укажите новую должность. В «Альфе» она появится среди бывших сотрудников, в «Бете» — среди текущих, а все заметки о ней сохранятся.',
          en: 'Aigul, a buyer at “Alfa” LLC, moves to “Beta” LLP in Almaty. Open her contact, on the Alfa job press “Left the company”, choose “Moves to another company”, find Beta and set the new position. Alfa lists her among former employees, Beta among current ones, and all notes about her are kept.',
        },
      },
      note: {
        ru: 'В списке контактов фильтр «Без компании» покажет людей, которые сейчас нигде не работают по нашим данным.',
        en: 'In the contacts list the “Without a company” filter shows people who, as far as we know, are not working anywhere now.',
      },
    },
    {
      id: 'relations',
      title: { ru: 'Отношения, ответственный и теги', en: 'Relationship, responsible person and tags' },
      body: {
        ru: '- **Кто это для нас** — клиент, поставщик, партнёр, потенциальный клиент, подрядчик, госорган, конкурент. Можно выбрать несколько; у каждого типа свой цвет, а в списке компаний по нему можно фильтровать.\n- **Ответственный** — сотрудник, который ведёт компанию или контакт. Компании, где ответственный — вы, собраны в разделе «Мои компании».\n- **Теги** — любые слова для своих пометок: «VIP», «тендер», «Ош». Введите слово и нажмите Enter или запятую.',
        en: '- **Relationship** — client, supplier, partner, prospect, contractor, government, competitor. You can pick several; each type has its own colour, and the company list can be filtered by it.\n- **Responsible** — the employee who looks after the company or contact. Companies where you are responsible are collected under “My companies”.\n- **Tags** — any words for your own marks: “VIP”, “tender”, “Osh”. Type a word and press Enter or a comma.',
      },
      note: {
        ru: 'Если администратор включил режим «Ответственный, автор и администраторы», изменять карточку смогут только они — остальные увидят её только для чтения.',
        en: 'If an administrator chose “Responsible, author and admins”, only they can change the card — everyone else sees it read-only.',
      },
    },
    {
      id: 'history',
      title: { ru: 'История: заметки, события и документы', en: 'History: notes, events and documents' },
      body: {
        ru: 'Вкладка **«История»** — лента всего, что происходило с компанией или контактом. Портал сам записывает создание, каждое изменение (было → стало), сверки с реестром, приход и уход сотрудников, оценки, документы, архив и восстановление.\n\nСвои записи добавляйте сверху ленты: **Заметка, Звонок, Встреча, Письмо, Сделка, Проблема** — при желании с датой. Фильтры: «Всё», «Заметки и контакты», «Изменения».\n\nВкладка **«Документы»** хранит файлы компании — договоры, сертификаты, выписки (до 25 МБ на файл). Выписки из реестров попадают туда автоматически.',
        en: 'The **“History”** tab is a feed of everything that happened to a company or contact. The portal records creation, every change (old → new), register checks, people joining and leaving, ratings, documents, archive and restore.\n\nAdd your own entries at the top: **Note, Call, Meeting, Email, Deal, Issue** — with a date if you like. Filters: “Everything”, “Notes and contacts”, “Changes”.\n\nThe **“Documents”** tab keeps the company’s files — contracts, certificates, extracts (up to 25 MB each). Register extracts land there automatically.',
      },
      example: {
        title: { ru: 'Запись о звонке', en: 'Logging a call' },
        body: {
          ru: 'Вы созвонились с бухгалтером клиента: выберите «Звонок», напишите «Подтвердили оплату счёта №125 до 15-го» и нажмите «Добавить в историю». Коллега, который завтра откроет карточку, сразу увидит договорённость и кто её получил.',
          en: 'You spoke with the client’s accountant: choose “Call”, write “Confirmed payment of invoice #125 by the 15th” and press “Add to history”. A colleague opening the card tomorrow sees the agreement and who made it.',
        },
      },
      note: {
        ru: 'Системные записи удалить нельзя, а свои заметки — можно. Поэтому историю изменений всегда можно проверить.',
        en: 'System entries cannot be deleted; your own notes can. So the change history can always be trusted.',
      },
    },
    {
      id: 'rating',
      title: { ru: 'Оценки', en: 'Ratings' },
      body: {
        ru: 'На вкладке **«Рейтинг»** каждый сотрудник может поставить от 1 до 5 звёзд и, по желанию, оценить критерии:\n\n- компании — надёжность, платёжная дисциплина, качество, коммуникация;\n- контакты — надёжность, коммуникация, качество.\n\nВ средний балл идёт **последняя** оценка каждого коллеги: поставили новую — старая останется в истории с пометкой «заменена более новой оценкой». Комментарий к оценке очень помогает коллегам понять, за что она.',
        en: 'On the **“Rating”** tab every employee can give 1 to 5 stars and, optionally, rate criteria:\n\n- companies — reliability, payment discipline, quality, communication;\n- contacts — reliability, communication, quality.\n\nThe average counts each colleague’s **latest** score: give a new one and the old one stays in the history marked “replaced by a newer score”. A comment helps colleagues see why.',
      },
      note: {
        ru: 'Список компаний можно отсортировать «По рейтингу», чтобы быстро найти самых надёжных поставщиков.',
        en: 'Sort the company list “By rating” to find the most reliable suppliers quickly.',
      },
    },
    {
      id: 'archive',
      title: { ru: 'Архив', en: 'Archive' },
      body: {
        ru: 'Если с компанией больше не работаете, перенесите её в архив: **«Ещё» → «Архив»**, при желании с причиной. Карточка, сотрудники, история и документы сохранятся — компания просто пропадёт из основных списков. Найти её можно в разделе «Архив», вернуть — кнопкой «Восстановить».\n\nКонтакты архивируются так же — в разделе «Архив контактов».\n\n«Удалить навсегда» доступно только администратору контрагентов и стирает карточку вместе с историей, рейтингами и документами без возможности вернуть.',
        en: 'If you no longer work with a company, archive it: **“More” → “Archive”**, with a reason if you like. The card, people, history and documents are kept — it just leaves the main lists. Find it under “Archive” and bring it back with “Restore”.\n\nContacts are archived the same way — see “Contacts archive”.\n\n“Delete for good” is available only to the counterparties administrator and erases the card with its history, ratings and documents for ever.',
      },
    },
    {
      id: 'search',
      title: { ru: 'Поиск и фильтры', en: 'Search and filters' },
      body: {
        ru: 'В списке **«Компании»** строка поиска ищет по названию (включая полное и на государственном языке), ИНН и другим номерам, телефону, почте и руководителю. Рядом — быстрый фильтр по стране, фильтр «Кто это для нас» и сортировка: по названию, недавно изменённые, недавно добавленные, по рейтингу.\n\nВ списке **«Контакты»** поиск идёт по ФИО, телефону, почте, мессенджерам и текущей компании; есть фильтры «Мои», «Все» и «Без компании».\n\nСлева в меню модуля: «Компании», «Мои компании», «Архив», «Контакты», «Архив контактов».',
        en: 'In the **“Companies”** list the search box looks through the name (including full and state-language names), INN and other numbers, phone, email and head. Next to it: a quick country filter, the relationship filter and sorting — by name, recently updated, recently added, by rating.\n\nIn the **“Contacts”** list search covers name, phone, email, messengers and current company; filters are “Mine”, “Everyone” and “Without a company”.\n\nThe module menu: “Companies”, “My companies”, “Archive”, “Contacts”, “Contacts archive”.',
      },
      example: {
        title: { ru: 'Кто звонил с незнакомого номера?', en: 'Who called from an unknown number?' },
        body: {
          ru: 'Вставьте номер (или его последние цифры, например `55 12 34`) в поиск «Контактов» или «Компаний» — портал найдёт карточку, где этот телефон записан.',
          en: 'Paste the number (or its last digits, say `55 12 34`) into the “Contacts” or “Companies” search — the portal finds the card where that phone is stored.',
        },
      },
    },
    {
      id: 'settings',
      title: { ru: 'Настройки модуля (для администратора)', en: 'Module settings (for administrators)' },
      body: {
        ru: 'Настройки открываются в **Настройки → Модули → Контрагенты** и доступны администратору контрагентов.\n\n- **Страны** — страна по умолчанию и список предлагаемых стран (их порядок — порядок в фильтре).\n- **Кто может изменять карточки** — «Все сотрудники» (по умолчанию) или «Ответственный, автор и администраторы». Видят справочник в любом случае все.\n- **Типы связей** — переименуйте, перекрасьте или добавьте свои типы к «Клиенту», «Поставщику» и другим.\n- **Свои поля** — дополнительные поля для компаний или контактов: текст, длинный текст, число, дата, список, ссылка; для всех стран или только для выбранных.\n- **Реестры** — Минюст КР и ЕГРЮЛ работают без ключа; для DaData нужен ключ.',
        en: 'Settings live in **Settings → Modules → Counterparties** and are available to the counterparties administrator.\n\n- **Countries** — the default country and the list of countries offered (their order is the filter order).\n- **Who may change cards** — “Everyone” (default) or “Responsible, author and admins”. Everyone can always see the directory.\n- **Relationship types** — rename, recolour or add your own besides “Client”, “Supplier” and others.\n- **Custom fields** — extra fields for companies or contacts: text, long text, number, date, list, link; for all countries or only chosen ones.\n- **Registers** — Ministry of Justice of KG and EGRUL work without a key; DaData needs one.',
      },
      steps: [
        { ru: 'Зарегистрируйтесь на dadata.ru (бесплатный тариф — 10 000 запросов в сутки).', en: 'Sign up at dadata.ru (the free plan gives 10,000 requests a day).' },
        { ru: 'В профиле откройте «API-ключи» и скопируйте **API-ключ** (секретный ключ не нужен).', en: 'In your profile open “API keys” and copy the **API key** (the secret key is not needed).' },
        { ru: 'В разделе «Реестры» вставьте ключ в поле DaData и нажмите «Сохранить».', en: 'In “Registers” paste the key into the DaData field and press “Save”.' },
      ],
      note: {
        ru: 'Ключ хранится в зашифрованном виде, после сохранения видны только его первые и последние символы. Без ключа для России используется бесплатный ЕГРЮЛ, но сайт ФНС иногда просит капчу — с DaData такого не бывает.',
        en: 'The key is stored encrypted; after saving only a masked hint is shown. Without a key Russia uses the free EGRUL, but the tax service sometimes asks for a captcha — DaData does not.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Почему нет кнопки «Заполнить из реестра»?', en: 'Why is there no “Fill from the register” button?' },
      a: {
        ru: 'Для выбранной страны открытый реестр не подключён. Сейчас автозаполнение работает для Кыргызстана и России — для остальных стран заполните карточку вручную.',
        en: 'No public register is connected for that country. Auto-fill works for Kyrgyzstan and Russia; for other countries fill the card by hand.',
      },
    },
    {
      q: { ru: 'Реестр пишет «нет компании с таким номером», хотя она существует.', en: 'The register says there is no company with this number, but it exists.' },
      a: {
        ru: 'Проверьте номер и страну: у кыргызского ИНН 14 цифр, у российского — 10 (у ИП — 12). Недавно зарегистрированная компания может появиться в реестре с задержкой — заполните карточку вручную и сверьте позже.',
        en: 'Check the number and country: a Kyrgyz INN has 14 digits, a Russian one 10 (12 for sole traders). A newly registered company may appear in the register later — fill the card by hand and check again later.',
      },
    },
    {
      q: { ru: 'Портал пишет, что компания уже есть, но я её не вижу в списке.', en: 'The portal says the company exists, but I can’t see it in the list.' },
      a: {
        ru: 'Скорее всего, она в архиве — рядом со ссылкой будет пометка «в архиве». Откройте её и нажмите «Восстановить».',
        en: 'Most likely it is archived — the link is marked “in the archive”. Open it and press “Restore”.',
      },
    },
    {
      q: { ru: 'Не могу изменить карточку — поля недоступны.', en: 'I can’t edit a card — the fields are locked.' },
      a: {
        ru: 'Администратор включил режим, в котором карточку меняют только ответственный, автор и администраторы. Попросите ответственного внести изменения или назначить ответственным вас.',
        en: 'An administrator allowed changes only by the responsible person, the author and administrators. Ask the responsible person to make the change or to make you responsible.',
      },
    },
    {
      q: { ru: 'Как удалить уволившегося сотрудника клиента?', en: 'How do I remove a client’s employee who left?' },
      a: {
        ru: 'Удалять не нужно: нажмите «Ушёл из компании» у его места работы. Человек останется в контактах с историей карьеры, и его можно будет найти, если он перейдёт к другому контрагенту.',
        en: 'No need to delete: press “Left the company” on their job. The person stays in contacts with their career history and can be found if they join another counterparty.',
      },
    },
    {
      q: { ru: 'Можно ли изменить или убрать свою оценку?', en: 'Can I change my rating?' },
      a: {
        ru: 'Просто поставьте новую — в средний балл пойдёт она, а прежняя останется в истории как «заменена более новой оценкой».',
        en: 'Just give a new one — it counts towards the average, and the old one stays in the history as “replaced by a newer score”.',
      },
    },
    {
      q: { ru: 'Пропадут ли мои телефоны, если нажать «Заполнить из реестра»?', en: 'Will my phones be lost if I press “Fill from the register”?' },
      a: {
        ru: 'Нет. Телефоны и почты, уже введённые вручную, сохраняются; реестр заполняет остальные поля.',
        en: 'No. Phones and emails you already typed are kept; the register fills the other fields.',
      },
    },
    {
      q: { ru: 'Нужен ли ключ DaData?', en: 'Do we need a DaData key?' },
      a: {
        ru: 'Только если вы работаете с российскими компаниями. Без ключа используется бесплатный ЕГРЮЛ, но с ключом приходят полный адрес, ОКВЭД, ОКПО и статус, и не бывает капчи. Для Кыргызстана ключ не нужен.',
        en: 'Only if you work with Russian companies. Without a key the free EGRUL is used; with a key you also get the full address, OKVED, OKPO and status, with no captcha. Kyrgyzstan needs no key.',
      },
    },
  ],
  fields: {
    country: {
      title: { ru: 'Страна', en: 'Country' },
      text: {
        ru: 'Выберите первой: от страны зависят номера, их проверка, правовые формы и реестр для автозаполнения.',
        en: 'Choose it first: the country defines the numbers, their checks, legal forms and the register for auto-fill.',
      },
      more: 'countries',
    },
    primaryId: {
      title: { ru: 'Основной номер', en: 'Main number' },
      text: {
        ru: 'ИНН, БИН, УНП или другой номер страны. По нему портал заполняет карточку из реестра и ищет дубликаты. Нажмите Enter, чтобы сразу запросить реестр.',
        en: 'INN, BIN, UNP or the country’s other number. It is used to fill the card from the register and find duplicates. Press Enter to query the register.',
      },
      more: 'registry',
    },
    fillFromRegistry: {
      title: { ru: 'Заполнить из реестра', en: 'Fill from the register' },
      text: {
        ru: 'Реквизиты придут из открытого реестра, а официальная выписка приложится к карточке. Введённые вручную телефоны и почты не затираются.',
        en: 'The details come from the public register and the official extract is attached. Phones and emails typed by hand are kept.',
      },
      more: 'registry',
    },
    duplicates: {
      title: { ru: 'Возможный дубликат', en: 'Possible duplicate' },
      text: {
        ru: 'Компания с этим номером уже есть — откройте её по ссылке. «Всё равно создать» — только если это действительно другая запись.',
        en: 'A company with this number already exists — open it via the link. Use “Create anyway” only if it really is a separate record.',
      },
      more: 'duplicates',
    },
    relations: {
      title: { ru: 'Кто это для нас', en: 'Relationship' },
      text: {
        ru: 'Клиент, поставщик, партнёр… Можно выбрать несколько. По этому полю фильтруется список компаний.',
        en: 'Client, supplier, partner… You can pick several. The company list can be filtered by it.',
      },
      more: 'relations',
    },
    owner: {
      title: { ru: 'Ответственный', en: 'Responsible' },
      text: {
        ru: 'Сотрудник, который ведёт этого контрагента. У него компания появится в «Моих компаниях».',
        en: 'The employee who looks after this counterparty. It appears in their “My companies”.',
      },
      more: 'relations',
    },
    tags: {
      title: { ru: 'Теги', en: 'Tags' },
      text: {
        ru: 'Любые слова для своих пометок: VIP, тендер, Ош. Введите слово и нажмите Enter или запятую.',
        en: 'Any words for your own marks: VIP, tender, Osh. Type a word and press Enter or a comma.',
      },
      more: 'relations',
    },
    verify: {
      title: { ru: 'Сверка с реестром', en: 'Register check' },
      text: {
        ru: 'Пустые поля карточки отмечены заранее. Отличающиеся значения отметьте сами — принятые изменения и выписка сохранятся в истории.',
        en: 'Empty card fields are pre-selected. Tick differing values yourself — taken changes and the extract are saved in the history.',
      },
      more: 'verify',
    },
    workplace: {
      title: { ru: 'Место работы', en: 'Where they work' },
      text: {
        ru: 'Сразу привяжите человека к компании. Позже можно добавить ещё места работы — человек может работать в нескольких компаниях.',
        en: 'Link the person to a company right away. More jobs can be added later — a person can work at several companies.',
      },
      more: 'people',
    },
    decisionMaker: {
      title: { ru: 'Принимает решения', en: 'Decision maker' },
      text: {
        ru: 'Отметьте тех, кто согласует сделки и подписывает документы, — в карточке компании они показываются первыми.',
        en: 'Mark people who approve deals and sign documents — they are shown first on the company card.',
      },
      more: 'people',
    },
    leaveNext: {
      title: { ru: 'Куда дальше?', en: 'What next?' },
      text: {
        ru: 'Если человек перешёл к другому контрагенту, выберите «Переходит в другую компанию» — новое место работы создастся сразу.',
        en: 'If the person moved to another counterparty, choose “Moves to another company” — the new job is created at once.',
      },
      more: 'people',
    },
    rating: {
      title: { ru: 'Ваша оценка', en: 'Your rating' },
      text: {
        ru: 'В средний балл идёт ваша последняя оценка; критерии и комментарий необязательны, но помогают коллегам.',
        en: 'Your latest score counts towards the average; criteria and a comment are optional but help colleagues.',
      },
      more: 'rating',
    },
    editPolicy: {
      title: { ru: 'Кто может изменять карточки', en: 'Who may change cards' },
      text: {
        ru: '«Все сотрудники» — менять может любой. Второй вариант оставляет право только ответственному, автору и администраторам. Видят справочник все.',
        en: '“Everyone” — anyone can change cards. The other option leaves it to the responsible person, the author and admins. Everyone can see the directory.',
      },
      more: 'settings',
    },
    relationTypes: {
      title: { ru: 'Типы связей', en: 'Relationship types' },
      text: {
        ru: 'Варианты поля «Кто это для нас». Переименуйте, задайте цвет или добавьте свои.',
        en: 'The choices for the “Relationship” field. Rename, recolour or add your own.',
      },
      more: 'settings',
    },
    customFields: {
      title: { ru: 'Свои поля', en: 'Custom fields' },
      text: {
        ru: 'Дополнительные поля для компаний или контактов — для всех стран или только для выбранных. Появятся в разделе «Дополнительные поля» формы.',
        en: 'Extra fields for companies or contacts — for all or only chosen countries. They appear under “Additional fields” in the form.',
      },
      more: 'settings',
    },
    dadataKey: {
      title: { ru: 'Ключ DaData', en: 'DaData key' },
      text: {
        ru: 'Нужен только для российских компаний: даёт полный адрес, ОКВЭД, ОКПО и статус без капчи. Вставьте API-ключ из профиля на dadata.ru — секретный ключ не нужен.',
        en: 'Needed only for Russian companies: adds the full address, OKVED, OKPO and status with no captcha. Paste the API key from your dadata.ru profile — the secret key is not needed.',
      },
      more: 'settings',
    },
  },
  related: ['tasks', 'files'],
};
