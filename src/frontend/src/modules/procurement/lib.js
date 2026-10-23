import { formatMoney } from '../approvals/public';
import { todayISO } from '../../lib/datetime';
import { formatBytes } from '../../lib/format';

export { formatMoney };

/** Status colours (soft pills, kanban columns). */
export const STATUS_COLORS = {
  draft: '#94A3B8',
  pending: '#F59E0B',
  question: '#F97316',
  returned: '#EA580C',
  to_pay: '#2563EB',
  partially_paid: '#6366F1',
  paid: '#10B981',
  delivered: '#0D9488',
  closed: '#64748B',
  rejected: '#E5484D',
  cancelled: '#A1A1AA',
};

/** Kanban columns: the side statuses (rejected, cancelled) at the end. */
export const BOARD_STATUSES = ['draft', 'pending', 'question', 'returned', 'to_pay', 'partially_paid', 'paid', 'delivered', 'closed', 'rejected', 'cancelled'];

export const CHIPS = ['mine', 'waiting', 'urgent', 'overdue', 'to_pay', 'active', 'finished'];

export const DOC_ICONS = { invoice: '🧾', quote: '💬', spec: '📋', photo: '📷', waybill: '🚚', act: '✍️', payment: '💳', other: '📎' };

/** 'overdue' | 'soon' | 'ok' | 'none' | 'done' for a calendar day deadline (YYYY-MM-DD). */
export function dayState(value, done = false, soonDays = 1) {
  if (done) return 'done';
  if (!value) return 'none';
  const today = todayISO();
  if (value < today) return 'overdue';
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + Math.max(1, soonDays));
  return value <= soon.toISOString().slice(0, 10) ? 'soon' : 'ok';
}

/** A category of the settings, or a stub for an unknown key. */
export function categoryOf(meta, key) {
  if (!key) return null;
  return meta?.settings?.categories?.find((item) => item.key === key) || { key, name: key, color: '#94A3B8' };
}

/** Sum of line items. */
export const itemsSum = (items) => Math.round((items || []).reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0) * 100) / 100;

/** Sum per currency of a list: "5 000 $ · 120 000 сом". */
export function totalsText(totals, locale) {
  return (totals || []).map((item) => formatMoney(item.amount, item.currency, locale)).join(' · ');
}

const FILE_PREVIEW = /\.(pdf|png|jpe?g|gif|webp|bmp)$/i;
export const canPreview = (doc) => FILE_PREVIEW.test(doc?.name || '');
export const isImage = (doc) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(doc?.name || '');

/** File size in the interface language (lib/format.js). */
export const formatSize = (bytes) => formatBytes(bytes);

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
