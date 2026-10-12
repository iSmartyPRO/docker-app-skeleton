import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button, Empty, Skeleton, Tag } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import LoadState from '../../components/ui/LoadState';
import { MenuIcon } from '../../components/icons/menuIcons';
import { SETTINGS_ITEMS } from '../../admin/navigation';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useThemeMode } from '../../context/ThemeContext';
import { formatDuration, formatRelative, initials } from '../../lib/format';
import { getAdminOverview } from '../../services/api';
import { EVENT_TAG } from './Activity';

const QUICK_SETTINGS = ['general', 'theme', 'access', 'ip', 'email', 'system'];

function Kpi({ label, value, hint, icon, to }) {
  const body = (
    <>
      <span className="kpi__icon">{icon}</span>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value}</span>
      {hint && <span className="kpi__hint">{hint}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="kpi is-link">
      {body}
    </Link>
  ) : (
    <div className="kpi">{body}</div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="panel">
      <header className="panel__head">
        <h3>{title}</h3>
        {action}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export default function AdminDashboard() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { appearance } = useThemeMode();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getAdminOverview();
      setData(res.data.overview);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const icon = (name) => <MenuIcon name={name} appearance={appearance} />;
  const integrationsOn = data ? Object.values(data.integrations).filter(Boolean).length : 0;
  const integrationsTotal = data ? Object.keys(data.integrations).length : 0;

  return (
    <div className="dashboard">
      <PageHeader
        title={t('dashboard.greeting', { name: user?.displayName || user?.username || '' })}
        description={t('dashboard.lead', { app: data?.app?.name || t('brand') })}
      />
      {!ready ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <LoadState ready={ready} error={error} onRetry={load}>
          {data && (
            <>
              <div className="kpi-grid">
                <Kpi
                  to="/admin/users"
                  icon={icon('people')}
                  label={t('dashboard.users')}
                  value={data.users.total}
                  hint={t('dashboard.usersHint', { admins: data.users.admins, blocked: data.users.blocked })}
                />
                <Kpi
                  icon={icon('chart')}
                  label={t('dashboard.active30d')}
                  value={data.users.active30d}
                  hint={t('dashboard.active30dHint')}
                />
                {data.visible?.security !== false && <Kpi
                  to="/admin/activity"
                  icon={icon('shield')}
                  label={t('dashboard.events24h')}
                  value={data.security.total24h}
                  hint={t('dashboard.events24hHint')}
                />}
                <Kpi
                  to="/admin/settings"
                  icon={icon('integrations')}
                  label={t('dashboard.integrations')}
                  value={`${integrationsOn} / ${integrationsTotal}`}
                  hint={t('dashboard.integrationsHint')}
                />
              </div>

              <div className="dashboard__grid">
                {data.visible?.security !== false && (
                <Panel
                  title={t('dashboard.recentEvents')}
                  action={<Link to="/admin/activity">{t('dashboard.viewAll')} →</Link>}
                >
                  {data.security.recent.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.noEvents')} />
                  ) : (
                    <ul className="feed">
                      {data.security.recent.map((event) => (
                        <li key={event.id} className="feed__item">
                          <Tag color={EVENT_TAG[event.kind] || 'default'} bordered={false}>
                            {t(`admin.event_${event.kind}`)}
                          </Tag>
                          <span className="feed__main">
                            {event.username || '—'} <span className="feed__muted">· {event.ip || '—'}</span>
                          </span>
                          <span className="feed__time">{formatRelative(event.created_at, locale)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
                )}

                {data.visible?.recentLogins !== false && (
                <Panel
                  title={t('dashboard.recentLogins')}
                  action={<Link to="/admin/users">{t('dashboard.viewAll')} →</Link>}
                >
                  {data.recentLogins.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.noLogins')} />
                  ) : (
                    <ul className="feed">
                      {data.recentLogins.map((item) => (
                        <li key={item.id} className="feed__item">
                          <Avatar size={28} src={item.avatarUrl}>
                            {initials(item.displayName || item.username)}
                          </Avatar>
                          <Link to={`/admin/users/${item.id}`} className="feed__main">
                            {item.displayName || item.username}
                            <span className="feed__muted"> · @{item.username}</span>
                          </Link>
                          <span className="feed__time">{formatRelative(item.lastLoginAt, locale)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
                )}

                <Panel title={t('dashboard.quickSettings')} action={<Link to="/admin/settings">{t('nav.settings')} →</Link>}>
                  <div className="quick-grid">
                    {QUICK_SETTINGS.map((id) => {
                      const item = SETTINGS_ITEMS.find((entry) => entry.id === id);
                      return (
                        <Link key={id} to={item.path} className="quick-link">
                          <MenuIcon slot={item.key} appearance={appearance} />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </Panel>

                <Panel title={t('dashboard.status')} action={<Button size="small" type="text" onClick={load}>↻</Button>}>
                  <dl className="status-list">
                    <div>
                      <dt>{t('dashboard.accessMode')}</dt>
                      <dd>
                        <Tag bordered={false} color={data.app.accessMode === 'open' ? 'blue' : 'default'}>
                          {data.app.accessMode === 'open' ? t('common.open') : t('common.closed')}
                        </Tag>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.allowList')}</dt>
                      <dd>
                        <Tag bordered={false} color={data.security.whitelistEnabled ? 'green' : 'default'}>
                          {data.security.whitelistEnabled ? t('settings.integration.on') : t('settings.integration.off')}
                        </Tag>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.uptime')}</dt>
                      <dd>{formatDuration(data.uptimeSeconds, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.version')}</dt>
                      <dd>v{data.app.version}</dd>
                    </div>
                  </dl>
                </Panel>
              </div>
            </>
          )}
        </LoadState>
      )}
    </div>
  );
}
