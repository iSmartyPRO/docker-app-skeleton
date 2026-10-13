import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Input, Select, Skeleton } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { HelpButton } from '../../../help/Hint';
import { csvUrl, procApi } from '../api';
import { useProc } from '../ProcContext';
import { formatMoney, totalsText } from '../lib';
import { DayBadge, Empty, StatusPill, Urgency } from '../components/bits';
import RequestCard from '../card/RequestCard';
import { PaymentDialog } from '../card/MoneyTab';

const GROUP_TONE = { overdue: 'red', today: 'amber', week: 'blue', later: 'grey' };

/**
 * Payments registry for accounting (spec §5.3.3): approved requests grouped
 * by «оплатить до» — overdue, today, this week, later — with totals per
 * currency, «Оплатить» right in the row and the CSV export.
 */
export default function PaymentsPage() {
  const { t, locale } = useLocale();
  const { meta, version, touch } = useProc();
  const [search, setSearch] = useSearchParams();
  const [query, setQuery] = useState('');
  const [entity, setEntity] = useState(null);
  const [data, setData] = useState(null);
  const [paying, setPaying] = useState(null);
  const openId = Number(search.get('open')) || null;

  const load = useCallback(() => {
    procApi
      .registry({ q: query || undefined, legalEntity: entity || undefined })
      .then((res) => setData(res.data))
      .catch(() => setData({ groups: [], totals: [], count: 0 }));
  }, [query, entity]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load, version]);

  const open = (id) => {
    const next = new URLSearchParams(search);
    if (id) next.set('open', String(id));
    else next.delete('open');
    setSearch(next, { replace: !id });
  };
  const ids = (data?.groups || []).flatMap((group) => group.items.map((item) => item.id));

  return (
    <div className="prc-page">
      <header className="mod-hero prc-hero is-pay">
        <span className="mod-hero__badge" aria-hidden="true">
          <MenuIcon name="wallet" />
        </span>
        <div className="mod-hero__text">
          <h1>{t('procurement.nav.payments')}</h1>
          <p>{data ? t('procurement.registry.lead', { n: data.count }) : t('procurement.registry.leadEmpty')}</p>
        </div>
        <div className="mod-hero__actions">
          <HelpButton id="procurement" section="payments" />
          <Button icon={<DownloadOutlined />} href={csvUrl('registry.csv', { q: query, legalEntity: entity })}>
            {t('procurement.registry.export')}
          </Button>
        </div>
      </header>

      {data?.totals?.length > 0 && (
        <div className="prc-kpis">
          {data.totals.map((item) => (
            <div key={item.currency} className="prc-kpi">
              <small>{t('procurement.registry.toPay')} · {item.currency}</small>
              <strong>{formatMoney(item.amount, item.currency, locale)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="mod-toolbar prc-toolbar">
        <Input allowClear prefix={<SearchOutlined />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('procurement.searchPlaceholder')} className="prc-search" />
        {meta.legalEntities.length > 1 && (
          <Select allowClear value={entity ?? undefined} onChange={(value) => setEntity(value ?? null)} placeholder={t('procurement.fields.legalEntity')} options={meta.legalEntities.map((item) => ({ value: item.id, label: item.label }))} style={{ minWidth: 200 }} />
        )}
      </div>

      {!data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !data.count ? (
        <Empty icon="✅" title={t('procurement.registry.empty')} text={t('procurement.registry.emptyText')} />
      ) : (
        data.groups.map((group) =>
          group.items.length ? (
            <section key={group.key} className={`prc-group is-${GROUP_TONE[group.key]}`}>
              <h3 className="prc-group__title">
                <span>{t(`procurement.registry.groups.${group.key}`)}</span>
                <em>{group.items.length}</em>
                <span className="prc-grow" />
                <span className="prc-group__sum">{totalsText(group.totals, locale)}</span>
              </h3>
              <ul className="prc-pay-list">
                {group.items.map((item) => (
                  <li key={item.id} className={`prc-pay-row${item.id === openId ? ' is-open' : ''}`}>
                    <button type="button" className="prc-pay-row__main" onClick={() => open(item.id)}>
                      <span className="prc-pay-row__no">{item.number}</span>
                      <span className="prc-pay-row__text">
                        <strong>{item.title}</strong>
                        <small>{[item.supplier?.name, item.legalEntity?.label, item.author?.name].filter(Boolean).join(' · ')}</small>
                      </span>
                    </button>
                    <span className="prc-pay-row__flags">
                      <Urgency value={item.urgency} compact />
                      <StatusPill status={item.status} size="small" />
                      <DayBadge value={item.payBy} />
                    </span>
                    <span className="prc-pay-row__money">
                      <strong>{formatMoney(item.remaining, item.currency, locale)}</strong>
                      {item.paid > 0 && <small>{t('procurement.registry.ofTotal', { total: formatMoney(item.amount, item.currency, locale) })}</small>}
                    </span>
                    <Button type="primary" onClick={() => setPaying(item)} className="prc-pay-row__btn">
                      {t('procurement.actions.pay')}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        )
      )}

      {paying && (
        <PaymentDialog
          open
          data={{ request: paying }}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            touch();
            load();
          }}
        />
      )}
      {openId && <RequestCard id={openId} ids={ids} onOpen={(next) => open(next)} onClose={() => open(null)} onChanged={() => { touch(); load(); }} />}
    </div>
  );
}
