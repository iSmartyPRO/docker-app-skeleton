import { todayISO } from '../../lib/datetime';

export { formatMoney } from '../approvals/lib';

export const TYPE_KEY = 'contracts.contract';

/** Status colours (tokens come from contracts.css; these feed dots and the calendar). */
export const STATUS_LOOK = {
  draft: { color: '#94A3B8', icon: '✎' },
  approval: { color: '#F59E0B', icon: '⏳' },
  question: { color: '#F97316', icon: '?' },
  approved: { color: '#6366F1', icon: '✓' },
  signed: { color: '#0EA5E9', icon: '✍' },
  active: { color: '#10B981', icon: '●' },
  expiring: { color: '#EAB308', icon: '⌛' },
  completed: { color: '#64748B', icon: '■' },
  rejected: { color: '#EF4444', icon: '✕' },
  terminated: { color: '#B91C1C', icon: '⊘' },
};

export const STATUS_ORDER = ['draft', 'approval', 'question', 'approved', 'signed', 'active', 'expiring', 'completed', 'rejected', 'terminated'];

export const VIEWS = ['all', 'mine', 'waiting', 'urgent', 'overdue', 'work', 'active', 'expiring', 'unsigned', 'archive'];

export const IMPORTANCE_LOOK = { high: '#E5484D', medium: '#F59E0B', low: '#64748B' };

/** A contract type's name: the administrator's label, else the stock translation. */
export function typeLabel(settings, key, t) {
  if (!key) return '';
  const type = (settings?.types || []).find((item) => item.key === key);
  if (type?.label) return type.label;
  const stock = t(`contracts.types.${key}`);
  return stock.startsWith('contracts.types.') ? key : stock;
}

/** Whole days from today (the person's zone) to a 'YYYY-MM-DD' day. */
export function daysLeft(day, today = todayISO()) {
  if (!day) return null;
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/**
 * Colour of an end date: red past, amber within the expiring window,
 * green far away, grey for finished or not running contracts.
 */
export function endTone(contract, expiringDays = 30, today = todayISO()) {
  if (!contract.endsOn) return 'none';
  if (['completed', 'terminated', 'rejected'].includes(contract.status)) return 'none';
  const left = daysLeft(contract.endsOn, today);
  if (left < 0) return 'overdue';
  if (left <= Math.min(7, expiringDays)) return 'soon';
  if (left <= expiringDays) return 'warn';
  return 'ok';
}

export const errorCode = (err) => err?.response?.data?.code || null;

/** Is a dropdown, picker or dialog on top (Esc and arrows belong to it)? */
export function overlayOpen() {
  return Boolean(
    document.querySelector(
      '.ant-modal-wrap:not([style*="display: none"]), .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden), .ant-drawer-open'
    )
  );
}

export const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export const fileKind = (ext) => {
  const e = String(ext || '').toLowerCase();
  if (e === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(e)) return 'image';
  if (['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'].includes(e)) return 'office';
  return 'other';
};
