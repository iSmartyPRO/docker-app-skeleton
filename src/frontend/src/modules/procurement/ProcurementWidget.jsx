import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { WidgetState } from '../../platform/widgets/common';
import { procApi } from './api';
import { STATUS_COLORS, formatMoney } from './lib';
import './procurement.css';

/** Dashboard widget «Закупки»: waiting for me, overdue, to pay (per currency) and the first requests. */
export default function ProcurementWidget() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true }));
    procApi
      .widget()
      .then((res) => setState({ data: res.data, error: null, loading: false }))
      .catch((error) => setState((prev) => ({ data: prev.data, error, loading: false })));
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener('approvals:changed', reload);
    const timer = setInterval(() => document.visibilityState === 'visible' && reload(), 5 * 60 * 1000);
    return () => {
      window.removeEventListener('approvals:changed', reload);
      clearInterval(timer);
    };
  }, [reload]);
  const data = state.data;
  const kpi = (chip, value, alert) => (
    <Link to={`/app/procurement/requests?chip=${chip}`} className={`prc-widget__kpi${alert && value ? ' is-red' : ''}`}>
      <strong>{value ?? 0}</strong>
      <span>{t(`procurement.chips.${chip}`)}</span>
    </Link>
  );
  return (
    <WidgetState state={{ ...state, reload }} empty={data && !data.counters.all ? t('procurement.widget.empty') : null} emptyIcon="cart" emptyAction={data?.canCreate ? <Link to="/app/procurement/new">{t('procurement.create')}</Link> : null}>
      <div className="prc-widget">
        <div className="prc-widget__kpis">
          {kpi('waiting', data?.counters.waiting)}
          {kpi('overdue', data?.counters.overdue, true)}
          {kpi('to_pay', data?.counters.to_pay)}
        </div>
        {data?.toPay?.length > 0 && (
          <div className="prc-widget__sum">
            <span>{t('procurement.registry.toPay')}</span>
            <strong>{data.toPay.map((item) => formatMoney(item.amount, item.currency, locale)).join(' · ')}</strong>
          </div>
        )}
        <ul className="prc-widget__list">
          {(data?.items || []).map((item) => (
            <li key={item.id}>
              <button type="button" className={item.overdue ? 'is-overdue' : ''} onClick={() => navigate(`/app/procurement/requests/${item.id}`)}>
                <span className="prc-widget__dot" style={{ '--c': STATUS_COLORS[item.status] }} />
                <span className="prc-widget__text">
                  <strong>{item.title || item.number}</strong>
                  <em>{[item.number, t(`procurement.status.${item.status}`)].join(' · ')}</em>
                </span>
                <span className="prc-widget__money">{formatMoney(item.amount, item.currency, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </WidgetState>
  );
}
