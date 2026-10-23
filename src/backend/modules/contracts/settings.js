/*
 * Contracts settings (settings.modules.contracts, docs/contracts.md): the defaults
 * the package manifest carries (scripts/build-module.mjs reads `defaults` from
 * here), the sanitizer the portal uses for them (index.js exports it as
 * `sanitizeSettings`) and the read-time upgrade of settings saved by older
 * versions (`upgradeSettings`). Plain data and pure functions, no imports: read
 * at build time too.
 */

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

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

// A business module: off until an administrator turns it on.
export const defaultEnabled = false;
export const defaults = CONTRACTS_DEFAULTS;
export const sanitizeSettings = sanitizeContracts;
export const upgradeSettings = upgradeContracts;
