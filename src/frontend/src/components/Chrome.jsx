import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Dropdown, Tooltip } from 'antd';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { initials } from '../lib/format';
import { can, primaryRole, roleLabel } from '../lib/access';
import BrandMark from './BrandMark';
import LanguageSwitch from './LanguageSwitch';
import ThemeSwitch from './ThemeSwitch';
import { IconAdmin, IconLogin } from './icons/AdminIcons';
import { MenuIcon } from './icons/menuIcons';
import { enabledModules } from '../modules/registry';
import NotificationBell from './NotificationBell';
import { isStandalone } from '../pwa/pwa';

/** Grid button listing every enabled module (the "app launcher"). */
function AppsLauncher() {
  const { t } = useLocale();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const modules = enabledModules(settings);
  if (!modules.length) return null;
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="launcher"
      popupRender={() => (
        <div className="launcher__panel">
          <div className="launcher__title">{t('apps.title')}</div>
          <div className="launcher__grid">
            {modules.map((module) => (
              <button key={module.id} type="button" className="launcher__app" onClick={() => navigate(module.path)}>
                <MenuIcon name={module.icon} />
                <span>{t(module.labelKey)}</span>
              </button>
            ))}
          </div>
          <Link to="/apps" className="launcher__all">{t('apps.all')} →</Link>
        </div>
      )}
    >
      <button type="button" className="chrome__icon" aria-label={t('apps.title')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          {[5, 12, 19].flatMap((x) => [5, 12, 19].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.9" fill="currentColor" />))}
        </svg>
      </button>
    </Dropdown>
  );
}

function UserMenu({ user }) {
  const { logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const name = user.displayName || user.username;
  const isAdmin = can(user, 'console.access');
  const role = primaryRole(user);

  const items = [
    {
      key: 'head',
      disabled: true,
      className: 'user-menu__head',
      label: (
        <div className="user-menu__who">
          <strong>{name}</strong>
          <span>
            @{user.username}
            {role ? ` · ${roleLabel(role, t)}` : ''}
          </span>
        </div>
      ),
    },
    { type: 'divider' },
    { key: '/account', label: t('menu.cabinet') },
    ...(isAdmin
      ? [
          { key: '/admin', label: t('menu.adminConsole') },
          ...(user.permissions?.some((perm) => perm === '*' || perm.startsWith('settings.'))
            ? [{ key: '/admin/settings', label: t('menu.settings') }]
            : []),
        ]
      : []),
    ...(isStandalone() ? [] : [{ key: '/install', label: `📱 ${t('pwa.install.menu')}` }]),
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
            <NotificationBell />
            <AppsLauncher />
            {can(user, 'console.access') && (
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
