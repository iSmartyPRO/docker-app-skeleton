import dayjs from 'dayjs';
import { formatDue, formatMoney } from '../lib';

/** A stage of an event (string or { name, color }) as a coloured chip. */
function StageChip({ stage }) {
  if (!stage) return <span className="dp-ev__chip">—</span>;
  const name = typeof stage === 'object' ? stage.name : stage;
  const color = typeof stage === 'object' ? stage.color : null;
  return (
    <span className="dp-ev__chip" style={color ? { '--c': color } : undefined}>
      {color && <span className="status-pip" />}
      {name}
    </span>
  );
}

const BUILTIN_FIELDS = ['title', 'amount', 'currency', 'company', 'person', 'owner', 'source', 'comment', 'closeDate', 'watchers', 'lostReason'];

const nameOf = (value) => (value && typeof value === 'object' ? value.name || value.title || value.label : value);

function plain(value, t, locale, data) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return t('crm.fields.empty');
  if (Array.isArray(value)) return value.map((item) => nameOf(item)).join(', ');
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
  if (typeof value === 'object' && value.amount !== undefined) return formatMoney(value.amount, value.currency, locale);
  if (typeof value === 'object') return nameOf(value) || '…';
  if (data?.field === 'amount' && data?.currency) return formatMoney(value, data.currency, locale);
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(String(value))) return dayjs(value).format(String(value).length > 10 ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY');
  return String(value);
}

/**
 * How a history event reads: { icon, tone, text (node) }. Data shapes are
 * read defensively — names or { name, color } objects.
 */
export function eventView(event, { t, locale }) {
  const data = event.data || {};
  const act = data.activity || data;
  switch (event.kind) {
    case 'created':
      return { icon: '✦', text: t('crm.ev.created') };
    case 'stage':
    case 'won':
    case 'lost': {
      const reason = data.lostReason || data.reason;
      if (event.kind === 'won' && !data.from) return { icon: '🏆', tone: 'ok', text: t('crm.ev.won') };
      if (event.kind === 'lost' && !data.from) return { icon: '✕', tone: 'danger', text: reason ? t('crm.ev.lostReason', { reason }) : t('crm.ev.lost') };
      return {
        icon: event.kind === 'won' ? '🏆' : event.kind === 'lost' ? '✕' : '→',
        tone: event.kind === 'won' ? 'ok' : event.kind === 'lost' ? 'danger' : undefined,
        text: (
          <>
            {t(event.kind === 'won' ? 'crm.ev.wonFrom' : event.kind === 'lost' ? 'crm.ev.lostFrom' : 'crm.ev.stage')} <StageChip stage={data.from} /> <span className="dp-ev__arrow">→</span> <StageChip stage={data.to} />
            {reason && <span className="dp-ev__reason">{t('crm.ev.reason', { reason })}</span>}
          </>
        ),
      };
    }
    case 'deleted':
      return { icon: '🗑', tone: 'danger', text: t('crm.ev.deleted') };
    case 'restored':
      return { icon: '↺', text: t('crm.ev.restored') };
    case 'pipeline':
      return { icon: '⇄', text: t('crm.ev.pipeline', { from: nameOf(data.from) || '—', to: nameOf(data.to) || '—' }) };
    case 'owner':
      return {
        icon: '👤',
        text: data.to ? (data.from ? t('crm.ev.ownerFrom', { from: nameOf(data.from), to: nameOf(data.to) }) : t('crm.ev.owner', { to: nameOf(data.to) })) : t('crm.ev.ownerNone'),
      };
    case 'field': {
      if (data.field === 'watchers') {
        const parts = [];
        if (data.added?.length) parts.push(t('crm.ev.watchersAdded', { names: data.added.filter(Boolean).join(', ') }));
        if (data.removed?.length) parts.push(t('crm.ev.watchersRemoved', { names: data.removed.filter(Boolean).join(', ') }));
        return { icon: '👁', text: parts.join('; ') || t('crm.ev.changed') };
      }
      const label = BUILTIN_FIELDS.includes(data.field) ? t(`crm.fields.${data.field}`) : data.label || data.field || '';
      return {
        icon: '✎',
        text: (
          <>
            {t('crm.ev.field', { label })}{' '}
            <span className="dp-ev__old">{plain(data.old ?? data.from, t, locale, data)}</span> <span className="dp-ev__arrow">→</span>{' '}
            <span className="dp-ev__new">{plain(data.new ?? data.to, t, locale, data)}</span>
          </>
        ),
      };
    }
    case 'comment':
      return { icon: '💬', comment: true, text: event.body };
    case 'activity_added':
      return { icon: '📌', text: t('crm.ev.activityAdded', { title: act.title || t(`crm.act.kind.${act.kind || 'other'}`), due: act.dueAt ? formatDue(act.dueAt, locale, t) : t('crm.act.noDue') }) };
    case 'activity_done':
      return { icon: '✓', tone: 'ok', text: t('crm.ev.activityDone', { title: act.title || t(`crm.act.kind.${act.kind || 'other'}`) }) };
    case 'activity_updated':
      return { icon: '✎', text: t('crm.ev.activityUpdated', { title: act.title || t(`crm.act.kind.${act.kind || 'other'}`) }) };
    case 'activity_deleted':
      return { icon: '🗑', text: t('crm.ev.activityDeleted', { title: act.title || t(`crm.act.kind.${act.kind || 'other'}`) }) };
    case 'activity_reopened':
      return { icon: '↺', text: t('crm.ev.activityReopened', { title: act.title || '' }) };
    default:
      return { icon: '•', text: event.body || t('crm.ev.changed') };
  }
}

/** "Сегодня", "Вчера", "12 октября" — headings of the history. */
export function dayLabel(value, { t, locale }) {
  const date = dayjs(value);
  if (date.isSame(dayjs(), 'day')) return t('crm.due.today');
  if (date.isSame(dayjs().subtract(1, 'day'), 'day')) return t('crm.due.yesterday');
  return date.toDate().toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', ...(date.isSame(dayjs(), 'year') ? {} : { year: 'numeric' }) });
}
