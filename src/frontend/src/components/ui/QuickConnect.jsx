import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/errors';
import api, { updateAccountProfile } from '../../services/api';

/*
 * Connect a notification channel right where it is missing: type the phone
 * (WhatsApp), Mattermost name or e-mail, save it to the profile and get a test
 * message at once. Telegram needs the official button, so it links to it.
 */

const FIELD = { whatsapp: 'phone', mattermost: 'mattermost', email: 'email' };
const PLACEHOLDER = { whatsapp: '+996 700 123 456', mattermost: 'ivan.petrov', email: 'name@company.com' };

export default function QuickConnect({ channel, initial = '', onConnected, compact }) {
  const { t } = useLocale();
  const { setUser } = useAuth();
  const [value, setValue] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  if (channel === 'telegram') {
    return (
      <div className={`qc${compact ? ' is-compact' : ''}`}>
        <span className="qc__text">{t('quickConnect.telegram')}</span>
        <Link to="/account/security">
          <Button size="small">{t('quickConnect.telegramButton')} →</Button>
        </Link>
      </div>
    );
  }

  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await updateAccountProfile({ [FIELD[channel]]: value.trim() });
      if (res.data?.user) setUser?.((prev) => ({ ...prev, ...res.data.user }));
      const test = await api.post('/account/notifications/test', { channel });
      const report = test.data.report?.[channel] || '';
      setResult(report === 'sent' ? { ok: true } : { ok: false, error: report.replace(/^failed: /, '') || t('quickConnect.notSent') });
      onConnected?.();
    } catch (err) {
      setResult({ ok: false, error: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`qc${compact ? ' is-compact' : ''}`}>
      <span className="qc__text">{t(`quickConnect.${channel}`)}</span>
      <div className="qc__row">
        <Input
          size="small"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={save}
          placeholder={PLACEHOLDER[channel]}
          inputMode={channel === 'whatsapp' ? 'tel' : channel === 'email' ? 'email' : 'text'}
          autoComplete={channel === 'whatsapp' ? 'tel' : channel === 'email' ? 'email' : 'off'}
        />
        <Button size="small" type="primary" loading={busy} disabled={!value.trim()} onClick={save}>
          {t('quickConnect.save')}
        </Button>
      </div>
      {result && <span className={`qc__result ${result.ok ? 'is-ok' : 'is-bad'}`}>{result.ok ? `✓ ${t(`quickConnect.ok.${channel}`)}` : `✕ ${result.error}`}</span>}
    </div>
  );
}
