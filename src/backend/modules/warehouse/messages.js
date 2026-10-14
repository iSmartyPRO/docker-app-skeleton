import { formatDate } from '../../services/datetime.js';

/** Notification texts of the Warehouse module, per recipient language and regional settings. No sums: they may reach people without warehouse.cost. */

const lines = (...parts) => parts.filter(Boolean).join('\n');
const head = (doc) => [doc.number, doc.title].filter(Boolean).join(' · ');
const dayText = (value, locale, regional) => (value ? formatDate(String(value).slice(0, 10), regional || undefined, locale) : '');
const qtyText = (qty, unit, locale) => `${new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 4 }).format(Number(qty) || 0)} ${unit || ''}`.trim();
const list = (rows, locale, max = 8) => {
  const shown = rows.slice(0, max).map((row) => `• ${row.name} — ${qtyText(row.qty, row.unit, locale)}${row.min !== undefined && row.min !== null ? (locale === 'ru' ? ` (мин. ${qtyText(row.min, row.unit, locale)})` : ` (min ${qtyText(row.min, row.unit, locale)})`) : ''}`);
  if (rows.length > max) shown.push(locale === 'ru' ? `…и ещё ${rows.length - max}` : `…and ${rows.length - max} more`);
  return shown.join('\n');
};

export const WAREHOUSE_MESSAGES = {
  transferIncoming: ({ doc, from, to, actor }) => ({
    en: { title: `Incoming transfer ${doc.number}`, body: lines(`${from} → ${to}`, `Lines: ${doc.lines}`, actor ? `Shipped by ${actor}` : '', 'Accept it and check the quantities.') },
    ru: { title: `Входящее перемещение ${doc.number}`, body: lines(`${from} → ${to}`, `Позиций: ${doc.lines}`, actor ? `Отгрузил: ${actor}` : '', 'Примите его и проверьте количество.') },
  }),
  requested: ({ doc, warehouse, actor }) => ({
    en: { title: `Requisition ${doc.number}`, body: lines(`${warehouse} → ${doc.recipient || ''}`, `Lines: ${doc.lines}`, actor ? `From ${actor}` : '') },
    ru: { title: `Требование ${doc.number}`, body: lines(`${warehouse} → ${doc.recipient || ''}`, `Позиций: ${doc.lines}`, actor ? `От: ${actor}` : '') },
  }),
  issued: ({ doc, warehouse, actor }) => ({
    en: { title: `Issued: ${doc.number}`, body: lines(`${warehouse} → ${doc.recipient || ''}`, `Lines: ${doc.lines}`, actor) },
    ru: { title: `Выдано: ${doc.number}`, body: lines(`${warehouse} → ${doc.recipient || ''}`, `Позиций: ${doc.lines}`, actor) },
  }),
  discrepancy: ({ doc, act, rows }) => ({
    en: { title: `Discrepancy on ${doc.number}`, body: lines(`Act ${act}`, ...rows.map((row) => `• ${row.name}: ${row.diff > 0 ? '+' : ''}${qtyText(row.diff, row.unit, 'en')}`)) },
    ru: { title: `Расхождение при приёмке ${doc.number}`, body: lines(`Акт ${act}`, ...rows.map((row) => `• ${row.name}: ${row.diff > 0 ? '+' : ''}${qtyText(row.diff, row.unit, 'ru')}`)) },
  }),
  handover: ({ doc, actor, items }) => ({
    en: { title: `${actor} hands tools over to you`, body: lines(items, `Confirm that you received them (${doc.number}).`) },
    ru: { title: `${actor} передаёт вам инструмент`, body: lines(items, `Подтвердите, что получили (${doc.number}).`) },
  }),
  handoverDone: ({ doc, actor, accepted }) => ({
    en: { title: accepted ? `${actor} accepted the tools (${doc.number})` : `${actor} declined the handover ${doc.number}`, body: '' },
    ru: { title: accepted ? `${actor} принял инструмент (${doc.number})` : `${actor} отказался от передачи ${doc.number}`, body: '' },
  }),
  lowStock: ({ warehouse, rows }) => ({
    en: { title: `Below minimum: ${rows.length} item(s) at ${warehouse}`, body: list(rows, 'en') },
    ru: { title: `Ниже минимума: ${rows.length} поз. на складе «${warehouse}»`, body: list(rows, 'ru') },
  }),
  expiring: ({ warehouse, rows, regional }) => ({
    en: { title: `Batches expiring at ${warehouse}`, body: rows.slice(0, 10).map((row) => `• ${row.name}, batch ${row.batch} — ${dayText(row.expiresOn, 'en', regional)}`).join('\n') },
    ru: { title: `Истекает срок годности: склад «${warehouse}»`, body: rows.slice(0, 10).map((row) => `• ${row.name}, партия ${row.batch} — ${dayText(row.expiresOn, 'ru', regional)}`).join('\n') },
  }),
  service: ({ tool, due, regional, overdue }) => ({
    en: { title: overdue ? `Service overdue: ${tool}` : `Service due ${dayText(due, 'en', regional)}: ${tool}`, body: 'Maintenance or calibration of the tool.' },
    ru: { title: overdue ? `Просрочено ТО: ${tool}` : `ТО до ${dayText(due, 'ru', regional)}: ${tool}`, body: 'Обслуживание или поверка инструмента.' },
  }),
  toolOverdue: ({ doc, due, regional, items }) => ({
    en: { title: `Not returned on time: ${doc.number}`, body: lines(`Was due ${dayText(due, 'en', regional)}`, items) },
    ru: { title: `Не возвращено в срок: ${doc.number}`, body: lines(`Срок был ${dayText(due, 'ru', regional)}`, items) },
  }),
  inventoryAssigned: ({ session = {}, warehouse, actor, bins = [] }) => ({
    en: { title: `Inventory ${session.number}: you count at ${warehouse}`, body: lines(session.title, bins.length ? `Bins: ${bins.join(', ')}` : '', actor ? `Assigned by ${actor}` : '', 'Open it on the phone: scan a bin, then the items.') },
    ru: { title: `Инвентаризация ${session.number}: вы считаете на складе «${warehouse}»`, body: lines(session.title, bins.length ? `Ячейки: ${bins.join(', ')}` : '', actor ? `Назначил: ${actor}` : '', 'Откройте с телефона: сканируйте ячейку, затем позиции.') },
  }),
  inventoryRecount: ({ session = {}, bin, item }) => ({
    en: { title: `Recount in ${session.number}`, body: lines(bin ? `Bin ${bin}` : 'Without a bin', item ? `Item: ${item}` : 'The whole bin') },
    ru: { title: `Пересчитать: ${session.number}`, body: lines(bin ? `Ячейка ${bin}` : 'Без ячейки', item ? `Позиция: ${item}` : 'Вся ячейка') },
  }),
  inventoryDue: ({ warehouse, title, categories = [], due, everyDays = 30, regional }) => ({
    en: { title: `Regular inventory due: ${warehouse}`, body: lines(title, categories.length ? `Categories: ${categories.join(', ')}` : '', `Due ${dayText(due, 'en', regional)} · every ${everyDays} days`, 'Start it from «Inventory».') },
    ru: { title: `Пора провести инвентаризацию: склад «${warehouse}»`, body: lines(title, categories.length ? `Категории: ${categories.join(', ')}` : '', `Срок ${dayText(due, 'ru', regional)} · каждые ${everyDays} дн.`, 'Запустите её в разделе «Инвентаризация».') },
  }),
  postFailed: ({ doc, reason }) => ({
    en: { title: `Approved but not posted: ${head(doc)}`, body: lines(reason, 'Post it again when the stock is there.') },
    ru: { title: `Согласовано, но не проведено: ${head(doc)}`, body: lines(reason, 'Проведите документ ещё раз, когда остаток появится.') },
  }),
};

/** `render` for notify(): the recipient's language and regional settings. */
export function warehouseMessage(kind, params) {
  return (locale, regional) => {
    const texts = WAREHOUSE_MESSAGES[kind]({ ...params, regional: regional || null });
    return texts[locale] || texts.en;
  };
}
