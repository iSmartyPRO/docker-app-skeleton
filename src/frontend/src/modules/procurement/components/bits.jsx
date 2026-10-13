import { useEffect, useState } from 'react';
import { Select, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate } from '../../../lib/datetime';
import { userOptions } from '../../shared/People';
import { UrgencyTag } from '../../approvals/components/bits';
import { useApprovalsMeta } from '../../approvals/lib';
import { useProc } from '../ProcContext';
import { STATUS_COLORS, categoryOf, dayState, formatMoney } from '../lib';

/** Status as a soft pill in its colour. */
export function StatusPill({ status, size }) {
  const { t } = useLocale();
  return (
    <span className={`prc-status${size === 'small' ? ' is-small' : ''}`} style={{ '--c': STATUS_COLORS[status] || '#94A3B8' }}>
      <span className="prc-status__dot" aria-hidden="true" />
      {t(`procurement.status.${status}`)}
    </span>
  );
}

/** Amount with currency; `paid` adds "paid N" under it. */
export function Money({ amount, currency, paid, strong = true }) {
  const { t, locale } = useLocale();
  return (
    <span className="prc-money">
      {strong ? <strong>{formatMoney(amount, currency, locale)}</strong> : formatMoney(amount, currency, locale)}
      {paid > 0 && paid < amount && <small>{t('procurement.paidOf', { paid: formatMoney(paid, currency, locale) })}</small>}
    </span>
  );
}

/**
 * A calendar-day deadline coloured by the spec rule: red overdue, yellow
 * close, grey none, green done.
 */
export function DayBadge({ value, done = false, muted = false, label }) {
  const { t } = useLocale();
  const meta = useApprovalsMeta();
  const soonDays = Math.max(1, Math.round((meta?.settings?.soonHours || 24) / 24));
  const state = muted ? 'none' : dayState(value, done, soonDays);
  if (!value) return <span className="prc-day is-none">{label ? `${label}: ` : ''}—</span>;
  return (
    <Tooltip title={state === 'overdue' ? t('procurement.overdue') : state === 'soon' ? t('procurement.dueSoon') : null}>
      <span className={`prc-day is-${state}`}>
        <span className="prc-day__dot" aria-hidden="true" />
        {label ? `${label}: ` : ''}
        {fmtDate(value)}
      </span>
    </Tooltip>
  );
}

export function CategoryTag({ value }) {
  const { meta } = useProc();
  const category = categoryOf(meta, value);
  if (!category) return null;
  return (
    <span className="prc-cat" style={{ '--c': category.color }}>
      {category.name}
    </span>
  );
}

export function Urgency({ value, compact }) {
  const meta = useApprovalsMeta();
  if (!value) return null;
  return <UrgencyTag meta={meta} value={value} compact={compact} />;
}

/** People picker (the module's /people list). */
export function PersonSelect({ value, onChange, placeholder, allowClear = true, ...rest }) {
  const { loadPeople } = useProc();
  const [people, setPeople] = useState([]);
  useEffect(() => {
    loadPeople().then(setPeople).catch(() => {});
  }, [loadPeople]);
  return (
    <Select
      showSearch
      allowClear={allowClear}
      value={value ?? undefined}
      onChange={(next) => onChange?.(next ?? null)}
      placeholder={placeholder}
      options={userOptions(people)}
      filterOption={(input, option) => option.search.includes(input.toLowerCase())}
      {...rest}
    />
  );
}

/** Empty state with an icon, a sentence and what to do. */
export function Empty({ icon = '🛒', title, text, action }) {
  return (
    <div className="prc-empty">
      <span className="prc-empty__icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
