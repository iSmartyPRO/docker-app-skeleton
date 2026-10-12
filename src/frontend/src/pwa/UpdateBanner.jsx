import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../context/LocaleContext';
import { applyUpdate, useApplyUpdateOnNavigate, useUpdate } from './update';

/** A small pill at the bottom once a new version of the portal is out. */
export default function UpdateBanner() {
  const { t } = useLocale();
  const { available, applying } = useUpdate();
  const [later, setLater] = useState(false);
  useApplyUpdateOnNavigate();
  if (!available || later) return null;
  // In <body>: a transformed ancestor would turn `position: fixed` into page coordinates.
  return createPortal(
    <div className="update-banner" role="status">
      <span className="update-banner__icon" aria-hidden="true">
        ✨
      </span>
      <span className="update-banner__text">
        <strong>{t('appUpdate.title')}</strong>
        <span>{t('appUpdate.text')}</span>
      </span>
      <button type="button" className="update-banner__go" onClick={applyUpdate} disabled={applying}>
        {applying ? t('appUpdate.updating') : t('appUpdate.button')}
      </button>
      <button type="button" className="update-banner__x" onClick={() => setLater(true)} aria-label={t('appUpdate.later')}>
        ×
      </button>
    </div>,
    document.body
  );
}
