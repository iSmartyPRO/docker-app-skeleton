import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { WidgetState } from '../../platform/widgets/common';
import { whApi } from './api';
import { formatQty } from './lib';
import './warehouse.css';

/** One request for the three widgets of a dashboard (they render at the same time). */
let shared = null;
function loadWidget() {
  if (!shared || Date.now() - shared.at > 20000) shared = { at: Date.now(), promise: whApi.widget() };
  return shared.promise;
}

function useWidget() {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true }));
    loadWidget()
      .then((res) => setState({ data: res.data, error: null, loading: false }))
      .catch((error) => setState((prev) => ({ data: prev.data, error, loading: false })));
  }, []);
  useEffect(() => {
    reload();
    const timer = setInterval(() => document.visibilityState === 'visible' && reload(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [reload]);
  return { ...state, reload };
}

/** «Ниже минимума». */
export function LowStockWidget() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const state = useWidget();
  const block = state.data?.belowMin;
  return (
    <WidgetState state={state} empty={block && !block.count ? t('wh.widgets.lowEmpty') : null} emptyIcon="box">
      <div className="wh-widget">
        <Link to="/app/warehouse/stock?chip=below_min" className="wh-widget__kpi is-amber"><strong>{block?.count ?? 0}</strong><span>{t('wh.stockChips.below_min')}</span></Link>
        <ul className="wh-widget__list">
          {(block?.items || []).map((row) => (
            <li key={`${row.item.id}:${row.warehouse.id}`}>
              <button type="button" onClick={() => navigate(`/app/warehouse/stock?item=${row.item.id}`)}>
                <span className="wh-widget__text"><strong>{row.item.name}</strong><em>{row.warehouse.name}</em></span>
                <span className="wh-widget__num">{formatQty(row.qty, locale)} / {formatQty(row.minQty, locale)} {row.item.baseUnit}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </WidgetState>
  );
}

/** «Ждут приёмки» (incoming transfers of my warehouses). */
export function IncomingWidget() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const state = useWidget();
  const block = state.data?.awaitingReceipt;
  return (
    <WidgetState state={state} empty={block && !block.count ? t('wh.widgets.incomingEmpty') : null} emptyIcon="send">
      <div className="wh-widget">
        <Link to="/app/warehouse/documents?chip=awaiting_receipt" className="wh-widget__kpi is-violet"><strong>{block?.count ?? 0}</strong><span>{t('wh.docChips.awaiting_receipt')}</span></Link>
        <ul className="wh-widget__list">
          {(block?.items || []).map((doc) => (
            <li key={doc.id}>
              <button type="button" onClick={() => navigate(`/app/warehouse/documents/${doc.id}`)}>
                <span className="wh-widget__text"><strong>{doc.number}</strong><em>{doc.warehouse?.name} → {doc.toWarehouse?.name}</em></span>
                <span className="wh-widget__num">{t('wh.docs.linesN', { n: doc.lines })}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </WidgetState>
  );
}

/** «Инструмент у меня». */
export function MyToolsWidget() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const state = useWidget();
  const block = state.data?.myTools;
  return (
    <WidgetState state={state} empty={block && !block.count && !block.incoming?.length ? t('wh.widgets.toolsEmpty') : null} emptyIcon="wrench">
      <div className="wh-widget">
        <Link to="/app/warehouse/my-tools" className="wh-widget__kpi"><strong>{block?.count ?? 0}</strong><span>{t('wh.nav.myTools')}</span></Link>
        {block?.incoming?.length > 0 && <Link to="/app/warehouse/my-tools" className="wh-widget__alert">{t('wh.widgets.toConfirm', { count: block.incoming.length })}</Link>}
        <ul className="wh-widget__list">
          {(block?.tools || []).map((tool) => (
            <li key={tool.id}>
              <button type="button" onClick={() => navigate(`/app/warehouse/tools/${tool.id}`)}>
                <span className="wh-widget__text"><strong>{tool.item.name}</strong><em>{tool.inventoryNo}</em></span>
                {tool.serviceState === 'overdue' || tool.serviceState === 'soon' ? <span className={`wh-flag ${tool.serviceState === 'overdue' ? 'is-red' : 'is-amber'}`}>{t('wh.widgets.service')}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </WidgetState>
  );
}
