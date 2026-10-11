import { useEffect, useState } from 'react';
import { App, Alert, Button, Input, Modal } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatRelative } from '../../../lib/format';
import { driveApi, driveError, tOr } from '../api';
import { Hint } from '../../../help/Hint';

/** Sign in to a file server with a domain account; checked by the server before it is saved. */
export default function ConnectDialog({ open, connection, onClose }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setUsername(connection?.source === 'manual' || connection?.source === 'login' ? connection.username || '' : '');
      setDomain(connection?.source === 'manual' ? connection.domain || '' : '');
      setPassword('');
      setError(null);
    }
  }, [open, connection]);

  if (!connection) return null;
  const parked = connection.status && !['ok', 'missing'].includes(connection.status);

  const submit = async () => {
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await driveApi.connect(connection.serverId, { username: username.trim(), password, domain: domain.trim() || undefined });
      message.success(t('drive.connected', { name: connection.serverName }));
      onClose(true);
    } catch (err) {
      setError(driveError(err, t));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    await driveApi.disconnect(connection.serverId);
    message.success(t('drive.forgotten'));
    onClose(true);
  };

  return (
    <Modal open={open} onCancel={() => onClose(false)} footer={null} width={480} destroyOnHidden title={null} className="dv-connect">
      <div className="dv-connect__head">
        <span className="dv-connect__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="7" rx="2" />
            <rect x="3" y="13" width="18" height="7" rx="2" />
            <path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6" />
          </svg>
        </span>
        <div>
          <span className="share-hero__eyebrow">{t('drive.connectEyebrow')}</span>
          <h2>{connection.serverName}</h2>
          <code>{connection.host}</code>
        </div>
      </div>
      {parked && <Alert type="warning" showIcon message={tOr(t, `drive.parked.${connection.status}`, 'drive.parked.AUTH_FAILED')} className="dv-connect__alert" />}
      {connection.source === 'login' && connection.status === 'ok' && (
        <Alert type="success" showIcon message={t('drive.usingLogin', { user: connection.username })} description={t('drive.usingLoginText')} className="dv-connect__alert" />
      )}
      <p className="dv-connect__lead">{t('drive.connectLead')}</p>
      <div className="dv-connect__form">
        <label>
          <span>{t('drive.username')} <Hint id="drive.username" /></span>
          <Input size="large" autoFocus value={username} onChange={(event) => setUsername(event.target.value)} placeholder="ivan.petrov  ·  DOMAIN\ivan.petrov  ·  ivan@corp.local" autoComplete="username" />
        </label>
        <label>
          <span>{t('drive.password')}</span>
          <Input.Password size="large" value={password} onChange={(event) => setPassword(event.target.value)} onPressEnter={submit} autoComplete="current-password" status={error ? 'error' : undefined} />
        </label>
        <label>
          <span>{t('drive.domain')} <em>{t('drive.optional')}</em> <Hint id="drive.domain" /></span>
          <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder={t('drive.domainPlaceholder')} />
        </label>
        {error && <div className="signin__error">{error}</div>}
        <Button type="primary" size="large" block loading={busy} disabled={!username.trim() || !password} onClick={submit}>
          {t('drive.connect')}
        </Button>
        {connection.source === 'manual' && (
          <Button type="text" block danger onClick={forget}>
            {t('drive.forget')} {connection.since ? `· ${t('drive.savedAgo', { when: formatRelative(connection.since, locale) })}` : ''}
          </Button>
        )}
      </div>
      <p className="dv-connect__note">🔐 {t('drive.connectNote')}</p>
    </Modal>
  );
}
