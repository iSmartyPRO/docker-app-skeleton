import { useLocale } from '../context/LocaleContext';
import { APP_VERSION } from '../version';

export default function AppFooter() {
  const { t } = useLocale();
  return (
    <footer className="app-footer">
      {t('footer')}{' '}
      <a href="https://www.ismarty.pro" target="_blank" rel="noopener noreferrer">
        iSmartyPro
      </a>
      ® • v {APP_VERSION}
    </footer>
  );
}
