import { formatDate } from '../../services/datetime.js';
import { formatNumber, translator } from '../../services/i18n/index.js';

/*
 * Notification texts of the Warehouse module in the recipient's language
 * (locales/<lang>/warehouse.js → notify.*) and regional settings. No sums:
 * they may reach people without warehouse.cost.
 */

const lines = (...parts) => parts.filter(Boolean).join('\n');
const head = (doc) => [doc.number, doc.title].filter(Boolean).join(' · ');
const dayText = (value, locale, regional) => (value ? formatDate(String(value).slice(0, 10), regional || undefined, locale) : '');
const qtyText = (qty, unit, locale) => `${formatNumber(locale, Number(qty) || 0, { maximumFractionDigits: 4 })} ${unit || ''}`.trim();
const list = (t, rows, max = 8) => {
  const shown = rows.slice(0, max).map((row) => `• ${row.name} — ${qtyText(row.qty, row.unit, t.locale)}${row.min !== undefined && row.min !== null ? t('warehouse.notify.min', { qty: qtyText(row.min, row.unit, t.locale) }) : ''}`);
  if (rows.length > max) shown.push(t('warehouse.notify.more', { count: rows.length - max }));
  return shown.join('\n');
};
const n = (key) => `warehouse.notify.${key}`;

export const WAREHOUSE_MESSAGES = {
  transferIncoming: (t, { doc, from, to, actor }) => ({
    title: t(n('transferIncoming.title'), { number: doc.number }),
    body: lines(`${from} → ${to}`, t(n('lines'), { count: doc.lines }), actor ? t(n('transferIncoming.by'), { actor }) : '', t(n('transferIncoming.body'))),
  }),
  requested: (t, { doc, warehouse, actor }) => ({
    title: t(n('requested.title'), { number: doc.number }),
    body: lines(`${warehouse} → ${doc.recipient || ''}`, t(n('lines'), { count: doc.lines }), actor ? t(n('requested.from'), { actor }) : ''),
  }),
  issued: (t, { doc, warehouse, actor }) => ({ title: t(n('issued.title'), { number: doc.number }), body: lines(`${warehouse} → ${doc.recipient || ''}`, t(n('lines'), { count: doc.lines }), actor) }),
  discrepancy: (t, { doc, act, rows }) => ({
    title: t(n('discrepancy.title'), { number: doc.number }),
    body: lines(t(n('discrepancy.act'), { act }), ...rows.map((row) => `• ${row.name}: ${row.diff > 0 ? '+' : ''}${qtyText(row.diff, row.unit, t.locale)}`)),
  }),
  handover: (t, { doc, actor, items }) => ({ title: t(n('handover.title'), { actor }), body: lines(items, t(n('handover.body'), { number: doc.number })) }),
  handoverDone: (t, { doc, actor, accepted }) => ({ title: t(n(`handoverDone.${accepted ? 'accepted' : 'declined'}`), { actor, number: doc.number }), body: '' }),
  lowStock: (t, { warehouse, rows }) => ({ title: t(n('lowStock.title'), { count: rows.length, warehouse }), body: list(t, rows) }),
  expiring: (t, { warehouse, rows, regional }) => ({
    title: t(n('expiring.title'), { warehouse }),
    body: rows
      .slice(0, 10)
      .map((row) => t(n('expiring.row'), { name: row.name, batch: row.batch, date: dayText(row.expiresOn, t.locale, regional) }))
      .join('\n'),
  }),
  service: (t, { tool, due, regional, overdue }) => ({
    title: overdue ? t(n('service.overdue'), { tool }) : t(n('service.due'), { tool, date: dayText(due, t.locale, regional) }),
    body: t(n('service.body')),
  }),
  toolOverdue: (t, { doc, due, regional, items }) => ({ title: t(n('toolOverdue.title'), { number: doc.number }), body: lines(t(n('wasDue'), { date: dayText(due, t.locale, regional) }), items) }),
  inventoryAssigned: (t, { session = {}, warehouse, actor, bins = [] }) => ({
    title: t(n('inventoryAssigned.title'), { number: session.number, warehouse }),
    body: lines(session.title, bins.length ? t(n('inventoryAssigned.bins'), { bins: bins.join(', ') }) : '', actor ? t(n('inventoryAssigned.by'), { actor }) : '', t(n('inventoryAssigned.body'))),
  }),
  inventoryRecount: (t, { session = {}, bin, item }) => ({
    title: t(n('inventoryRecount.title'), { number: session.number }),
    body: lines(bin ? t(n('inventoryRecount.bin'), { bin }) : t(n('inventoryRecount.noBin')), item ? t(n('inventoryRecount.item'), { item }) : t(n('inventoryRecount.wholeBin'))),
  }),
  inventoryDue: (t, { warehouse, title, categories = [], due, everyDays = 30, regional }) => ({
    title: t(n('inventoryDue.title'), { warehouse }),
    body: lines(
      title,
      categories.length ? t(n('inventoryDue.categories'), { categories: categories.join(', ') }) : '',
      t(n('inventoryDue.schedule'), { date: dayText(due, t.locale, regional), days: everyDays }),
      t(n('inventoryDue.body'))
    ),
  }),
  postFailed: (t, { doc, reason }) => ({ title: t(n('postFailed.title'), { doc: head(doc) }), body: lines(reason, t(n('postFailed.body'))) }),
};

/** `render` for notify(): the recipient's language and regional settings. */
export function warehouseMessage(kind, params) {
  return (locale, regional) => WAREHOUSE_MESSAGES[kind](translator(locale), { ...params, regional: regional || null });
}
