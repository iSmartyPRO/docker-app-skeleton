import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Select, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { contractsApi } from '../api';
import { formatMoney } from '../lib';
import { tOr } from '../../approvals/public';

/** A searchable picker fed by one of the link-options endpoints. */
function RemotePicker({ load, toOption, placeholder, onPick, onCancel }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const search = (q) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      load(q)
        .then((res) => setOptions((res.data.items || []).map(toOption)))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 250);
  };
  useEffect(() => {
    search('');
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="ctr-link-pick">
      <Select
        autoFocus
        showSearch
        open
        filterOption={false}
        onSearch={search}
        loading={loading}
        options={options}
        placeholder={placeholder}
        onChange={(value, option) => onPick(option.item)}
        style={{ flex: 1, minWidth: 0 }}
        onBlur={onCancel}
        aria-label={placeholder}
      />
    </div>
  );
}

/** Purchase requests that point at this contract (Procurement, when it is on). */
function ProcurementList({ contractId }) {
  const { t, locale } = useLocale();
  const [state, setState] = useState({ loading: true, items: [], off: false });
  useEffect(() => {
    let alive = true;
    contractsApi
      .procurementRequests(contractId)
      .then((res) => {
        const data = res.data || {};
        const items = data.items || data.requests || [];
        if (alive) setState({ loading: false, items, off: false });
      })
      .catch(() => alive && setState({ loading: false, items: [], off: true }));
    return () => {
      alive = false;
    };
  }, [contractId]);
  if (state.loading) return <Skeleton active paragraph={{ rows: 1 }} title={false} />;
  if (state.off) return <div className="ctr-section__empty">{t('contracts.links.procurementOff')}</div>;
  if (!state.items.length) return <div className="ctr-section__empty">{t('contracts.links.procurementNone')}</div>;
  return (
    <ul className="ctr-linklist">
      {state.items.map((item) => (
        <li key={item.id}>
          <Link to={item.url || `/app/procurement/requests/${item.id}`} className="ctr-linkrow">
            <span className="ctr-linkrow__icon" aria-hidden="true">🛒</span>
            <span className="ctr-linkrow__main">
              <strong>{item.number ? `${item.number} · ` : ''}{item.title}</strong>
              {item.supplier?.name || item.supplierName ? <em>{item.supplier?.name || item.supplierName}</em> : null}
            </span>
            {item.amount !== undefined && item.amount !== null && <span className="ctr-linkrow__amount">{formatMoney(item.amount, item.currency, locale)}</span>}
            {item.status && <span className="ctr-linkrow__status">{item.statusLabel || tOr(t, `procurement.status.${item.status}`, item.status)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * «Связи»: purchase requests, the CRM deal and the Masterplan object. Each
 * block shows only while its module is on; what the person may not see in
 * that module shows as «нет доступа».
 */
export default function Links({ data, onChanged }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { contract, links, can } = data;
  const [picking, setPicking] = useState(null);
  const modules = links.modules || {};

  const save = async (patch) => {
    setPicking(null);
    try {
      await contractsApi.update(contract.id, patch);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const nothing = !modules.procurement && !modules.crm && !modules.masterplan;
  if (nothing) return <div className="ctr-section__empty">{t('contracts.links.noModules')}</div>;

  return (
    <div className="ctr-links">
      {modules.procurement && (
        <section className="ctr-section">
          <header className="ctr-section__head">
            <h3>{t('contracts.links.procurement')}</h3>
          </header>
          <ProcurementList contractId={contract.id} />
        </section>
      )}

      {modules.crm && (
        <section className="ctr-section">
          <header className="ctr-section__head">
            <h3>{t('contracts.links.deal')}</h3>
            <span className="ctr-grow" />
            {can.links && picking !== 'deal' && (
              <Button size="small" onClick={() => setPicking('deal')}>
                {links.deal ? t('contracts.links.change') : `+ ${t('contracts.links.pickDeal')}`}
              </Button>
            )}
          </header>
          {picking === 'deal' && (
            <RemotePicker
              load={contractsApi.dealOptions}
              placeholder={t('contracts.links.dealSearch')}
              toOption={(deal) => ({ value: deal.id, label: `${deal.title}${deal.amount ? ` · ${formatMoney(deal.amount, deal.currency, locale)}` : ''}`, item: deal })}
              onPick={(deal) => save({ dealId: deal.id })}
              onCancel={() => setPicking(null)}
            />
          )}
          {links.deal ? (
            <div className="ctr-linkrow is-static">
              <span className="ctr-linkrow__icon" aria-hidden="true">🎯</span>
              {links.deal.hidden ? (
                <span className="ctr-linkrow__main"><strong>#{links.deal.id}</strong><em>{t('contracts.links.noAccess')}</em></span>
              ) : (
                <Link to={links.deal.url} className="ctr-linkrow__main">
                  <strong>{links.deal.title}</strong>
                  {links.deal.stage && <em style={{ '--c': links.deal.stageColor }}>{links.deal.stage}</em>}
                </Link>
              )}
              {!links.deal.hidden && links.deal.amount ? <span className="ctr-linkrow__amount">{formatMoney(links.deal.amount, links.deal.currency, locale)}</span> : null}
              {can.links && (
                <button type="button" className="ctr-icon-btn" onClick={() => save({ dealId: null })} aria-label={t('contracts.links.unlink')} title={t('contracts.links.unlink')}>✕</button>
              )}
            </div>
          ) : (
            picking !== 'deal' && <div className="ctr-section__empty">{t('contracts.links.noDeal')}</div>
          )}
        </section>
      )}

      {modules.masterplan && (
        <section className="ctr-section">
          <header className="ctr-section__head">
            <h3>{t('contracts.links.masterplan')}</h3>
            <span className="ctr-grow" />
            {can.links && picking !== 'mp' && (
              <Button size="small" onClick={() => setPicking('mp')}>
                {links.masterplan ? t('contracts.links.change') : `+ ${t('contracts.links.pickObject')}`}
              </Button>
            )}
          </header>
          {picking === 'mp' && (
            <RemotePicker
              load={contractsApi.masterplanOptions}
              placeholder={t('contracts.links.objectSearch')}
              toOption={(item) => ({ value: `${item.projectId}:${item.nodeId || 0}`, label: item.nodeId ? `${item.label} — ${item.project}` : `▣ ${item.label}`, item })}
              onPick={(item) => save({ mpProjectId: item.projectId, mpNodeId: item.nodeId || null })}
              onCancel={() => setPicking(null)}
            />
          )}
          {links.masterplan ? (
            <div className="ctr-linkrow is-static">
              <span className="ctr-linkrow__icon" aria-hidden="true">🏗</span>
              {links.masterplan.hidden ? (
                <span className="ctr-linkrow__main"><strong>#{links.masterplan.projectId}</strong><em>{t('contracts.links.noAccess')}</em></span>
              ) : (
                <Link to={links.masterplan.url} className="ctr-linkrow__main">
                  <strong>{links.masterplan.node || links.masterplan.project}</strong>
                  {links.masterplan.node && <em>{links.masterplan.project}</em>}
                </Link>
              )}
              {can.links && (
                <button type="button" className="ctr-icon-btn" onClick={() => save({ mpProjectId: null, mpNodeId: null })} aria-label={t('contracts.links.unlink')} title={t('contracts.links.unlink')}>✕</button>
              )}
            </div>
          ) : (
            picking !== 'mp' && <div className="ctr-section__empty">{t('contracts.links.noObject')}</div>
          )}
        </section>
      )}
    </div>
  );
}
