import { useState } from 'react';
import { Button } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatRelative } from '../../../lib/format';
import { useDrive } from '../DriveContext';
import ConnectDialog from '../components/ConnectDialog';

/** How each file server is opened for the person, and a way to change it. */
export default function Connections() {
  const { t, locale } = useLocale();
  const { connections, refresh } = useDrive();
  const [editing, setEditing] = useState(null);
  return (
    <div className="fs-page">
      <header className="fs-head">
        <div className="fs-head__text">
          <h1>{t('drive.connections')}</h1>
          <p>{t('drive.connectionsLead')}</p>
        </div>
      </header>
      <div className="dv-conns">
        {(connections || []).map((item) => {
          const ok = item.status === 'ok';
          return (
            <div key={item.serverId} className={`dv-conn${ok ? ' is-ok' : ' is-problem'}`}>
              <span className="dv-conn__state" aria-hidden="true">{ok ? '✓' : '!'}</span>
              <div className="dv-conn__text">
                <strong>{item.serverName}</strong>
                <code>{item.host}</code>
                <span>
                  {item.source === 'login' && t('drive.via.login', { user: item.username })}
                  {item.source === 'manual' && t('drive.via.manual', { user: item.domain ? `${item.domain}\\${item.username}` : item.username })}
                  {item.source === 'service' && t('drive.via.service')}
                  {!item.source && t('drive.via.none')}
                  {item.since && ok ? ` · ${formatRelative(item.since, locale)}` : ''}
                </span>
                {!ok && item.status !== 'missing' && <em>{t(`drive.parked.${item.status}`) === `drive.parked.${item.status}` ? t('drive.parked.AUTH_FAILED') : t(`drive.parked.${item.status}`)}</em>}
              </div>
              {item.source !== 'service' && (
                <Button type={ok ? 'default' : 'primary'} onClick={() => setEditing(item)}>
                  {ok ? t('drive.changeAccount') : t('drive.signIn')}
                </Button>
              )}
            </div>
          );
        })}
        {!connections?.length && <div className="fs-empty"><span>{t('drive.noServers')}</span></div>}
      </div>
      <div className="dv-conns__note">
        <span aria-hidden="true">🛡</span>
        <p>{t('drive.securityNote')}</p>
      </div>
      <ConnectDialog
        open={Boolean(editing)}
        connection={editing}
        onClose={(changed) => {
          setEditing(null);
          if (changed) refresh();
        }}
      />
    </div>
  );
}
