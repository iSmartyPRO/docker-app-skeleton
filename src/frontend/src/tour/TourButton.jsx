import { Tooltip } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { useTour } from './TourContext';

/** Compass glyph of the «Тур» buttons. */
export function TourIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" />
    </svg>
  );
}

/**
 * «Тур» button of a module: renders only when the module has a tour.
 *
 *   <TourButton module="tasks" />            pill with text
 *   <TourButton module="tasks" iconOnly />   round icon with a tooltip
 */
export default function TourButton({ module, iconOnly = false, className = '' }) {
  const { t } = useLocale();
  const { hasTour, startTour, running } = useTour();
  if (!module || !hasTour(module)) return null;
  const label = t('tour.ui.button');
  const hint = t('tour.ui.buttonHint');
  const button = (
    <button
      type="button"
      className={`tour-btn${iconOnly ? ' is-icon' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => startTour(module)}
      disabled={Boolean(running)}
      aria-label={iconOnly ? `${label} — ${hint}` : hint}
    >
      <TourIcon />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
  return (
    <Tooltip title={hint} mouseEnterDelay={0.4}>
      {button}
    </Tooltip>
  );
}
