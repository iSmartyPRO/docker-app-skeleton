import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Input, Modal } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { CREDENTIAL_CODES, adApi, adError, errorCode, errorInfo } from './api';

const DirectoryCtx = createContext(null);

/**
 * The module's state (mode, rights, settings summary, the admin's credential) and
 * `change(fn)`: runs a change; when AD needs the administrator's own domain password it
 * asks for it, saves it (checked with a bind) and repeats the change once. Errors are
 * shown in words; `rethrow` hands them to the caller (forms show them next to a field).
 */
export function DirectoryProvider({ children }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [state, setState] = useState({ info: null, error: null });
  const [asking, setAsking] = useState(null);
  const pending = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await adApi.overview();
      setState({ info: data, error: null });
      return data;
    } catch (error) {
      setState((prev) => ({ ...prev, error }));
      return null;
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const askPassword = useCallback(
    (reason) =>
      new Promise((resolve) => {
        pending.current = resolve;
        setAsking({ reason });
      }),
    []
  );

  const closeDialog = (saved) => {
    setAsking(null);
    const resolve = pending.current;
    pending.current = null;
    resolve?.(saved);
    if (saved) refresh();
  };

  const change = useCallback(
    async (fn, { success, rethrow = false } = {}) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const { data } = await fn();
          if (success !== false) message.success(success || t('directory.done'));
          return data;
        } catch (err) {
          const code = errorCode(err);
          if (CREDENTIAL_CODES.includes(code) && attempt === 0) {
            const saved = await askPassword(errorInfo(err)?.reason || (code === 'FA_CREDENTIALS_FAILED' ? 'AUTH_FAILED' : null));
            if (saved) continue;
            return null;
          }
          if (rethrow) throw err;
          message.error(adError(err, t));
          return null;
        }
      }
      return null;
    },
    [askPassword, message, t]
  );

  return (
    <DirectoryCtx.Provider value={{ ...state, refresh, change, askPassword }}>
      {children}
      <CredentialDialog open={Boolean(asking)} reason={asking?.reason} login={state.info?.credential?.login} onClose={closeDialog} />
    </DirectoryCtx.Provider>
  );
}

export const useDirectory = () => useContext(DirectoryCtx);

/** The administrator's own domain password: checked with a bind, saved sealed, never shown again. */
function CredentialDialog({ open, reason, login, onClose }) {
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
      await adApi.saveCredential(password);
      onClose(true);
    } catch (err) {
      setError(adError(err, t));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };
  const reasonKey = reason ? `directory.credential.reason.${reason}` : null;
  const reasonText = reasonKey ? (t(reasonKey) !== reasonKey ? t(reasonKey) : t('directory.credential.reason.AUTH_FAILED')) : null;
  return (
    <Modal open={open} onCancel={() => onClose(false)} footer={null} width={460} destroyOnHidden title={t('directory.credential.title')}>
      <p className="ad-muted">{t('directory.credential.lead')}</p>
      {reasonText && <Alert type="warning" showIcon message={reasonText} style={{ marginBottom: 12 }} />}
      <div className="ad-form">
        {login && (
          <label>
            <span>{t('directory.credential.account')}</span>
            <Input value={login} disabled />
          </label>
        )}
        <label>
          <span>{t('directory.credential.password')}</span>
          <Input.Password autoFocus prefix={<LockOutlined />} value={password} onChange={(event) => setPassword(event.target.value)} onPressEnter={submit} autoComplete="current-password" status={error ? 'error' : undefined} />
        </label>
        {error && <div className="ad-error">{error}</div>}
        <Button type="primary" block loading={busy} disabled={!password} onClick={submit}>
          {t('directory.credential.submit')}
        </Button>
      </div>
      <p className="ad-note">{t('directory.credential.note')}</p>
    </Modal>
  );
}
