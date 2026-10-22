import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Empty, Input, Modal, Segmented, Select, Switch, Tag, Tooltip } from 'antd';
import { AppstoreOutlined, CloudServerOutlined, DesktopOutlined, EyeOutlined, HistoryOutlined, KeyOutlined, PlusOutlined, SafetyCertificateOutlined, SettingOutlined, ToolOutlined } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import ModuleHeader from '../../shared/ModuleHeader';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';
import HostDialog from '../components/HostDialog';
import ConnectDialog from '../components/ConnectDialog';

function HostCard({ host, can, onConnect, onEdit }) {
  const { t } = useLocale();
  const isServer = host.kind === 'server';
  return (
    <article className={`rm-host${host.active ? '' : ' is-off'}${isServer ? ' is-server' : ''}`}>
      <div className="rm-host__head">
        <div className="rm-host__icon">{isServer ? <CloudServerOutlined /> : <DesktopOutlined />}</div>
        <div className="rm-host__body">
          <div className="rm-host__title">
            <strong>{host.name}</strong>
            <Tag bordered={false} className="rm-proto">{host.protocol.toUpperCase()}</Tag>
            {isServer && <Tag bordered={false} className="rm-badge is-server">{t('remote.catalogue.server')}</Tag>}
            {host.monitored && (
              <Tooltip title={t('remote.catalogue.monitoredHint')}>
                <Tag bordered={false} className="rm-badge is-monitored"><EyeOutlined /> {t('remote.catalogue.monitored')}</Tag>
              </Tooltip>
            )}
          </div>
          <span className="rm-host__addr">{host.address}:{host.port}</span>
          <span className="rm-host__owner">
            {isServer ? (host.note || t('remote.catalogue.serverNote')) : host.ownerName ? t('remote.catalogue.owner', { name: host.ownerName }) : t('remote.catalogue.noOwner')}
          </span>
        </div>
        {can.admin && <Button type="text" size="small" icon={<SettingOutlined />} aria-label={t('common.edit')} onClick={() => onEdit(host)} />}
      </div>
      <div className="rm-host__actions">
        {can.connect && <Button block type={isServer ? 'primary' : 'default'} icon={isServer ? <DesktopOutlined /> : <ToolOutlined />} onClick={() => onConnect(host, 'assist')}>{isServer ? t('remote.catalogue.connect') : t('remote.catalogue.assist')}</Button>}
        {can.monitor && host.monitored && <Button block icon={<EyeOutlined />} onClick={() => onConnect(host, 'monitor')}>{t('remote.catalogue.observe')}</Button>}
      </div>
    </article>
  );
}

/** /app/remote — the computers people may reach. */
export default function Catalogue() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const remote = useRemote();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [connect, setConnect] = useState(null);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return remote.hosts.filter((host) => {
      if (filter === 'monitored' && !host.monitored) return false;
      if (!needle) return true;
      return `${host.name} ${host.address} ${host.ownerName || ''}`.toLowerCase().includes(needle);
    });
  }, [remote.hosts, search, filter]);

  const empty = remote.hosts.length === 0;

  return (
    <div className="rm-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.remote.name') }]}
        icon={<MenuIcon name="remote" />}
        title={t('apps.remote.name')}
        description={t('remote.catalogue.lead')}
        actions={[
          { key: 'vault', icon: <KeyOutlined />, label: t('remote.vault.title'), onClick: () => navigate('/app/remote/vault') },
          { key: 'my', icon: <SafetyCertificateOutlined />, label: t('remote.my.title'), onClick: () => navigate('/app/remote/my') },
          remote.can.admin && { key: 'journal', icon: <HistoryOutlined />, label: t('remote.journal.title'), onClick: () => navigate('/app/remote/journal') },
          remote.can.admin && { key: 'add', primary: true, icon: <PlusOutlined />, label: t('remote.catalogue.add'), onClick: () => setEditing({}) },
        ]}
        search={!empty ? { value: search, onChange: setSearch, onSearch: setSearch, placeholder: t('remote.catalogue.search') } : undefined}
        filters={!empty && remote.hosts.some((h) => h.monitored) ? (
          <Segmented size="small" value={filter} onChange={setFilter} options={[{ value: 'all', label: t('remote.catalogue.all') }, { value: 'monitored', label: t('remote.catalogue.monitored') }]} />
        ) : null}
      />

      {!remote.settings.guacdConfigured && (
        <p className="rm-note is-info">{t('remote.catalogue.guacdOff')}</p>
      )}

      {remote.apps.length > 0 && (
        <section className="rm-apps" data-tour="rm.apps">
          <h2 className="rm-section-title"><AppstoreOutlined /> {t('remote.apps.title')}</h2>
          <div className="rm-apps__grid">
            {remote.apps.map((app) => {
              const appHost = remote.hosts.find((h) => h.id === app.hostId);
              return (
                <button key={app.id} type="button" className="rm-app" onClick={() => appHost && setConnect({ host: appHost, app })} disabled={!appHost}>
                  <span className="rm-app__icon"><AppstoreOutlined /></span>
                  <span className="rm-app__text">
                    <strong>{app.name}</strong>
                    <small>{app.hostName}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {empty ? (
        <div className="rm-empty">
          <div className="rm-empty__art"><DesktopOutlined /></div>
          <h2>{t('remote.catalogue.emptyTitle')}</h2>
          <p>{t(remote.can.admin ? 'remote.catalogue.emptyAdmin' : 'remote.catalogue.emptyUser')}</p>
          {remote.can.admin && <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setEditing({})}>{t('remote.catalogue.add')}</Button>}
        </div>
      ) : shown.length === 0 ? (
        <Empty description={t('remote.catalogue.nothingFound')} />
      ) : (
        <div className="rm-grid" data-tour="rm.catalogue">
          {shown.map((host) => (
            <HostCard key={host.id} host={host} can={remote.can} onEdit={setEditing} onConnect={(h, m) => setConnect({ host: h, mode: m })} />
          ))}
        </div>
      )}

      <HostDialog open={Boolean(editing)} host={editing} onClose={(changed) => { setEditing(null); if (changed) remote.refresh(); }} />
      <ConnectDialog open={Boolean(connect)} host={connect?.host} app={connect?.app} mode={connect?.mode} onClose={() => setConnect(null)} />
    </div>
  );
}
