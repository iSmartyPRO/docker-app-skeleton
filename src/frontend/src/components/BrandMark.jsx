import { useSettings } from '../context/SettingsContext';
import { useThemeMode } from '../context/ThemeContext';

/** Picks the logo for the active theme: dark variant in dark mode, primary otherwise. */
export function resolveLogo(appearance, mode) {
  if (mode === 'dark' && appearance?.logoDarkUrl) return appearance.logoDarkUrl;
  return appearance?.logoUrl || null;
}

export default function BrandMark({ className = '' }) {
  const { settings } = useSettings();
  const { mode } = useThemeMode();
  const logoUrl = resolveLogo(settings?.appearance, mode);

  if (logoUrl) {
    return <img className={`chrome__logo ${className}`.trim()} src={logoUrl} alt="" />;
  }

  return <span className={`chrome__mark ${className}`.trim()} />;
}
