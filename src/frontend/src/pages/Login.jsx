import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Form, Input } from 'antd';
import PublicLayout from '../layouts/PublicLayout';
import BrandMark from '../components/BrandMark';
import OtpInput from '../components/ui/OtpInput';
import TelegramLoginButton from '../components/TelegramLoginButton';
import { IconMail, IconTelegram, IconUser, IconWhatsapp } from '../components/icons/AdminIcons';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { authErrorMessage } from '../lib/errors';
import { requestSignInCode, verifySignInCode } from '../services/api';

const CODE_TTL = 5 * 60;
const RESEND_AFTER = 60;
const METHOD_KEY = 'da_signin_method';

function useCountdown(deadline) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Channels that deliver one-time codes, with their identifier field. */
const CODE_CHANNELS = {
  whatsapp: { flag: 'whatsappCode', icon: IconWhatsapp, input: 'phone' },
  email: { flag: 'emailCode', icon: IconMail, input: 'email' },
  telegram: { flag: 'telegramCode', icon: IconTelegram, input: 'telegram' },
};

function PasswordPane({ ldap, onSuccess }) {
  const { t } = useLocale();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onFinish = async (values) => {
    setBusy(true);
    setError('');
    try {
      onSuccess(await login(values));
    } catch (err) {
      setError(authErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form layout="vertical" onFinish={onFinish} requiredMark={false} className="signin__form">
      <Form.Item name="username" label={t(ldap ? 'signin.loginOrDomain' : 'login.username')} rules={[{ required: true, message: t('common.required') }]}>
        <Input size="large" autoComplete="username" autoFocus />
      </Form.Item>
      <Form.Item name="password" label={t('login.password')} rules={[{ required: true, message: t('common.required') }]}>
        <Input.Password size="large" autoComplete="current-password" />
      </Form.Item>
      {ldap && <p className="signin__hint">{t('signin.ldapHint')}</p>}
      {error && <div className="signin__error">{error}</div>}
      <Button type="primary" htmlType="submit" size="large" block loading={busy}>
        {t('common.signIn')}
      </Button>
    </Form>
  );
}

function IdentifierField({ kind, value, onChange, onEnter }) {
  const { t } = useLocale();
  const common = {
    size: 'large',
    autoFocus: true,
    value,
    onChange: (event) => onChange(event.target.value),
    onPressEnter: onEnter,
  };
  if (kind === 'phone') {
    return (
      <Input
        {...common}
        inputMode="tel"
        autoComplete="tel"
        prefix={<span className="signin__prefix">+</span>}
        placeholder="996 700 123 456"
        onChange={(event) => onChange(event.target.value.replace(/[^\d\s()-]/g, ''))}
      />
    );
  }
  if (kind === 'telegram') {
    return (
      <Input
        {...common}
        autoComplete="username"
        prefix={<span className="signin__prefix">@</span>}
        placeholder={t('signin.telegramPlaceholder')}
        onChange={(event) => onChange(event.target.value.replace(/^@/, ''))}
      />
    );
  }
  return <Input {...common} type="email" inputMode="email" autoComplete="email" placeholder="name@company.com" />;
}

/**
 * Code / magic-link flow for one channel:
 *   identifier → send → six-cell code (auto-submits) or "link sent".
 */
function CodePane({ channel, magicLink, onSuccess }) {
  const { t } = useLocale();
  const spec = CODE_CHANNELS[channel];
  const [step, setStep] = useState('identify');
  const [identifier, setIdentifier] = useState('');
  const [mode, setMode] = useState('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [resendAt, setResendAt] = useState(null);
  const left = useCountdown(expiresAt);
  const resendIn = useCountdown(resendAt);
  const verifying = useRef(false);

  const payloadIdentifier = () => (spec.input === 'phone' ? `+${identifier.replace(/\D/g, '')}` : identifier.trim());

  const send = async (nextMode = mode) => {
    if (!identifier.trim()) {
      setError(t(`signin.enter_${spec.input}`));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestSignInCode({ channel, identifier: payloadIdentifier(), mode: nextMode });
      setMode(nextMode);
      setCode('');
      setStep(nextMode === 'link' ? 'link' : 'code');
      setExpiresAt(Date.now() + (nextMode === 'link' ? 15 * 60 : CODE_TTL) * 1000);
      setResendAt(Date.now() + RESEND_AFTER * 1000);
    } catch (err) {
      setError(authErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value) => {
    if (verifying.current) return;
    verifying.current = true;
    setBusy(true);
    setError('');
    try {
      const res = await verifySignInCode({ channel, identifier: payloadIdentifier(), code: value });
      onSuccess(res.data.user);
    } catch (err) {
      setError(authErrorMessage(err, t));
      setCode('');
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  };

  const shown = spec.input === 'phone' ? `+${identifier.replace(/\D/g, '')}` : spec.input === 'telegram' ? `@${identifier}` : identifier;

  if (step === 'identify') {
    return (
      <div className="signin__form">
        <label className="signin__label">{t(`signin.label_${spec.input}`)}</label>
        <IdentifierField kind={spec.input} value={identifier} onChange={setIdentifier} onEnter={() => send('code')} />
        <p className="signin__hint">{t(`signin.hint_${channel}`)}</p>
        {error && <div className="signin__error">{error}</div>}
        <Button type="primary" size="large" block loading={busy && mode === 'code'} onClick={() => send('code')}>
          {t('signin.getCode')}
        </Button>
        {magicLink && (
          <Button size="large" block className="signin__secondary" loading={busy && mode === 'link'} onClick={() => send('link')}>
            {t('signin.getLink')}
          </Button>
        )}
      </div>
    );
  }

  const Icon = spec.icon;
  const expired = left === 0;

  return (
    <div className="signin__form">
      <button type="button" className="signin__back" onClick={() => { setStep('identify'); setError(''); }}>
        <span aria-hidden="true">←</span> {t('common.back')}
      </button>
      <div className="signin__who">
        <Icon />
        <span>{shown}</span>
      </div>

      <div className={`signin__status${expired ? ' is-expired' : ''}`}>
        <span className="signin__status-icon">{expired ? '!' : '✓'}</span>
        <div>
          <strong>{t(step === 'link' ? 'signin.linkSent' : 'signin.codeSent')}</strong>
          <div>
            {expired
              ? t('signin.expired')
              : t(step === 'link' ? 'signin.linkValid' : 'signin.codeValid', { time: clock(left) })}
          </div>
        </div>
      </div>

      {step === 'code' ? (
        <>
          <label className="signin__label">{t('signin.code')}</label>
          <OtpInput value={code} onChange={setCode} onComplete={verify} disabled={busy || expired} error={error} />
          {error ? (
            <div className="signin__error signin__error--center">{error}</div>
          ) : (
            <p className="signin__hint signin__hint--center">{busy ? t('signin.checking') : t('signin.autoSubmit')}</p>
          )}
        </>
      ) : (
        <p className="signin__hint">{t('signin.linkHint')}</p>
      )}

      <Button size="large" block className="signin__secondary" disabled={resendIn > 0 || busy} onClick={() => send(mode)}>
        {resendIn > 0 ? t('signin.resendIn', { time: clock(resendIn) }) : t('signin.resend')}
      </Button>
      {magicLink && step === 'code' && (
        <button type="button" className="signin__switch" disabled={resendIn > 0} onClick={() => send('link')}>
          {t('signin.switchToLink')}
        </button>
      )}
    </div>
  );
}

export default function Login() {
  const { user, ready, setUser } = useAuth();
  const { t } = useLocale();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const auth = settings?.auth || { password: true };

  const methods = useMemo(() => {
    const list = [];
    if (auth.password) list.push({ id: 'password', icon: IconUser, label: t('signin.tabPassword') });
    if (auth.whatsappCode) list.push({ id: 'whatsapp', icon: IconWhatsapp, label: 'WhatsApp' });
    if (auth.emailCode) list.push({ id: 'email', icon: IconMail, label: t('signin.tabEmail') });
    if (auth.telegram?.enabled || auth.telegramCode) list.push({ id: 'telegram', icon: IconTelegram, label: 'Telegram' });
    if (!list.length) list.push({ id: 'password', icon: IconUser, label: t('signin.tabPassword') });
    return list;
  }, [auth, t]);

  const [method, setMethod] = useState(() => {
    try {
      return localStorage.getItem(METHOD_KEY) || '';
    } catch {
      return '';
    }
  });
  const active = methods.find((item) => item.id === method) || methods[0];

  const choose = (id) => {
    setMethod(id);
    try {
      localStorage.setItem(METHOD_KEY, id);
    } catch {
      /* ignore */
    }
  };

  if (ready && user) return <Navigate to="/" replace />;

  const onSuccess = (signedIn) => {
    setUser(signedIn);
    navigate('/', { replace: true });
  };

  return (
    <PublicLayout>
      <div className="signin">
        <div className="signin__brand">
          <BrandMark className="signin__logo" />
          <h1>{settings?.appName || t('brand')}</h1>
          <p>{methods.length > 1 ? t('signin.lead') : t('login.lead')}</p>
        </div>

        <div className={`signin__card is-${active.id}`}>
          {methods.length > 1 && (
            <div className="signin__tabs" role="tablist">
              {methods.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={item.id === active.id}
                    className={`signin__tab${item.id === active.id ? ' is-active' : ''}`}
                    onClick={() => choose(item.id)}
                  >
                    <Icon variant={item.id === active.id ? 'colored' : 'mono'} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="signin__pane" key={active.id}>
            {active.id === 'password' && <PasswordPane ldap={auth.ldap} onSuccess={onSuccess} />}
            {(active.id === 'whatsapp' || active.id === 'email') && (
              <CodePane channel={active.id} magicLink={auth.magicLink} onSuccess={onSuccess} />
            )}
            {active.id === 'telegram' && (
              <>
                {auth.telegram?.enabled && (
                  <div className="signin__telegram">
                    <TelegramLoginButton botUsername={auth.telegram.botUsername} intent="login" />
                    <p className="signin__hint signin__hint--center">{t('signin.telegramWidgetHint')}</p>
                  </div>
                )}
                {auth.telegram?.enabled && auth.telegramCode && <div className="signin__divider">{t('signin.orCode')}</div>}
                {auth.telegramCode && <CodePane channel="telegram" magicLink={auth.magicLink} onSuccess={onSuccess} />}
              </>
            )}
          </div>
        </div>
        <p className="signin__security">{t('signin.securityNote')}</p>
      </div>
    </PublicLayout>
  );
}
