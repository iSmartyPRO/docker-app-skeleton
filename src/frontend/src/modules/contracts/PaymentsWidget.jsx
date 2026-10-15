import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { fmtDate } from '../../lib/datetime';
import { WidgetState } from '../dashboard/widgets/common';
import { contractsApi } from './api';
import { PAY_STATE_LOOK, formatMoney } from './lib';
import './contracts-pay.css';

const sums = (totals, locale) => (totals?.length ? totals.map((item) => formatMoney(item.amount, item.currency, locale)).join(' · ') : '0');

/** Dashboard «Поступления по договорам» (finance, view_all): overdue and expected this week per currency, the nearest payments. */
export default function PaymentsWidget() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true }));
    contractsApi
      .widget()
      .then((res) => setState({ data: res.data, error: null, loading: false }))
      .catch((error) => setState((prev) => ({ data: prev.data, error, loading: false })));
  }, []);
  useEffect(() => {
    reload();
    const timer = setInterval(() => document.visibilityState === 'visible' && reload(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [reload]);
  const data = state.data;
  const empty = data && !data.overdue.count && !data.week.count && !data.items.length ? t('contracts.pay.widget.empty') : null;
  return (
    <WidgetState state={{ ...state, reload }} empty={empty} emptyIcon="wallet" emptyAction={<Link to="/app/contracts/payments">{t('contracts.pay.widget.all')}</Link>}>
      <div className="ctr-pwidget">
        <div className="ctr-pwidget__kpis">
          <Link to="/app/contracts/payments" className={`ctr-pwidget__kpi${data?.overdue.count ? ' is-red' : ''}`}>
            <small>{t('contracts.pay.widget.overdue')} · {data?.overdue.count ?? 0}</small>
            <strong>{sums(data?.overdue.totals, locale)}</strong>
          </Link>
          <Link to="/app/contracts/payments" className="ctr-pwidget__kpi">
            <small>{t('contracts.pay.widget.week')} · {data?.week.count ?? 0}</small>
            <strong>{sums(data?.week.totals, locale)}</strong>
          </Link>
        </div>
        <ul className="ctr-pwidget__list">
          {(data?.items || []).map((item) => (
            <li key={item.key}>
              <button type="button" onClick={() => navigate(`/app/contracts/payments?open=${item.contract.id}&tab=payments`)}>
                <span className="ctr-pwidget__dot" style={{ '--c': PAY_STATE_LOOK[item.state] }} />
                <span className="ctr-pwidget__text">
                  <strong>{item.contract.counterparty || item.contract.title}</strong>
                  <em>{[item.contract.number, t(`contracts.pay.purpose.${item.purpose}`), item.dueOn ? fmtDate(item.dueOn) : null].filter(Boolean).join(' · ')}</em>
                </span>
                <span className="ctr-pwidget__money">{formatMoney(item.left, item.currency, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </WidgetState>
  );
}
