import { Tooltip } from 'antd';
import { IconMoon, IconSun } from './icons/AdminIcons';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';

export default function ThemeSwitch() {
  const { mode, setMode } = useThemeMode();
  const { t } = useLocale();
  const next = mode === 'dark' ? 'light' : 'dark';
  const title = t(`header.${next}`);

  return (
    <Tooltip title={title} mouseEnterDelay={0.15}>
      <button
        type="button"
        className="theme-switch"
        onClick={() => setMode(next)}
        aria-label={title}
      >
        {mode === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
    </Tooltip>
  );
}
