/*
 * Procurement settings (settings.modules.procurement, docs/procurement.md): the
 * defaults the package manifest carries (scripts/build-module.mjs reads `defaults`
 * from here) and the sanitizer the portal uses for them (index.js exports it as
 * `sanitizeSettings`) — moved out of the core's modules/catalog.js. Plain data and
 * pure functions, no imports: read at build time too.
 */

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

const HEX = /^#[0-9a-f]{6}$/i;

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

// A business module: off until an administrator turns it on (Settings → Modules).
export const defaultEnabled = false;
export const defaults = PROCUREMENT_DEFAULTS;
export const sanitizeSettings = sanitizeProcurement;
