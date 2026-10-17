import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Collapse } from 'antd';
import Segmented from '../components/ui/Segmented';
import PublicLayout from '../layouts/PublicLayout';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { promptInstall, useInstall } from './pwa';
import {
  AndroidChrome,
  AndroidInstallDialog,
  AndroidMenu,
  DesktopInstall,
  HomeScreen,
  IosAddDialog,
  IosSafari,
  IosShareSheet,
} from './Mockups';
import './install.css';

function QrCode({ url }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((qr) => qr.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0F172A', light: '#FFFFFF' } }))
      .then((data) => alive && setSrc(data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return src ? <img className="install-qr__img" src={src} alt="QR" /> : <div className="install-qr__img" />;
}

function Step({ index, title, text, children }) {
  return (
    <li className="install-step">
      <div className="install-step__art">{children}</div>
      <div className="install-step__text">
        <span className="install-step__num">{index}</span>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </li>
  );
}

const BENEFITS = ['icon', 'fullscreen', 'push', 'fast'];

function BenefitIcon({ id }) {
  const paths = {
    icon: <path d="M5 4h5v5H5zM14 4h5v5h-5zM5 15h5v5H5zM14 15h5v5h-5z" />,
    fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
    push: <path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.6 6 2 6.5H4c.4-.5 2-2 2-6.5ZM10 19.5a2.2 2.2 0 0 0 4 0" />,
    fast: <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" />,
  };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[id]}
    </svg>
  );
}

/**
 * /install — how to put the portal on a phone's home screen (PWA).
 * Detects the platform, offers the native install prompt where the browser
 * supports it, and walks through Safari (iPhone/iPad) or Chrome (Android)
 * step by step with illustrations.
 */
export default function InstallPage() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { canPrompt, installed, platform } = useInstall();
  const [tab, setTab] = useState(platform.os === 'desktop' ? 'desktop' : platform.os);

  const app = useMemo(() => {
    const name = settings?.appName || 'Portal';
    return {
      name,
      shortName: name.length > 14 ? name.split(/\s+/)[0].slice(0, 14) : name,
      icon: settings?.appearance?.appIconUrl || '/pwa/icon-192.png',
      host: window.location.host,
      origin: window.location.origin,
    };
  }, [settings]);

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') message.success(t('pwa.install.done'));
  };

  const ios = [
    { title: t('pwa.ios.s1'), text: t(platform.os === 'ios' && platform.browser !== 'safari' ? 'pwa.ios.s1OtherBrowser' : 'pwa.ios.s1Text'), art: <IosSafari app={app} /> },
    { title: t('pwa.ios.s2'), text: t('pwa.ios.s2Text'), art: <IosShareSheet app={app} /> },
    { title: t('pwa.ios.s3'), text: t('pwa.ios.s3Text'), art: <IosAddDialog app={app} /> },
    { title: t('pwa.ios.s4'), text: t('pwa.ios.s4Text'), art: <HomeScreen app={app} os="ios" /> },
  ];
  const android = [
    { title: t('pwa.android.s1'), text: t('pwa.android.s1Text'), art: <AndroidChrome app={app} /> },
    { title: t('pwa.android.s2'), text: t('pwa.android.s2Text'), art: <AndroidMenu app={app} /> },
    { title: t('pwa.android.s3'), text: t('pwa.android.s3Text'), art: <AndroidInstallDialog app={app} /> },
    { title: t('pwa.android.s4'), text: t('pwa.android.s4Text'), art: <HomeScreen app={app} os="android" /> },
  ];
  const steps = tab === 'ios' ? ios : tab === 'android' ? android : null;

  return (
    <PublicLayout>
      <div className="install">
        <header className="install-hero">
          <img className="install-hero__icon" src={app.icon} alt="" />
          <div className="install-hero__text">
            <span className="install-hero__eyebrow">{t('pwa.install.eyebrow')}</span>
            <h1>{t('pwa.install.title', { name: app.name })}</h1>
            <p>{t('pwa.install.lead')}</p>
            <div className="install-hero__actions">
              {installed ? (
                <span className="install-done">✓ {t('pwa.install.already')}</span>
              ) : canPrompt ? (
                <Button type="primary" size="large" onClick={install}>
                  {t('pwa.install.button')}
                </Button>
              ) : (
                <a className="install-hero__jump" href="#steps">{t('pwa.install.seeSteps')} ↓</a>
              )}
              {user && (
                <Link to="/account/notifications" className="install-hero__link">
                  {t('pwa.install.notifications')} →
                </Link>
              )}
            </div>
            {platform.inApp && <div className="install-warning">{t('pwa.install.inApp')}</div>}
          </div>
        </header>

        <ul className="install-benefits">
          {BENEFITS.map((id) => (
            <li key={id}>
              <span className="install-benefits__icon"><BenefitIcon id={id} /></span>
              <strong>{t(`pwa.benefit.${id}`)}</strong>
              <span>{t(`pwa.benefit.${id}Text`)}</span>
            </li>
          ))}
        </ul>

        <section id="steps" className="install-guide">
          <div className="install-guide__head">
            <h2>{t('pwa.install.howTitle')}</h2>
            <Segmented
              size="large"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'ios', label: 'iPhone / iPad' },
                { value: 'android', label: 'Android' },
                { value: 'desktop', label: t('pwa.install.desktop') },
              ]}
            />
          </div>
          {tab === platform.os && <p className="install-guide__detected">● {t('pwa.install.detected')}</p>}

          {steps ? (
            <ol className="install-steps" key={tab}>
              {steps.map((step, index) => (
                <Step key={step.title} index={index + 1} title={step.title} text={step.text}>
                  {step.art}
                </Step>
              ))}
            </ol>
          ) : (
            <div className="install-desktop" key="desktop">
              <DesktopInstall app={app} />
              <div className="install-desktop__text">
                <h3>{t('pwa.desktop.title')}</h3>
                <ol>
                  <li>{t('pwa.desktop.s1')}</li>
                  <li>{t('pwa.desktop.s2')}</li>
                  <li>{t('pwa.desktop.s3')}</li>
                </ol>
                <div className="install-qr">
                  <QrCode url={`${app.origin}/install`} />
                  <div>
                    <strong>{t('pwa.desktop.qrTitle')}</strong>
                    <span>{t('pwa.desktop.qrText')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'ios' && <div className="install-tip">💡 {t('pwa.ios.tip')}</div>}
          {tab === 'android' && <div className="install-tip">💡 {t('pwa.android.tip')}</div>}
        </section>

        <section className="install-faq">
          <h2>{t('pwa.faq.title')}</h2>
          <Collapse
            bordered={false}
            items={['what', 'safe', 'push', 'noButton', 'offline', 'remove'].map((key) => ({
              key,
              label: t(`pwa.faq.${key}Q`),
              children: <p>{t(`pwa.faq.${key}A`)}</p>,
            }))}
          />
        </section>
      </div>
    </PublicLayout>
  );
}
