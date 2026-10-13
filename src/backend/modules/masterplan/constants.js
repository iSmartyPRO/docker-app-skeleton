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

/** Level types offered for `kind = 'level'` nodes (a project keeps its own list). */
export const DEFAULT_LEVELS = [
  { key: 'queue', name: 'Очередь' },
  { key: 'sector', name: 'Сектор' },
  { key: 'section', name: 'Секция' },
  { key: 'line', name: 'Линия' },
  { key: 'house', name: 'Дом' },
  { key: 'floor', name: 'Этаж' },
];

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
  t('cottage', 'Коттедж', 'residential', 'object', true, 'lowrise', 'house'),
  t('townhouse', 'Таунхаус (блок)', 'residential', 'object', true, 'lowrise', 'townhouse'),
  t('duplex', 'Дуплекс', 'residential', 'object', true, 'lowrise', 'townhouse'),
  t('villa', 'Вилла', 'residential', 'object', true, 'lowrise', 'villa'),
  t('apartment_building', 'Многоквартирный дом', 'residential', 'object', false, 'apartment', 'building'),
  t('apartment', 'Квартира', 'residential', 'unit', true, null, 'apartment'),
  t('penthouse', 'Пентхаус', 'residential', 'unit', true, null, 'apartment'),
  t('apartments', 'Апартаменты', 'residential', 'unit', true, null, 'apartment'),
  t('land_ijs', 'Участок без подряда (ИЖС)', 'land', 'plot', true, null, 'land'),
  t('land_project', 'Участок с проектом дома', 'land', 'plot', true, 'lowrise', 'land'),
  t('commercial', 'Коммерческое помещение', 'commercial', 'unit', true, null, 'shop'),
  t('office', 'Офис', 'commercial', 'unit', true, null, 'office'),
  t('restaurant', 'Ресторан / кафе', 'commercial', 'object', true, 'lowrise', 'restaurant'),
  t('shop', 'Магазин', 'commercial', 'object', true, 'lowrise', 'shop'),
  t('fitness', 'Фитнес / SPA', 'commercial', 'object', true, 'lowrise', 'fitness'),
  t('admin_building', 'Административное здание', 'admin', 'object', false, 'lowrise', 'admin'),
  t('sales_office', 'Офис продаж', 'admin', 'object', false, 'lowrise', 'office'),
  t('checkpoint', 'КПП и охрана', 'admin', 'object', false, 'lowrise', 'gate'),
  t('management', 'Управляющая компания', 'admin', 'object', false, 'lowrise', 'admin'),
  t('boiler', 'Котельная / ТП', 'admin', 'object', false, 'infra', 'boiler'),
  t('road', 'Дороги', 'infra', 'object', false, 'infra', 'road'),
  t('utilities', 'Сети (вода, канализация, электричество, газ)', 'infra', 'object', false, 'infra', 'network'),
  t('playground', 'Детская / спортивная площадка', 'infra', 'object', false, 'infra', 'playground'),
  t('park', 'Парк', 'infra', 'object', false, 'infra', 'park'),
  t('pond', 'Водоём', 'infra', 'object', false, 'infra', 'water'),
  t('parking', 'Паркинг', 'infra', 'object', false, 'infra', 'parking'),
  t('parking_space', 'Машиноместо', 'aux', 'unit', true, null, 'car'),
  t('storage', 'Кладовая', 'aux', 'unit', true, null, 'storage'),
  t('guest_house', 'Гостевой дом', 'aux', 'object', true, 'lowrise', 'house'),
];

export const STAGE_SETS = ['lowrise', 'apartment', 'infra'];

export const DEFAULT_STAGES = {
  lowrise: [
    ['Проектирование и разрешения', 3],
    ['Подготовка участка', 3],
    ['Котлован / земляные работы', 4],
    ['Фундамент', 10],
    ['Стены / коробка', 15],
    ['Перекрытия и кровля', 12],
    ['Окна и входные двери (закрытый контур)', 6],
    ['Инженерные сети', 10],
    ['Фасад', 7],
    ['Внутренние работы (черновая отделка)', 10],
    ['Завершено под ПСО', 5],
    ['Чистовая отделка', 8],
    ['Благоустройство участка', 4],
    ['Приёмка и ввод в эксплуатацию', 2],
    ['Передача клиенту', 1],
  ],
  apartment: [
    ['Проектирование и разрешения', 3],
    ['Подготовка участка', 2],
    ['Котлован', 5],
    ['Фундамент', 8],
    ['Монолитный каркас', 22],
    ['Стены и перегородки', 8],
    ['Кровля', 4],
    ['Окна (закрытый контур)', 6],
    ['Инженерные сети', 10],
    ['Лифты', 4],
    ['Фасад', 7],
    ['Внутренние работы', 9],
    ['Места общего пользования', 4],
    ['Благоустройство', 4],
    ['Приёмка и ввод в эксплуатацию', 3],
    ['Передача клиентам', 1],
  ],
  infra: [
    ['Проект', 10],
    ['Подготовка', 15],
    ['Прокладка / строительство', 55],
    ['Испытания', 15],
    ['Ввод', 5],
  ],
};
