import { useEffect, useState } from 'react';
import { App, Alert, Button, Input, Modal, Switch } from 'antd';
import { EyeOutlined, SafetyCertificateOutlined, ToolOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';
import RemoteViewer from './RemoteViewer';

/**
 * Starts a session and opens the live viewer. The dialog is explicit about what
 * the employee will see — there is no silent option. A «server» host has nobody
 * behind it, so it is a plain admin connection without the consent messaging.
 */
export default function ConnectDialog({ open, host, mode, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const remote = useRemote();
  const [control, setControl] = useState(true);
  const [creds, setCreds] = useState({ username: '', password: '', domain: '' });
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (open) {
      setControl(host?.kind === 'server' ? true : mode === 'assist');
      setCreds({ username: '', password: '', domain: '' });
      setSession(null);
    }
  }, [open, host, mode]);

  if (!host) return null;
  const isServer = host.kind === 'server';
  const isMonitor = mode === 'monitor' && !isServer;
  const needCreds = host.protocol === 'rdp' && !host.hasCredentials;

  const start = async () => {
    setStarting(true);
    try {
      const stage = document.querySelector('.rm-connect-size');
      const res = await remoteApi.start({
        hostId: host.id,
        mode: isServer ? 'assist' : mode,
        control,
        width: stage ? Math.round(window.innerWidth * 0.9) : 1280,
        height: stage ? Math.round(window.innerHeight * 0.8) : 720,
        ...(needCreds ? creds : {}),
      });
      setSession(res.data);
      if (res.data.tunnel !== 'READY') message.info(t('remote.connect.pilotTitle'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const finish = async () => {
    if (session?.session?.id) await remoteApi.end(session.session.id).catch(() => {});
    setSession(null);
    onClose();
  };

  // Live screen.
  if (session?.tunnel === 'READY') {
    return <RemoteViewer token={session.token} path={session.path} hostName={host.name} readOnly={session.readOnly} onClose={finish} onRetry={async () => { if (session.session?.id) await remoteApi.end(session.session.id).catch(() => {}); setSession(null); start(); }} />;
  }

  return (
    <Modal
      open={open}
      onCancel={finish}
      title={<span>{isMonitor ? <EyeOutlined /> : <ToolOutlined />} {t(isMonitor ? 'remote.connect.observeTitle' : isServer ? 'remote.connect.serverTitle' : 'remote.connect.assistTitle', { name: host.name })}</span>}
      footer={session ? [<Button key="c" onClick={finish}>{t('remote.connect.finish')}</Button>] : [
        <Button key="x" onClick={finish}>{t('common.cancel')}</Button>,
        <Button key="go" type="primary" loading={starting} onClick={start}>{t('remote.connect.start')}</Button>,
      ]}
      width={560}
      destroyOnHidden
    >
      {!session ? (
        <>
          {isServer ? (
            <Alert type="info" showIcon message={t('remote.connect.serverNote')} description={`${host.address}:${host.port} · ${host.protocol.toUpperCase()}`} style={{ marginBottom: 16 }} />
          ) : (
            <Alert
              type="info"
              showIcon
              icon={<SafetyCertificateOutlined />}
              message={t('remote.connect.transparencyTitle')}
              description={t(isMonitor ? 'remote.connect.transparencyMonitor' : 'remote.connect.transparencyAssist', { name: host.ownerName || t('remote.catalogue.noOwner') })}
              style={{ marginBottom: 16 }}
            />
          )}
          <label className="rm-inline__switch">
            <Switch checked={control} onChange={setControl} />
            <span>
              <strong>{t('remote.connect.control')}</strong>
              <small>{control ? t('remote.connect.controlOn') : t('remote.connect.controlOff')}</small>
            </span>
          </label>
          {isMonitor && control && remote.settings.requireConsentForControl && (
            <p className="rm-muted" style={{ marginTop: 8 }}>{t('remote.connect.controlConsent')}</p>
          )}
          {needCreds && (
            <div className="rm-creds">
              <p className="rm-muted">{t('remote.connect.credsHint')}</p>
              <div className="rm-creds__row">
                <Input placeholder={t('remote.host.credUser')} value={creds.username} onChange={(e) => setCreds((c) => ({ ...c, username: e.target.value }))} />
                <Input placeholder={t('remote.host.credDomain')} value={creds.domain} onChange={(e) => setCreds((c) => ({ ...c, domain: e.target.value }))} style={{ maxWidth: 160 }} />
              </div>
              <Input.Password placeholder={t('remote.host.credPassword')} value={creds.password} onChange={(e) => setCreds((c) => ({ ...c, password: e.target.value }))} />
            </div>
          )}
        </>
      ) : (
        <div className="rm-viewer">
          <div className="rm-viewer__screen">
            <SafetyCertificateOutlined />
            <p>{t('remote.connect.pilotTitle')}</p>
            <span>{t('remote.connect.pilotText')}</span>
          </div>
          <Alert type="success" showIcon message={t('remote.connect.recorded')} description={host.ownerName ? t('remote.connect.notified', { name: host.ownerName }) : t('remote.connect.serverNote')} />
        </div>
      )}
    </Modal>
  );
}
