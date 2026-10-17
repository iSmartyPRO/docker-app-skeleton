import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Button, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';
import { fmtTime, inZone, todayISO } from '../../../lib/datetime';
import { ICON_CATALOG, MenuIcon } from '../../../components/icons/menuIcons';
import { localeTag } from '../../../i18n/languages';

/** Empty-state glyph: an icon id from the app's icon set, else the text as given. */
function EmptyGlyph({ icon }) {
  return ICON_CATALOG[icon] ? <MenuIcon name={icon} variant="mono" /> : icon;
}

/** Loading, error and empty states shared by data widgets. `emptyIcon` is an icon id (menuIcons). */
export function WidgetState({ state, rows = 4, empty, emptyIcon = 'spark', emptyAction, children }) {
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
        <span className="dw-empty__icon">
          <EmptyGlyph icon={emptyIcon} />
        </span>
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

/** "14:30" / "2:30 PM": a moment's time in the person's zone and time format. */
export function timeOf(value, locale) {
  return fmtTime(value);
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' of a day key or of an instant in the person's zone. */
export const dayKeyOf = (value) => (typeof value === 'string' && DAY_KEY.test(value) ? value : inZone(value)?.format('YYYY-MM-DD') || '');

const dayDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Today / tomorrow / weekday + date. `value` is a day key ('YYYY-MM-DD') or an instant (its day in the person's zone). */
export function dayTitle(value, locale, t) {
  const key = dayKeyOf(value);
  const diff = dayjs(key).diff(dayjs(todayISO()), 'day');
  if (diff === 0) return t('dashboard.today');
  if (diff === 1) return t('dashboard.tomorrow');
  if (diff === -1) return t('dashboard.yesterday');
  // A calendar day (local Date at midnight, formatted in the same device zone): no shift.
  return cap(dayDate(key).toLocaleDateString(localeTag(locale), { weekday: 'short', day: 'numeric', month: 'short' }));
}

export { localeTag };

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
