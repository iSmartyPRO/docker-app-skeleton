/**
 * Static facts about every module: permissions, default system settings and a
 * pure sanitizer for them. No imports — core services read this without
 * loading module code (and without import cycles).
 */

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** File type groups an administrator can allow in the knowledge base. */
export const KB_FILE_GROUPS = {
  images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'],
  pdf: ['pdf'],
  office: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'csv'],
  text: ['txt', 'md', 'json', 'xml', 'log'],
  media: ['mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a'],
  archives: ['zip', '7z', 'rar'],
};

const HEX = /^#[0-9a-f]{6}$/i;

// Characters of the robot assistant (modules/assistant/service.js keeps the same list).
const ASSISTANT_AVATARS = ['pixel', 'orbi', 'kiko', 'classic', 'pro', 'boltik', 'nexus', 'bubbles', 'builder', 'builder2', 'architect', 'doctor', 'girl', 'boy', 'toddler', 'zayka', 'ermek', 'aichurok', 'berkut', 'jibek', 'volt', 'nova', 'shadow', 'aurora', 'barsik', 'ryzhik', 'bao', 'pingo'];

// ── CRM settings (docs/crm.md) ──────────────────────────────────────────────

export const CRM_FIELD_TYPES = ['text', 'textarea', 'number', 'money', 'date', 'select', 'multiselect', 'bool', 'url', 'user'];
// Built-in deal fields: custom field keys may not take these names; their section can be moved (builtinSections).
export const CRM_BUILTIN_FIELDS = ['title', 'amount', 'client', 'owner', 'source', 'close_date', 'comment', 'watchers'];
const CRM_RESERVED_KEYS = new Set([...CRM_BUILTIN_FIELDS, 'id', 'currency', 'company', 'person', 'stage', 'pipeline', 'closedate', 'custom', 'version', 'rank']);

/*
 * Stock lists of a new portal, per language. Deals store the source / reason text itself, so these
 * lists are never relabelled once a portal has them: setup stores them in the portal language
 * (services/setup.js → localizeCrmStockLists, only while there are no deals) and an upgrade stores
 * the Russian lists older versions always showed (services/settings.js → migrateCrmStockLists).
 * Only the section titles (not stored in deals) follow the portal language while unsaved
 * (resolveModules → localizedDefaults).
 */
const CRM_STOCK = {
  sources: [
    { ru: 'Сайт', en: 'Website', ky: 'Сайт', tr: 'Web sitesi', zh: '网站' },
    { ru: 'Звонок', en: 'Phone call', ky: 'Чалуу', tr: 'Telefon', zh: '来电' },
    { ru: 'Рекомендация', en: 'Referral', ky: 'Сунуштама', tr: 'Tavsiye', zh: '推荐' },
    { ru: 'WhatsApp', en: 'WhatsApp', ky: 'WhatsApp', tr: 'WhatsApp', zh: 'WhatsApp' },
    { ru: 'Instagram', en: 'Instagram', ky: 'Instagram', tr: 'Instagram', zh: 'Instagram' },
    { ru: 'Выставка', en: 'Exhibition', ky: 'Көргөзмө', tr: 'Fuar', zh: '展会' },
    { ru: 'Другое', en: 'Other', ky: 'Башка', tr: 'Diğer', zh: '其他' },
  ],
  lostReasons: [
    { ru: 'Дорого', en: 'Too expensive', ky: 'Кымбат', tr: 'Pahalı', zh: '价格太高' },
    { ru: 'Выбрали конкурента', en: 'Chose a competitor', ky: 'Атаандашты тандашты', tr: 'Rakibi seçti', zh: '选择了竞争对手' },
    { ru: 'Нет бюджета', en: 'No budget', ky: 'Бюджет жок', tr: 'Bütçe yok', zh: '没有预算' },
    { ru: 'Не актуально', en: 'No longer relevant', ky: 'Актуалдуу эмес', tr: 'Artık ilgilenmiyor', zh: '需求已取消' },
    { ru: 'Не дозвонились', en: 'Could not reach', ky: 'Байланышуу мүмкүн болгон жок', tr: 'Ulaşılamadı', zh: '无法联系' },
  ],
  sections: {
    about: { ru: 'О сделке', en: 'About the deal', ky: 'Бүтүм жөнүндө', tr: 'Fırsat hakkında', zh: '交易信息' },
    extra: { ru: 'Дополнительно', en: 'More', ky: 'Кошумча', tr: 'Ek bilgiler', zh: '更多' },
  },
};
const stockText = (value, locale) => value[locale] || value.en;
/** The stock entries with their texts in every language (demo data writes them in the portal language). */
export const CRM_STOCK_LISTS = CRM_STOCK;

export const CRM_DEFAULTS = {
  // Default currency of new deals (one of `currencies`).
  currency: 'KGS',
  currencies: ['KGS', 'USD', 'EUR', 'RUB', 'KZT', 'CNY'],
  // 'all': everyone sees every deal; 'own': deals they own, watch or created (crm.all / crm.admin see all).
  visibility: 'all',
  sources: CRM_STOCK.sources.map((item) => item.ru),
  lostReasons: CRM_STOCK.lostReasons.map((item) => item.ru),
  sections: [
    { key: 'about', title: CRM_STOCK.sections.about.ru },
    { key: 'extra', title: CRM_STOCK.sections.extra.ru },
  ],
  // Custom fields: { key, label, type, options, section, listColumn, required }; values live in crm_deals.custom[key].
  fields: [],
  // Section of a built-in field when moved out of 'about': { source: 'extra' }.
  builtinSections: {},
  activityReminders: true,
};

/** The stock sources and lost reasons in a language: what setup stores for a brand-new portal. */
export function crmStockLists(locale) {
  return {
    sources: CRM_STOCK.sources.map((item) => stockText(item, locale || 'ru')),
    lostReasons: CRM_STOCK.lostReasons.map((item) => stockText(item, locale || 'ru')),
  };
}

/** Unsaved CRM settings in the portal language: only the section titles change, never data-bearing lists. */
export function crmLocalizedDefaults(locale) {
  if (!locale || locale === 'ru') return CRM_DEFAULTS;
  return { ...CRM_DEFAULTS, sections: Object.entries(CRM_STOCK.sections).map(([key, title]) => ({ key, title: stockText(title, locale) })) };
}

/** CRM_DEFAULTS with the stock lists in a language (Russian: CRM_DEFAULTS itself). */
export function crmDefaults(locale) {
  if (!locale || locale === 'ru') return CRM_DEFAULTS;
  return {
    ...CRM_DEFAULTS,
    sources: CRM_STOCK.sources.map((item) => stockText(item, locale)),
    lostReasons: CRM_STOCK.lostReasons.map((item) => stockText(item, locale)),
    sections: Object.entries(CRM_STOCK.sections).map(([key, title]) => ({ key, title: stockText(title, locale) })),
  };
}

const crmText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const crmHash = (label) => {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return hash.toString(36);
};
const crmList = (list, max, size) => [...new Set((Array.isArray(list) ? list : []).map((item) => crmText(item, size)).filter(Boolean))].slice(0, max);

/** A latin key from the given one, the label ("Region" → region), or f_<base36> for other scripts. */
export function crmFieldKey(item, prefix = 'f') {
  const own = String(item?.key ?? '').trim().toLowerCase();
  if (/^[a-z][a-z0-9_]{0,39}$/.test(own)) return own;
  const label = crmText(item?.label ?? item?.title, 60);
  if (!label) return '';
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (/^[a-z][a-z0-9_]*$/.test(slug) && /^[\x20-\x7e]+$/.test(label)) return slug;
  return `${prefix}_${crmHash(label)}`;
}

export function sanitizeCrm(current, incoming = {}) {
  const next = { ...current };
  if (Array.isArray(incoming.currencies)) {
    const list = [...new Set(incoming.currencies.map((code) => String(code || '').trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code)))].slice(0, 20);
    if (list.length) next.currencies = list;
  }
  if (typeof incoming.currency === 'string' && /^[A-Z]{3}$/.test(incoming.currency.trim().toUpperCase())) next.currency = incoming.currency.trim().toUpperCase();
  if (!next.currencies?.includes(next.currency)) next.currency = next.currencies?.[0] || 'KGS';
  if (['all', 'own'].includes(incoming.visibility)) next.visibility = incoming.visibility;
  if (Array.isArray(incoming.sources)) next.sources = crmList(incoming.sources, 50, 80);
  if (Array.isArray(incoming.lostReasons)) next.lostReasons = crmList(incoming.lostReasons, 50, 120);
  if (typeof incoming.activityReminders === 'boolean') next.activityReminders = incoming.activityReminders;

  if (Array.isArray(incoming.sections)) {
    const seen = new Set();
    const sections = incoming.sections
      .map((item) => ({ key: crmFieldKey(item, 's'), title: crmText(item?.title ?? item?.label, 60) }))
      .filter((item) => item.key && item.title && !seen.has(item.key) && seen.add(item.key))
      .slice(0, 12);
    // Built-in fields live in 'about' unless moved: it always exists.
    if (!sections.some((item) => item.key === 'about')) sections.unshift({ key: 'about', title: current.sections?.find((item) => item.key === 'about')?.title || CRM_STOCK.sections.about.ru });
    next.sections = sections.slice(0, 12);
  }
  const sectionKeys = new Set((next.sections || []).map((item) => item.key));

  if (Array.isArray(incoming.fields)) {
    const seen = new Set();
    next.fields = incoming.fields
      .map((item) => {
        const type = CRM_FIELD_TYPES.includes(item?.type) ? item.type : 'text';
        const field = {
          key: crmFieldKey(item, 'f'),
          label: crmText(item?.label, 60),
          type,
          options: ['select', 'multiselect'].includes(type) ? crmList(item?.options, 100, 80) : [],
          section: sectionKeys.has(item?.section) ? item.section : 'about',
          listColumn: item?.listColumn === true,
          required: item?.required === true,
        };
        return field;
      })
      .filter((item) => item.key && item.label && !CRM_RESERVED_KEYS.has(item.key) && !seen.has(item.key) && seen.add(item.key))
      .slice(0, 80);
  } else if (Array.isArray(incoming.sections)) {
    // Sections changed alone: fields of a removed section fall back to 'about'.
    next.fields = (next.fields || []).map((field) => (sectionKeys.has(field.section) ? field : { ...field, section: 'about' }));
  }

  if (incoming.builtinSections && typeof incoming.builtinSections === 'object' && !Array.isArray(incoming.builtinSections)) {
    next.builtinSections = Object.fromEntries(
      CRM_BUILTIN_FIELDS.filter((key) => sectionKeys.has(incoming.builtinSections[key]) && incoming.builtinSections[key] !== 'about').map((key) => [key, incoming.builtinSections[key]])
    );
  } else if (Array.isArray(incoming.sections)) {
    next.builtinSections = Object.fromEntries(Object.entries(next.builtinSections || {}).filter(([, section]) => sectionKeys.has(section)));
  }
  return next;
}

// ── Masterplan settings (docs/masterplan.md) ────────────────────────────────

export const MASTERPLAN_STATUSES = ['not_for_sale', 'free', 'reserve', 'booking', 'deposit', 'contract', 'sold', 'handed'];
// What a CRM deal stage may do to its linked units (settings.stageMap).
export const MASTERPLAN_STAGE_ACTIONS = ['booking', 'deposit', 'contract', 'sold', 'free'];

export const MASTERPLAN_DEFAULTS = {
  // Base currency (prices are kept in each unit's own currency; rates convert for totals).
  currency: 'USD',
  currencies: ['USD', 'KGS', 'RUB'],
  // Units of a currency per 1 of the base currency, e.g. { KGS: 87.5 }.
  rates: { KGS: 87.5, RUB: 81 },
  statusColors: {
    not_for_sale: '#94A3B8',
    free: '#22C55E',
    reserve: '#EAB308',
    booking: '#F97316',
    deposit: '#8B5CF6',
    contract: '#3B82F6',
    sold: '#EF4444',
    handed: '#7F1D1D',
  },
  // Booking rules (§6.1–6.2): reserve length, booking length, extensions a manager may do, active reserves per manager.
  reserveHours: 48,
  bookingDays: 10,
  managerExtensions: 1,
  reserveLimit: 5,
  // Reminders to the manager before a timer ends, hours.
  warnHours: [24, 2],
  // Reserve → Booking needs a CRM deal with a client (when the CRM is on).
  requireDeal: true,
  // Bulk price changes skip units already held for a client.
  fixPriceOnBooking: true,
  // A head of sales may lower a price by at most this % at once (0 = no limit); management is not limited.
  salesHeadMaxCutPct: 10,
  // Construction: an object without a published report for N days is "stale"; a delay over N days is red.
  staleReportDays: 14,
  delayAlertDays: 7,
  // CRM deal stage id → what happens to the deal's units: { "12": "deposit", "15": "free" }.
  stageMap: {},
  // Writes the unit's price into the deal amount when a unit is booked for it.
  syncDealAmount: true,
  maxUploadMb: 50,
};

export function sanitizeMasterplan(current, incoming = {}) {
  const next = { ...current };
  const code = (value) => String(value || '').trim().toUpperCase();
  if (Array.isArray(incoming.currencies)) {
    const list = [...new Set(incoming.currencies.map(code).filter((item) => /^[A-Z]{3}$/.test(item)))].slice(0, 12);
    if (list.length) next.currencies = list;
  }
  if (/^[A-Z]{3}$/.test(code(incoming.currency))) next.currency = code(incoming.currency);
  if (!next.currencies.includes(next.currency)) next.currency = next.currencies[0];
  if (incoming.rates && typeof incoming.rates === 'object' && !Array.isArray(incoming.rates)) {
    next.rates = Object.fromEntries(
      Object.entries(incoming.rates)
        .map(([key, value]) => [code(key), Number(value)])
        .filter(([key, value]) => /^[A-Z]{3}$/.test(key) && key !== next.currency && Number.isFinite(value) && value > 0 && value < 1e9)
        .slice(0, 12)
    );
  }
  if (incoming.statusColors && typeof incoming.statusColors === 'object') {
    next.statusColors = { ...current.statusColors };
    for (const key of MASTERPLAN_STATUSES) {
      if (HEX.test(incoming.statusColors[key] || '')) next.statusColors[key] = incoming.statusColors[key].toUpperCase();
    }
  }
  if (incoming.reserveHours !== undefined) next.reserveHours = clampInt(incoming.reserveHours, 1, 24 * 14, 48);
  if (incoming.bookingDays !== undefined) next.bookingDays = clampInt(incoming.bookingDays, 1, 120, 10);
  if (incoming.managerExtensions !== undefined) next.managerExtensions = clampInt(incoming.managerExtensions, 0, 10, 1);
  if (incoming.reserveLimit !== undefined) next.reserveLimit = clampInt(incoming.reserveLimit, 0, 1000, 5);
  if (Array.isArray(incoming.warnHours)) {
    next.warnHours = [...new Set(incoming.warnHours.map(Number).filter((value) => Number.isFinite(value) && value >= 1).map((value) => clampInt(value, 1, 24 * 14, 24)))].sort((a, b) => b - a).slice(0, 4);
  }
  for (const flag of ['requireDeal', 'fixPriceOnBooking', 'syncDealAmount']) {
    if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
  }
  if (incoming.salesHeadMaxCutPct !== undefined) next.salesHeadMaxCutPct = clampInt(incoming.salesHeadMaxCutPct, 0, 100, 10);
  if (incoming.staleReportDays !== undefined) next.staleReportDays = clampInt(incoming.staleReportDays, 1, 365, 14);
  if (incoming.delayAlertDays !== undefined) next.delayAlertDays = clampInt(incoming.delayAlertDays, 0, 365, 7);
  if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 500, 50);
  if (incoming.stageMap && typeof incoming.stageMap === 'object' && !Array.isArray(incoming.stageMap)) {
    next.stageMap = Object.fromEntries(
      Object.entries(incoming.stageMap)
        .filter(([key, value]) => /^\d{1,9}$/.test(key) && MASTERPLAN_STAGE_ACTIONS.includes(value))
        .slice(0, 500)
    );
  }
  return next;
}

// ── Approvals settings (docs/approvals.md) ──────────────────────────────────

/** Stock urgency levels: reaction time of a stage per level (spec: Критично 4 ч · Срочно 24 ч · Обычно 72 ч). */
export const APPROVAL_DEFAULT_URGENCIES = [
  { key: 'critical', label: '', color: '#E5484D', hours: 4, icon: 'flame' },
  { key: 'urgent', label: '', color: '#F59E0B', hours: 24, icon: 'bolt' },
  { key: 'normal', label: '', color: '#3B82F6', hours: 72, icon: 'clock' },
];
export const APPROVAL_URGENCY_ICONS = ['flame', 'bolt', 'clock', 'alert', 'flag', 'hourglass', 'star', 'leaf'];

export const APPROVALS_DEFAULTS = {
  // Ordered from the most urgent; empty `label` = the translated stock name.
  urgencies: APPROVAL_DEFAULT_URGENCIES,
  defaultUrgency: 'normal',
  // A deadline closer than this many hours is shown in yellow.
  soonHours: 24,
  // Share of the reaction time after which approvers get a reminder (75 = the last quarter is left).
  reminderPercent: 75,
  // Notify the escalation people when a stage is overdue.
  escalation: true,
};

const approvalText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export function sanitizeApprovalUrgencies(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, 8)) {
    if (!raw || typeof raw !== 'object') continue;
    let key = String(raw.key || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(key)) key = `u${out.length + 1}`;
    if (seen.has(key)) continue;
    const stock = APPROVAL_DEFAULT_URGENCIES.find((level) => level.key === key);
    const label = approvalText(raw.label, 40);
    // Custom levels need a name; stock ones fall back to the translation.
    if (!label && !stock) continue;
    seen.add(key);
    out.push({
      key,
      label,
      color: typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color.toUpperCase() : stock?.color || '#64748B',
      hours: clampInt(raw.hours, 1, 24 * 90, stock?.hours || 72),
      icon: APPROVAL_URGENCY_ICONS.includes(raw.icon) ? raw.icon : stock?.icon || 'clock',
    });
  }
  return out.length ? out : null;
}

export function sanitizeApprovals(current, incoming = {}) {
  const next = { ...current };
  const urgencies = sanitizeApprovalUrgencies(incoming.urgencies);
  if (urgencies) next.urgencies = urgencies;
  if (typeof incoming.defaultUrgency === 'string') next.defaultUrgency = incoming.defaultUrgency;
  if (!next.urgencies?.some((level) => level.key === next.defaultUrgency)) next.defaultUrgency = next.urgencies?.[next.urgencies.length - 1]?.key || 'normal';
  if (incoming.soonHours !== undefined) next.soonHours = clampInt(incoming.soonHours, 1, 24 * 14, 24);
  if (incoming.reminderPercent !== undefined) next.reminderPercent = clampInt(incoming.reminderPercent, 10, 95, 75);
  if (typeof incoming.escalation === 'boolean') next.escalation = incoming.escalation;
  return next;
}

// ── Procurement settings (docs/procurement.md) ───────────────────────────────

const PROCUREMENT_CATEGORY_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#64748B'];

export const PROCUREMENT_DEFAULTS = {
  // Directory of request categories: stable keys (route conditions test them), names, colours.
  categories: [
    { key: 'equipment', name: 'Оборудование', color: '#3B82F6' },
    { key: 'materials', name: 'Материалы', color: '#10B981' },
    { key: 'services', name: 'Услуги', color: '#8B5CF6' },
    { key: 'it', name: 'IT и связь', color: '#0EA5E9' },
    { key: 'office', name: 'Канцелярия и хозтовары', color: '#F59E0B' },
    { key: 'transport', name: 'Транспорт', color: '#EC4899' },
    { key: 'other', name: 'Прочее', color: '#64748B' },
  ],
  currencies: ['USD', 'KGS', 'RUB'],
  currency: 'USD',
  // Request numbers: «ЗК-0001».
  numberPrefix: 'ЗК',
  numberDigits: 4,
  // An invoice must be attached before a request goes to approval.
  invoiceRequired: true,
  // Everyone signed in may file requests (off: only holders of procurement.create).
  anyoneCanCreate: true,
  // People see the requests of colleagues from their groups (besides their own).
  groupVisibility: true,
  // «Pay by» / «deliver by» reminders this many days before the date (0 = on the day); overdue on the day after.
  reminderDays: 1,
  // Units offered in line items (free text is allowed too).
  units: ['шт', 'кг', 'м', 'м²', 'м³', 'л', 'компл', 'усл', 'ч'],
};

const procText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export function sanitizeProcurement(current, incoming = {}) {
  const next = { ...current };
  if (Array.isArray(incoming.categories)) {
    const seen = new Set();
    const list = [];
    for (const raw of incoming.categories.slice(0, 60)) {
      const name = procText(raw?.name, 60);
      if (!name) continue;
      let key = String(raw?.key || '').trim().toLowerCase();
      if (!/^[a-z][a-z0-9_]{0,31}$/.test(key) || seen.has(key)) {
        let n = list.length + 1;
        while (seen.has(`c${n}`)) n += 1;
        key = `c${n}`;
      }
      seen.add(key);
      list.push({ key, name, color: typeof raw?.color === 'string' && HEX.test(raw.color) ? raw.color.toUpperCase() : PROCUREMENT_CATEGORY_COLORS[list.length % PROCUREMENT_CATEGORY_COLORS.length], ...(raw?.archived === true ? { archived: true } : {}) });
    }
    next.categories = list;
  }
  if (Array.isArray(incoming.currencies)) {
    const list = [...new Set(incoming.currencies.map((code) => String(code || '').trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code)))].slice(0, 20);
    if (list.length) next.currencies = list;
  }
  if (typeof incoming.currency === 'string' && /^[A-Z]{3}$/.test(incoming.currency.trim().toUpperCase())) next.currency = incoming.currency.trim().toUpperCase();
  if (!next.currencies?.includes(next.currency)) next.currency = next.currencies?.[0] || 'USD';
  if (typeof incoming.numberPrefix === 'string') {
    const prefix = incoming.numberPrefix.replace(/[^\p{L}\p{N}_./-]/gu, '').slice(0, 10);
    if (prefix) next.numberPrefix = prefix;
  }
  if (incoming.numberDigits !== undefined) next.numberDigits = clampInt(incoming.numberDigits, 1, 8, 4);
  for (const flag of ['invoiceRequired', 'anyoneCanCreate', 'groupVisibility']) {
    if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
  }
  if (incoming.reminderDays !== undefined) next.reminderDays = clampInt(incoming.reminderDays, 0, 30, 1);
  if (Array.isArray(incoming.units)) next.units = [...new Set(incoming.units.map((unit) => procText(unit, 16)).filter(Boolean))].slice(0, 40);
  return next;
}

// ── Contracts settings (docs/contracts.md) ──────────────────────────────────

/** Stock contract types; an empty label means the translated stock name. */
export const CONTRACT_STOCK_TYPES = ['supply', 'services', 'lease', 'work', 'employment', 'sale', 'property_sale', 'agency', 'loan', 'nda', 'other'];

export const CONTRACTS_DEFAULTS = {
  // Number prefix: «ДГ-0001». Changing it applies to new contracts only.
  prefix: 'ДГ',
  types: CONTRACT_STOCK_TYPES.map((key) => ({ key, label: '' })),
  currencies: ['USD', 'KGS', 'RUB'],
  defaultCurrency: 'KGS',
  // Reminders to the business owner and the lawyer, days before the end and before the refusal deadline.
  reminderDays: [30, 7],
  // A running contract becomes «Истекает» this many days before its end.
  expiringDays: 30,
  // Largest file version, MB.
  maxUploadMb: 50,
  // Payments: a schedule row is «скоро» (yellow) this many days before its day.
  paymentSoonDays: 7,
  // Payment reminders to the business owner, days before the day (and once when overdue, to finance too).
  paymentReminderDays: [3, 0],
  // Revision of the stock types list: 2 added «Продажа объекта» (property_sale), see upgradeContracts.
  typesRev: 2,
};

/**
 * Settings saved before a stock type existed get it once: «Продажа объекта»
 * lands after «Купли-продажи» in a types list saved before revision 2. Saving
 * the settings stores the revision, so a type removed later stays removed.
 */
export function upgradeContracts(settings, saved = {}) {
  if (!Array.isArray(saved.types) || Number(saved.typesRev) >= 2) return settings;
  const types = [...settings.types];
  if (!types.some((type) => type.key === 'property_sale')) {
    const at = types.findIndex((type) => type.key === 'sale');
    types.splice(at >= 0 ? at + 1 : types.length, 0, { key: 'property_sale', label: '' });
  }
  return { ...settings, types, typesRev: 2 };
}

const contractText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export function sanitizeContracts(current, incoming = {}) {
  const next = { ...current };
  if (incoming.prefix !== undefined) next.prefix = contractText(incoming.prefix, 12).replace(/[\s/\\]+/g, '') || 'ДГ';
  if (Array.isArray(incoming.types)) {
    const seen = new Set();
    const types = [];
    for (const raw of incoming.types.slice(0, 40)) {
      if (!raw || typeof raw !== 'object') continue;
      let key = String(raw.key || '').trim().toLowerCase();
      const label = contractText(raw.label, 60);
      if (!/^[a-z][a-z0-9_]{0,23}$/.test(key)) key = `t${types.length + 1}${Date.now().toString(36).slice(-3)}`;
      if (seen.has(key)) continue;
      // Custom types need a name; stock ones fall back to the translation.
      if (!label && !CONTRACT_STOCK_TYPES.includes(key)) continue;
      seen.add(key);
      types.push({ key, label });
    }
    if (types.length) next.types = types;
  }
  if (Array.isArray(incoming.currencies)) {
    const list = [...new Set(incoming.currencies.map((code) => String(code || '').trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code)))].slice(0, 12);
    if (list.length) next.currencies = list;
  }
  if (typeof incoming.defaultCurrency === 'string' && /^[A-Z]{3}$/.test(incoming.defaultCurrency.toUpperCase())) next.defaultCurrency = incoming.defaultCurrency.toUpperCase();
  if (!next.currencies?.includes(next.defaultCurrency)) next.defaultCurrency = next.currencies?.[0] || 'KGS';
  if (Array.isArray(incoming.reminderDays)) {
    const days = [...new Set(incoming.reminderDays.map(Number).filter((d) => Number.isFinite(d) && d >= 1).map((d) => clampInt(d, 1, 365, 1)))].sort((a, b) => b - a).slice(0, 5);
    next.reminderDays = days;
  }
  if (incoming.expiringDays !== undefined) next.expiringDays = clampInt(incoming.expiringDays, 1, 365, 30);
  if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 500, 50);
  next.typesRev = 2;
  if (incoming.paymentSoonDays !== undefined) next.paymentSoonDays = clampInt(incoming.paymentSoonDays, 0, 60, 7);
  if (Array.isArray(incoming.paymentReminderDays)) {
    next.paymentReminderDays = [...new Set(incoming.paymentReminderDays.map(Number).filter((d) => Number.isFinite(d) && d >= 0).map((d) => clampInt(d, 0, 60, 0)))].sort((a, b) => b - a).slice(0, 4);
  }
  return next;
}

// ── Warehouse settings (docs/warehouse.md) ──────────────────────────────────

/** Document types of the warehouse module (numbering prefixes are per type). */
export const WAREHOUSE_DOC_TYPES = ['receipt', 'supplier_return', 'transfer', 'issue', 'return', 'writeoff', 'opening', 'correction', 'inventory', 'discrepancy', 'handover', 'storno'];

export const WAREHOUSE_DEFAULTS = {
  // Base (accounting) currency: costs and sums of reports; other currencies convert by `rates`.
  currency: 'USD',
  currencies: ['USD', 'KGS', 'RUB'],
  // Units of a currency per 1 unit of the base currency (the same convention as Masterplan).
  rates: { KGS: 87.5, RUB: 81 },
  // Write-offs, corrections and inventory acts above this sum go through approval (spec §12: $500).
  approvalThreshold: 500,
  approvalThresholdCurrency: 'USD',
  approvalTypes: ['writeoff', 'correction', 'inventory'],
  // Units offered for items (free text is allowed too).
  units: ['шт', 'кг', 'г', 'т', 'м', 'м²', 'м³', 'л', 'компл', 'уп', 'мешок', 'рулон', 'паллета'],
  numberPrefixes: { receipt: 'ПР', supplier_return: 'ВП', transfer: 'ПМ', issue: 'ТР', return: 'ВЗ', writeoff: 'СП', opening: 'ВО', correction: 'КР', inventory: 'ИН', discrepancy: 'АР', handover: 'ПД', storno: 'СТ' },
  numberDigits: 5,
  // Every signed-in person may see stock (without sums), file requisitions and see their tools.
  everyoneCanView: true,
  // Documents dated on or before this day can no longer be created, posted or reversed (YYYY-MM-DD or null).
  closedUntil: null,
  // Notifications: batches expiring within N days; tool service due within N days; «no movement» after N days.
  expiryWarnDays: 30,
  serviceWarnDays: 7,
  staleDays: 90,
  // Daily «below minimum» digest: the MOL of each warehouse plus these people (buyers).
  lowStockDigest: true,
  lowStockRecipients: [],
};

const whText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export function sanitizeWarehouse(current, incoming = {}) {
  const next = { ...current };
  const code = (value) => String(value || '').trim().toUpperCase();
  if (Array.isArray(incoming.currencies)) {
    const list = [...new Set(incoming.currencies.map(code).filter((c) => /^[A-Z]{3}$/.test(c)))].slice(0, 20);
    if (list.length) next.currencies = list;
  }
  if (typeof incoming.currency === 'string' && /^[A-Z]{3}$/.test(code(incoming.currency))) next.currency = code(incoming.currency);
  if (!next.currencies?.includes(next.currency)) next.currencies = [next.currency, ...(next.currencies || [])].slice(0, 20);
  if (incoming.rates && typeof incoming.rates === 'object' && !Array.isArray(incoming.rates)) {
    const rates = {};
    for (const [key, value] of Object.entries(incoming.rates).slice(0, 30)) {
      const c = code(key);
      const n = Number(value);
      if (/^[A-Z]{3}$/.test(c) && c !== next.currency && Number.isFinite(n) && n > 0 && n < 1e9) rates[c] = Math.round(n * 1e6) / 1e6;
    }
    next.rates = rates;
  }
  if (incoming.approvalThreshold !== undefined) {
    const n = Number(incoming.approvalThreshold);
    next.approvalThreshold = Number.isFinite(n) && n >= 0 && n <= 1e12 ? Math.round(n * 100) / 100 : current.approvalThreshold;
  }
  if (typeof incoming.approvalThresholdCurrency === 'string' && /^[A-Z]{3}$/.test(code(incoming.approvalThresholdCurrency))) next.approvalThresholdCurrency = code(incoming.approvalThresholdCurrency);
  if (Array.isArray(incoming.approvalTypes)) next.approvalTypes = [...new Set(incoming.approvalTypes.filter((type) => ['writeoff', 'correction', 'inventory', 'supplier_return', 'issue'].includes(type)))];
  if (Array.isArray(incoming.units)) next.units = [...new Set(incoming.units.map((unit) => whText(unit, 16)).filter(Boolean))].slice(0, 60);
  if (incoming.numberPrefixes && typeof incoming.numberPrefixes === 'object') {
    const prefixes = { ...(current.numberPrefixes || {}) };
    for (const type of WAREHOUSE_DOC_TYPES) {
      if (typeof incoming.numberPrefixes[type] !== 'string') continue;
      const prefix = incoming.numberPrefixes[type].replace(/[^\p{L}\p{N}_./-]/gu, '').slice(0, 8);
      if (prefix) prefixes[type] = prefix;
    }
    next.numberPrefixes = prefixes;
  }
  if (incoming.numberDigits !== undefined) next.numberDigits = clampInt(incoming.numberDigits, 1, 8, 5);
  for (const flag of ['everyoneCanView', 'lowStockDigest']) if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
  if (incoming.closedUntil !== undefined) {
    const day = String(incoming.closedUntil || '').slice(0, 10);
    next.closedUntil = /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(`${day}T00:00:00Z`).getTime()) ? day : null;
  }
  if (incoming.expiryWarnDays !== undefined) next.expiryWarnDays = clampInt(incoming.expiryWarnDays, 0, 365, 30);
  if (incoming.serviceWarnDays !== undefined) next.serviceWarnDays = clampInt(incoming.serviceWarnDays, 0, 90, 7);
  if (incoming.staleDays !== undefined) next.staleDays = clampInt(incoming.staleDays, 7, 3650, 90);
  if (Array.isArray(incoming.lowStockRecipients)) next.lowStockRecipients = [...new Set(incoming.lowStockRecipients.map(Number).filter((id) => Number.isInteger(id) && id > 0 && id < 2 ** 31))].slice(0, 50);
  return next;
}

// ── Drive access management (docs/drive-access.md) ──────────────────────────

export const DRIVE_ACCESS_NTFS_RIGHTS = ['modify', 'read_execute', 'read', 'full_control'];

/** File server → «Управление доступом» block: modules.drive.settings.access. */
export const DRIVE_ACCESS_DEFAULTS = {
  // The block's own switch (the File server module must be on as well).
  enabled: false,
  // Security groups that open folders: <prefix><project>_<name>_<full|read>, e.g. sg_obj2_buh_full.
  prefix: 'sg_',
  // Project codes accepted in names (empty = any), and the code for new groups when the
  // project cannot be taken from the folder's other groups.
  projects: [],
  defaultProject: '',
  // Old project code → the one new pairs get instead (e.g. { wh: 'co' } while wh is being renamed to co).
  projectAliases: {},
  // New group names: {prefix} {project} {name} {type} (type = full | read; {org} = {project}).
  nameTemplate: '{prefix}{project}_{name}_{type}',
  // Where the groups are searched ('' = the Active Directory base DN, i.e. every project).
  groupsBase: '',
  // Optional: only these OUs (each searched with its subtree) instead of groupsBase.
  groupOus: [],
  // New group pairs go to the Groups OU of the folder's project; this OU is the fallback
  // when no group of that project is known ('' = then creating is off).
  newGroupOu: '',
  // People and NTFS subjects ('' = the domain root derived from the base DN).
  subjectsBase: '',
  // Access type → NTFS rights.
  typeMap: { full: 'modify', read: 'read_execute' },
  // Groups a system administrator may not touch (glob, case-insensitive).
  protectedGroups: ['sg_*_root_*'],
  // Groups without the prefix that superadministrators also see (glob).
  otherGroups: ['nextcloud_*'],
};

const faText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const faDn = (value) => {
  const text = faText(value, 500);
  return !text || /^[a-z][\w-]*=[^,]+(,\s*[a-z][\w-]*=[^,]+)*$/i.test(text) ? text : null;
};
const faPatterns = (list) => [...new Set((Array.isArray(list) ? list : []).map((item) => faText(item, 64).toLowerCase()).filter((item) => /^[a-z0-9_.*-]+$/.test(item) && item !== '*'))].slice(0, 20);
const faCode = (value) => faText(value, 16).toLowerCase();
const PROJECT_CODE = /^[a-z0-9-]{1,16}$/;

/** { old: new } project code aliases (both valid codes, no self-maps, at most 100); a "wh=co" text list is accepted too. */
export function sanitizeProjectAliases(value) {
  let pairs = [];
  if (typeof value === 'string') pairs = value.split(/[\n,;]+/).map((line) => line.split(/\s*(?:=|→|->|:)\s*/));
  else if (Array.isArray(value)) pairs = value.map((row) => (Array.isArray(row) ? row : [row?.from, row?.to]));
  else if (value && typeof value === 'object') pairs = Object.entries(value);
  const out = {};
  for (const [from, to] of pairs) {
    const a = faCode(from);
    const b = faCode(to);
    if (PROJECT_CODE.test(a) && PROJECT_CODE.test(b) && a !== b && Object.keys(out).length < 100) out[a] = b;
  }
  return out;
}

/** The access block of the File server settings, cleaned. Unknown keys are dropped. */
export function sanitizeDriveAccess(current = DRIVE_ACCESS_DEFAULTS, incoming = {}) {
  const next = { ...DRIVE_ACCESS_DEFAULTS, ...(current || {}) };
  if (!incoming || typeof incoming !== 'object') return next;
  if (typeof incoming.enabled === 'boolean') next.enabled = incoming.enabled;
  if (incoming.prefix !== undefined) {
    const prefix = faText(incoming.prefix, 16).toLowerCase();
    if (/^[a-z0-9_-]{1,16}$/.test(prefix)) next.prefix = prefix;
  }
  if (Array.isArray(incoming.projects)) next.projects = [...new Set(incoming.projects.map(faCode).filter((code) => PROJECT_CODE.test(code)))].slice(0, 100);
  if (incoming.defaultProject !== undefined) {
    const code = faCode(incoming.defaultProject);
    if (!code || PROJECT_CODE.test(code)) next.defaultProject = code;
  }
  if (incoming.projectAliases !== undefined) next.projectAliases = sanitizeProjectAliases(incoming.projectAliases);
  if (incoming.nameTemplate !== undefined) {
    const template = faText(incoming.nameTemplate, 80).replace('{org}', '{project}');
    if (template.includes('{name}') && template.includes('{type}') && /^[a-z0-9_{}-]+$/i.test(template)) next.nameTemplate = template;
  }
  for (const key of ['groupsBase', 'newGroupOu', 'subjectsBase']) {
    if (incoming[key] !== undefined) {
      const dn = faDn(incoming[key]);
      if (dn !== null) next[key] = dn;
    }
  }
  if (Array.isArray(incoming.groupOus)) next.groupOus = [...new Set(incoming.groupOus.map(faDn).filter(Boolean))].slice(0, 50);
  if (incoming.typeMap && typeof incoming.typeMap === 'object') {
    const map = { ...next.typeMap };
    for (const type of ['full', 'read']) {
      if (DRIVE_ACCESS_NTFS_RIGHTS.includes(incoming.typeMap[type])) map[type] = incoming.typeMap[type];
    }
    next.typeMap = map;
  }
  if (incoming.protectedGroups !== undefined) next.protectedGroups = faPatterns(incoming.protectedGroups);
  if (incoming.otherGroups !== undefined) next.otherGroups = faPatterns(incoming.otherGroups);
  return Object.fromEntries(Object.keys(DRIVE_ACCESS_DEFAULTS).map((key) => [key, next[key]]));
}

/** Stored drive settings over the defaults: the nested access block is merged too. */
export function upgradeDrive(settings, saved = {}) {
  return { ...settings, access: { ...DRIVE_ACCESS_DEFAULTS, ...(saved.access && typeof saved.access === 'object' ? saved.access : {}) } };
}

// ── Org structure (core, docs/org-structure.md) ─────────────────────────────

const orgText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const ORG_KEY = /^[a-z][a-z0-9_]{0,23}$/;
export const ORG_TYPE_ICONS = ['building', 'briefcase', 'map', 'layers', 'siteplan', 'people', 'box', 'globe', 'flag', 'home', 'pin', 'cart', 'wrench', 'server'];

/** Stock unit types; an empty `label` = the translated stock name (i18n org.types.<key>). */
export const ORG_DEFAULT_TYPES = [
  // `legal`: the unit links to a legal entity of the shared directory (Settings → Legal entities).
  { key: 'company', label: '', icon: 'building', color: '#4F46E5', legal: true },
  { key: 'office', label: '', icon: 'briefcase', color: '#0EA5E9', legal: false },
  { key: 'branch', label: '', icon: 'map', color: '#14B8A6', legal: false },
  { key: 'department', label: '', icon: 'layers', color: '#8B5CF6', legal: false },
  { key: 'site', label: '', icon: 'siteplan', color: '#F59E0B', legal: false, site: true },
];
/** Stock purposes («назначение»): modules pick units by them (unitsByPurpose). */
export const ORG_DEFAULT_PURPOSES = [
  { key: 'warehouse', label: '' },
  { key: 'construction', label: '' },
  { key: 'sales', label: '' },
  { key: 'production', label: '' },
  { key: 'office', label: '' },
];

export const ORG_DEFAULTS = { types: ORG_DEFAULT_TYPES, purposes: ORG_DEFAULT_PURPOSES };

function orgList(list, stock, max, shape) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, max)) {
    if (!raw || typeof raw !== 'object') continue;
    const key = String(raw.key || '').trim().toLowerCase();
    if (!ORG_KEY.test(key) || seen.has(key)) continue;
    const label = orgText(raw.label, 60);
    const base = stock.find((item) => item.key === key);
    // Custom entries need a name; stock ones fall back to the translation.
    if (!label && !base) continue;
    seen.add(key);
    out.push(shape(raw, key, label, base));
  }
  return out.length ? out : null;
}

export function sanitizeOrg(current, incoming = {}) {
  const next = { ...current };
  const types = orgList(incoming.types, ORG_DEFAULT_TYPES, 20, (raw, key, label, base) => ({
    key,
    label,
    icon: ORG_TYPE_ICONS.includes(raw.icon) ? raw.icon : base?.icon || 'layers',
    color: typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color.toUpperCase() : base?.color || '#64748B',
    legal: typeof raw.legal === 'boolean' ? raw.legal : Boolean(base?.legal),
    site: typeof raw.site === 'boolean' ? raw.site : Boolean(base?.site),
  }));
  if (types) next.types = types;
  const purposes = orgList(incoming.purposes, ORG_DEFAULT_PURPOSES, 30, (raw, key, label) => ({ key, label }));
  if (purposes) next.purposes = purposes;
  return { types: next.types || ORG_DEFAULT_TYPES, purposes: next.purposes || ORG_DEFAULT_PURPOSES };
}

// ── Employees (docs/employees.md) ───────────────────────────────────────────

export const EMPLOYEES_DEFAULTS = {
  // Everyone signed in sees the directory (names, positions, units, work contacts) without employees.view.
  everyoneCanView: false,
  // Birthdays widget: 'all' (day and month to everyone who sees the directory), 'hr' (HR only), 'off'.
  birthdays: 'all',
  // Work anniversaries (years since hire) in the widget.
  anniversaries: true,
  // Clearance reminders: days before expiry (0 = on the day it expires). Each threshold fires once.
  clearanceWarnDays: [30, 7, 0],
  // Who gets clearance reminders besides HR (employees.hr): the employee (when linked) and their manager.
  notifyEmployee: true,
  notifyManager: true,
};

export function sanitizeEmployees(current, incoming = {}) {
  const next = { ...current };
  if (typeof incoming.everyoneCanView === 'boolean') next.everyoneCanView = incoming.everyoneCanView;
  if (['all', 'hr', 'off'].includes(incoming.birthdays)) next.birthdays = incoming.birthdays;
  if (typeof incoming.anniversaries === 'boolean') next.anniversaries = incoming.anniversaries;
  if (Array.isArray(incoming.clearanceWarnDays)) {
    const days = [...new Set(incoming.clearanceWarnDays.filter((value) => value !== '' && value !== null && Number(value) >= 0).map((value) => clampInt(value, 0, 365, -1)).filter((value) => value >= 0))].sort((a, b) => b - a).slice(0, 5);
    next.clearanceWarnDays = days;
  }
  if (typeof incoming.notifyEmployee === 'boolean') next.notifyEmployee = incoming.notifyEmployee;
  if (typeof incoming.notifyManager === 'boolean') next.notifyManager = incoming.notifyManager;
  return Object.fromEntries(Object.keys(EMPLOYEES_DEFAULTS).map((key) => [key, next[key] ?? EMPLOYEES_DEFAULTS[key]]));
}

// ── Active Directory directory («Каталог AD», docs/directory.md) ─────────────

/** Attributes the directory module can edit; settings choose a subset. */
export const DIRECTORY_ATTRIBUTES = ['givenName', 'sn', 'initials', 'displayName', 'description', 'title', 'department', 'company', 'mail', 'telephoneNumber', 'mobile', 'physicalDeliveryOfficeName', 'employeeID', 'l', 'manager'];

export const DIRECTORY_DEFAULTS = {
  // The managed root (an OU such as OU=Accounts,DC=example,DC=local). Empty: nothing is shown.
  rootDn: '',
  // Hidden and never changed: OU DNs (with their subtree) or OU name patterns ("Service*", "Admins").
  excluded: [],
  // Hidden accounts by login or name pattern ("svc_*", "adm-*").
  hiddenAccounts: [],
  editableAttributes: ['displayName', 'givenName', 'sn', 'title', 'department', 'company', 'mail', 'telephoneNumber', 'mobile', 'physicalDeliveryOfficeName', 'description', 'manager'],
  allowCreate: true,
  // sAMAccountName of new users: {first} {last} {middle}, {f} {l} {m} = first letters (transliterated).
  loginTemplate: '{f}.{last}',
  // UPN suffixes offered (empty: the DNS domain of the base DN).
  upnSuffixes: [],
  // Mail of new users, e.g. {login}@example.com (empty: none).
  mailTemplate: '',
  defaultUserOu: '',
  // OU for new users per org unit: [{ unitId, ou }] (the nearest mapped unit above wins).
  unitOus: [],
  // Where «Offboard» moves disabled accounts (empty: not offered).
  disabledOu: '',
  passwordMinLength: 12,
  passwordComplexity: true,
  passwordHint: '',
  mustChangeDefault: true,
  // Password operations over StartTLS when the integration is plain LDAP (AD requires a secure channel).
  startTls: false,
  inactiveDays: 90,
};

const DN_LIKE = /^[A-Za-z][A-Za-z0-9-]*=[^\u0000]+$/;
const cleanDnText = (value) => {
  const text = String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 1000);
  return text && DN_LIKE.test(text) ? text : '';
};
const cleanTextList = (list, max, len, test = () => true) =>
  Array.isArray(list) ? [...new Set(list.map((item) => String(item ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, len)).filter((item) => item && test(item)))].slice(0, max) : null;

export function sanitizeDirectory(current, incoming = {}) {
  const next = { ...DIRECTORY_DEFAULTS, ...(current || {}) };
  if (!incoming || typeof incoming !== 'object') return next;
  for (const key of ['rootDn', 'defaultUserOu', 'disabledOu']) if (incoming[key] !== undefined) next[key] = cleanDnText(incoming[key]);
  const excluded = cleanTextList(incoming.excluded, 50, 1000);
  if (excluded) next.excluded = excluded;
  const hidden = cleanTextList(incoming.hiddenAccounts, 50, 64);
  if (hidden) next.hiddenAccounts = hidden;
  const attrs = cleanTextList(incoming.editableAttributes, DIRECTORY_ATTRIBUTES.length, 64, (item) => DIRECTORY_ATTRIBUTES.includes(item));
  if (attrs) next.editableAttributes = attrs;
  const suffixes = cleanTextList(incoming.upnSuffixes, 10, 120, (item) => /^@?[a-z0-9.-]+\.[a-z0-9-]+$/i.test(item));
  if (suffixes) next.upnSuffixes = suffixes.map((item) => item.replace(/^@/, '').toLowerCase());
  if (incoming.loginTemplate !== undefined) {
    const template = String(incoming.loginTemplate || '').trim().slice(0, 60);
    if (/\{(first|last|f|l)\}/.test(template) && /^[a-z0-9._{}-]+$/i.test(template)) next.loginTemplate = template;
  }
  if (incoming.mailTemplate !== undefined) {
    const template = String(incoming.mailTemplate || '').trim().slice(0, 120);
    next.mailTemplate = !template || /^[a-z0-9._{}-]+@[a-z0-9.{}-]+$/i.test(template) ? template : next.mailTemplate;
  }
  if (Array.isArray(incoming.unitOus)) {
    next.unitOus = incoming.unitOus
      .map((item) => ({ unitId: clampInt(item?.unitId, 1, 2 ** 31 - 1, 0), ou: cleanDnText(item?.ou) }))
      .filter((item) => item.unitId && item.ou)
      .slice(0, 200);
  }
  if (incoming.passwordMinLength !== undefined) next.passwordMinLength = clampInt(incoming.passwordMinLength, 6, 64, 12);
  if (incoming.passwordHint !== undefined) next.passwordHint = String(incoming.passwordHint || '').slice(0, 300);
  if (incoming.inactiveDays !== undefined) next.inactiveDays = clampInt(incoming.inactiveDays, 7, 3650, 90);
  for (const key of ['allowCreate', 'passwordComplexity', 'mustChangeDefault', 'startTls']) if (typeof incoming[key] === 'boolean') next[key] = incoming[key];
  return Object.fromEntries(Object.keys(DIRECTORY_DEFAULTS).map((key) => [key, next[key]]));
}

export const MODULE_CATALOG = [
  {
    // Org structure: a core service (docs/org-structure.md). Always on; modules read it
    // through modules/org/api.js (orgUnits, unitOf, managerOf, descendants, unitsByPurpose).
    id: 'org',
    core: true,
    defaultEnabled: true,
    // manage: edit the tree, unit types and purposes, assign people to units.
    permissions: ['org.manage'],
    defaults: ORG_DEFAULTS,
    sanitize: sanitizeOrg,
  },
  {
    id: 'files',
    defaultEnabled: true,
    permissions: ['files.admin'],
    defaults: {
      maxUploadMb: 200,
      // Personal storage per user (0 = unlimited).
      quotaMb: 0,
      fileGroups: Object.keys(KB_FILE_GROUPS),
      // Any extension, beyond the groups above (served as downloads only).
      allowAny: true,
      publicLinks: true,
      requireLinkPassword: false,
      maxLinkDays: 0,
      // Public links that let visitors upload, rename, replace or delete.
      writeLinks: true,
      requireWriteLinkPassword: false,
      // Total a link that accepts files may take in when it has no quota of its own (MB, 0 = unlimited).
      linkQuotaMb: 2048,
      // Who publishes links: 'owners' (owners and space managers) or 'members'
      // (anyone with access, granting at most their own rights).
      linkSharing: 'owners',
      // Who creates shared spaces: 'everyone' or 'admins' (files.admin).
      spaceCreation: 'admins',
      trashDays: 30,
      // How a file opens: 'page' (its own page with an address) or 'modal' (over the folder).
      openMode: 'page',
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 4096, 200);
      if (incoming.quotaMb !== undefined) next.quotaMb = clampInt(incoming.quotaMb, 0, 10_000_000, 0);
      if (Array.isArray(incoming.fileGroups)) next.fileGroups = incoming.fileGroups.filter((group) => KB_FILE_GROUPS[group]);
      for (const flag of ['allowAny', 'publicLinks', 'requireLinkPassword', 'writeLinks', 'requireWriteLinkPassword']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      if (incoming.maxLinkDays !== undefined) next.maxLinkDays = clampInt(incoming.maxLinkDays, 0, 3650, 0);
      if (incoming.linkQuotaMb !== undefined) next.linkQuotaMb = clampInt(incoming.linkQuotaMb, 0, 10_000_000, 2048);
      if (['owners', 'members'].includes(incoming.linkSharing)) next.linkSharing = incoming.linkSharing;
      if (incoming.trashDays !== undefined) next.trashDays = clampInt(incoming.trashDays, 1, 365, 30);
      if (['everyone', 'admins'].includes(incoming.spaceCreation)) next.spaceCreation = incoming.spaceCreation;
      if (['page', 'modal'].includes(incoming.openMode)) next.openMode = incoming.openMode;
      return next;
    },
  },
  {
    id: 'companies',
    defaultEnabled: true,
    permissions: ['companies.admin'],
    defaults: {
      defaultCountry: 'KG',
      // Countries offered when a company is added (order = order in the list).
      countries: ['KG', 'RU', 'KZ', 'UZ', 'BY', 'TJ', 'CN', 'TR', 'OTHER'],
      // Who may change cards: 'everyone' signed in, or 'owners' (responsible person, author, admins).
      editPolicy: 'everyone',
      relations: [
        { key: 'client', label: '', color: '#2563EB' },
        { key: 'supplier', label: '', color: '#F59E0B' },
        { key: 'partner', label: '', color: '#10B981' },
        { key: 'prospect', label: '', color: '#8B5CF6' },
        { key: 'contractor', label: '', color: '#0EA5E9' },
        { key: 'government', label: '', color: '#64748B' },
        { key: 'competitor', label: '', color: '#EF4444' },
      ],
      // Extra fields: { key, label, type: text|number|date|select|url, options, entity: company|person, countries: [] }.
      customFields: [],
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      const COUNTRY = /^[A-Z]{2}$|^OTHER$/;
      if (typeof incoming.defaultCountry === 'string' && COUNTRY.test(incoming.defaultCountry)) next.defaultCountry = incoming.defaultCountry;
      if (Array.isArray(incoming.countries)) {
        const list = [...new Set(incoming.countries.filter((code) => typeof code === 'string' && COUNTRY.test(code)))].slice(0, 30);
        if (list.length) next.countries = list;
      }
      if (['everyone', 'owners'].includes(incoming.editPolicy)) next.editPolicy = incoming.editPolicy;
      const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
      const key = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
      // Non-Latin labels ("Дилер") get a stable key from their text.
      const keyFor = (item) => {
        const own = key(item?.key);
        if (own) return own;
        const label = text(item?.label, 60);
        if (!label) return '';
        let hash = 0;
        for (const ch of label) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
        return `x${hash.toString(36)}`;
      };
      if (Array.isArray(incoming.relations)) {
        const seen = new Set();
        next.relations = incoming.relations
          .map((item) => ({ key: keyFor(item), label: text(item?.label, 40), color: HEX.test(item?.color || '') ? item.color.toUpperCase() : '#64748B' }))
          .filter((item) => item.key && !seen.has(item.key) && seen.add(item.key))
          .slice(0, 30);
      }
      if (Array.isArray(incoming.customFields)) {
        const seen = new Set();
        next.customFields = incoming.customFields
          .map((item) => ({
            key: keyFor(item),
            label: text(item?.label, 60),
            type: ['text', 'number', 'date', 'select', 'url', 'textarea'].includes(item?.type) ? item.type : 'text',
            entity: item?.entity === 'person' ? 'person' : 'company',
            options: Array.isArray(item?.options) ? item.options.map((option) => text(option, 60)).filter(Boolean).slice(0, 50) : [],
            countries: Array.isArray(item?.countries) ? item.countries.filter((code) => typeof code === 'string' && COUNTRY.test(code)).slice(0, 30) : [],
          }))
          .filter((item) => item.key && item.label && !seen.has(`${item.entity}:${item.key}`) && seen.add(`${item.entity}:${item.key}`))
          .slice(0, 60);
      }
      return next;
    },
  },
  {
    id: 'crm',
    defaultEnabled: true,
    // crm.admin: settings, pipelines, every deal; crm.all: sees and edits every deal.
    permissions: ['crm.admin', 'crm.all'],
    defaults: CRM_DEFAULTS,
    // Unsaved settings: section titles in the portal language (stock lists are stored, see CRM_STOCK).
    localizedDefaults: crmLocalizedDefaults,
    sanitize: sanitizeCrm,
  },
  {
    id: 'masterplan',
    // Off until an administrator turns it on (Settings → Modules); then roles are granted per project.
    defaultEnabled: false,
    // Module roles (docs/masterplan.md "Roles"): each permission grants the role in every project;
    // project assignments grant a role within a zone (a node's subtree).
    permissions: [
      'masterplan.admin',
      'masterplan.executive',
      'masterplan.sales_head',
      'masterplan.sales',
      'masterplan.finance',
      'masterplan.legal',
      'masterplan.construction_head',
      'masterplan.foreman',
      'masterplan.marketing',
    ],
    defaults: MASTERPLAN_DEFAULTS,
    sanitize: sanitizeMasterplan,
  },
  {
    id: 'chat',
    defaultEnabled: true,
    permissions: ['chat.admin'],
    defaults: {
      // Anyone may create group chats (off: only chat administrators).
      allowGroups: true,
      maxUploadMb: 100,
      // Video calls: a meeting link template, {room} becomes a unique code (empty = no call button).
      callUrl: 'https://meet.jit.si/{room}',
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (typeof incoming.allowGroups === 'boolean') next.allowGroups = incoming.allowGroups;
      if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 2048, 100);
      if (typeof incoming.callUrl === 'string') {
        const url = incoming.callUrl.trim().slice(0, 300);
        next.callUrl = !url || /^https:\/\/[^\s]+$/.test(url) ? url : current.callUrl;
      }
      return next;
    },
  },
  {
    id: 'dashboard',
    defaultEnabled: true,
    permissions: ['dashboard.admin'],
    defaults: {
      // Heading of the page (empty = "Dashboard").
      title: '',
      // People may rearrange, resize, add and remove widgets for themselves.
      personalize: true,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (typeof incoming.title === 'string') next.title = incoming.title.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
      if (typeof incoming.personalize === 'boolean') next.personalize = incoming.personalize;
      return next;
    },
  },
  {
    id: 'resources',
    defaultEnabled: true,
    permissions: ['resources.admin'],
    defaults: {
      // Heading above the tiles (empty = "Online resources").
      title: '',
      subtitle: '',
      // People may reorder and hide tiles for themselves.
      personalize: true,
      showDescriptions: true,
      showSearch: true,
      density: 'comfortable',
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      for (const [key, max] of [['title', 60], ['subtitle', 200]]) {
        if (typeof incoming[key] === 'string') next[key] = incoming[key].replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
      }
      for (const flag of ['personalize', 'showDescriptions', 'showSearch']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      if (['comfortable', 'compact'].includes(incoming.density)) next.density = incoming.density;
      return next;
    },
  },
  {
    id: 'drive',
    // Off until an administrator adds a file server.
    defaultEnabled: false,
    // access: system administrators manage the membership of the folder access groups
    // (sg_…, «Доступ»), except protected ones; everything else there is for superadministrators (*).
    permissions: ['drive.admin', 'drive.audit', 'drive.access'],
    defaults: {
      // Name in the menu and launcher, e.g. "Company Drive" (empty = "File server").
      title: '',
      tagline: '',
      // Reuse the Active Directory sign-in password for file servers (stored sealed).
      rememberLogin: true,
      // Hide folders the person has no rights to instead of showing them locked.
      hideDenied: true,
      maxUploadMb: 2048,
      publicLinks: true,
      // Who links may be opened by: 'any' (choice per link) or 'employees' (signed-in only).
      linkAudience: 'any',
      requireLinkPassword: false,
      maxLinkDays: 0,
      // Links that let visitors upload, rename or delete (with the author's rights).
      linkWrite: true,
      // Such links need a password.
      requireWritePassword: false,
      // How a file opens: 'page' (its own page with an address) or 'modal' (over the folder).
      openMode: 'page',
      // Activity log (drive.audit): on/off, folder listings too, days to keep (0 = forever).
      activityLog: true,
      logBrowsing: true,
      activityDays: 365,
      // «Управление доступом»: folder access groups in Active Directory and NTFS permissions.
      access: DRIVE_ACCESS_DEFAULTS,
    },
    upgrade: upgradeDrive,
    sanitize(current, incoming = {}) {
      const next = { ...current };
      for (const key of ['title', 'tagline']) {
        if (typeof incoming[key] === 'string') next[key] = incoming[key].replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, key === 'title' ? 40 : 160);
      }
      for (const flag of ['rememberLogin', 'hideDenied', 'publicLinks', 'requireLinkPassword', 'linkWrite', 'requireWritePassword', 'activityLog', 'logBrowsing']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 10240, 2048);
      if (incoming.maxLinkDays !== undefined) next.maxLinkDays = clampInt(incoming.maxLinkDays, 0, 3650, 0);
      if (incoming.activityDays !== undefined) next.activityDays = clampInt(incoming.activityDays, 0, 3650, 365);
      if (['any', 'employees'].includes(incoming.linkAudience)) next.linkAudience = incoming.linkAudience;
      if (['page', 'modal'].includes(incoming.openMode)) next.openMode = incoming.openMode;
      if (incoming.access && typeof incoming.access === 'object') next.access = sanitizeDriveAccess(current.access, incoming.access);
      return next;
    },
  },
  {
    id: 'kb',
    defaultEnabled: true,
    permissions: ['kb.admin'],
    defaults: {
      defaultIcon: 'folder',
      defaultColor: '#3B82F6',
      maxUploadMb: 50,
      fileGroups: Object.keys(KB_FILE_GROUPS),
      publicLinks: true,
      requireSharePassword: false,
      maxShareDays: 0,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (typeof incoming.defaultIcon === 'string' && /^[a-z0-9_-]{2,32}$/i.test(incoming.defaultIcon)) {
        next.defaultIcon = incoming.defaultIcon;
      }
      if (typeof incoming.defaultColor === 'string' && HEX.test(incoming.defaultColor)) {
        next.defaultColor = incoming.defaultColor.toUpperCase();
      }
      if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 1024, 50);
      if (Array.isArray(incoming.fileGroups)) {
        next.fileGroups = incoming.fileGroups.filter((group) => KB_FILE_GROUPS[group]);
      }
      for (const flag of ['publicLinks', 'requireSharePassword']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      if (incoming.maxShareDays !== undefined) next.maxShareDays = clampInt(incoming.maxShareDays, 0, 3650, 0);
      return next;
    },
  },
  {
    id: 'tasks',
    defaultEnabled: true,
    permissions: ['tasks.admin'],
    defaults: {
      // Who may create projects: 'everyone' or 'admins' (holders of tasks.admin).
      projectCreation: 'everyone',
      defaultView: 'board',
      reminders: true,
      dueSoonHours: 24,
      // «Принять в работу»: hours the assignee has to accept a task (important ones: their own).
      acceptHours: 24,
      acceptHoursImportant: 4,
      // «Поручения»: tasks set by members of these groups ("leadership") are orders.
      ordersGroupIds: [],
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (['everyone', 'admins'].includes(incoming.projectCreation)) next.projectCreation = incoming.projectCreation;
      if (['board', 'list'].includes(incoming.defaultView)) next.defaultView = incoming.defaultView;
      if (typeof incoming.reminders === 'boolean') next.reminders = incoming.reminders;
      if (incoming.dueSoonHours !== undefined) next.dueSoonHours = clampInt(incoming.dueSoonHours, 1, 168, 24);
      if (incoming.acceptHours !== undefined) next.acceptHours = clampInt(incoming.acceptHours, 1, 720, 24);
      if (incoming.acceptHoursImportant !== undefined) next.acceptHoursImportant = clampInt(incoming.acceptHoursImportant, 1, 720, 4);
      if (Array.isArray(incoming.ordersGroupIds)) {
        next.ordersGroupIds = [...new Set(incoming.ordersGroupIds.map(Number).filter((id) => Number.isInteger(id) && id > 0 && id < 2 ** 31))].slice(0, 50);
      }
      return next;
    },
  },
  {
    id: 'calendar',
    defaultEnabled: true,
    permissions: ['calendar.admin'],
    defaults: {
      // Who may create shared calendars: 'everyone' or 'admins' (holders of calendar.admin).
      calendarCreation: 'everyone',
      defaultView: 'week',
      weekStart: 1,
      dayStart: '07:00',
      dayEnd: '21:00',
      defaultReminder: 15,
      showTasks: true,
      reminders: true,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      const time = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (['everyone', 'admins'].includes(incoming.calendarCreation)) next.calendarCreation = incoming.calendarCreation;
      if (['month', 'week', 'day', 'agenda'].includes(incoming.defaultView)) next.defaultView = incoming.defaultView;
      if ([0, 1, 6].includes(Number(incoming.weekStart))) next.weekStart = Number(incoming.weekStart);
      if (time.test(incoming.dayStart || '')) next.dayStart = incoming.dayStart;
      if (time.test(incoming.dayEnd || '')) next.dayEnd = incoming.dayEnd;
      if (incoming.defaultReminder !== undefined) next.defaultReminder = clampInt(incoming.defaultReminder, -1, 10080, 15);
      for (const flag of ['showTasks', 'reminders']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      return next;
    },
  },
  {
    id: 'assistant',
    // Not an app with its own page: a helper drawn over every page.
    overlay: true,
    defaultEnabled: true,
    permissions: [],
    // Shown to every signed-in person (public settings), not only administrators.
    publicSettings: ['avatar', 'proactive', 'choice', 'allowed', 'allowColors'],
    defaults: {
      // Robot shown until a person picks their own (one of ASSISTANT_AVATARS).
      avatar: 'pixel',
      // Offer help once when a person opens a section for the first time.
      proactive: true,
      // Who chooses the character: 'all' (any), 'some' (only `allowed`), 'one' (everyone gets `avatar`).
      choice: 'all',
      allowed: [],
      // People may recolour their character.
      allowColors: true,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (ASSISTANT_AVATARS.includes(incoming.avatar)) next.avatar = incoming.avatar;
      if (typeof incoming.proactive === 'boolean') next.proactive = incoming.proactive;
      if (typeof incoming.allowColors === 'boolean') next.allowColors = incoming.allowColors;
      if (['all', 'some', 'one'].includes(incoming.choice)) next.choice = incoming.choice;
      if (Array.isArray(incoming.allowed)) next.allowed = [...new Set(incoming.allowed.filter((id) => ASSISTANT_AVATARS.includes(id)))];
      // The default must be one people may have; an empty selection means everyone.
      if (next.choice === 'some') {
        if (!next.allowed.length) next.choice = 'all';
        else if (!next.allowed.includes(next.avatar)) next.avatar = next.allowed[0];
      }
      return next;
    },
  },
  {
    id: 'approvals',
    // A core service: always on (other modules route their documents through it).
    core: true,
    defaultEnabled: true,
    permissions: ['approvals.admin'],
    defaults: APPROVALS_DEFAULTS,
    sanitize: sanitizeApprovals,
  },
  {
    id: 'procurement',
    // A business module: off until an administrator turns it on (Settings → Modules).
    defaultEnabled: false,
    // create: file requests (when anyoneCanCreate is off); view_all: every request;
    // pay: payments registry and marking payments; admin: directories, settings, routes.
    permissions: ['procurement.create', 'procurement.view_all', 'procurement.pay', 'procurement.admin'],
    defaults: PROCUREMENT_DEFAULTS,
    sanitize: sanitizeProcurement,
  },
  {
    id: 'contracts',
    // A business module: off until an administrator turns it on (docs/contracts.md).
    defaultEnabled: false,
    // create: new contracts; view_all: every contract; legal: risks, «Подписан» / «Расторгнут»;
    // finance: confirms deposits, registers payments, the payments registry; admin: settings and everything.
    permissions: ['contracts.create', 'contracts.view_all', 'contracts.legal', 'contracts.finance', 'contracts.admin'],
    defaults: CONTRACTS_DEFAULTS,
    sanitize: sanitizeContracts,
    upgrade: upgradeContracts,
  },
  {
    id: 'warehouse',
    // A business module: off until an administrator turns it on (docs/warehouse.md).
    defaultEnabled: false,
    // Spec §9. A permission grants the right on every warehouse; per-warehouse
    // assignments (wh_assignments) and the MOL grant it on one warehouse.
    permissions: ['warehouse.view', 'warehouse.request', 'warehouse.operate', 'warehouse.writeoff', 'warehouse.inventory', 'warehouse.cost', 'warehouse.backdate', 'warehouse.admin'],
    defaults: WAREHOUSE_DEFAULTS,
    sanitize: sanitizeWarehouse,
  },
  {
    id: 'employees',
    // A business module: off until an administrator turns it on (docs/employees.md).
    defaultEnabled: false,
    // view: the directory (names, positions, units, work contacts); hr: everything,
    // including personal data, documents and clearances; admin: directories and settings.
    permissions: ['employees.view', 'employees.hr', 'employees.admin'],
    defaults: EMPLOYEES_DEFAULTS,
    sanitize: sanitizeEmployees,
  },
  {
    id: 'qr',
    // QR codes (docs/qr.md): installable, off until an administrator turns it on.
    defaultEnabled: false,
    // admin: prepare templates (brand looks people pick from) and their locks.
    permissions: ['qr.admin'],
    defaults: {
      // People may change a template's options that are not locked (false: templates as they are).
      allowCustom: true,
      // People may upload their own logo.
      allowUploads: true,
      // Website codes may be dynamic: /q/<slug>, target editable after printing, scans counted.
      dynamic: true,
      maxCodes: 500,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      for (const flag of ['allowCustom', 'allowUploads', 'dynamic']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      const max = Number(incoming.maxCodes);
      if (Number.isInteger(max)) next.maxCodes = Math.min(10000, Math.max(10, max));
      return next;
    },
  },
  {
    id: 'remote',
    // Remote access & assistance (docs/specs/remote-access.ru.md): installable, off by default.
    // Transparency is enforced in the service (every connection is logged and the watched
    // employee is notified); there is intentionally no covert / silent setting here.
    defaultEnabled: false,
    permissions: ['remote.view', 'remote.connect', 'remote.monitor', 'remote.admin'],
    defaults: {
      // guacd service address (empty = the live tunnel is off; the module still manages
      // computers, access and the audit journal).
      guacdHost: '',
      guacdPort: 4822,
      // Taking control (not just viewing) in monitoring mode asks the employee first.
      requireConsentForControl: true,
      // Record sessions (stored on the server, shown in the journal). Off by default.
      recording: false,
      // Delete recordings after this many days.
      retentionDays: 30,
      // Set when a superadministrator confirms the monitoring policy checklist
      // (docs/specs/remote-access.ru.md). Monitoring connections are refused until then.
      policyAckAt: null,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (typeof incoming.guacdHost === 'string') next.guacdHost = incoming.guacdHost.replace(/[^a-zA-Z0-9.\-_:]/g, '').slice(0, 120);
      const port = Number(incoming.guacdPort);
      if (Number.isInteger(port) && port > 0 && port <= 65535) next.guacdPort = port;
      for (const flag of ['requireConsentForControl', 'recording']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      const days = Number(incoming.retentionDays);
      if (Number.isInteger(days)) next.retentionDays = Math.min(3650, Math.max(1, days));
      // The policy acknowledgement is a server-side timestamp, never a value the client sets.
      if (incoming.policyAck === true) next.policyAckAt = new Date().toISOString();
      else if (incoming.policyAck === false) next.policyAckAt = null;
      return next;
    },
  },
  {
    id: 'directory',
    // Infrastructure: off until an administrator turns it on; works only with the AD integration
    // (or the demo directory) — docs/directory.md.
    defaultEnabled: false,
    // view: browse the directory; manage: create, edit, move, enable / disable, unlock, groups;
    // passwords: reset passwords and unlock; admin: everything, including protected accounts.
    permissions: ['ad.view', 'ad.manage', 'ad.passwords', 'ad.admin'],
    defaults: DIRECTORY_DEFAULTS,
    sanitize: sanitizeDirectory,
  },
];

export const MODULE_IDS = MODULE_CATALOG.map((module) => module.id);

/** Stored state merged over defaults: `{ kb: { enabled, settings } }`. */
/** `locale`: the portal language, for modules whose stock settings have per-language texts (localizedDefaults). */
export function resolveModules(stored = {}, { locale } = {}) {
  return Object.fromEntries(
    MODULE_CATALOG.map((module) => {
      const saved = stored[module.id] || {};
      // A copy: callers may change their settings without touching the module-level defaults.
      const defaults = structuredClone(locale && module.localizedDefaults ? module.localizedDefaults(locale) : module.defaults);
      return [
        module.id,
        {
          enabled: module.core ? true : typeof saved.enabled === 'boolean' ? saved.enabled : module.defaultEnabled,
          settings: module.upgrade ? module.upgrade({ ...defaults, ...(saved.settings || {}) }, saved.settings || {}) : { ...defaults, ...(saved.settings || {}) },
        },
      ];
    })
  );
}

export function sanitizeModules(current, incoming = {}) {
  const next = structuredClone(current);
  for (const module of MODULE_CATALOG) {
    const patch = incoming[module.id];
    if (!patch || typeof patch !== 'object') continue;
    if (typeof patch.enabled === 'boolean' && !module.core) next[module.id].enabled = patch.enabled;
    if (patch.settings && typeof patch.settings === 'object') {
      next[module.id].settings = module.sanitize(next[module.id].settings, patch.settings);
    }
  }
  return next;
}
