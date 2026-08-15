import { Link } from 'react-router-dom';
import { Avatar, Tooltip } from 'antd';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import BrandMark from './BrandMark';
import LanguageSwitch from './LanguageSwitch';
import ThemeSwitch from './ThemeSwitch';
import { IconAdmin, IconLogin, IconLogout } from './icons/AdminIcons';

function HeaderIcon({ title, children }) {
  return (
    <Tooltip title={title} mouseEnterDelay={0.15}>
      <span className="chrome__icon-wrap">{children}</span>
    </Tooltip>
  );
}

export default function Chrome({ dense }) {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const { settings } = useSettings();
  const name = settings?.appName || t('brand');
  const accountName = user?.displayName || user?.username || t('common.account');

  return (
    <header className={`chrome ${dense ? 'chrome--dense' : ''}`}>
      <Link to="/" className="chrome__brand">
        <BrandMark />
        {name}
      </Link>
      <div className="chrome__actions">
        <LanguageSwitch />
        <ThemeSwitch />
        {user ? (
          <>
            {user.role === 'admin' && (
              <HeaderIcon title={t('common.admin')}>
                <Link className="chrome__icon" to="/admin" aria-label={t('common.admin')}>
                  <IconAdmin />
                </Link>
              </HeaderIcon>
            )}
            <HeaderIcon title={accountName}>
              <Link className="chrome__icon" to="/account" aria-label={t('common.account')}>
                <Avatar size={22} src={user.avatarUrl} style={{ background: 'transparent', color: 'inherit' }}>
                  {accountName.slice(0, 1).toUpperCase()}
                </Avatar>
              </Link>
            </HeaderIcon>
            <HeaderIcon title={t('common.signOut')}>
              <button type="button" className="chrome__icon" onClick={logout} aria-label={t('common.signOut')}>
                <IconLogout />
              </button>
            </HeaderIcon>
          </>
        ) : (
          <HeaderIcon title={t('common.signIn')}>
            <Link className="chrome__icon" to="/login" aria-label={t('common.signIn')}>
              <IconLogin />
            </Link>
          </HeaderIcon>
        )}
      </div>
    </header>
  );
}
