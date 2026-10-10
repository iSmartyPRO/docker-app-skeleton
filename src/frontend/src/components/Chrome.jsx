import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Dropdown, Tooltip } from 'antd';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { initials } from '../lib/format';
import BrandMark from './BrandMark';
import LanguageSwitch from './LanguageSwitch';
import ThemeSwitch from './ThemeSwitch';
import { IconAdmin, IconLogin } from './icons/AdminIcons';

function UserMenu({ user }) {
  const { logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const name = user.displayName || user.username;
  const isAdmin = user.role === 'admin';

  const items = [
    {
      key: 'head',
      disabled: true,
      className: 'user-menu__head',
      label: (
        <div className="user-menu__who">
          <strong>{name}</strong>
          <span>
            @{user.username} · {isAdmin ? t('menu.roleAdmin') : t('menu.roleUser')}
          </span>
        </div>
      ),
    },
    { type: 'divider' },
    { key: '/account', label: t('menu.cabinet') },
    ...(isAdmin
      ? [
          { key: '/admin', label: t('menu.adminConsole') },
          { key: '/admin/settings', label: t('menu.settings') },
        ]
      : []),
    { type: 'divider' },
    { key: 'logout', danger: true, label: t('common.signOut') },
  ];

  const onClick = async ({ key }) => {
    if (key === 'logout') {
      await logout();
      navigate('/login', { replace: true });
      return;
    }
    navigate(key);
  };

  return (
    <Dropdown menu={{ items, onClick }} trigger={['click']} placement="bottomRight" overlayClassName="user-menu">
      <button type="button" className="chrome__user" aria-label={t('common.account')}>
        <Avatar size={30} src={user.avatarUrl}>
          {initials(name)}
        </Avatar>
        <span className="chrome__user-name">{name}</span>
        <span className="chrome__caret" aria-hidden="true">
          ▾
        </span>
      </button>
    </Dropdown>
  );
}

export default function Chrome({ dense }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const { settings } = useSettings();
  const name = settings?.appName || t('brand');

  return (
    <header className={`chrome ${dense ? 'chrome--dense' : ''}`}>
      <Link to="/" className="chrome__brand">
        <BrandMark />
        <span className="chrome__name">{name}</span>
      </Link>
      <div className="chrome__actions">
        <LanguageSwitch />
        <ThemeSwitch />
        {user ? (
          <>
            {user.role === 'admin' && (
              <Tooltip title={t('menu.adminConsole')} mouseEnterDelay={0.15}>
                <Link className="chrome__icon" to="/admin" aria-label={t('common.admin')}>
                  <IconAdmin />
                </Link>
              </Tooltip>
            )}
            <UserMenu user={user} />
          </>
        ) : (
          <Tooltip title={t('common.signIn')} mouseEnterDelay={0.15}>
            <Link className="chrome__icon" to="/login" aria-label={t('common.signIn')}>
              <IconLogin />
            </Link>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
