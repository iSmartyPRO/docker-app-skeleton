/*
 * Warehouse settings (settings.modules.warehouse, docs/warehouse.md): the
 * defaults the package manifest carries (scripts/build-module.mjs reads `defaults`
 * from here) and the sanitizer the portal uses for them (index.js exports it as
 * `sanitizeSettings`) — moved out of the core's modules/catalog.js. Plain data and
 * pure functions, no imports: read at build time too.
 */

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

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

// A business module: off until an administrator turns it on (docs/warehouse.md).
export const defaultEnabled = false;
export const defaults = WAREHOUSE_DEFAULTS;
export const sanitizeSettings = sanitizeWarehouse;
