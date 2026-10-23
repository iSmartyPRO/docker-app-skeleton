/*
 * Masterplan settings (settings.modules.masterplan, docs/masterplan.md): the
 * defaults the package manifest carries (scripts/build-module.mjs reads
 * `defaults` from here) and the sanitizer the portal uses for them
 * (index.js exports it as `sanitizeSettings`). Plain data and pure
 * functions, no imports: read at build time too.
 */

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const HEX = /^#[0-9a-f]{6}$/i;

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

/** What the package manifest takes (scripts/build-module.mjs): settings.modules.masterplan. */
export const defaults = MASTERPLAN_DEFAULTS;
// Off until an administrator turns it on (Settings → Modules); then roles are granted per project.
export const defaultEnabled = false;
export const sanitizeSettings = sanitizeMasterplan;
