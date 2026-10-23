import { useEffect, useState } from 'react';
import { App, Alert, Button, Modal, Switch } from 'antd';
import { AppstoreOutlined, EyeOutlined, SafetyCertificateOutlined, ToolOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';
import SessionViewer from './SessionViewer';
import CredentialPicker, { defaultCredentialValue } from './CredentialPicker';

/**
 * Starts a session (a desktop, or one RemoteApp) and opens the live viewer.
 * The person chooses where the credentials come from. The dialog is explicit
 * about what the employee will see — there is no silent option.
 */
export default function ConnectDialog({ open, host, app, mode, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const remote = useRemote();
  const [control, setControl] = useState(true);
  const [auth, setAuth] = useState({ source: 'manual', id: null, username: '', domain: '', password: '' });
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (open && host) {
      setControl(host.kind === 'server' ? true : mode === 'assist');
      setAuth(defaultCredentialValue(host));
      setSession(null);
    }
  }, [open, host, mode]);

  if (!host) return null;
  const isServer = host.kind === 'server' || host.kind === 'app' || Boolean(app);
  const isMonitor = mode === 'monitor' && !isServer;
  const needsCreds = host.protocol === 'rdp' || host.protocol === 'vnc' || host.protocol === 'pvnc';

  const start = async () => {
    if (auth.source === 'passbolt' && !auth.id) { message.warning(t('remote.creds.passboltChoose')); return; }
    setStarting(true);
    try {
      const res = await remoteApi.start({
        hostId: app ? undefined : host.id,
        appId: app?.id || undefined,
        mode: isServer ? 'assist' : mode,
        control,
        width: Math.round(window.innerWidth * 0.95),
        height: Math.round((window.innerHeight - 48) * 0.98),
        auth: { source: auth.source, id: auth.id },
        ...(auth.source === 'manual' ? { username: auth.username, domain: auth.domain, password: auth.password } : {}),
      });
      setSession(res.data);
      if (res.data.tunnel !== 'READY') message.info(res.data.tunnel === 'PVNC_OFF' ? t('remote.pvnc.offNotice') : t('remote.connect.pilotTitle'));
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

  if (session?.tunnel === 'READY') {
    return <SessionViewer viewer={session.viewer} token={session.token} path={session.path} hostName={app ? `${app.name} · ${host.name}` : host.name} readOnly={session.readOnly} onClose={finish} onRetry={async () => { if (session.session?.id) await remoteApi.end(session.session.id).catch(() => {}); setSession(null); start(); }} />;
  }

  const title = app
    ? <span><AppstoreOutlined /> {t('remote.connect.appTitle', { name: app.name })}</span>
    : <span>{isMonitor ? <EyeOutlined /> : <ToolOutlined />} {t(isMonitor ? 'remote.connect.observeTitle' : isServer ? 'remote.connect.serverTitle' : 'remote.connect.assistTitle', { name: host.name })}</span>;

  return (
    <Modal
      open={open}
      onCancel={finish}
      title={title}
      footer={session ? [<Button key="c" onClick={finish}>{t('remote.connect.finish')}</Button>] : [
        <Button key="x" onClick={finish}>{t('common.cancel')}</Button>,
        <Button key="go" type="primary" loading={starting} onClick={start}>{app ? t('remote.connect.launch') : t('remote.connect.start')}</Button>,
      ]}
      width={560}
      destroyOnHidden
    >
      {!session ? (
        <>
          {app ? (
            <Alert type="info" showIcon icon={<AppstoreOutlined />} message={t('remote.connect.appNote', { host: host.name })} description={app.alias} style={{ marginBottom: 16 }} />
          ) : isServer ? (
            <Alert type="info" showIcon message={t('remote.connect.serverNote')} description={`${host.address}:${host.port} · ${host.protocol.toUpperCase()}`} style={{ marginBottom: 16 }} />
          ) : (
            <Alert type="info" showIcon icon={<SafetyCertificateOutlined />} message={t('remote.connect.transparencyTitle')} description={t(isMonitor ? 'remote.connect.transparencyMonitor' : 'remote.connect.transparencyAssist', { name: host.ownerName || t('remote.catalogue.noOwner') })} style={{ marginBottom: 16 }} />
          )}

          {!app && (
            <label className="rm-inline__switch">
              <Switch checked={control} onChange={setControl} />
              <span>
                <strong>{t('remote.connect.control')}</strong>
                <small>{control ? t('remote.connect.controlOn') : t('remote.connect.controlOff')}</small>
              </span>
            </label>
          )}
          {isMonitor && control && remote.settings.requireConsentForControl && (
            <p className="rm-muted" style={{ marginTop: 8 }}>{t('remote.connect.controlConsent')}</p>
          )}

          {needsCreds && <CredentialPicker host={host} value={auth} onChange={setAuth} passwordOnly={host.protocol === 'vnc'} />}
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
