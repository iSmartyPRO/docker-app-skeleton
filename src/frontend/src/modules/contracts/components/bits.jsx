import { useMemo } from 'react';
import { Select, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate } from '../../../lib/datetime';
import { Person, UserAvatar } from '../../shared/People';
import { useContracts } from '../ContractsContext';
import { daysLeft, endTone, formatMoney, typeLabel } from '../lib';

/** Contract status as a soft pill with a dot. */
export function StatusPill({ status, size }) {
  const { t } = useLocale();
  return (
    <span className={`ctr-status is-${status}${size === 'lg' ? ' is-lg' : ''}`}>
      <span className="ctr-status__dot" aria-hidden="true" />
      {t(`contracts.status.${status}`)}
    </span>
  );
}

export function TypeTag({ typeKey }) {
  const { t } = useLocale();
  const { settings } = useContracts();
  if (!typeKey) return null;
  return <span className="ctr-type">{typeLabel(settings, typeKey, t)}</span>;
}

/** «120 000 $» or «Рамочный». */
export function Money({ contract, empty = '—' }) {
  const { t, locale } = useLocale();
  if (contract.framework) return <span className="ctr-money is-framework">{t('contracts.fields.frameworkShort')}</span>;
  if (contract.amount === null || contract.amount === undefined) return <span className="ctr-money is-empty">{empty}</span>;
  return <span className="ctr-money">{formatMoney(contract.amount, contract.currency, locale)}</span>;
}

/** End date coloured by how close it is; «через 12 дн.» under it. */
export function EndDate({ contract, compact = false }) {
  const { t } = useLocale();
  const { settings } = useContracts();
  if (!contract.endsOn) return <span className="ctr-end is-none">{t('contracts.fields.noEnd')}</span>;
  const tone = endTone(contract, settings.expiringDays || 30);
  const left = daysLeft(contract.endsOn);
  const hint = left < 0 ? t('contracts.end.ago', { n: -left }) : left === 0 ? t('contracts.end.today') : t('contracts.end.in', { n: left });
  return (
    <Tooltip title={compact ? hint : null}>
      <span className={`ctr-end is-${tone}`}>
        <span className="ctr-end__date">{fmtDate(contract.endsOn)}</span>
        {!compact && tone !== 'none' && <span className="ctr-end__hint">{hint}</span>}
        {contract.autoRenew && (
          <Tooltip title={contract.noticeDeadline ? t('contracts.end.autoTip', { date: fmtDate(contract.noticeDeadline) }) : t('contracts.fields.autoRenew')}>
            <span className="ctr-end__auto" aria-label={t('contracts.fields.autoRenew')}>↻</span>
          </Tooltip>
        )}
      </span>
    </Tooltip>
  );
}

export function UserChip({ user, size = 22 }) {
  if (!user?.id) return <span className="ctr-muted">—</span>;
  return <Person user={user} size={size} />;
}

export function Avatar({ user, size = 24 }) {
  return user?.id ? <UserAvatar user={user} size={size} /> : null;
}

/** Staff picker with avatars. */
export function UserSelect({ id, value, onChange, placeholder, allowClear = true, style, autoFocus, ariaLabel }) {
  const { users } = useContracts();
  const options = useMemo(() => users.map((user) => ({ value: user.id, search: `${user.name} ${user.username}`.toLowerCase(), label: <Person user={user} size={20} /> })), [users]);
  return (
    <Select
      id={id}
      value={value ?? undefined}
      onChange={(next) => onChange?.(next ?? null)}
      options={options}
      showSearch
      allowClear={allowClear}
      placeholder={placeholder}
      filterOption={(input, option) => String(option.search).includes(input.toLowerCase())}
      style={style}
      autoFocus={autoFocus}
      popupMatchSelectWidth={260}
      aria-label={ariaLabel || placeholder}
    />
  );
}

/** Empty state: an icon, what is missing and what to do. */
export function Empty({ icon = '📄', title, text, action }) {
  return (
    <div className="ctr-empty">
      <div className="ctr-empty__icon" aria-hidden="true">{icon}</div>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
