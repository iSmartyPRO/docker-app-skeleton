/**
 * Module manifests (spec docs/specs/platform-2.0.ru.md §1.2, §1.4).
 *
 * One plain object per module, keyed by id, with the facts the platform needs
 * to reason about modules: version, category, hard requirements, optional
 * links, the minimum core version and a short changelog. Settings defaults,
 * sanitizers and permissions stay in catalog.js (merged in by moduleManifest()).
 * No imports, so anything (settings, permissions, tests, the System page) can
 * read it without loading module code.
 *
 * The client gets the same objects from GET /api/admin/modules and adds its
 * own UI parts (icon, settings screen, admin docs, tour) from
 * src/frontend/src/modules/manifest.js.
 *
 * Shape (docs/extending.md «Module manifest»):
 *
 *   tasks: {
 *     name:        { en, ru },                  // fallback name (the UI uses i18n apps.<id>.name)
 *     version:     '1.0.0',                     // semver of the module, independent of the core VERSION
 *     category:    'work',                      // one of CATEGORIES
 *     minCore:     '1.4.0',                     // lowest core VERSION this module runs on
 *     requires:    [{ id: 'approvals', reason: { en, ru } }        // another module: must be on
 *                   { integration: 'activeDirectory', reason }],    // an integration: must be on (Settings → Integrations);
 *                                                                   //   `demo: true` — may be switched on without it (setup page / demo data)
 *     enhances:    [{ id: 'calendar', what: { en, ru } }],          // optional link: works without it, the feature hides
 *     docs:        { user: 'tasks', guide: 'docs/tasks.md' },       // help article id (/help/<user>) and the developer doc
 *     changelog:   [{ version: '1.0.0', date: '2026-10-16', changes: { en: [...], ru: [...], ky: [...], … } }],  // newest first, a few entries
 *   }
 *
 * Version bump rules: patch for fixes, minor for new features and new
 * settings with defaults, major for changes that need an administrator's
 * attention (removed settings, a data migration that cannot be undone, an API
 * change). Add a changelog entry with every bump; keep the last 5.
 */
import { packageManifestEntries } from '../platform/packages/disk.js';

/** Categories of the «Modules» page, in display order (labels: i18n platform.categories.<id>). */
export const CATEGORIES = ['work', 'documents', 'sales', 'supply', 'construction', 'people', 'infrastructure'];

/** Integrations a manifest may name in `requires` / `enhances` (keys of settings.integrations). */
export const INTEGRATIONS = ['email', 'telegram', 'whatsapp', 'wazzup', 'mattermost', 'isms', 'google', 'documents', 'activeDirectory'];

const FIRST = '2026-10-16';
const first = (en, ru, more = {}) => [{ version: '1.0.0', date: FIRST, changes: { en, ru, ...more } }];
const APPROVALS = {
  id: 'approvals',
  reason: { en: 'Documents go through approval routes', ky: 'Документтер макулдашуу маршруттарынан өтөт', tr: 'Belgeler onay akışlarından geçer', zh: '单据按审批流程流转', ru: 'Документы проходят маршруты согласования' },
};

export const MODULE_MANIFEST = {
  approvals: {
    name: { en: 'Approvals', ky: 'Макулдашуулар', tr: 'Onaylar', zh: '审批', ru: 'Согласования' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [],
    docs: { user: 'approvals', guide: 'docs/approvals.md' },
    changelog: first(
      ['Routes with conditions, urgency and SLA, substitutes, the «Waiting for me» inbox.'],
      ['Маршруты с условиями, срочность и сроки, замещения, входящие «Ждёт меня».'], { ky: ['Шарттары бар маршруттар, шашылыштык жана мөөнөттөр, орун басарлар, «Мени күтүүдө» кирүүчүлөрү.'], tr: ['Koşullu akışlar, aciliyet ve SLA, vekiller, «Beni bekleyenler» gelen kutusu.'], zh: ['带条件的流程、紧急程度和 SLA、代理人、“待我处理”收件箱。'] }
    ),
  },
  dashboard: {
    name: { en: 'Dashboard', ky: 'Башкаруу панели', tr: 'Pano', zh: '仪表板', ru: 'Дашборд' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'tasks', what: { en: 'Task widgets: mine, overdue, projects', ky: 'Тапшырма виджеттери: меники, мөөнөтү өткөн, долбоорлор', tr: 'Görev pencere öğeleri: benim, gecikmiş, projeler', zh: '任务小组件：我的、已逾期、项目', ru: 'Виджеты задач: мои, просроченные, проекты' } },
      { id: 'calendar', what: { en: 'Agenda of today’s meetings', ky: 'Бүгүнкү жолугушуулардын күн тартиби', tr: 'Bugünkü toplantıların gündemi', zh: '今日会议日程', ru: 'Повестка встреч на сегодня' } },
      { id: 'files', what: { en: 'Recent files and storage usage', ky: 'Акыркы файлдар жана ээленген орун', tr: 'Son dosyalar ve depolama kullanımı', zh: '最近的文件和存储用量', ru: 'Недавние файлы и занятое место' } },
      { id: 'drive', what: { en: 'File server shortcuts and activity', ky: 'Файл серверинин энбелгилери жана аракеттери', tr: 'Dosya sunucusu kısayolları ve etkinliği', zh: '文件服务器快捷方式和动态', ru: 'Ярлыки и активность файлового сервера' } },
      { id: 'kb', what: { en: 'New knowledge base materials', ky: 'Билим базасынын жаңы материалдары', tr: 'Yeni bilgi bankası içerikleri', zh: '知识库新内容', ru: 'Новые материалы базы знаний' } },
      { id: 'resources', what: { en: 'Online resources tiles', ky: 'Онлайн ресурстардын плиткалары', tr: 'Çevrimiçi kaynak kutucukları', zh: '在线资源磁贴', ru: 'Плитки онлайн-ресурсов' } },
      { id: 'companies', what: { en: 'Recent counterparties', ky: 'Акыркы контрагенттер', tr: 'Son cari hesaplar', zh: '最近的往来单位', ru: 'Недавние контрагенты' } },
      { id: 'procurement', what: { en: 'Purchase requests widget', ky: 'Сатып алууга өтүнмөлөр виджети', tr: 'Satın alma talepleri pencere öğesi', zh: '采购申请小组件', ru: 'Виджет заявок на закупку' } },
      { id: 'warehouse', what: { en: 'Stock below minimum, transfers, tools on me', ky: 'Минимумдан төмөн калдыктар, которуулар, менде турган шаймандар', tr: 'Asgari seviyenin altındaki stok, transferler, zimmetimdeki aletler', zh: '低于最低库存、调拨、我名下的工具', ru: 'Остатки ниже минимума, перемещения, инструмент на мне' } },
      { id: 'contracts', what: { en: 'Upcoming contract payments', ky: 'Келишимдер боюнча жакынкы төлөмдөр', tr: 'Yaklaşan sözleşme ödemeleri', zh: '即将到期的合同付款', ru: 'Ближайшие платежи по договорам' } },
    ],
    docs: { user: 'dashboard', guide: 'docs/dashboard.md' },
    changelog: first(['Widgets from every enabled module, personal layouts, charts.'], ['Виджеты всех включённых модулей, личная раскладка, графики.'], { ky: ['Бардык күйгүзүлгөн модулдардын виджеттери, жеке жайгашуу, диаграммалар.'], tr: ['Etkin her modülden pencere öğeleri, kişisel düzenler, grafikler.'], zh: ['来自所有已启用模块的小组件、个人布局、图表。'] }),
  },
  tasks: {
    name: { en: 'Tasks', ky: 'Тапшырмалар', tr: 'Görevler', zh: '任务', ru: 'Задачи' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'chat', what: { en: 'A conversation in every task', ky: 'Ар бир тапшырмада чат', tr: 'Her görevde bir sohbet', zh: '每个任务都有聊天', ru: 'Чат у каждой задачи' } },
      { id: 'files', what: { en: 'Attach files from Files', ky: '«Файлдар» бөлүмүнөн тиркемелер', tr: 'Dosyalar\'dan dosya ekleme', zh: '从“文件”添加附件', ru: 'Вложения из «Файлов»' } },
      { id: 'drive', what: { en: 'Attach files from the file server', ky: 'Файл серверинен тиркемелер', tr: 'Dosya sunucusundan dosya ekleme', zh: '从文件服务器添加附件', ru: 'Вложения с файлового сервера' } },
      { id: 'calendar', what: { en: 'Deadlines shown in the calendar', ky: 'Тапшырмалардын мөөнөттөрү календарда', tr: 'Son tarihler takvimde görünür', zh: '任务截止日期显示在日历中', ru: 'Сроки задач в календаре' } },
    ],
    docs: { user: 'tasks', guide: 'docs/tasks.md' },
    changelog: first(['Projects and boards, acceptance, orders, recurring tasks, flows.'], ['Проекты и доски, принятие в работу, поручения, повторяющиеся задачи, потоки.'], { ky: ['Долбоорлор жана такталар, ишке кабыл алуу, тапшырмалар (жетекчиликтен), кайталануучу тапшырмалар, агымдар.'], tr: ['Projeler ve panolar, kabul, talimatlar, yinelenen görevler, akışlar.'], zh: ['项目和看板、接受任务、指令、重复任务、任务流。'] }),
  },
  calendar: {
    name: { en: 'Calendar', ky: 'Календарь', tr: 'Takvim', zh: '日历', ru: 'Календарь' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'tasks', what: { en: 'Task deadlines on the calendar', ky: 'Тапшырмалардын мөөнөттөрү календарда', tr: 'Görev son tarihleri takvimde', zh: '日历中的任务截止日期', ru: 'Сроки задач в календаре' } },
      { integration: 'google', what: { en: 'Sync with Google Calendar', ky: 'Google Календарь менен синхрондоо', tr: 'Google Takvim ile eşitleme', zh: '与 Google 日历同步', ru: 'Синхронизация с Google Календарём' } },
    ],
    docs: { user: 'calendar', guide: 'docs/calendar.md' },
    changelog: first(['Shared calendars, recurrence, reminders, Google Calendar.'], ['Общие календари, повторения, напоминания, Google Календарь.'], { ky: ['Жалпы календарлар, кайталоолор, эскертүүлөр, Google Календарь.'], tr: ['Paylaşılan takvimler, yinelenme, hatırlatıcılar, Google Takvim.'], zh: ['共享日历、重复、提醒、Google 日历。'] }),
  },
  chat: {
    name: { en: 'Chats', ky: 'Чаттар', tr: 'Sohbetler', zh: '聊天', ru: 'Чаты' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [],
    docs: { user: 'chat', guide: 'docs/chat.md' },
    changelog: first(['Direct and group chats, conversations of records, video call links.'], ['Личные и групповые чаты, обсуждения записей, ссылки на видеозвонки.'], { ky: ['Жеке жана топтук чаттар, жазуулардын талкуулары, видеочалуу шилтемелери.'], tr: ['Birebir ve grup sohbetleri, kayıt sohbetleri, görüntülü arama bağlantıları.'], zh: ['私聊和群聊、记录讨论、视频通话链接。'] }),
  },
  resources: {
    name: { en: 'Online resources', ky: 'Онлайн ресурстар', tr: 'Çevrimiçi kaynaklar', zh: '在线资源', ru: 'Онлайн-ресурсы' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [],
    docs: { user: 'resources', guide: 'docs/resources.md' },
    changelog: first(['Tiles of company services with access by role and group.'], ['Плитки сервисов компании с доступом по ролям и группам.'], { ky: ['Компания сервистеринин плиткалары, кирүү укугу ролдор жана топтор боюнча.'], tr: ['Role ve gruba göre erişimli şirket hizmeti kutucukları.'], zh: ['公司服务磁贴，按角色和组控制访问。'] }),
  },
  assistant: {
    name: { en: 'Robot assistant', ky: 'Робот-жардамчы', tr: 'Robot asistan', zh: '机器人助手', ru: 'Робот-помощник' },
    version: '1.0.0',
    category: 'work',
    minCore: '1.4.0',
    requires: [],
    enhances: [],
    docs: { user: 'assistant', guide: 'docs/assistant.md' },
    changelog: first(['Characters, tips on first visit, quick help.'], ['Персонажи, подсказки при первом входе, быстрая справка.'], { ky: ['Каармандар, биринчи киргенде кеңештер, ыкчам жардам.'], tr: ['Karakterler, ilk ziyarette ipuçları, hızlı yardım.'], zh: ['角色形象、首次访问提示、快速帮助。'] }),
  },
  files: {
    name: { en: 'Files', ky: 'Файлдар', tr: 'Dosyalar', zh: '文件', ru: 'Файлы' },
    version: '1.0.0',
    category: 'documents',
    minCore: '1.4.0',
    requires: [],
    enhances: [{ integration: 'documents', what: { en: 'Office previews and online editing', ky: 'Office документтерин көрүү жана онлайн түзөтүү', tr: 'Office önizlemeleri ve çevrimiçi düzenleme', zh: 'Office 文档预览和在线编辑', ru: 'Просмотр и онлайн-редактирование документов Office' } }],
    docs: { user: 'files', guide: 'docs/files.md' },
    changelog: first(['Personal and shared spaces, public links, quotas, trash.'], ['Личные и общие пространства, публичные ссылки, квоты, корзина.'], { ky: ['Жеке жана жалпы мейкиндиктер, ачык шилтемелер, квоталар, себет.'], tr: ['Kişisel ve paylaşılan alanlar, herkese açık bağlantılar, kotalar, çöp kutusu.'], zh: ['个人和共享空间、公开链接、配额、回收站。'] }),
  },
  kb: {
    name: { en: 'Knowledge base', ky: 'Билим базасы', tr: 'Bilgi bankası', zh: '知识库', ru: 'База знаний' },
    version: '1.0.0',
    category: 'documents',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'files', what: { en: 'Pick materials from Files', ky: '«Файлдар» бөлүмүнөн материалдарды тандоо', tr: 'Dosyalar\'dan içerik seçme', zh: '从“文件”选择内容', ru: 'Выбор материалов из «Файлов»' } },
      { integration: 'documents', what: { en: 'Exact previews of Word and PowerPoint', ky: 'Word жана PowerPoint\'ту так көрүү', tr: 'Word ve PowerPoint için birebir önizleme', zh: 'Word 和 PowerPoint 精确预览', ru: 'Точный просмотр Word и PowerPoint' } },
    ],
    docs: { user: 'kb', guide: 'docs/knowledge-base.md' },
    changelog: first(['Folders, articles and files with access rules and public links.'], ['Папки, статьи и файлы с правами доступа и публичными ссылками.'], { ky: ['Кирүү укуктары жана ачык шилтемелери бар папкалар, макалалар жана файлдар.'], tr: ['Erişim kuralları ve herkese açık bağlantılarla klasörler, makaleler ve dosyalar.'], zh: ['带访问规则和公开链接的文件夹、文章和文件。'] }),
  },
  contracts: {
    name: { en: 'Contracts', ky: 'Келишимдер', tr: 'Sözleşmeler', zh: '合同', ru: 'Договоры' },
    version: '1.0.0',
    category: 'documents',
    minCore: '1.4.0',
    requires: [APPROVALS],
    enhances: [
      { id: 'companies', what: { en: 'Pick the counterparty from the directory', ky: 'Контрагентти маалымдамадан тандоо', tr: 'Cari hesabı rehberden seçme', zh: '从名录中选择往来单位', ru: 'Выбор контрагента из справочника' } },
      { id: 'chat', what: { en: 'A conversation in every contract', ky: 'Ар бир келишимде чат', tr: 'Her sözleşmede bir sohbet', zh: '每份合同都有聊天', ru: 'Чат у каждого договора' } },
      { id: 'crm', what: { en: 'Link contracts to deals', ky: 'Келишимдерди бүтүмдөр менен байланыштыруу', tr: 'Sözleşmeleri fırsatlara bağlama', zh: '将合同关联到交易', ru: 'Связь договоров со сделками' } },
      { id: 'masterplan', what: { en: 'Sales contracts update units', ky: 'Сатуу келишимдери объекттерди жаңылайт', tr: 'Satış sözleşmeleri bağımsız bölümleri günceller', zh: '销售合同会更新房源单元', ru: 'Договоры продажи обновляют юниты' } },
      { id: 'procurement', what: { en: 'Purchase requests of the contract', ky: 'Келишим боюнча сатып алууга өтүнмөлөр', tr: 'Sözleşmeye ait satın alma talepleri', zh: '合同项下的采购申请', ru: 'Заявки на закупку по договору' } },
    ],
    docs: { user: 'contracts', guide: 'docs/contracts.md' },
    changelog: first(['Registry with versions, lawyer’s risks, approval, expiry reminders, payments.'], ['Реестр с версиями, риски юриста, согласование, напоминания об окончании, оплаты.'], { ky: ['Версиялары бар реестр, юристтин тобокелдиктери, макулдашуу, мөөнөтү бүтөөрү тууралуу эскертүүлөр, төлөмдөр.'], tr: ['Sürümlü kayıt listesi, hukukçu riskleri, onay, bitiş hatırlatıcıları, ödemeler.'], zh: ['带版本的台账、律师风险提示、审批、到期提醒、付款。'] }),
  },
  companies: {
    name: { en: 'Counterparties', ky: 'Контрагенттер', tr: 'Cari hesaplar', zh: '往来单位', ru: 'Контрагенты' },
    version: '1.0.0',
    category: 'sales',
    minCore: '1.4.0',
    requires: [],
    enhances: [{ id: 'crm', what: { en: 'Deals on the company card', ky: 'Компаниянын карточкасында бүтүмдөр', tr: 'Şirket kartında fırsatlar', zh: '公司卡片中的交易', ru: 'Сделки в карточке компании' } }],
    docs: { user: 'companies', guide: 'docs/companies.md' },
    changelog: first(['Companies and people, registry lookups, careers, history and rating.'], ['Компании и люди, реквизиты из реестров, карьера, история и рейтинг.'], { ky: ['Компаниялар жана адамдар, реестрлерден реквизиттер, карьера, тарых жана рейтинг.'], tr: ['Şirketler ve kişiler, sicil sorguları, kariyer, geçmiş ve puanlama.'], zh: ['公司和联系人、登记信息查询、职业经历、历史和评分。'] }),
  },
  crm: {
    name: { en: 'CRM', ky: 'CRM', tr: 'CRM', zh: 'CRM', ru: 'CRM' },
    version: '1.0.0',
    category: 'sales',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { id: 'companies', what: { en: 'Clients from the counterparties directory', ky: 'Кардарлар контрагенттер маалымдамасынан', tr: 'Cari hesaplar rehberinden müşteriler', zh: '客户来自往来单位名录', ru: 'Клиенты из справочника контрагентов' } },
      { id: 'chat', what: { en: 'Discuss a deal with colleagues', ky: 'Бүтүмдү кесиптештер менен талкуулоо', tr: 'Fırsatı ekip arkadaşlarıyla görüşme', zh: '与同事讨论交易', ru: 'Обсуждение сделки с коллегами' } },
    ],
    docs: { user: 'crm', guide: 'docs/crm.md' },
    changelog: first(['Pipelines, kanban and list, activities, custom fields.'], ['Воронки, канбан и список, дела, свои поля.'], { ky: ['Воронкалар, канбан жана тизме, иш-чаралар, өз талаалары.'], tr: ['Satış hatları, kanban ve liste, aktiviteler, özel alanlar.'], zh: ['销售漏斗、看板和列表、活动、自定义字段。'] }),
  },
  procurement: {
    name: { en: 'Procurement', ky: 'Сатып алуулар', tr: 'Satın alma', zh: '采购', ru: 'Закупки' },
    version: '1.0.0',
    category: 'supply',
    minCore: '1.4.0',
    requires: [APPROVALS],
    enhances: [
      { id: 'companies', what: { en: 'Pick suppliers from the directory', ky: 'Жеткирүүчүлөрдү маалымдамадан тандоо', tr: 'Tedarikçileri rehberden seçme', zh: '从名录中选择供应商', ru: 'Выбор поставщиков из справочника' } },
      { id: 'masterplan', what: { en: 'Requests for a project or object', ky: 'Долбоорго же объектке өтүнмөлөр', tr: 'Bir proje veya şantiye için talepler', zh: '针对项目或工地的申请', ru: 'Заявки на проект или объект' } },
      { id: 'crm', what: { en: 'Link requests to deals', ky: 'Өтүнмөлөрдү бүтүмдөр менен байланыштыруу', tr: 'Talepleri fırsatlara bağlama', zh: '将申请关联到交易', ru: 'Связь заявок со сделками' } },
      { id: 'contracts', what: { en: 'Requests under a contract', ky: 'Келишим боюнча өтүнмөлөр', tr: 'Sözleşmeye bağlı talepler', zh: '合同项下的申请', ru: 'Заявки по договору' } },
      { id: 'files', what: { en: 'Attach invoices from Files', ky: '«Файлдар» бөлүмүнөн эсеп-дүмүрчөктөр', tr: 'Dosyalar\'dan fatura ekleme', zh: '从“文件”添加发票', ru: 'Счета из «Файлов»' } },
      { id: 'chat', what: { en: 'A conversation in every request', ky: 'Ар бир өтүнмөдө чат', tr: 'Her talepte bir sohbet', zh: '每个申请都有聊天', ru: 'Чат у каждой заявки' } },
    ],
    docs: { user: 'procurement', guide: 'docs/procurement.md' },
    changelog: first(['Purchase requests, approval, payments registry, delivery.'], ['Заявки на закупку, согласование, реестр оплат, поставка.'], { ky: ['Сатып алууга өтүнмөлөр, макулдашуу, төлөмдөр реестри, жеткирүү.'], tr: ['Satın alma talepleri, onay, ödeme kayıt listesi, teslimat.'], zh: ['采购申请、审批、付款台账、交付。'] }),
  },
  warehouse: {
    name: { en: 'Warehouse', ky: 'Кампа', tr: 'Depo', zh: '仓库', ru: 'Склад' },
    version: '1.0.0',
    category: 'supply',
    minCore: '1.4.0',
    requires: [APPROVALS],
    enhances: [
      { id: 'procurement', what: { en: 'Receipts from purchase requests', ky: 'Сатып алууга өтүнмөлөр боюнча кирим', tr: 'Satın alma taleplerinden giriş', zh: '按采购申请入库', ru: 'Приход по заявкам на закупку' } },
      { id: 'masterplan', what: { en: 'Issues to projects and objects', ky: 'Долбоорлорго жана объекттерге берүү', tr: 'Projelere ve şantiyelere çıkış', zh: '向项目和工地出库', ru: 'Выдача на проекты и объекты' } },
      { id: 'companies', what: { en: 'Suppliers from the directory', ky: 'Жеткирүүчүлөр маалымдамадан', tr: 'Rehberden tedarikçiler', zh: '供应商来自名录', ru: 'Поставщики из справочника' } },
    ],
    docs: { user: 'warehouse', guide: 'docs/warehouse.md' },
    changelog: first(['Stock, receipts and issues, transfers, tools, barcodes, inventory.'], ['Остатки, приход и выдача, перемещения, инструмент, штрихкоды, инвентаризация.'], { ky: ['Калдыктар, кирим жана берүү, которуулар, шаймандар, штрихкоддор, инвентаризация.'], tr: ['Stok, giriş ve çıkışlar, transferler, aletler, barkodlar, sayım.'], zh: ['库存、入库和出库、调拨、工具、条形码、盘点。'] }),
  },
  drive: {
    name: { en: 'File server', ky: 'Файл сервери', tr: 'Dosya sunucusu', zh: '文件服务器', ru: 'Файловый сервер' },
    version: '1.0.0',
    category: 'infrastructure',
    minCore: '1.4.0',
    requires: [],
    enhances: [
      { integration: 'activeDirectory', what: { en: 'Folder access groups, the domain password for shares', ky: 'Папкаларга кирүү укугунун топтору, жалпы папкалар үчүн домендик сырсөз', tr: 'Klasör erişim grupları, paylaşımlar için etki alanı parolası', zh: '文件夹访问组、共享的域密码', ru: 'Группы доступа к папкам, доменный пароль для шар' } },
      { integration: 'documents', what: { en: 'Office previews and online editing', ky: 'Office документтерин көрүү жана онлайн түзөтүү', tr: 'Office önizlemeleri ve çevrimiçi düzenleme', zh: 'Office 文档预览和在线编辑', ru: 'Просмотр и онлайн-редактирование документов Office' } },
    ],
    docs: { user: 'drive', guide: 'docs/drive.md' },
    changelog: first(['SMB shares as one drive, links, activity log, folder access management.'], ['SMB-шары как единый диск, ссылки, журнал действий, управление доступом к папкам.'], { ky: ['SMB жалпы папкалары бир диск катары, шилтемелер, аракеттер журналы, папкаларга кирүү укугун башкаруу.'], tr: ['Tek sürücü olarak SMB paylaşımları, bağlantılar, etkinlik günlüğü, klasör erişim yönetimi.'], zh: ['SMB 共享合为一个网盘、链接、操作日志、文件夹访问权限管理。'] }),
  },
  org: {
    name: { en: 'Org structure', ky: 'Уюмдук түзүм', tr: 'Organizasyon yapısı', zh: '组织架构', ru: 'Оргструктура' },
    version: '1.0.0',
    category: 'people',
    minCore: '1.4.0',
    requires: [],
    enhances: [{ id: 'employees', what: { en: 'Heads and headcount from employee cards', ky: 'Жетекчилер жана кызматкерлердин саны карточкалардан', tr: 'Çalışan kartlarından amirler ve personel sayısı', zh: '负责人和人数来自员工卡片', ru: 'Руководители и численность из карточек сотрудников' } }],
    docs: { user: null, guide: 'docs/org-structure.md' },
    changelog: first(
      ['Tree of units with configurable types, heads, purposes and time zones; drag and drop with history; org chart; managerOf() for modules and approvals.'],
      ['Дерево подразделений с настраиваемыми типами, руководителями, назначениями и часовыми поясами; перетаскивание с историей; оргсхема; managerOf() для модулей и согласований.'], { ky: ['Жөндөлүүчү түрлөрү, жетекчилери, багыттары жана саат алкактары бар бөлүмдөрдүн дарагы; тарыхы сакталган сүйрөп жылдыруу; уюмдук схема; модулдар жана макулдашуулар үчүн managerOf().'], tr: ['Yapılandırılabilir türler, amirler, amaçlar ve saat dilimleriyle birim ağacı; geçmişiyle sürükle-bırak; organizasyon şeması; modüller ve onaylar için managerOf().'], zh: ['部门树，可配置类型、负责人、用途和时区；拖放调整并保留历史；组织架构图；供模块和审批使用的 managerOf()。'] }
    ),
  },
  employees: {
    name: { en: 'Employees', ky: 'Кызматкерлер', tr: 'Çalışanlar', zh: '员工', ru: 'Сотрудники' },
    version: '1.0.0',
    category: 'people',
    minCore: '1.4.0',
    requires: [{ id: 'org', reason: { en: 'Employees belong to units of the org structure', ky: 'Кызматкерлер уюмдук түзүмдүн бөлүмдөрүнө катталат', tr: 'Çalışanlar organizasyon yapısının birimlerine bağlıdır', zh: '员工隶属于组织架构中的部门', ru: 'Сотрудники числятся в подразделениях оргструктуры' } }],
    enhances: [
      { id: 'dashboard', what: { en: 'Birthdays and work anniversaries widget', ky: 'Туулган күндөр жана иш жылдыктары виджети', tr: 'Doğum günleri ve iş yıl dönümleri pencere öğesi', zh: '生日和入职周年小组件', ru: 'Виджет дней рождения и годовщин' } },
      { integration: 'activeDirectory', what: { en: 'The AD account field on the employee card', ky: 'Кызматкердин карточкасында «AD эсептик жазуусу» талаасы', tr: 'Çalışan kartındaki AD hesabı alanı', zh: '员工卡片中的 AD 账户字段', ru: 'Поле «Учётная запись AD» в карточке сотрудника' } },
    ],
    docs: { user: 'employees', guide: 'docs/employees.md' },
    changelog: first(
      ['Registry and cards, positions, documents, skills and clearances with reminders, portal user link, org chart, Excel import, birthdays widget.'],
      ['Реестр и карточки, должности, документы, навыки и допуски с напоминаниями, связь с пользователем портала, оргсхема, импорт из Excel, виджет дней рождения.'], { ky: ['Реестр жана карточкалар, кызмат орундары, документтер, эскертүүлөрү бар көндүмдөр жана уруксаттар, портал колдонуучусу менен байланыш, уюмдук схема, Excel\'ден импорт, туулган күндөр виджети.'], tr: ['Kayıt listesi ve kartlar, pozisyonlar, belgeler, hatırlatıcılı beceriler ve yetki belgeleri, portal kullanıcısı bağlantısı, organizasyon şeması, Excel\'den içe aktarma, doğum günleri pencere öğesi.'], zh: ['台账和卡片、职位、证件、带提醒的技能和资质证书、门户用户关联、组织架构图、Excel 导入、生日小组件。'] }
    ),
  },
  directory: {
    name: { en: 'AD directory', ky: 'AD каталогу', tr: 'AD dizini', zh: 'AD 目录', ru: 'Каталог AD' },
    version: '1.0.0',
    category: 'infrastructure',
    minCore: '1.4.0',
    requires: [
      {
        integration: 'activeDirectory',
        reason: { en: 'Users, groups and OUs are read from and written to Active Directory', ky: 'Колдонуучулар, топтор жана OU Active Directory\'ден окулат жана анда өзгөртүлөт', tr: 'Kullanıcılar, gruplar ve OU\'lar Active Directory\'den okunur ve orada değiştirilir', zh: '用户、组和 OU 从 Active Directory 读取并写回', ru: 'Пользователи, группы и OU читаются из Active Directory и меняются в нём' },
        // May be switched on without it: the module page then explains the setup and can show the demo directory.
        demo: true,
      },
    ],
    enhances: [
      { id: 'employees', what: { en: 'Link AD accounts to employee cards and create them from a card', ky: 'AD эсептик жазууларын кызматкерлердин карточкалары менен байланыштыруу жана карточкадан түзүү', tr: 'AD hesaplarını çalışan kartlarına bağlama ve karttan oluşturma', zh: '将 AD 账户关联到员工卡片，并从卡片创建账户', ru: 'Связывать учётные записи AD с карточками сотрудников и создавать их из карточки' } },
      { id: 'drive', what: { en: 'Folder access groups (sg_…) are managed in File server → Access', ky: 'Папкаларга кирүү укугунун топтору (sg_…) «Файл сервери → Кирүү укугу» бөлүмүндө башкарылат', tr: 'Klasör erişim grupları (sg_…) Dosya sunucusu → Erişim bölümünden yönetilir', zh: '文件夹访问组（sg_…）在“文件服务器 → 访问权限”中管理', ru: 'Группы доступа к папкам (sg_…) управляются в «Файловый сервер → Доступ»' } },
    ],
    docs: { user: 'directory', guide: 'docs/directory.md' },
    changelog: first(
      ['OU tree within a managed root, users, groups and computers, account actions under the administrator’s own AD account, password reset over LDAPS / StartTLS, journal, demo directory.'],
      ['Дерево OU внутри корня управления, пользователи, группы и компьютеры, действия с учётными записями от AD-учётки администратора, сброс пароля по LDAPS / StartTLS, журнал, демо-каталог.'], { ky: ['Башкаруу тамырынын ичиндеги OU дарагы, колдонуучулар, топтор жана компьютерлер, администратордун өз AD эсептик жазуусу аркылуу аракеттер, LDAPS / StartTLS аркылуу сырсөздү калыбына келтирүү, журнал, демо каталог.'], tr: ['Yönetilen kök içinde OU ağacı, kullanıcılar, gruplar ve bilgisayarlar, yöneticinin kendi AD hesabıyla hesap işlemleri, LDAPS / StartTLS üzerinden parola sıfırlama, günlük, demo dizini.'], zh: ['受管根节点下的 OU 树、用户、组和计算机，以管理员本人 AD 账户执行账户操作，通过 LDAPS / StartTLS 重置密码，日志，演示目录。'] }
    ),
  },
  remote: {
    name: { en: 'Remote access', ky: 'Алыстан кирүү', tr: 'Uzak erişim', zh: '远程访问', ru: 'Удалённый доступ' },
    version: '1.3.0',
    category: 'infrastructure',
    minCore: '1.7.0',
    requires: [],
    enhances: [
      { id: 'directory', what: { en: 'Import computers from Active Directory', ky: 'Компьютерлерди Active Directory\'den импорттоо', tr: 'Bilgisayarları Active Directory\'den içe aktarma', zh: '从 Active Directory 导入计算机', ru: 'Импорт компьютеров из Active Directory' } },
    ],
    docs: { user: 'remote', guide: 'docs/specs/remote-access.ru.md' },
    changelog: [
      {
        version: '1.3.0',
        date: '2026-10-22',
        changes: {
          en: ['Reorganised: computers and applications are now separate pages. Folders group connections by site/office/role. Applications are self-contained (own RDS address, gateway and credentials) and pick a named RD Gateway. Computers are direct RDP/VNC.'],
          ru: ['Реорганизация: компьютеры и приложения — на отдельных страницах. Папки группируют подключения по площадке/офису/роли. Приложения самостоятельны (свой адрес RDS, шлюз и учётные данные) и выбирают именованный шлюз RD Gateway. Компьютеры — прямой RDP/VNC.'],
          ky: ['Кайра уюштуруу: компьютерлер жана колдонмолор өзүнчө барактарда. Папкалар байланыштарды топтойт.'],
          tr: ['Yeniden düzenleme: bilgisayarlar ve uygulamalar ayrı sayfalarda. Klasörler bağlantıları gruplar.'],
          zh: ['重组：计算机和应用程序现在分属不同页面。文件夹按站点/办公室/角色分组连接。'],
        },
      },
      {
        version: '1.2.0',
        date: '2026-10-22',
        changes: {
          en: ['RDWeb / RD Gateway: import a RemoteApp .rdp file to set up the RDS server, its RD Gateway and the application automatically (gateway, load-balance-info and the app alias). Connect to published apps behind a gateway.'],
          ru: ['RDWeb / RD Gateway: импорт .rdp-файла RemoteApp автоматически создаёт сервер RDS, его шлюз RD Gateway и приложение (шлюз, load-balance-info и алиас). Подключение к опубликованным приложениям за шлюзом.'],
          ky: ['RDWeb / RD Gateway: RemoteApp .rdp файлын импорттоо RDS серверин, анын шлюзун жана колдонмону автоматтык түрдө түзөт.'],
          tr: ['RDWeb / RD Gateway: RemoteApp .rdp dosyasını içe aktarma RDS sunucusunu, RD Gateway\'ini ve uygulamayı otomatik kurar.'],
          zh: ['RDWeb / RD Gateway：导入 RemoteApp 的 .rdp 文件可自动配置 RDS 服务器、RD 网关和应用程序。'],
        },
      },
      {
        version: '1.1.0',
        date: '2026-10-22',
        changes: {
          en: ['RemoteApp: launch a single published application (RDS alias or an executable path) instead of the whole desktop. Password manager: save personal or shared credentials and reuse them when connecting. Passbolt integration: each person connects their own Passbolt (GPGAuth) and uses its entries. Three credential sources at connect: manual, portal password manager, Passbolt.'],
          ru: ['RemoteApp: запуск одного опубликованного приложения (алиас RDS или путь к exe) вместо всего рабочего стола. Менеджер паролей: сохранение личных и общих учётных данных и их переиспользование при подключении. Интеграция с Passbolt: каждый подключает свой Passbolt (GPGAuth) и использует его записи. Три источника при подключении: вручную, менеджер паролей портала, Passbolt.'],
          ky: ['RemoteApp: бүт рабочий столдун ордуна бир жарыяланган колдонмону иштетүү. Сырсөз менеджери: жеке жана жалпы эсептик жазууларды сактоо жана кайра колдонуу. Passbolt интеграциясы: ар бир колдонуучу өз Passbolt\'ун туташтырат.'],
          tr: ['RemoteApp: tüm masaüstü yerine tek bir yayımlanmış uygulamayı başlatma. Parola yöneticisi: kişisel veya paylaşılan kimlik bilgilerini kaydetme ve yeniden kullanma. Passbolt entegrasyonu: herkes kendi Passbolt\'unu bağlar.'],
          zh: ['RemoteApp：启动单个已发布的应用程序而非整个桌面。密码管理器：保存个人或共享凭据并在连接时重用。Passbolt 集成：每个人连接自己的 Passbolt。'],
        },
      },
      {
        version: '1.0.0',
        date: '2026-10-22',
        changes: {
          en: ['Computers catalogue, access by portal and AD groups, attended support and announced monitoring with a built-in audit journal the watched employee can see, and a consent prompt for taking control. Transparency is enforced by the server; there is no covert mode. The live guacd tunnel, in-browser viewer and GPO package follow a pilot.'],
          ru: ['Каталог компьютеров, доступ по группам портала и AD, помощь по запросу и наблюдение с уведомлением, встроенный журнал подключений (виден и самому сотруднику) и запрос согласия на управление. Прозрачность обеспечивается сервером; скрытого режима нет. Живой туннель guacd, просмотрщик в браузере и пакет GPO — после пилота.'],
          ky: ['Компьютерлер каталогу, портал жана AD топтору боюнча кирүү, суроо боюнча жардам жана эскертүү менен байкоо, кызматкер көрө алган камтылган журнал жана башкарууга макулдук суроо. Ачык режим жок. guacd туннели, браузердеги көрсөткүч жана GPO пакети — пилоттон кийин.'],
          tr: ['Bilgisayar kataloğu, portal ve AD gruplarına göre erişim, talep üzerine destek ve bildirimli izleme, çalışanın görebildiği yerleşik günlük ve kontrolü devralmak için onay istemi. Gizli mod yoktur. Canlı guacd tüneli, tarayıcı görüntüleyici ve GPO paketi pilottan sonra gelir.'],
          zh: ['计算机目录、按门户和 AD 组的访问、应请求的协助与告知式监看、员工可查看的内置审计日志，以及接管控制前的同意提示。不提供隐蔽模式。实时 guacd 隧道、浏览器查看器和 GPO 包在试点后推出。'],
        },
      },
    ],
  },
};

/** Modules built into this core version; installed packages (docs/module-packages.md) are merged in from the disk. */
export const BUILTIN_MANIFEST_IDS = Object.keys(MODULE_MANIFEST);
/**
 * Modules distributed as packages (no longer built into the core) that built-in
 * modules may name in `enhances`: the link is active once the package is installed.
 */
export const PACKAGE_MODULE_IDS = ['masterplan', 'qr'];
Object.assign(MODULE_MANIFEST, packageManifestEntries(BUILTIN_MANIFEST_IDS));

/**
 * Core services: always on, listed in the «Core» section of the Modules page
 * (labels: i18n platform.core.<id>). `path` is where an administrator sets them up.
 */
export const CORE_SERVICES = [
  { id: 'users', icon: 'people', path: '/admin/users' },
  { id: 'signin', icon: 'shield', path: '/admin/settings/signin' },
  { id: 'notifications', icon: 'bell', path: '/admin/settings/notifications' },
  { id: 'approvals', icon: 'inbox', path: '/admin/settings/approvals' },
  { id: 'org', icon: 'layers', path: '/admin/settings/org' },
  { id: 'api', icon: 'code', path: '/admin/api' },
  { id: 'activity', icon: 'bell', path: '/admin/activity' },
  { id: 'regional', icon: 'globe', path: '/admin/settings/general' },
  { id: 'appearance', icon: 'palette', path: '/admin/settings/theme' },
  { id: 'scheduler', icon: 'server', path: '/admin/settings/system' },
  { id: 'help', icon: 'graduation', path: '/help' },
];

// ── Versions ────────────────────────────────────────────────────────────────

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export function isSemver(value) {
  return typeof value === 'string' && SEMVER.test(value);
}

/** -1 / 0 / 1; prerelease and build suffixes are ignored. */
export function compareVersions(a, b) {
  const pa = SEMVER.exec(String(a)) || [0, 0, 0, 0];
  const pb = SEMVER.exec(String(b)) || [0, 0, 0, 0];
  for (let i = 1; i <= 3; i += 1) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// ── Validation ──────────────────────────────────────────────────────────────

const text = (value) => value && typeof value === 'object' && typeof value.en === 'string' && typeof value.ru === 'string';

/**
 * Problems of a manifest set, as readable strings (empty = valid): unknown
 * ids, bad versions or categories, missing texts, requirement cycles.
 * `catalogIds`: ids of MODULE_CATALOG; each must have a manifest and back.
 */
export function validateManifests(manifest = MODULE_MANIFEST, { catalogIds, coreVersion, coreIds = [], optionalIds = PACKAGE_MODULE_IDS } = {}) {
  const problems = [];
  const ids = new Set(Object.keys(manifest));
  // `enhances` may also name a module that is installed as a package (or not at all).
  const linkable = new Set([...ids, ...optionalIds]);
  if (catalogIds) {
    for (const id of catalogIds) if (!ids.has(id)) problems.push(`${id}: no manifest entry`);
    for (const id of ids) if (!catalogIds.includes(id)) problems.push(`${id}: manifest entry without a catalog module`);
  }
  for (const [id, entry] of Object.entries(manifest)) {
    if (!isSemver(entry.version)) problems.push(`${id}: version "${entry.version}" is not semver`);
    if (!isSemver(entry.minCore)) problems.push(`${id}: minCore "${entry.minCore}" is not semver`);
    else if (coreVersion && compareVersions(coreVersion, entry.minCore) < 0) problems.push(`${id}: needs core ${entry.minCore}, running ${coreVersion}`);
    if (!CATEGORIES.includes(entry.category)) problems.push(`${id}: unknown category "${entry.category}"`);
    if (!text(entry.name)) problems.push(`${id}: name needs en and ru`);
    for (const [field, label] of [['requires', 'reason'], ['enhances', 'what']]) {
      if (!Array.isArray(entry[field])) {
        problems.push(`${id}: ${field} must be a list`);
        continue;
      }
      for (const link of entry[field]) {
        if (link.integration) {
          if (!INTEGRATIONS.includes(link.integration)) problems.push(`${id}: ${field} names unknown integration "${link.integration}"`);
        } else if (!(field === 'enhances' ? linkable : ids).has(link.id)) problems.push(`${id}: ${field} names unknown module "${link.id}"`);
        else if (link.id === id) problems.push(`${id}: ${field} names itself`);
        if (!text(link[label])) problems.push(`${id}: ${field} → ${link.id || link.integration} needs ${label} in en and ru`);
      }
    }
    if (!Array.isArray(entry.changelog) || !entry.changelog.length) problems.push(`${id}: changelog is empty`);
    else if (entry.changelog[0].version !== entry.version) problems.push(`${id}: the newest changelog entry is not ${entry.version}`);
  }
  const cycle = findRequiresCycle(manifest);
  if (cycle) problems.push(`requirement cycle: ${cycle.join(' → ')}`);
  // A core module (always on) may not require one that can be switched off.
  for (const id of coreIds) {
    for (const link of manifest[id]?.requires || []) {
      if (link.id && !coreIds.includes(link.id)) problems.push(`${id}: a core module cannot require the optional module "${link.id}"`);
    }
  }
  return problems;
}

/** The first cycle in the `requires` graph (module ids only) as [a, b, …, a], or null. */
export function findRequiresCycle(manifest = MODULE_MANIFEST) {
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    state.set(id, 'open');
    stack.push(id);
    for (const link of manifest[id]?.requires || []) {
      if (!link.id || !manifest[link.id]) continue;
      if (state.get(link.id) === 'open') return [...stack.slice(stack.indexOf(link.id)), link.id];
      if (!state.has(link.id)) {
        const found = visit(link.id);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const id of Object.keys(manifest)) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

/** Module ids so that every module comes after the modules it requires (stable: `order` breaks ties). */
export function dependencyOrder(ids, manifest = MODULE_MANIFEST, order = ids) {
  const wanted = new Set(ids);
  const done = new Set();
  const out = [];
  const place = (id, seen = new Set()) => {
    if (done.has(id) || seen.has(id)) return;
    seen.add(id);
    for (const link of manifest[id]?.requires || []) if (link.id && wanted.has(link.id)) place(link.id, seen);
    done.add(id);
    out.push(id);
  };
  for (const id of [...order].filter((id) => wanted.has(id))) place(id);
  for (const id of ids) place(id);
  return out;
}
