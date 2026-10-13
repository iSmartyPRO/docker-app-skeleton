import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Result, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDate } from '../../../lib/datetime';
import { HelpButton } from '../../../help/Hint';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';
import { STATUSES, formatArea, formatMoney, formatNumber, formatPercent, statusColor } from '../lib';
import { Readiness, StatusTag } from '../components/bits';
import PriceChart from '../components/PriceChart';

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`mp-kpi${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <em>{sub}</em>}
    </div>
  );
}

/** Дашборд (spec §9.8, simple MVP): sales, months, managers, readiness by levels, stale objects, "sold but not built". */
export default function DashboardPage() {
  const { t, locale } = useLocale();
  const { settings } = useMp();
  const { project } = useProject();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    mpApi
      .dashboard(project.id)
      .then((res) => setData(res.data))
      .catch(setError);
  }, [project.id]);
  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!data) return <Skeleton active paragraph={{ rows: 12 }} />;
  const s = data.sales;
  const by = (status) => s?.byStatus?.[status] || { count: 0, area: 0, sum: 0 };
  const sold = ['contract', 'sold', 'handed'].reduce((acc, key) => ({ count: acc.count + by(key).count, area: acc.area + by(key).area, sum: acc.sum + (by(key).sum || 0) }), { count: 0, area: 0, sum: 0 });
  const held = ['reserve', 'booking', 'deposit'].reduce((acc, key) => ({ count: acc.count + by(key).count, area: acc.area + by(key).area, sum: acc.sum + (by(key).sum || 0) }), { count: 0, area: 0, sum: 0 });
  const money = (value) => (value === null || value === undefined ? null : formatMoney(value, data.currency, locale));
  const maxMonth = Math.max(1, ...data.months.map((m) => m.booking + m.contract + m.sold));
  return (
    <div className="mp-page mp-dash">
      <header className="mp-head">
        <div>
          <h1>{t('mp.nav.dashboard')}</h1>
          <p>{project.name} · {t('mp.dash.currency', { cur: data.currency })}</p>
        </div>
        <div className="mp-head__actions">
          <HelpButton id="masterplan" section="dashboard" />
        </div>
      </header>
      {s && (
        <>
          <div className="mp-kpis">
            <Tile label={t('mp.dash.sold')} value={formatNumber(sold.count, locale)} sub={[formatArea(sold.area, locale), money(sold.sum)].filter(Boolean).join(' · ')} tone="sold" />
            <Tile label={t('mp.dash.held')} value={formatNumber(held.count, locale)} sub={[formatArea(held.area, locale), money(held.sum)].filter(Boolean).join(' · ')} tone="held" />
            <Tile label={t('mp.dash.free')} value={formatNumber(by('free').count, locale)} sub={[formatArea(by('free').area, locale), money(by('free').sum)].filter(Boolean).join(' · ')} tone="free" />
            {s.avgPricePerM2Sold !== null && <Tile label={t('mp.dash.ppm')} value={money(Math.round(s.avgPricePerM2Sold))} sub={t('mp.dash.ppmSub')} />}
            {s.conversion !== null && <Tile label={t('mp.dash.conversion')} value={formatPercent(s.conversion, locale)} sub={t('mp.dash.conversionSub')} />}
            {s.paid !== null && <Tile label={t('mp.dash.paid')} value={money(s.paid)} />}
          </div>
          <section className="mp-panel">
            <h2>{t('mp.dash.byStatus')} <span>{t('mp.dash.units', { n: formatNumber(s.total, locale) })}</span></h2>
            <div className="mp-statusbar is-big" role="img" aria-label={t('mp.dash.byStatus')}>
              {STATUSES.filter((status) => by(status).count).map((status) => (
                <span key={status} style={{ flex: by(status).count, background: statusColor(status, settings) }} title={`${t(`mp.status.${status}`)}: ${by(status).count}`} />
              ))}
            </div>
            <table className="mp-dtable">
              <tbody>
                {STATUSES.filter((status) => by(status).count).map((status) => (
                  <tr key={status}>
                    <td><StatusTag status={status} /></td>
                    <td className="is-num">{formatNumber(by(status).count, locale)}</td>
                    <td className="is-num">{formatArea(by(status).area, locale)}</td>
                    <td className="is-num">{money(by(status).sum) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="mp-dash__grid">
            <section className="mp-panel">
              <h2>{t('mp.dash.months')}</h2>
              {data.months.length ? (
                <>
                  <div className="mp-months" role="img" aria-label={t('mp.dash.months')}>
                    {data.months.map((m) => (
                      <div key={m.month} className="mp-months__col" title={`${m.month}: ${t('mp.status.booking')} ${m.booking}, ${t('mp.status.contract')} ${m.contract}, ${t('mp.status.sold')} ${m.sold}`}>
                        <div className="mp-months__stack" style={{ height: `${((m.booking + m.contract + m.sold) / maxMonth) * 100}%` }}>
                          {['sold', 'contract', 'booking'].map((key) => m[key] > 0 && <span key={key} style={{ flex: m[key], background: statusColor(key, settings) }} />)}
                        </div>
                        <em>{m.month.slice(5)}.{m.month.slice(2, 4)}</em>
                      </div>
                    ))}
                  </div>
                  <div className="mp-legend is-static">
                    {['booking', 'contract', 'sold'].map((key) => <StatusTag key={key} status={key} />)}
                  </div>
                </>
              ) : (
                <p className="mp-muted">{t('mp.dash.noMonths')}</p>
              )}
            </section>
            {data.managers.length > 0 && (
              <section className="mp-panel">
                <h2>{t('mp.dash.managers')}</h2>
                <table className="mp-dtable">
                  <thead>
                    <tr><th>{t('mp.f.manager')}</th><th className="is-num">{t('mp.status.reserve')}</th><th className="is-num">{t('mp.status.booking')}</th><th className="is-num">{t('mp.dash.deals')}</th></tr>
                  </thead>
                  <tbody>
                    {data.managers.map((m) => (
                      <tr key={m.id}><td>{m.name}</td><td className="is-num">{m.reserve}</td><td className="is-num">{m.booking}</td><td className="is-num">{m.deal}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </>
      )}
      {data.prices && (
        <section className="mp-panel">
          <h2>{t('mp.dash.priceChart')} <span>{data.prices.currency} / м²</span></h2>
          <PriceChart data={data.prices} />
        </section>
      )}
      {data.construction && (
        <div className="mp-dash__grid">
          <section className="mp-panel">
            <h2>{t('mp.dash.readiness')} <span>{formatPercent(data.construction.readiness, locale)}</span></h2>
            <ul className="mp-levels">
              {data.construction.byLevel.map((item) => (
                <li key={item.id}>
                  <span>{item.code || item.name}{item.code && item.name ? ` · ${item.name}` : ''}</span>
                  <Readiness value={item.readiness} />
                  {item.behind > 0 && <em className="mp-sched is-behind">{t('mp.dash.behindN', { n: item.behind })}</em>}
                </li>
              ))}
            </ul>
            <p className="mp-muted mp-small">{t('mp.dash.objects', { n: data.construction.objects, behind: data.construction.behind })}</p>
          </section>
          <section className="mp-panel">
            <h2>{t('mp.dash.stale', { n: data.construction.staleDays })} <span>{data.construction.staleCount}</span></h2>
            {data.construction.stale.length ? (
              <ul className="mp-simplelist">
                {data.construction.stale.map((item) => (
                  <li key={item.id}>
                    <Link to={`/app/masterplan/p/${project.id}/plan?node=${item.id}`}>{item.code || item.name}</Link>
                    <span className="mp-muted">{item.lastReportAt ? fmtDate(item.lastReportAt) : t('mp.con.never')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mp-muted">{t('mp.dash.allFresh')}</p>
            )}
          </section>
        </div>
      )}
      {data.risks?.length > 0 && (
        <section className="mp-panel">
          <h2>{t('mp.dash.risks')}</h2>
          <table className="mp-dtable">
            <tbody>
              {data.risks.map((item) => (
                <tr key={item.id}>
                  <td><Link to={`/app/masterplan/p/${project.id}/plan?node=${item.id}`}>{item.code || item.name}</Link></td>
                  <td><StatusTag status={item.status} /></td>
                  <td><Readiness value={item.readiness} compact /></td>
                  <td>{item.delayDays > 0 ? <span className="mp-sched is-behind">{t('mp.sched.behind', { n: item.delayDays })}</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
