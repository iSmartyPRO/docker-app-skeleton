import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Skeleton } from 'antd';
import { CheckOutlined, DownloadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate } from '../../../lib/datetime';
import { HelpButton } from '../../../help/Hint';
import { MenuIcon } from '../../../components/icons/menuIcons';
import ModuleHeader from '../../shared/ModuleHeader';
import { useContracts } from '../ContractsContext';
import { contractsApi } from '../api';
import { formatMoney, payError } from '../lib';
import { Empty } from '../components/bits';
import ContractCard from '../card/ContractCard';
import { PayState } from '../card/Payments';
import { DepositStatusDialog, PaymentDialog } from '../card/payDialogs';

const totalsText = (totals, locale) => (totals || []).map((item) => formatMoney(item.amount, item.currency, locale)).join(' · ');

/**
 * Payments registry for finance (/app/contracts/payments): what clients owe —
 * unpaid schedule rows and expected deposits of live contracts — grouped
 * Просрочено / Сегодня / На неделе / Позже (the person's day), totals per
 * currency, «Отметить поступление» right in the row, CSV export. The contract
 * opens over the list on its «Оплаты» tab.
 */
export default function PaymentsPage() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { version, touch } = useContracts();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [paying, setPaying] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const openId = Number(params.get('open')) || null;

  const load = useCallback(() => {
    contractsApi
      .registry({ search: query || undefined })
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch(setError);
  }, [query]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load, version]);

  const open = (id) => {
    const next = new URLSearchParams(params);
    if (id) {
      next.set('open', String(id));
      next.set('tab', 'payments');
    } else {
      next.delete('open');
      next.delete('tab');
    }
    setParams(next, { replace: !id });
  };
  const ids = [...new Set((data?.groups || []).flatMap((group) => group.items.map((item) => item.contract.id)))];
  const step = (dir) => {
    const index = ids.indexOf(openId);
    if (ids[index + dir]) open(ids[index + dir]);
  };
  const done = () => {
    setPaying(null);
    setConfirming(null);
    touch();
    load();
  };

  const kpis = data && (
    <div className="ctr-prg-kpis">
      {(data.overdue || []).map((item) => (
        <div key={`o${item.currency}`} className="ctr-prg-kpi is-red">
          <small>{t('contracts.pay.registry.overdueSum')} · {item.currency}</small>
          <strong>{formatMoney(item.amount, item.currency, locale)}</strong>
        </div>
      ))}
      {(data.totals || []).map((item) => (
        <div key={item.currency} className="ctr-prg-kpi">
          <small>{t('contracts.pay.registry.expected')} · {item.currency}</small>
          <strong>{formatMoney(item.amount, item.currency, locale)}</strong>
        </div>
      ))}
    </div>
  );

  return (
    <div className="ctr-page">
      <ModuleHeader
        className="ctr-mh"
        icon={<MenuIcon name="wallet" />}
        title={t('contracts.pay.registry.title')}
        titleExtra={<HelpButton id="contracts" section="payments-registry" />}
        description={data?.count ? t('contracts.pay.registry.lead', { n: data.count }) : t('contracts.pay.registry.leadEmpty')}
        dock={false}
        actions={[{ key: 'export', icon: <DownloadOutlined />, label: t('contracts.pay.registry.export'), href: contractsApi.registryCsvUrl({ search: query, lang: document.documentElement.lang }) }]}
        search={{ value: query, onChange: setQuery, onSearch: (value) => setQuery(value.trim()), placeholder: t('contracts.pay.registry.search') }}
      />

      {error ? (
        <Empty icon="⚠️" title={t('contracts.loadError')} text={payError(error, t)} action={<Button onClick={load}>{t('common.retry')}</Button>} />
      ) : !data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !data.count ? (
        <Empty icon="✅" title={t('contracts.pay.registry.empty')} text={t('contracts.pay.registry.emptyText')} />
      ) : (
        <>
          {kpis}
          {!data.canPay && <p className="ctr-pay-hint" style={{ marginBottom: 12 }}>{t('contracts.pay.registry.readOnly')}</p>}
          {data.groups.map((group) =>
            group.items.length ? (
              <section key={group.key} className={`ctr-prg-group is-${group.key}`}>
                <h3 className="ctr-prg-group__title">
                  <span>{t(`contracts.pay.registry.groups.${group.key}`)}</span>
                  <em>{group.count ?? group.items.length}</em>
                  <span className="ctr-prg-group__sum">{totalsText(group.totals, locale)}</span>
                </h3>
                <ul className="ctr-prg-list">
                  {group.items.map((item) => {
                    const money = (value) => formatMoney(value, item.currency, locale);
                    const deposit = item.kind === 'deposit';
                    return (
                      <li key={item.key} className={`ctr-prg-row${item.contract.id === openId ? ' is-open' : ''}`}>
                        <button type="button" className="ctr-prg-row__main" onClick={() => open(item.contract.id)}>
                          <span className="ctr-prg-row__no">{item.contract.number}</span>
                          <span className="ctr-prg-row__text">
                            <strong>{item.contract.counterparty || item.contract.title}</strong>
                            <small>{[item.contract.counterparty ? item.contract.title : null, item.contract.owner?.name].filter(Boolean).join(' · ')}</small>
                          </span>
                        </button>
                        <span className="ctr-prg-row__when">
                          <span>{item.dueOn ? fmtDate(item.dueOn) : '—'}</span>
                          <small>
                            {t(`contracts.pay.purpose.${item.purpose}`)}
                            {item.more > 0 ? ` · ${t('contracts.pay.registry.more', { n: item.more })}` : ''}
                          </small>
                          <PayState state={item.state} partial={item.paid > 0} />
                        </span>
                        <span className="ctr-prg-row__money">
                          <strong>{money(item.left)}</strong>
                          {item.paid > 0 && <small>{t('contracts.pay.registry.ofTotal', { total: money(item.amount) })}</small>}
                        </span>
                        <span className="ctr-prg-row__btn">
                          {data.canPay &&
                            (deposit ? (
                              <Button icon={<CheckOutlined />} onClick={() => setConfirming(item)}>
                                {t('contracts.pay.registry.confirmDeposit')}
                              </Button>
                            ) : (
                              <Button type="primary" onClick={() => setPaying(item)}>
                                {t('contracts.pay.registry.markReceived')}
                              </Button>
                            ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null
          )}
        </>
      )}

      <PaymentDialog
        open={Boolean(paying)}
        target={paying ? { id: paying.contract.id, number: paying.contract.number, currency: paying.currency, remaining: paying.left, total: 0, suggested: paying.left } : null}
        onClose={() => setPaying(null)}
        onDone={(res) => {
          const sync = (res.masterplanSync || []).find((entry) => entry && entry.result === 'applied' && entry.to);
          if (sync) message.success(t('contracts.pay.masterplan.applied', { unit: sync.unit?.code || '', status: t(`mp.status.${sync.to}`) }));
          done();
        }}
      />
      <DepositStatusDialog
        open={Boolean(confirming)}
        contract={confirming ? { id: confirming.contract.id } : {}}
        deposit={confirming ? { kind: confirming.purpose === 'advance' ? 'advance' : 'deposit', amount: confirming.amount, currency: confirming.currency } : null}
        to={confirming ? 'received' : null}
        onClose={() => setConfirming(null)}
        onDone={(res) => {
          const notes = (res.masterplanSync || []).filter((entry) => entry && entry.result === 'refused');
          if (notes.length) message.warning(t('contracts.pay.masterplan.noteTitle'));
          done();
        }}
      />
      {openId && <ContractCard id={openId} onClose={() => open(null)} onStep={ids.length > 1 ? step : null} onChanged={load} />}
    </div>
  );
}
