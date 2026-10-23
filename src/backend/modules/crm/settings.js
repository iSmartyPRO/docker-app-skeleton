/*
 * CRM settings (settings.modules.crm, docs/crm.md): the defaults the package
 * manifest carries (scripts/build-module.mjs reads `defaults` from here), the
 * sanitizer the portal uses for them (index.js exports it as `sanitizeSettings`)
 * and the unsaved defaults in the portal language (`localizedSettings`).
 * Plain data and pure functions, no imports: read at build time too.
 */

export const CRM_FIELD_TYPES = ['text', 'textarea', 'number', 'money', 'date', 'select', 'multiselect', 'bool', 'url', 'user'];
// Built-in deal fields: custom field keys may not take these names; their section can be moved (builtinSections).
export const CRM_BUILTIN_FIELDS = ['title', 'amount', 'client', 'owner', 'source', 'close_date', 'comment', 'watchers'];
const CRM_RESERVED_KEYS = new Set([...CRM_BUILTIN_FIELDS, 'id', 'currency', 'company', 'person', 'stage', 'pipeline', 'closedate', 'custom', 'version', 'rank']);

/*
 * Stock lists of a new portal, per language. Deals store the source / reason text itself, so these
 * lists are never relabelled once a portal has them: migration 001 (schema.js storeStockLists)
 * stores them once — in the portal language while there are no deals, else the Russian lists older
 * versions always showed (the texts the deals hold).
 * Only the section titles (not stored in deals) follow the portal language while unsaved
 * (resolveModules → localizedDefaults, the package's `localizedSettings`).
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

export const defaultEnabled = true;
export const defaults = CRM_DEFAULTS;
export const sanitizeSettings = sanitizeCrm;
export const localizedSettings = crmLocalizedDefaults;
