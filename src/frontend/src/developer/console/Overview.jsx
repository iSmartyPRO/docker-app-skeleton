import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { formatDateTime } from '../../lib/format';
import { Bars, Donut, Legend, TimeChart } from '../../modules/dashboard/charts';
import { CodeTabs, MethodBadge, PathText, requestSamples } from '../components';
import { localeTag } from '../../i18n/languages';

const STATUS_COLORS = { '2xx': '#10B981', '3xx': '#0EA5E9', '4xx': '#F59E0B', '5xx': '#EF4444' };

export default function Overview({ overview, go, openEditor }) {
  const { t, locale } = useLocale();
  if (!overview) return <div className="ax-skeleton" />;
  const { stats, counts, origin } = overview;
  const totals = stats.totals;
  const statusData = stats.statuses.map((item) => ({ key: item.class, label: item.class, value: item.total, color: STATUS_COLORS[item.class] || '#94A3B8' }));
  const errorRate = totals.total ? Math.round((totals.errors / totals.total) * 1000) / 10 : 0;
  const hour = (value) => formatDateTime(value, locale, { timeStyle: 'short' });
  const attention = [
    counts.expiringSoon ? { tone: 'warn', text: t('api.expiring', { count: counts.expiringSoon }), action: () => go('tokens') } : null,
    counts.unusedMonth ? { tone: 'info', text: t('api.unused', { count: counts.unusedMonth }), action: () => go('tokens') } : null,
    ...(counts.failing || []).map((hook) => ({ tone: 'bad', text: t('api.failing', { name: hook.name }), action: () => go('webhooks') })),
  ].filter(Boolean);

  return (
    <div className="ax-overview dc-scope">
      <div className="ax-kpis">
        <button type="button" className="ax-kpi" onClick={() => go('tokens')}>
          <span>{t('api.kpi.tokens')}</span>
          <strong>{counts.tokens}</strong>
          <em>{t('api.tabs.templates')}: {counts.templates}</em>
        </button>
        <button type="button" className="ax-kpi" onClick={() => go('log')}>
          <span>{t('api.kpi.requests')}</span>
          <strong>{totals.total.toLocaleString(localeTag(locale))}</strong>
          <em>{t('api.kpi.avg', { ms: totals.avgMs })}</em>
        </button>
        <button type="button" className={`ax-kpi${errorRate > 5 ? ' is-bad' : ''}`} onClick={() => go('log', { status: 'error' })}>
          <span>{t('api.kpi.errors')}</span>
          <strong>{errorRate}%</strong>
          <em>
            401/403: {totals.denied} · 429: {totals.limited}
          </em>
        </button>
        <div className="ax-kpi">
          <span>{t('api.kpi.latency')}</span>
          <strong>
            {totals.p95Ms}
            <small> {t('api.log.ms')}</small>
          </strong>
          <em>{t('api.kpi.avg', { ms: totals.avgMs })}</em>
        </div>
        <button type="button" className="ax-kpi" onClick={() => go('webhooks')}>
          <span>{t('api.kpi.webhooks')}</span>
          <strong>{counts.webhooks}</strong>
          <em>{t('api.webhooks.title')}</em>
        </button>
      </div>

      <div className="ax-cols">
        <section className="ax-card ax-card--wide">
          <header>
            <h3>{t('api.chart.title')}</h3>
            <span className="ax-legend">
              <i style={{ background: 'var(--da-primary)' }} /> {t('api.chart.requests')}
              <i style={{ background: '#EF4444' }} /> {t('api.chart.errors')}
            </span>
          </header>
          {totals.total ? (
            <div className="ax-chart">
              <TimeChart
                labels={stats.series.map((point) => point.at)}
                series={[
                  { key: 'total', label: t('api.chart.requests'), values: stats.series.map((point) => point.total), color: 'var(--da-primary)' },
                  { key: 'errors', label: t('api.chart.errors'), values: stats.series.map((point) => point.errors), color: '#EF4444' },
                ]}
                height={220}
                formatLabel={hour}
              />
            </div>
          ) : (
            <div className="ax-chart-empty">
              <p>{t('api.chart.empty')}</p>
              <button type="button" className="ax-linkbtn" onClick={() => openEditor()}>
                <PlusOutlined /> {t('api.newToken')}
              </button>
            </div>
          )}
        </section>

        <section className="ax-card">
          <header>
            <h3>{t('api.statusMix')}</h3>
          </header>
          {totals.total ? (
            <div className="ax-donut">
              <Donut data={statusData} center={totals.total} sub={t('api.chart.requests').toLowerCase()} />
              <Legend data={statusData} />
            </div>
          ) : (
            <p className="ax-muted">—</p>
          )}
        </section>
      </div>

      <div className="ax-cols">
        <section className="ax-card">
          <header>
            <h3>{t('api.topPaths')}</h3>
          </header>
          {stats.paths.length ? (
            <ul className="ax-toplist">
              {stats.paths.map((item) => (
                <li key={`${item.method}${item.path}`}>
                  <MethodBadge method={item.method} small />
                  <PathText path={item.path} />
                  <b>{item.total}</b>
                  {item.errors > 0 && <em>{item.errors}✕</em>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ax-muted">—</p>
          )}
        </section>
        <section className="ax-card">
          <header>
            <h3>{t('api.topTokens')}</h3>
          </header>
          {stats.tokens.length ? (
            <Bars data={stats.tokens.map((item) => ({ key: String(item.id), label: item.name || item.prefix || t('api.unknownToken'), value: item.total, color: 'var(--da-primary)' }))} />
          ) : (
            <p className="ax-muted">—</p>
          )}
        </section>
        <section className="ax-card">
          <header>
            <h3>{t('api.attention')}</h3>
          </header>
          {attention.length ? (
            <ul className="ax-attn">
              {attention.map((item) => (
                <li key={item.text} className={`is-${item.tone}`}>
                  <button type="button" onClick={item.action}>
                    {item.text} →
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ax-good">✓ {t('api.allGood')}</p>
          )}
        </section>
      </div>

      <section className="ax-card ax-quick">
        <header>
          <h3>{t('api.quickStart')}</h3>
          <span className="ax-muted">{t('api.quickStartText')}</span>
        </header>
        <CodeTabs samples={requestSamples({ method: 'GET', url: `${origin}/api/v1/app/tasks/tasks?role=doing&open=1` })} />
      </section>
    </div>
  );
}
