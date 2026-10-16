import { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useLocale } from '../../../../context/LocaleContext';
import { faApi, faError } from '../api';

/**
 * Asks for the administrator's own domain password. The server checks it with
 * a bind as their AD account before saving it (sealed, never shown again).
 */
export default function CredentialDialog({ open, reason, login, onClose }) {
  const { t } = useLocale();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await faApi.savePassword(password);
      onClose(true);
    } catch (err) {
      setError(faError(err, t));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const reasonKey = reason ? `folderAccess.credential.reason.${reason}` : null;
  const reasonText = reasonKey && t(reasonKey) !== reasonKey ? t(reasonKey) : reason ? t('folderAccess.credential.reason.AUTH_FAILED') : null;

  return (
    <Modal open={open} onCancel={() => onClose(false)} footer={null} width={460} destroyOnHidden title={t('folderAccess.credential.title')}>
      <p className="fa-muted">{t('folderAccess.credential.lead')}</p>
      {reasonText && <Alert type="warning" showIcon message={reasonText} style={{ marginBottom: 12 }} />}
      <div className="fa-form">
        {login && (
          <label>
            <span>{t('folderAccess.credential.account')}</span>
            <Input value={login} disabled />
          </label>
        )}
        <label>
          <span>{t('folderAccess.credential.password')}</span>
          <Input.Password
            autoFocus
            prefix={<LockOutlined />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onPressEnter={submit}
            autoComplete="current-password"
            status={error ? 'error' : undefined}
          />
        </label>
        {error && <div className="signin__error">{error}</div>}
        <Button type="primary" block loading={busy} disabled={!password} onClick={submit}>
          {t('folderAccess.credential.submit')}
        </Button>
      </div>
      <p className="fa-note">{t('folderAccess.credential.note')}</p>
    </Modal>
  );
}
