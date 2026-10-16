import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExperimentOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import '../pages/admin/settings/platform.css';

const KEY = 'da_demo_banner_hidden';

/**
 * «Демо-режим» strip above the header for administrators while the portal has
 * demo data (public settings `demo.active`, kept by services/demo.js). It can
 * be hidden for the browser session; it comes back in a new one.
 */
export default function DemoBanner() {
  const { t } = useLocale();
  const { user, can } = useAuth();
  const { settings } = useSettings();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || !user || !settings?.demo?.active || !can('console.access')) return null;
  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="pf-demo-bar" role="status">
      <ExperimentOutlined aria-hidden="true" />
      <span className="pf-demo-bar__text">{t('platform.demo.banner')}</span>
      <Link to="/admin/settings/modules?demo=1">{t('platform.demo.bannerAction')}</Link>
      <button type="button" className="pf-demo-bar__close" onClick={hide} aria-label={t('common.close')}>
        ×
      </button>
    </div>
  );
}
