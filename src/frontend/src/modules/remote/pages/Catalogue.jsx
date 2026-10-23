import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dropdown, Empty, Segmented, Tag, Tooltip } from 'antd';
import { AppstoreOutlined, CloudDownloadOutlined, CloudServerOutlined, DesktopOutlined, EyeOutlined, HistoryOutlined, KeyOutlined, MoreOutlined, PlusOutlined, SafetyCertificateOutlined, SettingOutlined, ToolOutlined } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader from '../../shared/ModuleHeader';
import { useRemote } from '../RemoteContext';
import HostDialog from '../components/HostDialog';
import Launcher from '../components/Launcher';
import FolderBar, { matchesFolder, moveMenuItems } from '../components/FolderBar';

function HostCard({ host, can, onConnect, onEdit, menu }) {
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
        {can.admin && (
          <span className="rm-host__head-tools">
            <Button type="text" size="small" icon={<SettingOutlined />} aria-label={t('common.edit')} onClick={() => onEdit(host)} />
            <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: menu }}>
              <Button type="text" size="small" icon={<MoreOutlined />} aria-label={t('moduleHeader.more')} />
            </Dropdown>
          </span>
        )}
      </div>
      <div className="rm-host__actions">
        {can.connect && <Button block type={isServer ? 'primary' : 'default'} icon={isServer ? <DesktopOutlined /> : <ToolOutlined />} onClick={() => onConnect(host, 'assist')}>{isServer ? t('remote.catalogue.connect') : t('remote.catalogue.assist')}</Button>}
        {can.monitor && host.monitored && <Button block icon={<EyeOutlined />} onClick={() => onConnect(host, 'monitor')}>{t('remote.catalogue.observe')}</Button>}
      </div>
    </article>
  );
}

/** /app/remote — computers (direct RDP/VNC), organised by folder. */
export default function Catalogue() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const remote = useRemote();
  const [search, setSearch] = useState('');
  const [monitored, setMonitored] = useState('all');
  const [folder, setFolder] = useState('all');
  const [editing, setEditing] = useState(null);
  const [connect, setConnect] = useState(null);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const inFolder = matchesFolder(folder);
    return remote.hosts.filter((host) => {
      if (!inFolder(host)) return false;
      if (monitored === 'monitored' && !host.monitored) return false;
      if (!needle) return true;
      return `${host.name} ${host.address} ${host.ownerName || ''}`.toLowerCase().includes(needle);
    });
  }, [remote.hosts, search, monitored, folder]);
  const countFor = (key) => remote.hosts.filter(matchesFolder(key)).length;

  const empty = remote.hosts.length === 0;

  return (
    <div className="rm-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.remote.name') }]}
        icon={<MenuIcon name="remote" />}
        title={t('remote.nav.computers')}
        description={t('remote.catalogue.lead')}
        actions={[
          { key: 'apps', icon: <AppstoreOutlined />, label: t('remote.apps.title'), onClick: () => navigate('/app/remote/apps') },
          { key: 'vault', icon: <KeyOutlined />, label: t('remote.vault.title'), onClick: () => navigate('/app/remote/vault') },
          { key: 'my', icon: <SafetyCertificateOutlined />, label: t('remote.my.title'), onClick: () => navigate('/app/remote/my') },
          remote.can.admin && { key: 'pvnc', icon: <CloudDownloadOutlined />, label: t('remote.pvnc.nav'), onClick: () => navigate('/app/remote/portal-vnc') },
          remote.can.admin && { key: 'journal', icon: <HistoryOutlined />, label: t('remote.journal.title'), onClick: () => navigate('/app/remote/journal') },
          remote.can.admin && { key: 'add', primary: true, icon: <PlusOutlined />, label: t('remote.catalogue.add'), onClick: () => setEditing({}) },
        ]}
        search={!empty ? { value: search, onChange: setSearch, onSearch: setSearch, placeholder: t('remote.catalogue.search') } : undefined}
        filters={!empty && remote.hosts.some((h) => h.monitored) ? (
          <Segmented size="small" value={monitored} onChange={setMonitored} options={[{ value: 'all', label: t('remote.catalogue.all') }, { value: 'monitored', label: t('remote.catalogue.monitored') }]} />
        ) : null}
      />

      {!remote.settings.guacdConfigured && <p className="rm-note is-info">{t('remote.catalogue.guacdOff')}</p>}

      {!empty && <FolderBar value={folder} onChange={setFolder} countFor={countFor} />}

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
            <HostCard
              key={host.id}
              host={host}
              can={remote.can}
              onEdit={setEditing}
              onConnect={(h, m) => setConnect({ host: h, mode: m })}
              menu={[{ key: 'creds', icon: <KeyOutlined />, label: t('remote.connect.withCreds'), onClick: () => setConnect({ host, mode: 'assist', ask: true }) }, moveMenuItems(remote, 'host', host.id, t, remote.refresh)]}
            />
          ))}
        </div>
      )}

      <HostDialog open={Boolean(editing)} host={editing} onClose={(changed) => { setEditing(null); if (changed) remote.refresh(); }} />
      <Launcher request={connect} onClose={() => setConnect(null)} />
    </div>
  );
}
