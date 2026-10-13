import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { MenuIcon } from '../../components/icons/menuIcons';
import { moduleById } from '../registry';
import { useWidgetData } from '../dashboard/api';
import { WidgetState } from '../dashboard/widgets/common';
import { MODULE_LOOK, formatMoney, tr, useApprovalsMeta } from './lib';
import { DueBadge, UrgencyTag } from './components/bits';
import './approvals.css';

/** Dashboard widget «Ждёт меня»: counters and the most urgent items; opens the inbox. */
export default function InboxWidget({ widget }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const meta = useApprovalsMeta();
  const state = useWidgetData('inbox', widget.settings, { every: 60 * 1000 });
  const { reload } = state;
  useEffect(() => {
    window.addEventListener('approvals:changed', reload);
    return () => window.removeEventListener('approvals:changed', reload);
  }, [reload]);
  const data = state.data;
  return (
    <WidgetState state={state} empty={data && !data.total ? t('approvals.widget.empty') : null} emptyIcon="🎉">
      <div className="apr-widget">
        <div className="apr-widget__kpis">
          <Link to="/app/approvals" className="apr-widget__kpi">
            <strong>{data?.total ?? 0}</strong>
            <span>{t('approvals.widget.waiting')}</span>
          </Link>
          <Link to="/app/approvals" className={`apr-widget__kpi${data?.overdue ? ' is-red' : ''}`}>
            <strong>{data?.overdue ?? 0}</strong>
            <span>{t('approvals.groups.overdue')}</span>
          </Link>
        </div>
        <ul className="apr-widget__list">
          {(data?.items || []).map((item) => {
            const look = MODULE_LOOK[item.module] || { color: '#64748B', icon: moduleById(item.module)?.icon || 'inbox' };
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={`apr-widget__row${item.overdue ? ' is-overdue' : ''}`}
                  onClick={() => navigate(item.provider === 'approvals' ? `/app/approvals?process=${item.id}` : item.url || '/app/approvals')}
                >
                  <span className="apr-row__icon" style={{ '--c': look.color }}>
                    <MenuIcon name={moduleById(item.module)?.icon || look.icon} variant="mono" />
                  </span>
                  <span className="apr-widget__text">
                    <strong>{item.title}</strong>
                    <em>
                      {[item.meta?.typeTitle ? tr(item.meta.typeTitle, locale) : null, item.number, item.amount !== null ? formatMoney(item.amount, item.currency, locale) : null].filter(Boolean).join(' · ')}
                    </em>
                  </span>
                  <span className="apr-widget__meta">
                    {item.urgency && <UrgencyTag meta={meta} value={item.urgency} compact />}
                    {item.dueAt && <DueBadge dueAt={item.dueAt} soonHours={meta?.settings?.soonHours || 24} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {data?.total > (data?.items?.length || 0) && (
          <Link to="/app/approvals" className="apr-widget__all">
            {t('approvals.widget.all', { n: data.total })} →
          </Link>
        )}
      </div>
    </WidgetState>
  );
}
