import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { approvalsApi } from './api';

const POLL_MS = 60_000;

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 13.5 6.2 6.3A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.9 1.3L20 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4.5Z" />
      <path d="M4 13.5h4.2l1.3 2.2h5l1.3-2.2H20" />
    </svg>
  );
}

/** Header entry to «Ждёт меня» with a counter (red when something is overdue). */
export default function InboxButton() {
  const { t } = useLocale();
  const [counts, setCounts] = useState({ total: 0, overdue: 0 });
  // `fresh`: after a decision here the server skips its short cache of the counter.
  const refresh = useCallback((fresh = false) => {
    approvalsApi
      .count(fresh === true)
      .then((res) => setCounts({ total: res.data.total || 0, overdue: res.data.overdue || 0 }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => document.visibilityState === 'visible' && refresh(), POLL_MS);
    const onFocus = () => refresh();
    const onChanged = () => refresh(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener('approvals:changed', onChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('approvals:changed', onChanged);
    };
  }, [refresh]);
  const label = counts.total
    ? `${t('approvals.inbox.title')}: ${counts.total}${counts.overdue ? ` · ${t('approvals.inbox.overdueShort', { n: counts.overdue })}` : ''}`
    : t('approvals.inbox.title');
  return (
    <Tooltip title={label} mouseEnterDelay={0.2}>
      <Link to="/app/approvals" className="chrome__icon bell__button apr-inbox-btn" aria-label={label} data-tour="header.inbox">
        <InboxIcon />
        {counts.total > 0 && <span className="bell__badge" style={counts.overdue ? undefined : { background: 'var(--da-primary)' }}>{counts.total > 99 ? '99+' : counts.total}</span>}
      </Link>
    </Tooltip>
  );
}
