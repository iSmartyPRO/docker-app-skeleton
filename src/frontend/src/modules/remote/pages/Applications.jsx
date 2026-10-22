import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Dropdown, Empty, Tag, Tooltip } from 'antd';
import { AppstoreOutlined, DesktopOutlined, ImportOutlined, MoreOutlined, PlusOutlined, SafetyOutlined, SettingOutlined } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader from '../../shared/ModuleHeader';
import { useRemote } from '../RemoteContext';
import ConnectDialog from '../components/ConnectDialog';
import AppDialog from '../components/AppDialog';
import GatewaysDialog from '../components/GatewaysDialog';
import RdpImportDialog from '../components/RdpImportDialog';
import FolderBar, { moveMenuItems } from '../components/FolderBar';

function AppTile({ app, gateway, canAdmin, onLaunch, onEdit, menu }) {
  const { t } = useLocale();
  return (
    <article className="rm-apptile">
      <button type="button" className="rm-apptile__main" onClick={onLaunch}>
        <span className="rm-apptile__icon"><AppstoreOutlined /></span>
        <span className="rm-apptile__text">
          <strong>{app.name}</strong>
          <small>{app.address}{gateway ? ` · ${t('remote.apps.viaShort', { gw: gateway.name })}` : ''}</small>
        </span>
      </button>
      {canAdmin && (
        <span className="rm-apptile__tools">
          <Button type="text" size="small" icon={<SettingOutlined />} aria-label={t('common.edit')} onClick={onEdit} />
          <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: menu }}>
            <Button type="text" size="small" icon={<MoreOutlined />} aria-label={t('moduleHeader.more')} />
          </Dropdown>
        </span>
      )}
    </article>
  );
}

/** /app/remote/apps — published applications (RemoteApp), organised by folder. */
export default function Applications() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const remote = useRemote();
  const [folder, setFolder] = useState('all');
  const [connect, setConnect] = useState(null);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [gateways, setGateways] = useState(false);

  const inFolder = useCallback((item) => (folder === 'all' ? true : folder === 'none' ? !item.folderId : String(item.folderId) === String(folder)), [folder]);
  const shown = useMemo(() => remote.apps.filter(inFolder), [remote.apps, inFolder]);
  const countFor = (key) => remote.apps.filter((a) => (key === 'all' ? true : key === 'none' ? !a.folderId : String(a.folderId) === String(key))).length;
  const gatewayOf = (app) => remote.gateways.find((g) => g.id === app.gatewayId) || (app.gatewayName ? { name: app.gatewayName } : null);

  const empty = remote.apps.length === 0;

  return (
    <div className="rm-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.remote.name'), to: '/app/remote' }, { key: 'apps', label: t('remote.apps.title') }]}
        icon={<MenuIcon name="remote" />}
        title={t('remote.apps.title')}
        description={t('remote.apps.lead')}
        actions={[
          { key: 'computers', icon: <DesktopOutlined />, label: t('remote.nav.computers'), onClick: () => navigate('/app/remote') },
          remote.can.admin && { key: 'gw', icon: <SafetyOutlined />, label: t('remote.gateways.title'), onClick: () => setGateways(true) },
          remote.can.admin && { key: 'rdp', icon: <ImportOutlined />, label: t('remote.rdp.title'), onClick: () => setImporting(true) },
          remote.can.admin && { key: 'add', primary: true, icon: <PlusOutlined />, label: t('remote.apps.addTitle'), onClick: () => setEditing({}) },
        ]}
      />

      {!remote.settings.guacdConfigured && <p className="rm-note is-info">{t('remote.catalogue.guacdOff')}</p>}

      {!empty && <FolderBar value={folder} onChange={setFolder} countFor={countFor} />}

      {empty ? (
        <div className="rm-empty">
          <div className="rm-empty__art"><AppstoreOutlined /></div>
          <h2>{t('remote.apps.emptyTitle')}</h2>
          <p>{t(remote.can.admin ? 'remote.apps.emptyAdmin' : 'remote.apps.emptyUser')}</p>
          {remote.can.admin && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="primary" size="large" icon={<ImportOutlined />} onClick={() => setImporting(true)}>{t('remote.rdp.title')}</Button>
              <Button size="large" icon={<PlusOutlined />} onClick={() => setEditing({})}>{t('remote.apps.addTitle')}</Button>
            </div>
          )}
        </div>
      ) : shown.length === 0 ? (
        <Empty description={t('remote.apps.emptyFolder')} />
      ) : (
        <div className="rm-apps__grid" data-tour="rm.apps">
          {shown.map((app) => (
            <AppTile
              key={app.id}
              app={app}
              gateway={gatewayOf(app)}
              canAdmin={remote.can.admin}
              onLaunch={() => setConnect({ host: { id: app.id, name: app.name, kind: 'app', protocol: 'rdp', hasCredentials: app.hasCredentials, credUsername: app.credUsername, defaultCred: app.defaultCred }, app })}
              onEdit={() => setEditing(app)}
              menu={[moveMenuItems(remote, 'app', app.id, t, remote.refresh)]}
            />
          ))}
        </div>
      )}

      <ConnectDialog open={Boolean(connect)} host={connect?.host} app={connect?.app} onClose={() => setConnect(null)} />
      <AppDialog open={Boolean(editing)} app={editing} onClose={(c) => { setEditing(null); if (c) remote.refresh(); }} />
      <GatewaysDialog open={gateways} onClose={() => setGateways(false)} />
      <RdpImportDialog open={importing} onClose={(c) => { setImporting(false); if (c) remote.refresh(); }} />
    </div>
  );
}
