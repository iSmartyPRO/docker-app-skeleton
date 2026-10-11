import { Link } from 'react-router-dom';
import { Button, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';

/** Loading, error and empty states shared by data widgets. */
export function WidgetState({ state, rows = 4, empty, emptyIcon = '✦', emptyAction, children }) {
  const { t } = useLocale();
  if (!state.data && state.loading) return <Skeleton active title={false} paragraph={{ rows }} className="dw-skeleton" />;
  if (!state.data && state.error) {
    return (
      <div className="dw-empty is-error">
        <span className="dw-empty__icon">!</span>
        <strong>{t('dashboard.loadFailed')}</strong>
        <em>{errorMessage(state.error)}</em>
        <Button size="small" onClick={state.reload}>{t('dashboard.retry')}</Button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="dw-empty">
        <span className="dw-empty__icon">{emptyIcon}</span>
        <strong>{empty}</strong>
        {emptyAction}
      </div>
    );
  }
  return children;
}

/** Number with a caption; `to` makes it a link, `tone` colours it. */
export function Kpi({ value, label, tone, to, hint, small }) {
  const body = (
    <>
      <strong>{value ?? '—'}</strong>
      <span>{label}</span>
      {hint && <em>{hint}</em>}
    </>
  );
  const className = `dw-kpi${tone ? ` is-${tone}` : ''}${small ? ' is-small' : ''}`;
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function When({ value }) {
  const { locale } = useLocale();
  return <time dateTime={value}>{formatRelative(value, locale)}</time>;
}

/** "14:30", in the person's locale. */
export function timeOf(value, locale) {
  return new Date(value).toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Today / tomorrow / weekday + date. */
export function dayTitle(date, locale, t) {
  const day = new Date(date);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(day.getFullYear(), day.getMonth(), day.getDate()) - start) / 86400000);
  if (diff === 0) return t('dashboard.today');
  if (diff === 1) return t('dashboard.tomorrow');
  if (diff === -1) return t('dashboard.yesterday');
  return cap(day.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));
}

export const localeTag = (locale) => (locale === 'ru' ? 'ru-RU' : 'en-GB');

/** "12 окт." from "2026-10-12". */
export function shortDay(key, locale) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), { day: 'numeric', month: 'short' });
}

export function longDay(key, locale) {
  const [y, m, d] = key.split('-').map(Number);
  return cap(new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), { weekday: 'long', day: 'numeric', month: 'long' }));
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/** Flag emoji from a two-letter country code. */
export function flagOf(code) {
  if (!/^[A-Z]{2}$/.test(code || '')) return '🏳️';
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

/** First letter up: "понедельник, 12 октября" → "Понедельник, 12 октября". */
export const cap = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
