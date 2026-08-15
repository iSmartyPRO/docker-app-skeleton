import { useEffect } from 'react';
import { googleFontsHref, resolveTypography } from '../theme/typography';
import { useThemeMode } from '../context/ThemeContext';

export default function FontLoader() {
  const { appearance } = useThemeMode();
  const typography = resolveTypography(appearance);
  const href = googleFontsHref([typography]);

  useEffect(() => {
    if (!href) return undefined;
    let link = document.getElementById('da-fonts');
    if (!link) {
      link = document.createElement('link');
      link.id = 'da-fonts';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = href;
    return undefined;
  }, [href]);

  return null;
}
