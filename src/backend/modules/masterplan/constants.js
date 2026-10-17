/*
 * Static facts of the Masterplan module (docs/masterplan.md): sales statuses,
 * module roles and what each role may do (capabilities), node kinds, the
 * seeded directories (object types, construction stages). No imports, no I/O.
 */

/** Sales statuses in process order (spec §6.1). `rank` orders forward moves. */
export const STATUSES = ['not_for_sale', 'free', 'reserve', 'booking', 'deposit', 'contract', 'sold', 'handed'];
export const STATUS_RANK = Object.fromEntries(STATUSES.map((key, index) => [key, index]));
/** Statuses that hold a unit for a client: the unit cannot be linked to another deal. */
export const HELD = new Set(['reserve', 'booking', 'deposit', 'contract', 'sold', 'handed']);
/** Statuses with a running timer (a row in mp_bookings). */
export const TIMED = new Set(['reserve', 'booking']);

export const DEFAULT_STATUS_COLORS = {
  not_for_sale: '#94A3B8',
  free: '#22C55E',
  reserve: '#EAB308',
  booking: '#F97316',
  deposit: '#8B5CF6',
  contract: '#3B82F6',
  sold: '#EF4444',
  handed: '#7F1D1D',
};

/** Node kinds of the hierarchy tree. */
export const NODE_KINDS = ['level', 'plot', 'object', 'unit'];
export const MAX_DEPTH = 8;

/** Level types offered for `kind = 'level'` nodes (a project keeps its own list, named when it is created). */
export const LEVEL_NAMES = [
  { key: 'queue', name: { ru: 'Очередь', en: 'Phase', ky: 'Кезек', tr: 'Etap', zh: '期' } },
  { key: 'sector', name: { ru: 'Сектор', en: 'Sector', ky: 'Сектор', tr: 'Sektör', zh: '区' } },
  { key: 'section', name: { ru: 'Секция', en: 'Section', ky: 'Секция', tr: 'Blok', zh: '单元' } },
  { key: 'line', name: { ru: 'Линия', en: 'Line', ky: 'Линия', tr: 'Sıra', zh: '排' } },
  { key: 'house', name: { ru: 'Дом', en: 'House', ky: 'Үй', tr: 'Bina', zh: '栋' } },
  { key: 'floor', name: { ru: 'Этаж', en: 'Floor', ky: 'Кабат', tr: 'Kat', zh: '层' } },
];
/** The stock list in a language (projects created before languages keep their stored Russian names). */
export const defaultLevels = (locale = 'ru') => LEVEL_NAMES.map(({ key, name }) => ({ key, name: name[locale] || name.en }));
export const DEFAULT_LEVELS = defaultLevels('ru');

export const FINISHINGS = ['pso', 'rough', 'whitebox', 'turnkey', 'furnished'];
export const PAYMENT_FORMS = ['full', 'installment', 'mortgage', 'barter'];
export const PROJECT_CLASSES = ['economy', 'comfort', 'business', 'premium'];
export const PROJECT_STATUSES = ['design', 'construction', 'sales', 'done'];
export const STAGE_STATES = ['not_started', 'in_progress', 'done', 'paused'];
export const REPORT_STATES = ['draft', 'review', 'published', 'rejected'];
export const MEDIA_KINDS = ['photo', 'video', 'render', 'layout', 'doc', 'plan'];

/*
 * Module roles (spec §8.2). A role comes from a portal permission
 * `masterplan.<role>` (everywhere) or from an assignment in a project, limited
 * to a node's subtree (zone of responsibility, mp_assignments).
 */
export const ROLES = ['admin', 'executive', 'sales_head', 'sales', 'finance', 'legal', 'construction_head', 'foreman', 'marketing'];
export const ROLE_PERMISSIONS = ROLES.map((role) => `masterplan.${role}`);

/*
 * Capabilities. Read capabilities (`*.view`, clients, amounts) count every
 * role the person has in a project; action capabilities count only the roles
 * whose zone contains the node acted on.
 *
 *   status.view       sales status and its colour
 *   price.view        list price, price per m², discount
 *   booking.view      who holds a unit and until when (manager, expiry)
 *   minprice.view     the minimum price
 *   clients.all|own   client and deal of every unit | of the person's own bookings
 *   amounts.all|own   contract amount, paid, remaining
 *   build.view        construction progress and published reports
 *   build.drafts      reports that are not published yet
 *   build.edit        stage progress, construction reports (own zone)
 *   build.moderate    publish / reject reports
 *   status.<to>       forward moves (§6.2)
 *   status.rollback   moving back with a reason
 *   status.not_for_sale / status.open   closing / opening sales
 *   booking.release_any|own, booking.extend_any|once
 *   price.edit (+ price.limited: a cut deeper than salesHeadMaxCutPct is refused)
 *   unit.edit         characteristics of units (areas, rooms…)
 *   media.edit        renders, layouts, documents; publish flag
 *   dashboard         the dashboard
 */
export const ROLE_CAPS = {
  admin: ['*'],
  executive: [
    'status.view', 'price.view', 'booking.view', 'minprice.view', 'clients.all', 'amounts.all', 'build.view', 'build.drafts',
    'status.not_for_sale', 'status.open', 'status.rollback', 'booking.release_any', 'booking.extend_any', 'price.edit', 'dashboard',
  ],
  sales_head: [
    'status.view', 'price.view', 'booking.view', 'minprice.view', 'clients.all', 'amounts.all', 'build.view',
    'status.reserve', 'status.booking', 'status.contract', 'status.rollback', 'booking.release_any', 'booking.extend_any',
    'price.edit', 'price.limited', 'unit.edit', 'dashboard',
  ],
  sales: ['status.view', 'price.view', 'booking.view', 'clients.own', 'amounts.own', 'build.view', 'status.reserve', 'status.booking', 'booking.release_own', 'booking.extend_once'],
  finance: ['status.view', 'price.view', 'booking.view', 'clients.all', 'amounts.all', 'build.view', 'status.deposit', 'status.sold', 'dashboard'],
  legal: ['status.view', 'price.view', 'booking.view', 'clients.all', 'amounts.all', 'build.view', 'status.contract', 'status.handed'],
  construction_head: ['status.view', 'build.view', 'build.drafts', 'build.edit', 'build.moderate', 'status.handed', 'dashboard'],
  foreman: ['build.view', 'build.edit'],
  marketing: ['status.view', 'price.view', 'build.view', 'media.edit', 'unit.edit'],
};

/** Forward moves of §6.2 and the capability each needs. */
export const FORWARD_MOVES = {
  'free>reserve': 'status.reserve',
  'reserve>booking': 'status.booking',
  'booking>deposit': 'status.deposit',
  'deposit>contract': 'status.contract',
  'contract>sold': 'status.sold',
  'sold>handed': 'status.handed',
  'not_for_sale>free': 'status.open',
};

// ── Seeded directories (spec §4.3, §7.1) ─────────────────────────────────────

export const TYPE_CATEGORIES = ['residential', 'land', 'commercial', 'admin', 'infra', 'aux'];
export const CATEGORY_COLORS = { residential: '#3B82F6', land: '#84CC16', commercial: '#F59E0B', admin: '#64748B', infra: '#94A3B8', aux: '#A855F7' };

const t = (key, name, category, nodeKind, sellable, stageSet, icon) => ({ key, name, category, nodeKind, sellable, stageSet, icon, color: CATEGORY_COLORS[category] });

export const DEFAULT_TYPES = [
  t('cottage', { ru: 'Коттедж', en: 'Cottage', ky: 'Коттедж', tr: 'Müstakil ev', zh: '别墅' }, 'residential', 'object', true, 'lowrise', 'house'),
  t('townhouse', { ru: 'Таунхаус (блок)', en: 'Townhouse (block)', ky: 'Таунхаус (блок)', tr: 'Sıra ev (blok)', zh: '联排别墅（单元）' }, 'residential', 'object', true, 'lowrise', 'townhouse'),
  t('duplex', { ru: 'Дуплекс', en: 'Duplex', ky: 'Дуплекс', tr: 'Dubleks', zh: '双拼别墅' }, 'residential', 'object', true, 'lowrise', 'townhouse'),
  t('villa', { ru: 'Вилла', en: 'Villa', ky: 'Вилла', tr: 'Villa', zh: '独栋别墅' }, 'residential', 'object', true, 'lowrise', 'villa'),
  t('apartment_building', { ru: 'Многоквартирный дом', en: 'Apartment building', ky: 'Көп батирлүү үй', tr: 'Apartman', zh: '住宅楼' }, 'residential', 'object', false, 'apartment', 'building'),
  t('apartment', { ru: 'Квартира', en: 'Flat', ky: 'Батир', tr: 'Daire', zh: '公寓' }, 'residential', 'unit', true, null, 'apartment'),
  t('penthouse', { ru: 'Пентхаус', en: 'Penthouse', ky: 'Пентхаус', tr: 'Çatı dairesi', zh: '顶层复式' }, 'residential', 'unit', true, null, 'apartment'),
  t('apartments', { ru: 'Апартаменты', en: 'Serviced apartment', ky: 'Апартаменттер', tr: 'Rezidans daire', zh: '酒店式公寓' }, 'residential', 'unit', true, null, 'apartment'),
  t('land_ijs', { ru: 'Участок без подряда (ИЖС)', en: 'Plot without construction', ky: 'Курулушсуз участок (ЖТК)', tr: 'Yapısız arsa', zh: '纯地块（不含建造）' }, 'land', 'plot', true, null, 'land'),
  t('land_project', { ru: 'Участок с проектом дома', en: 'Plot with a house design', ky: 'Үй долбоору бар участок', tr: 'Proje dahil arsa', zh: '带房屋设计的地块' }, 'land', 'plot', true, 'lowrise', 'land'),
  t('commercial', { ru: 'Коммерческое помещение', en: 'Commercial premises', ky: 'Коммерциялык жай', tr: 'Ticari alan', zh: '商业用房' }, 'commercial', 'unit', true, null, 'shop'),
  t('office', { ru: 'Офис', en: 'Office', ky: 'Кеңсе', tr: 'Ofis', zh: '办公室' }, 'commercial', 'unit', true, null, 'office'),
  t('restaurant', { ru: 'Ресторан / кафе', en: 'Restaurant / café', ky: 'Ресторан / кафе', tr: 'Restoran / kafe', zh: '餐厅 / 咖啡馆' }, 'commercial', 'object', true, 'lowrise', 'restaurant'),
  t('shop', { ru: 'Магазин', en: 'Shop', ky: 'Дүкөн', tr: 'Mağaza', zh: '商店' }, 'commercial', 'object', true, 'lowrise', 'shop'),
  t('fitness', { ru: 'Фитнес / SPA', en: 'Fitness / spa', ky: 'Фитнес / SPA', tr: 'Fitness / spa', zh: '健身 / SPA' }, 'commercial', 'object', true, 'lowrise', 'fitness'),
  t('admin_building', { ru: 'Административное здание', en: 'Administrative building', ky: 'Административдик имарат', tr: 'İdari bina', zh: '行政楼' }, 'admin', 'object', false, 'lowrise', 'admin'),
  t('sales_office', { ru: 'Офис продаж', en: 'Sales office', ky: 'Сатуу кеңсеси', tr: 'Satış ofisi', zh: '售楼处' }, 'admin', 'object', false, 'lowrise', 'office'),
  t('checkpoint', { ru: 'КПП и охрана', en: 'Gatehouse and security', ky: 'Өткөрмө пункту жана күзөт', tr: 'Giriş kontrol ve güvenlik', zh: '门岗与安保' }, 'admin', 'object', false, 'lowrise', 'gate'),
  t('management', { ru: 'Управляющая компания', en: 'Management company', ky: 'Башкаруучу компания', tr: 'Site yönetimi', zh: '物业公司' }, 'admin', 'object', false, 'lowrise', 'admin'),
  t('boiler', { ru: 'Котельная / ТП', en: 'Boiler house / substation', ky: 'Казанкана / ТП', tr: 'Kazan dairesi / trafo', zh: '锅炉房 / 变电站' }, 'admin', 'object', false, 'infra', 'boiler'),
  t('road', { ru: 'Дороги', en: 'Roads', ky: 'Жолдор', tr: 'Yollar', zh: '道路' }, 'infra', 'object', false, 'infra', 'road'),
  t('utilities', { ru: 'Сети (вода, канализация, электричество, газ)', en: 'Utilities (water, sewage, power, gas)', ky: 'Тармактар (суу, канализация, электр, газ)', tr: 'Altyapı (su, kanalizasyon, elektrik, gaz)', zh: '管网（给水、排水、电力、燃气）' }, 'infra', 'object', false, 'infra', 'network'),
  t('playground', { ru: 'Детская / спортивная площадка', en: 'Playground / sports ground', ky: 'Балдар / спорт аянтчасы', tr: 'Çocuk / spor alanı', zh: '儿童 / 运动场' }, 'infra', 'object', false, 'infra', 'playground'),
  t('park', { ru: 'Парк', en: 'Park', ky: 'Сейил бак', tr: 'Park', zh: '公园' }, 'infra', 'object', false, 'infra', 'park'),
  t('pond', { ru: 'Водоём', en: 'Pond', ky: 'Көлмө', tr: 'Gölet', zh: '水景' }, 'infra', 'object', false, 'infra', 'water'),
  t('parking', { ru: 'Паркинг', en: 'Parking', ky: 'Унаа токтотмо', tr: 'Otopark', zh: '停车场' }, 'infra', 'object', false, 'infra', 'parking'),
  t('parking_space', { ru: 'Машиноместо', en: 'Parking space', ky: 'Унаа орду', tr: 'Otopark yeri', zh: '车位' }, 'aux', 'unit', true, null, 'car'),
  t('storage', { ru: 'Кладовая', en: 'Storage room', ky: 'Кампа бөлмө', tr: 'Depo', zh: '储藏室' }, 'aux', 'unit', true, null, 'storage'),
  t('guest_house', { ru: 'Гостевой дом', en: 'Guest house', ky: 'Конок үй', tr: 'Misafir evi', zh: '客房' }, 'aux', 'object', true, 'lowrise', 'house'),
];

export const STAGE_SETS = ['lowrise', 'apartment', 'infra'];

export const DEFAULT_STAGES = {
  lowrise: [
    [{ ru: 'Проектирование и разрешения', en: 'Design and permits', ky: 'Долбоорлоо жана уруксаттар', tr: 'Proje ve izinler', zh: '设计与许可' }, 3],
    [{ ru: 'Подготовка участка', en: 'Site preparation', ky: 'Участокту даярдоо', tr: 'Arsa hazırlığı', zh: '场地准备' }, 3],
    [{ ru: 'Котлован / земляные работы', en: 'Excavation / earthworks', ky: 'Казаң / жер иштери', tr: 'Kazı / hafriyat', zh: '基坑 / 土方工程' }, 4],
    [{ ru: 'Фундамент', en: 'Foundation', ky: 'Пайдубал', tr: 'Temel', zh: '基础' }, 10],
    [{ ru: 'Стены / коробка', en: 'Walls / shell', ky: 'Дубалдар / коробка', tr: 'Duvarlar / kaba yapı', zh: '墙体 / 主体' }, 15],
    [{ ru: 'Перекрытия и кровля', en: 'Slabs and roof', ky: 'Жабуулар жана чатыр', tr: 'Döşemeler ve çatı', zh: '楼板与屋面' }, 12],
    [{ ru: 'Окна и входные двери (закрытый контур)', en: 'Windows and entrance doors (closed shell)', ky: 'Терезелер жана кире бериш эшиктер (жабык контур)', tr: 'Pencereler ve giriş kapıları (kapalı kaba)', zh: '门窗安装（外围封闭）' }, 6],
    [{ ru: 'Инженерные сети', en: 'Building services', ky: 'Инженердик тармактар', tr: 'Tesisat', zh: '机电管线' }, 10],
    [{ ru: 'Фасад', en: 'Facade', ky: 'Фасад', tr: 'Cephe', zh: '外立面' }, 7],
    [{ ru: 'Внутренние работы (черновая отделка)', en: 'Interior works (rough finish)', ky: 'Ички иштер (кара жасалга)', tr: 'İç işler (kaba sıva)', zh: '室内工程（毛坯）' }, 10],
    [{ ru: 'Завершено под ПСО', en: 'Ready for finishing', ky: 'Жасалгага даяр', tr: 'İnce işe hazır', zh: '毛坯交付完成' }, 5],
    [{ ru: 'Чистовая отделка', en: 'Fine finishing', ky: 'Таза жасалга', tr: 'İnce işler', zh: '精装修' }, 8],
    [{ ru: 'Благоустройство участка', en: 'Plot landscaping', ky: 'Участокту абаттандыруу', tr: 'Arsa peyzajı', zh: '地块景观' }, 4],
    [{ ru: 'Приёмка и ввод в эксплуатацию', en: 'Acceptance and commissioning', ky: 'Кабыл алуу жана пайдаланууга берүү', tr: 'Kabul ve iskân', zh: '验收与投入使用' }, 2],
    [{ ru: 'Передача клиенту', en: 'Handover to the client', ky: 'Кардарга өткөрүп берүү', tr: 'Müşteriye teslim', zh: '交付客户' }, 1],
  ],
  apartment: [
    [{ ru: 'Проектирование и разрешения', en: 'Design and permits', ky: 'Долбоорлоо жана уруксаттар', tr: 'Proje ve izinler', zh: '设计与许可' }, 3],
    [{ ru: 'Подготовка участка', en: 'Site preparation', ky: 'Участокту даярдоо', tr: 'Arsa hazırlığı', zh: '场地准备' }, 2],
    [{ ru: 'Котлован', en: 'Excavation', ky: 'Казаң', tr: 'Kazı', zh: '基坑' }, 5],
    [{ ru: 'Фундамент', en: 'Foundation', ky: 'Пайдубал', tr: 'Temel', zh: '基础' }, 8],
    [{ ru: 'Монолитный каркас', en: 'Concrete frame', ky: 'Монолиттик каркас', tr: 'Betonarme karkas', zh: '现浇主体结构' }, 22],
    [{ ru: 'Стены и перегородки', en: 'Walls and partitions', ky: 'Дубалдар жана тосмолор', tr: 'Duvarlar ve bölmeler', zh: '墙体与隔墙' }, 8],
    [{ ru: 'Кровля', en: 'Roof', ky: 'Чатыр', tr: 'Çatı', zh: '屋面' }, 4],
    [{ ru: 'Окна (закрытый контур)', en: 'Windows (closed shell)', ky: 'Терезелер (жабык контур)', tr: 'Pencereler (kapalı kaba)', zh: '窗户（外围封闭）' }, 6],
    [{ ru: 'Инженерные сети', en: 'Building services', ky: 'Инженердик тармактар', tr: 'Tesisat', zh: '机电管线' }, 10],
    [{ ru: 'Лифты', en: 'Lifts', ky: 'Лифттер', tr: 'Asansörler', zh: '电梯' }, 4],
    [{ ru: 'Фасад', en: 'Facade', ky: 'Фасад', tr: 'Cephe', zh: '外立面' }, 7],
    [{ ru: 'Внутренние работы', en: 'Interior works', ky: 'Ички иштер', tr: 'İç işler', zh: '室内工程' }, 9],
    [{ ru: 'Места общего пользования', en: 'Common areas', ky: 'Жалпы пайдалануучу жайлар', tr: 'Ortak alanlar', zh: '公共区域' }, 4],
    [{ ru: 'Благоустройство', en: 'Landscaping', ky: 'Абаттандыруу', tr: 'Çevre düzenlemesi', zh: '景观工程' }, 4],
    [{ ru: 'Приёмка и ввод в эксплуатацию', en: 'Acceptance and commissioning', ky: 'Кабыл алуу жана пайдаланууга берүү', tr: 'Kabul ve iskân', zh: '验收与投入使用' }, 3],
    [{ ru: 'Передача клиентам', en: 'Handover to clients', ky: 'Кардарларга өткөрүп берүү', tr: 'Müşterilere teslim', zh: '交付客户' }, 1],
  ],
  infra: [
    [{ ru: 'Проект', en: 'Design', ky: 'Долбоор', tr: 'Proje', zh: '设计' }, 10],
    [{ ru: 'Подготовка', en: 'Preparation', ky: 'Даярдоо', tr: 'Hazırlık', zh: '准备' }, 15],
    [{ ru: 'Прокладка / строительство', en: 'Laying / construction', ky: 'Төшөө / куруу', tr: 'Döşeme / inşa', zh: '敷设 / 施工' }, 55],
    [{ ru: 'Испытания', en: 'Testing', ky: 'Сыноо', tr: 'Testler', zh: '测试' }, 15],
    [{ ru: 'Ввод', en: 'Commissioning', ky: 'Пайдаланууга берүү', tr: 'Devreye alma', zh: '投入使用' }, 5],
  ],
};
