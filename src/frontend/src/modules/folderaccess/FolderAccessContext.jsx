import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { CREDENTIAL_CODES, errorCode, faApi, faError } from './api';
import CredentialDialog from './components/CredentialDialog';
import ResultDialog from './components/ResultDialog';

const FolderAccessContext = createContext(null);

/**
 * The section's state (role, read-only reason, credential) and `change(fn)`:
 * runs a change; when AD needs the administrator's password it asks for it,
 * saves it and repeats the change once. Results with failures open a summary;
 * successful changes raise the "after the next Windows logon" notice.
 */
export function FolderAccessProvider({ children }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [state, setState] = useState({ info: null, error: null });
  const [asking, setAsking] = useState(null);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState(false);
  const pending = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await faApi.overview();
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

  /**
   * Runs `fn()` (an API call); returns its data, or null when it failed (already reported).
   * `rethrow`: other errors are thrown to the caller instead (the NTFS editor handles STALE, guards…).
   */
  const change = useCallback(
    async (fn, { quiet = false, rethrow = false } = {}) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const { data } = await fn();
          const failed = data?.failed || 0;
          if (failed) setResult(data);
          else if (!quiet) message.success(data?.changed === 0 && data?.unchanged ? t('folderAccess.result.nothing') : t('folderAccess.result.done'));
          if (data?.notice === 'logon' || data?.changed) setNotice(true);
          return data;
        } catch (err) {
          const code = errorCode(err);
          if (CREDENTIAL_CODES.includes(code) && attempt === 0) {
            const saved = await askPassword(err?.response?.data?.info?.reason || (code === 'FA_CREDENTIALS_FAILED' ? 'AUTH_FAILED' : null));
            if (saved) continue;
            return null;
          }
          if (rethrow) throw err;
          message.error(faError(err, t));
          return null;
        }
      }
      return null;
    },
    [askPassword, message, t]
  );

  return (
    <FolderAccessContext.Provider value={{ ...state, refresh, change, askPassword, notice, setNotice }}>
      {children}
      <CredentialDialog open={Boolean(asking)} reason={asking?.reason} login={state.info?.credential?.login} onClose={closeDialog} />
      <ResultDialog result={result} onClose={() => setResult(null)} />
    </FolderAccessContext.Provider>
  );
}

export const useFolderAccess = () => useContext(FolderAccessContext);
