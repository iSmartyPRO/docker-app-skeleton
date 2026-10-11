import { useEffect, useRef, useState } from 'react';
import { takeReturnPath } from '../lib/returnPath';
import { Link, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import PublicLayout from '../layouts/PublicLayout';
import { takeTelegramIntent } from '../components/TelegramLoginButton';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { authErrorMessage } from '../lib/errors';
import { linkAccountTelegram, signInWithMagicLink, signInWithTelegram } from '../services/api';

/**
 * Landing page for sign-in callbacks:
 *   /auth/magic#<token>      one-click link from email / WhatsApp / Telegram
 *   /auth/telegram?id=…      Telegram Login Widget (sign-in or account linking)
 * The token is read from the URL fragment and removed from history at once.
 */
export default function AuthCallback({ kind }) {
  const { t } = useLocale();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const run = async () => {
      if (kind === 'magic') {
        const token = window.location.hash.slice(1);
        window.history.replaceState(null, '', window.location.pathname);
        const res = await signInWithMagicLink(token);
        setUser(res.data.user);
        navigate(takeReturnPath(), { replace: true });
        return;
      }
      const params = Object.fromEntries(new URLSearchParams(window.location.search));
      window.history.replaceState(null, '', window.location.pathname);
      if (takeTelegramIntent() === 'link') {
        const res = await linkAccountTelegram(params);
        setUser(res.data.user);
        navigate('/account/security', { replace: true, state: { telegramLinked: true } });
        return;
      }
      const res = await signInWithTelegram(params);
      setUser(res.data.user);
      navigate(takeReturnPath(), { replace: true });
    };

    run().catch((err) => setError(authErrorMessage(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, navigate, setUser]);

  return (
    <PublicLayout>
      <div className="signin">
        <div className="signin__card signin__card--center">
          {error ? (
            <>
              <div className="signin__status is-error">
                <span className="signin__status-icon">!</span>
                <div>
                  <strong>{t('signin.callbackFailed')}</strong>
                  <div>{error}</div>
                </div>
              </div>
              <Link to="/login" className="signin__primary-link">
                {t('signin.backToSignIn')}
              </Link>
            </>
          ) : (
            <div className="signin__pending">
              <Spin size="large" />
              <div>{t('signin.signingIn')}</div>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
