import { useSettings } from '../context/SettingsContext';

export default function BrandMark({ className = '' }) {
  const { settings } = useSettings();
  const logoUrl = settings?.appearance?.logoUrl;

  if (logoUrl) {
    return <img className={`chrome__logo ${className}`.trim()} src={logoUrl} alt="" />;
  }

  return <span className={`chrome__mark ${className}`.trim()} />;
}
