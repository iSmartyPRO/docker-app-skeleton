import { formatMoney } from '../approvals/public';
import { errorMessage } from '../../lib/errors';
import { localeTag } from '../../i18n/languages';

export { formatMoney };

/** Document status colours (soft pills). */
export const STATUS_COLORS = {
  draft: '#94A3B8',
  requested: '#0EA5E9',
  pending: '#F59E0B',
  approved: '#6366F1',
  shipped: '#8B5CF6',
  posted: '#10B981',
  reversed: '#A1A1AA',
  rejected: '#E5484D',
  cancelled: '#A1A1AA',
};

/** Document types: icon (MenuIcon) and colour. */
export const TYPE_LOOK = {
  receipt: { icon: 'download', color: '#10B981' },
  supplier_return: { icon: 'upload', color: '#F97316' },
  transfer: { icon: 'send', color: '#8B5CF6' },
  issue: { icon: 'share', color: '#2563EB' },
  return: { icon: 'archive', color: '#0D9488' },
  writeoff: { icon: 'trash', color: '#E5484D' },
  opening: { icon: 'flag', color: '#64748B' },
  correction: { icon: 'edit', color: '#A855F7' },
  inventory: { icon: 'checklist', color: '#0EA5E9' },
  discrepancy: { icon: 'alert', color: '#F59E0B' },
  handover: { icon: 'wrench', color: '#D9480F' },
  storno: { icon: 'ban', color: '#71717A' },
};

/** Types offered under «+» (in this order) and the right each needs somewhere. */
export const CREATE_TYPES = [
  { type: 'receipt', right: 'canOperateAny' },
  { type: 'issue', right: 'canRequestAny' },
  { type: 'transfer', right: 'canOperateAny' },
  { type: 'return', right: 'canOperateAny' },
  { type: 'writeoff', right: 'canWriteoffAny' },
  { type: 'supplier_return', right: 'canOperateAny' },
  { type: 'opening', right: 'canAdminAny' },
  { type: 'correction', right: 'canAdminAny' },
];

export const STOCK_CHIPS = ['below_min', 'out', 'expiring', 'reserved', 'stale', 'mine'];
export const DOC_CHIPS = ['my_drafts', 'awaiting_receipt', 'awaiting_approval', 'requests', 'today', 'handovers'];

/** Where goods come from / go to, per type: 'warehouse' | 'holder' | 'supplier' | 'expense' | 'delta'. */
export const SIDES = {
  receipt: ['supplier', 'warehouse'],
  supplier_return: ['warehouse', 'supplier'],
  transfer: ['warehouse', 'warehouse'],
  issue: ['warehouse', 'holder'],
  return: ['holder', 'warehouse'],
  writeoff: ['warehouse', 'expense'],
  opening: ['supplier', 'warehouse'],
  correction: ['warehouse', 'delta'],
  inventory: ['warehouse', 'delta'],
  handover: ['holder', 'holder'],
};

/** A quantity with separators and up to 4 decimals. */
export function formatQty(value, locale) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 4 }).format(Number(value));
}

/** «2 уп = 48 шт» for a line in a non-base unit. */
export function conversionText(line, locale) {
  if (!line?.item || !line.unit || line.unit === line.item.baseUnit) return '';
  return `${formatQty(line.qty, locale)} ${line.unit} = ${formatQty(line.baseQty, locale)} ${line.item.baseUnit}`;
}

/** Units of an item for a select: base first, then the extra ones with their factors. */
export function unitOptions(item) {
  if (!item) return [];
  return [{ value: item.baseUnit, label: item.baseUnit }, ...(item.units || []).map((unit) => ({ value: unit.code, label: `${unit.code} = ${unit.factor} ${item.baseUnit}` }))];
}

/** Error codes of the module, in the UI language; shortages listed. */
export function whError(err, t) {
  const data = err?.response?.data;
  const code = data?.code;
  if (code === 'INSUFFICIENT' && data?.info?.shortages?.length) {
    const first = data.info.shortages[0];
    return t('wh.errors.INSUFFICIENT_ITEM', { name: first.name || `#${first.itemId}`, need: first.need, available: first.available, unit: first.unit || '' });
  }
  // Plain values of the error's info fill the message ({inventoryNo}, …).
  const params = data?.info && typeof data.info === 'object' ? Object.fromEntries(Object.entries(data.info).filter(([, v]) => ['string', 'number'].includes(typeof v))) : undefined;
  const known = code && t(`wh.errors.${code}`, params);
  return known && !known.startsWith('wh.errors.') ? known : errorMessage(err);
}

/** Remembers small per-person UI choices (view, filters); never required. */
export function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

/** A short sound + vibration confirming a scan (spec §2 «звук или вибрация подтверждают скан»). */
export function scanFeedback(ok = true) {
  try {
    navigator.vibrate?.(ok ? 40 : [60, 40, 60]);
  } catch {
    /* no vibration */
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1320 : 260;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.2));
    osc.onended = () => ctx.close();
  } catch {
    /* no audio */
  }
}

/** Label items for printing (lib/labels.js): an item, a bin, a tool. */
export function itemLabel(item) {
  const code = item.labelCode || `WI-${item.id}`;
  const kind = /^\d{13}$/.test(code) ? 'ean13' : 'code128';
  return { code, title: item.name, subtitle: [item.sku, item.baseUnit].filter(Boolean).join(' · '), kind };
}

export function binLabel(bin, warehouse) {
  return { code: bin.labelCode || `WB-${bin.id}`, title: bin.path, subtitle: warehouse?.name || '', kind: 'qr' };
}

export function toolLabel(tool) {
  return { code: tool.inventoryNo, title: tool.item?.name || '', subtitle: tool.serialNo ? `S/N ${tool.serialNo}` : '', kind: 'qr' };
}

/** Category tree for a TreeSelect (archived ones left out). */
export function categoryTree(categories) {
  const byParent = new Map();
  for (const c of (categories || []).filter((entry) => !entry.archived)) byParent.set(c.parentId || 0, [...(byParent.get(c.parentId || 0) || []), c]);
  const build = (parent) => (byParent.get(parent) || []).map((c) => ({ value: c.id, title: c.name, children: build(c.id) }));
  return build(0);
}
