import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Segmented, Skeleton, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { HelpButton } from '../../../help/Hint';
import { intlOptions } from '../../../lib/datetime';
import { procApi } from '../api';
import { useProc } from '../ProcContext';
import { STATUS_COLORS, categoryOf, formatMoney } from '../lib';
import { shortDuration } from '../../approvals/lib';
import { DayBadge, Empty, StatusPill } from '../components/bits';

/** Horizontal bars: one measure, one hue (or the entity's own colour), labels in text ink. */
function Bars({ rows, currency, locale }) {
  const max = Math.max(1, ...rows.map((row) => row.amount));
  return (
    <ul className="prc-bars">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="prc-bars__label">{row.label}</span>
          <Tooltip title={`${row.label}: ${formatMoney(row.amount, currency, locale)} · ${row.n}`}>
            <span className="prc-bars__track">
              <span className="prc-bars__bar" style={{ width: `${Math.max(2, (row.amount / max) * 100)}%`, '--c': row.color || 'var(--da-primary)' }} />
            </span>
          </Tooltip>
          <span className="prc-bars__value">{formatMoney(row.amount, currency, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Columns per month for one currency. */
function Months({ rows, currency, locale }) {
  const max = Math.max(1, ...rows.map((row) => row.amount));
  return (
    <div className="prc-months" role="img" aria-label="months">
      {rows.map((row) => {
        const [y, m] = row.month.split('-').map(Number);
        const label = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', intlOptions({ month: 'short', timeZone: 'UTC' })).format(new Date(Date.UTC(y, m - 1, 15)));
        return (
          <Tooltip key={row.month} title={`${label} ${y}: ${formatMoney(row.amount, currency, locale)} · ${row.n}`}>
            <div className="prc-months__col">
              <span className="prc-months__bar" style={{ height: `${Math.max(2, (row.amount / max) * 100)}%` }} />
              <small>{label}</small>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Summary for management (spec §5.3.5): sums by status, category and month,
 * the average approval time, overdue requests. Over what the person may see.
 */
export default function SummaryPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { meta, version } = useProc();
  const [data, setData] = useState(null);
  const [currency, setCurrency] = useState(null);
  useEffect(() => {
    procApi.summary().then((res) => setData(res.data)).catch(() => setData({ byStatus: [], byCategory: [], byMonth: [], approval: {}, overdue: [] }));
  }, [version]);
  const currencies = useMemo(() => {
    const used = new Set((data?.byStatus || []).map((row) => row.currency));
    return meta.settings.currencies.filter((code) => used.has(code)).concat([...used].filter((code) => !meta.settings.currencies.includes(code)));
  }, [data, meta]);
  const cur = currency && currencies.includes(currency) ? currency : currencies[0] || meta.settings.currency;
  if (!data) return <div className="prc-page"><Skeleton active paragraph={{ rows: 12 }} /></div>;
  const of = (rows) => rows.filter((row) => row.currency === cur);
  const statusRows = of(data.byStatus).map((row) => ({ key: row.status, label: t(`procurement.status.${row.status}`), amount: row.amount, n: row.n, color: STATUS_COLORS[row.status] }));
  const categoryRows = of(data.byCategory).sort((a, b) => b.amount - a.amount).map((row) => {
    const category = categoryOf(meta, row.category);
    return { key: row.category || '-', label: category?.name || t('procurement.summary.noCategory'), amount: row.amount, n: row.n, color: category?.color };
  });
  const total = of(data.byStatus).filter((row) => !['draft', 'rejected', 'cancelled'].includes(row.status)).reduce((sum, row) => sum + row.amount, 0);
  const paid = of(data.byStatus).reduce((sum, row) => sum + (row.paid || 0), 0);
  const inApproval = of(data.byStatus).filter((row) => ['pending', 'question'].includes(row.status)).reduce((sum, row) => sum + row.n, 0);
  return (
    <div className="prc-page">
      <header className="mod-hero prc-hero">
        <span className="mod-hero__badge" aria-hidden="true">
          <MenuIcon name="pie" />
        </span>
        <div className="mod-hero__text">
          <h1>{t('procurement.nav.summary')}</h1>
          <p>{t('procurement.summary.lead')}</p>
        </div>
        <div className="mod-hero__actions">
          <HelpButton id="procurement" section="summary" />
          {currencies.length > 1 && <Segmented value={cur} onChange={setCurrency} options={currencies} />}
        </div>
      </header>
      {!data.byStatus.length ? (
        <Empty icon="📊" title={t('procurement.summary.empty')} text={t('procurement.summary.emptyText')} />
      ) : (
        <>
          <div className="prc-kpis">
            <div className="prc-kpi">
              <small>{t('procurement.summary.total')}</small>
              <strong>{formatMoney(total, cur, locale)}</strong>
            </div>
            <div className="prc-kpi">
              <small>{t('procurement.summary.paid')}</small>
              <strong>{formatMoney(paid, cur, locale)}</strong>
            </div>
            <div className="prc-kpi">
              <small>{t('procurement.summary.avgApproval')}</small>
              <strong>{data.approval.avgSeconds === null || data.approval.avgSeconds === undefined ? '—' : shortDuration(data.approval.avgSeconds * 1000, t)}</strong>
              {data.approval.count > 0 && <em>{t('procurement.summary.median', { n: shortDuration((data.approval.medianSeconds ?? 0) * 1000, t), count: data.approval.count })}</em>}
            </div>
            <div className={`prc-kpi${data.overdue.length ? ' is-red' : ''}`}>
              <small>{t('procurement.chips.overdue')}</small>
              <strong>{data.overdue.length}</strong>
              <em>{t('procurement.summary.inApproval', { n: inApproval })}</em>
            </div>
          </div>
          <div className="prc-summary-grid">
            <section className="panel prc-panel">
              <h3>{t('procurement.summary.byStatus')}</h3>
              <Bars rows={statusRows} currency={cur} locale={locale} />
            </section>
            <section className="panel prc-panel">
              <h3>{t('procurement.summary.byCategory')}</h3>
              {categoryRows.length ? <Bars rows={categoryRows} currency={cur} locale={locale} /> : <p className="prc-muted">—</p>}
            </section>
            <section className="panel prc-panel is-wide">
              <h3>{t('procurement.summary.byMonth')}</h3>
              <Months rows={of(data.byMonth)} currency={cur} locale={locale} />
            </section>
            <section className="panel prc-panel is-wide">
              <h3>{t('procurement.summary.overdue')}</h3>
              {data.overdue.length ? (
                <ul className="prc-overdue">
                  {data.overdue.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => navigate(`/app/procurement/requests/${item.id}`)}>
                        <span className="prc-pay-row__no">{item.number}</span>
                        <span className="prc-overdue__title">{item.title}</span>
                        <StatusPill status={item.status} size="small" />
                        <span>{t(`procurement.overdueKind.${item.overdueKind}`)}</span>
                        {item.overdueKind === 'deliver' ? <DayBadge value={item.deliverBy} /> : item.payBy ? <DayBadge value={item.payBy} /> : null}
                        <strong>{formatMoney(item.amount, item.currency, locale)}</strong>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="prc-muted">{t('procurement.summary.noOverdue')}</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
