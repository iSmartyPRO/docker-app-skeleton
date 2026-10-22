import { useEffect, useState } from 'react';
import { App, Alert, Button, Modal, Switch } from 'antd';
import { EyeOutlined, SafetyCertificateOutlined, ToolOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';

/**
 * Starts a session. The dialog is explicit about what the employee will see —
 * there is no silent option. Until guacd is wired the connection is recorded
 * and the employee notified, and the viewer shows the pilot state.
 */
export default function ConnectDialog({ open, host, mode, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const remote = useRemote();
  const [control, setControl] = useState(false);
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (open) {
      setControl(false);
      setSession(null);
    }
  }, [open, host, mode]);

  const start = async () => {
    setStarting(true);
    try {
      const res = await remoteApi.start({ hostId: host.id, mode, control });
      setSession(res.data);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const close = async () => {
    if (session?.session?.id) await remoteApi.end(session.session.id).catch(() => {});
    onClose();
  };

  if (!host) return null;
  const isMonitor = mode === 'monitor';

  return (
    <Modal
      open={open}
      onCancel={close}
      title={<span>{isMonitor ? <EyeOutlined /> : <ToolOutlined />} {t(isMonitor ? 'remote.connect.observeTitle' : 'remote.connect.assistTitle', { name: host.name })}</span>}
      footer={session ? [<Button key="c" onClick={close}>{t('remote.connect.finish')}</Button>] : [
        <Button key="x" onClick={close}>{t('common.cancel')}</Button>,
        <Button key="go" type="primary" loading={starting} onClick={start}>{t('remote.connect.start')}</Button>,
      ]}
      width={560}
      destroyOnHidden
    >
      {!session ? (
        <>
          <Alert
            type="info"
            showIcon
            icon={<SafetyCertificateOutlined />}
            message={t('remote.connect.transparencyTitle')}
            description={t(isMonitor ? 'remote.connect.transparencyMonitor' : 'remote.connect.transparencyAssist', { name: host.ownerName || t('remote.catalogue.noOwner') })}
            style={{ marginBottom: 16 }}
          />
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
        </>
      ) : (
        <div className="rm-viewer">
          <div className="rm-viewer__screen">
            <SafetyCertificateOutlined />
            <p>{t('remote.connect.pilotTitle')}</p>
            <span>{t('remote.connect.pilotText')}</span>
          </div>
          <Alert type="success" showIcon message={t('remote.connect.recorded')} description={t('remote.connect.notified', { name: host.ownerName || t('remote.catalogue.noOwner') })} />
        </div>
      )}
    </Modal>
  );
}
