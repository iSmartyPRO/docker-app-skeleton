import { flushSync } from 'react-dom';
import { Tooltip } from 'antd';
import { IconMoon, IconSun } from './icons/AdminIcons';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function ThemeSwitch() {
  const { mode, setMode } = useThemeMode();
  const { t } = useLocale();
  const next = mode === 'dark' ? 'light' : 'dark';
  const title = t(`header.${next}`);

  // The new theme grows as a circle from the button (View Transitions API);
  // browsers without it, or users who prefer reduced motion, switch instantly.
  const toggle = (event) => {
    if (!document.startViewTransition || reducedMotion()) {
      setMode(next);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = document.startViewTransition(() => flushSync(() => setMode(next)));
    transition.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 560, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }
        )
      )
      .catch(() => {});
  };

  return (
    <Tooltip title={title} mouseEnterDelay={0.15}>
      <button type="button" className="theme-switch" onClick={toggle} aria-label={title} data-tour="header.theme">
        <span key={mode} className="theme-switch__icon">
          {mode === 'dark' ? <IconSun /> : <IconMoon />}
        </span>
      </button>
    </Tooltip>
  );
}
