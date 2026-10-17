import { formatDateTime } from '../../services/datetime.js';
import { translator } from '../../services/i18n/index.js';

/*
 * Notification texts of the Masterplan module in the recipient's language
 * (locales/<lang>/masterplan.js → notify.*; pattern: tasks/messages.js).
 * Moments are written in the recipient's region settings (`regional` comes
 * from notify()).
 */

const lines = (...parts) => parts.filter(Boolean).join('\n');
const when = (t, value, regional) => (value ? formatDateTime(value, regional || undefined, t.locale) : '');
const reason = (t, text) => (text ? t('masterplan.notify.reason', { reason: text }) : '');

export const statusName = (status, locale = 'ru') => {
  const key = `masterplan.status.${status}`;
  const text = translator(locale)(key);
  return text === key ? status : text;
};

export const MP_MESSAGES = {
  expiring: (t, { code, project, endsAt, kind, regional }) => ({
    title: t(`masterplan.notify.expiring.${kind === 'reserve' ? 'reserve' : 'booking'}`, { code }),
    body: lines(project, t('masterplan.notify.until', { date: when(t, endsAt, regional) })),
  }),
  expired: (t, { code, project, manager, kind }) => ({
    title: t(`masterplan.notify.expired.${kind === 'reserve' ? 'reserve' : 'booking'}`, { code }),
    body: lines(project, t('masterplan.notify.expired.body'), manager ? t('masterplan.notify.manager', { name: manager }) : ''),
  }),
  bulkStatus: (t, { count, sample, project, to, actor, reason: why }) => ({
    title: t('masterplan.notify.bulkStatus.title', { status: statusName(to, t.locale), count }),
    body: lines(project, sample, reason(t, why), actor),
  }),
  status: (t, { code, project, to, actor, reason: why }) => ({ title: `${code}: ${statusName(to, t.locale)}`, body: lines(project, reason(t, why), actor) }),
  report: (t, { objects, stage, percent, project, actor }) => ({
    title: t('masterplan.notify.report.title', { objects }),
    body: lines(project, stage ? `${stage}${percent != null ? ` — ${percent}%` : ''}` : '', actor),
  }),
  reportReview: (t, { objects, project, actor }) => ({ title: t('masterplan.notify.reportReview.title', { objects }), body: lines(project, actor) }),
  reportReviewed: (t, { objects, published, note }) => ({
    title: t(`masterplan.notify.reportReviewed.${published ? 'published' : 'returned'}`, { objects }),
    body: note ? t('masterplan.notify.reportReviewed.comment', { note }) : '',
  }),
  stale: (t, { count, days, project, sample }) => ({ title: t('masterplan.notify.stale.title', { days, count }), body: lines(project, sample) }),
  delay: (t, { code, days, stage, project }) => ({
    title: t('masterplan.notify.delay.title', { days, code }),
    body: lines(project, stage ? t('masterplan.notify.delay.stage', { stage }) : ''),
  }),
  accessRequest: (t, { actor, note }) => ({ title: t('masterplan.notify.accessRequest.title', { actor }), body: note || '' }),
};

/** `render` for notify(): the recipient's language and region settings. */
export function mpMessage(kind, params) {
  return (locale, regional) => MP_MESSAGES[kind](translator(locale), { ...params, regional: regional || null });
}
