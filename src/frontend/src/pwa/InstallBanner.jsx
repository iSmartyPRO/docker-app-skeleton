import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { promptInstall, useInstall } from './pwa';
import './install.css';

const DISMISS_KEY = 'pwa_banner_dismissed';

/**
 * Small "install the app" card on phones (not yet installed). One tap installs
 * where the browser allows it; otherwise it links to the illustrated guide.
 * Dismissal is remembered for 30 days.
 */
export default function InstallBanner() {
  const { t } = useLocale();
  const { settings } = useSettings();
  const { canPrompt, installed, platform } = useInstall();
  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
    } catch {
      return false;
    }
  });
  if (installed || hidden || platform.os === 'desktop') return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 30 * 24 * 60 * 60 * 1000));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="install-banner">
      <img src={settings?.appearance?.appIconUrl || '/pwa/icon-192.png'} alt="" />
      <div className="install-banner__text">
        <strong>{t('pwa.banner.title')}</strong>
        <span>{t('pwa.banner.text')}</span>
      </div>
      {canPrompt ? (
        <Button type="primary" onClick={promptInstall}>{t('pwa.banner.install')}</Button>
      ) : (
        <Link to="/install"><Button type="primary">{t('pwa.banner.how')}</Button></Link>
      )}
      <button type="button" className="install-banner__close" onClick={dismiss} aria-label={t('common.close')}>✕</button>
    </div>
  );
}
