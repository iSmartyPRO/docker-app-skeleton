import { useEffect, useState } from 'react';
import { approvalsApi } from './api';
import { localeTag } from '../../lib/format';
import { inZone, nowInZone } from '../../lib/datetime';

/** Stock urgency levels, used until the settings load (and for their translated names). */
export const STOCK_URGENCIES = [
  { key: 'critical', label: '', color: '#E5484D', hours: 4, icon: 'flame' },
  { key: 'urgent', label: '', color: '#F59E0B', hours: 24, icon: 'bolt' },
  { key: 'normal', label: '', color: '#3B82F6', hours: 72, icon: 'clock' },
];

export const URGENCY_GLYPH = { flame: '🔥', bolt: '⚡', clock: '🕒', alert: '⚠️', flag: '🚩', hourglass: '⏳', star: '⭐', leaf: '🍃' };

/** Module colours and icons for rows of the inbox (modules unknown here fall back to grey). */
export const MODULE_LOOK = {
  procurement: { color: '#F97316', icon: 'cart' },
  contracts: { color: '#6366F1', icon: 'clipboard' },
  tasks: { color: '#10B981', icon: 'tasks' },
  crm: { color: '#E03131', icon: 'target' },
  masterplan: { color: '#0F766E', icon: 'siteplan' },
  warehouse: { color: '#0EA5E9', icon: 'box' },
  test: { color: '#64748B', icon: 'flask' },
};

let metaCache = null;
let metaPromise = null;

/** Approvals meta (urgency levels, types, rights), shared by every component on the page. */
export function loadMeta(force = false) {
  if (force) {
    metaCache = null;
    metaPromise = null;
  }
  if (metaCache) return Promise.resolve(metaCache);
  if (!metaPromise) {
    metaPromise = approvalsApi
      .meta()
      .then((res) => {
        metaCache = res.data;
        return metaCache;
      })
      .catch((err) => {
        metaPromise = null;
        throw err;
      });
  }
  return metaPromise;
}

export function useApprovalsMeta() {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    let alive = true;
    loadMeta()
      .then((data) => alive && setMeta(data))
      .catch(() => alive && setMeta((prev) => prev || { settings: { urgencies: STOCK_URGENCIES, soonHours: 24 }, types: [], canAdmin: false }));
    return () => {
      alive = false;
    };
  }, []);
  return meta;
}

export function urgencyLevels(meta) {
  return meta?.settings?.urgencies?.length ? meta.settings.urgencies : STOCK_URGENCIES;
}

export function urgencyOf(meta, key) {
  const levels = urgencyLevels(meta);
  return levels.find((level) => level.key === key) || null;
}

/** Name of an urgency level: the administrator's label, else the translation of a stock key. */
export function urgencyName(level, t) {
  if (!level) return '';
  if (level.label) return level.label;
  const stock = t(`approvals.urgency.${level.key}`);
  return stock && !stock.startsWith('approvals.') ? stock : level.key;
}

/** A translation, or `fallback` when the key is missing (t() returns the key itself then). */
export function tOr(t, key, fallback, params) {
  const value = t(key, params);
  return value === key ? fallback : value;
}

/** A { ru, en } title or a string. */
export const tr = (value, locale) => (value && typeof value === 'object' ? value[locale] || value.ru || value.en || '' : value || '');

export function typeTitle(meta, key, locale, fallback) {
  const type = meta?.types?.find((item) => item.key === key);
  return tr(type?.title || fallback || key, locale);
}

/** 'overdue' | 'soon' | 'ok' | 'none' */
export function slaOf(dueAt, soonHours = 24, now = Date.now()) {
  if (!dueAt) return 'none';
  const due = new Date(dueAt).getTime();
  if (due <= now) return 'overdue';
  if (due - now <= soonHours * 3600 * 1000) return 'soon';
  return 'ok';
}

/** "2 ч 15 мин", "3 дн" — a duration, short. */
export function shortDuration(ms, t) {
  if (ms === null || ms === undefined) return '';
  const minutes = Math.max(0, Math.round(Math.abs(ms) / 60000));
  if (minutes < 60) return t('approvals.time.minutes', { n: Math.max(1, minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 && hours < 10 ? t('approvals.time.hoursMinutes', { h: hours, m: minutes % 60 }) : t('approvals.time.hours', { n: hours });
  return t('approvals.time.days', { n: Math.round(hours / 24) });
}

/** "просрочено на 5 ч" / "осталось 3 ч" for a deadline. */
export function dueText(dueAt, t) {
  if (!dueAt) return t('approvals.due.none');
  const diff = new Date(dueAt).getTime() - Date.now();
  return diff <= 0 ? t('approvals.due.overdueBy', { d: shortDuration(-diff, t) }) : t('approvals.due.left', { d: shortDuration(diff, t) });
}

/** Amount with currency and separators ("5 000 $", "120 000 сом"). */
export function formatMoney(amount, currency, locale) {
  if (amount === null || amount === undefined || amount === '') return '';
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  const digits = Number.isInteger(value) ? 0 : 2;
  if (currency === 'KGS') return `${new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: digits }).format(value)} ${locale === 'ru' ? 'сом' : 'KGS'}`;
  if (!currency) return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: digits }).format(value);
  try {
    return new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

/** Inbox groups: overdue, due today (the person's zone), the rest. */
export function groupItems(items) {
  const today = nowInZone().format('YYYY-MM-DD');
  const groups = { overdue: [], today: [], rest: [] };
  for (const item of items) {
    if (item.overdue) groups.overdue.push(item);
    else if (item.dueAt && inZone(item.dueAt)?.format('YYYY-MM-DD') === today) groups.today.push(item);
    else groups.rest.push(item);
  }
  return groups;
}
